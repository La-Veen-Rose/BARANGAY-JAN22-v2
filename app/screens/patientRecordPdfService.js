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

    othersTT: 'Yes',
    othersHTIG: 'No',

    siteInvolved: 'RIGHT HAND',
    categoryOfExposure: 'II',
    assessment: 'ANIMAL BITE (DOG)',

    plan: 'PEP',
    passiveVaccine: 'ERIG',
    noOfUnits: '2',
    activeVaccine: 'PVRV',
    antibiotic: 'AMOXICILLIN',
    analgesic: 'IBUPROFEN',

    physician: 'DR. JUAN DELA CRUZ',
  };

  const isChecked = (value, expected) => String(value).toLowerCase() === String(expected).toLowerCase();

  const checkbox = (checked) => {
    const klass = checked ? 'box checked' : 'box';
    return `<span class="${klass}"></span>`;
  };

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    /* Folio: 8.5in x 13in */
    @page { size: 8.5in 13in; margin: 22mm 16mm; }
    body { margin: 0; background: #ffffff; color: #000; font-family: Arial, Helvetica, sans-serif; }

    .small { font-size: 9px; }
    .tiny { font-size: 8px; }
    .title { font-size: 18px; font-weight: 700; letter-spacing: 0.6px; text-align: center; }
    .subtitle { font-size: 12px; font-weight: 700; text-align: center; margin-top: 6px; }
    .center { text-align: center; }
    .row { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
    .col { flex: 1; }

    .logos { display: flex; justify-content: center; align-items: center; gap: 18px; margin: 8px 0 6px; }
    .logo { width: 54px; height: 54px; object-fit: contain; }

    .line { border-top: 1px solid #000; margin: 10px 0; }

    .form { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .form td { border: 1px solid #000; padding: 4px 6px; vertical-align: top; }
    .label { font-weight: 700; font-size: 9px; }
    .value { font-size: 10px; font-weight: 600; }
    .muted { font-size: 9px; font-weight: 700; text-align: center; background: #f2f2f2; }

    .inline { display: inline-flex; align-items: center; gap: 4px; margin-right: 10px; }
    .box { width: 10px; height: 10px; border: 1px solid #000; display: inline-block; position: relative; top: 1px; }
    .box.checked::after { content: "✓"; position: absolute; left: 1px; top: -2px; font-size: 12px; }

    .fill { display: inline-block; min-width: 70px; border-bottom: 1px solid #000; padding: 0 2px 1px; }
    .fill.wide { min-width: 140px; }
    .fill.xwide { min-width: 220px; }
    .fill.full { min-width: 100%; }

    .spacer8 { height: 8px; }
    .spacer12 { height: 12px; }

    .noBorder { border: none !important; }
  </style>
</head>
<body>

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
          <span class="inline">${checkbox(isChecked(mock.civilStatus, 'Single'))}<span>Single</span></span>
          <span class="inline">${checkbox(isChecked(mock.civilStatus, 'Married'))}<span>Married</span></span>
          <span class="inline">${checkbox(isChecked(mock.civilStatus, 'Widow'))}<span>Widow</span></span>
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
        <div class="value">${escapeHtml(mock.addressPurok)}, ${escapeHtml(mock.addressBarangay)}, ${escapeHtml(mock.addressCity)}</div>
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
          <span class="inline">${checkbox(isChecked(mock.animalType, 'DOG'))}<span>DOG</span></span>
          <span class="inline">${checkbox(isChecked(mock.animalType, 'CAT'))}<span>CAT</span></span>
          <span class="inline">${checkbox(isChecked(mock.animalType, 'OTHERS'))}<span>Others (Specify)</span></span>
          <span class="fill wide">&nbsp;</span>
        </div>
        <div class="small" style="margin-top: 4px;">
          <span class="inline">${checkbox(isChecked(mock.animalOwnership, 'PET'))}<span>PET</span></span>
          <span class="inline">${checkbox(isChecked(mock.animalOwnership, 'STRAY'))}<span>STRAY</span></span>
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
          <span class="inline">${checkbox(isChecked(mock.bitingAnimalStatus, 'Alive'))}<span>Alive</span></span>
          <span class="inline">${checkbox(isChecked(mock.bitingAnimalStatus, 'Dead'))}<span>Dead</span></span>
          <span class="inline">${checkbox(isChecked(mock.bitingAnimalStatus, 'Lost'))}<span>Lost</span></span>
          <span class="inline">${checkbox(isChecked(mock.bitingAnimalStatus, 'Killed'))}<span>Killed</span></span>
        </div>
      </td>
      <td colspan="3">
        <div class="label">Type of Exposure:</div>
        <div class="small">
          <span class="inline">${checkbox(isChecked(mock.typeOfExposure, 'Non-Bite'))}<span>Non-Bite</span></span>
          <span class="inline">${checkbox(isChecked(mock.typeOfExposure, 'Bite'))}<span>Bite</span></span>
          <span class="inline">${checkbox(isChecked(mock.typeOfExposure, 'Provoked'))}<span>Provoked</span></span>
          <span class="inline">${checkbox(isChecked(mock.typeOfExposure, 'Unprovoked'))}<span>Unprovoked</span></span>
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
          <span class="inline">${checkbox(isChecked(mock.woundDescription, 'Abrasion'))}<span>Abrasion</span></span>
          <span class="inline">${checkbox(isChecked(mock.woundDescription, 'Scratch'))}<span>Scratch</span></span>
          <span class="inline">${checkbox(isChecked(mock.woundDescription, 'Punctured Wound'))}<span>Punctured Wound</span></span>
          <span class="inline">${checkbox(isChecked(mock.woundDescription, 'Laceration'))}<span>Laceration</span></span>
          <span class="inline">${checkbox(isChecked(mock.woundDescription, 'Avulsed Wound'))}<span>Avulsed Wound</span></span>
        </div>
      </td>
    </tr>

    <tr>
      <td colspan="2">
        <div class="label">Spontaneous Bleeding:</div>
        <div class="small">
          <span class="inline">${checkbox(isChecked(mock.spontaneousBleeding, 'With'))}<span>With</span></span>
          <span class="inline">${checkbox(isChecked(mock.spontaneousBleeding, 'Without'))}<span>Without</span></span>
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
        <div class="label">Assessment:</div>
        <div class="value">${escapeHtml(mock.assessment)}</div>
      </td>
    </tr>

    <tr>
      <td colspan="2">
        <div class="label">Plan:</div>
        <div class="small">
          <span class="inline">${checkbox(isChecked(mock.plan, 'PrEP'))}<span>PrEP</span></span>
          <span class="inline">${checkbox(isChecked(mock.plan, 'PEP'))}<span>PEP</span></span>
          <span class="inline">${checkbox(isChecked(mock.plan, 'Booster'))}<span>Booster</span></span>
        </div>
      </td>
      <td colspan="3">
        <div class="label">Passive Vaccine:</div>
        <div class="small">
          <span class="inline">${checkbox(isChecked(mock.passiveVaccine, 'ERIG'))}<span>ERIG</span></span>
          <span class="inline">${checkbox(isChecked(mock.passiveVaccine, 'HRIG'))}<span>HRIG</span></span>
          <span class="label" style="font-weight:700; margin-left: 10px;">No. of units:</span>
          <span class="fill wide">${escapeHtml(mock.noOfUnits)}</span>
        </div>
      </td>
    </tr>

    <tr>
      <td colspan="2">
        <div class="label">Active Vaccine:</div>
        <div class="small">
          <span class="inline">${checkbox(isChecked(mock.activeVaccine, 'PVRV'))}<span>PVRV</span></span>
          <span class="inline">${checkbox(isChecked(mock.activeVaccine, 'PCECV'))}<span>PCECV</span></span>
          <span class="inline">${checkbox(isChecked(mock.activeVaccine, 'Others'))}<span>Others</span></span>
          <span class="fill wide">&nbsp;</span>
        </div>
      </td>
      <td colspan="3">
        <div class="label">Analgesic/ Anti-Inflammatory:</div>
        <div class="value">${escapeHtml(mock.analgesic)}</div>
      </td>
    </tr>

    <tr>
      <td colspan="2">
        <div class="label">Antibiotic:</div>
        <div class="value">${escapeHtml(mock.antibiotic)}</div>
      </td>
      <td colspan="3">
        <div class="label">PHYSICIAN (Name &amp; Signature):</div>
        <div class="value">${escapeHtml(mock.physician)}</div>
      </td>
    </tr>

    <tr>
      <td colspan="5">
        <div class="label">Others:</div>
        <div class="small">
          <span class="inline">${checkbox(isChecked(mock.othersTT, 'Yes'))}<span>TT</span></span>
          <span class="inline" style="margin-left: 14px;">${checkbox(isChecked(mock.othersHTIG, 'Yes'))}<span>HTIG</span></span>
        </div>
      </td>
    </tr>

  </table>

</body>
</html>
`;

  const { uri } = await Print.printToFileAsync({ html });
  const filename = `Patient-Record-MOCK-${Date.now()}.pdf`;

  // Always copy into app storage (so we have a stable file even if cache is cleared)
  const outDir = `${FileSystem.documentDirectory}patient-records/`;
  await FileSystem.makeDirectoryAsync(outDir, { intermediates: true }).catch(() => {});
  const appFileUri = `${outDir}${filename}`;
  await FileSystem.copyAsync({ from: uri, to: appFileUri });

  // Android: prompt user to pick a folder (can choose Downloads) and save there
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

  // iOS (and Android fallback): open share sheet so user can save to Files/Drive/etc.
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
