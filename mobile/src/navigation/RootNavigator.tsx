import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { MainNavigator } from '@/navigation/MainNavigator';
import type { RootStackParamList } from '@/navigation/types';
import { LoginScreen, RegisterScreen } from '@/screens/auth';
import { WelcomeScreen } from '@/screens/Welcome';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="Main" component={MainNavigator} />
    </Stack.Navigator>
  );
}
