'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { apiJson, clearSession, downloadAuthenticated, loadSession, login, Session } from '../lib/api';

type WorkOrder = { id: string; woNumber: string; type: string; status: string; priority?: number; subscriberName?: string };
type Technician = { id: string; name?: string; email?: string; status?: string };

export default function ManagementPortal() {
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [range, setRange] = useState('monthly');
  const [report, setReport] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [network, setNetwork] = useState<any>(null);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [technicianId, setTechnicianId] = useState('');
  const [route, setRoute] = useState<any>(null);

  useEffect(() => { setSession(loadSession()); setBooting(false); }, []);

  async function refresh(active: Session, selectedRange = range) {
    setError('');
    try {
      const [r, a, w, n, t] = await Promise.all([
        apiJson(`/reports/summary?range=${selectedRange}`, {}, active),
        apiJson(`/phase4/analytics/advanced?range=${selectedRange}`, {}, active),
        apiJson('/work-orders', {}, active),
        apiJson('/phase4/network/health', {}, active),
        apiJson('/work-orders/dispatch/teams', {}, active)
      ]);
      setReport(r); setAnalytics(a); setWorkOrders(w.data || []); setNetwork(n); setTeams(t.teams || []);
    } catch (e: any) {
      setError(e.message || 'Unable to load management data');
      if (e.message === 'Session expired' || e.message === 'AUTH_REQUIRED') setSession(null);
    }
  }

  useEffect(() => { if (session) refresh(session, range); }, [session, range]);

  async function submitLogin(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { const s = await login(email, password); setSession(s); setPassword(''); }
    catch (e: any) { setError(e.message || 'Login failed'); }
    finally { setBusy(false); }
  }

  function logout() { clearSession(); setSession(null); setReport(null); setAnalytics(null); setNetwork(null); setWorkOrders([]); setRoute(null); }

  async function optimizeRoute() {
    if (!technicianId) { setError('Select a technician before generating a route.'); return; }
    setBusy(true); setError('');
    try {
      const date = new Date().toISOString().slice(0, 10);
      setRoute(await apiJson(`/phase4/route/optimize?technicianId=${encodeURIComponent(technicianId)}&date=${date}`, {}, session));
    } catch (e: any) { setError(e.message || 'Route optimization failed'); }
    finally { setBusy(false); }
  }

  const technicians: Technician[] = useMemo(() => {
    const found: Technician[] = [];
    for (const team of teams) for (const member of (team.members || team.technicians || [])) if (member?.id && !found.some(x => x.id === member.id)) found.push(member);
    return found;
  }, [teams]);

  if (booting) return <Shell><Card><b>Loading secure management portal…</b></Card></Shell>;

  if (!session) return (
    <Shell>
      <div style={{ maxWidth: 430, margin: '8vh auto' }}>
        <Card>
          <h1 style={{ marginTop: 0, color: '#F59E0B' }}>FiberBlaze WFM</h1>
          <p style={{ color: '#A1A1AA' }}>Management Portal • Authorized access only</p>
          <form onSubmit={submitLogin} style={{ display: 'grid', gap: 12 }}>
            <input required type="email" autoComplete="username" placeholder="Work email" value={email} onChange={e=>setEmail(e.target.value)} style={input}/>
            <input required type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} style={input}/>
            {error && <div style={errorBox}>{error}</div>}
            <button disabled={busy} style={primary}>{busy ? 'Signing in…' : 'Sign in'}</button>
          </form>
          <p style={{ fontSize: 11, color: '#71717A', marginBottom: 0 }}>Job Controller, Supervisor, and Administrator accounts are accepted. Technician accounts use the field app.</p>
        </Card>
      </div>
    </Shell>
  );

  return (
    <Shell>
      <header style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', flexWrap:'wrap', marginBottom:16 }}>
        <div><h1 style={{margin:0,color:'#F59E0B'}}>FiberBlaze WFM — Management</h1><div style={{fontSize:12,color:'#A1A1AA'}}>Authenticated operations portal • {session.user.role}</div></div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}><span style={{fontSize:12}}>{session.user.name || session.user.email}</span><button onClick={logout} style={secondary}>Sign out</button></div>
      </header>

      {error && <div style={{...errorBox, marginBottom:12}}>{error}</div>}

      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:14}}>
        {['daily','weekly','monthly'].map(r=><button key={r} onClick={()=>setRange(r)} style={range===r?primary:secondary}>{r.toUpperCase()}</button>)}
        <button onClick={()=>downloadAuthenticated(`/reports/export?format=excel&range=${range}`,`fiberblaze-${range}.xlsx`,session)} style={secondary}>Export Excel</button>
        <button onClick={()=>window.print()} style={secondary}>Print</button>
      </div>

      <section style={grid4}>
        <Metric label="Total WOs" value={report?.totals?.total ?? 0}/><Metric label="Completed" value={report?.totals?.completed ?? 0}/><Metric label="FB-Issue" value={report?.totals?.fbIssue ?? 0}/><Metric label="CUST-Issue" value={report?.totals?.custIssue ?? 0}/>
      </section>

      <section style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:12,marginTop:12}}>
        <Card><h3>Operations</h3><p style={muted}>Active technicians: {analytics?.technicianPerformance?.length ?? 0}</p><p style={muted}>Average completion: {Number(analytics?.avgCompletionMinutes || 0).toFixed(1)} min</p><p style={muted}>Network health: {analytics?.network?.healthScoreAvg ?? network?.healthScore ?? '—'}%</p><p style={muted}>Unresolved alerts: {analytics?.network?.alerts?.length ?? network?.alerts?.length ?? 0}</p></Card>
        <Card><h3>Secure Route Optimization</h3><p style={muted}>Management must explicitly select a real technician. The old hard-coded demo technician route has been removed.</p><select value={technicianId} onChange={e=>setTechnicianId(e.target.value)} style={input}><option value="">Select technician</option>{technicians.map(t=><option key={t.id} value={t.id}>{t.name || t.email || t.id}{t.status ? ` • ${t.status}` : ''}</option>)}</select><button disabled={busy||!technicianId} onClick={optimizeRoute} style={{...primary,marginTop:10}}>{busy?'Generating…':'Generate route'}</button></Card>
      </section>

      {route && <section style={{marginTop:12}}><Card><h3>Route Result</h3><div style={muted}>{route.summary?.totalJobs ?? 0} jobs • {route.summary?.totalDistance ?? '—'} • {route.summary?.totalDuration ?? '—'}</div>{(route.summary?.stops||[]).map((s:any,i:number)=><div key={`${s.id||s.woNumber}-${i}`} style={{padding:'9px 0',borderBottom:'1px solid #27272A',fontSize:12}}><b>#{i+1} {s.woNumber}</b> • {s.type} • {s.distance_m}m • {s.estimatedMinutes}min</div>)}</Card></section>}

      <section style={{marginTop:12}}><Card><h3>Recent Work Orders</h3><div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}><thead><tr><th style={th}>WO</th><th style={th}>Type</th><th style={th}>Status</th><th style={th}>Subscriber</th></tr></thead><tbody>{workOrders.slice(0,50).map(wo=><tr key={wo.id}><td style={td}>{wo.woNumber}</td><td style={td}>{wo.type}</td><td style={td}>{wo.status}</td><td style={td}>{wo.subscriberName || '—'}</td></tr>)}</tbody></table></div></Card></section>
    </Shell>
  );
}

function Shell({children}:{children:React.ReactNode}) { return <main style={{padding:20,background:'#0A0A0B',minHeight:'100vh',color:'#fff',fontFamily:'Inter,system-ui'}}>{children}</main>; }
function Card({children}:{children:React.ReactNode}) { return <div style={{background:'#18181B',border:'1px solid #27272A',borderRadius:14,padding:16}}>{children}</div>; }
function Metric({label,value}:{label:string,value:any}) { return <Card><div style={{fontSize:28,fontWeight:800}}>{value}</div><div style={{fontSize:11,color:'#A1A1AA'}}>{label}</div></Card>; }
const grid4:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:10};
const input:React.CSSProperties={width:'100%',boxSizing:'border-box',padding:'10px 12px',borderRadius:9,border:'1px solid #3F3F46',background:'#09090B',color:'#fff'};
const primary:React.CSSProperties={padding:'9px 13px',borderRadius:9,border:0,background:'#F59E0B',color:'#000',fontWeight:800,cursor:'pointer'};
const secondary:React.CSSProperties={padding:'9px 13px',borderRadius:9,border:'1px solid #3F3F46',background:'#27272A',color:'#fff',fontWeight:700,cursor:'pointer'};
const errorBox:React.CSSProperties={padding:10,borderRadius:9,border:'1px solid #EF4444',background:'#450A0A',color:'#FCA5A5',fontSize:12};
const muted:React.CSSProperties={fontSize:12,color:'#A1A1AA'};
const th:React.CSSProperties={textAlign:'left',padding:'8px 6px',borderBottom:'1px solid #3F3F46',color:'#A1A1AA'};
const td:React.CSSProperties={padding:'8px 6px',borderBottom:'1px solid #27272A'};
