import { NextResponse } from 'next/server';
import { getCopilotStatus } from '@/lib/copilotState';

export const dynamic = 'force-dynamic';

export async function GET() {
  const status = getCopilotStatus();
  return NextResponse.json(status);
}
