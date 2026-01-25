import { StyleSheet, View, Text } from 'react-native';

/**
 * 地图主页 (足迹)
 * 显示高德地图和事件标记
 * TODO: Task-19 集成高德地图
 */
export default function MapScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.placeholder}>
        <Text style={styles.title}>地图视图</Text>
        <Text style={styles.subtitle}>高德地图集成将在 Task-19 实现</Text>
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
