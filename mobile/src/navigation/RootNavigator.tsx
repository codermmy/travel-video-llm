import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { MainNavigator } from '@/navigation/MainNavigator';
import type { RootStackParamList } from '@/navigation/types';
import { WelcomeScreen } from '@/screens/Welcome';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="Main" component={MainNavigator} />
    </Stack.Navigator>
  );
}
