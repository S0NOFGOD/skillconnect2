/*
  Warnings:

  - A unique constraint covering the columns `[email]` on the table `Worker` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[googleId]` on the table `Worker` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `email` to the `Worker` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Worker" ADD COLUMN     "accountType" TEXT NOT NULL DEFAULT 'password',
ADD COLUMN     "email" TEXT NOT NULL,
ADD COLUMN     "emailOtpCooldownUntil" TIMESTAMP(3),
ADD COLUMN     "emailOtpExpires" TIMESTAMP(3),
ADD COLUMN     "emailOtpHash" TEXT,
ADD COLUMN     "emailOtpResendCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "googleId" TEXT,
ADD COLUMN     "passwordHash" TEXT,
ADD COLUMN     "passwordResetOtpCooldownUntil" TIMESTAMP(3),
ADD COLUMN     "passwordResetOtpExpires" TIMESTAMP(3),
ADD COLUMN     "passwordResetOtpHash" TEXT,
ADD COLUMN     "passwordResetOtpResendCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "passwordResetOtpVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "profileCompleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "refreshTokenHash" TEXT,
ALTER COLUMN "fullName" DROP NOT NULL,
ALTER COLUMN "latitude" DROP NOT NULL,
ALTER COLUMN "longitude" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Worker_email_key" ON "Worker"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Worker_googleId_key" ON "Worker"("googleId");
