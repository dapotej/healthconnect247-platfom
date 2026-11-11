import { CallbackClient } from './CallbackClient';

export const dynamic = 'force-dynamic';

/** Where links in Supabase emails (invitations, password resets) land. */
export default function AuthCallbackPage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
  return (
    <div className="signin">
      <div className="form-side" style={{ gridColumn: '1 / -1' }}>
        <div className="accounts">
          <CallbackClient url={url} publishableKey={key} />
        </div>
      </div>
    </div>
  );
}
