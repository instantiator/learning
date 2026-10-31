# 03 — Weekly in-depth scan of the whole disk

The frequent scans in chapter 02 only cover a few folders. This chapter adds a
thorough scan of **everything** on your disk, once a week.

## What the weekly scan does

Every Sunday at 3:00am, **if the Mac is plugged in**, a script (run as root)
will:

1. show a "Weekly scan started" notification,
2. scan the whole disk (`/`) with `clamscan --recursive`, wrapped in
   `caffeinate` so the Mac doesn't sleep mid-scan, and paused whenever the Mac
   is on battery,
3. move any infected files into a dated quarantine folder,
4. write a full log plus a short **summary file**,
5. show a "Weekly scan completed" notification, plus a separate alert if
   anything was found.

Because a full-disk scan takes hours, it's scheduled overnight when the machine
is idle. Step 3 below schedules a wake just before it.

> **Why root?** Scanning `/` means reading system files and other users' files.
> That needs root permissions, so this runs as a root LaunchDaemon.

> **What if the Mac is asleep at 3am?** launchd runs a missed job when the Mac
> next wakes, and the scan pauses whenever the Mac sleeps, so one scan can take
> days. Step 3 schedules a wake at 02:55, and the script wraps `clamscan` in
> `caffeinate` to keep the Mac awake until it finishes. Chapter 06 also adds a
> *watchdog* that alerts you if the scan hasn't run for too long.

> **Only on mains power.** A full-disk scan is heavy, so scheduled scans only
> run while the Mac is plugged in:
>
> - launchd starts the script at 03:00 on Sunday **and every 10 minutes**.
>   Each time, the script checks whether a scan is *due* (none has finished
>   since the last Sunday 03:00) and whether the Mac is on mains power. If
>   either check fails, it exits straight away.
> - So if you're on battery at 03:00, the scan starts within 10 minutes of
>   the next time you plug in. A scan interrupted by a restart retries the same
>   way, because it never finished.
> - If you unplug mid-scan, the scan is **paused** (`SIGSTOP`) and resumed
>   (`SIGCONT`) when you plug back in, with a notification each time. It
>   carries on where it left off rather than starting over.
> - **Manual runs** (`av-run-weekly`, step 4) skip all of this: they start
>   immediately and keep going on battery.

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
MANUAL_FLAG=$LOGDIR/weekly-manual

# Notifications posted by root don't reach the desktop, so post them as
# whoever is logged in at the console.
notify() {
  /bin/launchctl asuser "$(stat -f %u /dev/console)" \
    /usr/bin/osascript -e "display notification \"$1\" with title \"ClamAV weekly scan\""
}

on_ac() {
  /usr/bin/pmset -g batt | grep -q "'AC Power'"
}

# av-run-weekly creates this file to run now, ignoring the checks below.
if [ -f "$MANUAL_FLAG" ]; then
  rm -f "$MANUAL_FLAG"
  MANUAL=1
else
  # launchd runs this every 10 minutes. Only scan when a scan is due (none has
  # finished since the last Sunday 03:00) and the Mac is on mains power.
  LAST_SUNDAY=$(date -v-sun -v3H -v0M -v0S +%s)
  [ "$LAST_SUNDAY" -gt "$(date +%s)" ] && LAST_SUNDAY=$((LAST_SUNDAY - 604800))
  [ -f "$SUMMARY" ] && [ "$(stat -f %m "$SUMMARY")" -ge "$LAST_SUNDAY" ] && exit 0
  on_ac || exit 0
fi

mkdir -p "$QUARANTINE" "$LOGDIR"

echo "===== Weekly scan started: $(date)${MANUAL:+ (manual)} =====" >> "$LOG"
notify "Weekly scan started${MANUAL:+ (manual)}."

# caffeinate -s keeps the Mac awake until clamscan exits, but only while on
# mains power, so a scan paused on battery doesn't drain it.
# /System/Volumes/Data holds the same files as /Users, /opt, /private etc.
# (firmlinks), so excluding it stops everything being scanned twice.
/usr/bin/caffeinate -s /opt/homebrew/bin/clamscan \
  --recursive \
  --infected \
  --log="$RUNLOG" \
  --move="$QUARANTINE" \
  --exclude-dir=^/dev \
  --exclude-dir=^/System/Volumes/Preboot \
  --exclude-dir=^/System/Volumes/Data \
  --exclude-dir=^/Volumes \
  --exclude-dir=^/net \
  --exclude-dir=^/home \
  --exclude-dir='^(/System/Volumes/Data)?/opt/homebrew/var/quarantine' \
  --exclude-dir=^/opt/homebrew/var/lib/clamav \
  --exclude-dir=^/opt/homebrew/var/log/clamav \
  / &
SCAN_PID=$!

# Pause the scan while on battery, resume on mains power (scheduled runs only).
# The scan itself is caffeinate's child process.
PAUSED=
while [ -z "$MANUAL" ] && kill -0 "$SCAN_PID" 2>/dev/null; do
  sleep 60
  if on_ac; then
    [ -n "$PAUSED" ] && pkill -CONT -P "$SCAN_PID" && PAUSED= && notify "Weekly scan resumed."
  else
    [ -z "$PAUSED" ] && pkill -STOP -P "$SCAN_PID" && PAUSED=1 && notify "Weekly scan paused until the Mac is plugged in."
  fi
done

wait "$SCAN_PID"
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

COUNT=$(grep -c "FOUND" "$RUNLOG")
notify "Weekly scan completed: $COUNT infected file(s), exit code $EXIT_CODE."

# clamscan returns 1 when viruses were found. Tell the user.
if [ "$EXIT_CODE" -eq 1 ]; then
  notify "$COUNT infected file(s) found. They were moved to $QUARANTINE."
fi

rm -f "$RUNLOG"
```

> **About the exit codes:** `clamscan` returns `0` when nothing was found, `1`
> when at least one infected file was found, and `2` if something went wrong.
> The script uses that to decide whether to notify you.

> **About the notifications:** a notification posted by root (which this script
> runs as) doesn't reach your desktop. The `notify` function uses
> `launchctl asuser` to post it as whoever is logged in at the console instead.

> **About caffeinate:** `caffeinate -s <command>` stops the Mac sleeping until
> the command exits, but only while on mains power. On battery it does
> nothing, so a paused scan doesn't keep the Mac awake and drain the battery.
> It can't stop sleep when the lid is closed with no external display attached,
> so leave the Mac plugged in with the lid open (or on an external display) on
> Saturday night.

> **About the manual flag:** launchd can't pass arguments to a kickstarted job,
> so `av-run-weekly` creates `/opt/homebrew/var/log/clamav/weekly-manual`
> first. The script deletes that file and skips the due and power checks.

> **Full Disk Access:** without it, macOS privacy protection blocks thousands
> of files under `~/Library/Containers` and the scan exits with code `2`. Grant
> it in **System Settings → Privacy & Security → Full Disk Access**: press `+`,
> press `⌘⇧G`, and add `/opt/homebrew/bin/clamscan`.

> **About the excludes:** we skip `/dev` (device files aren't scanable and
> produce noise), the quarantine folder (so we don't re-scan things we already
> moved), ClamAV's own database, and its own logs. We also skip
> `/System/Volumes/Data`. On macOS, `/Users`, `/opt`, `/private` and so on are
> *firmlinks* into that volume, so without this exclude every file is scanned
> twice, once under each path. The quarantine exclude matches both paths in
> case one is ever reached through the long form. We also skip `/Volumes`,
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
    <key>StartInterval</key>
    <integer>600</integer>
    <key>RunAtLoad</key>
    <false/>
</dict>
</plist>
```

`StartCalendarInterval` with `Weekday 0` = every Sunday, `Hour 3`, `Minute 0`.
`StartInterval` `600` also runs the script every 10 minutes, so a scan that's
due but waiting for power starts soon after you plug in. Most of those runs
exit immediately. launchd never starts a second copy while one is running.
`RunAtLoad` is `false` so it doesn't trigger a scan the moment you load it.

> **Updating an existing install:** if the job is already loaded, unload it
> before loading the new plist:
> `sudo launchctl bootout system/com.clamav.weekly-scan`.

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

## Step 3 — Wake the Mac before the scan

Ask the power manager to wake (or power on) the Mac every Sunday (`U`) at
02:55, five minutes before the scan:

```bash
sudo pmset repeat wakeorpoweron U 02:55:00
pmset -g sched        # check: shows a "Repeating power events" entry
```

`pmset repeat` holds a single wake schedule. Setting it again replaces the old
one, and `sudo pmset repeat cancel` removes it. If you change the scan's day or
time in the plist, update this too.

## Step 4 — Test it without waiting for Sunday

Start a manual run through launchd. It runs as root, detached from your
terminal, so you can close the window. It's a real full-disk scan, so expect it
to run for a while:

```bash
touch /opt/homebrew/var/log/clamav/weekly-manual
sudo launchctl kickstart system/com.clamav.weekly-scan
```

(Or use `av-run-weekly`, from the shell helpers in
[05-logs.md](05-logs.md#shell-helpers), which does both.) You should see a
"Weekly scan started (manual)" notification. Without the `touch`, the script
only scans if one is due and the Mac is plugged in.

While it runs, check on it with `av-run-status`, or:

```bash
ps -o pid,etime,args -p "$(pgrep -d, clamscan)"
```

`clamscan` writes its output to a temporary file and only adds it to
`weekly-scan.log` at the end, so the log won't change mid-scan.

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

- **Change the day/time** — change all four places:
  - `StartCalendarInterval` in the plist,
  - the `LAST_SUNDAY` line in `weekly-scan.sh`, which decides when a scan
    is due,
  - `next_weekly` in `status.py` (chapter 05),
  - the `pmset repeat` wake from step 3.

  Weekdays: `1` = Monday … `7` = Sunday, or omit `Weekday` for "every day".
- **Allow scheduled scans on battery** — delete the `on_ac || exit 0` line and
  the pause loop.
- **Stop it** — `sudo launchctl bootout system/com.clamav.weekly-scan`
  (unload), or delete the plist.
- **Keep old weekly logs** — the script appends to one growing
  `weekly-scan.log`. To keep a per-week file instead, change `LOG` to use
  `$STAMP` (e.g. `weekly-scan-$STAMP.log`).

## Verification checklist

- [ ] `sudo launchctl print system/com.clamav.weekly-scan` shows the job
- [ ] `pmset -g sched` shows a repeating Sunday 02:55 wake
- [ ] `clamscan` has Full Disk Access
- [ ] `av-run-weekly` shows "started (manual)" and, later, "completed"
      notifications
- [ ] Unplugging during a scheduled scan shows "paused", and plugging back in
      shows "resumed"
- [ ] `/opt/homebrew/var/log/clamav/last-scan-summary.txt` shows a summary with
      `Infected files: 0`
- [ ] A `FOUND` line in the log moves the file into a dated quarantine folder
      and triggers a notification

## References

- ClamAV scanning manual: https://docs.clamav.net/manual/Usage/Scanning.html
- `man clamscan` for the options used above
