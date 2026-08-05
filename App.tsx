import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { StoreProvider } from './store';
import { Layout } from './components/Layout';
import { LoginScreen } from './components/LoginScreen';
import { Dashboard } from './pages/Dashboard';
import { Members } from './pages/Members';
import { Accounts } from './pages/Accounts';
import { Transactions } from './pages/Transactions';
import { Loans } from './pages/Loans';
import { Reports } from './pages/Reports';
import { Settings } from './pages/Settings';
import { AiAssistant } from './pages/AiAssistant';
import { Loader2 } from 'lucide-react';

const App: React.FC = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Check active session on load with timeout to prevent FCP delays
    const sessionPromise = supabase.auth.getSession();
    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve({ data: { session: null } }), 1200));

    Promise.race([sessionPromise, timeoutPromise])
      .then((res: any) => {
        if (res && res.data) {
          setSession(res.data.session);
        }
      })
      .catch((err: any) => {
        console.error("Session fetch failed:", err);
      })
      .finally(() => {
        setLoading(false);
      });

    // 2. Listen for auth changes (login, logout, etc.)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: string, session: Session | null) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-400">
        <Loader2 size={48} className="animate-spin mb-4 text-blue-600" />
        <p>Connecting to secure server...</p>
      </div>
    );
  }

  if (!session) {
    return <LoginScreen />;
  }

  return (
    <StoreProvider>
      <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/ai" element={<AiAssistant />} />
            <Route path="/members" element={<Members />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/loans" element={<Loans />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Layout>
      </HashRouter>
    </StoreProvider>
  );
};

export default App;