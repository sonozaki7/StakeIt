// ============================================================
// DATABASE ROW TYPES (match Supabase schema exactly)
// ============================================================

export type GoalStatus = 'pending_payment' | 'active' | 'completed' | 'failed' | 'refunded';
export type Platform = 'telegram' | 'whatsapp' | 'web';
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';

export interface Goal {
  id: string;
  user_id: string;
  user_name: string;
  goal_name: string;
  description: string | null;
  stake_amount_thb: number;
  duration_weeks: number;
  status: GoalStatus;
  platform: Platform;
  group_id: string | null;
  group_name: string | null;
  start_date: string | null;
  end_date: string | null;
  current_week: number;
  weeks_passed: number;
  weeks_failed: number;
  payment_id: string | null;
  payment_qr_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Referee {
  id: string;
  goal_id: string;
  user_id: string;
  user_name: string;
  platform: Platform;
  added_at: string;
}

export interface Vote {
  id: string;
  goal_id: string;
  referee_id: string;
  week_number: number;
  vote: boolean;
  voted_at: string;
}

export interface WeeklyResult {
  id: string;
  goal_id: string;
  week_number: number;
  yes_votes: number;
  no_votes: number;
  total_referees: number;
  passed: boolean | null;
  verification_sent_at: string | null;
  finalized_at: string | null;
}

export interface Payment {
  id: string;
  goal_id: string;
  omise_charge_id: string | null;
  amount_thb: number;
  status: PaymentStatus;
  qr_code_url: string | null;
  created_at: string;
  completed_at: string | null;
}

// ============================================================
// API REQUEST/RESPONSE TYPES
// ============================================================

export interface CreateGoalRequest {
  goalName: string;
  description?: string;
  stakeAmountThb: number;
  durationWeeks: number;
  platform: Platform;
  groupId?: string;
  groupName?: string;
  userId: string;
  userName: string;
  referees?: Array<{
    userId: string;
    userName: string;
    platform: Platform;
  }>;
}

export interface CreateGoalResponse {
  success: boolean;
  goal?: {
    id: string;
    status: GoalStatus;
    paymentQrUrl: string;
    stakeAmountThb: number;
  };
  error?: string;
}

export interface VoteRequest {
  refereeUserId: string;
  refereeUserName?: string;
  refereePlatform: Platform;
  week: number;
  vote: boolean;
}

export interface VoteResponse {
  success: boolean;
  weekStatus?: {
    yesVotes: number;
    noVotes: number;
    totalReferees: number;
    passed: boolean | null;
  };
  error?: string;
}

export interface GoalWithDetails extends Goal {
  referees: Referee[];
  weekly_results: WeeklyResult[];
  votes: Vote[];
}

// ============================================================
// EXTERNAL SERVICE TYPES
// ============================================================

export interface OmiseChargeResponse {
  id: string;
  amount: number;
  currency: string;
  status: string;
  source: {
    type: string;
    scannable_code?: {
      image: {
        download_uri: string;
      };
    };
  };
  metadata: Record<string, string>;
}

export interface OmiseWebhookEvent {
  key: string;
  data: {
    id: string;
    amount: number;
    status: string;
    metadata?: {
      goal_id?: string;
      user_id?: string;
    };
  };
}

export interface TwilioWebhookBody {
  From: string;
  Body: string;
  ProfileName?: string;
  To: string;
}
