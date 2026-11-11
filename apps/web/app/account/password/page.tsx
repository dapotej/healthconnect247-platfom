import { redirect } from 'next/navigation';
import { Notice } from '@/components/Notice';
import { isDemoMode } from '@/lib/data';
import { supabaseServer } from '@/lib/supabase/server';
import { setPasswordAction } from './actions';

export const dynamic = 'force-dynamic';

/** Set a password, after following an invitation or reset link. */
export default async function SetPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (isDemoMode()) redirect('/sign-in');
  const { data } = await (await supabaseServer()).auth.getUser();
  if (!data.user) redirect('/sign-in?reset=1&notice=link_expired');
  const params = await searchParams;
  return (
    <div className="signin">
      <div className="brand-side">
        <img src="/logo-white.png" alt="HealthConnect 24x7. You Call. We Care." style={{ width: 240, height: 'auto' }} />
      </div>
      <div className="form-side">
        <form action={setPasswordAction} className="accounts stack" style={{ gap: 12 }}>
          <h2 style={{ fontFamily: 'var(--display)', fontSize: 28 }}>Choose a password</h2>
          <p className="muted" style={{ margin: 0 }}>For {data.user.email}. Use at least 10 characters; a short sentence works well.</p>
          <Notice params={params} />
          <div className="field">
            <label htmlFor="password">New password</label>
            <input id="password" className="input" name="password" type="password" autoComplete="new-password" minLength={10} required />
          </div>
          <div className="field">
            <label htmlFor="confirm">Type it again</label>
            <input id="confirm" className="input" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
          </div>
          <button className="btn btn-primary" type="submit">Save password</button>
        </form>
      </div>
    </div>
  );
}
