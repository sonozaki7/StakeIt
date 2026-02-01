import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createGoal, getGoalsByUser, getGoalsByGroup, createPayment, deleteGoal, getActiveGoalCountForUserInGroup } from '@/lib/supabase';
import { createPromptPayCharge } from '@/lib/omise';

const createGoalSchema = z.object({
  goalName: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  stakeAmountThb: z.number().int().positive(),
  durationWeeks: z.number().int().min(1).max(52),
  platform: z.enum(['telegram', 'whatsapp', 'web']),
  groupId: z.string().optional(),
  groupName: z.string().optional(),
  userId: z.string().min(1),
  userName: z.string().min(1),
  penaltyType: z.enum(['delayed_refund', 'split_to_group', 'charity_donation', 'forfeited']).optional(),
  referees: z.array(z.object({
    userId: z.string(),
    userName: z.string(),
    platform: z.enum(['telegram', 'whatsapp', 'web']),
  })).optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const validation = createGoalSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const data = validation.data;

    // Check 3-goal limit per user per group
    if (data.groupId) {
      const activeCount = await getActiveGoalCountForUserInGroup(data.userId, data.groupId);
      if (activeCount >= 3) {
        return NextResponse.json(
          { success: false, error: 'Maximum 3 active goals per group. Complete or wait for existing goals to finish.' },
          { status: 400 }
        );
      }
    }

    // Create goal in database
    const goal = await createGoal(data);

    // Create payment charge — clean up goal if this fails
    let charge;
    try {
      charge = await createPromptPayCharge(
        data.stakeAmountThb,
        goal.id,
        data.userId,
        `StakeIt: ${data.goalName}`
      );
    } catch (chargeError) {
      console.error('Payment charge failed, deleting orphaned goal:', goal.id);
      try {
        await deleteGoal(goal.id);
      } catch (cleanupError) {
        console.error('Failed to clean up orphaned goal:', cleanupError);
      }
      throw chargeError;
    }

    // Save payment record
    await createPayment(goal.id, data.stakeAmountThb, charge.qrCodeUrl, charge.chargeId);

    return NextResponse.json(
      {
        success: true,
        goal: {
          id: goal.id,
          status: goal.status,
          paymentQrUrl: charge.qrCodeUrl,
          stakeAmountThb: goal.stake_amount_thb,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('API Error (POST /api/goals):', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const platform = searchParams.get('platform');
    const groupId = searchParams.get('groupId');

    let goals;

    if (userId) {
      goals = await getGoalsByUser(userId);
    } else if (platform && groupId) {
      goals = await getGoalsByGroup(platform, groupId);
    } else {
      return NextResponse.json(
        { success: false, error: 'Must provide userId or platform+groupId' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, goals });
  } catch (error) {
    console.error('API Error (GET /api/goals):', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
