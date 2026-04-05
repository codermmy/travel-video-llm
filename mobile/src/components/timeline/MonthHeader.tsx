import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import { JourneyPalette } from '@/styles/colors';
import type { MonthSection } from '@/utils/eventGrouping';

type MonthHeaderProps = {
  section: MonthSection;
  isFirst?: boolean;
};

export function MonthHeader({ section, isFirst = false }: MonthHeaderProps) {
  return (
    <View style={[styles.container, isFirst ? styles.containerFirst : styles.containerLater]}>
      <View style={styles.row}>
        <Text style={styles.title}>{section.title}</Text>
        <View style={styles.line} />
        <Text style={styles.meta}>{section.eventCount} 个回忆</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 0,
    paddingHorizontal: 24,
    backgroundColor: 'transparent',
    marginBottom: 16,
  },
  containerFirst: {
    paddingTop: 0,
  },
  containerLater: {
    paddingTop: 32,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 12,
    fontWeight: '900',
    color: JourneyPalette.muted,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  meta: {
    display: 'none',
  },
});
