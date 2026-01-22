// Centralized metrics and risk assessment derived from the Animal Bite Reports data.
const CURRENT_MONTH_CASES = 132;
const TREND_PERCENT = 15; // Positive means increase vs last month
const BITE_REPORT_COUNT = 1024;
const BITE_REPORT_TREND_PERCENT = 22;

const formatTrend = (percent) => {
    const prefix = percent > 0 ? "+" : "";
    return `${prefix}${percent}%`;
};

const lastMonthCount = Math.round(CURRENT_MONTH_CASES / (1 + TREND_PERCENT / 100));

const computeRiskLevel = (currentCount, trendPercent) => {
    if (currentCount >= 150 || trendPercent >= 15) return "HIGH";
    if (currentCount >= 80 || trendPercent >= 5) return "MODERATE";
    return "LOW";
};

export const totalCasesMetrics = {
    count: CURRENT_MONTH_CASES,
    lastMonthCount,
    trendPercent: TREND_PERCENT,
    trend: formatTrend(TREND_PERCENT),
    period: "last month"
};

export const riskAssessment = {
    level: computeRiskLevel(CURRENT_MONTH_CASES, TREND_PERCENT),
    trendPercent: TREND_PERCENT,
    trend: `${formatTrend(TREND_PERCENT)} vs last month`
};

export const biteReportMetrics = {
    count: BITE_REPORT_COUNT,
    lastMonthCount: Math.round(BITE_REPORT_COUNT / (1 + BITE_REPORT_TREND_PERCENT / 100)),
    trendPercent: BITE_REPORT_TREND_PERCENT,
    trend: formatTrend(BITE_REPORT_TREND_PERCENT),
    period: "this month"
};

// Vaccination session confidence derived from dose completion percentages
const VACCINATION_DOSES = [
    { dose: '1st', percentage: 90.92 },
    { dose: '2nd', percentage: 61.37 },
    { dose: '3rd', percentage: 33.28 },
    { dose: '4th', percentage: 77.01 }
];

const computeVaccinationConfidence = (doses) => {
    const average = doses.reduce((sum, d) => sum + d.percentage, 0) / doses.length;
    return Math.round(average);
};

const computeConfidenceLevel = (percentage) => {
    if (percentage >= 80) return "Very High";
    if (percentage >= 60) return "High";
    if (percentage >= 40) return "Moderate";
    return "Low";
};

const vaccinationConfidencePercent = computeVaccinationConfidence(VACCINATION_DOSES);

export const vaccinationMetrics = {
    confidence: vaccinationConfidencePercent,
    level: computeConfidenceLevel(vaccinationConfidencePercent),
    doses: VACCINATION_DOSES
};