import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { transactionId, category } = body;

    if (!transactionId) {
      return NextResponse.json({ success: false, error: 'Paramètre transactionId manquant' }, { status: 400 });
    }

    const isPro = category !== 'PERSO';

    const updated = await prisma.transactionOverride.upsert({
      where: { id: String(transactionId) },
      update: { isPro, category },
      create: { id: String(transactionId), isPro, category },
    });

    console.log(`✅ Transaction Override saved: ID ${transactionId} is now isPro = ${isPro}, category = ${category}`);

    return NextResponse.json({ success: true, override: updated });
  } catch (error: any) {
    console.error('Error updating transaction category:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
