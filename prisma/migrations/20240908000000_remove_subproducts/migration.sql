DROP TABLE IF EXISTS "subproductconfigs";

ALTER TABLE "accounts"
  DROP COLUMN IF EXISTS "password_enc",
  DROP COLUMN IF EXISTS "otp_secret_enc",
  DROP COLUMN IF EXISTS "otp_seed",
  DROP COLUMN IF EXISTS "invite_api",
  DROP COLUMN IF EXISTS "variant_type",
  DROP COLUMN IF EXISTS "variant_duration",
  DROP COLUMN IF EXISTS "price_override",
  DROP COLUMN IF EXISTS "tnc",
  DROP COLUMN IF EXISTS "max_uses",
  DROP COLUMN IF EXISTS "current_uses",
  ADD COLUMN "account_group_id" TEXT,
  ADD COLUMN "profile_index" INTEGER,
  ADD COLUMN "profile_name" TEXT,
  ADD COLUMN "password" TEXT,
  ADD COLUMN "invite_channel" TEXT,
  ADD COLUMN "tnc_blob" TEXT,
  ADD COLUMN "notes" TEXT,
  ALTER COLUMN "username" DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS "product_code_username";

ALTER TABLE "orders"
  DROP COLUMN IF EXISTS "sub_code",
  ADD COLUMN "metadata" JSONB;

ALTER TABLE "preapprovalrequests"
  DROP COLUMN IF EXISTS "sub_code";

ALTER TABLE "stockalerts"
  DROP COLUMN IF EXISTS "sub_code";
ALTER TABLE "stockalerts" ADD CONSTRAINT "stockalerts_product_code_key" UNIQUE ("product_code");
