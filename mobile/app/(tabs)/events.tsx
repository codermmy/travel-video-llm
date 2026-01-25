import { StyleSheet, View, Text } from 'react-native';

/**
 * 事件列表页
 * 显示所有旅行事件
 */
export default function EventsScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.placeholder}>
        <Text style={styles.title}>事件列表</Text>
        <Text style={styles.subtitle}>这里将显示所有旅行事件</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
});
