/**
 * Picketly API (baseline) – Express + Postgres + magic-link auth
 * - Nodemailer 7.x safe addressing (use {name, address})
 * - Conservative email validation
 * - Rate limiting for magic-link sends (per-IP + per-email)
 */
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const app = express();

// -------------------- Config --------------------
const PORT = process.env.PORT || 4000;
const NODE_ENV = process.env.NODE_ENV || "development";

// Comma-separated list of allowed origins, e.g.
// "https://your-funnel.clickfunnels.com,https://picketly.example"
const FRONTEND_ALLOWED_ORIGINS = (process.env.FRONTEND_ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Where to send user after clicking magic link (could be ClickFunnels thank-you page)
const APP_BASE_URL = process.env.APP_BASE_URL || "";

// Required for signing tokens & sessions
const JWT_SECRET = process.env.JWT_SECRET || "";
const MAGIC_LINK_EXPIRY = process.env.MAGIC_LINK_EXPIRY || "1h";

// Cookie name for session
const SESSION_COOKIE_NAME = "picketly_session";

// Postgres
const DATABASE_URL = process.env.DATABASE_URL || "";
const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl:
        process.env.PGSSLMODE === "require"
          ? { rejectUnauthorized: false }
          : undefined,
    })
  : null;

// Email (SMTP)
const FROM_EMAIL = process.env.FROM_EMAIL || "no-reply@picketly.example";
const FROM_NAME = process.env.FROM_NAME || "Picketly";

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

const hasSmtp = Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS);
const transporter = hasSmtp
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: false, // set true if using port 465
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
  : null;

// -------------------- Middleware --------------------
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// Trust proxy so req.ip reflects real client IP behind Render/Cloudflare.
// (Render typically uses proxies.)
app.set("trust proxy", 1);

// CORS: if no origins specified, default deny cross-origin credentials
app.use(
  cors({
    origin: function (origin, cb) {
      // Allow same-origin / server-to-server (no Origin header)
      if (!origin) return cb(null, true);
      if (FRONTEND_ALLOWED_ORIGINS.length === 0) return cb(null, false);
      return cb(null, FRONTEND_ALLOWED_ORIGINS.includes(origin));
    },
    credentials: true,
  })
);

function sendError(res, status, message) {
  return res.status(status).json({ error: message });
}

function requireConfiguredDb(req, res, next) {
  if (!pool) return sendError(res, 500, "DATABASE_URL is not configured.");
  next();
}

function requireJwtSecret(req, res, next) {
  if (!JWT_SECRET) return sendError(res, 500, "JWT_SECRET is not configured.");
  next();
}

function setSessionCookie(res, payload) {
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

function parseSession(req, res, next) {
  const token = req.cookies[SESSION_COOKIE_NAME];
  if (!token) {
    req.user = null;
    return next();
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
  } catch (e) {
    req.user = null;
  }
  next();
}
app.use(parseSession);

// -------------------- Input hardening --------------------
// Conservative email validation:
// - rejects whitespace, quotes, <>, and CRLF to reduce parsing ambiguity & header injection
// - basic shape check: local@domain.tld
function isSafeEmailAddress(email) {
  if (typeof email !== "string") return false;

  const trimmed = email.trim();
  if (trimmed.length < 6 || trimmed.length > 254) return false;
  if (trimmed !== email) return false; // no leading/trailing spaces
  if (/[\r\n]/.test(email)) return false; // header injection defense
  if (/[<>"'\s]/.test(email)) return false; // avoid ambiguous quoting/parsing

  const re =
    /^[A-Za-z0-9.!#$%&*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
  return re.test(email);
}

function safeName(name) {
  // Keep it simple: remove CR/LF and angle brackets
  return String(name || "")
    .replace(/[\r\n]/g, " ")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, 120);
}

// -------------------- Rate limiting (magic-link) --------------------
// In-memory limiter: OK for single instance pilot.
// If you run multiple instances later, replace this with Redis or DB-backed counters.
const RATE_WINDOW_MS = Number(process.env.RATE_WINDOW_MS || 10 * 60 * 1000); // 10 minutes
const RATE_IP_MAX = Number(process.env.RATE_IP_MAX || 20); // 20 requests / 10m / IP
const RATE_EMAIL_MAX = Number(process.env.RATE_EMAIL_MAX || 5); // 5 sends / 10m / email
const RATE_EMAIL_COOLDOWN_MS = Number(
  process.env.RATE_EMAIL_COOLDOWN_MS || 60 * 1000
); // 1 minute between sends to same email

// key -> { count, resetAt, lastAt }
const ipBuckets = new Map();
const emailBuckets = new Map();

function nowMs() {
  return Date.now();
}

function getBucket(map, key) {
  const t = nowMs();
  const existing = map.get(key);
  if (!existing || existing.resetAt <= t) {
    const fresh = { count: 0, resetAt: t + RATE_WINDOW_MS, lastAt: 0 };
    map.set(key, fresh);
    return fresh;
  }
  return existing;
}

function cleanupBuckets() {
  const t = nowMs();
  for (const [k, v] of ipBuckets.entries()) if (v.resetAt <= t) ipBuckets.delete(k);
  for (const [k, v] of emailBuckets.entries())
    if (v.resetAt <= t) emailBuckets.delete(k);
}
// periodic cleanup to avoid unbounded growth
setInterval(cleanupBuckets, 60 * 1000).unref?.();

function rateLimitMagicLink(req, res, next) {
  const ip = req.ip || "unknown";
  const ipBucket = getBucket(ipBuckets, ip);
  if (ipBucket.count >= RATE_IP_MAX) {
    return sendError(
      res,
      429,
      "Too many attempts from this network. Please wait and try again."
    );
  }

  // email not known yet for all routes; only enforce email limits when available
  next();
}

// -------------------- Health --------------------
app.get("/health", (req, res) => res.json({ ok: true }));

// -------------------- Opportunities --------------------
app.get("/api/opportunities", (req, res) => {
  try {
    const filePath = path.join(__dirname, "..", "data", "opportunities.json");
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw);

    const category = (req.query.category || "").trim();
    let opportunities = data.opportunities || [];
    if (category)
      opportunities = opportunities.filter((o) =>
        (o.categories || []).includes(category)
      );

    res.json({ opportunities });
  } catch (err) {
    console.error(err);
    sendError(res, 500, "Failed to load opportunities.");
  }
});

// -------------------- Artwork --------------------
// Visibility model (baseline):
// - public: anyone
// - league: only logged-in (session cookie)
// - private: only owner (not implemented here)
app.get("/api/opportunities/:key/artwork", requireConfiguredDb, async (req, res) => {
  const key = req.params.key;
  const viewer = req.user; // { userId } or null

  try {
    const visibility = viewer?.userId ? ["public", "league"] : ["public"];

    const { rows } = await pool.query(
      `SELECT id, type, title, visibility, content_url, content_text, created_at
       FROM artworks
       WHERE opportunity_key = $1 AND visibility = ANY($2)
       ORDER BY created_at DESC
       LIMIT 30`,
      [key, visibility]
    );

    res.json({ artworks: rows });
  } catch (err) {
    console.error(err);
    sendError(res, 500, "Failed to load artwork.");
  }
});

// -------------------- Promises (gate-on-submit + magic link) --------------------
// Apply basic IP rate-limit middleware here:
app.post(
  "/api/promises",
  rateLimitMagicLink,
  requireConfiguredDb,
  requireJwtSecret,
  async (req, res) => {
    const { opportunity_key, email, full_name, payload } = req.body || {};
    if (!opportunity_key || !email || !full_name || !payload) {
      return sendError(res, 400, "Missing required fields.");
    }
    if (!APP_BASE_URL) {
      return sendError(
        res,
        500,
        "APP_BASE_URL is not configured (needed for magic link redirect)."
      );
    }

    // Strict email validation
    if (!isSafeEmailAddress(email)) {
      return sendError(res, 400, "Invalid email address.");
    }

    // Increment & enforce IP + email buckets
    const ip = req.ip || "unknown";
    const ipBucket = getBucket(ipBuckets, ip);
    ipBucket.count += 1;

    const emailKey = email.toLowerCase();
    const emailBucket = getBucket(emailBuckets, emailKey);

    // Cooldown: prevent repeated sends to same email too quickly
    const t = nowMs();
    if (emailBucket.lastAt && t - emailBucket.lastAt < RATE_EMAIL_COOLDOWN_MS) {
      return sendError(
        res,
        429,
        "Please wait a moment before requesting another confirmation email."
      );
    }

    if (emailBucket.count >= RATE_EMAIL_MAX) {
      return sendError(
        res,
        429,
        "Too many confirmation emails requested for this address. Please wait and try again."
      );
    }

    emailBucket.count += 1;
    emailBucket.lastAt = t;

    try {
      // Upsert user
      const userResult = await pool.query(
        `INSERT INTO users (email, full_name, email_verified)
         VALUES ($1, $2, false)
         ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
         RETURNING id`,
        [emailKey, full_name]
      );
      const user = userResult.rows[0];

      // Create promise record
      const promiseResult = await pool.query(
        `INSERT INTO promises (user_id, opportunity_key, status, payload)
         VALUES ($1, $2, 'pending_email_verification', $3)
         RETURNING id, created_at`,
        [user.id, opportunity_key, payload]
      );
      const promise = promiseResult.rows[0];

      // Sign magic link token
      const magicToken = jwt.sign(
        { userId: user.id, promiseId: promise.id },
        JWT_SECRET,
        { expiresIn: MAGIC_LINK_EXPIRY }
      );

      // Confirm endpoint lives on this API
      const confirmUrl = `${APP_BASE_URL}/api/promises/confirm?token=${encodeURIComponent(
        magicToken
      )}`;

      // Send email (Nodemailer 7.x):
      // Use address OBJECTS to reduce ambiguity and avoid relying on parsing "Name <email>" strings.
      if (transporter) {
        await transporter.sendMail({
          from: { name: FROM_NAME, address: FROM_EMAIL },
          to: { name: safeName(full_name), address: emailKey },
          subject: "Confirm your founding promise for the League",
          text: `Hello ${safeName(full_name)},

Thank you for submitting a founding promise.

To verify your email and finalize your commitment, click:
${confirmUrl}

If you did not initiate this, you can ignore this email.

— Picketly`,
        });
      } else {
        // Dev/Proof mode: log link
        console.log("[MAGIC LINK - SMTP not configured]", confirmUrl);
      }

      res.json({
        promise: {
          id: promise.id,
          status: "pending_email_verification",
          opportunity_key,
          created_at: promise.created_at,
        },
        message: transporter
          ? "Magic-link email sent."
          : "Magic-link generated (logged on server).",
      });
    } catch (err) {
      console.error(err);
      return sendError(res, 500, "Failed to submit promise.");
    }
  }
);

// Magic link confirm – marks email verified, sets session cookie, updates promise status.
app.get(
  "/api/promises/confirm",
  requireConfiguredDb,
  requireJwtSecret,
  async (req, res) => {
    const token = req.query.token;
    if (!token) return sendError(res, 400, "Missing token.");

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const { userId, promiseId } = decoded;

      await pool.query("BEGIN");
      await pool.query(
        `UPDATE users SET email_verified = true, updated_at = now() WHERE id = $1`,
        [userId]
      );
      await pool.query(
        `UPDATE promises SET status = 'submitted', updated_at = now() WHERE id = $1`,
        [promiseId]
      );
      await pool.query("COMMIT");

      setSessionCookie(res, { userId });

      // Redirect to a thank-you page you control.
      res.redirect(`${APP_BASE_URL}/thank-you`);
    } catch (err) {
      console.error(err);
      try {
        await pool.query("ROLLBACK");
      } catch (_) {}
      return sendError(res, 400, "Invalid or expired token.");
    }
  }
);

app.listen(PORT, () => {
  console.log(`Picketly API listening on port ${PORT}`);
});

