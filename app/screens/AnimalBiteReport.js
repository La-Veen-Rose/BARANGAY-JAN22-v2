import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Path, G } from 'react-native-svg';
import RavenLogo from '../assets/raven-logo-blue.svg';
import Statistics from '../assets/Statistics.svg';
import { fetchAnimalBiteReportData } from './reportAnalyticsService';

const SCREEN_WIDTH = Dimensions.get('window').width;

/* ================= HELPER FUNCTIONS ================= */

const polarToCartesian = (cx, cy, r, angle) => {
  const rad = ((angle - 90) * Math.PI) / 180.0;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
};

const describeArc = (cx, cy, r, startAngle, endAngle) => {
  // Handle full circle (360 degrees) - can't be drawn as a single arc
  if (Math.abs(endAngle - startAngle) >= 359.99) {
    return null; // Will use Circle component instead
  }

  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

  return `
    M ${cx} ${cy}
    L ${start.x} ${start.y}
    A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}
    Z
  `;
};

/* ================= COMPONENT ================= */

export default function AnimalBiteReport({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState({
    reportLocation: { city: 'Loading...', region: 'Loading...' },
    monthlyCaseSummary: { totalCases: 0, trendFromLastMonth: 0 },
    vaccinationProgress: [],
    animalBiteSources: [],
    annualBiteSummary: { totalReports: 0, annualTrend: 0 },
    exposureCategoryStats: [],
    monthlyCases: [],
    agePopulationStats: [],
    totalRecordsCount: 0
  });

  useEffect(() => {
    loadReportData();
  }, []);

  const loadReportData = async () => {
    try {
      setLoading(true);
      console.log('🔄 Loading animal bite report data...');
      const data = await fetchAnimalBiteReportData();
      console.log('✅ Report data loaded:', {
        totalRecords: data.totalRecordsCount,
        monthlyCases: data.monthlyCaseSummary.totalCases,
        annualReports: data.annualBiteSummary.totalReports,
        location: data.reportLocation
      });
      setReportData(data);
    } catch (error) {
      console.error('❌ Error loading report data:', error);
      Alert.alert('Error', 'Failed to load report data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const {
    reportLocation,
    monthlyCaseSummary,
    vaccinationProgress,
    animalBiteSources,
    annualBiteSummary,
    exposureCategoryStats,
    monthlyCases,
    agePopulationStats
  } = reportData;

  if (loading) {
    return (
      <View style={styles.container}>
        <Image
          source={require('../assets/bg-blue.png')}
          style={styles.backgroundImage}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#125872" />
          <Text style={styles.loadingText}>Loading report data...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>

      {/* FIXED BACKGROUND */}
      <Image
        source={require('../assets/bg-blue.png')}
        style={styles.backgroundImage}
      />

      {/* ================= HEADER (FIXED) ================= */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back-circle-outline" size={32} color="#125872" />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <RavenLogo width={130} height={48} />
          <Text style={styles.headerTitle}>Animal Bite Reports</Text>
        </View>

        <TouchableOpacity onPress={loadReportData} style={styles.refreshButton}>
          <Ionicons name="refresh-circle-outline" size={32} color="#125872" />
        </TouchableOpacity>
      </View>

      <View style={styles.headerDivider} />

      {/* ================= MAIN CONTENT (SCROLLABLE) ================= */}
      <ScrollView contentContainerStyle={styles.mainContent}>

        {/* REPORT LOCATION */}
        <Text style={styles.reportingFromText}>
          <Text style={styles.reportingFromLabel}>Reporting from </Text>
          <Text style={styles.reportingFromLocation}>{reportLocation.city}, {reportLocation.region}</Text>
        </Text>

        {/* FIRST SECTIONS CONTAINER - 2 COLUMN LAYOUT */}
        <View style={styles.firstSections}>
          
          {/* LEFT SECTION - Total Cases & Sources */}
          <View style={styles.leftFirstSection}>
            
            {/* TOTAL CASES THIS MONTH */}
            <View style={styles.highlightCard}>
              <Text style={styles.highlightCardTitle}>Total Cases this Month</Text>
              <Text style={styles.highlightBigNumber}>
                {monthlyCaseSummary.totalCases} cases
              </Text>
              <Text style={styles.highlightTrendText}>
                <Text style={styles.trendBold}>Trend:</Text> {monthlyCaseSummary.trendFromLastMonth >= 0 ? '+' : ''}{monthlyCaseSummary.trendFromLastMonth}% from last month
              </Text>
            </View>

            {/* SOURCES OF ANIMAL BITES */}
            <View style={[styles.card, styles.cardFlex]}>
              <Text style={styles.cardTitleSources}>Sources of Animal Bites in {reportLocation.city}</Text>
              <Text style={styles.subText}>
                This chart shows the distribution of rabies based on the type of biting animal reported.
              </Text>

              <View style={styles.sourceHeader}>
                <Text style={styles.sourceHeaderLeft}>List of Animal Bites</Text>
                <Text style={styles.sourceHeaderRight}>({animalBiteSources.length} recorded)</Text>
              </View>

              {animalBiteSources.length > 0 ? (
                animalBiteSources.map((item, index) => (
                  <View key={index} style={styles.sourceBarRow}>
                    <View
                      style={[
                        styles.sourceBar,
                        {
                          width: `${(item.count / Math.max(...animalBiteSources.map(a => a.count))) * 100}%`,
                          backgroundColor: item.color,
                        }
                      ]}
                    >
                      <Text style={styles.sourceBarLabel} numberOfLines={1}>{item.type}</Text>
                    </View>
                  </View>
                ))
              ) : (
                <Text style={styles.noDataText}>No animal bite data available</Text>
              )}
            </View>
          </View>

          {/* RIGHT SECTION - Vaccination Sessions & Annual Bite */}
          <View style={styles.rightFirstSection}>
            
            {/* VACCINATION SESSIONS */}
            <View style={[styles.card, styles.cardFlex]}>
              <Text style={styles.cardTitle}>
                Vaccination Sessions Completed
              </Text>

              {vaccinationProgress.length > 0 ? (
                <>
                  <View style={styles.vaccineChartContainer}>
                    {vaccinationProgress.map((item, index) => (
                      <View key={index} style={styles.vaccineBarWrapper}>
                        <Text style={styles.vaccineValue}>
                          {item.percentage.toFixed(2)}%
                        </Text>
                        <View
                          style={[
                            styles.vaccineBarVertical,
                            { height: item.percentage * 2 }
                          ]}
                        />
                        <Text style={styles.vaccineLabelBelow}>
                          {item.dose}
                        </Text>
                      </View>
                    ))}
                  </View>

                  <Text style={styles.trendText}>
                    <Text style={styles.trendBold}>Trend:</Text> Based on current data
                  </Text>
                </>
              ) : (
                <Text style={styles.noDataText}>No vaccination data available</Text>
              )}
            </View>

            {/* ANNUAL BITE REPORT */}
            <View style={styles.highlightCard}>
              <Text style={styles.highlightCardTitle}>Annual Bite Report</Text>
              <Text style={styles.highlightBigNumber}>
                {annualBiteSummary.totalReports} reports
              </Text>
              <Text style={styles.highlightTrendText}>
                <Text style={styles.trendBold}>Trend:</Text> {annualBiteSummary.annualTrend >= 0 ? '+' : ''}{annualBiteSummary.annualTrend}% from last year
              </Text>
            </View>
          </View>
        </View>

        {/* EXPOSURE CATEGORY DISTRIBUTION */}
        <View style={styles.darkCardExposure}>
          <Text style={styles.darkCardTitleExposure}>
            Exposure Category Distribution
          </Text>

          {(() => {
            const pieData = exposureCategoryStats.filter(item => item.value > 0);
            
            if (pieData.length === 0) {
              return (
                <View style={styles.pieChartWrapper}>
                  <Text style={styles.noDataTextWhite}>No exposure category data available</Text>
                </View>
              );
            }

            const size = 300;
            const radius = 130;
            const center = size / 2;
            let startAngle = 0;

            return (
              <View style={styles.pieChartWrapper}>
                <View style={{ position: 'relative', width: size, height: size }}>
                  <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                    {pieData.map((slice, index) => {
                      const angle = (slice.value / 100) * 360;
                      const endAngle = startAngle + angle;

                      // Only render if there's a visible angle
                      if (angle < 1) {
                        startAngle = endAngle;
                        return null;
                      }

                      // Handle 100% (full circle) case
                      if (angle >= 359.99) {
                        return (
                          <Circle
                            key={index}
                            cx={center}
                            cy={center}
                            r={radius}
                            fill={slice.color}
                            stroke="#226B85"
                            strokeWidth={2}
                          />
                        );
                      }

                      const path = describeArc(
                        center,
                        center,
                        radius,
                        startAngle,
                        endAngle
                      );

                      const currentStart = startAngle;
                      startAngle = endAngle;

                      if (!path) return null;

                      return (
                        <Path
                          key={index}
                          d={path}
                          fill={slice.color}
                          stroke="#226B85"
                          strokeWidth={2}
                        />
                      );
                    })}
                  </Svg>
                  
                  {/* Percentage labels positioned absolutely over the pie */}
                  {pieData.map((item, idx) => {
                    if (item.value < 1) return null;
                    
                    let angle = 0;
                    for (let i = 0; i < idx; i++) {
                      angle += (pieData[i].value / 100) * 360;
                    }
                    const sliceAngle = (item.value / 100) * 360;
                    
                    // For 100% (full circle), center the text
                    if (item.value >= 99) {
                      return (
                        <Text
                          key={`label-${idx}`}
                          style={[
                            styles.piePercentage,
                            {
                              position: 'absolute',
                              left: 0,
                              right: 0,
                              top: center - 12,
                              textAlign: 'center',
                            },
                          ]}
                        >
                          {item.value}%
                        </Text>
                      );
                    }
                    
                    // For partial slices, position at the middle of the slice
                    const midAngle = angle + sliceAngle / 2;
                    const pos = polarToCartesian(center, center, radius * 0.55, midAngle);
                    
                    return (
                      <Text
                        key={`label-${idx}`}
                        style={[
                          styles.piePercentage,
                          {
                            left: pos.x - 16,
                            top: pos.y - 10,
                          },
                        ]}
                      >
                        {item.value}%
                      </Text>
                    );
                  })}
                </View>
              </View>
            );
          })()}

          {/* LEGEND */}
          <View style={styles.legendRow}>
            {exposureCategoryStats.map((item, index) => (
              <View key={index} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                <Text style={styles.legendText}>{item.label} ({item.value}%)</Text>
              </View>
            ))}
          </View>
        </View>

        {/* TOTAL CASES PER MONTH */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Total cases per month</Text>

          <View style={styles.monthBarContainer}>
            {monthlyCases.map((item, idx) => (
              <View key={idx} style={styles.monthBarWrapper}>
                <View style={[styles.monthBar, { height: item.cases * 4 }]} />
                <Text style={styles.monthLabel}>
                  {item.month}
                </Text>
                <Text style={styles.monthValue}>
                  {item.cases}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* AGE POPULATION - PYRAMID */}
        <View style={styles.darkCardAge}>
          <Text style={styles.agePopulationTitle}>Age Population (in thousands)</Text>

          <View style={styles.pyramidContainer}>
            {/* Male/Female Headers */}
            <View style={styles.pyramidHeaderRow}>
              <Text style={styles.pyramidSideLabel}>Male</Text>
              <Text style={styles.pyramidSideLabel}>Female</Text>
            </View>

            {/* Pyramid Rows */}
            <View style={styles.pyramidContent}>
              {agePopulationStats.map((item, index) => (
                <View key={index} style={styles.pyramidRow}>
                  {/* Male Bar (right-aligned) */}
                  <View style={styles.maleBarSection}>
                    <View
                      style={[
                        styles.pyramidBar,
                        { width: (item.value / 105) * 100 }
                      ]}
                    />
                  </View>

                  {/* Center Age Label */}
                  <Text style={styles.ageGroupLabel}>{item.age}</Text>

                  {/* Female Bar (left-aligned) */}
                  <View style={styles.femaleBarSection}>
                    <View
                      style={[
                        styles.pyramidBar,
                        { width: (item.value / 105) * 100 }
                      ]}
                    />
                  </View>
                </View>
              ))}
            </View>

            {/* X-Axis with Scale */}
            <View style={styles.pyramidAxisContainer}>
              <View style={styles.axisLineLeft} />
              <View style={styles.axisCenter} />
              <View style={styles.axisLineRight} />
            </View>

            <View style={styles.pyramidAxisLabels}>
              <View style={styles.axisLabelsLeft}>
                <Text style={styles.axisLabelText}>4</Text>
                <Text style={styles.axisLabelText}>3.2</Text>
                <Text style={styles.axisLabelText}>2.4</Text>
                <Text style={styles.axisLabelText}>1.6</Text>
                <Text style={styles.axisLabelText}>0.8</Text>
                <Text style={styles.axisLabelText}>0</Text>
              </View>
              <View style={styles.axisLabelsCenter} />
              <View style={styles.axisLabelsRight}>
                <Text style={styles.axisLabelText}>0</Text>
                <Text style={styles.axisLabelText}>0.8</Text>
                <Text style={styles.axisLabelText}>1.6</Text>
                <Text style={styles.axisLabelText}>2.4</Text>
                <Text style={styles.axisLabelText}>3.2</Text>
                <Text style={styles.axisLabelText}>4</Text>
              </View>
            </View>

            {/* Footer Label */}
            <Text style={styles.pyramidFooter}>Age Group</Text>
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

/* ================= STYLES ================= */

const styles = StyleSheet.create({
  container: { flex: 1 },
  backgroundImage: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  loadingText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 16,
    color: '#125872',
    marginTop: 16,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  backButton: {
    padding: 8,
  },
  refreshButton: {
    padding: 8,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: { width: 60, height: 60, marginHorizontal: 12 },
  statsIcon: { width: 60, height: 60, marginLeft: 8 },
  headerTitle: {
    fontFamily: 'Poppins-Bold',
    fontSize: 16,
    color: '#226B85',
    marginTop: 0,
    textAlign: 'center',
    fontWeight: '800',
    marginBottom: -10,
  },
  headerDivider: {
    height: 1,
    backgroundColor: '#125872',
    marginHorizontal: 16,
    marginBottom: 8,
  },

  mainContent: {
    padding: 16,
    paddingBottom: 40,
  },

  reportingFromText: {
    fontFamily: 'Poppins-Regular',
    marginBottom: 10,
    color: '#226B85',
  },
  reportingFromLabel: {
    fontWeight: 'semi-bold',
  },
  reportingFromLocation: {
    fontWeight: '900',
  },

  firstSections: {
    flexDirection: 'row',
    marginBottom: 14,
    gap: 8,
    minHeight: 300,
  },

  leftFirstSection: {
    flex: 1,
    flexDirection: 'column',
    gap: 10,
  },

  rightFirstSection: {
    flex: 1,
    flexDirection: 'column',
    gap: 10,
  },

  cardFlex: {
    flex: 1,
    marginBottom: 0,
  },

  twoColumnRow: {
    flexDirection: 'row',
    marginBottom: 14,
    gap: 0,
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },

  highlightCard: {
    backgroundColor: '#226B85',
    borderRadius: 14,
    padding: 12,
    marginBottom: 1,
  },

  darkCard: {
    backgroundColor: '#226B85',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  darkCardExposure:{
    backgroundColor: '#226B85',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },

  darkCardTitle: {
    fontFamily: 'Poppins-Bold',
    marginBottom: 10,
    fontSize: 13,
    color: '#FFFFFF',
  },
  darkCardTitleExposure:{
    fontFamily: 'Poppins-Bold',
    marginBottom: -35,
    fontSize: 20,
    color: '#FFFFFF',
    alignSelf: 'center',
    fontWeight: '800',
  },

  cardTitle: {
    fontFamily: 'Poppins-Bold',
    marginBottom: 10,
    fontSize: 13,
    color: '#226B85',
  },
  cardTitleSources: {
    fontFamily: 'Poppins-Bold',
    marginBottom: 10,
    fontSize: 13,
    color: '#125872',
    fontWeight: '700',
  },

  highlightCardTitle: {
    fontFamily: 'Poppins-Bold',
    marginBottom: 4,
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  bigNumber: {
    fontFamily: 'Poppins-Bold',
    fontSize: 22,
  },

  highlightBigNumber: {
    fontFamily: 'Poppins-Bold',
    fontSize: 22,
    color: '#FFFFFF',
    fontWeight: '700',
    marginTop: -4,
    marginBottom: -2,
  },

  trendText: {
    fontSize: 11,
    marginTop: 6,
    color: '#333',
  },

  trendBold: {
    fontWeight: '700',
  },

  highlightTrendText: {
    fontSize: 9.5,
    marginTop: 6,
    color: '#E0F7FA',
  },

  subText: {
    fontSize: 9,
    color: '#226B85',
    marginBottom: 12,
    marginTop: -10,
  },

  noDataText: {
    fontSize: 11,
    color: '#666',
    textAlign: 'center',
    padding: 20,
    fontStyle: 'italic',
  },

  noDataTextWhite: {
    fontSize: 11,
    color: '#FFFFFF',
    textAlign: 'center',
    padding: 20,
    fontStyle: 'italic',
  },

  smallTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#125872',
    marginBottom: 10,
    marginTop: 6,
  },

  vaccineChartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 8,
    marginVertical: 8,
    minHeight: 160,
    paddingHorizontal: 0,
  },

  vaccineBarWrapper: {
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 0,
    marginTop: -10,
    marginBottom: -10,
  },

  vaccineValue: {
    fontSize: 8,
    fontWeight: '600',
    color: '#226B85',
    marginBottom: 1,
  },

  vaccineBarVertical: {
    width: 24,
    backgroundColor: '#226B85',
    borderRadius: 0,
    marginBottom: 4,
  },

  vaccineLabelBelow: {
    fontSize: 11,
    fontWeight: '600',
    color: '#226B85',
  },

  vaccineBarRow: {
    marginVertical: 8,
  },
  vaccineBar: {
    height: 10,
    backgroundColor: '#226B85',
    borderRadius: 6,
    marginBottom: 4,
  },
  vaccineLabel: {
    fontSize: 10,
    color: '#333',
    fontWeight: '600',
  },
  vaccinePercent: {
    position: 'absolute',
    right: 0,
    top: 0,
    fontSize: 11,
    fontWeight: '600',
    color: '#226B85',
  },

  sourceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },

  sourceHeaderLeft: {
    fontSize: 9,
    fontWeight: '600',
    color: '#125872',
  },

  sourceHeaderRight: {
    fontSize: 9,
    fontWeight: '600',
    color: '#125872',
  },

  sourceBarRow: {
    margin: 0,
    padding: 0,
    flex: 1,
    overflow: 'hidden',
  },

  sourceBar: {
    height: 32,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: 0,
  },

  sourceBarLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  sourceRow: {
    marginVertical: 10,
  },
  sourceLabel: {
    fontSize: 12,
    color: '#333',
    fontWeight: '500',
    marginBottom: 6,
  },

  pieChartWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 24,
    height: 320,
    width: '100%',
    marginBottom: -20,
  },

  pieChartContainer: {
    position: 'relative',
    width: 260,
    height: 260,
    alignItems: 'center',
    justifyContent: 'center',
  },

  pieChartSvg: {
    width: 260,
    height: 260,
  },

  piePercentage: {
    position: 'absolute',
    fontSize: 16,
    fontWeight: '700',
    color: '#333333',
    textShadowColor: '#FFFFFF',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },

  pieMock: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pieText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    position: 'absolute',
  },

  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 10,
    marginTop: 20,
    gap: 12,
  },

  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 20,
    height: 20,
    borderRadius: 2,
  },
  legendText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  monthBarContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 4,
  },
  monthBarWrapper: {
    alignItems: 'center',
  },
  monthBar: {
    width: 20,
    backgroundColor: '#226B85',
    borderRadius: 5,
  },
  monthLabel: {
    fontSize: 10,
    marginTop: 6,
    fontWeight: '600',
    color: '#125872',
  },

  monthValue: {
    fontSize: 11,
    fontWeight: '700',
    color: '#125872',
    marginTop: 2,
  },

  ageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  ageBar: {
    height: 8,
    backgroundColor: '#D9D9D9',
    marginRight: 6,
  },
  ageLabel: {
    color: '#FFFFFF',
    fontSize: 10,
  },

  darkCardAge: {
    backgroundColor: '#226B85',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
  },

  agePopulationTitle: {
    fontFamily: 'Poppins-Bold',
    fontSize: 14,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 16,
    fontWeight: '700',
  },

  pyramidContainer: {
    // Main container for pyramid
  },

  pyramidHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 8,
  },

  pyramidSideLabel: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  pyramidContent: {
    // Container for all pyramid rows
  },

  pyramidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 18,
    marginVertical: 0,
    paddingHorizontal: 8,
  },

  maleBarSection: {
    flex: 1,
    alignItems: 'flex-end',
    paddingRight: 6,
    overflow: 'hidden',
  },

  femaleBarSection: {
    flex: 1,
    alignItems: 'flex-start',
    paddingLeft: 6,
    overflow: 'hidden',
  },

  pyramidBar: {
    height: 14,
    backgroundColor: '#D9D9D9',
    borderRadius: 0,
  },

  ageGroupLabel: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '600',
    width: 36,
    textAlign: 'center',
  },

  pyramidAxisContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 8,
    height: 1,
  },

  axisLineLeft: {
    flex: 1,
    height: 1,
    backgroundColor: '#FFFFFF',
  },

  axisCenter: {
    width: 36,
    backgroundColor: 'transparent',
  },

  axisLineRight: {
    flex: 1,
    height: 1,
    backgroundColor: '#FFFFFF',
  },

  pyramidAxisLabels: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },

  axisLabelsLeft: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  axisLabelsCenter: {
    width: 36,
  },

  axisLabelsRight: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  axisLabelText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '600',
  },

  pyramidFooter: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 8,
  },
});
