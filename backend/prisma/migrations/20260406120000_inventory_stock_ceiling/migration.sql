-- Peak capacity for stock % bar (see inventory_routes._item_out).
ALTER TABLE "inventory_items" ADD COLUMN "stock_ceiling" DOUBLE PRECISION;

-- Backfill: rows above 5× reorder get a small headroom so 498/500-style drops show below 100%.
UPDATE "inventory_items"
SET "stock_ceiling" = CASE
  WHEN "quantity" > "reorder_threshold" * 5.0
  THEN GREATEST("quantity", "reorder_threshold" * 5.0)
       + GREATEST(2::double precision, CEIL("quantity" * 0.004)::double precision)
  ELSE GREATEST("quantity", "reorder_threshold" * 5.0)
END
WHERE "stock_ceiling" IS NULL;
