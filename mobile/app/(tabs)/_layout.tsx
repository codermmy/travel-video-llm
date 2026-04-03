import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { JourneyPalette } from '@/styles/colors';

export default function TabLayout() {
  return (
    <Tabs
      detachInactiveScreens={false}
      screenOptions={{
        tabBarActiveTintColor: JourneyPalette.accent,
        tabBarInactiveTintColor: JourneyPalette.mutedStrong,
        tabBarActiveBackgroundColor: JourneyPalette.accentSoft,
        headerShown: false,
        lazy: false,
        freezeOnBlur: false,
        tabBarHideOnKeyboard: true,
        sceneStyle: {
          backgroundColor: JourneyPalette.cardAlt,
        },
        tabBarStyle: {
          height: 88,
          paddingTop: 10,
          paddingBottom: 14,
          paddingHorizontal: 14,
          backgroundColor: JourneyPalette.overlay,
          borderTopWidth: 1,
          borderTopColor: JourneyPalette.line,
          shadowColor: JourneyPalette.shadow,
          shadowOffset: { width: 0, height: -10 },
          shadowOpacity: 0.08,
          shadowRadius: 24,
          elevation: 14,
        },
        tabBarItemStyle: {
          borderRadius: 22,
          marginHorizontal: 4,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '800',
          marginBottom: 3,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '回忆',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="image-filter-hdr" size={size} color={color} />
          ),
          tabBarAccessibilityLabel: 'tab-memories',
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: '地图',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="map-marker-radius-outline" size={size} color={color} />
          ),
          tabBarAccessibilityLabel: 'tab-map',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '我的',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-circle-outline" size={size} color={color} />
          ),
          tabBarAccessibilityLabel: 'tab-profile',
        }}
      />
    </Tabs>
  );
}
