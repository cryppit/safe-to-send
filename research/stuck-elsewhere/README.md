# How much is already stuck at Abstract wallet addresses on other chains?

Measured 26 Oct 2026. An Abstract Global Wallet is a contract that exists only on Abstract. On other chains nothing
lives at its address and no key controls it, so anything sent there can't be moved by anyone.

**Result** (`result.json`): in a seeded random sample of 50,000 of the 4,251,573 archived Abstract wallets,
**148 (1 in 338)** hold at least $1 of native coin, USDC or USDT on Ethereum, BNB Chain, Base, Arbitrum One, OP Mainnet or
Avalanche. By chain: Ethereum 91, Base 38, Arbitrum One 19, OP Mainnet 6, BNB Chain 4, Avalanche 0. Scaled to the whole
archive: about **12,600 wallets** (95% interval 10,716–14,778) and about $590,000 at that day's prices. The dollar figure is
rough: rare large losses are easy to miss in a sample.

**Checked** (`verify.mjs`): every one of the 158 balances found sits at an address with no code and a nonce of 0 on that
chain: no contract and no key has ever controlled it.

**Re-run it:**

```bash
node scripts/archive-abstract.mjs scan                          # full addresses into data/abstract/.scan/raw/ (slow)
node research/stuck-elsewhere/measure.mjs 50000 20261026        # same seed, same sample; writes holders.json
node research/stuck-elsewhere/verify.mjs                        # PASS/FAIL per claim
```

Balances are read through Multicall3 on keyless public RPCs (publicnode); prices from CoinGecko's free API. The list of
holder addresses is not published here, so the people who lost money are not listed; the fixed seed reproduces it.
