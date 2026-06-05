-- CreateEnum
CREATE TYPE "ExternalContactStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "ExternalContact" ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "status" "ExternalContactStatus" NOT NULL DEFAULT 'APPROVED';

-- CreateIndex
CREATE INDEX "ExternalContact_status_archivedAt_createdAt_idx" ON "ExternalContact"("status", "archivedAt", "createdAt");

-- CreateIndex
CREATE INDEX "ExternalContact_reviewedById_idx" ON "ExternalContact"("reviewedById");

-- AddForeignKey
ALTER TABLE "ExternalContact" ADD CONSTRAINT "ExternalContact_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
