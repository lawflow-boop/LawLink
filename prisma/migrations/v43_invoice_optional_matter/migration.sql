-- v0.43 项5：开票申请支持「无关联案件」
-- matterId 改为可空（无关联时为 NULL），新增 noMatterReason 说明原因。
ALTER TABLE "InvoiceRequest" ALTER COLUMN "matterId" DROP NOT NULL;
ALTER TABLE "InvoiceRequest" ADD COLUMN "noMatterReason" TEXT;
