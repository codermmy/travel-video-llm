import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { MainStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'EventDetail'>;

export function EventDetailScreen({ route }: Props) {
  return (
    <View style={styles.container}>
      <Text variant="headlineSmall">Event Detail</Text>
      <Text>eventId: {route.params.eventId}</Text>
      <Text>该路由为 legacy 导航占位，实际页面使用 expo-router。</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
});
