import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { Lock, Unlock, Mail, Loader2, AlertCircle, ArrowRight, UserPlus } from 'lucide-react';

// Set this to true to allow users to register via the app
const ALLOW_SIGNUP = true;

export const LoginScreen: React.FC = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        setMessage('Account created! Please check your email to verify.');
        setIsSignUp(false); // Switch back to login view
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        // App.tsx handles the state change via onAuthStateChange
      }
    } catch (err: any) {
      if (err.message && err.message.includes('Signups not allowed')) {
        setError('Signups are disabled in Supabase. Enable them in Auth > Providers > Email, or add a user manually in the Dashboard.');
      } else {
        setError(err.message || 'Authentication failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-blue-600 p-8 text-center">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm text-white">
            <Lock size={32} />
          </div>
          <h1 className="text-2xl font-bold text-white">WealthShare Manager</h1>
          <p className="text-blue-100 mt-1">Secure Cloud Access</p>
        </div>

        {/* Form */}
        <div className="p-8">
          {error && (
            <div className="mb-6 p-3 bg-red-50 border border-red-100 rounded-lg flex items-center text-red-700 text-sm">
              <AlertCircle size={16} className="mr-2 shrink-0" />
              {error}
            </div>
          )}
          
          {message && (
            <div className="mb-6 p-3 bg-emerald-50 border border-emerald-100 rounded-lg flex items-center text-emerald-700 text-sm">
              <UserPlus size={16} className="mr-2 shrink-0" />
              {message}
            </div>
          )}

          <form onSubmit={handleAuth} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="email"
                  required
                  className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 bg-white"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="password"
                  required
                  minLength={6}
                  className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 bg-white"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 size={20} className="animate-spin" />
              ) : isSignUp ? (
                <>
                  <UserPlus size={20} /> Sign Up
                </>
              ) : (
                <>
                  <Unlock size={20} /> Sign In
                </>
              )}
            </button>
          </form>

          {ALLOW_SIGNUP && (
            <div className="mt-6 text-center">
              <button
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setError(null);
                  setMessage(null);
                }}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center justify-center mx-auto gap-1"
              >
                {isSignUp ? (
                  <>Already have an account? Sign In <ArrowRight size={14} /></>
                ) : (
                  <>Don't have an account? Create one <ArrowRight size={14} /></>
                )}
              </button>
            </div>
          )}
          
          {!ALLOW_SIGNUP && (
             <div className="mt-6 text-center">
               <p className="text-xs text-slate-400">
                 Registration is currently disabled. Please contact your administrator.
               </p>
             </div>
          )}
        </div>

        <div className="bg-slate-50 p-4 text-center border-t border-slate-100">
          <p className="text-xs text-slate-400">
            Protected by Supabase Authentication
          </p>
        </div>
      </div>
    </div>
  );
};