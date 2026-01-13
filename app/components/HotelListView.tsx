"use client";

import { useState, useMemo, useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { 
  Search, ExternalLink, MapPin, 
  X, TrendingUp, DollarSign,
  Star, Loader2, PenTool, Trash2, Plus, Calendar, Users, SlidersHorizontal, Link as LinkIcon, Download, ChevronUp, ChevronDown, Check
} from 'lucide-react';

// ==========================================
// 🔑 設定
// ==========================================
const RAKUTEN_AFFILIATE_ID = "4fcc24e4.174bb117.4fcc24e5.5b178353"; 
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
};

export type AreaSearchParams = {
  latitude: number;
  longitude: number;
  radius: number;
};

interface SearchConditions {
    checkin: string;
    checkout: string;
    adults: number;
    budgetMax: number;
}

interface Props {
  spots: any[];
  spotVotes: any[];
  currentUser: string;
  onAddSpot?: (spot: any) => void; 
  roomId: string; 
  onAutoSearch: (keyword: string) => void;
  onPreviewSpot?: (spot: any) => void;
  initialSearchArea?: AreaSearchParams | null; 
}

export default function HotelListView({ spots, spotVotes, currentUser, onAddSpot, roomId, initialSearchArea }: Props) {
  const [hotels, setHotels] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false); 
  const [selectedHotel, setSelectedHotel] = useState<any>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  // 検索条件
  const today = new Date();
  const nextMonth = new Date(today);
  nextMonth.setDate(today.getDate() + 30);
  const nextMonthStr = nextMonth.toISOString().split('T')[0];
  const nextMonthNextDay = new Date(nextMonth);
  nextMonthNextDay.setDate(nextMonth.getDate() + 1);
  const nextMonthNextDayStr = nextMonthNextDay.toISOString().split('T')[0];

  const [conditions, setConditions] = useState<SearchConditions>({
      checkin: nextMonthStr,
      checkout: nextMonthNextDayStr,
      adults: 2,
      budgetMax: 30000,
  });

  const [showSettings, setShowSettings] = useState(false);
  const [searchArea, setSearchArea] = useState<AreaSearchParams | null>(null);

  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const hotelMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const spotMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const tempDrawCoords = useRef<number[][]>([]);

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

  useEffect(() => {
      if (initialSearchArea) {
          setSearchArea(initialSearchArea);
          setShowSettings(true); 
      } else if (!searchArea && centerOfGravity.valid) {
          setSearchArea({ latitude: centerOfGravity.lat, longitude: centerOfGravity.lng, radius: 3.0 });
      }
  }, [initialSearchArea, centerOfGravity]);

  const handleSelectHotel = (hotel: any) => {
      setSelectedHotel(hotel);
      if (map.current) {
          // ★ 修正: 画面の上半分の中央にピンが来るようにオフセットを設定
          map.current.flyTo({ 
              center: hotel.coordinates, 
              zoom: 16, 
              offset: [0, -window.innerHeight / 4], // 画面の4分の1分、上にずらす
              duration: 1000 
          });
      }
      if (isExpanded) setIsExpanded(false);
  };

  const handleAddCandidate = (hotel: any) => {
      if (onAddSpot) {
          onAddSpot({ ...hotel, is_hotel: true, votes: 0, stay_time: 0, status: 'hotel_candidate' });
      }
  };

  const getAffiliateUrl = (hotel: any) => {
      const [y1, m1, d1] = conditions.checkin.split('-');
      const [y2, m2, d2] = conditions.checkout.split('-');
      const targetUrl = `https://hotel.travel.rakuten.co.jp/hotelinfo/plan/${hotel.id}?f_teikei=&f_heya_su=1&f_otona_su=${conditions.adults}&f_nen1=${y1}&f_tuki1=${m1}&f_hi1=${d1}&f_nen2=${y2}&f_tuki2=${m2}&f_hi2=${d2}&f_sort=min_charge`;
      if (RAKUTEN_AFFILIATE_ID) return `https://hb.afl.rakuten.co.jp/hgc/${RAKUTEN_AFFILIATE_ID}/?pc=${encodeURIComponent(targetUrl)}&m=${encodeURIComponent(targetUrl)}`;
      return targetUrl;
  };

  const updateHotelMarkers = (hotelList: any[]) => {
      if (!map.current) return;
      hotelMarkersRef.current.forEach(m => m.remove());
      hotelMarkersRef.current = [];
      hotelList.forEach(hotel => {
          const el = document.createElement('div');
          const isSelected = selectedHotel?.id === hotel.id;
          const color = isSelected ? '#EF4444' : '#3B82F6';
          el.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;z-index:${isSelected ? 99 : 5};cursor:pointer;"><div style="background:white;padding:2px 6px;border-radius:6px;font-size:10px;font-weight:bold;color:${color};box-shadow:0 2px 4px rgba(0,0,0,0.2);margin-bottom:2px;white-space:nowrap;border:1px solid ${color};">¥${(hotel.price/10000).toFixed(1)}万</div><svg width="28" height="28" viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3" fill="white"></circle></svg></div>`;
          el.onclick = () => handleSelectHotel(hotel);
          const marker = new mapboxgl.Marker({ element: el }).setLngLat(hotel.coordinates).addTo(map.current!);
          hotelMarkersRef.current.push(marker);
      });
  };

  const ScatterPlot = () => {
    const paddingLeft = 40; const paddingBottom = 30; const paddingRight = 10; const paddingTop = 10;
    const width = 300; const height = 200; 
    const minRating = 3.0; const maxRating = 5.0;
    const prices = hotels.map(h => h.price).filter(p => p > 0);
    const minP = prices.length ? Math.min(...prices) * 0.9 : 0;
    const maxP = prices.length ? Math.max(...prices) * 1.1 : 30000;
    const getX = (rating: number) => paddingLeft + ((rating - minRating) / (maxRating - minRating)) * (width - paddingLeft - paddingRight);
    const getY = (price: number) => (height - paddingBottom) - ((price - minP) / (maxP - minP)) * (height - paddingBottom - paddingTop);
    const ratingTicks = [3.0, 3.5, 4.0, 4.5, 5.0];
    const priceTicks = [Math.floor(minP), Math.floor((minP + maxP) / 2), Math.floor(maxP)];

    return (
        <div className="relative w-full h-full p-2">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible font-sans">
                {priceTicks.map((p, i) => (<line key={`grid-y-${i}`} x1={paddingLeft} y1={getY(p)} x2={width - paddingRight} y2={getY(p)} stroke="#f0f0f0" strokeWidth="1" strokeDasharray="4 4"/>))}
                {ratingTicks.map(r => (<line key={`grid-x-${r}`} x1={getX(r)} y1={paddingTop} x2={getX(r)} y2={height - paddingBottom} stroke="#f0f0f0" strokeWidth="1" strokeDasharray="4 4"/>))}
                <line x1={paddingLeft} y1={height - paddingBottom} x2={width - paddingRight} y2={height - paddingBottom} stroke="#e5e7eb" strokeWidth="1"/>
                <line x1={paddingLeft} y1={paddingTop} x2={paddingLeft} y2={height - paddingBottom} stroke="#e5e7eb" strokeWidth="1"/>
                <text x={(width + paddingLeft) / 2} y={height + 15} fontSize="10" textAnchor="middle" fill="#9ca3af" fontWeight="bold">評価</text>
                <text x={5} y={height / 2} fontSize="10" textAnchor="middle" fill="#9ca3af" fontWeight="bold" transform={`rotate(-90, 5, ${height / 2})`}>価格</text>
                {ratingTicks.map(r => (<text key={`x-${r}`} x={getX(r)} y={height - paddingBottom + 12} fontSize="9" textAnchor="middle" fill="#9ca3af">{r.toFixed(1)}</text>))}
                {priceTicks.map((p, i) => (<text key={`y-${i}`} x={paddingLeft - 6} y={getY(p) + 3} fontSize="9" textAnchor="end" fill="#9ca3af">{p >= 10000 ? `${(p / 10000).toFixed(1)}万` : `¥${(p/1000).toFixed(0)}k`}</text>))}
                {hotels.map((h, i) => {
                    const x = getX(h.rating || 3.0);
                    const y = getY(h.price);
                    const isSelected = selectedHotel?.id === h.id;
                    return (<circle key={i} cx={x} cy={y} r={isSelected ? 8 : 4} fill={isSelected ? "#EF4444" : "#3B82F6"} stroke="white" strokeWidth={1.5} className="transition-all duration-300 cursor-pointer drop-shadow-sm" onClick={() => handleSelectHotel(h)} />);
                })}
            </svg>
        </div>
    );
  };

  const updateDrawSource = (coords: number[][]) => {
      if (!map.current) return;
      const source: any = map.current.getSource('draw-source');
      if (source) source.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } });
  };

  const startDrawing = () => { tempDrawCoords.current = []; updateDrawSource([]); setIsDrawing(true); if (map.current) map.current.dragPan.disable(); };
  const stopDrawing = () => { setIsDrawing(false); tempDrawCoords.current = []; updateDrawSource([]); if (map.current) map.current.dragPan.enable(); };

  const finishDrawing = () => {
      const coords = tempDrawCoords.current;
      if (coords.length < 2) return stopDrawing();
      let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;
      coords.forEach(c => {
          if (c[0] < minLng) minLng = c[0]; if (c[0] > maxLng) maxLng = c[0];
          if (c[1] < minLat) minLat = c[1]; if (c[1] > maxLat) maxLat = c[1];
      });
      const centerLat = (minLat + maxLat) / 2;
      const centerLng = (minLng + maxLng) / 2;
      let radiusKm = (calculateDistance(centerLat, centerLng, maxLat, maxLng) / 2) * 1.1;
      setSearchArea({ latitude: centerLat, longitude: centerLng, radius: Math.min(radiusKm, 3.0) });
      stopDrawing();
      setShowSettings(true);
  };

  const executeSearch = async () => {
    if (!searchArea) return alert("範囲を囲んでください");
    setIsLoading(true); setHotels([]); setSelectedHotel(null); setShowSettings(false); 
    try {
        const body = {
            latitude: searchArea.latitude, longitude: searchArea.longitude, radius: Number(searchArea.radius.toFixed(1)), 
            max_price: conditions.budgetMax >= 30000 ? undefined : conditions.budgetMax,
            checkin_date: conditions.checkin, checkout_date: conditions.checkout, adult_num: conditions.adults
        };
        const res = await fetch(`${API_BASE_URL}/api/search_hotels_vacant`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        const data = await res.json();
        if (data.hotels?.length > 0) { 
            setHotels(data.hotels); 
            updateHotelMarkers(data.hotels); 
            
            if (map.current) {
                const { latitude, longitude, radius } = searchArea;
                const kmPerDegLat = 111.32;
                const kmPerDegLng = 111.32 * Math.cos(latitude * (Math.PI / 180));
                
                const latOffset = radius / kmPerDegLat;
                const lngOffset = radius / kmPerDegLng;
                
                const bounds = new mapboxgl.LngLatBounds(
                    [longitude - lngOffset, latitude - latOffset],
                    [longitude + lngOffset, latitude + latOffset]
                );
                
                map.current.fitBounds(bounds, { padding: 80, duration: 1500 });
            }
        }
        else alert("条件に合う宿が見つかりませんでした");
    } catch (e) { alert("通信エラー"); } finally { setIsLoading(false); }
  };

  const executeImport = async () => {
      if (!importUrl) return;
      setIsImporting(true);
      try {
          const res = await fetch(`${API_BASE_URL}/api/import_rakuten_hotel`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: importUrl })
          });
          const data = await res.json();
          if (data.spot) { handleAddCandidate(data.spot); setImportUrl(""); }
          else alert(data.error || "エラー");
      } catch (e) { alert("エラー"); } finally { setIsImporting(false); }
  };

  useEffect(() => {
    if (!mapContainer.current) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;
    map.current = new mapboxgl.Map({
        container: mapContainer.current, 
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [centerOfGravity.lng, centerOfGravity.lat], zoom: 12
    });
    map.current.on('load', () => {
        if (!map.current) return;
        map.current.addSource('draw-source', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } } });
        map.current.addLayer({ id: 'draw-line', type: 'line', source: 'draw-source', paint: { 'line-color': '#EF4444', 'line-width': 4, 'line-opacity': 0.8 } });
        map.current.setPadding({ top: 50, bottom: 250, left: 0, right: 0 });
    });
    return () => { map.current?.remove(); };
  }, []);

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

  const priceDisplay = conditions.budgetMax >= 30000 ? "上限なし" : `¥${conditions.budgetMax.toLocaleString()}`;

  return (
    <div className="relative w-full h-full bg-slate-50 flex flex-col font-sans overflow-hidden">
      
      {/* 1. マップセクション */}
      <div className={`absolute inset-0 z-0 transition-all duration-500 ${hotels.length > 0 ? 'h-1/2' : 'h-full'}`}>
         <div ref={mapContainer} className="w-full h-full" style={{ touchAction: isDrawing ? 'none' : 'auto' }} />
         {!isDrawing && !selectedHotel && (
             <button onClick={startDrawing} className="absolute top-28 right-6 w-14 h-14 bg-black text-white rounded-2xl shadow-2xl flex items-center justify-center active:scale-90 transition-transform z-10">
                 <PenTool size={24}/>
             </button>
         )}
      </div>

      {/* 2. メイン操作パネル (ボトムシート) */}
      <div className={`absolute bottom-0 left-0 right-0 z-30 bg-white rounded-t-[2.5rem] shadow-[0_-10px_60px_rgba(0,0,0,0.15)] flex flex-col transition-all duration-500 overflow-hidden ${hotels.length > 0 ? 'h-1/2' : 'h-auto max-h-[85vh]'}`}>
          <div className="w-12 h-1.5 bg-gray-100 rounded-full mx-auto mt-4 mb-2 shrink-0" />
          <div className="flex-1 overflow-y-auto px-8 pb-32">
              {hotels.length === 0 ? (
                  <div className="flex flex-col gap-8 pt-4 animate-in fade-in slide-in-from-bottom-4">
                      <div className="text-center">
                          <h2 className="text-2xl font-black text-gray-800">Hotel Finder</h2>
                          <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Select your stay</p>
                      </div>
                      <div className="bg-slate-50 p-6 rounded-[2rem] border border-gray-100">
                          <label className="text-[10px] font-black text-gray-400 block mb-3 uppercase tracking-tighter flex items-center gap-1"><Download size={12}/> Import URL</label>
                          <div className="flex gap-2">
                              <input type="text" value={importUrl} onChange={(e) => setImportUrl(e.target.value)} placeholder="Rakuten Travel URL..." className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-100 transition"/>
                              <button onClick={executeImport} disabled={isImporting || !importUrl} className="bg-blue-600 text-white px-5 rounded-xl font-bold text-sm disabled:opacity-50">{isImporting ? <Loader2 className="animate-spin"/> : <Plus size={20}/>}</button>
                          </div>
                      </div>
                      <a href={`https://hb.afl.rakuten.co.jp/hgc/${RAKUTEN_AFFILIATE_ID}/?pc=${encodeURIComponent("https://travel.rakuten.co.jp/")}`} target="_blank" className="w-full bg-black text-white py-5 rounded-[2rem] font-black text-center flex items-center justify-center gap-3 shadow-xl active:scale-95 transition-transform">楽天トラベルで探す <ExternalLink size={20}/></a>
                  </div>
              ) : (
                  <div className="flex flex-col gap-6 pt-2 animate-in fade-in">
                      <div className="flex justify-between items-center">
                          <h3 className="text-xl font-black text-gray-800 flex items-center gap-2"><TrendingUp size={22} className="text-blue-500"/> 分析結果</h3>
                          <button onClick={() => setShowSettings(true)} className="p-2 bg-slate-100 rounded-full text-gray-600"><SlidersHorizontal size={18}/></button>
                      </div>
                      <div className="w-full aspect-[4/3] bg-slate-50 rounded-[2rem] border border-gray-100 relative overflow-hidden shadow-inner shrink-0">
                          <ScatterPlot />
                      </div>
                      <div className="space-y-4 pb-12">
                          {hotels.slice(0, 8).map((hotel, i) => (
                              <div key={i} className="bg-white p-4 rounded-2xl border border-gray-100 flex items-center gap-4 active:bg-slate-50 transition shadow-sm" onClick={() => handleSelectHotel(hotel)}>
                                  <div className="w-14 h-14 bg-slate-100 rounded-xl overflow-hidden shrink-0">
                                      {hotel.image_url ? <img src={hotel.image_url} className="w-full h-full object-cover" alt=""/> : <LinkIcon size={20} className="m-auto mt-4 text-gray-300"/>}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                      <h4 className="font-bold text-gray-800 text-xs truncate">{hotel.name}</h4>
                                      <p className="text-red-500 font-black text-sm">¥{hotel.price.toLocaleString()}</p>
                                  </div>
                                  <button onClick={(e)=>{e.stopPropagation(); handleAddCandidate(hotel)}} className="p-2 bg-blue-50 text-blue-600 rounded-full transition active:scale-90 shadow-sm"><Plus size={18}/></button>
                              </div>
                          ))}
                      </div>
                  </div>
              )}
          </div>
      </div>

      {/* ★ 修正: 詳細カードを画面の下半分に固定 */}
      {selectedHotel && (
          <div className="absolute inset-x-0 bottom-0 h-1/2 z-[100] bg-white rounded-t-[3rem] shadow-[0_-20px_60px_rgba(0,0,0,0.3)] border-t border-gray-100 animate-in slide-in-from-bottom-full duration-500 flex flex-col">
              <div className="w-12 h-1.5 bg-gray-100 rounded-full mx-auto mt-4 mb-2 shrink-0" />
              <div className="flex-1 overflow-y-auto px-8 py-4 space-y-6">
                  <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                          <h3 className="font-black text-gray-900 text-2xl leading-tight mb-2 pr-8">{selectedHotel.name}</h3>
                          <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1.5 bg-orange-50 px-3 py-1.5 rounded-2xl border border-orange-100">
                                  <Star size={16} fill="orange" className="text-orange-400"/>
                                  <span className="text-sm font-black text-orange-700">{selectedHotel.rating}</span>
                              </div>
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">({selectedHotel.review_count || 0} reviews)</span>
                          </div>
                      </div>
                      <button onClick={() => setSelectedHotel(null)} className="p-3 bg-slate-100 rounded-full text-gray-400 hover:text-gray-600 transition shrink-0"><X size={24}/></button>
                  </div>

                  <div className="relative aspect-video w-full rounded-[2rem] overflow-hidden shadow-lg border border-gray-100 shrink-0">
                      {selectedHotel.image_url ? (
                          <img src={selectedHotel.image_url} className="w-full h-full object-cover" alt=""/>
                      ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-300 bg-slate-50"><LinkIcon size={64}/></div>
                      )}
                  </div>

                  <div className="bg-slate-50 p-6 rounded-[2.5rem] border border-gray-100">
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">Estimated Lowest Price</p>
                      <span className="font-black text-4xl text-red-500 tracking-tight">¥{selectedHotel.price.toLocaleString()}</span>
                  </div>

                  <div className="flex gap-4 pt-4 pb-12">
                      <button onClick={() => { handleAddCandidate(selectedHotel); setSelectedHotel(null); }} className="flex-[2] bg-black text-white py-5 rounded-[2rem] font-black text-lg active:scale-95 transition-transform flex items-center justify-center gap-2 shadow-2xl">
                          <Plus size={24}/> 候補に追加
                      </button>
                      <a href={getAffiliateUrl(selectedHotel)} target="_blank" className="flex-1 bg-slate-100 text-slate-600 py-5 rounded-[2rem] border border-slate-200 active:scale-95 transition-transform flex items-center justify-center shadow-lg">
                          <ExternalLink size={24}/>
                      </a>
                  </div>
              </div>
          </div>
      )}

      {/* 3. 条件設定 */}
      {showSettings && (
          <div className="absolute inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end animate-in fade-in duration-300">
              <div className="bg-white w-full rounded-t-[2.5rem] p-8 shadow-2xl space-y-8 animate-in slide-in-from-bottom-10 max-h-[90vh] overflow-y-auto">
                  <div className="flex justify-between items-center"><h3 className="text-2xl font-black text-gray-800">Filters</h3><button onClick={() => setShowSettings(false)} className="p-2 bg-slate-100 rounded-full hover:bg-gray-200"><X size={20}/></button></div>
                  <div className="space-y-8">
                      <div className="flex gap-4">
                          <div className="flex-1 space-y-1"><label className="text-[10px] font-black text-gray-400 ml-1 uppercase">Check-in</label><input type="date" value={conditions.checkin} onChange={(e) => setConditions({...conditions, checkin: e.target.value})} className="w-full bg-slate-50 p-4 rounded-2xl font-bold border-none outline-none focus:ring-2 focus:ring-blue-100 transition"/></div>
                          <div className="flex-1 space-y-1"><label className="text-[10px] font-black text-gray-400 ml-1 uppercase">Check-out</label><input type="date" value={conditions.checkout} onChange={(e) => setConditions({...conditions, checkout: e.target.value})} className="w-full bg-slate-50 p-4 rounded-2xl font-bold border-none outline-none focus:ring-2 focus:ring-blue-100 transition"/></div>
                      </div>

                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-gray-400 ml-1 uppercase flex items-center gap-2"><Users size={14}/> Adults</label>
                        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 mask-gradient">
                           {Array.from({length: 30}).map((_, i) => {
                               const n = i + 1;
                               const isSel = conditions.adults === n;
                               return (
                                   <button 
                                     key={n} 
                                     onClick={()=>setConditions({...conditions, adults: n})} 
                                     className={`min-w-[60px] h-[60px] rounded-2xl font-black text-lg transition-all ${isSel ? 'bg-blue-600 text-white shadow-lg scale-110' : 'bg-slate-50 text-gray-400 hover:bg-slate-100'}`}
                                   >
                                       {n}
                                   </button>
                               );
                           })}
                        </div>
                      </div>

                      <div className="space-y-1">
                          <div className="flex justify-between px-1"><label className="text-[10px] font-black text-gray-400 uppercase">Max Budget / Person</label><span className="text-sm font-black text-blue-600">{conditions.budgetMax >= 30000 ? "No limit" : `¥${conditions.budgetMax.toLocaleString()}`}</span></div>
                          <input type="range" min="3000" max="30000" step="1000" value={conditions.budgetMax} onChange={(e) => setConditions({...conditions, budgetMax: parseInt(e.target.value)})} className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600"/>
                      </div>

                      <button onClick={executeSearch} disabled={isLoading} className="w-full bg-black text-white py-5 rounded-[2rem] font-black text-lg shadow-xl flex items-center justify-center gap-2 active:scale-95 transition-transform">
                          {isLoading ? <Loader2 className="animate-spin"/> : <><Search size={22}/> Search properties</>}
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}