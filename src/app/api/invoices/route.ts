import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        const invoices = await prisma.invoice.findMany({
            orderBy: {
                date: "desc"
            }
        });
        return NextResponse.json({ success: true, invoices });
    } catch (error: any) {
        console.error("❌ [API Invoices] Erreur listing :", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
