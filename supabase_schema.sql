
-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Members Table
create table members (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  active boolean default true,
  advance_credit numeric default 0,
  created_at timestamp with time zone default now()
);

-- Accounts Table
create table accounts (
  id uuid primary key default uuid_generate_v4(),
  account_name text not null,
  type text not null, -- CASH, MOBILE, BANK, MEMBER
  active boolean default true,
  member_id uuid references members(id), -- Optional link to member
  created_at timestamp with time zone default now()
);

-- Loans Table
create table loans (
  id uuid primary key default uuid_generate_v4(),
  member_id uuid references members(id) not null,
  amount_given numeric not null,
  interest_rate numeric default 10,
  date_given date not null,
  due_date date not null,
  created_at timestamp with time zone default now()
);

-- Transactions Table
create table transactions (
  id uuid primary key default uuid_generate_v4(),
  date date not null,
  member_id uuid references members(id),
  account_id uuid references accounts(id) not null,
  fund_type text not null, -- PRINCIPAL, INTEREST
  transaction_type text not null, -- CONTRIBUTION, LOAN_GIVEN, LOAN_REPAYMENT, EXPENSE, TRANSFER, OPENING_BALANCE
  amount numeric not null,
  related_loan_id uuid references loans(id),
  notes text,
  created_at timestamp with time zone default now()
);

-- AI Chat History Table
create table ai_chat_history (
  id uuid primary key default uuid_generate_v4(),
  sender text not null, -- 'user' or 'ai'
  text text,
  actions jsonb, -- Store actions as JSON
  timestamp timestamp with time zone default now()
);

-- Create indexes for performance
create index idx_transactions_date on transactions(date);
create index idx_transactions_member_id on transactions(member_id);
create index idx_loans_member_id on loans(member_id);
create index idx_chat_timestamp on ai_chat_history(timestamp);
