import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function HEAD() {
  return new Response(null, { status: 200 });
}
