-- CreateEnum
CREATE TYPE "SubscriptionPlatform" AS ENUM ('STRIPE', 'REVENUECAT');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isPremium" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stripeCustomerId" TEXT,
ADD COLUMN     "stripeSubscriptionId" TEXT,
ADD COLUMN     "subscriptionCurrentPeriodEnd" TIMESTAMP(3),
ADD COLUMN     "subscriptionPlatform" "SubscriptionPlatform",
ADD COLUMN     "subscriptionStatus" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeSubscriptionId_key" ON "User"("stripeSubscriptionId");
