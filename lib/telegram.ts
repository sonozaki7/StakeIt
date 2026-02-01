import { Bot, InlineKeyboard, InputFile, webhookCallback } from 'grammy';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CallbackCtx = any;

import {
  createGoal,
  getGoalsByUser,
  getGoalsByGroup,
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
  createPayment,
  getActiveGoalCountForUserInGroup,
  deleteGoalsByUserInGroup,
  createProgressUpdate,
  uploadProgressPhoto,
  getLatestProgressUpdate,
  updateProgressUpdate,
  getZkVerifications,
} from '@/lib/supabase';
import { createPromptPayCharge } from '@/lib/omise';
import { parseExifFromBuffer, isTimestampRecent } from '@/lib/exif';
import {
  findProviderForGoal,
  createTelegramVerificationLink,
  RECLAIM_PROVIDERS,
} from '@/lib/reclaim';
import { getBaseScanUrl } from '@/lib/thirdweb';
import { Goal, Platform, PenaltyType } from '@/types';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  throw new Error('TELEGRAM_BOT_TOKEN is not set. Cannot initialize Telegram bot.');
}

export const bot = new Bot(token);

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

// ============================================================
// APP CATALOG FOR STRUCTURED GOAL CREATION
// ============================================================

interface MetricDef {
  key: string;
  label: string;
  emoji: string;
  unit: string;
  presets: number[];
  reclaimProviderKey: string | null; // key in RECLAIM_PROVIDERS
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
      { key: 'xp_earned', label: 'XP Earned', emoji: '⭐', unit: 'XP', presets: [100, 500, 1000, 2000], reclaimProviderKey: 'duolingo_xp' },
      { key: 'streak_days', label: 'Streak Days', emoji: '🔥', unit: 'days', presets: [7, 14, 30, 60], reclaimProviderKey: 'duolingo_xp' },
      { key: 'lessons', label: 'Lessons Completed', emoji: '📚', unit: 'lessons', presets: [5, 10, 20, 50], reclaimProviderKey: 'duolingo_xp' },
    ],
  },
  {
    key: 'github', name: 'GitHub', emoji: '💻', tagline: 'Code Daily',
    metrics: [
      { key: 'contributions', label: 'Total Contributions', emoji: '📊', unit: 'contributions', presets: [10, 30, 50, 100], reclaimProviderKey: 'github_contributions' },
      { key: 'commits', label: 'Commits Pushed', emoji: '✅', unit: 'commits', presets: [10, 30, 50, 100], reclaimProviderKey: 'github_contributions' },
      { key: 'prs', label: 'Pull Requests', emoji: '🔀', unit: 'PRs', presets: [2, 5, 10, 20], reclaimProviderKey: 'github_contributions' },
      { key: 'streak', label: 'Contribution Streak', emoji: '🔥', unit: 'days', presets: [7, 14, 30, 60], reclaimProviderKey: 'github_contributions' },
    ],
  },
  {
    key: 'strava', name: 'Strava', emoji: '🏃', tagline: 'Stay Active',
    metrics: [
      { key: 'distance_km', label: 'Distance (km)', emoji: '📏', unit: 'km', presets: [10, 25, 50, 100], reclaimProviderKey: null },
      { key: 'activities', label: 'Workouts', emoji: '🏋️', unit: 'workouts', presets: [3, 5, 10, 20], reclaimProviderKey: null },
      { key: 'duration_min', label: 'Active Minutes', emoji: '⏱', unit: 'min', presets: [60, 150, 300, 600], reclaimProviderKey: null },
      { key: 'elevation_m', label: 'Elevation Gain', emoji: '⛰', unit: 'm', presets: [500, 1000, 2000, 5000], reclaimProviderKey: null },
    ],
  },
  {
    key: 'leetcode', name: 'LeetCode', emoji: '🧠', tagline: 'Sharpen Skills',
    metrics: [
      { key: 'problems_solved', label: 'Problems Solved', emoji: '✅', unit: 'problems', presets: [5, 10, 20, 50], reclaimProviderKey: 'leetcode' },
      { key: 'medium_solved', label: 'Medium Problems', emoji: '🟡', unit: 'problems', presets: [3, 5, 10, 20], reclaimProviderKey: 'leetcode' },
      { key: 'hard_solved', label: 'Hard Problems', emoji: '🔴', unit: 'problems', presets: [1, 3, 5, 10], reclaimProviderKey: 'leetcode' },
      { key: 'contest_rating', label: 'Contest Rating', emoji: '🏆', unit: 'rating', presets: [1400, 1600, 1800, 2000], reclaimProviderKey: 'leetcode' },
    ],
  },
  {
    key: 'headspace', name: 'Headspace', emoji: '🧘', tagline: 'Be Mindful',
    metrics: [
      { key: 'meditation_min', label: 'Meditation Time', emoji: '🕐', unit: 'min', presets: [30, 60, 120, 300], reclaimProviderKey: null },
      { key: 'sessions', label: 'Sessions', emoji: '📿', unit: 'sessions', presets: [3, 7, 14, 30], reclaimProviderKey: null },
      { key: 'mindful_streak', label: 'Mindful Streak', emoji: '🔥', unit: 'days', presets: [7, 14, 21, 30], reclaimProviderKey: null },
    ],
  },
];

function buildGoalName(app: AppDef, metric: MetricDef, target: number): string {
  return `${app.name}: ${target} ${metric.unit} (${metric.label})`;
}

// ============================================================
// CONVERSATIONAL GOAL CREATION STATE
// ============================================================

type ConversationStep =
  | 'awaiting_name'
  | 'awaiting_app'
  | 'awaiting_metric'
  | 'awaiting_target'
  | 'awaiting_custom_target'
  | 'awaiting_duration'
  | 'awaiting_custom_duration'
  | 'awaiting_penalty'
  | 'awaiting_charity'
  | 'awaiting_hold_months'
  | 'awaiting_amount'
  | 'awaiting_custom_amount'
  | 'awaiting_confirm';

interface ConversationState {
  step: ConversationStep;
  userName?: string;
  appIndex?: number;
  metricIndex?: number;
  target?: number;
  weeks?: number;
  durationLabel?: string;
  penaltyType?: PenaltyType;
  charityChoice?: string;
  holdMonths?: number;
  amount?: number;
  botPromptMessageId?: number;
  startedAt: number;
}

const conversationStore: Map<string, ConversationState> = new Map();
// Key: `${userId}_${chatId}`

// Persistent (in-memory) name cache — once a user tells us their name it's reused everywhere.
// Key: userId (global across chats)
const userNameStore: Map<string, string> = new Map();

function resolveUserName(ctx: CallbackCtx): string {
  const userId = ctx.from?.id?.toString();
  if (userId && userNameStore.has(userId)) {
    return userNameStore.get(userId)!;
  }
  return ctx.from?.username || ctx.from?.first_name || 'Unknown';
}

// Escape special characters for Telegram Markdown (v1) parse mode.
// Characters: _ * ` [
function escMd(text: string): string {
  return text.replace(/([_*`\[])/g, '\\$1');
}

const CONVERSATION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

function cleanStaleConversations(): void {
  const now = Date.now();
  conversationStore.forEach((state, key) => {
    if (now - state.startedAt > CONVERSATION_TIMEOUT_MS) {
      conversationStore.delete(key);
    }
  });
}

function getConvKey(userId: string, chatId: string): string {
  return `${userId}_${chatId}`;
}

function verifyConvOwner(ctx: CallbackCtx, userId: string): boolean {
  return ctx.from?.id?.toString() === userId;
}

function getConvState(userId: string, chatId: string, expectedStep: ConversationStep | ConversationStep[]): ConversationState | null {
  const key = getConvKey(userId, chatId);
  const state = conversationStore.get(key);
  if (!state) return null;
  const steps = Array.isArray(expectedStep) ? expectedStep : [expectedStep];
  if (!steps.includes(state.step)) return null;
  return state;
}

// ============================================================
// CONVERSATION FLOW HANDLERS
// ============================================================

async function startConversation(ctx: CallbackCtx): Promise<void> {
  const userId = ctx.from?.id?.toString();
  const chatId = ctx.chat?.id?.toString();
  if (!userId || !chatId) return;

  const key = getConvKey(userId, chatId);
  const name = resolveUserName(ctx);

  const keyboard = new InlineKeyboard();
  APP_CATALOG.forEach((app, idx) => {
    keyboard.text(`${app.emoji} ${app.name}`, `ga_${userId}_${idx}`);
    if (idx % 2 === 1) keyboard.row();
  });
  if (APP_CATALOG.length % 2 === 1) keyboard.row();
  keyboard.text('❌ Cancel', `gx_${userId}`);

  const sent = await ctx.reply(
    `👋 Hey ${escMd(name)}!\n\n🎯 *Create a Goal*\n\nWhat do you want to improve?`,
    {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
      reply_to_message_id: ctx.message?.message_id,
    }
  );

  conversationStore.set(key, {
    step: 'awaiting_app',
    userName: name,
    botPromptMessageId: sent.message_id,
    startedAt: Date.now(),
  });
}

async function handleConvApp(ctx: CallbackCtx, userId: string, appIdx: number): Promise<void> {
  const chatId = ctx.callbackQuery.message?.chat.id?.toString();
  if (!chatId) return;

  const state = getConvState(userId, chatId, 'awaiting_app');
  if (!state) {
    await ctx.answerCallbackQuery({ text: '⏳ Expired. Use /stakeit to start again.' });
    return;
  }
  if (!verifyConvOwner(ctx, userId)) {
    await ctx.answerCallbackQuery({ text: '❌ This is not your conversation.' });
    return;
  }

  const app = APP_CATALOG[appIdx];
  if (!app) {
    await ctx.answerCallbackQuery({ text: '❌ Invalid selection.' });
    return;
  }

  await ctx.answerCallbackQuery();

  state.appIndex = appIdx;
  state.step = 'awaiting_metric';
  state.startedAt = Date.now();

  const keyboard = new InlineKeyboard();
  app.metrics.forEach((metric, idx) => {
    const zkBadge = metric.reclaimProviderKey ? ' 🔐' : '';
    keyboard.text(`${metric.emoji} ${metric.label}${zkBadge}`, `gm_${userId}_${idx}`).row();
  });
  keyboard.text('⬅️ Back', `gb_${userId}_app`).text('❌ Cancel', `gx_${userId}`);

  try {
    await ctx.editMessageText(
      `${app.emoji} *${app.name}* — ${app.tagline}\n\nWhat's your goal?\n\n🔐 = auto-verified via zkTLS`,
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
  } catch { /* ok */ }

  conversationStore.set(getConvKey(userId, chatId), state);
}

async function handleConvMetric(ctx: CallbackCtx, userId: string, metricIdx: number): Promise<void> {
  const chatId = ctx.callbackQuery.message?.chat.id?.toString();
  if (!chatId) return;

  const state = getConvState(userId, chatId, 'awaiting_metric');
  if (!state || state.appIndex === undefined) {
    await ctx.answerCallbackQuery({ text: '⏳ Expired. Use /stakeit to start again.' });
    return;
  }
  if (!verifyConvOwner(ctx, userId)) {
    await ctx.answerCallbackQuery({ text: '❌ This is not your conversation.' });
    return;
  }

  const app = APP_CATALOG[state.appIndex];
  const metric = app?.metrics[metricIdx];
  if (!app || !metric) {
    await ctx.answerCallbackQuery({ text: '❌ Invalid selection.' });
    return;
  }

  await ctx.answerCallbackQuery();

  state.metricIndex = metricIdx;
  state.step = 'awaiting_target';
  state.startedAt = Date.now();

  const keyboard = new InlineKeyboard();
  metric.presets.forEach((val, idx) => {
    keyboard.text(`${val} ${metric.unit}`, `gt_${userId}_${val}`);
    if (idx % 2 === 1) keyboard.row();
  });
  if (metric.presets.length % 2 === 1) keyboard.row();
  keyboard.text('✏️ Custom', `gt_${userId}_c`).row();
  keyboard.text('⬅️ Back', `gb_${userId}_metric`).text('❌ Cancel', `gx_${userId}`);

  try {
    await ctx.editMessageText(
      `${app.emoji} *${app.name}* > ${metric.emoji} *${metric.label}*\n\n🎯 Set your target:`,
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
  } catch { /* ok */ }

  conversationStore.set(getConvKey(userId, chatId), state);
}

async function handleConvTarget(ctx: CallbackCtx, userId: string, targetStr: string): Promise<void> {
  const chatId = ctx.callbackQuery.message?.chat.id?.toString();
  if (!chatId) return;

  const state = getConvState(userId, chatId, 'awaiting_target');
  if (!state || state.appIndex === undefined || state.metricIndex === undefined) {
    await ctx.answerCallbackQuery({ text: '⏳ Expired. Use /stakeit to start again.' });
    return;
  }
  if (!verifyConvOwner(ctx, userId)) {
    await ctx.answerCallbackQuery({ text: '❌ This is not your conversation.' });
    return;
  }

  await ctx.answerCallbackQuery();

  const app = APP_CATALOG[state.appIndex];
  const metric = app.metrics[state.metricIndex];

  if (targetStr === 'c') {
    // Custom target — ask for text input
    state.step = 'awaiting_custom_target';
    state.startedAt = Date.now();

    try {
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
    } catch { /* ok */ }

    const sent = await bot.api.sendMessage(
      chatId,
      `${app.emoji} ${app.name} > ${metric.emoji} ${metric.label}\n\n✏️ Enter your target (number of ${metric.unit}):`,
      { reply_markup: { force_reply: true, selective: true } }
    );
    state.botPromptMessageId = sent.message_id;
    conversationStore.set(getConvKey(userId, chatId), state);
    return;
  }

  const target = parseInt(targetStr, 10);
  state.target = target;
  state.step = 'awaiting_duration';
  state.startedAt = Date.now();

  await showDurationButtons(ctx, userId, state, app, metric);
  conversationStore.set(getConvKey(userId, chatId), state);
}

async function showDurationButtons(ctx: CallbackCtx, userId: string, state: ConversationState, app: AppDef, metric: MetricDef): Promise<void> {
  const keyboard = new InlineKeyboard()
    .text('3 days', `gd_${userId}_3d`)
    .text('7 days', `gd_${userId}_7d`)
    .row()
    .text('2 weeks', `gd_${userId}_2w`)
    .text('4 weeks', `gd_${userId}_4w`)
    .row()
    .text('1 month', `gd_${userId}_1m`)
    .text('3 months', `gd_${userId}_3m`)
    .row()
    .text('✏️ Custom', `gd_${userId}_c`)
    .row()
    .text('⬅️ Back', `gb_${userId}_target`)
    .text('❌ Cancel', `gx_${userId}`);

  try {
    await ctx.editMessageText(
      `${app.emoji} *${app.name}* > ${metric.emoji} *${metric.label}*\n` +
      `🎯 Target: ${state.target} ${metric.unit}\n\n` +
      `⏱ How long?`,
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
  } catch { /* ok */ }
}

async function handleConvDuration(ctx: CallbackCtx, userId: string, durationCode: string): Promise<void> {
  const chatId = ctx.callbackQuery.message?.chat.id?.toString();
  if (!chatId) return;

  const state = getConvState(userId, chatId, 'awaiting_duration');
  if (!state || state.appIndex === undefined || state.metricIndex === undefined || state.target === undefined) {
    await ctx.answerCallbackQuery({ text: '⏳ Expired. Use /stakeit to start again.' });
    return;
  }
  if (!verifyConvOwner(ctx, userId)) {
    await ctx.answerCallbackQuery({ text: '❌ This is not your conversation.' });
    return;
  }

  const app = APP_CATALOG[state.appIndex];
  const metric = app.metrics[state.metricIndex];

  // Handle custom duration
  if (durationCode === 'c') {
    state.step = 'awaiting_custom_duration';
    state.startedAt = Date.now();

    try {
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
    } catch { /* ok */ }

    await ctx.answerCallbackQuery();

    const sent = await bot.api.sendMessage(
      chatId,
      `${app.emoji} ${app.name} > ${metric.emoji} ${metric.label}\n🎯 ${state.target} ${metric.unit}\n\n✏️ Enter custom duration (e.g. 30d, 6w, 2mon):`,
      { reply_markup: { force_reply: true, selective: true } }
    );
    state.botPromptMessageId = sent.message_id;
    conversationStore.set(getConvKey(userId, chatId), state);
    return;
  }

  // Map button codes to parseDuration-compatible strings
  const codeMap: Record<string, string> = {
    '3d': '3d', '7d': '7d',
    '2w': '2w', '4w': '4w',
    '1m': '1mon', '3m': '3mon',
  };
  const durationInput = codeMap[durationCode] || durationCode;
  const parsed = parseDuration(durationInput);
  if (!parsed) {
    await ctx.answerCallbackQuery({ text: '❌ Invalid duration.' });
    return;
  }

  await ctx.answerCallbackQuery();

  state.weeks = parsed.weeks;
  state.durationLabel = parsed.label;
  state.step = 'awaiting_penalty';
  state.startedAt = Date.now();

  await showPenaltyButtons(ctx, userId, state, app, metric);
  conversationStore.set(getConvKey(userId, chatId), state);
}

const PENALTY_OPTIONS: { code: string; label: string; emoji: string; type: PenaltyType }[] = [
  { code: 'f', label: 'Donate to StakeIt', emoji: '🔥', type: 'forfeited' },
  { code: 'd', label: 'Freeze & Restake', emoji: '🧊', type: 'delayed_refund' },
  { code: 's', label: 'Split to Group', emoji: '👥', type: 'split_to_group' },
  { code: 'c', label: 'Charity Donation', emoji: '💝', type: 'charity_donation' },
];

const CHARITY_OPTIONS: { code: string; name: string; emoji: string }[] = [
  { code: 'msf', name: 'Doctors Without Borders', emoji: '🏥' },
  { code: 'wwf', name: 'WWF (World Wildlife Fund)', emoji: '🐼' },
  { code: 'wiki', name: 'Wikipedia Foundation', emoji: '📚' },
  { code: 'kiva', name: 'Kiva (Microloans)', emoji: '🤝' },
  { code: 'trees', name: 'One Tree Planted', emoji: '🌳' },
];

async function showPenaltyButtons(ctx: CallbackCtx, userId: string, state: ConversationState, app: AppDef, metric: MetricDef): Promise<void> {
  const keyboard = new InlineKeyboard()
    .text('🔥 Donate to StakeIt', `gp_${userId}_f`)
    .text('🧊 Freeze & Restake', `gp_${userId}_d`)
    .row()
    .text('👥 Split to Group', `gp_${userId}_s`)
    .text('💝 Charity Donation', `gp_${userId}_c`)
    .row()
    .text('⬅️ Back', `gb_${userId}_duration`)
    .text('❌ Cancel', `gx_${userId}`);

  try {
    await ctx.editMessageText(
      `${app.emoji} *${app.name}* > ${metric.emoji} *${metric.label}*\n` +
      `🎯 Target: ${state.target} ${metric.unit}\n` +
      `⏱ Duration: ${state.durationLabel || `${state.weeks} week${state.weeks! > 1 ? 's' : ''}`}\n\n` +
      `⚖️ What happens if you fail?`,
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
  } catch { /* ok */ }
}

async function handleConvPenalty(ctx: CallbackCtx, userId: string, penaltyCode: string): Promise<void> {
  const chatId = ctx.callbackQuery.message?.chat.id?.toString();
  if (!chatId) return;

  const state = getConvState(userId, chatId, 'awaiting_penalty');
  if (!state || state.appIndex === undefined || state.metricIndex === undefined || state.target === undefined || state.weeks === undefined) {
    await ctx.answerCallbackQuery({ text: '⏳ Expired. Use /stakeit to start again.' });
    return;
  }
  if (!verifyConvOwner(ctx, userId)) {
    await ctx.answerCallbackQuery({ text: '❌ This is not your conversation.' });
    return;
  }

  const option = PENALTY_OPTIONS.find(o => o.code === penaltyCode);
  if (!option) {
    await ctx.answerCallbackQuery({ text: '❌ Invalid selection.' });
    return;
  }

  await ctx.answerCallbackQuery();

  state.penaltyType = option.type;
  state.startedAt = Date.now();

  const app = APP_CATALOG[state.appIndex];
  const metric = app.metrics[state.metricIndex];

  // Charity → show charity selection
  if (option.type === 'charity_donation') {
    state.step = 'awaiting_charity';
    const keyboard = new InlineKeyboard();
    CHARITY_OPTIONS.forEach((ch, idx) => {
      keyboard.text(`${ch.emoji} ${ch.name}`, `gch_${userId}_${ch.code}`);
      if (idx % 1 === 0) keyboard.row(); // one per row (names are long)
    });
    keyboard.text('⬅️ Back', `gb_${userId}_penalty`).text('❌ Cancel', `gx_${userId}`);

    try {
      await ctx.editMessageText(
        `${app.emoji} *${app.name}* > ${metric.emoji} *${metric.label}*\n` +
        `🎯 Target: ${state.target} ${metric.unit}\n` +
        `⏱ Duration: ${state.durationLabel || `${state.weeks} week${state.weeks! > 1 ? 's' : ''}`}\n` +
        `⚖️ Penalty: ${option.emoji} ${option.label}\n\n` +
        `💝 Which charity should receive your stake if you fail?`,
        { parse_mode: 'Markdown', reply_markup: keyboard }
      );
    } catch { /* ok */ }

    conversationStore.set(getConvKey(userId, chatId), state);
    return;
  }

  // Freeze & Restake → show hold months selection
  if (option.type === 'delayed_refund') {
    state.step = 'awaiting_hold_months';
    const keyboard = new InlineKeyboard()
      .text('1 month', `ghm_${userId}_1`)
      .text('2 months', `ghm_${userId}_2`)
      .text('3 months', `ghm_${userId}_3`)
      .row()
      .text('6 months', `ghm_${userId}_6`)
      .text('9 months', `ghm_${userId}_9`)
      .text('12 months', `ghm_${userId}_12`)
      .row()
      .text('⬅️ Back', `gb_${userId}_penalty`)
      .text('❌ Cancel', `gx_${userId}`);

    try {
      await ctx.editMessageText(
        `${app.emoji} *${app.name}* > ${metric.emoji} *${metric.label}*\n` +
        `🎯 Target: ${state.target} ${metric.unit}\n` +
        `⏱ Duration: ${state.durationLabel || `${state.weeks} week${state.weeks! > 1 ? 's' : ''}`}\n` +
        `⚖️ Penalty: ${option.emoji} ${option.label}\n\n` +
        `🧊 How long should StakeIt freeze your money before restaking it?\n` +
        `_You have zero access during this period. After the freeze, the money is automatically staked on your next goal._`,
        { parse_mode: 'Markdown', reply_markup: keyboard }
      );
    } catch { /* ok */ }

    conversationStore.set(getConvKey(userId, chatId), state);
    return;
  }

  // All other penalties → go straight to amount
  state.step = 'awaiting_amount';
  await showAmountButtons(ctx, userId, state, app, metric, option);
  conversationStore.set(getConvKey(userId, chatId), state);
}

async function showAmountButtons(ctx: CallbackCtx, userId: string, state: ConversationState, app: AppDef, metric: MetricDef, option?: { emoji: string; label: string }): Promise<void> {
  const penaltyLabel = option ? `${option.emoji} ${option.label}` : getPenaltyLabel(state.penaltyType);
  const charityLine = state.charityChoice ? `\n💝 Charity: ${escMd(state.charityChoice)}` : '';
  const holdLine = state.holdMonths ? `\n🧊 Freeze period: ${state.holdMonths} month${state.holdMonths > 1 ? 's' : ''}` : '';

  const keyboard = new InlineKeyboard()
    .text('฿100', `gk_${userId}_100`)
    .text('฿500', `gk_${userId}_500`)
    .row()
    .text('฿1,000', `gk_${userId}_1000`)
    .text('฿2,000', `gk_${userId}_2000`)
    .row()
    .text('✏️ Custom', `gk_${userId}_c`)
    .row()
  // Back target depends on penalty sub-step
  const backTarget = state.charityChoice ? 'charity' : state.holdMonths ? 'holdmonths' : 'penalty';
    keyboard
    .text('⬅️ Back', `gb_${userId}_${backTarget}`)
    .text('❌ Cancel', `gx_${userId}`);

  try {
    await ctx.editMessageText(
      `${app.emoji} *${app.name}* > ${metric.emoji} *${metric.label}*\n` +
      `🎯 Target: ${state.target} ${metric.unit}\n` +
      `⏱ Duration: ${state.durationLabel || `${state.weeks} week${state.weeks! > 1 ? 's' : ''}`}\n` +
      `⚖️ Penalty: ${penaltyLabel}` +
      charityLine + holdLine + `\n\n` +
      `💰 How much do you want to stake?`,
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
  } catch { /* ok */ }
}

async function handleConvCharity(ctx: CallbackCtx, userId: string, charityCode: string): Promise<void> {
  const chatId = ctx.callbackQuery.message?.chat.id?.toString();
  if (!chatId) return;

  const state = getConvState(userId, chatId, 'awaiting_charity');
  if (!state || state.appIndex === undefined || state.metricIndex === undefined || state.target === undefined || state.weeks === undefined) {
    await ctx.answerCallbackQuery({ text: '⏳ Expired. Use /stakeit to start again.' });
    return;
  }
  if (!verifyConvOwner(ctx, userId)) {
    await ctx.answerCallbackQuery({ text: '❌ This is not your conversation.' });
    return;
  }

  const charity = CHARITY_OPTIONS.find(c => c.code === charityCode);
  if (!charity) {
    await ctx.answerCallbackQuery({ text: '❌ Invalid selection.' });
    return;
  }

  await ctx.answerCallbackQuery();

  state.charityChoice = charity.name;
  state.step = 'awaiting_amount';
  state.startedAt = Date.now();

  const app = APP_CATALOG[state.appIndex];
  const metric = app.metrics[state.metricIndex];

  await showAmountButtons(ctx, userId, state, app, metric);
  conversationStore.set(getConvKey(userId, chatId), state);
}

async function handleConvHoldMonths(ctx: CallbackCtx, userId: string, months: number): Promise<void> {
  const chatId = ctx.callbackQuery.message?.chat.id?.toString();
  if (!chatId) return;

  const state = getConvState(userId, chatId, 'awaiting_hold_months');
  if (!state || state.appIndex === undefined || state.metricIndex === undefined || state.target === undefined || state.weeks === undefined) {
    await ctx.answerCallbackQuery({ text: '⏳ Expired. Use /stakeit to start again.' });
    return;
  }
  if (!verifyConvOwner(ctx, userId)) {
    await ctx.answerCallbackQuery({ text: '❌ This is not your conversation.' });
    return;
  }

  await ctx.answerCallbackQuery();

  state.holdMonths = months;
  state.step = 'awaiting_amount';
  state.startedAt = Date.now();

  const app = APP_CATALOG[state.appIndex];
  const metric = app.metrics[state.metricIndex];

  await showAmountButtons(ctx, userId, state, app, metric);
  conversationStore.set(getConvKey(userId, chatId), state);
}

async function handleConvStake(ctx: CallbackCtx, userId: string, amountStr: string): Promise<void> {
  const chatId = ctx.callbackQuery.message?.chat.id?.toString();
  if (!chatId) return;

  const state = getConvState(userId, chatId, 'awaiting_amount');
  if (!state || state.appIndex === undefined || state.metricIndex === undefined) {
    await ctx.answerCallbackQuery({ text: '⏳ Expired. Use /stakeit to start again.' });
    return;
  }
  if (!verifyConvOwner(ctx, userId)) {
    await ctx.answerCallbackQuery({ text: '❌ This is not your conversation.' });
    return;
  }

  await ctx.answerCallbackQuery();

  const app = APP_CATALOG[state.appIndex];
  const metric = app.metrics[state.metricIndex];

  if (amountStr === 'c') {
    state.step = 'awaiting_custom_amount';
    state.startedAt = Date.now();

    try {
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
    } catch { /* ok */ }

    const sent = await bot.api.sendMessage(
      chatId,
      `${app.emoji} ${app.name} > ${metric.emoji} ${metric.label}\n🎯 ${state.target} ${metric.unit} × ${state.durationLabel || `${state.weeks} week${state.weeks! > 1 ? 's' : ''}`}\n\n💰 Enter your custom stake amount in ฿:`,
      { reply_markup: { force_reply: true, selective: true } }
    );
    state.botPromptMessageId = sent.message_id;
    conversationStore.set(getConvKey(userId, chatId), state);
    return;
  }

  const amount = parseInt(amountStr, 10);
  state.amount = amount;
  state.step = 'awaiting_confirm';
  state.startedAt = Date.now();

  await showConfirmation(ctx, userId, state, app, metric);
  conversationStore.set(getConvKey(userId, chatId), state);
}

function getPenaltyLabel(penaltyType?: PenaltyType): string {
  const option = PENALTY_OPTIONS.find(o => o.type === penaltyType);
  return option ? `${option.emoji} ${option.label}` : '🔥 Donate to StakeIt';
}

async function showConfirmation(ctx: CallbackCtx, userId: string, state: ConversationState, app: AppDef, metric: MetricDef): Promise<void> {
  const zkBadge = metric.reclaimProviderKey
    ? '\n🔐 Verification: *zkTLS (automatic)*'
    : '\n📋 Verification: *Manual (photos + friend voting)*';

  const goalName = buildGoalName(app, metric, state.target!);
  const penaltyLabel = getPenaltyLabel(state.penaltyType);

  const keyboard = new InlineKeyboard()
    .text('✅ Create Goal', `gc_${userId}`)
    .text('❌ Cancel', `gx_${userId}`);

  try {
    await ctx.editMessageText(
      `📋 *Confirm your goal:*\n\n` +
      `${app.emoji} App: *${app.name}*\n` +
      `${metric.emoji} Goal: *${metric.label}*\n` +
      `🎯 Target: *${state.target} ${metric.unit}*\n` +
      `⏱ Duration: *${state.durationLabel || `${state.weeks} week${state.weeks! > 1 ? 's' : ''}`}*\n` +
      `⚖️ Penalty: *${penaltyLabel}*` +
      (state.charityChoice ? `\n💝 Charity: *${escMd(state.charityChoice)}*` : '') +
      (state.holdMonths ? `\n🧊 Freeze: *${state.holdMonths} month${state.holdMonths > 1 ? 's' : ''}*` : '') +
      `\n💰 Stake: *฿${state.amount!.toLocaleString()}*` +
      zkBadge + `\n\n` +
      `Goal name: "${escMd(goalName)}"\n\n` +
      `Ready to create?`,
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
  } catch { /* ok */ }
}

async function handleConvConfirm(ctx: CallbackCtx, userId: string): Promise<void> {
  const chatId = ctx.callbackQuery.message?.chat.id?.toString();
  if (!chatId) return;

  const key = getConvKey(userId, chatId);
  const state = conversationStore.get(key);

  if (!state || state.step !== 'awaiting_confirm' ||
      state.appIndex === undefined || state.metricIndex === undefined ||
      !state.target || !state.amount || !state.weeks) {
    await ctx.answerCallbackQuery({ text: '⏳ Expired. Use /stakeit to start again.' });
    return;
  }
  if (!verifyConvOwner(ctx, userId)) {
    await ctx.answerCallbackQuery({ text: '❌ This is not your conversation.' });
    return;
  }

  await ctx.answerCallbackQuery({ text: 'Creating your goal...' });
  conversationStore.delete(key);

  const app = APP_CATALOG[state.appIndex];
  const metric = app.metrics[state.metricIndex];
  const goalName = buildGoalName(app, metric, state.target);
  const userName = state.userName || resolveUserName(ctx);
  const chatTitle = ctx.callbackQuery.message?.chat.title;

  try {
    const result = await createGoalWithLimitCheck(
      goalName, state.amount, state.weeks,
      userId, userName, chatId, chatTitle,
      state.target, state.penaltyType
    );

    if ('error' in result) {
      try {
        await ctx.editMessageText(`❌ ${result.error}`);
      } catch { /* ok */ }
      return;
    }

    const zkProvider = findProviderForGoal(goalName);
    const zkNotice = zkProvider
      ? `\n\n🔐 *Auto-Verification Enabled*\nUse /verify to prove completion via ${escMd(zkProvider.name)}`
      : `\n\n📋 *Manual Verification*\nSend photos or wait for weekly voting`;

    try {
      await ctx.editMessageText(
        `🎯 *Goal Created!*\n\n` +
        `${app.emoji} ${metric.emoji} ${escMd(goalName)}\n` +
        `💰 Stake: ฿${state.amount.toLocaleString()}\n` +
        `⏱ Duration: ${escMd(state.durationLabel || `${state.weeks} weeks`)}\n` +
        `By: ${escMd(userName)}` +
        zkNotice + `\n\n` +
        `📱 Scan to pay and activate:`,
        { parse_mode: 'Markdown' }
      );
    } catch { /* ok */ }

    if (result.qrCodeUrl) {
      await sendQrCode(chatId, result.qrCodeUrl, result.goal.id);
    }
  } catch (error) {
    console.error('Error in conversational goal creation:', error);
    try {
      await ctx.editMessageText('❌ Failed to create goal. Please try again.');
    } catch { /* ok */ }
  }
}

async function handleConvBack(ctx: CallbackCtx, userId: string, target: string): Promise<void> {
  const chatId = ctx.callbackQuery.message?.chat.id?.toString();
  if (!chatId) return;

  const key = getConvKey(userId, chatId);
  const state = conversationStore.get(key);
  if (!state) {
    await ctx.answerCallbackQuery({ text: '⏳ Expired. Use /stakeit to start again.' });
    return;
  }
  if (!verifyConvOwner(ctx, userId)) {
    await ctx.answerCallbackQuery({ text: '❌ This is not your conversation.' });
    return;
  }

  await ctx.answerCallbackQuery();

  if (target === 'app') {
    // Back to app selection
    state.step = 'awaiting_app';
    state.appIndex = undefined;
    state.metricIndex = undefined;
    state.target = undefined;
    state.startedAt = Date.now();

    const keyboard = new InlineKeyboard();
    APP_CATALOG.forEach((app, idx) => {
      keyboard.text(`${app.emoji} ${app.name}`, `ga_${userId}_${idx}`);
      if (idx % 2 === 1) keyboard.row();
    });
    if (APP_CATALOG.length % 2 === 1) keyboard.row();
    keyboard.text('❌ Cancel', `gx_${userId}`);

    try {
      await ctx.editMessageText(
        `🎯 *Create a Goal*\n\nWhat do you want to improve?`,
        { parse_mode: 'Markdown', reply_markup: keyboard }
      );
    } catch { /* ok */ }
  } else if (target === 'metric' && state.appIndex !== undefined) {
    // Back to metric selection
    state.step = 'awaiting_metric';
    state.metricIndex = undefined;
    state.target = undefined;
    state.startedAt = Date.now();

    const app = APP_CATALOG[state.appIndex];
    const keyboard = new InlineKeyboard();
    app.metrics.forEach((metric, idx) => {
      const zkBadge = metric.reclaimProviderKey ? ' 🔐' : '';
      keyboard.text(`${metric.emoji} ${metric.label}${zkBadge}`, `gm_${userId}_${idx}`).row();
    });
    keyboard.text('⬅️ Back', `gb_${userId}_app`).text('❌ Cancel', `gx_${userId}`);

    try {
      await ctx.editMessageText(
        `${app.emoji} *${app.name}* — ${app.tagline}\n\nWhat's your goal?\n\n🔐 = auto-verified via zkTLS`,
        { parse_mode: 'Markdown', reply_markup: keyboard }
      );
    } catch { /* ok */ }
  } else if (target === 'target' && state.appIndex !== undefined && state.metricIndex !== undefined) {
    // Back to target selection
    state.step = 'awaiting_target';
    state.target = undefined;
    state.startedAt = Date.now();

    const app = APP_CATALOG[state.appIndex];
    const metric = app.metrics[state.metricIndex];

    const keyboard = new InlineKeyboard();
    metric.presets.forEach((val, idx) => {
      keyboard.text(`${val} ${metric.unit}`, `gt_${userId}_${val}`);
      if (idx % 2 === 1) keyboard.row();
    });
    if (metric.presets.length % 2 === 1) keyboard.row();
    keyboard.text('✏️ Custom', `gt_${userId}_c`).row();
    keyboard.text('⬅️ Back', `gb_${userId}_metric`).text('❌ Cancel', `gx_${userId}`);

    try {
      await ctx.editMessageText(
        `${app.emoji} *${app.name}* > ${metric.emoji} *${metric.label}*\n\n🎯 Set your target:`,
        { parse_mode: 'Markdown', reply_markup: keyboard }
      );
    } catch { /* ok */ }
  } else if (target === 'duration' && state.appIndex !== undefined && state.metricIndex !== undefined) {
    // Back to duration selection
    state.step = 'awaiting_duration';
    state.weeks = undefined;
    state.durationLabel = undefined;
    state.startedAt = Date.now();

    const app = APP_CATALOG[state.appIndex];
    const metric = app.metrics[state.metricIndex];

    await showDurationButtons(ctx, userId, state, app, metric);
  } else if (target === 'penalty' && state.appIndex !== undefined && state.metricIndex !== undefined) {
    // Back to penalty selection
    state.step = 'awaiting_penalty';
    state.penaltyType = undefined;
    state.charityChoice = undefined;
    state.holdMonths = undefined;
    state.startedAt = Date.now();

    const app = APP_CATALOG[state.appIndex];
    const metric = app.metrics[state.metricIndex];

    await showPenaltyButtons(ctx, userId, state, app, metric);
  } else if (target === 'charity' && state.appIndex !== undefined && state.metricIndex !== undefined) {
    // Back to charity selection
    state.step = 'awaiting_charity';
    state.charityChoice = undefined;
    state.startedAt = Date.now();

    const app = APP_CATALOG[state.appIndex];
    const metric = app.metrics[state.metricIndex];
    const option = PENALTY_OPTIONS.find(o => o.type === state.penaltyType);

    const keyboard = new InlineKeyboard();
    CHARITY_OPTIONS.forEach((ch) => {
      keyboard.text(`${ch.emoji} ${ch.name}`, `gch_${userId}_${ch.code}`).row();
    });
    keyboard.text('⬅️ Back', `gb_${userId}_penalty`).text('❌ Cancel', `gx_${userId}`);

    try {
      await ctx.editMessageText(
        `${app.emoji} *${app.name}* > ${metric.emoji} *${metric.label}*\n` +
        `🎯 Target: ${state.target} ${metric.unit}\n` +
        `⏱ Duration: ${state.durationLabel || `${state.weeks} week${state.weeks! > 1 ? 's' : ''}`}\n` +
        `⚖️ Penalty: ${option?.emoji || '💝'} ${option?.label || 'Charity Donation'}\n\n` +
        `💝 Which charity should receive your stake if you fail?`,
        { parse_mode: 'Markdown', reply_markup: keyboard }
      );
    } catch { /* ok */ }
  } else if (target === 'holdmonths' && state.appIndex !== undefined && state.metricIndex !== undefined) {
    // Back to hold months selection
    state.step = 'awaiting_hold_months';
    state.holdMonths = undefined;
    state.startedAt = Date.now();

    const app = APP_CATALOG[state.appIndex];
    const metric = app.metrics[state.metricIndex];
    const option = PENALTY_OPTIONS.find(o => o.type === state.penaltyType);

    const keyboard = new InlineKeyboard()
      .text('1 month', `ghm_${userId}_1`)
      .text('2 months', `ghm_${userId}_2`)
      .text('3 months', `ghm_${userId}_3`)
      .row()
      .text('6 months', `ghm_${userId}_6`)
      .text('9 months', `ghm_${userId}_9`)
      .text('12 months', `ghm_${userId}_12`)
      .row()
      .text('⬅️ Back', `gb_${userId}_penalty`)
      .text('❌ Cancel', `gx_${userId}`);

    try {
      await ctx.editMessageText(
        `${app.emoji} *${app.name}* > ${metric.emoji} *${metric.label}*\n` +
        `🎯 Target: ${state.target} ${metric.unit}\n` +
        `⏱ Duration: ${state.durationLabel || `${state.weeks} week${state.weeks! > 1 ? 's' : ''}`}\n` +
        `⚖️ Penalty: ${option?.emoji || '🧊'} ${option?.label || 'Freeze & Restake'}\n\n` +
        `🧊 How long should StakeIt freeze your money before restaking it?\n` +
        `_You will have zero access during this period._`,
        { parse_mode: 'Markdown', reply_markup: keyboard }
      );
    } catch { /* ok */ }
  }

  conversationStore.set(key, state);
}

async function handleConvCancel(ctx: CallbackCtx, userId: string): Promise<void> {
  const chatId = ctx.callbackQuery.message?.chat.id?.toString();
  if (!chatId) return;

  if (!verifyConvOwner(ctx, userId)) {
    await ctx.answerCallbackQuery({ text: '❌ This is not your conversation.' });
    return;
  }

  conversationStore.delete(getConvKey(userId, chatId));
  await ctx.answerCallbackQuery({ text: 'Cancelled' });

  try {
    await ctx.editMessageText('❌ Goal creation cancelled.');
  } catch { /* ok */ }
}

async function handleConversationReply(
  ctx: CallbackCtx,
  key: string,
  state: ConversationState,
  text: string
): Promise<void> {
  const userId = ctx.from?.id?.toString();
  const chatId = ctx.chat?.id?.toString();
  if (!userId || !chatId) return;

  // Handle name input (from /start)
  if (state.step === 'awaiting_name') {
    const name = text.trim();
    if (!name) {
      await ctx.reply('❌ Please enter a name.');
      return;
    }

    if (userId) userNameStore.set(userId, name);
    conversationStore.delete(key);

    await ctx.reply(
      `👋 Hey ${name}! Welcome to StakeIt.\n\n` +
      `Commands:\n` +
      `/stakeit - Create a goal (guided step-by-step)\n` +
      `/name - Change your display name\n` +
      `/status - Your active goals\n` +
      `/clear - Delete all your goals in this group\n` +
      `/help - All commands`
    );
    return;
  }

  if (state.appIndex === undefined || state.metricIndex === undefined) return;

  const app = APP_CATALOG[state.appIndex];
  const metric = app.metrics[state.metricIndex];

  if (state.step === 'awaiting_custom_target') {
    const target = parseInt(text.trim(), 10);
    if (isNaN(target) || target <= 0 || target > 1000000) {
      await ctx.reply(`❌ Please enter a valid number for ${metric.unit}.`);
      return;
    }

    state.target = target;
    state.step = 'awaiting_duration';
    state.startedAt = Date.now();

    const keyboard = new InlineKeyboard()
      .text('3 days', `gd_${userId}_3d`)
      .text('7 days', `gd_${userId}_7d`)
      .row()
      .text('2 weeks', `gd_${userId}_2w`)
      .text('4 weeks', `gd_${userId}_4w`)
      .row()
      .text('1 month', `gd_${userId}_1m`)
      .text('3 months', `gd_${userId}_3m`)
      .row()
      .text('✏️ Custom', `gd_${userId}_c`)
      .row()
      .text('⬅️ Back', `gb_${userId}_target`)
      .text('❌ Cancel', `gx_${userId}`);

    const sent = await ctx.reply(
      `${app.emoji} *${app.name}* > ${metric.emoji} *${metric.label}*\n` +
      `🎯 Target: ${target} ${metric.unit}\n\n` +
      `⏱ How long?`,
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
    state.botPromptMessageId = sent.message_id;
    conversationStore.set(key, state);
    return;
  }

  if (state.step === 'awaiting_custom_duration') {
    const parsed = parseDuration(text.trim());
    if (!parsed) {
      await ctx.reply('❌ Invalid duration. Use formats like: 30d, 6w, 2mon');
      return;
    }

    state.weeks = parsed.weeks;
    state.durationLabel = parsed.label;
    state.step = 'awaiting_penalty';
    state.startedAt = Date.now();

    const penaltyKeyboard = new InlineKeyboard()
      .text('🔥 Donate to StakeIt', `gp_${userId}_f`)
      .text('🧊 Freeze & Restake', `gp_${userId}_d`)
      .row()
      .text('👥 Split to Group', `gp_${userId}_s`)
      .text('💝 Charity Donation', `gp_${userId}_c`)
      .row()
      .text('⬅️ Back', `gb_${userId}_duration`)
      .text('❌ Cancel', `gx_${userId}`);

    const sent = await ctx.reply(
      `${app.emoji} *${app.name}* > ${metric.emoji} *${metric.label}*\n` +
      `🎯 Target: ${state.target} ${metric.unit}\n` +
      `⏱ Duration: ${parsed.label}\n\n` +
      `⚖️ What happens if you fail?`,
      { parse_mode: 'Markdown', reply_markup: penaltyKeyboard }
    );
    state.botPromptMessageId = sent.message_id;
    conversationStore.set(key, state);
    return;
  }

  if (state.step === 'awaiting_custom_amount') {
    const amount = parseInt(text.trim(), 10);
    if (isNaN(amount) || amount <= 0 || amount > 100000) {
      await ctx.reply('❌ Please enter a valid amount between 1 and 100,000.');
      return;
    }

    state.amount = amount;
    state.step = 'awaiting_confirm';
    state.startedAt = Date.now();

    const goalName = buildGoalName(app, metric, state.target!);
    const zkBadge = metric.reclaimProviderKey
      ? '\n🔐 Verification: *zkTLS (automatic)*'
      : '\n📋 Verification: *Manual (photos + friend voting)*';
    const penaltyLabel = getPenaltyLabel(state.penaltyType);

    const keyboard = new InlineKeyboard()
      .text('✅ Create Goal', `gc_${userId}`)
      .text('❌ Cancel', `gx_${userId}`);

    const sent = await ctx.reply(
      `📋 *Confirm your goal:*\n\n` +
      `${app.emoji} App: *${app.name}*\n` +
      `${metric.emoji} Goal: *${metric.label}*\n` +
      `🎯 Target: *${state.target} ${metric.unit}*\n` +
      `⏱ Duration: *${state.durationLabel || `${state.weeks} week${state.weeks! > 1 ? 's' : ''}`}*\n` +
      `⚖️ Penalty: *${penaltyLabel}*` +
      (state.charityChoice ? `\n💝 Charity: *${escMd(state.charityChoice)}*` : '') +
      (state.holdMonths ? `\n🧊 Freeze: *${state.holdMonths} month${state.holdMonths > 1 ? 's' : ''}*` : '') +
      `\n💰 Stake: *฿${amount.toLocaleString()}*` +
      zkBadge + `\n\n` +
      `Goal name: "${escMd(goalName)}"\n\n` +
      `Ready to create?`,
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
    state.botPromptMessageId = sent.message_id;
    conversationStore.set(key, state);
    return;
  }
}

// Omise QR URLs require auth and return SVG (Telegram can't display SVGs as photos).
// Download the SVG and send as a document so the user can open it.
async function sendQrCode(
  chatId: string | number,
  qrCodeUrl: string,
  goalId: string
): Promise<void> {
  const goalPageUrl = `${BASE_URL}/goals/${goalId}`;

  try {
    const res = await fetch(qrCodeUrl, {
      headers: {
        'Authorization': `Basic ${Buffer.from(process.env.OMISE_SECRET_KEY + ':').toString('base64')}`,
      },
    });

    if (!res.ok) throw new Error(`Failed to fetch QR: ${res.status}`);

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await bot.api.sendDocument(chatId, new InputFile(buffer, 'promptpay-qr.svg'), {
      caption: `📱 Open this QR file with your phone to pay via PromptPay.\n\nOr view it on the web:\n${goalPageUrl}`,
    });
  } catch (error) {
    // Fallback: just send the web link
    console.error('Error sending QR document:', error);
    await bot.api.sendMessage(
      chatId,
      `📱 View and scan your PromptPay QR code here:\n${goalPageUrl}`
    );
  }
}

// ============================================================
// COMMAND PARSER
// ============================================================

// ============================================================
// DURATION PARSER (supports days, weeks, months)
// ============================================================

interface ParsedDuration {
  weeks: number;
  label: string;
}

/**
 * Parse a duration string like "4", "4w", "30d", "2mon".
 * Bare number defaults to weeks for backward compatibility.
 *
 *  d / day / days       → ceil(value / 7) weeks
 *  w / week / weeks     → value weeks  (default)
 *  mon / month / months → value × 4 weeks
 */
function parseDuration(input: string): ParsedDuration | null {
  const match = input.match(/^(\d+)\s*(d|day|days|w|week|weeks|mon|month|months)?$/i);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  if (value <= 0) return null;

  const unit = (match[2] || 'w').toLowerCase();

  if (unit === 'd' || unit === 'day' || unit === 'days') {
    if (value > 365) return null;
    return { weeks: Math.max(1, Math.ceil(value / 7)), label: `${value} day${value !== 1 ? 's' : ''}` };
  }
  if (unit === 'w' || unit === 'week' || unit === 'weeks') {
    if (value > 52) return null;
    return { weeks: value, label: `${value} week${value !== 1 ? 's' : ''}` };
  }
  if (unit === 'mon' || unit === 'month' || unit === 'months') {
    if (value > 12) return null;
    return { weeks: value * 4, label: `${value} month${value !== 1 ? 's' : ''}` };
  }

  return null;
}

// ============================================================
// ONE-LINER COMMAND PARSERS
// ============================================================

interface ParsedCommit {
  goalName: string;
  amount: number;
  weeks: number;
  durationLabel: string;
}

function parseStakeItCommand(text: string): ParsedCommit | null {
  const match = text.match(/^\/stakeit\s+(?:"([^"]+)"|(\S+))\s+(\d+)\s+(\S+)$/);
  if (!match) return null;

  const goalName = match[1] || match[2];
  const amount = parseInt(match[3], 10);
  const duration = parseDuration(match[4]);

  if (amount <= 0 || !duration) return null;

  return { goalName, amount, weeks: duration.weeks, durationLabel: duration.label };
}

function parseStakeCommand(text: string): ParsedCommit | null {
  const match = text.match(/^\/stake\s+(?:"([^"]+)"|(\S+))\s+(\d+)\s+(\S+)$/);
  if (!match) return null;

  const goalName = match[1] || match[2];
  const amount = parseInt(match[3], 10);
  const duration = parseDuration(match[4]);

  if (amount <= 0 || !duration) return null;

  return { goalName, amount, weeks: duration.weeks, durationLabel: duration.label };
}

function parseStakeReplyCommand(text: string): { amount: number; weeks: number; durationLabel: string } | null {
  const match = text.match(/^\/stake\s+(\d+)\s+(\S+)$/);
  if (!match) return null;

  const amount = parseInt(match[1], 10);
  const duration = parseDuration(match[2]);

  if (amount <= 0 || !duration) return null;

  return { amount, weeks: duration.weeks, durationLabel: duration.label };
}

// ============================================================
// HELPER: Create goal with 3-goal limit check
// ============================================================

async function createGoalWithLimitCheck(
  goalName: string,
  amount: number,
  weeks: number,
  userId: string,
  userName: string,
  chatId: string,
  chatTitle: string | undefined,
  thresholdOverride?: number,
  penaltyType?: PenaltyType
): Promise<{ goal: Goal; qrCodeUrl: string } | { error: string }> {
  const zkProvider = findProviderForGoal(goalName);

  const goal = await createGoal({
    goalName,
    stakeAmountThb: amount,
    durationWeeks: weeks,
    platform: 'telegram',
    groupId: chatId,
    groupName: chatTitle,
    userId,
    userName,
    penaltyType,
    verificationType: zkProvider ? 'zktls' : 'manual',
    reclaimProviderId: zkProvider?.id || null,
    reclaimProviderName: zkProvider?.name || null,
    zkThresholdValue: thresholdOverride ?? zkProvider?.defaultThreshold ?? null,
    zkThresholdType: 'minimum',
  });

  const charge = await createPromptPayCharge(
    amount,
    goal.id,
    userId,
    `StakeIt: ${goalName}`
  );

  await createPayment(goal.id, amount, charge.qrCodeUrl, charge.chargeId);

  return { goal, qrCodeUrl: charge.qrCodeUrl };
}

// ============================================================
// PROMISE DETECTION PATTERNS
// ============================================================

const PROMISE_PATTERNS = [
  /\bi will\b/i,
  /\bi promise\b/i,
  /\bi'm going to\b/i,
  /\bi commit to\b/i,
  /\bi'll\b/i,
  /\bi swear\b/i,
  /\bguarantee\b/i,
];

function isPromiseMessage(text: string): boolean {
  return PROMISE_PATTERNS.some(pattern => pattern.test(text));
}

// ============================================================
// COMMANDS
// ============================================================

bot.command('start', async (ctx) => {
  const userId = ctx.from?.id?.toString();
  const existingName = userId ? userNameStore.get(userId) : undefined;

  const intro =
    `🎯 *StakeIt — Put Your Money Where Your Mouth Is*\n\n` +
    `StakeIt is a commitment contract bot. You set a real goal, stake real money, ` +
    `and your progress is verified automatically or by friends in this group.\n\n` +
    `*How it works:*\n` +
    `1. Use /stakeit to create a goal — pick an app, a metric, a target, and a deadline\n` +
    `2. Choose what happens if you fail (donate to StakeIt, freeze & restake, split to group, or charity)\n` +
    `3. Stake money via PromptPay — the money is locked until your goal is done\n` +
    `4. Each week your progress is verified (automatically via zkTLS or by group vote)\n` +
    `5. Hit your target? Money comes back. Fail? The penalty kicks in\n\n` +
    `*Supported apps:*\n` +
    `🦉 Duolingo · 💻 GitHub · 🧠 LeetCode · 🏃 Strava · 🧘 Headspace\n` +
    `Apps with 🔐 use zkTLS — cryptographic proof pulled directly from the app. No screenshots, no lying.\n\n` +
    `*Main commands:*\n` +
    `/stakeit - Create a goal (guided step-by-step)\n` +
    `/status - View your active goals\n` +
    `/name - Set or change your display name\n` +
    `/help - Full command reference\n`;

  if (!existingName) {
    // First time — show intro then ask for name
    await ctx.reply(
      intro + `\n` +
      `Before we begin — what should I call you? Type your name:`,
      { parse_mode: 'Markdown', reply_markup: { force_reply: true, selective: true } }
    );

    if (userId) {
      const chatId = ctx.chat?.id?.toString();
      if (chatId) {
        const key = getConvKey(userId, chatId);
        conversationStore.set(key, {
          step: 'awaiting_name',
          botPromptMessageId: ctx.message?.message_id,
          startedAt: Date.now(),
        });
      }
    }
    return;
  }

  await ctx.reply(
    intro.replace('*StakeIt — Put Your Money Where Your Mouth Is*', `*Welcome back, ${escMd(existingName)}!*`),
    { parse_mode: 'Markdown' }
  );
});

bot.command('help', async (ctx) => {
  await ctx.reply(
    `📖 *Full Command Reference*\n\n` +
    `*Goal Creation:*\n` +
    `/stakeit - Guided goal creation (app → metric → target → duration → penalty → stake)\n` +
    `/stake - Alias for /stakeit\n\n` +
    `*Profile:*\n` +
    `/name <your name> - Set or change your display name\n\n` +
    `*Verification:*\n` +
    `/verify - Submit a zkTLS proof for your active goal\n` +
    `/proof <goalId> - View all verification proofs for a goal\n` +
    `/providers - List apps that support automatic zkTLS verification\n\n` +
    `*Status & Management:*\n` +
    `/status - Your active goals with stake, week progress, and days remaining\n` +
    `/goals - All goals in this group from all members\n` +
    `/clear - Delete all your goals in this group\n\n` +
    `*Penalty types:*\n` +
    `🔥 Donate to StakeIt — money goes to the StakeIt team permanently. Gone.\n` +
    `🧊 Freeze & Restake — StakeIt freezes your money for 1-12 months (you choose), then stakes it on your next goal\n` +
    `👥 Split to Group — lost stake is divided among your referees\n` +
    `💝 Charity Donation — money donated to charity\n\n` +
    `*Progress tracking:*\n` +
    `• Send a photo in the group to log a progress update\n` +
    `• Send your location to attach GPS data to your latest update\n` +
    `• Max 3 active goals per person per group`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('name', async (ctx) => {
  try {
    const userId = ctx.from?.id?.toString();
    if (!userId) {
      await ctx.reply('❌ Could not identify you.');
      return;
    }

    const text = ctx.message?.text || '';
    const arg = text.replace(/^\/name\s*/, '').trim();

    if (!arg) {
      const currentName = userNameStore.get(userId);
      if (currentName) {
        await ctx.reply(`Your current name is: *${escMd(currentName)}*\n\nTo change it: /name Your New Name`, { parse_mode: 'Markdown' });
      } else {
        await ctx.reply(`You haven't set a name yet.\n\nUsage: /name Your Name`);
      }
      return;
    }

    userNameStore.set(userId, arg);
    await ctx.reply(`✅ Got it! I'll call you *${escMd(arg)}* from now on.`, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error in /name command:', error);
    await ctx.reply('❌ Failed to set name. Please try again.');
  }
});

bot.command('stakeit', async (ctx) => {
  try {
    cleanStaleConversations();

    const text = ctx.message?.text;
    if (!text) return;

    const parsed = parseStakeItCommand(text);
    if (!parsed) {
      // Check if bare /stakeit (or /stakeit@botname) → start conversational flow
      const bareCommand = /^\/stakeit(?:@\S+)?\s*$/.test(text.trim());
      if (bareCommand) {
        await startConversation(ctx);
        return;
      }

      await ctx.reply(
        `❌ Unrecognized input.\n\nUse /stakeit to start the guided goal creation flow.`
      );
      return;
    }

    const chatId = ctx.chat?.id?.toString();
    const userId = ctx.from?.id?.toString();
    const userName = resolveUserName(ctx);

    if (!userId || !chatId) {
      await ctx.reply('❌ Could not identify user.');
      return;
    }

    const result = await createGoalWithLimitCheck(
      parsed.goalName, parsed.amount, parsed.weeks,
      userId, userName, chatId, ctx.chat?.title
    );

    if ('error' in result) {
      await ctx.reply(`❌ ${result.error}`);
      return;
    }

    const zkProvider = findProviderForGoal(parsed.goalName);
    const zkNotice = zkProvider
      ? `\n\n🔐 *Auto-Verification Enabled*\nUse /verify to prove completion via ${escMd(zkProvider.name)}`
      : `\n\n📋 *Manual Verification*\nSend photos or wait for weekly voting`;

    await ctx.reply(
      `🎯 *Goal Created!*\n\n` +
      `Goal: ${escMd(parsed.goalName)}\n` +
      `Stake: ฿${parsed.amount.toLocaleString()}\n` +
      `Duration: ${escMd(parsed.durationLabel)}\n` +
      `By: ${escMd(userName)}` +
      zkNotice + `\n\n` +
      `📱 Scan to pay and activate:`,
      { parse_mode: 'Markdown' }
    );

    if (result.qrCodeUrl) {
      await sendQrCode(ctx.chat!.id, result.qrCodeUrl, result.goal.id);
    }
  } catch (error) {
    console.error('Error in /stakeit command:', error);
    await ctx.reply('❌ Failed to create goal. Please try again.');
  }
});

bot.command('stake', async (ctx) => {
  try {
    cleanStaleConversations();

    const text = ctx.message?.text;
    if (!text) return;

    const chatId = ctx.chat?.id?.toString();
    const userId = ctx.from?.id?.toString();
    const userName = resolveUserName(ctx);

    if (!userId || !chatId) {
      await ctx.reply('❌ Could not identify user.');
      return;
    }

    // Try full format first: /stake "goal" amount weeks
    const fullParsed = parseStakeCommand(text);
    if (fullParsed) {
      const result = await createGoalWithLimitCheck(
        fullParsed.goalName, fullParsed.amount, fullParsed.weeks,
        userId, userName, chatId, ctx.chat?.title
      );

      if ('error' in result) {
        await ctx.reply(`❌ ${result.error}`);
        return;
      }

      await ctx.reply(
        `🎯 New Goal Created!\n\n` +
        `Goal: ${fullParsed.goalName}\n` +
        `Stake: ฿${fullParsed.amount.toLocaleString()}\n` +
        `Duration: ${fullParsed.durationLabel}\n` +
        `By: ${userName}\n\n` +
        `📱 Scan to pay and activate:`
      );

      if (result.qrCodeUrl) {
        await sendQrCode(ctx.chat!.id, result.qrCodeUrl, result.goal.id);
      }
      return;
    }

    // Try reply format: /stake amount weeks (replying to own message)
    const replyParsed = parseStakeReplyCommand(text);
    if (replyParsed) {
      const replyMessage = ctx.message?.reply_to_message;
      if (!replyMessage || !('text' in replyMessage) || !replyMessage.text) {
        await ctx.reply('❌ Reply to a message to use it as the goal name, or use: /stake "goal" amount weeks');
        return;
      }

      // Must be replying to own message
      if (replyMessage.from?.id?.toString() !== userId) {
        await ctx.reply('❌ You can only stake on your own messages.');
        return;
      }

      const goalName = replyMessage.text.substring(0, 200);

      const result = await createGoalWithLimitCheck(
        goalName, replyParsed.amount, replyParsed.weeks,
        userId, userName, chatId, ctx.chat?.title
      );

      if ('error' in result) {
        await ctx.reply(`❌ ${result.error}`);
        return;
      }

      await ctx.reply(
        `🎯 New Goal Created!\n\n` +
        `Goal: ${goalName}\n` +
        `Stake: ฿${replyParsed.amount.toLocaleString()}\n` +
        `Duration: ${replyParsed.durationLabel}\n` +
        `By: ${userName}\n\n` +
        `📱 Scan to pay and activate:`
      );

      if (result.qrCodeUrl) {
        await sendQrCode(ctx.chat!.id, result.qrCodeUrl, result.goal.id);
      }
      return;
    }

    // Check if bare /stake → start conversational flow
    const bareCommand = /^\/stake(?:@\S+)?\s*$/.test(text.trim());
    if (bareCommand) {
      await startConversation(ctx);
      return;
    }

    await ctx.reply(
      `❌ Unrecognized input.\n\nUse /stake to start the guided goal creation flow.`
    );
  } catch (error) {
    console.error('Error in /stake command:', error);
    await ctx.reply('❌ Failed to create goal. Please try again.');
  }
});

bot.command('status', async (ctx) => {
  try {
    const userId = ctx.from?.id?.toString();
    if (!userId) {
      await ctx.reply('❌ Could not identify user.');
      return;
    }

    const goals = await getGoalsByUser(userId);
    const activeGoals = goals.filter(g => g.status === 'active' || g.status === 'pending_payment');

    if (activeGoals.length === 0) {
      await ctx.reply('📭 No active goals. Create one with /stakeit or /stake');
      return;
    }

    let message = '📊 Your Goals:\n\n';
    for (const goal of activeGoals) {
      const statusEmoji = goal.status === 'active' ? '🟢' : '⏳';
      message += `${statusEmoji} ${goal.goal_name}\n`;
      message += `   Stake: ฿${goal.stake_amount_thb.toLocaleString()}\n`;
      message += `   Status: ${goal.status}\n`;
      if (goal.status === 'active') {
        message += `   Week: ${goal.current_week}/${goal.duration_weeks}\n`;
        message += `   Passed: ${goal.weeks_passed} | Failed: ${goal.weeks_failed}\n`;
        // Days remaining
        if (goal.end_date) {
          const daysLeft = Math.max(0, Math.ceil((new Date(goal.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
          message += `   Days remaining: ${daysLeft}\n`;
        }
        // Penalty reminder
        message += `   Penalty if failed: ${goal.penalty_type.replace('_', ' ')}\n`;
      }
      message += '\n';
    }

    await ctx.reply(message);
  } catch (error) {
    console.error('Error in /status command:', error);
    await ctx.reply('❌ Failed to fetch goals.');
  }
});

bot.command('goals', async (ctx) => {
  try {
    const chatId = ctx.chat?.id?.toString();

    if (!chatId) {
      await ctx.reply('❌ Could not identify chat.');
      return;
    }

    const goals = await getGoalsByGroup('telegram', chatId);

    if (goals.length === 0) {
      await ctx.reply('📭 No goals here yet. Create one with /stakeit');
      return;
    }

    let message = `📊 Goals in ${ctx.chat?.title || 'this chat'}:\n\n`;
    for (const goal of goals) {
      const statusEmoji = goal.status === 'active' ? '🟢' :
        goal.status === 'completed' ? '✅' :
        goal.status === 'failed' ? '❌' : '⏳';
      message += `${statusEmoji} ${goal.goal_name} by ${goal.user_name}\n`;
      message += `   ฿${goal.stake_amount_thb.toLocaleString()} | ${goal.status}\n\n`;
    }

    await ctx.reply(message);
  } catch (error) {
    console.error('Error in /goals command:', error);
    await ctx.reply('❌ Failed to fetch goals.');
  }
});

// ============================================================
// CLEAR GOALS (for testing/demo)
// ============================================================

bot.command('clear', async (ctx) => {
  try {
    const userId = ctx.from?.id?.toString();
    const chatId = ctx.chat?.id?.toString();

    if (!userId || !chatId) {
      await ctx.reply('❌ Could not identify user or chat.');
      return;
    }

    const deleted = await deleteGoalsByUserInGroup(userId, chatId);

    if (deleted === 0) {
      await ctx.reply('📭 You have no goals in this group to delete.');
    } else {
      await ctx.reply(`🗑 Deleted ${deleted} goal${deleted > 1 ? 's' : ''} from this group.`);
    }
  } catch (error) {
    console.error('Error in /clear command:', error);
    await ctx.reply('❌ Failed to delete goals.');
  }
});

// ============================================================
// ZKTLS COMMANDS
// ============================================================

bot.command('verify', async (ctx) => {
  try {
    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id?.toString();

    if (!chatId || !userId) {
      await ctx.reply('❌ Could not identify chat or user.');
      return;
    }

    const args = ctx.message?.text?.split(' ').slice(1) || [];
    const goalId = args[0];
    let goal;

    if (goalId) {
      goal = await getGoal(goalId);
      if (!goal || goal.user_id !== userId) {
        await ctx.reply('❌ Goal not found or not yours.');
        return;
      }
    } else {
      const goals = await getGoalsByGroup('telegram', chatId.toString());
      goal = goals.find(g => g.user_id === userId && g.status === 'active');

      if (!goal) {
        await ctx.reply('❌ No active goals found. Create one with /stakeit first.');
        return;
      }
    }

    const provider = findProviderForGoal(goal.goal_name);

    if (!provider) {
      await ctx.reply(
        `📋 *Manual Verification Required*\n\n` +
        `Goal: "${escMd(goal.goal_name)}" doesn't have automatic verification.\n\n` +
        `Options:\n` +
        `• Send a photo of your progress\n` +
        `• Share your location\n` +
        `• Wait for weekly friend voting\n\n` +
        `_ZKTLS works with: Duolingo, GitHub, LeetCode_`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const verifyUrl = await createTelegramVerificationLink(
      goal.id,
      goal.current_week,
      provider.id
    );

    await ctx.reply(
      `🔐 *ZKTLS Verification*\n\n` +
      `Goal: ${escMd(goal.goal_name)}\n` +
      `Week: ${goal.current_week} of ${goal.duration_weeks}\n` +
      `Provider: ${escMd(provider.name)}\n\n` +
      `Tap the button below to generate your cryptographic proof:`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '🔐 Generate Proof', url: verifyUrl }
          ]]
        }
      }
    );
  } catch (error) {
    console.error('Verify command error:', error);
    await ctx.reply('❌ Failed to generate verification link. Please try again.');
  }
});

bot.command('providers', async (ctx) => {
  const providerList = Object.values(RECLAIM_PROVIDERS)
    .map(p => `• *${p.name}*\n  Keywords: ${p.goalKeywords.slice(0, 3).join(', ')}`)
    .join('\n\n');

  await ctx.reply(
    `🔐 *Supported Auto-Verification Providers*\n\n` +
    `${providerList}\n\n` +
    `_Use /stakeit and pick an app with 🔐 to enable ZKTLS!_`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('proof', async (ctx) => {
  const args = ctx.message?.text?.split(' ').slice(1) || [];
  const goalId = args[0];

  if (!goalId) {
    await ctx.reply('Usage: /proof <goalId>');
    return;
  }

  try {
    const goal = await getGoal(goalId);
    if (!goal) {
      await ctx.reply('❌ Goal not found.');
      return;
    }

    const zkVerifications = await getZkVerifications(goalId);

    if (zkVerifications.length === 0) {
      await ctx.reply('📋 No ZKTLS proofs recorded for this goal yet.');
      return;
    }

    const proofList = zkVerifications.map(v => {
      const statusEmoji = v.status === 'verified' ? '✅' : v.status === 'failed' ? '❌' : '⏳';
      const chainLink = v.chain_tx_hash
        ? `[BaseScan](${getBaseScanUrl(v.chain_tx_hash)})`
        : 'Not recorded';

      return `*Week ${v.week_number}* ${statusEmoji}\n` +
        `Provider: ${escMd(v.provider_name)}\n` +
        `Value: ${escMd(v.extracted_value || 'N/A')}\n` +
        `On-chain: ${chainLink}`;
    }).join('\n\n');

    await ctx.reply(
      `🔐 *ZKTLS Proofs for Goal*\n\n` +
      `Goal: ${escMd(goal.goal_name)}\n\n` +
      proofList,
      { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } }
    );
  } catch (error) {
    console.error('Proof command error:', error);
    await ctx.reply('❌ Failed to fetch proof details.');
  }
});

// ============================================================
// VOTING BUTTONS
// ============================================================

export async function sendVerificationRequest(
  goal: Goal,
  weekNumber: number
): Promise<void> {
  if (!goal.group_id) return;
  if (goal.verification_type === 'zktls') return;

  const keyboard = new InlineKeyboard()
    .text('✅ Yes, they did!', `vote_yes_${goal.id}_${weekNumber}`)
    .text('❌ No', `vote_no_${goal.id}_${weekNumber}`);

  await bot.api.sendMessage(
    goal.group_id,
    `🎯 Weekly Check-in\n\n` +
    `Did ${goal.user_name} complete their goal "${goal.goal_name}" this week?\n\n` +
    `Week ${weekNumber}/${goal.duration_weeks}`,
    { reply_markup: keyboard }
  );
}

bot.on('callback_query:data', async (ctx) => {
  try {
    const data = ctx.callbackQuery.data;

    cleanStaleConversations();

    // Handle structured goal creation callbacks (g* prefix)
    const convAppMatch = data.match(/^ga_(\d+)_(\d+)$/);
    if (convAppMatch) {
      await handleConvApp(ctx, convAppMatch[1], parseInt(convAppMatch[2], 10));
      return;
    }

    const convMetricMatch = data.match(/^gm_(\d+)_(\d+)$/);
    if (convMetricMatch) {
      await handleConvMetric(ctx, convMetricMatch[1], parseInt(convMetricMatch[2], 10));
      return;
    }

    const convTargetMatch = data.match(/^gt_(\d+)_(\w+)$/);
    if (convTargetMatch) {
      await handleConvTarget(ctx, convTargetMatch[1], convTargetMatch[2]);
      return;
    }

    const convDurationMatch = data.match(/^gd_(\d+)_(\w+)$/);
    if (convDurationMatch) {
      await handleConvDuration(ctx, convDurationMatch[1], convDurationMatch[2]);
      return;
    }

    const convPenaltyMatch = data.match(/^gp_(\d+)_(\w)$/);
    if (convPenaltyMatch) {
      await handleConvPenalty(ctx, convPenaltyMatch[1], convPenaltyMatch[2]);
      return;
    }

    const convCharityMatch = data.match(/^gch_(\d+)_(\w+)$/);
    if (convCharityMatch) {
      await handleConvCharity(ctx, convCharityMatch[1], convCharityMatch[2]);
      return;
    }

    const convHoldMonthsMatch = data.match(/^ghm_(\d+)_(\d+)$/);
    if (convHoldMonthsMatch) {
      await handleConvHoldMonths(ctx, convHoldMonthsMatch[1], parseInt(convHoldMonthsMatch[2], 10));
      return;
    }

    const convStakeMatch = data.match(/^gk_(\d+)_(\w+)$/);
    if (convStakeMatch) {
      await handleConvStake(ctx, convStakeMatch[1], convStakeMatch[2]);
      return;
    }

    const convConfirmMatch = data.match(/^gc_(\d+)$/);
    if (convConfirmMatch) {
      await handleConvConfirm(ctx, convConfirmMatch[1]);
      return;
    }

    const convBackMatch = data.match(/^gb_(\d+)_(\w+)$/);
    if (convBackMatch) {
      await handleConvBack(ctx, convBackMatch[1], convBackMatch[2]);
      return;
    }

    const convCancelMatch = data.match(/^gx_(\d+)$/);
    if (convCancelMatch) {
      await handleConvCancel(ctx, convCancelMatch[1]);
      return;
    }

    // Handle promise detection callbacks
    const promiseYesMatch = data.match(/^py_(\d+)_(\d+)$/);
    if (promiseYesMatch) {
      await handlePromiseYes(ctx, promiseYesMatch[1], promiseYesMatch[2]);
      return;
    }

    const promiseNoMatch = data.match(/^pn_(\d+)$/);
    if (promiseNoMatch) {
      await ctx.answerCallbackQuery({ text: 'No problem!' });
      try { await ctx.editMessageReplyMarkup({ reply_markup: undefined }); } catch { /* ok */ }
      return;
    }

    const stakeAmountMatch = data.match(/^sa_(\d+)_(\d+)$/);
    if (stakeAmountMatch) {
      await handleStakeAmount(ctx, stakeAmountMatch[1], parseInt(stakeAmountMatch[2], 10));
      return;
    }

    const stakeDurationMatch = data.match(/^sd_(\d+)_(\d+)_(\w+)$/);
    if (stakeDurationMatch) {
      await handleStakeDuration(
        ctx,
        stakeDurationMatch[1],
        parseInt(stakeDurationMatch[2], 10),
        stakeDurationMatch[3]
      );
      return;
    }

    // Handle final vote callbacks
    const finalVoteMatch = data.match(/^fv_(pass|fail)_(.+)$/);
    if (finalVoteMatch) {
      await handleFinalVoteCallback(ctx, finalVoteMatch[2], finalVoteMatch[1] === 'pass');
      return;
    }

    // Handle regular vote callbacks
    const match = data.match(/^vote_(yes|no)_(.+)_(\d+)$/);
    if (!match) {
      await ctx.answerCallbackQuery({ text: 'Invalid vote data' });
      return;
    }

    const voteValue = match[1] === 'yes';
    const goalId = match[2];
    const weekNumber = parseInt(match[3], 10);
    const voterId = ctx.from?.id?.toString();
    const voterName = resolveUserName(ctx);

    if (!voterId) {
      await ctx.answerCallbackQuery({ text: 'Could not identify you' });
      return;
    }

    // Get goal
    const goal = await getGoal(goalId);
    if (!goal) {
      await ctx.answerCallbackQuery({ text: 'Goal not found' });
      return;
    }

    // Reject votes on zkTLS goals
    if (goal.verification_type === 'zktls') {
      await ctx.answerCallbackQuery({ text: 'This goal uses automatic zkTLS verification' });
      return;
    }

    // Check not goal owner
    if (voterId === goal.user_id) {
      await ctx.answerCallbackQuery({ text: '❌ Cannot vote on your own goal' });
      return;
    }

    // Get or create referee
    let referee = await getRefereeByUserId(goalId, voterId, 'telegram');
    if (!referee) {
      referee = await createReferee(goalId, voterId, voterName, 'telegram' as Platform);
    }

    // Check not already voted
    const alreadyVoted = await hasVoted(goalId, referee.id, weekNumber);
    if (alreadyVoted) {
      await ctx.answerCallbackQuery({ text: '⚠️ You already voted this week' });
      return;
    }

    // Submit vote
    await submitVote(goalId, referee.id, weekNumber, voteValue);

    // Calculate results
    const referees = await getReferees(goalId);
    const votes = await getVotesForWeek(goalId, weekNumber);
    const yesVotes = votes.filter(v => v.vote).length;
    const noVotes = votes.filter(v => !v.vote).length;

    if (referees.length === 0) {
      await ctx.answerCallbackQuery({ text: '❌ No referees registered yet' });
      return;
    }

    const majorityNeeded = Math.floor(referees.length / 2) + 1;
    let passed: boolean | null = null;

    if (yesVotes >= majorityNeeded) passed = true;
    else if (noVotes >= majorityNeeded) passed = false;

    // Update weekly result
    await getOrCreateWeeklyResult(goalId, weekNumber, referees.length);
    const updateData: Record<string, unknown> = {
      yes_votes: yesVotes,
      no_votes: noVotes,
      total_referees: referees.length,
      passed,
    };
    if (passed !== null) {
      updateData.finalized_at = new Date().toISOString();
    }
    await updateWeeklyResult(goalId, weekNumber, updateData);

    // Answer callback
    await ctx.answerCallbackQuery({
      text: `Vote recorded: ${voteValue ? '✅ Yes' : '❌ No'} (${yesVotes} yes / ${noVotes} no)`,
    });

    // Update message with current tally
    try {
      const statusText = passed === true ? '\n\n✅ PASSED' :
        passed === false ? '\n\n❌ FAILED' : '';

      await ctx.editMessageText(
        `🎯 Weekly Check-in\n\n` +
        `Did ${goal.user_name} complete their goal "${goal.goal_name}" this week?\n\n` +
        `Week ${weekNumber}/${goal.duration_weeks}\n\n` +
        `Votes: ✅ ${yesVotes} / ❌ ${noVotes}${statusText}`,
        passed === null ? {
          reply_markup: new InlineKeyboard()
            .text('✅ Yes, they did!', `vote_yes_${goal.id}_${weekNumber}`)
            .text('❌ No', `vote_no_${goal.id}_${weekNumber}`),
        } : undefined
      );
    } catch {
      // Message might not be editable
    }

    // If finalized, update goal
    if (passed !== null) {
      // Re-read goal to get latest weeks_passed/weeks_failed (prevents stale-read race condition)
      const freshGoal = await getGoal(goalId);
      if (!freshGoal) return;

      const goalUpdate: Record<string, unknown> = {};
      if (passed) {
        goalUpdate.weeks_passed = freshGoal.weeks_passed + 1;
      } else {
        goalUpdate.weeks_failed = freshGoal.weeks_failed + 1;
      }

      const newWeeksPassed = (goalUpdate.weeks_passed ?? freshGoal.weeks_passed) as number;
      const newWeeksFailed = (goalUpdate.weeks_failed ?? freshGoal.weeks_failed) as number;
      const totalWeeksVoted = newWeeksPassed + newWeeksFailed;

      if (totalWeeksVoted >= freshGoal.duration_weeks) {
        // All weekly votes done - start final vote instead of immediately completing
        goalUpdate.final_vote_status = 'voting';
        await updateGoal(goalId, goalUpdate);
        await sendFinalVoteRequest(freshGoal);
      } else {
        goalUpdate.current_week = weekNumber + 1;
        await updateGoal(goalId, goalUpdate);

        // Send week result
        await notifyWeekResult(freshGoal, weekNumber, passed);
      }
    }
  } catch (error) {
    console.error('Error handling callback query:', error);
    await ctx.answerCallbackQuery({ text: '❌ Error processing vote' });
  }
});

// ============================================================
// PROMISE DETECTION HANDLERS
// ============================================================

async function handlePromiseYes(
  ctx: CallbackCtx,
  messageId: string,
  userId: string
): Promise<void> {
  const fromId = ctx.from?.id?.toString();
  if (fromId !== userId) {
    await ctx.answerCallbackQuery({ text: '❌ Only the person who made the promise can stake' });
    return;
  }

  const keyboard = new InlineKeyboard()
    .text('฿100', `sa_${messageId}_100`)
    .text('฿500', `sa_${messageId}_500`)
    .text('฿1000', `sa_${messageId}_1000`)
    .text('฿2000', `sa_${messageId}_2000`);

  await ctx.answerCallbackQuery();
  try {
    await ctx.editMessageText('💰 How much do you want to stake?', { reply_markup: keyboard });
  } catch {
    // fallback
  }
}

async function handleStakeAmount(
  ctx: CallbackCtx,
  messageId: string,
  amount: number
): Promise<void> {
  const keyboard = new InlineKeyboard()
    .text('3 days', `sd_${messageId}_${amount}_3d`)
    .text('7 days', `sd_${messageId}_${amount}_7d`)
    .row()
    .text('2 weeks', `sd_${messageId}_${amount}_2w`)
    .text('4 weeks', `sd_${messageId}_${amount}_4w`)
    .row()
    .text('1 month', `sd_${messageId}_${amount}_1m`)
    .text('3 months', `sd_${messageId}_${amount}_3m`);

  await ctx.answerCallbackQuery();
  try {
    await ctx.editMessageText(
      `💰 Stake: ฿${amount.toLocaleString()}\n⏱ How long?`,
      { reply_markup: keyboard }
    );
  } catch {
    // fallback
  }
}

async function handleStakeDuration(
  ctx: CallbackCtx,
  messageId: string,
  amount: number,
  durationCode: string
): Promise<void> {
  try {
    const codeMap: Record<string, string> = {
      '3d': '3d', '7d': '7d',
      '2w': '2w', '4w': '4w',
      '1m': '1mon', '3m': '3mon',
    };
    const durationInput = codeMap[durationCode] || durationCode;
    const parsed = parseDuration(durationInput);
    if (!parsed) {
      await ctx.answerCallbackQuery({ text: '❌ Invalid duration' });
      return;
    }

    const chatId = ctx.callbackQuery.message?.chat.id?.toString();
    const userId = ctx.from?.id?.toString();
    const userName = resolveUserName(ctx);

    if (!userId || !chatId) {
      await ctx.answerCallbackQuery({ text: '❌ Could not identify user or chat' });
      return;
    }

    // Try to get the original promise message text from the replied-to message
    const repliedTo = ctx.callbackQuery.message?.reply_to_message;
    let goalName = 'Commitment goal';
    if (repliedTo && 'text' in repliedTo && repliedTo.text) {
      goalName = repliedTo.text.substring(0, 200);
    }

    await ctx.answerCallbackQuery({ text: 'Creating your goal...' });

    const result = await createGoalWithLimitCheck(
      goalName, amount, parsed.weeks,
      userId, userName, chatId, ctx.callbackQuery.message?.chat.title
    );

    if ('error' in result) {
      try {
        await ctx.editMessageText(`❌ ${result.error}`);
      } catch {
        // fallback
      }
      return;
    }

    try {
      await ctx.editMessageText(
        `🎯 Goal Created!\n\n` +
        `Goal: ${goalName}\n` +
        `Stake: ฿${amount.toLocaleString()}\n` +
        `Duration: ${parsed.label}\n` +
        `By: ${userName}\n\n` +
        `📱 Scan the QR code to activate!`
      );
    } catch {
      // fallback
    }

    if (result.qrCodeUrl) {
      await sendQrCode(chatId, result.qrCodeUrl, result.goal.id);
    }
  } catch (error) {
    console.error('Error in stake duration handler:', error);
    await ctx.answerCallbackQuery({ text: '❌ Failed to create goal' });
  }
}

// ============================================================
// FINAL VOTE
// ============================================================

async function sendFinalVoteRequest(goal: Goal): Promise<void> {
  if (!goal.group_id) return;
  if (goal.verification_type === 'zktls') return;

  try {
    const summaryUrl = `${BASE_URL}/goals/${goal.id}/summary`;
    const keyboard = new InlineKeyboard()
      .text('✅ Pass - Refund', `fv_pass_${goal.id}`)
      .text('❌ Fail - Penalize', `fv_fail_${goal.id}`);

    const penaltyLabel = goal.penalty_type.replace(/_/g, ' ');

    await bot.api.sendMessage(
      goal.group_id,
      `🏁 Final Vote for "${goal.goal_name}"\n\n` +
      `All weekly votes are done!\n` +
      `${goal.user_name}: ${goal.weeks_passed} passed / ${goal.weeks_failed} failed out of ${goal.duration_weeks} weeks\n\n` +
      `Penalty if failed: ${penaltyLabel}\n\n` +
      `📊 View full summary: ${summaryUrl}\n\n` +
      `Cast your final vote:`,
      { reply_markup: keyboard }
    );
  } catch (error) {
    console.error('Error sending final vote request:', error);
  }
}

// In-memory final vote tracking
const finalVoteStore: Map<string, Map<string, boolean>> = new Map();

async function handleFinalVoteCallback(
  ctx: CallbackCtx,
  goalId: string,
  passed: boolean
): Promise<void> {
  try {
    const voterId = ctx.from?.id?.toString();
    const voterName = resolveUserName(ctx);

    if (!voterId) {
      await ctx.answerCallbackQuery({ text: 'Could not identify you' });
      return;
    }

    const goal = await getGoal(goalId);
    if (!goal) {
      await ctx.answerCallbackQuery({ text: 'Goal not found' });
      return;
    }

    if (goal.verification_type === 'zktls') {
      await ctx.answerCallbackQuery({ text: 'This goal uses automatic zkTLS verification' });
      return;
    }

    if (goal.final_vote_status !== 'voting') {
      await ctx.answerCallbackQuery({ text: 'Final voting is not active' });
      return;
    }

    if (voterId === goal.user_id) {
      await ctx.answerCallbackQuery({ text: '❌ Cannot vote on your own goal' });
      return;
    }

    // Get or create referee
    let referee = await getRefereeByUserId(goalId, voterId, 'telegram');
    if (!referee) {
      referee = await createReferee(goalId, voterId, voterName, 'telegram' as Platform);
    }

    // Track final votes
    if (!finalVoteStore.has(goalId)) {
      finalVoteStore.set(goalId, new Map());
    }
    const goalVotes = finalVoteStore.get(goalId)!;

    if (goalVotes.has(referee.id)) {
      await ctx.answerCallbackQuery({ text: '⚠️ You already voted in the final vote' });
      return;
    }

    goalVotes.set(referee.id, passed);

    const referees = await getReferees(goalId);
    const totalVotes = goalVotes.size;
    const yesVotes = Array.from(goalVotes.values()).filter(v => v).length;
    const noVotes = totalVotes - yesVotes;
    const majorityNeeded = Math.floor(referees.length / 2) + 1;

    await ctx.answerCallbackQuery({
      text: `Vote recorded: ${passed ? '✅ Pass' : '❌ Fail'} (${yesVotes} pass / ${noVotes} fail)`,
    });

    let finalized = false;
    let finalResult: boolean | null = null;

    if (yesVotes >= majorityNeeded) {
      finalResult = true;
      finalized = true;
    } else if (noVotes >= majorityNeeded) {
      finalResult = false;
      finalized = true;
    }

    // Update message
    try {
      const statusText = finalized
        ? (finalResult ? '\n\n✅ PASSED - Refund approved!' : '\n\n❌ FAILED - Penalty applied!')
        : '';

      await ctx.editMessageText(
        `🏁 Final Vote for "${goal.goal_name}"\n\n` +
        `${goal.user_name}: ${goal.weeks_passed} passed / ${goal.weeks_failed} failed\n\n` +
        `Final votes: ✅ ${yesVotes} / ❌ ${noVotes}${statusText}`,
        !finalized ? {
          reply_markup: new InlineKeyboard()
            .text('✅ Pass - Refund', `fv_pass_${goal.id}`)
            .text('❌ Fail - Penalize', `fv_fail_${goal.id}`),
        } : undefined
      );
    } catch {
      // Message might not be editable
    }

    if (finalized) {
      await updateGoal(goalId, {
        status: finalResult ? 'completed' : 'failed',
        final_vote_status: 'finalized',
      } as Record<string, unknown>);
      finalVoteStore.delete(goalId);

      await notifyGoalComplete(
        { ...goal, status: finalResult ? 'completed' : 'failed' } as Goal
      );
    }
  } catch (error) {
    console.error('Error handling final vote:', error);
    await ctx.answerCallbackQuery({ text: '❌ Error processing vote' });
  }
}

// ============================================================
// PHOTO HANDLER (Progress Tracking)
// ============================================================

bot.on('message:photo', async (ctx) => {
  try {
    const userId = ctx.from?.id?.toString();
    const chatId = ctx.chat?.id?.toString();
    if (!userId || !chatId) return;

    // Find user's active goal in this group
    const goals = await getGoalsByGroup('telegram', chatId);
    const userActiveGoal = goals.find(g => g.user_id === userId && g.status === 'active');

    if (!userActiveGoal) return;

    // Get the largest photo
    const photos = ctx.message.photo;
    const largestPhoto = photos[photos.length - 1];

    // Download photo
    const file = await ctx.api.getFile(largestPhoto.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;

    const response = await fetch(fileUrl);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Parse EXIF
    const exif = parseExifFromBuffer(buffer);
    const warnings: string[] = [];

    if (!exif.timestamp) {
      warnings.push('No EXIF timestamp found');
    } else if (!isTimestampRecent(exif.timestamp)) {
      warnings.push('Photo timestamp is older than 1 hour');
    }

    // Upload to storage
    const fileName = `photo_${Date.now()}.jpg`;
    let photoUrl: string;
    try {
      photoUrl = await uploadProgressPhoto(userActiveGoal.id, userId, buffer, fileName);
    } catch {
      // If storage fails, continue without URL
      photoUrl = '';
    }

    // Create progress update
    await createProgressUpdate(userActiveGoal.id, {
      userId,
      weekNumber: userActiveGoal.current_week,
      photoUrls: photoUrl ? [photoUrl] : [],
      locationLat: exif.latitude || undefined,
      locationLng: exif.longitude || undefined,
      notes: ctx.message.caption || undefined,
      exifTimestamp: exif.timestamp?.toISOString(),
    });

    let replyMsg = `📸 Progress update recorded for "${userActiveGoal.goal_name}"!`;
    if (warnings.length > 0) {
      replyMsg += `\n⚠️ ${warnings.join(', ')}`;
    }

    // Notify group
    await ctx.reply(replyMsg);
  } catch (error) {
    console.error('Error handling photo:', error);
  }
});

// ============================================================
// LOCATION HANDLER (attach to most recent progress update)
// ============================================================

bot.on('message:location', async (ctx) => {
  try {
    const userId = ctx.from?.id?.toString();
    const chatId = ctx.chat?.id?.toString();
    if (!userId || !chatId) return;

    // Find user's active goal in this group
    const goals = await getGoalsByGroup('telegram', chatId);
    const userActiveGoal = goals.find(g => g.user_id === userId && g.status === 'active');

    if (!userActiveGoal) return;

    const location = ctx.message.location;

    // Try to attach to most recent progress update
    const latest = await getLatestProgressUpdate(userActiveGoal.id, userId);
    if (latest) {
      await updateProgressUpdate(latest.id, {
        location_lat: location.latitude,
        location_lng: location.longitude,
      } as Record<string, unknown>);
      await ctx.reply(`📍 Location added to your progress update for "${userActiveGoal.goal_name}"!`);
    } else {
      // Create new progress update with just location
      await createProgressUpdate(userActiveGoal.id, {
        userId,
        weekNumber: userActiveGoal.current_week,
        locationLat: location.latitude,
        locationLng: location.longitude,
      });
      await ctx.reply(`📍 Location recorded for "${userActiveGoal.goal_name}"!`);
    }
  } catch (error) {
    console.error('Error handling location:', error);
  }
});

// ============================================================
// PROMISE DETECTION (must be registered AFTER all command handlers)
// ============================================================

bot.on('message:text', async (ctx) => {
  try {
    const text = ctx.message?.text;
    if (!text) return;

    // Skip commands
    if (text.startsWith('/')) return;

    // Check for conversational goal creation replies
    const userId = ctx.from?.id?.toString();
    const chatId = ctx.chat?.id?.toString();
    if (userId && chatId) {
      cleanStaleConversations();
      const convKey = getConvKey(userId, chatId);
      const convState = conversationStore.get(convKey);

      if (convState && ['awaiting_name', 'awaiting_custom_target', 'awaiting_custom_amount', 'awaiting_custom_duration'].includes(convState.step)) {
        const replyTo = ctx.message?.reply_to_message;
        const isDirectReply = replyTo && replyTo.message_id === convState.botPromptMessageId;
        const isValidLooseInput = !text.startsWith('/') && (
          convState.step === 'awaiting_name'
            ? text.trim().length > 0
            : convState.step === 'awaiting_custom_duration'
              ? parseDuration(text.trim()) !== null
              : /^\d+$/.test(text.trim())
        );

        if (isDirectReply || isValidLooseInput) {
          await handleConversationReply(ctx, convKey, convState, text);
          return;
        }
      }
    }

    if (!isPromiseMessage(text)) return;

    const promiseUserId = userId || ctx.from?.id?.toString();
    const messageId = ctx.message.message_id.toString();
    if (!promiseUserId) return;

    // Use short callback data to stay within 64-byte limit
    const keyboard = new InlineKeyboard()
      .text('💰 Yes, stake!', `py_${messageId}_${promiseUserId}`)
      .text('👋 No thanks', `pn_${messageId}`);

    await ctx.reply(
      `Sounds like a commitment! Want to put money on it? 💪`,
      {
        reply_to_message_id: ctx.message.message_id,
        reply_markup: keyboard,
      }
    );
  } catch (error) {
    console.error('Error in promise detection:', error);
  }
});

// ============================================================
// NOTIFICATION FUNCTIONS
// ============================================================

export async function notifyGoalActivated(goal: Goal): Promise<void> {
  if (!goal.group_id) return;

  try {
    await bot.api.sendMessage(
      goal.group_id,
      `✅ Payment received!\n\n` +
      `Goal "${goal.goal_name}" is now ACTIVE.\n` +
      `Period 1 starts now.\n\n` +
      `Progress is verified automatically via zkTLS or system API.\n` +
      `Good luck! 💪`
    );
  } catch (error) {
    console.error('Error sending activation notification:', error);
  }
}

export async function notifyWeekResult(
  goal: Goal,
  weekNumber: number,
  passed: boolean
): Promise<void> {
  if (!goal.group_id) return;

  try {
    const weeksPassed = passed ? goal.weeks_passed + 1 : goal.weeks_passed;
    await bot.api.sendMessage(
      goal.group_id,
      `📊 Week ${weekNumber} Results\n\n` +
      `Goal: ${goal.goal_name}\n` +
      `By: ${goal.user_name}\n\n` +
      `Result: ${passed ? 'PASSED ✅' : 'FAILED ❌'}\n\n` +
      `Progress: ${weeksPassed}/${goal.duration_weeks} weeks passed`
    );
  } catch (error) {
    console.error('Error sending week result notification:', error);
  }
}

export async function notifyGoalComplete(goal: Goal): Promise<void> {
  if (!goal.group_id) return;

  try {
    const isSuccess = goal.status === 'completed';
    const penaltyLabel = goal.penalty_type.replace(/_/g, ' ');

    await bot.api.sendMessage(
      goal.group_id,
      isSuccess
        ? `🎉 Congratulations!\n\n` +
          `${goal.user_name} completed their goal "${goal.goal_name}"!\n` +
          `฿${goal.stake_amount_thb.toLocaleString()} will be refunded.`
        : `😢 Goal Failed\n\n` +
          `${goal.user_name} did not complete "${goal.goal_name}".\n` +
          `Penalty: ${penaltyLabel}\n` +
          `฿${goal.stake_amount_thb.toLocaleString()} - ${penaltyLabel}.`
    );
  } catch (error) {
    console.error('Error sending completion notification:', error);
  }
}

export async function notifyProgressUpdate(goal: Goal): Promise<void> {
  if (!goal.group_id) return;

  try {
    await bot.api.sendMessage(
      goal.group_id,
      `📸 ${goal.user_name} just submitted a progress update for "${goal.goal_name}"! Keep it up! 🔥`
    );
  } catch (error) {
    console.error('Error sending progress notification:', error);
  }
}

// ============================================================
// ZKTLS NOTIFICATION
// ============================================================

export async function notifyZkVerificationComplete(
  goal: Goal,
  weekNumber: number,
  extractedValue: string,
  txHash?: string
): Promise<void> {
  if (!goal.group_id) return;

  const baseScanLink = txHash ? `\n🔗 [View on BaseScan](${getBaseScanUrl(txHash)})` : '';

  await bot.api.sendMessage(
    goal.group_id,
    `✅ *Week ${weekNumber} Verified via ZKTLS!*\n\n` +
    `Goal: ${escMd(goal.goal_name)}\n` +
    `By: ${escMd(goal.user_name)}\n` +
    `Proof: ${escMd(goal.reclaim_provider_name || '')}\n` +
    `Value: ${escMd(extractedValue)}\n\n` +
    `🎯 Progress: ${goal.weeks_passed + 1}/${goal.duration_weeks} weeks passed` +
    baseScanLink,
    { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } }
  );
}

// ============================================================
// WEBHOOK HANDLER
// ============================================================

export const handleTelegramWebhook = webhookCallback(bot, 'std/http');
