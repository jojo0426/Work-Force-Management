'use client';

import { FormEvent, useEffect, useState } from 'react';
import { apiJson, loadSession, Session } from '../../lib/api';

type Log={timestamp?:string;createdAt?:string;time?:string;action:string;actorId?:string|null;details?:any;display?:string};
type WO={id:string;woNumber?:string;type?:string;status?:string;subscriberName?:string};

export default function AuditTrail(){
 const[session,setSession]=useState<Session|null>(null),[orders,setOrders]=useState<WO[]>([]),[woId,setWoId]=useState(''),[techId,setTechId]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState(''),[logs,setLogs]=useState<Log[]>([]),[scope,setScope]=useState(''),[loading,setLoading]=useState(false),[error,setError]=useState('');
 useEffect(()=>setSession(loadSession()),[]);
 useEffect(()=>{if(!session)return;apiJson('/work-orders',{},session).then(x=>setOrders(x.data||[])).catch(()=>setOrders([]))},[session]);
 async function workOrderAudit(e?:FormEvent){e?.preventDefault();if(!woId)return;setLoading(true);setError('');try{const x=await apiJson(`/audit/${encodeURIComponent(woId)}`,{},session);setLogs(x.timeline||[]);setScope(`Work Order • ${orders.find(o=>o.id===woId)?.woNumber||woId}`)}catch(e:any){setError(e.message);setLogs([])}finally{setLoading(false)}}
 async function technicianAudit(e:FormEvent){e.preventDefault();if(!techId.trim())return;setLoading(true);setError('');try{const p=new URLSearchParams();if(from&&to){p.set('from',new Date(from).toISOString());p.set('to',new Date(to+'T23:59:59').toISOString())}const x=await apiJson(`/audit/technician/${encodeURIComponent(techId.trim())}${p.size?'?'+p.toString():''}`,{},session);setLogs(x.logs||[]);setScope(`Technician • ${techId.trim()}`)}catch(e:any){setError(e.message);setLogs([])}finally{setLoading(false)}}
 if(!session)return <div className="wfm-page"><div className="wfm-panel"><h2>Audit Trail</h2><p>Sign in through Command Center first.</p></div></div>;
 return <div className="wfm-page">
  <div className="wfm-page-head"><div><span className="wfm-eyebrow">TRACEABILITY + ACCOUNTABILITY</span><h1>Audit Trail</h1><p>Trace work-order lifecycle events and technician actions recorded by the WFM backend.</p></div></div>
  {error&&<div className="wfm-alert">{error}</div>}
  <div className="wfm-grid-2"><div className="wfm-panel"><span className="wfm-eyebrow">WORK ORDER HISTORY</span><h3>Work Order Timeline</h3><form onSubmit={workOrderAudit}><label>Work order</label><select required value={woId} onChange={e=>setWoId(e.target.value)}><option value="">Select work order</option>{orders.map(o=><option key={o.id} value={o.id}>{o.woNumber||o.id} • {o.status||'UNKNOWN'} • {o.type?.replaceAll('_',' ')||'WORK ORDER'}</option>)}</select><button disabled={loading||!woId}>{loading?'Loading…':'View Timeline'}</button></form><div className="wfm-info">Timeline entries are ordered from earliest to latest so dispatch, start, exception, evidence and completion events can be reviewed in sequence.</div></div>
   <div className="wfm-panel"><span className="wfm-eyebrow">TECHNICIAN ACCOUNTABILITY</span><h3>Technician Activity</h3><form onSubmit={technicianAudit}><label>Technician user ID</label><input required value={techId} onChange={e=>setTechId(e.target.value)} placeholder="Technician ID"/><div className="wfm-grid-2"><div><label>From</label><input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></div><div><label>To</label><input type="date" value={to} onChange={e=>setTo(e.target.value)}/></div></div><button disabled={loading||!techId.trim()}>{loading?'Loading…':'View Technician Activity'}</button></form><div className="wfm-info">Technician audit is available to Job Controller, Supervisor and Administrator accounts and returns up to 100 recent actions.</div></div></div>
  <div className="wfm-panel"><div className="wfm-section-title"><div><span className="wfm-eyebrow">RECORDED EVENTS</span><h3>{scope||'Audit Results'}</h3></div><span className="wfm-control-pill">{logs.length} EVENT{logs.length===1?'':'S'}</span></div>{loading?<div className="wfm-empty">Loading audit records…</div>:logs.length?<div>{logs.map((l,i)=><div className="wfm-route-row" key={`${l.timestamp||l.createdAt||i}-${i}`}><span className="wfm-route-number">{i+1}</span><div><b>{l.action.replaceAll('_',' ')}</b><small>{new Date(l.timestamp||l.createdAt||Date.now()).toLocaleString()} • {l.actorId||'system'}</small>{l.details&&<small>{compact(l.details)}</small>}</div></div>)}</div>:<div className="wfm-empty">Choose a work order or technician to inspect its recorded audit history.</div>}</div>
 </div>
}
function compact(v:any){try{const s=JSON.stringify(v);return s.length>180?s.slice(0,177)+'…':s}catch{return String(v)}}
