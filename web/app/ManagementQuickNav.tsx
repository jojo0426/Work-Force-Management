'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { loadSession } from '../lib/api';

const links = [
  { href: '/', label: 'Management', icon: '▦' },
  { href: '/operations', label: 'Live Operations', icon: '◉' },
  { href: '/reports', label: 'Reports & KPIs', icon: '▥' },
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
          <div className="fb-brand-mark">FB</div>
          <div>
            <div className="fb-brand-name">FiberBlaze</div>
            <div className="fb-brand-sub">Workforce Management</div>
          </div>
        </div>
        <div className="fb-nav-label">Operations</div>
        <nav className="fb-nav">{navLinks}</nav>
        <div className="fb-nav-label">Workspace</div>
        <div style={{padding:'9px 11px',fontSize:11,color:'#737b88',lineHeight:1.55}}>
          Dispatch, field exceptions, technician proximity and Smart Next remain management-controlled.
        </div>
        <div className="fb-sidebar-foot">
          <div className="fb-status"><span className="fb-status-dot"/><span>WFM workspace active</span></div>
          <div style={{fontSize:10,color:'#555e6b',marginTop:7}}>FiberBlaze • Field Operations</div>
        </div>
      </aside>
      <nav className="fb-mobile-nav" aria-label="Mobile WFM navigation">{navLinks}</nav>
    </>
  );
}
