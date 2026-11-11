'use server';

import { redirect } from 'next/navigation';
import { getSession, homeFor } from '@/lib/session';
import { supabaseServer } from '@/lib/supabase/server';

export async function setPasswordAction(form: FormData) {
  const password = form.get('password');
  const confirm = form.get('confirm');
  if (typeof password !== 'string' || password.length < 10 || password !== confirm) {
    redirect('/account/password?notice=weak_password');
  }
  const db = await supabaseServer();
  const { data } = await db.auth.getUser();
  if (!data.user) redirect('/sign-in?reset=1&notice=link_expired');
  const { error } = await db.auth.updateUser({ password });
  if (error) redirect('/account/password?notice=weak_password');
  await db.rpc('app_mark_active');
  const user = await getSession();
  if (!user) {
    await db.auth.signOut();
    redirect('/sign-in?notice=no_access');
  }
  redirect(`${homeFor(user)}?notice=password_set`);
}
