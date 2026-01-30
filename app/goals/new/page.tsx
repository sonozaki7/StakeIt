'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function NewGoalPage(): React.ReactElement {
  const [goalName, setGoalName] = useState('');
  const [description, setDescription] = useState('');
  const [stakeAmount, setStakeAmount] = useState(500);
  const [durationWeeks, setDurationWeeks] = useState(4);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{
    id: string;
    paymentQrUrl: string;
    stakeAmountThb: number;
  } | null>(null);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goalName,
          description: description || undefined,
          stakeAmountThb: stakeAmount,
          durationWeeks,
          platform: 'web',
          userId: `web_${Date.now()}`,
          userName: 'Web User',
        }),
      });

      const data = await response.json();

      if (!data.success) {
        setError(data.error || 'Failed to create goal');
        return;
      }

      setResult(data.goal);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12">
        <div className="container mx-auto px-4 max-w-lg">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-8 text-center">
            <div className="text-5xl mb-4">🎯</div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Goal Created!
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Scan the QR code below to pay ฿{result.stakeAmountThb.toLocaleString()} and activate your goal.
            </p>
            {result.paymentQrUrl && (
              <div className="mb-6">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={result.paymentQrUrl}
                  alt="PromptPay QR Code"
                  className="mx-auto max-w-64 rounded-lg"
                />
              </div>
            )}
            <div className="flex gap-4 justify-center">
              <Link
                href={`/goals/${result.id}`}
                className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
              >
                View Goal
              </Link>
              <Link
                href="/"
                className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 px-6 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Home
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12">
      <div className="container mx-auto px-4 max-w-lg">
        <Link
          href="/"
          className="text-indigo-600 dark:text-indigo-400 hover:underline mb-6 inline-block"
        >
          &larr; Back to Home
        </Link>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
            Create a New Goal
          </h2>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-lg mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label
                htmlFor="goalName"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Goal Name *
              </label>
              <input
                id="goalName"
                type="text"
                required
                value={goalName}
                onChange={(e) => setGoalName(e.target.value)}
                placeholder="e.g., Exercise 3x per week"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
              />
            </div>

            <div>
              <label
                htmlFor="description"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Description (optional)
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add more details about your goal..."
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
              />
            </div>

            <div>
              <label
                htmlFor="stakeAmount"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Stake Amount (THB) *
              </label>
              <input
                id="stakeAmount"
                type="number"
                required
                min={1}
                value={stakeAmount}
                onChange={(e) => setStakeAmount(parseInt(e.target.value, 10) || 0)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            <div>
              <label
                htmlFor="durationWeeks"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Duration *
              </label>
              <select
                id="durationWeeks"
                required
                value={durationWeeks}
                onChange={(e) => setDurationWeeks(parseInt(e.target.value, 10))}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value={1}>1 week</option>
                <option value={2}>2 weeks</option>
                <option value={4}>4 weeks</option>
                <option value={8}>8 weeks</option>
                <option value={12}>12 weeks</option>
                <option value={26}>26 weeks</option>
                <option value={52}>52 weeks</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={loading || !goalName || stakeAmount <= 0}
              className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Creating...' : `Stake ฿${stakeAmount.toLocaleString()} & Create Goal`}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
