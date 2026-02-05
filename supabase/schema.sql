-- ============================================================
-- STAKEIT DATABASE SCHEMA
-- Run this entire file in Supabase SQL Editor
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLE: goals
-- Main table storing all commitment goals
-- ============================================================
CREATE TABLE goals (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- User who created the goal
    user_id TEXT NOT NULL,           -- Platform-specific user ID (Telegram ID, phone, etc.)
    user_name TEXT NOT NULL,         -- Display name
    
    -- Goal details
    goal_name TEXT NOT NULL,         -- e.g., "Exercise 3x per week"
    description TEXT,                -- Optional longer description
    
    -- Stake configuration
    stake_amount_thb INTEGER NOT NULL CHECK (stake_amount_thb > 0),
    duration_weeks INTEGER NOT NULL CHECK (duration_weeks BETWEEN 1 AND 52),
    
    -- Status tracking
    status TEXT NOT NULL DEFAULT 'pending_payment'
        CHECK (status IN ('pending_payment', 'active', 'completed', 'failed', 'refunded')),
    
    -- Platform and group info
    platform TEXT NOT NULL CHECK (platform IN ('telegram', 'whatsapp', 'web')),
    group_id TEXT,                   -- Telegram chat ID or WhatsApp group ID
    group_name TEXT,                 -- Human-readable group name
    
    -- Progress tracking
    start_date TIMESTAMPTZ,          -- When goal became active (after payment)
    end_date TIMESTAMPTZ,            -- Calculated: start_date + duration_weeks
    current_week INTEGER DEFAULT 0,  -- 0 = not started, 1-N = current week
    weeks_passed INTEGER DEFAULT 0,  -- Count of weeks that passed verification
    weeks_failed INTEGER DEFAULT 0,  -- Count of weeks that failed verification
    
    -- Payment info
    payment_id TEXT,                 -- Reference to payments table
    payment_qr_url TEXT,             -- PromptPay QR code URL from Omise
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: referees
-- People who can vote on a goal's progress
-- ============================================================
CREATE TABLE referees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Link to goal
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    
    -- Referee info
    user_id TEXT NOT NULL,           -- Platform-specific user ID
    user_name TEXT NOT NULL,         -- Display name
    platform TEXT NOT NULL CHECK (platform IN ('telegram', 'whatsapp', 'web')),
    
    -- Timestamp
    added_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- One referee per user per goal per platform
    UNIQUE(goal_id, user_id, platform)
);

-- ============================================================
-- TABLE: votes
-- Individual votes from referees
-- ============================================================
CREATE TABLE votes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- References
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    referee_id UUID NOT NULL REFERENCES referees(id) ON DELETE CASCADE,
    
    -- Vote data
    week_number INTEGER NOT NULL CHECK (week_number >= 1),
    vote BOOLEAN NOT NULL,           -- true = yes/passed, false = no/failed
    
    -- Timestamp
    voted_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- One vote per referee per week per goal
    UNIQUE(goal_id, referee_id, week_number)
);

-- ============================================================
-- TABLE: weekly_results
-- Aggregated results for each week
-- ============================================================
CREATE TABLE weekly_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Reference
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    
    -- Week info
    week_number INTEGER NOT NULL CHECK (week_number >= 1),
    
    -- Vote counts
    yes_votes INTEGER DEFAULT 0,
    no_votes INTEGER DEFAULT 0,
    total_referees INTEGER NOT NULL,
    
    -- Result (NULL = voting in progress)
    passed BOOLEAN,                  -- NULL = pending, true = passed, false = failed
    
    -- Timestamps
    verification_sent_at TIMESTAMPTZ,-- When we asked for votes
    finalized_at TIMESTAMPTZ,        -- When result was determined
    
    -- One result per week per goal
    UNIQUE(goal_id, week_number)
);

-- ============================================================
-- TABLE: payments
-- Payment records from Omise
-- ============================================================
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Reference
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    
    -- Omise data
    omise_charge_id TEXT,            -- Omise charge ID (chrg_xxx)
    amount_thb INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    
    -- QR code
    qr_code_url TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- ============================================================
-- INDEXES for performance
-- ============================================================
CREATE INDEX idx_goals_status ON goals(status);
CREATE INDEX idx_goals_user_id ON goals(user_id);
CREATE INDEX idx_goals_platform_group ON goals(platform, group_id);
CREATE INDEX idx_referees_goal_id ON referees(goal_id);
CREATE INDEX idx_referees_user_id ON referees(user_id);
CREATE INDEX idx_votes_goal_week ON votes(goal_id, week_number);
CREATE INDEX idx_weekly_results_goal ON weekly_results(goal_id);
CREATE INDEX idx_payments_goal ON payments(goal_id);
CREATE INDEX idx_payments_omise_id ON payments(omise_charge_id);

-- ============================================================
-- TRIGGER: Auto-update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_goals_updated_at
    BEFORE UPDATE ON goals
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- ROW LEVEL SECURITY
-- For MVP, we allow all access via service role key
-- ============================================================
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE referees ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role access" ON goals FOR ALL USING (true);
CREATE POLICY "Service role access" ON referees FOR ALL USING (true);
CREATE POLICY "Service role access" ON votes FOR ALL USING (true);
CREATE POLICY "Service role access" ON weekly_results FOR ALL USING (true);
CREATE POLICY "Service role access" ON payments FOR ALL USING (true);

-- ============================================================
-- TABLE: progress_updates
-- Progress tracking with photos, location, and EXIF data
-- ============================================================
CREATE TABLE progress_updates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    week_number INTEGER NOT NULL CHECK (week_number >= 1),
    photo_urls TEXT[] DEFAULT '{}',
    location_lat DOUBLE PRECISION,
    location_lng DOUBLE PRECISION,
    notes TEXT,
    exif_timestamp TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_progress_goal_id ON progress_updates(goal_id);
CREATE INDEX idx_progress_goal_week ON progress_updates(goal_id, week_number);

-- RLS for progress_updates
ALTER TABLE progress_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role access" ON progress_updates FOR ALL USING (true);

-- ============================================================
-- ALTER goals: Add penalty_type and final_vote_status
-- ============================================================
ALTER TABLE goals ADD COLUMN penalty_type TEXT DEFAULT 'forfeited'
    CHECK (penalty_type IN ('delayed_refund', 'split_to_group', 'charity_donation', 'forfeited'));
ALTER TABLE goals ADD COLUMN final_vote_status TEXT DEFAULT 'not_started'
    CHECK (final_vote_status IN ('not_started', 'voting', 'finalized'));

-- ============================================================
-- ZKTLS INTEGRATION: Add verification columns to goals
-- ============================================================
ALTER TABLE goals ADD COLUMN verification_type TEXT DEFAULT 'manual'
    CHECK (verification_type IN ('manual', 'zktls', 'hybrid'));
ALTER TABLE goals ADD COLUMN reclaim_provider_id TEXT;
ALTER TABLE goals ADD COLUMN reclaim_provider_name TEXT;
ALTER TABLE goals ADD COLUMN zk_threshold_value INTEGER;
ALTER TABLE goals ADD COLUMN zk_threshold_type TEXT;

-- ============================================================
-- TABLE: zk_verifications
-- ZKTLS proof records for auto-verification
-- ============================================================
CREATE TABLE zk_verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- References
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    week_number INTEGER NOT NULL CHECK (week_number >= 1),

    -- Reclaim proof data
    provider_id TEXT NOT NULL,
    provider_name TEXT NOT NULL,
    proof_hash TEXT,
    proof_data JSONB,

    -- Extracted values
    extracted_value TEXT,
    extracted_parameters JSONB,

    -- Verification status
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'verified', 'failed', 'expired')),

    -- On-chain recording (optional)
    chain_tx_hash TEXT,
    chain_block_number INTEGER,

    -- Timestamps
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    verified_at TIMESTAMPTZ,

    UNIQUE(goal_id, week_number)
);

CREATE INDEX idx_zk_verifications_goal ON zk_verifications(goal_id);
CREATE INDEX idx_zk_verifications_status ON zk_verifications(status);

ALTER TABLE zk_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role access" ON zk_verifications FOR ALL USING (true);

-- ============================================================
-- ALTER goals: Add freeze & restake columns
-- ============================================================
ALTER TABLE goals ADD COLUMN hold_months INTEGER;
ALTER TABLE goals ADD COLUMN frozen_balance_thb INTEGER DEFAULT 0;
ALTER TABLE goals ADD COLUMN frozen_until TIMESTAMPTZ;
