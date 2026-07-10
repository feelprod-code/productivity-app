import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

function getPdfCount(dir: string): number {
  let count = 0;
  if (!fs.existsSync(dir)) return 0;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        count += getPdfCount(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf') && !entry.name.toUpperCase().includes('REJETE')) {
        count++;
      }
    }
  } catch (e) {
    console.error('Error scanning dir for count:', dir, e);
  }
  return count;
}

export async function GET() {
  const baseDir = '/Users/guillaumephilippe/Documents/1-PAPIERS/1-PAPIERS PHIL/4-Compta';
  const count2025 = getPdfCount(path.join(baseDir, 'Factures 2025'));
  const count2026 = getPdfCount(path.join(baseDir, 'Factures 2026'));
  const total = count2025 + count2026;
  
  return NextResponse.json({
    success: true,
    count2025,
    count2026,
    total
  });
}
