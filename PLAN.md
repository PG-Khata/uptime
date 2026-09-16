# Uptime Monitor Plan — api.pgkhata.com

## Objective
Keep Render-deployed server alive during active hours, allow it to sleep during configurable quiet hours using GitHub Actions.

---

## Architecture

```
D:\Projects\uptime\
├── .github/
│   └── workflows/
│       └── ping.yml           # Cron workflow (every 10 min)
├── config.json                # User-configurable quiet hours
├── ping.sh                    # Health check script (local testing)
└── README.md                  # Setup instructions
```

---

## Configuration (`config.json`)

```json
{
  "endpoint": "https://api.pgkhata.com/health",
  "interval_minutes": 10,
  "quiet_hours": {
    "start": 1,
    "end": 5
  },
  "timezone": "Asia/Kolkata"
}
```

### How to Use
- Edit `quiet_hours.start` and `quiet_hours.end` to set when NOT to ping
- Time is in 24-hour format (0-23)
- Supports overnight ranges (e.g., `start: 23, end: 7`)
- Change `timezone` to your local timezone

---

## GitHub Actions Workflow

### Triggers
- **Schedule:** Every 10 minutes (`*/10 * * * *`)
- **Manual:** Via `workflow_dispatch` (Actions tab → Run workflow)

### Logic
1. Read `config.json` for quiet hours and timezone
2. Get current hour in configured timezone
3. Check if current hour falls within quiet range
4. If quiet → skip ping, log message
5. If active → ping endpoint, log response status

### Quiet Hours Logic
| Scenario | start | end | Behavior |
|----------|-------|-----|----------|
| Sleep 1-5 AM | 1 | 5 | Skips pings 1:00-4:59 AM |
| Sleep midnight-6 AM | 0 | 6 | Skips pings 12:00-5:59 AM |
| Sleep 11 PM-7 AM | 23 | 7 | Skips pings 11 PM-6:59 AM |
| No sleep | - | - | Set start == end |

---

## Monthly Usage Estimate

| Active Period | Runs/Day | Avg Run Time | Min/Month |
|---------------|----------|--------------|-----------|
| 5 AM – 1 AM (20 hrs) | 120 | ~30 sec | ~60 |
| 6 AM – 12 AM (18 hrs) | 108 | ~30 sec | ~54 |
| 24/7 (no sleep) | 144 | ~30 sec | ~72 |

**GitHub Free Tier:** 2,000 min/month — **all scenarios well within limit**

---

## Render Free Tier Constraints

| Setting | Value |
|---------|-------|
| Sleep after inactivity | ~15 minutes |
| Cold start time | 30-60 seconds |
| Recommended ping interval | 10 minutes |

---

## Deployment Steps

1. Push this repo to GitHub
2. Go to repo → Actions tab → Enable workflows
3. Edit `config.json` to set your quiet hours
4. Commit and push — workflow activates automatically
5. Monitor via Actions tab

---

## Manual Testing

```bash
# Test ping locally
bash ping.sh

# Test workflow manually
# Go to Actions → Keep Server Alive → Run workflow
```

---

## Monitoring & Alerts

- Check Actions tab for run history
- Failed pings show as warnings in logs
- Non-200 responses trigger `::warning::` annotations
- Add Slack/Discord webhook to `ping.yml` for alerts (optional)

---

## Optional Enhancements (Future)

- [ ] Add Slack/Discord notification on failure
- [ ] Add uptime percentage tracking
- [ ] Add response time logging
- [ ] Multiple endpoint support
- [ ] Status page integration
