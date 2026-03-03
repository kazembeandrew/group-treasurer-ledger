import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, (process as any).cwd(), '');

  return {
    plugins: [react()],
    base: './', // Ensures assets are loaded correctly on GitHub Pages using relative paths
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
    define: {
      // Polyfill process.env.API_KEY to make it accessible to the client-side SDK
      // Prioritizes VITE_API_KEY, falls back to API_KEY.
      // We explicitly check process.env to ensure system variables (like in Netlify CI) are captured
      // even if they aren't in a local .env file.
      'process.env.GEMINI_API_KEY': JSON.stringify(
        env.GEMINI_API_KEY || 
        process.env.GEMINI_API_KEY || 
        env.VITE_GEMINI_API_KEY ||
        process.env.VITE_GEMINI_API_KEY ||
        ''
      ),
      'process.env.API_KEY': JSON.stringify(
        env.VITE_API_KEY || 
        env.API_KEY || 
        process.env.VITE_API_KEY || 
        process.env.API_KEY || 
        ''
      ),
      // Inject Supabase keys with the same logic
      'process.env.VITE_SUPABASE_URL': JSON.stringify(
        env.VITE_SUPABASE_URL || 
        process.env.VITE_SUPABASE_URL || 
        ''
      ),
      'process.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(
        env.VITE_SUPABASE_ANON_KEY || 
        process.env.VITE_SUPABASE_ANON_KEY || 
        ''
      ),
    }
  };
});