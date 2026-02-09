import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Image,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';

import { databases, appwriteConfig, storage, Query } from './appwriteConfig';
import { useTheme } from '../../theme';

const getRabEdIds = () => {
  const rabedDatabaseId = appwriteConfig.rabedDatabaseId || appwriteConfig.patientDatabaseId;
  let rabedCollectionId = appwriteConfig.rabedCollectionId;

  if (!rabedCollectionId || rabedCollectionId === rabedDatabaseId) {
    rabedCollectionId = 'rabedposts';
  }

  return { rabedDatabaseId, rabedCollectionId };
};

const getMediaType = (url, mediaType) => {
  if (mediaType) {
    const normalized = String(mediaType).toLowerCase();
    if (normalized.includes('pdf')) return 'pdf';
    if (normalized.includes('image')) return 'image';
  }

  if (!url) return 'unknown';
  const lowerUrl = url.toLowerCase();
  const cleanUrl = lowerUrl.split('?')[0];
  const decodedUrl = decodeURIComponent(lowerUrl);

  if (cleanUrl.endsWith('.pdf') || decodedUrl.includes('.pdf')) return 'pdf';
  if (cleanUrl.endsWith('.png') || decodedUrl.includes('.png')) return 'image';
  if (cleanUrl.endsWith('.jpg') || cleanUrl.endsWith('.jpeg') || decodedUrl.includes('.jpg') || decodedUrl.includes('.jpeg')) {
    return 'image';
  }

  if (lowerUrl.includes('drive.google.com') && decodedUrl.includes('pdf')) return 'pdf';

  return 'unknown';
};

const getFileName = (url, explicitName) => {
  if (explicitName) return explicitName;
  if (!url) return 'attachment';
  const cleanUrl = url.split('?')[0];
  const parts = cleanUrl.split('/');
  return parts[parts.length - 1] || 'attachment';
};

const getStorageIdsFromUrl = (url) => {
  if (!url) return null;
  const match = url.match(/storage\/buckets\/([^/]+)\/files\/([^/]+)/i);
  if (!match) return null;
  return { bucketId: match[1], fileId: match[2] };
};

const getViewUrl = (url) => {
  if (!url) return url;
  if (url.includes('/view')) return url;
  return url.replace('/download', '/view');
};

const getDownloadUrl = (url) => {
  if (!url) return url;
  if (url.includes('/download')) return url;
  return url.replace('/view', '/download');
};

const REQUEST_TIMEOUT_MS = 6000;

const withTimeout = (promise, timeoutMs = REQUEST_TIMEOUT_MS) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Request timed out')), timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });

const learnSections = [
  {
    id: 'risk',
    title: 'Sinu-sino ang pinaka nanganganib sa rabies?',
    summary:
      'Pinakamataas ang panganib para sa mga nag-aalaga ng aso o pusa, mga bata, at sinumang nagbabantay o gumagamot ng alagang hayop.',
    bullets: [
      { icon: 'paw-outline', text: 'Mga nag-aalaga ng aso o pusa.' },
      { icon: 'happy-outline', text: 'Mga bata—mas madalas makipaglaro at maaaring di agad magsabi kapag nakagat o nakalmot.' },
      { icon: 'medical-outline', text: 'Mga gumagamot, nagbabantay, o tagapagpakain ng aso o pusa.' },
    ],
  },
  {
    id: 'what',
    title: 'Ano ang rabies?',
    summary:
      'Viral na sakit na naipapasa sa laway ng hayop (kagat, kalmot, o pagdila sa sugat) at nakamamatay kapag hindi agad naagapan.',
    bullets: [
      { icon: 'alert-circle-outline', text: 'Naisasalin sa tao mula sa pagdila, kalmot, o kagat ng aso o pusa.' },
      { icon: 'warning-outline', text: 'Walang epekto ang bawang, suka, o iba pang home remedy—kailangang magpabakuna.' },
    ],
    notes: [
      {
        title: 'Nalilipat ang rabies sa laway',
        text: 'Maaaring mahawa mula sa kagat, pagkalmot, o pagdila sa bukas na sugat. Karaniwang sintomas: pangangati o hapdi sa sugat, lagnat, at kalaunan pagbabago sa pag-uugali.',
      },
      {
        title: 'Sintomas ng rabies',
        text: 'Pagkalito at hallucinations, takot sa tubig, sobrang paglalaway, hirap matulog, pagiging agresibo o balisa.',
      },
      {
        title: 'Epekto kung hindi maagapan',
        text: 'Trauma mula sa kagat o kalmot, pagliban sa trabaho dahil sa pagka-ospital, karagdagang gastos sa gamutan, at mataas na panganib ng pagkamatay.',
      },
    ],
  },
  {
    id: 'know',
    title: 'Alam nʼyo ba?',
    summary: 'Mahigit 99% ng kaso ng rabies sa tao ay mula sa aso. Maaaring ma-expose kahit sa maliit na sugat o gasgas.',
    notes: [
      {
        title: 'Hindi agad lumilitaw ang sintomas',
        text: 'Maaaring lumabas ang sintomas pagkalipas ng ilang linggo o buwan pagkatapos makagat. Kapag lumitaw na, ilang araw na lang ang natitira kung walang lunas.',
      },
      {
        title: 'Mas malaki ang panganib sa bata',
        text: '40% ng mga nakagat ay edad 15 pababa. Mas malubha ang epekto dahil maliit pa ang katawan, madalas makipaglaro sa hayop, at minsan ay nahihiyang magsabi sa magulang.',
      },
    ],
  },
  {
    id: 'protect',
    title: 'Mga pangunahing paalala para makaiwas',
    summary: 'Protektahan ang sarili at alaga upang mapigil ang pagkalat ng rabies.',
    bullets: [
      { icon: 'shield-checkmark-outline', text: 'Magpabakuna laban sa rabies kung napag-utusan ng doktor.' },
      { icon: 'bandage-outline', text: 'Hugasan agad ang sugat ng tumatakbong tubig at sabon nang hindi bababa sa 15 minuto.' },
      { icon: 'medkit-outline', text: 'Magpatingin agad sa doktor o ABTC para sa bakuna at immunoglobulin kung kailangan.' },
      { icon: 'paw-outline', text: 'Pabakunahan taun-taon ang mga alagang aso o pusa.' },
      { icon: 'alert-outline', text: 'Iwasang gumala o makipaglaro sa mga asong di kilala lalo na sa mga bata.' },
      { icon: 'restaurant-outline', text: 'Iwasang kumain ng karne ng aso; agad kumonsulta kung nagawa na.' },
    ],
  },
];

const citations = [
  'Rabies, a World Health Organization-Coordinated Implications on Rabies. WHO Regional Office for South–East Asia, 2013.',
  'National Rabies Prevention Program Manual of Operations. Department of Health, Manila, Philippines, 2012.',
  'Antirabies Immunization Practice Human Rabies Prevention. Centers for Disease Control and Prevention, USA 2008.',
  'Expert Consultation on Rabies, Second Report. World Health Organization, 2013.',
  'Anti-Rabies Vaccines Can Now Be Availed For Free in ABTCs Nationwide, Says DOH. Kicker Daily News, 2016.',
];

export default function RabEd({ navigation }) {
  const { palette } = useTheme();

  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [openLearnId, setOpenLearnId] = useState('what');

  const fetchPosts = async (showLoading = true) => {
    const { rabedDatabaseId, rabedCollectionId } = getRabEdIds();

    if (!rabedDatabaseId || !rabedCollectionId) {
      setError('RabEd announcements are not configured. Please contact the administrator.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (showLoading) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    setError(null);

    try {
      const res = await withTimeout(
        databases.listDocuments(rabedDatabaseId, rabedCollectionId, [Query.orderDesc('$createdAt')])
      );
      const docs = res.documents || [];
      const enriched = await Promise.all(
        docs.map(async (doc) => {
          if (!doc.mediaUrl) return doc;

          const hasType = !!(doc.mediaType || doc.type || doc.mimeType || doc.fileType);
          const hasName = !!(doc.mediaName || doc.fileName || doc.name || doc.filename);
          if (hasType && hasName) return doc;

          const ids = getStorageIdsFromUrl(doc.mediaUrl);
          if (!ids) return doc;

          try {
            const file = await withTimeout(storage.getFile(ids.bucketId, ids.fileId));
            return {
              ...doc,
              resolvedMediaType: file?.mimeType || file?.type,
              resolvedFileName: file?.name,
            };
          } catch (err) {
            return doc;
          }
        })
      );
      setPosts(enriched);
    } catch (err) {
      console.error('Error fetching RabEd announcements:', err);
      setError('Failed to load RabEd announcements. Please try again later.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchPosts(true);
  }, []);

  const openExternal = async (url) => {
    if (!url) return;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        console.warn('No handler for URL:', url);
      }
    } catch (err) {
      console.error('Failed to open URL:', err);
    }
  };

  const getEmbeddedUrl = (url) => {
    if (!url) return null;

    if (url.includes('drive.google.com')) {
      const fileMatch = url.match(/\/file\/d\/([^/]+)/);
      if (fileMatch && fileMatch[1]) {
        return `https://drive.google.com/file/d/${fileMatch[1]}/preview`;
      }

      const idMatch = url.match(/[?&]id=([^&]+)/);
      if (idMatch && idMatch[1]) {
        return `https://drive.google.com/file/d/${idMatch[1]}/preview`;
      }
    }

    return url;
  };

  const promptPdfActions = (url) => {
    if (!url) return;
    Alert.alert('PDF Attachment', 'Choose an action', [
      { text: 'View', onPress: () => openExternal(getViewUrl(url)) },
      { text: 'Download', onPress: () => openExternal(getDownloadUrl(url)) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const renderLearn = () => (
    <View style={[styles.panel, { backgroundColor: palette.card, borderColor: palette.border }]}>
      <View style={styles.panelHeader}>
        <View>
          <Text style={[styles.panelLabel, { color: palette.subtext }]}>Rabies 101</Text>
          <Text style={[styles.panelTitle, { color: palette.text }]}>Mga pangunahing aralin</Text>
        </View>
        <Ionicons name="school-outline" size={22} color={palette.primary} />
      </View>

      {learnSections.map((section) => {
        const expanded = openLearnId === section.id;

        return (
          <View key={section.id} style={[styles.accordion, { borderColor: palette.border }]}>
            <TouchableOpacity
              style={styles.accordionHeader}
              activeOpacity={0.9}
              onPress={() => setOpenLearnId(expanded ? null : section.id)}
            >
              <View style={styles.accordionTitleWrap}>
                <Ionicons
                  name={section.icon || 'information-circle-outline'}
                  size={18}
                  color={palette.primary}
                />
                <Text style={[styles.accordionTitle, { color: palette.text }]}>{section.title}</Text>
              </View>
              <Ionicons
                name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'}
                size={18}
                color={palette.subtext}
              />
            </TouchableOpacity>

            {expanded && (
              <View style={styles.accordionBody}>
                {!!section.summary && (
                  <Text style={[styles.accordionSummary, { color: palette.text }]}>{section.summary}</Text>
                )}

                {section.bullets?.map((item, index) => (
                  <View key={index} style={[styles.bulletRow, { borderColor: palette.border }]}> 
                    <Ionicons name={item.icon || 'ellipse-outline'} size={16} color={palette.primary} />
                    <Text style={[styles.bulletText, { color: palette.text }]}>{item.text}</Text>
                  </View>
                ))}

                {section.notes?.map((note, index) => (
                  <View
                    key={index}
                    style={[styles.noteCard, { backgroundColor: palette.background, borderColor: palette.border }]}
                  >
                    <View style={styles.noteHeader}>
                      <Ionicons name="warning-outline" size={16} color={palette.primary} />
                      <Text style={[styles.noteTitle, { color: palette.text }]}>{note.title}</Text>
                    </View>
                    <Text style={[styles.noteBody, { color: palette.subtext }]}>{note.text}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}

      <View style={[styles.calloutBox, { backgroundColor: palette.background, borderColor: palette.border }]}>
        <Ionicons name="megaphone-outline" size={16} color={palette.primary} />
        <Text style={[styles.calloutText, { color: palette.text }]}>
          Maaaring ikaw ang susunod. Mag-ingat sa kagat at kalmot, at kumonsulta agad sa doktor o ABTC.
        </Text>
      </View>
    </View>
  );

  const renderAnnouncements = () => {
    if (loading) {
      return (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={palette.primary} />
          <Text style={[styles.infoText, { color: palette.primary }]}>Loading announcements...</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={[styles.panel, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <View style={styles.panelHeader}>
            <Text style={[styles.panelTitle, { color: palette.text }]}>Announcements</Text>
            <Ionicons name="alert-circle-outline" size={20} color={palette.primary} />
          </View>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: palette.primary }]}
            onPress={() => fetchPosts(true)}
          >
            <Text style={[styles.retryText, { color: palette.buttonText }]}>Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={[styles.panel, { backgroundColor: palette.card, borderColor: palette.border }]}>
        <View style={styles.panelHeader}>
          <View>
            <Text style={[styles.panelLabel, { color: palette.subtext }]}>City Health Office</Text>
            <Text style={[styles.panelTitle, { color: palette.text }]}>Latest announcements</Text>
          </View>
          <Ionicons name="notifications-outline" size={22} color={palette.primary} />
        </View>

        {!posts.length ? (
          <Text style={[styles.infoText, { color: palette.subtext }]}>No announcements yet from City Health Office.</Text>
        ) : (
          posts.map((post) => (
            <View
              key={post.$id}
              style={[styles.postCard, { backgroundColor: palette.card, borderColor: palette.border }]}
            >
              <View style={styles.postHeader}>
                <View>
                  <Text style={[styles.authorText, { color: palette.primary }]}>CITY HEALTH OFFICE</Text>
                  {!!post.createdByRole && (
                    <Text style={[styles.roleText, { color: palette.subtext }]}>{post.createdByRole}</Text>
                  )}
                </View>
                {post.$createdAt && (
                  <Text style={[styles.timestampText, { color: palette.subtext }]}>
                    {new Date(post.$createdAt).toLocaleString()}
                  </Text>
                )}
              </View>

              {!!post.content && (
                <Text style={[styles.contentText, { color: palette.text }]}>{post.content}</Text>
              )}

              {!!post.mediaUrl && (
                <View style={styles.mediaContainer}>
                  {getMediaType(
                    post.mediaUrl,
                    post.mediaType || post.type || post.mimeType || post.fileType || post.resolvedMediaType
                  ) === 'image' ? (
                    <View style={styles.mediaPreviewWrapper}>
                      <Image
                        source={{ uri: post.mediaUrl }}
                        style={styles.mediaImage}
                        resizeMode="cover"
                      />
                    </View>
                  ) : getMediaType(
                    post.mediaUrl,
                    post.mediaType || post.type || post.mimeType || post.fileType || post.resolvedMediaType
                  ) === 'pdf' ? (
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => promptPdfActions(post.mediaUrl)}
                    >
                      <View style={styles.pdfCard}>
                        <View style={styles.pdfHeader}>
                          <View style={styles.pdfIconWrap}>
                            <Ionicons name="document-text" size={18} color="#B71C1C" />
                          </View>
                          <Text style={styles.pdfTitle} numberOfLines={1}>
                            {getFileName(
                              post.mediaUrl,
                              post.mediaName || post.fileName || post.name || post.filename || post.resolvedFileName
                            )}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.mediaPreviewWrapper}>
                      <WebView
                        source={{ uri: getEmbeddedUrl(post.mediaUrl) }}
                        style={styles.mediaWebView}
                        startInLoadingState
                      />
                    </View>
                  )}
                </View>
              )}
            </View>
          ))
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.primary }]}>
      <View style={[styles.headerContainer, { backgroundColor: palette.primary }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back-circle-outline" size={34} color={palette.buttonText} />
        </TouchableOpacity>

        <Text style={[styles.headerTitle, { color: palette.buttonText }]}>Rabies Education (RabEd)</Text>
      </View>

      <ScrollView
        style={[styles.pageScroll, { backgroundColor: palette.background }]}
        contentContainerStyle={[styles.pageContent, { backgroundColor: palette.background }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => fetchPosts(false)} colors={[palette.primary]} />
        }
      >
        <Text style={[styles.subtitle, { color: palette.subtext }]}>
          Mga nakahandang aralin at pinakabagong anunsyo mula sa City Health Office sa iisang screen.
        </Text>

        {renderLearn()}
        {renderAnnouncements()}

        <View style={[styles.panel, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <View style={styles.panelHeader}>
            <Text style={[styles.panelTitle, { color: palette.text }]}>Citations</Text>
            <Ionicons name="book-outline" size={20} color={palette.primary} />
          </View>
          {citations.map((item, idx) => (
            <Text key={idx} style={[styles.citationText, { color: palette.subtext }]}>{`${idx + 1}. ${item}`}</Text>
          ))}
          <Text style={[styles.calloutText, { color: palette.text, marginTop: 10 }]}>For further information, please consult your doctor.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  headerContainer: {
    height: 70,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  backButton: {
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '900',
  },
  pageScroll: {
    flex: 1,
    borderTopLeftRadius: 35,
    borderTopRightRadius: 35,
    backgroundColor: 'transparent',
  },
  pageContent: {
    paddingTop: 16,
    paddingHorizontal: 18,
    paddingBottom: 26,
    backgroundColor: 'transparent',
  },
  subtitle: {
    fontSize: 13,
    marginBottom: 12,
    fontFamily: 'Poppins',
  },
  panel: {
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
  },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  panelLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  accordion: {
    borderWidth: 1,
    borderRadius: 12,
    marginTop: 8,
    overflow: 'hidden',
  },
  accordionHeader: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  accordionTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  accordionTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 8,
  },
  accordionBody: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  accordionSummary: {
    fontSize: 13,
    lineHeight: 18,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
    marginTop: 6,
  },
  bulletText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  noteCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginTop: 6,
  },
  noteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  noteTitle: {
    fontSize: 13,
    fontWeight: '800',
    marginLeft: 6,
  },
  noteBody: {
    fontSize: 13,
    lineHeight: 18,
  },
  calloutBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
  calloutText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    marginLeft: 10,
  },
  loadingWrap: {
    paddingVertical: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoText: {
    marginTop: 8,
    fontSize: 14,
    textAlign: 'center',
  },
  errorText: {
    color: '#B00020',
    fontSize: 14,
    textAlign: 'left',
    paddingVertical: 6,
  },
  retryButton: {
    marginTop: 8,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  retryText: {
    fontSize: 14,
    fontWeight: '700',
  },
  postCard: {
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
  },
  postHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  authorText: {
    fontSize: 14,
    fontWeight: '700',
  },
  roleText: {
    fontSize: 11,
  },
  timestampText: {
    fontSize: 11,
    textAlign: 'right',
  },
  contentText: {
    fontSize: 13,
    marginTop: 4,
    marginBottom: 6,
    lineHeight: 18,
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
  mediaImage: {
    width: '100%',
    height: '100%',
  },
  pdfCard: {
    borderWidth: 1,
    borderColor: '#D32F2F',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#FDECEC',
  },
  pdfHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pdfIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#F8D7DA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pdfTitle: {
    marginLeft: 10,
    fontSize: 13,
    fontWeight: '700',
    color: '#B71C1C',
    flex: 1,
  },
  citationText: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 6,
  },
});
