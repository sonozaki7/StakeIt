# StakeIt ZKTLS Integration — Implementation Tasks

## Phase 1: Database & Types
- [x] Add `zk_verifications` table to `supabase/schema.sql`
- [x] Add ZKTLS columns to `goals` table in `supabase/schema.sql`
- [x] Add ZKTLS types to `types/index.ts`
- [x] Add ZKTLS fields to `CreateGoalRequest` in `types/index.ts`

## Phase 2: Dependencies
- [x] Install `@reclaimprotocol/js-sdk`
- [ ] Install `thirdweb`

## Phase 3: Library Modules
- [x] Create `lib/reclaim.ts` — Reclaim provider registry, proof verification, helper functions
- [x] Create `lib/thirdweb.ts` — On-chain recording to Base Sepolia
- [x] Add ZK verification CRUD functions to `lib/supabase.ts`

## Phase 4: API Routes
- [x] Create `app/api/verify/reclaim/route.ts` — Request verification
- [x] Create `app/api/verify/reclaim/callback/route.ts` — Reclaim proof callback

## Phase 5: Telegram Bot Enhancements
- [x] Add `/verify` command to `lib/telegram.ts`
- [x] Add `/providers` command to `lib/telegram.ts`
- [x] Add `/proof` command to `lib/telegram.ts`
- [x] Add `notifyZkVerificationComplete` function to `lib/telegram.ts`
- [x] Update `/help` command with ZKTLS info
- [x] Update goal creation flow to detect ZK providers

## Phase 6: Frontend
- [x] Create `app/verify/page.tsx` — Verification redirect page

## Phase 7: Configuration
- [x] Update `.env.example` with Reclaim and Thirdweb variables
- [x] Update `.env.local` with placeholder Reclaim and Thirdweb variables

## Phase 8: Smart Contract
- [x] Create `contracts/StakeItVerifications.sol`

## Phase 9: Build Verification
- [ ] Verify project builds successfully
