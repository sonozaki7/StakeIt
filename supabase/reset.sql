-- ============================================================
-- STAKEIT - FULL DATABASE RESET SCRIPT
-- ============================================================
-- This drops ALL existing tables and recreates everything
-- from scratch to match the application code exactly.
--
-- WARNING: This will DELETE all existing data.
-- Run this in Supabase SQL Editor (https://supabase.com/dashboard)
-- ============================================================

-- Drop existing function (cascades to trigger automatically)
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- Drop existing tables (in dependency order)
DROP TABLE IF EXISTS zk_verifications CASCADE;
DROP TABLE IF EXISTS progress_updates CASCADE;
DROP TABLE IF EXISTS votes CASCADE;
DROP TABLE IF EXISTS weekly_results CASCADE;
DROP TABLE IF EXISTS referees CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS goals CASCADE;

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLE: goals
-- ============================================================
CREATE TABLE goals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- User who created the goal
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,

    -- Goal details
    goal_name TEXT NOT NULL,
    description TEXT,

    -- Stake configuration
    stake_amount_thb INTEGER NOT NULL CHECK (stake_amount_thb > 0),
    duration_weeks INTEGER NOT NULL CHECK (duration_weeks BETWEEN 1 AND 52),

    -- Status tracking
    status TEXT NOT NULL DEFAULT 'pending_payment'
        CHECK (status IN ('pending_payment', 'active', 'completed', 'failed', 'refunded')),

    -- Platform and group info
    platform TEXT NOT NULL CHECK (platform IN ('telegram', 'whatsapp', 'web')),
    group_id TEXT,
    group_name TEXT,

    -- Progress tracking
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    current_week INTEGER DEFAULT 0,
    weeks_passed INTEGER DEFAULT 0,
    weeks_failed INTEGER DEFAULT 0,

    -- Payment info
    payment_id TEXT,
    payment_qr_url TEXT,

    -- Penalty & final vote
    penalty_type TEXT DEFAULT 'forfeited'
        CHECK (penalty_type IN ('delayed_refund', 'split_to_group', 'charity_donation', 'forfeited')),
    final_vote_status TEXT DEFAULT 'not_started'
        CHECK (final_vote_status IN ('not_started', 'voting', 'finalized')),

    -- ZKTLS verification
    verification_type TEXT DEFAULT 'manual'
        CHECK (verification_type IN ('manual', 'zktls', 'hybrid')),
    reclaim_provider_id TEXT,
    reclaim_provider_name TEXT,
    zk_threshold_value INTEGER,
    zk_threshold_type TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: referees
-- ============================================================
CREATE TABLE referees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    platform TEXT NOT NULL CHECK (platform IN ('telegram', 'whatsapp', 'web')),
    added_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(goal_id, user_id, platform)
);

-- ============================================================
-- TABLE: votes
-- ============================================================
CREATE TABLE votes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    referee_id UUID NOT NULL REFERENCES referees(id) ON DELETE CASCADE,
    week_number INTEGER NOT NULL CHECK (week_number >= 1),
    vote BOOLEAN NOT NULL,
    voted_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(goal_id, referee_id, week_number)
);

-- ============================================================
-- TABLE: weekly_results
-- ============================================================
CREATE TABLE weekly_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    week_number INTEGER NOT NULL CHECK (week_number >= 1),
    yes_votes INTEGER DEFAULT 0,
    no_votes INTEGER DEFAULT 0,
    total_referees INTEGER NOT NULL,
    passed BOOLEAN,
    verification_sent_at TIMESTAMPTZ,
    finalized_at TIMESTAMPTZ,

    UNIQUE(goal_id, week_number)
);

-- ============================================================
-- TABLE: payments
-- ============================================================
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    omise_charge_id TEXT,
    amount_thb INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    qr_code_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- ============================================================
-- TABLE: progress_updates
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

-- ============================================================
-- TABLE: zk_verifications
-- ============================================================
CREATE TABLE zk_verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    week_number INTEGER NOT NULL CHECK (week_number >= 1),
    provider_id TEXT NOT NULL,
    provider_name TEXT NOT NULL,
    proof_hash TEXT,
    proof_data JSONB,
    extracted_value TEXT,
    extracted_parameters JSONB,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'verified', 'failed', 'expired')),
    chain_tx_hash TEXT,
    chain_block_number INTEGER,
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    verified_at TIMESTAMPTZ,

    UNIQUE(goal_id, week_number)
);

-- ============================================================
-- INDEXES
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
CREATE INDEX idx_progress_goal_id ON progress_updates(goal_id);
CREATE INDEX idx_progress_goal_week ON progress_updates(goal_id, week_number);
CREATE INDEX idx_zk_verifications_goal ON zk_verifications(goal_id);
CREATE INDEX idx_zk_verifications_status ON zk_verifications(status);

-- ============================================================
-- TRIGGER: Auto-update updated_at on goals
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
-- ============================================================
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE referees ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE zk_verifications ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (MVP)
CREATE POLICY "Service role access" ON goals FOR ALL USING (true);
CREATE POLICY "Service role access" ON referees FOR ALL USING (true);
CREATE POLICY "Service role access" ON votes FOR ALL USING (true);
CREATE POLICY "Service role access" ON weekly_results FOR ALL USING (true);
CREATE POLICY "Service role access" ON payments FOR ALL USING (true);
CREATE POLICY "Service role access" ON progress_updates FOR ALL USING (true);
CREATE POLICY "Service role access" ON zk_verifications FOR ALL USING (true);

-- ============================================================
-- STORAGE BUCKET: progress-photos
-- ============================================================
-- NOTE: Run this separately if it fails (bucket may already exist)
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('progress-photos', 'progress-photos', true)
-- ON CONFLICT (id) DO NOTHING;
