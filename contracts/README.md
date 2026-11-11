# RKOS token

Simple mintable ERC20 / TRC20-compatible contract.

| Field | Value |
| --- | --- |
| Name | `RKOS` |
| Symbol | `RKOS` |
| Decimals | `18` |
| Initial supply | `20_000_000_000` RKOS (minted to deployer) |
| Later mint | `mint(address to, uint256 value)` — owner only |

## Included

- Transfer / approve / transferFrom
- Owner `mint` for later supply if needed
- `transferOwnership`

## Not included (on purpose)

- Blacklist, pause, transfer fees, multisig, “bridge” branding
- No deploy scripts that use private keys

## Deploy (you do this)

1. Open [TronIDE](https://www.tronide.io/) or Remix (for EVM).
2. Paste `RKOS.sol`, compile with Solidity `0.8.20+`.
3. Deploy from **your** wallet. Do not paste private keys into chats or untrusted sites.
4. After deploy, call `mint` only from the owner address when you need more supply.

Rough Tron mainnet cost varies with energy/bandwidth; expect on the order of tens to a few hundred TRX for create + first calls if you have no frozen energy — check the wallet estimate in the deploy UI before confirming.
