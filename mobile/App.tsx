import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { DefaultTheme, getFocusedRouteNameFromRoute, NavigationContainer, type Theme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ensureDirs } from "./src/data/fs";
import { useSession } from "./src/data/session";
import { startSync } from "./src/data/sync";
import { reconcileOnLaunch } from "./src/glasses/trail";
import type { RootStackParamList, RootTabParamList } from "./src/nav";
import { DriveScreen } from "./src/screens/Drive";
import { GlassesWalkScreen } from "./src/screens/GlassesWalk";
import { HomeScreen } from "./src/screens/Home";
import { MapScreen } from "./src/screens/MapScreen";
import { ReportDetailScreen } from "./src/screens/ReportDetail";
import { ReportFlowScreen } from "./src/screens/ReportFlow";
import { ReportsListScreen } from "./src/screens/ReportsList";
import { SettingsScreen } from "./src/screens/Settings";
import { SignInScreen } from "./src/screens/SignIn";
import { C } from "./src/theme";

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<RootTabParamList>();

const theme: Theme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, primary: C.olive600, background: C.field, card: C.field, text: C.ink, border: C.line, notification: C.sevSevere },
};

function QuestStack() {
  return (
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
  );
}

/** The capture flows own the whole screen; the tab bar would fight the shutter. */
const IMMERSIVE = new Set(["Report", "Drive", "GlassesWalk"]);

export default function App() {
  const session = useSession();
  useEffect(() => {
    ensureDirs();
    void reconcileOnLaunch();
    startSync();
    const t = setTimeout(() => void SplashScreen.hideAsync().catch(() => undefined), 150);
    return () => clearTimeout(t);
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {session ? (
        <NavigationContainer theme={theme}>
          <Tab.Navigator
            screenOptions={{
              headerShown: false,
              tabBarActiveTintColor: C.olive800,
              tabBarInactiveTintColor: C.inkMute,
              tabBarStyle: { backgroundColor: C.field, borderTopColor: C.line },
            }}
          >
            <Tab.Screen
              name="QuestTab"
              component={QuestStack}
              options={({ route }) => {
                const focused = getFocusedRouteNameFromRoute(route) ?? "Home";
                return {
                  title: "Quest",
                  tabBarIcon: ({ color, size }) => <Ionicons name="camera-outline" color={color} size={size} />,
                  tabBarStyle: IMMERSIVE.has(focused)
                    ? { display: "none" }
                    : { backgroundColor: C.field, borderTopColor: C.line },
                };
              }}
            />
            <Tab.Screen
              name="MapTab"
              component={MapScreen}
              options={{
                title: "Map",
                headerShown: true,
                headerTitle: "The shared map",
                headerTitleStyle: { color: C.ink, fontWeight: "600" },
                headerStyle: { backgroundColor: C.field, shadowColor: "transparent", elevation: 0 },
                tabBarIcon: ({ color, size }) => <Ionicons name="map-outline" color={color} size={size} />,
              }}
            />
          </Tab.Navigator>
        </NavigationContainer>
      ) : (
        <SignInScreen />
      )}
    </SafeAreaProvider>
  );
}
