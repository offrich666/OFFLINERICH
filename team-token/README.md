# RelayMark — MetaMask team token

Standalone tool (separate from the OFFLINERICH checkout app) to:

1. Deploy a simple ERC-20 from MetaMask
2. Attach a logo (URL or upload) and add the token in MetaMask
3. Send tokens MetaMask → MetaMask (`0x` addresses)

## MetaMask ≠ TRON

| | MetaMask (this app) | TRON |
|---|---|---|
| Address | `0x…` | `T…` |
| Wallet | MetaMask | TronLink (or similar) |
| Token standard | ERC-20 | TRC-20 |

If someone sends you a TRON address, this app cannot deliver to it. Use the same EVM network on both sides.

## MetaMask Connect

Uses the official MetaMask package [`@metamask/connect-evm`](https://github.com/orgs/MetaMask/repositories) (MetaMask Connect), not a homemade `window.ethereum` hack. That opens the extension (or install / mobile QR flow) and returns an EIP-1193 provider for deploy/send.

## Run

```bash
cd team-token
npm install
npm run compile   # rebuild contract artifact after Solidity changes
npm run dev
```

Open the Vite URL, click **Connect MetaMask**. Defaults to **Ethereum mainnet** (live). You can switch to Polygon, Base, or BNB Smart Chain — also live. Deploy and sends cost real gas.

If TronLink is also installed, prefer MetaMask as the active extension or disable TronLink on this origin so Connect can reach MetaMask.

## Logo & price

- **Logo in MetaMask:** use “Add logo + token to MetaMask” after deploy. Prefer a public `https://…` image URL.
- **Price in MetaMask:** only after real market listing (liquidity + CoinGecko/CMC). Optional “display price” in this UI is for your team only.
- **Trust Wallet assets repo:** optional listing for Trust Wallet icons — unrelated to MetaMask and does not set price.

## Contract

`contracts/TeamToken.sol` — OpenZeppelin ERC-20 + owner `mint`. Initial supply is minted to the deployer wallet.
