# 02 — "Real-time" protection (frequent scans)

## The honest explanation first

ClamAV does have a real-time *on-access* scanner called `clamonacc` — it scans
a file the moment anything tries to read or open it. But it only works on
**Linux**. It relies on Linux kernel features (`fanotify` / `inotify`) that
macOS doesn't have, and it isn't even included in the Homebrew build of ClamAV
for macOS. There is no way to enable it on a Mac.

So instead, this guide sets up the closest practical equivalent:

> **A quick scan of the places you most often receive files — your Downloads,
> Desktop and Documents folders — every 30 minutes.**

Files you download land in `~/Downloads` and stay there until you move them, so
a 30-minute scan catches anything suspicious shortly after it appears, before
it gets a chance to spread. It's not instant protection like on-access
scanning, but it's the standard, reliable approach for ClamAV on macOS.

## What the frequent scan does

Every 30 minutes (while you're logged in) a script:

1. runs `clamscan --recursive` over `~/Downloads`, `~/Desktop` and `~/Documents`,
2. moves any infected file it finds into a dated quarantine folder,
3. appends the results to a log,
4. shows a macOS notification if anything was found.

> **Why a user LaunchAgent and not a root LaunchDaemon?** The frequent scan
> only touches files that belong to you, so it doesn't need root. Running it as
> your own account is simpler and safer, and notifications definitely appear in
> your Notification Center.

## Step 1 — Create the scan script

Create the scripts folder and a log directory your account can write to:

```bash
mkdir -p /opt/homebrew/etc/clamav/scripts

sudo mkdir -p /opt/homebrew/var/log/clamav
sudo chown lewiswestbury:admin /opt/homebrew/var/log/clamav
```

> **Why the `chown`?** The directory `/opt/homebrew/var/log/clamav` may already
> exist (the weekly scan's `mkdir -p` created it as root). If so, it's owned by
> root and your scripts can't write their logs there — the scan runs fine but
> the log file never appears. This fixes the ownership so both your account (for
> the frequent scan) and root (for the weekly scan) can write to it.

Create the script:

```bash
nano /opt/homebrew/etc/clamav/scripts/frequent-scan.sh
```

Paste in:

```bash
#!/bin/bash
# Quick scans of high-risk folders, run every 30 minutes by launchd.
# This is the closest practical alternative to on-access scanning on macOS.

STAMP=$(date +%Y%m%d-%H%M%S)
LOG=/opt/homebrew/var/log/clamav/frequent-scan.log
QUARANTINE=/opt/homebrew/var/quarantine/$STAMP
RUNLOG=/tmp/clamav-frequent-$STAMP.log

mkdir -p "$QUARANTINE"

/opt/homebrew/bin/clamscan \
  --recursive \
  --infected \
  --quiet \
  --log="$RUNLOG" \
  --move="$QUARANTINE" \
  "$HOME/Downloads" \
  "$HOME/Desktop" \
  "$HOME/Documents"

# Append this run's results to the permanent log with a date marker.
{
  echo "===== $(date) ====="
  cat "$RUNLOG"
} >> "$LOG"

# If anything was found, tell the user.
if grep -q "FOUND" "$RUNLOG"; then
  COUNT=$(grep -c "FOUND" "$RUNLOG")
  /usr/bin/osascript -e "display notification \"$COUNT infected file(s) found and moved to quarantine.\" with title \"ClamAV frequent scan\""
fi

rm -f "$RUNLOG"
```

Save and exit, then make it executable:

```bash
chmod +x /opt/homebrew/etc/clamav/scripts/frequent-scan.sh
```

> **Why a temp log (`/tmp/...`)?** The persistent log grows over time. If we
> grepped it directly, old detections would trigger notifications again. By
> writing each run to its own temp file, we only ever check "this run".

## Step 2 — Create the launchd agent

LaunchAgents in `~/Library/LaunchAgents/` run while you're logged in. Create
one that runs the script every 30 minutes:

```bash
nano ~/Library/LaunchAgents/com.user.clamav-frequent-scan.plist
```

Paste in:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.user.clamav-frequent-scan</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/etc/clamav/scripts/frequent-scan.sh</string>
    </array>
    <key>StartInterval</key>
    <integer>1800</integer>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
```

`StartInterval` is in seconds, so `1800` = every 30 minutes. `RunAtLoad` runs
it once now, so you get an immediate result.

Load the agent:

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.user.clamav-frequent-scan.plist
```

(If that fails, the older form `launchctl load ~/Library/LaunchAgents/com.user.clamav-frequent-scan.plist` works too.)

Check it's registered:

```bash
launchctl print gui/$(id -u)/com.user.clamav-frequent-scan | head -n 5
```

## Step 3 — Verify it works

Run the script by hand once and look at its log:

```bash
/opt/homebrew/etc/clamav/scripts/frequent-scan.sh
tail -n 20 /opt/homebrew/var/log/clamav/frequent-scan.log
```

You should see a `===== date =====` block ending with the scan summary
(`Infected files: 0`).

> The first run of the day also updates nothing by itself, but it does have to
> load the virus database into memory (~half a GB), so a run can take a minute
> or two. That's normal.

## Customising it

- **Change the frequency** — edit `StartInterval` in the plist (seconds), then
  reload with `launchctl bootout gui/$(id -u)/com.user.clamav-frequent-scan`
  followed by the `bootstrap` command again.
- **Add or remove folders** — add more paths to the `clamscan` command in the
  script (one per line).
- **Stop it** — `launchctl bootout gui/$(id -u)/com.user.clamav-frequent-scan`
  (unloading); delete the plist to stop it happening at the next login.

## Verification checklist

- [ ] `launchctl print gui/$(id -u)/com.user.clamav-frequent-scan` shows the job
- [ ] `/opt/homebrew/var/log/clamav/frequent-scan.log` shows a recent run with
      `Infected files: 0`
- [ ] The EICAR test in chapter 07 produces a notification and a quarantined
      file

## References

- On-access scanning (the Linux-only feature this replaces):
  https://docs.clamav.net/manual/OnAccess.html
- `man clamscan` for the scan options used above
