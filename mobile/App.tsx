import { DefaultTheme, NavigationContainer, type Theme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ensureDirs } from "./src/data/fs";
import { useSession } from "./src/data/session";
import { reconcileOnLaunch } from "./src/glasses/trail";
import type { RootStackParamList } from "./src/nav";
import { DriveScreen } from "./src/screens/Drive";
import { GlassesWalkScreen } from "./src/screens/GlassesWalk";
import { HomeScreen } from "./src/screens/Home";
import { ReportDetailScreen } from "./src/screens/ReportDetail";
import { ReportFlowScreen } from "./src/screens/ReportFlow";
import { ReportsListScreen } from "./src/screens/ReportsList";
import { SettingsScreen } from "./src/screens/Settings";
import { SignInScreen } from "./src/screens/SignIn";
import { C } from "./src/theme";

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

const Stack = createNativeStackNavigator<RootStackParamList>();

const theme: Theme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, primary: C.olive600, background: C.field, card: C.field, text: C.ink, border: C.line, notification: C.sevSevere },
};

export default function App() {
  const session = useSession();
  useEffect(() => {
    ensureDirs();
    void reconcileOnLaunch();
    const t = setTimeout(() => void SplashScreen.hideAsync().catch(() => undefined), 150);
    return () => clearTimeout(t);
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {session ? (
        <NavigationContainer theme={theme}>
          <Stack.Navigator
            initialRouteName="Home"
            screenOptions={{
              headerTintColor: C.olive800,
              headerTitleStyle: { color: C.ink, fontWeight: "600" },
              headerStyle: { backgroundColor: C.field },
              headerShadowVisible: false,
              headerBackTitle: "Back",
              contentStyle: { backgroundColor: C.field },
            }}
          >
            <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Report" component={ReportFlowScreen} options={{ title: "Report", headerShown: true, headerBackVisible: true, gestureEnabled: false }} />
            <Stack.Screen name="Drive" component={DriveScreen} options={{ title: "Quest Drive", gestureEnabled: false }} />
            <Stack.Screen name="GlassesWalk" component={GlassesWalkScreen} options={{ title: "Glasses Walk", gestureEnabled: false }} />
            <Stack.Screen name="Reports" component={ReportsListScreen} options={{ title: "Reports" }} />
            <Stack.Screen name="ReportDetail" component={ReportDetailScreen} options={{ title: "Report" }} />
            <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: "Settings" }} />
          </Stack.Navigator>
        </NavigationContainer>
      ) : (
        <SignInScreen />
      )}
    </SafeAreaProvider>
  );
}
