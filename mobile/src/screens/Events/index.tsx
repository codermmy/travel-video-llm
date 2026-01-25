import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

export function EventsScreen() {
  return (
    <View style={styles.container}>
      <Text variant="headlineSmall">Events</Text>
      <Text>Placeholder screen</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
});
