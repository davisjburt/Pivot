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
let subscriptions: any[] = [];

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

// --- Cron Job (Check every minute) ---
setInterval(() => {
  const now = new Date();
  
  subscriptions.forEach(sub => {
    try {
      // Get current time in user's timezone
      const userTime = new Intl.DateTimeFormat('en-US', {
        timeZone: sub.timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).format(now);
      
      // userTime format is "HH:MM"
      if (userTime === sub.time) {
        const payload = JSON.stringify({
          title: 'Time to log your weight!',
          body: 'Keep your streak going. Tap here to log your weight for today.',
        });
        
        webpush.sendNotification(sub.subscription, payload).catch(error => {
          console.error('Error sending notification:', error);
          if (error.statusCode === 410 || error.statusCode === 404) {
            // Subscription has expired or is no longer valid
            subscriptions = subscriptions.filter(s => s.userId !== sub.userId);
            saveSubscriptions();
          }
        });
      }
    } catch (e) {
      console.error('Error processing subscription:', e);
    }
  });
}, 60000); // Check every minute

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
