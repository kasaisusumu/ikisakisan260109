import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get('keyword');
  
  // ★修正: 複数のパターンで環境変数を探しに行く（これで読み込み漏れを防ぎます）
  const APP_ID = process.env.RAKUTEN_APP_ID || 
                 process.env.NEXT_PUBLIC_RAKUTEN_APP_ID || 
                 process.env.RAKUTEN_APPLICATION_ID;

  // デバッグ用ログ
  if (!APP_ID) {
    console.error("❌ [API Error] Rakuten App ID not found in process.env");
    return NextResponse.json({ id: null, error: 'App ID missing' });
  }

  if (!keyword) {
    return NextResponse.json({ id: null, error: 'Keyword missing' });
  }

  const url = `https://app.rakuten.co.jp/services/api/Travel/KeywordHotelSearch/20170426?format=json&keyword=${encodeURIComponent(keyword)}&applicationId=${APP_ID}&hits=1`;

  try {
    const res = await fetch(url);
    const text = await res.text();

    if (!res.ok) {
      console.warn(`⚠️ [Rakuten API Error] Status: ${res.status}`, text);
      return NextResponse.json({ id: null });
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return NextResponse.json({ id: null });
    }
    
    if (data.hotels && data.hotels.length > 0 && data.hotels[0].hotel) {
      const hotelNo = data.hotels[0].hotel[0].hotelBasicInfo.hotelNo;
      console.log(`✅ ID Found: ${hotelNo} for ${keyword}`); // 成功ログ
      return NextResponse.json({ id: hotelNo });
    }
    
    return NextResponse.json({ id: null });

  } catch (error) {
    console.error("❌ [Server Error]", error);
    return NextResponse.json({ id: null });
  }
}