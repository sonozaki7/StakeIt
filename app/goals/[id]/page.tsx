'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { GoalWithDetails } from '@/types';

export default function GoalDetailPage(): React.ReactElement {
  const params = useParams();
  const id = params.id as string;
  const [goal, setGoal] = useState<GoalWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Progress form state
  const [showProgressForm, setShowProgressForm] = useState(false);
  const [progressNotes, setProgressNotes] = useState('');
  const [progressFile, setProgressFile] = useState<File | null>(null);
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressMessage, setProgressMessage] = useState('');

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

  async function handleProgressSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!goal) return;

    setProgressLoading(true);
    setProgressMessage('');

    try {
      if (progressFile) {
        // Upload with photo
        const formData = new FormData();
        formData.append('photo', progressFile);
        formData.append('userId', goal.user_id);
        if (progressNotes) formData.append('notes', progressNotes);

        // Try to get geolocation
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
          });
          formData.append('locationLat', position.coords.latitude.toString());
          formData.append('locationLng', position.coords.longitude.toString());
        } catch {
          // Location not available
        }

        const response = await fetch(`/api/goals/${id}/progress/upload`, {
          method: 'POST',
          body: formData,
        });
        const data = await response.json();

        if (!data.success) {
          setProgressMessage(`Error: ${data.error}`);
          return;
        }

        let msg = 'Progress update submitted!';
        if (data.warnings?.length) {
          msg += ` (${data.warnings.join(', ')})`;
        }
        setProgressMessage(msg);
      } else {
        // Text-only update
        const response = await fetch(`/api/goals/${id}/progress`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: goal.user_id,
            weekNumber: goal.current_week,
            notes: progressNotes || undefined,
          }),
        });
        const data = await response.json();

        if (!data.success) {
          setProgressMessage(`Error: ${data.error}`);
          return;
        }
        setProgressMessage('Progress update submitted!');
      }

      setProgressNotes('');
      setProgressFile(null);
      setShowProgressForm(false);
      fetchGoal();
    } catch {
      setProgressMessage('Failed to submit progress update');
    } finally {
      setProgressLoading(false);
    }
  }

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
          <Link
            href="/"
            className="text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    pending_payment: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    completed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    refunded: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  };

  const penaltyLabels: Record<string, string> = {
    forfeited: '🔥 Donate to StakeIt',
    delayed_refund: '🧊 Freeze & Restake',
    split_to_group: '👥 Split to Group',
    charity_donation: '💝 Charity Donation',
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12">
      <div className="container mx-auto px-4 max-w-2xl">
        <Link
          href="/"
          className="text-indigo-600 dark:text-indigo-400 hover:underline mb-6 inline-block"
        >
          &larr; Back to Home
        </Link>

        {/* Goal Header */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {goal.goal_name}
            </h2>
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${statusColors[goal.status] || ''}`}
            >
              {goal.status.replace('_', ' ')}
            </span>
          </div>

          {goal.description && (
            <p className="text-gray-600 dark:text-gray-400 mb-4">{goal.description}</p>
          )}

          {/* Penalty type badge */}
          <div className="mb-4">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Penalty if failed:{' '}
              <span className="font-medium text-gray-700 dark:text-gray-300">
                {penaltyLabels[goal.penalty_type] || goal.penalty_type}
              </span>
            </span>
          </div>

          {/* Frozen balance info */}
          {goal.frozen_balance_thb > 0 && (
            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <span className="text-sm text-blue-700 dark:text-blue-400">
                🧊 Includes ฿{goal.frozen_balance_thb.toLocaleString()} frozen from previous failure.
                Total at risk: ฿{(goal.stake_amount_thb + goal.frozen_balance_thb).toLocaleString()}
              </span>
            </div>
          )}

          {/* Freeze info for failed goals */}
          {goal.status === 'failed' && goal.penalty_type === 'delayed_refund' && goal.frozen_until && (
            <div className="mb-4 p-3 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg">
              <span className="text-sm text-cyan-700 dark:text-cyan-400">
                🧊 Frozen until {new Date(goal.frozen_until).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}.
                This stake will be added to your next goal.
              </span>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mt-6">
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                ฿{goal.stake_amount_thb.toLocaleString()}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Stake</div>
            </div>
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {goal.current_week}/{goal.duration_weeks}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Current Week</div>
            </div>
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {goal.weeks_passed}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Weeks Passed</div>
            </div>
          </div>

          {/* Summary link for completed/failed goals */}
          {(goal.status === 'completed' || goal.status === 'failed' || goal.final_vote_status === 'voting') && (
            <div className="mt-4 text-center">
              <Link
                href={`/goals/${goal.id}/summary`}
                className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
              >
                View Full Summary &rarr;
              </Link>
            </div>
          )}
        </div>

        {/* QR Code (if pending payment) */}
        {goal.status === 'pending_payment' && goal.payment_qr_url && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 mb-6 text-center">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              Scan to Pay
            </h3>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={goal.payment_qr_url}
              alt="PromptPay QR Code"
              className="mx-auto max-w-64 rounded-lg"
            />
            <p className="text-gray-500 dark:text-gray-400 mt-4">
              Pay ฿{goal.stake_amount_thb.toLocaleString()} to activate your goal
            </p>
          </div>
        )}

        {/* Submit Progress (active goals only) */}
        {goal.status === 'active' && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                Submit Progress
              </h3>
              {!showProgressForm && (
                <button
                  onClick={() => setShowProgressForm(true)}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 transition-colors"
                >
                  + Add Update
                </button>
              )}
            </div>

            {showProgressForm && (
              <form onSubmit={handleProgressSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Photo (camera only)
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => setProgressFile(e.target.files?.[0] || null)}
                    className="w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 dark:file:bg-indigo-900/30 dark:file:text-indigo-400 hover:file:bg-indigo-100"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Notes
                  </label>
                  <textarea
                    value={progressNotes}
                    onChange={(e) => setProgressNotes(e.target.value)}
                    placeholder="What did you accomplish?"
                    rows={2}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 text-sm"
                  />
                </div>

                {progressMessage && (
                  <p className={`text-sm ${progressMessage.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
                    {progressMessage}
                  </p>
                )}

                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={progressLoading || (!progressFile && !progressNotes)}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    {progressLoading ? 'Submitting...' : 'Submit'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowProgressForm(false); setProgressMessage(''); }}
                    className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Progress History */}
        {goal.progress_updates && goal.progress_updates.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 mb-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              Progress Updates ({goal.progress_updates.length})
            </h3>
            <div className="space-y-4">
              {goal.progress_updates.map((update) => (
                <div
                  key={update.id}
                  className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Week {update.week_number}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(update.submitted_at).toLocaleDateString()}
                    </span>
                  </div>

                  {update.photo_urls.length > 0 && (
                    <div className="flex gap-2 mb-2 overflow-x-auto">
                      {update.photo_urls.map((url, i) => (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          key={i}
                          src={url}
                          alt={`Progress photo ${i + 1}`}
                          className="w-20 h-20 object-cover rounded-lg flex-shrink-0"
                        />
                      ))}
                    </div>
                  )}

                  {update.notes && (
                    <p className="text-sm text-gray-600 dark:text-gray-400">{update.notes}</p>
                  )}

                  {(update.location_lat != null && update.location_lng != null) && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      📍 {update.location_lat.toFixed(4)}, {update.location_lng.toFixed(4)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Weekly Timeline */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 mb-6">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
            Weekly Progress
          </h3>
          <div className="space-y-3">
            {Array.from({ length: goal.duration_weeks }, (_, i) => i + 1).map((week) => {
              const weekResult = goal.weekly_results.find(
                (wr) => wr.week_number === week
              );
              const isCurrentWeek = week === goal.current_week;

              let statusIcon = '⬜';
              let statusText = 'Upcoming';
              let bgClass = '';

              const isZkTls = goal.verification_type === 'zktls';

              if (weekResult?.passed === true) {
                statusIcon = '✅';
                statusText = isZkTls ? 'Verified by zkTLS' : `Passed (${weekResult.yes_votes} yes / ${weekResult.no_votes} no)`;
                bgClass = 'bg-green-50 dark:bg-green-900/10';
              } else if (weekResult?.passed === false) {
                statusIcon = '❌';
                statusText = isZkTls ? 'Not verified' : `Failed (${weekResult.yes_votes} yes / ${weekResult.no_votes} no)`;
                bgClass = 'bg-red-50 dark:bg-red-900/10';
              } else if (isCurrentWeek) {
                statusIcon = '🔵';
                statusText = isZkTls ? 'Pending verification' : 'In Progress';
                bgClass = 'bg-blue-50 dark:bg-blue-900/10';
              }

              return (
                <div
                  key={week}
                  className={`flex items-center justify-between p-3 rounded-lg ${bgClass}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{statusIcon}</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      Week {week}
                    </span>
                  </div>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {statusText}
                  </span>
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
                  Progress is verified cryptographically. No friend voting required.
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
              <p className="text-gray-500 dark:text-gray-400">
                No referees yet. Referees are added when they cast their first vote.
              </p>
            ) : (
              <ul className="space-y-2">
                {goal.referees.map((referee) => (
                  <li
                    key={referee.id}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                  >
                    <span className="font-medium text-gray-900 dark:text-white">
                      {referee.user_name}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {referee.platform}
                    </span>
                  </li>
                ))}
              </ul>
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
