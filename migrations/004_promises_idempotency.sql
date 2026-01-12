BEGIN;

-- One “active” promise per user + opportunity while it’s in-flight or confirmed.
-- This is what lets server.js use ON CONFLICT for idempotence.
CREATE UNIQUE INDEX IF NOT EXISTS uq_promises_user_opportunity_active
ON promises (user_id, opportunity_key)
WHERE status IN ('pending_email_verification', 'submitted', 'accepted');

COMMIT;