'use client';

import { useEffect, useState } from 'react';
import { loadSession } from '../lib/api';

export default function ManagementQuickNav() {
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const session = loadSession();
    setAuthorized(Boolean(session && ['JOB_CONTROLLER', 'SUPERVISOR', 'ADMINISTRATOR'].includes(session.user.role)));
  }, []);

  if (!authorized) return null;

  return (
    <nav aria-label="Management navigation" style={{position:'fixed',right:16,bottom:16,zIndex:1000,display:'flex',gap:8,padding:8,border:'1px solid #3F3F46',borderRadius:12,background:'#18181B',boxShadow:'0 8px 24px rgba(0,0,0,.35)',flexWrap:'wrap'}}>
      <a href="/" style={linkStyle}>Management</a>
      <a href="/reports" style={linkStyle}>Supervisor KPIs</a>
      <a href="/operations" style={{...linkStyle,background:'#F59E0B',color:'#111827',borderColor:'#F59E0B'}}>Live Operations</a>
    </nav>
  );
}

const linkStyle: React.CSSProperties = {
  color: '#fff',
  textDecoration: 'none',
  fontSize: 12,
  fontWeight: 800,
  padding: '8px 10px',
  border: '1px solid #52525B',
  borderRadius: 8,
  background: '#27272A',
};
