# USDT.z (ZED TokenProxy)

Tether USD Bridged ZED20 (`USDT.z`) deployed in the **ZED20 TokenProxy** style:

1. **`USDTz`** — token image (logic). Fixed supply `27_500_000_000` with `6` decimals, minted once to the bridge wallet.
2. **`ZedTokenProxy`** — non-upgradeable EIP-1967 proxy (same explorer shape as Omnibridge `TokenProxy`). Users hold and transfer via the **proxy** address.

| Item | Value |
| --- | --- |
| Name | Tether USD Bridged ZED20 |
| Symbol | USDT.z |
| Decimals | 6 |
| Total supply | 27,500,000,000 |
| Bridge wallet | `0xA1962B298A0Ea9A285652cc7A055a5633983AAC0` |
| Permit | EIP-2612 |
| Pause | Disabled |
| Upgrade path | None (no UUPS / no ProxyAdmin) |

## Setup

```bash
forge install
```

## Test

```bash
forge test -vv
```

## Deploy (BSC)

```bash
export PRIVATE_KEY=0x...
# optional; defaults to the deployer
export INITIAL_OWNER=0x...

forge script script/DeployUSDTz.s.sol:DeployUSDTz --rpc-url bsc --broadcast --verify
```

The logged **`proxy (USDT.z)`** address is the token contract to use.
