import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { RefreshControl } from 'react-native';

import { databases, appwriteConfig, default as appwriteClient, Query } from './appwriteConfig';

function RabEdAnnouncements({ navigation }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    // Resolve database & collection IDs with safe fallbacks
    const rabedDatabaseId = appwriteConfig.rabedDatabaseId || appwriteConfig.patientDatabaseId;
    let rabedCollectionId = appwriteConfig.rabedCollectionId;
    if (!rabedCollectionId || rabedCollectionId === rabedDatabaseId) {
      rabedCollectionId = 'rabedposts';
    }

    if (!rabedDatabaseId || !rabedCollectionId) {
      setError('RabEd announcements are not configured. Please contact the administrator.');
      setLoading(false);
      return;
    }

    let isMounted = true;

    const fetchPosts = async () => {
      try {
        const res = await databases.listDocuments(
          rabedDatabaseId,
          rabedCollectionId,
          [Query.orderDesc('$createdAt')]
        );
        if (isMounted) setPosts(res.documents || []);
      } catch (err) {
        console.error('Error fetching RabEd announcements:', err);
        if (isMounted) setError('Failed to load RabEd announcements. Please try again later.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchPosts();

    return () => {
      isMounted = false;
    };
  }, []);
  // Fetch posts (used for initial load and refresh)
  const fetchPosts = async (showLoading = true) => {
    const { rabedDatabaseId, rabedCollectionId } = getRabEdIds();
    if (!rabedDatabaseId || !rabedCollectionId) {
      setError('RabEd announcements are not configured. Please contact the administrator.');
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (showLoading) setLoading(true);
    setError(null);
    try {
      if (!showLoading) setRefreshing(true);
      const res = await databases.listDocuments(
        rabedDatabaseId,
        rabedCollectionId,
        [Query.orderDesc('$createdAt')]
      );
      setPosts(res.documents || []);
    } catch (err) {
      console.error('Error fetching RabEd announcements:', err);
      setError('Failed to load RabEd announcements. Please try again later.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const openMedia = async (url) => {
    if (!url) return;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        setError('Cannot open this link on your device.');
      }
    } catch (err) {
      console.error('Error opening media link:', err);
      setError('Failed to open the attached link.');
    }
  };

  const getEmbeddedUrl = (url) => {
    if (!url) return null;

    // Google Drive shared links
    if (url.includes('drive.google.com')) {
      // Pattern: https://drive.google.com/file/d/FILE_ID/view?usp=sharing
      const fileMatch = url.match(/\/file\/d\/([^/]+)/);
      if (fileMatch && fileMatch[1]) {
        return `https://drive.google.com/file/d/${fileMatch[1]}/preview`;
      }

      // Pattern: https://drive.google.com/uc?id=FILE_ID&export=download
      const idMatch = url.match(/[?&]id=([^&]+)/);
      if (idMatch && idMatch[1]) {
        return `https://drive.google.com/file/d/${idMatch[1]}/preview`;
      }
    }

    // For other URLs, just embed the original link
    return url;
  };

  const renderBody = () => {
    if (loading) {
      return (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#125872" />
          <Text style={styles.infoText}>Loading announcements...</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      );
    }

    if (!posts.length) {
      return (
        <View style={styles.centerContent}>
          <Text style={styles.infoText}>No announcements yet from City Health Office.</Text>
        </View>
      );
    }

    return (
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchPosts(false)}
            colors={["#125872"]}
            progressViewOffset={-10}
          />
        }
      >
        {posts.map((post) => (
          <View key={post.$id} style={styles.postCard}>
            <View style={styles.postHeader}>
              <View>
                <Text style={styles.authorText}>CITY HEALTH OFFICE</Text>
                {!!post.createdByRole && (
                  <Text style={styles.roleText}>{post.createdByRole}</Text>
                )}
              </View>
              {post.$createdAt && (
                <Text style={styles.timestampText}>
                  {new Date(post.$createdAt).toLocaleString()}
                </Text>
              )}
            </View>

            {!!post.content && (
              <Text style={styles.contentText}>{post.content}</Text>
            )}

            {!!post.mediaUrl && (
              <View style={styles.mediaContainer}>
                <View style={styles.mediaPreviewWrapper}>
                  <WebView
                    source={{ uri: getEmbeddedUrl(post.mediaUrl) }}
                    style={styles.mediaWebView}
                    startInLoadingState
                  />
                </View>
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.headerContainer}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons
            name="arrow-back-circle-outline"
            size={34}
            color="#FFFFFF"
          />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Rabies Education (RabEd)</Text>
      </View>

      <View style={styles.mainContent}>
        <Text style={styles.subtitle}>
          Recent announcements and education materials from the City Health Office.
        </Text>
        {renderBody()}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#125872',
  },
  headerContainer: {
    height: 70,
    backgroundColor: '#125872',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  backButton: {
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 18,
    color: '#FFFFFF',
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '900',
  },
  mainContent: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 35,
    borderTopRightRadius: 35,
    paddingTop: 16,
    paddingHorizontal: 18,
  },
  subtitle: {
    fontSize: 13,
    color: '#555',
    marginBottom: 12,
    fontFamily: 'Poppins',
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoText: {
    marginTop: 10,
    color: '#125872',
    fontSize: 14,
    textAlign: 'center',
  },
  errorText: {
    color: '#B00020',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  scrollContainer: {
    flex: 1,
    marginTop: 8,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  postCard: {
    backgroundColor: '#F4FAFD',
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E0EEF5',
  },
  postHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  authorText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#125872',
  },
  roleText: {
    fontSize: 11,
    color: '#4A819E',
  },
  timestampText: {
    fontSize: 11,
    color: '#7A8D99',
    textAlign: 'right',
  },
  contentText: {
    fontSize: 13,
    color: '#333333',
    marginTop: 4,
    marginBottom: 6,
  },
  mediaLinkText: {
    fontSize: 13,
    color: '#0F74A7',
    fontWeight: '600',
  },
  mediaContainer: {
    marginTop: 6,
  },
  mediaPreviewWrapper: {
    height: 220,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#E4EEF5',
    marginBottom: 4,
  },
  mediaWebView: {
    flex: 1,
  },
});

export default RabEdAnnouncements;
