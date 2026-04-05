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
      <View style={styles.row}>
        <Text style={styles.title}>{section.title}</Text>
        <View style={styles.line} />
        <Text style={styles.meta}>
          {section.eventCount} 个回忆
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 32,
    paddingBottom: 16,
    paddingHorizontal: 16,
    backgroundColor: 'transparent',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: JourneyPalette.ink,
    letterSpacing: -0.5,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: JourneyPalette.line,
    opacity: 0.6,
  },
  meta: {
    fontSize: 12,
    fontWeight: '800',
    color: JourneyPalette.muted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
