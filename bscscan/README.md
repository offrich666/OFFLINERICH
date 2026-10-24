# USDT.z — BscScan / Remix files (`pragma ^0.6.12`)

**Do not paste private keys into chat, Discord, or this repo.** Use MetaMask / Remix Injected Provider only.

## Files (download these)

| File | Role |
| --- | --- |
| `IERC20.sol` | Interface |
| `Context.sol` | OZ Context |
| `SafeMath.sol` | OZ SafeMath |
| `ERC20.sol` | OZ ERC20 (0.6) |
| `USDTzImplementation.sol` | Token logic (image) |
| `USDTzProxy.sol` | User-facing token proxy |
| `ProxyShell.sol` | Extra shells → BscScan **Implementation For** |

Bridge wallet: `0x0Ae6cD610f70C6B37e4BC894C8CA31B62643c244`  
Blackhole: `0x000000000000000000000000000000000000dEaD`  
Decimals: `6` · Supply: `27_500_000_000` × 10⁶

## Remix settings

- Compiler: **0.6.12**
- Optimization: **Yes**, 200 runs
- EVM: default
- Upload **all** `.sol` files in this folder into one Remix workspace

## Deploy order (BSC Mainnet)

### 1) `USDTzImplementation`
- No constructor args
- Save address → `IMPL`

### 2) `USDTzProxy` ← **this is the token address for users / BscScan**
Constructor:

| Arg | Value |
| --- | --- |
| `_implementation` | `IMPL` |
| `_admin` | your wallet (or blackhole if you want no live admin) |
| `_data` | abi-encoded `initialize(address)` |

**Encode `_data` in Remix:**  
At `USDTzImplementation` → low-level / Calldata for `initialize(initialOwner)`  
`initialOwner` = your wallet (or bridge). Copy the hex calldata into `_data`.

Example (replace the 32-byte address):

```text
0xc4d66de8
000000000000000000000000<YOUR_40_HEX_OWNER_WITHOUT_0x>
```

(`c4d66de8` = `initialize(address)` selector)

### 3) `ProxyShell` (deploy 2–4 times for random “Implementation For” addresses)
- `_implementation` = `IMPL`
- Each deploy gets a new random address

## Verify on BscScan

1. Verify **`USDTzImplementation`** (multi-file / standard JSON) first  
2. Verify **`USDTzProxy`** as proxy / similar match  
3. On the **proxy** address: Read/Write should work; holders see mint via blackhole → bridge  
4. On the **implementation** address: **Implementation For** lists proxy + shells  

## Safety note on your original proxy

`address public admin` in slot 0 **collides** with ERC20 `_balances`.  
`USDTzProxy.sol` here stores admin in the **EIP-1967 admin slot** instead.
