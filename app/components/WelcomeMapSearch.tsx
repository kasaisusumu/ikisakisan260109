"use client";

import React, { useState, useRef, useEffect } from 'react';
import mapboxgl from 'mapbox-gl';
// @ts-ignore
import 'mapbox-gl/dist/mapbox-gl.css';
import { X, PenTool, Loader2, ExternalLink, ArrowLeft, MapPin } from 'lucide-react';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// 距離計算関数
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
};

interface Props {
  onBack: () => void;
}

export default function WelcomeMapSearch({ onBack }: Props) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const hotelMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const tempDrawCoords = useRef<number[][]>([]);

  const [isDrawing, setIsDrawing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hotels, setHotels] = useState<any[]>([]);

  // ▼▼▼ ここから追加：検索日を完全に固定・同期するState ▼▼▼
  const [searchDates, setSearchDates] = useState<{
      checkinStr: string;
      checkoutStr: string;
      y1: number; m1: number; d1: number;
      y2: number; m2: number; d2: number;
  } | null>(null);

  

  useEffect(() => {
      const today = new Date();
      today.setDate(today.getDate() + 30);
      const y1 = today.getFullYear();
      const m1 = today.getMonth() + 1;
      const d1 = today.getDate();
      
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const y2 = tomorrow.getFullYear();
      const m2 = tomorrow.getMonth() + 1;
      const d2 = tomorrow.getDate();

      setSearchDates({
          checkinStr: today.toISOString().split('T')[0],
          checkoutStr: tomorrow.toISOString().split('T')[0],
          y1, m1, d1,
          y2, m2, d2
      });
  }, []);
  // ▲▲▲ ここまで追加 ▲▲▲

  // 初期化
  useEffect(() => {
    if (!mapContainer.current) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;
    
    // 日本の中心あたりを初期表示
    map.current = new mapboxgl.Map({
        container: mapContainer.current, 
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [135.758767, 34.985120], // 京都周辺
        zoom: 12
    });

    map.current.on('load', () => {
        if (!map.current) return;
        map.current.addSource('draw-source', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } } });
        map.current.addLayer({ id: 'draw-line', type: 'line', source: 'draw-source', paint: { 'line-color': '#EF4444', 'line-width': 4, 'line-opacity': 0.8 } });
    });

    return () => { map.current?.remove(); };
  }, []);

  const updateDrawSource = (coords: number[][]) => {
      if (!map.current) return;
      const source: any = map.current.getSource('draw-source');
      if (source) source.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } });
  };

  const startDrawing = () => { 
      tempDrawCoords.current = []; 
      updateDrawSource([]); 
      setIsDrawing(true); 
      if (map.current) map.current.dragPan.disable(); 
  };

  const stopDrawing = () => { 
      setIsDrawing(false); 
      tempDrawCoords.current = []; 
      updateDrawSource([]); 
      if (map.current) map.current.dragPan.enable(); 
  };

  const finishDrawing = async () => {
      const coords = tempDrawCoords.current;
      if (coords.length < 3) return stopDrawing(); 
      
      let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;
      coords.forEach(c => {
          if (c[0] < minLng) minLng = c[0]; if (c[0] > maxLng) maxLng = c[0];
          if (c[1] < minLat) minLat = c[1]; if (c[1] > maxLat) maxLat = c[1];
      });
      const centerLat = (minLat + maxLat) / 2;
      const centerLng = (minLng + maxLng) / 2;
      
      let radiusKm = calculateDistance(centerLat, centerLng, maxLat, maxLng) * 1.1;
      if (radiusKm < 0.1) radiusKm = 0.5;
      if (radiusKm > 5.0) radiusKm = 5.0;
      
      stopDrawing();
      executeSearch({ latitude: centerLat, longitude: centerLng, radius: radiusKm, polygon: coords });
  };

  const executeSearch = async (area: {latitude: number, longitude: number, radius: number, polygon: number[][]}) => {
      setIsLoading(true);
      setHotels([]);

      // ▼▼▼ 修正：Stateに固定されている日付文字列を安全に取得 ▼▼▼
      const checkin = searchDates?.checkinStr || "";
      const checkout = searchDates?.checkoutStr || "";

      try {
          const body = {
              latitude: area.latitude, 
              longitude: area.longitude, 
              radius: Number(area.radius.toFixed(1)), 
              polygon: area.polygon,
              checkin_date: checkin, 
              checkout_date: checkout, 
              adult_num: 2,
              meal_type: 'none' // ← ここを 'half_board' から 'none' に変更
          };

          const res = await fetch(`${API_BASE_URL}/api/search_hotels_vacant`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
          });
          const data = await res.json();
          
          if (data.hotels?.length > 0) { 
              setHotels(data.hotels); 
              updateHotelMarkers(data.hotels);
              if (map.current) {
                  const bounds = new mapboxgl.LngLatBounds();
                  area.polygon.forEach(coord => bounds.extend(coord as [number, number]));
                  map.current.fitBounds(bounds, { padding: 80, duration: 1500 });
              }
          } else {
              alert("囲んだ範囲に空室のある宿が見つかりませんでした。\n別の場所を囲んでみてください。");
          }
      } catch (e) { 
          alert("検索中にエラーが発生しました。"); 
      } finally { 
          setIsLoading(false); 
      }
  };

  const updateHotelMarkers = (hotelList: any[]) => {
      if (!map.current) return;
      hotelMarkersRef.current.forEach(m => m.remove());
      hotelMarkersRef.current = [];
      
      hotelList.forEach(hotel => {
          const el = document.createElement('div');
          const price = Math.round(hotel.price / 2); // 2名1室想定の1名料金
          const displayPrice = price >= 10000 ? `${(price/10000).toFixed(1)}万` : `¥${price.toLocaleString()}`;

          el.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;"><div style="background:white;padding:2px 6px;border-radius:6px;font-size:10px;font-weight:bold;color:#3B82F6;box-shadow:0 2px 4px rgba(0,0,0,0.2);margin-bottom:2px;border:1px solid #3B82F6;">${displayPrice}</div><svg width="28" height="28" viewBox="0 0 24 24" fill="#3B82F6" stroke="white" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3" fill="white"></circle></svg></div>`;
          
          el.onclick = () => window.open(getAffiliateUrl(hotel.id), '_blank');
          
          const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
              .setLngLat(hotel.coordinates)
              .addTo(map.current!);
              
          hotelMarkersRef.current.push(marker);
      });
  };

  const getAffiliateUrl = (hotelId: string) => {
      if (!searchDates) return "https://travel.rakuten.co.jp/";
      const { y1, m1, d1, y2, m2, d2 } = searchDates;

      // ▼ 余計なパラメータや重複をすべて排除し、明示的に子供を0に指定する
      const paramString = `f_flg=PLAN&f_otona_su=2&f_heya_su=1&f_s1=0&f_s2=0&f_y1=0&f_y2=0&f_y3=0&f_y4=0&f_y5=0&f_y6=0&f_nen1=${y1}&f_tuki1=${m1}&f_hi1=${d1}&f_nen2=${y2}&f_tuki2=${m2}&f_hi2=${d2}&f_hak=1&f_sort=minNo`;
      
      return `https://hotel.travel.rakuten.co.jp/hotelinfo/plan/${hotelId}?${paramString}`;
  };

  // 描画イベントのバインド
  useEffect(() => {
    if (!map.current) return;
    const onMove = (e: any) => { if (isDrawing) { tempDrawCoords.current.push([e.lngLat.lng, e.lngLat.lat]); updateDrawSource(tempDrawCoords.current); } };
    const onUp = () => { if (isDrawing) finishDrawing(); };
    
    map.current.on('mousemove', onMove); map.current.on('mouseup', onUp);
    map.current.on('touchmove', onMove); map.current.on('touchend', onUp);
    
    return () => {
        map.current?.off('mousemove', onMove); map.current?.off('mouseup', onUp);
        map.current?.off('touchmove', onMove); map.current?.off('touchend', onUp);
    };
  }, [isDrawing]);

  return (
    <div className="fixed inset-0 z-[100] bg-white flex flex-col font-sans">
      <div className="relative flex-1">
          {/* ローディング表示 */}
          {isLoading && (
              <div className="absolute inset-0 z-50 bg-white/50 backdrop-blur-sm flex items-center justify-center">
                  <div className="bg-white p-4 rounded-2xl shadow-xl flex items-center gap-3">
                      <Loader2 className="animate-spin text-emerald-600" />
                      <span className="font-bold text-gray-700">宿を探しています...</span>
                  </div>
              </div>
          )}

          {/* マップ */}
          <div ref={mapContainer} className="w-full h-full" style={{ touchAction: isDrawing ? 'none' : 'auto' }} />
          
          {/* ヘッダー/戻るボタン */}
          <div className="absolute top-0 left-0 right-0 p-4 z-10 bg-gradient-to-b from-black/50 to-transparent pointer-events-none flex justify-between">
              <button onClick={onBack} className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg pointer-events-auto hover:scale-105 active:scale-95 transition">
                  <ArrowLeft size={20} className="text-gray-700"/>
              </button>
              <div className="bg-white/90 backdrop-blur px-4 py-2 rounded-full shadow-lg pointer-events-auto text-xs font-bold text-gray-700 flex items-center gap-2">
                 <MapPin size={14} className="text-emerald-500"/>
                 お試しマップ検索
              </div>
          </div>

          {/* 描画ボタン */}
          <button 
             onClick={isDrawing ? stopDrawing : startDrawing} 
             className={`absolute bottom-8 right-6 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center active:scale-90 transition-all z-10 ${
                 isDrawing ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-900 text-white hover:bg-gray-800'
             }`}
          >
             {isDrawing ? <X size={24}/> : <PenTool size={24}/>}
          </button>

          {isDrawing && (
              <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg pointer-events-none">
                  探したいエリアをぐるっと囲んでください
              </div>
          )}
      </div>

      {/* 検索結果リスト */}
      {hotels.length > 0 && (
          <div className="h-1/3 bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.1)] rounded-t-[2rem] z-20 overflow-hidden flex flex-col">
              <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mt-4 shrink-0" />
              <div className="p-4 shrink-0">
                  <h3 className="font-black text-lg text-gray-800">見つかった宿 ({hotels.length}件)</h3>
                  <p className="text-xs text-gray-500">タップすると楽天トラベルで詳細を確認できます</p>
              </div>
              
              <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-3 custom-scrollbar">
                  {hotels.map((hotel, i) => (
                      <div 
                          key={i} 
                          onClick={() => window.open(getAffiliateUrl(hotel.id), '_blank')}
                          className="bg-slate-50 p-3 rounded-2xl border border-gray-100 flex items-center gap-3 active:scale-[0.98] transition cursor-pointer"
                      >
                          <div className="w-16 h-16 bg-gray-200 rounded-xl overflow-hidden shrink-0">
                              {hotel.image_url && <img src={hotel.image_url} className="w-full h-full object-cover" alt=""/>}
                          </div>
                          <div className="flex-1 min-w-0">
                              <h4 className="font-bold text-gray-800 text-sm truncate">{hotel.name}</h4>
                              <p className="text-red-500 font-black text-sm mt-1">¥{Math.round(hotel.price / 2).toLocaleString()}<span className="text-[10px] text-gray-400 font-normal"> / 人</span></p>
                          </div>
                          <div className="bg-[#BF0000] text-white p-2 rounded-full shrink-0">
                              <ExternalLink size={16}/>
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      )}
    </div>
  );
}