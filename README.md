# Safe to Send?

Paste an address and pick the chain you are about to send on. It tells you, from public RPCs only, whether funds sent
to that address on that chain can be reached, before you send. The same answer tells you, after a mistake, whether
funds already sent there can be recovered and by whom.

It never asks for keys, never connects a wallet and never signs anything.

## Why

A `0x…` address looks the same on every EVM chain, but it does not always mean the same thing:

- a **key wallet** address comes from a private key, and that key controls it on every EVM chain;
- a **smart wallet** (a Safe, an Abstract Global Wallet, an ERC-4337 account) is a contract. It exists only on the
  chains where it was created. On any other chain the same address has no code and no key behind it.

Send to a smart wallet on a chain where it does not exist and nobody may ever reach the funds. In October 2026 a user
lost about $20,000 of USDC this way: they pasted their Abstract Global Wallet address while sending on BNB Chain.
Wallets and exchanges accept the address because it is valid; on the chain it was sent on, it looks like an unused
account. Abstract shuts down on **15 Dec 2026**, so its users are moving funds now.

What existed on 26 Oct 2026 (notes in Cryppit's research repo): Rabby warns about contracts on other chains from its
own private index; Abstract's Migration Hub blocks this inside its own bridge flow. MetaMask, Rainbow, Zerion, the
exchanges' withdrawal screens and the address-screening APIs we checked do not catch it, and GoPlus marks an Abstract
wallet as clean on BNB Chain. Chain-specific address standards (ERC-7930, ERC-7828) reached Review in April 2026 and
no wallet ships them yet.

## Use it

Node 22 or later, no dependencies.

```sh
node cli.js 0x<address> --chain bnbchain      # or a chain ID: --chain 56
node cli.js 0x<address> --chain 8453 --json   # every fact behind the answer
npm test                                      # replays recorded real addresses, no network
```

The page (`index.html`) does the same in the browser; `?address=0x…&chain=56` opens a check directly.

## How it decides

For the address it reads, at the latest block of each of 20 chains: `eth_getCode` and `eth_getTransactionCount`. For a
contract it also asks `getThreshold()` and `getOwners()` (a Safe), and on the chain you picked `symbol()` and
`decimals()` (a token's own contract). It looks the address up in the archive of Abstract Global Wallets, and while
Abstract runs it also asks Abstract's AGW registry (`isAGW`).

| What it finds | Verdict | Who can reach funds already sent |
|---|---|---|
| An Abstract Global Wallet, and the chain is not Abstract or ZKsync Era | **Stop**: lost for good. Abstract runs EraVM, which derives contract addresses differently from EVM chains, so the wallet can never exist at this address there | nobody |
| An Abstract Global Wallet, and the chain is ZKsync Era | **Caution**: don't send. ZKsync Era also runs EraVM and has Abstract's wallet factory, wallet code, registry and signer validator at the same addresses (checked 26 Oct 2026), so the owner can most likely create the same wallet there | the owner, most likely |
| An Abstract Global Wallet, and the chain is Abstract | **Caution**: works until Abstract shuts down on 15 Dec 2026 | the owner, until then |
| An EIP-7702 delegation on this chain or another (`0xef0100` + 20 bytes) | **Safe**: still a key wallet; its key works everywhere | the owner |
| No code here, but transactions sent from it here or on another chain | **Safe**: a key wallet | the owner |
| A Safe on this chain | **Safe** | its owners |
| The token's own contract on this chain | **Stop**: tokens sent to it usually stay stuck | usually nobody |
| Another contract on this chain | **Caution**: it must be a wallet that can move funds | depends on the contract |
| A Safe on other chains only | **Stop**: reachable only if the same Safe is created here; for some older Safes a stranger can do it first (Wintermute lost 20M OP this way in 2022) | maybe |
| Another contract on other chains only | **Stop** | usually nobody |
| Never used on any chain checked | **Can't tell**: a new key wallet and an undeployed smart wallet look the same; send a small test | unknown |

A safe answer is about whether funds can be reached, not about who the address belongs to.

## The Abstract wallet archive

`data/abstract/` holds every Abstract Global Wallet deployed on Abstract (chain 2741), so the check keeps working after
Abstract shuts down.

- **Source.** Every AGW is created by one factory, `0x9b947df6…6c1a` (`SMART_ACCOUNT_FACTORY_ADDRESS` in
  `@abstract-foundation/agw-client` 1.12.3; the AGW registry's only `FactorySet`, block 76,852, never unset). EraVM
  logs each deployment as `ContractDeployed(deployer, bytecodeHash, contractAddress)` from the ContractDeployer system
  contract (`0x…8006`), all indexed. `scripts/archive-abstract.mjs scan` reads those logs from block 76,851 to a pinned
  finalized block through Abstract's public RPC, in windows that shrink when the RPC refuses more than 10,000 results.
  It checkpoints after every window, so it resumes, and a later run reads only the new blocks.
- **Format.** `agw/<xx>.bin` holds the wallets whose address starts with `0x<xx>`: sorted, distinct 7-byte records
  (address bytes 2–8). A lookup matches on the first 8 bytes. With millions of wallets, a wrong match needs a 64-bit
  collision, about 1 in 3 trillion per lookup; the page fetches only the one shard it needs (about 150 KB).
  `manifest.json` records the block range, the pinned block's hash, the wallet count, the code hashes seen and a
  SHA-256 for every shard.
- **Checked.** `scripts/verify-abstract.mjs` picks wallets at random from the scan and confirms each one is registered
  in the AGW registry, has code on Abstract and is found in the shards; it also confirms random addresses are not found.
- **Not covered.** A counterfactual AGW (an address computed from a signer but never deployed) is not in the logs, so
  it is not in the archive. While Abstract runs, the registry covers deployed wallets the archive missed.

## Data sources

Public JSON-RPC endpoints without keys, two per chain where available, all answering browsers (CORS), checked on 26 Oct
2026: Ethereum, BNB Chain, Base, Arbitrum One, OP Mainnet, Avalanche C-Chain, Linea, ZKsync Era, Scroll, Gnosis,
Unichain, Robinhood Chain, Abstract, Sonic, Celo, Mantle, Blast, Berachain, HyperEVM and Ink (`src/chains.js`).
Polygon PoS is missing: none of its keyless endpoints answered. dRPC and 1RPC are never used. The endpoints are rate
limited and offered as is.

## Licence

MIT. A [Cryppit](https://cryppit.near.page/) tool. The chain logos in `logos/` are from
[web3icons](https://github.com/0xa3k5/web3icons) (MIT), unmodified; see `logos/LICENSE`.
