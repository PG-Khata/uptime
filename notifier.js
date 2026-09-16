import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Creates Nodemailer transporter using SMTP environment variables.
 */
export function getMailTransporter() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const secure = process.env.SMTP_SECURE !== 'false';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass }
  });
}

/**
 * Sends an email alert via Resend API (preferred) or SMTP (fallback)
 */
export async function sendEmailAlert({ to, subject, html, text }) {
  const resendApiKey = process.env.RESEND_API_KEY;

  // 1. Send via Resend API if API Key is configured
  if (resendApiKey) {
    try {
      const from = process.env.RESEND_FROM_EMAIL || 'PGKhata <no-reply@pgkhata.com>';
      const recipients = Array.isArray(to) ? to : [to];

      console.log(`[Notifier] Sending email via Resend API to ${recipients.join(', ')}...`);

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendApiKey}`
        },
        body: JSON.stringify({
          from,
          to: recipients,
          subject,
          html,
          text: text || ''
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || `HTTP ${res.status}`);
      }

      console.log(`[Notifier] ✅ Email delivered successfully via Resend (ID: ${data.id})`);
      return { success: true, provider: 'resend', id: data.id };
    } catch (error) {
      console.error('[Notifier] ❌ Resend email failed:', error.message);
      return { success: false, provider: 'resend', error: error.message };
    }
  }

  // 2. Fallback to SMTP
  const transporter = getMailTransporter();
  if (!transporter) {
    console.warn('[Notifier] Email skipped: Neither RESEND_API_KEY nor SMTP credentials configured.');
    return { success: false, error: 'No email service configured' };
  }

  const from = process.env.SMTP_FROM || `"Uptime Monitor" <${process.env.SMTP_USER}>`;

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html
    });
    console.log(`[Notifier] ✅ Email sent via SMTP to ${to} (Message ID: ${info.messageId})`);
    return { success: true, provider: 'smtp', messageId: info.messageId };
  } catch (error) {
    console.error('[Notifier] ❌ SMTP email failed:', error.message);
    return { success: false, provider: 'smtp', error: error.message };
  }
}

/**
 * Sends a webhook alert to Discord or Slack
 */
export async function sendWebhookAlert({ url, title, description, color = 0xff0000, fields = [] }) {
  const webhookUrl = url || process.env.WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn('[Notifier] Webhook skipped: No webhook URL configured.');
    return { success: false, error: 'Webhook URL missing' };
  }

  try {
    const payload = {
      username: 'Uptime Monitor',
      avatar_url: 'https://cdn-icons-png.flaticon.com/512/3665/3665923.png',
      embeds: [
        {
          title,
          description,
          color,
          fields,
          footer: { text: 'Uptime Alert System' },
          timestamp: new Date().toISOString()
        }
      ]
    };

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errText}`);
    }

    console.log('[Notifier] ✅ Webhook alert sent successfully.');
    return { success: true };
  } catch (error) {
    console.error('[Notifier] ❌ Webhook delivery failed:', error.message);
    return { success: false, error: error.message };
  }
}
