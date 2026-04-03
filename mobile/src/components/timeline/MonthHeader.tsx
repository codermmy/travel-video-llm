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
    paddingTop: 18,
    paddingBottom: 10,
    paddingHorizontal: 14,
    backgroundColor: 'transparent',
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: JourneyPalette.cardMuted,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    paddingHorizontal: 12,
    paddingVertical: 6,
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
