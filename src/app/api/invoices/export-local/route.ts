import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import https from 'https';

import { prisma } from "@/lib/prisma";

function downloadFile(url: string, dest: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`Echec du téléchargement ${url}: Code ${res.statusCode}`));
                return;
            }
            const fileStream = fs.createWriteStream(dest);
            res.pipe(fileStream);
            fileStream.on('finish', () => {
                fileStream.close();
                resolve(true);
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => { });
            reject(err);
        });
    });
}

function getFormattedMonth(date: Date) {
    const months = ['01_Janvier', '02_Fevrier', '03_Mars', '04_Avril', '05_Mai', '06_Juin', '07_Juillet', '08_Aout', '09_Septembre', '10_Octobre', '11_Novembre', '12_Decembre'];
    return months[date.getMonth()];
}

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));
        const { startDate, endDate, folderName = 'Factures_Export_Auto' } = body;

        const EXPORT_DIR = path.join(process.env.HOME || '', 'Desktop', folderName);
        if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });

        const invoices = await prisma.invoice.findMany({
            orderBy: { date: 'asc' }
        });

        let filteredInvoices = invoices;
        if (startDate && endDate) {
            const start = new Date(startDate).getTime();
            const end = new Date(endDate).getTime();
            filteredInvoices = invoices.filter(inv => {
                const t = new Date(inv.date).getTime();
                return t >= start && t <= end;
            });
        }

        let countNew = 0;
        for (const inv of filteredInvoices) {
            if (!inv.fileUrl || !inv.fileUrl.startsWith('http')) continue;

            const d = new Date(inv.date);
            const yearStr = d.getFullYear().toString();
            const monthStr = getFormattedMonth(d);

            const dirPath = path.join(EXPORT_DIR, yearStr, monthStr);
            if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });

            const dateStr = d.toISOString().split('T')[0];
            const cleanProvider = inv.provider.replace(/[^a-zA-Z0-9éèàçê\-]/g, '_').replace(/_+/g, '_').substring(0, 50);
            const amountStr = inv.amount !== null ? `${inv.amount}€` : '0€';
            const fileName = `${dateStr} - ${cleanProvider} - ${amountStr}.pdf`;
            const filePath = path.join(dirPath, fileName);

            if (fs.existsSync(filePath)) {
                continue;
            }

            if (inv.fileUrl.endsWith('.pdf') || inv.fileUrl.includes('pdf')) {
                await downloadFile(inv.fileUrl, filePath);
                countNew++;
            }
        }

        return NextResponse.json({ success: true, newCount: countNew, exportDir: EXPORT_DIR });
    } catch (error: any) {
        console.error('Export API Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    } finally {
        await prisma.$disconnect();
    }
}
