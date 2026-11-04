On macOS it takes about five minutes. Run these in a normal terminal, not through !, because generating the key and entering its passphrase are interactive.

1. Install GnuPG and a passphrase prompt that works with the macOS Keychain

```bash
brew install gnupg pinentry-mac
mkdir ~/.gnupg
echo "pinentry-program $(brew --prefix)/bin/pinentry-mac" >> ~/.gnupg/gpg-agent.conf
gpgconf --kill gpg-agent
```

2. Generate a key. Use the name and email address on your commits (`git config user.name`, `git config user.email`), and make sure that email address is verified on your GitHub account.

```bash
gpg --full-generate-key
```

At the prompts, choose `ECC` (sign and encrypt) with `Curve 25519`, or `RSA 4096`.

3. Find the key ID

```bash
gpg --list-secret-keys --keyid-format=long
```

The ID is the part after `ed25519/` (or `rsa4096/`) on the sec line (surrounded by spaces).

4. Tell git to use the key and sign every commit

```bash
git config --global user.signingkey <KEY_ID>
git config --global commit.gpgsign true
git config --global tag.gpgsign true
```

5. Add the public key to GitHub. Copy it to the clipboard:

```bash
gpg --armor --export <KEY_ID> | pbcopy
```

Paste it under [GitHub → Settings → SSH and GPG keys](https://github.com/settings/keys) → New GPG key.

6. Check it works. Make a commit, then run:

```bash
git log --show-signature -1
```

It should say "Good signature". Once pushed, the commit shows as Verified on GitHub. If you tick "Save in Keychain" at the first passphrase prompt, you won't be asked again.