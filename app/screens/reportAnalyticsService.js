import { databases, appwriteConfig } from './appwriteConfig';
import { Query } from 'appwrite';

/**
 * Service for fetching and processing animal bite report analytics
 */

/**
 * Get all patient records for analytics
 */
export const getAllPatientRecords = async () => {
    try {
        console.log('📥 Fetching verified patient records from database...');
        const response = await databases.listDocuments(
            appwriteConfig.patientDatabaseId,
            appwriteConfig.patientRecordsCollectionId,
            [
				// Match typical stored values; we'll still normalize status below
				Query.equal('status', ['verified', 'Verified']),
                Query.limit(1000), // Adjust as needed
                Query.orderDesc('$createdAt')
            ]
        );
        // Normalize and keep only truly verified records (mirrors web analytics)
        const docs = (response.documents || []).filter(doc => {
            const status = (doc.status || doc.Status || '').toString().trim().toLowerCase();
            return status === 'verified';
        });

        console.log('✅ Fetched verified records for analytics:', docs.length);
        return docs;
    } catch (error) {
        console.error('❌ Error fetching patient records:', error);
        return [];
    }
};

/**
 * Calculate monthly case summary
 *
 * Aligns with the main dashboard logic by using the **current
 * calendar month/year** as the window, based primarily on the
 * `dateSubmitted` field (falling back to exposure/created dates
 * when necessary).
 */
export const getMonthlyCaseSummary = (records) => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-11
    const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    // Helper: choose the best available date field, preferring
    // `dateSubmitted` to mirror the dashboard behaviour.
    const pickDate = (record) => {
        const dateStr =
            record.dateSubmitted ||
            record.dateBitten ||
            record.exposureDate ||
            record.dateOfExposure ||
            record.$createdAt ||
            record.createdAt;
        if (!dateStr) return null;
        const date = new Date(dateStr);
        return isNaN(date.getTime()) ? null : date;
    };

    console.log('📊 Calculating monthly summary for calendar month/year:', {
        currentMonth: currentMonth + 1,
        currentYear,
        totalRecords: records.length
    });

    // Current month cases
    const currentMonthCases = records.filter(record => {
        const date = pickDate(record);
        if (!date) return false;
        const isCurrentMonth = date.getMonth() === currentMonth && date.getFullYear() === currentYear;
        if (isCurrentMonth) {
            console.log('✅ Found current-month case (analytics):', {
                submissionID: record.submissionID,
                date: date.toISOString()
            });
        }
        return isCurrentMonth;
    });

    // Last month cases
    const lastMonthCases = records.filter(record => {
        const date = pickDate(record);
        if (!date) return false;
        return date.getMonth() === lastMonth && date.getFullYear() === lastMonthYear;
    });

    const totalCases = currentMonthCases.length;
    const lastMonthTotal = lastMonthCases.length;
    const trendFromLastMonth = lastMonthTotal > 0
        ? Math.round(((totalCases - lastMonthTotal) / lastMonthTotal) * 100)
        : 0;

    console.log('📊 Monthly summary result:', {
        totalCases,
        lastMonthTotal,
        trendFromLastMonth
    });

    return {
        totalCases,
        trendFromLastMonth
    };
};

/**
 * Get vaccination progress statistics
 *
 * Mirrors the web dashboard logic by aggregating vaccination sessions
 * from the dedicated vaccination collection using the `dayKey` field:
 *   'day0', 'day3', 'day7', 'day14', 'd28'
 *
 * Only **complete** vaccination card records are counted. A record is
 * considered complete when:
 *   - It has a valid `dayKey` matching one of the known doses; and
 *   - If a completeness flag is present (e.g. `isComplete`, `completed`,
 *     or a `status` of "complete" / "verified"), that flag is truthy.
 */
export const getVaccinationProgress = async () => {
    try {
        if (!appwriteConfig.vaccinationCollectionId) {
            console.warn('⚠️ vaccinationCollectionId is not configured in appwriteConfig');
            return [];
        }

        console.log('📥 Fetching vaccination sessions from database...');
        const response = await databases.listDocuments(
            appwriteConfig.patientDatabaseId,
            appwriteConfig.vaccinationCollectionId,
            [
                Query.limit(1000)
            ]
        );

        const docs = response.documents || [];
        const doses = ['day0', 'day3', 'day7', 'day14', 'd28'];

        // Helper: determine if a vaccination card/session document is complete
        const isCompleteCard = (doc) => {
            const rawDayKey = (doc.dayKey || '').toString().toLowerCase();
            const hasValidDoseKey = doses.includes(rawDayKey);
            if (!hasValidDoseKey) return false; // ignore records without a valid dose key

            // Optional explicit completeness flags coming from the web app
            if (typeof doc.isComplete !== 'undefined') {
                return !!doc.isComplete;
            }
            if (typeof doc.completed !== 'undefined') {
                return !!doc.completed;
            }
            if (doc.status) {
                const s = doc.status.toString().toLowerCase();
                if (['complete', 'completed', 'verified', 'done', 'finished'].includes(s)) {
                    return true;
                }
            }

            // Fallback heuristic: require that at least one core data field
            // on the vaccination card for this dose has been filled in,
            // so that rows with only metadata (e.g. just `dayKey`) are not
            // treated as completed sessions.
            const coreFields = [
                'typeOfVaccine',
                'vaccineType',
                'vaccine',
                'dose',
                'route',
                'routeAndSite',
                'administeredBy',
                'givenBy'
            ];
            const hasCoreValue = coreFields.some((key) => {
                if (!Object.prototype.hasOwnProperty.call(doc, key)) return false;
                const val = doc[key];
                if (val === null || typeof val === 'undefined') return false;
                return val.toString().trim().length > 0;
            });
            return hasCoreValue;
        };

        const completeDocs = docs.filter(isCompleteCard);
        const totalSessions = completeDocs.length;
        if (totalSessions === 0) {
            console.log('ℹ️ No complete vaccination sessions found');
            return [];
        }

        // Count completed entries per dose key
        const doseCounts = doses.reduce((acc, doseKey) => {
            const count = completeDocs.filter(doc => (doc.dayKey || '').toString().toLowerCase() === doseKey.toLowerCase()).length;
            acc[doseKey] = count;
            return acc;
        }, {});

        // Use Day 0 as the baseline for "completion" so that
        // a later day shows 100% when all who started (Day 0)
        // also received that dose. If there is no Day 0 yet,
        // fall back to all complete sessions as the denominator.
        const baseline = doseCounts['day0'] || totalSessions;

        const formatDoseLabel = (doseKey) => {
            // Convert keys like 'day0' / 'd28' to human‑readable labels
            const match = doseKey.match(/(\d+)/);
            if (match && match[1]) {
                return `Day ${match[1]}`;
            }
            return doseKey;
        };

        const byDose = doses.map((doseKey) => {
            const count = doseCounts[doseKey] || 0;
            const denominator = baseline > 0 ? baseline : totalSessions;
            const rawPct = denominator > 0 ? (count / denominator) * 100 : 0;
            const percentage = Number(rawPct.toFixed(2));
            return {
                dose: formatDoseLabel(doseKey),
                percentage
            };
        });

        console.log('✅ Vaccination progress computed (complete cards only):', byDose);
        return byDose;
    } catch (error) {
        console.error('❌ Error fetching vaccination progress:', error);
        return [];
    }
};

/**
 * Get animal bite sources distribution
 */
export const getAnimalBiteSources = (records) => {
    const sourceCounts = {};

    records.forEach(record => {
        let animalType = record.animalType;
        
        // Handle array format
        if (Array.isArray(animalType)) {
            animalType = animalType[0] || 'Unknown';
        }
        
        // Handle special case for Others
        if (animalType === 'Others' && record.animalTypeOther) {
            animalType = record.animalTypeOther;
        }

        // Map to scientific names
        let mappedType;
        if (animalType && animalType.toLowerCase().includes('dog')) {
            mappedType = 'Canis lupus familiaris (Dog)';
        } else if (animalType && animalType.toLowerCase().includes('cat')) {
            mappedType = 'Felis catus (Cat)';
        } else if (animalType && (animalType.toLowerCase().includes('rat') || animalType.toLowerCase().includes('rodent'))) {
            mappedType = 'Rodentia (Rats)';
        } else {
            mappedType = 'Others';
        }

        sourceCounts[mappedType] = (sourceCounts[mappedType] || 0) + 1;
    });

    const colors = {
        'Canis lupus familiaris (Dog)': '#226B85',
        'Felis catus (Cat)': '#2F8AAA',
        'Rodentia (Rats)': '#39AAD2',
        'Others': '#75BFD9'
    };

    return Object.entries(sourceCounts)
        .map(([type, count]) => ({
            type,
            count,
            color: colors[type] || '#75BFD9'
        }))
        .sort((a, b) => b.count - a.count);
};

/**
 * Get annual bite report summary
 */
export const getAnnualBiteSummary = (records) => {
    if (!records || records.length === 0) {
        return { totalReports: 0, annualTrend: 0 };
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const lastYear = currentYear - 1;

    const dateStrFor = (record) =>
        record.dateSubmitted ||
        record.exposureDate ||
        record.dateOfExposure ||
        record.$createdAt ||
        record.dateBitten ||
        record.createdAt;

    const currentYearReports = records.filter(record => {
        const s = dateStrFor(record);
        if (!s) return false;
        const d = new Date(s);
        return !isNaN(d.getTime()) && d.getFullYear() === currentYear;
    });

    const lastYearReports = records.filter(record => {
        const s = dateStrFor(record);
        if (!s) return false;
        const d = new Date(s);
        return !isNaN(d.getTime()) && d.getFullYear() === lastYear;
    });

    const totalReports = currentYearReports.length;
    const lastYearTotal = lastYearReports.length;
    const annualTrend = lastYearTotal > 0
        ? Math.round(((totalReports - lastYearTotal) / lastYearTotal) * 100)
        : 0;

    return {
        totalReports,
        annualTrend
    };
};

/**
 * Get exposure category distribution
 */
export const getExposureCategoryStats = (records) => {
    const totalRecords = records.length;
    if (totalRecords === 0) {
        return [
            { label: 'CAT I', value: 0, color: '#FFFFFF' },
            { label: 'CAT II', value: 0, color: '#848484' },
            { label: 'CAT III', value: 0, color: '#D9D9D9' }
        ];
    }

    const categoryCounts = {
        'I': 0,
        'II': 0,
        'III': 0
    };

    console.log('📊 Processing exposure categories for', totalRecords, 'records');

    records.forEach(record => {
        let category = record.categoryOfExposure || record.exposureCategory;
        
        if (category) {
            const categoryStr = category.toString().trim().toUpperCase();
            
            // Direct match for I, II, III
            if (categoryStr === 'I' || categoryStr === '1') {
                categoryCounts['I']++;
            } else if (categoryStr === 'II' || categoryStr === '2') {
                categoryCounts['II']++;
            } else if (categoryStr === 'III' || categoryStr === '3') {
                categoryCounts['III']++;
            } else {
                console.log('⚠️ Unrecognized category:', category, 'for record', record.submissionID);
            }
        }
    });

    console.log('📊 Category distribution:', categoryCounts);

    const total = categoryCounts['I'] + categoryCounts['II'] + categoryCounts['III'];
    
    // If no valid categories found, return equal distribution as placeholder
    if (total === 0) {
        console.log('⚠️ No valid exposure categories found in records');
        return [
            { label: 'CAT I', value: 33, color: '#FFFFFF' },
            { label: 'CAT II', value: 34, color: '#848484' },
            { label: 'CAT III', value: 33, color: '#D9D9D9' }
        ];
    }

    // Calculate percentages
    const catI = Math.round((categoryCounts['I'] / total) * 100);
    const catII = Math.round((categoryCounts['II'] / total) * 100);
    let catIII = Math.round((categoryCounts['III'] / total) * 100);
    
    // Ensure percentages sum to 100 (adjust last category for rounding)
    const sum = catI + catII + catIII;
    if (sum !== 100) {
        catIII += (100 - sum);
    }

    return [
        { 
            label: 'CAT I', 
            value: catI,
            color: '#FFFFFF'
        },
        { 
            label: 'CAT II', 
            value: catII,
            color: '#848484'
        },
        { 
            label: 'CAT III', 
            value: catIII,
            color: '#D9D9D9'
        }
    ];
};

/**
 * Get monthly cases for the current year
 */
export const getMonthlyCases = (records) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (!records || records.length === 0) {
        return months.map(month => ({ month, cases: 0 }));
    }

    const dateStrFor = (record) => record.exposureDate || record.dateOfExposure || record.$createdAt || record.dateBitten || record.createdAt;
    const dates = records
        .map(r => {
            const s = dateStrFor(r);
            if (!s) return null;
            const d = new Date(s);
            return isNaN(d.getTime()) ? null : d;
        })
        .filter(d => d !== null);

    if (dates.length === 0) {
        console.log('📊 No valid dates found for monthly cases chart');
        return months.map(month => ({ month, cases: 0 }));
    }

    // Use latest recorded year as the reference year for the bar chart
    const latestDate = dates.reduce((max, d) => (d > max ? d : max), dates[0]);
    const currentYear = latestDate.getFullYear();
    const monthlyCounts = new Array(12).fill(0);

    records.forEach(record => {
        const s = dateStrFor(record);
        if (!s) return;
        const d = new Date(s);
        if (!isNaN(d.getTime()) && d.getFullYear() === currentYear) {
            const m = d.getMonth();
            monthlyCounts[m]++;
        }
    });

    return months.map((month, index) => ({
        month,
        cases: monthlyCounts[index]
    }));
};

/**
 * Get age population statistics
 * Creates a pyramid distribution of patients by age
 */
export const getAgePopulationStats = (records) => {
    const ageGroups = [
        '0–4', '5–9', '10–14', '15–19', '20–24', '25–29', '30–34', '35–39',
        '40–44', '45–49', '50–54', '55–59', '60–64', '65–69', '70–74',
        '75–79', '80–84', '85–89', '90–94', '95–99', '100+'
    ];

    const ageCounts = new Array(ageGroups.length).fill(0);

    console.log('📊 Processing age statistics for', records.length, 'records');

    records.forEach(record => {
        const age = parseInt(record.age);
        if (!isNaN(age) && age >= 0) {
            let groupIndex;
            if (age >= 100) groupIndex = 20;
            else if (age >= 95) groupIndex = 19;
            else if (age >= 90) groupIndex = 18;
            else if (age >= 85) groupIndex = 17;
            else if (age >= 80) groupIndex = 16;
            else if (age >= 75) groupIndex = 15;
            else if (age >= 70) groupIndex = 14;
            else if (age >= 65) groupIndex = 13;
            else if (age >= 60) groupIndex = 12;
            else if (age >= 55) groupIndex = 11;
            else if (age >= 50) groupIndex = 10;
            else if (age >= 45) groupIndex = 9;
            else if (age >= 40) groupIndex = 8;
            else if (age >= 35) groupIndex = 7;
            else if (age >= 30) groupIndex = 6;
            else if (age >= 25) groupIndex = 5;
            else if (age >= 20) groupIndex = 4;
            else if (age >= 15) groupIndex = 3;
            else if (age >= 10) groupIndex = 2;
            else if (age >= 5) groupIndex = 1;
            else groupIndex = 0;

            ageCounts[groupIndex]++;
        } else if (record.age) {
            console.log('⚠️ Invalid age value:', record.age, 'for record', record.submissionID);
        }
    });

    console.log('📊 Age distribution:', ageCounts);

    // Return in reverse order (100+ at top, 0-4 at bottom) for pyramid display
    return ageGroups.map((age, index) => ({
        age: ageGroups[ageGroups.length - 1 - index],
        value: ageCounts[ageGroups.length - 1 - index]
    }));
};

/**
 * Get report location from records
 * Uses the most common barangay/city from records
 */
export const getReportLocation = (records) => {
    if (records.length === 0) {
        return {
            city: 'No Data',
            region: 'No Data'
        };
    }

    // Get most common city and barangay
    const cityCounts = {};
    const barangayCounts = {};

    records.forEach(record => {
        const city = record.city || 'Unknown';
        const barangay = record.barangay || 'Unknown';
        
        cityCounts[city] = (cityCounts[city] || 0) + 1;
        barangayCounts[barangay] = (barangayCounts[barangay] || 0) + 1;
    });

    const mostCommonCity = Object.entries(cityCounts)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown';

    // For region, we'll use a default or try to infer from data
    const region = 'Davao Region'; // Default - could be enhanced with actual data

    return {
        city: mostCommonCity,
        region
    };
};

/**
 * Main function to fetch all analytics data
 */
export const fetchAnimalBiteReportData = async () => {
    try {
        const records = await getAllPatientRecords();
        const vaccinationProgress = await getVaccinationProgress();
		
        return {
            reportLocation: getReportLocation(records),
            monthlyCaseSummary: getMonthlyCaseSummary(records),
            vaccinationProgress,
            animalBiteSources: getAnimalBiteSources(records),
            annualBiteSummary: getAnnualBiteSummary(records),
            exposureCategoryStats: getExposureCategoryStats(records),
            monthlyCases: getMonthlyCases(records),
            agePopulationStats: getAgePopulationStats(records),
            totalRecordsCount: records.length
        };
    } catch (error) {
        console.error('Error fetching animal bite report data:', error);
        throw error;
    }
};
