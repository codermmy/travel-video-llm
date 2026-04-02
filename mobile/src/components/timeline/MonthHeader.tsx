import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import { JourneyPalette } from '@/styles/colors';
import type { MonthSection } from '@/utils/eventGrouping';

type MonthHeaderProps = {
  section: MonthSection;
};

export function MonthHeader({ section }: MonthHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.badge}>
        <Text style={styles.title}>{section.title}</Text>
      </View>
      <Text style={styles.meta}>
        {section.eventCount} 个事件 · {section.photoCount} 张照片
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 20,
    paddingBottom: 10,
    paddingHorizontal: 14,
    backgroundColor: 'transparent',
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: JourneyPalette.cardAlt,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  title: {
    fontSize: 13,
    fontWeight: '800',
    color: JourneyPalette.ink,
    letterSpacing: 0.4,
  },
  meta: {
    marginTop: 8,
    fontSize: 12,
    color: JourneyPalette.muted,
  },
});
