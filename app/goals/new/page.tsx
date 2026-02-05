'use client';

import { useState } from 'react';
import Link from 'next/link';

// ============================================================
// APP CATALOG (mirrors Telegram bot's APP_CATALOG)
// ============================================================

interface MetricDef {
  key: string;
  label: string;
  emoji: string;
  unit: string;
  presets: number[];
  hasZkTls: boolean;
}

interface AppDef {
  key: string;
  name: string;
  emoji: string;
  tagline: string;
  metrics: MetricDef[];
}

const APP_CATALOG: AppDef[] = [
  {
    key: 'duolingo', name: 'Duolingo', emoji: '🦉', tagline: 'Learn Languages',
    metrics: [
      { key: 'xp_earned', label: 'XP Earned', emoji: '⭐', unit: 'XP', presets: [100, 500, 1000, 2000], hasZkTls: true },
      { key: 'streak_days', label: 'Streak Days', emoji: '🔥', unit: 'days', presets: [7, 14, 30, 60], hasZkTls: true },
      { key: 'lessons', label: 'Lessons Completed', emoji: '📚', unit: 'lessons', presets: [5, 10, 20, 50], hasZkTls: true },
    ],
  },
  {
    key: 'github', name: 'GitHub', emoji: '💻', tagline: 'Code Daily',
    metrics: [
      { key: 'contributions', label: 'Total Contributions', emoji: '📊', unit: 'contributions', presets: [10, 30, 50, 100], hasZkTls: true },
      { key: 'commits', label: 'Commits Pushed', emoji: '✅', unit: 'commits', presets: [10, 30, 50, 100], hasZkTls: true },
      { key: 'prs', label: 'Pull Requests', emoji: '🔀', unit: 'PRs', presets: [2, 5, 10, 20], hasZkTls: true },
      { key: 'streak', label: 'Contribution Streak', emoji: '🔥', unit: 'days', presets: [7, 14, 30, 60], hasZkTls: true },
    ],
  },
  {
    key: 'strava', name: 'Strava', emoji: '🏃', tagline: 'Stay Active',
    metrics: [
      { key: 'distance_km', label: 'Distance (km)', emoji: '📏', unit: 'km', presets: [10, 25, 50, 100], hasZkTls: false },
      { key: 'activities', label: 'Workouts', emoji: '🏋️', unit: 'workouts', presets: [3, 5, 10, 20], hasZkTls: false },
      { key: 'duration_min', label: 'Active Minutes', emoji: '⏱', unit: 'min', presets: [60, 150, 300, 600], hasZkTls: false },
      { key: 'elevation_m', label: 'Elevation Gain', emoji: '⛰', unit: 'm', presets: [500, 1000, 2000, 5000], hasZkTls: false },
    ],
  },
  {
    key: 'leetcode', name: 'LeetCode', emoji: '🧠', tagline: 'Sharpen Skills',
    metrics: [
      { key: 'problems_solved', label: 'Problems Solved', emoji: '✅', unit: 'problems', presets: [5, 10, 20, 50], hasZkTls: true },
      { key: 'medium_solved', label: 'Medium Problems', emoji: '🟡', unit: 'problems', presets: [3, 5, 10, 20], hasZkTls: true },
      { key: 'hard_solved', label: 'Hard Problems', emoji: '🔴', unit: 'problems', presets: [1, 3, 5, 10], hasZkTls: true },
      { key: 'contest_rating', label: 'Contest Rating', emoji: '🏆', unit: 'rating', presets: [1400, 1600, 1800, 2000], hasZkTls: true },
    ],
  },
  {
    key: 'headspace', name: 'Headspace', emoji: '🧘', tagline: 'Be Mindful',
    metrics: [
      { key: 'meditation_min', label: 'Meditation Time', emoji: '🕐', unit: 'min', presets: [30, 60, 120, 300], hasZkTls: false },
      { key: 'sessions', label: 'Sessions', emoji: '📿', unit: 'sessions', presets: [3, 7, 14, 30], hasZkTls: false },
      { key: 'mindful_streak', label: 'Mindful Streak', emoji: '🔥', unit: 'days', presets: [7, 14, 21, 30], hasZkTls: false },
    ],
  },
];

const PENALTY_OPTIONS = [
  { value: 'forfeited', label: 'Donate to StakeIt', emoji: '🔥', desc: 'Money goes to StakeIt permanently. Gone.' },
  { value: 'delayed_refund', label: 'Freeze & Restake', emoji: '🧊', desc: 'Money frozen for 1–12 months, then auto-staked on your next goal.' },
  { value: 'split_to_group', label: 'Split to Group', emoji: '👥', desc: 'Stake split among your group members.' },
  { value: 'charity_donation', label: 'Charity Donation', emoji: '💝', desc: 'Stake donated to a charity of your choice.' },
];

const CHARITY_OPTIONS = [
  { code: 'msf', name: 'Doctors Without Borders', emoji: '🏥' },
  { code: 'wwf', name: 'WWF (World Wildlife Fund)', emoji: '🐼' },
  { code: 'wiki', name: 'Wikipedia Foundation', emoji: '📚' },
  { code: 'kiva', name: 'Kiva (Microloans)', emoji: '🤝' },
  { code: 'trees', name: 'One Tree Planted', emoji: '🌳' },
];

const DURATION_OPTIONS = [
  { label: '3 days', weeks: 3, display: '3 days' },
  { label: '7 days', weeks: 7, display: '7 days' },
  { label: '2 weeks', weeks: 2, display: '2 weeks' },
  { label: '4 weeks', weeks: 4, display: '4 weeks' },
  { label: '1 month', weeks: 4, display: '1 month' },
  { label: '3 months', weeks: 12, display: '3 months' },
];

const AMOUNT_PRESETS = [100, 500, 1000, 2000];

const FREEZE_MONTHS = [1, 2, 3, 6, 9, 12];

export default function NewGoalPage(): React.ReactElement {
  // Step tracking
  const [step, setStep] = useState<'name' | 'app' | 'metric' | 'target' | 'duration' | 'penalty' | 'charity' | 'freeze' | 'amount' | 'confirm'>('name');

  // Form data
  const [userName, setUserName] = useState('');
  const [selectedApp, setSelectedApp] = useState<number | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<number | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [customTarget, setCustomTarget] = useState('');
  const [durationWeeks, setDurationWeeks] = useState(4);
  const [durationLabel, setDurationLabel] = useState('4 weeks');
  const [customDuration, setCustomDuration] = useState('');
  const [penaltyType, setPenaltyType] = useState('forfeited');
  const [charityChoice, setCharityChoice] = useState('');
  const [freezeMonths, setFreezeMonths] = useState(3);
  const [stakeAmount, setStakeAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{
    id: string;
    paymentQrUrl: string;
    stakeAmountThb: number;
  } | null>(null);

  const app = selectedApp !== null ? APP_CATALOG[selectedApp] : null;
  const metric = app && selectedMetric !== null ? app.metrics[selectedMetric] : null;

  function parseDuration(input: string): { weeks: number; label: string } | null {
    const trimmed = input.trim().toLowerCase();
    const match = trimmed.match(/^(\d+)\s*(d|day|days|w|wk|wks|week|weeks|m|mo|mon|month|months)$/);
    if (!match) return null;
    const num = parseInt(match[1], 10);
    if (num <= 0 || num > 365) return null;
    const unit = match[2];
    if (unit.startsWith('d')) return { weeks: num, label: `${num} day${num > 1 ? 's' : ''}` };
    if (unit.startsWith('w')) return { weeks: num, label: `${num} week${num > 1 ? 's' : ''}` };
    return { weeks: num * 4, label: `${num} month${num > 1 ? 's' : ''}` };
  }

  function buildGoalName(): string {
    if (!app || !metric || !target) return '';
    return `${app.name}: ${target} ${metric.unit} (${metric.label})`;
  }

  async function handleSubmit(): Promise<void> {
    if (!app || !metric || !target || !stakeAmount) return;
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goalName: buildGoalName(),
          stakeAmountThb: stakeAmount,
          durationWeeks,
          penaltyType,
          ...(penaltyType === 'delayed_refund' ? { holdMonths: freezeMonths } : {}),
          platform: 'web',
          userId: `web_${crypto.randomUUID()}`,
          userName: userName || 'Web User',
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

  function getPenaltyLabel(): string {
    const option = PENALTY_OPTIONS.find(o => o.value === penaltyType);
    if (!option) return '';
    let label = `${option.emoji} ${option.label}`;
    if (penaltyType === 'charity_donation' && charityChoice) {
      const ch = CHARITY_OPTIONS.find(c => c.code === charityChoice);
      if (ch) label += ` → ${ch.emoji} ${ch.name}`;
    }
    if (penaltyType === 'delayed_refund') {
      label += ` (${freezeMonths} month${freezeMonths > 1 ? 's' : ''})`;
    }
    return label;
  }

  // Success screen
  if (result) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12">
        <div className="container mx-auto px-4 max-w-lg">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-8 text-center">
            <div className="text-5xl mb-4">🎯</div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Goal Created!
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mb-1 text-sm">
              {userName && `Created by ${userName}`}
            </p>
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

  const stepLabel = (s: string): string => {
    const labels: Record<string, string> = {
      name: 'Your Name',
      app: 'Choose App',
      metric: 'Choose Metric',
      target: 'Set Target',
      duration: 'Duration',
      penalty: 'Penalty',
      charity: 'Charity',
      freeze: 'Freeze Period',
      amount: 'Stake Amount',
      confirm: 'Confirm',
    };
    return labels[s] || s;
  };

  const stepOrder = ['name', 'app', 'metric', 'target', 'duration', 'penalty', 'amount', 'confirm'];
  const currentStepIdx = stepOrder.indexOf(step === 'charity' ? 'penalty' : step === 'freeze' ? 'penalty' : step);

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
          {/* Progress bar */}
          <div className="flex items-center gap-1 mb-6">
            {stepOrder.map((s, i) => (
              <div
                key={s}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i <= currentStepIdx ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'
                }`}
              />
            ))}
          </div>

          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
            {stepLabel(step)}
          </h2>

          {/* Breadcrumb showing selections so far */}
          {app && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {app.emoji} {app.name}
              {metric && <> &gt; {metric.emoji} {metric.label}</>}
              {target && <> &gt; {target} {metric?.unit}</>}
            </p>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-lg mb-6">
              {error}
            </div>
          )}

          {/* ============================================================ */}
          {/* STEP: NAME */}
          {/* ============================================================ */}
          {step === 'name' && (
            <div className="space-y-4">
              <p className="text-gray-600 dark:text-gray-400">What should we call you?</p>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="Your name"
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 text-lg"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && userName.trim()) setStep('app');
                }}
              />
              <button
                onClick={() => setStep('app')}
                disabled={!userName.trim()}
                className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Continue
              </button>
            </div>
          )}

          {/* ============================================================ */}
          {/* STEP: APP */}
          {/* ============================================================ */}
          {step === 'app' && (
            <div className="space-y-3">
              <p className="text-gray-600 dark:text-gray-400 mb-2">What do you want to improve?</p>
              {APP_CATALOG.map((a, idx) => (
                <button
                  key={a.key}
                  onClick={() => {
                    setSelectedApp(idx);
                    setSelectedMetric(null);
                    setTarget(null);
                    setStep('metric');
                  }}
                  className={`w-full flex items-center gap-4 p-4 rounded-lg border transition-colors text-left ${
                    selectedApp === idx
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                      : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <span className="text-3xl">{a.emoji}</span>
                  <div>
                    <div className="font-semibold text-gray-900 dark:text-white">{a.name}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">{a.tagline}</div>
                  </div>
                </button>
              ))}
              <button
                onClick={() => setStep('name')}
                className="text-sm text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 mt-2"
              >
                &larr; Back
              </button>
            </div>
          )}

          {/* ============================================================ */}
          {/* STEP: METRIC */}
          {/* ============================================================ */}
          {step === 'metric' && app && (
            <div className="space-y-3">
              <p className="text-gray-600 dark:text-gray-400 mb-2">What metric will you track?</p>
              {app.metrics.map((m, idx) => (
                <button
                  key={m.key}
                  onClick={() => {
                    setSelectedMetric(idx);
                    setTarget(null);
                    setStep('target');
                  }}
                  className={`w-full flex items-center justify-between p-4 rounded-lg border transition-colors text-left ${
                    selectedMetric === idx
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                      : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{m.emoji}</span>
                    <span className="font-medium text-gray-900 dark:text-white">{m.label}</span>
                  </div>
                  {m.hasZkTls && (
                    <span className="text-xs px-2 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 rounded-full">
                      🔐 zkTLS
                    </span>
                  )}
                </button>
              ))}
              <button
                onClick={() => setStep('app')}
                className="text-sm text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 mt-2"
              >
                &larr; Back
              </button>
            </div>
          )}

          {/* ============================================================ */}
          {/* STEP: TARGET */}
          {/* ============================================================ */}
          {step === 'target' && metric && (
            <div className="space-y-4">
              <p className="text-gray-600 dark:text-gray-400">
                How much {metric.label.toLowerCase()} do you want to achieve?
              </p>
              <div className="grid grid-cols-2 gap-3">
                {metric.presets.map((preset) => (
                  <button
                    key={preset}
                    onClick={() => {
                      setTarget(preset);
                      setCustomTarget('');
                      setStep('duration');
                    }}
                    className="p-3 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:border-indigo-500 transition-colors font-medium text-gray-900 dark:text-white"
                  >
                    {preset.toLocaleString()} {metric.unit}
                  </button>
                ))}
              </div>
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-2">Custom target</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={customTarget}
                    onChange={(e) => setCustomTarget(e.target.value)}
                    placeholder={`e.g. 750`}
                    min={1}
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                  />
                  <button
                    onClick={() => {
                      const val = parseInt(customTarget, 10);
                      if (val > 0) {
                        setTarget(val);
                        setStep('duration');
                      }
                    }}
                    disabled={!customTarget || parseInt(customTarget, 10) <= 0}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Set
                  </button>
                </div>
              </div>
              <button
                onClick={() => setStep('metric')}
                className="text-sm text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400"
              >
                &larr; Back
              </button>
            </div>
          )}

          {/* ============================================================ */}
          {/* STEP: DURATION */}
          {/* ============================================================ */}
          {step === 'duration' && (
            <div className="space-y-4">
              <p className="text-gray-600 dark:text-gray-400">How long are you committing?</p>
              <div className="grid grid-cols-2 gap-3">
                {DURATION_OPTIONS.map((d) => (
                  <button
                    key={d.label}
                    onClick={() => {
                      setDurationWeeks(d.weeks);
                      setDurationLabel(d.display);
                      setCustomDuration('');
                      setStep('penalty');
                    }}
                    className="p-3 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:border-indigo-500 transition-colors font-medium text-gray-900 dark:text-white"
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-2">Custom duration (e.g. 30d, 6w, 2mon)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customDuration}
                    onChange={(e) => setCustomDuration(e.target.value)}
                    placeholder="e.g. 30d, 6w, 2mon"
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                  />
                  <button
                    onClick={() => {
                      const parsed = parseDuration(customDuration);
                      if (parsed) {
                        setDurationWeeks(parsed.weeks);
                        setDurationLabel(parsed.label);
                        setStep('penalty');
                      }
                    }}
                    disabled={!customDuration || !parseDuration(customDuration)}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Set
                  </button>
                </div>
              </div>
              <button
                onClick={() => setStep('target')}
                className="text-sm text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400"
              >
                &larr; Back
              </button>
            </div>
          )}

          {/* ============================================================ */}
          {/* STEP: PENALTY */}
          {/* ============================================================ */}
          {step === 'penalty' && (
            <div className="space-y-3">
              <p className="text-gray-600 dark:text-gray-400 mb-2">What happens to your money if you fail?</p>
              {PENALTY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    setPenaltyType(option.value);
                    if (option.value === 'charity_donation') {
                      setStep('charity');
                    } else if (option.value === 'delayed_refund') {
                      setStep('freeze');
                    } else {
                      setStep('amount');
                    }
                  }}
                  className={`w-full flex items-start gap-3 p-4 rounded-lg border transition-colors text-left ${
                    penaltyType === option.value
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                      : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <span className="text-2xl">{option.emoji}</span>
                  <div>
                    <div className="font-semibold text-gray-900 dark:text-white">{option.label}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">{option.desc}</div>
                  </div>
                </button>
              ))}
              <button
                onClick={() => setStep('duration')}
                className="text-sm text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 mt-2"
              >
                &larr; Back
              </button>
            </div>
          )}

          {/* ============================================================ */}
          {/* STEP: CHARITY */}
          {/* ============================================================ */}
          {step === 'charity' && (
            <div className="space-y-3">
              <p className="text-gray-600 dark:text-gray-400 mb-2">Which charity should receive your stake if you fail?</p>
              {CHARITY_OPTIONS.map((ch) => (
                <button
                  key={ch.code}
                  onClick={() => {
                    setCharityChoice(ch.code);
                    setStep('amount');
                  }}
                  className={`w-full flex items-center gap-3 p-4 rounded-lg border transition-colors text-left ${
                    charityChoice === ch.code
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                      : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <span className="text-2xl">{ch.emoji}</span>
                  <span className="font-medium text-gray-900 dark:text-white">{ch.name}</span>
                </button>
              ))}
              <button
                onClick={() => setStep('penalty')}
                className="text-sm text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 mt-2"
              >
                &larr; Back
              </button>
            </div>
          )}

          {/* ============================================================ */}
          {/* STEP: FREEZE MONTHS */}
          {/* ============================================================ */}
          {step === 'freeze' && (
            <div className="space-y-4">
              <p className="text-gray-600 dark:text-gray-400">
                How long should your money be frozen if you fail? After the freeze, it gets auto-staked on your next goal.
              </p>
              <div className="grid grid-cols-3 gap-3">
                {FREEZE_MONTHS.map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      setFreezeMonths(m);
                      setStep('amount');
                    }}
                    className={`p-3 rounded-lg border transition-colors font-medium text-gray-900 dark:text-white ${
                      freezeMonths === m
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                        : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    {m} month{m > 1 ? 's' : ''}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setStep('penalty')}
                className="text-sm text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 mt-2"
              >
                &larr; Back
              </button>
            </div>
          )}

          {/* ============================================================ */}
          {/* STEP: AMOUNT */}
          {/* ============================================================ */}
          {step === 'amount' && (
            <div className="space-y-4">
              <p className="text-gray-600 dark:text-gray-400">How much are you staking?</p>
              <div className="grid grid-cols-2 gap-3">
                {AMOUNT_PRESETS.map((amt) => (
                  <button
                    key={amt}
                    onClick={() => {
                      setStakeAmount(amt);
                      setCustomAmount('');
                      setStep('confirm');
                    }}
                    className="p-3 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:border-indigo-500 transition-colors font-medium text-gray-900 dark:text-white"
                  >
                    ฿{amt.toLocaleString()}
                  </button>
                ))}
              </div>
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-2">Custom amount (THB)</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    placeholder="e.g. 750"
                    min={1}
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                  />
                  <button
                    onClick={() => {
                      const val = parseInt(customAmount, 10);
                      if (val > 0) {
                        setStakeAmount(val);
                        setStep('confirm');
                      }
                    }}
                    disabled={!customAmount || parseInt(customAmount, 10) <= 0}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Set
                  </button>
                </div>
              </div>
              <button
                onClick={() => {
                  if (penaltyType === 'charity_donation') setStep('charity');
                  else if (penaltyType === 'delayed_refund') setStep('freeze');
                  else setStep('penalty');
                }}
                className="text-sm text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400"
              >
                &larr; Back
              </button>
            </div>
          )}

          {/* ============================================================ */}
          {/* STEP: CONFIRM */}
          {/* ============================================================ */}
          {step === 'confirm' && app && metric && target && stakeAmount && (
            <div className="space-y-4">
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500 dark:text-gray-400">App</span>
                  <span className="font-medium text-gray-900 dark:text-white">{app.emoji} {app.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Metric</span>
                  <span className="font-medium text-gray-900 dark:text-white">{metric.emoji} {metric.label}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Target</span>
                  <span className="font-medium text-gray-900 dark:text-white">{target.toLocaleString()} {metric.unit}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Duration</span>
                  <span className="font-medium text-gray-900 dark:text-white">{durationLabel}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Penalty</span>
                  <span className="font-medium text-gray-900 dark:text-white">{getPenaltyLabel()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Stake</span>
                  <span className="font-bold text-lg text-gray-900 dark:text-white">฿{stakeAmount.toLocaleString()}</span>
                </div>
                {metric.hasZkTls && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">Verification</span>
                    <span className="text-sm px-2 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 rounded-full">
                      🔐 zkTLS (automatic)
                    </span>
                  </div>
                )}
              </div>

              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-lg">
                  {error}
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Creating...' : `Stake ฿${stakeAmount.toLocaleString()} & Create Goal`}
              </button>
              <button
                onClick={() => setStep('amount')}
                className="text-sm text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400"
              >
                &larr; Back
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
