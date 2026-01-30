import { createClient } from '@supabase/supabase-js';
import {
  Goal,
  GoalWithDetails,
  Referee,
  Vote,
  WeeklyResult,
  Payment,
  CreateGoalRequest,
  Platform,
} from '@/types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================================
// GOALS
// ============================================================

export async function createGoal(data: CreateGoalRequest): Promise<Goal> {
  try {
    const { data: goal, error } = await supabase
      .from('goals')
      .insert({
        user_id: data.userId,
        user_name: data.userName,
        goal_name: data.goalName,
        description: data.description || null,
        stake_amount_thb: data.stakeAmountThb,
        duration_weeks: data.durationWeeks,
        platform: data.platform,
        group_id: data.groupId || null,
        group_name: data.groupName || null,
        status: 'pending_payment',
      })
      .select()
      .single();

    if (error) throw error;

    // Create referees if provided
    if (data.referees && data.referees.length > 0) {
      for (const ref of data.referees) {
        await createReferee(goal.id, ref.userId, ref.userName, ref.platform);
      }
    }

    return goal as Goal;
  } catch (error) {
    console.error('Error creating goal:', error);
    throw error;
  }
}

export async function getGoal(id: string): Promise<Goal | null> {
  try {
    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return data as Goal;
  } catch (error) {
    console.error('Error getting goal:', error);
    throw error;
  }
}

export async function getGoalWithDetails(id: string): Promise<GoalWithDetails | null> {
  try {
    const goal = await getGoal(id);
    if (!goal) return null;

    const [referees, weeklyResults, votes] = await Promise.all([
      getReferees(id),
      getWeeklyResults(id),
      getAllVotes(id),
    ]);

    return {
      ...goal,
      referees,
      weekly_results: weeklyResults,
      votes,
    };
  } catch (error) {
    console.error('Error getting goal with details:', error);
    throw error;
  }
}

export async function updateGoal(id: string, updates: Partial<Goal>): Promise<Goal> {
  try {
    const { data, error } = await supabase
      .from('goals')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as Goal;
  } catch (error) {
    console.error('Error updating goal:', error);
    throw error;
  }
}

export async function getGoalsByUser(userId: string): Promise<Goal[]> {
  try {
    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data as Goal[]) || [];
  } catch (error) {
    console.error('Error getting goals by user:', error);
    throw error;
  }
}

export async function getGoalsByGroup(platform: string, groupId: string): Promise<Goal[]> {
  try {
    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .eq('platform', platform)
      .eq('group_id', groupId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data as Goal[]) || [];
  } catch (error) {
    console.error('Error getting goals by group:', error);
    throw error;
  }
}

// ============================================================
// REFEREES
// ============================================================

export async function createReferee(
  goalId: string,
  userId: string,
  userName: string,
  platform: Platform
): Promise<Referee> {
  try {
    const { data, error } = await supabase
      .from('referees')
      .insert({
        goal_id: goalId,
        user_id: userId,
        user_name: userName,
        platform,
      })
      .select()
      .single();

    if (error) throw error;
    return data as Referee;
  } catch (error) {
    console.error('Error creating referee:', error);
    throw error;
  }
}

export async function getReferees(goalId: string): Promise<Referee[]> {
  try {
    const { data, error } = await supabase
      .from('referees')
      .select('*')
      .eq('goal_id', goalId);

    if (error) throw error;
    return (data as Referee[]) || [];
  } catch (error) {
    console.error('Error getting referees:', error);
    throw error;
  }
}

export async function getRefereeByUserId(
  goalId: string,
  userId: string,
  platform: string
): Promise<Referee | null> {
  try {
    const { data, error } = await supabase
      .from('referees')
      .select('*')
      .eq('goal_id', goalId)
      .eq('user_id', userId)
      .eq('platform', platform)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return data as Referee;
  } catch (error) {
    console.error('Error getting referee by user ID:', error);
    throw error;
  }
}

// ============================================================
// VOTES
// ============================================================

export async function submitVote(
  goalId: string,
  refereeId: string,
  week: number,
  vote: boolean
): Promise<Vote> {
  try {
    const { data, error } = await supabase
      .from('votes')
      .insert({
        goal_id: goalId,
        referee_id: refereeId,
        week_number: week,
        vote,
      })
      .select()
      .single();

    if (error) throw error;
    return data as Vote;
  } catch (error) {
    console.error('Error submitting vote:', error);
    throw error;
  }
}

export async function hasVoted(
  goalId: string,
  refereeId: string,
  week: number
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('votes')
      .select('id')
      .eq('goal_id', goalId)
      .eq('referee_id', refereeId)
      .eq('week_number', week)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return false;
      throw error;
    }

    return !!data;
  } catch (error) {
    console.error('Error checking vote:', error);
    throw error;
  }
}

export async function getVotesForWeek(goalId: string, week: number): Promise<Vote[]> {
  try {
    const { data, error } = await supabase
      .from('votes')
      .select('*')
      .eq('goal_id', goalId)
      .eq('week_number', week);

    if (error) throw error;
    return (data as Vote[]) || [];
  } catch (error) {
    console.error('Error getting votes for week:', error);
    throw error;
  }
}

async function getAllVotes(goalId: string): Promise<Vote[]> {
  try {
    const { data, error } = await supabase
      .from('votes')
      .select('*')
      .eq('goal_id', goalId);

    if (error) throw error;
    return (data as Vote[]) || [];
  } catch (error) {
    console.error('Error getting all votes:', error);
    throw error;
  }
}

// ============================================================
// WEEKLY RESULTS
// ============================================================

export async function getOrCreateWeeklyResult(
  goalId: string,
  week: number,
  totalReferees: number
): Promise<WeeklyResult> {
  try {
    // Try to get existing
    const { data: existing, error: getError } = await supabase
      .from('weekly_results')
      .select('*')
      .eq('goal_id', goalId)
      .eq('week_number', week)
      .single();

    if (existing && !getError) return existing as WeeklyResult;

    // Create new
    const { data, error } = await supabase
      .from('weekly_results')
      .insert({
        goal_id: goalId,
        week_number: week,
        total_referees: totalReferees,
        verification_sent_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return data as WeeklyResult;
  } catch (error) {
    console.error('Error getting/creating weekly result:', error);
    throw error;
  }
}

export async function updateWeeklyResult(
  goalId: string,
  week: number,
  updates: Partial<WeeklyResult>
): Promise<WeeklyResult> {
  try {
    const { data, error } = await supabase
      .from('weekly_results')
      .update(updates)
      .eq('goal_id', goalId)
      .eq('week_number', week)
      .select()
      .single();

    if (error) throw error;
    return data as WeeklyResult;
  } catch (error) {
    console.error('Error updating weekly result:', error);
    throw error;
  }
}

async function getWeeklyResults(goalId: string): Promise<WeeklyResult[]> {
  try {
    const { data, error } = await supabase
      .from('weekly_results')
      .select('*')
      .eq('goal_id', goalId)
      .order('week_number', { ascending: true });

    if (error) throw error;
    return (data as WeeklyResult[]) || [];
  } catch (error) {
    console.error('Error getting weekly results:', error);
    throw error;
  }
}

// ============================================================
// PAYMENTS
// ============================================================

export async function createPayment(
  goalId: string,
  amountThb: number,
  qrUrl: string,
  chargeId: string
): Promise<Payment> {
  try {
    const { data, error } = await supabase
      .from('payments')
      .insert({
        goal_id: goalId,
        amount_thb: amountThb,
        qr_code_url: qrUrl,
        omise_charge_id: chargeId,
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw error;

    // Update goal with payment info
    await updateGoal(goalId, {
      payment_id: data.id,
      payment_qr_url: qrUrl,
    } as Partial<Goal>);

    return data as Payment;
  } catch (error) {
    console.error('Error creating payment:', error);
    throw error;
  }
}

export async function completePayment(chargeId: string): Promise<Payment | null> {
  try {
    // Find payment by charge ID
    const { data: payment, error: findError } = await supabase
      .from('payments')
      .select('*')
      .eq('omise_charge_id', chargeId)
      .single();

    if (findError) {
      if (findError.code === 'PGRST116') return null;
      throw findError;
    }

    // Update payment status
    const { data: updated, error: updateError } = await supabase
      .from('payments')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', payment.id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Activate the goal
    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + 7 * (payment as Payment).amount_thb); // This needs the goal's duration

    // Get goal to find duration
    const goal = await getGoal(payment.goal_id);
    if (goal) {
      const goalEndDate = new Date(now);
      goalEndDate.setDate(goalEndDate.getDate() + 7 * goal.duration_weeks);

      await updateGoal(payment.goal_id, {
        status: 'active',
        start_date: now.toISOString(),
        end_date: goalEndDate.toISOString(),
        current_week: 1,
      } as Partial<Goal>);
    }

    return updated as Payment;
  } catch (error) {
    console.error('Error completing payment:', error);
    throw error;
  }
}
