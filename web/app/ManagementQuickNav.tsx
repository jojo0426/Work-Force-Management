'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { loadSession } from '../lib/api';

const links = [
  { href: '/', label: 'Command Center', icon: '▦' },
  { href: '/work-orders', label: 'Work Orders', icon: '▤' },
  { href: '/dispatch', label: 'Dispatch & Smart Next', icon: '➜' },
  { href: '/operations', label: 'Live GPS Operations', icon: '◉' },
  { href: '/evidence', label: 'Evidence & Exceptions', icon: '◈' },
  { href: '/reports', label: 'Reports & KPIs', icon: '▥' },
  { href: '/users', label: 'Users & Teams', icon: '♟' },
  { href: '/audit', label: 'Audit Trail', icon: '≡' },
  { href: '/integrations', label: 'Integrations', icon: '⌘' },
];

export default function ManagementQuickNav() {
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const session = loadSession();
    setAuthorized(Boolean(session && ['JOB_CONTROLLER', 'SUPERVISOR', 'ADMINISTRATOR'].includes(session.user.role)));
  }, [pathname]);

  if (!authorized) return null;

  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href);
  const navLinks = links.map(link => (
    <a key={link.href} href={link.href} className={`fb-nav-link${isActive(link.href) ? ' active' : ''}`}>
      <span className="fb-nav-icon" aria-hidden="true">{link.icon}</span>
      <span>{link.label}</span>
    </a>
  ));

  return (
    <>
      <aside className="fb-sidebar" aria-label="FiberBlaze WFM navigation">
        <div className="fb-brand">
          <div className="fb-brand-mark fb-brand-logo-wrap">
            <img
              className="fb-brand-logo"
              src="/images/fiberblaze-logo.png"
              alt="FiberBlaze"
            />
          </div>
          <div className="fb-brand-copy">
            <div className="fb-brand-name">FiberBlaze</div>
            <div className="fb-brand-sub">Workforce Management</div>
          </div>
        </div>
        <div className="fb-nav-label">Field Operations</div>
        <nav className="fb-nav">{navLinks.slice(0,5)}</nav>
        <div className="fb-nav-label">Management</div>
        <nav className="fb-nav">{navLinks.slice(5)}</nav>
        <div className="fb-sidebar-foot">
          <div className="fb-status"><span className="fb-status-dot"/><span>Operations workspace online</span></div>
          <div className="fb-sidebar-note">Live GPS • Subscriber & NAP • Controlled dispatch</div>
        </div>
      </aside>
      <nav className="fb-mobile-nav" aria-label="Mobile WFM navigation">{navLinks.slice(0,5)}</nav>
    </>
  );
}
