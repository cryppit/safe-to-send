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

## 3. Archive mirrors — GitHub + R2 + Arweave

The frozen archive (`data/abstract/`) is published to three mirrors; the SHA-256 manifest makes each independently
verifiable:

```sh
# Mirror 1 — GitHub release asset (and the repo itself / Pages at cryppit.github.io/safe-to-send/data/abstract)
gh release create v1.0.0 --title "Safe to Send 1.0.0" --notes "Library, API, conformance, frozen Abstract archive."

# Mirror 2 — Cloudflare R2 (same account as the Worker)
npx wrangler r2 object put safe-to-send/abstract/manifest.json --file data/abstract/manifest.json
for f in data/abstract/agw/*.bin; do npx wrangler r2 object put "safe-to-send/abstract/agw/$(basename "$f")" --file "$f"; done

# Mirror 3 — Arweave (pay-once permanent; ~a few dollars for ~29MB)
#   e.g. with arkb or the Arweave CLI: upload data/abstract/ as a directory and record the TX id.

# Verify every mirror OFFLINE (download each, then):
node scripts/verify-archive.mjs <downloaded-mirror-dir>     # must print OK for GitHub, R2, and Arweave
```

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

## 5. Hardening to apply (deferred from the build)

- **Pin GitHub Actions to full commit SHAs** in `pages.yml` and `release.yml` (currently `@v4` major tags), e.g.
  `actions/checkout@<sha> # v4`. This closes the compromised-tag risk flagged in the research.
