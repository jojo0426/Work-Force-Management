import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert, Image } from 'react-native';
import { Camera, CameraType } from 'expo-camera';
import * as Location from 'expo-location';
import * as SQLite from 'expo-sqlite';

const API = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.10:4000/api/v1';

// Offline SQLite
const db = SQLite.openDatabase('fiberblaze.db');

export default function App() {
  const [status, setStatus] = useState<'ASSIGNED'|'WORKING'|'COMPLETED'|'FB_ISSUE'|'CUST_ISSUE'>('ASSIGNED');
  const [jobs, setJobs] = useState<any[]>([
    { id: 'wo-1', woNumber: 'WO-1001', type: 'REPAIR', subscriber: 'Juan Dela Cruz', address: 'Blk 5 Lot 2 Dasmarinas', nap: 'DIC01-10-N04', port: 7, distance: 450 },
    { id: 'wo-2', woNumber: 'WO-1005', type: 'INSTALLATION', subscriber: 'Maria Santos', address: 'Blk 6 Lot 1', nap: 'DIC01-10-N05', port: 3, distance: 1100 },
  ]);
  const [currentJob, setCurrentJob] = useState<any>(null);
  const [measurements, setMeasurements] = useState({ rx: '-19.4', dl: '287', ul: '294', ping: '4', nap: 'DIC01-10-N04', port: '7', findings: '' });
  const [hasCamPerm, setHasCamPerm] = useState(false);
  const [hasLocPerm, setHasLocPerm] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<string[]>([]);
  const cameraRef = useRef<Camera>(null);
  const [location, setLocation] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const { status: camStatus } = await Camera.requestCameraPermissionsAsync();
      setHasCamPerm(camStatus === 'granted');
      const { status: locStatus } = await Location.requestForegroundPermissionsAsync();
      setHasLocPerm(locStatus === 'granted');
      if (locStatus === 'granted') {
        const loc = await Location.getCurrentPositionAsync({});
        setLocation(loc.coords);
        // Send location to API every 15s
        setInterval(async () => {
          try {
            const l = await Location.getCurrentPositionAsync({});
            setLocation(l.coords);
            await fetch(`${API}/gps/location/update`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: 'demo-tech-1', lat: l.coords.latitude, lng: l.coords.longitude, status: status })
            });
          } catch {}
        }, 15000);
      }
      // Init SQLite offline queue
      db.transaction(tx => {
        tx.executeSql('CREATE TABLE IF NOT EXISTS offline_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT, payload TEXT, createdAt TEXT)');
      });
    })();
  }, []);

  const startJob = async () => {
    if (!currentJob) { Alert.alert('Select a job first'); return; }
    setStatus('WORKING');
    try {
      await fetch(`${API}/executions/${currentJob.id}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ technicianId: 'demo-tech-1' })
      });
    } catch (e) {
      // Offline: queue it
      db.transaction(tx => {
        tx.executeSql('INSERT INTO offline_queue (action, payload, createdAt) VALUES (?, ?, ?)', ['START_JOB', JSON.stringify({ jobId: currentJob.id }), new Date().toISOString()]);
      });
    }
  };

  const takePhoto = async () => {
    if (!cameraRef.current) return;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.7, exif: true });
    setCapturedPhoto(photo.uri);
  };

  const usePhoto = async () => {
    if (!capturedPhoto || !currentJob) return;
    setEvidence(prev => [...prev, capturedPhoto]);
    setCapturedPhoto(null);
    setShowCamera(false);

    // Upload with camera-only flag
    try {
      const form = new FormData();
      // @ts-ignore
      form.append('photo', { uri: capturedPhoto, name: 'evidence.jpg', type: 'image/jpeg' });
      form.append('type', 'FIBER_REPAIR');
      form.append('lat', location?.latitude?.toString() || '');
      form.append('lng', location?.longitude?.toString() || '');
      form.append('isCamera', 'true');

      await fetch(`${API}/executions/${currentJob.id}/photos`, { method: 'POST', body: form as any, headers: { 'Content-Type': 'multipart/form-data' } });
    } catch {
      // Offline queue
      db.transaction(tx => {
        tx.executeSql('INSERT INTO offline_queue (action, payload) VALUES (?, ?)', ['PHOTO', JSON.stringify({ jobId: currentJob.id, uri: capturedPhoto })]);
      });
    }
  };

  const completeJob = async (finalStatus: typeof status) => {
    setStatus(finalStatus);
    if (!currentJob) return;
    try {
      const res = await fetch(`${API}/executions/${currentJob.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: finalStatus, findings: measurements.findings, technicianId: 'demo-tech-1' })
      });
      const data = await res.json();
      if (data.nextSuggestion) {
        Alert.alert('Smart Next Job', `Suggested: ${data.nextSuggestion.woNumber} — ${data.nextSuggestion.distance_m || 450}m away\n\nSuggestion only — no auto-reassign. Job Controller remains in control.`);
      }
    } catch {
      db.transaction(tx => {
        tx.executeSql('INSERT INTO offline_queue (action, payload) VALUES (?, ?)', ['COMPLETE', JSON.stringify({ jobId: currentJob.id, status: finalStatus })]);
      });
    }
  };

  if (showCamera) {
    return (
      <View style={{ flex: 1 }}>
        <Camera style={{ flex: 1 }} type={CameraType.back} ref={cameraRef}>
          <View style={s.camOverlay}>
            <Text style={s.camText}>UPLOAD PHOTO → OPEN CAMERA → CAPTURE → PREVIEW → RETAKE / USE PHOTO</Text>
            <Text style={s.camSmall}>Camera-only — no gallery for required evidence</Text>
          </View>
        </Camera>
        <View style={{ flexDirection: 'row', padding: 16, backgroundColor: '#000', gap: 12 }}>
          <TouchableOpacity style={s.camBtn} onPress={() => setShowCamera(false)}><Text style={s.btnText}>Cancel</Text></TouchableOpacity>
          <TouchableOpacity style={[s.camBtn, { backgroundColor: '#F59E0B' }]} onPress={takePhoto}><Text style={s.btnText}>📷 CAPTURE</Text></TouchableOpacity>
        </View>
        {capturedPhoto && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', padding: 16 }}>
            <Image source={{ uri: capturedPhoto }} style={{ flex: 1, borderRadius: 12 }} />
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
              <TouchableOpacity style={s.camBtn} onPress={() => setCapturedPhoto(null)}><Text style={s.btnText}>RETAKE</Text></TouchableOpacity>
              <TouchableOpacity style={[s.camBtn, { backgroundColor: '#22C55E' }]} onPress={usePhoto}><Text style={s.btnText}>USE PHOTO ✓</Text></TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={s.title}>🔥 FiberBlaze Technician</Text>
      <Text style={s.sub}>GPS: {location ? `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}` : 'Acquiring...'} • Status: {status} {hasLocPerm ? '🟢' : '🔴'}</Text>

      <View style={s.card}>
        <Text style={s.cardTitle}>My Jobs (Smart Next Suggestion)</Text>
        {jobs.map(j => (
          <TouchableOpacity key={j.id} style={[s.jobRow, currentJob?.id===j.id && { borderColor: '#F59E0B', borderWidth: 2 }]} onPress={() => setCurrentJob(j)}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{j.woNumber} • {j.type} • {j.distance}m</Text>
            <Text style={{ color: '#A1A1AA', fontSize: 12 }}>{j.subscriber} — {j.address}</Text>
            <Text style={{ color: '#F59E0B', fontSize: 11 }}>NAP: {j.nap} Port {j.port}</Text>
          </TouchableOpacity>
        ))}
        {currentJob && <Text style={{ color: '#22C55E', marginTop: 8, fontSize: 12 }}>Selected: {currentJob.woNumber} → Suggested next after complete: nearest remaining (e.g. WO-1001 450m)</Text>}
      </View>

      {currentJob && (
        <>
          <View style={s.card}>
            <Text style={s.cardTitle}>Job Detail — {currentJob.woNumber}</Text>
            <Text style={s.white}>Subscriber: {currentJob.subscriber}</Text>
            <Text style={s.white}>Address: {currentJob.address}</Text>
            <Text style={s.white}>NAP: {currentJob.nap} Port {currentJob.port}</Text>
            <TouchableOpacity style={s.btn} onPress={startJob}><Text style={s.btnText}>{status==='ASSIGNED' ? '▶ START JOB → WORKING' : `Status: ${status}`}</Text></TouchableOpacity>
            <Text style={{ color: '#71717A', fontSize: 11, marginTop: 6 }}>09:27 Technician started job • 09:29 GPS recorded — Audit trail</Text>
          </View>

          <View style={s.card}>
            <Text style={s.cardTitle}>Structured Measurements (Searchable, not just photo)</Text>
            {[
              { k: 'rx', label: 'RX Power (dBm)', placeholder: '-19.4' },
              { k: 'dl', label: 'Download Mbps', placeholder: '287' },
              { k: 'ul', label: 'Upload Mbps', placeholder: '294' },
              { k: 'ping', label: 'Ping ms', placeholder: '4' },
              { k: 'nap', label: 'NAP Code', placeholder: 'DIC01-10-N04' },
              { k: 'port', label: 'Port', placeholder: '7' },
            ].map(f => (
              <View key={f.k} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <Text style={{ color: '#A1A1AA', width: 120, fontSize: 12 }}>{f.label}</Text>
                <TextInput style={s.input} value={(measurements as any)[f.k]} onChangeText={v=>setMeasurements({...measurements, [f.k]: v})} placeholder={f.placeholder} placeholderTextColor="#555" />
              </View>
            ))}
            <TextInput style={[s.input, { height: 60 }]} multiline value={measurements.findings} onChangeText={v=>setMeasurements({...measurements, findings: v})} placeholder="Technical findings..." placeholderTextColor="#555" />
          </View>

          <View style={s.card}>
            <Text style={s.cardTitle}>UPLOAD PHOTO (Camera-Only Enforcement)</Text>
            <Text style={{ color: '#A1A1AA', fontSize: 11, marginBottom: 8 }}>OPEN CAMERA → CAPTURE → PREVIEW → RETAKE / USE PHOTO — No gallery for required evidence. During beta, signed hard-copy WO can be photographed.</Text>
            <TouchableOpacity style={s.camBtn} onPress={() => { if (!hasCamPerm) { Alert.alert('Camera permission needed'); return; } setShowCamera(true); }}>
              <Text style={s.btnText}>📷 OPEN CAMERA</Text>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              {evidence.map((uri,i)=><Image key={i} source={{ uri }} style={{ width: 70, height: 70, borderRadius: 8 }} />)}
            </View>
            <Text style={{ color: '#71717A', fontSize: 10, marginTop: 8 }}>Required per WO type — Repair: modem/ONT, NAP, fiber, signal, after-repair, speedtest for slow browsing • Installation: modem, routing, NAP, signal, premises, completed • Transfer: old removal + new install • FB/CUST-Issue: photos supporting why not completed</Text>
          </View>

          <View style={s.card}>
            <Text style={s.cardTitle}>Complete Work Order</Text>
            <Text style={{ color: '#71717A', fontSize: 11, marginBottom: 8 }}>WORKING → COMPLETED | FB-ISSUE | CUST-ISSUE — Cancel is admin only</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <TouchableOpacity style={[s.btn, { backgroundColor: '#22C55E', flex: 1 }]} onPress={() => completeJob('COMPLETED')}><Text style={s.btnText}>COMPLETED</Text></TouchableOpacity>
              <TouchableOpacity style={[s.btn, { backgroundColor: '#F59E0B', flex: 1 }]} onPress={() => completeJob('FB_ISSUE')}><Text style={s.btnText}>FB-ISSUE</Text></TouchableOpacity>
              <TouchableOpacity style={[s.btn, { backgroundColor: '#EF4444', flex: 1 }]} onPress={() => completeJob('CUST_ISSUE')}><Text style={s.btnText}>CUST-ISSUE</Text></TouchableOpacity>
            </View>
            <TouchableOpacity style={{ marginTop: 10, backgroundColor: '#27272A', padding: 10, borderRadius: 8 }} onPress={() => Alert.alert('Report Mismatch', 'DB: DIC01-10-N04 vs Found: DIC01-10-N05\n\nThis will create PENDING for Supervisor — verified data not overwritten.\n\nREPORT MISMATCH → Supervisor Review → Approve/Reject')}>
              <Text style={{ color: '#F59E0B', textAlign: 'center', fontSize: 12 }}>⚠ REPORT NAP/GPS MISMATCH</Text>
            </TouchableOpacity>
          </View>

          <View style={s.card}>
            <Text style={s.cardTitle}>Offline Ready</Text>
            <Text style={{ color: '#A1A1AA', fontSize: 11 }}>Local Cache: Assigned WO, Findings, Measurements, Photos, Status Updates → Sync API when internet returns. Technician never loses field report.</Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0B', padding: 16 },
  title: { color: '#F59E0B', fontSize: 22, fontWeight: 'bold' },
  sub: { color: '#71717A', fontSize: 11, marginBottom: 12 },
  card: { backgroundColor: '#18181B', borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#27272A' },
  cardTitle: { color: '#fff', fontWeight: '700', marginBottom: 10, fontSize: 13 },
  white: { color: '#fff', fontSize: 12, marginBottom: 2 },
  jobRow: { backgroundColor: '#27272A', padding: 10, borderRadius: 10, marginBottom: 8, borderWidth: 1, borderColor: '#3F3F46' },
  btn: { backgroundColor: '#F59E0B', padding: 12, borderRadius: 10, marginTop: 10 },
  btnText: { color: '#fff', textAlign: 'center', fontWeight: '700', fontSize: 12 },
  input: { flex: 1, backgroundColor: '#09090B', color: '#fff', borderWidth: 1, borderColor: '#3F3F46', borderRadius: 8, padding: 8, fontSize: 12 },
  camBtn: { backgroundColor: '#27272A', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#3F3F46', flex: 1 },
  camOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end', padding: 16 },
  camText: { color: '#fff', fontWeight: '700', fontSize: 12, textAlign: 'center' },
  camSmall: { color: '#A1A1AA', fontSize: 10, textAlign: 'center', marginTop: 4 }
});
