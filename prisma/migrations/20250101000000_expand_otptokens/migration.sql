-- CreateEnum
CREATE TYPE "OtpType" AS ENUM ('MANUAL_AFTER_DELIVERY','TOTP_SINGLE_USE');

-- AlterTable
ALTER TABLE "otptokens" ADD COLUMN "type" "OtpType" NOT NULL DEFAULT 'MANUAL_AFTER_DELIVERY';
ALTER TABLE "otptokens" ADD COLUMN "code_hash" TEXT;
ALTER TABLE "otptokens" ADD COLUMN "used_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "otptokens" ADD COLUMN "one_time_limit" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "otptokens" ALTER COLUMN "id" TYPE TEXT;

-- Drop default after data migration
ALTER TABLE "otptokens" ALTER COLUMN "type" DROP DEFAULT;
