-- AlterTable
ALTER TABLE "business_profiles" ADD COLUMN "gstin" VARCHAR(16);

-- CreateTable
CREATE TABLE "gst_records" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "gstin" VARCHAR(16) NOT NULL,
    "period" VARCHAR(16) NOT NULL,
    "return_type" VARCHAR(32) NOT NULL,
    "filed_at" TIMESTAMP(3),
    "taxable_value" DECIMAL(18,2),
    "tax_paid" DECIMAL(18,2),
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gst_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gst_records_user_id_period_idx" ON "gst_records"("user_id", "period");

-- AddForeignKey
ALTER TABLE "gst_records" ADD CONSTRAINT "gst_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
