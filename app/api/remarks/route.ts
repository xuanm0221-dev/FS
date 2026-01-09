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

// 비고 저장/수정
export async function POST(request: NextRequest) {
  try {
    const { account, remark, type } = await request.json();
    
    if (!account || !type) {
      return NextResponse.json({ 
        success: false,
        error: 'account와 type이 필요합니다.' 
      }, { status: 400 });
    }
    
    const key = `remarks:${type}`;
    
    // 기존 비고 데이터 가져오기
    const existingRemarks = ((await kv.get(key)) as { [key: string]: string } | null) || {};
    
    // 비고 업데이트
    const updatedRemarks = {
      ...existingRemarks,
      [account]: remark || '' // 빈 문자열도 저장 (삭제용)
    };
    
    // 저장
    await kv.set(key, updatedRemarks);
    
    return NextResponse.json({ 
      success: true
    });
  } catch (error) {
    console.error('비고 저장 에러:', error);
    return NextResponse.json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
