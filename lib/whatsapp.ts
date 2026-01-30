import twilio from 'twilio';
import {
  createGoal,
  getGoalsByUser,
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

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER;

const twilioClient = accountSid && authToken ? twilio(accountSid, authToken) : null;

// ============================================================
// MESSAGE SENDING
// ============================================================

export async function sendWhatsAppMessage(to: string, body: string): Promise<void> {
  if (!twilioClient || !whatsappNumber) {
    console.error('Twilio not configured');
    return;
  }

  try {
    await twilioClient.messages.create({
      from: whatsappNumber,
      to,
      body,
    });
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    throw error;
  }
}

export async function sendWhatsAppMediaMessage(
  to: string,
  body: string,
  mediaUrl: string
): Promise<void> {
  if (!twilioClient || !whatsappNumber) {
    console.error('Twilio not configured');
    return;
  }

  try {
    await twilioClient.messages.create({
      from: whatsappNumber,
      to,
      body,
      mediaUrl: [mediaUrl],
    });
  } catch (error) {
    console.error('Error sending WhatsApp media message:', error);
    throw error;
  }
}

// ============================================================
// MESSAGE PARSER
// ============================================================

interface ParsedCommand {
  command: 'help' | 'status' | 'commit' | 'vote';
  goalName?: string;
  amount?: number;
  weeks?: number;
  goalId?: string;
  vote?: boolean;
}

export function parseWhatsAppMessage(body: string): ParsedCommand | null {
  const text = body.trim().toLowerCase();

  if (text === 'help' || text === 'hi' || text === 'hello') {
    return { command: 'help' };
  }

  if (text === 'status') {
    return { command: 'status' };
  }

  // commit "goal" amount weeks
  const commitMatch = body.trim().match(/^commit\s+(?:"([^"]+)"|(\S+))\s+(\d+)\s+(\d+)$/i);
  if (commitMatch) {
    const goalName = commitMatch[1] || commitMatch[2];
    const amount = parseInt(commitMatch[3], 10);
    const weeks = parseInt(commitMatch[4], 10);

    if (amount > 0 && weeks >= 1 && weeks <= 52) {
      return { command: 'commit', goalName, amount, weeks };
    }
  }

  // vote goalId yes/no
  const voteMatch = body.trim().match(/^vote\s+(\S+)\s+(yes|no)$/i);
  if (voteMatch) {
    return {
      command: 'vote',
      goalId: voteMatch[1],
      vote: voteMatch[2].toLowerCase() === 'yes',
    };
  }

  return null;
}

// ============================================================
// MESSAGE HANDLERS
// ============================================================

export async function handleWhatsAppMessage(
  from: string,
  body: string,
  profileName: string | undefined
): Promise<string> {
  const parsed = parseWhatsAppMessage(body);

  if (!parsed) {
    return getHelpText();
  }

  switch (parsed.command) {
    case 'help':
      return getHelpText();

    case 'status':
      return await handleStatus(from);

    case 'commit':
      return await handleCommit(from, profileName || from, parsed);

    case 'vote':
      return await handleVote(from, profileName || from, parsed);

    default:
      return getHelpText();
  }
}

function getHelpText(): string {
  return (
    `🎯 StakeIt - Commitment Contracts\n\n` +
    `Commands:\n` +
    `• commit "goal" amount weeks - Create a goal\n` +
    `  Example: commit "Exercise 3x/week" 1000 4\n\n` +
    `• status - View your active goals\n` +
    `• vote <goalId> yes/no - Vote on a goal\n` +
    `• help - Show this message`
  );
}

async function handleStatus(from: string): Promise<string> {
  try {
    const userId = from.replace('whatsapp:', '');
    const goals = await getGoalsByUser(userId);
    const activeGoals = goals.filter(g => g.status === 'active' || g.status === 'pending_payment');

    if (activeGoals.length === 0) {
      return '📭 No active goals. Create one with:\ncommit "goal name" amount weeks';
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
      message += `   ID: ${goal.id}\n\n`;
    }

    return message;
  } catch (error) {
    console.error('Error in WhatsApp status:', error);
    return '❌ Failed to fetch goals.';
  }
}

async function handleCommit(
  from: string,
  profileName: string,
  parsed: ParsedCommand
): Promise<string> {
  try {
    const userId = from.replace('whatsapp:', '');

    const goal = await createGoal({
      goalName: parsed.goalName!,
      stakeAmountThb: parsed.amount!,
      durationWeeks: parsed.weeks!,
      platform: 'whatsapp',
      userId,
      userName: profileName,
    });

    const charge = await createPromptPayCharge(
      parsed.amount!,
      goal.id,
      userId,
      `StakeIt: ${parsed.goalName}`
    );

    await createPayment(goal.id, parsed.amount!, charge.qrCodeUrl, charge.chargeId);

    // Send QR code as media message
    if (charge.qrCodeUrl) {
      await sendWhatsAppMediaMessage(from, 'Scan to pay and activate your goal:', charge.qrCodeUrl);
    }

    return (
      `🎯 New Goal Created!\n\n` +
      `Goal: ${parsed.goalName}\n` +
      `Stake: ฿${parsed.amount!.toLocaleString()}\n` +
      `Duration: ${parsed.weeks} weeks\n\n` +
      `Goal ID: ${goal.id}\n\n` +
      `📱 Scan the QR code to pay and activate your goal.`
    );
  } catch (error) {
    console.error('Error in WhatsApp commit:', error);
    return '❌ Failed to create goal. Please try again.';
  }
}

async function handleVote(
  from: string,
  profileName: string,
  parsed: ParsedCommand
): Promise<string> {
  try {
    const userId = from.replace('whatsapp:', '');
    const goalId = parsed.goalId!;
    const voteValue = parsed.vote!;

    const goal = await getGoal(goalId);
    if (!goal) {
      return '❌ Goal not found. Check the goal ID.';
    }

    if (goal.status !== 'active') {
      return '❌ This goal is not active.';
    }

    if (userId === goal.user_id) {
      return '❌ You cannot vote on your own goal.';
    }

    const week = goal.current_week;

    // Get or create referee
    let referee = await getRefereeByUserId(goalId, userId, 'whatsapp');
    if (!referee) {
      referee = await createReferee(goalId, userId, profileName, 'whatsapp' as Platform);
    }

    // Check not already voted
    const alreadyVoted = await hasVoted(goalId, referee.id, week);
    if (alreadyVoted) {
      return '⚠️ You already voted for this week.';
    }

    // Submit vote
    await submitVote(goalId, referee.id, week, voteValue);

    // Calculate results
    const referees = await getReferees(goalId);
    const votes = await getVotesForWeek(goalId, week);
    const yesVotes = votes.filter(v => v.vote).length;
    const noVotes = votes.filter(v => !v.vote).length;

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
      } else {
        goalUpdate.current_week = week + 1;
      }

      await updateGoal(goalId, goalUpdate);
    }

    const resultStr = passed === true ? '\n\n✅ Week PASSED!' :
      passed === false ? '\n\n❌ Week FAILED!' : '';

    return (
      `✅ Vote recorded: ${voteValue ? 'Yes' : 'No'}\n\n` +
      `Goal: ${goal.goal_name}\n` +
      `Week ${week}: ✅ ${yesVotes} / ❌ ${noVotes}${resultStr}`
    );
  } catch (error) {
    console.error('Error in WhatsApp vote:', error);
    return '❌ Failed to process vote. Please try again.';
  }
}

// ============================================================
// NOTIFICATION FUNCTIONS
// ============================================================

export async function notifyWhatsAppGoalActivated(goal: Goal): Promise<void> {
  if (!goal.user_id) return;

  try {
    const to = goal.user_id.startsWith('whatsapp:') ? goal.user_id : `whatsapp:${goal.user_id}`;
    await sendWhatsAppMessage(
      to,
      `✅ Payment received!\n\n` +
      `Goal "${goal.goal_name}" is now ACTIVE.\n` +
      `Week 1 starts now.\n\n` +
      `Good luck! 💪`
    );
  } catch (error) {
    console.error('Error sending WhatsApp activation notification:', error);
  }
}

export async function sendWhatsAppVerificationRequest(
  goal: Goal,
  week: number,
  refereePhone: string
): Promise<void> {
  try {
    const to = refereePhone.startsWith('whatsapp:') ? refereePhone : `whatsapp:${refereePhone}`;
    await sendWhatsAppMessage(
      to,
      `🎯 Weekly Check-in\n\n` +
      `Did ${goal.user_name} complete their goal "${goal.goal_name}" this week?\n\n` +
      `Week ${week}/${goal.duration_weeks}\n\n` +
      `Reply with:\n` +
      `vote ${goal.id} yes\n` +
      `or\n` +
      `vote ${goal.id} no`
    );
  } catch (error) {
    console.error('Error sending WhatsApp verification request:', error);
  }
}
