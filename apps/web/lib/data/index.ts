import { demoDataSource } from './demo';
import type { DataSource } from './types';

export * from './types';

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
  // The Supabase data source is added once the project exists. Until then the
  // app only runs in demo mode.
  throw new Error('No data source configured. Set HC247_DEMO_MODE=true for local development.');
}
