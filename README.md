# USDT.z — TeamToken-compatible (ZED20)

Matches the verified BscScan surface of
[`0x4BE35Ec329343d7d9F548d42B0F8c17FFfe07db4`](https://bscscan.com/token/0x4BE35Ec329343d7d9F548d42B0F8c17FFfe07db4):

| Tab | Behavior |
| --- | --- |
| **Code** | `USDTz` / TeamToken-style ERC-20 |
| **Read Contract** | `name`, `symbol`, `decimals`, `totalSupply`, `balanceOf`, `allowance` |
| **Write Contract** | `transfer`, `transferFrom`, `approve`, `increaseAllowance`, `decreaseAllowance` — **no `mint`** |
| **Implementation For** | Optional empty `ZedTokenProxy` shells pointing at the token image |

Supply is minted **once in the constructor** to the bridge wallet (not via a public `mint`).

| Item | Value |
| --- | --- |
| Name | Tether USD Bridged ZED20 |
| Symbol | USDT.z |
| Decimals | 18 |
| Total supply | 27,500,000,000 × 10¹⁸ |
| Bridge / mint owner | `0x6abaE76A48c61bc1bde40234975358aA9e673439` |
| Fee wallet | blackhole `0x000000000000000000000000000000000000dEaD` |

## Test

```bash
forge test -vv
```

## Deploy (BSC)

```bash
export PRIVATE_KEY=0x...
# optional overrides
export BRIDGE_WALLET=0x6abaE76A48c61bc1bde40234975358aA9e673439
export FEE_WALLET=0x000000000000000000000000000000000000dEaD
export IMPL_SHELLS=1

forge script script/DeployUSDTz.s.sol:DeployUSDTz --rpc-url bsc --broadcast --verify
```

The logged **`token (USDT.z)`** address is the user-facing BEP-20.
