# Releasing Safe to Send (founder runbook)

Everything here is run by the founder. Claude never publishes, deploys, or pushes. Before any release:
`node --test` green, `npm run conformance` 21/21, `node scripts/verify-archive.mjs data/abstract` OK.

## 0. First, and un-skippable: rate-limit the hosted API

Without a rate limit, deploying the hosted Worker (§2) would expose a public endpoint anyone can
hammer — running up your Cloudflare bill and getting your server IP throttled by the upstream RPCs. This is an
abuse/cost risk to Cryppit (never a safety or privacy risk to users), and it is the one step that must not be skipped.

The Worker now ships a per-IP limit: the `CHECK_RL` binding in `wrangler.jsonc` (**60 `/v1/check` calls / min / IP**;
`worker/index.js` returns **HTTP 429** past it). It works on the free `workers.dev` address, so it is enough to launch.
The binding is approximate (it can leak several times the configured limit), so once the API moves to a **custom
domain** on Cloudflare, also add a **zone WAF rate-limiting rule** on the API route (zone WAF rules do not apply to
`workers.dev`). After deploying, verify the route returns **429** past the limit before announcing it.

## 1. Library — npm, via Trusted Publishing (no token)

**First release (1.0.0), by hand:** `npm login` (2FA), make sure the npm org `cryppit` exists, then
`npm publish --access public`. Trusted Publishing can only be set up once the package exists.

**From then on:** configure a **Trusted Publisher** for `@cryppit/safe-to-send` on npmjs.com (package Settings →
Trusted Publishing), pointing at this repo's `release.yml`. Then publish is tokenless (`release.yml` skips a
version that is already on npm, so tagging v1.0.0 after the manual publish stays green):

```sh
git tag v1.0.0 && git push origin v1.0.0     # release.yml publishes from CI with OIDC + provenance
npm audit signatures                           # after publish: verify the signed attestation
```

**Requires npm >= 11.5.1** for OIDC (Node 22 ships npm 10.x, which cannot do tokenless OIDC); `release.yml`
upgrades npm in CI. Trusted Publishing gives provenance automatically (≈ SLSA build L2). Note: **provenance proves where/how the package
was built, not that the code is safe** — keep 2FA/passkeys on the npm account. A manual fallback is
`npm publish --provenance --access public` from a 2FA session.

## 2. Hosted API — Cloudflare Worker

```sh
npx wrangler deploy          # deploys worker/index.js (see wrangler.jsonc)
```

**Do not announce or link the endpoint until the §0 rate limit is live** — `wrangler deploy` exposes it publicly.
No KV/Durable Objects are used — the "no storage" promise holds. Confirm `/.well-known/security.txt` resolves.

## 3. Archive mirrors — GitHub + Cloudflare R2 (two hosts)

The frozen archive (`data/abstract/`) is mirrored on two independent hosts; the SHA-256 manifest makes each one
verifiable with the published script, straight from its URL:

```sh
# Host 1 — GitHub: Pages (https://cryppit.github.io/safe-to-send/data/abstract) and the release asset of every tag
gh release create v<version> --title "Safe to Send <version>" --notes-file <notes> <archive>.tar.gz

# Host 2 — Cloudflare R2, bucket `safe-to-send`, public read-only at https://pub-0ec10ea208a948afb353c71dc315691e.r2.dev/abstract
#   (wrangler r2 object put … --remote for manifest.json and each agw/<xx>.bin; --remote matters: without it
#    wrangler 4 writes to a local simulator)

# Verify each host (must print "OK: 256 shards verified against the manifest."):
node scripts/verify-archive.mjs https://cryppit.github.io/safe-to-send/data/abstract
node scripts/verify-archive.mjs https://pub-0ec10ea208a948afb353c71dc315691e.r2.dev/abstract
node scripts/verify-archive.mjs <unpacked release asset>/abstract
```

Optional, later: a pay-once permanent copy on Arweave (a few dollars for ~29 MB). Not needed for the two-host promise.

## 4. December final-freeze (makes the archive the true last block)

Abstract shuts down **15 Dec 2026**. The shipped archive is frozen at 25 Oct 2026, so before the shutdown, while
Abstract's RPC still answers, re-freeze:

```sh
node scripts/archive-abstract.mjs            # re-scan to Abstract's final block; regenerates data/abstract/ + manifest.json
node scripts/verify-archive.mjs data/abstract
# re-mirror (step 3) and cut v1.1.0:
git commit -am "chore(archive): final freeze at Abstract shutdown" && git tag v1.1.0 && git push origin v1.1.0
```

Do the re-scan a little **before** the deadline in case Abstract's infra degrades early; the 25-Oct archive is the floor.

## 5. Hardening

- **Done (15 Nov 2026):** GitHub Actions are pinned to full commit SHAs in `pages.yml` and `release.yml` (with the
  version in a comment), and CI installs an exact npm version. Bump them deliberately, never by tag.
- **Spend:** Workers Paid and R2 bill usage past their free tiers with no hard cap. Keep a Cloudflare usage-based
  billing notification on.
