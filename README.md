# StakeIt

A commitment contract platform where users stake real money on their goals and friends verify weekly progress.

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript (strict mode)
- **Database:** Supabase (PostgreSQL)
- **Telegram Bot:** Grammy.js
- **WhatsApp:** Twilio
- **Payments:** Omise (PromptPay QR)
- **Styling:** Tailwind CSS
- **Validation:** Zod

## Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd stakeit
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Fill in all values in `.env.local`:

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_BASE_URL` | Your app URL (e.g., `http://localhost:3000`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from @BotFather |
| `TWILIO_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_WHATSAPP_NUMBER` | Twilio WhatsApp number |
| `OMISE_PUBLIC_KEY` | Omise public key |
| `OMISE_SECRET_KEY` | Omise secret key |

### 3. Set up database

Run the SQL in `supabase/schema.sql` in your Supabase SQL Editor.

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Bot Commands

### Telegram

| Command | Description |
|---------|-------------|
| `/start` | Welcome message |
| `/help` | List all commands |
| `/commit "goal" amount weeks` | Create a new goal |
| `/status` | Show your active goals |
| `/goals` | Show all goals in group |

### WhatsApp

| Command | Description |
|---------|-------------|
| `help` | Show instructions |
| `commit "goal" amount weeks` | Create a new goal |
| `status` | Show active goals |
| `vote <goalId> yes/no` | Vote on a goal |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/goals` | Create a goal |
| GET | `/api/goals` | List goals |
| GET | `/api/goals/[id]` | Get goal details |
| POST | `/api/goals/[id]/vote` | Submit a vote |
| POST | `/api/telegram/webhook` | Telegram bot webhook |
| POST | `/api/whatsapp/webhook` | WhatsApp webhook |
| POST | `/api/payments/webhook` | Omise payment webhook |

## Deployment

Deploy to Vercel:

```bash
npm run build
```

Set all environment variables in your hosting platform. Set up webhook URLs for Telegram, WhatsApp, and Omise to point to your deployed API endpoints.
