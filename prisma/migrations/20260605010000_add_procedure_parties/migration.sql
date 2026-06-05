-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LitigationStanding" ADD VALUE 'JOINT_PLAINTIFF';
ALTER TYPE "LitigationStanding" ADD VALUE 'JOINT_DEFENDANT';

-- CreateTable
CREATE TABLE "procedure_parties" (
    "id" TEXT NOT NULL,
    "procedureId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "standing" "LitigationStanding" NOT NULL,
    "ordinal" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "procedure_parties_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "procedure_parties_procedureId_standing_ordinal_idx" ON "procedure_parties"("procedureId", "standing", "ordinal");

-- CreateIndex
CREATE INDEX "procedure_parties_partyId_idx" ON "procedure_parties"("partyId");

-- CreateIndex
CREATE UNIQUE INDEX "procedure_parties_procedureId_partyId_standing_key" ON "procedure_parties"("procedureId", "partyId", "standing");

-- AddForeignKey
ALTER TABLE "procedure_parties" ADD CONSTRAINT "procedure_parties_procedureId_fkey" FOREIGN KEY ("procedureId") REFERENCES "MatterProcedure"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedure_parties" ADD CONSTRAINT "procedure_parties_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;
