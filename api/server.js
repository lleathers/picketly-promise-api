require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const { Pool } = require("pg");

const app = express();

const PORT = process.env.PORT || 4000;
const NODE_ENV = process.env.NODE_ENV || "development";

const FRONTEND_ALLOWED_ORIGINS = (process.env.FRONTEND_ALLOWED_ORIGINS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const APP_BASE_URL = process.env.APP_BASE_URL || "";
const JWT_SECRET = process.env.JWT_SECRET || "";
const MAGIC_LINK_EXPIRY = process.env.MAGIC_LINK_EXPIRY || "1h";

const FRONTEND_THANK_YOU_URL = process.env.FRONTEND_THANK_YOU_URL || "";

const SESSION_COOKIE_NAME = "picketly_session";

const DATABASE_URL = process.env.DATABASE_URL || "";
const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined,
    })
  : null;

const FROM_EMAIL = process.env.FROM_EMAIL || "Picketly <promises@picketly.com>";
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
      secure: false,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      requireTLS: true
    })
  : null;

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.use(
  cors({
    origin: function (origin, cb) {
      // Allow same-origin / server-to-server
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
  if (!token) { req.user = null; return next(); }
  try { req.user = jwt.verify(token, JWT_SECRET); }
  catch { req.user = null; }
  next();
}
app.use(parseSession);

app.get("/health", (req, res) => res.json({ ok: true }));

// -------------------- Opportunities --------------------
const fs = require("fs");
const path = require("path");
app.get("/api/opportunities", (req, res) => {
  try {
    const filePath = path.join(__dirname, "..", "data", "opportunities.json");
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw);

    const category = (req.query.category || "").trim();
    let opportunities = data.opportunities || [];
    if (category) opportunities = opportunities.filter(o => (o.categories || []).includes(category));

    res.json({ opportunities });
  } catch (err) {
    console.error(err);
    sendError(res, 500, "Failed to load opportunities.");
  }
});

// -------------------- Artwork --------------------
app.get("/api/opportunities/:key/artwork", requireConfiguredDb, async (req, res) => {
  const key = req.params.key;
  const viewer = req.user;

  try {
    const visibility = viewer?.userId ? ["public", "league"] : ["public"];
    
    const { rows } = await pool.query(
      `SELECT id, type, title, visibility, content_url, content_text, content_json, created_at
       FROM artworks
       WHERE opportunity_key = $1
       AND visibility = ANY($2)
       AND exhibited_by = 'seller'
       AND exhibit_status = ANY($3)
       ORDER BY created_at DESC
       LIMIT 30`,
      [key, visibility, ["accepted", "acknowledged"]]
    );
    
    res.json({ artworks: rows });
  } catch (err) {
    console.error(err);
    sendError(res, 500, "Failed to load artwork.");
  }
});

// -------------------- Promises (gate-on-submit + magic link) --------------------
app.post("/api/promises", requireConfiguredDb, requireJwtSecret, async (req, res) => {
  const { opportunity_key, email, full_name, payload } = req.body || {};
  if (!opportunity_key || !email || !full_name || !payload) {
    return sendError(res, 400, "Missing required fields.");
  }
  if (!APP_BASE_URL) return sendError(res, 500, "APP_BASE_URL is not configured.");

  try {
    const userResult = await pool.query(
      `INSERT INTO users (email, full_name, email_verified)
       VALUES ($1, $2, false)
       ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
       RETURNING id`,
      [email, full_name]
    );
    const user = userResult.rows[0];

    const promiseResult = await pool.query(
      `INSERT INTO promises (user_id, opportunity_key, status, payload)
       VALUES ($1, $2, 'pending_email_verification', $3)
       RETURNING id, created_at`,
      [user.id, opportunity_key, payload]
    );
    const promise = promiseResult.rows[0];

    const magicToken = jwt.sign({ userId: user.id, promiseId: promise.id }, JWT_SECRET, {
      expiresIn: MAGIC_LINK_EXPIRY,
    });

    const confirmUrl = `${req.protocol}://${req.get("host")}/api/promises/confirm?token=${encodeURIComponent(magicToken)}`;

    if (transporter) {
      await transporter.sendMail({
        from: FROM_EMAIL,
        to: email,
        subject: "Confirm your founding promise for the League",
        text:
          `Hello ${full_name},\n\n` +
          `Thank you for submitting a founding promise.\n\n` +
          `To verify your email and finalize your commitment, click:\n${confirmUrl}\n\n` +
          `If you did not initiate this, you can ignore this email.\n\n— Picketly`,
      });
    } else {
      console.log("[MAGIC LINK - SMTP not configured]", confirmUrl);
    }

    res.json({
      promise: { id: promise.id, status: "pending_email_verification", opportunity_key, created_at: promise.created_at },
      message: transporter ? "Magic-link email sent." : "Magic-link generated (logged on server).",
    });
  } catch (err) {
    console.error(err);
    sendError(res, 500, "Failed to submit promise.");
  }
});

app.get("/api/promises/confirm", requireConfiguredDb, requireJwtSecret, async (req, res) => {
  const token = req.query.token;
  if (!token) return sendError(res, 400, "Missing token.");

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { userId, promiseId } = decoded;

    await pool.query("BEGIN");
    await pool.query(`UPDATE users SET email_verified = true, updated_at = now() WHERE id = $1`, [userId]);
    await pool.query(`UPDATE promises SET status = 'submitted', updated_at = now() WHERE id = $1`, [promiseId]);
    await pool.query("COMMIT");

    setSessionCookie(res, { userId });

    if (!FRONTEND_THANK_YOU_URL) return sendError(res, 500, "FRONTEND_THANK_YOU_URL not configured.");
    res.redirect(FRONTEND_THANK_YOU_URL);
    
  } catch (err) {
    console.error(err);
    try { await pool.query("ROLLBACK"); } catch {}
    return sendError(res, 400, "Invalid or expired token.");
  }
});

app.get("/test-email", async (req, res) => {
  try {
    await transporter.sendMail({
      from: { name: FROM_NAME, address: FROM_EMAIL },
      to: "admin@picketly.com",
      subject: "SES Test",
      text: "If you received this, SES is working."
    });
    res.send("Email sent");
  } catch (e) {
    console.error(e);
    res.status(500).send("Failed");
  }
});

app.listen(PORT, () => console.log(`Picketly API listening on port ${PORT}`));
