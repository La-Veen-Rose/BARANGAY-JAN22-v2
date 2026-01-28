import React, { useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  Dimensions,
  TouchableOpacity,
  Animated,
  PanResponder,
} from "react-native";

import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import LogOut from "./LogOut";
import { account } from "./appwriteConfig";
import { getCurrentStaffProfile, getStaffDisplayName } from './staffProfileService';

import RavenLogo from "../assets/raven-logo-blue.svg";

const { width, height } = Dimensions.get("window");
const PRIMARY = "#125872";

function Sidebar({ closeSidebar, workerProfile: passedWorkerProfile }) {
  const slideAnim = useRef(new Animated.Value(-width * 0.85)).current;
  const navigation = useNavigation();
  const [logoutVisible, setLogoutVisible] = useState(false);
  const [healthWorkerName, setHealthWorkerName] = useState("Loading...");
  const [workerProfile, setWorkerProfile] = useState(passedWorkerProfile || null);

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 260,
      useNativeDriver: true,
    }).start();

    // Fetch logged-in staff profile (BHW or Physician)
    const fetchStaffName = async () => {
      try {
        const { profile, role } = await getCurrentStaffProfile();
        setWorkerProfile(profile);
        const displayName = getStaffDisplayName(profile, role);
        setHealthWorkerName(String(displayName || '').toUpperCase() || (role === 'physician' ? 'PHYSICIAN' : 'HEALTH WORKER'));
      } catch (error) {
        console.error("Error fetching staff name:", error);
        setHealthWorkerName("USER");
      }
    };

    fetchStaffName();
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dx < -10,
      onPanResponderMove: (_, g) => g.dx < 0 && slideAnim.setValue(g.dx),
      onPanResponderRelease: (_, g) => {
        if (g.dx < -width * 0.25) handleClose();
        else
          Animated.spring(slideAnim, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
      },
    })
  ).current;

  const handleClose = () => {
    Animated.timing(slideAnim, {
      toValue: -width * 0.85,
      duration: 220,
      useNativeDriver: true,
    }).start(() => closeSidebar && closeSidebar());
  };

  return (
    <Animated.View
      style={[styles.sidebar, { transform: [{ translateX: slideAnim }] }]}
      {...panResponder.panHandlers}
    >
      {/* HEADER */}
      <View>
        <RavenLogo width={170} height={48} />
        <Text style={styles.logoSub}>
          Rabies Awareness and Vigilance Exposure{`\n`}Network for Tagum City
        </Text>
      </View>

      <Divider />

      {/* WELCOME */}
      <View>
        <Text style={styles.welcomeText}>Welcome,</Text>
        <Text style={styles.userName}>{healthWorkerName}</Text>
        <TouchableOpacity onPress={handleClose}>
          <Text style={styles.back}>Back to Dashboard</Text>
        </TouchableOpacity>
      </View>

      <Divider />

      {/* MENU */}
      <Section title="MENU">
        <MenuItem text="Referral Status Reports" 
          onPress={() => {
            handleClose();
            setTimeout(() => navigation.navigate("NavigationHeader", { screenName: 'REFERRAL_STATUS_REPORTS', workerProfile }), 250);
          }}
        />
        <MenuItem 
          text="Animal Bite Reports" 
          onPress={() => {
            handleClose();
            setTimeout(() => navigation.navigate("AnimalBiteReport"), 250);
          }}
        />
        <MenuItem 
          text="RabEd"
          onPress={() => {
            handleClose();
            setTimeout(() => navigation.navigate("RabEdAnnouncements"), 250);
          }}
        />
        <MenuItem text="My Profile"
          onPress={() => {
            handleClose();
            setTimeout(() => navigation.navigate("MyProfile", { workerProfile }), 250);
          }}
        />
      </Section>

      <Divider />

      <Text style={styles.sectionTitle}>ABTC HOTLINES</Text>


      {/* CITY HEALTH OFFICE */}
      <Text style={styles.choText}>CITY HEALTH OFFICE</Text>
      <View style={styles.contactBox}>
        <ContactRow icon="call" text="0912 293 3955" />
        <ContactRow icon="call" text="0923 345 8555" />
        <ContactRow icon="call-outline" text="084 216 2834" />
        <ContactRow icon="mail" text="chotagumhpo@gmail.com" />
        <ContactRow
          icon="location"
          text="Mabini St., Corner Ernesto Punsalan St., Magugpo South, Tagum City, Philippines"
          address
        />
      </View>

      <Divider />

      {/* ABOUT & LOGOUT */}
      <Text style={styles.sectionTitle}>ABOUT & LOGOUT</Text>
      <MenuItem 
        text="About RAVEN" 
        onPress={() => {
          handleClose();
          setTimeout(() => navigation.navigate("About"), 250);
        }}
      />
      <TouchableOpacity onPress={() => setLogoutVisible(true)}>
        <Text style={[styles.menuText, styles.logout]}>Logout</Text>
      </TouchableOpacity>

      {/* FOOTER */}
      <View style={styles.footerWrap}>
        <Text style={styles.footer}>© 2025 RAVEN. All Rights Reserved.</Text>
      </View>

      <LogOut
        visible={logoutVisible}
        onCancel={() => setLogoutVisible(false)}
        onConfirm={() => {
          setLogoutVisible(false);
          navigation.replace("SelectRole");
        }}
      />
    </Animated.View>
  );
}

/* ---------- COMPONENTS ---------- */

const Divider = () => <View style={styles.divider} />;

const Section = ({ title, children }) => (
  <View>
    <Text style={styles.sectionTitle}>{title}</Text>
    {children}
  </View>
);

const MenuItem = ({ text, onPress }) => (
  <TouchableOpacity onPress={onPress}>
    <Text style={styles.menuText}>{text}</Text>
  </TouchableOpacity>
);

const ContactRow = ({ icon, text, address }) => (
  <View style={styles.contactRow}>
    <Ionicons name={icon} size={14} color="#fff" />
    <Text style={address ? styles.address : styles.contactText}>{text}</Text>
  </View>
);

/* ---------- STYLES ---------- */

const styles = StyleSheet.create({
  sidebar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: width * 0.80,
    backgroundColor: "#fff",
    paddingHorizontal: 18,
    paddingTop: 50,
    paddingBottom: 10,
    borderTopRightRadius: 35,
    elevation: 1000,
    zIndex: 1000,
    display: 'flex',
    flexDirection: 'column',
  },

  logoSub: {
    fontSize: 11,
    fontWeight: "700",
    color: PRIMARY,
    marginTop: 6,
    fontFamily: 'Poppins',
    lineHeight: 12,
    letterSpacing: -0.3,
  },

  divider: {
    height: 1,
    backgroundColor: "#d0d0d0",
    marginVertical: 6,
  },

  welcomeText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#444",
    fontFamily: 'Poppins',
    letterSpacing: -0.3,
  },
  userName: {
    fontSize: 22,
    fontWeight: "bold",
    color: PRIMARY,
    fontFamily: 'Poppins',
    marginTop: 0,
    marginBottom: 6,
    letterSpacing: -1,
  },

  back: {
    marginTop: 0,
    fontSize: 13,
    fontWeight: "500",
    color: PRIMARY,
    fontFamily: 'Poppins',
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "500",
    color: "#333",
    fontFamily: 'Poppins',
    marginBottom: 4,
  },

  choText: {
    fontSize: 18,
    fontWeight: '800',
    color: "#125872",
    marginBottom: 8,
    marginTop: 0,
    letterSpacing: -0.7,
    fontFamily: 'Poppins',
  },

  menuText: {
    fontSize: 16,
    fontWeight: "700",
    color: PRIMARY,
    marginVertical: 2,
    letterSpacing: -0.4,
    fontFamily: 'Poppins',
  },

  contactBox: {
    backgroundColor: PRIMARY,
    padding: 12,
    borderRadius: 8,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  contactText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 10,
    lineHeight: 16,
    fontFamily: 'Poppins',
  },
  address: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "500",
    marginLeft: 10,
    lineHeight: 15,
    fontFamily: 'Poppins',
  },

  logout: {
    color: PRIMARY,
    fontWeight: "800",
    marginTop: 2,
    fontFamily: 'Poppins',
  },

  footerWrap: {
    marginTop: 50,
    paddingBottom: 0,
  },
  footer: {
    fontSize: 10,
    fontWeight: "600",
    color: "#777",
    textAlign: "center",
    fontFamily: 'Poppins',
  },
});

export default Sidebar;
