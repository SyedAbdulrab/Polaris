/* eslint-disable no-console */
import { Frequency, IncomeType, PrismaClient, StreakType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = 'demo@polaris.local';
  const passwordHash = await bcrypt.hash('demo-password-123', 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash,
      name: 'Polaris Demo',
    },
  });

  await prisma.incomeSource.createMany({
    data: [
      {
        userId: user.id,
        name: 'Day-job salary',
        type: IncomeType.SALARY,
        amount: '5000.00',
        frequency: Frequency.MONTHLY,
        startDate: new Date('2025-01-01'),
      },
      {
        userId: user.id,
        name: 'Freelance commissions',
        type: IncomeType.COMMISSION,
        amount: '1200.00',
        frequency: Frequency.MONTHLY,
        startDate: new Date('2025-03-01'),
      },
    ],
    skipDuplicates: true,
  });

  await prisma.expense.createMany({
    data: [
      {
        userId: user.id,
        name: 'Rent',
        category: 'housing',
        amount: '1800.00',
        frequency: Frequency.MONTHLY,
        startDate: new Date('2025-01-01'),
      },
      {
        userId: user.id,
        name: 'Groceries',
        category: 'food',
        amount: '120.00',
        frequency: Frequency.WEEKLY,
        startDate: new Date('2025-01-01'),
      },
    ],
    skipDuplicates: true,
  });

  await prisma.streak.createMany({
    data: [
      {
        userId: user.id,
        name: 'No nicotine',
        type: StreakType.POSITIVE,
        currentCount: 14,
        longestCount: 21,
      },
      {
        userId: user.id,
        name: 'Daily walk',
        type: StreakType.POSITIVE,
        currentCount: 5,
        longestCount: 30,
      },
    ],
    skipDuplicates: true,
  });

  console.log(`Seeded user ${user.email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
