import { Bot, InlineKeyboard, webhookCallback } from 'grammy';
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
} from '@/lib/supabase';
import { createPromptPayCharge } from '@/lib/omise';
import { Goal, Platform } from '@/types';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  throw new Error('TELEGRAM_BOT_TOKEN is not set. Cannot initialize Telegram bot.');
}

export const bot = new Bot(token);

// ============================================================
// COMMAND PARSER
// ============================================================

interface ParsedCommit {
  goalName: string;
  amount: number;
  weeks: number;
}

function parseCommitCommand(text: string): ParsedCommit | null {
  const match = text.match(/^\/commit\s+(?:"([^"]+)"|(\S+))\s+(\d+)\s+(\d+)$/);
  if (!match) return null;

  const goalName = match[1] || match[2];
  const amount = parseInt(match[3], 10);
  const weeks = parseInt(match[4], 10);

  if (amount <= 0 || weeks < 1 || weeks > 52) return null;

  return { goalName, amount, weeks };
}

// ============================================================
// COMMANDS
// ============================================================

bot.command('start', async (ctx) => {
  await ctx.reply(
    `🎯 Welcome to StakeIt!\n\n` +
    `Put your money where your mouth is. Create commitment contracts with your friends as referees.\n\n` +
    `Commands:\n` +
    `/commit "goal" amount weeks - Create a goal\n` +
    `/status - Your active goals\n` +
    `/help - All commands\n\n` +
    `Example: /commit "Exercise 3x/week" 1000 4`
  );
});

bot.command('help', async (ctx) => {
  await ctx.reply(
    `🎯 StakeIt Commands\n\n` +
    `/commit "goal" amount weeks - Create a new goal\n` +
    `  Example: /commit "Exercise 3x/week" 1000 4\n\n` +
    `/status - Show your active goals\n` +
    `/goals - Show all goals in this group\n` +
    `/help - Show this help message\n\n` +
    `How it works:\n` +
    `1. Create a goal and stake money\n` +
    `2. Pay via PromptPay QR code\n` +
    `3. Group members verify your progress weekly\n` +
    `4. Complete majority of weeks → Get refund!`
  );
});

bot.command('commit', async (ctx) => {
  try {
    const text = ctx.message?.text;
    if (!text) return;

    const parsed = parseCommitCommand(text);
    if (!parsed) {
      await ctx.reply(
        `❌ Invalid format.\n\n` +
        `Usage: /commit "goal name" amount weeks\n` +
        `Example: /commit "Exercise 3x/week" 1000 4`
      );
      return;
    }

    const chatId = ctx.chat?.id?.toString();
    const chatType = ctx.chat?.type;
    const userId = ctx.from?.id?.toString();
    const userName = ctx.from?.username || ctx.from?.first_name || 'Unknown';

    if (!userId) {
      await ctx.reply('❌ Could not identify user.');
      return;
    }

    if (chatType === 'private') {
      await ctx.reply('❌ Please use this command in a group chat so friends can verify your progress.');
      return;
    }

    // Create goal
    const goal = await createGoal({
      goalName: parsed.goalName,
      stakeAmountThb: parsed.amount,
      durationWeeks: parsed.weeks,
      platform: 'telegram',
      groupId: chatId,
      groupName: ctx.chat?.title || undefined,
      userId,
      userName,
    });

    // Create payment
    const charge = await createPromptPayCharge(
      parsed.amount,
      goal.id,
      userId,
      `StakeIt: ${parsed.goalName}`
    );

    await createPayment(goal.id, parsed.amount, charge.qrCodeUrl, charge.chargeId);

    // Send goal info
    await ctx.reply(
      `🎯 New Goal Created!\n\n` +
      `Goal: ${parsed.goalName}\n` +
      `Stake: ฿${parsed.amount.toLocaleString()}\n` +
      `Duration: ${parsed.weeks} weeks\n` +
      `By: @${userName}\n\n` +
      `📱 Scan to pay and activate:`
    );

    // Send QR code
    if (charge.qrCodeUrl) {
      await ctx.replyWithPhoto(charge.qrCodeUrl);
    }
  } catch (error) {
    console.error('Error in /commit command:', error);
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
      await ctx.reply('📭 No active goals. Create one with /commit');
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
    const chatType = ctx.chat?.type;

    if (chatType === 'private' || !chatId) {
      await ctx.reply('❌ Use this command in a group chat.');
      return;
    }

    const goals = await getGoalsByGroup('telegram', chatId);

    if (goals.length === 0) {
      await ctx.reply('📭 No goals in this group yet. Create one with /commit');
      return;
    }

    let message = `📊 Goals in ${ctx.chat?.title || 'this group'}:\n\n`;
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
// VOTING BUTTONS
// ============================================================

export async function sendVerificationRequest(
  goal: Goal,
  weekNumber: number
): Promise<void> {
  if (!goal.group_id) return;

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
    const match = data.match(/^vote_(yes|no)_(.+)_(\d+)$/);

    if (!match) {
      await ctx.answerCallbackQuery({ text: 'Invalid vote data' });
      return;
    }

    const voteValue = match[1] === 'yes';
    const goalId = match[2];
    const weekNumber = parseInt(match[3], 10);
    const voterId = ctx.from?.id?.toString();
    const voterName = ctx.from?.username || ctx.from?.first_name || 'Unknown';

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
      const goalUpdate: Record<string, unknown> = {};
      if (passed) {
        goalUpdate.weeks_passed = goal.weeks_passed + 1;
      } else {
        goalUpdate.weeks_failed = goal.weeks_failed + 1;
      }

      const totalWeeksVoted = (passed ? goal.weeks_passed + 1 : goal.weeks_passed) +
        (!passed ? goal.weeks_failed + 1 : goal.weeks_failed);

      if (totalWeeksVoted >= goal.duration_weeks) {
        const weeksPassed = passed ? goal.weeks_passed + 1 : goal.weeks_passed;
        const majorityWeeks = Math.floor(goal.duration_weeks / 2) + 1;
        goalUpdate.status = weeksPassed >= majorityWeeks ? 'completed' : 'failed';

        await updateGoal(goalId, goalUpdate);

        // Send final result
        const finalGoal = await getGoal(goalId);
        if (finalGoal) {
          await notifyGoalComplete(finalGoal);
        }
      } else {
        goalUpdate.current_week = weekNumber + 1;
        await updateGoal(goalId, goalUpdate);

        // Send week result
        await notifyWeekResult(goal, weekNumber, passed);
      }
    }
  } catch (error) {
    console.error('Error handling callback query:', error);
    await ctx.answerCallbackQuery({ text: '❌ Error processing vote' });
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
      `Week 1 starts now.\n\n` +
      `I'll check in with the group each week for verification.\n` +
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
    await bot.api.sendMessage(
      goal.group_id,
      isSuccess
        ? `🎉 Congratulations!\n\n` +
          `${goal.user_name} completed their goal "${goal.goal_name}"!\n` +
          `฿${goal.stake_amount_thb.toLocaleString()} will be refunded.`
        : `😢 Goal Failed\n\n` +
          `${goal.user_name} did not complete "${goal.goal_name}".\n` +
          `฿${goal.stake_amount_thb.toLocaleString()} is forfeited.`
    );
  } catch (error) {
    console.error('Error sending completion notification:', error);
  }
}

// ============================================================
// WEBHOOK HANDLER
// ============================================================

export const handleTelegramWebhook = webhookCallback(bot, 'std/http');
