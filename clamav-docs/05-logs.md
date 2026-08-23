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

Same format as the frequent scan, one block per week. For the most recent
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
```

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
