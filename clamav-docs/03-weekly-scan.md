# 03 — Weekly in-depth scan of the whole disk

The frequent scans in chapter 02 only cover a few folders. This chapter adds a
thorough scan of **everything** on your disk, once a week.

## What the weekly scan does

Every Sunday at 3:00am a script (run as root) will:

1. scan the whole disk (`/`) with `clamscan --recursive`,
2. move any infected files into a dated quarantine folder,
3. write a full log plus a short **summary file**,
4. show a macOS notification if anything was found.

Because a full-disk scan takes hours, it's scheduled overnight when the machine
is idle.

> **Why root?** Scanning `/` means reading system files and other users' files.
> That needs root permissions, so this runs as a root LaunchDaemon.

> **What if the Mac is asleep at 3am?** launchd tries to run the job when the
> Mac wakes up, but it's not guaranteed. That's exactly why chapter 06 adds a
> *watchdog* that alerts you if the scan hasn't run for too long.

## Step 1 — Create the scan script

First, make sure the log directory exists and is writable by your account (so
you can read the logs without `sudo`):

```bash
sudo mkdir -p /opt/homebrew/var/log/clamav
sudo chown lewiswestbury:admin /opt/homebrew/var/log/clamav
```

Now create the script:

```bash
nano /opt/homebrew/etc/clamav/scripts/weekly-scan.sh
```

Paste in:

```bash
#!/bin/bash
# Weekly in-depth scan of the whole disk, run by launchd as root.
# Writes a log and a short summary file, moves infected files to quarantine.

LOGDIR=/opt/homebrew/var/log/clamav
LOG=$LOGDIR/weekly-scan.log
SUMMARY=$LOGDIR/last-scan-summary.txt
STAMP=$(date +%Y%m%d-%H%M%S)
QUARANTINE=/opt/homebrew/var/quarantine/$STAMP
RUNLOG=/tmp/clamav-weekly-$STAMP.log

mkdir -p "$QUARANTINE" "$LOGDIR"

echo "===== Weekly scan started: $(date) =====" >> "$LOG"

/opt/homebrew/bin/clamscan \
  --recursive \
  --infected \
  --log="$RUNLOG" \
  --move="$QUARANTINE" \
  --exclude-dir=^/dev \
  --exclude-dir=^/System/Volumes/Preboot \
  --exclude-dir=^/Volumes \
  --exclude-dir=^/net \
  --exclude-dir=^/home \
  --exclude-dir=^/opt/homebrew/var/quarantine \
  --exclude-dir=^/opt/homebrew/var/lib/clamav \
  --exclude-dir=^/opt/homebrew/var/log/clamav \
  /

EXIT_CODE=$?

{
  echo "===== Weekly scan finished: $(date) (exit code: $EXIT_CODE) ====="
  cat "$RUNLOG"
} >> "$LOG"

# Write the summary file. The watchdog in chapter 06 reads this file's age.
{
  echo "Last scan: $(date)"
  echo "Exit code: $EXIT_CODE  (0 = clean, 1 = infected found, 2 = error)"
  echo
  echo "-- Summary --"
  grep -E "Known viruses|Engine version|Scanned directories|Scanned files|Infected files|Data scanned|Time:" "$RUNLOG" || true
  echo
  echo "-- Infected files --"
  grep "FOUND" "$RUNLOG" || echo "  (none)"
} > "$SUMMARY"

# clamscan returns 1 when viruses were found. Tell the user.
if [ "$EXIT_CODE" -eq 1 ]; then
  COUNT=$(grep -c "FOUND" "$RUNLOG" || true)
  /usr/bin/osascript -e "display notification \"$COUNT infected file(s) found. They were moved to $QUARANTINE.\" with title \"ClamAV weekly scan\""
fi

rm -f "$RUNLOG"
```

> **About the exit codes:** `clamscan` returns `0` when nothing was found, `1`
> when at least one infected file was found, and `2` if something went wrong.
> The script uses that to decide whether to notify you.

> **About the excludes:** we skip `/dev` (device files aren't scanable and
> produce noise), the quarantine folder (so we don't re-scan things we already
> moved), ClamAV's own database, and its own logs. We also skip `/Volumes`,
> `/net` and `/home` — the places macOS mounts external drives, disk images
> and network shares (SMB/NFS) — so a slow or unreachable network share can't
> stall the overnight scan for hours. Everything else on the internal disk is
> scanned.

Save and exit, then make it executable:

```bash
chmod +x /opt/homebrew/etc/clamav/scripts/weekly-scan.sh
```

## Step 2 — Create the launchd daemon

This is a root job, so it lives in `/Library/LaunchDaemons/`:

```bash
sudo nano /Library/LaunchDaemons/com.clamav.weekly-scan.plist
```

Paste in:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.clamav.weekly-scan</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/etc/clamav/scripts/weekly-scan.sh</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Weekday</key>
        <integer>0</integer>
        <key>Hour</key>
        <integer>3</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>RunAtLoad</key>
    <false/>
</dict>
</plist>
```

`StartCalendarInterval` with `Weekday 0` = every Sunday, `Hour 3`, `Minute 0`.
`RunAtLoad` is `false` so it doesn't trigger a scan the moment you load it.

Save, fix permissions, and load:

```bash
sudo chown root:wheel /Library/LaunchDaemons/com.clamav.weekly-scan.plist
sudo chmod 644 /Library/LaunchDaemons/com.clamav.weekly-scan.plist
sudo launchctl bootstrap system /Library/LaunchDaemons/com.clamav.weekly-scan.plist
```

Check it's registered (it will be idle until Sunday):

```bash
sudo launchctl print system/com.clamav.weekly-scan | head -n 5
```

## Step 3 — Test it without waiting for Sunday

The safest quick test is to run the script by hand — it does a real full-disk
scan, so expect it to run for a while:

```bash
sudo /opt/homebrew/etc/clamav/scripts/weekly-scan.sh
```

While it runs you can watch progress in the log:

```bash
sudo tail -f /opt/homebrew/var/log/clamav/weekly-scan.log
```

When it finishes, check the summary:

```bash
cat /opt/homebrew/var/log/clamav/last-scan-summary.txt
```

## Reading the result

The summary file is deliberately short:

```
Last scan: Sun 17 Aug 2026 03:12:40 BST
Exit code: 0  (0 = clean, 1 = infected found, 2 = error)

-- Summary --
Known viruses: 1024917
...
Scanned files: 1234567
Infected files: 0
...

-- Infected files --
  (none)
```

- `Infected files: 0` — clean.
- `Infected files: 2` and a list of `FOUND` lines — go to
  [04-quarantine.md](04-quarantine.md) to review what was moved.
- `Exit code: 2` or a missing summary file — something went wrong; see
  [07-testing-and-troubleshooting.md](07-testing-and-troubleshooting.md).

## Customising it

- **Change the day/time** — edit `StartCalendarInterval` in the plist.
  Weekdays: `1` = Monday … `7` = Sunday, or omit `Weekday` for "every day".
- **Stop it** — `sudo launchctl bootout system/com.clamav.weekly-scan`
  (unload), or delete the plist.
- **Keep old weekly logs** — the script appends to one growing
  `weekly-scan.log`. To keep a per-week file instead, change `LOG` to use
  `$STAMP` (e.g. `weekly-scan-$STAMP.log`).

## Verification checklist

- [ ] `sudo launchctl print system/com.clamav.weekly-scan` shows the job
- [ ] `sudo /opt/homebrew/etc/clamav/scripts/weekly-scan.sh` completes
- [ ] `/opt/homebrew/var/log/clamav/last-scan-summary.txt` shows a summary with
      `Infected files: 0`
- [ ] A `FOUND` line in the log moves the file into a dated quarantine folder
      and triggers a notification

## References

- ClamAV scanning manual: https://docs.clamav.net/manual/Usage/Scanning.html
- `man clamscan` for the options used above
