CREATE TABLE IF NOT EXISTS "aa_consents" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "consent_id" VARCHAR(128) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "mobile" VARCHAR(20),
    "linked_accounts" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aa_consents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "aa_consents_consent_id_key" ON "aa_consents"("consent_id");
CREATE INDEX IF NOT EXISTS "aa_consents_user_id_status_idx" ON "aa_consents"("user_id", "status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'aa_consents_user_id_fkey'
  ) THEN
    ALTER TABLE "aa_consents"
      ADD CONSTRAINT "aa_consents_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
