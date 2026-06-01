-- v0.42: 增值税专用发票购方"六要素"补全
-- 法律依据：《国家税务总局关于增值税专用发票使用与管理有关问题的通知》第一条
-- （开具增值税专用发票必须填写购销双方的开户银行、账号和电话号码）+ 购方地址
ALTER TABLE "InvoiceRequest" ADD COLUMN "buyerAddress" TEXT;
ALTER TABLE "InvoiceRequest" ADD COLUMN "buyerPhone" TEXT;
ALTER TABLE "InvoiceRequest" ADD COLUMN "buyerBank" TEXT;
ALTER TABLE "InvoiceRequest" ADD COLUMN "buyerBankAccount" TEXT;
