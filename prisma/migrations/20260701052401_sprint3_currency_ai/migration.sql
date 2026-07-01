-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "amountInBase" DECIMAL(12,2),
ADD COLUMN     "exchangeRate" DECIMAL(12,6);

-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "baseCurrency" TEXT NOT NULL DEFAULT 'USD';
