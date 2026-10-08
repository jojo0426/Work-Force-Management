'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiJson, loadSession, Session } from '../../lib/api';

type FieldException={id:string;workOrderId:string;technicianId:string;reason:string;notes?:string|null;lat?:number|null;lng?:number|null;reportedAt:string;status:string;workOrder?:{woNumber?:string;type?:string;status?:string;subscriberName?:string;assignments?:any[]}};
type Mismatch={id:string;workOrderId?:string;type?:string;reason?:string;status:string;createdAt?:string};
const RESOLUTIONS=['RESUME','KEEP_ON_HOLD','RETURN_TO_ASSIGNED','CANCEL'] as const;

export default function EvidenceExceptions(){
 const[session,setSession]=useState<Session|null>(null),[exceptions,setExceptions]=useState<FieldException[]>([]),[mismatches,setMismatches]=useState<Mismatch[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(''),[notes,setNotes]=useState<Record<string,string>>({});
 useEffect(()=>setSession(loadSession()),[]);
 async function load(){if(!session)return;setLoading(true);setError('');try{const ex=await apiJson('/work-orders/exceptions/pending',{},session);setExceptions(ex.data||[]);if(['SUPERVISOR','ADMINISTRATOR'].includes(session.user.role)){try{const mm=await apiJson('/work-orders/mismatches/pending',{},session);setMismatches(mm.data||[])}catch{setMismatches([])}}}catch(e:any){setError(e.message)}finally{setLoading(false)}}
 useEffect(()=>{if(session)load()},[session]);
 async function review(x:FieldException,resolution:typeof RESOLUTIONS[number]){const note=(notes[x.id]||'').trim();if((resolution==='KEEP_ON_HOLD'||resolution==='CANCEL')&&note.length<5){setError('A management note of at least 5 characters is required to keep a job on hold or cancel it.');return}setBusy(x.id);setError('');try{await apiJson(`/work-orders/exceptions/${encodeURIComponent(x.id)}/review`,{method:'POST',body:JSON.stringify({resolution,note})},session);setNotes(n=>({...n,[x.id]:''}));await load()}catch(e:any){setError(e.message)}finally{setBusy('')}}
 const unsafe=useMemo(()=>exceptions.filter(x=>x.reason==='UNSAFE_CONDITION').length,[exceptions]);
 if(!session)return <div className="wfm-page"><div className="wfm-panel"><h2>Evidence & Exceptions</h2><p>Sign in through Command Center first.</p></div></div>;
 return <div className="wfm-page">
  <div className="wfm-page-head"><div><span className="wfm-eyebrow">FIELD QUALITY + MANAGEMENT REVIEW</span><h1>Evidence & Exceptions</h1><p>Review field exceptions, protect camera-only evidence rules, and return held work to the correct operational state.</p></div><button className="wfm-layer-toggle on" onClick={load} disabled={loading}>{loading?'REFRESHING…':'REFRESH'}</button></div>
  {error&&<div className="wfm-alert">{error}</div>}
  <div className="wfm-kpis"><K label="Pending Exceptions" v={exceptions.length}/><K label="Unsafe Conditions" v={unsafe}/><K label="Pending Mismatches" v={mismatches.length}/><K label="Evidence Capture" v="CAMERA ONLY"/></div>
  <div className="wfm-panel"><div className="wfm-section-title"><div><span className="wfm-eyebrow">ACTION REQUIRED</span><h3>Pending Field Exceptions</h3></div><span className="wfm-control-pill">MANAGEMENT DECISION</span></div>
   {loading?<div className="wfm-empty">Loading field exceptions…</div>:exceptions.length?exceptions.map(x=><div className="wfm-exception-card" key={x.id}>
    <div className="wfm-section-title"><div><b>{x.workOrder?.woNumber||x.workOrderId}</b><small>{x.workOrder?.type?.replaceAll('_',' ')||'WORK ORDER'} • {x.workOrder?.status||'ON HOLD'}</small></div><span className={`wfm-badge ${x.reason==='UNSAFE_CONDITION'?'on-hold':'assigned'}`}>{x.reason.replaceAll('_',' ')}</span></div>
    <p>{x.notes||'No technician note supplied.'}</p><div className="wfm-smart-summary"><span>Reported {new Date(x.reportedAt).toLocaleString()}</span><span>{x.lat!=null&&x.lng!=null?`${Number(x.lat).toFixed(5)}, ${Number(x.lng).toFixed(5)}`:'No GPS attached'}</span></div>
    <label>Management note</label><textarea value={notes[x.id]||''} onChange={e=>setNotes(n=>({...n,[x.id]:e.target.value}))} placeholder="Required for Keep on Hold and Cancel" rows={2}/>
    <div className="wfm-action-grid">{RESOLUTIONS.map(r=><button key={r} disabled={busy===x.id} onClick={()=>review(x,r)}>{busy===x.id?'Working…':r.replaceAll('_',' ')}</button>)}</div>
   </div>):<div className="wfm-empty">No pending field exceptions. Held jobs requiring management review will appear here.</div>}
  </div>
  <div className="wfm-grid-2"><div className="wfm-panel"><span className="wfm-eyebrow">EVIDENCE POLICY</span><h3>Completion Evidence Controls</h3><div className="wfm-info"><b>Camera capture only.</b> Technician evidence is registered only against an active WORKING execution and must use the in-app CAMERA capture source.</div><div className="wfm-route-row"><span className="wfm-route-number">1</span><div><b>Repair / work result</b><small>Finished-product photo tied to the active work order.</small></div></div><div className="wfm-route-row"><span className="wfm-route-number">2</span><div><b>Speed issue</b><small>Speed-test evidence plus measured download, upload and ping when required by the finish gate.</small></div></div><div className="wfm-route-row"><span className="wfm-route-number">3</span><div><b>Install / transfer / FB / customer issue</b><small>Evidence type is validated server-side before completion.</small></div></div></div>
   <div className="wfm-panel"><span className="wfm-eyebrow">DATA QUALITY</span><h3>Pending Location / Record Mismatches</h3>{mismatches.length?mismatches.map((x,i)=><div className="wfm-route-row" key={x.id}><span className="wfm-route-number">{i+1}</span><div><b>{x.type||x.reason||'Pending mismatch'}</b><small>{x.workOrderId||x.id}</small></div><span className="wfm-badge on-hold">PENDING</span></div>):<div className="wfm-empty">No pending mismatches available for this account.</div>}</div></div>
 </div>
}
function K({label,v}:{label:string;v:number|string}){return <div className="wfm-kpi"><span>{label}</span><strong>{v}</strong></div>}
