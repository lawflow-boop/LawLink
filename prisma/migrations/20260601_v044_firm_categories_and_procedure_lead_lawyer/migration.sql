-- AlterEnum
ALTER TYPE "FirmFileCategory" ADD VALUE 'CONTRACT';
ALTER TYPE "FirmFileCategory" ADD VALUE 'LETTER';
ALTER TYPE "FirmFileCategory" ADD VALUE 'LICENSE';
ALTER TYPE "FirmFileCategory" ADD VALUE 'OTHER_FIRM';

-- AlterTable
ALTER TABLE "MatterProcedure" ADD COLUMN "isExternalLead" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MatterProcedure" ADD COLUMN "leadLawyerId" TEXT;

-- AddForeignKey
ALTER TABLE "MatterProcedure" ADD CONSTRAINT "MatterProcedure_leadLawyerId_fkey" FOREIGN KEY ("leadLawyerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
