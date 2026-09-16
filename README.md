# ⚡ Uptime Monitor & Keep-Alive System

A full-featured keep-alive and uptime monitoring system with **Quiet Hours (Sleep Mode)**, **Email & Discord/Slack Alerts on Downtime**, and a **Visual Dashboard UI**.

Specifically designed for **Render free tier** services (e.g. `https://api.pgkhata.com/health`) to keep them alive during active hours and allow them to sleep during quiet hours without incurring unnecessary hours.

---

## 🌟 Key Features

1. **🖥️ Visual Interactive Dashboard**
   - Live server status (🟢 UP / 🔴 DOWN / 🌙 SLEEPING).
   - "Ping Now" button for instant health check & latency test.
   - "Send Test Alert" button to test email and webhook deliveries.
   - Form to customize endpoint, quiet hours, timezone, and alerts without touching code.
   - Real-time auto-refreshing ping history table.

2. **🌙 Smart Quiet Hours (Sleep Schedule)**
   - Define hours when you *don't* want to ping (e.g., 1:00 AM to 5:00 AM).
   - Allows Render free tier servers to sleep and save free tier hours.
   - Supports overnight schedules (e.g., 11:00 PM to 7:00 AM).

3. **🚨 Instant Downtime Alerts**
   - **Email Notification**: Sends alert via Gmail / SMTP when server returns non-200 or times out.
   - **Discord / Slack Webhooks**: Posts rich formatted embeds to your channels.

4. **☁️ 24/7 Cloud Monitoring via GitHub Actions**
   - Runs every 10 minutes automatically in the cloud.
   - Continues monitoring even if your local computer is powered off.

---

## 🚀 Quick Start (Local Dashboard)

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Dashboard
```bash
npm run dashboard
# Or: npm start
```
Open your browser at **[http://localhost:3000](http://localhost:3000)**.

---

## ⚙️ Configuration

You can configure everything directly from the web dashboard, or by editing `config.json`:

```json
{
  "endpoint": "https://api.pgkhata.com/health",
  "interval_minutes": 10,
  "timeout_ms": 60000,
  "quiet_hours": {
    "enabled": true,
    "start": 1,
    "end": 5
  },
  "timezone": "Asia/Kolkata",
  "notifications": {
    "email": {
      "enabled": true,
      "to": "your-email@gmail.com"
    },
    "webhook": {
      "enabled": false,
      "url": "https://discord.com/api/webhooks/..."
    }
  }
}
```

---

## 📧 How to Setup Email Alerts (Gmail)

To allow the monitor to send emails when your server goes down:

1. Go to your **Google Account** &rarr; **Security**.
2. Make sure **2-Step Verification** is turned **ON**.
3. In the search bar at the top, type **App Passwords** (or go to `https://myaccount.google.com/apppasswords`).
4. Create a new App Password named `Uptime`.
5. Copy the 16-character code (e.g. `abcd efgh ijkl mnop`).
6. In the Dashboard under **Email SMTP Setup**, enter your Gmail and this 16-character password and click **Save SMTP Credentials**.
   - Or paste into `.env`:
     ```env
     SMTP_USER=your-email@gmail.com
     SMTP_PASS=your-16-char-app-password
     ```

---

## ☁️ Setting Up 24/7 Cloud Monitoring (GitHub Actions)

When you're ready to let GitHub monitor 24/7 in the cloud:

1. Push this project to your GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "feat: initial uptime monitor setup"
   git remote add origin https://github.com/your-username/your-repo.git
   git push -u origin main
   ```
2. Go to your repository on GitHub:
   - **Settings** &rarr; **Secrets and variables** &rarr; **Actions** &rarr; **New repository secret**.
3. Add the following secrets:
   - `SMTP_USER`: Your Gmail address (e.g., `you@gmail.com`).
   - `SMTP_PASS`: Your 16-character Gmail App Password.
   - `WEBHOOK_URL`: (Optional) Your Discord/Slack webhook URL.
4. Go to the **Actions** tab on GitHub and enable workflows.
5. GitHub will now automatically ping your endpoint every 10 minutes, respect your quiet hours, and send you email/webhook alerts if it goes down!

---

## 🧪 CLI Commands

| Command | Description |
| :--- | :--- |
| `npm run dashboard` | Launch the visual web dashboard on port 3000 |
| `npm run test-ping` | Ping endpoint immediately in CLI and print status |
| `npm run test-alert` | Send test email and test webhook to verify alert settings |
| `node monitor.js` | Run one scheduled monitor cycle (respecting quiet hours) |
