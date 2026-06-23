-- V1 completion: add shareToken to CartPlan, add Notification/PriceAlert models

-- CartPlan: shareable plan links (issue #66)
ALTER TABLE "CartPlan" ADD COLUMN IF NOT EXISTS "shareToken" TEXT;
ALTER TABLE "CartPlan" ADD COLUMN IF NOT EXISTS "shareExpiresAt" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "CartPlan_shareToken_key" ON "CartPlan"("shareToken");
CREATE INDEX IF NOT EXISTS "CartPlan_shareToken_idx" ON "CartPlan"("shareToken");

-- PriceAlertType enum (issue #65)
DO $$ BEGIN
  CREATE TYPE "PriceAlertType" AS ENUM ('BELOW_PRICE', 'ON_SALE', 'HISTORIC_LOW');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- PriceAlert table (issue #65)
CREATE TABLE IF NOT EXISTS "PriceAlert" (
  "id"            TEXT NOT NULL,
  "userId"        TEXT NOT NULL,
  "productId"     TEXT NOT NULL,
  "alertType"     "PriceAlertType" NOT NULL DEFAULT 'BELOW_PRICE',
  "targetPrice"   DOUBLE PRECISION,
  "isActive"      BOOLEAN NOT NULL DEFAULT true,
  "lastTriggered" TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PriceAlert_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PriceAlert_userId_productId_alertType_key"
  ON "PriceAlert"("userId","productId","alertType");
CREATE INDEX IF NOT EXISTS "PriceAlert_userId_idx" ON "PriceAlert"("userId");
CREATE INDEX IF NOT EXISTS "PriceAlert_productId_idx" ON "PriceAlert"("productId");
DO $$ BEGIN
  ALTER TABLE "PriceAlert" ADD CONSTRAINT "PriceAlert_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- NotificationPreference table (issue #64)
CREATE TABLE IF NOT EXISTS "NotificationPreference" (
  "id"                TEXT NOT NULL,
  "userId"            TEXT NOT NULL,
  "dealAlerts"        BOOLEAN NOT NULL DEFAULT true,
  "expiryReminders"   BOOLEAN NOT NULL DEFAULT true,
  "rebateReminders"   BOOLEAN NOT NULL DEFAULT true,
  "priceDropAlerts"   BOOLEAN NOT NULL DEFAULT true,
  "emailEnabled"      BOOLEAN NOT NULL DEFAULT false,
  "email"             TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationPreference_userId_key"
  ON "NotificationPreference"("userId");

-- Notification table (issue #64)
CREATE TABLE IF NOT EXISTS "Notification" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "type"      TEXT NOT NULL,
  "title"     TEXT NOT NULL,
  "body"      TEXT,
  "link"      TEXT,
  "isRead"    BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Notification_userId_isRead_idx" ON "Notification"("userId","isRead");
CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx" ON "Notification"("createdAt");
