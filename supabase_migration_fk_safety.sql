-- ============================================================================
-- WEALTHSHARE: Transaction Reversal Safety Migration
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/gntyaxyjlppapkfonkpj/sql/new
--
-- Purpose: Change the FK on transactions.related_loan_id from default RESTRICT
--          to ON DELETE SET NULL, so deleting a loan row no longer causes a
--          FK violation if any linked transaction rows still exist.
--          The app code now always deletes transactions first, but this acts as
--          a safety net to prevent silent split-brain if the order ever slips.
-- ============================================================================

-- Step 1: Check current constraint name (informational)
SELECT conname, confdeltype
FROM pg_constraint
WHERE conrelid = 'public.transactions'::regclass
  AND contype = 'f'
  AND conname LIKE '%related_loan_id%';

-- Step 2: Drop the old FK constraint
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_related_loan_id_fkey;

-- Step 3: Re-add with ON DELETE SET NULL
--         (When a loan is deleted, related_loan_id on remaining rows becomes NULL
--          instead of causing a FK violation error.)
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_related_loan_id_fkey
    FOREIGN KEY (related_loan_id)
    REFERENCES public.loans(id)
    ON DELETE SET NULL;

-- Step 4: Verify
SELECT conname, confdeltype
FROM pg_constraint
WHERE conrelid = 'public.transactions'::regclass
  AND contype = 'f'
  AND conname LIKE '%related_loan_id%';
-- Expected: confdeltype = 'n'  (n = SET NULL, r = RESTRICT/default, c = CASCADE)
