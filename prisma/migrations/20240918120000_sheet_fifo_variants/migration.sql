-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "fifo_order" BIGINT NOT NULL,
ADD COLUMN     "max_usage" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "natural_key" TEXT NOT NULL,
ADD COLUMN     "used_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "variant_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "delivery_mode" "DeliveryMode",
ADD COLUMN     "idempotency_key" TEXT;

-- CreateTable
CREATE TABLE "product_variants" (
    "variant_id" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "duration_days" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("variant_id")
);

-- CreateTable
CREATE TABLE "thresholds" (
    "variant_id" UUID NOT NULL,
    "low_stock_units" INTEGER,
    "low_stock_capacity" INTEGER,

    CONSTRAINT "thresholds_pkey" PRIMARY KEY ("variant_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_code_key" ON "product_variants"("code");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_product_type_duration_days_key" ON "product_variants"("product", "type", "duration_days");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_natural_key_key" ON "accounts"("natural_key");

-- CreateIndex
CREATE INDEX "accounts_variant_id_status_idx" ON "accounts"("variant_id", "status");

-- CreateIndex
CREATE INDEX "accounts_status_idx" ON "accounts"("status");

-- CreateIndex
CREATE INDEX "accounts_fifo_order_idx" ON "accounts"("fifo_order");

-- CreateIndex
CREATE UNIQUE INDEX "orders_idempotency_key_key" ON "orders"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "events_idempotency_key_key" ON "events"("idempotency_key");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("variant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thresholds" ADD CONSTRAINT "thresholds_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("variant_id") ON DELETE CASCADE ON UPDATE CASCADE;

