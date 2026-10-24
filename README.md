# GG Card

A USD debit card you fund with ERC-20 tokens, including a contract you paste in yourself. The plastic is named GG Card, with Visa and Mastercard faces. The same card can be added to Apple Pay, Google Pay, and Samsung Pay.

The spend rail is live [Immersve](https://docs.immersve.com/guides/web3-wallet-card-issuing-integration/). Immersve issues the Mastercard. This server prices the token you send to their deposit contract. It does not hold a wallet private key, and it does not store the full card number. The one-time card link comes from `POST /api/cards/{id}/pan-token`.

To issue cards today, connect Pay2.House (https://pay2.house/keys/prepare) on the admin desk: API key, key id, private key PEM, P2U account, and BIN. Fund the Pay2 USD wallet with USDT TRC20, then issue from a client. For your own Immersve program later: a card you can spend at a merchant needs a live Immersve partner account. Apply at https://immersve.com/partner/ or contact https://immersve.com/contact/, then ask for live credentials (not test). Register this app’s origin on the Immersve client application. Use Immersve Universal EVM funding: deploy a Funds Storage, register a Funding Channel, paste live keys plus the Funds Storage address. Paste the live values in the console or set `IMMERSVE_*`: API key (`imm-key-…`), API secret (`imm-secret-…`), partner account id, client application id, card program id, and funding channel id. Paste those after you sign in, or set `IMMERSVE_*` before start. The server checks the key with `GET /api/partner-profiles/{accountId}` on `https://api.immersve.com` before it saves it. Keys that contain `-test-` are refused, because the Immersve test environment cannot be added to Apple Pay or used at a merchant. Saved keys live in the gitignored SQLite file. The environment wins when both are set.

You still request those live values from Immersve. No card network hands out a live program without that account. After the card exists, link the funding wallet, sign the Immersve login, finish their identity check, and send the token to the deposit contract they return. Apple Pay is added in the iPhone app through PassKit and `POST /api/wallets/apple`. Google Pay and Samsung Pay use the one-time secure card link.

## Run

```bash
npm install
npm start
```

The public site at `/` is the G Cards EU bank landing: platform language **31.2.7** needs a dedicated Frankfurt server (legacy host too slow), paid in **USDC directly**; desk tokens fund card spend only; status keys show Done / In process; $1,300 activation; business prepaid metal; Apple Pay demo. Issuer API credentials (including Pay2) are entered only on the admin desk at `/desk`. Open GG Card from the computer that runs it. The sign-in page lists every address, and the process listens on all network interfaces so another computer on the same network can use the LAN address. Open http://127.0.0.1:8787, or the `http://192.168…:8787` line printed in the terminal. Only the admin signs in: username `offlinerich`. There is no public sign-up. The admin adds clients by email from the console, opens a client to link their wallet and issue the card, and sees every client with their balance. The console acts for a client with the `x-client-id` header, which the server honors only for the admin session. Set `SELF_SIGNUP=1` to bring back customer sign-up and login, for example in tests. Copy `.env.example` to `.env` and fill in the keys you have. The process reads the environment; it does not load `.env` by itself.

```bash
npm test
```

## Top up with a token you own

1. Link the sending wallet with a private key. The key stays in that browser tab. It is not sent to the server and it is not saved. The deposit panel then checks Ethereum, Base, Polygon, Arbitrum, Optimism, and BNB Chain and lists the catalog tokens that account holds. Scan the QR code or copy the address to send tokens there. After the live card is issued, the code is the card deposit address. LFUSD (`0x0f1b825a734Bd1b885EC82780189F4534b291A28` on Ethereum) is priced at one dollar, the same peg rule as USDT. The chain feed has no LFUSD pool, so the desk uses that published dollar price. One LFUSD quotes as one dollar before the fee.
2. Pick a catalog token (USDC, USDT, DAI, WETH, WBNB on Ethereum, Base, Polygon, Arbitrum, Optimism, and BNB Chain) or add any other ERC-20. Adding a contract calls `symbol()`, `name()`, and `decimals()` on that chain.
3. Quote an amount. The price comes from `https://coins.llama.fi/prices/current/{chain}:{address}`. Catalog stablecoins use $1 when the published price is within a cent of the peg. A contract with no reliable price cannot fund the card.
4. Send that token from the linked wallet to the Immersve deposit contract (the quote shows it as the funding address) and paste the transaction hash. The server credits the USD value of the `Transfer` log, minus `TOPUP_FEE_BPS` (default 1%).

The wallet key stays with you. Immersve spends against the deposit contract. `GET /api/operator/obligations` (header `Authorization: Bearer $OPERATOR_TOKEN`) shows the credited total recorded here.

## Spend it worldwide

The card currency is USD. A merchant who charges in another currency is converted by the card network. Immersve authorizes the charge against the on-chain deposit.

## Apple Pay, Google Pay, Samsung Pay

Apple Pay is provisioned in the iPhone app. Google Pay and Samsung Pay are typed in from the one-time secure card link. Wallet tokens require the live Immersve program.

| Wallet | On this site | In the phone app |
| --- | --- | --- |
| Apple Pay | The iPhone app collects the PassKit certificate chain | `clients/ios/AddToApplePay.swift` posts it to `POST /api/wallets/apple`. Immersve returns `encryptedPassData`, `ephemeralPublicKey`, and `activationData`. |
| Google Pay | One-time secure card link | `clients/android/AddToGooglePay.kt` opens `POST /api/wallets/secure-details`. |
| Samsung Pay | The same secure link, or Visa push when a vCardID is attached | `clients/android/AddToSamsungPay.kt` reads `DEVICE_ID` and `WALLET_USER_ID` for the Visa push path. |

Samsung push calls Visa `POST /inapp/provisioning/cardData/samsungPay` with an `x-pay-token`. It sends the card’s `vCardID`, not the PAN. Attach that id with:

```bash
curl -X POST http://localhost:8787/api/operator/cards/CARD_ID/vcard \
  -H "Authorization: Bearer $OPERATOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"vCardId":"v-card-id"}'
```

Set `VISA_API_KEY`, `VISA_SHARED_SECRET`, and, when the Visa sandbox requires it, `VISA_CERT_PATH` and `VISA_KEY_PATH`.

## APIs

| Piece | API |
| --- | --- |
| Cardholder login, card, funding | Immersve `POST /auth/login-init`, `POST /api/funding-sources`, `POST /api/cards` on `https://api.immersve.com` |
| Apple Pay | Immersve `POST /api/cards/{cardId}/provision/apple-pay` |
| Card number | Immersve `POST /api/cards/{cardId}/pan-token` |
| Samsung Pay push | Visa `POST /inapp/provisioning/cardData/samsungPay` |
| Token metadata | Chain `eth_call` for `symbol`, `name`, `decimals` |
| USD value | DefiLlama `GET https://coins.llama.fi/prices/current/{chain}:{address}` |
| Deposit check | `eth_getTransactionReceipt` and the ERC-20 `Transfer` log |

Routes on this server live under `/api`. The browser uses an httpOnly session cookie. Native apps use `Authorization: Bearer` with the token returned by `/api/login`. `/api/register` answers 403 unless `SELF_SIGNUP=1`. `POST /api/admin/clients` with `{ "email": "…" }` adds a client.
