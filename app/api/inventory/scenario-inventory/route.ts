import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';

// 이 라우트는 "기본값(git에 커밋된 시나리오 재고)"만 서빙한다.
// 재고자산(sim)의 "재계산/저장" 결과는 서버에 쓰지 않고 브라우저 메모리(app/page.tsx state)에만 올린다.
// → 사용자별 시뮬레이션 격리, 다른 PC 영향 0, F5/탭 닫기 시 자동 복귀.
const JSON_PATH = path.join(process.cwd(), '보조파일(simu)', 'scenario_inventory_closing.json');

export async function GET() {
  try {
    if (!fs.existsSync(JSON_PATH)) {
      return NextResponse.json({ error: '시나리오 재고 데이터 없음. 재고자산(sim) 탭에서 재계산 버튼을 눌러주세요.' }, { status: 404 });
    }
    const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'));
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `읽기 실패: ${msg}` }, { status: 500 });
  }
}
