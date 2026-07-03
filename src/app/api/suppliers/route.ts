import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { encrypt, decrypt } from '@/lib/encryption';

// Default list of suppliers to seed when database is empty
const DEFAULT_SUPPLIERS = [
  { name: 'Impôts (Particulier/Pro)', loginUrl: 'https://www.impots.gouv.fr', notes: 'Accès espace professionnel et personnel' },
  { name: 'URSSAF', loginUrl: 'https://www.urssaf.fr', notes: 'Déclarations et cotisations sociales' },
  { name: 'CARPIMKO', loginUrl: 'https://www.carpimko.com', notes: 'Retraite et prévoyance' },
  { name: 'MACSF', loginUrl: 'https://www.macsf.fr', notes: 'Assurances professionnelles (ex: Tiguan, RCP)' },
  { name: 'Avia (Essence & Carburant)', loginUrl: 'https://www.carte-carburant-avia.fr', notes: 'Suivi des dépenses de carburant et essence' },
  { name: 'Vercel', loginUrl: 'https://vercel.com/login', notes: 'Hébergement frontend et serveurs' },
  { name: 'Supabase', loginUrl: 'https://supabase.com/dashboard', notes: 'Base de données PostgreSQL et backend' },
  { name: 'Cloudflare', loginUrl: 'https://dash.cloudflare.com', notes: 'DNS, CDN et sécurité réseau' },
  { name: 'Pennylane', loginUrl: 'https://app.pennylane.com', notes: 'Comptabilité et facturation' },
];

export async function GET() {
  try {
    let suppliers = await prisma.supplierCredential.findMany({
      orderBy: { name: 'asc' },
    });

    // Auto-seed if empty
    if (suppliers.length === 0) {
      await Promise.all(
        DEFAULT_SUPPLIERS.map((s) =>
          prisma.supplierCredential.create({
            data: {
              name: s.name,
              loginUrl: s.loginUrl,
              email: 'guillaume@feelprod.com', // Pre-fill default email
              notes: s.notes,
            },
          })
        )
      );

      suppliers = await prisma.supplierCredential.findMany({
        orderBy: { name: 'asc' },
      });
    }

    const decryptedSuppliers = suppliers.map(s => ({
      ...s,
      password: decrypt(s.password)
    }));

    return NextResponse.json({ suppliers: decryptedSuppliers });
  } catch (error: any) {
    console.error('Error fetching suppliers:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch suppliers' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, loginUrl, email, username, password, monthlyCharge, currency, notes } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const supplier = await prisma.supplierCredential.create({
      data: {
        name,
        loginUrl,
        email,
        username,
        password: encrypt(password),
        monthlyCharge: monthlyCharge ? parseFloat(monthlyCharge) : null,
        currency: currency || 'EUR',
        notes,
      },
    });

    const decryptedSupplier = {
      ...supplier,
      password: decrypt(supplier.password)
    };

    return NextResponse.json({ supplier: decryptedSupplier });
  } catch (error: any) {
    console.error('Error creating supplier:', error);
    return NextResponse.json({ error: error.message || 'Failed to create supplier' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, name, loginUrl, email, username, password, monthlyCharge, currency, notes } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    const supplier = await prisma.supplierCredential.update({
      where: { id },
      data: {
        name,
        loginUrl,
        email,
        username,
        password: password !== undefined ? encrypt(password) : undefined,
        monthlyCharge: monthlyCharge !== undefined ? (monthlyCharge ? parseFloat(monthlyCharge) : null) : undefined,
        currency,
        notes,
      },
    });

    const decryptedSupplier = {
      ...supplier,
      password: decrypt(supplier.password)
    };

    return NextResponse.json({ supplier: decryptedSupplier });
  } catch (error: any) {
    console.error('Error updating supplier:', error);
    return NextResponse.json({ error: error.message || 'Failed to update supplier' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    await prisma.supplierCredential.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting supplier:', error);
    return NextResponse.json({ error: error.message || 'Failed to delete supplier' }, { status: 500 });
  }
}
