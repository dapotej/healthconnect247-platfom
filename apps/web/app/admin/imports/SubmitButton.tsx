'use client';

import { useFormStatus } from 'react-dom';

export function SubmitButton({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-primary" type="submit" disabled={pending}>
      {pending ? busy : label}
    </button>
  );
}
