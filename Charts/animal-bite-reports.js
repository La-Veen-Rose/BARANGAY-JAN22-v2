import React, { useState, useEffect } from 'react';
// Removed unused router imports
import "./animal-bite-reports.css";
import ChoroplethMap from './ChoroplethMap';
import { totalCasesMetrics, biteReportMetrics } from './reportMetrics';

const AnimalBiteReports = () => {
    const [hoveredSlice, setHoveredSlice] = useState(null);

    // states replaced with live data
    const [vaccineData, setVaccineData] = useState([]);
    const [biteSourcesData, setBiteSourcesData] = useState([]);
    // restore original exposure categories (keep descriptions/colors) and update percentage when we compute
    const [exposureCategories, setExposureCategories] = useState([
        {
            category: 'CAT I',
            description: 'Touching or feeding animals, or licks on intact skin. No exposure to saliva or potential virus entry. No post-exposure prophylaxis (PEP) required, but observation and education are encouraged.',
            percentage: 0,
            count: 0,
            color: '#8fa8b3'
        },
        {
            category: 'CAT II',
            description: 'Exposure to nibbling of uncovered skin, minor scratches or abrasions without bleeding. Immediate vaccination is recommended.',
            percentage: 0,
            count: 0,
            color: '#e0e0e0'
        },
        {
            category: 'CAT III',
            description: 'Exposure to transdermal bites or scratches, contamination of mucous membrane with saliva from licks, or exposure to bats. Immediate vaccination and administration of rabies immunoglobulin (RIG) are required.',
            percentage: 0,
            count: 0,
            color: '#ffffff'
        }
    ]);

    const [distributionInfo] = useState({
        title: 'RABIES CASE DISTRIBUTION BY BARANGAY',
        subtitle: "Percentage of City Total. This map shows each barangay's share of Tagum City's rabies cases, expressed as a percentage."
    });

    // keep canonical barangay names and order used by the UI; we'll compute share from patient records
    const CANONICAL_BARANGAYS = [
        'Apokon','Bincungan','Busaon','Canocotan','Cuambogan','La Filipina','Liboganon','Madaum','Magdum','Magugpo East','Magugpo North','Magugpo South','Magugpo Poblacion','Magugpo West','Mankilam','New Balamban','Nueva Fuerza','Pagsabangan','Pandapan','San Agustin','San Isidro','San Miguel (Camp 4)','Visayan Village'
    ];
    const [barangayData, setBarangayData] = useState(CANONICAL_BARANGAYS.map(name => ({ name, share: '0%' })));

    const [totalCasesData, setTotalCasesData] = useState(totalCasesMetrics);

    const [biteReportData, setBiteReportData] = useState(biteReportMetrics);

    const [monthlyCasesData, setMonthlyCasesData] = useState([]);

    const [ageGroupData, setAgeGroupData] = useState([]);

    const [totalBites, setTotalBites] = useState(0);

    // Fetch data from your system
    useEffect(() => {
        const fetchVaccineData = async (databases, databaseId, vaccinationCollectionId) => {
            try {
                const resp = await databases.listDocuments(databaseId, vaccinationCollectionId);
                const docs = resp.documents || [];
                // Basic aggregation: count sessions by dose or date if needed. For now compute completion percentage by day key
                const totalSessions = docs.length;
                const doses = ['day0','day3','day7','day14','d28'];
                const byDose = doses.map(d => {
                    const have = docs.filter(doc => doc.dayKey === d || doc.dayKey === d).length;
                    const pct = totalSessions > 0 ? Math.round((have / totalSessions) * 100) : 0;
                    return { dose: d, percentage: pct };
                });
                setVaccineData(byDose);
                setTotalBites((prev) => prev); // noop keep consistent
                console.log('Vaccine data loaded from Appwrite');
            } catch (error) {
                console.error('Error fetching vaccine data:', error);
            }
        };

        const fetchBiteSourcesData = async (patients) => {
            try {
                // Aggregate bitingAnimal field from patient records
                const counts = {};
                // support multiple possible field names and normalize
                const possibleKeys = ['bitingAnimal','biting_animal','animal','biteSource','sourceOfBite','source'];
                (patients || []).forEach(p => {
                    // if an `animalType` array exists, count each entry
                    if (Array.isArray(p.animalType) && p.animalType.length > 0) {
                        p.animalType.forEach(entry => {
                            let a = '';
                            if (typeof entry === 'string') a = entry;
                            else if (entry && typeof entry === 'object') a = entry.name || entry.animal || entry.type || '';
                            a = (a || '').toString().trim();
                            if (!a) return;
                            const norm = a.replace(/\s+/g,' ').trim();
                            counts[norm] = (counts[norm] || 0) + 1;
                        });
                        return;
                    }

                    let a = null;
                    for (const k of possibleKeys) {
                        if (p[k]) { a = p[k]; break; }
                    }
                    // if the found value is an array, iterate entries
                    if (Array.isArray(a)) {
                        a.forEach(entry => {
                            let val = '';
                            if (typeof entry === 'string') val = entry;
                            else if (entry && typeof entry === 'object') val = entry.name || entry.animal || entry.type || '';
                            val = (val || '').toString().trim();
                            if (!val) return;
                            const norm = val.replace(/\s+/g,' ').trim();
                            counts[norm] = (counts[norm] || 0) + 1;
                        });
                        return;
                    }
                    if (!a && p.bitingAnimal) a = p.bitingAnimal; // fallback
                    a = (a || '').toString().trim();
                    if (!a) return; // do not count empty strings
                    // normalize common labels
                    const norm = a.replace(/\s+/g,' ').trim();
                    counts[norm] = (counts[norm] || 0) + 1;
                });
                const total = Object.values(counts).reduce((s,v) => s+v, 0) || 0;
                const arr = Object.keys(counts).map(k => ({ animal: k, count: counts[k], percentage: total>0?Math.round((counts[k]/total)*100):0 }));
                // sort by count desc
                arr.sort((a,b) => b.count - a.count);
                setBiteSourcesData(arr);
                setTotalBites(total);
                console.log('Bite sources aggregated', arr);
            } catch (error) {
                console.error('Error fetching bite sources data:', error);
            }
        };

        const fetchExposureCategoryData = async (patients) => {
            try {
                // Aggregate categoryExposure field
                // Count by canonical categories, but do not remove descriptions/colors
                const counts = { 'CAT I':0, 'CAT II':0, 'CAT III':0, 'Unspecified':0 };
                (patients || []).forEach(p => {
                    // prefer `categoryOfExposure` field if present
                    let c = p.categoryOfExposure || p.categoryExposure || p.category_of_exposure || p.category || '';
                    c = (c || '').toString().toUpperCase().trim();

                    // normalize and detect numeric/roman/label variants
                    const s = c.replace(/[^A-Z0-9\s]/g, ' ');

                    const isCatI = /\b(I|1|CAT\s*I|CATEGORY\s*I|CAT1|CATEGORY1)\b/.test(s);
                    const isCatII = /\b(II|2|CAT\s*II|CATEGORY\s*II|CAT2|CATEGORY2)\b/.test(s);
                    const isCatIII = /\b(III|3|CAT\s*III|CATEGORY\s*III|CAT3|CATEGORY3)\b/.test(s);

                    if (isCatI) counts['CAT I']++;
                    else if (isCatII) counts['CAT II']++;
                    else if (isCatIII) counts['CAT III']++;
                    else if (c) counts['Unspecified']++;
                });
                const total = Object.values(counts).reduce((s,v) => s+v, 0) || 0;
                const updated = exposureCategories.map(ec => ({ 
                    ...ec, 
                    count: counts[ec.category] || 0,
                    percentage: total>0?Math.round((counts[ec.category]||0)/total*100):0 
                }));
                // if there are unspecified entries, append them as a small category but keep original order
                if (counts['Unspecified'] > 0) {
                    updated.push({ category: 'Unspecified', description: '', count: counts['Unspecified'], percentage: Math.round((counts['Unspecified']/total)*100), color: '#f2f2f2' });
                }
                setExposureCategories(updated);
                console.log('Exposure categories aggregated');
            } catch (error) {
                console.error('Error fetching exposure category data:', error);
            }
        };

        const fetchDistributionInfo = async () => {
            try {
                // Replace with your actual API endpoint
                // const response = await fetch('YOUR_API_ENDPOINT/distribution-info');
                // const data = await response.json();
                // setDistributionInfo(data);
                
                console.log('Distribution info loaded');
            } catch (error) {
                console.error('Error fetching distribution info:', error);
            }
        };

        const fetchBarangayData = async (patients) => {
            try {
                // Aggregate barangay counts from patient records with case-insensitive matching
                const counts = {};

                // Build a lookup map of canonical names keyed by lowercase name for normalization
                const canonicalLookup = CANONICAL_BARANGAYS.reduce((m, n) => {
                    m[n.toLowerCase().trim()] = n;
                    return m;
                }, {});

                (patients || []).forEach(p => {
                    const raw = (
                        p.barangay || 
                        p.address ||
                        p.address?.barangay ||
                        p.Address?.barangay ||
                        '').toString().trim();
                    if (!raw) return;
                    const key = raw.toLowerCase().replace(/\s+/g, '').trim();
                    if (canonicalLookup[key]) {
                        const canon = canonicalLookup[key];
                        counts[canon] = (counts[canon] || 0) + 1;
                    } else {
                        // store unexpected names under their raw form for later aggregation into 'Others'
                        counts[raw] = (counts[raw] || 0) + 1;
                    }
                });

                const total = Object.values(counts).reduce((s,v) => s+v, 0) || 0;

                // Preserve canonical list and compute share per canonical name.
                const arr = CANONICAL_BARANGAYS.map(name => ({ name, share: total>0?((counts[name]||0)/total*100).toFixed(1) + '%':'0%' }));

                // Sum counts for non-canonical barangays (those not in the canonical list)
                let othersCount = 0;
                Object.keys(counts).forEach(k => {
                    if (!CANONICAL_BARANGAYS.includes(k)) {
                        othersCount += counts[k];
                    }
                });
                if (othersCount > 0) {
                    arr.push({ name: 'Others', share: total>0?((othersCount)/total*100).toFixed(1) + '%':'0%' });
                }

                setBarangayData(arr);
                console.log('Barangay distribution computed (preserved canonical names)');
            } catch (error) {
                console.error('Error fetching barangay data:', error);
            }
        };

        const fetchTotalCasesData = async (patients) => {
            try {
                const now = new Date();
                const thisMonth = now.getMonth();
                const thisYear = now.getFullYear();
                const monthCount = (patients || []).filter(p => {
                    const d = p.dateBitten || p.$createdAt || p.createdAt;
                    if (!d) return false;
                    const dt = new Date(d);
                    return dt.getMonth() === thisMonth && dt.getFullYear() === thisYear;
                }).length;
                const annualCount = (patients || []).filter(p => {
                    const d = p.dateBitten || p.$createdAt || p.createdAt;
                    if (!d) return false;
                    const dt = new Date(d);
                    return dt.getFullYear() === thisYear;
                }).length;
                setTotalCasesData({ count: monthCount, trend: 'N/A', period: 'this month' });
                setBiteReportData({ count: annualCount, trend: 'N/A', period: 'this year' });
                console.log('Total/annual cases computed');
            } catch (error) {
                console.error('Error fetching total cases data:', error);
            }
        };

        const fetchBiteReportData = async () => {
            try {
                // Replace with your actual API endpoint
                // const response = await fetch('YOUR_API_ENDPOINT/bite-report');
                // const data = await response.json();
                // setBiteReportData(data);
                
                console.log('Bite report data loaded');
            } catch (error) {
                console.error('Error fetching bite report data:', error);
            }
        };

        const fetchMonthlyCasesData = async (patients) => {
            try {
                const now = new Date();
                const year = now.getFullYear();
                const months = ['Jan','Feb','Mar','Apr','May','June','July','Aug','Sept','Oct','Nov','Dec'];
                const counts = months.map((m,idx) => {
                    const c = (patients || []).filter(p => {
                        const d = p.dateBitten || p.$createdAt || p.createdAt;
                        if (!d) return false;
                        const dt = new Date(d);
                        return dt.getMonth() === idx && dt.getFullYear() === year;
                    }).length;
                    return { month: m, cases: c };
                });
                setMonthlyCasesData(counts);
                console.log('Monthly cases computed');
            } catch (error) {
                console.error('Error fetching monthly cases data:', error);
            }
        };

        const fetchAgeGroupData = async (patients) => {
            try {
                // Build age groups
                const groups = [
                    '0-4','5-9','10-14','15-19','20-24','25-29','30-34','35-39','40-44','45-49','50-54','55-59','60-64','65-69','70-74','75-79','80+'
                ];
                const byGroup = groups.map(range => ({ ageRange: range, male: 0, female: 0 }));
                (patients || []).forEach(p => {
                    const age = Number(p.age) || null;
                    const sex = (p.sex || '').toString().toLowerCase();
                    let idx = -1;
                    if (age === null) return;
                    for (let i=0;i<groups.length;i++){
                        const r = groups[i];
                        if (r === '80+' && age >= 80) { idx = i; break; }
                        const [a,b] = r.split('-').map(Number);
                        if (age >= a && age <= b) { idx = i; break; }
                    }
                    if (idx === -1) return;
                    if (sex.startsWith('m')) byGroup[idx].male += 1;
                    else byGroup[idx].female += 1;
                });
                // Convert to thousands scale if needed by dividing by 1000
                setAgeGroupData(byGroup);
                console.log('Age group computed');
            } catch (error) {
                console.error('Error fetching age group data:', error);
            }
        };

        // Initialize Appwrite client and fetch patients + vaccinations
        (async () => {
            try {
                const { Client, Databases, Query } = await import("appwrite");
                const client = new Client()
                    .setEndpoint(process.env.REACT_APP_APPWRITE_ENDPOINT)
                    .setProject(process.env.REACT_APP_APPWRITE_PROJECT_ID);

                const databases = new Databases(client);
                const databaseId = process.env.REACT_APP_APPWRITE_DATABASE;
                const collectionId = process.env.REACT_APP_APPWRITE_COLLECTION;
                const vaccinationCollectionId = process.env.REACT_APP_APPWRITE_VACCINATION_COLLECTION || "vaccinationdetails";

                // Fetch patient records excluding terminated ones (they are invalid and cannot proceed)
                const resp = await databases.listDocuments(databaseId, collectionId, [
                    Query.notEqual("status", "terminated")
                ]);
                const patients = resp.documents || [];

                // compute aggregates
                await fetchBiteSourcesData(patients);
                await fetchExposureCategoryData(patients);
                await fetchBarangayData(patients);
                await fetchTotalCasesData(patients);
                await fetchMonthlyCasesData(patients);
                await fetchAgeGroupData(patients);

                // Fetch vaccination sessions
                await fetchVaccineData(databases, databaseId, vaccinationCollectionId);
            } catch (err) {
                console.error('Error initializing Appwrite data for reports:', err);
            }
        })();
    }, []);

    // helper to normalize dose labels (e.g. 'day0' or 'd28' -> 'Day 0' / 'Day 28')
    const formatDoseLabel = (dose) => {
        if (!dose && dose !== 0) return '';
        const s = dose.toString().toLowerCase();
        const m = s.match(/(\d+)/);
        if (m && m[1]) return `Day ${m[1]}`;
        // fallback: capitalize
        return s.charAt(0).toUpperCase() + s.slice(1);
    };

    return ( 
        <div className="charts-container">
            <header className="raven-header">
                <h1>RABIES AWARENESS AND VIGILANCE EXPOSURE NETWORK</h1>
            </header>

            <main className="charts-content">
                <div className="title">
                    <h1>
                        Animal Bite Reports — Dashboard
                        <span>This dashboard provides real-time insights into rabies exposure across Tagum City. By visualizing case data and trends, it helps healthcare providers and local leaders respond swiftly and allocate resources effectively</span>
                    </h1>
                    
                </div>
                <section className="main-chart-sections">
                    <div className="distribution-title">
                        <h1>
                            {distributionInfo.title}
                            <span>{distributionInfo.subtitle}</span>
                        </h1>
                    </div>
                    <div className="map-wrapper">
                        <div className="shares-per-baranggay">
                            <div className="header-row">
                                <span>BARANGAY</span>
                                <span>SHARE</span>
                            </div>
                            <div className="main-rows">
                                {barangayData.map((barangay, index) => (
                                    <div key={index} className='row'>
                                        <span className='baranggay'>{barangay.name}</span>
                                        <span className='percentage'>{barangay.share}</span>
                                    </div>
                                ))}
                            </div>
                    </div>
                        <div className="choropleth-map">
                            <h2>CHOROPLETH MAP</h2>
                            <ChoroplethMap barangayData={barangayData} />
                        </div>
                    </div>
                    <div className="cases-wrapper">
                        <div className="total-cases">
                            <h2>TOTAL CASES THIS MONTH</h2>
                            <h1>{totalCasesData.count} cases</h1>
                            <span>Trend: {totalCasesData.trend} from {totalCasesData.period}</span>
                        </div>

                        <div className="bite-report">
                            <h2>ANNUAL BITE REPORTS</h2>
                            <h1>{biteReportData.count} reports</h1>
                            <span>Trend: {biteReportData.trend} from {biteReportData.period}</span>
                        </div>
                    </div>
                    <div className="sessions-wrapper">
                        <div className="vaxx-sessions">
                            <h2>Vaccination Sessions Completed</h2>
                            <div className="bar-chart">
                                {vaccineData.map((item, index) => (
                                    <div key={index} className="bar-item">
                                        <div className="percentage-label">{item.percentage}%</div>
                                        <div className="bar-container">
                                            <div 
                                                className="bar-fill" 
                                                style={{ height: `${item.percentage}%` }}
                                            ></div>
                                        </div>
                                        <div className="dose-label">{item.dose}</div>
                                    </div>
                                ))}
                            </div>
                            <span>Trend: +9% from this quarter.</span>
                        </div>
                        <div className="bite-sources">
                            <h2>Sources of Animal Bites in Tagum City</h2>
                            <span>This chart shows the distribution of rabies based on the type of biting animal reported.</span>
                            <div className="bite-list-header">
                                <span className="list-title">List of Animal Bites</span>
                                <span className="list-count">{totalBites} recorded</span>
                            </div>
                            <div className="horizontal-bar-chart">
                                {biteSourcesData.map((item, index) => (
                                    <div key={index} className="horizontal-bar-item">
                                        <div className="animal-name">{item.animal}</div>
                                        <div className="horizontal-bar-container">
                                            <div 
                                                className="horizontal-bar-fill" 
                                                style={{ width: `${item.percentage}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="cat-distribution">
                        <div className="categories-section">
                            <h2>Exposure Category Distribution</h2>
                            <div className="categories-list">
                                {exposureCategories.map((cat, index) => (
                                    <div key={index} className="category-item">
                                        <div className="category-header">
                                            <div className="category-indicator" style={{ backgroundColor: cat.color }}></div>
                                            <h3>{cat.category}</h3>
                                        </div>
                                        <p>{cat.description}</p>
                                    </div>
                                ))}
                            </div>
                        </div>      
                        <div className="pie-chart">
                            {hoveredSlice !== null && (
                                <div className="pie-tooltip">
                                    <strong>{exposureCategories[hoveredSlice].category}</strong>
                                    <div>{exposureCategories[hoveredSlice].percentage}%</div>
                                </div>
                            )}
                            <svg viewBox="0 0 200 200" className="pie-chart-svg">
                                {(() => {
                                    let currentAngle = 0;
                                    return exposureCategories.map((cat, index) => {
                                        const angle = (cat.percentage / 100) * 360;
                                        const startAngle = currentAngle;
                                        currentAngle += angle;
                                        
                                        const startAngleRad = (startAngle - 90) * (Math.PI / 180);
                                        const endAngleRad = (currentAngle - 90) * (Math.PI / 180);
                                        
                                        const x1 = 100 + 90 * Math.cos(startAngleRad);
                                        const y1 = 100 + 90 * Math.sin(startAngleRad);
                                        const x2 = 100 + 90 * Math.cos(endAngleRad);
                                        const y2 = 100 + 90 * Math.sin(endAngleRad);
                                        
                                        const largeArcFlag = angle > 180 ? 1 : 0;
                                        
                                        const pathData = [
                                            `M 100 100`,
                                            `L ${x1} ${y1}`,
                                            `A 90 90 0 ${largeArcFlag} 1 ${x2} ${y2}`,
                                            `Z`
                                        ].join(' ');
                                        
                                        return (
                                            <g 
                                                key={index} 
                                                className="pie-slice"
                                                onMouseEnter={() => setHoveredSlice(index)}
                                                onMouseLeave={() => setHoveredSlice(null)}
                                            >
                                                <path
                                                    d={pathData}
                                                    fill={cat.color}
                                                    stroke="#226b85"
                                                    strokeWidth="1"
                                                    className="pie-slice-path"
                                                />
                                            </g>
                                        );
                                    });
                                })()}
                            </svg>
                        </div>
                    </div>
                    <div className="monthly-cases">
                        <h2>Total Cases per Month</h2>
                        <div className="monthly-bar-chart">
                            {monthlyCasesData.map((item, index) => {
                                const maxCases = Math.max(...monthlyCasesData.map(d => d.cases));
                                const barHeight = (item.cases / maxCases) * 100;
                                
                                return (
                                    <div key={index} className="monthly-bar-item">
                                        <div className="monthly-bar-container">
                                            <div 
                                                className="monthly-bar-fill" 
                                                style={{ height: `${barHeight}%` }}
                                            ></div>
                                        </div>
                                        <div className="monthly-label">
                                            <span className="month-name">{item.month}</span>
                                            <span className="month-cases">{item.cases}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    <div className="age-group-pyramid">
                        <h2>Age Group (in thousands)</h2>
                        <div className="pyramid-header">
                            <span className="gender-label male-label">Male</span>
                            <span className="gender-label female-label">Female</span>
                        </div>
                        <div className="pyramid-chart">
                            {ageGroupData.map((item, index) => {
                                // values in raw counts
                                const maxValue = Math.max(...ageGroupData.flatMap(d => [d.male, d.female])) || 1;
                                // convert to thousands for scale but compute widths proportionally
                                const maxK = Math.max(1, maxValue / 1000);
                                const maleK = (item.male || 0) / 1000;
                                const femaleK = (item.female || 0) / 1000;
                                const maleWidth = (maleK / maxK) * 100;
                                const femaleWidth = (femaleK / maxK) * 100;

                                return (
                                    <div key={index} className="pyramid-row">
                                        <div className="male-bar" style={{ width: `${maleWidth}%` }}>
                                        </div>
                                        <div className="age-label">{item.ageRange}</div>
                                        <div className="female-bar" style={{ width: `${femaleWidth}%` }}>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="pyramid-scale">
                            {(() => {
                                const maxValue = Math.max(...ageGroupData.flatMap(d => [d.male, d.female])) || 0;
                                const steps = 4;
                                // compute scale in thousands
                                const maxK = Math.max(1, Math.ceil((maxValue / 1000) * 10) / 10); // round up to 0.1k
                                const left = [];
                                for (let i = steps; i >= 0; i--) left.push((i * maxK) / steps);
                                const right = [];
                                for (let i = 1; i <= steps; i++) right.push((i * maxK) / steps);
                                const all = left.concat(right);
                                return all.map((v, i) => {
                                    // display in 'k' with 1 decimal if <1 or integer if whole
                                    const display = v === 0 ? '0' : (v < 1 ? `${v.toFixed(2)}k` : `${(v % 1 === 0) ? v.toFixed(0) : v.toFixed(1)}k`);
                                    return <span key={i}>{display}</span>;
                                });
                            })()}
                        </div>
                        <div className="pyramid-footer">
                            <span className="footer-label">Age Group</span>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}

export default AnimalBiteReports;
