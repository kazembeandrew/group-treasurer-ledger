-- ============================================================================
-- WEALTHSHARE TREASURER LEDGER - SUPABASE RLS & POLICIES SETUP SCRIPT
-- Copy and run this script in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/gntyaxyjlppapkfonkpj/sql/new
-- ============================================================================

-- 1. Enable Row Level Security (RLS) on all exposed tables
ALTER TABLE IF EXISTS public.admin_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ai_chat_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies to prevent conflicts
DROP POLICY IF EXISTS "Allow full access to admin_roles" ON public.admin_roles;
DROP POLICY IF EXISTS "Allow full access to members" ON public.members;
DROP POLICY IF EXISTS "Allow full access to accounts" ON public.accounts;
DROP POLICY IF EXISTS "Allow full access to transactions" ON public.transactions;
DROP POLICY IF EXISTS "Allow full access to loans" ON public.loans;
DROP POLICY IF EXISTS "Allow full access to ai_chat_history" ON public.ai_chat_history;
DROP POLICY IF EXISTS "Allow full access to audit_logs" ON public.audit_logs;

-- 3. Create RLS Policies allowing full read/write access for app operations
CREATE POLICY "Allow full access to admin_roles" ON public.admin_roles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access to members" ON public.members FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access to accounts" ON public.accounts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access to transactions" ON public.transactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access to loans" ON public.loans FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access to ai_chat_history" ON public.ai_chat_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access to audit_logs" ON public.audit_logs FOR ALL USING (true) WITH CHECK (true);

-- 4. Ensure table access grants are assigned to anon and authenticated roles
GRANT ALL ON public.admin_roles TO anon, authenticated, service_role;
GRANT ALL ON public.members TO anon, authenticated, service_role;
GRANT ALL ON public.accounts TO anon, authenticated, service_role;
GRANT ALL ON public.transactions TO anon, authenticated, service_role;
GRANT ALL ON public.loans TO anon, authenticated, service_role;
GRANT ALL ON public.ai_chat_history TO anon, authenticated, service_role;
GRANT ALL ON public.audit_logs TO anon, authenticated, service_role;
