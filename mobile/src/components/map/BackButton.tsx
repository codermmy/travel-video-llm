import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { JourneyPalette } from '@/styles/colors';

type BackButtonProps = {
  levelName: string;
  onPress: () => void;
};

export function BackButton({ levelName, onPress }: BackButtonProps) {
  const [pressed, setPressed] = useState(false);

  return (
    <View style={styles.container}>
      <Pressable
        style={[styles.touchable, pressed && styles.pressed]}
        onPress={onPress}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
      >
        <Ionicons name="arrow-back" size={18} color="#2B3A5E" style={styles.icon} />
        <Text style={styles.text}>返回{levelName}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 20,
    right: 16,
    backgroundColor: JourneyPalette.overlay,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(41, 57, 54, 0.08)',
    shadowColor: JourneyPalette.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  touchable: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 4,
  },
  text: {
    fontSize: 13,
    fontWeight: '700',
    color: JourneyPalette.ink,
  },
  pressed: {
    transform: [{ scale: 0.96 }],
    opacity: 0.8,
  },
});
