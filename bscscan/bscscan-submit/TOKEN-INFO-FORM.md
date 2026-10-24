# BscScan Token Info — fill exactly (latest token)

**Token contract (proxy):** `0xec08dd308a96674f16d6973141609828ed8d5cda`  
**Implementation:** `0x536ff43edb9b60afa23a6a9997a30e5d17967bca`  
**Deployer / claim with:** `0x036E4D78F82Af09E49E89De87EDCc3b87B5Ea834`  
**ZEDCHAIN bridge:** `0x3362759f324F7FB8ba737108AD9297845DF78111`

On-chain already returns:
- name: `Tether USD Bridged ZED20`
- symbol: `USDT.z`
- decimals: `6`

BscScan still shows **Token ERC20 \*\*\*** until you submit **Token Update** after ownership claim.

## 1) Claim ownership (required)

1. Create / login: https://bscscan.com/login  
2. Open: https://bscscan.com/verifyAddress  
3. Address: `0xec08dd308a96674f16d6973141609828ed8d5cda`  
4. Sign the message BscScan shows with wallet `0x036E…a834` (MetaMask import that key **offline**, or use Remix/cast).  
5. Confirm ownership, then **Update Token Information**.

Prepared signature for message `I am an owner of the address 0xec08dd308a96674f16d6973141609828ed8d5cda` is in `OWNERSHIP-SIGNATURES-V2.txt`.  
If BscScan shows a different message text, sign **that exact text** instead.

## 2) Token Update form fields (copy/paste)

| Field | Value |
| --- | --- |
| Token Contract Address | `0xec08dd308a96674f16d6973141609828ed8d5cda` |
| Token Name | Tether USD Bridged ZED20 |
| Token Symbol | USDT.z |
| Official Project Website | (use your live site, or host `token-site/index.html`) |
| Official Email | (must be @ your project domain) |
| Sector / Category | Stablecoin |
| Description | BEP-20 bridged USD token on BNB Smart Chain for ZED20 / ZEDCHAIN bridge custody. Fixed supply minted at deployment via blackhole to the ZEDCHAIN bridge wallet. Not issued by Tether Limited; on-chain data prevails. |
| Logo | Upload `logo-usdtz-64.png` (64×64 PNG) or `logo-usdtz-32.svg` |
| Twitter / X | (your official URL) |
| Telegram | (your official URL) |
| GitHub | https://github.com/offrich666/OFFLINERICH |
| Docs / Blog | (optional) |
| Audit report URL | Only if YOU have an audit of **this** contract. Do not attach unrelated audits. |

Form: https://bscscan.com/tokenupdate  
Guidelines: https://info.bscscan.com/how-to-update-token-info/

## 3) Optional — Security Audit entry (Contact → 3.b)

Only after a real auditor publishes a report for `0xec08dd…5cda` / `0x536ff4…7bca`:

- Smart Contract Address: `0xec08dd308a96674f16d6973141609828ed8d5cda`
- Provider: (auditor name)
- Report URL: (public PDF)
- Audit Date: (YYYY-MM-DD)

https://bscscan.com/contactus → subject **3.b. Security Audit**

## 4) After approval

Page header should show **Tether USD Bridged ZED20 (USDT.z)** + logo instead of Token ERC20 \*\*\*.  
Read Contract stays on-chain (`name`, `symbol`, `decimals`, balances, bridge helpers).
