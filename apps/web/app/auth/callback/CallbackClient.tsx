'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { EmailOtpType } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

/** Only continue to a page on this site. */
function safeNext(raw: string | null): string {
  return raw && /^\/[\w\-/]*$/.test(raw) ? raw : '/';
}

/**
 * Turns the link in a Supabase email into a signed-in session (stored in
 * cookies, so the server sees it), then continues to set a password. Handles
 * the three forms Supabase links take: ?code=, ?token_hash=&type=, and
 * #access_token= (invitations sent by the server).
 */
export function CallbackClient({ url, publishableKey }: { url: string; publishableKey: string }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const supabase = createBrowserClient(url, publishableKey);
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const next = safeNext(query.get('next'));

    async function finish(): Promise<boolean> {
      if (hash.get('error') || query.get('error')) return false;
      const code = query.get('code');
      if (code) return !(await supabase.auth.exchangeCodeForSession(code)).error;
      const tokenHash = query.get('token_hash');
      const type = query.get('type') as EmailOtpType | null;
      if (tokenHash && type) return !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
      const access = hash.get('access_token');
      const refresh = hash.get('refresh_token');
      if (access && refresh) return !(await supabase.auth.setSession({ access_token: access, refresh_token: refresh })).error;
      return false;
    }

    finish().then((ok) => {
      // Remove tokens from the address bar and history before moving on.
      window.history.replaceState(null, '', window.location.pathname);
      if (ok) window.location.replace(next);
      else setFailed(true);
    }, () => setFailed(true));
  }, [url, publishableKey]);

  if (failed) {
    return (
      <div className="stack" style={{ gap: 12 }}>
        <h2 style={{ fontFamily: 'var(--display)', fontSize: 28 }}>Link not valid</h2>
        <p className="banner warn" style={{ margin: 0 }}>That link has expired or was already used.</p>
        <a className="btn btn-primary" href="/sign-in?reset=1">Get a new link</a>
      </div>
    );
  }
  return <p className="muted" role="status">Checking your link…</p>;
}
