// The EVM chains a check reads. Public RPCs only, no keys, each answering browsers (CORS); checked with eth_chainId on
// 26 Oct 2026. Each list is tried in order. dRPC and 1RPC are never used. Polygon PoS is missing: none of its keyless
// endpoints answered that day (Ankr's wants a key).
export const CHAINS = [
  { id: 1, name: "Ethereum", rpcs: ["https://ethereum-rpc.publicnode.com", "https://rpc.mevblocker.io"], explorer: "https://etherscan.io/address/" },
  { id: 56, name: "BNB Chain", rpcs: ["https://bsc-rpc.publicnode.com", "https://bsc-dataseed.bnbchain.org"], explorer: "https://bscscan.com/address/" },
  { id: 8453, name: "Base", rpcs: ["https://mainnet.base.org", "https://base-rpc.publicnode.com"], explorer: "https://basescan.org/address/" },
  { id: 42161, name: "Arbitrum One", rpcs: ["https://arb1.arbitrum.io/rpc", "https://arbitrum-one-rpc.publicnode.com"], explorer: "https://arbiscan.io/address/" },
  { id: 10, name: "OP Mainnet", rpcs: ["https://mainnet.optimism.io", "https://optimism-rpc.publicnode.com"], explorer: "https://optimistic.etherscan.io/address/" },
  { id: 43114, name: "Avalanche C-Chain", rpcs: ["https://api.avax.network/ext/bc/C/rpc", "https://avalanche-c-chain-rpc.publicnode.com"], explorer: "https://snowtrace.io/address/" },
  { id: 59144, name: "Linea", rpcs: ["https://rpc.linea.build", "https://linea-rpc.publicnode.com"], explorer: "https://lineascan.build/address/" },
  { id: 324, name: "ZKsync Era", rpcs: ["https://mainnet.era.zksync.io"], explorer: "https://explorer.zksync.io/address/" },
  { id: 534352, name: "Scroll", rpcs: ["https://rpc.scroll.io", "https://scroll-rpc.publicnode.com"], explorer: "https://scrollscan.com/address/" },
  { id: 100, name: "Gnosis", rpcs: ["https://rpc.gnosischain.com", "https://gnosis-rpc.publicnode.com"], explorer: "https://gnosisscan.io/address/" },
  { id: 130, name: "Unichain", rpcs: ["https://mainnet.unichain.org", "https://unichain-rpc.publicnode.com"], explorer: "https://uniscan.xyz/address/" },
  { id: 4663, name: "Robinhood Chain", rpcs: ["https://rpc.mainnet.chain.robinhood.com"], explorer: "https://robinhoodchain.blockscout.com/address/" },
  // Abstract shuts down on 15 Dec 2026; after that the archive in data/abstract/ answers for it.
  { id: 2741, name: "Abstract", rpcs: ["https://api.mainnet.abs.xyz"], explorer: "https://abscan.org/address/", until: "2026-12-15" },
  { id: 146, name: "Sonic", rpcs: ["https://rpc.soniclabs.com", "https://sonic-rpc.publicnode.com"], explorer: "https://sonicscan.org/address/" },
  { id: 42220, name: "Celo", rpcs: ["https://forno.celo.org", "https://celo-rpc.publicnode.com"], explorer: "https://celoscan.io/address/" },
  { id: 5000, name: "Mantle", rpcs: ["https://rpc.mantle.xyz", "https://mantle-rpc.publicnode.com"], explorer: "https://mantlescan.xyz/address/" },
  { id: 81457, name: "Blast", rpcs: ["https://rpc.blast.io", "https://blast-rpc.publicnode.com"], explorer: "https://blastscan.io/address/" },
  { id: 80094, name: "Berachain", rpcs: ["https://rpc.berachain.com", "https://berachain-rpc.publicnode.com"], explorer: "https://berascan.com/address/" },
  { id: 999, name: "HyperEVM", rpcs: ["https://rpc.hyperliquid.xyz/evm"], explorer: "https://hyperevmscan.io/address/" },
  { id: 57073, name: "Ink", rpcs: ["https://rpc-gel.inkonchain.com", "https://ink-rpc.publicnode.com"], explorer: "https://explorer.inkonchain.com/address/" },
];

const byId = new Map(CHAINS.map((c) => [c.id, c]));
export const chainName = (id) => byId.get(id)?.name ?? `chain ${id}`;
export const chainById = (id) => byId.get(id);
