import { redirect } from 'next/navigation';
import { getSession, homeFor } from '@/lib/session';

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { code } = await searchParams;
  // An email link that came back with a one-time code: let the sign-in page pass it on.
  if (typeof code === 'string') redirect(`/sign-in?code=${encodeURIComponent(code)}`);
  const user = await getSession();
  redirect(user ? homeFor(user) : '/sign-in');
}
