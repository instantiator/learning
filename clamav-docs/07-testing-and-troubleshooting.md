# 07 — Testing and troubleshooting

This chapter proves the whole setup works end-to-end, and fixes the common
things that go wrong.

## Part A — Test everything with the EICAR file

ClamAV and every other anti-virus product recognise a standard, harmless test
string called **EICAR**. It's not a real virus — it's just a string that every
scanner is guaranteed to flag — so it's the perfect way to test without
installing malware.

### 1. Test the frequent scan

Create the file in Downloads:

```bash
printf 'X5O!P%%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*' > ~/Downloads/eicar-test.txt
```

Run the frequent scan by hand:

```bash
/opt/homebrew/etc/clamav/scripts/frequent-scan.sh
```

You should see:

- a **notification** ("1 infected file(s) found..."),
- the file **gone from `~/Downloads`**,
- it now sitting in quarantine:

```bash
find /opt/homebrew/var/quarantine -type f -name "eicar-test.txt"
```

Clean up when you're done:

```bash
sudo rm -rf /opt/homebrew/var/quarantine/*/eicar-test.txt
```

### 2. Test the daemon + instant alert

Create the file somewhere else and ask the daemon to scan it with `clamdscan`
(the tool that talks to the running clamd):

```bash
printf 'X5O!P%%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*' > /tmp/eicar-test.txt
mkdir -p /opt/homebrew/var/quarantine/clamd-test
clamdscan --move=/opt/homebrew/var/quarantine/clamd-test /tmp/eicar-test.txt
```

Expect a "Win.Test.EICAR_HDB-1 FOUND" result, a **daemon notification**, and
the matching lines in `/opt/homebrew/var/log/clamd.log`:

```bash
grep FOUND /opt/homebrew/var/log/clamd.log | tail
```

Clean up:

```bash
sudo rm -rf /opt/homebrew/var/quarantine/clamd-test
```

### 3. Test the weekly scan

The weekly script is a full-disk scan and takes hours, so don't run it just for
fun. To test its plumbing instead, put the EICAR file somewhere and run a
`clamscan` command that mirrors the script's important options:

```bash
printf 'X5O!P%%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*' > /tmp/eicar-test.txt
clamscan --infected --move=/opt/homebrew/var/quarantine/test /tmp/eicar-test.txt
echo "exit code was $?"
```

The exit code should be `1` (virus found). Then confirm the summary machinery
works by checking the weekly log format after your first real run
([03-weekly-scan.md](03-weekly-scan.md)).

## Part B — Troubleshooting

### "Could not connect to clamd"

`clamdscan` and friends talk to the daemon over its socket. If you see
connection errors:

```bash
# 1. Is the service running at all?
sudo /opt/homebrew/bin/brew services list

# 2. Did clamd start and drop privileges OK? (no "ERROR" lines)
sudo tail -n 30 /opt/homebrew/var/log/clamd.log

# 3. Does the socket exist with the right permissions?
ls -la /opt/homebrew/var/run/clamav/
```

Common causes:

- **`ERROR: Failed to change socket ownership to group admin` in the log.**
  This happens if you have a `LocalSocketGroup` line in `clamd.conf` together
  with `User _clamav`. Once clamd drops root, it can't `chown` the socket to a
  different group, so it aborts and leaves the socket at mode `000` — which is
  exactly the "Permission denied" you're seeing. Remove the `LocalSocketGroup`
  line and use `LocalSocketMode 666` (see chapter 01), then restart.
- The `_clamav` user can't write to the socket folder — re-check the
  `chown`/`chmod` from chapter 01 (the folder should be owned by `_clamav`,
  mode `775`).
- The socket file itself has mode `000` — a symptom of the previous bullet.
  After fixing the config, restart clamd and confirm the socket shows
  `srwxrwxrwx` (`666`).
- You changed `clamd.conf` but didn't restart: `sudo /opt/homebrew/bin/brew
  services restart clamav`.
- A stale socket from an earlier run — the `FixStaleSocket` option (default
  yes) usually handles this; otherwise `sudo rm
  /opt/homebrew/var/run/clamav/clamd.sock` and restart.

### "ERROR: Can't open/parse the config file"

ClamAV deliberately fails if a config file is invalid or looks like an
unmodified sample. Check for:

- A leftover `Example` line in `clamd.conf` or `freshclam.conf` (the sample
  files start with `# Example` — if you copied them, make sure that line is
  commented or removed; it is by default, so this usually isn't the issue).
- A typo in an option name. Validate both files:

  ```bash
  /opt/homebrew/bin/clamconf
  ```

  Any "Error" lines point at the offending option.

### clamd won't start — permission errors for the log or pid

```bash
sudo tail -n 20 /opt/homebrew/var/log/clamd.log   # check for "Permission denied"
```

Make sure the log is owned by `_clamav` and the run folder is writable by
`_clamav` (re-run the setup commands from chapter 01):

```bash
sudo chown _clamav:_clamav /opt/homebrew/var/log/clamd.log
sudo chown _clamav:_clamav /opt/homebrew/var/run/clamav
```

### freshclam errors

- **`state = spawn scheduled` instead of `running`** (from
  `sudo launchctl print system/com.clamav.freshclam`) — the job is crash/
  exit-looping. Two common causes:
  - Missing `DatabaseMirror` in `freshclam.conf` — freshclam refuses to start
    (`No DatabaseMirror or PrivateMirror servers set` in its stderr log). Add
    `DatabaseMirror database.clamav.net`.
  - The launchd job lacks `--daemon` — freshclam runs one check, exits, and
    `KeepAlive` respawns it. Add `--daemon` to the plist's `ProgramArguments`
    (see chapter 01), then `bootout`/`bootstrap` the job.
- **"Problem with internal logger"** — the log file isn't writable:
  `sudo chown _clamav:_clamav /opt/homebrew/var/log/freshclam.log`.
- **"Can't connect to port 80 of host database.clamav.net"** — no network or a
  firewall/proxy is blocking it. ClamAV respects `HTTPProxyServer` /
  `HTTPProxyPort` in `freshclam.conf`.
- **"Database Download Timeout"** — slow connection; increase `ReceiveTimeout`
  in `freshclam.conf` (e.g. `ReceiveTimeout 300`).
- **freshclam runs but clamd doesn't notice** — check `NotifyClamd
  /opt/homebrew/etc/clamav/clamd.conf` is set, then look for "Database
  correctly reloaded" in `/opt/homebrew/var/log/clamd.log`. If it's missing,
  restart both services.

### "Malformed database" / scans report `Known viruses: 0`

ClamAV can't verify its signature files ("Incorrect digital signature").
Scans still "succeed" but check nothing, and clamd won't start. Run
`clamscan /etc/hosts` to confirm.

**First, check whether *every* database fails**, including `main.cvd`, which
rarely changes. If it does, the files are fine and ClamAV itself is broken.
This happened on 2026-10-31, when Homebrew upgraded `openssl@4` to 4.1.0 and
the ClamAV build linked against it rejected all databases (see
[Homebrew/homebrew-core#322048](https://github.com/Homebrew/homebrew-core/issues/322048)
and
[Cisco-Talos/clamav#1873](https://github.com/Cisco-Talos/clamav/pull/1873)).
Re-downloading won't help. Check `ls -lT /opt/homebrew/Cellar/openssl@*` for a
recent upgrade.

If an older ClamAV keg built against a working OpenSSL is still in
`/opt/homebrew/Cellar/clamav/`, you can switch back to it. Check it first:
`otool -L /opt/homebrew/Cellar/clamav/<old>/lib/libclamav.12.dylib | grep ssl`
should show the working OpenSSL, and
`/opt/homebrew/Cellar/clamav/<old>/bin/clamscan /etc/hosts` should show
`Known viruses` above 0 with no errors. Only do this if it's the **same ClamAV
release** and its OpenSSL is still supported, so you aren't swapping one
problem for a known vulnerability. Then:

```bash
cp -a /opt/homebrew/Cellar/clamav/<old> ~/clamav-<old>-backup   # it can't be re-downloaded
brew uninstall clamav            # removes only the newest keg (--force would remove all)
sudo rm -rf /opt/homebrew/Cellar/clamav/<broken>   # if uninstall says it couldn't (root-owned files)
brew link clamav                 # links the remaining, working keg
brew pin clamav                  # stops `brew upgrade` reinstalling the broken build
sudo launchctl kickstart -k system/com.clamav.freshclam
sudo brew services restart clamav
```

> If `brew services` then says "Formula `clamav` is not installed", the old
> keg has no `INSTALL_RECEIPT.json`, so Homebrew doesn't recognise it.
> `brew uninstall` also removed the clamd service plist. Install the keg's own
> plist by hand instead:
>
> ```bash
> sudo cp /opt/homebrew/opt/clamav/homebrew.mxcl.clamav.plist /Library/LaunchDaemons/
> sudo chown root:wheel /Library/LaunchDaemons/homebrew.mxcl.clamav.plist
> sudo launchctl bootstrap system /Library/LaunchDaemons/homebrew.mxcl.clamav.plist
> ```
>
> The 2026-10-31 instance of this is tracked in
> [TODO-return-to-latest.md](TODO-return-to-latest.md).

When a fixed version is released, undo the pin:
`brew unpin clamav && brew upgrade clamav`, then restart both services as
above.

**If only one file fails**, it's a corrupt download. Delete the bad file and
let the freshclam daemon download it again:

```bash
sudo rm /opt/homebrew/var/lib/clamav/daily.cld
sudo launchctl kickstart -k system/com.clamav.freshclam   # restarts it; it updates on start
# wait a minute, then:
ls /opt/homebrew/var/lib/clamav/                          # daily.cvd/.cld is back
sudo brew services restart clamav
```

> Don't run `sudo freshclam` by hand while the daemon is running. It fails
> with "Failed to lock the log file … Resource temporarily unavailable",
> because the daemon holds the lock on `freshclam.log`.

### The weekly scan never runs on Sunday

- launchd jobs don't fire while the Mac is asleep (see chapter 03). The
  watchdog (chapter 06) will tell you about it, and the scan typically runs
  when the Mac next wakes.
- Scheduled scans only run on mains power. `av-status` shows "due now, starts
  when the Mac is on mains power" if one is waiting. Plug in, or run it now
  with `av-run-weekly`.
- Check the Sunday wake is scheduled: `pmset -g sched`. If it isn't, see
  chapter 03, step 3.
- Run `av-status`. A "started" line with no "finished" after it means a scan
  was interrupted, usually by a restart or by the Mac sleeping with the lid
  closed.
- To run it yourself now: `av-run-weekly` (or
  `sudo launchctl kickstart system/com.clamav.weekly-scan`).
- Check the job is registered: `sudo launchctl print system/com.clamav.weekly-scan`
- Check the script is executable: `ls -l /opt/homebrew/etc/clamav/scripts/weekly-scan.sh`

### Notifications don't appear

- Confirm the alert scripts are executable and end with the `osascript`
  line as written in chapters 02/03/06.
- Root's notifications don't reach your desktop. That's why `weekly-scan.sh`
  posts through `launchctl asuser`. If you write another root script, do the
  same.
- Check **System Settings → Notifications** for the app that ran the scripts
  (Terminal/iTerm, or whatever launchd used).
- `virus-event.sh` runs as the `_clamav` system user, which Notification Center
  can occasionally ignore. Options:
  - Rely on the scan scripts instead (they report the same detections).
  - If you want daemon-level alerts regardless, point `VirusEvent` at a script
    that logs to a file you check (e.g. append to
    `/opt/homebrew/var/log/clamav/virus-events.log`), and let the frequent scan
    or watchdog surface them.

### Scan output is full of "lstat failed" / permission warnings

Normal. The scanner can't read every file (some are owned by other users or
being modified mid-scan). Only `FOUND` lines matter.

### clamscan is slow

- The virus database is ~500MB and is loaded on every standalone `clamscan`
  run — that alone takes 10–30 seconds.
- Scanning `/` takes hours. That's why it's scheduled overnight. You can
  reduce scope by scanning a folder instead (see chapter 02's customising
  section).

## Part C — The "is everything healthy?" checklist

```bash
# Services
sudo /opt/homebrew/bin/brew services list                      # clamav: started
sudo launchctl print system/com.clamav.freshclam | grep state  # running
sudo launchctl print system/com.clamav.weekly-scan | grep state
launchctl print gui/$(id -u)/com.user.clamav-frequent-scan | grep state
launchctl print gui/$(id -u)/com.user.clamav-scan-watchdog | grep state

# Database freshness
tail -n 3 /opt/homebrew/var/log/freshclam.log

# Latest scan
cat /opt/homebrew/var/log/clamav/last-scan-summary.txt

# Any detections anywhere?
grep -l FOUND /opt/homebrew/var/log/clamd.log /opt/homebrew/var/log/clamav/*.log 2>/dev/null
```

## References

- EICAR test file information: https://www.eicar.org/download-anti-malware-testfile/
- ClamAV FAQ: https://docs.clamav.net/faq/faq.html
