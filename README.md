# Picketly Promise API

**Status:** Pilot / Founding Phase
**Runtime:** Node.js (non-Docker)
**Deployment:** Render Web Service
**Primary Role:** Promise intake, validation, and attribution for the founding of the
**Contemporary Classical Latin & Greek Music League**

---

## 1. Purpose & Mission Context

Picketly is a civic operating system that begins with **runners who care** and expands into an **American Revival** through the founding of the **Contemporary Classical Latin & Greek Music League**.

This API exists to support:

* **Gate-on-submit commitments** from visitors on ClickFunnels pages
* **Magic-link authentication** that respects privacy and avoids forced accounts
* **Promise intake and ledgering** (cash or non-cash promises)
* **Visibility-aware promise artwork exhibition**
* A durable record of the League’s **Founding Cohort**

This service is intentionally:

* privacy-first,
* auditable,
* conservative in trust assumptions,
* and designed to scale gradually from a small NYC pilot.

---

## 2. What This API Does (and Does Not Do)

### This API **does**

* Accept promise submissions tied to specific opportunities
* Verify submitters via magic-link email
* Maintain a session cookie for visibility rules
* Serve opportunity metadata and promise artwork
* Enforce rate limits to protect enthusiasm from abuse

### This API **does not**

* Handle payments directly (Stripe lives elsewhere)
* Host frontend pages (ClickFunnels does)
* Perform due diligence adjudication (human + event-based process)
* Use third-party video platforms (WebRTC planned separately)

---

## 3. Architecture Overview

```
ClickFunnels (UI)
   |
   |  POST /api/promises  (gate-on-submit)
   v
Picketly Promise API (this repo)
   |
   |-- Magic-link email verification
   |-- Session cookie
   |-- Promise ledger (Postgres)
   |
   |-- GET /api/opportunities
   |-- GET /api/opportunities/:key/artwork
   v
Postgres (Render or external)
```

Static assets (CSS/JS/JSON) are hosted separately and consumed by ClickFunnels.

---

## 4. Key Endpoints

### Health

```
GET /health
```

### Opportunities

```
GET /api/opportunities
GET /api/opportunities?category=professional
```

### Promise Artwork (visibility-aware)

```
GET /api/opportunities/:key/artwork
```

### Submit a Promise (gate-on-submit)

```
POST /api/promises
```

**Payload**

```json
{
  "opportunity_key": "string",
  "email": "string",
  "full_name": "string",
  "payload": {
    "context": "optional free text",
    "acknowledgement": "public | league | private"
  }
}
```

### Confirm Magic Link

```
GET /api/promises/confirm?token=...
```

---

## 5. Authentication & Privacy Model

* No forced accounts
* No passwords
* Magic-link email verification only
* Secure HTTP-only session cookie
* Visibility tiers for promise artwork:

  * `public`
  * `league`
  * `private`

Email input is **strictly validated** to avoid ambiguous parsing or injection.

---

## 6. Rate Limiting (Abuse Prevention)

To protect supporters and infrastructure:

* Per-IP request limits
* Per-email send limits
* Cooldown between magic-link sends
* In-memory limiter (sufficient for single-instance pilot)

Upgrade path: Redis or Postgres-backed rate limits for multi-instance scaling.

---

## 7. Local Development

### Prerequisites

* Node.js ≥ 18
* Postgres (local or remote)

### Install & Run

```bash
npm install
cp .env.example .env
# edit .env with your values
npm start
```

### Verify

```bash
curl http://localhost:4000/health
curl http://localhost:4000/api/opportunities
```

---

## 8. Environment Variables

Required:

```env
NODE_ENV=production
DATABASE_URL=postgres://...
JWT_SECRET=long-random-string
APP_BASE_URL=https://your-api.onrender.com
FRONTEND_ALLOWED_ORIGINS=https://your-funnel-domain.com
```

Optional (email delivery):

```env
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
FROM_EMAIL=no-reply@picketly.example
FROM_NAME=Picketly
```

Rate-limit tuning (optional):

```env
RATE_WINDOW_MS=600000
RATE_IP_MAX=20
RATE_EMAIL_MAX=5
RATE_EMAIL_COOLDOWN_MS=60000
```

---

## 9. Deployment to Render (Non-Docker)

1. Create a new **Web Service**
2. Runtime: **Node**
3. Build command: `npm install`
4. Start command: `npm start`
5. Health check path: `/health`
6. Add environment variables via Render dashboard
7. Attach Postgres instance
8. Deploy

This repo includes a `render.yaml` for reference.

---

## 10. Repository Structure

```
api/
  server.js        # Express API
data/
  opportunities.json
render.yaml
package.json
README.md
.gitignore
```

---

## 11. Canonical Status & Continuity

This repository represents the **canonical baseline** for:

* promise ingestion,
* magic-link verification,
* and opportunity/artwork APIs.

**Do not replace core flows casually.**
Modify incrementally and document rationale.

For mission, narrative, and UI constraints, see the accompanying
`picketly_context_packet_v1.md`.

---

## 12. Next Steps

* Add SQL migrations (`migrations/001_init.sql`)
* Integrate Stripe webhooks (separate service)
* Add WebRTC due-diligence tooling
* Expand promise brokerage accounting

---

**Picketly exists to prove that Citizens can still organize—
not by shouting, but by committing, hosting, and building together.**

---


