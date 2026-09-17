import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { runCheck, loadConfig, loadStatus, isCurrentTimeQuiet } from '../monitor.js';
import { sendEmailAlert, sendWebhookAlert } from '../notifier.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 1. Get current config & environment status
app.get('/api/config', async (req, res) => {
  try {
    const config = await loadConfig();
    const isSmtpConfigured = !!(process.env.SMTP_USER && process.env.SMTP_PASS);
    const quietInfo = isCurrentTimeQuiet(config);

    res.json({
      config,
      env: {
        resend_configured: !!process.env.RESEND_API_KEY,
        resend_from: process.env.RESEND_FROM_EMAIL || 'PGKhata <no-reply@pgkhata.com>',
        smtp_configured: isSmtpConfigured,
        smtp_user: process.env.SMTP_USER ? process.env.SMTP_USER.replace(/(.{2})(.*)(@.*)/, '$1***$3') : '',
        webhook_configured: !!process.env.WEBHOOK_URL
      },
      quiet_info: quietInfo
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Update config.json
app.post('/api/config', async (req, res) => {
  try {
    const newConfig = req.body;
    const configPath = path.join(rootDir, 'config.json');
    await fs.writeFile(configPath, JSON.stringify(newConfig, null, 2), 'utf-8');
    res.json({ success: true, message: 'Configuration saved successfully!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Update .env SMTP / Webhook credentials
app.post('/api/env', async (req, res) => {
  try {
    const { smtp_user, smtp_pass, smtp_host, smtp_port, webhook_url } = req.body;
    const envPath = path.join(rootDir, '.env');

    let currentEnv = '';
    try {
      currentEnv = await fs.readFile(envPath, 'utf-8');
    } catch {
      // file might not exist yet
    }

    const envMap = new Map();
    currentEnv.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const idx = trimmed.indexOf('=');
        if (idx !== -1) {
          envMap.set(trimmed.substring(0, idx).trim(), trimmed.substring(idx + 1).trim());
        }
      }
    });

    if (smtp_user !== undefined) envMap.set('SMTP_USER', smtp_user);
    if (smtp_pass !== undefined) envMap.set('SMTP_PASS', smtp_pass);
    if (smtp_host !== undefined) envMap.set('SMTP_HOST', smtp_host || 'smtp.gmail.com');
    if (smtp_port !== undefined) envMap.set('SMTP_PORT', smtp_port || '465');
    if (webhook_url !== undefined) envMap.set('WEBHOOK_URL', webhook_url);

    // Also update current process.env
    if (smtp_user) process.env.SMTP_USER = smtp_user;
    if (smtp_pass) process.env.SMTP_PASS = smtp_pass;
    if (smtp_host) process.env.SMTP_HOST = smtp_host;
    if (smtp_port) process.env.SMTP_PORT = smtp_port;
    if (webhook_url) process.env.WEBHOOK_URL = webhook_url;

    const newEnvContent = Array.from(envMap.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('\n') + '\n';

    await fs.writeFile(envPath, newEnvContent, 'utf-8');
    res.json({ success: true, message: 'Credentials updated in .env successfully!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Get Status & History
app.get('/api/status', async (req, res) => {
  try {
    const status = await loadStatus();
    const config = await loadConfig();
    const quietInfo = isCurrentTimeQuiet(config);
    res.json({ status, quiet_info: quietInfo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Trigger Ping / Cron Check
app.all(['/api/ping', '/api/cron'], async (req, res) => {
  try {
    // If force=true query param passed or direct POST to /api/ping without scheduled param -> force ping
    const isCron = req.path === '/api/cron' || req.query.cron === 'true';
    const force = isCron ? false : (req.query.force === 'true' || req.method === 'POST');
    const result = await runCheck({ force });
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Test Alert Delivery
app.post('/api/test-alert', async (req, res) => {
  try {
    const { email_to, webhook_url } = req.body;
    const results = {};

    if (email_to) {
      results.email = await sendEmailAlert({
        to: email_to,
        subject: '🧪 [Test Alert] Uptime Monitor Notification Test',
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #93c5fd; border-radius: 8px;">
            <h2 style="color: #2563eb; margin-top: 0;">🧪 Test Alert Successful!</h2>
            <p>Your Uptime Monitor email alert system is functioning properly.</p>
            <p><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
          </div>
        `,
        text: 'Test Alert: Your Uptime Monitor email alert system is functioning properly!'
      });
    }

    if (webhook_url || process.env.WEBHOOK_URL) {
      results.webhook = await sendWebhookAlert({
        url: webhook_url || process.env.WEBHOOK_URL,
        title: '🧪 Test Alert: Uptime Monitor',
        description: 'Your Webhook alert is functioning properly!',
        color: 0x2563eb
      });
    }

    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 Uptime Monitor Dashboard is running!`);
    console.log(`🔗 Local URL: http://localhost:${PORT}`);
    console.log(`====================================================`);
  });
}

export default app;
