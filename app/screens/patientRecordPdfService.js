import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';
import { Platform } from 'react-native';

const BASE64_ENCODING = FileSystem.EncodingType?.Base64 ?? 'base64';

const escapeHtml = (value) => {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const assetToDataUri = async (assetModule, mimeType) => {
  const asset = Asset.fromModule(assetModule);
  await asset.downloadAsync();

  const localUri = asset.localUri ?? asset.uri;
  if (!localUri) {
    throw new Error('Failed to load asset URI');
  }

  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: BASE64_ENCODING,
  });

  return `data:${mimeType};base64,${base64}`;
};

const uriToDataUri = async (uri, mimeType) => {
  if (!uri) return '';
  try {
    // If already a data URI, return as-is.
    if (typeof uri === 'string' && uri.startsWith('data:')) return uri;

    // Local file URI
    if (typeof uri === 'string' && (uri.startsWith('file:') || uri.startsWith(FileSystem.documentDirectory || ''))) {
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: BASE64_ENCODING });
      return `data:${mimeType};base64,${base64}`;
    }

    const target = `${FileSystem.cacheDirectory}pdf_asset_${Date.now()}_${Math.random().toString(16).slice(2)}.bin`;
    const result = await FileSystem.downloadAsync(uri, target);
    const base64 = await FileSystem.readAsStringAsync(result.uri, { encoding: BASE64_ENCODING });
    return `data:${mimeType};base64,${base64}`;
  } catch (e) {
    console.warn('Failed to convert URI to data URI:', e?.message || e);
    return '';
  }
};

const joinArray = (value) => (Array.isArray(value) ? value.filter(Boolean).join(', ') : value);

const formatMmDdYyyy = (dateValue) => {
  if (!dateValue) return '';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
};

const formatHhMmAmPm = (dateValue) => {
  if (!dateValue) return '';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
};

const formatDateValue = (value) => {
  if (!value) return '';
  const text = String(value).trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) return text;
  return formatMmDdYyyy(value);
};

const formatTimeValue = (value) => {
  if (!value) return '';
  const text = String(value).trim();
  if (/^\d{1,2}:\d{2}\s?(AM|PM)$/i.test(text)) return text;
  return formatHhMmAmPm(value);
};

const composeFullName = ({ lastName, firstName, middleName, suffix }) => {
  const parts = [];
  if (lastName) {
    const base = String(lastName).trim();
    const suffixText = String(suffix || '').trim();
    parts.push(suffixText ? `${base} ${suffixText}` : base);
  }
  const rest = [firstName, middleName].filter(Boolean).map(v => String(v).trim()).join(' ');
  if (rest) {
    return `${parts.join('')}${parts.length ? ', ' : ''}${rest}`.trim();
  }
  return parts.join('').trim();
};

const composeAddress = ({ purok, barangay, city }) => {
  return [purok, barangay, city].filter(Boolean).map(v => String(v).trim()).join(', ');
};

const makePatientRecordPayload = (doc = {}) => {
  const firstNonEmpty = (...values) => {
    for (const value of values) {
      if (value === null || value === undefined) continue;
      const text = String(value).trim();
      if (text) return value;
    }
    return '';
  };

  const asText = (value) => (value === null || value === undefined ? '' : String(value));

  const normalizeCommaAddress = (addressLine) => {
    if (!addressLine) return { purok: '', barangay: '', city: '', combined: '' };
    const parts = String(addressLine)
      .split(',')
      .map(v => v.trim())
      .filter(Boolean);
    const [purok, barangay, city] = [parts[0] || '', parts[1] || '', parts.slice(2).join(', ') || ''];
    return { purok, barangay, city, combined: parts.join(', ') };
  };

  const consultationDate = doc.consultationDate || doc.consultationDateTime || doc.consultation_time || doc.consultation_datetime;
  const consultationTime = doc.consultationTime || doc.consultation_time;

  const consultationDateText = formatMmDdYyyy(consultationDate);
  const consultationTimeText = consultationTime ? formatHhMmAmPm(consultationTime) : formatHhMmAmPm(consultationDate);
  const consultationDateTime = [consultationDateText, consultationTimeText].filter(Boolean).join(' ');

  const fallbackName = doc.name || doc.fullName || '';
  const fallbackAddress = doc.address || doc.addressLine || '';
  const parsedAddress = normalizeCommaAddress(fallbackAddress);

  const resolveConsultationDateTime = () => {
    const formattedCombined = firstNonEmpty(doc.consultationDateTime);
    if (formattedCombined) return asText(formattedCombined);

    // When printing from PatientRecordContent.js, we already have formatted pieces.
    const formattedDate = firstNonEmpty(doc.consultationDate);
    const formattedTime = firstNonEmpty(doc.consultationTime);
    if (formattedDate || formattedTime) {
      return [asText(formattedDate).trim(), asText(formattedTime).trim()].filter(Boolean).join('   ');
    }

    return consultationDateTime;
  };

  const animalTypeOther = firstNonEmpty(doc.animalTypeOther, doc.animal_type_other, doc.bitingAnimalOther);

  const resolveAnimalTypeValue = () => {
    if (Array.isArray(doc.animalType)) {
      const selected = [];
      if (doc.animalType.includes('Dog') || doc.animalType.includes('DOG')) selected.push('DOG');
      if (doc.animalType.includes('Cat') || doc.animalType.includes('CAT')) selected.push('CAT');
      if (doc.animalType.includes('Others') || doc.animalType.includes('OTHERS')) selected.push('OTHERS');
      if (!selected.length && animalTypeOther) selected.push('OTHERS');
      return selected.join(', ');
    }

    // When printing from PatientRecordContent.js, "Type of Biting Animal" might already
    // be a display string (e.g., "Dog, Cat" OR just the actual 'Others specify' text).
    // Normalize to ensure checkbox detection works.
    const display = asText(firstNonEmpty(doc.bitingAnimal, doc.animalType));
    const lower = display.toLowerCase();

    const selected = [];
    if (lower.includes('dog')) selected.push('DOG');
    if (lower.includes('cat')) selected.push('CAT');

    // If we have an explicit "Others specify" value, always treat as OTHERS.
    // Also treat strings containing "others" as OTHERS.
    if (String(animalTypeOther || '').trim() || lower.includes('others')) selected.push('OTHERS');

    // If we still can't detect anything but there is a non-empty string, assume it's an
    // "Others specify" entry from older formatting (e.g. bitingAnimal === 'gshsbs').
    if (!selected.length && display.trim()) {
      selected.push('OTHERS');
    }

    // Fallback: keep the original text so includesChecked still has a chance.
    return selected.length ? selected.join(', ') : display;
  };

  const resolveAnimalOwnershipValue = () => {
    const raw = firstNonEmpty(doc.animalOwnership, doc.ownership, doc.animalOwned, doc.animalOwnershipStatus);
    if (Array.isArray(raw)) return raw.filter(Boolean).map(v => String(v).trim().toUpperCase()).join(', ');
    return asText(raw).toUpperCase();
  };

  return {
    name:
      composeFullName({ lastName: doc.lastName, firstName: doc.firstName, middleName: doc.middleName, suffix: doc.suffix }) ||
      String(fallbackName || '').trim(),
    age: doc.age ?? '',
    dob: doc.dob || formatDateValue(doc.dateOfBirth),
    sex: doc.sex || '',
    civilStatus: doc.civilStatus || '',
    addressPurok: firstNonEmpty(doc.purok, doc.addressPurok, parsedAddress.purok),
    addressBarangay: firstNonEmpty(doc.barangay, doc.addressBarangay, parsedAddress.barangay),
    addressCity: firstNonEmpty(doc.city, doc.addressCity, parsedAddress.city),
    addressCombined: firstNonEmpty(parsedAddress.combined, fallbackAddress),
    contactNo: firstNonEmpty(doc.contactNumber, doc.contactNo, doc.contactNoText),
    consultationDateTime: resolveConsultationDateTime(),
    interviewedBy: doc.interviewedReferredBy || doc.interviewedBy || '',

    animalType: resolveAnimalTypeValue(),
    // Prefer explicit Appwrite key; if empty and animalType is OTHERS, fall back to display string.
    animalTypeOther: asText(animalTypeOther) || (String(resolveAnimalTypeValue() || '').includes('OTHERS') ? asText(doc.bitingAnimal) : ''),
    animalOwnership: resolveAnimalOwnershipValue(),
    exposureDate: formatDateValue(doc.exposureDate),
    exposureTime: formatTimeValue(doc.exposureTime),
    placeOfIncidence: doc.placeOfIncidence || '',
    bitingAnimalStatus: joinArray(doc.animalStatus) || doc.animalStatus || doc.bitingAnimalStatus || '',
    typeOfExposure: joinArray(doc.typeOfExposure) || doc.typeOfExposure || '',
    animalImmunized: firstNonEmpty(doc.animalImmunized, doc.immunizationReceived),
    animalImmunizedDate: formatDateValue(firstNonEmpty(doc.animalImmunizedDate, doc.immunizationDate)),

    prevAntiRabies: firstNonEmpty(doc.prevAntiRabies, doc.previousImmunization),
    prevAntiRabiesDate: formatDateValue(firstNonEmpty(doc.prevAntiRabiesDate, doc.prevImmunizationDate)),
    allergies: doc.historyOfAllergies || doc.allergies || '',

    weightKg: doc.weight || '',
    heightCm: doc.height || '',
    bp: doc.bp || '',
    temp: doc.temp || '',

    woundDescription: joinArray(doc.woundDescription) || doc.woundDescription || '',
    spontaneousBleeding: doc.spontaneousBleeding || '',
    inducedBleeding: doc.inducedBleeding || '',
    localWoundTreatment: doc.localWoundTreatment || '',
    washedWaterOnly: doc.washedWaterOnly || '',
    washedSoapWater: doc.washedSoapWater || '',
    tandok: doc.tandok || '',
    appliedGarlic: doc.appliedGarlic || '',
    tetanusImmunization: doc.tetanusImmunization || '',
    tetanusDateGiven: formatDateValue(doc.tetanusDateGiven),
    htig: doc.HTIG || '',
    htigDateGiven: formatDateValue(doc.htigDateGiven),

    siteInvolved: doc.siteInvolved || '',
    categoryOfExposure: String(doc.categoryOfExposure ?? ''),
    assessment: doc.assessmentDiagnosis || '',

    plan: Array.isArray(doc.plan) ? (doc.plan[0] || '') : (doc.plan || ''),
    tt_vaccine: doc.tt_vaccine,
    htig_vaccine: doc.htig_vaccine,
    pcec_pvrv_vaccine: doc.pcec_pvrv_vaccine,
    erig_vaccine: doc.erig_vaccine,
    hrig_vaccine: doc.hrig_vaccine,
    otherMed: doc.otherMed || '',
    tt_units: doc.tt_units ?? '',
    htig_units: doc.htig_units ?? '',
    pcec_pvrv_units: doc.pcec_pvrv_units ?? '',
    erig_units: doc.erig_units ?? '',
    hrig_units: doc.hrig_units ?? '',

    physician: doc.physicianName || doc.physician || '',
  };
};

const buildPatientRecordHtml = ({ choLogo, sealLogo, record, physicianSignatureDataUri }) => {
  const mock = record;

  const resolvedAddress = [mock.addressPurok, mock.addressBarangay, mock.addressCity]
    .map(v => String(v || '').trim())
    .filter(Boolean)
    .join(', ') || String(mock.addressCombined || '').trim();

  const isChecked = (value, expected) => String(value).toLowerCase() === String(expected).toLowerCase();

  const includesChecked = (value, expected) => {
    if (Array.isArray(value)) {
      return value.map(v => String(v).toLowerCase()).includes(String(expected).toLowerCase());
    }
    const text = String(value ?? '');
    return text.toLowerCase().includes(String(expected).toLowerCase());
  };

  const isTrue = (value) => {
    if (value === true) return true;
    if (value === false) return false;
    const text = String(value ?? '').trim().toLowerCase();
    return text === 'yes' || text === 'true' || text === '1';
  };

  const checkbox = (checked) => {
    const klass = checked ? 'box checked' : 'box';
    return `<span class="${klass}"></span>`;
  };

  const triCheckbox = (value) => {
    if (value === null || typeof value === 'undefined') return '<span class="box blank"></span>';
    return checkbox(isTrue(value));
  };

  const signatureBlock = physicianSignatureDataUri
    ? `<img class="signatureImg" src="${physicianSignatureDataUri}" />`
    : `<span class="fill xwide">&nbsp;</span>`;

  const animalTypeOtherText = String(mock.animalTypeOther || '').trim();

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    /* Folio: 8.5in x 13in */
    @page { size: 8.5in 13in; margin: 14mm 12mm; }
    body { margin: 0; background: #ffffff; color: #000; font-family: Arial, Helvetica, sans-serif; }

    /* Keep the record on a single folio page when possible */
    .scale { transform: scale(0.92); transform-origin: top left; width: 108.7%; }

    .small { font-size: 9px; }
    .tiny { font-size: 8px; }
    .title { font-size: 18px; font-weight: 700; letter-spacing: 0.6px; text-align: center; }
    .subtitle { font-size: 12px; font-weight: 700; text-align: center; margin-top: 6px; }
    .center { text-align: center; }
    .row { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
    .col { flex: 1; }

    .logos { display: flex; justify-content: center; align-items: center; gap: 18px; margin: 8px 0 6px; }
    .logo { width: 54px; height: 54px; object-fit: contain; }

    .line { border-top: 1px solid #000; margin: 6px 0; }

    .form { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .form td { border: 1px solid #000; padding: 3px 5px; vertical-align: top; }
    .label { font-weight: 700; font-size: 9px; }
    .value { font-size: 10px; font-weight: 600; }
    .muted { font-size: 9px; font-weight: 700; text-align: center; background: #f2f2f2; }

    .inline { display: inline-flex; align-items: center; gap: 4px; margin-right: 10px; }
    .box { width: 10px; height: 10px; border: 1px solid #000; display: inline-block; position: relative; top: 1px; }
    .box.checked::after { content: "✓"; position: absolute; left: 1px; top: -2px; font-size: 12px; }
    .box.blank { border: none; }

    .fill { display: inline-block; min-width: 70px; border-bottom: 1px solid #000; padding: 0 2px 1px; }
    .fill.wide { min-width: 140px; }
    .fill.xwide { min-width: 220px; }
    .fill.full { min-width: 100%; }
    .fill.units { min-width: 48px; text-align: center; }

    .vaxRow { display: flex; align-items: center; margin-bottom: 4px; }
    .vaxLeft { width: 190px; display: inline-flex; align-items: center; gap: 6px; }
    .vaxRight { display: inline-flex; align-items: center; gap: 6px; }
    .vaxUnitsLabel { font-weight: 700; font-size: 9px; }

    .signatureImg { height: 28px; width: 220px; object-fit: contain; border-bottom: 1px solid #000; display: block; margin-top: 2px; }
    .signatureName { font-size: 10px; font-weight: 700; margin-top: 2px; }

    .spacer8 { height: 8px; }
    .spacer12 { height: 12px; }

    .noBorder { border: none !important; }
  </style>
</head>
<body>

  <div class="scale">

  <div class="row">
    <div class="col tiny">
      <div>F-CHO-017</div>
      <div>Revision No.:</div>
      <div>Effectivity Date: 5 may, 2019</div>
    </div>

    <div class="col">
      <div class="logos">
        <img class="logo" src="${choLogo}" />
        <img class="logo" src="${sealLogo}" />
      </div>
      <div class="center small">Republic of the Philippines</div>
      <div class="center small">Province of Davao del Norte</div>
      <div class="center small">City of Tagum</div>
      <div class="spacer8"></div>
      <div class="title">CITY HEALTH OFFICE</div>
      <div class="spacer12"></div>
      <div class="subtitle">ANIMAL BITE TREATMENT CENTER PATIENT HEALTH RECORD</div>
    </div>

    <div class="col tiny">
      <div>Time Received by the BHW: ____________</div>
      <div>Time Received by the NOD: ____________</div>
      <div>Time Received by the DOCTOR: ____________</div>
      <div>Time Released by the DOCTOR: ____________</div>
    </div>
  </div>

  <div class="line"></div>

  <!-- Patient info block -->
  <table class="form">
    <tr>
      <td colspan="3">
        <div class="label">Name:</div>
        <div class="small">(LAST Name)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(FIRST Name)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(MIDDLE Name)</div>
        <div class="value">${escapeHtml(mock.name)}</div>
      </td>
      <td>
        <div class="label">Sex:</div>
        <div class="small">
          <span class="inline">${checkbox(isChecked(mock.sex, 'Male'))}<span>Male</span></span>
          <span class="inline">${checkbox(isChecked(mock.sex, 'Female'))}<span>Female</span></span>
        </div>
      </td>
      <td>
        <div class="label">Status:</div>
        <div class="small">
          <span class="inline">${checkbox(includesChecked(mock.civilStatus, 'single'))}<span>Single</span></span>
          <span class="inline">${checkbox(includesChecked(mock.civilStatus, 'married'))}<span>Married</span></span>
          <span class="inline">${checkbox(includesChecked(mock.civilStatus, 'widow') || includesChecked(mock.civilStatus, 'widowed'))}<span>Widow</span></span>
        </div>
      </td>
    </tr>

    <tr>
      <td style="width: 14%">
        <div class="label">Age:</div>
        <div class="value">${escapeHtml(mock.age)}</div>
      </td>
      <td colspan="2" style="width: 36%">
        <div class="label">Date of Birth:</div>
        <div class="value">${escapeHtml(mock.dob)}</div>
      </td>
      <td colspan="2">
        <div class="label">Address:</div>
        <div class="small">(Purok)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(Barangay)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(City)</div>
        <div class="value">${escapeHtml(resolvedAddress)}</div>
      </td>
    </tr>

    <tr>
      <td colspan="2">
        <div class="label">Contact No.:</div>
        <div class="value">${escapeHtml(mock.contactNo)}</div>
      </td>
      <td colspan="3">
        <div class="label">Date &amp; Time of Consultation:</div>
        <div class="value">${escapeHtml(mock.consultationDateTime)}</div>
      </td>
    </tr>

    <tr>
      <td colspan="5">
        <div class="label">Interviewed &amp; Referred by:</div>
        <div class="value">${escapeHtml(mock.interviewedBy)}</div>
      </td>
    </tr>

    <tr><td class="muted" colspan="5">PERTINENT DATA</td></tr>

    <tr>
      <td colspan="5">
        <div class="label">Type of Biting Animal:</div>
        <div class="small">
          <span class="inline">${checkbox(includesChecked(mock.animalType, 'DOG'))}<span>DOG</span></span>
          <span class="inline">${checkbox(includesChecked(mock.animalType, 'CAT'))}<span>CAT</span></span>
          <span class="inline">${checkbox(includesChecked(mock.animalType, 'OTHERS'))}<span>Others (Specify)</span></span>
          <span class="fill wide">${escapeHtml(animalTypeOtherText)}</span>
        </div>
        <div class="small" style="margin-top: 4px;">
          <span class="inline">${checkbox(includesChecked(mock.animalOwnership, 'PET'))}<span>PET</span></span>
          <span class="inline">${checkbox(includesChecked(mock.animalOwnership, 'STRAY'))}<span>STRAY</span></span>
        </div>
      </td>
    </tr>

    <tr>
      <td colspan="2">
        <div class="label">Date of Exposure:</div>
        <div class="value">${escapeHtml(mock.exposureDate)}</div>
      </td>
      <td>
        <div class="label">Time of Exposure:</div>
        <div class="value">${escapeHtml(mock.exposureTime)}</div>
      </td>
      <td colspan="2">
        <div class="label">Place of Incidence (Purok):</div>
        <div class="value">${escapeHtml(mock.placeOfIncidence)}</div>
      </td>
    </tr>

    <tr>
      <td colspan="2">
        <div class="label">Status of Biting Animal:</div>
        <div class="small">
          <span class="inline">${checkbox(includesChecked(mock.bitingAnimalStatus, 'Alive'))}<span>Alive</span></span>
          <span class="inline">${checkbox(includesChecked(mock.bitingAnimalStatus, 'Dead'))}<span>Dead</span></span>
          <span class="inline">${checkbox(includesChecked(mock.bitingAnimalStatus, 'Lost'))}<span>Lost</span></span>
          <span class="inline">${checkbox(includesChecked(mock.bitingAnimalStatus, 'Killed'))}<span>Killed</span></span>
        </div>
      </td>
      <td colspan="3">
        <div class="label">Type of Exposure:</div>
        <div class="small">
          <span class="inline">${checkbox(includesChecked(mock.typeOfExposure, 'Non-Bite'))}<span>Non-Bite</span></span>
          <span class="inline">${checkbox(includesChecked(mock.typeOfExposure, 'Bite'))}<span>Bite</span></span>
          <span class="inline">${checkbox(includesChecked(mock.typeOfExposure, 'Provoked'))}<span>Provoked</span></span>
          <span class="inline">${checkbox(includesChecked(mock.typeOfExposure, 'Unprovoked'))}<span>Unprovoked</span></span>
        </div>
      </td>
    </tr>

    <tr>
      <td colspan="5">
        <div class="label">Immunization received by BITING ANIMAL:</div>
        <div class="small">
          <span class="inline">${checkbox(isChecked(mock.animalImmunized, 'Yes'))}<span>Yes</span></span>
          <span class="label" style="font-weight:700;">Date</span>
          <span class="fill wide">${escapeHtml(mock.animalImmunizedDate)}</span>
          <span class="inline" style="margin-left: 16px;">${checkbox(isChecked(mock.animalImmunized, 'No'))}<span>No</span></span>
        </div>
      </td>
    </tr>

    <tr><td class="muted" colspan="5">PERTINENT PAST MEDICAL HISTORY</td></tr>

    <tr>
      <td colspan="5">
        <div class="label">Previous Immunization (Anti-Rabies) of PATIENT:</div>
        <div class="small">
          <span class="inline">${checkbox(isChecked(mock.prevAntiRabies, 'Yes'))}<span>Yes</span></span>
          <span class="label" style="font-weight:700;">Date</span>
          <span class="fill wide">${escapeHtml(mock.prevAntiRabiesDate)}</span>
          <span class="inline" style="margin-left: 16px;">${checkbox(isChecked(mock.prevAntiRabies, 'No'))}<span>No</span></span>
        </div>
      </td>
    </tr>

    <tr>
      <td colspan="5">
        <div class="label">History of Allergies of PATIENT:</div>
        <div class="value">${escapeHtml(mock.allergies)}</div>
      </td>
    </tr>

    <tr><td class="muted" colspan="5">PERTINENT PHYSICAL EXAMINATION FINDINGS</td></tr>

    <tr>
      <td>
        <div class="label">Weight (kg):</div>
        <div class="value">${escapeHtml(mock.weightKg)}</div>
      </td>
      <td>
        <div class="label">Height (cm):</div>
        <div class="value">${escapeHtml(mock.heightCm)}</div>
      </td>
      <td>
        <div class="label">BP:</div>
        <div class="value">${escapeHtml(mock.bp)}</div>
      </td>
      <td colspan="2">
        <div class="label">Temp.:</div>
        <div class="value">${escapeHtml(mock.temp)}</div>
      </td>
    </tr>

    <tr>
      <td colspan="5">
        <div class="label">Description of Wound:</div>
        <div class="small">
          <span class="inline">${checkbox(includesChecked(mock.woundDescription, 'Abrasion'))}<span>Abrasion</span></span>
          <span class="inline">${checkbox(includesChecked(mock.woundDescription, 'Scratch'))}<span>Scratch</span></span>
          <span class="inline">${checkbox(includesChecked(mock.woundDescription, 'Punctured'))}<span>Punctured Wound</span></span>
          <span class="inline">${checkbox(includesChecked(mock.woundDescription, 'Laceration'))}<span>Laceration</span></span>
          <span class="inline">${checkbox(includesChecked(mock.woundDescription, 'Avulsed'))}<span>Avulsed Wound</span></span>
        </div>
      </td>
    </tr>

    <tr>
      <td colspan="2">
        <div class="label">Spontaneous Bleeding:</div>
        <div class="small">
          <span class="inline">${checkbox(includesChecked(mock.spontaneousBleeding, 'With'))}<span>With</span></span>
          <span class="inline">${checkbox(includesChecked(mock.spontaneousBleeding, 'Without'))}<span>Without</span></span>
        </div>
      </td>
      <td colspan="3">
        <div class="label">Induced bleeding:</div>
        <div class="small">
          <span class="inline">${checkbox(isChecked(mock.inducedBleeding, 'Yes'))}<span>Yes</span></span>
          <span class="inline">${checkbox(isChecked(mock.inducedBleeding, 'No'))}<span>No</span></span>
        </div>
      </td>
    </tr>

    <tr>
      <td colspan="2">
        <div class="label">Local Wound Treatment:</div>
        <div class="small">
          <span class="inline">${checkbox(isChecked(mock.localWoundTreatment, 'Yes'))}<span>Yes</span></span>
          <span class="inline">${checkbox(isChecked(mock.localWoundTreatment, 'No'))}<span>No</span></span>
        </div>
      </td>
      <td colspan="3">
        <div class="label">Washed w/ Water Only:</div>
        <div class="small">
          <span class="inline">${checkbox(isChecked(mock.washedWaterOnly, 'Yes'))}<span>Yes</span></span>
          <span class="inline">${checkbox(isChecked(mock.washedWaterOnly, 'No'))}<span>No</span></span>
        </div>
      </td>
    </tr>

    <tr>
      <td colspan="2">
        <div class="label">Washed w/ Soap &amp; Water:</div>
        <div class="small">
          <span class="inline">${checkbox(isChecked(mock.washedSoapWater, 'Yes'))}<span>Yes</span></span>
          <span class="inline">${checkbox(isChecked(mock.washedSoapWater, 'No'))}<span>No</span></span>
        </div>
      </td>
      <td colspan="3">
        <div class="label">Tandok:</div>
        <div class="small">
          <span class="inline">${checkbox(isChecked(mock.tandok, 'Yes'))}<span>Yes</span></span>
          <span class="inline">${checkbox(isChecked(mock.tandok, 'No'))}<span>No</span></span>
        </div>
      </td>
    </tr>

    <tr>
      <td colspan="2">
        <div class="label">Applied Garlic etc.:</div>
        <div class="small">
          <span class="inline">${checkbox(isChecked(mock.appliedGarlic, 'Yes'))}<span>Yes</span></span>
          <span class="inline">${checkbox(isChecked(mock.appliedGarlic, 'No'))}<span>No</span></span>
        </div>
      </td>
      <td colspan="3">
        <div class="label">Tetanus Immunization:</div>
        <div class="small">
          <span class="inline">${checkbox(isChecked(mock.tetanusImmunization, 'Yes'))}<span>Yes</span></span>
          <span class="inline">${checkbox(isChecked(mock.tetanusImmunization, 'No'))}<span>No</span></span>
          <span class="label" style="font-weight:700; margin-left: 10px;">Date Given:</span>
          <span class="fill wide">${escapeHtml(mock.tetanusDateGiven)}</span>

          <span class="label" style="font-weight:700; margin-left: 10px;">HTIG:</span>
          <span class="inline">${checkbox(isChecked(mock.htig, 'Yes'))}<span>Yes</span></span>
          <span class="inline">${checkbox(isChecked(mock.htig, 'No'))}<span>No</span></span>
        </div>
      </td>
    </tr>

    <tr>
      <td colspan="5">
        <div class="label">Site Involved:</div>
        <div class="value">${escapeHtml(mock.siteInvolved)}</div>
      </td>
    </tr>

    <tr>
      <td colspan="2">
        <div class="label">CATEGORY OF EXPOSURE:</div>
        <div class="small">
          <span class="inline">${checkbox(isChecked(mock.categoryOfExposure, 'I'))}<span>I</span></span>
          <span class="inline">${checkbox(isChecked(mock.categoryOfExposure, 'II'))}<span>II</span></span>
          <span class="inline">${checkbox(isChecked(mock.categoryOfExposure, 'III'))}<span>III</span></span>
        </div>
      </td>
      <td colspan="3">
        <div class="label">Plan:</div>
        <div class="small">
          <span class="inline">${checkbox(isChecked(mock.plan, 'PrEP'))}<span>PrEP</span></span>
          <span class="inline">${checkbox(isChecked(mock.plan, 'PEP'))}<span>PEP</span></span>
          <span class="inline">${checkbox(isChecked(mock.plan, 'Booster'))}<span>Booster</span></span>
        </div>
      </td>
    </tr>

    <tr>
      <td colspan="5">
        <div class="label">Assessment:</div>
        <div class="value">${escapeHtml(mock.assessment)}</div>
      </td>
    </tr>

    <tr>
      <td colspan="5">
        <div class="label">TREATMENT &amp; VACCINES:</div>
        <div class="small" style="margin-top: 2px;">
          <div class="vaxRow">
            <span class="vaxLeft"><span class="inline">${triCheckbox(mock.tt_vaccine)}<span>TETANUS TOXOID (TT)</span></span></span>
            <span class="vaxRight"><span class="vaxUnitsLabel">No. of units:</span><span class="fill units">${escapeHtml(mock.tt_units)}</span></span>
          </div>
          <div class="vaxRow">
            <span class="vaxLeft"><span class="inline">${triCheckbox(mock.htig_vaccine)}<span>HTIG</span></span></span>
            <span class="vaxRight"><span class="vaxUnitsLabel">No. of units:</span><span class="fill units">${escapeHtml(mock.htig_units)}</span></span>
          </div>
          <div class="vaxRow">
            <span class="vaxLeft"><span class="inline">${triCheckbox(mock.pcec_pvrv_vaccine)}<span>PCEC/PVRV</span></span></span>
            <span class="vaxRight"><span class="vaxUnitsLabel">No. of units:</span><span class="fill units">${escapeHtml(mock.pcec_pvrv_units)}</span></span>
          </div>
          <div class="vaxRow">
            <span class="vaxLeft"><span class="inline">${triCheckbox(mock.erig_vaccine)}<span>ERIG</span></span></span>
            <span class="vaxRight"><span class="vaxUnitsLabel">No. of units:</span><span class="fill units">${escapeHtml(mock.erig_units)}</span></span>
          </div>
          <div class="vaxRow" style="margin-bottom: 0;">
            <span class="vaxLeft"><span class="inline">${triCheckbox(mock.hrig_vaccine)}<span>HRIG</span></span></span>
            <span class="vaxRight"><span class="vaxUnitsLabel">No. of units:</span><span class="fill units">${escapeHtml(mock.hrig_units)}</span></span>
          </div>
        </div>
      </td>
    </tr>

    <tr>
      <td colspan="5">
        <div class="label">OTHERS:</div>
        <div class="value">${escapeHtml(mock.otherMed)}</div>
      </td>
    </tr>

    <tr>
      <td colspan="5">
        <div class="label">PHYSICIAN (Name &amp; Signature):</div>
        ${signatureBlock}
        <div class="signatureName">${escapeHtml(mock.physician)}</div>
      </td>
    </tr>

  </table>

</div>

</body>
</html>
`;
};

const printHtmlToPdf = async ({ html, filenamePrefix }) => {
  const { uri } = await Print.printToFileAsync({ html });
  const filename = `${filenamePrefix}-${Date.now()}.pdf`;

  const outDir = `${FileSystem.documentDirectory}patient-records/`;
  await FileSystem.makeDirectoryAsync(outDir, { intermediates: true }).catch(() => {});
  const appFileUri = `${outDir}${filename}`;
  await FileSystem.copyAsync({ from: uri, to: appFileUri });

  if (Platform.OS === 'android' && FileSystem.StorageAccessFramework) {
    try {
      const perms = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (perms.granted) {
        const base64 = await FileSystem.readAsStringAsync(appFileUri, {
          encoding: BASE64_ENCODING,
        });
        const destUri = await FileSystem.StorageAccessFramework.createFileAsync(
          perms.directoryUri,
          filename,
          'application/pdf'
        );
        await FileSystem.writeAsStringAsync(destUri, base64, {
          encoding: BASE64_ENCODING,
        });
        return { uri: destUri, savedTo: 'device', filename };
      }
    } catch {
      // fall back to sharing below
    }
  }

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(appFileUri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Patient Record PDF',
      UTI: 'com.adobe.pdf',
    });
  }

  return { uri: appFileUri, savedTo: 'app', filename };
};

export const printPatientRecordPdf = async ({ doc, signatureImageUri, prescriptionImageUrl }) => {
  const choLogo = await assetToDataUri(require('../assets/CHO-logo.jpg'), 'image/jpeg');
  const sealLogo = await assetToDataUri(require('../assets/seal-tagum-logo.png'), 'image/png');
  const record = makePatientRecordPayload(doc);
  // Only embed the physician signature image. Do NOT fall back to the prescription image.
  // Keeping prescriptionImageUrl param for backwards compatibility with callers.
  void prescriptionImageUrl;
  const physicianSignatureDataUri = await uriToDataUri(signatureImageUri, 'image/png');
  const html = buildPatientRecordHtml({ choLogo, sealLogo, record, physicianSignatureDataUri });
  return printHtmlToPdf({ html, filenamePrefix: 'Patient-Record' });
};

export const printMockPatientRecordPdf = async () => {
  const choLogo = await assetToDataUri(require('../assets/CHO-logo.jpg'), 'image/jpeg');
  const sealLogo = await assetToDataUri(require('../assets/seal-tagum-logo.png'), 'image/png');

  // Mock data (as requested)
  const firstName = 'JOHN';
  const lastName = 'DOE';
  const middleName = 'A.';
  const name = `${lastName}, ${firstName} ${middleName}`;

  const mock = {
    name,
    age: '28',
    dob: '01/20/1998',
    sex: 'Male',
    civilStatus: 'Single',
    addressPurok: 'PUROK 1',
    addressBarangay: 'BARANGAY MAGUGPO',
    addressCity: 'TAGUM CITY',
    contactNo: '0917-123-4567',
    consultationDateTime: '01/20/2026 10:30 AM',
    interviewedBy: 'BHW JANE SMITH',

    animalType: 'DOG',
    animalOwnership: 'PET',
    exposureDate: '01/19/2026',
    exposureTime: '08:15 PM',
    placeOfIncidence: 'PUROK 3',
    bitingAnimalStatus: 'Alive',
    typeOfExposure: 'Bite',
    animalImmunized: 'Yes',
    animalImmunizedDate: '12/01/2025',

    prevAntiRabies: 'No',
    prevAntiRabiesDate: '',
    allergies: 'NONE',

    weightKg: '65',
    heightCm: '170',
    bp: '120/80',
    temp: '36.8',

    woundDescription: 'Abrasion',
    spontaneousBleeding: 'Without',
    inducedBleeding: 'No',

    localWoundTreatment: 'Yes',
    washedWaterOnly: 'No',
    washedSoapWater: 'Yes',
    tandok: 'No',
    appliedGarlic: 'No',

    tetanusImmunization: 'Yes',
    tetanusDateGiven: '01/19/2026',
    htig: 'No',
    htigDateGiven: '',

    siteInvolved: 'RIGHT HAND',
    categoryOfExposure: 'II',
    assessment: 'ANIMAL BITE (DOG)',

    plan: 'PEP',
    tt_vaccine: true,
    htig_vaccine: false,
    pcec_pvrv_vaccine: true,
    erig_vaccine: true,
    hrig_vaccine: false,
    otherMed: 'VITAMIN C',
    tt_units: 1,
    htig_units: 0,
    pcec_pvrv_units: 4,
    erig_units: 2,
    hrig_units: 0,

    physician: 'DR. JUAN DELA CRUZ',
  };

  const html = buildPatientRecordHtml({ choLogo, sealLogo, record: mock, physicianSignatureDataUri: '' });
  return printHtmlToPdf({ html, filenamePrefix: 'Patient-Record-MOCK' });
};
