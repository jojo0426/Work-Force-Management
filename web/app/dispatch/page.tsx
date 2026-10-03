'use client';
import {useEffect,useMemo,useState} from 'react';
import {apiJson,loadSession,Session} from '../../lib/api';

type Tech={id:string;name?:string;status?:string;lastLat?:number|null;lastLng?:number|null;lastLocationAt?:string|null};
type Team={id:string;name:string;activeTechnicians:number;technicians:Tech[]};
type Suggestion={sequence:number;id:string;woNumber:string;type:string;status:string;priority:number;distance_m:number;distance_km:number;subscriber:{accountNumber:string;name:string;address:string;lat:number;lng:number;napId?:string|null}};
type SmartResult={technician?:{id:string;name:string;teamId:string;status:string;lat:number;lng:number};candidatesConsidered?:number;suggestions?:Suggestion[];recommended?:Suggestion|null;excludedWithoutVerifiedLocation?:number;advisoryOnly?:boolean;requiresManagementApproval?:boolean;message?:string};

export default function Dispatch(){
  const[session,setSession]=useState<Session|null>(null),[teams,setTeams]=useState<Team[]>([]),[techId,setTechId]=useState(''),[nearby,setNearby]=useState<any[]>([]),[smart,setSmart]=useState<SmartResult|null>(null),[route,setRoute]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>setSession(loadSession()),[]);
  useEffect(()=>{if(session)apiJson('/work-orders/dispatch/teams',{},session).then(x=>setTeams(x.teams||[])).catch(e=>setError(e.message))},[session]);
  const techs=useMemo(()=>teams.flatMap(t=>t.technicians||[]).filter((x,i,a)=>a.findIndex(y=>y.id===x.id)===i),[teams]);
  const selected=techs.find(x=>x.id===techId);
  const selectedTeam=teams.find(t=>t.technicians?.some(x=>x.id===techId));
  async function run(kind:'nearby'|'smart'|'route'){
    if(!selected)return;setBusy(true);setError('');
    try{
      if(kind!=='route'&&(selected.lastLat==null||selected.lastLng==null))throw new Error('Selected technician has no usable GPS location.');
      if(kind==='nearby')setNearby(await apiJson(`/work-orders/nearby?lat=${selected.lastLat}&lng=${selected.lastLng}&radius=3000`,{},session));
      if(kind==='smart')setSmart(await apiJson(`/work-orders/smart-next?technicianId=${encodeURIComponent(selected.id)}&lat=${selected.lastLat}&lng=${selected.lastLng}`,{},session));
      if(kind==='route')setRoute(await apiJson(`/phase4/route/optimize?technicianId=${encodeURIComponent(selected.id)}&date=${new Date().toISOString().slice(0,10)}`,{},session));
    }catch(e:any){setError(e.message)}finally{setBusy(false)}
  }
  if(!session)return <div className="wfm-page"><div className="wfm-panel"><h2>Dispatch & Smart Next</h2><p>Sign in through Command Center first.</p></div></div>;
  const recommended=smart?.recommended;
  const queue=smart?.suggestions||[];
  return <div className="wfm-page">
    <div className="wfm-page-head"><div><span className="wfm-eyebrow">CONTROLLED DISPATCH</span><h1>Dispatch & Smart Next</h1><p>Geographic field sequencing that recommends the next practical job while management keeps final control.</p></div><div className="wfm-control-pill">MANAGEMENT APPROVAL REQUIRED</div></div>
    {error&&<div className="wfm-alert">{error}</div>}
    <div className="wfm-grid-2">
      <div className="wfm-panel"><h3>Technician / Team Position</h3><label>Technician</label><select value={techId} onChange={e=>{setTechId(e.target.value);setNearby([]);setSmart(null);setRoute(null)}}><option value="">Select technician</option>{techs.map(t=><option key={t.id} value={t.id}>{t.name||t.id} • {t.status||'UNKNOWN'}</option>)}</select>{selected&&<div className="wfm-tech-card"><div className="wfm-tech-dot"/><div><b>{selected.name||selected.id}</b><small>{selectedTeam?.name||'No team'} • {selected.status||'UNKNOWN'}</small><small>{selected.lastLat!=null?`${Number(selected.lastLat).toFixed(5)}, ${Number(selected.lastLng).toFixed(5)}`:'GPS unavailable'}</small></div></div>}<div className="wfm-action-grid"><button disabled={!techId||busy} onClick={()=>run('nearby')}>Find Nearby ≤3 km</button><button disabled={!techId||busy} onClick={()=>run('smart')}>{busy?'Working…':'Suggest Smart Next'}</button><button disabled={!techId||busy} onClick={()=>run('route')}>Optimize Route Preview</button></div><div className="wfm-info"><b>Advisory only.</b> Smart Next never silently reassigns, starts, or changes the sequence of a work order. Job Controller / Supervisor remains responsible for the final dispatch decision.</div></div>
      <div className="wfm-panel"><div className="wfm-recommend-head"><div><span className="wfm-eyebrow">#1 NEXT RECOMMENDED</span><h3>Smart Next Recommendation</h3></div>{recommended&&<span className="wfm-distance">{recommended.distance_km} km</span>}</div>{recommended?<div className="wfm-recommend-card"><div className="wfm-recommend-wo"><div><small>WORK ORDER</small><strong>{recommended.woNumber}</strong></div><span className="wfm-badge assigned">{recommended.type}</span></div><h2>{recommended.subscriber.name}</h2><p>{recommended.subscriber.address}</p><div className="wfm-recommend-meta"><div><small>ACCOUNT</small><b>{recommended.subscriber.accountNumber}</b></div><div><small>NAP</small><b>{recommended.subscriber.napId||'Not linked'}</b></div><div><small>PRIORITY</small><b>{recommended.priority}</b></div><div><small>DISTANCE</small><b>{recommended.distance_m} m</b></div></div><a className="wfm-dispatch-map-link" href="/operations">View on Live Operations Map →</a></div>:<div className="wfm-empty">Select an online technician and request a Smart Next recommendation.</div>}{smart&&<div className="wfm-smart-summary"><span>{smart.candidatesConsidered||0} considered</span><span>{queue.length} mapped</span><span>{smart.excludedWithoutVerifiedLocation||0} excluded without GPS</span></div>}</div>
    </div>
    <div className="wfm-grid-2">
      <div className="wfm-panel"><div className="wfm-section-title"><div><span className="wfm-eyebrow">GEOGRAPHIC SEQUENCE</span><h3>Smart Next Queue</h3></div>{smart?.requiresManagementApproval&&<span className="wfm-control-pill">APPROVAL REQUIRED</span>}</div>{queue.length?queue.map((x,i)=><div className={`wfm-route-row ${i===0?'recommended':''}`} key={x.id}><span className="wfm-route-number">{x.sequence||i+1}</span><div><b>{x.woNumber} · {x.subscriber.name}</b><small>{x.type} • {x.subscriber.address}</small><small>{x.subscriber.napId?`NAP ${x.subscriber.napId} • `:''}{x.distance_km} km from current technician position</small></div>{i===0?<span className="wfm-badge smart">NEXT</span>:<span className="wfm-badge assigned">#{x.sequence||i+1}</span>}</div>):<div className="wfm-empty">Run Smart Next to calculate the nearest eligible assigned service orders.</div>}{smart?.message&&<div className="wfm-info">{smart.message}</div>}</div>
      <div className="wfm-panel"><span className="wfm-eyebrow">FIELD OPTIONS</span><h3>Nearby Service Orders ≤3 km</h3>{nearby.length?nearby.slice(0,20).map((x:any,i)=><div className="wfm-route-row" key={x.id||i}><span className="wfm-route-number">{i+1}</span><div><b>{x.woNumber||x.name||x.id}</b><small>{x.type||x.status||''} • {x.distance_m??'—'} m</small></div><span className="wfm-badge assigned">CANDIDATE</span></div>):<div className="wfm-empty">Use Find Nearby to see technicians or service candidates within the configured radius.</div>}</div>
    </div>
    <div className="wfm-panel"><div className="wfm-section-title"><div><span className="wfm-eyebrow">PLANNING PREVIEW</span><h3>Suggested Route Queue</h3></div><span className="wfm-control-pill">NO AUTO REORDER</span></div>{route?.summary?.stops?.length?route.summary.stops.map((x:any,i:number)=><div className="wfm-route-row" key={`${x.woNumber}-${i}`}><span className="wfm-route-number">{i+1}</span><div><b>{x.woNumber}</b><small>{x.distance_m} m • ~{x.estimatedMinutes} min</small></div></div>):<div className="wfm-empty">Route optimization is a preview only. It does not automatically change existing assignments or work-order sequence.</div>}</div>
  </div>
}
