# StakeIt MVP - Complete Technical PRD

## 1. PRODUCT OVERVIEW

### 1.1 What Is StakeIt?
A commitment contract platform where users:
1. Set a goal (e.g., "Exercise 3x per week")
2. Stake money (e.g., ฿1,000 THB)
3. Add friends as referees in a Telegram/WhatsApp group
4. Friends vote weekly: "Did they complete it?"
5. Complete majority of weeks → Get money back. Fail → Lose it.

### 1.2 User Flow Diagram
```
┌─────────────────────────────────────────────────────────────────────────┐
│                           USER JOURNEY                                   │
└─────────────────────────────────────────────────────────────────────────┘

[1] CREATE GOAL
    User in Telegram Group: "/commit Exercise 1000 4"
                                      │
                                      ▼
    Bot responds: "Goal created! Scan QR to pay ฿1,000"
                                      │
                                      ▼
    [QR CODE IMAGE]
    
[2] PAY
    User opens banking app → Scans QR → Pays ฿1,000
                                      │
                                      ▼
    Omise webhook fires → API updates goal status to "active"
                                      │
                                      ▼
    Bot messages group: "✅ Goal activated! Week 1 starts now!"

[3] WEEKLY VERIFICATION (repeats each week)
    Bot messages group: "Did @user exercise this week? [✅ Yes] [❌ No]"
                                      │
                                      ▼
    Group members click buttons to vote
                                      │
                                      ▼
    Majority YES → Week passes
    Majority NO → Week fails

[4] COMPLETION
    After final week:
    - If majority weeks passed → "🎉 Success! ฿1,000 refunded"
    - If not → "😢 Failed. ฿1,000 forfeited"
```

---

## 2. DATABASE SCHEMA

### 2.1 Complete SQL Schema (supabase/schema.sql)

```sql
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
```

---

## 3. TYPESCRIPT TYPES

### 3.1 Complete Types (types/index.ts)

```typescript
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
```

---

## 4. API ENDPOINTS SPECIFICATION

### 4.1 GET /api/health
**Purpose:** Health check endpoint
**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-01-30T12:00:00.000Z",
  "service": "StakeIt API"
}
```

### 4.2 POST /api/goals
**Purpose:** Create a new goal and generate payment QR
**Request Body:**
```json
{
  "goalName": "Exercise 3x per week",
  "description": "Go to gym or run outdoors",
  "stakeAmountThb": 1000,
  "durationWeeks": 4,
  "platform": "telegram",
  "groupId": "-1001234567890",
  "groupName": "Fitness Group",
  "userId": "123456789",
  "userName": "john_doe",
  "referees": []
}
```
**Response (201 Created):**
```json
{
  "success": true,
  "goal": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "pending_payment",
    "paymentQrUrl": "https://api.omise.co/charges/chrg_xxx/documents/qrcode.png",
    "stakeAmountThb": 1000
  }
}
```

### 4.3 GET /api/goals
**Purpose:** List goals (filter by userId or groupId)
**Query Parameters:**
- `userId` - Get goals for a specific user
- `platform` + `groupId` - Get goals for a specific group
**Response:**
```json
{
  "success": true,
  "goals": [...]
}
```

### 4.4 GET /api/goals/[id]
**Purpose:** Get single goal with all details
**Response:**
```json
{
  "success": true,
  "goal": {
    "id": "...",
    "goal_name": "...",
    "referees": [...],
    "weekly_results": [...],
    "votes": [...]
  }
}
```

### 4.5 POST /api/goals/[id]/vote
**Purpose:** Submit a vote for a specific week
**Request Body:**
```json
{
  "refereeUserId": "111222333",
  "refereeUserName": "alice",
  "refereePlatform": "telegram",
  "week": 1,
  "vote": true
}
```
**Response:**
```json
{
  "success": true,
  "weekStatus": {
    "yesVotes": 2,
    "noVotes": 1,
    "totalReferees": 3,
    "passed": true
  }
}
```

### 4.6 POST /api/telegram/webhook
**Purpose:** Handle Telegram bot updates
**Request:** Telegram Update object (handled by Grammy)
**Response:** 200 OK

### 4.7 POST /api/whatsapp/webhook
**Purpose:** Handle incoming WhatsApp messages
**Request:** Twilio form-encoded webhook
**Response:** TwiML XML response

### 4.8 POST /api/payments/webhook
**Purpose:** Handle Omise payment events
**Request:** Omise webhook event
**Response:**
```json
{ "received": true }
```

---

## 5. TELEGRAM BOT SPECIFICATION

### 5.1 Commands

| Command | Format | Description |
|---------|--------|-------------|
| /start | `/start` | Welcome message with instructions |
| /help | `/help` | List all commands |
| /commit | `/commit "goal" amount weeks` | Create new goal |
| /status | `/status` | Show user's active goals |
| /goals | `/goals` | Show all goals in current group |

### 5.2 Command Parsing Rules

**/commit command format:**
```
/commit "Goal Name" 1000 4
/commit Goal_Name 1000 4
```
- Goal name: quoted string OR single word (no spaces)
- Amount: positive integer (THB)
- Weeks: positive integer (1-52)

**Regex for parsing:**
```typescript
/^\/commit\s+(?:"([^"]+)"|(\S+))\s+(\d+)\s+(\d+)$/
```

### 5.3 Inline Voting Buttons

When verification is needed, send message with InlineKeyboard:
```
🎯 Weekly Check-in

Did @john_doe complete their goal "Exercise 3x per week" this week?

[✅ Yes, they did!] [❌ No]
```

Callback data format: `vote_yes_{goalId}_{weekNumber}` or `vote_no_{goalId}_{weekNumber}`

### 5.4 Bot Response Templates

**Welcome (/start):**
```
🎯 Welcome to StakeIt!

Put your money where your mouth is. Create commitment contracts with your friends as referees.

Commands:
/commit "goal" amount weeks - Create a goal
/status - Your active goals
/help - All commands

Example: /commit "Exercise 3x/week" 1000 4
```

**Goal Created:**
```
🎯 New Goal Created!

Goal: {goalName}
Stake: ฿{amount}
Duration: {weeks} weeks
By: @{userName}

📱 Scan to pay and activate:
[QR CODE IMAGE]
```

**Payment Confirmed:**
```
✅ Payment received!

Goal "{goalName}" is now ACTIVE.
Week 1 starts now.

I'll check in with the group each week for verification.
Good luck! 💪
```

**Week Verified:**
```
📊 Week {n} Results

Goal: {goalName}
By: @{userName}

Votes: ✅ {yes} / ❌ {no}
Result: {PASSED ✅ | FAILED ❌}

Progress: {weeksPassed}/{totalWeeks} weeks passed
```

---

## 6. WHATSAPP BOT SPECIFICATION

### 6.1 Text Commands (no slash prefix)

| Command | Format | Description |
|---------|--------|-------------|
| help | `help` or `hi` | Show instructions |
| commit | `commit "goal" amount weeks` | Create goal |
| status | `status` | Show active goals |
| vote | `vote {goalId} yes/no` | Vote on a goal |

### 6.2 Response Format

WhatsApp responses use Twilio TwiML:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Your response text here</Message>
</Response>
```

### 6.3 Sending Media (QR Code)

Use Twilio client to send media:
```typescript
await twilioClient.messages.create({
  from: process.env.TWILIO_WHATSAPP_NUMBER,
  to: userPhone,
  body: 'Scan to pay:',
  mediaUrl: [qrCodeUrl]
});
```

---

## 7. PAYMENT FLOW (OMISE)

### 7.1 Create PromptPay Charge

```typescript
// 1. Create source
const source = await omise.sources.create({
  type: 'promptpay',
  amount: amountThb * 100, // Convert to satangs
  currency: 'thb',
});

// 2. Create charge
const charge = await omise.charges.create({
  amount: amountThb * 100,
  currency: 'thb',
  source: source.id,
  metadata: {
    goal_id: goalId,
    user_id: userId,
  },
});

// 3. Get QR URL
const qrUrl = charge.source.scannable_code.image.download_uri;
```

### 7.2 Webhook Events

**charge.complete** - Payment successful
```json
{
  "key": "charge.complete",
  "data": {
    "id": "chrg_xxx",
    "status": "successful",
    "metadata": {
      "goal_id": "xxx"
    }
  }
}
```

On receiving this:
1. Find payment by `omise_charge_id`
2. Update payment status to 'completed'
3. Update goal status to 'active'
4. Set goal `start_date` to now
5. Set goal `current_week` to 1
6. Send notification to user/group

---

## 8. VOTING LOGIC

### 8.1 Vote Processing Rules

1. **Who can vote:** Anyone in the group EXCEPT the goal owner
2. **One vote per person per week:** Enforced by database UNIQUE constraint
3. **First-time voters:** Automatically added as referees
4. **Majority calculation:** `yesVotes > totalReferees / 2`

### 8.2 Vote Processing Flow

```typescript
async function processVote(goalId: string, refereeUserId: string, week: number, vote: boolean) {
  // 1. Get or create referee
  let referee = await getRefereeByUserId(goalId, refereeUserId);
  if (!referee) {
    referee = await createReferee(goalId, refereeUserId, userName, platform);
  }
  
  // 2. Check not already voted
  if (await hasVoted(goalId, referee.id, week)) {
    throw new Error('Already voted');
  }
  
  // 3. Submit vote
  await submitVote(goalId, referee.id, week, vote);
  
  // 4. Calculate results
  const referees = await getReferees(goalId);
  const votes = await getVotesForWeek(goalId, week);
  const yesVotes = votes.filter(v => v.vote).length;
  const noVotes = votes.filter(v => !v.vote).length;
  
  // 5. Check if majority reached
  const majorityNeeded = Math.floor(referees.length / 2) + 1;
  let passed = null;
  
  if (yesVotes >= majorityNeeded) passed = true;
  else if (noVotes >= majorityNeeded) passed = false;
  
  // 6. Update weekly result
  await updateWeeklyResult(goalId, week, { yesVotes, noVotes, passed });
  
  // 7. If finalized, update goal
  if (passed !== null) {
    await updateGoalProgress(goalId, passed);
  }
  
  return { yesVotes, noVotes, totalReferees: referees.length, passed };
}
```

---

## 9. FRONTEND PAGES

### 9.1 Landing Page (app/page.tsx)
- Hero section with tagline
- How it works (4 steps)
- Platform options (Telegram, WhatsApp, Web)
- CTA buttons

### 9.2 Create Goal Page (app/goals/new/page.tsx)
- Form with: goal name, description, amount, duration
- On submit: call POST /api/goals
- Show QR code on success

### 9.3 Goal Detail Page (app/goals/[id]/page.tsx)
- Goal info header (name, stake, status)
- Progress stats (weeks passed/failed)
- Weekly timeline showing each week's status
- Referee list
- QR code if pending payment

---

## 10. ERROR HANDLING

### 10.1 API Error Responses

All errors return:
```json
{
  "success": false,
  "error": "Human readable message",
  "code": "ERROR_CODE",
  "details": {}
}
```

### 10.2 Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| VALIDATION_ERROR | 400 | Invalid request body |
| NOT_FOUND | 404 | Resource not found |
| ALREADY_VOTED | 400 | User already voted this week |
| SELF_VOTE | 403 | Cannot vote on own goal |
| GOAL_NOT_ACTIVE | 400 | Goal is not in active status |
| PAYMENT_FAILED | 500 | Omise payment creation failed |
| DATABASE_ERROR | 500 | Supabase operation failed |
