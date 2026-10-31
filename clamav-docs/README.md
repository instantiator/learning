# ClamAV on macOS — setup guide

This guide sets up [ClamAV](https://www.clamav.net/) on macOS (installed via
Homebrew) as a set of automatic, low-maintenance anti-virus checks.

The setup is split into four layers that work together:

| Layer | What it does | When it runs | Runs as |
|---|---|---|---|
| **clamd daemon** | The always-running scanner that other tools talk to. | Always (starts at boot) | root, drops to `_clamav` |
| **Signature updates** | Keeps the virus database up to date. | Every 2 hours | root, drops to `_clamav` |
| **Frequent scans** | Quick scans of the places you download and open files. | Every 30 minutes | your user account |
| **Weekly deep scan** | A slow, thorough scan of your whole disk. | Every Sunday at 3:00, on mains power (otherwise when next plugged in) | root |

Around those four layers sit three support pieces:

- **Quarantine** — anything found is moved to a folder for you to review, rather
  than deleted (false positives happen).
- **Logs** — every component writes its own log so you can see what happened.
- **Notifications** — macOS notification alerts when something is found, when
  the weekly scan starts and completes, and a "watchdog" alert if the weekly
  scan hasn't run.
- **Shell helpers** — `av-status` (a one-screen summary of recent scans,
  detections, updates and upcoming runs), `av-run-status`, `av-run-weekly`,
  `av-run-frequent`, `av-list-quarantine` and `av-clear-quarantine` (see
  [05-logs.md](05-logs.md#shell-helpers)).

> **One important limitation:** ClamAV's real-time "on-access" scanner is a
> Linux-only feature and is not available on macOS. The closest practical
> alternative is the frequent-scan layer above. See
> [02-realtime-protection.md](02-realtime-protection.md).

## The guide

| Topic | File |
|---|---|
| Overview (this file) | `README.md` |
| Install ClamAV itself | [00-install.md](00-install.md) |
| Start the daemon + automatic updates | [01-setup-daemon-and-updates.md](01-setup-daemon-and-updates.md) |
| "Real-time" protection (frequent scans) | [02-realtime-protection.md](02-realtime-protection.md) |
| Weekly in-depth scan | [03-weekly-scan.md](03-weekly-scan.md) |
| Quarantine (reviewing what was found) | [04-quarantine.md](04-quarantine.md) |
| Where the logs are and how to read them | [05-logs.md](05-logs.md) |
| UI alerts / notifications | [06-notifications.md](06-notifications.md) |
| Testing and troubleshooting | [07-testing-and-troubleshooting.md](07-testing-and-troubleshooting.md) |

## Quick start

If you want everything up in one go, follow the "final structure" section at the
end of each of files 00, 01, 02 and 03, which each end with a checklist. A rough
sequence:

1. `00` — install ClamAV with Homebrew and download the first signature database.
2. `01` — configure `clamd.conf` and `freshclam.conf`, start the daemon.
3. `02` — add the frequent-scan scripts and LaunchAgent.
4. `03` — add the weekly-scan scripts and LaunchDaemon.
5. `04`–`06` — understand quarantine, logs and notifications.
6. `07` — run the EICAR test to prove everything works.

## Things you should know up front

- **ClamAV is a scanner, not a security suite.** It catches known malware but
  does not block you from installing malicious software, and it won't tell you a
  website or app is bad before you open it.
- **False positives are normal.** A clean file can look like a virus
  (especially downloaded installers). That's why everything is moved to a
  quarantine folder instead of being deleted. Always review before deleting.
- **Full-disk scans take hours.** The weekly scan is scheduled for 3am on
  Sunday so it runs while you're asleep. A scheduled wake at 02:55 and
  `caffeinate` keep the Mac awake for it. Leave it plugged in with the lid open.
- **This guide only documents; it does not run anything.** Every command here
  is for you to run. Most require `sudo`, and a few of the configuration
  options in these docs reflect decisions you can change later.

## Files created on your Mac

Following this guide creates these files:

```
/opt/homebrew/etc/clamav/clamd.conf          (edited - daemon settings)
/opt/homebrew/etc/clamav/freshclam.conf      (edited - update settings)
/opt/homebrew/etc/clamav/scripts/
    virus-event.sh                           (alert when clamd detects something)
    frequent-scan.sh                         (every-30-min scans)
    weekly-scan.sh                           (Sunday deep scan + summary)
    watchdog.sh                              (alert if weekly scan is missing)
    status.py                                (av-status summary)
/opt/homebrew/var/lib/clamav/                (virus signature database)
/opt/homebrew/var/quarantine/                (infected files land here)
/opt/homebrew/var/log/
    clamd.log                                (daemon log)
    freshclam.log                            (update log)
    clamav/
        frequent-scan.log                    (frequent scan log)
        weekly-scan.log                      (weekly scan log)
        last-scan-summary.txt                (latest weekly scan summary)
~/Library/LaunchAgents/
    com.user.clamav-frequent-scan.plist      (frequent scans)
    com.user.clamav-scan-watchdog.plist      (weekly-scan watchdog)
/Library/LaunchDaemons/
    sh.brew.clamav.plist                     (created by brew services - clamd;
                                              older Homebrew: homebrew.mxcl.clamav.plist)
    com.clamav.freshclam.plist               (updates)
    com.clamav.weekly-scan.plist             (weekly scan)
~/.oh-my-zsh/custom/clamav.zsh               (av-* shell helpers)
pmset repeating wake                         (Sunday 02:55, `pmset -g sched`)
```

## References

- ClamAV scanning manual: https://docs.clamav.net/manual/Usage/Scanning.html
- ClamAV configuration manual: https://docs.clamav.net/manual/Usage/Configuration.html
- On-access scanning (Linux only): https://docs.clamav.net/manual/OnAccess.html
- `man clamscan` and `man clamd.conf` on your machine
