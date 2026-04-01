import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

/**
 * Tab 导航布局
 * 包含地图(足迹)、事件、我的/设置三个标签页
 */
export default function TabLayout() {
  return (
    <Tabs
      detachInactiveScreens={false}
      screenOptions={{
        tabBarActiveTintColor: '#6200EE',
        tabBarInactiveTintColor: '#999',
        headerShown: false,
        lazy: false,
        freezeOnBlur: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '足迹',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="map-marker-multiple" size={size} color={color} />
          ),
          tabBarAccessibilityLabel: 'tab-map',
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: '事件',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="calendar-multiselect" size={size} color={color} />
          ),
          tabBarAccessibilityLabel: 'tab-events',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '我的',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-cog-outline" size={size} color={color} />
          ),
          tabBarAccessibilityLabel: 'tab-profile',
        }}
      />
    </Tabs>
  );
}
