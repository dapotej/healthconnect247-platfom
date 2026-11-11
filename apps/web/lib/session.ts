import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { isDemoMode } from './data';

export type Role = 'ops_admin' | 'finance' | 'client_admin' | 'client_finance' | 'client_viewer';

export interface SessionUser {
  id: string;
  name: string;
  title: string;
  role: Role;
  clientId: string | null;
}

/** Demo accounts. Real accounts will come from Supabase Auth and public.profiles. */
export const DEMO_USERS: SessionUser[] = [
  { id: 'demo-hmo-a-admin', name: '[Name]', title: 'Head of claims, [HMO A]', role: 'client_admin', clientId: 'hmo-a' },
  { id: 'demo-hmo-b-admin', name: '[Name]', title: 'Claims manager, [HMO B]', role: 'client_admin', clientId: 'hmo-b' },
  { id: 'demo-lagos-viewer', name: '[Name]', title: 'Scheme officer, Lagos State', role: 'client_viewer', clientId: 'lagos-state' },
  { id: 'demo-ops', name: 'Tola Bankole', title: 'Operations manager', role: 'ops_admin', clientId: null },
  { id: 'demo-finance', name: '[Name]', title: 'Finance officer', role: 'finance', clientId: null },
];

const COOKIE = 'hc247_demo_user';

export async function getSession(): Promise<SessionUser | null> {
  if (!isDemoMode()) return null;
  const id = (await cookies()).get(COOKIE)?.value;
  return DEMO_USERS.find((u) => u.id === id) ?? null;
}

export async function signInAsDemoUser(id: string): Promise<SessionUser | null> {
  if (!isDemoMode()) return null;
  const user = DEMO_USERS.find((u) => u.id === id);
  if (!user) return null;
  (await cookies()).set(COOKIE, user.id, { httpOnly: true, sameSite: 'lax', path: '/' });
  return user;
}

export async function signOut(): Promise<void> {
  (await cookies()).delete(COOKIE);
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
