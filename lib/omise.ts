import Omise from 'omise';
import { OmiseWebhookEvent } from '@/types';

function getOmiseClient() {
  return Omise({
    publicKey: process.env.OMISE_PUBLIC_KEY,
    secretKey: process.env.OMISE_SECRET_KEY,
  });
}

interface PromptPayChargeResult {
  chargeId: string;
  qrCodeUrl: string;
  amount: number;
}

export async function createPromptPayCharge(
  amountThb: number,
  goalId: string,
  userId: string,
  description: string
): Promise<PromptPayChargeResult> {
  try {
    const amountSatangs = amountThb * 100;

    // Create source
    const source = await getOmiseClient().sources.create({
      type: 'promptpay',
      amount: amountSatangs,
      currency: 'thb',
    });

    // Create charge
    const charge = await getOmiseClient().charges.create({
      amount: amountSatangs,
      currency: 'thb',
      source: source.id,
      description,
      metadata: {
        goal_id: goalId,
        user_id: userId,
      },
    });

    const qrCodeUrl = charge.source?.scannable_code?.image?.download_uri || '';

    return {
      chargeId: charge.id,
      qrCodeUrl,
      amount: amountThb,
    };
  } catch (error) {
    console.error('Error creating PromptPay charge:', error);
    throw error;
  }
}

export function parseWebhookEvent(body: unknown): OmiseWebhookEvent | null {
  try {
    const event = body as OmiseWebhookEvent;
    if (!event.key || !event.data || !event.data.id) {
      return null;
    }
    return event;
  } catch (error) {
    console.error('Error parsing webhook event:', error);
    return null;
  }
}

export function isChargeComplete(event: OmiseWebhookEvent): boolean {
  return event.key === 'charge.complete' && event.data.status === 'successful';
}
