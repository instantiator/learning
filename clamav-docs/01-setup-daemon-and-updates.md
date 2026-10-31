# 01 — Start the daemon and automatic signature updates

This first step does two things:

1. Starts the **clamd daemon** — the always-running scanner other tools talk to.
   It starts automatically when your Mac boots.
2. Starts the **database updater (freshclam)** — it downloads new virus
   signatures every two hours so your scans are always against the latest
   definitions.

> The daemon itself doesn't scan anything until you tell it to — the next
> chapters hook scans up to it. This chapter just gets the background plumbing
> running.

## Before you start

Check your config files are where we expect them:

```bash
ls -la /opt/homebrew/etc/clamav/
```

You should see `clamd.conf`, `clamd.conf.sample`, `freshclam.conf` and
`freshclam.conf.sample`. The `.conf` files are currently just copies of the
samples, with every option switched off. We're going to switch the ones we need
on.

The virus database was already downloaded by your earlier `sudo freshclam` and
lives in `/opt/homebrew/var/lib/clamav/`, owned by the `_clamav` user that
Homebrew created for ClamAV. Both `clamd` and `freshclam` will use that folder.

## Part A — Configure clamd (the daemon)

Edit the daemon config:

```bash
sudo nano /opt/homebrew/etc/clamav/clamd.conf
```

Find each line below and either uncomment it (delete the leading `#`) or add it
near the top of the file. The values shown are the ones this guide uses:

```ini
# Where the daemon writes its log.
LogFile /opt/homebrew/var/log/clamd.log
LogTime yes
LogRotate yes
LogFileMaxSize 2M

# Where the daemon stores its process id.
PidFile /opt/homebrew/var/run/clamav/clamd.pid

# The local "socket" that clamdscan and friends connect to.
# Note: because "User _clamav" makes clamd drop root before the socket is
# created, clamd cannot chown the socket to another group (it would need root).
# So the socket keeps group _clamav and must use world-accessible mode 666.
# That's fine on a single-user Mac.
LocalSocket /opt/homebrew/var/run/clamav/clamd.sock
LocalSocketMode 666

# Drop root privileges once started and run as the _clamav user.
User _clamav

# Show the file size and hash in detection log lines (useful later).
ExtendedDetectionInfo yes

# Run this script whenever the daemon detects a virus.
# (We create this script in chapter 06.)
VirusEvent /opt/homebrew/etc/clamav/scripts/virus-event.sh

# Check every 10 minutes that the database is not too old.
SelfCheck 600
```

> **What is the `User _clamav` line for?** ClamAV parses untrusted files, so it
> is safer not to run it as your admin account or as root for longer than
> needed. `clamd` is started by root (by `brew services`) but hands its
> privileges to the low-privilege `_clamav` account immediately afterwards.

Save and exit.

### Create the folders and files clamd needs

`clamd` will create the socket and pid files inside `/opt/homebrew/var/run/clamav/`,
and write to a log file. Give `_clamav` ownership of all of these:

```bash
sudo mkdir -p /opt/homebrew/var/run/clamav
sudo chown _clamav:_clamav /opt/homebrew/var/run/clamav
sudo chmod 775 /opt/homebrew/var/run/clamav

sudo touch /opt/homebrew/var/log/clamd.log
sudo chown _clamav:_clamav /opt/homebrew/var/log/clamd.log
```

> The socket directory needs to be readable by everyone (including your
> account), because your account runs `clamdscan`. Mode `775` keeps `_clamav`
> as the owner while letting anyone reach the socket file inside — and the
> socket file itself is world-accessible (mode `666`), so any local user can
> connect. On a single-user Mac that's an acceptable trade-off for being able
> to run `clamd` as the low-privilege `_clamav` user.
>
> (You may see a `ERROR: Failed to change socket ownership to group admin`
> line in `clamd.log` if you previously used a `LocalSocketGroup` setting —
> that setting doesn't work on macOS when `User _clamav` is set, and it made
> clamd abort. With `LocalSocketMode 666` and no `LocalSocketGroup` line, clamd
> starts cleanly.)

## Part B — Configure freshclam (the updater)

Edit the updater config:

```bash
sudo nano /opt/homebrew/etc/clamav/freshclam.conf
```

Uncomment or add:

```ini
# Where the updater writes its log.
UpdateLogFile /opt/homebrew/var/log/freshclam.log
LogTime yes
LogRotate yes
LogFileMaxSize 2M

# Tell the running clamd to reload the database after an update.
# (This is already the default for Homebrew, but it's explicit and clear.)
NotifyClamd /opt/homebrew/etc/clamav/clamd.conf

# Stay in the foreground so that launchd can keep us alive cleanly.
Foreground yes

# Where to download updates from. This is REQUIRED - without it freshclam
# refuses to start with "No DatabaseMirror ... servers set".
DatabaseMirror database.clamav.net

# Check for updates 12 times a day (every 2 hours).
Checks 12
```

> `freshclam` will switch itself to the `_clamav` user to download and write
> the database files (that's the `DatabaseOwner` option, already the default).
> That's fine — the database folder is owned by `_clamav`.

Save and exit, then create its log file:

```bash
sudo touch /opt/homebrew/var/log/freshclam.log
sudo chown _clamav:_clamav /opt/homebrew/var/log/freshclam.log
```

### Check your config parses cleanly

```bash
/opt/homebrew/bin/clamconf
```

You should see your settings echoed back with no "Error" lines, e.g.
`LocalSocket = /opt/homebrew/var/run/clamav/clamd.sock` and
`UpdateLogFile = /opt/homebrew/var/log/freshclam.log`.

## Part C — Start clamd at boot (via brew services)

Homebrew ships a service definition for ClamAV that runs `clamd` and keeps it
alive. Because `clamd` needs to bind to system resources, the service must run
as root — which is why it needs `sudo`.

```bash
sudo /opt/homebrew/bin/brew services start clamav
```

This installs a launchd job at `/Library/LaunchDaemons/sh.brew.clamav.plist` (`homebrew.mxcl.clamav.plist` on older Homebrew)
that:

- starts `clamd` now,
- restarts it if it ever crashes (`keep_alive`),
- starts it again every time your Mac boots.

Check it's running:

```bash
sudo /opt/homebrew/bin/brew services list
# clamav should show "started"

/opt/homebrew/bin/clamdscan --version
# should print ClamAV version + database version, not "Could not connect"
```

If you need to change `clamd.conf` later, restart the service:

```bash
sudo /opt/homebrew/bin/brew services restart clamav
```

## Part D — Run freshclam at boot (via a launchd daemon)

`brew services` only manages `clamd`, not `freshclam`, so we add our own launchd
job for the updater. Launchd jobs for things that need root go in
`/Library/LaunchDaemons/` and must be loaded with `sudo`.

Create the job file:

```bash
sudo nano /Library/LaunchDaemons/com.clamav.freshclam.plist
```

Paste in:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.clamav.freshclam</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/bin/freshclam</string>
        <string>--daemon</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardErrorPath</key>
    <string>/opt/homebrew/var/log/clamav/freshclam-stderr.log</string>
</dict>
</plist>
```

> **Why `--daemon`?** freshclam only loops forever (checking every 2 hours)
> when it's told to run in daemon mode. Without `--daemon`, it does a single
> check and exits — and `KeepAlive` then makes launchd restart it ~10 seconds
> later, forever, which shows up as a persistent `state = spawn scheduled`
> instead of `state = running`. `--daemon` (daemon mode) plus `Foreground yes`
> in `freshclam.conf` (don't fork) is the right pairing for launchd: one
> foreground process that stays alive and does its own periodic checks.

Save and exit. Then fix the file permissions (launchd requires the daemon plist
to be owned by root) and load the job:

```bash
sudo chown root:wheel /Library/LaunchDaemons/com.clamav.freshclam.plist
sudo chmod 644 /Library/LaunchDaemons/com.clamav.freshclam.plist

sudo mkdir -p /opt/homebrew/var/log/clamav
sudo chown lewiswestbury:admin /opt/homebrew/var/log/clamav
sudo launchctl bootstrap system /Library/LaunchDaemons/com.clamav.freshclam.plist
```

Check it's running:

```bash
sudo launchctl print system/com.clamav.freshclam
# look for "state = running"

tail -n 5 /opt/homebrew/var/log/freshclam.log
# you should see recent "Database reloaded" or "Your ClamAV installation is
# now up to date" messages
```

> **Note on loading/unloading:** the modern launchd commands are
> `sudo launchctl bootstrap system <plist>` and
> `sudo launchctl bootout system/<label>`. If your macOS complains, the older
> `sudo launchctl load <plist>` / `sudo launchctl unload <plist>` also work.

## Verification checklist

- [ ] `sudo /opt/homebrew/bin/brew services list` shows `clamav` as `started`
- [ ] `clamdscan --version` connects to the daemon
- [ ] `sudo launchctl print system/com.clamav.freshclam` shows `state = running`
- [ ] `/opt/homebrew/var/log/freshclam.log` shows a recent update/reload line
- [ ] `tail -f /opt/homebrew/var/log/clamd.log` shows a "Database correctly
      reloaded" message after freshclam updates

## Summary

You now have a daemon that starts at boot and always stays up, plus an updater
that keeps its virus database fresh every two hours. Nothing is being scanned
yet — the next chapters add the scans.

## References

- ClamAV scanning manual (clamd): https://docs.clamav.net/manual/Usage/Scanning.html
- ClamAV configuration manual: https://docs.clamav.net/manual/Usage/Configuration.html
- `man clamd.conf` and `man freshclam.conf` on your machine
