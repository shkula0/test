import { createDemoBackend } from './demo.js';
import { createSupabaseBackend } from './supabase.js';

const config = window.APP_CONFIG ?? {};

export const api = config.supabaseUrl && config.supabaseAnonKey && window.supabase
  ? createSupabaseBackend(config)
  : createDemoBackend();
