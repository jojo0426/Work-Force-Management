'use client';
import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export default function Dashboard() {
  const [step, setStep] = useState('UPLOAD');
  const [excelPreview, setExcelPreview] = useState<any>(null);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${API}/gps/technicians/locations`).then(r=>r.json()).then(d=>setTechnicians(d.technicians||[])).catch(()=>{});
    fetch(`${API}/work-orders`).then(r=>r.json()).then(d=>setWorkOrders(d.data||[])).catch(()=>{});
  }, []);

  const handleExcel = async (e: any) => {
    const file = e.target.files[0];
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    setStep('VALIDATING');
    try {
      const res = await fetch(`${API}/work-orders/upload`, { method: 'POST', body: form });
      const data = await res.json();
      setExcelPreview(data);
      setStep('PREVIEW');
    } catch (err) {
      alert('Upload failed — is backend running on :4000?');
      setStep('UPLOAD');
    }
  };

  const confirmUpload = async () => {
    if (!excelPreview?.all) return;
    const res = await fetch(`${API}/work-orders/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workOrders: excelPreview.all.filter((r:any)=>r.valid), createdBy: 'job-controller' })
    });
    const data = await res.json();
    alert(`Created ${data.created} work orders`);
    setStep('DISPATCH');
    setWorkOrders(prev => [...data.workOrders, ...prev]);
  };

  const findNearby = async () => {
    const lat = 14.2995; // Dasmariñas example
    const lng = 120.9580;
    const res = await fetch(`${API}/work-orders/nearby?lat=${lat}&lng=${lng}&radius=3000`);
    const data = await res.json();
    alert(`Nearby:
${data.map((t:any)=>`${t.team || t.name} — ${t.distance_m}m (${t.status})`).join('\n')}\n\nSuggestion only — no auto-assign`);
  };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ color: '#F59E0B', margin: 0 }}>FiberBlaze WFM — Job Controller & Supervisor</h1>
        <div style={{ fontSize: 12, color: '#71717A' }}>Dasmarinas • Phase 1 Full • API: {API}</div>
      </div>

      <div style={{ display: 'flex', gap: 8, margin: '16px 0', flexWrap: 'wrap' }}>
        {['EXCEL','UPLOAD','VALIDATE','PREVIEW','ASSIGN TEAM','DISPATCH','TECHNICIAN APP'].map(s => (
          <div key={s} style={{ padding: '6px 14px', borderRadius: 20, fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
            background: step.includes(s) || step===s ? '#F59E0B' : '#27272A', color: step===s ? '#000' : '#A1A1AA', border: '1px solid #3F3F46' }}>{s}</div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 16 }}>
        <div>
          <div style={{ background: '#18181B', borderRadius: 16, padding: 16, border: '1px solid #27272A', marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0 }}>Dispatch — Excel Upload</h3>
              <button onClick={findNearby} style={{ background: '#27272A', color: '#fff', border: '1px solid #3F3F46', padding: '6px 12px', borderRadius: 8, cursor: 'pointer' }}>📍 Find Nearby Tech</button>
            </div>
            <p style={{ fontSize: 12, color: '#A1A1AA' }}>EXCEL WORK ORDER → UPLOAD → VALIDATE → PREVIEW → ASSIGN TEAM → DISPATCH → TECHNICIAN APP (works alongside existing Excel + hard-copy during beta)</p>

            <div style={{ border: '2px dashed #3F3F46', borderRadius: 12, padding: 20, textAlign: 'center', background: '#09090B', marginTop: 12 }}>
              <input type="file" accept=".xlsx,.xls" onChange={handleExcel} id="excel" style={{ display: 'none' }} />
              <label htmlFor="excel" style={{ cursor: 'pointer', display: 'block' }}>
                <div style={{ fontSize: 32 }}>📄</div>
                <div style={{ fontWeight: 600 }}>Drag Excel or Click to Upload</div>
                <div style={{ fontSize: 11, color: '#71717A' }}>Columns: WO Number, Type, Subscriber, Address, NAP, Port, Remarks</div>
              </label>
            </div>

            {excelPreview && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 13 }}>Total: {excelPreview.total} • Valid: {excelPreview.valid} • Invalid: {excelPreview.invalid}</div>
                <div style={{ maxHeight: 260, overflow: 'auto', marginTop: 8, background: '#09090B', borderRadius: 8, border: '1px solid #27272A' }}>
                  <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                    <thead><tr style={{ background: '#27272A', textAlign: 'left' }}><th style={{ padding: 6 }}>Row</th><th>WO#</th><th>Type</th><th>Subscriber</th><th>NAP</th><th>Errors</th></tr></thead>
                    <tbody>
                      {excelPreview.preview?.map((r:any,i:number)=>(
                        <tr key={i} style={{ borderTop: '1px solid #27272A', background: r.valid ? 'transparent' : '#450a0a' }}>
                          <td style={{ padding: 6 }}>{r.row}</td><td>{r.woNumber}</td><td>{r.type}</td><td>{r.subscriber}</td><td>{r.nap}</td><td style={{ color: '#F87171' }}>{r.errors?.join(', ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button onClick={confirmUpload} style={{ marginTop: 12, background: '#22C55E', color: '#fff', border: 0, padding: '10px 20px', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>✓ Confirm & Create {excelPreview.valid} Work Orders</button>
              </div>
            )}
          </div>

          <div style={{ background: '#18181B', borderRadius: 16, padding: 16, border: '1px solid #27272A' }}>
            <h3 style={{ marginTop: 0 }}>Map — Technician Live Locations</h3>
            <div ref={mapRef} style={{ background: '#09090B', height: 360, borderRadius: 12, border: '1px solid #27272A', display: 'flex', flexDirection: 'column', padding: 12 }}>
              <div style={{ fontSize: 11, color: '#71717A', marginBottom: 8 }}>Mapbox GL would render here — set NEXT_PUBLIC_MAPBOX_TOKEN. Showing list fallback:</div>
              {technicians.length===0 && <div style={{ color: '#71717A' }}>No technicians online yet — mobile app will send location every 15s when logged in.</div>}
              {technicians.map((t:any)=>(
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #27272A', fontSize: 12 }}>
                  <span>● {t.name} — {t.status} {t.isStale && <span style={{ color: '#F59E0B' }}>(Stale — last {new Date(t.lastLocationAt).toLocaleTimeString()})</span>}</span>
                  <span style={{ color: '#A1A1AA' }}>{t.lat?.toFixed(4)}, {t.lng?.toFixed(4)}</span>
                </div>
              ))}
              <div style={{ marginTop: 12, fontSize: 11, color: '#71717A' }}>
                Logic: Current / Last Known + timestamp/status. If stale {'>'}5min, show last known + timestamp, don't pretend exact.
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#18181B', borderRadius: 16, padding: 16, border: '1px solid #27272A' }}>
            <h4 style={{ margin: '0 0 8px 0' }}>Work Orders ({workOrders.length})</h4>
            <div style={{ maxHeight: 240, overflow: 'auto' }}>
              {workOrders.slice(0,20).map((wo:any)=>(
                <div key={wo.id} style={{ padding: '6px 0', borderBottom: '1px solid #27272A', fontSize: 12 }}>
                  <div style={{ fontWeight: 600 }}>{wo.woNumber} • {wo.type} • <span style={{ color: wo.status==='COMPLETED' ? '#22C55E' : wo.status==='FB_ISSUE' ? '#F59E0B' : '#fff' }}>{wo.status}</span></div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: '#18181B', borderRadius: 16, padding: 16, border: '1px solid #27272A' }}>
            <h4 style={{ margin: '0 0 8px 0' }}>Supervisor — Mismatch Review</h4>
            <div style={{ background: '#27272A', padding: 10, borderRadius: 8, fontSize: 12 }}>
              DATABASE NAP: DIC01-10-N04<br/>Reported: DIC01-10-N05<br/>→ REPORT MISMATCH → Review Queue → Approve/Reject<br/>
              <span style={{ color: '#F59E0B' }}>Protects verified data — never overwrites directly</span>
            </div>
          </div>

          <div style={{ background: '#18181B', borderRadius: 16, padding: 16, border: '1px solid #27272A' }}>
            <h4 style={{ margin: '0 0 8px 0' }}>Transfer — Special Handling</h4>
            <div style={{ fontSize: 11, color: '#A1A1AA' }}>
              OLD: GPS, NAP, Port, Removal Evidence<br/>↓ TRANSFER ↓<br/>NEW: GPS, NAP, Port, Install Evidence<br/>History preserved, not overwritten
            </div>
          </div>

          <div style={{ background: '#18181B', borderRadius: 16, padding: 16, border: '1px solid #27272A' }}>
            <h4 style={{ margin: '0 0 8px 0' }}>Audit Trail</h4>
            <div style={{ fontSize: 11, color: '#A1A1AA', lineHeight: 1.6 }}>
              09:03 — WO assigned by Controller<br/>09:27 — Technician started job<br/>09:29 — GPS recorded<br/>09:42 — Photo captured (camera-only)<br/>09:51 — Signal measurement -19.4 dBm<br/>10:05 — WO completed → Next: WO-1001 450m
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
