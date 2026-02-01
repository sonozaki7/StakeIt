import { NextRequest, NextResponse } from 'next/server';
import { verifyProof, meetsThreshold } from '@/lib/reclaim';
import {
  updateZkVerification,
  getGoal,
  updateGoal,
  updateWeeklyResult,
  getOrCreateWeeklyResult,
} from '@/lib/supabase';
import { recordOnChain } from '@/lib/thirdweb';
import { ReclaimProof } from '@/types';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const proofData: ReclaimProof = await request.json();

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
        proof_data: proofData as unknown as Record<string, unknown>,
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
      proof_data: proofData as unknown as Record<string, unknown>,
      extracted_value: verification.extractedValue,
      extracted_parameters: verification.extractedParameters as Record<string, unknown>,
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

      // Re-read goal to get latest weeks_passed (prevents stale-read race condition)
      const freshGoal = await getGoal(goalId);
      const currentGoal = freshGoal || goal;

      const goalUpdate: Record<string, unknown> = {
        weeks_passed: currentGoal.weeks_passed + 1,
        current_week: Math.min(weekNumber + 1, currentGoal.duration_weeks),
      };

      const newPassed = currentGoal.weeks_passed + 1;
      const totalDone = newPassed + currentGoal.weeks_failed;
      if (totalDone >= currentGoal.duration_weeks) {
        const majorityWeeks = Math.floor(currentGoal.duration_weeks / 2) + 1;
        goalUpdate.status = newPassed >= majorityWeeks ? 'completed' : 'failed';
      }

      await updateGoal(goalId, goalUpdate);

      // Record on-chain (async, non-blocking)
      recordOnChain(goalId, weekNumber, true, verification.extractedValue || '')
        .catch(err => console.error('On-chain recording failed:', err));

      // Telegram notifications (imported dynamically to avoid circular deps)
      try {
        const { notifyZkVerificationComplete, notifyGoalComplete } = await import('@/lib/telegram');
        notifyZkVerificationComplete(goal, weekNumber, verification.extractedValue || '')
          .catch(err => console.error('Telegram notification failed:', err));

        // Send completion notification if goal just finished
        if (goalUpdate.status === 'completed' || goalUpdate.status === 'failed') {
          const finishedGoal = await getGoal(goalId);
          if (finishedGoal) {
            notifyGoalComplete(finishedGoal)
              .catch(err => console.error('Telegram completion notification failed:', err));
          }
        }
      } catch {
        console.log('Telegram notification skipped');
      }
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
