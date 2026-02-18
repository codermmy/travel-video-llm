import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import type { MonthSection } from '@/utils/eventGrouping';

type MonthHeaderProps = {
  section: MonthSection;
};

export function MonthHeader({ section }: MonthHeaderProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {section.title} · {section.eventCount}个事件 · {section.photoCount}张照片
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 14,
    paddingBottom: 8,
    paddingHorizontal: 14,
    backgroundColor: '#F3F6FC',
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4A587B',
    letterSpacing: 0.2,
  },
});
