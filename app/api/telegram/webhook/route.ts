import { NextResponse } from 'next/server';
import { handleTelegramWebhook } from '@/lib/telegram';

export const POST = handleTelegramWebhook;

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'Telegram Bot Webhook',
  });
}
