'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiJson, downloadAuthenticated, loadSession, Session } from '../../lib/api';

type Range='daily'|'weekly'|'monthly';

type TechPerf={
  technicianId:string;
  _count:number;
  _avg:{
    downloadMbps?:number|null;
    uploadMbps?:number|null
  }
};

type TeamPerf={
  teamId:string;
  teamName:string;
  workOrders:number;
  completed:number;
  backlog:number;
  onHold:number;
  fbIssue:number;
  custIssue:number;
  activeTechnicians:number;
  availableTechnicians:number;
  workingTechnicians:number;
  executions:number;
  completedExecutions:number;
  avgCompletionHours:number
};

type Summary={
  range:string;
  from:string;
  to:string;
  totals:{
    total:number;
    draft:number;
    assigned:number;
    working:number;
    onHold:number;
    completed:number;
    pending:number;
    fbIssue:number;
    custIssue:number
  };
  byType:{
    repair:number;
    installation:number;
    transfer:number
  };
  performance:{
    techPerformance:TechPerf[];
    teamPerformance:TeamPerf[];
    avgCompletionHours:number;
    completionRate:number
  };
  generatedAt:string
};

function fmtHours(v:number){
  if(!Number.isFinite(v)||v<=0)return '0h';
  const h=Math.floor(v),m=Math.round((v-h)*60);
  return m?`${h}h ${m}m`:`${h}h`;
}

export default function SupervisorReports(){
  const[session,setSession]=useState<Session|null>(null);
  const[range,setRange]=useState<Range>('monthly');
  const[data,setData]=useState<Summary|null>(null);
  const[error,setError]=useState('');
  const[loading,setLoading]=useState(true);

  useEffect(()=>setSession(loadSession()),[]);

  useEffect(()=>{
    if(!session){
      setLoading(false);
      return;
    }

    let active=true;
    setLoading(true);
    setError('');

    apiJson<Summary>(
      `/reports/summary?range=${range}`,
      {},
      session
    )
      .then(x=>active&&setData(x))
      .catch((e:any)=>active&&setError(e.message||'Unable to load report'))
      .finally(()=>active&&setLoading(false));

    return()=>{active=false};
  },[session,range]);

  const tech=useMemo(
    ()=>[...(data?.performance.techPerformance||[])].sort((a,b)=>b._count-a._count),
    [data]
  );

  const teams=useMemo(
    ()=>[...(data?.performance.teamPerformance||[])].sort(
      (a,b)=>a.teamName.localeCompare(b.teamName)
    ),
    [data]
  );

  if(!session){
    return (
      <main className="wfm-page">
        <div className="wfm-panel" style={{maxWidth:520,margin:'8vh auto'}}>
          <div className="wfm-eyebrow">REPORTING & PERFORMANCE</div>
          <h2>Reports & KPIs</h2>
          <p>
            Sign in through the Management Portal first.
          </p>
          <a className="wfm-link" href="/">
            Open Management Portal →
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="wfm-page">
      <div className="wfm-page-head">
        <div>
          <div className="wfm-eyebrow">REPORTING & PERFORMANCE</div>
          <h1>Reports & KPIs</h1>
          <p>
            Operational reporting • {session.user.role}
          </p>
        </div>

        <div className="wfm-head-actions">
          <a className="wfm-link" href="/">
            Management Portal
          </a>
          <a className="wfm-link" href="/operations">
            Live Operations
          </a>
        </div>
      </div>

      <div className="wfm-toolbar">
        {(['daily','weekly','monthly'] as Range[]).map(r=>(
          <button
            key={r}
            onClick={()=>setRange(r)}
            className={range===r?'wfm-primary-btn':'wfm-secondary-btn'}
          >
            {r.toUpperCase()}
          </button>
        ))}

        <button
          onClick={()=>downloadAuthenticated(
            `/reports/export?format=excel&range=${range}`,
            `fiberblaze-${range}.xlsx`,
            session
          )}
          className="wfm-secondary-btn"
        >
          Export Excel
        </button>

        <button
          onClick={()=>window.print()}
          className="wfm-secondary-btn"
        >
          Print
        </button>
      </div>

      {error&&(
        <div className="wfm-alert">
          {error}
        </div>
      )}

      {loading&&!data?(
        <div className="wfm-panel">
          <div className="wfm-empty">Loading KPI report…</div>
        </div>
      ):data&&(
        <>
          <section className="wfm-kpis">
            <Metric label="Total WOs" value={data.totals.total}/>
            <Metric label="Completed" value={data.totals.completed}/>
            <Metric
              label="Completion Rate"
              value={`${data.performance.completionRate}%`}
            />
            <Metric label="Backlog" value={data.totals.pending}/>
            <Metric label="On Hold" value={data.totals.onHold}/>
            <Metric
              label="Avg Completion"
              value={fmtHours(data.performance.avgCompletionHours)}
            />
            <Metric label="FB-Issue" value={data.totals.fbIssue}/>
            <Metric label="CUST-Issue" value={data.totals.custIssue}/>
          </section>

          <section className="wfm-grid-2">
            <div className="wfm-panel">
              <div className="wfm-eyebrow">WORK ORDER STATE</div>
              <h3>Backlog Breakdown</h3>

              <Bar
                label="Draft / Unassigned"
                value={data.totals.draft}
                total={data.totals.pending}
              />
              <Bar
                label="Assigned"
                value={data.totals.assigned}
                total={data.totals.pending}
              />
              <Bar
                label="Working"
                value={data.totals.working}
                total={data.totals.pending}
              />
              <Bar
                label="On Hold"
                value={data.totals.onHold}
                total={data.totals.pending}
              />
              <Bar
                label="FB-Issue"
                value={data.totals.fbIssue}
                total={data.totals.pending}
              />
              <Bar
                label="CUST-Issue"
                value={data.totals.custIssue}
                total={data.totals.pending}
              />
            </div>

            <div className="wfm-panel">
              <div className="wfm-eyebrow">SERVICE DISTRIBUTION</div>
              <h3>Work Order Mix</h3>

              <Bar
                label="Repair"
                value={data.byType.repair}
                total={data.totals.total}
              />
              <Bar
                label="Installation"
                value={data.byType.installation}
                total={data.totals.total}
              />
              <Bar
                label="Transfer"
                value={data.byType.transfer}
                total={data.totals.total}
              />

              <p>
                Selected period: {new Date(data.from).toLocaleString()} —{' '}
                {new Date(data.to).toLocaleString()}
              </p>
            </div>
          </section>

          <section className="wfm-panel">
            <div className="wfm-section-title">
              <div>
                <div className="wfm-eyebrow">TEAM OPERATIONS</div>
                <h3>Team Operational Performance</h3>
              </div>
              <span className="wfm-control-pill">
                {teams.length} teams
              </span>
            </div>

            <p>
              Team workload, service state and field capacity for operational
              planning. Work orders use the latest assignment only, so
              reassignment history is not double-counted. This view does not
              score or automatically rank employees.
            </p>

            {!teams.length?(
              <div className="wfm-empty">No team data available.</div>
            ):(
              <div className="wfm-table-wrap">
                <table className="wfm-table">
                  <thead>
                    <tr>
                      <th>Team</th>
                      <th>WO Load</th>
                      <th>Completed</th>
                      <th>Backlog</th>
                      <th>On Hold</th>
                      <th>Issues</th>
                      <th>Tech Capacity</th>
                      <th>Executions</th>
                      <th>Avg Completion</th>
                    </tr>
                  </thead>

                  <tbody>
                    {teams.map(t=>(
                      <tr key={t.teamId}>
                        <td><b>{t.teamName}</b></td>
                        <td>{t.workOrders}</td>
                        <td>{t.completed}</td>
                        <td><b>{t.backlog}</b></td>
                        <td>{t.onHold}</td>
                        <td>
                          FB {t.fbIssue} • CUST {t.custIssue}
                        </td>
                        <td>
                          <b>{t.availableTechnicians}</b> available /{' '}
                          {t.workingTechnicians} working
                          <small>
                            {t.activeTechnicians} active technicians
                          </small>
                        </td>
                        <td>
                          {t.executions}
                          <small>
                            {t.completedExecutions} completed
                          </small>
                        </td>
                        <td>{fmtHours(t.avgCompletionHours)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="wfm-panel">
            <div className="wfm-section-title">
              <div>
                <div className="wfm-eyebrow">FIELD EXECUTION</div>
                <h3>Technician Execution Performance</h3>
              </div>
              <span className="wfm-control-pill">
                {tech.length} technicians
              </span>
            </div>

            <p>
              Execution volume and captured speed-test averages for the
              selected period. This is operational data, not an automatic
              personnel ranking.
            </p>

            {!tech.length?(
              <div className="wfm-empty">
                No technician executions in this period.
              </div>
            ):(
              <div className="wfm-table-wrap">
                <table className="wfm-table">
                  <thead>
                    <tr>
                      <th>Technician ID</th>
                      <th>Executions</th>
                      <th>Avg Download</th>
                      <th>Avg Upload</th>
                    </tr>
                  </thead>

                  <tbody>
                    {tech.map(t=>(
                      <tr key={t.technicianId}>
                        <td>{t.technicianId}</td>
                        <td><b>{t._count}</b></td>
                        <td>
                          {t._avg.downloadMbps==null
                            ?'—'
                            :`${Number(t._avg.downloadMbps).toFixed(1)} Mbps`}
                        </td>
                        <td>
                          {t._avg.uploadMbps==null
                            ?'—'
                            :`${Number(t._avg.uploadMbps).toFixed(1)} Mbps`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="wfm-info">
            Generated: {new Date(data.generatedAt).toLocaleString()} • Backlog
            includes DRAFT, ASSIGNED, WORKING, ON_HOLD, FB-ISSUE and
            CUST-ISSUE.
          </div>
        </>
      )}
    </main>
  );
}

function Metric({
  label,
  value
}:{
  label:string;
  value:string|number
}){
  return (
    <div className="wfm-kpi">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Bar({
  label,
  value,
  total
}:{
  label:string;
  value:number;
  total:number
}){
  const pct=total>0?Math.min(100,(value/total)*100):0;

  return (
    <div style={{margin:'12px 0'}}>
      <div style={{
        display:'flex',
        justifyContent:'space-between',
        gap:12,
        fontSize:12
      }}>
        <span>{label}</span>
        <b>{value}</b>
      </div>

      <div style={{
        height:7,
        background:'var(--fb-panel-2)',
        borderRadius:99,
        overflow:'hidden',
        marginTop:6
      }}>
        <div style={{
          height:'100%',
          width:`${pct}%`,
          background:'var(--fb-orange)',
          borderRadius:99
        }}/>
      </div>
    </div>
  );
}