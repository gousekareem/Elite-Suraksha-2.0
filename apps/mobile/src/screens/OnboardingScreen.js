import React, { useEffect, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { getOnboardingProfileApi, saveOnboardingProfileApi } from '../api/workerApi';
import { useAuth } from '../auth/AuthContext';

const OnboardingScreen = ({ navigation }) => {
  const { logout } = useAuth();
  const [form, setForm] = useState({ fullName: '', city: '', zone: '', platformCode: 'GENERIC_DELIVERY' });

  useEffect(() => {
    getOnboardingProfileApi()
      .then((r) => r.data && setForm({ fullName: r.data.fullName, city: r.data.city, zone: r.data.zone, platformCode: r.data.platformCode }))
      .catch(() => {});
  }, []);

  const save = async () => {
    try {
      await saveOnboardingProfileApi({ ...form, preferences: { explanationStyle: 'chronological evidence timeline' } });
      navigation.navigate('Dashboard');
    } catch (err) {
      Alert.alert('Could not save', err?.response?.data?.message || 'Please try again');
    }
  };

  const field = (key, label, placeholder) => (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} value={form[key]} placeholder={placeholder} onChangeText={(v) => setForm({ ...form, [key]: v })} />
    </>
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Your worker profile</Text>
      <Text style={styles.sub}>Your profile scopes your private agent memory.</Text>
      {field('fullName', 'Full name', 'e.g. Rahul Kumar')}
      {field('city', 'City', 'e.g. Hyderabad')}
      {field('zone', 'Usual zone', 'e.g. Zone A')}
      {field('platformCode', 'Platform type', 'GENERIC_DELIVERY / GENERIC_RIDE / GENERIC_FREELANCE')}
      <TouchableOpacity style={styles.button} onPress={save}><Text style={styles.buttonText}>Save and continue</Text></TouchableOpacity>
      <TouchableOpacity onPress={logout}><Text style={styles.link}>Sign out</Text></TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: '#f5f6f4', flexGrow: 1 },
  title: { fontSize: 22, fontWeight: '800', color: '#14171a' },
  sub: { color: '#4b5159', marginTop: 4, marginBottom: 16 },
  label: { fontSize: 12, fontWeight: '700', color: '#4b5159', marginTop: 10, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#c9ccc5', borderRadius: 9, padding: 10, backgroundColor: '#fff' },
  button: { backgroundColor: '#0f5c56', padding: 14, borderRadius: 10, marginTop: 20, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700' },
  link: { color: '#0f5c56', textAlign: 'center', marginTop: 16, fontWeight: '600' }
});

export default OnboardingScreen;
