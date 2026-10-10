import React, { useState } from 'react';
import { saveCustomerSignature } from '../services/api';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';

export default function SignatureScreen({ workOrderId, executionId, token, onSave }: any) {
  const [signature, setSignature] = useState<string | null>(null);

  const saveSignature = async () => {
    if (!signature) { Alert.alert('Draw signature first'); return; }
    try {
      if (!token) throw new Error('An authenticated technician session is required.');
      const data = await saveCustomerSignature(token, {
        workOrderId, executionId, signatureData: signature,
        signedByName: 'Customer', signedByContact: '',
        deviceInfo: { platform: 'mobile', timestamp: new Date().toISOString() }
      });
      if (!data?.signature?.isVerified) throw new Error('Server did not confirm the signature.');
      Alert.alert('Signature Saved', `Customer signed — verified. Audit logged.`);
      onSave && onSave(data);
    } catch (e) {
      Alert.alert('Signature not saved', e instanceof Error ? e.message : 'Please retry.');
    }
  };

  return (
    <View style={s.container}>
      <Text style={s.title}>Customer Digital Signature — Phase 4</Text>
      <Text style={s.sub}>Signature capture requires device acceptance. Continue using signed hard-copy work orders for beta.</Text>
      <View style={{ backgroundColor: '#fff', height: 200, borderRadius: 12, marginVertical: 12, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: '#000' }}>✍️ Signature Pad (canvas) — draw here</Text>
        <Text style={{ color: '#71717A', fontSize: 10 }}>In production: use react-native-signature-canvas</Text>
      </View>
      <TouchableOpacity style={s.btn} onPress={saveSignature}><Text style={s.btnText}>Save Signature</Text></TouchableOpacity>
      <Text style={{ color: '#71717A', fontSize: 10, marginTop: 8 }}>Evidence Chain: Photo (camera-only) + Measurements (structured) + Signature (digital) = Complete proof</Text>
    </View>
  );
}
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0B', padding: 16 },
  title: { color: '#F59E0B', fontSize: 16, fontWeight: 'bold' },
  sub: { color: '#71717A', fontSize: 11, marginTop: 4 },
  btn: { backgroundColor: '#F59E0B', padding: 12, borderRadius: 10, marginTop: 10 },
  btnText: { color: '#000', textAlign: 'center', fontWeight: '700' }
});
