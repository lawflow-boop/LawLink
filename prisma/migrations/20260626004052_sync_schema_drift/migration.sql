-- AlterTable
ALTER TABLE "Hearing" ADD COLUMN     "address" TEXT,
ADD COLUMN     "contact" TEXT;

-- CreateTable
CREATE TABLE "PreservationCase" (
    "id" TEXT NOT NULL,
    "matterId" TEXT,
    "type" "PreservationType" NOT NULL,
    "status" "PreservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "court" TEXT,
    "rulingNumber" TEXT,
    "guaranteeType" "GuaranteeType",
    "appliedAt" TIMESTAMP(3),
    "note" TEXT,
    "ownerId" TEXT,
    "remindDays" INTEGER[] DEFAULT ARRAY[30, 15, 7, 3, 1]::INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreservationCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreservationTarget" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreservationTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreservationProperty" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "propertyType" "PropertyType" NOT NULL,
    "propertyDetail" TEXT,
    "amount" DECIMAL(18,2),
    "startDate" TIMESTAMP(3) NOT NULL,
    "duration" INTEGER NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "status" "PreservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreservationProperty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreservationPropertyRenewal" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "renewedAt" TIMESTAMP(3) NOT NULL,
    "oldExpiryDate" TIMESTAMP(3) NOT NULL,
    "newExpiryDate" TIMESTAMP(3) NOT NULL,
    "renewalDuration" INTEGER NOT NULL,
    "note" TEXT,
    "performedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PreservationPropertyRenewal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PreservationCase_matterId_idx" ON "PreservationCase"("matterId");

-- CreateIndex
CREATE INDEX "PreservationCase_status_idx" ON "PreservationCase"("status");

-- CreateIndex
CREATE INDEX "PreservationTarget_caseId_idx" ON "PreservationTarget"("caseId");

-- CreateIndex
CREATE INDEX "PreservationProperty_targetId_idx" ON "PreservationProperty"("targetId");

-- CreateIndex
CREATE INDEX "PreservationProperty_status_expiryDate_idx" ON "PreservationProperty"("status", "expiryDate");

-- CreateIndex
CREATE INDEX "PreservationPropertyRenewal_propertyId_idx" ON "PreservationPropertyRenewal"("propertyId");

-- AddForeignKey
ALTER TABLE "PreservationCase" ADD CONSTRAINT "PreservationCase_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreservationCase" ADD CONSTRAINT "PreservationCase_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreservationTarget" ADD CONSTRAINT "PreservationTarget_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "PreservationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreservationProperty" ADD CONSTRAINT "PreservationProperty_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "PreservationTarget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreservationPropertyRenewal" ADD CONSTRAINT "PreservationPropertyRenewal_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "PreservationProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreservationPropertyRenewal" ADD CONSTRAINT "PreservationPropertyRenewal_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
