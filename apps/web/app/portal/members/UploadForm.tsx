'use client';

import { useActionState } from 'react';
import { uploadMembersAction, type UploadState } from './actions';

export function UploadForm() {
  const [state, action, pending] = useActionState<UploadState, FormData>(uploadMembersAction, { status: 'idle' });
  return (
    <form action={action} className="stack" style={{ gap: 10 }}>
      <div className="dropzone">
        <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#0068A3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 16V4M7 9l5-5 5 5" />
          <path d="M4 16v4h16v-4" />
        </svg>
        <label htmlFor="member-file" className="strong">
          Choose your member list (CSV)
        </label>
        <input id="member-file" name="file" type="file" accept=".csv,text/csv" required />
      </div>
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? 'Checking the file…' : 'Upload and check'}
      </button>
      <div aria-live="polite">
        {state.status === 'error' && <p className="banner warn" style={{ margin: 0 }}>{state.message}</p>}
        {state.status === 'done' && (
          <p className="banner info" style={{ margin: 0 }}>
            {state.summary.filename}: {state.summary.added} added, {state.summary.updated} updated
            {state.summary.errors.length > 0 && <>, {state.summary.errors.length} need fixing (listed below)</>}.
          </p>
        )}
      </div>
    </form>
  );
}
