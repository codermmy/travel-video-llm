import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { JourneyPalette } from '@/styles/colors';

/**
 * Tab 导航布局
 * 包含地图(足迹)、事件、我的/设置三个标签页
 */
export default function TabLayout() {
  return (
    <Tabs
      detachInactiveScreens={false}
      screenOptions={{
        tabBarActiveTintColor: JourneyPalette.ink,
        tabBarInactiveTintColor: '#8B8A84',
        tabBarActiveBackgroundColor: JourneyPalette.card,
        headerShown: false,
        lazy: false,
        freezeOnBlur: false,
        sceneStyle: {
          backgroundColor: JourneyPalette.cardAlt,
        },
        tabBarStyle: {
          height: 72,
          paddingTop: 8,
          paddingBottom: 10,
          paddingHorizontal: 12,
          backgroundColor: 'rgba(255,252,247,0.96)',
          borderTopWidth: 1,
          borderTopColor: JourneyPalette.line,
          shadowColor: JourneyPalette.shadow,
          shadowOffset: { width: 0, height: -6 },
          shadowOpacity: 0.08,
          shadowRadius: 18,
          elevation: 10,
        },
        tabBarItemStyle: {
          borderRadius: 18,
          marginHorizontal: 4,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '700',
          marginBottom: 2,
        },
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
          title: '旅程',
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
