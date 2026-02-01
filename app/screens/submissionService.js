import { databases, appwriteConfig, ID, Query } from './appwriteConfig';

/**
 * Generate barangay code from barangay name
 * Rules:
 * - 1 word: First 3 letters (e.g., "San" → "SAN")
 * - 2+ words: First 3 letters of first word + 1st letter of each subsequent word
 *   Examples:
 *   - "San Jose" → "SANJ"
 *   - "La Union Paz" → "LAUP"
 *   - "San Antonio Maria" → "SAAM"
 * 
 * @param {string} barangayName - The barangay name
 * @returns {string} - The generated barangay code
 */
const generateBarangayCode = (barangayName) => {
    if (!barangayName || String(barangayName).trim() === '') {
        throw new Error('Barangay name is required to generate code');
    }

    const trimmed = String(barangayName).trim();
    const words = trimmed.split(/\s+/).filter(Boolean);

    // Normalize each word to alphanumeric only so punctuation doesn't affect the code.
    const cleanWord = (w) => String(w).replace(/[^A-Za-z0-9]/g, '');
    const cleanWords = words.map(cleanWord).filter(Boolean);

    if (cleanWords.length === 0) {
        throw new Error('Barangay name is required to generate code');
    }

    // Rules:
    // - 1 word: first 3 letters
    // - 2+ words: first 3 letters of first word + 1st letter of each subsequent word
    let code = cleanWords[0].substring(0, 3);
    for (let i = 1; i < cleanWords.length; i++) {
        code += cleanWords[i].charAt(0);
    }

    return code.toUpperCase();
};

/**
 * Generate a unique submission ID in format: BRGYCODE-YYYY-SEQUENCE
 * Example: SAN-2025-0001
 * 
 * Reads/creates counter in submissionCounters collection and increments it.
 * 
 * @param {string} barangayName - The barangay name (e.g., "San Jose")
 * @returns {Promise<string>} - The generated submission ID
 */
export const getSubmissionID = async (barangayName) => {
    try {
        if (!barangayName) {
            throw new Error('Barangay name is required to generate submission ID');
        }

        const barangayCode = generateBarangayCode(barangayName);
        const currentYear = new Date().getFullYear();
        const counterKey = `${barangayCode}-${currentYear}`;

        // Try to get existing counter (query directly; avoids listing entire collection)
        try {
            const counters = await databases.listDocuments(
                appwriteConfig.patientDatabaseId,
                appwriteConfig.submissionCountersCollectionId,
                [
                    Query.equal('barangayCode', barangayCode),
                    Query.equal('submissionYear', currentYear),
                    Query.limit(1),
                ]
            );

            const counter = counters.documents?.[0];

            if (counter) {
                const newCurrent = (Number(counter.current) || 0) + 1;
                await databases.updateDocument(
                    appwriteConfig.patientDatabaseId,
                    appwriteConfig.submissionCountersCollectionId,
                    counter.$id,
                    { current: newCurrent }
                );
                const sequence = String(newCurrent).padStart(4, '0');
                const submissionID = `${barangayCode}-${currentYear}-${sequence}`;
                console.log('✅ Generated submission ID:', submissionID);
                return submissionID;
            }
        } catch (e) {
            console.log('No existing counter found, creating new one');
        }

        // Create new counter starting at 1
        const newDoc = await databases.createDocument(
            appwriteConfig.patientDatabaseId,
            appwriteConfig.submissionCountersCollectionId,
            ID.unique(),
            {
                barangayCode: barangayCode,
                submissionYear: currentYear,
                current: 1
            }
        );

        const sequence = String(1).padStart(4, '0');
        const submissionID = `${barangayCode}-${currentYear}-${sequence}`;
        console.log('✅ Generated submission ID:', submissionID);
        return submissionID;

    } catch (error) {
        console.error('❌ Error generating submission ID:', error.message);
        throw error;
    }
};

/**
 * Generate a patient record ID in format: PR-YYYY-BRGYCODE-SUFFIX
 * Example: PR-2025-MAN-8F3A
 *
 * Uses the existing submissionCounters collection to store a separate counter
 * field (patientRecordCurrent) per barangay/year, then encodes that counter
 * as a 4-character base36 string.
 *
 * @param {string} barangayName - The barangay name (e.g., "San Jose")
 * @returns {Promise<string>} - The generated patient record ID
 */
export const getPatientRecordId = async (barangayName) => {
    try {
        if (!barangayName) {
            throw new Error('Barangay name is required to generate patient record ID');
        }

        const barangayCode = generateBarangayCode(barangayName);
        const currentYear = new Date().getFullYear();

        const encodeSuffix = (value) => {
            const n = Number(value) || 0;

            // 4 chars base36 gives 36^4 = 1,679,616 unique values.
            // We scramble the counter with a bijection mod 36^4 so the suffix
            // looks random but stays collision-free per barangay+year.
            const MOD = 36 ** 4;
            if (n >= MOD) {
                // Extremely unlikely in this app; fall back to longer base36.
                return n.toString(36).toUpperCase();
            }

            // A must be coprime with 36 to be invertible mod 36^4.
            const A = 10007;
            const B = 7919;
            const scrambled = (n * A + B) % MOD;

            return scrambled
                .toString(36)
                .toUpperCase()
                .padStart(4, '0');
        };

        // Try to get existing counter doc
        try {
            const counters = await databases.listDocuments(
                appwriteConfig.patientDatabaseId,
                appwriteConfig.submissionCountersCollectionId,
                [
                    Query.equal('barangayCode', barangayCode),
                    Query.equal('submissionYear', currentYear),
                    Query.limit(1),
                ]
            );

            const counter = counters.documents?.[0];
            if (counter) {
                const newCurrent = (Number(counter.patientRecordCurrent) || 0) + 1;

                await databases.updateDocument(
                    appwriteConfig.patientDatabaseId,
                    appwriteConfig.submissionCountersCollectionId,
                    counter.$id,
                    { patientRecordCurrent: newCurrent }
                );

                const suffix = encodeSuffix(newCurrent);
                const patientRecordId = `PR-${currentYear}-${barangayCode}-${suffix}`;
                console.log('✅ Generated patient record ID:', patientRecordId);
                return patientRecordId;
            }
        } catch (e) {
            console.log('No existing counter found for patientRecordId, creating new one');
        }

        // Create new counter doc; keep current for submissions at 0 so getSubmissionID works later.
        await databases.createDocument(
            appwriteConfig.patientDatabaseId,
            appwriteConfig.submissionCountersCollectionId,
            ID.unique(),
            {
                barangayCode: barangayCode,
                submissionYear: currentYear,
                current: 0,
                patientRecordCurrent: 1,
            }
        );

        const suffix = encodeSuffix(1);
        const patientRecordId = `PR-${currentYear}-${barangayCode}-${suffix}`;
        console.log('✅ Generated patient record ID:', patientRecordId);
        return patientRecordId;
    } catch (error) {
        console.error('❌ Error generating patient record ID:', error.message);
        throw error;
    }
};

export default {
    getSubmissionID,
    getPatientRecordId,
};