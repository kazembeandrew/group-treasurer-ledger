import { createClient } from '@supabase/supabase-js';

// ============================================================================
// CONFIGURATION
// ============================================================================
// Priority: Environment Variables (Netlify/Vite) -> Hardcoded Fallbacks -> Mock Mode
// ============================================================================

// Check for environment variables injected by Vite
const ENV_SUPABASE_URL = (import.meta as any).env.VITE_SUPABASE_URL;
const ENV_SUPABASE_KEY = (import.meta as any).env.VITE_SUPABASE_ANON_KEY;

// Hardcoded fallbacks (for local/demo purposes if env vars are missing)
const FALLBACK_URL = "https://gntyaxyjlppapkfonkpj.supabase.co";
const FALLBACK_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdudHlheHlqbHBwYXBrZm9ua3BqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExMDMyODAsImV4cCI6MjA4NjY3OTI4MH0.tNdPj5lN6WfDeMpgvM5D5n4NuIzhT61DrKBDTmUXdys";

const SUPABASE_URL = ENV_SUPABASE_URL || FALLBACK_URL;
const SUPABASE_ANON_KEY = ENV_SUPABASE_KEY || FALLBACK_KEY;
const FORCE_OFFLINE = (import.meta as any).env.VITE_OFFLINE_MODE === 'true';

// ============================================================================

// Local Storage Mock Client for Offline Mode
const createMockClient = () => {
  const getTable = (table: string) => {
    try {
      const data = localStorage.getItem(`wealthshare_${table}`);
      return data ? JSON.parse(atob(data)) : [];
    } catch (e) {
      return [];
    }
  };
  
  const setTable = (table: string, data: any[]) => {
    try {
      localStorage.setItem(`wealthshare_${table}`, btoa(JSON.stringify(data)));
    } catch (e) {
      console.error("LocalStorage write failed", e);
    }
  };

  return {
    from: (table: string) => ({
      select: (query?: string) => {
        let currentData = getTable(table);
        
        const builder = {
          order: (column: string, { ascending = true } = {}) => {
            currentData.sort((a: any, b: any) => {
              if (a[column] < b[column]) return ascending ? -1 : 1;
              if (a[column] > b[column]) return ascending ? 1 : -1;
              return 0;
            });
            return builder;
          },
          then: (onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any) => {
            const result = { data: currentData, error: null };
            return Promise.resolve(result).then(onfulfilled, onrejected);
          }
        };
        return builder;
      },
      insert: (rowOrRows: any) => {
        const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
        const current = getTable(table);
        const newData = [...current, ...rows];
        setTable(table, newData);
        return Promise.resolve({ data: rows, error: null });
      },
      update: (updates: any) => ({
        eq: (col: string, val: any) => {
          const current = getTable(table);
          const newData = current.map((item: any) => item[col] === val ? { ...item, ...updates } : item);
          setTable(table, newData);
          return Promise.resolve({ data: [updates], error: null });
        }
      }),
      delete: () => ({
        eq: (col: string, val: any) => {
          const current = getTable(table);
          const newData = current.filter((item: any) => item[col] !== val);
          setTable(table, newData);
          return Promise.resolve({ data: null, error: null });
        },
        neq: (col: string, val: any) => {
          const current = getTable(table);
          const newData = current.filter((item: any) => item[col] === val);
          setTable(table, newData);
          return Promise.resolve({ data: null, error: null });
        }
      })
    }),
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: 'offline-user', email: 'offline@wealthshare.local' }, access_token: 'mock-token', token_type: 'bearer', expires_in: 3600, refresh_token: 'mock-refresh' } }, error: null }),
      onAuthStateChange: (callback: any) => {
        // Trigger initial state
        callback('SIGNED_IN', { user: { id: 'offline-user' } });
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      signInWithPassword: () => Promise.resolve({ data: { session: { user: { id: 'offline-user' } } }, error: null }),
      signUp: () => Promise.resolve({ data: { user: { id: 'offline-user' } }, error: null }),
      signOut: () => {
         // In a real mock, we might clear a flag, but for now we just resolve
         return Promise.resolve({ error: null });
      }
    }
  };
};

const isValidUrl = (urlString: string | undefined) => {
  if (!urlString) return false;
  try { 
    return urlString.startsWith('http');
  } catch(e) { 
    return false; 
  }
};

let client;
let mode = false;

// Attempt to initialize Supabase client
// We check if the URL is valid and contains the real supabase URL pattern
if (!FORCE_OFFLINE && isValidUrl(SUPABASE_URL) && !SUPABASE_URL.includes("your-project-id") && SUPABASE_ANON_KEY.length > 20) {
  try {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    mode = true;
  } catch (e) {
    console.error("Supabase Client Init Failed:", e);
    client = createMockClient();
    mode = false;
  }
} else {
  // console.warn("Supabase Keys placeholder detected or Force Offline enabled. Using Offline Mock Mode.");
  client = createMockClient();
  mode = false;
}

if (!mode) {
  console.info("%cWealthShare Manager: Running in Offline Demo Mode", "color: #3b82f6; font-weight: bold;");
} else {
  console.info("%cWealthShare Manager: Connected to Cloud Database", "color: #10b981; font-weight: bold;");
}

export const supabase = client as any;
export const isCloudMode = mode;
export const offlineReason = FORCE_OFFLINE 
  ? "Forced Offline" 
  : (!ENV_SUPABASE_URL || !ENV_SUPABASE_KEY) 
    ? "Missing Configuration" 
    : "Connection Failed";