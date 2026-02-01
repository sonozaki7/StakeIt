import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getGoal,
  getRefereeByUserId,
  createReferee,
  getReferees,
  updateGoal,
} from '@/lib/supabase';
import { Platform } from '@/types';

const finalVoteSchema = z.object({
  refereeUserId: z.string().min(1),
  refereeUserName: z.string().optional(),
  refereePlatform: z.enum(['telegram', 'whatsapp', 'web']),
  vote: z.boolean(),
});

// Store final votes in memory per goal (in production, use a DB table)
const finalVotes: Map<string, Map<string, boolean>> = new Map();

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const body = await request.json();
    const validation = finalVoteSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { refereeUserId, refereeUserName, refereePlatform, vote } = validation.data;
    const goalId = params.id;

    const goal = await getGoal(goalId);
    if (!goal) {
      return NextResponse.json(
        { success: false, error: 'Goal not found' },
        { status: 404 }
      );
    }

    if (goal.verification_type === 'zktls') {
      return NextResponse.json(
        { success: false, error: 'This goal uses automatic zkTLS verification' },
        { status: 403 }
      );
    }

    if (goal.final_vote_status !== 'voting') {
      return NextResponse.json(
        { success: false, error: 'Final voting is not active for this goal' },
        { status: 400 }
      );
    }

    if (refereeUserId === goal.user_id) {
      return NextResponse.json(
        { success: false, error: 'Cannot vote on your own goal' },
        { status: 403 }
      );
    }

    // Get or create referee
    let referee = await getRefereeByUserId(goalId, refereeUserId, refereePlatform);
    if (!referee) {
      referee = await createReferee(
        goalId,
        refereeUserId,
        refereeUserName || refereeUserId,
        refereePlatform as Platform
      );
    }

    // Record final vote
    if (!finalVotes.has(goalId)) {
      finalVotes.set(goalId, new Map());
    }
    const goalFinalVotes = finalVotes.get(goalId)!;

    if (goalFinalVotes.has(referee.id)) {
      return NextResponse.json(
        { success: false, error: 'Already voted in the final vote' },
        { status: 400 }
      );
    }

    goalFinalVotes.set(referee.id, vote);

    // Calculate results
    const referees = await getReferees(goalId);
    const totalVotes = goalFinalVotes.size;
    const yesVotes = Array.from(goalFinalVotes.values()).filter(v => v).length;
    const noVotes = totalVotes - yesVotes;
    const majorityNeeded = Math.floor(referees.length / 2) + 1;

    let finalized = false;
    let passed: boolean | null = null;

    if (yesVotes >= majorityNeeded) {
      passed = true;
      finalized = true;
    } else if (noVotes >= majorityNeeded) {
      passed = false;
      finalized = true;
    }

    if (finalized) {
      const penaltyDescription = getPenaltyDescription(goal.penalty_type, goal.stake_amount_thb);
      await updateGoal(goalId, {
        status: passed ? 'completed' : 'failed',
        final_vote_status: 'finalized',
      } as Record<string, unknown>);
      finalVotes.delete(goalId);

      return NextResponse.json({
        success: true,
        finalized: true,
        passed,
        yesVotes,
        noVotes,
        totalReferees: referees.length,
        penaltyApplied: !passed ? penaltyDescription : null,
        refundApproved: passed,
      });
    }

    return NextResponse.json({
      success: true,
      finalized: false,
      yesVotes,
      noVotes,
      totalReferees: referees.length,
    });
  } catch (error) {
    console.error('API Error (POST /api/goals/[id]/final-vote):', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

function getPenaltyDescription(penaltyType: string, amount: number): string {
  switch (penaltyType) {
    case 'delayed_refund':
      return `Refund of ฿${amount.toLocaleString()} will be delayed by 30 days`;
    case 'split_to_group':
      return `฿${amount.toLocaleString()} will be split among group members`;
    case 'charity_donation':
      return `฿${amount.toLocaleString()} will be donated to charity`;
    case 'forfeited':
    default:
      return `฿${amount.toLocaleString()} is forfeited`;
  }
}
