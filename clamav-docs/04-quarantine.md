# 04 — Quarantine

This chapter explains what happens to infected files and how to deal with them
safely.

## The policy

**ClamAV never deletes anything on its own.** When a scan finds an infected
file, it *moves* that file into a quarantine folder, using the `--move` option.
The file leaves its original place but is still on your disk, safe and intact,
so you can examine it before deciding what to do.

> **Why not delete?** False positives are common — a legitimate installer or
> a file with some heuristic "suspicious" pattern can look like malware. If
> ClamAV deleted things automatically, you could lose real files. Moving them
> to quarantine means nothing is ever destroyed without your say-so.

## Where quarantined files go

Everything lands under `/opt/homebrew/var/quarantine/`, split into one dated
folder per scan run so you can tell when things were found:

```
/opt/homebrew/var/quarantine/
  20260816-172500/      <- frequent scan run
  20260817-030000/      <- weekly scan run
    eicar-test.txt
```

Both the frequent scan (chapter 02) and the weekly scan (chapter 03) already
create their own dated subfolder before scanning, so this works automatically.

> The first time a scan runs it creates `/opt/homebrew/var/quarantine/`
> itself. If you want to create it by hand, this does the same thing:
>
> ```bash
> sudo mkdir -p /opt/homebrew/var/quarantine
> sudo chown lewiswestbury:admin /opt/homebrew/var/quarantine
> sudo chmod 750 /opt/homebrew/var/quarantine
> ```
>
> Mode `750` means your account (and root) can write to it, but other local
> users can't.

## How to see what's in quarantine

List everything:

```bash
find /opt/homebrew/var/quarantine -type f -print
```

For details (size, when, where it came from) check the scan log — each `FOUND`
line shows the virus name and the file's **original** location:

```bash
grep FOUND /opt/homebrew/var/log/clamav/weekly-scan.log
```

Example:

```
/Users/lewiswestbury/Downloads/sketchy.dmg: Win.Test.EICAR_HDB-1 FOUND
```

That line tells you the file originally lived at
`/Users/lewiswestbury/Downloads/sketchy.dmg`. Keep that path handy if you want
to restore it.

## Stray `.clamav-quarantine-lock.*` files

If the listing above shows files named like `.clamav-quarantine-lock.21095.0`
(the helper script below lists them too), don't worry — those aren't infected
files. When `clamscan --move` moves an infected file into a dated folder, it
first creates one of these zero-byte lock files as a mutex, so two scans
moving files with the same basename into the same folder can't clobber each
other. It's deleted again immediately after the move completes.

A leftover lock means a run was killed mid-move — typically a manual run you
cancelled. Since every scan writes to its own fresh dated folder, later runs
never revisit old folders to clean up; the orphan just sits there harmlessly.

Clean them up with:

```bash
# Safe to run any time — only touches locks from runs that ended >24h ago:
sudo find /opt/homebrew/var/quarantine -type f \
  -name '.clamav-quarantine-lock.*' -mtime +0 -print -delete

# Once you're sure no scan is running, drop '-mtime +0' to sweep the rest.
```

> **Never delete a lock file while its scan may still be running.** The
> number in the middle of the name is the PID of the scan that created it —
> `ps -p 21095` tells you whether that process is alive. Removing a live
> scan's lock disables exactly the collision protection it exists for.

## What to do with a quarantined file

### Option 1 — Keep it quarantined (the safe default)

Do nothing. The file stays on your disk where it can't do any harm. Review it
when you have time.

### Option 2 — Inspect it yourself

Look at the file, check where it came from, and re-scan just that file:

```bash
# The '<virus> FOUND' line in the log tells you the original path.
# Find the quarantined copy:
find /opt/homebrew/var/quarantine -type f -name "sketchy.dmg"

# Re-scan it (read-only, nothing happens to the file):
/opt/homebrew/bin/clamscan --no-summary /opt/homebrew/var/quarantine/20260817-030000/sketchy.dmg
```

You can also check the file type and hash and compare against VirusTotal if you
want a second opinion.

### Option 3 — Restore it (if it was a false positive)

Move it back to where it came from. Using the example above:

```bash
sudo mv /opt/homebrew/var/quarantine/20260817-030000/sketchy.dmg \
        /Users/lewiswestbury/Downloads/sketchy.dmg
```

Use the original path from the `FOUND` line in the log.

> **Be careful:** only restore a file if you're confident it's a false
> positive. If in doubt, leave it in quarantine.

### Option 4 — Delete it

When you're sure you don't want it, remove the dated folder (or a single file):

```bash
# Delete one dated run:
sudo rm -rf /opt/homebrew/var/quarantine/20260817-030000

# Or empty the whole quarantine:
sudo rm -rf /opt/homebrew/var/quarantine/*
```

This is permanent — there's no Trash for quarantine — so only do it after
reviewing the contents.

## Optional: a small helper script

To save typing, a helper script can list and empty the quarantine:

```bash
nano /opt/homebrew/etc/clamav/scripts/quarantine.sh
```

```bash
#!/bin/bash
# Manage the ClamAV quarantine folder.
# Usage:  quarantine.sh list | purge

QUARANTINE=/opt/homebrew/var/quarantine

case "${1:-list}" in
  list)
    echo "Files in $QUARANTINE:"
    find "$QUARANTINE" -type f -print 2>/dev/null | sed "s|$QUARANTINE/||" || echo "  (empty)"
    ;;
  purge)
    echo "Emptying $QUARANTINE ..."
    sudo rm -rf "$QUARANTINE"/* && echo "done."
    ;;
  *)
    echo "Usage: $0 {list|purge}"
    exit 1
    ;;
esac
```

```bash
chmod +x /opt/homebrew/etc/clamav/scripts/quarantine.sh
```

Then:

```bash
/opt/homebrew/etc/clamav/scripts/quarantine.sh list
/opt/homebrew/etc/clamav/scripts/quarantine.sh purge   # asks nothing, be sure!
```

## References

- ClamAV scanning manual (the `--move` / `--copy` / `--remove` discussion):
  https://docs.clamav.net/manual/Usage/Scanning.html
- ClamAV disclaimer about automatic deletion:
  https://docs.clamav.net/manual/Usage/Scanning.html
