import { NextRequest, NextResponse } from 'next/server';
import { parseWebhookEvent, isChargeComplete } from '@/lib/omise';
import { completePayment, getGoal, updateGoal } from '@/lib/supabase';
import { Goal } from '@/types';

async function activateGoal(goalId: string): Promise<Goal | null> {
  const goal = await getGoal(goalId);
  if (!goal) return null;

  const now = new Date();
  const goalEndDate = new Date(now);
  goalEndDate.setDate(goalEndDate.getDate() + 7 * goal.duration_weeks);

  const updated = await updateGoal(goalId, {
    status: 'active',
    start_date: now.toISOString(),
    end_date: goalEndDate.toISOString(),
    current_week: 1,
  } as Partial<Goal>);

  return updated;
}

async function notifyActivation(goal: Goal): Promise<void> {
  if (!goal.group_id) return;

  if (goal.platform === 'telegram') {
    const { notifyGoalActivated } = await import('@/lib/telegram');
    await notifyGoalActivated(goal);
  } else if (goal.platform === 'whatsapp') {
    const { notifyWhatsAppGoalActivated } = await import('@/lib/whatsapp');
    await notifyWhatsAppGoalActivated(goal);
  }
}

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
        // Try to complete via payment record (normal Omise flow)
        const payment = await completePayment(event.data.id);

        if (payment && payment.goal_id !== goalId) {
          console.error(
            `Webhook goal_id mismatch: metadata says ${goalId}, payment belongs to ${payment.goal_id}`
          );
          return NextResponse.json({ received: true });
        }

        if (payment) {
          // Payment found and goal activated via completePayment
          const goal = await getGoal(goalId);
          if (goal) await notifyActivation(goal);
        } else {
          // No payment record found (e.g. demo/test simulation)
          // Activate the goal directly using the metadata goal_id
          console.log(`No payment record for charge ${event.data.id}, activating goal ${goalId} directly`);
          const goal = await activateGoal(goalId);
          if (goal) await notifyActivation(goal);
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
