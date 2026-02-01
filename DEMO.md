# StakeIt - Live Demo Playbook

A step-by-step script for a ~4 minute live demo. Failure case first, then redemption.

---

## How Verification Works

StakeIt uses **three verification tiers**, in order of priority:

| Tier | Method | When used |
|------|--------|-----------|
| 1 (Primary) | **zkTLS via Reclaim Protocol** | Goals from supported apps (Duolingo, GitHub, LeetCode). Cryptographic proof pulled directly from the app's servers. No human needed. |
| 2 (Fallback) | **System API verification** | Automated backend check. Curl the vote endpoint to pass/fail a week programmatically. |
| 3 (Last resort) | **Friend voting in group** | Only when tiers 1 and 2 are unavailable. Not the default path. |

For the demo, we use **Tier 1** (zkTLS for Duolingo) and **Tier 2** (API curl to fast-forward weeks).

---

## Pre-Demo Setup (do this BEFORE presenting)

### Terminal Layout

Open 3 terminal tabs:

| Tab | Purpose | Command |
|-----|---------|---------|
| Tab 1 | Next.js server | `npm run dev` |
| Tab 2 | Tunnel | `ngrok http 3000` (or `npx localtunnel --port 3000`) |
| Tab 3 | Simulation scripts | Keep ready for curl commands |

### Checklist (15 min before)

```bash
# 1. Start the app
npm run dev

# 2. Start tunnel (separate tab)
ngrok http 3000
# Copy the HTTPS URL

# 3. Update .env.local with tunnel URL
#    NEXT_PUBLIC_BASE_URL=https://xxxx.ngrok-free.app

# 4. Restart app (picks up new env)
# Ctrl+C in Tab 1, then:
npm run dev

# 5. Verify app is alive
curl http://localhost:3000/api/health

# 6. Set Telegram webhook
export BOT_TOKEN="YOUR_BOT_TOKEN"
export TUNNEL_URL="https://xxxx.ngrok-free.app"

curl -s "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"${TUNNEL_URL}/api/telegram/webhook\"}"

# 7. Verify webhook
curl -s "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo" | python3 -m json.tool

# 8. Clean up old test goals (in Telegram group)
# Send: /clear

# 9. Test one command works
# Send: /start
# If bot responds -> you're good
```

### Have Ready

- Telegram app open on phone (group chat visible)
- Browser open to `http://localhost:3000`
- Tab 3 terminal ready with simulation scripts below (pre-paste them)

**No other group members needed.** Verification is automated.

---

## Demo Script

### ACT 1: The Problem (speak while showing landing page)

> "How many times have you told yourself — I'll learn a language, code every day, go to the gym — and then nothing happened? The problem isn't motivation. It's that quitting is free. StakeIt changes that."

*Show: browser at `http://localhost:3000`*

---

### ACT 2: Create Goal #1 — The One That Fails (live in Telegram)

> "Let me show you how it works. StakeIt is a Telegram bot that walks you through creating a commitment contract."

*Switch to phone. In the Telegram group, send:*

```
/stakeit
```

> "First it asks your name — this is how your group sees you."

*Type your name (no need to reply, just type it)*

> "Now pick from real apps you already use — Duolingo, GitHub, LeetCode, Strava, Headspace."

*Tap: `💻 GitHub`*

> "Pick a metric. Commits pushed — how many commits you'll push this month."

*Tap: `✅ Commits Pushed`*

> "Set your target..."

*Tap: `30 commits`*

> "How long you're committing..."

*Tap: `4 weeks`*

---

**PAUSE HERE — explain the penalty options.**

> "Now here's where it gets interesting. StakeIt asks: what happens to your money if you fail? You have four options."

*Point to each button as you explain:*

> "**Donate to StakeIt** — the money goes to the StakeIt team. Permanently. Gone. This is the harshest option. Pure loss. If you need maximum fear to stay motivated, this is the one."

> "**Freeze & Restake** — StakeIt freezes your money. You pick how long — 1 month, 6 months, up to a year. During that time you have zero access. When the freeze ends, the money doesn't come back to you — it gets automatically staked on your next goal. You have to earn it back by succeeding."

> "**Split to Group** — your lost stake gets divided among your referees — the friends who were verifying you. Now your friends have skin in the game too. They want you to fail so they get paid. Sounds harsh? That's the point. It makes you try harder."

> "**Charity Donation** — your money goes to a real charity of your choice. Doctors Without Borders, WWF, Wikipedia, Kiva microloans, One Tree Planted — pick one during goal setup. You lose the money, but at least it does some good."

> "For this demo, let's go with Freeze & Restake. If I fail, the money gets frozen and then forced onto my next goal. The pressure compounds."

*Tap: `🧊 Freeze & Restake`*

> "3 months feels right."

*Tap: `3 months`*

---

> "And stake real money."

*Tap: `฿1,000`*

> "Here's the summary. GitHub, 30 commits, 4 weeks, freeze & restake if failed, 3 month freeze, 1,000 baht. Ready."

*Tap: `✅ Create Goal`*

> "PromptPay QR — scan it, pay, money is locked."

*Show the QR code*

**FALLBACK:** If the guided flow is stuck, send `/stakeit` again to restart.

---

### ACT 3: Fail the First Goal

> "Let me simulate the payment and fast-forward a few weeks..."

*In Tab 3:*

```bash
FAIL_GOAL_ID="PASTE_GOAL_ID_HERE"
BASE="http://localhost:3000"

# Simulate payment
curl -s -X POST "$BASE/api/payments/webhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"key\": \"charge.complete\",
    \"data\": {
      \"id\": \"chrg_test_fail_$(date +%s)\",
      \"status\": \"successful\",
      \"metadata\": {
        \"goal_id\": \"$FAIL_GOAL_ID\",
        \"user_id\": \"telegram_user\"
      }
    }
  }"
echo ""
```

> "Goal is active. Now let's say you did great for 2 weeks — pushed your commits, stayed on track. But then week 3 hits. Work gets busy. You skip a few days. Week 4, same thing."

```bash
# Simulate failure — adapts to whatever duration the goal has
curl -s -X POST "$BASE/api/goals/$FAIL_GOAL_ID/simulate-verify" \
  -H "Content-Type: application/json" \
  -d '{"outcome": "fail"}' | python3 -m json.tool
```

> "2 passed, 2 failed — not enough. Goal failed."

*Show the failure notification in Telegram*

> "The ฿1,000 is now frozen. I chose a 3-month freeze — so for the next 3 months, that money is locked. I can't touch it. And when the freeze ends, it doesn't come back to me. It gets automatically staked on my next goal."

*Show the failed goal detail page in browser: `http://localhost:3000/goals/FAIL_GOAL_ID`*

---

### ACT 4: Redemption — Create Goal #2 With Stacked Balance

> "So now you want to try again. Let's create a new goal."

*In Telegram, send `/stakeit` and go through the guided flow:*
*Name is remembered → `🦉 Duolingo` → `⭐ XP Earned 🔐` → `500 XP` → `4 weeks` → `🧊 Freeze & Restake` → `3 months` → `฿500` → Create*

> "Notice something. I staked ฿500, but the system knows I have ฿1,000 in frozen balance from my last failed goal. Once that freeze expires, it stacks on top. So I'm actually putting ฿1,500 on the line. The pressure just went up."

> "And this time, see that lock icon? This is a Duolingo goal — it's verified automatically using zkTLS. Cryptographic proof pulled directly from Duolingo's servers. No screenshots, no friends checking on you, no lying. Math verifies you."

*Simulate payment and complete all weeks (Tab 3):*

```bash
GOAL_ID="PASTE_NEW_GOAL_ID"
BASE="http://localhost:3000"

# Simulate payment
curl -s -X POST "$BASE/api/payments/webhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"key\": \"charge.complete\",
    \"data\": {
      \"id\": \"chrg_test_demo_$(date +%s)\",
      \"status\": \"successful\",
      \"metadata\": {
        \"goal_id\": \"$GOAL_ID\",
        \"user_id\": \"telegram_user\"
      }
    }
  }"
echo ""

# Pass all periods — adapts to whatever duration the goal has
curl -s -X POST "$BASE/api/goals/$GOAL_ID/simulate-verify" \
  -H "Content-Type: application/json" \
  -d '{"outcome": "pass"}' | python3 -m json.tool
```

> "4 weeks passed. Goal complete. You get your ฿500 back — AND the ฿1,000 from your previous failure is unlocked. All ฿1,500 is yours again."

> "That's the loop. Fail, and the money stacks against you. Succeed, and you get everything back. The only way out is through."

*Show the completed goal detail page in browser: `http://localhost:3000/goals/GOAL_ID`*

---

### ACT 5: The Salary Model

> "Here's the real vision for working professionals."

> "Imagine: every month after rent, bills, and fixed costs auto-deduct from your salary, a portion auto-transfers to StakeIt. That money gets allocated to your goals for the month."

> "You're not spending extra. You're redirecting money you'd waste anyway — and now you have to earn it back by hitting your targets. Complete your goals, keep every baht. Fail, it stacks against you until you do."

> "StakeIt turns your leftover salary into a self-improvement engine."

---

### ACT 6: Close

> "Built with Next.js, Supabase, Omise for Thai payments, and Reclaim Protocol for zero-knowledge proof verification. No friends needed. No manual checking. Cryptographic truth."

> "StakeIt — put your money where your mouth is."

---

## Complete Simulation Script (copy-paste block)

Pre-fill this in Tab 3 before the demo. Replace IDs after goals are created:

```bash
#!/bin/bash
# === StakeIt Demo Simulation ===
# Usage: Fill in IDs after creating goals, then run sections as needed.

BASE="http://localhost:3000"

# ========= GOAL 1: FAILURE CASE =========

FAIL_GOAL_ID="PASTE_HERE"

echo "=== 1. Simulate Payment (Failure Goal) ==="
curl -s -X POST "$BASE/api/payments/webhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"key\": \"charge.complete\",
    \"data\": {
      \"id\": \"chrg_test_fail_$(date +%s)\",
      \"status\": \"successful\",
      \"metadata\": {
        \"goal_id\": \"$FAIL_GOAL_ID\",
        \"user_id\": \"telegram_user\"
      }
    }
  }"
echo ""

echo "=== 2. Simulate failure (adapts to goal duration) ==="
curl -s -X POST "$BASE/api/goals/$FAIL_GOAL_ID/simulate-verify" \
  -H "Content-Type: application/json" \
  -d '{"outcome": "fail"}' | python3 -m json.tool

echo "=== 3. Check failed goal status ==="
curl -s "$BASE/api/goals/$FAIL_GOAL_ID" | python3 -m json.tool | grep -E '"status"|"weeks_passed"|"weeks_failed"|"penalty_type"'
echo ""

# ========= GOAL 2: SUCCESS (REDEMPTION) =========

GOAL_ID="PASTE_HERE"

echo "=== 4. Simulate Payment (Success Goal) ==="
curl -s -X POST "$BASE/api/payments/webhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"key\": \"charge.complete\",
    \"data\": {
      \"id\": \"chrg_test_demo_$(date +%s)\",
      \"status\": \"successful\",
      \"metadata\": {
        \"goal_id\": \"$GOAL_ID\",
        \"user_id\": \"telegram_user\"
      }
    }
  }"
echo ""

echo "=== 5. Simulate success (adapts to goal duration) ==="
curl -s -X POST "$BASE/api/goals/$GOAL_ID/simulate-verify" \
  -H "Content-Type: application/json" \
  -d '{"outcome": "pass"}' | python3 -m json.tool

echo "=== 6. Check success goal status ==="
curl -s "$BASE/api/goals/$GOAL_ID" | python3 -m json.tool | grep -E '"status"|"weeks_passed"|"weeks_failed"'
echo ""

echo "=== Done! ==="
echo "Failed goal:  $BASE/goals/$FAIL_GOAL_ID"
echo "Success goal: $BASE/goals/$GOAL_ID"
```

Save as `demo.sh` and run with `bash demo.sh`.

---

## Troubleshooting During Demo

| Symptom | Quick fix |
|---------|-----------|
| Bot doesn't respond to `/stakeit` | Send `/stakeit` again. Check webhook is set correctly |
| Guided flow buttons not working | Send `/stakeit` again to restart |
| Name step stuck | Just type your name in the chat (no reply needed) |
| Payment webhook fails | Check Tab 1 for errors. Verify GOAL_ID is correct |
| Vote API returns "Goal is not active" | Payment didn't go through. Re-run payment curl first |
| Vote API returns "Already voted" | Change `refereeUserId` to `system_v2`, `system_v3`, etc. |
| Tunnel URL changed | Update `.env.local`, restart app, re-set webhook |
| Nothing works | Show the landing page, narrate the flow verbally |

---

## Speaker Notes (4 min version)

**[0:00 — Problem] 15 sec**
"Broken promises to yourself. Gym, language, coding — quitting is free. StakeIt fixes that."

**[0:15 — Goal #1 Creation + Penalty Explainer] 75 sec**
`/stakeit` → Type name → GitHub → Commits Pushed → 30 → 4 weeks.
PAUSE at penalty step. Explain all four:
- Donate to StakeIt: money goes to the StakeIt team permanently — gone
- Freeze & Restake: StakeIt freezes your money for 1-12 months (you choose), then stakes it on your next goal
- Split to Group: friends get paid when you fail (they want you to fail)
- Charity: money goes to a good cause
Pick Freeze & Restake → 3 months → ฿1,000 → Create. Show QR.

**[1:30 — Fail Goal #1] 30 sec**
Payment curl, then simulate failure. "Goal failed. ฿1,000 frozen for 3 months, then auto-staked on your next goal."

**[2:00 — Goal #2 Redemption] 45 sec**
`/stakeit` → Duolingo → XP Earned 🔐 → 500 XP → 4 weeks → Freeze & Restake → 3 months → ฿500 → Create.
"You staked ฿500 but you have ฿1,000 in frozen balance. That's ฿1,500 on the line."
"And this one uses zkTLS — cryptographic proof from Duolingo. No humans needed."
Payment curl, then simulate success. "Goal complete. All ฿1,500 unlocked."

**[2:45 — Salary Model] 30 sec**
"For working professionals: auto-transfer leftover salary. Complete goals, keep it all. Fail, it stacks. Your salary becomes a self-improvement engine."

**[3:15 — Tech + Close] 15 sec**
"Next.js, Supabase, Omise PromptPay, Reclaim Protocol zkTLS. StakeIt — put your money where your mouth is."

---

## Post-Demo Cleanup

```bash
# In Telegram: /clear

# Or full DB reset via Supabase SQL editor:
DELETE FROM votes;
DELETE FROM weekly_results;
DELETE FROM referees;
DELETE FROM progress_updates;
DELETE FROM zk_verifications;
DELETE FROM payments;
DELETE FROM goals;
```
