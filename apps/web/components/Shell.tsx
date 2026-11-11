import type { ReactNode } from 'react';
import { signOutAction } from '@/app/sign-in/actions';
import { isDemoMode } from '@/lib/data';
import type { SessionUser } from '@/lib/session';

export interface NavItem {
  href: string;
  label: string;
  key: string;
}

export function Shell(props: {
  product: string;
  clientName?: string;
  user: SessionUser;
  nav: NavItem[];
  active: string;
  children: ReactNode;
}) {
  return (
    <>
      {isDemoMode() && <div className="demo-flag">Demo: sample data only. Don’t enter or upload real member or patient details.</div>}
      <header className="topbar">
        <div className="brand">
          <img src="/logo-white.png" alt="HealthConnect 24x7" />
          <span className="divider" />
          <span className="product">{props.product}</span>
          {props.clientName && <span className="chip">{props.clientName}</span>}
        </div>
        <div className="user">
          <span>
            {props.user.name} · {props.user.title}
          </span>
          <form action={signOutAction}>
            <button type="submit">Sign out</button>
          </form>
        </div>
      </header>
      <div className="layout">
        <nav className="sidebar" aria-label={props.product}>
          {props.nav.map((item) => (
            <a key={item.key} href={item.href} aria-current={item.key === props.active ? 'page' : undefined}>
              {item.label}
            </a>
          ))}
        </nav>
        <main className="main">{props.children}</main>
      </div>
    </>
  );
}
