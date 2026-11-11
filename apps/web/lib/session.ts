import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { isDemoMode } from './data';
import { supabaseServer } from './supabase/server';

export type Role = 'ops_admin' | 'finance' | 'client_admin' | 'client_finance' | 'client_viewer';

export interface SessionUser {
  id: string;
  name: string;
  title: string;
  role: Role;
  clientId: string | null;
}

/** Demo accounts (demo mode only). Real accounts come from Supabase Auth and public.profiles. */
export const DEMO_USERS: SessionUser[] = [
  { id: 'demo-hmo-a-admin', name: '[Name]', title: 'Head of claims, [HMO A]', role: 'client_admin', clientId: 'hmo-a' },
  { id: 'demo-hmo-b-admin', name: '[Name]', title: 'Claims manager, [HMO B]', role: 'client_admin', clientId: 'hmo-b' },
  { id: 'demo-lagos-viewer', name: '[Name]', title: 'Scheme officer, Lagos State', role: 'client_viewer', clientId: 'lagos-state' },
  { id: 'demo-ops', name: 'Tola Bankole', title: 'Operations manager', role: 'ops_admin', clientId: null },
  { id: 'demo-finance', name: '[Name]', title: 'Finance officer', role: 'finance', clientId: null },
];

const COOKIE = 'hc247_demo_user';

const ROLE_TITLES: Record<Role, string> = {
  ops_admin: 'Operations',
  finance: 'Finance',
  client_admin: 'Administrator',
  client_finance: 'Finance',
  client_viewer: 'Viewer',
};

/** A real account from Supabase Auth and public.profiles, as the database sees it. */
interface WhoAmI {
  id: string;
  fullName: string;
  role: string;
  clientId: string | null;
  clientName: string | null;
  status: 'invited' | 'active' | 'disabled';
}

/**
 * The signed-in person, or null. Real accounts need a profile with a role
 * that uses this site (operations, finance or a client role) and must not be
 * disabled. Clinical staff will use the clinician console instead.
 */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  if (isDemoMode()) {
    const id = (await cookies()).get(COOKIE)?.value;
    return DEMO_USERS.find((u) => u.id === id) ?? null;
  }
  const db = await supabaseServer();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return null;
  const { data: me } = await db.rpc('app_whoami');
  const who = me as WhoAmI | null;
  if (!who || who.status === 'disabled' || !(who.role in ROLE_TITLES)) return null;
  const role = who.role as Role;
  return {
    id: who.id,
    name: who.fullName,
    title: who.clientName ? `${ROLE_TITLES[role]}, ${who.clientName}` : ROLE_TITLES[role],
    role,
    clientId: who.clientId,
  };
});

export async function signInAsDemoUser(id: string): Promise<SessionUser | null> {
  if (!isDemoMode()) return null;
  const user = DEMO_USERS.find((u) => u.id === id);
  if (!user) return null;
  (await cookies()).set(COOKIE, user.id, { httpOnly: true, sameSite: 'lax', path: '/' });
  return user;
}

export async function signOut(): Promise<void> {
  if (isDemoMode()) {
    (await cookies()).delete(COOKIE);
    return;
  }
  await (await supabaseServer()).auth.signOut();
}

export function homeFor(user: SessionUser): string {
  return user.clientId ? '/portal' : '/admin';
}

/** For client portal pages: a signed-in HMO user. */
export async function requireClientUser(): Promise<SessionUser & { clientId: string }> {
  const user = await getSession();
  if (!user) redirect('/sign-in');
  if (!user.clientId) redirect('/admin');
  return user as SessionUser & { clientId: string };
}

/** For admin console pages: operations or finance staff. */
export async function requireStaff(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) redirect('/sign-in');
  if (user.clientId) redirect('/portal');
  return user;
}

export function canSeeInvoices(user: SessionUser): boolean {
  return user.role !== 'client_viewer';
}

/**
 * What each staff role may change. These mirror the database's row-level
 * security policies; the database is the final check.
 */
export const can = {
  manageMembers: (u: SessionUser) => u.role === 'ops_admin',
  manageInvoices: (u: SessionUser) => u.role === 'finance',
  recordTopUps: (u: SessionUser) => u.role === 'ops_admin' || u.role === 'finance',
  manageStaff: (u: SessionUser) => u.role === 'ops_admin',
  importConsultations: (u: SessionUser) => u.role === 'ops_admin',
};
