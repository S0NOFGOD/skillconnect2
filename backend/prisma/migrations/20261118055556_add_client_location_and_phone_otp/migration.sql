-- AlterTable
ALTER TABLE "Worker" ADD COLUMN     "phoneOtpCooldownUntil" TIMESTAMP(3),
ADD COLUMN     "phoneOtpExpires" TIMESTAMP(3),
ADD COLUMN     "phoneOtpHash" TEXT,
ADD COLUMN     "phoneOtpResendCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Client_latitude_longitude_idx" ON "Client"("latitude", "longitude");
