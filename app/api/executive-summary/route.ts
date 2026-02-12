import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@vercel/kv';
import { ExecutiveSummaryData } from '@/lib/types';

const RIGHT_SECTION_KEYS = ['주요성과', '핵심분석', '핵심인사이트', '핵심이슈권고사항', '결론'] as const;

/** KV에 예전 스키마로 저장된 경우 우측 5개 섹션을 빈 배열로 채워 Vercel에서 우측 분석이 비어 보이지 않게 함 */
function normalizeStoredSummary(stored: ExecutiveSummaryData | null): ExecutiveSummaryData | null {
  if (!stored?.sections || !stored.title) return stored;
  const sections = { ...stored.sections };
  let changed = false;
  for (const key of RIGHT_SECTION_KEYS) {
    if (!Array.isArray(sections[key])) {
      (sections as Record<string, string[]>)[key] = [];
      changed = true;
    }
  }
  return changed ? { ...stored, sections } : stored;
}

// KV에 저장된 값만 반환. 비어 있으면 null → 프론트에서 /api/fs/summary(2026년 기말) 사용
export async function GET() {
  try {
    const stored = (await kv.get('executive-summary')) as ExecutiveSummaryData | null;
    const requirePassword = process.env.VERCEL === '1';
    const data = normalizeStoredSummary(stored ?? null);
    return NextResponse.json({
      data: data ?? null,
      requirePassword,
    });
  } catch (error) {
    console.error('executive-summary GET error:', error);
    return NextResponse.json({
      data: null,
      requirePassword: process.env.VERCEL === '1',
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as { password?: string; data?: ExecutiveSummaryData };
    const requirePassword = process.env.VERCEL === '1';
    if (requirePassword && body.password !== '1234') {
      return NextResponse.json(
        { error: '비밀번호가 올바르지 않습니다.' },
        { status: 401 }
      );
    }
    if (body.data) {
      await kv.set('executive-summary', body.data);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('executive-summary POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
