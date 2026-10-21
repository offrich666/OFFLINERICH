# OfflineRich Card

A USD debit card you fund with ERC-20 tokens, including a contract you paste in yourself. The same card can be added to Apple Pay, Google Pay, and Samsung Pay.

The spend rail is [Stripe Issuing](https://docs.stripe.com/issuing). Phone wallets tokenize that card. This server prices deposits and approves a charge when the token balance covers it. It does not hold a treasury private key, and it does not display a full card number outside Stripe’s card frame.

Until `STRIPE_SECRET_KEY` is set, the app issues a **simulator** card so you can add contracts, value them, and rehearse a purchase. A simulator card is not a wallet token and is not accepted in shops.

## Run

```bash
npm install
npm start
```

Open http://localhost:8787. Copy `.env.example` to `.env` and fill in the keys you have. The process reads the environment; it does not load `.env` by itself.

```bash
npm test
```

## Top up with a token you own

1. Link the sending wallet. The page can use a browser wallet, or you can sign the message elsewhere and paste the signature.
2. Pick a catalog token (USDC, USDT, DAI, WETH, WBNB on Ethereum, Base, Polygon, Arbitrum, Optimism, and BNB Chain) or add any other ERC-20. Adding a contract calls `symbol()`, `name()`, and `decimals()` on that chain.
3. Quote an amount. The price comes from `https://coins.llama.fi/prices/current/{chain}:{address}`. Catalog stablecoins use $1 when the published price is within a cent of the peg. A contract with no reliable price cannot fund the card.
4. Send that token from the linked wallet to `TREASURY_ADDRESS` and paste the transaction hash. The server credits the USD value of the `Transfer` log, minus `TOPUP_FEE_BPS` (default 1%).

The treasury key stays with you. Swap or redeem what arrives and keep the Stripe Issuing balance funded for the same USD amount. `GET /api/operator/obligations` (header `Authorization: Bearer $OPERATOR_TOKEN`) shows the credited total.

With no treasury address, the page can credit a simulator top-up so the rest of the flow is usable. Simulator credits turn off automatically for a live Stripe key.

## Spend it worldwide

The card currency is USD. A merchant who charges in another currency is converted by the card network. No merchant country is blocked unless you set `BLOCKED_MERCHANT_COUNTRIES`.

Stripe must send real-time authorizations to `POST /api/webhooks/stripe`. The handler approves the request only when the remaining token balance covers `pending_request.amount`. Set that endpoint and `STRIPE_WEBHOOK_SECRET` in the Issuing dashboard.

The card stays inactive until the balance is above zero. The Stripe spending limit is the lifetime amount credited.

## Apple Pay, Google Pay, Samsung Pay

Manual add works once Stripe has enabled digital wallets: the wallet sends a 6-digit code to the cardholder phone or email. Both are collected when the card is issued. In the US and Canada, Google Pay and Samsung Pay need no extra Stripe step; Apple Pay needs Apple’s approval. EU and UK programs need Stripe’s partnership team as well. Wallet tokens exist only in live mode.

| Wallet | On this site | In the phone app |
| --- | --- | --- |
| Apple Pay | Stripe.js element `issuingAddToWalletButton` (`wallet: apple`) when both Stripe keys are set | `clients/ios/AddToApplePay.swift` uses PassKit and `STPPushProvisioningContext`. The key provider calls `POST /api/wallets/ephemeral-key`. |
| Google Pay | The same element with `wallet: google` | `clients/android/AddToGooglePay.kt` uses `stripe-android-issuing-push-provisioning:1.3.0` and TapAndPay `18.8.0`. In Google Issuer Console, link the program to Stripe’s aggregator `BCR2DN7TWDCZDZJC`. |
| Samsung Pay | Manual steps, plus a push payload when Visa credentials and a vCardID exist | `clients/android/AddToSamsungPay.kt` reads `DEVICE_ID` and `WALLET_USER_ID`, then calls `CardManager.addCard` with Visa’s `opaquePaymentCard`. Stripe’s SDK does not push to Samsung Pay. |

`POST /api/wallets/ephemeral-key` accepts `{ cardId, apiVersion, nonce }`. The nonce is the one from `stripe.createEphemeralKeyNonce`. The response is the Stripe ephemeral key plus `api_version` and `ephemeralKeySecret`. The key is scoped to that user’s card.

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
| Cardholder, card, spending limit | `POST /v1/issuing/cardholders`, `POST /v1/issuing/cards` |
| Apple Pay and Google Pay push, and the card frame | `POST /v1/ephemeral_keys` with `issuing_card` and optional `nonce`; Stripe.js Issuing Elements |
| Charge approval | Issuing webhook `issuing_authorization.request` |
| Samsung Pay push | Visa `POST /inapp/provisioning/cardData/samsungPay` |
| Token metadata | Chain `eth_call` for `symbol`, `name`, `decimals` |
| USD value | DefiLlama `GET https://coins.llama.fi/prices/current/{chain}:{address}` |
| Deposit check | `eth_getTransactionReceipt` and the ERC-20 `Transfer` log |

Routes on this server live under `/api`. The browser uses an httpOnly session cookie. Native apps use `Authorization: Bearer` with the token returned by `/api/register` and `/api/login`.
