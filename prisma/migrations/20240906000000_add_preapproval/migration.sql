-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'AWAITING_PREAPPROVAL';

-- CreateEnum
CREATE TYPE "PreapprovalStatus" AS ENUM ('PENDING','APPROVED','REJECTED');

-- CreateTable
CREATE TABLE "subproductconfigs" (
    "id" SERIAL NOT NULL,
    "product_code" TEXT NOT NULL,
    "sub_code" TEXT NOT NULL,
    "approval_required" BOOLEAN NOT NULL DEFAULT false,
    "approval_notes_default" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "subproductconfigs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "subproductconfigs_product_code_fkey" FOREIGN KEY ("product_code") REFERENCES "products"("code") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "subproductconfigs_product_code_sub_code_key" ON "subproductconfigs"("product_code", "sub_code");

-- CreateTable
CREATE TABLE "preapprovalrequests" (
    "id" SERIAL NOT NULL,
    "order_id" BIGINT NOT NULL,
    "status" "PreapprovalStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "sub_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "preapprovalrequests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "preapprovalrequests_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "preapprovalrequests_order_id_key" UNIQUE ("order_id")
);
