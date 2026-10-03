'use client';

import { useEffect, useRef, useState } from 'react';
import { apiJson, loadSession, Session } from '../../lib/api';
import 'maplibre-gl/dist/maplibre-gl.css';

type Feed = {
  generatedAt: string;
  technicians: any[];
  subscribers: any[];
  naps: any[];
  workOrders: any[];
};

const EMPTY: Feed = {
  generatedAt: '',
  technicians: [],
  subscribers: [],
  naps: [],
  workOrders: [],
};

const OSM_RASTER_STYLE: any = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
      maxzoom: 19,
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

export default function Operations() {
  const [session, setSession] = useState<Session | null>(null);
  const [feed, setFeed] = useState<Feed>(EMPTY);
  const [error, setError] = useState('');
  const [layer, setLayer] = useState({ tech: true, subs: true, naps: true, jobs: true });
  const [selected, setSelected] = useState<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markers = useRef<any[]>([]);

  useEffect(() => setSession(loadSession()), []);

  useEffect(() => {
    if (!session) return;
    let live = true;
    const load = () =>
      apiJson<Feed>('/gps/operations-map', {}, session)
        .then((x) => {
          if (live) {
            setFeed(x);
            setError('');
          }
        })
        .catch((e) => live && setError(e.message));
    load();
    const id = setInterval(load, 15000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [session]);

  useEffect(() => {
    if (!session || !mapEl.current || mapRef.current) return;
    let cancelled = false;
    import('maplibre-gl').then((mod) => {
      if (cancelled || !mapEl.current) return;
      const maplibregl: any = (mod as any).default || mod;
      const map = new maplibregl.Map({
        container: mapEl.current,
        style: OSM_RASTER_STYLE,
        center: [120.94, 14.41],
        zoom: 11,
      });
      map.addControl(new maplibregl.NavigationControl(), 'top-right');
      map.on('load', () => setMapReady(true));
      mapRef.current = { map, maplibregl };
    });
    return () => {
      cancelled = true;
      mapRef.current?.map?.remove();
      mapRef.current = null;
    };
  }, [session]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    markers.current.forEach((m) => m.remove());
    markers.current = [];
    const { map, maplibregl } = mapRef.current;
    const add = (x: any, kind: string, title: string, detail: string) => {
      if (x.lng == null || x.lat == null) return;
      const el = document.createElement('button');
      el.className = `wfm-map-marker ${kind}`;
      el.title = title;
      el.onclick = () => setSelected({ ...x, kind, title, detail });
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([Number(x.lng), Number(x.lat)])
        .addTo(map);
      markers.current.push(marker);
    };
    if (layer.tech)
      feed.technicians
        .filter((t) => t.status !== 'OFFLINE')
        .forEach((t) => add(t, t.isFresh ? 'technician' : 'technician stale', t.name, `${t.teamName || 'No team'} • ${t.status}`));
    if (layer.subs) feed.subscribers.forEach((s) => add(s, 'subscriber', s.name, s.address));
    if (layer.naps) feed.naps.forEach((n) => add(n, 'nap', n.napCode, n.address || 'NAP'));
    if (layer.jobs)
      feed.workOrders
        .filter((w) => w.lat != null && w.lng != null)
        .forEach((w) => add(w, 'job', w.woNumber, `${w.type} • ${w.status}`));
  }, [feed, layer, mapReady]);

  if (!session)
    return (
      <div className="wfm-page">
        <div className="wfm-panel">
          <h2>Live GPS Operations</h2>
          <p>Sign in through Command Center first.</p>
        </div>
      </div>
    );

  const online = feed.technicians.filter((t) => t.status !== 'OFFLINE');
  const fresh = online.filter((t) => t.isFresh);

  return (
    <div className="wfm-page">
      <div className="wfm-page-head">
        <div>
          <span className="wfm-eyebrow">LIVE FIELD VISIBILITY</span>
          <h1>Live GPS Operations</h1>
          <p>Technicians, subscribers, NAP facilities and active service orders in one operational view.</p>
        </div>
        <div className="wfm-live"><i /> REFRESH 15 SEC</div>
      </div>
      {error && <div className="wfm-alert">{error}</div>}
      <div className="wfm-kpis">
        <K label="Online Technicians" v={online.length} />
        <K label="Fresh GPS" v={fresh.length} />
        <K label="Subscribers Mapped" v={feed.subscribers.length} />
        <K label="NAPs Mapped" v={feed.naps.length} />
        <K label="Active Work Orders" v={feed.workOrders.length} />
      </div>
      <div className="wfm-map-layout">
        <div className="wfm-panel wfm-map-panel">
          <div className="wfm-map-toolbar">
            <b>Operations Map</b>
            <Toggle label="Teams" on={layer.tech} set={() => setLayer((x) => ({ ...x, tech: !x.tech }))} />
            <Toggle label="Subscribers" on={layer.subs} set={() => setLayer((x) => ({ ...x, subs: !x.subs }))} />
            <Toggle label="NAP" on={layer.naps} set={() => setLayer((x) => ({ ...x, naps: !x.naps }))} />
            <Toggle label="Work Orders" on={layer.jobs} set={() => setLayer((x) => ({ ...x, jobs: !x.jobs }))} />
          </div>
          <div ref={mapEl} className="wfm-map" />
          <div className="wfm-map-legend">
            <span><i className="technician" /> Technician</span>
            <span><i className="subscriber" /> Subscriber</span>
            <span><i className="nap" /> NAP</span>
            <span><i className="job" /> Active WO</span>
          </div>
        </div>
        <div>
          <div className="wfm-panel">
            <h3>Online Field Teams</h3>
            {online.length ? online.map((t) => (
              <button
                className="wfm-live-tech"
                key={t.id}
                onClick={() => {
                  setSelected({ ...t, kind: 'technician', title: t.name, detail: `${t.teamName || 'No team'} • ${t.status}` });
                  if (t.lng != null && t.lat != null) mapRef.current?.map?.flyTo({ center: [t.lng, t.lat], zoom: 15 });
                }}
              >
                <span className={`wfm-tech-dot ${t.isStale ? 'stale' : ''}`} />
                <span>
                  <b>{t.name}</b>
                  <small>{t.teamName || 'No team'} • {t.status} • {t.locationAgeSeconds == null ? 'No GPS' : `${t.locationAgeSeconds}s ago`}</small>
                </span>
              </button>
            )) : <div className="wfm-empty">No technicians currently online.</div>}
          </div>
          {selected && (
            <div className="wfm-panel">
              <span className="wfm-eyebrow">SELECTED {String(selected.kind).toUpperCase()}</span>
              <h3>{selected.title}</h3>
              <p>{selected.detail}</p>
              {selected.woNumber && <a className="wfm-link" href="/dispatch">Open controlled dispatch →</a>}
              <small className="wfm-coordinate">{selected.lat != null ? `${Number(selected.lat).toFixed(6)}, ${Number(selected.lng).toFixed(6)}` : 'Location unavailable'}</small>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function K({ label, v }: { label: string; v: number }) {
  return <div className="wfm-kpi"><span>{label}</span><strong>{v}</strong></div>;
}

function Toggle({ label, on, set }: { label: string; on: boolean; set: () => void }) {
  return <button className={`wfm-layer-toggle ${on ? 'on' : ''}`} onClick={set}>{label}</button>;
}
