/**
 * navigation/index.js — Zesto Rider
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator }     from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { useAuth }            from '../services/AuthContext';
import { Colors, Typography } from '../theme';
import { LoadingScreen }      from '../components';

import LoginScreen          from '../screens/LoginScreen';
import HomeScreen           from '../screens/HomeScreen';
import ActiveDeliveryScreen from '../screens/ActiveDeliveryScreen';
import HistoryScreen        from '../screens/HistoryScreen';
import ProfileScreen        from '../screens/ProfileScreen';

const Stack = createStackNavigator();
const Tab   = createBottomTabNavigator();

function TabIcon({ emoji, focused }) {
  return (
    <View style={[tabS.wrap, focused && tabS.wrapActive]}>
      <Text style={[tabS.emoji, focused && tabS.emojiFocused]}>{emoji}</Text>
    </View>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: tabS.bar,
        tabBarActiveTintColor:   Colors.orange,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: tabS.label,
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen}
        options={{ tabBarLabel: 'Orders',  tabBarIcon: ({ focused }) => <TabIcon emoji="📦" focused={focused} /> }} />
      <Tab.Screen name="History" component={HistoryScreen}
        options={{ tabBarLabel: 'History', tabBarIcon: ({ focused }) => <TabIcon emoji="📋" focused={focused} /> }} />
      <Tab.Screen name="Profile" component={ProfileScreen}
        options={{ tabBarLabel: 'Profile', tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} /> }} />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen message="Starting Zesto Rider…" />;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          <>
            <Stack.Screen name="Main"           component={MainTabs} />
            <Stack.Screen name="ActiveDelivery" component={ActiveDeliveryScreen}
              options={{ gestureEnabled: false }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const tabS = StyleSheet.create({
  bar: {
    backgroundColor: Colors.surface,
    borderTopColor: Colors.border,
    borderTopWidth: 1,
    height: 62,
    paddingBottom: 8,
    paddingTop: 6,
  },
  label: { fontSize: Typography.xs, fontWeight: Typography.semibold, marginTop: 1 },
  wrap:       { alignItems: 'center', justifyContent: 'center' },
  wrapActive: {},
  emoji:       { fontSize: 22, opacity: 0.5 },
  emojiFocused:{ opacity: 1 },
});
