# TODO — return to the latest Homebrew ClamAV

**Status (2026-10-31):** ClamAV is pinned to an older build of 1.5.4 that links
against OpenSSL 3. The current Homebrew build, `1.5.4_1`, links against
OpenSSL 4.1 and rejects every signature database ("Incorrect digital
signature"). See "Malformed database" in
[07-testing-and-troubleshooting.md](07-testing-and-troubleshooting.md).

What's different from a normal install:

- `brew pin clamav` stops `brew upgrade` reinstalling the broken build.
- The pinned keg (`/opt/homebrew/Cellar/clamav/1.5.4`) has no Homebrew install
  receipt, so `brew services` says "Formula `clamav` is not installed". clamd
  is started by a hand-installed copy of the keg's own plist,
  `/Library/LaunchDaemons/homebrew.mxcl.clamav.plist`, instead of
  `sudo brew services`.
- A backup of the working keg is at `~/clamav-1.5.4-keg-backup`.

## How you'll know it's time to unpin

Either of these:

1. **The Homebrew issue is closed with a fix:**
   [Homebrew/homebrew-core#322048](https://github.com/Homebrew/homebrew-core/issues/322048).
   (The upstream fix is
   [Cisco-Talos/clamav#1873](https://github.com/Cisco-Talos/clamav/pull/1873).)
2. **Homebrew offers a newer build than `1.5.4_1`.** Check with:

   ```bash
   brew update
   brew info --json=v2 clamav | python3 -c 'import json,sys; f=json.load(sys.stdin)["formulae"][0]; print(f"{f["versions"]["stable"]}_{f["revision"]}")'
   ```

   `1.5.4_1` means it's still the broken build. Anything newer (`1.5.4_2`,
   `1.5.5`, …) is a candidate. A newer build isn't guaranteed to be fixed, so
   the steps below test it before relying on it.

## What to do then

```bash
# 1. Install the new build (upgrade may not work, because the pinned keg has no receipt).
brew unpin clamav
brew install clamav            # or: brew upgrade clamav

# 2. Test it. Expect "Known viruses" above 0 and no "Malformed database" errors.
clamscan /etc/hosts
```

If the test **passes**:

```bash
# 3. Hand clamd back to brew services.
sudo launchctl bootout system/homebrew.mxcl.clamav
sudo rm /Library/LaunchDaemons/homebrew.mxcl.clamav.plist
sudo brew services start clamav

# 4. Restart freshclam on the new build.
sudo launchctl kickstart -k system/com.clamav.freshclam

# 5. Remove the old keg and the backup.
sudo rm -rf /opt/homebrew/Cellar/clamav/1.5.4
rm -rf ~/clamav-1.5.4-keg-backup
```

Then check:

- `brew services info clamav` shows `Running: true`.
- `tail /opt/homebrew/var/log/freshclam.log` shows no "Malformed database"
  or "NULL X509 store" errors.
- After the next frequent scan (up to 30 minutes), `av-status` shows no
  WARNING.

Then delete this file, and the "pinned" mention in
[07-testing-and-troubleshooting.md](07-testing-and-troubleshooting.md) if
it's no longer relevant.

If the test **fails** (the new build is still broken), go back to the pinned
build:

```bash
brew uninstall clamav          # removes the new keg only
brew link clamav               # relinks 1.5.4
brew pin clamav
sudo launchctl kickstart -k system/com.clamav.freshclam
sudo launchctl kickstart -k system/homebrew.mxcl.clamav
clamscan /etc/hosts            # back to "Known viruses" above 0
```

If `/opt/homebrew/Cellar/clamav/1.5.4` has gone missing, restore it from the
backup first: `cp -a ~/clamav-1.5.4-keg-backup /opt/homebrew/Cellar/clamav/1.5.4`.
