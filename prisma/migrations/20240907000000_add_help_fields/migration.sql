-- Alter OrderStatus to add ON_HOLD_HELP
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'ON_HOLD_HELP';

-- Add fulfillment timestamps to orders
ALTER TABLE "orders" ADD COLUMN "fulfilled_at" TIMESTAMP(3), ADD COLUMN "expires_at" TIMESTAMP(3);

-- Add help related events
ALTER TYPE "EventKind" ADD VALUE IF NOT EXISTS 'HELP_REQUESTED';
ALTER TYPE "EventKind" ADD VALUE IF NOT EXISTS 'HELP_RESUMED';
ALTER TYPE "EventKind" ADD VALUE IF NOT EXISTS 'HELP_CANCELLED';
