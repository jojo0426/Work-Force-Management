-- Phase 3 Work Order import subscriber fields.
-- Persist the required Excel subscriber data as first-class columns.

ALTER TABLE "Subscriber"
ADD COLUMN IF NOT EXISTS "accountNumber" TEXT,
ADD COLUMN IF NOT EXISTS "contactNumber" TEXT,
ADD COLUMN IF NOT EXISTS "plan" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Subscriber_accountNumber_key"
ON "Subscriber"("accountNumber");
