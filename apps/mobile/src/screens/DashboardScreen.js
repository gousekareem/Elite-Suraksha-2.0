import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { getDashboardApi, getSystemStatusApi, askAgentApi } from '../api/workerApi';
import { useAuth } from '../auth/AuthContext';

const inr = (v) => (v === null || v === undefined ? '—' : `₹${Math.round(Number(v)).toLocaleString('en-IN')}`);

const Card = ({ title, children, memory }) => (
  <View style={[styles.card, memory && styles.memoryCard]}>
    <Text style={[styles.cardTitle, memory && { color: '#4d34b3' }]}>{title}</Text>
    {children}
  </View>
);

// Mobile companion: earnings summary, memory status, and "ask the agent".
const DashboardScreen = () => {
  const { logout } = useAuth();
  const [dash, setDash] = useState(null);
  const [system, setSystem] = useState(null);
  const [question, setQuestion] = useState('Why did my earnings drop?');
  const [answer, setAnswer] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [d, s] = await Promise.all([getDashboardApi(), getSystemStatusApi()]);
      setDash(d.data);
      setSystem(s.data);
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not load your dashboard');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const ask = async () => {
    setBusy(true);
    setAnswer(null);
    try {
      const r = await askAgentApi(question);
      setAnswer(r.data.answer);
    } catch (err) {
      setError(err?.response?.data?.message || 'The agent could not answer');
    } finally {
      setBusy(false);
    }
  };

  const s = dash?.summary;
  return (
    <ScrollView contentContainerStyle={styles.container} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
      <Text style={styles.title}>EliteSuraksha 2.0</Text>
      <Text style={styles.sub}>{dash ? `${dash.worker.fullName} · ${dash.worker.city} ${dash.worker.zone}` : 'Loading…'}</Text>
      {system ? <Text style={[styles.badge, { color: system.hindsight.connected ? '#4d34b3' : '#c93a3a' }]}>● {system.hindsight.label}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {s ? (
        <Card title="Earnings">
          <Text style={styles.big}>{inr(s.week.current.net)}</Text>
          <Text style={styles.muted}>last 7 days · {s.week.current.sessions} sessions</Text>
          <Text style={styles.row}>30 days: {inr(s.month.current.net)} · {inr(s.month.current.perHour)}/hour</Text>
          {s.latestAnalysis?.baseline?.sampleSize >= 3 ? (
            <Text style={styles.row}>Latest shift vs your baseline: {s.latestAnalysis.evaluation.deviationPct}% ({s.latestAnalysis.evaluation.severity.replace(/_/g, ' ').toLowerCase()})</Text>
          ) : null}
        </Card>
      ) : null}

      {dash ? (
        <Card title="🧠 Agent memory" memory>
          <Text style={styles.row}>{dash.memory.retained} memories retained · {dash.memory.recalled} recalls · {dash.memory.investigations} investigations</Text>
        </Card>
      ) : null}

      <Card title="Ask the agent">
        <TextInput style={styles.input} value={question} onChangeText={setQuestion} maxLength={500} />
        <TouchableOpacity style={styles.button} onPress={ask} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Ask</Text>}
        </TouchableOpacity>
        {answer ? (
          <View style={{ marginTop: 12 }}>
            <Text style={styles.answer}>{answer.summary}</Text>
            {answer.facts.slice(0, 4).map((f, i) => <Text key={`f${i}`} style={styles.fact}>FACT · {f.text}</Text>)}
            {answer.inferences.map((f, i) => <Text key={`i${i}`} style={styles.infer}>INFERENCE · {f.text}</Text>)}
            {answer.unknowns.map((f, i) => <Text key={`u${i}`} style={styles.unknown}>UNKNOWN · {f.text}</Text>)}
            {answer.historicalContext?.length ? <Text style={styles.memory}>Recalled {answer.historicalContext.length} memories from Hindsight</Text> : null}
          </View>
        ) : null}
      </Card>

      <Text style={styles.muted}>Investigations, reports and the memory inspector are available in the web app.</Text>
      <TouchableOpacity onPress={logout}><Text style={styles.link}>Sign out</Text></TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { padding: 18, backgroundColor: '#f5f6f4', flexGrow: 1 },
  title: { fontSize: 22, fontWeight: '800', color: '#14171a' },
  sub: { color: '#4b5159', marginTop: 2 },
  badge: { marginTop: 8, fontWeight: '700' },
  error: { color: '#c93a3a', marginTop: 8 },
  card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#dfe1dc', padding: 14, marginTop: 14 },
  memoryCard: { backgroundColor: '#f0ecfe', borderColor: '#d8cffb' },
  cardTitle: { fontWeight: '800', fontSize: 15, marginBottom: 6, color: '#14171a' },
  big: { fontSize: 26, fontWeight: '800', color: '#14171a' },
  muted: { color: '#767c84', marginTop: 10 },
  row: { color: '#14171a', marginTop: 6 },
  input: { borderWidth: 1, borderColor: '#c9ccc5', borderRadius: 9, padding: 10, backgroundColor: '#fff' },
  button: { backgroundColor: '#0f5c56', padding: 12, borderRadius: 10, marginTop: 10, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700' },
  answer: { fontSize: 15, color: '#14171a', lineHeight: 21 },
  fact: { color: '#2a78d6', marginTop: 6 },
  infer: { color: '#b26b00', marginTop: 6 },
  unknown: { color: '#5f6670', marginTop: 6 },
  memory: { color: '#4d34b3', marginTop: 8, fontWeight: '700' },
  link: { color: '#0f5c56', textAlign: 'center', marginTop: 16, fontWeight: '600' }
});

export default DashboardScreen;
