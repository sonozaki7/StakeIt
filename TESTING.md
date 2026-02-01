# StakeIt - Complete Testing Guide

Everything you need to verify the app works before demo day.

---

## 1. Environment Setup

### 1.1 Install Dependencies

```bash
cd ~/workspace
npm install
```

### 1.2 Environment Variables

Copy the template and fill in your keys:

```bash
cp .env.example .env.local
```

Required values (minimum for demo):

| Variable | Where to get it | Required for |
|----------|----------------|--------------|
| `NEXT_PUBLIC_BASE_URL` | Your tunnel URL (see 1.4) | Everything |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase dashboard → Settings → API | Database |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → Settings → API → service_role | Database |
| `TELEGRAM_BOT_TOKEN` | @BotFather → `/newbot` | Telegram bot |
| `OMISE_PUBLIC_KEY` | Omise dashboard → Keys (use `pkey_test_...`) | Payments |
| `OMISE_SECRET_KEY` | Omise dashboard → Keys (use `skey_test_...`) | Payments |

Optional (skip for basic demo):

| Variable | Purpose |
|----------|---------|
| `RECLAIM_APP_ID` / `RECLAIM_APP_SECRET` | zkTLS auto-verification |
| `TWILIO_*` | WhatsApp bot |
| `THIRDWEB_SECRET_KEY` / `WALLET_PRIVATE_KEY` | On-chain recording |

### 1.3 Database Setup

1. Go to your Supabase project → SQL Editor
2. Paste the contents of `supabase/schema.sql` and run it
3. Verify tables exist: `goals`, `referees`, `votes`, `weekly_results`, `payments`, `progress_updates`, `zk_verifications`

### 1.4 Tunnel Setup (required for Telegram webhook)

Telegram needs a public HTTPS URL to send updates to your bot. Pick one:

**Option A: ngrok (if installed)**
```bash
ngrok http 3000
# Copy the https://xxxx.ngrok-free.app URL
```

**Option B: localtunnel (no install needed)**
```bash
npx localtunnel --port 3000
# Copy the https://xxxx.loca.lt URL
```

**Option C: cloudflared (if installed)**
```bash
cloudflared tunnel --url http://localhost:3000
# Copy the https://xxxx.trycloudflare.com URL
```

After getting your tunnel URL, update `.env.local`:
```bash
NEXT_PUBLIC_BASE_URL=https://YOUR_TUNNEL_URL
```

### 1.5 Start the App

```bash
npm run dev
```

Verify it's running:
```bash
curl http://localhost:3000/api/health
# Expected: {"status":"ok","timestamp":"...","service":"StakeIt API"}
```

### 1.6 Set Telegram Webhook

Replace the placeholders and run:

```bash
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"${NEXT_PUBLIC_BASE_URL}/api/telegram/webhook\"}"
```

Expected response:
```json
{"ok":true,"result":true,"description":"Webhook was set"}
```

Verify webhook is active:
```bash
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo" | python3 -m json.tool
```

### 1.7 Telegram Group Setup

1. Create a Telegram group (or use an existing one)
2. Add your bot to the group
3. **Important:** Make sure the bot can read messages — either:
   - Disable "Group Privacy" in @BotFather → `/mybots` → Bot Settings → Group Privacy → Turn off
   - Or make the bot an admin in the group

**Note:** No other group members are required. Verification is automated via zkTLS (primary) and system API (fallback). Friend voting is a last-resort option only.

---

## 2. Test Suite

### Test 1: Health Check

```bash
curl http://localhost:3000/api/health
```

- [ ] Returns `{"status":"ok",...}`

### Test 2: Landing Page

1. Open `http://localhost:3000` in browser
2. - [ ] Hero section loads
3. - [ ] Navigation links work

### Test 3: Telegram `/start` and `/help`

In your Telegram group:

```
/start
```
- [ ] Welcome message with commands list
- [ ] Mentions `/stakeit` for creating goals

```
/help
```
- [ ] Full command reference
- [ ] Duration format examples (`4w`, `30d`, `2mon`)
- [ ] zkTLS providers mentioned

### Test 4: Guided Goal Creation (Conversational Flow)

```
/stakeit
```

Step through the flow:

| Step | What you see | What to do |
|------|-------------|------------|
| 1 | "What's your name?" | Type your name (no reply needed, just type it) |
| 2 | App selection (Duolingo, GitHub, Strava, LeetCode, Headspace) | Tap `🦉 Duolingo` |
| 3 | Metric selection with 🔐 badges | Tap `⭐ XP Earned 🔐` |
| 4 | Target presets + Custom | Tap `500 XP` |
| 5 | Duration presets + Custom | Tap `4 weeks` |
| 6 | Penalty type (Donate to StakeIt, Freeze & Restake, Split to Group, Charity) | Tap `🔥 Donate to StakeIt` |
| 7 | Stake amount presets + Custom | Tap `฿500` |
| 8 | Confirmation summary | Tap `✅ Create Goal` |

- [ ] Name prompt accepts typed input without requiring Telegram reply
- [ ] Name is displayed in the greeting ("Hey [name]!")
- [ ] Each step updates the same message (inline edit)
- [ ] 🔐 badge appears on metrics with zkTLS verification
- [ ] Confirmation shows app, metric, target, duration, penalty, stake, verification type
- [ ] After confirming: "Goal Created!" message with your typed name + PromptPay QR sent
- [ ] Back buttons (⬅️) navigate to previous steps correctly
- [ ] Cancel button (❌) shows "Goal creation cancelled"

**Save the goal ID** from the goal page URL for payment testing.

### Test 5: Custom Input (No Reply Required)

During the guided flow:

1. At the target step, tap `✏️ Custom`
   - [ ] Bot asks for target number
   - [ ] Type a number (e.g. `750`) without replying — just send it as a regular message
   - [ ] Bot accepts it and moves to duration step

2. At the duration step, tap `✏️ Custom`
   - [ ] Bot asks for custom duration
   - [ ] Type a duration string (e.g. `30d`, `6w`, `2mon`) without replying
   - [ ] Bot accepts it and moves to penalty step

3. At the amount step, tap `✏️ Custom`
   - [ ] Bot asks for custom amount
   - [ ] Type a number (e.g. `750`) without replying
   - [ ] Bot accepts it and moves to confirmation

### Test 6: Penalty Type Selection

During the guided flow at the penalty step:

- [ ] Four options shown: Donate to StakeIt, Freeze & Restake, Split to Group, Charity Donation
- [ ] Selecting Charity Donation shows charity list (Doctors Without Borders, WWF, Wikipedia, Kiva, One Tree Planted)
- [ ] Selecting Freeze & Restake shows freeze duration (1-12 months)
- [ ] Selecting each one stores correctly and shows in confirmation
- [ ] Back button from amount step returns to penalty step
- [ ] Back button from penalty step returns to duration step

### Test 7: Duration Formats via Guided Flow

Create goals using the guided flow and test custom duration input:

1. `/stakeit` → name → app → metric → target → tap `✏️ Custom` at duration
   - Type `30d` → should show "30 days"
   - [ ] Days parsed correctly

2. `/stakeit` → ... → tap `✏️ Custom` at duration
   - Type `6w` → should show "6 weeks"
   - [ ] Weeks parsed correctly

3. `/stakeit` → ... → tap `✏️ Custom` at duration
   - Type `2mon` → should show "2 months"
   - [ ] Months parsed correctly

### Test 8: `/stake` Alternative Command

```
/stake
```
- [ ] Starts the same guided flow as `/stakeit`

### Test 9: Name Persistence

1. Use `/stakeit` guided flow and type your name (e.g. "Alex")
2. Cancel or complete the goal
3. Use `/stakeit` again to create another goal
- [ ] Name step is shown again (user can update or re-enter)
- [ ] All goal messages, voting notifications, and status use the typed name

### Test 10: Invalid Input Handling

Send `/stakeit` in a DM to the bot:
- [ ] Error: "Please use this command in a group chat"

Custom target with invalid input:
- [ ] Typing "abc" at custom target step → error message, stays on same step

Custom duration with invalid input:
- [ ] Typing "xyz" at custom duration step → error message, stays on same step

Custom amount with invalid input:
- [ ] Typing "abc" at custom amount step → error message, stays on same step

### Test 11: Promise Detection

Send in the group:
```
I promise to exercise every day this week
```

- [ ] Bot replies: "Sounds like a commitment! Want to put money on it?"
- [ ] Inline buttons: "Yes, stake!" / "No thanks"
- [ ] Tapping "Yes" → amount buttons → duration buttons → goal created

### Test 12: Payment Activation

Simulate a successful payment via webhook:

```bash
# Replace YOUR_GOAL_ID with actual goal ID from Test 4 or 7
curl -X POST http://localhost:3000/api/payments/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "key": "charge.complete",
    "data": {
      "id": "chrg_test_demo_001",
      "status": "successful",
      "metadata": {
        "goal_id": "YOUR_GOAL_ID",
        "user_id": "telegram_user"
      }
    }
  }'
```

- [ ] Returns `{"received":true}`
- [ ] Bot sends activation message in group: "Payment received! Goal ... is now ACTIVE"
- [ ] Goal detail page shows status `active`

### Test 13: Progress Photo

With an active goal, send a photo in the group with caption:
```
Did my XP grind today!
```

- [ ] Bot replies: "Progress update recorded for [goal name]!"

### Test 14: System Verification — Success Path

The simulate-verify endpoint adapts to the goal's duration — works for goals set in days, weeks, or months.

#### Complete a goal (all periods pass):

```bash
GOAL_ID="YOUR_GOAL_ID"
BASE="http://localhost:3000"

curl -s -X POST "$BASE/api/goals/$GOAL_ID/simulate-verify" \
  -H "Content-Type: application/json" \
  -d '{"outcome": "pass"}' | python3 -m json.tool
```

- [ ] All periods pass regardless of goal duration (3d, 4w, 2mon, etc.)
- [ ] Goal status becomes `completed`
- [ ] Bot sends completion notification with user's typed name

#### Partial verification (specific counts):

```bash
curl -s -X POST "$BASE/api/goals/$GOAL_ID/simulate-verify" \
  -H "Content-Type: application/json" \
  -d '{"pass": 2, "fail": 0}' | python3 -m json.tool
```

- [ ] Only 2 periods marked as passed (goal stays active if more periods remain)

### Test 15: System Verification — Failure Path

```bash
GOAL_ID="YOUR_GOAL_ID"
BASE="http://localhost:3000"

curl -s -X POST "$BASE/api/goals/$GOAL_ID/simulate-verify" \
  -H "Content-Type: application/json" \
  -d '{"outcome": "fail"}' | python3 -m json.tool
```

- [ ] Endpoint auto-calculates how many periods to pass/fail based on goal duration
- [ ] Goal status becomes `failed`
- [ ] Bot sends failure notification showing penalty type
- [ ] Freeze & Restake: money frozen for chosen period, then auto-staked on next goal
- [ ] Donate to StakeIt: money goes to StakeIt permanently (no stacking)

#### Mixed pass/fail (explicit counts):

```bash
curl -s -X POST "$BASE/api/goals/$GOAL_ID/simulate-verify" \
  -H "Content-Type: application/json" \
  -d '{"pass": 2, "fail": 2}' | python3 -m json.tool
```

- [ ] First 2 periods pass, next 2 fail

### Test 16: Verify Goal Status After Completion

```bash
curl -s http://localhost:3000/api/goals/YOUR_GOAL_ID | python3 -m json.tool
```

- [ ] `status` is `completed` or `failed`
- [ ] `weeks_passed` and `weeks_failed` counts are correct
- [ ] `penalty_type` matches what was selected during creation

### Test 16b: Friend Voting via Telegram (Optional, Last Resort)

Only needed when zkTLS and system API are both unavailable.

If a weekly check-in message appears with buttons in the group:

1. Have a **different user** (not goal owner) tap `✅ Yes, they did!`
   - [ ] Vote tally updates in message
2. Goal owner tries to vote:
   - [ ] Error: "Cannot vote on your own goal"

### Test 17: `/status` and `/goals`

```
/status
```
- [ ] Shows your active goals with stake, week, days remaining, penalty type

```
/goals
```
- [ ] Shows all goals in the group with user's typed names

### Test 18: `/clear` (Cleanup)

```
/clear
```
- [ ] Deletes your goals in this group
- [ ] Confirms how many were deleted

### Test 19: zkTLS Verification (Optional)

*Requires `RECLAIM_APP_ID` and `RECLAIM_APP_SECRET` in `.env.local`*

Use `/stakeit` guided flow → Duolingo → Streak Days 🔐 → 7 days → 2 weeks → Donate to StakeIt → ฿100 → Create
- [ ] Confirmation shows "zkTLS (automatic)" verification
- [ ] After creation shows "Auto-Verification Enabled" with Duolingo provider

```
/verify
```
- [ ] Bot sends verification button with Reclaim Protocol link

```
/providers
```
- [ ] Lists supported providers (Duolingo, GitHub, LeetCode)

### Test 20: Web Goal Creation

1. Go to `http://localhost:3000/goals/new`
2. Fill in goal name, amount (100), duration (2)
3. Submit
- [ ] QR code displayed
- [ ] "View Goal" link works
- [ ] Goal detail page shows `pending_payment`

### Test 21: Goal Summary Page

Open `http://localhost:3000/goals/YOUR_GOAL_ID/summary`
- [ ] Outcome shown (or in-progress status)
- [ ] Stats grid
- [ ] Week-by-week timeline

---

## 3. Troubleshooting

| Problem | Fix |
|---------|-----|
| Bot doesn't respond | Check webhook: `curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"` |
| Webhook returns errors | Check Next.js console for error logs |
| "Could not identify user" | Bot needs Group Privacy disabled in @BotFather |
| Name not saved | Name is stored in memory — restarts clear it. Type name again via `/stakeit` |
| QR code not showing | Check `OMISE_SECRET_KEY` is set (test key: `skey_test_...`) |
| Database errors | Re-run `supabase/schema.sql` in SQL editor |
| Tunnel URL changed | Update `NEXT_PUBLIC_BASE_URL` in `.env.local`, restart `npm run dev`, re-set webhook |
| Buttons say "expired" | Conversation timed out (10 min). Send `/stakeit` again |
| Custom input ignored | Make sure you're not starting with `/` — commands are skipped |
| "Cannot read properties of null" | Usually missing env var — check `.env.local` has all required values |

---

## 4. Checklist Summary

| # | Test | Status |
|---|------|--------|
| 1 | Health check | [ ] |
| 2 | Landing page | [ ] |
| 3 | /start and /help | [ ] |
| 4 | Guided goal creation (with name + penalty steps) | [ ] |
| 5 | Custom input without reply | [ ] |
| 6 | Penalty type selection | [ ] |
| 7 | Duration formats via guided flow | [ ] |
| 8 | /stake alternative command | [ ] |
| 9 | Name persistence | [ ] |
| 10 | Invalid input handling | [ ] |
| 11 | Promise detection | [ ] |
| 12 | Payment activation (webhook curl) | [ ] |
| 13 | Progress photo | [ ] |
| 14 | Goal completion — success path | [ ] |
| 15 | Goal completion — failure path | [ ] |
| 16 | Goal status check (API) | [ ] |
| 16b | Friend voting (optional, last resort) | [ ] |
| 17 | /status and /goals | [ ] |
| 18 | /clear cleanup | [ ] |
| 19 | zkTLS verification (optional) | [ ] |
| 20 | Web goal creation | [ ] |
| 21 | Summary page | [ ] |
