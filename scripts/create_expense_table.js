const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createExpenseTable() {
    try {
        console.log("Creating Expense table directly with SQL...");
        await prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS "Expense" (
                "id" TEXT NOT NULL,
                "provider" TEXT NOT NULL,
                "amount" DOUBLE PRECISION,
                "currency" TEXT NOT NULL DEFAULT 'USD',
                "date" TIMESTAMP(3) NOT NULL,
                "fileUrl" TEXT,
                "status" TEXT NOT NULL DEFAULT 'PAID',
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
            );
        `);
        console.log("Table Expense created successfully.");
    } catch (e) {
        console.error("Error creating table:", e);
    } finally {
        await prisma.$disconnect();
    }
}
createExpenseTable();
