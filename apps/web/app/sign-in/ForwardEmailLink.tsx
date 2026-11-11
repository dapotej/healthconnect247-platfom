'use client';

import { useEffect } from 'react';

/**
 * Invitations and resets sent from the Supabase dashboard land on the site's
 * home page, which forwards here with the sign-in token still in the address.
 * Hand it to /auth/callback, which signs the person in and asks for a password.
 */
export function ForwardEmailLink() {
  useEffect(() => {
    const hash = window.location.hash;
    if (/[#&](access_token|error)=/.test(hash)) {
      window.location.replace(`/auth/callback?next=/account/password${hash}`);
    }
  }, []);
  return null;
}
