'use server';

import { redirect } from 'next/navigation';
import { homeFor, signInAsDemoUser, signOut } from '@/lib/session';

export async function demoSignInAction(formData: FormData) {
  const user = await signInAsDemoUser(String(formData.get('userId') ?? ''));
  redirect(user ? homeFor(user) : '/sign-in');
}

export async function signOutAction() {
  await signOut();
  redirect('/sign-in');
}
