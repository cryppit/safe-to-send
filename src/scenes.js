// The flow picture on the page: real addresses and the answer each one really gets. test/scenes.test.js replays the
// ones that need no chain; the live ones were checked against the chains on 6 Nov 2026.
export const SCENES = [
  { label: "Normal wallet", address: "vitalik.eth", shown: "vitalik.eth", icon: "ethereum", target: 8453, level: "safe",
    title: "Reachable", detail: "A normal wallet with smart-account features. Its key works on every EVM chain." },
  { label: "Abstract wallet", address: "0xd8b17dbd34391993ee11b501e6275bbc715e2529", shown: "0xd8b1…2529", icon: "abstract", target: 56, level: "stop",
    title: "Lost for good", detail: "This wallet only exists on Abstract. On BNB Chain nothing lives at this address, and nothing ever can." },
  { label: "Safe multisig", address: "0x4f3a120E72C76c22ae802D129F599BFDbc31cb81", shown: "0x4f3a…cb81", icon: "ethereum", target: 56, level: "caution",
    title: "Same address, different owners", detail: "It's a 1-of-1 Safe on BNB Chain and a 4-of-11 Safe on Ethereum. Check who really controls it here." },
  { label: "Token contract", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", shown: "USDC 0xA0b8…eB48", icon: "ethereum", target: 1, level: "stop",
    title: "Don't send to the token itself", detail: "This is the USDC contract. Tokens sent here usually stay stuck." },
  { label: "Safe on one chain", address: "0x1d31f4bdc557bca4df3d238f089cecb3b7135fda", shown: "0x1d31…5fda", icon: "ethereum", target: 56, level: "stop",
    title: "This Safe isn't on this chain", detail: "It's a 3-of-5 Safe on Ethereum with nothing on BNB Chain. Ask for an address on this chain." },
  { label: "Bitcoin address", address: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq", shown: "bc1qar0s…5mdq", icon: "bitcoin", target: 56, level: "stop",
    title: "Wrong network", detail: "That's a Bitcoin address. Sending on BNB Chain would likely lose the funds, or fail." },
  { label: "Address with a typo", address: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb", shown: "1A1zP1eP…vfNb", icon: "bitcoin", target: "bitcoin", level: "stop",
    title: "Typo caught", detail: "A character is wrong, so the address fails its built-in check. Copy it again from the source." },
  { label: "Bitcoin address", address: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq", shown: "bc1qar0s…5mdq", icon: "bitcoin", target: "bitcoin", level: "format",
    title: "Right format, not read live", detail: "A valid Bitcoin address. Bitcoin isn't read here, so this is a typo check, not a safety answer." },
  { label: "Never-used address", address: "0x308910206Fe935542E6238E4EB8A3718DE7AE305", shown: "demo 0x3089…E305", icon: "ethereum", target: 1, level: "unknown",
    title: "Can't tell", detail: "Never used on any chain read. A new wallet and an undeployed smart wallet look the same, so send a small test first." },
];

// The five answers a check can end in.
export const GATES = [
  { level: "safe", mark: "✓", name: "Safe", note: "Funds can be reached" },
  { level: "caution", mark: "!", name: "Caution", note: "Check before sending" },
  { level: "stop", mark: "✕", name: "Stop", note: "Funds likely lost" },
  { level: "unknown", mark: "?", name: "Can't tell", note: "Send a small test" },
  { level: "format", mark: "Aa", name: "Format OK", note: "Typo check only" },
];
