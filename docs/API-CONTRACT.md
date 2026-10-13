# API used by the POS app

The server is the Reztra POS API (CodeIgniter 3). Full reference: `docs/API.md` in the reztra-pos-api package.

Base URL comes from the device key, e.g. `https://pos.example.com/api`. Every answer is wrapped:
```
{ "success": true,  "message": "...", "data": { ... } }
{ "success": false, "code": "VALIDATION", "message": "Readable text", "errors": { "field": "problem" } }
```
`electron/sync.cjs` and `electron/device.cjs` unwrap `data` automatically, so the rest of the app sees the plain objects below.

After activation every sync request sends:
```
Authorization: Bearer <device_token>
X-Device-Id: <device_id>
```
401 = device revoked → the app shows the activation screen.

| Call | Used for |
|---|---|
| `POST /v1/devices/activate {device_id, code, machine, app_version}` | First start: returns `{device_token, device{id,name,short}, outlet{id,name}}` |
| `GET /v1/ping` | Online check |
| `GET /v1/sync/pull` | Full snapshot: outlet, categories, items, waiters, customers, delivery_partners, tables, payment_methods, staff (salt + sha256(salt:pin)) |
| `POST /v1/sync/invoices {invoices:[...]}` | Upload offline invoices; `uuid` = idempotency key; results `ok` / `duplicate` / `error` with `server_no` |
| `POST /v1/auth/login {email, password}` + `X-Device-Token` | Online email login (PIN login works offline from the staff list) |

Each offline invoice carries `user_id` (the staff member logged in with PIN), so the server records the right cashier.
