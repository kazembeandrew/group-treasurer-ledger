-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- =========================================================
-- TABLES
-- =========================================================

-- Members Table
create table if not exists members (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  active boolean default true,
  advance_credit numeric default 0,
  created_at timestamp with time zone default now()
);

-- Accounts Table
create table if not exists accounts (
  id uuid primary key default uuid_generate_v4(),
  account_name text not null,
  type text not null, -- CASH, MOBILE, BANK, MEMBER
  active boolean default true,
  member_id uuid references members(id),
  created_at timestamp with time zone default now()
);

-- Loans Table
create table if not exists loans (
  id uuid primary key default uuid_generate_v4(),
  member_id uuid references members(id) not null,
  amount_given numeric not null,
  interest_rate numeric not null,
  interest_amount numeric,
  date_given date not null,
  due_date date not null,
  created_at timestamp with time zone default now()
);

-- Transactions Table
create table if not exists transactions (
  id uuid primary key default uuid_generate_v4(),
  date date not null,
  member_id uuid references members(id),
  account_id uuid references accounts(id),
  fund_type text not null, -- PRINCIPAL, INTEREST
  transaction_type text not null, -- CONTRIBUTION, LOAN_REPAYMENT, etc
  amount numeric not null,
  related_loan_id uuid references loans(id),
  notes text,
  created_at timestamp with time zone default now(),
  last_modified timestamp with time zone default now(),
  created_by text default 'Treasurer'
);

-- AI Chat History
create table if not exists ai_chat_history (
  id uuid primary key default uuid_generate_v4(),
  sender text not null, -- 'user' or 'ai'
  text text,
  actions jsonb,
  timestamp timestamp with time zone default now()
);

-- Audit Logs
create table if not exists audit_logs (
  id uuid primary key default uuid_generate_v4(),
  action_type text not null, -- CREATED, UPDATED, DELETED
  table_name text not null,
  record_id uuid not null,
  details text,
  device_id text,
  timestamp timestamp with time zone default now()
);

-- =========================================================
-- INDICES
-- =========================================================

create index if not exists idx_audit_timestamp on audit_logs(timestamp);
create index if not exists idx_transactions_date on transactions(date);
create index if not exists idx_transactions_member on transactions(member_id);

-- =========================================================
-- AUTHENTICATION & PERMISSIONS (Row Level Security)
-- =========================================================

-- Enable RLS on all tables
alter table members enable row level security;
alter table accounts enable row level security;
alter table loans enable row level security;
alter table transactions enable row level security;
alter table ai_chat_history enable row level security;
alter table audit_logs enable row level security;

-- Create Policies to allow public access (For Demo/Internal Tool use)
-- Replace 'true' with 'auth.uid() = user_id' logic for multi-tenant apps

-- MEMBERS
create policy "Enable access for all users" on members for all using (true) with check (true);

-- ACCOUNTS
create policy "Enable access for all users" on accounts for all using (true) with check (true);

-- LOANS
create policy "Enable access for all users" on loans for all using (true) with check (true);

-- TRANSACTIONS
create policy "Enable access for all users" on transactions for all using (true) with check (true);

-- AI CHAT HISTORY
create policy "Enable access for all users" on ai_chat_history for all using (true) with check (true);

-- AUDIT LOGS
create policy "Enable access for all users" on audit_logs for all using (true) with check (true);
