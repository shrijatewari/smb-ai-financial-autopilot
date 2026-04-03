-- Daily WhatsApp briefing + notification log
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "whatsapp_number" VARCHAR(20);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "morning_briefing_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS "notification_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "channel" VARCHAR(32) NOT NULL,
    "kind" VARCHAR(64) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "detail" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "notification_logs_user_id_created_at_idx" ON "notification_logs"("user_id", "created_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notification_logs_user_id_fkey'
  ) THEN
    ALTER TABLE "notification_logs"
      ADD CONSTRAINT "notification_logs_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
