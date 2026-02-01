# StakeIt ZKTLS Integration — Technical PRD for Implementation

## Executive Summary

Add ZKTLS verification via Reclaim Protocol to StakeIt, enabling users to cryptographically prove goal completion using Duolingo data (and other providers). This eliminates awkward friend voting for goals with digital footprints while keeping manual verification as fallback.

**Primary Demo:** Telegram bot with Duolingo streak verification
**Chain:** Base Sepolia (testnet)
**On-chain Recording:** Thirdweb SDK
**Time Budget:** 3-5 hours

---

## 1. WHAT WE'RE BUILDING

### 1.1 Core Feature: ZKTLS Auto-Verification

```
CURRENT FLOW:
User commits → Friends vote weekly → Awkward social dynamics

NEW FLOW:
User commits → User generates ZK proof from Duolingo → Auto-verified
                                                    ↓
                                          (Friends vote as fallback
                                           for non-provable goals)
```

### 1.2 Verification Hierarchy

| Tier | Condition | Verification Method |
|------|-----------|---------------------|
| 1 | Reclaim provider exists + proof valid | Auto-verify, no voting needed |
| 2 | Reclaim provider exists + proof fails/missing | Require 1+ friend vote |
| 3 | No Reclaim provider for goal type | Traditional 2+ friend voting |

### 1.3 Supported Providers (MVP)

| Goal Type | Reclaim Provider ID | What It Proves |
|-----------|---------------------|----------------|
| Duolingo streak | `7109889c` | Total XP earned |
| Duolingo language | `04075047` | XP for specific language |
| GitHub commits | `91d9a218` | Contribution count |
| LeetCode | `e9e195f9` | Problem solving reputation |

**For goals without providers:** Manual photo + location verification (existing system) + friend voting.

---

## 2. DATABASE SCHEMA ADDITIONS

### 2.1 New Table: `zk_verifications`

```sql
-- Add to supabase/schema.sql

CREATE TABLE zk_verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- References
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    week_number INTEGER NOT NULL CHECK (week_number >= 1),
    
    -- Reclaim proof data
    provider_id TEXT NOT NULL,
    provider_name TEXT NOT NULL,
    proof_hash TEXT,
    proof_data JSONB,
    
    -- Extracted values
    extracted_value TEXT,
    extracted_parameters JSONB,
    
    -- Verification status
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'verified', 'failed', 'expired')),
    
    -- On-chain recording (optional)
    chain_tx_hash TEXT,
    chain_block_number INTEGER,
    
    -- Timestamps
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    verified_at TIMESTAMPTZ,
    
    UNIQUE(goal_id, week_number)
);

CREATE INDEX idx_zk_verifications_goal ON zk_verifications(goal_id);
CREATE INDEX idx_zk_verifications_status ON zk_verifications(status);

ALTER TABLE zk_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role access" ON zk_verifications FOR ALL USING (true);
```

### 2.2 Modify `goals` Table

```sql
ALTER TABLE goals ADD COLUMN verification_type TEXT DEFAULT 'manual'
    CHECK (verification_type IN ('manual', 'zktls', 'hybrid'));
    
ALTER TABLE goals ADD COLUMN reclaim_provider_id TEXT;
ALTER TABLE goals ADD COLUMN reclaim_provider_name TEXT;
ALTER TABLE goals ADD COLUMN zk_threshold_value INTEGER;
ALTER TABLE goals ADD COLUMN zk_threshold_type TEXT;
```

---

## 3. TYPESCRIPT TYPES

### 3.1 Add to `types/index.ts`

```typescript
// ZKTLS / RECLAIM TYPES

export type VerificationType = 'manual' | 'zktls' | 'hybrid';
export type ZkVerificationStatus = 'pending' | 'verified' | 'failed' | 'expired';

export interface ZkVerification {
  id: string;
  goal_id: string;
  week_number: number;
  provider_id: string;
  provider_name: string;
  proof_hash: string | null;
  proof_data: Record<string, unknown> | null;
  extracted_value: string | null;
  extracted_parameters: Record<string, unknown> | null;
  status: ZkVerificationStatus;
  chain_tx_hash: string | null;
  chain_block_number: number | null;
  requested_at: string;
  verified_at: string | null;
}

// Extend Goal interface - add these fields
export interface Goal {
  // ... existing fields ...
  verification_type: VerificationType;
  reclaim_provider_id: string | null;
  reclaim_provider_name: string | null;
  zk_threshold_value: number | null;
  zk_threshold_type: string | null;
}

export interface ReclaimProof {
  identifier: string;
  claimData: {
    provider: string;
    parameters: string;
    context: string;
    extractedParameters: Record<string, string>;
  };
  signatures: string[];
  witnesses: Array<{ id: string; url: string }>;
}

export interface ReclaimProvider {
  id: string;
  name: string;
  goalKeywords: string[];
  extractedField: string;
  defaultThreshold?: number;
}
```

---

## 4. RECLAIM PROTOCOL INTEGRATION

### 4.1 Install Dependencies

```bash
npm install @reclaimprotocol/js-sdk
```

### 4.2 Create `lib/reclaim.ts`

```typescript
// lib/reclaim.ts
import { ReclaimProofRequest } from '@reclaimprotocol/js-sdk';

const RECLAIM_APP_ID = process.env.RECLAIM_APP_ID!;
const RECLAIM_APP_SECRET = process.env.RECLAIM_APP_SECRET!;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL!;

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

export function formatVerificationStatus(verification: ZkVerification): string {
  switch (verification.status) {
    case 'verified':
      return `✅ Verified via ${verification.provider_name}\nValue: ${verification.extracted_value}`;
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
```

### 4.3 Create API Route: `app/api/verify/reclaim/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createVerificationRequest, findProviderForGoal } from '@/lib/reclaim';
import { getGoal, createZkVerification } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const { goalId, weekNumber } = await request.json();
    
    if (!goalId || !weekNumber) {
      return NextResponse.json(
        { success: false, error: 'Missing goalId or weekNumber' },
        { status: 400 }
      );
    }
    
    const goal = await getGoal(goalId);
    if (!goal) {
      return NextResponse.json(
        { success: false, error: 'Goal not found' },
        { status: 404 }
      );
    }
    
    let providerId = goal.reclaim_provider_id;
    let providerName = goal.reclaim_provider_name;
    
    if (!providerId) {
      const provider = findProviderForGoal(goal.goal_name);
      if (!provider) {
        return NextResponse.json(
          { success: false, error: 'No ZKTLS provider available for this goal type' },
          { status: 400 }
        );
      }
      providerId = provider.id;
      providerName = provider.name;
    }
    
    const { requestUrl, sessionId } = await createVerificationRequest(
      goalId,
      weekNumber,
      providerId
    );
    
    await createZkVerification({
      goalId,
      weekNumber,
      providerId,
      providerName: providerName || 'Unknown Provider',
      status: 'pending',
    });
    
    return NextResponse.json({
      success: true,
      requestUrl,
      sessionId,
      message: 'Open the URL to generate your proof',
    });
    
  } catch (error) {
    console.error('Reclaim verification request error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create verification request' },
      { status: 500 }
    );
  }
}
```

### 4.4 Create Callback Route: `app/api/verify/reclaim/callback/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { verifyProof, meetsThreshold } from '@/lib/reclaim';
import { 
  updateZkVerification, 
  getGoal, 
  updateGoal,
  updateWeeklyResult,
  getOrCreateWeeklyResult 
} from '@/lib/supabase';
import { recordOnChain } from '@/lib/thirdweb';
import { notifyZkVerificationComplete } from '@/lib/telegram';

export async function POST(request: NextRequest) {
  try {
    const proofData = await request.json();
    
    console.log('Received Reclaim callback:', JSON.stringify(proofData, null, 2));
    
    // Extract goal info from context
    let goalId: string;
    let weekNumber: number;
    
    try {
      const context = JSON.parse(proofData.claimData.context);
      goalId = context.goalId || proofData.claimData.parameters;
      weekNumber = context.weekNumber || 1;
    } catch {
      goalId = proofData.claimData.context;
      weekNumber = 1;
    }
    
    const verification = await verifyProof(proofData);
    
    if (!verification.valid) {
      await updateZkVerification(goalId, weekNumber, {
        status: 'failed',
        proof_data: proofData,
      });
      
      return NextResponse.json({ success: false, error: verification.error });
    }
    
    const goal = await getGoal(goalId);
    if (!goal) {
      return NextResponse.json({ success: false, error: 'Goal not found' });
    }
    
    const passedThreshold = meetsThreshold(
      verification.extractedValue || '0',
      goal.zk_threshold_value,
      goal.zk_threshold_type
    );
    
    // Update verification record
    await updateZkVerification(goalId, weekNumber, {
      status: passedThreshold ? 'verified' : 'failed',
      proof_hash: proofData.signatures?.[0] || null,
      proof_data: proofData,
      extracted_value: verification.extractedValue,
      extracted_parameters: verification.extractedParameters,
      verified_at: new Date().toISOString(),
    });
    
    // If verified, auto-pass the week
    if (passedThreshold) {
      await getOrCreateWeeklyResult(goalId, weekNumber, 0);
      
      await updateWeeklyResult(goalId, weekNumber, {
        passed: true,
        yes_votes: 1,
        finalized_at: new Date().toISOString(),
      });
      
      await updateGoal(goalId, {
        weeks_passed: goal.weeks_passed + 1,
        current_week: Math.min(weekNumber + 1, goal.duration_weeks),
      });
      
      // Record on-chain (async)
      recordOnChain(goalId, weekNumber, true, verification.extractedValue || '')
        .catch(err => console.error('On-chain recording failed:', err));
      
      // Notify via Telegram
      notifyZkVerificationComplete(goal, weekNumber, verification.extractedValue || '')
        .catch(err => console.error('Telegram notification failed:', err));
    }
    
    return NextResponse.json({
      success: true,
      verified: passedThreshold,
      extractedValue: verification.extractedValue,
    });
    
  } catch (error) {
    console.error('Reclaim callback error:', error);
    return NextResponse.json(
      { success: false, error: 'Callback processing failed' },
      { status: 500 }
    );
  }
}
```

---

## 5. THIRDWEB ON-CHAIN INTEGRATION

### 5.1 Install Dependencies

```bash
npm install thirdweb
```

### 5.2 Create `lib/thirdweb.ts`

```typescript
import { createThirdwebClient, getContract, prepareContractCall, sendTransaction } from 'thirdweb';
import { baseSepolia } from 'thirdweb/chains';
import { privateKeyToAccount } from 'thirdweb/wallets';

const THIRDWEB_SECRET_KEY = process.env.THIRDWEB_SECRET_KEY;
const CONTRACT_ADDRESS = process.env.STAKEIT_CONTRACT_ADDRESS;
const PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY;

let client: ReturnType<typeof createThirdwebClient> | null = null;
let contract: ReturnType<typeof getContract> | null = null;

function getClient() {
  if (!THIRDWEB_SECRET_KEY) {
    console.warn('Thirdweb not configured');
    return null;
  }
  
  if (!client) {
    client = createThirdwebClient({ secretKey: THIRDWEB_SECRET_KEY });
  }
  return client;
}

function getVerificationContract() {
  const c = getClient();
  if (!c || !CONTRACT_ADDRESS) return null;
  
  if (!contract) {
    contract = getContract({
      client: c,
      chain: baseSepolia,
      address: CONTRACT_ADDRESS,
    });
  }
  return contract;
}

const RECORD_VERIFICATION_ABI = {
  name: 'recordVerification',
  type: 'function',
  inputs: [
    { name: 'goalId', type: 'string' },
    { name: 'weekNumber', type: 'uint256' },
    { name: 'passed', type: 'bool' },
    { name: 'proofValue', type: 'string' },
  ],
  outputs: [],
  stateMutability: 'nonpayable',
} as const;

export async function recordOnChain(
  goalId: string,
  weekNumber: number,
  passed: boolean,
  proofValue: string
): Promise<{ txHash: string; blockNumber: number } | null> {
  const verificationContract = getVerificationContract();
  
  if (!verificationContract || !PRIVATE_KEY) {
    console.log('On-chain recording skipped - not configured');
    return null;
  }
  
  try {
    const account = privateKeyToAccount({
      client: getClient()!,
      privateKey: PRIVATE_KEY,
    });
    
    const transaction = prepareContractCall({
      contract: verificationContract,
      method: RECORD_VERIFICATION_ABI,
      params: [goalId, BigInt(weekNumber), passed, proofValue],
    });
    
    const result = await sendTransaction({ transaction, account });
    
    console.log('On-chain recording successful:', result.transactionHash);
    
    return {
      txHash: result.transactionHash,
      blockNumber: 0,
    };
    
  } catch (error) {
    console.error('On-chain recording failed:', error);
    throw error;
  }
}

export function getBaseScanUrl(txHash: string): string {
  return `https://sepolia.basescan.org/tx/${txHash}`;
}
```

### 5.3 Smart Contract: `contracts/StakeItVerifications.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract StakeItVerifications {
    
    struct Verification {
        string goalId;
        uint256 weekNumber;
        bool passed;
        string proofValue;
        uint256 timestamp;
        address recorder;
    }
    
    Verification[] public verifications;
    mapping(bytes32 => uint256) public verificationIndex;
    mapping(string => uint256) public goalVerificationCount;
    mapping(string => uint256) public goalPassedCount;
    
    event VerificationRecorded(
        uint256 indexed index,
        string goalId,
        uint256 weekNumber,
        bool passed,
        string proofValue,
        uint256 timestamp
    );
    
    function recordVerification(
        string calldata goalId,
        uint256 weekNumber,
        bool passed,
        string calldata proofValue
    ) external {
        bytes32 key = keccak256(abi.encodePacked(goalId, weekNumber));
        require(verificationIndex[key] == 0, "Already recorded");
        
        Verification memory v = Verification({
            goalId: goalId,
            weekNumber: weekNumber,
            passed: passed,
            proofValue: proofValue,
            timestamp: block.timestamp,
            recorder: msg.sender
        });
        
        verifications.push(v);
        uint256 index = verifications.length;
        verificationIndex[key] = index;
        
        goalVerificationCount[goalId]++;
        if (passed) {
            goalPassedCount[goalId]++;
        }
        
        emit VerificationRecorded(index - 1, goalId, weekNumber, passed, proofValue, block.timestamp);
    }
    
    function getVerification(string calldata goalId, uint256 weekNumber) 
        external view returns (bool exists, bool passed, string memory proofValue, uint256 timestamp) 
    {
        bytes32 key = keccak256(abi.encodePacked(goalId, weekNumber));
        uint256 index = verificationIndex[key];
        
        if (index == 0) return (false, false, "", 0);
        
        Verification memory v = verifications[index - 1];
        return (true, v.passed, v.proofValue, v.timestamp);
    }
    
    function getTotalVerifications() external view returns (uint256) {
        return verifications.length;
    }
    
    function getGoalStats(string calldata goalId) external view returns (uint256 total, uint256 passed) {
        return (goalVerificationCount[goalId], goalPassedCount[goalId]);
    }
}
```

---

## 6. TELEGRAM BOT ENHANCEMENTS

### 6.1 Add to `lib/telegram.ts`

```typescript
// ADD IMPORTS AT TOP
import { 
  findProviderForGoal, 
  createTelegramVerificationLink,
  canUseZkVerification,
  RECLAIM_PROVIDERS,
  ReclaimProvider
} from './reclaim';
import { getBaseScanUrl } from './thirdweb';
import { getZkVerifications, createZkVerification } from './supabase';

// ============================================================
// NEW COMMANDS
// ============================================================

/**
 * /verify command - Generate ZK verification link
 */
bot.command('verify', async (ctx) => {
  try {
    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id?.toString();
    
    if (!chatId || !userId) {
      await ctx.reply('❌ Could not identify chat or user.');
      return;
    }
    
    const args = ctx.message?.text?.split(' ').slice(1) || [];
    let goalId = args[0];
    let goal;
    
    if (goalId) {
      goal = await getGoal(goalId);
      if (!goal || goal.user_id !== userId) {
        await ctx.reply('❌ Goal not found or not yours.');
        return;
      }
    } else {
      const goals = await getGoalsByGroup('telegram', chatId.toString());
      goal = goals.find(g => g.user_id === userId && g.status === 'active');
      
      if (!goal) {
        await ctx.reply('❌ No active goals found. Create one with /commit first.');
        return;
      }
    }
    
    const provider = findProviderForGoal(goal.goal_name);
    
    if (!provider) {
      await ctx.reply(
        `📋 *Manual Verification Required*\n\n` +
        `Goal: "${goal.goal_name}" doesn't have automatic verification.\n\n` +
        `Options:\n` +
        `• Send a photo of your progress\n` +
        `• Share your location\n` +
        `• Wait for weekly friend voting\n\n` +
        `_ZKTLS works with: Duolingo, GitHub, LeetCode_`,
        { parse_mode: 'Markdown' }
      );
      return;
    }
    
    const verifyUrl = await createTelegramVerificationLink(
      goal.id,
      goal.current_week,
      provider.id
    );
    
    await ctx.reply(
      `🔐 *ZKTLS Verification*\n\n` +
      `Goal: ${goal.goal_name}\n` +
      `Week: ${goal.current_week} of ${goal.duration_weeks}\n` +
      `Provider: ${provider.name}\n\n` +
      `Tap the button below to generate your cryptographic proof:`,
      { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '🔐 Generate Proof', url: verifyUrl }
          ]]
        }
      }
    );
    
  } catch (error) {
    console.error('Verify command error:', error);
    await ctx.reply('❌ Failed to generate verification link. Please try again.');
  }
});

/**
 * /providers command - List supported ZKTLS providers
 */
bot.command('providers', async (ctx) => {
  const providerList = Object.values(RECLAIM_PROVIDERS)
    .map(p => `• *${p.name}*\n  Keywords: ${p.goalKeywords.slice(0, 3).join(', ')}`)
    .join('\n\n');
  
  await ctx.reply(
    `🔐 *Supported Auto-Verification Providers*\n\n` +
    `${providerList}\n\n` +
    `_Create a goal with these keywords to enable ZKTLS!_\n` +
    `Example: /commit "Learn Spanish on Duolingo" 500 4`,
    { parse_mode: 'Markdown' }
  );
});

/**
 * /proof command - Show verification proof details
 */
bot.command('proof', async (ctx) => {
  const args = ctx.message?.text?.split(' ').slice(1) || [];
  const goalId = args[0];
  
  if (!goalId) {
    await ctx.reply('Usage: /proof <goalId>');
    return;
  }
  
  try {
    const goal = await getGoal(goalId);
    if (!goal) {
      await ctx.reply('❌ Goal not found.');
      return;
    }
    
    const zkVerifications = await getZkVerifications(goalId);
    
    if (zkVerifications.length === 0) {
      await ctx.reply('📋 No ZKTLS proofs recorded for this goal yet.');
      return;
    }
    
    const proofList = zkVerifications.map(v => {
      const statusEmoji = v.status === 'verified' ? '✅' : v.status === 'failed' ? '❌' : '⏳';
      const chainLink = v.chain_tx_hash 
        ? `[BaseScan](${getBaseScanUrl(v.chain_tx_hash)})` 
        : 'Not recorded';
      
      return `*Week ${v.week_number}* ${statusEmoji}\n` +
        `Provider: ${v.provider_name}\n` +
        `Value: ${v.extracted_value || 'N/A'}\n` +
        `On-chain: ${chainLink}`;
    }).join('\n\n');
    
    await ctx.reply(
      `🔐 *ZKTLS Proofs for Goal*\n\n` +
      `Goal: ${goal.goal_name}\n\n` +
      proofList,
      { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } }
    );
    
  } catch (error) {
    console.error('Proof command error:', error);
    await ctx.reply('❌ Failed to fetch proof details.');
  }
});

// ============================================================
// NOTIFICATION FUNCTION
// ============================================================

export async function notifyZkVerificationComplete(
  goal: Goal,
  weekNumber: number,
  extractedValue: string,
  txHash?: string
): Promise<void> {
  if (!goal.group_id) return;
  
  const baseScanLink = txHash ? `\n🔗 [View on BaseScan](${getBaseScanUrl(txHash)})` : '';
  
  await bot.api.sendMessage(
    goal.group_id,
    `✅ *Week ${weekNumber} Verified via ZKTLS!*\n\n` +
    `Goal: ${goal.goal_name}\n` +
    `By: ${goal.user_name}\n` +
    `Proof: ${goal.reclaim_provider_name}\n` +
    `Value: ${extractedValue}\n\n` +
    `🎯 Progress: ${goal.weeks_passed + 1}/${goal.duration_weeks} weeks passed` +
    baseScanLink,
    { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } }
  );
}

// ============================================================
// MODIFY: createGoalWithLimitCheck
// ============================================================

// Inside createGoalWithLimitCheck, after validation, add:

const zkProvider = findProviderForGoal(goalName);

const goalData: CreateGoalRequest = {
  goalName,
  stakeAmountThb: amount,
  durationWeeks: weeks,
  platform: 'telegram',
  groupId: chatId.toString(),
  groupName: chatTitle || 'Telegram Group',
  userId,
  userName,
  // NEW: ZKTLS fields
  verificationType: zkProvider ? 'zktls' : 'manual',
  reclaimProviderId: zkProvider?.id || null,
  reclaimProviderName: zkProvider?.name || null,
  zkThresholdValue: zkProvider?.defaultThreshold || null,
  zkThresholdType: 'minimum',
};

// Return zkProvider in the result so we can mention it in the response

// ============================================================
// MODIFY: Goal creation success message
// ============================================================

// After successful goal creation, modify the response:

const zkNotice = zkProvider 
  ? `\n\n🔐 *Auto-Verification Enabled*\nUse /verify to prove completion via ${zkProvider.name}`
  : `\n\n📋 *Manual Verification*\nSend photos or wait for weekly voting`;

await ctx.reply(
  `🎯 *Goal Created!*\n\n` +
  `Goal: ${goalName}\n` +
  `Stake: ฿${amount}\n` +
  `Duration: ${weeks} weeks\n` +
  `By: @${userName}` +
  zkNotice + `\n\n` +
  `📱 Scan to pay and activate:`,
  { parse_mode: 'Markdown' }
);

// ============================================================
// MODIFY: /help command
// ============================================================

bot.command('help', async (ctx) => {
  await ctx.reply(
    `🎯 *StakeIt Bot Commands*\n\n` +
    `*Creating Goals:*\n` +
    `/commit "goal" amount weeks - Create a goal\n` +
    `/stake "goal" amount weeks - Same as commit\n\n` +
    `*Verification:*\n` +
    `/verify - Generate ZKTLS proof for your goal\n` +
    `/proof <goalId> - View verification proofs\n` +
    `/providers - List supported auto-verification apps\n\n` +
    `*Status:*\n` +
    `/status - Your active goals\n` +
    `/goals - All goals in this group\n\n` +
    `*Tips:*\n` +
    `• Include "Duolingo", "GitHub", or "LeetCode" in goal name for auto-verification\n` +
    `• Send photos anytime to log progress\n` +
    `• Max 3 active goals per person per group\n\n` +
    `🔐 _ZKTLS = cryptographic proof, no friend voting needed!_`,
    { parse_mode: 'Markdown' }
  );
});
```

---

## 7. SUPABASE FUNCTIONS FOR ZK VERIFICATIONS

### 7.1 Add to `lib/supabase.ts`

```typescript
// ZK VERIFICATION FUNCTIONS

export async function createZkVerification(data: {
  goalId: string;
  weekNumber: number;
  providerId: string;
  providerName: string;
  status: ZkVerificationStatus;
}): Promise<ZkVerification> {
  const client = getClient();
  
  const { data: verification, error } = await client
    .from('zk_verifications')
    .upsert({
      goal_id: data.goalId,
      week_number: data.weekNumber,
      provider_id: data.providerId,
      provider_name: data.providerName,
      status: data.status,
    }, { onConflict: 'goal_id,week_number' })
    .select()
    .single();
  
  if (error) throw error;
  return verification;
}

export async function updateZkVerification(
  goalId: string,
  weekNumber: number,
  updates: Partial<ZkVerification>
): Promise<void> {
  const client = getClient();
  
  const { error } = await client
    .from('zk_verifications')
    .update(updates)
    .eq('goal_id', goalId)
    .eq('week_number', weekNumber);
  
  if (error) throw error;
}

export async function getZkVerifications(goalId: string): Promise<ZkVerification[]> {
  const client = getClient();
  
  const { data, error } = await client
    .from('zk_verifications')
    .select('*')
    .eq('goal_id', goalId)
    .order('week_number', { ascending: true });
  
  if (error) throw error;
  return data || [];
}

export async function getZkVerification(
  goalId: string,
  weekNumber: number
): Promise<ZkVerification | null> {
  const client = getClient();
  
  const { data, error } = await client
    .from('zk_verifications')
    .select('*')
    .eq('goal_id', goalId)
    .eq('week_number', weekNumber)
    .single();
  
  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}
```

---

## 8. FRONTEND: VERIFICATION REDIRECT PAGE

### 8.1 Create `app/verify/page.tsx`

```typescript
'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export default function VerifyRedirectPage() {
  const searchParams = useSearchParams();
  
  useEffect(() => {
    const redirectUrl = searchParams.get('redirect');
    
    if (redirectUrl) {
      window.location.href = decodeURIComponent(redirectUrl);
    }
  }, [searchParams]);
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
        <h1 className="text-xl font-semibold text-gray-900">
          Redirecting to verification...
        </h1>
        <p className="text-gray-600 mt-2">
          You'll be asked to log in to prove your activity.
        </p>
      </div>
    </div>
  );
}
```

---

## 9. ENVIRONMENT VARIABLES

Add to `.env.local`:

```env
# Reclaim Protocol
RECLAIM_APP_ID=your_app_id
RECLAIM_APP_SECRET=your_app_secret

# Thirdweb (optional)
THIRDWEB_SECRET_KEY=your_thirdweb_secret
STAKEIT_CONTRACT_ADDRESS=0x_deployed_address
WALLET_PRIVATE_KEY=your_private_key

# Base Sepolia
BASE_SEPOLIA_RPC=https://sepolia.base.org
```

---

## 10. IMPLEMENTATION ORDER

| Hour | Task |
|------|------|
| 1 | Run SQL migration + Add TypeScript types + Supabase functions |
| 2 | Create `lib/reclaim.ts` + API routes |
| 3 | Add Telegram commands (/verify, /providers, /proof) |
| 4 | Deploy contract via Thirdweb + Create `lib/thirdweb.ts` |
| 5 | Test full flow + Polish |

---

## 11. TESTING CHECKLIST

```
[ ] Create goal with "Duolingo" in name → Detects ZKTLS provider
[ ] /verify command → Generates verification link
[ ] Click link → Redirects to Reclaim
[ ] Complete Duolingo proof → Callback received
[ ] Week auto-passes (no friend voting)
[ ] Notification sent to group
[ ] /proof shows verification details
[ ] (Optional) Transaction on BaseScan
```

---

## 12. EDGE CASES TO HANDLE

| Case | Handling |
|------|----------|
| Goal without ZKTLS provider | Falls back to manual verification |
| User not logged into Duolingo | Reclaim shows error, status stays pending |
| Proof fails threshold | Week not auto-passed, needs friend voting |
| Duplicate verification attempt | Upsert in database, no duplicate |
| Callback timeout | Status shows pending, user can retry /verify |
| Thirdweb not configured | Skip on-chain recording, still works |
