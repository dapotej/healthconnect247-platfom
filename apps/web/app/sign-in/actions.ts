'use server';

import { redirect } from 'next/navigation';
import { isDemoMode } from '@/lib/data';
import { getSession, homeFor, signInAsDemoUser, signOut } from '@/lib/session';
import { siteUrl, supabaseServer } from '@/lib/supabase/server';

function field(form: FormData, name: string): string {
  const v = form.get(name);
  return typeof v === 'string' ? v.trim() : '';
}

export async function demoSignInAction(formData: FormData) {
  const user = await signInAsDemoUser(field(formData, 'userId'));
  redirect(user ? homeFor(user) : '/sign-in');
}

export async function signInAction(form: FormData) {
  if (isDemoMode()) redirect('/sign-in');
  const email = field(form, 'email').toLowerCase();
  const password = form.get('password');
  if (!email || typeof password !== 'string' || !password) redirect('/sign-in?notice=bad_credentials');
  const db = await supabaseServer();
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) redirect('/sign-in?notice=bad_credentials');
  const user = await getSession();
  if (!user) {
    await db.auth.signOut();
    redirect('/sign-in?notice=no_access');
  }
  redirect(homeFor(user));
}

/** Always says the same thing, so it can't be used to find out who has an account. */
export async function resetPasswordAction(form: FormData) {
  if (isDemoMode()) redirect('/sign-in');
  const email = field(form, 'email').toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const db = await supabaseServer();
    await db.auth.resetPasswordForEmail(email, { redirectTo: `${siteUrl()}/auth/callback?next=/account/password` });
  }
  redirect('/sign-in?notice=reset_sent');
}

export async function signOutAction() {
  await signOut();
  redirect(isDemoMode() ? '/sign-in' : '/sign-in?notice=signed_out');
}
