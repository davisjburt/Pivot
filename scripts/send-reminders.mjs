import webpush from 'web-push';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:reminders@example.com';

if (!serviceAccountJson || !vapidPublicKey || !vapidPrivateKey) {
  throw new Error('Missing required secrets: FIREBASE_SERVICE_ACCOUNT_JSON, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY');
}

const serviceAccount = JSON.parse(serviceAccountJson);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

function getLocalTimeParts(timezone, now) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(now);
  const get = (type) => parts.find(p => p.type === type)?.value ?? '';
  return {
    localDate: `${get('year')}-${get('month')}-${get('day')}`,
    localTime: `${get('hour')}:${get('minute')}`
  };
}

function isWithinFiveMinuteWindow(target, current) {
  const [th, tm] = target.split(':').map(Number);
  const [ch, cm] = current.split(':').map(Number);
  const targetMins = th * 60 + tm;
  const currentMins = ch * 60 + cm;
  return currentMins >= targetMins && currentMins < targetMins + 5;
}

async function run() {
  const now = new Date();
  const snap = await db.collection('reminderSubscriptions').get();
  let sent = 0;
  let removed = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const subscription = data.subscription;
    const timezone = data.timezone;
    const time = data.time;
    const enabled = data.remindersEnabled !== false;
    if (!subscription || !timezone || !time || !enabled) continue;

    const { localDate, localTime } = getLocalTimeParts(timezone, now);
    const alreadySentToday = data.lastSentLocalDate === localDate;
    if (!isWithinFiveMinuteWindow(time, localTime) || alreadySentToday) continue;

    try {
      const payload = JSON.stringify({
        title: 'Time to log your weight!',
        body: 'Keep your streak going. Tap here to log your weight for today.'
      });
      await webpush.sendNotification(subscription, payload);
      await docSnap.ref.set({ lastSentLocalDate: localDate, lastSentAt: now.toISOString() }, { merge: true });
      sent++;
    } catch (error) {
      const statusCode = error?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await docSnap.ref.delete();
        removed++;
      } else {
        console.error(`Failed to send reminder for ${docSnap.id}`, error);
      }
    }
  }

  console.log(`Processed ${snap.size} subscriptions. Sent: ${sent}. Removed: ${removed}.`);
}

run();
