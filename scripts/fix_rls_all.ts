import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== FIX SUPABASE RLS SECURITY ===');
  
  // 1. Get all public tables
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public';
  `;

  console.log('Tables trouvées :', tables.map(t => t.tablename));

  // 2. Enable RLS on each table
  for (const { tablename } of tables) {
    console.log(`Activation RLS sur la table "${tablename}"...`);
    await prisma.$executeRawUnsafe(`ALTER TABLE public."${tablename}" ENABLE ROW LEVEL SECURITY;`);
  }

  console.log('=== SUCCÈS : RLS activé sur toutes les tables du schéma public ! ===');
}

main()
  .catch((e) => {
    console.error('Erreur lors de l\'activation RLS :', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
