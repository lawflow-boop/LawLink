-- CreateEnum
CREATE TYPE "ClientCooperationStatus" AS ENUM ('POTENTIAL', 'NEGOTIATING', 'SIGNED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "ClientGender" AS ENUM ('MALE', 'FEMALE');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "cooperationStatus" "ClientCooperationStatus" NOT NULL DEFAULT 'SIGNED',
ADD COLUMN     "ethnicity" TEXT,
ADD COLUMN     "gender" "ClientGender",
ADD COLUMN     "industry" TEXT,
ADD COLUMN     "internalCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Client_internalCode_key" ON "Client"("internalCode");

