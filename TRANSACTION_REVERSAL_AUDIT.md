# 🔍 Transaction Reversal Audit — WealthShare Manager
**Audited:** 2026-08-05 | **Versions compared:** Desktop (reference) vs Downloads (current)

---

## Executive Summary

The current version introduced significant regressions in the transaction
deletion/reversal flow compared to the Desktop reference version. The core logic
is **identical in both versions** — meaning the bugs are inherited from the
reference — but the current version introduced **new critical bugs** via the
`transactionsRef` optimistic-write pattern and offline-sync logic.

---

## 1. What "Transaction Reversal" Is In This App

There is **no proper reversal mechanism**. "Reversing" = **hard-deleting** rows
from Supabase, via two store functions:

| Path | Trigger | Store function |
|---|---|---|
| Single transaction | Transactions page → 🗑 icon → confirm | `deleteTransaction(id)` |
| Entire loan + all its transactions | Loans page → 🗑 icon → confirm | `deleteLoan(id)` |

Both versions are identical at the UI layer (`Transactions.tsx`, `Loans.tsx`).

---

## 2. Side-by-Side: `deleteTransaction` (store.tsx)

### Reference version (Desktop — "no issue")
```ts
// store.tsx:705
const deleteTransaction = async (id: string) => {
  const transaction = transactions.find(t => t.id === id);   // ← uses state snapshot

  if (transaction?.transaction_type === 'LOAN_GIVEN' && transaction.related_loan_id) {
    setLoans(prev => prev.filter(l => l.id !== transaction.related_loan_id));
    await supabase.from('loans').delete().eq('id', transaction.related_loan_id);
    //    ↑ BUG_REF_1: Deletes loan BEFORE repayment txs → FK violation potential
  }

  setTransactions(prev => prev.filter(t => t.id !== id));   // ← optimistic local clear
  await supabase.from('transactions').delete().eq('id', id); // ← no error handling
  logAudit('DELETED', 'transactions', id, 'Deleted Transaction');
};
```

### Current version (Downloads — "new issue added")
```ts
// store.tsx:779
const deleteTransaction = async (id: string) => {
  const transaction = transactions.find(t => t.id === id); // ← SAME BUG: uses stale state snapshot

  if (transaction?.transaction_type === 'LOAN_GIVEN' && transaction.related_loan_id) {
    setLoans(prev => prev.filter(l => l.id !== transaction.related_loan_id));
    await supabase.from('loans').delete().eq('id', transaction.related_loan_id);
    // ↑ BUG_REF_1 still present: no repayment cleanup before loan deletion
  }

  // 🔴 NEW BUG (current only): Uses transactionsRef instead of local state
  const nextTrans = transactionsRef.current.filter(t => t.id !== id);
  transactionsRef.current = nextTrans;
  setTransactions(nextTrans);
  try {
    localStorage.setItem('wealthshare_transactions', JSON.stringify(nextTrans));
  } catch (e) {}
  // ↑ If a pending optimistic write is in transactionsRef but NOT yet in
  //   `transactions` state, this silently wipes it from local cache permanently.

  await supabase.from('transactions').delete().eq('id', id);
  // ↑ BUG_REF_3: No error handling. If Supabase fails, local state is already cleared.
  logAudit('DELETED', 'transactions', id, 'Deleted Transaction');
};
```

---

## 3. Side-by-Side: `deleteLoan` (store.tsx)

### Reference version (Desktop)
```ts
// store.tsx:719
const deleteLoan = async (id: string) => {
  setTransactions(prev => prev.filter(t => t.related_loan_id !== id)); // repayments cleared ✅
  await supabase.from('transactions').delete().eq('related_loan_id', id);

  setLoans(prev => prev.filter(l => l.id !== id));
  await supabase.from('loans').delete().eq('id', id);

  logAudit('DELETED', 'loans', id, 'Deleted Loan and associated transactions');
  // ↑ BUG_REF_6: 'LOAN_GIVEN' disbursement tx NOT deleted (not covered by related_loan_id filter
  //              because it IS included — so actually this IS deleted ✅)
};
```

### Current version (Downloads)
```ts
// store.tsx:799 — IDENTICAL to reference for deleteLoan
const deleteLoan = async (id: string) => {
  setTransactions(prev => prev.filter(t => t.related_loan_id !== id));
  await supabase.from('transactions').delete().eq('related_loan_id', id);

  setLoans(prev => prev.filter(l => l.id !== id));
  await supabase.from('loans').delete().eq('id', id);

  logAudit('DELETED', 'loans', id, 'Deleted Loan and associated transactions');
};
// Note: transactionsRef is NOT updated here — only setTransactions is called.
// 🔴 NEW BUG (current only): transactionsRef.current is now out of sync with
//    React state after deleteLoan. Next isDuplicateTransaction() check or
//    addContribution() batch operation will see deleted loan-repayment rows.
```

---

## 4. Complete Bug Register

### 🔴 CRITICAL (Data Corruption / Silent Failures)

#### BUG-01 · Deleting LOAN_GIVEN doesn't clean up repayments first
**Both versions**  
`deleteTransaction` path for `LOAN_GIVEN`:
1. Deletes the loan row from `loans` table
2. **Does NOT** delete `LOAN_REPAYMENT` transactions linked to that loan
3. Then tries to delete just the single `LOAN_GIVEN` tx

**Result at Supabase level:** The `loans` delete (step 1) will fail with a
**foreign key violation** (`transactions.related_loan_id → loans.id`) if any
repayment rows exist. The error is **silently swallowed** — no `await` error
check. Local React state is already cleared. **Split-brain:** UI shows loan
gone, Supabase still has it.

**Repro steps:**  
1. Create a loan → add a repayment → click 🗑 on the LOAN_GIVEN row in Transactions page

---

#### BUG-02 · `transactionsRef` not updated in `deleteLoan` (current only)
**Current version only**  
`deleteLoan` calls `setTransactions(...)` but never updates `transactionsRef.current`.
After a loan deletion, `transactionsRef.current` still contains the deleted
repayment rows. The ref is the source of truth for:
- `isDuplicateTransaction()` checks
- `addContribution()` batch allocation logic
- `addRepayment()` interest-calculation queries

This means the app may:
- Allow erroneously skipping duplicate detection  
- Miscalculate interest remaining on non-existent repayments
- Batch-insert a contribution that erroneously accounts for already-deleted repayments

---

#### BUG-03 · No error handling on any `supabase.delete()` call
**Both versions**  
Every delete call ignores return values:
```ts
await supabase.from('transactions').delete().eq('id', id);
// ↑ Error ignored — local state cleared regardless of Supabase success
```
If a network error, RLS block, or FK violation occurs, the UI shows the record
as deleted but it remains in Supabase. On next page load / realtime sync, the
"deleted" row reappears — confusing the treasurer.

---

#### BUG-04 · `advance_credit` not rolled back on CONTRIBUTION deletion
**Both versions**  
`addContribution` allocates `advance_credit` back-fills across multiple dates.
When any of the resulting contribution transactions are deleted, `advance_credit`
on the member is never adjusted. The member's credit balance stays inflated.

**Impact:** Member appears to have pre-paid credits they no longer have.
Subsequent contributions for that member will silently allocate less than
expected, and the discrepancy silently compounds.

---

### 🟠 HIGH

#### BUG-05 · LOAN_GIVEN transaction not captured by `deleteLoan` related_loan_id filter
**Clarification after deeper audit:**  
✅ `deleteLoan` DOES delete the `LOAN_GIVEN` transaction — because in `addLoan`,
the transaction is stored with `related_loan_id: loanId`. So
`.delete().eq('related_loan_id', id)` catches the disbursement row too.  
**This was wrong in the previous analysis — not a bug.**

However: The local state filter `prev.filter(t => t.related_loan_id !== id)` in
the current version does NOT clean `transactionsRef.current`, creating BUG-02.

---

#### BUG-06 · Contribution allocation uses `transactionsRef` but `addContribution` logic changed between versions
**Current version only**  
The current `addContribution` refactored from a simple "today + catch-up 1 day"
to a **365-day backfill loop**. This runs against `transactionsRef.current`.
When contribution transactions are later deleted, `transactionsRef.current` may
get stale, causing the next contribution batch to:
- Double-count deleted contributions as "already paid"
- Under-allocate for dates that were already cleared

---

### 🟡 MEDIUM

#### BUG-07 · TRANSFER deletions leave orphan pair
**Both versions**  
Transfers create 2 rows (debit + credit). The UI's trash icon targets one row ID
only. Deleting one transfer leg leaves the other, unbalancing both accounts with
no way to find the orphan leg (unless the treasurer changes working date and
manually hunts for it).

---

#### BUG-08 · Delete UI scoped to working date only — past records inaccessible
**Both versions**  
`Transactions.tsx:138`:
```ts
.filter(t => t.date === workingDate)
```
Correction of a historical transaction requires the treasurer to manually go to
`workingDate` of the original transaction. There is no global search/delete.

---

#### BUG-09 · Audit log captures no transaction data
**Both versions**  
```ts
logAudit('DELETED', 'transactions', id, 'Deleted Transaction');
```
The `details` field contains only the static string "Deleted Transaction".
Amount, type, member ID, account ID are not captured. Full forensic audit is
impossible from logs alone.

---

## 5. Supabase Schema Issues

### S-01 · No `ON DELETE CASCADE` or `ON DELETE SET NULL`
```sql
related_loan_id uuid references loans(id)
-- ↑ No ON DELETE action specified → default RESTRICT behavior
```
**Impact:** BUG-01 (FK violation when deleting loan before repayments) is
**enforced at the database level**, so the loan delete silently fails.

**Fix:**
```sql
ALTER TABLE transactions
  DROP CONSTRAINT transactions_related_loan_id_fkey,
  ADD CONSTRAINT transactions_related_loan_id_fkey
    FOREIGN KEY (related_loan_id) REFERENCES loans(id) ON DELETE SET NULL;
```

### S-02 · No soft-delete mechanism
No `deleted_at` / `is_reversed` / `reversal_of_id` columns exist.
Every "reversal" permanently destroys the row.

### S-03 · anon key hardcoded in client bundle
```ts
// supabaseClient.ts:15
const FALLBACK_KEY = "eyJhbGciOiJIUzI1NiI...";
```
Anyone with DevTools can call the Supabase REST API directly using this key,
bypassing the app entirely, and delete any row. RLS policies use `USING (true)`
so there is no per-user protection.

---

## 6. Regression Summary: Reference vs Current

| Area | Reference (Desktop) | Current (Downloads) | Verdict |
|---|---|---|---|
| `deleteTransaction` — LOAN_GIVEN cleanup order | ❌ Bug (same) | ❌ Bug (same + worsened by no error handling) | Regression maintained |
| `deleteTransaction` — local state update | Uses `setTransactions` (React state) only | Uses `transactionsRef.current` + `setTransactions` | 🔴 New risk: stale ref if state not yet flushed |
| `deleteLoan` — ref sync | N/A (no ref in ref version) | ❌ Missing `transactionsRef.current` update | 🔴 New bug introduced |
| `deleteLoan` — LOAN_GIVEN tx cleanup | ✅ Covered via related_loan_id | ✅ Covered (same) | No regression |
| `addContribution` allocation logic | Simple 1-day lookback | 365-day backfill loop over `transactionsRef` | 🟠 Amplified impact of stale ref bugs |
| Error handling on deletes | ❌ None | ❌ None (same) | Not fixed |
| `advance_credit` rollback on delete | ❌ Missing | ❌ Missing (same) | Not fixed |
| Audit log detail | ❌ Sparse | ❌ Sparse (same) | Not fixed |
| Supabase FK safety | ❌ No CASCADE | ❌ No CASCADE (same) | Not fixed |

---

## 7. Recommended Fixes (Priority Order)

### Fix 1 — Correct LOAN_GIVEN deletion order (both versions need this)

**`store.tsx` — replace `deleteTransaction`:**
```ts
const deleteTransaction = async (id: string) => {
  // Use transactionsRef for freshest data
  const transaction = transactionsRef.current.find(t => t.id === id);
  if (!transaction) return;

  // If deleting a LOAN_GIVEN → must delete repayments FIRST (FK order)
  if (transaction.transaction_type === 'LOAN_GIVEN' && transaction.related_loan_id) {
    const loanId = transaction.related_loan_id;

    // 1. Remove repayments from Supabase first
    const { error: repErr } = await supabase.from('transactions')
      .delete().eq('related_loan_id', loanId);
    if (repErr) {
      addNotification(`Failed to remove repayments: ${repErr.message}`, 'error');
      return;
    }

    // 2. Remove loan from Supabase
    const { error: loanErr } = await supabase.from('loans').delete().eq('id', loanId);
    if (loanErr) {
      addNotification(`Failed to remove loan: ${loanErr.message}`, 'error');
      return;
    }

    // 3. Update all local state including ref
    const nextTrans = transactionsRef.current.filter(t => t.related_loan_id !== loanId && t.id !== id);
    transactionsRef.current = nextTrans;
    setTransactions(nextTrans);
    setLoans(prev => prev.filter(l => l.id !== loanId));

    logAudit('DELETED', 'loans', loanId,
      `Loan deleted with LOAN_GIVEN tx ${id} | Amount: ${Math.abs(transaction.amount)} | Acct: ${transaction.accountId}`);
    try { localStorage.setItem('wealthshare_transactions', JSON.stringify(nextTrans)); } catch(e) {}
    return;
  }

  // Standard single-transaction delete
  const { error } = await supabase.from('transactions').delete().eq('id', id);
  if (error) {
    addNotification(`Delete failed: ${error.message}`, 'error');
    return; // Do NOT mutate local state
  }

  const nextTrans = transactionsRef.current.filter(t => t.id !== id);
  transactionsRef.current = nextTrans;
  setTransactions(nextTrans);
  try { localStorage.setItem('wealthshare_transactions', JSON.stringify(nextTrans)); } catch(e) {}
  logAudit('DELETED', 'transactions', id,
    `Deleted ${transaction.transaction_type} | Amt: ${transaction.amount} | Acct: ${transaction.accountId} | Member: ${transaction.memberId || 'N/A'}`);
};
```

### Fix 2 — Sync `transactionsRef` in `deleteLoan` (current version)

**`store.tsx` — replace `deleteLoan`:**
```ts
const deleteLoan = async (id: string) => {
  // 1. Delete all associated transactions in DB first
  const { error: txErr } = await supabase.from('transactions').delete().eq('related_loan_id', id);
  if (txErr) { addNotification(`Error removing loan transactions: ${txErr.message}`, 'error'); return; }

  // 2. Delete the loan
  const { error: loanErr } = await supabase.from('loans').delete().eq('id', id);
  if (loanErr) { addNotification(`Error removing loan: ${loanErr.message}`, 'error'); return; }

  // 3. Sync ALL local state including transactionsRef
  const nextTrans = transactionsRef.current.filter(t => t.related_loan_id !== id);
  transactionsRef.current = nextTrans;           // ← THIS WAS MISSING
  setTransactions(nextTrans);
  setLoans(prev => prev.filter(l => l.id !== id));
  try { localStorage.setItem('wealthshare_transactions', JSON.stringify(nextTrans)); } catch(e) {}

  logAudit('DELETED', 'loans', id, `Deleted loan and all related transactions`);
};
```

### Fix 3 — Add FK safety in Supabase (run in SQL Editor)
```sql
ALTER TABLE transactions
  DROP CONSTRAINT transactions_related_loan_id_fkey,
  ADD CONSTRAINT transactions_related_loan_id_fkey
    FOREIGN KEY (related_loan_id) REFERENCES loans(id) ON DELETE SET NULL;
```

### Fix 4 — Richer audit log at deletion time
Replace all `logAudit('DELETED', 'transactions', id, 'Deleted Transaction')` calls
with:
```ts
logAudit('DELETED', 'transactions', id,
  `Deleted ${transaction.transaction_type} | Amt: ${transaction.amount} | ` +
  `Fund: ${transaction.fund_type} | Acct: ${transaction.accountId} | ` +
  `Member: ${transaction.memberId ?? 'N/A'} | Date: ${transaction.date}`);
```
