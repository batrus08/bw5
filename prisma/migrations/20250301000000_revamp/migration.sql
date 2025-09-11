-- Migration for variant revamp and OTP policy
-- Note: this is a simplified migration script.

-- 1. New tables
CREATE TABLE terms (
  key TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body_md TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE qris_assets (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  image_url TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true
);

-- 2. Restructure product_variants
ALTER TABLE product_variants
  ADD COLUMN product_id TEXT,
  ADD COLUMN title TEXT,
  ADD COLUMN price_cents INTEGER,
  ADD COLUMN delivery_mode "DeliveryMode" NOT NULL DEFAULT 'USERPASS',
  ADD COLUMN requires_email BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN otp_policy "OtpPolicy" NOT NULL DEFAULT 'NONE',
  ADD COLUMN tnc_key TEXT,
  ADD COLUMN qris_key TEXT,
  ADD COLUMN stock_cached INTEGER,
  DROP COLUMN product,
  DROP COLUMN type,
  ADD CONSTRAINT product_variants_product_fk FOREIGN KEY (product_id) REFERENCES products(code) ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Extend accounts
ALTER TABLE accounts
  ADD COLUMN profile_pin TEXT,
  ADD COLUMN totp_secret TEXT;

-- 4. Extend orders
ALTER TABLE orders
  ADD COLUMN variant_id TEXT,
  ADD COLUMN qris_key TEXT,
  ADD COLUMN email_for_invite TEXT,
  ADD COLUMN delivery_payload_json JSONB,
  ADD CONSTRAINT orders_variant_fk FOREIGN KEY (variant_id) REFERENCES product_variants(variant_id) ON DELETE SET NULL ON UPDATE CASCADE;
