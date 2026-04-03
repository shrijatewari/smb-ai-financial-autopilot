-- Razorpay webhook ledger + user conversation language
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "conversation_language" VARCHAR(8) NOT NULL DEFAULT 'hi';

ALTER TABLE "actions" ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "webhook_logs" (
    "id" SERIAL NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "event_type" VARCHAR(64) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "webhook_logs_provider_created_at_idx" ON "webhook_logs"("provider", "created_at");
