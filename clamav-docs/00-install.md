# 00 — Install ClamAV

Everything else in this guide assumes ClamAV is already installed. This chapter
covers that: what ClamAV is, installing it with Homebrew, creating its two
configuration files, and downloading the virus signature database for the
first time.

## What is ClamAV?

[ClamAV](https://www.clamav.net/) is a free, open-source antivirus engine,
originally written for Linux mail servers and now maintained by Cisco Talos.
It detects viruses, trojans and other malware by comparing files against a
signature database that is updated many times a day.

It ships as command-line tools rather than an app with a window. The ones this
guide uses:

| Tool | What it is |
|---|---|
| `clamd` | A background daemon that holds the signature database in memory and scans on request. |
| `freshclam` | The updater that downloads new signatures periodically. |
| `clamscan` | A standalone scanner that starts, scans what you point it at, and exits. Chapters 02 and 03 schedule this. |
| `clamdscan` | A client that asks a running `clamd` to scan. |

> **Honest caveat:** ClamAV is a scanner, not real-time protection. On macOS
> it cannot watch files the moment they arrive — that part is Linux-only. This
> guide works around it with frequent scheduled scans; see
> [02-realtime-protection.md](02-realtime-protection.md).

## What is Homebrew?

[Homebrew](https://brew.sh) is the standard third-party package manager for
macOS. It installs command-line software under `/opt/homebrew` (on Apple
Silicon Macs) along with everything needed to run it. Check whether you have
it:

```bash
brew --version
```

If not, follow the install instructions at https://brew.sh first, then come
back here.

## Step 1 — Install ClamAV

```bash
brew install clamav
```

This puts the binaries in `/opt/homebrew/bin/`, drops sample configuration
files into `/opt/homebrew/etc/clamav/`, creates a dedicated low-privilege
`_clamav` user for ClamAV to run as, and creates the database folder
`/opt/homebrew/var/lib/clamav/` owned by that user.

Check it worked:

```bash
/opt/homebrew/bin/clamscan --version
# ClamAV 1.x.y/<database-version>/<date>
```

## Step 2 — Create the configuration files

Homebrew only ships `.sample` config files, and both `clamd` and `freshclam`
refuse to start until their real config exists — so make plain copies:

```bash
cp /opt/homebrew/etc/clamav/freshclam.conf.sample /opt/homebrew/etc/clamav/freshclam.conf
cp /opt/homebrew/etc/clamav/clamd.conf.sample /opt/homebrew/etc/clamav/clamd.conf
```

The copies have every option switched off (commented out). That's exactly the
starting point chapter 01 expects — don't change anything else yet.

> **Why copies, not edits of the samples?** The tools look for `.conf` files
> specifically; editing the `.sample` alone gets you nowhere. Keeping the
> samples pristine also leaves you a reference listing of every option.

## Step 3 — Download the virus database (first run)

`freshclam` needs at least one mirror before it will run. Add this single
line near the top of `freshclam.conf`:

```bash
nano /opt/homebrew/etc/clamav/freshclam.conf
```

```ini
DatabaseMirror database.clamav.net
```

Then fetch the signatures:

```bash
sudo freshclam
```

That downloads the entire signature set — several hundred megabytes — so give
it a few minutes. It finishes with a message like *Your ClamAV installation
is now up to date.*

> **Why `sudo`?** The database folder belongs to the `_clamav` user. Running
> freshclam as root lets it drop down to `_clamav` while writing the files
> (its built-in behaviour), so everything lands with the right ownership.
> Chapter 01 replaces this manual step with an automatic job that checks for
> updates every two hours.

Confirm the database landed:

```bash
ls -la /opt/homebrew/var/lib/clamav/
# daily.cvd, main.cvd, bytecode.cvd — all owned by _clamav
```

## Verification checklist

- [ ] `brew --version` works
- [ ] `/opt/homebrew/bin/clamscan --version` prints a version
- [ ] `clamd.conf` and `freshclam.conf` exist in `/opt/homebrew/etc/clamav/`
- [ ] `/opt/homebrew/var/lib/clamav/` contains `daily.cvd`, `main.cvd` and
      `bytecode.cvd`

You're now ready for
[01-setup-daemon-and-updates.md](01-setup-daemon-and-updates.md), which starts
the daemon and makes those signature updates automatic.

## References

- ClamAV documentation: https://docs.clamav.net
- Homebrew: https://brew.sh
- The clamav formula: https://formulae.brew.sh/formula/clamav
