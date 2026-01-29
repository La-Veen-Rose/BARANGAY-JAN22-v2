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
    if (!barangayName || barangayName.trim() === '') {
        throw new Error('Barangay name is required to generate code');
    }
    
    const words = barangayName.trim().split(/\s+/);
    
    // Start with first 3 letters of first word
    let code = words[0].substring(0, 3);
    
    // Add first letter of each subsequent word
    for (let i = 1; i < words.length; i++) {
        code += words[i].charAt(0);
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

export default {
    getSubmissionID,
};