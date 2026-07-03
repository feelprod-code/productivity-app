import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { transactionId, isPro } = body;

    if (!transactionId || typeof isPro !== 'boolean') {
      return NextResponse.json({ success: false, error: 'Paramètres invalides' }, { status: 400 });
    }

    const updated = await prisma.transactionOverride.upsert({
      where: { id: String(transactionId) },
      update: { isPro },
      create: { id: String(transactionId), isPro },
    });

    console.log(`✅ Transaction Override saved: ID ${transactionId} is now isPro = ${isPro}`);

    return NextResponse.json({ success: true, override: updated });
  } catch (error: any) {
    console.error('Error toggling transaction type:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
