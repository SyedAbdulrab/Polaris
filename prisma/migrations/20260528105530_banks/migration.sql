-- CreateEnum
CREATE TYPE "AccountKind" AS ENUM ('CHECKING', 'SAVINGS', 'CASH', 'CREDIT_CARD', 'INVESTMENT', 'LOAN', 'OTHER');

-- CreateEnum
CREATE TYPE "TransactionKind" AS ENUM ('INFLOW', 'OUTFLOW', 'TRANSFER', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "AccountKind" NOT NULL,
    "currency" VARCHAR(8) NOT NULL,
    "institution" TEXT,
    "openingBalance" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "openingDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "kind" "TransactionKind" NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "sourceIncomeId" TEXT,
    "sourceExpenseId" TEXT,
    "transferToAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "accounts_userId_idx" ON "accounts"("userId");

-- CreateIndex
CREATE INDEX "accounts_userId_isActive_idx" ON "accounts"("userId", "isActive");

-- CreateIndex
CREATE INDEX "transactions_userId_date_idx" ON "transactions"("userId", "date");

-- CreateIndex
CREATE INDEX "transactions_accountId_date_idx" ON "transactions"("accountId", "date");

-- CreateIndex
CREATE INDEX "transactions_userId_sourceIncomeId_idx" ON "transactions"("userId", "sourceIncomeId");

-- CreateIndex
CREATE INDEX "transactions_userId_sourceExpenseId_idx" ON "transactions"("userId", "sourceExpenseId");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_sourceIncomeId_fkey" FOREIGN KEY ("sourceIncomeId") REFERENCES "income_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_sourceExpenseId_fkey" FOREIGN KEY ("sourceExpenseId") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_transferToAccountId_fkey" FOREIGN KEY ("transferToAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
