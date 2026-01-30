# StakeIt Implementation Tasks

> **INSTRUCTIONS FOR CLAUDE:**
> 1. Complete tasks IN ORDER (dependencies matter!)
> 2. After each task, mark it `[x]` and git commit
> 3. Do NOT skip ahead - each task builds on previous ones
> 4. If a task fails after 3 attempts, document the error and continue

---

## PHASE 1: PROJECT SETUP
**Goal:** Initialize Next.js project with all dependencies

### Task 1.1: Initialize Next.js Project
- [x] Run: `npx create-next-app@14 . --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*"`
- [x] Verify `app/` directory exists (NOT `pages/`)
- [x] Verify `tailwind.config.ts` exists

### Task 1.2: Install Dependencies
- [x] Run: `npm install @supabase/supabase-js grammy omise twilio zod`
- [x] Verify all packages in package.json dependencies

### Task 1.3: Create Folder Structure
- [x] Create folder: `lib/`
- [x] Create folder: `types/`
- [x] Create folder: `supabase/`
- [x] Create folder: `specs/` (if not exists)

### Task 1.4: Create Environment File
- [x] Create `.env.example` with ALL variables:
```
NEXT_PUBLIC_BASE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
TELEGRAM_BOT_TOKEN=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_NUMBER=
OMISE_PUBLIC_KEY=
OMISE_SECRET_KEY=
```
- [x] Add `.env.local` to `.gitignore` (should already be there)

### Task 1.5: Update TypeScript Config
- [x] Verify `tsconfig.json` has `"strict": true`
- [x] Verify path alias `"@/*": ["./*"]` exists

### Task 1.6: Git Commit
- [x] Run: `git add -A && git commit -m "feat: initialize Next.js project with dependencies"`

---

## PHASE 2: DATABASE LAYER
**Goal:** Create database schema, types, and client

### Task 2.1: Create Database Schema
- [x] Create file: `supabase/schema.sql`
- [x] Add complete SQL from PRD Section 2 including:
  - All 5 tables (goals, referees, votes, weekly_results, payments)
  - All indexes
  - Updated_at trigger
  - RLS policies
- [x] Verify SQL is valid (no syntax errors)

### Task 2.2: Create TypeScript Types
- [x] Create file: `types/index.ts`
- [x] Add ALL types from PRD Section 3:
  - GoalStatus, Platform, PaymentStatus enums
  - Goal, Referee, Vote, WeeklyResult, Payment interfaces
  - CreateGoalRequest, CreateGoalResponse
  - VoteRequest, VoteResponse
  - GoalWithDetails
  - OmiseChargeResponse, OmiseWebhookEvent
  - TwilioWebhookBody
- [x] Export all types

### Task 2.3: Create Supabase Client
- [x] Create file: `lib/supabase.ts`
- [x] Initialize Supabase client with service role key
- [x] Implement these functions:
  - `createGoal(data: CreateGoalRequest): Promise<Goal>`
  - `getGoal(id: string): Promise<Goal | null>`
  - `getGoalWithDetails(id: string): Promise<GoalWithDetails | null>`
  - `updateGoal(id: string, updates: Partial<Goal>): Promise<Goal>`
  - `getGoalsByUser(userId: string): Promise<Goal[]>`
  - `getGoalsByGroup(platform: string, groupId: string): Promise<Goal[]>`
  - `createReferee(goalId: string, userId: string, userName: string, platform: Platform): Promise<Referee>`
  - `getReferees(goalId: string): Promise<Referee[]>`
  - `getRefereeByUserId(goalId: string, userId: string, platform: string): Promise<Referee | null>`
  - `submitVote(goalId: string, refereeId: string, week: number, vote: boolean): Promise<Vote>`
  - `hasVoted(goalId: string, refereeId: string, week: number): Promise<boolean>`
  - `getVotesForWeek(goalId: string, week: number): Promise<Vote[]>`
  - `getOrCreateWeeklyResult(goalId: string, week: number, totalReferees: number): Promise<WeeklyResult>`
  - `updateWeeklyResult(goalId: string, week: number, updates: Partial<WeeklyResult>): Promise<WeeklyResult>`
  - `createPayment(goalId: string, amountThb: number, qrUrl: string, chargeId: string): Promise<Payment>`
  - `completePayment(chargeId: string): Promise<Payment | null>`
- [x] Each function must have proper error handling with try/catch

### Task 2.4: Git Commit
- [x] Run: `git add -A && git commit -m "feat: add database schema, types, and Supabase client"`

---

## PHASE 3: CORE API ROUTES
**Goal:** Create all API endpoints

### Task 3.1: Create Health Check Endpoint
- [x] Create file: `app/api/health/route.ts`
- [x] Implement GET handler returning:
```json
{ "status": "ok", "timestamp": "...", "service": "StakeIt API" }
```

### Task 3.2: Create Goals List/Create Endpoint
- [x] Create file: `app/api/goals/route.ts`
- [x] Implement POST handler:
  - Validate request with Zod schema
  - Call createGoal from supabase.ts
  - Call createPromptPayCharge from omise.ts (create stub for now)
  - Call createPayment from supabase.ts
  - Return goal with QR URL
- [x] Implement GET handler:
  - Accept query params: userId OR (platform + groupId)
  - Return filtered goals array

### Task 3.3: Create Single Goal Endpoint
- [x] Create file: `app/api/goals/[id]/route.ts`
- [x] Implement GET handler:
  - Get goal ID from params
  - Call getGoalWithDetails
  - Return 404 if not found
  - Return goal with referees and weekly_results

### Task 3.4: Create Vote Endpoint
- [x] Create file: `app/api/goals/[id]/vote/route.ts`
- [x] Implement POST handler:
  - Validate request with Zod
  - Check goal exists and is active
  - Check voter is not goal owner
  - Get or create referee
  - Check not already voted
  - Submit vote
  - Calculate results
  - Update weekly_result
  - If majority reached, update goal progress
  - Return vote status

### Task 3.5: Git Commit
- [x] Run: `git add -A && git commit -m "feat: add core API routes for goals and voting"`

---

## PHASE 4: PAYMENT INTEGRATION
**Goal:** Integrate Omise for PromptPay payments

### Task 4.1: Create Omise Client
- [x] Create file: `lib/omise.ts`
- [x] Initialize Omise with keys from env
- [x] Implement `createPromptPayCharge(amountThb, goalId, userId, description)`:
  - Create source with type 'promptpay'
  - Create charge with source and metadata
  - Extract QR URL from response
  - Return { chargeId, qrCodeUrl, amount }
- [x] Implement `parseWebhookEvent(body)`:
  - Validate event structure
  - Return typed event or null
- [x] Implement `isChargeComplete(event)`:
  - Check event.key === 'charge.complete'
  - Check event.data.status === 'successful'

### Task 4.2: Create Payment Webhook Endpoint
- [x] Create file: `app/api/payments/webhook/route.ts`
- [x] Implement POST handler:
  - Parse JSON body
  - Call parseWebhookEvent
  - If charge.complete:
    - Get goalId from metadata
    - Call completePayment
    - Get updated goal
    - Trigger notification (stub for now)
  - Always return { received: true }
- [x] Implement GET handler returning status message

### Task 4.3: Update Goals Route to Use Omise
- [x] Update `app/api/goals/route.ts` POST handler:
  - After creating goal, call createPromptPayCharge
  - Call createPayment with charge details
  - Return paymentQrUrl in response

### Task 4.4: Git Commit
- [x] Run: `git add -A && git commit -m "feat: add Omise payment integration"`

---

## PHASE 5: TELEGRAM BOT
**Goal:** Create fully functional Telegram bot

### Task 5.1: Create Telegram Bot Core
- [x] Create file: `lib/telegram.ts`
- [x] Initialize Grammy Bot with token from env
- [x] Create command parser function for /commit

### Task 5.2: Implement /start Command
- [x] Add bot.command('start', ...) handler
- [x] Send welcome message with instructions

### Task 5.3: Implement /help Command
- [x] Add bot.command('help', ...) handler
- [x] Send command list with examples

### Task 5.4: Implement /commit Command
- [x] Add bot.command('commit', ...) handler
- [x] Parse command: /commit "goal" amount weeks
- [x] Validate inputs (amount > 0, weeks 1-52)
- [x] Check if in group (not private chat)
- [x] Create goal via createGoal
- [x] Create payment via createPromptPayCharge
- [x] Save payment via createPayment
- [x] Send message with goal details
- [x] Send QR code image with ctx.replyWithPhoto

### Task 5.5: Implement /status Command
- [x] Add bot.command('status', ...) handler
- [x] Get user's goals via getGoalsByUser
- [x] Format and send list of active goals

### Task 5.6: Implement /goals Command
- [x] Add bot.command('goals', ...) handler
- [x] Check if in group
- [x] Get group's goals via getGoalsByGroup
- [x] Format and send list

### Task 5.7: Implement Voting Buttons
- [x] Create function: sendVerificationRequest(goal, weekNumber)
  - Build InlineKeyboard with Yes/No buttons
  - Callback data format: vote_yes_{goalId}_{week}
  - Send to group
- [x] Add bot.on('callback_query:data', ...) handler
  - Parse callback data
  - Validate voter (not goal owner)
  - Get or create referee
  - Check not already voted
  - Submit vote
  - Update message with results
  - Answer callback query

### Task 5.8: Create Webhook Route
- [x] Create file: `app/api/telegram/webhook/route.ts`
- [x] Import webhookCallback from grammy
- [x] Export POST handler using webhookCallback
- [x] Export GET handler for verification

### Task 5.9: Add Notification Functions
- [x] In lib/telegram.ts, add:
  - `notifyGoalActivated(goal)` - Send activation message to group
  - `notifyWeekResult(goal, week, passed)` - Send week result to group
  - `notifyGoalComplete(goal)` - Send final result to group

### Task 5.10: Update Payment Webhook
- [x] Update `app/api/payments/webhook/route.ts`:
  - After completePayment, check platform
  - If telegram, call notifyGoalActivated

### Task 5.11: Git Commit
- [x] Run: `git add -A && git commit -m "feat: add complete Telegram bot"`

---

## PHASE 6: WHATSAPP BOT
**Goal:** Create WhatsApp integration via Twilio

### Task 6.1: Create WhatsApp Client
- [ ] Create file: `lib/whatsapp.ts`
- [ ] Initialize Twilio client with credentials from env
- [ ] Implement `sendWhatsAppMessage(to, body)`
- [ ] Implement `sendWhatsAppMediaMessage(to, body, mediaUrl)`

### Task 6.2: Create Message Parser
- [ ] Implement `parseWhatsAppMessage(body)`:
  - Check for "help" → return { command: 'help' }
  - Check for "status" → return { command: 'status' }
  - Check for "commit ..." → parse and return { command: 'commit', goalName, amount, weeks }
  - Check for "vote ... yes/no" → return { command: 'vote', goalId, vote }
  - Return null if no match

### Task 6.3: Create Message Handlers
- [ ] Implement `handleWhatsAppMessage(from, body, profileName)`:
  - Parse message
  - If null, return help text
  - Switch on command:
    - help: return help text
    - status: get goals, format, return
    - commit: create goal, send QR, return confirmation
    - vote: process vote, return result

### Task 6.4: Create Webhook Route
- [ ] Create file: `app/api/whatsapp/webhook/route.ts`
- [ ] Implement POST handler:
  - Parse form data (Twilio sends form-encoded)
  - Extract From, Body, ProfileName
  - Call handleWhatsAppMessage
  - Return TwiML XML response
- [ ] Implement GET handler for verification

### Task 6.5: Add WhatsApp Notifications
- [ ] In lib/whatsapp.ts, add:
  - `notifyWhatsAppGoalActivated(goal)`
  - `sendWhatsAppVerificationRequest(goal, week, refereePhone)`

### Task 6.6: Update Payment Webhook
- [ ] Update `app/api/payments/webhook/route.ts`:
  - If platform === 'whatsapp', call notifyWhatsAppGoalActivated

### Task 6.7: Git Commit
- [ ] Run: `git add -A && git commit -m "feat: add WhatsApp bot integration"`

---

## PHASE 7: FRONTEND
**Goal:** Create web interface with Tailwind

### Task 7.1: Update Global Styles
- [ ] Update `app/globals.css`:
  - Keep Tailwind imports
  - Add smooth scrolling
  - Add focus ring styles

### Task 7.2: Update Layout
- [ ] Update `app/layout.tsx`:
  - Set metadata (title, description)
  - Use Inter font
  - Wrap children in providers if needed

### Task 7.3: Create Landing Page
- [ ] Update `app/page.tsx`:
  - Hero section with gradient background
  - Headline: "Put Your Money Where Your Mouth Is"
  - CTA buttons: Create Goal, Use Telegram
  - How it works section (4 steps with icons)
  - Platform options section
  - Footer

### Task 7.4: Create Goal Creation Page
- [ ] Create file: `app/goals/new/page.tsx`
- [ ] Use 'use client' directive
- [ ] Create form with useState:
  - Goal name input
  - Description textarea
  - Stake amount input (number)
  - Duration select (1, 2, 4, 8, 12, 26, 52 weeks)
- [ ] Handle submit:
  - Call POST /api/goals
  - On success, show QR code
  - On error, show error message
- [ ] Style with Tailwind (cards, inputs, buttons)

### Task 7.5: Create Goal Detail Page
- [ ] Create file: `app/goals/[id]/page.tsx`
- [ ] Use 'use client' directive
- [ ] Fetch goal on mount with useEffect
- [ ] Display:
  - Goal header (name, status badge)
  - Stats row (stake, current week, weeks passed)
  - Description if exists
  - QR code if pending_payment
  - Weekly timeline (all weeks with status)
  - Referees list
  - Goal ID at bottom
- [ ] Handle loading and error states

### Task 7.6: Git Commit
- [ ] Run: `git add -A && git commit -m "feat: add frontend pages"`

---

## PHASE 8: FINAL TOUCHES
**Goal:** Complete documentation and testing

### Task 8.1: Create README
- [ ] Create/update `README.md`:
  - Project description
  - Tech stack
  - Setup instructions
  - Environment variables
  - Running locally
  - Deployment steps
  - Bot command reference

### Task 8.2: Update next.config.js
- [ ] Add image domains for Omise QR codes:
```javascript
images: {
  remotePatterns: [
    { protocol: 'https', hostname: '*.omise.co' },
  ],
}
```

### Task 8.3: Verify All Files Exist
- [ ] Check all files from CLAUDE.md structure exist
- [ ] Verify no TypeScript errors: `npm run build`

### Task 8.4: Final Git Commit
- [ ] Run: `git add -A && git commit -m "feat: complete StakeIt MVP"`

---

## ✅ COMPLETION CHECKLIST

After all tasks are done:

- [ ] All API routes return valid JSON
- [ ] Telegram commands work (/start, /help, /commit, /status)
- [ ] WhatsApp commands work (help, commit, status, vote)
- [ ] QR code generated for new goals
- [ ] Voting updates weekly results
- [ ] Frontend pages render without errors
- [ ] No TypeScript errors
- [ ] All files committed to git
