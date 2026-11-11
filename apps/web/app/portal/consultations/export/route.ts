import { NextResponse, type NextRequest } from 'next/server';
import { applyFilters, consultationsCsv, readFilters } from '@/lib/consultations';
import { getData, now } from '@/lib/data';
import { resolvePeriod } from '@/lib/period';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getSession();
  if (!user?.clientId) return new NextResponse('Not signed in', { status: 401 });

  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const period = resolvePeriod(params, now());
  const rows = applyFilters(await getData().clientConsultations(user.clientId, period.from, period.to), readFilters(params));
  // TODO(audit): record the export in public.audit_log once the Supabase data source is connected.

  return new NextResponse(consultationsCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="hc247-consultations-${period.from}-to-${period.to}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
