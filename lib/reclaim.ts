import { ReclaimProofRequest } from '@reclaimprotocol/js-sdk';
import { ReclaimProvider, ReclaimProof } from '@/types';

const RECLAIM_APP_ID = process.env.RECLAIM_APP_ID || '';
const RECLAIM_APP_SECRET = process.env.RECLAIM_APP_SECRET || '';
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

// Supported providers registry
export const RECLAIM_PROVIDERS: Record<string, ReclaimProvider> = {
  duolingo_xp: {
    id: '7109889c',
    name: 'Duolingo - Verify totalXp',
    goalKeywords: ['duolingo', 'language', 'spanish', 'french', 'thai', 'japanese', 'korean', 'german', 'learn', 'streak'],
    extractedField: 'totalXp',
    defaultThreshold: 100,
  },
  duolingo_language: {
    id: '04075047',
    name: 'Duolingo - Verify xp for language',
    goalKeywords: ['duolingo spanish', 'duolingo french', 'duolingo thai'],
    extractedField: 'xp',
  },
  github_contributions: {
    id: '91d9a218',
    name: 'GitHub - contributions',
    goalKeywords: ['github', 'code', 'commit', 'programming', 'coding', 'opensource'],
    extractedField: 'contributions',
    defaultThreshold: 5,
  },
  leetcode: {
    id: 'e9e195f9',
    name: 'LeetCode Reputation',
    goalKeywords: ['leetcode', 'algorithm', 'coding challenge', 'dsa'],
    extractedField: 'reputation',
  },
};

/**
 * Find matching Reclaim provider for a goal name
 */
export function findProviderForGoal(goalName: string): ReclaimProvider | null {
  const lowerGoal = goalName.toLowerCase();

  for (const provider of Object.values(RECLAIM_PROVIDERS)) {
    for (const keyword of provider.goalKeywords) {
      if (lowerGoal.includes(keyword.toLowerCase())) {
        return provider;
      }
    }
  }

  return null;
}

export function canUseZkVerification(goalName: string): boolean {
  return findProviderForGoal(goalName) !== null;
}

/**
 * Create verification request URL
 */
export async function createVerificationRequest(
  goalId: string,
  weekNumber: number,
  providerId: string
): Promise<{ requestUrl: string; sessionId: string }> {
  const reclaimProofRequest = await ReclaimProofRequest.init(
    RECLAIM_APP_ID,
    RECLAIM_APP_SECRET,
    providerId
  );

  // Add context for tracking
  reclaimProofRequest.setContext(
    goalId,
    JSON.stringify({ goalId, weekNumber, timestamp: Date.now() })
  );

  // Set callback URL
  const callbackUrl = `${BASE_URL}/api/verify/reclaim/callback`;
  reclaimProofRequest.setAppCallbackUrl(callbackUrl);

  const requestUrl = await reclaimProofRequest.getRequestUrl();
  const statusUrl = await reclaimProofRequest.getStatusUrl();
  const sessionId = statusUrl.split('/').pop() || '';

  return { requestUrl, sessionId };
}

/**
 * Verify a Reclaim proof
 */
export async function verifyProof(proofData: ReclaimProof): Promise<{
  valid: boolean;
  extractedValue?: string;
  extractedParameters?: Record<string, string>;
  error?: string;
}> {
  try {
    const { Reclaim } = await import('@reclaimprotocol/js-sdk');
    const isValid = await Reclaim.verifySignedProof(proofData);

    if (!isValid) {
      return { valid: false, error: 'Invalid proof signature' };
    }

    const extractedParameters = proofData.claimData.extractedParameters || {};
    const extractedValue = Object.values(extractedParameters)[0] || '';

    return { valid: true, extractedValue, extractedParameters };
  } catch (error) {
    console.error('Proof verification error:', error);
    return { valid: false, error: String(error) };
  }
}

export function meetsThreshold(
  extractedValue: string,
  threshold: number | null,
  thresholdType: string | null
): boolean {
  if (!threshold) return true;

  // Suppress unused parameter warning
  void thresholdType;

  const value = parseInt(extractedValue, 10);
  if (isNaN(value)) return false;

  return value >= threshold;
}

/**
 * Generate short verification URL for Telegram
 */
export async function createTelegramVerificationLink(
  goalId: string,
  weekNumber: number,
  providerId: string
): Promise<string> {
  const { requestUrl } = await createVerificationRequest(goalId, weekNumber, providerId);
  const encodedUrl = encodeURIComponent(requestUrl);
  return `${BASE_URL}/verify?redirect=${encodedUrl}&goal=${goalId}&week=${weekNumber}`;
}

export function formatVerificationStatus(status: string, providerName: string, extractedValue: string | null): string {
  switch (status) {
    case 'verified':
      return `✅ Verified via ${providerName}\nValue: ${extractedValue}`;
    case 'failed':
      return `❌ Verification failed`;
    case 'pending':
      return `⏳ Waiting for proof...`;
    case 'expired':
      return `⏰ Verification expired`;
    default:
      return `Unknown status`;
  }
}
