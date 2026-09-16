import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { sendEmailAlert, sendWebhookAlert } from './notifier.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_PATH = path.join(__dirname, 'config.json');
const STATUS_PATH = path.join(__dirname, 'status.json');

/**
 * Loads config.json
 */
export async function loadConfig() {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[Monitor] Error loading config.json:', err.message);
    return {
      endpoint: 'https://api.pgkhata.com/health',
      interval_minutes: 10,
      timeout_ms: 60000,
      quiet_hours: { enabled: true, start: 1, end: 5 },
      timezone: 'Asia/Kolkata',
      notifications: { email: { enabled: false }, webhook: { enabled: false } }
    };
  }
}

/**
 * Loads status.json
 */
export async function loadStatus() {
  try {
    const raw = await fs.readFile(STATUS_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {
      current_status: 'IDLE',
      last_checked: null,
      last_status_code: null,
      last_latency_ms: null,
      last_message: '',
      stats: { total_pings: 0, successful_pings: 0, failed_pings: 0, skipped_quiet_hours: 0 },
      history: []
    };
  }
}

/**
 * Saves status.json
 */
export async function saveStatus(statusData) {
  try {
    await fs.writeFile(STATUS_PATH, JSON.stringify(statusData, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Monitor] Error saving status.json:', err.message);
  }
}

/**
 * Check if current time in timezone is within quiet hours
 */
export function isCurrentTimeQuiet(config) {
  if (!config.quiet_hours || !config.quiet_hours.enabled) {
    return { isQuiet: false, currentHour: null };
  }

  const { start, end } = config.quiet_hours;
  if (start === end) {
    return { isQuiet: false, currentHour: null };
  }

  const tz = config.timezone || 'Asia/Kolkata';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    hourCycle: 'h23'
  }).formatToParts(new Date());

  const hourPart = parts.find((p) => p.type === 'hour');
  const currentHour = parseInt(hourPart ? hourPart.value : '0', 10);

  let isQuiet = false;
  if (start < end) {
    isQuiet = currentHour >= start && currentHour < end;
  } else {
    // Overnight quiet period e.g. 23 to 7
    isQuiet = currentHour >= start || currentHour < end;
  }

  return { isQuiet, currentHour, tz };
}

/**
 * Executes a single ping check
 */
export async function runCheck(options = {}) {
  const force = options.force || false;
  const config = await loadConfig();
  const statusData = await loadStatus();

  const nowIso = new Date().toISOString();
  const { isQuiet, currentHour, tz } = isCurrentTimeQuiet(config);

  // 1. Quiet hours check
  if (isQuiet && !force) {
    const msg = `Quiet hours active (${currentHour}:00 ${tz}). Ping skipped to allow server sleep.`;
    console.log(`[Monitor] 🌙 ${msg}`);

    statusData.current_status = 'SLEEPING';
    statusData.last_checked = nowIso;
    statusData.last_message = msg;
    statusData.stats.skipped_quiet_hours = (statusData.stats.skipped_quiet_hours || 0) + 1;

    statusData.history.unshift({
      timestamp: nowIso,
      status: 'SLEEPING',
      statusCode: null,
      latencyMs: null,
      message: msg
    });
    if (statusData.history.length > 50) statusData.history.pop();

    await saveStatus(statusData);
    return { status: 'SLEEPING', message: msg, latencyMs: null };
  }

  // 2. Active ping check
  const endpoint = config.endpoint || 'https://api.pgkhata.com/health';
  const timeoutMs = config.timeout_ms || 10000;
  console.log(`[Monitor] 📡 Pinging ${endpoint} (Timeout: ${timeoutMs}ms)...`);

  const startTime = Date.now();
  let checkSuccess = false;
  let statusCode = null;
  let latencyMs = 0;
  let errorMessage = null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(endpoint, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'UptimeMonitor/1.0 (+https://github.com)'
      }
    });

    clearTimeout(timeout);
    latencyMs = Date.now() - startTime;
    statusCode = response.status;

    if (response.ok) {
      checkSuccess = true;
    } else {
      errorMessage = `HTTP error status ${response.status} (${response.statusText})`;
    }
  } catch (err) {
    latencyMs = Date.now() - startTime;
    errorMessage = err.name === 'AbortError' ? `Request timed out after ${timeoutMs}ms` : err.message;
  }

  statusData.stats.total_pings = (statusData.stats.total_pings || 0) + 1;
  statusData.last_checked = nowIso;
  statusData.last_latency_ms = latencyMs;
  statusData.last_status_code = statusCode;

  if (checkSuccess) {
    const msg = `Healthy - HTTP ${statusCode} in ${latencyMs}ms`;
    console.log(`[Monitor] ✅ ${msg}`);

    statusData.current_status = 'UP';
    statusData.last_message = msg;
    statusData.stats.successful_pings = (statusData.stats.successful_pings || 0) + 1;

    statusData.history.unshift({
      timestamp: nowIso,
      status: 'UP',
      statusCode,
      latencyMs,
      message: msg
    });
  } else {
    const msg = `Down / Failed: ${errorMessage}`;
    console.error(`[Monitor] ❌ ${msg}`);

    statusData.current_status = 'DOWN';
    statusData.last_message = msg;
    statusData.stats.failed_pings = (statusData.stats.failed_pings || 0) + 1;

    statusData.history.unshift({
      timestamp: nowIso,
      status: 'DOWN',
      statusCode,
      latencyMs,
      message: msg
    });

    // Send Alerts
    await triggerFailureAlerts(config, {
      endpoint,
      statusCode,
      latencyMs,
      errorMessage,
      timestamp: nowIso
    });
  }

  if (statusData.history.length > 50) statusData.history.pop();
  await saveStatus(statusData);

  return {
    status: statusData.current_status,
    statusCode,
    latencyMs,
    message: statusData.last_message
  };
}

/**
 * Triggers failure alerts via Email and Webhook
 */
async function triggerFailureAlerts(config, details) {
  const { notifications } = config;
  if (!notifications) return;

  // 1. Email Alert
  if (notifications.email && notifications.email.enabled && notifications.email.to) {
    const subject = `🚨 [DOWN] Uptime Alert: ${details.endpoint} is unreachable!`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #fee2e2; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #dc2626; color: white; padding: 20px; text-align: center;">
          <h2 style="margin: 0;">🚨 Server Down Alert</h2>
          <p style="margin: 5px 0 0 0; opacity: 0.9;">Uptime Monitor detected an outage</p>
        </div>
        <div style="padding: 24px; background-color: #ffffff;">
          <p style="font-size: 16px; color: #374151;">Your monitored service failed health check response:</p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr>
              <td style="padding: 8px; font-weight: bold; color: #4b5563; border-bottom: 1px solid #e5e7eb;">Endpoint:</td>
              <td style="padding: 8px; color: #111827; border-bottom: 1px solid #e5e7eb;"><code>${details.endpoint}</code></td>
            </tr>
            <tr>
              <td style="padding: 8px; font-weight: bold; color: #4b5563; border-bottom: 1px solid #e5e7eb;">Status Code:</td>
              <td style="padding: 8px; color: #dc2626; font-weight: bold; border-bottom: 1px solid #e5e7eb;">${details.statusCode || 'N/A (Connection Error)'}</td>
            </tr>
            <tr>
              <td style="padding: 8px; font-weight: bold; color: #4b5563; border-bottom: 1px solid #e5e7eb;">Error:</td>
              <td style="padding: 8px; color: #dc2626; border-bottom: 1px solid #e5e7eb;">${details.errorMessage}</td>
            </tr>
            <tr>
              <td style="padding: 8px; font-weight: bold; color: #4b5563; border-bottom: 1px solid #e5e7eb;">Time:</td>
              <td style="padding: 8px; color: #111827; border-bottom: 1px solid #e5e7eb;">${new Date(details.timestamp).toLocaleString()}</td>
            </tr>
          </table>
        </div>
      </div>
    `;

    console.log(`[Monitor] Sending failure email alert to ${notifications.email.to}...`);
    await sendEmailAlert({
      to: notifications.email.to,
      subject,
      html,
      text: `ALERT: ${details.endpoint} is DOWN! Error: ${details.errorMessage} at ${details.timestamp}`
    });
  }

  // 2. Webhook Alert
  if (notifications.webhook && notifications.webhook.enabled) {
    console.log('[Monitor] Sending failure webhook alert...');
    await sendWebhookAlert({
      url: notifications.webhook.url,
      title: `🚨 Server Down: ${details.endpoint}`,
      description: `Health check failed: ${details.errorMessage}`,
      color: 0xdc2626,
      fields: [
        { name: 'Status Code', value: String(details.statusCode || 'None'), inline: true },
        { name: 'Response Time', value: `${details.latencyMs}ms`, inline: true },
        { name: 'Timestamp', value: details.timestamp, inline: false }
      ]
    });
  }
}

// CLI Execution Support
const args = process.argv.slice(2);
if (args.includes('--test') || args.includes('--force')) {
  runCheck({ force: true }).then((res) => {
    console.log('[Monitor] CLI Test Result:', res);
    process.exit(res.status === 'DOWN' ? 1 : 0);
  });
} else if (args.includes('--test-alert')) {
  (async () => {
    console.log('[Monitor] Sending Test Alerts...');
    const config = await loadConfig();
    const to = config.notifications?.email?.to;
    if (to) {
      await sendEmailAlert({
        to,
        subject: '🧪 Uptime Monitor Test Alert',
        html: '<h2 style="color:#2563eb;">🧪 Test Notification</h2><p>Your email alerts are working perfectly!</p>',
        text: 'Your email alerts are working perfectly!'
      });
    } else {
      console.log('[Monitor] No email recipient set in config.json');
    }

    if (config.notifications?.webhook?.url || process.env.WEBHOOK_URL) {
      await sendWebhookAlert({
        url: config.notifications?.webhook?.url,
        title: '🧪 Uptime Monitor Test Webhook',
        description: 'Webhook alerts are working properly!',
        color: 0x2563eb
      });
    }
  })();
} else if (import.meta.url === `file://${process.argv[1]}`) {
  // Direct node monitor.js run
  runCheck().then((res) => {
    process.exit(res.status === 'DOWN' ? 1 : 0);
  });
}
