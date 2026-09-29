import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useAuth } from '../auth/AuthContext';

const LoginScreen = ({ navigation }) => {
  const { sendOtp, verifyOtp } = useAuth();

  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpRequested, setOtpRequested] = useState(false);
  const [devOtp, setDevOtp] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSendOtp = async () => {
    try {
      setLoading(true);
      const result = await sendOtp(phone);
      setOtpRequested(true);
      setDevOtp(result?.data?.devOtp || '');
      Alert.alert('Success', 'OTP sent successfully');
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    try {
      setLoading(true);
      await verifyOtp(phone, otp);
      navigation.replace('Onboarding');
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Failed to verify OTP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>EliteSuraksha 2.0</Text>
      <Text style={styles.subtitle}>Worker Mobile Login</Text>

      <TextInput
        style={styles.input}
        placeholder="10-digit mobile number"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
      />

      {!otpRequested ? (
        <TouchableOpacity style={styles.button} onPress={handleSendOtp} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'Sending OTP...' : 'Send OTP'}</Text>
        </TouchableOpacity>
      ) : (
        <>
          <TextInput
            style={styles.input}
            placeholder="Enter OTP"
            value={otp}
            onChangeText={setOtp}
            keyboardType="number-pad"
          />

          <TouchableOpacity style={styles.button} onPress={handleVerifyOtp} disabled={loading}>
            <Text style={styles.buttonText}>{loading ? 'Verifying...' : 'Verify OTP'}</Text>
          </TouchableOpacity>

          {devOtp ? <Text style={styles.devOtp}>Dev OTP: {devOtp}</Text> : null}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#f5f7fb'
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 6
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 20
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    padding: 12,
    backgroundColor: '#fff',
    marginBottom: 12
  },
  button: {
    backgroundColor: '#1d4ed8',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 12
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold'
  },
  devOtp: {
    color: '#0f766e',
    marginTop: 8
  }
});

export default LoginScreen;