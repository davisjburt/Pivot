import express from 'express';
import { createServer as createViteServer } from 'vite';
import webpush from 'web-push';
import fs from 'fs';
import path from 'path';

const app = express();
const PORT = 3000;

app.use(express.json());

// --- VAPID Keys Setup ---
const VAPID_FILE = path.join(process.cwd(), 'vapid.json');
let vapidKeys: { publicKey: string; privateKey: string };

if (fs.existsSync(VAPID_FILE)) {
  vapidKeys = JSON.parse(fs.readFileSync(VAPID_FILE, 'utf-8'));
} else {
  vapidKeys = webpush.generateVAPIDKeys();
  fs.writeFileSync(VAPID_FILE, JSON.stringify(vapidKeys));
}

webpush.setVapidDetails(
  'mailto:test@example.com',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// --- Subscriptions Storage ---
const SUBS_FILE = path.join(process.cwd(), 'subscriptions.json');
type StoredSubscription = {
  subscription: any;
  userId: string;
  time: string;
  timezone: string;
  lastSentLocalDate?: string;
};
let subscriptions: StoredSubscription[] = [];

if (fs.existsSync(SUBS_FILE)) {
  try {
    subscriptions = JSON.parse(fs.readFileSync(SUBS_FILE, 'utf-8'));
  } catch (e) {
    subscriptions = [];
  }
}

function saveSubscriptions() {
  fs.writeFileSync(SUBS_FILE, JSON.stringify(subscriptions));
}

function shouldSendReminder(sub: StoredSubscription, now: Date) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: sub.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  const localDate = `${get('year')}-${get('month')}-${get('day')}`;
  const localTime = `${get('hour')}:${get('minute')}`;

  const [targetHour, targetMinute] = sub.time.split(':').map(Number);
  const [currentHour, currentMinute] = localTime.split(':').map(Number);
  const currentMinutes = currentHour * 60 + currentMinute;
  const targetMinutes = targetHour * 60 + targetMinute;

  // GitHub Actions runs every 5 minutes, so allow a 5-minute window.
  const inWindow = currentMinutes >= targetMinutes && currentMinutes < targetMinutes + 5;
  const alreadySentToday = sub.lastSentLocalDate === localDate;
  return { shouldSend: inWindow && !alreadySentToday, localDate };
}

async function dispatchScheduledReminders(now: Date) {
  let changed = false;
  for (const sub of subscriptions) {
    try {
      const { shouldSend, localDate } = shouldSendReminder(sub, now);
      if (!shouldSend) continue;

      const payload = JSON.stringify({
        title: 'Time to log your weight!',
        body: 'Keep your streak going. Tap here to log your weight for today.',
      });

      await webpush.sendNotification(sub.subscription, payload);
      sub.lastSentLocalDate = localDate;
      changed = true;
    } catch (error: any) {
      console.error('Error sending scheduled notification:', error);
      if (error?.statusCode === 410 || error?.statusCode === 404) {
        subscriptions = subscriptions.filter(s => s.userId !== sub.userId);
        changed = true;
      }
    }
  }
  if (changed) saveSubscriptions();
}

// --- API Routes ---
app.get('/api/vapidPublicKey', (req, res) => {
  res.send(vapidKeys.publicKey);
});

app.post('/api/subscribe', (req, res) => {
  const { subscription, userId, time, timezone } = req.body;
  
  // Remove existing subscription for this user
  subscriptions = subscriptions.filter(s => s.userId !== userId);
  
  subscriptions.push({ subscription, userId, time, timezone });
  saveSubscriptions();
  
  res.status(201).json({ success: true });
});

app.post('/api/unsubscribe', (req, res) => {
  const { userId } = req.body;
  subscriptions = subscriptions.filter(s => s.userId !== userId);
  saveSubscriptions();
  res.status(200).json({ success: true });
});

app.post('/api/test-notification', (req, res) => {
  const { userId } = req.body;
  const sub = subscriptions.find(s => s.userId === userId);
  
  if (sub) {
    const payload = JSON.stringify({
      title: 'Test Notification',
      body: 'Push notifications are working perfectly!',
    });
    
    webpush.sendNotification(sub.subscription, payload).catch(error => {
      console.error('Error sending test notification:', error);
    });
    res.status(200).json({ success: true });
  } else {
    res.status(404).json({ error: 'No subscription found' });
  }
});

app.post('/api/send-reminders', async (req, res) => {
  const token = req.header('x-reminder-token');
  if (!process.env.GITHUB_ACTIONS_REMINDER_TOKEN || token !== process.env.GITHUB_ACTIONS_REMINDER_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  await dispatchScheduledReminders(new Date());
  res.status(200).json({ success: true, processed: subscriptions.length });
});

// --- Vite Middleware ---
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
