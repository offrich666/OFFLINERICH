# Personal multi-chain sniper (local)

Fast **CLI** sniper for your own machine + optional Solana web dashboard.

Private keys stay in **local files**. There is **no** browser “upload private key” — that pattern drains wallets.

## Windows

See **[WINDOWS.md](./WINDOWS.md)** and double-click helpers in `scripts\windows\` (`setup.cmd`, `snipe-solana-dry.cmd`, …).

## Supported chains

| id | kind | buy via |
| --- | --- | --- |
| `solana` | Solana | Jupiter |
| `ethereum` | EVM | LiFi |
| `base` | EVM | LiFi |
| `bsc` | EVM | LiFi |
| `arbitrum` | EVM | LiFi |
| `polygon` | EVM | LiFi |
| `optimism` | EVM | LiFi |
| `avalanche` | EVM | LiFi |

```bash
npm run chains
```

## Load wallets (local “upload”)

```bash
# merge keys from a file into your bank (disk only)
npm run wallets:import -- --from ./incoming-keys.txt --to ./wallets.txt

# EVM hex keys
npm run wallets:import -- --from ./incoming-evm.txt --to ./wallets-evm.txt
```

One private key per line. `#` comments allowed. Files are gitignored.

## Snipe (fast path)

Dry-run quote (default):

```bash
# Solana
npm run snipe -- --chain solana --token <MINT> --amount 0.05 --wallets ./wallets.txt

# Base / BSC / ETH / …
npm run snipe -- --chain base --token 0xToken --amount 0.02 --wallets ./wallets-evm.txt
```

Live send (real funds):

```bash
npm run snipe -- --chain base --token 0xToken --amount 0.02 --wallets ./wallets-evm.txt --live
```

Optional: `RPC_URL_BASE`, `RPC_URL_BSC`, `RPC_URL_SOLANA`, etc. in `.env`.

## Dashboard (Solana UI)

```bash
cp .env.example .env
npm run build:web && npm start
```

## Speed / “nobody between” reality

Parallel multi-wallet fire is a **race**, not an atomic lock across 300 wallets. Other traders can still land between your txs. Use a private RPC for lower latency.

## Security

1. Never paste keys into a website
2. Prefer burners
3. Default CLI mode is dry-run until `--live`
4. Phone/LAN access uses an access token (see dashboard docs in prior README sections)

## Disclaimer

High risk. No profit guarantee. You own keys, RPCs, slippage, and losses.
`