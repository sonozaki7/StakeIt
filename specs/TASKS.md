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
- [ ] Run: `npx create-next-app@14 . --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*"`
- [ ] Verify `app/` directory exists (NOT `pages/`)
- [ ] Verify `tailwind.config.ts` exists

### Task 1.2: Install Dependencies
- [ ] Run: `npm install @supabase/supabase-js grammy omise twilio zod`
- [ ] Verify all packages in package.json dependencies

### Task 1.3: Create Folder Structure
- [ ] Create folder: `lib/`
- [ ] Create folder: `types/`
- [ ] Create folder: `supabase/`
- [ ] Create folder: `specs/` (if not exists)

### Task 1.4: Create Environment File
- [ ] Create `.env.example` with ALL variables:
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
- [ ] Add `.env.local` to `.gitignore` (should already be there)

### Task 1.5: Update TypeScript Config
- [ ] Verify `tsconfig.json` has `"strict": true`
- [ ] Verify path alias `"@/*": ["./*"]` exists

### Task 1.6: Git Commit
- [ ] Run: `git add -A && git commit -m "feat: initialize Next.js project with dependencies"`

---

## PHASE 2: DATABASE LAYER
**Goal:** Create database schema, types, and client

### Task 2.1: Create Database Schema
- [ ] Create file: `supabase/schema.sql`
- [ ] Add complete SQL from PRD Section 2 including:
  - All 5 tables (goals, referees, votes, weekly_results, payments)
  - All indexes
  - Updated_at trigger
  - RLS policies
- [ ] Verify SQL is valid (no syntax errors)

### Task 2.2: Create TypeScript Types
- [ ] Create file: `types/index.ts`
- [ ] Add ALL types from PRD Section 3:
  - GoalStatus, Platform, PaymentStatus enums
  - Goal, Referee, Vote, WeeklyResult, Payment interfaces
  - CreateGoalRequest, CreateGoalResponse
  - VoteRequest, VoteResponse
  - GoalWithDetails
  - OmiseChargeResponse, OmiseWebhookEvent
  - TwilioWebhookBody
- [ ] Export all types

### Task 2.3: Create Supabase Client
- [ ] Create file: `lib/supabase.ts`
- [ ] Initialize Supabase client with service role key
- [ ] Implement these functions:
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
- [ ] Each function must have proper error handling with try/catch

### Task 2.4: Git Commit
- [ ] Run: `git add -A && git commit -m "feat: add database schema, types, and Supabase client"`

---

## PHASE 3: CORE API ROUTES
**Goal:** Create all API endpoints

### Task 3.1: Create Health Check Endpoint
- [ ] Create file: `app/api/health/route.ts`
- [ ] Implement GET handler returning:
```json
{ "status": "ok", "timestamp": "...", "service": "StakeIt API" }
```

### Task 3.2: Create Goals List/Create Endpoint
- [ ] Create file: `app/api/goals/route.ts`
- [ ] Implement POST handler:
  - Validate request with Zod schema
  - Call createGoal from supabase.ts
  - Call createPromptPayCharge from omise.ts (create stub for now)
  - Call createPayment from supabase.ts
  - Return goal with QR URL
- [ ] Implement GET handler:
  - Accept query params: userId OR (platform + groupId)
  - Return filtered goals array

### Task 3.3: Create Single Goal Endpoint
- [ ] Create file: `app/api/goals/[id]/route.ts`
- [ ] Implement GET handler:
  - Get goal ID from params
  - Call getGoalWithDetails
  - Return 404 if not found
  - Return goal with referees and weekly_results

### Task 3.4: Create Vote Endpoint
- [ ] Create file: `app/api/goals/[id]/vote/route.ts`
- [ ] Implement POST handler:
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
- [ ] Run: `git add -A && git commit -m "feat: add core API routes for goals and voting"`

---

## PHASE 4: PAYMENT INTEGRATION
**Goal:** Integrate Omise for PromptPay payments

### Task 4.1: Create Omise Client
- [ ] Create file: `lib/omise.ts`
- [ ] Initialize Omise with keys from env
- [ ] Implement `createPromptPayCharge(amountThb, goalId, userId, description)`:
  - Create source with type 'promptpay'
  - Create charge with source and metadata
  - Extract QR URL from response
  - Return { chargeId, qrCodeUrl, amount }
- [ ] Implement `parseWebhookEvent(body)`:
  - Validate event structure
  - Return typed event or null
- [ ] Implement `isChargeComplete(event)`:
  - Check event.key === 'charge.complete'
  - Check event.data.status === 'successful'

### Task 4.2: Create Payment Webhook Endpoint
- [ ] Create file: `app/api/payments/webhook/route.ts`
- [ ] Implement POST handler:
  - Parse JSON body
  - Call parseWebhookEvent
  - If charge.complete:
    - Get goalId from metadata
    - Call completePayment
    - Get updated goal
    - Trigger notification (stub for now)
  - Always return { received: true }
- [ ] Implement GET handler returning status message

### Task 4.3: Update Goals Route to Use Omise
- [ ] Update `app/api/goals/route.ts` POST handler:
  - After creating goal, call createPromptPayCharge
  - Call createPayment with charge details
  - Return paymentQrUrl in response

### Task 4.4: Git Commit
- [ ] Run: `git add -A && git commit -m "feat: add Omise payment integration"`

---

## PHASE 5: TELEGRAM BOT
**Goal:** Create fully functional Telegram bot

### Task 5.1: Create Telegram Bot Core
- [ ] Create file: `lib/telegram.ts`
- [ ] Initialize Grammy Bot with token from env
- [ ] Create command parser function for /commit

### Task 5.2: Implement /start Command
- [ ] Add bot.command('start', ...) handler
- [ ] Send welcome message with instructions

### Task 5.3: Implement /help Command
- [ ] Add bot.command('help', ...) handler
- [ ] Send command list with examples

### Task 5.4: Implement /commit Command
- [ ] Add bot.command('commit', ...) handler
- [ ] Parse command: /commit "goal" amount weeks
- [ ] Validate inputs (amount > 0, weeks 1-52)
- [ ] Check if in group (not private chat)
- [ ] Create goal via createGoal
- [ ] Create payment via createPromptPayCharge
- [ ] Save payment via createPayment
- [ ] Send message with goal details
- [ ] Send QR code image with ctx.replyWithPhoto

### Task 5.5: Implement /status Command
- [ ] Add bot.command('status', ...) handler
- [ ] Get user's goals via getGoalsByUser
- [ ] Format and send list of active goals

### Task 5.6: Implement /goals Command
- [ ] Add bot.command('goals', ...) handler
- [ ] Check if in group
- [ ] Get group's goals via getGoalsByGroup
- [ ] Format and send list

### Task 5.7: Implement Voting Buttons
- [ ] Create function: sendVerificationRequest(goal, weekNumber)
  - Build InlineKeyboard with Yes/No buttons
  - Callback data format: vote_yes_{goalId}_{week}
  - Send to group
- [ ] Add bot.on('callback_query:data', ...) handler
  - Parse callback data
  - Validate voter (not goal owner)
  - Get or create referee
  - Check not already voted
  - Submit vote
  - Update message with results
  - Answer callback query

### Task 5.8: Create Webhook Route
- [ ] Create file: `app/api/telegram/webhook/route.ts`
- [ ] Import webhookCallback from grammy
- [ ] Export POST handler using webhookCallback
- [ ] Export GET handler for verification

### Task 5.9: Add Notification Functions
- [ ] In lib/telegram.ts, add:
  - `notifyGoalActivated(goal)` - Send activation message to group
  - `notifyWeekResult(goal, week, passed)` - Send week result to group
  - `notifyGoalComplete(goal)` - Send final result to group

### Task 5.10: Update Payment Webhook
- [ ] Update `app/api/payments/webhook/route.ts`:
  - After completePayment, check platform
  - If telegram, call notifyGoalActivated

### Task 5.11: Git Commit
- [ ] Run: `git add -A && git commit -m "feat: add complete Telegram bot"`

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
