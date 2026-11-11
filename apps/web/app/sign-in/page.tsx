import { isDemoMode } from '@/lib/data';
import { DEMO_USERS } from '@/lib/session';
import { demoSignInAction } from './actions';

export const dynamic = 'force-dynamic';

export default function SignInPage() {
  const demo = isDemoMode();
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
          <h2 style={{ fontFamily: 'var(--display)', fontSize: 28 }}>Sign in</h2>
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
          ) : (
            <p className="banner info">
              Sign-in with email, password and a one-time code is connected when the Supabase project is set up.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
