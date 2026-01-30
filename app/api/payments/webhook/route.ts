import { NextRequest, NextResponse } from 'next/server';
import { parseWebhookEvent, isChargeComplete } from '@/lib/omise';
import { completePayment, getGoal } from '@/lib/supabase';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const event = parseWebhookEvent(body);

    if (!event) {
      console.error('Invalid webhook event received');
      return NextResponse.json({ received: true });
    }

    if (isChargeComplete(event)) {
      const goalId = event.data.metadata?.goal_id;

      if (goalId) {
        // Complete the payment and activate the goal
        const payment = await completePayment(event.data.id);

        if (payment) {
          const goal = await getGoal(goalId);

          if (goal && goal.group_id) {
            // Notify based on platform (implemented in Phase 5 & 6)
            if (goal.platform === 'telegram') {
              const { notifyGoalActivated } = await import('@/lib/telegram');
              await notifyGoalActivated(goal);
            } else if (goal.platform === 'whatsapp') {
              const { notifyWhatsAppGoalActivated } = await import('@/lib/whatsapp');
              await notifyWhatsAppGoalActivated(goal);
            }
          }
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Payment webhook error:', error);
    return NextResponse.json({ received: true });
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'Omise Payment Webhook',
  });
}
