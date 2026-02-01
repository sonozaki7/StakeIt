import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getGoal,
  updateGoal,
  getOrCreateWeeklyResult,
  updateWeeklyResult,
} from '@/lib/supabase';
import {
  notifyZkVerificationComplete,
  notifyGoalComplete,
} from '@/lib/telegram';
import { Goal } from '@/types';

// Format 1 (adaptive): { pass: 2, fail: 2 }  — auto-fills remaining periods
// Format 2 (adaptive): { outcome: "fail" }    — uses goal's duration, majority fails
// Format 3 (adaptive): { outcome: "pass" }    — uses goal's duration, all pass
// Format 4 (legacy):   { weeks: [1,2,3], vote: true }
const simulateSchema = z.union([
  z.object({
    pass: z.number().int().min(0),
    fail: z.number().int().min(0),
  }),
  z.object({
    outcome: z.enum(['pass', 'fail']),
  }),
  z.object({
    weeks: z.array(z.number().int().positive()).min(1),
    vote: z.boolean().default(true),
  }),
]);

/**
 * DEV-ONLY: Simulate verification for one or more periods.
 * Adapts to the goal's duration_weeks — works for goals set in days, weeks, or months.
 *
 * Examples:
 *   POST { "outcome": "fail" }         → auto-generates enough failures for the goal to fail
 *   POST { "outcome": "pass" }         → all periods pass
 *   POST { "pass": 2, "fail": 2 }     → first 2 pass, next 2 fail (total must equal duration_weeks)
 *   POST { "pass": 1, "fail": 0 }     → only simulate 1 period passing (partial)
 *   POST { "weeks": [1,2], "vote": true } → legacy format, explicit week numbers
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { success: false, error: 'Not available in production' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validation = simulateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed. Use { "outcome": "pass"|"fail" } or { "pass": N, "fail": N } or { "weeks": [...], "vote": bool }', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const goalId = params.id;
    const goal = await getGoal(goalId);
    if (!goal) {
      return NextResponse.json(
        { success: false, error: 'Goal not found' },
        { status: 404 }
      );
    }

    if (goal.status !== 'active' && goal.status !== 'pending_payment') {
      return NextResponse.json(
        { success: false, error: `Goal status is '${goal.status}', cannot verify` },
        { status: 400 }
      );
    }

    const totalPeriods = goal.duration_weeks;
    const alreadyDone = goal.weeks_passed + goal.weeks_failed;
    const remaining = totalPeriods - alreadyDone;

    // Build the period plan: array of { period: number, vote: boolean }
    let plan: Array<{ period: number; vote: boolean }> = [];

    const data = validation.data;

    if ('outcome' in data) {
      // Auto-generate a plan that achieves the desired outcome
      const majorityNeeded = Math.floor(totalPeriods / 2) + 1;

      if (data.outcome === 'pass') {
        // Pass all remaining periods
        for (let i = 0; i < remaining; i++) {
          plan.push({ period: alreadyDone + i + 1, vote: true });
        }
      } else {
        // Fail enough to guarantee failure: pass some, then fail the rest
        const passCount = Math.max(0, majorityNeeded - 1 - goal.weeks_passed);
        const failCount = remaining - passCount;
        for (let i = 0; i < passCount; i++) {
          plan.push({ period: alreadyDone + i + 1, vote: true });
        }
        for (let i = 0; i < failCount; i++) {
          plan.push({ period: alreadyDone + passCount + i + 1, vote: false });
        }
      }
    } else if ('pass' in data && 'fail' in data) {
      const requestedTotal = data.pass + data.fail;
      if (requestedTotal > remaining) {
        return NextResponse.json(
          { success: false, error: `Requested ${requestedTotal} periods but only ${remaining} remaining (${alreadyDone} already done out of ${totalPeriods})` },
          { status: 400 }
        );
      }
      for (let i = 0; i < data.pass; i++) {
        plan.push({ period: alreadyDone + i + 1, vote: true });
      }
      for (let i = 0; i < data.fail; i++) {
        plan.push({ period: alreadyDone + data.pass + i + 1, vote: false });
      }
    } else {
      // Legacy format: explicit week numbers
      const legacyData = data as { weeks: number[]; vote: boolean };
      plan = legacyData.weeks
        .filter(w => w >= 1 && w <= totalPeriods)
        .map(w => ({ period: w, vote: legacyData.vote }));
    }

    if (plan.length === 0) {
      return NextResponse.json(
        { success: false, error: `No periods to simulate. Goal has ${totalPeriods} total periods, ${alreadyDone} already done.` },
        { status: 400 }
      );
    }

    const results: Array<{ period: number; passed: boolean }> = [];

    for (const step of plan) {
      // Update weekly result
      await getOrCreateWeeklyResult(goalId, step.period, 0);
      await updateWeeklyResult(goalId, step.period, {
        passed: step.vote,
        yes_votes: step.vote ? 1 : 0,
        no_votes: step.vote ? 0 : 1,
        finalized_at: new Date().toISOString(),
      });

      // Re-read goal for latest counts (prevents stale-read)
      const freshGoal = await getGoal(goalId);
      if (!freshGoal) break;

      const goalUpdate: Record<string, unknown> = {};
      if (step.vote) {
        goalUpdate.weeks_passed = freshGoal.weeks_passed + 1;
      } else {
        goalUpdate.weeks_failed = freshGoal.weeks_failed + 1;
      }
      goalUpdate.current_week = Math.min(step.period + 1, freshGoal.duration_weeks);

      // Check if all periods are done
      const newPassed = (goalUpdate.weeks_passed ?? freshGoal.weeks_passed) as number;
      const newFailed = (goalUpdate.weeks_failed ?? freshGoal.weeks_failed) as number;
      if (newPassed + newFailed >= freshGoal.duration_weeks) {
        const majorityNeeded = Math.floor(freshGoal.duration_weeks / 2) + 1;
        goalUpdate.status = newPassed >= majorityNeeded ? 'completed' : 'failed';
      }

      await updateGoal(goalId, goalUpdate);
      results.push({ period: step.period, passed: step.vote });

      // Send per-period Telegram notification
      const updatedGoal = await getGoal(goalId);
      if (updatedGoal && step.vote) {
        notifyZkVerificationComplete(updatedGoal, step.period, 'simulated')
          .catch(err => console.error('Telegram period notification failed:', err));
      }

      // Send completion notification if goal just finished
      if (updatedGoal && (updatedGoal.status === 'completed' || updatedGoal.status === 'failed')) {
        notifyGoalComplete(updatedGoal as Goal)
          .catch(err => console.error('Telegram completion notification failed:', err));
      }
    }

    // Fetch final state
    const finalGoal = await getGoal(goalId);

    return NextResponse.json({
      success: true,
      totalPeriods,
      results,
      goal: finalGoal ? {
        status: finalGoal.status,
        weeks_passed: finalGoal.weeks_passed,
        weeks_failed: finalGoal.weeks_failed,
        current_week: finalGoal.current_week,
        duration_weeks: finalGoal.duration_weeks,
      } : null,
    });
  } catch (error) {
    console.error('API Error (POST /api/goals/[id]/simulate-verify):', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
