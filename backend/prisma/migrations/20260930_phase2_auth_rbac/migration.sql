-- Phase 2 authentication/RBAC schema migration.
-- Adds the Administrator role and account activation state required by the
-- authenticated WFM runtime. Existing users remain active by default.

ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'ADMINISTRATOR';

ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
