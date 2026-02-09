import { createNativeStackNavigator } from '@react-navigation/native-stack';

import type { MainStackParamList } from '@/navigation/types';
import { EventDetailScreen } from '@/screens/EventDetailScreen';
import { EventsScreen } from '@/screens/Events';
import { PhotosScreen } from '@/screens/Photos';
import { PhotoViewerScreen } from '@/screens/PhotoViewerScreen';
import { SettingsScreen } from '@/screens/Settings';
import { SlideshowScreen } from '@/screens/SlideshowScreen';

const Stack = createNativeStackNavigator<MainStackParamList>();

export function MainNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Photos" component={PhotosScreen} />
      <Stack.Screen name="Events" component={EventsScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="EventDetail" component={EventDetailScreen} options={{ title: '事件详情' }} />
      <Stack.Screen
        name="PhotoViewer"
        component={PhotoViewerScreen}
        options={{ headerShown: false, presentation: 'fullScreenModal' }}
      />
      <Stack.Screen
        name="Slideshow"
        component={SlideshowScreen}
        options={{ headerShown: false, presentation: 'fullScreenModal' }}
      />
    </Stack.Navigator>
  );
}
