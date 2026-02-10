import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

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
    top: 16,
    right: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(28, 47, 84, 0.12)',
    shadowColor: '#101D38',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 6,
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
    fontSize: 14,
    fontWeight: '600',
    color: '#2B3A5E',
  },
  pressed: {
    transform: [{ scale: 0.96 }],
    opacity: 0.8,
  },
});
