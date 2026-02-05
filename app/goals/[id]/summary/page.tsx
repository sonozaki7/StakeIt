'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { GoalWithDetails } from '@/types';

export default function GoalSummaryPage(): React.ReactElement {
  const params = useParams();
  const id = params.id as string;
  const [goal, setGoal] = useState<GoalWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchGoal = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(`/api/goals/${id}`);
      const data = await response.json();

      if (!data.success) {
        setError(data.error || 'Goal not found');
        return;
      }

      setGoal(data.goal);
    } catch {
      setError('Failed to load goal');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchGoal();
  }, [fetchGoal]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400 text-lg">Loading...</div>
      </div>
    );
  }

  if (error || !goal) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12">
        <div className="container mx-auto px-4 max-w-2xl text-center">
          <div className="text-5xl mb-4">😕</div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            {error || 'Goal not found'}
          </h2>
          <Link href="/" className="text-indigo-600 dark:text-indigo-400 hover:underline">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const penaltyLabels: Record<string, string> = {
    forfeited: '🔥 Donate to StakeIt',
    delayed_refund: '🧊 Freeze & Restake',
    split_to_group: '👥 Split to Group',
    charity_donation: '💝 Charity Donation',
  };

  const isFinalized = goal.final_vote_status === 'finalized' || goal.status === 'completed' || goal.status === 'failed';
  const isVoting = goal.final_vote_status === 'voting';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12">
      <div className="container mx-auto px-4 max-w-2xl">
        <Link
          href={`/goals/${id}`}
          className="text-indigo-600 dark:text-indigo-400 hover:underline mb-6 inline-block"
        >
          &larr; Back to Goal
        </Link>

        {/* Summary Header */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 mb-6">
          <div className="text-center mb-6">
            <div className="text-4xl mb-3">
              {goal.status === 'completed' ? '🎉' : goal.status === 'failed' ? '😢' : '🏁'}
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
              {goal.goal_name}
            </h2>
            <p className="text-gray-500 dark:text-gray-400">
              by {goal.user_name}
            </p>
          </div>

          {/* Result Banner */}
          {isFinalized && (
            <div className={`p-4 rounded-lg text-center mb-6 ${
              goal.status === 'completed'
                ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-400'
                : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-400'
            }`}>
              <div className="text-lg font-bold">
                {goal.status === 'completed'
                  ? `Goal Completed! ฿${goal.stake_amount_thb.toLocaleString()} refunded.`
                  : `Goal Failed. ${penaltyLabels[goal.penalty_type] || goal.penalty_type}: ฿${goal.stake_amount_thb.toLocaleString()}`
                }
              </div>
              {goal.status === 'completed' && goal.frozen_balance_thb > 0 && (
                <p className="text-sm mt-1">
                  🧊 ฿{goal.frozen_balance_thb.toLocaleString()} frozen balance released!
                </p>
              )}
              {goal.status === 'failed' && goal.penalty_type === 'delayed_refund' && goal.frozen_until && (
                <p className="text-sm mt-1">
                  🧊 Frozen until {new Date(goal.frozen_until).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}.
                  This stake will be added to your next goal.
                </p>
              )}
            </div>
          )}

          {/* Frozen balance info */}
          {goal.frozen_balance_thb > 0 && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg mb-6 text-center">
              <span className="text-sm text-blue-700 dark:text-blue-400">
                🧊 Includes ฿{goal.frozen_balance_thb.toLocaleString()} frozen from previous failure.
                Total at risk: ฿{(goal.stake_amount_thb + goal.frozen_balance_thb).toLocaleString()}
              </span>
            </div>
          )}

          {isVoting && goal.verification_type !== 'zktls' && (
            <div className="p-4 rounded-lg text-center mb-6 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-400">
              <div className="text-lg font-bold">
                Final voting in progress...
              </div>
              <p className="text-sm mt-1">Group members are casting their final vote in the chat.</p>
            </div>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-4 gap-3">
            <div className="text-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="text-xl font-bold text-gray-900 dark:text-white">
                ฿{goal.stake_amount_thb.toLocaleString()}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Stake</div>
            </div>
            <div className="text-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="text-xl font-bold text-gray-900 dark:text-white">
                {goal.duration_weeks}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Weeks</div>
            </div>
            <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <div className="text-xl font-bold text-green-600 dark:text-green-400">
                {goal.weeks_passed}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Passed</div>
            </div>
            <div className="text-center p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <div className="text-xl font-bold text-red-600 dark:text-red-400">
                {goal.weeks_failed}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Failed</div>
            </div>
          </div>

          <div className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
            Penalty type: <span className="font-medium">{penaltyLabels[goal.penalty_type] || goal.penalty_type}</span>
          </div>
        </div>

        {/* Week-by-Week Timeline */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 mb-6">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
            Week-by-Week Timeline
          </h3>
          <div className="space-y-4">
            {Array.from({ length: goal.duration_weeks }, (_, i) => i + 1).map((week) => {
              const weekResult = goal.weekly_results.find(wr => wr.week_number === week);
              const weekProgress = goal.progress_updates?.filter(p => p.week_number === week) || [];

              let statusIcon = '⬜';
              let statusBg = '';
              let statusLabel = 'No vote';

              const isZkTls = goal.verification_type === 'zktls';

              if (weekResult?.passed === true) {
                statusIcon = '✅';
                statusBg = 'border-l-4 border-green-500';
                statusLabel = isZkTls ? 'Verified by zkTLS' : `Passed (${weekResult.yes_votes}Y / ${weekResult.no_votes}N)`;
              } else if (weekResult?.passed === false) {
                statusIcon = '❌';
                statusBg = 'border-l-4 border-red-500';
                statusLabel = isZkTls ? 'Not verified' : `Failed (${weekResult.yes_votes}Y / ${weekResult.no_votes}N)`;
              }

              return (
                <div key={week} className={`p-4 bg-gray-50 dark:bg-gray-700 rounded-lg ${statusBg}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-900 dark:text-white">
                      {statusIcon} Week {week}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {statusLabel}
                    </span>
                  </div>

                  {/* Progress photos for this week */}
                  {weekProgress.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {weekProgress.map((update) => (
                        <div key={update.id} className="flex items-start gap-3">
                          {update.photo_urls.length > 0 && (
                            <div className="flex gap-1 flex-shrink-0">
                              {update.photo_urls.map((url, i) => (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                  key={i}
                                  src={url}
                                  alt={`Week ${week} photo ${i + 1}`}
                                  className="w-16 h-16 object-cover rounded"
                                />
                              ))}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            {update.notes && (
                              <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                                {update.notes}
                              </p>
                            )}
                            <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                              <span>{new Date(update.submitted_at).toLocaleDateString()}</span>
                              {update.location_lat != null && (
                                <span>📍 {update.location_lat.toFixed(2)}, {update.location_lng?.toFixed(2)}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Referees / Verification Method */}
        {goal.verification_type === 'zktls' ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 mb-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              Verification Method
            </h3>
            <div className="flex items-center gap-3 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg">
              <span className="text-2xl">🔐</span>
              <div>
                <p className="font-medium text-indigo-900 dark:text-indigo-300">zkTLS (Automatic)</p>
                <p className="text-sm text-indigo-700 dark:text-indigo-400">
                  Progress was verified cryptographically. No friend voting required.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 mb-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              Referees ({goal.referees.length})
            </h3>
            {goal.referees.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400">No referees voted.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {goal.referees.map((referee) => (
                  <span
                    key={referee.id}
                    className="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-sm text-gray-700 dark:text-gray-300"
                  >
                    {referee.user_name}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Goal ID */}
        <div className="text-center text-sm text-gray-400 dark:text-gray-500">
          Goal ID: {goal.id}
        </div>
      </div>
    </div>
  );
}
