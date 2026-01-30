import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getGoal,
  getRefereeByUserId,
  createReferee,
  hasVoted,
  submitVote,
  getReferees,
  getVotesForWeek,
  getOrCreateWeeklyResult,
  updateWeeklyResult,
  updateGoal,
} from '@/lib/supabase';
import { Platform } from '@/types';

const voteSchema = z.object({
  refereeUserId: z.string().min(1),
  refereeUserName: z.string().optional(),
  refereePlatform: z.enum(['telegram', 'whatsapp', 'web']),
  week: z.number().int().positive(),
  vote: z.boolean(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const body = await request.json();
    const validation = voteSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { refereeUserId, refereeUserName, refereePlatform, week, vote } = validation.data;
    const goalId = params.id;

    // Check goal exists and is active
    const goal = await getGoal(goalId);
    if (!goal) {
      return NextResponse.json(
        { success: false, error: 'Goal not found' },
        { status: 404 }
      );
    }

    if (goal.status !== 'active') {
      return NextResponse.json(
        { success: false, error: 'Goal is not active' },
        { status: 400 }
      );
    }

    // Check voter is not goal owner
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

    // Check not already voted
    const alreadyVoted = await hasVoted(goalId, referee.id, week);
    if (alreadyVoted) {
      return NextResponse.json(
        { success: false, error: 'Already voted for this week' },
        { status: 400 }
      );
    }

    // Submit vote
    await submitVote(goalId, referee.id, week, vote);

    // Calculate results
    const referees = await getReferees(goalId);
    const votes = await getVotesForWeek(goalId, week);
    const yesVotes = votes.filter(v => v.vote).length;
    const noVotes = votes.filter(v => !v.vote).length;

    // Check if majority reached
    const majorityNeeded = Math.floor(referees.length / 2) + 1;
    let passed: boolean | null = null;

    if (yesVotes >= majorityNeeded) passed = true;
    else if (noVotes >= majorityNeeded) passed = false;

    // Update weekly result
    await getOrCreateWeeklyResult(goalId, week, referees.length);
    const updateData: Record<string, unknown> = {
      yes_votes: yesVotes,
      no_votes: noVotes,
      total_referees: referees.length,
      passed,
    };
    if (passed !== null) {
      updateData.finalized_at = new Date().toISOString();
    }
    await updateWeeklyResult(goalId, week, updateData);

    // If finalized, update goal progress
    if (passed !== null) {
      const goalUpdate: Record<string, unknown> = {};
      if (passed) {
        goalUpdate.weeks_passed = goal.weeks_passed + 1;
      } else {
        goalUpdate.weeks_failed = goal.weeks_failed + 1;
      }

      // Check if goal is complete
      const totalWeeksVoted = (passed ? goal.weeks_passed + 1 : goal.weeks_passed) +
        (!passed ? goal.weeks_failed + 1 : goal.weeks_failed);

      if (totalWeeksVoted >= goal.duration_weeks) {
        const weeksPassed = passed ? goal.weeks_passed + 1 : goal.weeks_passed;
        const majorityWeeks = Math.floor(goal.duration_weeks / 2) + 1;
        goalUpdate.status = weeksPassed >= majorityWeeks ? 'completed' : 'failed';
      } else {
        goalUpdate.current_week = week + 1;
      }

      await updateGoal(goalId, goalUpdate);
    }

    return NextResponse.json({
      success: true,
      weekStatus: {
        yesVotes,
        noVotes,
        totalReferees: referees.length,
        passed,
      },
    });
  } catch (error) {
    console.error('API Error (POST /api/goals/[id]/vote):', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
