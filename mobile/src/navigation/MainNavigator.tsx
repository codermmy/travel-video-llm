import { createNativeStackNavigator } from '@react-navigation/native-stack';

import type { MainStackParamList } from '@/navigation/types';
import { EventsScreen } from '@/screens/Events';
import { PhotosScreen } from '@/screens/Photos';
import { SettingsScreen } from '@/screens/Settings';

const Stack = createNativeStackNavigator<MainStackParamList>();

export function MainNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Photos" component={PhotosScreen} />
      <Stack.Screen name="Events" component={EventsScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
    </Stack.Navigator>
  );
}
