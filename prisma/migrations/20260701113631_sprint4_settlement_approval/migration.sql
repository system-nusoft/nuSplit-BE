-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('PENDING', 'CONFIRMED');

-- AlterTable
ALTER TABLE "Settlement" ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "status" "SettlementStatus" NOT NULL DEFAULT 'PENDING';
