import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

// 비고 조회
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type'); // 'bs' or 'wc'
    
    if (!type) {
      return NextResponse.json({ error: 'type 파라미터가 필요합니다.' }, { status: 400 });
    }
    
    const key = `remarks:${type}`;
    const remarks = (await kv.get(key)) as { [key: string]: string } | null;
    
    return NextResponse.json({ 
      remarks: remarks || {} 
    });
  } catch (error) {
    console.error('비고 조회 에러:', error);
    return NextResponse.json({ 
      remarks: {},
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// 비고 저장/수정 (reset, 일괄 저장, 단건 merge)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { account, remark, type, reset, remarks: remarksPayload } = body as {
      account?: string;
      remark?: string;
      type?: string;
      reset?: boolean;
      remarks?: { [account: string]: string };
    };

    if (!type || (type !== 'bs' && type !== 'wc')) {
      return NextResponse.json({
        success: false,
        error: 'type은 bs 또는 wc여야 합니다.',
      }, { status: 400 });
    }

    const key = `remarks:${type}`;

    // 초기화: KV를 빈 객체로 설정
    if (reset === true) {
      await kv.set(key, {});
      return NextResponse.json({ success: true });
    }

    // 일괄 저장: remarks 객체로 전체 교체
    if (remarksPayload != null && typeof remarksPayload === 'object') {
      const normalized: { [k: string]: string } = {};
      for (const [k, v] of Object.entries(remarksPayload)) {
        if (typeof v === 'string') normalized[k] = v;
      }
      await kv.set(key, normalized);
      return NextResponse.json({ success: true });
    }

    // 기존: 단건 merge (account + remark 필수)
    if (!account) {
      return NextResponse.json({
        success: false,
        error: 'account가 필요합니다.',
      }, { status: 400 });
    }

    const existingRemarks = ((await kv.get(key)) as { [key: string]: string } | null) || {};
    const updatedRemarks = {
      ...existingRemarks,
      [account]: (remark ?? '') as string,
    };
    await kv.set(key, updatedRemarks);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('비고 저장 에러:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
