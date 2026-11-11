import { Notice } from '@/components/Notice';
import { isDemoMode } from '@/lib/data';
import { DEMO_USERS } from '@/lib/session';
import { demoSignInAction, resetPasswordAction, signInAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const demo = isDemoMode();
  const resetting = params.reset === '1';
  return (
    <div className="signin">
      <div className="brand-side">
        <img src="/logo-white.png" alt="HealthConnect 24x7. You Call. We Care." style={{ width: 240, height: 'auto' }} />
        <div className="stack" style={{ gap: 16 }}>
          <span className="eyebrow" style={{ color: 'var(--teal)' }}>
            Client portal and admin console
          </span>
          <h1>For HMOs, health schemes and the HealthConnect team.</h1>
          <p style={{ margin: 0, fontSize: 16, color: 'var(--on-dark-muted)' }}>
            Manage members, see how they use the service, download claims data and keep accounts topped up.
          </p>
        </div>
        <span className="small" style={{ color: 'var(--on-dark-muted)' }}>
          The portal shows member and billing data only, never clinical notes.
        </span>
      </div>
      <div className="form-side">
        <div className="accounts">
          <h2 style={{ fontFamily: 'var(--display)', fontSize: 28 }}>{resetting ? 'Set a new password' : 'Sign in'}</h2>
          <Notice params={params} />
          {demo ? (
            <>
              <p className="muted" style={{ margin: 0 }}>
                Demo mode: choose an account to see the portal or console as that person would.
              </p>
              {DEMO_USERS.map((u) => (
                <form key={u.id} action={demoSignInAction}>
                  <input type="hidden" name="userId" value={u.id} />
                  <button className="account" type="submit">
                    <span className="strong">{u.title}</span>
                    <span className="small muted">{u.clientId ? 'Client portal' : 'Admin console'}</span>
                  </button>
                </form>
              ))}
            </>
          ) : resetting ? (
            <form action={resetPasswordAction} className="stack" style={{ gap: 12 }}>
              <p className="muted" style={{ margin: 0 }}>We’ll email you a link to set a new password.</p>
              <div className="field">
                <label htmlFor="reset-email">Work email</label>
                <input id="reset-email" className="input" name="email" type="email" autoComplete="email" required />
              </div>
              <button className="btn btn-primary" type="submit">Email me a link</button>
              <a href="/sign-in" className="small">Back to sign in</a>
            </form>
          ) : (
            <form action={signInAction} className="stack" style={{ gap: 12 }}>
              <div className="field">
                <label htmlFor="email">Work email</label>
                <input id="email" className="input" name="email" type="email" autoComplete="email" required />
              </div>
              <div className="field">
                <label htmlFor="password">Password</label>
                <input id="password" className="input" name="password" type="password" autoComplete="current-password" required />
              </div>
              <button className="btn btn-primary" type="submit">Sign in</button>
              <a href="/sign-in?reset=1" className="small">Forgotten your password, or first time here?</a>
              <p className="small muted" style={{ margin: 0 }}>
                Accounts are set up by HealthConnect. If you need one, ask your account manager.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
