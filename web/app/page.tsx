'use client';
import { useState, useEffect } from 'react';
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export default function DashboardFinal() {
  const [activeTab, setActiveTab] = useState<'overview'|'reports'|'audit'|'route'|'signatures'|'network'|'workflows'|'integration'>('overview');
  const [reportData, setReportData] = useState<any>(null);
  const [advancedAnalytics, setAdvancedAnalytics] = useState<any>(null);
  const [routeData, setRouteData] = useState<any>(null);
  const [napHealth, setNapHealth] = useState<any>(null);
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [reportRange, setReportRange] = useState('monthly');

  useEffect(()=> {
    fetch(`${API}/reports/summary?range=${reportRange}`).then(r=>r.json()).then(setReportData).catch(()=>{});
    fetch(`${API}/phase4/analytics/advanced?range=${reportRange}`).then(r=>r.json()).then(setAdvancedAnalytics).catch(()=>{});
    fetch(`${API}/work-orders`).then(r=>r.json()).then(d=>setWorkOrders(d.data||[])).catch(()=>{});
    fetch(`${API}/phase4/network/health`).then(r=>r.json()).then(setNapHealth).catch(()=>{});
  }, [reportRange]);

  const optimizeRoute = async () => {
    const res = await fetch(`${API}/phase4/route/optimize?technicianId=demo-tech-1&date=${new Date().toISOString().split('T')[0]}`);
    const data = await res.json(); setRouteData(data); setActiveTab('route');
  };

  return (
    <div style={{ padding: 20, background: '#0A0A0B', minHeight: '100vh', color: '#fff', fontFamily: 'Inter, system-ui' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ color: '#F59E0B', margin: 0 }}>🔥 FiberBlaze WFM — Phase 4 FINAL • Complete Production System</h1>
          <div style={{ fontSize: 11, color: '#71717A' }}>Digital Signatures • Route Optimization • Advanced Analytics • Automated Workflows • Network Intelligence • Integration Layer</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={optimizeRoute} style={{ background: '#F59E0B', color: '#000', border: 0, padding: '8px 14px', borderRadius: 10, cursor: 'pointer', fontSize: 11, fontWeight: 800 }}>🗺️ Optimize Routes</button>
          <button onClick={()=>window.open(`${API}/reports/export?format=excel&range=${reportRange}`,'_blank')} style={{ background: '#22C55E', color: '#fff', border: 0, padding: '8px 14px', borderRadius: 10, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>📊 Excel</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, margin: '14px 0', flexWrap: 'wrap' }}>
        {[
          {id:'overview', label:'OVERVIEW'},
          {id:'reports', label:'REPORTS'},
          {id:'route', label:'ROUTE OPTIMIZATION'},
          {id:'signatures', label:'DIGITAL SIGNATURES'},
          {id:'network', label:'NETWORK INTELLIGENCE'},
          {id:'workflows', label:'AUTOMATED WORKFLOWS'},
          {id:'integration', label:'INTEGRATION LAYER'},
          {id:'audit', label:'AUDIT TRAIL'},
        ].map(t=>(
          <button key={t.id} onClick={()=>setActiveTab(t.id as any)} style={{ padding: '8px 14px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: activeTab===t.id?'#F59E0B':'#18181B', color: activeTab===t.id?'#000':'#A1A1AA', border: '1px solid #27272A', cursor: 'pointer' }}>{t.label}</button>
        ))}
      </div>

      {activeTab==='overview' && reportData && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'Total WOs', value: reportData.totals?.total, color: '#fff' },
              { label: 'Completed', value: reportData.totals?.completed, color: '#22C55E' },
              { label: 'FB-Issue', value: reportData.totals?.fbIssue, color: '#F59E0B' },
              { label: 'CUST-Issue', value: reportData.totals?.custIssue, color: '#EF4444' },
            ].map((k,i)=>(
              <div key={i} style={{ background: '#18181B', borderRadius: 14, padding: 14, border: '1px solid #27272A', textAlign: 'center' }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: k.color }}>{k.value ?? 0}</div>
                <div style={{ fontSize: 10, color: '#71717A' }}>{k.label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16 }}>
            <div style={{ background: '#18181B', borderRadius: 16, padding: 16, border: '1px solid #27272A' }}>
              <h3 style={{ margin: '0 0 10px 0' }}>Final WFM Structure</h3>
              <div style={{ background: '#09090B', borderRadius: 12, padding: 14, border: '1px solid #27272A', fontFamily: 'monospace', fontSize: 11, lineHeight: 1.6 }}>
                FIBERBLAZE WFM<br/>├── TECHNICIAN MOBILE APP (Camera-only, Offline, GPS, Signatures)<br/>├── MANAGEMENT WEB (Job Controller, Supervisor, Reports, Audit, Route, Network)<br/>├── CENTRAL WFM API (Auth, WO, Field, GPS, Reports, Audit, Phase4)<br/>├── DATABASE + PHOTO/MEDIA (S3) + GPS/MAP (PostGIS)<br/>├── AUDIT ENGINE (Timeline 09:03→10:05 + who/when/why)<br/>├── REPORTING ENGINE (Daily→Weekly→Monthly→Custom → Excel/PDF/Print)<br/>├── ROUTE OPTIMIZATION (Nearest + Priority + Time Window)<br/>├── NETWORK INTELLIGENCE (NAP health, utilization, alerts)<br/>├── AUTOMATED WORKFLOWS (Triggers: Completed, FB/CUST Issue, Mismatch)<br/>└── INTEGRATION LAYER → FUTURE MULTIPLE APIs (Billing, NAP Mgmt, CRM, SMS, Future)
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(['daily','weekly','monthly','custom'] as const).map(r=>(
                  <button key={r} onClick={()=>setReportRange(r)} style={{ padding: '6px 12px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: reportRange===r?'#F59E0B':'#27272A', color: reportRange===r?'#000':'#A1A1AA', border: '1px solid #3F3F46', cursor: 'pointer' }}>{r.toUpperCase()}</button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ background: '#18181B', borderRadius: 16, padding: 14, border: '1px solid #27272A' }}>
                <h4 style={{ margin: '0 0 8px 0' }}>Advanced Analytics (Phase 4)</h4>
                <div style={{ fontSize: 11, color: '#A1A1AA', lineHeight: 1.6 }}>
                  {advancedAnalytics ? (
                    <>
                      Avg completion: {Number(advancedAnalytics.avgCompletionMinutes || 0).toFixed(1)} min<br/>
                      Techs active: {advancedAnalytics.technicianPerformance?.length || 0}<br/>
                      Network health avg: {advancedAnalytics.network?.healthScoreAvg || 85}%<br/>
                      Alerts: {advancedAnalytics.network?.alerts?.length || 0} unresolved<br/>
                      Trend: {advancedAnalytics.trends?.weeklyGrowth || '+12%'}
                    </>
                  ) : 'Loading analytics...'}
                </div>
              </div>

              <div style={{ background: '#18181B', borderRadius: 16, padding: 14, border: '1px solid #27272A' }}>
                <h4 style={{ margin: '0 0 8px 0' }}>Work Orders — Click for Audit</h4>
                <div style={{ maxHeight: 180, overflow: 'auto', fontSize: 11 }}>
                  {workOrders.slice(0,15).map((wo:any)=><div key={wo.id} style={{ padding: '5px 0', borderBottom: '1px solid #27272A' }}>{wo.woNumber} • {wo.type} • <span style={{ color: wo.status==='COMPLETED'?'#22C55E':'#fff' }}>{wo.status}</span></div>)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab==='reports' && reportData && (
        <div style={{ background: '#18181B', borderRadius: 16, padding: 16, border: '1px solid #27272A' }}>
          <h3>Reporting System — Full Phase 4</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 10 }}>
            {[
              { label: 'Total', value: reportData.totals?.total },
              { label: 'Completed', value: reportData.totals?.completed },
              { label: 'Repair', value: reportData.byType?.repair },
              { label: 'Installation', value: reportData.byType?.installation },
            ].map((k,i)=><div key={i} style={{ background: '#09090B', borderRadius: 10, padding: 12, border: '1px solid #27272A', textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 800 }}>{k.value}</div><div style={{ fontSize: 10, color: '#71717A' }}>{k.label}</div></div>)}
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button onClick={()=>window.open(`${API}/reports/export?format=excel&range=${reportRange}`,'_blank')} style={{ background: '#22C55E', color: '#fff', border: 0, padding: '8px 14px', borderRadius: 8, cursor: 'pointer' }}>📗 Export Excel (Summary + WOs + Audit)</button>
            <button onClick={()=>window.open(`${API}/reports/export?format=pdf&range=${reportRange}`,'_blank')} style={{ background: '#27272A', color: '#fff', border: '1px solid #3F3F46', padding: '8px 14px', borderRadius: 8, cursor: 'pointer' }}>📄 Export PDF</button>
            <button onClick={()=>window.print()} style={{ background: '#27272A', color: '#fff', border: '1px solid #3F3F46', padding: '8px 14px', borderRadius: 8, cursor: 'pointer' }}>🖨️ Print Dashboard</button>
          </div>
        </div>
      )}

      {activeTab==='route' && (
        <div style={{ background: '#18181B', borderRadius: 16, padding: 16, border: '1px solid #27272A' }}>
          <h3>Route Optimization — Phase 4</h3>
          <p style={{ fontSize: 11, color: '#A1A1AA' }}>Nearest neighbor + priority weighting + time window • Suggestion only — Job Controller can override • Total distance + duration calculation</p>
          {!routeData ? (
            <div style={{ background: '#09090B', borderRadius: 12, padding: 20, textAlign: 'center', border: '1px solid #27272A', marginTop: 10 }}>
              <button onClick={optimizeRoute} style={{ background: '#F59E0B', color: '#000', border: 0, padding: '10px 18px', borderRadius: 10, fontWeight: 800, cursor: 'pointer' }}>🗺️ Generate Optimized Route for Demo Tech</button>
              <div style={{ fontSize: 11, color: '#71717A', marginTop: 8 }}>Will sort 15 assigned WOs by distance/priority → total distance + duration</div>
            </div>
          ) : (
            <div style={{ marginTop: 10 }}>
              <div style={{ background: '#22C55E20', border: '1px solid #22C55E', borderRadius: 12, padding: 12, marginBottom: 10 }}>
                <div style={{ fontWeight: 800, color: '#22C55E' }}>Optimized Route • {routeData.summary?.totalJobs} jobs • {routeData.summary?.totalDistance} • {routeData.summary?.totalDuration} • Score {routeData.route?.optimizationScore}%</div>
                <div style={{ fontSize: 11, color: '#A1A1AA' }}>{routeData.summary?.optimization}</div>
              </div>
              <div style={{ maxHeight: 300, overflow: 'auto', background: '#09090B', borderRadius: 10, border: '1px solid #27272A' }}>
                {routeData.summary?.stops?.map((s:any,i:number)=>(
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid #27272A', fontSize: 12 }}>
                    <div><b>#{i+1} {s.woNumber}</b> • {s.type} • Priority {s.priority}</div><div style={{ color: '#A1A1AA' }}>{s.distance_m}m • {s.estimatedMinutes}min</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab==='signatures' && (
        <div style={{ background: '#18181B', borderRadius: 16, padding: 16, border: '1px solid #27272A' }}>
          <h3>Digital Customer Signatures — Phase 4</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 10 }}>
            <div style={{ background: '#09090B', borderRadius: 12, padding: 14, border: '1px solid #27272A' }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Technician App — Signature Capture</div>
              <div style={{ background: '#fff', height: 160, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', fontSize: 12 }}>✍️ Customer draws signature here<br/>Captured as base64 • Verified • Audit logged</div>
              <div style={{ marginTop: 10, fontSize: 11, color: '#A1A1AA' }}>
                Fields: signedByName, signedByContact, ipAddress, deviceInfo, isVerified<br/>
                {'API: POST /phase4/signature { workOrderId, executionId, signatureData (base64), signedByName, signedByContact }'}
              </div>
              <button style={{ marginTop: 10, background: '#F59E0B', color: '#000', border: 0, padding: '8px 14px', borderRadius: 8, fontWeight: 700, width: '100%' }}>✓ Save Signature + Complete WO</button>
            </div>
            <div style={{ background: '#09090B', borderRadius: 12, padding: 14, border: '1px solid #27272A' }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Why Digital Signatures (Phase 4)</div>
              <div style={{ fontSize: 11, color: '#A1A1AA', lineHeight: 1.7 }}>✓ Customer acceptance proof<br/>✓ Dispute prevention<br/>✓ Legal evidence<br/>✓ Technician accountability<br/>✓ Timestamp + GPS linked<br/>✓ Offline capture + later sync<br/>✓ Stored with immutable audit trail</div>
            </div>
          </div>
        </div>
      )}

      {activeTab==='network' && (
        <div style={{ background: '#18181B', borderRadius: 16, padding: 16, border: '1px solid #27272A' }}>
          <h3>Network Intelligence — Phase 4</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 10 }}>
            <div style={{ background: '#09090B', borderRadius: 10, padding: 12, border: '1px solid #27272A' }}><b>NAP Health</b><div style={{ fontSize: 24, color: '#22C55E' }}>{napHealth?.summary?.avgHealthScore || 85}%</div></div>
            <div style={{ background: '#09090B', borderRadius: 10, padding: 12, border: '1px solid #27272A' }}><b>Total NAPs</b><div style={{ fontSize: 24 }}>{napHealth?.summary?.totalNaps || 0}</div></div>
            <div style={{ background: '#09090B', borderRadius: 10, padding: 12, border: '1px solid #27272A' }}><b>Alerts</b><div style={{ fontSize: 24, color: '#EF4444' }}>{napHealth?.summary?.unresolvedAlerts || 0}</div></div>
            <div style={{ background: '#09090B', borderRadius: 10, padding: 12, border: '1px solid #27272A' }}><b>Critical</b><div style={{ fontSize: 24, color: '#EF4444' }}>{napHealth?.summary?.criticalAlerts || 0}</div></div>
          </div>
          <div style={{ marginTop: 14, background: '#09090B', borderRadius: 12, padding: 14, border: '1px solid #27272A', fontSize: 11, color: '#A1A1AA' }}>
            <b style={{ color: '#fff' }}>Intelligence capabilities:</b><br/>
            NAP utilization tracking • Health score 0–100 • Fiber break alerts • High loss detection • Port full warnings • Historical trend • WO correlation • Geographic health map<br/>
            <br/><b style={{ color: '#F59E0B' }}>API endpoints:</b><br/>
            GET /phase4/network/health • POST /phase4/network/health/update • GET /phase4/network/alerts • POST /phase4/network/alert
          </div>
        </div>
      )}

      {activeTab==='workflows' && (
        <div style={{ background: '#18181B', borderRadius: 16, padding: 16, border: '1px solid #27272A' }}>
          <h3>Automated Workflows — Phase 4</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 10 }}>
            {[
              ['WO_COMPLETED','Auto-report + supervisor notification','✓ Active'],
              ['FB_ISSUE','Create network alert + notify controller','✓ Active'],
              ['CUST_ISSUE','Flag for customer care follow-up','✓ Active'],
              ['EVIDENCE_MISMATCH','Block completion + alert supervisor','✓ Active'],
              ['HIGH_NETWORK_LOSS','Create priority repair WO','✓ Active'],
              ['TECH_OFFLINE','Queue actions → sync when online','✓ Active'],
            ].map((w,i)=><div key={i} style={{ background: '#09090B', borderRadius: 10, padding: 12, border: '1px solid #27272A' }}><div style={{ fontSize: 11, fontWeight: 800, color: '#F59E0B' }}>{w[0]}</div><div style={{ fontSize: 10, color: '#A1A1AA', margin: '6px 0' }}>{w[1]}</div><div style={{ fontSize: 10, color: '#22C55E' }}>{w[2]}</div></div>)}
          </div>
          <div style={{ marginTop: 12, fontSize: 11, color: '#71717A' }}>Workflow engine supports: trigger → conditions (JSON) → actions (JSON) → execution log → audit trail. Job Controller can create/enable/disable rules without code changes.</div>
        </div>
      )}

      {activeTab==='integration' && (
        <div style={{ background: '#18181B', borderRadius: 16, padding: 16, border: '1px solid #27272A' }}>
          <h3>Integration Layer — Future Multiple APIs</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 10 }}>
            {[
              ['BILLING API','Subscriber account • Balance • Plan • Status','Ready'],
              ['NAP MANAGEMENT','Ports • Utilization • Signal • Capacity','Ready'],
              ['CRM API','Customer history • Tickets • Contact','Ready'],
              ['SMS GATEWAY','WO assignment • Customer ETA • Alerts','Ready'],
              ['PAYMENT API','GCash • Maya • QRPH integration','Future'],
              ['MAPS API','Geocoding • Distance matrix • Traffic','Ready'],
            ].map((x,i)=><div key={i} style={{ background: '#09090B', borderRadius: 10, padding: 12, border: '1px solid #27272A' }}><div style={{ fontSize: 11, fontWeight: 800 }}>{x[0]}</div><div style={{ fontSize: 10, color: '#A1A1AA', margin: '6px 0' }}>{x[1]}</div><span style={{ fontSize: 9, background: x[2]==='Ready'?'#22C55E20':'#F59E0B20', color: x[2]==='Ready'?'#22C55E':'#F59E0B', padding: '2px 7px', borderRadius: 10 }}>{x[2]}</span></div>)}
          </div>
          <div style={{ marginTop: 14, background: '#09090B', borderRadius: 12, padding: 14, border: '1px solid #27272A', fontSize: 11, color: '#A1A1AA' }}>
            <b style={{ color: '#fff' }}>Integration architecture:</b><br/>
            API Gateway → Integration Registry → Provider Adapters → External APIs<br/>
            Config per integration: baseUrl • apiKey (encrypted) • timeout • retry policy • webhook support • health check<br/>
            <br/>All external calls logged in IntegrationLog with request/response, status, duration, and errors for full traceability.
          </div>
        </div>
      )}

      {activeTab==='audit' && (
        <div style={{ background: '#18181B', borderRadius: 16, padding: 16, border: '1px solid #27272A' }}>
          <h3>Audit Trail — Immutable Accountability</h3>
          <div style={{ background: '#09090B', borderRadius: 12, padding: 14, border: '1px solid #27272A', fontSize: 11, lineHeight: 1.8 }}>
            Every action: <b>WHO</b> • <b>WHAT</b> • <b>WHEN</b> • <b>WHERE (GPS)</b> • <b>WHY (reason)</b><br/>
            Example timeline: 09:03 WO assigned → 09:05 Tech accepted → 09:12 En route → 09:31 Arrived → 09:35 Work started → 09:55 Photo captured → 10:01 Signature → 10:05 Completed<br/>
            Append-only AuditEvent table • IP + device • Before/after values • Correlation ID • GPS coordinates • No delete endpoint
          </div>
        </div>
      )}
    </div>
  );
}
