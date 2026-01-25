import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { apiClient } from '@/services/api/client';
import { useAuthStore } from '@/stores';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Welcome'>;

export function WelcomeScreen({ navigation }: Props) {
  const [healthText, setHealthText] = useState<string>('not checked');
  const setAuth = useAuthStore((s) => s.setAuth);

  const pingBackend = useCallback(async () => {
    setHealthText('checking...');
    try {
      const res = await apiClient.get('/api/v1/health');
      setHealthText(`ok: ${JSON.stringify(res.data)}`);
    } catch (e: any) {
      setHealthText(`error: ${e?.message ?? 'unknown'}`);
    }
  }, []);

  const registerDevice = useCallback(async () => {
    setHealthText('registering...');
    try {
      const res = await apiClient.post('/api/v1/auth/register', { device_id: 'dev-test-001' });
      const token = res?.data?.data?.token;
      const userId = res?.data?.data?.user_id;
      if (token && userId) {
        setAuth(token, userId);
      }
      setHealthText(`registered: ${JSON.stringify(res.data)}`);
    } catch (e: any) {
      setHealthText(`error: ${e?.message ?? 'unknown'}`);
    }
  }, [setAuth]);

  return (
    <View style={styles.container}>
      <Text variant="headlineMedium">Travel Album</Text>
      <Text style={styles.mono}>{healthText}</Text>

      <View style={styles.row}>
        <Button mode="contained" onPress={() => navigation.navigate('Main')}>
          Enter
        </Button>
        <Button mode="outlined" onPress={pingBackend}>
          Ping Backend
        </Button>
      </View>
      <Button mode="text" onPress={registerDevice}>
        Register Device
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    gap: 12,
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  mono: {
    fontFamily: 'Courier',
  },
});
