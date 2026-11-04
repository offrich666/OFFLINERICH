# Wallet QR phishing awareness (safe demo)

Educational only. Does **not** wire attacker payout addresses. Use a **burner** wallet with dust.

## Files

| File | Purpose |
| --- | --- |
| `01-trust-deeplink-opens-example.com.png` | Scan in Trust — opens example.com via official deep link |
| `02-REPLACE-HOST-template-deeplink.png` | Placeholder; regenerate after you host the page |
| `index.html` | Fake “send” UI + safe message sign + optional Approve preview/request |
| `make_qr.py` | Build a deep-link QR for your hosted HTTPS URL |

## Steps

1. Scan `01-…example.com.png` with Trust (burner). You should land on example.com inside the app.
2. Host `index.html` over HTTPS (Netlify Drop, Cloudflare Pages, etc.).
3. `pip install 'qrcode[pil]'` then:
   `python3 make_qr.py 'https://YOUR-HOST/' -o 03-my-hosted-demo-deeplink.png`
4. Scan the new QR → open the demo in Trust → connect **burner** → try message sign first.
5. Optional Approve: paste **your own** address/contract as spender, prefer amount `1`, then revoke.

## Do not

- Point the demo at live phishing IOC domains
- Use your main wallet or unlimited approve on real funds
- Send assets to random “received wallet” addresses from scam kits
