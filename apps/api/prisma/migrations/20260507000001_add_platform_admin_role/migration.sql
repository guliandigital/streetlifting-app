-- Add the platform_admin enum value at the front of the existing Role enum.
-- Postgres requires ALTER TYPE outside a transaction block.

ALTER TYPE "Role" ADD VALUE 'platform_admin' BEFORE 'federation_admin';
