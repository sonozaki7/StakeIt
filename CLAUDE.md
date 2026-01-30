# StakeIt - Complete Project Context for Claude

## 🎯 PROJECT OVERVIEW

StakeIt is a commitment contract platform where:
1. Users create goals and stake real money (Thai Baht via PromptPay)
2. Friends in Telegram/WhatsApp groups verify weekly progress
3. If majority of weeks pass verification → user gets refund
4. If not → money is forfeited

**NO BLOCKCHAIN** - This is a simplified fiat-only version.

---

## 🛠 TECH STACK (USE EXACTLY THESE)

| Layer | Technology | Version | Notes |
|-------|------------|---------|-------|
| Framework | Next.js | 14.x | App Router ONLY (not Pages Router) |
| Language | TypeScript | 5.x | Strict mode enabled |
| Database | Supabase | Latest | PostgreSQL with JS client |
| Telegram | Grammy.js | 1.x | NOT node-telegram-bot-api |
| WhatsApp | Twilio | 4.x | WhatsApp Business API |
| Payments | Omise | 0.12.x | PromptPay QR codes |
| Styling | Tailwind CSS | 3.x | With default config |
| Validation | Zod | 3.x | For API input validation |
| Package Manager | npm | - | NOT yarn or pnpm |

---

## 📁 EXACT FILE STRUCTURE

Create this exact structure:

```
stakeit/
├── app/
│   ├── globals.css
│   ├── layout.tsx
│   ├── page.tsx
│   ├── goals/
│   │   ├── new/
│   │   │   └── page.tsx
│   │   └── [id]/
│   │       └── page.tsx
│   └── api/
│       ├── health/
│       │   └── route.ts
│       ├── goals/
│       │   ├── route.ts
│       │   └── [id]/
│       │       ├── route.ts
│       │       └── vote/
│       │           └── route.ts
│       ├── telegram/
│       │   └── webhook/
│       │       └── route.ts
│       ├── whatsapp/
│       │   └── webhook/
│       │       └── route.ts
│       └── payments/
│           └── webhook/
│               └── route.ts
├── lib/
│   ├── supabase.ts
│   ├── telegram.ts
│   ├── whatsapp.ts
│   └── omise.ts
├── types/
│   └── index.ts
├── supabase/
│   └── schema.sql
├── .env.example
├── .env.local (gitignored)
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.js
├── next.config.js
└── README.md
```

---

## 🔧 CODING CONVENTIONS

### TypeScript Rules
- Enable strict mode in tsconfig.json
- Define explicit return types for all functions
- Use interfaces for object shapes, types for unions
- NO `any` type - use `unknown` if truly unknown

### API Route Pattern
Every API route must follow this pattern:

```typescript
// app/api/example/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// 1. Define schema
const requestSchema = z.object({
  field: z.string(),
});

// 2. Export HTTP method handlers
export async function POST(request: NextRequest) {
  try {
    // 3. Parse and validate body
    const body = await request.json();
    const validation = requestSchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      );
    }
    
    const data = validation.data;
    
    // 4. Business logic here
    const result = await doSomething(data);
    
    // 5. Return success
    return NextResponse.json({ success: true, data: result });
    
  } catch (error) {
    // 6. Handle errors
    console.error('API Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
```

### Async/Await Rules
- ALWAYS use async/await, NEVER callbacks
- ALWAYS wrap in try/catch
- ALWAYS log errors with console.error

### Import Rules
- Use `@/` path alias for local imports
- Group imports: external packages first, then local

### Naming Conventions
- Files: kebab-case (except Next.js special files)
- Functions: camelCase
- Types/Interfaces: PascalCase
- Constants: UPPER_SNAKE_CASE

---

## 🔐 ENVIRONMENT VARIABLES

Create `.env.example` with these exact variables:

```bash
# App
NEXT_PUBLIC_BASE_URL=http://localhost:3000

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Telegram
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz

# Twilio (WhatsApp)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886

# Omise
OMISE_PUBLIC_KEY=pkey_test_xxxxxxxxxxxxx
OMISE_SECRET_KEY=skey_test_xxxxxxxxxxxxx
```

Access in code:
- Server-side: `process.env.VARIABLE_NAME`
- Client-side: `process.env.NEXT_PUBLIC_VARIABLE_NAME`

---

## 📦 PACKAGE.JSON DEPENDENCIES

```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.39.0",
    "grammy": "^1.21.0",
    "next": "^14.0.4",
    "omise": "^0.12.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "twilio": "^4.20.0",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "autoprefixer": "^10.4.16",
    "eslint": "^8.55.0",
    "eslint-config-next": "^14.0.4",
    "postcss": "^8.4.32",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.3.0"
  }
}
```

---

## 🔄 BUILD ORDER (MUST FOLLOW EXACTLY)

1. **Phase 1: Project Setup** - Initialize Next.js, install deps, create configs
2. **Phase 2: Database** - Schema SQL, TypeScript types, Supabase client
3. **Phase 3: Core API** - Health check, Goals CRUD, Vote endpoint
4. **Phase 4: Payments** - Omise client, webhook handler
5. **Phase 5: Telegram Bot** - Grammy bot, all commands, voting buttons
6. **Phase 6: WhatsApp Bot** - Twilio client, message handlers
7. **Phase 7: Frontend** - All pages with Tailwind styling
8. **Phase 8: Final** - README, testing, cleanup

---

## ✅ COMPLETION CRITERIA

After completing each component, output:

```
=====================================
COMPONENT: [Component Name]
STATUS: ✅ COMPLETE
FILES CREATED:
  - path/to/file1.ts
  - path/to/file2.ts
NEXT: [Next component to build]
=====================================
```

Then update `specs/TASKS.md` changing `[ ]` to `[x]` for completed tasks.

Git commit after each phase with message: `feat: complete [phase name]`

---

## 🚨 COMMON MISTAKES TO AVOID

1. **DO NOT** use Pages Router (`pages/`) - use App Router (`app/`) only
2. **DO NOT** use `node-telegram-bot-api` - use `grammy`
3. **DO NOT** create a separate backend server - Next.js API routes only
4. **DO NOT** use yarn or pnpm - use npm only
5. **DO NOT** skip Zod validation on API routes
6. **DO NOT** forget to handle errors with try/catch
7. **DO NOT** hardcode any secrets - use environment variables
8. **DO NOT** use default exports for API routes - use named exports (GET, POST, etc.)

---

## 🆘 IF STUCK

1. Read the error message carefully
2. Check if all environment variables are set
3. Verify imports are correct
4. Check Supabase table names match exactly
5. If still stuck after 3 attempts, document the error and continue to next non-blocking task
