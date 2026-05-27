-- AlterTable
ALTER TABLE "Party" ADD COLUMN "enterpriseId" TEXT;
ALTER TABLE "Party" ADD COLUMN "enterpriseSocialCode" TEXT;
ALTER TABLE "Party" ADD COLUMN "enterpriseName" TEXT;
ALTER TABLE "Party" ADD COLUMN "enterpriseBoundAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Party_enterpriseSocialCode_idx" ON "Party"("enterpriseSocialCode");
