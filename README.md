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

## 13. Organizer–Visitor–Promise Loop

```
┌─────────────────────────────────────────────┐
│  Organizer / Seller / Founder               │
│  (Public-interest institution builder)      │
│                                             │
│  • Declares mission                          │
│  • Declares needs (roles, assets, capital)  │
│  • Publishes opportunity cards               │
│  • Defines acceptable promises               │
│  • Sets artwork visibility rules             │
└───────────────┬─────────────────────────────┘
                │
                │  (Infinite Upsell Funnel)
                │
                ▼
┌─────────────────────────────────────────────┐
│  Visitor / Citizen / Potential Contributor  │
│                                             │
│  • Encounters mission narrative              │
│  • Sees existing promise artwork             │
│  • Discovers multiple ways to contribute     │
│    (money, labor, assets, governance)        │
│                                             │
│  → Self-selects a feasible commitment        │
└───────────────┬─────────────────────────────┘
                │
                │  Promise Bid (gate-on-submit)
                │
                ▼
┌─────────────────────────────────────────────┐
│  Promise Submission                          │
│                                             │
│  • Promise payload submitted                 │
│  • Email verified via magic link             │
│  • Status: pending / submitted               │
│                                             │
│  • Enthusiasm captured immediately           │
└───────────────┬─────────────────────────────┘
                │
                │
                ▼
┌─────────────────────────────────────────────┐
│  Strategic Promise Artwork Exhibition        │
│                                             │
│  • Artwork associated with opportunity       │
│  • Visibility enforced                       │
│    (public / league / private)               │
│                                             │
│  • Social proof generated                    │
│  • Organizer legitimacy increases            │
└───────────────┬─────────────────────────────┘
                │
                │
                ▼
┌─────────────────────────────────────────────┐
│  Institutional Reconfiguration               │
│                                             │
│  • Organizer adapts structure based on bids  │
│  • Roles staffed                             │
│  • Assets allocated                          │
│  • Capital prioritized                       │
│                                             │
│  → New opportunities published               │
└───────────────┴─────────────────────────────┘
```

### Key Insight (must be preserved)

> **The institution is not designed first and funded second.
> It is discovered through promises.**

This loop is what makes the funnel *infinite* and the economy *adaptive*.

---

# (3) Promise Lifecycle (Canonical Definition)

This section should be added **verbatim** to `picketly_context_packet_v1.md`, and summarized in `README.md`.

---

## Promise Lifecycle (Canonical)

A **promise** in Picketly is not a payment.
It is a *structured, inspectable, socially legible commitment*.

The lifecycle below defines how promises move from enthusiasm to institutional utility.

---

### 1. Declaration (Organizer-Side)

* Organizer defines:

  * what is needed,
  * what qualifies as an acceptable promise,
  * what benefit or role is offered in exchange,
  * what visibility options exist for attribution.
* Opportunity cards encode this declaration.

---

### 2. Bid (Visitor-Side)

* Visitor submits a promise bid through the upsell funnel.
* Bid may represent:

  * labor,
  * access to assets,
  * governance participation,
  * patronage,
  * or government currency.
* No account creation is required at this stage.

**Purpose:**
Capture enthusiasm *without friction*.

---

### 3. Verification (Technical)

* Email ownership verified via magic link.
* Session established.
* Promise enters the ledger with status:

  * `pending_email_verification` → `submitted`.

**Purpose:**
Ensure the bidder is a real, reachable person without harvesting data.

---

### 4. Holding & Due Diligence (Organizational)

* Promise is **held**, not immediately accepted.
* Organizer assesses:

  * feasibility,
  * capacity,
  * character (often through real-world participation).
* Bidder may be invited into:

  * volunteer roles,
  * supervised hosting,
  * probationary participation.

**Critical Insight:**
Due diligence is *experiential*, not form-based.

---

### 5. Provisional Exhibition (Optional)

* Promise artwork may be exhibited:

  * fully,
  * partially,
  * or anonymously,
    according to bidder’s visibility choice.
* Exhibition signals momentum without prematurely committing the organizer.

---

### 6. Acceptance, Rejection, or Revision

* Organizer decides:

  * **accept** → promise becomes part of institutional capacity,
  * **reject** → bidder may revise or redirect effort,
  * **revise** → promise terms renegotiated.

---

### 7. Performance & Redemption

* Accepted promises are called upon when needed.
* Organizer performs its reciprocal promise immediately upon acceptance
  (e.g., role access, recognition, participation rights).

---

### 8. Commemoration & Legacy

* Promise artwork remains part of:

  * the founding ledger,
  * historical record of the institution,
  * ongoing exhibitions.
* This reinforces long-term civic memory.

---

### Design Constraint

> **A promise must never disappear silently.
> Even rejected or revised promises must be acknowledged respectfully.**

---

# (4) Additional Picketly Innovations That MUST Be Preserved for Continuity

This is the most important part of your question.

Below are **innovations we developed implicitly** that future assistants *will miss* unless you name them explicitly.

I strongly recommend adding these as a section titled
**“Critical Picketly Innovations (Continuity List)”**
inside `picketly_context_packet_v1.md`.

---

## Critical Picketly Innovations (Continuity List)

### 1. Promise ≠ Payment

Promises are *illiquid commitments* that require:

* verification,
* holding,
* and judgment.

They must never be treated as instant currency.

---

### 2. Enthusiasm Is a Perishable Asset

The system is designed to:

* capture enthusiasm immediately,
* redirect it into action (volunteering, hosting),
* even while due diligence is pending.

**Time delay is the enemy.**

---

### 3. Due Diligence Is Performed in Reality

Character is measured through:

* supervised hosting,
* real-world events,
* observable behavior.

Not Zoom interviews. Not resumes.

---

### 4. Promise Artwork Is Economic Infrastructure

Artwork is not branding.
It is:

* incentive,
* signaling,
* and historical accounting.

Removing it breaks the economy.

---

### 5. Infinite Funnels Enable Class-Inclusive Institutions

Accepting only money:

* excludes legitimate contributors,
* biases institutions toward wealth,
* and weakens civic legitimacy.

Infinite funnels solve this.

---

### 6. Organizers Are Sellers *and* Stewards

The organizer:

* sells participation,
* but also bears fiduciary responsibility
  to manage promise risk responsibly.

This dual role is intentional.

---

### 7. Visibility Is a Right, Not a Default

Participants must control:

* how their contributions are exhibited,
* to whom,
* and in what context.

---

**Picketly exists to prove that Citizens can still organize—
not by shouting, but by committing, hosting, and building together.**

---


