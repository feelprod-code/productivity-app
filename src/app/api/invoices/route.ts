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

export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");
        if (!id) {
            return NextResponse.json({ error: "ID manquant" }, { status: 400 });
        }
        await prisma.invoice.delete({
            where: { id }
        });
        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("❌ [API Invoices] Erreur suppression :", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PUT(request: Request) {
    try {
        const body = await request.json();
        const { id, status, type } = body;
        if (!id) {
            return NextResponse.json({ error: "ID manquant" }, { status: 400 });
        }
        
        const data: any = {};
        if (status !== undefined) data.status = status;
        if (type !== undefined) data.type = type;

        const updated = await prisma.invoice.update({
            where: { id },
            data
        });
        return NextResponse.json({ success: true, invoice: updated });
    } catch (error: any) {
        console.error("❌ [API Invoices] Erreur mise à jour :", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
