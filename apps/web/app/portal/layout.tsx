import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';

export default function PortalLayout({ children }: { children: ReactNode }) {
  return children;
}
