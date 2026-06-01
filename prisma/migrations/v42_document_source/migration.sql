-- v0.42: 案件材料来源方（我方/对方/第三人，取自本案当事人）
ALTER TABLE "Document" ADD COLUMN "sourceParty" TEXT;
