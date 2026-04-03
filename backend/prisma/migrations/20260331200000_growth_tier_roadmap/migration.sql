-- Growth tier roadmap: subscription, referrals, credit snapshots, audit, collections ladder, benchmarks.

-- AlterTable users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "subscription_tier" VARCHAR(32) NOT NULL DEFAULT 'free';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "referral_code" VARCHAR(16);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "referred_by_user_id" INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS "users_referral_code_key" ON "users"("referral_code");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_referred_by_user_id_fkey'
  ) THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_referred_by_user_id_fkey"
      FOREIGN KEY ("referred_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- CreditScoreSnapshot
CREATE TABLE IF NOT EXISTS "credit_score_snapshots" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "band" VARCHAR(16) NOT NULL,
    "factors" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "credit_score_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "credit_score_snapshots_user_id_created_at_idx" ON "credit_score_snapshots"("user_id", "created_at");
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'credit_score_snapshots_user_id_fkey'
  ) THEN
    ALTER TABLE "credit_score_snapshots" ADD CONSTRAINT "credit_score_snapshots_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AuditLog
CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "actor" VARCHAR(32) NOT NULL,
    "action" VARCHAR(128) NOT NULL,
    "resource" VARCHAR(255),
    "metadata" JSONB,
    "ip" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_user_id_fkey'
  ) THEN
    ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- CollectionCampaign
CREATE TABLE IF NOT EXISTS "collection_campaigns" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "step_index" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(32) NOT NULL,
    "next_run_at" TIMESTAMP(3),
    "last_channel" VARCHAR(32),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "collection_campaigns_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "collection_campaigns_user_id_status_next_run_at_idx" ON "collection_campaigns"("user_id", "status", "next_run_at");
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'collection_campaigns_user_id_fkey'
  ) THEN
    ALTER TABLE "collection_campaigns" ADD CONSTRAINT "collection_campaigns_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'collection_campaigns_customer_id_fkey'
  ) THEN
    ALTER TABLE "collection_campaigns" ADD CONSTRAINT "collection_campaigns_customer_id_fkey"
      FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ReferralEvent
CREATE TABLE IF NOT EXISTS "referral_events" (
    "id" SERIAL NOT NULL,
    "referrer_id" INTEGER NOT NULL,
    "referee_user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "referral_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "referral_events_referee_user_id_key" ON "referral_events"("referee_user_id");
CREATE INDEX IF NOT EXISTS "referral_events_referrer_id_idx" ON "referral_events"("referrer_id");
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'referral_events_referrer_id_fkey'
  ) THEN
    ALTER TABLE "referral_events" ADD CONSTRAINT "referral_events_referrer_id_fkey"
      FOREIGN KEY ("referrer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'referral_events_referee_user_id_fkey'
  ) THEN
    ALTER TABLE "referral_events" ADD CONSTRAINT "referral_events_referee_user_id_fkey"
      FOREIGN KEY ("referee_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- BenchmarkAggregate
CREATE TABLE IF NOT EXISTS "benchmark_aggregates" (
    "id" SERIAL NOT NULL,
    "industry_key" VARCHAR(64) NOT NULL,
    "metric" VARCHAR(64) NOT NULL,
    "p50" DOUBLE PRECISION,
    "p90" DOUBLE PRECISION,
    "sample_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "benchmark_aggregates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "benchmark_aggregates_industry_key_metric_key" ON "benchmark_aggregates"("industry_key", "metric");
