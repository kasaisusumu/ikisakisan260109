"use client";

import { useState, useMemo, useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { 
  BedDouble, Search, ExternalLink, MapPin, 
  Sparkles, Copy, X, Instagram, Map as MapIcon, 
  Crown, Star, Plus, Check, Filter, TrendingUp, DollarSign,
  Maximize2, Minimize2, Bath, Coffee, Loader2
} from 'lucide-react';

// ==========================================
// 🔑 設定エリア
// ==========================================
// ここにあなたの「楽天アフィリエイトID」を設定すると、リンクが収益化されます。
// (形式例: "g_id.s_id.g_id.s_id" のような文字列)
// 未設定でも検索は動きますが、報酬は発生しません。
const RAKUTEN_AFFILIATE_ID = "4fcc24e4.174bb117.4fcc24e5.5b178353"; 

const MAPBOX_TOKEN = "pk.eyJ1Ijoia2FzYWlzdXN1bXUwMSIsImEiOiJjbWljb2E1cWEwb2d5MmpvaXkwdWhtNjhjIn0.wA6FIZGDGor8jXsx-RNosA";

// 環境変数を優先し、なければlocalhostを使う
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// 色生成ロジック
const UD_COLORS = ['#F59E0B', '#3B82F6', '#10B981', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6'];
const getUDColor = (name: string) => {
  if (!name) return '#9CA3AF';
  let hash = 0;
  for (let i = 0; i < name.length; i++) { hash = name.charCodeAt(i) + ((hash << 5) - hash); }
  return UD_COLORS[Math.abs(hash) % UD_COLORS.length];
};

const isHotel = (name: string) => {
    const keywords = ['ホテル', '旅館', '宿', '民宿', 'Hotel', 'Inn', 'Guest House', 'ホステル', 'リゾート'];
    return keywords.some(k => name.includes(k));
};

interface Props {
  spots: any[];
  spotVotes: any[];
  currentUser: string;
  onAddSpot?: (spot: any) => void; 
  roomId: string; 
  onAutoSearch: (keyword: string) => void;
  onPreviewSpot?: (spot: any) => void;
}

export default function HotelListView({ spots, spotVotes, currentUser, onAddSpot, roomId }: Props) {
  const [hotels, setHotels] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false); // 散布図全画面モード
  const [selectedHotel, setSelectedHotel] = useState<any>(null);

  // フィルタ状態
  const [radius, setRadius] = useState(3.0); // API上限の3km
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 15000]); // 初期値1.5万
  const [options, setOptions] = useState<string[]>([]); // large_bath, breakfast

  // マップ参照
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const hotelMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const spotMarkersRef = useRef<mapboxgl.Marker[]>([]);

  // 1. 重心計算
  const centerOfGravity = useMemo(() => {
    if (spots.length === 0) return { lng: 135.758767, lat: 34.985120, valid: false };
    
    let totalLat = 0, totalLng = 0, totalWeight = 0;
    spots.forEach(spot => {
        if (!spot.coordinates) return;
        const [lng, lat] = spot.coordinates;
        const votes = spotVotes.filter(v => v.spot_id === spot.id && v.vote_type === 'like').length;
        const weight = 1 + (votes * 0.5);
        totalLat += lat * weight;
        totalLng += lng * weight;
        totalWeight += weight;
    });

    return { lng: totalLng / totalWeight, lat: totalLat / totalWeight, valid: true };
  }, [spots, spotVotes]);

  // 2. ホテル検索実行
  const searchHotels = async () => {
    setIsLoading(true);
    setHotels([]);
    setSelectedHotel(null);

    // ★ 予算20000円なら上限なし
    const maxPriceLimit = 20000;
    const requestMaxPrice = priceRange[1] >= maxPriceLimit ? undefined : priceRange[1];

    try {
        const body = {
            latitude: centerOfGravity.lat,
            longitude: centerOfGravity.lng,
            radius: radius,
            min_price: priceRange[0] > 0 ? priceRange[0] : undefined,
            max_price: requestMaxPrice,
            squeeze: options
        };

        const res = await fetch(`${API_BASE_URL}/api/search_hotels_vacant`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        
        if (data.hotels && data.hotels.length > 0) {
            setHotels(data.hotels);
            updateHotelMarkers(data.hotels);
        } else if (data.error) {
            alert(`検索エラー: ${data.error}`);
        } else {
            alert("条件に合う宿が見つかりませんでした。\n条件（距離・予算）を広げてみてください。");
        }
    } catch (e) {
        alert("サーバー通信エラーが発生しました。");
    } finally {
        setIsLoading(false);
    }
  };

  // 3. マップ初期化
  useEffect(() => {
    if (!mapContainer.current) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;
    
    map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [centerOfGravity.lng, centerOfGravity.lat],
        zoom: 12, 
        pitch: 0,
    });

    // ★ 重心マーカー
    if (centerOfGravity.valid) {
        const el = document.createElement('div');
        el.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; transform:translateY(-50%);">
                <div style="background:rgba(29, 78, 216, 0.9); color:white; font-size:10px; font-weight:bold; padding:3px 8px; border-radius:12px; margin-bottom:4px; box-shadow:0 2px 4px rgba(0,0,0,0.2); white-space:nowrap; border:1px solid white;">
                   🎯 エリア重心
                </div>
                <div style="background:#3B82F6; width:16px; height:16px; border-radius:50%; border:3px solid white; box-shadow:0 0 10px rgba(59, 130, 246, 0.6);"></div>
            </div>
        `;
        new mapboxgl.Marker({ element: el }).setLngLat([centerOfGravity.lng, centerOfGravity.lat]).addTo(map.current);
    }

    return () => { map.current?.remove(); };
  }, []); 

  useEffect(() => {
     if(map.current) map.current.flyTo({ center: [centerOfGravity.lng, centerOfGravity.lat] });
  }, [centerOfGravity]);

  // 既存スポット表示
  useEffect(() => {
      if (!map.current) return;
      spotMarkersRef.current.forEach(m => m.remove());
      spotMarkersRef.current = [];

      spots.forEach(spot => {
          const voters = spotVotes.filter(v => v.spot_id === spot.id).map(v => v.user_name);
          const participants = [spot.added_by, ...voters];
          const uniqueParticipants = Array.from(new Set(participants));
          
          const size = 20; 
          const segmentSize = 100 / uniqueParticipants.length;
          const gradientParts = uniqueParticipants.map((name, i) => { const color = getUDColor(name as string); return `${color} ${i * segmentSize}% ${(i + 1) * segmentSize}%`; });
          const gradientString = `conic-gradient(${gradientParts.join(', ')})`;
          
          const isSpotHotel = isHotel(spot.name) || spot.is_hotel;
          const baseColor = isSpotHotel ? '#FEF9C3' : '#FFFFFF'; 
          const textColor = isSpotHotel ? '#CA8A04' : '#1E3A8A'; 

          const el = document.createElement('div');
          el.innerHTML = `
            <div style="position:relative; display:flex; flex-direction:column; align-items:center; transform:translateY(-50%); z-index:10;">
                <div style="width:${size + 4}px; height:${size + 4}px; background:${gradientString}; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 5px rgba(0,0,0,0.3);">
                   <div style="width:${size}px; height:${size}px; background:${baseColor}; border-radius:50%; display:flex; align-items:center; justify-content:center; color:${textColor}; font-weight:800; font-size:10px; border:1px solid rgba(0,0,0,0.1);">
                     ${isSpotHotel ? '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg>' : (uniqueParticipants.length > 0 ? uniqueParticipants.length : '')}
                   </div>
                </div>
                <div style="width:0; height:0; border-left:4px solid transparent; border-right:4px solid transparent; border-top:6px solid ${baseColor}; margin-top:-1px; filter:drop-shadow(0 1px 1px rgba(0,0,0,0.1));"></div>
            </div>
          `;
          
          const marker = new mapboxgl.Marker({ element: el }).setLngLat(spot.coordinates).addTo(map.current!);
          spotMarkersRef.current.push(marker);
      });
  }, [spots, spotVotes]);

  // ホテルマーカー更新
  const updateHotelMarkers = (hotelList: any[]) => {
      if (!map.current) return;
      hotelMarkersRef.current.forEach(m => m.remove());
      hotelMarkersRef.current = [];

      hotelList.forEach(hotel => {
          const el = document.createElement('div');
          const isSelected = selectedHotel?.id === hotel.id;
          const color = isSelected ? '#EF4444' : '#3B82F6';
          const zIndex = isSelected ? '999' : '5';
          
          el.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;z-index:${zIndex};cursor:pointer;">
                <div style="background:white;padding:2px 4px;border-radius:4px;font-size:10px;font-weight:bold;color:${color};box-shadow:0 1px 2px rgba(0,0,0,0.2);margin-bottom:2px;white-space:nowrap;">
                   ¥${hotel.price.toLocaleString()}
                </div>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="2">
                   <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                   <circle cx="12" cy="10" r="3" fill="white"></circle>
                </svg>
            </div>
          `;
          el.onclick = () => handleSelectHotel(hotel);
          const marker = new mapboxgl.Marker({ element: el }).setLngLat(hotel.coordinates).addTo(map.current!);
          hotelMarkersRef.current.push(marker);
      });
  };

  const handleSelectHotel = (hotel: any) => {
      setSelectedHotel(hotel);
      if (map.current) {
          map.current.flyTo({ center: hotel.coordinates, zoom: 15, offset: [0, -100] });
      }
  };

  const handleAddCandidate = (hotel: any) => {
      if (onAddSpot) {
          onAddSpot({ ...hotel, is_hotel: true });
          alert(`${hotel.name} を候補に追加しました`);
      }
  };

  // ★ アフィリエイトリンク生成ロジック
  const getAffiliateUrl = (hotel: any) => {
      // APIから返ってきたURL、なければ検索ページへのリンク
      let targetUrl = hotel.url || `https://search.travel.rakuten.co.jp/ds/hotel/search?f_teikei=&f_query=${encodeURIComponent(hotel.name)}`;
      
      // アフィリエイトIDがあれば、楽天のアフィリエイトリンク形式に変換
      if (RAKUTEN_AFFILIATE_ID) {
          return `https://hb.afl.rakuten.co.jp/hgc/${RAKUTEN_AFFILIATE_ID}/?pc=${encodeURIComponent(targetUrl)}&m=${encodeURIComponent(targetUrl)}`;
      }
      return targetUrl;
  };

  // 散布図
  const ScatterPlot = () => {
      if (hotels.length === 0) return <div className="h-full flex items-center justify-center text-gray-400 text-sm">条件を指定して検索してください</div>;

      const padding = 20;
      const width = 300; 
      const height = 200; 
      const minRating = 3.0;
      const maxRating = 5.0;
      const prices = hotels.map(h => h.price);
      const minP = Math.min(...prices) * 0.9;
      const maxP = Math.max(...prices) * 1.1;

      return (
          <div className="relative w-full h-full p-2">
              <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
                  <line x1={padding} y1={height-padding} x2={width-padding} y2={height-padding} stroke="#ddd" strokeWidth="1"/>
                  <line x1={padding} y1={padding} x2={padding} y2={height-padding} stroke="#ddd" strokeWidth="1"/>
                  <text x={width/2} y={height} fontSize="8" textAnchor="middle" fill="#888">評価 (Rakuten)</text>
                  <text x={0} y={height/2} fontSize="8" textAnchor="middle" fill="#888" transform={`rotate(-90, 8, ${height/2})`}>価格</text>

                  {hotels.map((h, i) => {
                      const x = padding + ((h.rating || 3.0) - minRating) / (maxRating - minRating) * (width - 2 * padding);
                      const y = (height - padding) - ((h.price - minP) / (maxP - minP) * (height - 2 * padding));
                      const isSelected = selectedHotel?.id === h.id;
                      const opacity = Math.min(0.3 + (h.review_count || 0) / 500, 1.0);

                      return (
                          <circle 
                            key={i} cx={x} cy={y} 
                            r={isSelected ? 6 : 3} 
                            fill={isSelected ? "#EF4444" : "#3B82F6"}
                            fillOpacity={isSelected ? 1 : opacity}
                            stroke="white" strokeWidth={0.5}
                            className="transition-all duration-300 cursor-pointer hover:r-6"
                            onClick={() => handleSelectHotel(h)}
                          />
                      );
                  })}
              </svg>

              {/* 散布図上でホテルを選択したときのポップアップ */}
              {selectedHotel && (
                  <div className="absolute top-2 left-1/2 transform -translate-x-1/2 bg-white p-3 rounded-xl shadow-xl border border-gray-100 w-64 animate-in fade-in zoom-in slide-in-from-bottom-2 z-20">
                      <div className="flex justify-between items-start mb-2">
                          <h3 className="text-xs font-bold text-gray-800 line-clamp-1">{selectedHotel.name}</h3>
                          <button onClick={() => setSelectedHotel(null)} className="text-gray-400"><X size={14}/></button>
                      </div>
                      <div className="flex justify-between text-xs text-gray-500 mb-2">
                          <span className="font-bold text-red-500">¥{selectedHotel.price.toLocaleString()}</span>
                          <span className="flex items-center gap-0.5"><Star size={10} fill="orange" className="text-orange-400"/> {selectedHotel.rating}</span>
                      </div>
                      <div className="flex gap-2">
                          <button onClick={() => handleAddCandidate(selectedHotel)} className="flex-1 bg-blue-600 text-white text-[10px] py-1.5 rounded-lg font-bold hover:bg-blue-700">候補に追加</button>
                          {/* ★ ここがアフィリエイトリンクのボタンです */}
                          <a href={getAffiliateUrl(selectedHotel)} target="_blank" className="flex-1 bg-gray-100 text-gray-600 text-[10px] py-1.5 rounded-lg font-bold flex items-center justify-center gap-1 hover:bg-gray-200">
                              楽天 <ExternalLink size={10}/>
                          </a>
                      </div>
                  </div>
              )}
          </div>
      );
  };

  const priceDisplay = priceRange[1] >= 20000 ? "上限なし" : `¥${priceRange[1].toLocaleString()}`;

  return (
    <div className="flex flex-col h-full bg-slate-50 relative overflow-hidden">
      <div className={`w-full transition-all duration-300 ${isExpanded ? 'h-0' : 'h-[50%]'}`}>
         <div ref={mapContainer} className="w-full h-full" />
      </div>

      <div className={`w-full bg-white rounded-t-3xl shadow-[0_-5px_20px_rgba(0,0,0,0.1)] flex flex-col transition-all duration-500 ${isExpanded ? 'h-full mt-0' : 'h-[50%] -mt-4'}`}>
          <div 
            className="w-full p-2 cursor-pointer flex flex-col items-center shrink-0 bg-white rounded-t-3xl border-b border-gray-50"
            onClick={() => setIsExpanded(!isExpanded)}
          >
              <div className="w-12 h-1.5 bg-gray-200 rounded-full mb-2"></div>
              <div className="w-full flex justify-between items-center px-4">
                  <h2 className="font-bold text-gray-800 flex items-center gap-2"><TrendingUp size={18} className="text-blue-500"/> ホテル分析</h2>
                  <button className="p-1 bg-gray-100 rounded-full">{isExpanded ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}</button>
              </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6">
              <div className="w-full h-64 bg-slate-50 rounded-2xl border border-gray-100 relative">
                  <ScatterPlot />
              </div>

              <div className="space-y-4">
                  <div className="bg-white border border-gray-200 p-4 rounded-xl shadow-sm">
                      <div className="flex justify-between items-center mb-2">
                          <label className="text-xs font-bold text-gray-500 flex items-center gap-1"><MapPin size={14}/> 重心からの距離 (API上限 3km)</label>
                          <span className="text-sm font-bold text-blue-600">{radius}km</span>
                      </div>
                      <input 
                        type="range" min="0.5" max="3.0" step="0.5" value={radius} 
                        onChange={(e) => setRadius(parseFloat(e.target.value))}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                      />
                  </div>

                  <div className="bg-white border border-gray-200 p-4 rounded-xl shadow-sm">
                      <div className="flex justify-between items-center mb-2">
                          <label className="text-xs font-bold text-gray-500 flex items-center gap-1"><DollarSign size={14}/> 予算 (1泊)</label>
                          <span className={`text-sm font-bold ${priceRange[1] >= 20000 ? "text-green-600" : "text-blue-600"}`}>{priceDisplay}</span>
                      </div>
                      <input 
                        type="range" min="3000" max="20000" step="1000" value={priceRange[1]} 
                        onChange={(e) => setPriceRange([0, parseInt(e.target.value)])}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-green-600"
                      />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                      <button 
                        onClick={() => setOptions(prev => prev.includes('large_bath') ? prev.filter(o => o !== 'large_bath') : [...prev, 'large_bath'])}
                        className={`p-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-2 transition ${options.includes('large_bath') ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white border-gray-200 text-gray-500'}`}
                      >
                          <Bath size={16}/> 大浴場あり
                      </button>
                      <button 
                        onClick={() => setOptions(prev => prev.includes('breakfast') ? prev.filter(o => o !== 'breakfast') : [...prev, 'breakfast'])}
                        className={`p-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-2 transition ${options.includes('breakfast') ? 'bg-orange-50 border-orange-200 text-orange-600' : 'bg-white border-gray-200 text-gray-500'}`}
                      >
                          <Coffee size={16}/> 朝食付き
                      </button>
                  </div>

                  <button 
                    onClick={searchHotels}
                    disabled={isLoading}
                    className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-4 rounded-xl font-bold shadow-lg hover:scale-[1.02] transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                      {isLoading ? <Loader2 className="animate-spin" /> : <Search size={18}/>}
                      条件でホテルを再検索
                  </button>
              </div>
          </div>
      </div>
    </div>
  );
}