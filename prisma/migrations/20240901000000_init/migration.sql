-- CreateEnum
CREATE TYPE "DeliveryMode" AS ENUM ('USERPASS','INVITE_EMAIL','CANVA_INVITE');

-- CreateEnum
CREATE TYPE "OtpPolicy" AS ENUM ('NONE','MANUAL_AFTER_DELIVERY','TOTP_SINGLE_USE');

-- CreateTable
CREATE TABLE "products" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "approval_required" BOOLEAN NOT NULL DEFAULT false,
    "default_tnc_key" TEXT,
    "default_qris_key" TEXT,
    "default_mode" "DeliveryMode",
    "default_requires_email" BOOLEAN NOT NULL DEFAULT false,
    "default_otp_policy" "OtpPolicy" NOT NULL DEFAULT 'NONE',
    "sorting_index" INTEGER DEFAULT 10,
    "category" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "daily_limit" INTEGER,
    "sk_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "products_pkey" PRIMARY KEY ("code")
);
