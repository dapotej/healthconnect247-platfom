import { supabaseConfig } from '../supabase/config';
import { demoDataSource } from './demo';
import { supabaseDataSource } from './supabase';
import type { DataSource } from './types';

export * from './types';

/** Demo data and demo sign-in. Never set HC247_DEMO_MODE in production. */
export function isDemoMode(): boolean {
  return process.env.HC247_DEMO_MODE === 'true';
}

/** The current time. Demo mode uses a fixed time so the data matches the mockups. */
export function now(): string {
  if (isDemoMode()) return process.env.HC247_DEMO_NOW ?? '2026-11-10T22:00:00+01:00';
  return new Date().toISOString();
}

export function getData(): DataSource {
  if (isDemoMode()) return demoDataSource;
  if (supabaseConfig()) return supabaseDataSource;
  throw new Error('No data source configured. Set the Supabase variables (see .env.example), or HC247_DEMO_MODE=true for local demos.');
}
