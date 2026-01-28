import React, { useRef, useState } from "react";
import {
  ImageBackground,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Dimensions,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFonts, Poppins_400Regular, Poppins_700Bold } from "@expo-google-fonts/poppins";

const { width } = Dimensions.get("window");

function OnBoarding({ navigation }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef(null);

  const [fontsLoaded] = useFonts({
    'Poppins': Poppins_400Regular,
    'Poppins-Bold': Poppins_700Bold,
  });

  if (!fontsLoaded) {
    return null;
  }

  const handleNext = () => {
    if (currentIndex < slides.length - 1) {
        flatListRef.current.scrollToOffset({
        offset: (currentIndex + 1) * width,
        animated: true,
        });
    } else {
        navigation.replace("SelectRole");
    }
    };


  const handleSkip = () => {
    navigation.replace("SelectRole");
  };

  const renderItem = ({ item }) => (
    <View style={[styles.slide, { width }]}>{item.content}</View>
  );

  return (
    <ImageBackground style={styles.background} source={require("../assets/bg-blue.png")}>
      
      {/* Skip Button → only show if NOT on last slide */}
      {currentIndex < slides.length - 1 && (
        <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={styles.skipText}>Skip</Text>
            <Ionicons
              name="arrow-forward"
              size={20}
              color="#125872"
              style={{ marginLeft: 4 }}
            />
          </View>
        </TouchableOpacity>
      )}

      {/* Slides */}
      <FlatList
        ref={flatListRef}
        data={slides}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / width);
          setCurrentIndex(index);
        }}
        style={{ flex: 1 }}
      />

      {/* Pagination Dots */}
      <View style={styles.paginationContainer}>
        {slides.map((_, index) => (
          <View
            key={index}
            style={index === currentIndex ? styles.activeDot : styles.dot}
          />
        ))}
      </View>

      {/* Next / Get Started Button */}
      <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
        <Text style={styles.nextButtonText}>
          {currentIndex === slides.length - 1 ? "Get Started" : "Next"}
        </Text>
      </TouchableOpacity>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  slide: {
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  contentContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  slideImage: {
    width: 300,
    height: 300,
    resizeMode: "contain",
  },
  contentText: {
    color: "#226B85",
    fontSize: 13,
    fontWeight: "bold",
    textAlign: "center",
    fontFamily: 'Poppins',
  },
  normalText: {
    fontWeight: "normal",
  },
  skipButton: {
    position: "absolute",
    top: 40,
    right: 20,
    zIndex: 10,
  },
  skipText: {
    color: "#226B85",
    fontSize: 16,
    fontWeight: "bold",
    fontFamily: 'Poppins',
    letterSpacing: -0.5,
  },
  paginationContainer: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 20,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#0f232a01",
    borderColor: "#226B85",
    borderWidth: 1,
    marginHorizontal: 4,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#226B85",
    borderColor: "#226B85",
    borderWidth: 1,
    marginHorizontal: 4,
  },
  nextButton: {
    width: "90%",
    backgroundColor: "#226B85",
    paddingVertical: 15,
    borderRadius: 15,
    alignSelf: "center",
    alignItems: "center",
    marginBottom: 30,
  },
  nextButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
    fontFamily: 'Poppins',
  },
});

const slides = [
  {
    id: "1",
    content: (
      <View style={styles.contentContainer}>
        <Image source={require("../assets/First Aid.png")} style={styles.slideImage} />
        <Text style={styles.contentText}>
          Create with care. Refer with confidence. {"\n"}
          <Text style={styles.normalText}>
            Easily generate patient referrals and forward them {"\n"} to the appropriate{" "}
          </Text>
          Animal Bite Center.
        </Text>
      </View>
    ),
  },
  {
    id: "2",
    content: (
      <View style={styles.contentContainer}>
        <Image source={require("../assets/Heartbeat.png")} style={styles.slideImage} />
        <Text style={styles.contentText}>
          Stay informed. Stay organized. {"\n"}
          <Text style={styles.normalText}>Monitor referral statuses, view center responses, and manage patient records — </Text>
          all in one place.
        </Text>
      </View>
    ),
  },
  {
    id: "3",
    content: (
      <View style={styles.contentContainer}>
        <Image source={require("../assets/Nurse.png")} style={styles.slideImage} />
        <Text style={styles.contentText}>
          Know the situation. {"\n"}
          <Text style={styles.normalText}>
            Get updated{" "}</Text>
            rabies statistics and alerts{" "}
            <Text style={styles.normalText}>
            in your community.</Text>
        </Text>
      </View>
    ),
  },
];

export default OnBoarding;
