# 05 — Logs: where each run is recorded

Every part of the setup writes its own log. This chapter lists them all, what
they contain, and how to read them.

## The log files at a glance

| Log | Written by | What it records |
|---|---|---|
| `/opt/homebrew/var/log/clamd.log` | clamd daemon | Every scan the daemon performs, database reloads, errors. Also the daemon's own detections (`VirusEvent`). |
| `/opt/homebrew/var/log/freshclam.log` | freshclam | Database update results ("up to date", "updated", reload notices). |
| `/opt/homebrew/var/log/clamav/frequent-scan.log` | frequent-scan.sh | Each 30-minute scan run of Downloads/Desktop/Documents. |
| `/opt/homebrew/var/log/clamav/weekly-scan.log` | weekly-scan.sh | Each weekly full-disk scan, appended over time. |
| `/opt/homebrew/var/log/clamav/last-scan-summary.txt` | weekly-scan.sh | Short summary of the **latest** weekly scan (this is what the watchdog checks). |
| `/opt/homebrew/var/log/clamav/freshclam-stderr.log` | launchd | freshclam's stderr (only useful if freshclam crashes at startup). |

All scan logs are owned by root and readable by your account, so you can read
them without `sudo`. The `clamd` and `freshclam` logs are owned by `_clamav`.

## Reading each log

### clamd — the daemon

Watch live:

```bash
tail -f /opt/homebrew/var/log/clamd.log
```

You'll see lines like:

```
Wed Aug 16 17:25:00 2026 -> SelfCheck: Database status OK.
Wed Aug 16 17:30:12 2026 -> /Users/lewiswestbury/Downloads/x.dmg: Win.Test.EICAR_HDB-1 FOUND
Wed Aug 16 18:00:00 2026 -> Database correctly reloaded (1.0.4 -> 1.0.5)
```

The important line shape is `path: VirusName FOUND`. With
`ExtendedDetectionInfo yes` (set in chapter 01) the line also includes the file
size and hash:

```
... x.dmg: Win.Test.EICAR_HDB-1 FOUND (size: 68, md5: ..., sha256: ...)
```

### freshclam — the updater

```bash
tail -f /opt/homebrew/var/log/freshclam.log
```

Healthy output looks like:

```
Wed Aug 16 18:00:01 2026 -> daily.cld database is up-to-date (version: 27259, sigs: 1200000)
Wed Aug 16 18:00:01 2026 -> Database updated.
```

If an update happens, you'll also see it tell clamd to reload (via
`NotifyClamd`), which appears in `clamd.log` as a "Database correctly reloaded"
line.

### frequent scan — the 30-minute scans

```bash
tail -n 30 /opt/homebrew/var/log/clamav/frequent-scan.log
```

Each run is wrapped in a `===== date =====` marker followed by that run's
output and summary:

```
===== Wed Aug 16 17:30:01 BST 2026 =====
/Users/lewiswestbury/Downloads/bad.dmg: Win.Test.EICAR_HDB-1 FOUND
----------- SCAN SUMMARY -----------
Known viruses: 1024917
Scanned files: 4821
Infected files: 1
```

### weekly scan — the full-disk scan

```bash
tail -n 40 /opt/homebrew/var/log/clamav/weekly-scan.log
```

Each week has a `Weekly scan started` line, then a `Weekly scan finished
... (exit code: N)` line followed by that run's output. For the most recent
results use the summary instead:

```bash
cat /opt/homebrew/var/log/clamav/last-scan-summary.txt
```

## Quick "did anything get found?" checks

Any one of these will tell you if there's a problem to look at:

```bash
# Detections from the last weekly scan:
grep FOUND /opt/homebrew/var/log/clamav/weekly-scan.log | tail

# All detections in the daemon log today:
grep FOUND /opt/homebrew/var/log/clamd.log | tail

# The latest scan summaries, side by side:
cat /opt/homebrew/var/log/clamav/last-scan-summary.txt

# The last few weekly runs. A "started" with no "finished" after it was
# interrupted:
grep -E "^===== Weekly|^Infected files" /opt/homebrew/var/log/clamav/weekly-scan.log | tail -20
```

Or just run `av-status` (see [Shell helpers](#shell-helpers)).

## Shell helpers

Six shell commands wrap the checks above. Type `av-` and press Tab to list
them:

| Command | What it does |
|---|---|
| `av-status` | The summary below: recent weekly runs, detections, quarantine, updates, upcoming scans and reminders. |
| `av-run-status` | Any scan running now (with elapsed time), when each scan type next runs, and the scheduled wake. |
| `av-run-weekly` | Starts the weekly scan now, via launchd, even on battery (asks for your password). |
| `av-run-frequent` | Starts the frequent scan now, via launchd. |
| `av-list-quarantine` | Lists quarantined files: date (the file's own modified time), size, and `run-folder/name`. Leftover lock files are only counted. |
| `av-clear-quarantine` | Lists the quarantine, asks for confirmation, then permanently deletes everything in it (asks for your password). Refuses while a scan is running. |

### Step 1 — The status script

`av-status` runs a small Python script that reads the logs in this chapter and
prints the summary. It uses only the Python standard library, plus `brew` to
find out when the engine was last installed.

```bash
nano /opt/homebrew/etc/clamav/scripts/status.py
```

Paste in:

```python
#!/usr/bin/env python3
"""Summary of recent ClamAV scans, updates and schedule. Run via `av-status`."""
import json
import os
import re
import subprocess
import time
from datetime import datetime, timedelta

LOGDIR = "/opt/homebrew/var/log"
QUARANTINE = "/opt/homebrew/var/quarantine"
RUNS = 8
STATUS = {"0": "clean", "1": "infected", "2": "error"}
FREQUENT_INTERVAL = timedelta(minutes=30)  # StartInterval in com.user.clamav-frequent-scan.plist


def parse(stamp):
    """Parse `date` output like "Sun Oct 25 03:06:32 GMT 2026" (GMT/BST aware)."""
    return datetime.fromtimestamp(time.mktime(time.strptime(stamp, "%a %b %d %H:%M:%S %Z %Y")))


def when(dt):
    return dt.strftime("%Y-%m-%d %a %H:%M:%S")


def duration(td):
    hours, rest = divmod(td.seconds, 3600)
    days = f"{td.days} day{'' if td.days == 1 else 's'}"
    return f"{days}, {hours:02}:{rest // 60:02}:{rest % 60:02}"


def weekly_runs():
    runs, run = [], None
    with open(f"{LOGDIR}/clamav/weekly-scan.log", errors="replace") as log:
        for line in log:
            if m := re.match(r"===== Weekly scan started: (.+?)(?: \(manual\))? =====", line):
                run = {"start": parse(m[1])}
                runs.append(run)
            elif run and (m := re.match(r"===== Weekly scan finished: (.+) \(exit code: (\d+)\)", line)):
                run["end"], run["exit"] = parse(m[1]), m[2]
            elif run and "end" in run and (m := re.match(r"Infected files: (\d+)", line)):
                run["infected"] = int(m[1])
    return runs


def frequent_runs():
    """One dict per frequent scan, oldest first."""
    runs = []
    with open(f"{LOGDIR}/clamav/frequent-scan.log", errors="replace") as log:
        for line in log:
            if m := re.match(r"===== (.+) =====$", line):
                runs.append({"start": parse(m[1]), "Infected files": 0})
            elif runs and (m := re.match(r"(Known viruses|Infected files|Time): ([\d.]+)", line)):
                runs[-1][m[1]] = float(m[2])
    return runs


def last_db_update():
    found = None
    with open(f"{LOGDIR}/freshclam.log", errors="replace") as log:
        for line in log:
            if m := re.match(r"(.+?) -> (\S+) updated \(version: (\d+)", line):
                found = m.groups()
    if not found:
        return "none in the current freshclam.log"
    stamp, db, version = found
    return f"{datetime.strptime(stamp, '%a %b %d %H:%M:%S %Y'):%Y-%m-%d %a %H:%M:%S}  ({db} version {version})"


def last_engine_update():
    info = json.loads(subprocess.run(["brew", "info", "--json=v2", "clamav"],
                                     capture_output=True, text=True, check=True).stdout)
    latest = max(info["formulae"][0]["installed"], key=lambda i: i["time"] or 0)
    installed = when(datetime.fromtimestamp(latest["time"])) if latest["time"] else "unknown"
    return f"{installed}  (ClamAV {latest['version']})"


def next_weekly(now):
    # ponytail: assumes the Sunday 03:00 schedule in weekly-scan.sh
    nxt = (now + timedelta(days=(6 - now.weekday()) % 7)).replace(hour=3, minute=0, second=0, microsecond=0)
    if nxt > now:
        nxt -= timedelta(days=7)
    # Due (and not yet finished) since the last Sunday 03:00?
    summary = f"{LOGDIR}/clamav/last-scan-summary.txt"
    if not os.path.exists(summary) or datetime.fromtimestamp(os.path.getmtime(summary)) < nxt:
        if subprocess.run(["pgrep", "-f", "weekly-scan.sh"], capture_output=True).returncode == 0:
            return "running now (see av-run-status)"
        return "due now, starts when the Mac is on mains power"
    return when(nxt + timedelta(days=7)) + " (on mains power)"


def main():
    now = datetime.now()
    weekly = weekly_runs()
    frequent = frequent_runs()

    # A scan with no signatures loaded "succeeds" but checks nothing.
    if frequent and not frequent[-1].get("Known viruses"):
        print(f"WARNING: the last frequent scan ({when(frequent[-1]['start'])}) loaded no virus signatures,\n"
              "         so scans are checking nothing. Run `clamscan /etc/hosts` to see why, and see\n"
              "         'Malformed database' in 07-testing-and-troubleshooting.md.\n")

    print("Weekly scans")
    rows = [("Date", "Day", "Started", "Finished", "Duration", "Exit status", "Infected files")]
    for run in weekly[-RUNS:]:
        end = run.get("end")
        rows.append((
            f"{run['start']:%Y-%m-%d}", f"{run['start']:%a}", f"{run['start']:%H:%M:%S}",
            f"{end:%H:%M:%S}" if end else "-",
            duration(end - run["start"]) if end else "-",
            STATUS.get(run.get("exit"), "error") if end else "interrupted",
            str(run.get("infected", "-")),
        ))
    widths = [max(len(row[i]) for row in rows) for i in range(len(rows[0]))]
    for i, row in enumerate(rows):
        print(("  " + "  ".join(cell.ljust(w) for cell, w in zip(row, widths))).rstrip())
        if i == 0:
            print("  " + "  ".join("-" * w for w in widths))
    print("  (an 'interrupted' scan was stopped by a restart or similar)")

    print("\nStats")
    hit = next((r for r in reversed(weekly) if r.get("infected")), None)
    print(f"  - Last weekly scan with detections:   "
          + (f"{when(hit['start'])}, {hit['infected']} infected file(s)" if hit else "none"))
    hit = next((r for r in reversed(frequent) if r["Infected files"]), None)
    print(f"  - Last frequent scan with detections: "
          + (f"{when(hit['start'])}, {hit['Infected files']:.0f} infected file(s)" if hit else "none"))
    # Completed = reached the summary with signatures loaded (a broken database scans nothing).
    times = [r["Time"] for r in frequent if r.get("Time") is not None and r.get("Known viruses")][-5:]
    print(f"  - Frequent scan avg duration:         "
          + (f"{duration(timedelta(seconds=round(sum(times) / len(times))))} (last {len(times)} completed)"
             if times else "no completed scans"))
    files = sum(1 for _, _, names in os.walk(QUARANTINE) for n in names
                if not n.startswith(".clamav-quarantine-lock."))
    print(f"  - Files in quarantine:                {files}")

    print("\nUpdates")
    print(f"  - Virus database last updated: {last_db_update()}")
    print(f"  - Engine last updated:         {last_engine_update()}")

    print("\nUpcoming")
    print(f"  - Next weekly scan:   {next_weekly(now)}")
    nxt = frequent[-1]["start"] + FREQUENT_INTERVAL if frequent else now
    print(f"  - Next frequent scan: {when(nxt) if nxt > now else 'due now (runs on next wake)'}")

    print("\nReminders")
    print("  - Start a scan now:      av-run-frequent, av-run-weekly")
    print("  - Watch a running scan:  av-run-status")
    print(f"  - Quarantine:            {QUARANTINE}/  (see 04-quarantine.md)")


if __name__ == "__main__":
    main()
```

Make it executable:

```bash
chmod +x /opt/homebrew/etc/clamav/scripts/status.py
```

Example output:

```
Weekly scans
  Date        Day  Started   Finished  Duration          Exit status  Infected files
  ----------  ---  --------  --------  ----------------  -----------  --------------
  2026-09-06  Sun  03:06:47  19:53:10  4 days, 16:46:23  error        0
  2026-09-13  Sun  03:16:16  04:40:32  5 days, 01:24:16  error        0
  2026-09-20  Sun  03:12:18  -         -                 interrupted  -
  2026-09-27  Sun  03:04:52  12:21:29  1 day, 09:16:37   error        0
  2026-10-04  Sun  03:05:25  03:30:08  1 day, 00:24:43   error        0
  2026-10-11  Sun  03:00:05  -         -                 interrupted  -
  2026-10-18  Sun  03:00:05  17:15:35  0 days, 14:15:30  error        0
  2026-10-25  Sun  03:06:32  15:42:39  1 day, 12:36:07   infected     2
  (an 'interrupted' scan was stopped by a restart or similar)

Stats
  - Last weekly scan with detections:   2026-10-25 Sun 03:06:32, 2 infected file(s)
  - Last frequent scan with detections: 2026-08-22 Sat 18:43:32, 1 infected file(s)
  - Frequent scan avg duration:         0 days, 00:23:42 (last 5 completed)
  - Files in quarantine:                1

Updates
  - Virus database last updated: 2026-10-31 Sat 21:29:51  (daily.cvd version 28170)
  - Engine last updated:         unknown  (ClamAV 1.5.4)

Upcoming
  - Next weekly scan:   2026-11-01 Sun 03:00:00 (on mains power)
  - Next frequent scan: 2026-10-31 Sat 22:08:25

Reminders
  - Start a scan now:      av-run-frequent, av-run-weekly
  - Watch a running scan:  av-run-status
  - Quarantine:            /opt/homebrew/var/quarantine/  (see 04-quarantine.md)
```

What each part means:

- **WARNING** (only when something's wrong): the last frequent scan loaded no
  virus signatures, or never got as far as its summary. Scans in that state
  report `Infected files: 0` but check nothing. See "Malformed database" in
  [07-testing-and-troubleshooting.md](07-testing-and-troubleshooting.md).
- **Exit status**: `clean` (exit 0), `infected` (exit 1), `error` (exit 2,
  usually files it couldn't open), or `interrupted` (the scan started but
  never finished, e.g. after a restart).
- **Duration** is wall-clock time. Hours in sleep count, so a scan that took
  several days was paused while the Mac slept (see chapter 03, step 3).
- **Virus database** is the last time `freshclam` downloaded new signatures.
  Only the current `freshclam.log` is checked, so after a log rotation this
  can read "none".
- **Frequent scan avg duration** averages the last 5 frequent scans that
  finished with signatures loaded. Scans that hit a broken database scan
  nothing and are left out.
- **Engine** is the last time Homebrew installed or upgraded ClamAV
  (`brew upgrade clamav`).
- **Next weekly scan** shows "due now, starts when the Mac is on mains power"
  if this week's scan hasn't finished yet, or "running now" while it runs.
- **Next frequent scan** is the last run plus 30 minutes. "due now" means the
  Mac slept through it, and launchd will run it on the next wake.

### Step 2 — The shell functions

They're zsh functions, which tab-complete like any command. Oh My Zsh loads
every `*.zsh` file in `~/.oh-my-zsh/custom/` at startup, so put them there:

```bash
nano ~/.oh-my-zsh/custom/clamav.zsh
```

Paste in:

```zsh
# ClamAV helpers. Type `av-<Tab>` to list them.
# Setup guide: ~/src/personal/learning/clamav-docs

AV_LOGDIR=/opt/homebrew/var/log/clamav
AV_QUARANTINE=/opt/homebrew/var/quarantine

# Recent weekly runs, detections, updates and what's scheduled next.
av-status() {
  /opt/homebrew/etc/clamav/scripts/status.py
}

av-run-frequent() {
  launchctl kickstart "gui/$(id -u)/com.user.clamav-frequent-scan" && echo "Frequent scan started."
}

# Manual runs skip the "due" and mains-power checks in weekly-scan.sh.
av-run-weekly() {
  touch "$AV_LOGDIR/weekly-manual" &&
    sudo launchctl kickstart system/com.clamav.weekly-scan &&
    echo "Weekly scan started. Check progress with av-run-status."
}

# Any running scans, plus when each scan type next runs.
av-run-status() {
  echo "== Running scans =="
  ps -o pid,etime,args -p "$(pgrep -d, clamscan)" 2>/dev/null || echo "None"
  echo
  echo "== Next scheduled =="
  local last=$(grep "^=====" "$AV_LOGDIR/frequent-scan.log" | tail -n 1 | sed 's/===== \(.*\) =====/\1/')
  local last_s=$(date -j -f "%a %b %e %T %Z %Y" "$last" +%s 2>/dev/null)
  echo "Frequent: every 30 min, next ~$(date -r $(( ${last_s:-$(date +%s)} + 1800 )) '+%a %d %b %H:%M')"
  # ponytail: assumes the Sunday 03:00 schedule in com.clamav.weekly-scan.plist
  local next=$(date -v+sun -v3H -v0M -v0S +%s)
  (( next <= $(date +%s) )) && next=$(date -v+7d -r $next +%s)
  echo "Weekly:   Sundays 03:00 on mains power, next $(date -r $next '+%a %d %b %H:%M') (av-status shows if one is overdue)"
  echo
  echo "== Scheduled wakes =="
  pmset -g sched | grep -iA2 repeating || echo "No repeating wake set (see 03-weekly-scan.md)"
}

# Quarantined files (date moved, size, run folder/name). Lock files left by
# interrupted scans aren't detections, so they're only counted.
av-list-quarantine() {
  local files=$(find "$AV_QUARANTINE" -type f ! -name '.clamav-quarantine-lock.*' \
    -exec stat -f '%Sm  %8z  %N' -t '%Y-%m-%d %H:%M' {} + | sed "s|$AV_QUARANTINE/||")
  echo "${files:-No quarantined files.}"
  local locks=$(find "$AV_QUARANTINE" -type f -name '.clamav-quarantine-lock.*' | wc -l | tr -d ' ')
  (( locks )) && echo "(plus $locks leftover lock file(s) from interrupted scans)"
  echo "Original locations: grep FOUND $AV_LOGDIR/*-scan.log"
}

# Permanently deletes everything in quarantine, after confirmation.
av-clear-quarantine() {
  if pgrep -q clamscan; then
    echo "A scan is running and may be moving files into quarantine. Try again when it's finished."
    return 1
  fi
  av-list-quarantine
  read -q "?Permanently delete all of the above? [y/N] " || { echo; return 1; }
  echo
  sudo find "$AV_QUARANTINE" -mindepth 1 -delete && echo "Quarantine emptied."
}
```

Open a new terminal (or run `source ~/.oh-my-zsh/custom/clamav.zsh`) to load
them. Without Oh My Zsh, add the same functions to `~/.zshrc` instead.

## Live monitoring

If you want a live dashboard of what the daemon is doing (queued jobs, memory,
database version), ClamAV ships a small ncurses tool:

```bash
/opt/homebrew/bin/clamdtop
```

Press `q` to quit.

## Log growth and rotation

- `clamd.log` and `freshclam.log` rotate themselves. `LogRotate yes` plus
  `LogFileMaxSize 2M` (set in chapter 01) mean launchd/clamd keep at most a
  2MB file and rotate automatically.
- `frequent-scan.log` and `weekly-scan.log` grow without limit. If they ever
  get big, you can shrink them safely:

  ```bash
  # Keep just the last 1000 lines:
  sudo bash -c 'tail -n 1000 /opt/homebrew/var/log/clamav/weekly-scan.log > /tmp/w.log && mv /tmp/w.log /opt/homebrew/var/log/clamav/weekly-scan.log'
  ```

## References

- `man clamd.conf` (see `LogFile`, `LogRotate`, `LogTime`, `ExtendedDetectionInfo`)
- `man freshclam.conf` (see `UpdateLogFile`, `LogRotate`)
