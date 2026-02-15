
import { createClient } from '@supabase/supabase-js';

// Local Storage Mock Client for Offline Mode
// Defined first to be available for fallback
const createMockClient = () => {
  const getTable = (table: string) => {
    try {
      const data = localStorage.getItem(`wealthshare_${table}`);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  };
  
  const setTable = (table: string, data: any[]) => {
    try {
      localStorage.setItem(`wealthshare_${table}`, JSON.stringify(data));
    } catch (e) {
      console.error("LocalStorage write failed", e);
    }
  };

  return {
    from: (table: string) => ({
      select: (query?: string) => {
        let currentData = getTable(table);
        
        // Return a 'Thenable' builder object to allow chaining .order() or awaiting results
        const builder = {
          order: (column: string, { ascending = true } = {}) => {
            currentData.sort((a: any, b: any) => {
              if (a[column] < b[column]) return ascending ? -1 : 1;
              if (a[column] > b[column]) return ascending ? 1 : -1;
              return 0;
            });
            return builder;
          },
          // Make the object thenable so it can be awaited
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
          // Used for resetData: delete where id != '000...'
          const current = getTable(table);
          const newData = current.filter((item: any) => item[col] === val);
          setTable(table, newData);
          return Promise.resolve({ data: null, error: null });
        }
      })
    })
  };
};

// 1. Try process.env (Build time / Vercel envs)
const envUrl = process.env.VITE_SUPABASE_URL;
const envKey = process.env.VITE_SUPABASE_ANON_KEY;

// 2. Try LocalStorage (User entered in Settings)
const storedUrl = localStorage.getItem('wealthshare_supabase_url');
const storedKey = localStorage.getItem('wealthshare_supabase_key');

// Prioritize stored keys if they exist (allows overriding env vars via UI)
const supabaseUrl = storedUrl || envUrl || '';
const supabaseAnonKey = storedKey || envKey || '';

// Validate URL format helper
const isValidUrl = (urlString: string) => {
  try { 
    return Boolean(new URL(urlString)); 
  } catch(e) { 
    return false; 
  }
};

let client;
let mode = false;

// Attempt to initialize Supabase client
if (isValidUrl(supabaseUrl) && supabaseAnonKey && supabaseAnonKey.length > 0) {
  try {
    client = createClient(supabaseUrl, supabaseAnonKey);
    mode = true;
  } catch (e) {
    console.error("Supabase Client Init Failed:", e);
    console.warn("Falling back to offline mode due to initialization error.");
    client = createMockClient();
    mode = false;
  }
} else {
  // If credentials are missing or invalid URL, default to offline
  if (storedUrl && !isValidUrl(storedUrl)) {
    console.error("Stored Supabase URL is invalid:", storedUrl);
  }
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
