import { useState, useEffect } from 'react';
import {
    ImageBackground,
    StyleSheet,
    Text,
    View,
    TextInput,
    TouchableOpacity,
    Image,
    Dimensions, 
    Platform, // Still needed for Android checks
} from "react-native";


import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';

import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar'; 
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { navigationRef } from './app/navigation/RootNavigation';
import { registerForPushNotificationsAsync, savePushTokenForCurrentUser } from './app/notifications/notificationService';

// Global notification display behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// --- Screen Imports ---
import WelcomeScreen from './app/screens/WelcomeScreen'; 
import OnBoarding from './app/screens/OnBoarding';
//import OnBoarding1 from './app/screens/OnBoarding1';
//import OnBoarding2 from './app/screens/OnBoarding2';
import GetStarted from './app/screens/GetStarted';
import LogIn from './app/screens/LogIn';
import MainDashboard from './app/screens/MainDashboard';
import Sidebar from './app/screens/Sidebar';
import Forms from './app/screens/Forms';
import About from './app/screens/About';
import SuccessScreen from './app/screens/Section7';
import PatientForm from './app/screens/PatientForm';
import MyProfile from './app/screens/MyProfile';
import AnimalBiteReports from './app/screens/AnimalBiteReports';
import AnimalBiteReport from './app/screens/AnimalBiteReport';
import PatientRecord from './app/screens/PatientRecord';
import NavigationHeader from './app/screens/NavigationHeader';
import RabEdAnnouncements from './app/screens/RabEdAnnouncements';
// --- End Screen Imports ---


const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// ====================================================================
// 1. BOTTOM TABS COMPONENT
// ====================================================================
function BottomTabs() {
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const navigation = useNavigation();

  return (
    <View style={{ flex: 1 }}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused }) => {
            let iconName;
            if (route.name === "Home") iconName = "home";
            else if (route.name === "Forms") iconName = "document-text";

            return (
              <View style={[
                styles.tabButton,
                focused ? styles.tabButtonActive : styles.tabButtonInactive
              ]}>
                <Ionicons 
                  name={iconName} 
                  size={26} 
                  color={focused ? "#FFFFFF" : "#0F74A7"} 
                />
                <Text style={[
                  styles.tabLabel,
                  { color: focused ? "#FFFFFF" : "#0F74A7" }
                ]}>
                  {route.name}
                </Text>
              </View>
            );
          },
          tabBarShowLabel: false,
          tabBarItemStyle: {
            flex: 1,
            marginHorizontal: 15,
          },
          tabBarStyle: route.name === "Forms" ? { display: 'none' } : {
            height: 100,
            paddingTop: 20,
            paddingBottom: 25,
            paddingHorizontal: 10,
            backgroundColor: "transparent",
            position: "absolute",
            borderTopWidth: 0,
            elevation: 0,
            shadowOpacity: 0,
            zIndex: 3,
            justifyContent: 'center',
          },
          headerShown: false,
        })}
      >

        <Tab.Screen name="Home">
          {(props) => (
            <MainDashboard {...props} openSidebar={() => setSidebarVisible(true)} />
          )}
        </Tab.Screen>

        <Tab.Screen name="Forms">
          {(props) => (
            <Forms {...props} openSidebar={() => setSidebarVisible(true)} />
          )}
        </Tab.Screen>

      </Tab.Navigator>

      {/* SIDEBAR OVERLAY */}
      {sidebarVisible && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 999, 
            elevation: 999,
          }}
        >
          {/* Overlay */}
          <TouchableOpacity
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.5)",
              zIndex: 999,
            }}
            activeOpacity={1}
            onPress={() => setSidebarVisible(false)}
          />

          {/* Sidebar */}
          <Sidebar
            closeSidebar={() => setSidebarVisible(false)}
            navigation={navigation}
          />
        </View>
      )}
    </View>
  );
}

// ====================================================================
// 2. STACK NAVIGATOR COMPONENT
// ====================================================================
function AppStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="OnBoarding" component={OnBoarding} />
      {/* <Stack.Screen name="OnBoarding1" component={OnBoarding1} />
      <Stack.Screen name="OnBoarding2" component={OnBoarding2} />*/}
      <Stack.Screen name="GetStarted" component={GetStarted} />
      <Stack.Screen name="LogIn" component={LogIn} />
      <Stack.Screen name="Main" component={BottomTabs} />
      {/* alias so existing calls to 'MainDashboard' succeed */}
      <Stack.Screen name="MainDashboard" component={BottomTabs} />
      <Stack.Screen name="SuccessScreen" component={SuccessScreen} />
      <Stack.Screen name="PatientForm" component={PatientForm} />
      <Stack.Screen name="MyProfile" component={MyProfile} />
      <Stack.Screen name="AnimalBiteReports" component={AnimalBiteReports} />
      <Stack.Screen name="PatientRecord" component={PatientRecord} />
      <Stack.Screen name="AnimalBiteReport" component={AnimalBiteReport} />
      <Stack.Screen name="NavigationHeader" component={NavigationHeader} />
      <Stack.Screen name="RabEdAnnouncements" component={RabEdAnnouncements} />
          <Stack.Screen name="About" component={About} />

    </Stack.Navigator>
  )
}

// ====================================================================
// 3. MAIN APP COMPONENT (Immersive Mode Logic)
// ====================================================================
export default function App() {
  useEffect(() => {
    const setImmersiveMode = async () => {
      if (Platform.OS === 'android') {
        try {
          // Hide Navigation Bar (bottom bar)
          await NavigationBar.setVisibilityAsync("hidden");

          // NOTE: Calling NavigationBar.setBehaviorAsync can trigger a warning
          // when edge-to-edge is enabled on some devices/Android versions.
          // To avoid the runtime warning, we are intentionally NOT setting
          // the navigation bar behavior here. If you need a specific
          // behavior, test the desired value on target devices and re-add
          // the call guarded by a device/OS check.
          // await NavigationBar.setBehaviorAsync("overlay-swipe");
        }
        catch (error) {
          console.error("Error setting navigation bar immersive mode:", error);
        }
      }
    };

    // Android navigation bar immersive mode
    setImmersiveMode();

    // Register for push notifications and store token in Appwrite
    (async () => {
      const expoToken = await registerForPushNotificationsAsync();
      if (expoToken) {
        await savePushTokenForCurrentUser(expoToken);
      }
    })();

    // Listen for notification taps to navigate appropriately
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response?.notification?.request?.content?.data || {};
        const type = data.type;

        if (!navigationRef.isReady()) {
          return;
        }

        if (type === 'patient_verified') {
          navigationRef.navigate('NavigationHeader', {
            screenName: 'SUBMITTED_CASES',
            focusStatus: 'Verified',
            recordId: data.recordId || null,
          });
        } else if (type === 'rabed_announcement') {
          navigationRef.navigate('RabEdAnnouncements');
        }
      }
    );

    return () => {
      responseSubscription?.remove();
    };
  }, []);

  return (
  <>
    {/* Status Bar (Top Bar) is hidden statically for the entire app life */}
    <StatusBar hidden={true} />
    
    <SafeAreaProvider>
      <NavigationContainer ref={navigationRef}>
        <AppStack />
      </NavigationContainer>
    </SafeAreaProvider>
  </>
  );
}

// ====================================================================
// 4. STYLES
// ====================================================================
const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  tabButton: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 15,
    minWidth: 170,
    height: 65,
    gap: 5,
    marginHorizontal: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  tabButtonActive: {
    backgroundColor: '#0F74A7',
  },
  tabButtonInactive: {
    backgroundColor: '#FFFFFF',
  },
  tabLabel: {
    fontSize: 15,
    letterSpacing: -0.5,
    fontWeight: '700',
    marginTop: 0,
  },
});