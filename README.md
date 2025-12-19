# Picketly Promise API (Render) — Prototype “Infinite Upsell Funnel” Backend

This repository is the **backend** for a prototype “infinite upsell funnel” hosted in **ClickFunnels**, with the API deployed as a **non-Docker Node Web Service on Render**.

It implements the minimum production-grade mechanics needed to realize the invariants in `picketly_context_packet_v3.md`:

- **Promises are conditional payment instruments** (become payment only upon seller acceptance).
- **Seller-side artwork exhibition is granted only after acceptance** (endorsement/brokerage).
- **Promise artwork is media-agnostic** (API stores metadata; media constraints are market-defined).
- **Gate-on-submit** + **magic-link verification** to identify the bidder only when they submit.

> Keep `picketly_context_packet_v3.md` in this repo (or a linked canonical repo) and treat it as binding for future changes.

---

## What Runs Where

### ClickFunnels (frontend host)
- Renders the “infinite upsell funnel” page:
  - hero badge filters
  - opportunity cards
  - form panel (desktop) / overlay (mobile)
- Loads opportunities from a **remote JSON** file (editable without redeploying the API).
- On submit: calls this API to create a **promise bid** and trigger **magic-link verification**.

### Render (backend host)
- Runs this Node/Express service.
- Connects to Postgres (Render Postgres or external).
- Sends magic links (SMTP) or logs them for pilot testing.

---

## Repository Layout (expected)
```bash
api/
server.js

data/
opportunities.json              # optional local fallback (prototype)

migrations/
001_init.sql
002_media_agnostic.sql
003_artwork_exhibition.sql

render.yaml                       # optional but recommended
package.json
README.md
```

**Important:** ClickFunnels JS/CSS is typically hosted separately as static assets
(e.g., S3/R2/Cloudflare Pages/GitHub Pages). This repo is the **API**.

---

## API Contract (prototype)

### Health
- `GET /health` → `{ ok: true }`

### Opportunities (cards)
- `GET /api/opportunities`
- `GET /api/opportunities?category=professional`

Used by the frontend to populate the left-side card list.

### Artwork (visibility-aware)
- `GET /api/opportunities/:key/artwork`

Returns promise artwork entries for an opportunity key, filtered by viewer session:
- anonymous viewers: public only
- logged-in viewers: public + league  
(Private is reserved for later owner-only enforcement.)

### Promise bid (gate-on-submit)
- `POST /api/promises`

Creates a promise bid and triggers magic-link verification. This is the only time
we require identity.

Body:
```json
{
  "opportunity_key": "city_team_owner",
  "email": "user@example.com",
  "full_name": "Full Name",
  "payload": { "anything": "the form collects" }
}
```

### Confirm magic link

* `GET /api/promises/confirm?token=...`

Verifies email, updates the promise status, and sets a session cookie.

---

## Database Setup (Postgres)

Run the initial migration:

```bash
psql "$DATABASE_URL" -f migrations/001_init.sql
```

Tables created:

* `users`
* `promises`
* `artworks`

---

## Local Development

### 1) Install

```bash
npm install
```

### 2) Configure env

Create `.env` from `.env.example` (do not commit `.env`).

### 3) Run

```bash
npm start
```

### 4) Verify

```bash
curl http://localhost:4000/health
curl http://localhost:4000/api/opportunities
```

---

## Environment Variables (Render)

Required:

* `NODE_ENV=production`
* `DATABASE_URL=...`
* `JWT_SECRET=...` (long random string)
* `APP_BASE_URL=https://YOUR-SERVICE.onrender.com`
* `FRONTEND_ALLOWED_ORIGINS=https://YOUR_CLICKFUNNELS_DOMAIN`

  * comma-separated list allowed

Optional (SMTP email):

* `SMTP_HOST`
* `SMTP_PORT`
* `SMTP_USER`
* `SMTP_PASS`
* `FROM_EMAIL`
* `FROM_NAME`

Rate limiting (recommended defaults):

* `RATE_WINDOW_MS=600000` (10m)
* `RATE_IP_MAX=20`
* `RATE_EMAIL_MAX=5`
* `RATE_EMAIL_COOLDOWN_MS=60000`

---

## Deploy to Render (Non-Docker)

1. Render → **New** → **Web Service**
2. Connect GitHub repo
3. Runtime: **Node**
4. Build Command: `npm install`
5. Start Command: `npm start`
6. Health Check Path: `/health`
7. Add env vars (above)
8. Attach Postgres and run migrations

After deploy, confirm:

* `GET https://YOUR-SERVICE.onrender.com/health`

---

## ClickFunnels Integration (prototype wiring)

### A) Host your frontend assets

Host these as static files somewhere public:

* `design-system.css`
* `funnel.js`
* `opportunities.json` (remote, editable “cards database”)

### B) ClickFunnels Custom HTML/JS block

In ClickFunnels, paste your upsell HTML (the page shell) and include:

```html
<link rel="stylesheet" href="https://YOUR-ASSET-HOST/design-system.css" />

<script>
  window.PICKETLY = {
    API_BASE: "https://YOUR-SERVICE.onrender.com",
    OPPORTUNITIES_URL: "https://YOUR-ASSET-HOST/opportunities.json"
  };
</script>

<script src="https://YOUR-ASSET-HOST/funnel.js"></script>
```

### C) CORS

Make sure `FRONTEND_ALLOWED_ORIGINS` includes the **exact** ClickFunnels origin(s)
that will host the page, or the browser will block requests.

---

## How This Prototype Implements the v3 Canon (operationally)

* **Infinite funnel:** opportunities are driven by `opportunities.json`, not hard-coded.
  Add/remove/edit cards without redeploying the API.
* **Gate-on-submit:** identity is requested only when submitting a promise bid.
* **Promises as conditional payment instruments:** the API records bids and verification;
  acceptance is a later organizational step (future endpoint/workflow).
* **Seller-side exhibition only after acceptance:** this API supports artwork objects and
  visibility filtering, but the organizer must only publish/associate seller-exhibited
  artworks after acceptance.
* **Media-agnostic artwork:** artworks are stored as records + references (URLs/text);
  markets define acceptable media. Avoid hard-coding “image-only” assumptions.

---

## Operational Notes (prototype realism)

* If SMTP is not configured, magic links are logged in Render logs (pilot convenience).
* For multi-instance scaling, replace in-memory rate limits with Redis or Postgres-backed counters.
* Stripe checkout is intentionally out-of-scope for this API; ClickFunnels/Stripe handles cash tiers.

---

## Change Control

This repo is a prototype production backend. Changes that modify:

* promise/payment semantics,
* exhibition timing,
* or artwork media constraints
  must be reviewed against `picketly_context_packet_v3.md` before merging.

---


## Diagrammatic Explanation of the Picketly Relationship

A. Conceptual Diagram (Plain English)
```bash
Citizens
↓ make commitments (money, labor, assets, services)

Organizer-Seller (League Founder / Leadership)
↓ accepts, curates, coordinates commitments

Picketly (Technical Contractor)
↓ provides promise ledger, attribution, visibility, coordination tools

Institution Takes Form
→ Conservatory Network
→ Professional League Teams
→ Public Performances
```

B. Structural Diagram
```yaml
[ Citizens / Contributors ]
        |
        |  promises (money, labor, assets, services)
        v
[ Organizer-Seller ]
(The League’s leadership)
        |
        |  acceptance criteria, mission, governance
        v
[ Contemporary Classical Latin & Greek Music League ]
        |
        |  talent requirements, performance standards
        v
[ Conservatory Network ]
        |
        |  trained performers
        v
[ Professional League Teams ]
        |
        |  public performances
        v
[ Civic & Cultural Impact ]


           ───────────────────────────────
           |          Picketly           |
           |    (Technical Contractor)   |
           |-----------------------------|
           | • Promise acceptance        |
           | • Conditional accounting    |
           | • Attribution & visibility. |
           | • Coordination tooling      |
           ───────────────────────────────

Note:
• Picketly supports Organizer-Sellers
• Picketly does NOT govern the League
• The League may change contractors
```
---