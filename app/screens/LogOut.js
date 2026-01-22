import React from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Modal,
  Image,
} from "react-native";

function LogOut({ visible, onCancel, onConfirm }) {
  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onCancel}
      statusBarTranslucent={true}
    >
      <View style={styles.overlay}>
        <View style={styles.modalBox}>
          {/* Icon */}
          <Image
            source={require("../assets/hand.png")} // <-- your waving hand icon
            style={styles.icon}
          />

          {/* Title */}
          <Text style={styles.title}>Comeback Soon!</Text>
          <Text style={styles.message}>
            Are you sure you want to logout?
          </Text>

          {/* Buttons */}
          <View style={styles.buttons}>
            <TouchableOpacity onPress={onCancel} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onConfirm} style={styles.logoutBtn}>
              <Text style={styles.logoutText}>Yes, Logout.</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)", // dim background
    justifyContent: "center",
    alignItems: "center",
  },
  modalBox: {
    width: "80%",
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    elevation: 10,
  },
  icon: {
    width: 80,
    height: 80,
    marginBottom: 15,
    tintColor: "#125872",
    resizeMode: "contain",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#125872",
    marginBottom: 5,
  },
  message: {
    fontSize: 14,
    color: "#444",
    textAlign: "center",
    marginBottom: 20,
  },
  buttons: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  cancelBtn: {
    flex: 1,
    alignItems: "center",
    padding: 12,
  },
  cancelText: {
    color: "#8E2626",
    fontSize: 16,
    fontWeight: "bold",
  },
  logoutBtn: {
    flex: 1,
    alignItems: "center",
    padding: 12,
    backgroundColor: "#125872",
    borderRadius: 10,
    marginLeft: 10,
  },
  logoutText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
});

export default LogOut;