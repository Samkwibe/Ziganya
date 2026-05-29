import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('Password123!', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@ziganya.app' },
    update: {},
    create: {
      fullName: 'Grace Admin',
      email: 'admin@ziganya.app',
      phoneNumber: '+15125550100',
      passwordHash,
      role: 'admin',
      status: 'active',
      countryCode: 'US',
      language: 'en',
    },
  });

  const member = await prisma.user.upsert({
    where: { email: 'amani@example.com' },
    update: {},
    create: {
      fullName: 'Amani Niyonsaba',
      email: 'amani@example.com',
      phoneNumber: '+15125550142',
      passwordHash,
      role: 'member',
      status: 'active',
      countryCode: 'US',
      language: 'en',
      healthScore: 82,
      churnRisk: 'low',
      autoPayEnabled: true,
    },
  });

  console.log('Seeded users:', { admin: admin.email, member: member.email });
  console.log('Default password for both: Password123!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
