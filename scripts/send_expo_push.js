#!/usr/bin/env node
// Simple helper to send an Expo push notification from the terminal.
// Usage:
//   node scripts/send_expo_push.js <ExponentPushToken[...]> --status Verified --submission SUB-123 --patient "Doe, Jane"

const argv = process.argv.slice(2);
if (!argv.length) {
  console.error('Usage: node scripts/send_expo_push.js <TOKEN> [--status Verified|Terminated] [--submission ID] [--patient "Last, First"]');
  process.exit(1);
}

const token = argv[0];
const args = argv.slice(1);
const opts = {};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--status') opts.status = args[++i];
  else if (a === '--submission') opts.submission = args[++i];
  else if (a === '--patient') opts.patient = args[++i];
}

const status = (opts.status || 'Verified').toLowerCase();
const focus = status === 'terminated' ? 'Terminated' : 'Verified';
const submissionID = opts.submission || '';
const patientName = opts.patient || '';

const title = focus === 'Verified' ? 'Record Verified' : 'Record Terminated';
let body = '';
if (focus === 'Verified') {
  body = submissionID ? `Submission ${submissionID} has been verified.` : 'A submitted patient record has been verified.';
} else {
  body = submissionID ? `Submission ${submissionID} was terminated.` : 'A submitted patient record was terminated.';
}

const message = [{
  to: token,
  sound: 'default',
  title,
  body,
  data: {
    type: 'patient_status_changed',
    focusStatus: focus,
    submissionID,
    patientName,
  },
}];

(async () => {
  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
    const json = await res.json();
    console.log('Expo response status:', res.status);
    console.log(JSON.stringify(json, null, 2));
  } catch (err) {
    console.error('Send failed:', err);
    process.exit(2);
  }
})();
