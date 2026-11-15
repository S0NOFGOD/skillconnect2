/*
  Warnings:

  - Added the required column `description` to the `Service` table without a default value. This is not possible if the table is not empty.
  - Added the required column `experience` to the `Service` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "adminResponse" TEXT NOT NULL DEFAULT 'It may take up to 24 hours for admin update',
ADD COLUMN     "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "description" TEXT NOT NULL,
ADD COLUMN     "experience" TEXT NOT NULL,
ADD COLUMN     "portfolio" TEXT[],
ALTER COLUMN "adminApproval" SET DEFAULT 'Under Review';

-- AlterTable
ALTER TABLE "Worker" ADD COLUMN     "profileVerificationExpires" TIMESTAMP(3);
