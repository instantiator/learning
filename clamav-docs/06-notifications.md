# 06 — Notifications in the macOS UI

This chapter wires up the two alerts you asked for:

1. **A notification when something is found** — triggered either instantly by
   the clamd daemon, or at the end of the frequent and weekly scans.
   The weekly scan also tells you when it **starts** and **completes**.
2. **A "watchdog" notification when the weekly scan didn't run** — checked
   daily, so a missed Sunday scan doesn't silently slip by.

Both use standard macOS Notification Center alerts, via `osascript`. No extra
software is needed.

> **How it works:** `osascript -e "display notification ..."` posts a normal
> notification banner to your Notification Center, exactly like apps do.

## The notification scripts

All scripts live in `/opt/homebrew/etc/clamav/scripts/` and end with the same
one-line trick:

```bash
/usr/bin/osascript -e "display notification \"<message>\" with title \"ClamAV\""
```

Two scripts in earlier chapters already include this:

- `frequent-scan.sh` (chapter 02) notifies when its scan finds something.
- `weekly-scan.sh` (chapter 03) notifies when it starts, when it pauses for
  battery and resumes, when it completes
  (with the infected count and exit code), and when its scan finds something.
  It runs as root, so it posts through `launchctl asuser` to reach your
  desktop (see chapter 03).

This chapter adds the remaining two: an instant daemon alert (`virus-event.sh`)
and the watchdog (`watchdog.sh`).

## Part A — Instant alert when clamd detects something

The clamd daemon can run a script the moment it detects a virus in anything it
scans (including scans triggered by `clamdscan`). It's configured with the
`VirusEvent` option we set in chapter 01 — the script just needs to exist now.

Create the script:

```bash
nano /opt/homebrew/etc/clamav/scripts/virus-event.sh
```

Paste in:

```bash
#!/bin/bash
# Called by clamd whenever it detects a virus (see VirusEvent in clamd.conf).
# clamd provides the file and virus name in these environment variables:
#   CLAM_VIRUSEVENT_FILENAME
#   CLAM_VIRUSEVENT_VIRUSNAME

FILE="${CLAM_VIRUSEVENT_FILENAME:-unknown}"
VIRUS="${CLAM_VIRUSEVENT_VIRUSNAME:-unknown}"

/usr/bin/osascript -e "display notification \"$VIRUS found in $FILE\" with title \"ClamAV daemon\""
```

Save, exit, make it executable:

```bash
chmod +x /opt/homebrew/etc/clamav/scripts/virus-event.sh
```

> **Security note (from the ClamAV manual):** never paste `$CLAM_VIRUSEVENT_*`
> values directly into a command line — they come from file names and can be
> crafted to inject commands. Using them inside a script (as above) is the safe
> way.

Restart clamd so it picks up the script:

```bash
sudo /opt/homebrew/bin/brew services restart clamav
```

> **If the notification doesn't appear when clamd fires:** the script runs as
> the `_clamav` user, and Notification Center can occasionally ignore alerts
> from background system users. The frequent/weekly scans (which run as your
> account or root) always work. If the daemon alert proves flaky, you can
> instead rely on the scan scripts' notifications — they cover the same
> detections. See the troubleshooting chapter for the full workaround list.

## Part B — Watchdog: alert when the weekly scan didn't run

The weekly scan is scheduled for Sunday 3am, but if the Mac is asleep or stays
on battery it may not run (see chapter 03). The watchdog's job is to notice and tell you.

**How it works:** the weekly scan writes
`/opt/homebrew/var/log/clamav/last-scan-summary.txt` (chapter 03). The watchdog
checks the age of that file every 6 hours. If the file is missing, or older
than 8 days, it posts a notification.

> **Why 8 days?** The scan runs every 7 days. 8 days means "more than a week
> plus a day" — enough slack for a scan that ran a bit late, but still alerting
> you promptly if one genuinely didn't happen.

Create the script:

```bash
nano /opt/homebrew/etc/clamav/scripts/watchdog.sh
```

Paste in:

```bash
#!/bin/bash
# Alerts you when the weekly scan hasn't run for too long.
# Runs every 6 hours as a user LaunchAgent.

SUMMARY=/opt/homebrew/var/log/clamav/last-scan-summary.txt
MAX_AGE_SECONDS=691200   # 8 days

if [ ! -f "$SUMMARY" ]; then
  /usr/bin/osascript -e "display notification \"The weekly scan has never run. Check the logs.\" with title \"ClamAV watchdog\""
  exit 0
fi

AGE_SECONDS=$(( $(date +%s) - $(stat -f %m "$SUMMARY") ))

if [ "$AGE_SECONDS" -gt "$MAX_AGE_SECONDS" ]; then
  DAYS=$((AGE_SECONDS / 86400))
  /usr/bin/osascript -e "display notification \"The weekly scan has not run for $DAYS day(s). Check the logs.\" with title \"ClamAV watchdog\""
fi
```

> `stat -f %m` prints a file's last-modified time in seconds — that's the
> macOS syntax (the Linux `stat -c %Y` won't work here).

Save, exit, make it executable:

```bash
chmod +x /opt/homebrew/etc/clamav/scripts/watchdog.sh
```

Register it as a LaunchAgent (it runs as your account, so it's in
`~/Library/LaunchAgents/`):

```bash
nano ~/Library/LaunchAgents/com.user.clamav-scan-watchdog.plist
```

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.user.clamav-scan-watchdog</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/etc/clamav/scripts/watchdog.sh</string>
    </array>
    <key>StartInterval</key>
    <integer>21600</integer>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
```

`StartInterval` is seconds: `21600` = every 6 hours. `RunAtLoad` runs it once
now so you can test it immediately.

Load and check:

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.user.clamav-scan-watchdog.plist
launchctl print gui/$(id -u)/com.user.clamav-scan-watchdog | head -n 5
```

### Test the watchdog (without waiting 8 days)

Run it by hand and you should see an immediate notification, because the
summary file doesn't exist yet (or is older than 8 days):

```bash
/opt/homebrew/etc/clamav/scripts/watchdog.sh
```

After the first weekly scan runs, the summary file is fresh, so a manual run
will stay silent — that's the correct "all good" behaviour.

> **Getting the "did not run" summary:** the notification only says it didn't
> run; it doesn't tell you why. To diagnose, read the logs
> ([05-logs.md](05-logs.md)), run `av-status`, and check launchd's own record:
> `sudo launchctl print system/com.clamav.weekly-scan`.

## Notification permissions

macOS may ask whether Terminal/iTerm (or whichever app runs these scripts) can
send notifications, the first time an alert fires. If alerts don't appear:

- Open **System Settings → Notifications**, scroll to the app that ran the
  scripts, and make sure notifications are allowed.
- Alternatively, `launchctl kickstart gui/$(id -u)/com.user.clamav-frequent-scan`
  to force a run and trigger the permission prompt.

## Summary of all alert sources

| Alert | When | Triggered by |
|---|---|---|
| "Virus found" | Instantly, when clamd detects something | `virus-event.sh` (VirusEvent) |
| "X infected file(s) found" | End of each 30-min scan | `frequent-scan.sh` |
| "Weekly scan started." | Start of each weekly scan (" (manual)" if run by hand) | `weekly-scan.sh` |
| "Weekly scan paused…" / "resumed." | Unplugged / plugged in during a scheduled scan | `weekly-scan.sh` |
| "Weekly scan completed: …" | End of each weekly scan | `weekly-scan.sh` |
| "X infected file(s) found" | End of each weekly scan | `weekly-scan.sh` |
| "Weekly scan has not run..." | Every 6h, if summary is stale | `watchdog.sh` |

## References

- ClamAV `VirusEvent` documentation (see the sample `clamd.conf`, or
  https://docs.clamav.net/manual/Usage/Configuration.html)
- `man osascript` for the notification command
