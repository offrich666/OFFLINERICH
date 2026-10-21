# OFFLINERICH (RICH)

Capped BEP-20 token for BNB Smart Chain. Deploying mints the supply to a wallet you choose and makes that wallet the owner.

| Field | Value |
| --- | --- |
| Name | OFFLINERICH |
| Symbol | RICH |
| Decimals | 18 |
| Max supply | 1,000,000,000 RICH |
| Standard | BEP-20 (OpenZeppelin ERC-20) |

Transfers move the exact amount. There is no transfer fee, blacklist, pause, or proxy. The owner can mint only the unissued remainder under the cap. After the full cap is minted, call `renounceOwnership()` to freeze the supply.

The recipient passed to the constructor receives the initial mint and becomes the owner. The deployer pays gas and does not keep mint rights.

## Setup

```bash
forge install
forge test
```

Copy `.env.example` to `.env` and set:

- `PRIVATE_KEY` — deployer account. It needs BNB for gas. Do not commit this file.
- `RECIPIENT` — your wallet. It receives the tokens and ownership.
- `INITIAL_SUPPLY` — optional wei amount. Leave it empty to mint the full 1,000,000,000 RICH cap.

## Deploy and mint

BNB Smart Chain mainnet (chain id 56):

```bash
forge script script/Deploy.s.sol:DeployOfflineRich \
  --rpc-url bsc \
  --broadcast \
  --slow
```

BSC testnet (chain id 97) uses the same command with `--rpc-url bsc_testnet`. Testnet BNB comes from the [BNB Chain faucet](https://www.bnbchain.org/en/testnet-faucet).

Verify on BscScan after the receipt is in:

```bash
forge verify-contract <token-address> src/OfflineRich.sol:OfflineRich \
  --chain 56 \
  --constructor-args $(cast abi-encode "constructor(address,uint256)" "$RECIPIENT" "$INITIAL_SUPPLY") \
  --watch
```

Use the same wei value the script actually minted. The full cap is `1000000000000000000000000000`.

## Mint more later

Only if the constructor minted less than the cap. `PRIVATE_KEY` must be the owner.

```bash
forge script script/Mint.s.sol:MintOfflineRich \
  --rpc-url bsc \
  --broadcast \
  --slow
```

Set `TOKEN` to the deployed address and `MINT_AMOUNT` in wei.

This repository does not ship a funded deployer key, so the on-chain mint happens when you run the script with your own wallet.
