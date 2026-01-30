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

              if (weekResult?.passed === true) {
                statusIcon = '✅';
                statusText = `Passed (${weekResult.yes_votes} yes / ${weekResult.no_votes} no)`;
                bgClass = 'bg-green-50 dark:bg-green-900/10';
              } else if (weekResult?.passed === false) {
                statusIcon = '❌';
                statusText = `Failed (${weekResult.yes_votes} yes / ${weekResult.no_votes} no)`;
                bgClass = 'bg-red-50 dark:bg-red-900/10';
              } else if (isCurrentWeek) {
                statusIcon = '🔵';
                statusText = 'In Progress';
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

        {/* Referees */}
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

        {/* Goal ID */}
        <div className="text-center text-sm text-gray-400 dark:text-gray-500">
          Goal ID: {goal.id}
        </div>
      </div>
    </div>
  );
}
