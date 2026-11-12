# Security Policy

Safe to Send is a keyless, read-only tool: it never holds keys, signs, sends, or custodies funds. It reads public
RPCs and public ledgers only.

## Reporting a vulnerability

Please report privately — do not open a public issue or PR for a security bug.

- Preferred: GitHub **private vulnerability reporting** on this repository (Security → Report a vulnerability).
- Or email the maintainer (see `.well-known/security.txt` on the site).

We aim to acknowledge within 1–2 working days and to coordinate a fix and disclosure. We follow coordinated
disclosure with a default window of up to 90 days, negotiable by severity. We will credit reporters who want it.

## Scope

In scope: the library, the hosted API, the conformance suite, and the archive verifier. Out of scope: third-party
RPC providers and ledgers we read, and anything that requires a key or signing (this tool has none).
