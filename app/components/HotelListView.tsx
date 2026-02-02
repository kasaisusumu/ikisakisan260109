"use client";

import { supabase } from '@/lib/supabase';
import { useState, useMemo, useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { 
  Search, ExternalLink, MapPin, 
  X, TrendingUp, DollarSign,
  Star, Loader2, PenTool, Trash2, Plus, Calendar, Users, SlidersHorizontal, Link as LinkIcon, Download, ChevronUp, ChevronDown, Check, AlertTriangle, BedDouble,
  Utensils 
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

// 円のポリゴンGeoJSONを生成する関数
const createGeoJSONCircle = (center: [number, number], radiusInKm: number, points = 64) => {
    const coords = { latitude: center[1], longitude: center[0] };
    const km = radiusInKm;
    const ret = [];
    const distanceX = km / (111.320 * Math.cos(coords.latitude * Math.PI / 180));
    const distanceY = km / 110.574;

    for(let i=0; i<points; i++) {
        const theta = (i / points) * (2 * Math.PI);
        const x = distanceX * Math.cos(theta);
        const y = distanceY * Math.sin(theta);
        ret.push([coords.longitude + x, coords.latitude + y]);
    }
    ret.push(ret[0]);

    return {
        type: "Feature",
        geometry: {
            type: "Polygon",
            coordinates: [ret]
        },
        properties: {}
    };
};

export type AreaSearchParams = {
  latitude: number;
  longitude: number;
  radius: number;
  polygon: number[][]; 
};

interface SearchConditions {
    checkin: string;
    checkout: string;
    adults: number;
    budgetMax: number;
    mealType: 'none' | 'room_only' | 'breakfast' | 'half_board';
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
  travelDays: number;
}

export default function HotelListView({ spots, spotVotes, currentUser, onAddSpot, roomId, initialSearchArea, travelDays }: Props) {
  // ログ送信関数
  const logAffiliateClick = async (spotName: string, source: string) => {
      await supabase.from('affiliate_logs').insert({
          room_id: roomId,
          user_name: currentUser || 'Guest',
          spot_name: spotName,
          source_view: source
      });
  };
  
  const [hotels, setHotels] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false); 
  const [selectedHotel, setSelectedHotel] = useState<any>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  
  const [pendingHotel, setPendingHotel] = useState<any>(null);
  const [importedHotel, setImportedHotel] = useState<any>(null);

  const [activeHotelId, setActiveHotelId] = useState<string | null>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [viewedHotelIds, setViewedHotelIds] = useState<Set<string>>(new Set());

  // ズーム機能用のStateとRef
  const rightEdgeGestureRef = useRef({
      isActive: false,
      startY: 0,
      startZoom: 0
  });
  const [showZoomUI, setShowZoomUI] = useState(false);
  const zoomKnobRef = useRef<HTMLDivElement>(null);

  // 検索条件の初期化
  const [conditions, setConditions] = useState<SearchConditions>(() => {
      const today = new Date();
      const nextMonth = new Date(today);
      nextMonth.setDate(today.getDate() + 30);
      const nextMonthStr = nextMonth.toISOString().split('T')[0];
      const nextMonthNextDay = new Date(nextMonth);
      nextMonthNextDay.setDate(nextMonth.getDate() + 1);
      const nextMonthNextDayStr = nextMonthNextDay.toISOString().split('T')[0];
      
      const defaultConditions = {
          checkin: nextMonthStr,
          checkout: nextMonthNextDayStr,
          adults: 2,
          budgetMax: 50000,
          mealType: 'half_board' as const, 
      };

      if (typeof window !== 'undefined' && roomId) {
          try {
              const saved = localStorage.getItem(`rh_hotel_conditions_${roomId}`);
              if (saved) {
                  return { ...defaultConditions, ...JSON.parse(saved) };
              }
          } catch (e) {
              console.error("Failed to load saved conditions", e);
          }
      }
      return defaultConditions;
  });

  const [searchedAdults, setSearchedAdults] = useState(conditions.adults);

  // 検索条件が変更されたら保存
  useEffect(() => {
      if (roomId) {
          localStorage.setItem(`rh_hotel_conditions_${roomId}`, JSON.stringify(conditions));
      }
  }, [conditions, roomId]);

  const [showSettings, setShowSettings] = useState(false);
  const [searchArea, setSearchArea] = useState<AreaSearchParams | null>(null);

  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const hotelMarkersRef = useRef<mapboxgl.Marker[]>([]);
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
          setSearchArea({ latitude: centerOfGravity.lat, longitude: centerOfGravity.lng, radius: 3.0, polygon: [] });
      }
  }, [initialSearchArea, centerOfGravity]);

  useEffect(() => {
      if (hotels.length > 0) {
          updateHotelMarkers(hotels);
      }
  }, [hotels, activeHotelId, searchedAdults]); 

  // 検索範囲（ポリゴン）の描画
  useEffect(() => {
      if (!map.current || !searchArea || !isMapLoaded) return;
      const source: any = map.current.getSource('search-area-source');
      
      if (source && searchArea.polygon && searchArea.polygon.length > 2) {
          const polygonCoords = [...searchArea.polygon];
          if (
              polygonCoords[0][0] !== polygonCoords[polygonCoords.length - 1][0] ||
              polygonCoords[0][1] !== polygonCoords[polygonCoords.length - 1][1]
          ) {
              polygonCoords.push(polygonCoords[0]);
          }

          source.setData({
              type: "Feature",
              geometry: {
                  type: "Polygon",
                  coordinates: [polygonCoords]
              },
              properties: {}
          });
      } else if (source && searchArea.radius > 0) {
          source.setData({ type: "Feature", geometry: { type: "Polygon", coordinates: [] }, properties: {} });
      }
  }, [searchArea, isMapLoaded]);

  // ズームジェスチャーのロジック
  useEffect(() => {
    const container = mapContainer.current;
    if (!container) return;

    const onTouchStart = (e: TouchEvent) => {
        if (e.touches.length !== 1 || isDrawing) return;

        const touch = e.touches[0];
        const screenWidth = window.innerWidth;
        const edgeThreshold = 60; 

        if (touch.clientX > screenWidth - edgeThreshold) {
            rightEdgeGestureRef.current = {
                isActive: true,
                startY: touch.clientY,
                startZoom: map.current?.getZoom() || 14
            };
            
            // UIを表示
            setShowZoomUI(true);
            
            // ツマミをタッチ位置へ移動
            if (zoomKnobRef.current) {
                zoomKnobRef.current.style.transform = `translateY(${touch.clientY}px)`;
            }

            if (navigator.vibrate) navigator.vibrate(10);
        }
    };

    const onTouchMove = (e: TouchEvent) => {
        if (!rightEdgeGestureRef.current.isActive || !map.current) return;
        if (e.cancelable) e.preventDefault();

        const touch = e.touches[0];
        const deltaY = rightEdgeGestureRef.current.startY - touch.clientY;
        const sensitivity = 0.015; 
        const newZoom = rightEdgeGestureRef.current.startZoom + (deltaY * sensitivity);
        
        map.current.setZoom(newZoom);

        // ツマミの位置を更新
        if (zoomKnobRef.current) {
            zoomKnobRef.current.style.transform = `translateY(${touch.clientY}px)`;
        }
    };

    const onTouchEnd = () => {
        rightEdgeGestureRef.current.isActive = false;
        // UIを非表示
        setShowZoomUI(false);
    };

    container.addEventListener('touchstart', onTouchStart, { passive: false });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd);
    container.addEventListener('touchcancel', onTouchEnd);

    return () => {
        container.removeEventListener('touchstart', onTouchStart);
        container.removeEventListener('touchmove', onTouchMove);
        container.removeEventListener('touchend', onTouchEnd);
        container.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [isDrawing]);

  const handleSelectHotel = (hotel: any) => {
      setActiveHotelId(hotel.id);
      setViewedHotelIds(prev => {
          const next = new Set(prev);
          next.add(hotel.id);
          return next;
      });

      setSelectedHotel(hotel);
      
      if (map.current) {
          map.current.flyTo({ 
              center: hotel.coordinates, 
              zoom: 16, 
              offset: [0, -window.innerHeight * 0.35], 
              duration: 1000 
          });
      }
      if (isExpanded) setIsExpanded(false);
  };

  const handleAddCandidate = (hotel: any) => {
      setPendingHotel(hotel);
  };

  const confirmAddHotel = (day: number) => {
      if (onAddSpot && pendingHotel) {
          onAddSpot({ 
              ...pendingHotel, 
              is_hotel: true, 
              votes: 0, 
              stay_time: 0, 
              status: 'hotel_candidate',
              day: day
          });
      }
      setPendingHotel(null);
  };

  const getAffiliateUrl = (hotel: any) => {
    let targetUrl = "";
    if (hotel.url && hotel.url.includes('rakuten.co.jp')) {
        targetUrl = hotel.url;
    } else {
        targetUrl = `https://hotel.travel.rakuten.co.jp/hotelinfo/plan/${hotel.id}?f_teikei=&f_heya_su=1&f_sort=min_charge`;
    }
    return targetUrl;
  };

  const rakutenHomeUrl = "https://travel.rakuten.co.jp/";

  const updateHotelMarkers = (hotelList: any[]) => {
      if (!map.current) return;
      hotelMarkersRef.current.forEach(m => m.remove());
      hotelMarkersRef.current = [];
      hotelList.forEach(hotel => {
          const el = document.createElement('div');
          
          const isActive = activeHotelId === hotel.id;
          const color = isActive ? '#EF4444' : '#3B82F6';
          const zIndex = isActive ? 99 : 5;

          const pricePerPerson = Math.round(hotel.price / Math.max(1, searchedAdults));
          const displayPrice = pricePerPerson >= 10000 
              ? `${(pricePerPerson/10000).toFixed(1)}万` 
              : `¥${pricePerPerson.toLocaleString()}`;

          el.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;z-index:${zIndex};cursor:pointer;"><div style="background:white;padding:2px 6px;border-radius:6px;font-size:10px;font-weight:bold;color:${color};box-shadow:0 2px 4px rgba(0,0,0,0.2);margin-bottom:2px;white-space:nowrap;border:1px solid ${color};">${displayPrice}</div><svg width="28" height="28" viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3" fill="white"></circle></svg></div>`;
          el.onclick = () => handleSelectHotel(hotel);
          
          const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
              .setLngLat(hotel.coordinates)
              .addTo(map.current!);
              
          hotelMarkersRef.current.push(marker);
      });
  };

  const ScatterPlot = () => {
    const paddingLeft = 40; const paddingBottom = 30; const paddingRight = 10; const paddingTop = 10;
    const width = 300; const height = 200; 
    
    const minRating = 3.0; const maxRating = 5.0;
    const prices = hotels.map(h => Math.round(h.price / Math.max(1, searchedAdults))).filter(p => p > 0);
    
    const minP = prices.length ? Math.min(...prices) * 0.9 : 0;
    const maxP = prices.length ? Math.max(...prices) * 1.1 : 30000;
    
    const maxReviews = useMemo(() => Math.max(...hotels.map(h => h.review_count || 0), 1), [hotels]);

    const getX = (rating: number) => paddingLeft + ((rating - minRating) / (maxRating - minRating)) * (width - paddingLeft - paddingRight);
    const getY = (price: number) => (height - paddingBottom) - ((price - minP) / (maxP - minP)) * (height - paddingBottom - paddingTop);
    
    const ratingTicks = [3.0, 3.5, 4.0, 4.5, 5.0];
    const priceTicks = [Math.floor(minP), Math.floor((minP + maxP) / 2), Math.floor(maxP)];

    return (
        <div className="relative w-full h-full p-2">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full font-sans overflow-visible">
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
                    const unitPrice = Math.round(h.price / Math.max(1, searchedAdults));
                    const y = getY(unitPrice);
                    
                    const isActive = activeHotelId === h.id;
                    const isAdded = spots.some(s => s.name === h.name);
                    const isViewed = viewedHotelIds.has(h.id);

                    let baseColor = "#3B82F6"; 
                    if (isAdded || isViewed) {
                        baseColor = "#8B5CF6"; 
                    }
                    if (isActive) {
                        baseColor = "#EF4444"; 
                    }

                    const reviewRatio = Math.min((h.review_count || 0) / maxReviews, 1);
                    const opacity = 0.3 + (reviewRatio * 0.7);

                    return (
                        <circle 
                            key={i} 
                            cx={x} 
                            cy={y} 
                            r={isActive ? 8 : 4} 
                            fill={baseColor} 
                            fillOpacity={opacity}
                            stroke="white" 
                            strokeWidth={1.5}
                            className="transition-all duration-300 cursor-pointer drop-shadow-sm hover:r-6" 
                            onClick={(e) => {
                                e.stopPropagation();
                                handleSelectHotel(h);
                            }} 
                        />
                    );
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
      
      setSearchArea({ 
          latitude: centerLat, 
          longitude: centerLng, 
          radius: Number(radiusKm.toFixed(2)),
          polygon: coords 
      });
      stopDrawing();
      setShowSettings(true);
  };

  const executeSearch = async () => {
    if (!searchArea) return alert("範囲を囲んでください");
    
    setSearchedAdults(conditions.adults);

    setIsLoading(true); setHotels([]); setSelectedHotel(null); setActiveHotelId(null);
    setShowSettings(false); 
    try {
        const mealTypeParam = conditions.mealType === 'none' ? undefined : conditions.mealType;

        const body = {
            latitude: searchArea.latitude, 
            longitude: searchArea.longitude, 
            radius: Number(searchArea.radius.toFixed(1)), 
            polygon: searchArea.polygon,
            max_price: conditions.budgetMax >= 50000 ? undefined : conditions.budgetMax,
            checkin_date: conditions.checkin, 
            checkout_date: conditions.checkout, 
            adult_num: conditions.adults,
            meal_type: mealTypeParam
        };
        
        console.log("Searching with:", body); 

        const res = await fetch(`${API_BASE_URL}/api/search_hotels_vacant`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        const data = await res.json();
        if (data.hotels?.length > 0) { 
            setHotels(data.hotels); 
            if (map.current) {
                const bounds = new mapboxgl.LngLatBounds();
                searchArea.polygon.forEach(coord => bounds.extend(coord as [number, number]));
                map.current.fitBounds(bounds, { padding: 80, duration: 1500 });
            }
        }
        else {
            // ▼▼▼ 修正: 見つからなかった場合、設定画面を再表示する ▼▼▼
            alert("条件に合う宿が見つかりませんでした。\n条件を変更して再検索してください。");
            setShowSettings(true);
            // ▲▲▲ 修正ここまで ▲▲▲
        }
    } catch (e) { 
        alert("通信エラーが発生しました"); 
        setShowSettings(true); 
    } finally { 
        setIsLoading(false); 
    }
  };

  const executeImport = async () => {
      if (!importUrl) return;
      setIsImporting(true);
      try {
          const res = await fetch(`${API_BASE_URL}/api/import_rakuten_hotel`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: importUrl })
          });
          const data = await res.json();
          if (data.spot) { 
              handleAddCandidate(data.spot); 
              setImportUrl(""); 
              setImportedHotel(data.spot);
          }
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
        
        setIsMapLoaded(true);

        map.current.addSource('draw-source', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } } });
        map.current.addLayer({ id: 'draw-line', type: 'line', source: 'draw-source', paint: { 'line-color': '#EF4444', 'line-width': 4, 'line-opacity': 0.8 } });
        
        map.current.addSource('search-area-source', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [] } } });
        map.current.addLayer({
            id: 'search-area-fill',
            type: 'fill',
            source: 'search-area-source',
            paint: {
                'fill-color': '#EF4444',
                'fill-opacity': 0.08 
            }
        });
        map.current.addLayer({
            id: 'search-area-line',
            type: 'line',
            source: 'search-area-source',
            paint: {
                'line-color': '#EF4444',
                'line-opacity': 0.4,
                'line-width': 1,
                'line-dasharray': [4, 2]
            }
        });

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

  return (
    <div className="relative w-full h-full bg-slate-50 flex flex-col font-sans overflow-hidden">
      
      {/* 1. マップセクション */}
      <div className={`absolute inset-0 z-0 transition-all duration-500 ${hotels.length > 0 ? 'h-1/2' : 'h-full'}`}>
         <div ref={mapContainer} className="w-full h-full" style={{ touchAction: isDrawing ? 'none' : 'auto' }} />
         
         {!selectedHotel && (
             <button 
                 onClick={isDrawing ? stopDrawing : startDrawing} 
                 className={`absolute top-28 right-6 w-14 h-14 rounded-2xl shadow-2xl flex items-center justify-center active:scale-90 transition-all z-10 ${
                     isDrawing ? 'bg-white text-gray-900' : 'bg-black text-white'
                 }`}
             >
                 {isDrawing ? <X size={24}/> : <PenTool size={24}/>}
             </button>
         )}
      </div>

      {/* 2. メイン操作パネル */}
      <div className={`absolute bottom-0 left-0 right-0 z-30 bg-white rounded-t-[2.5rem] shadow-[0_-10px_60px_rgba(0,0,0,0.15)] flex flex-col transition-all duration-500 overflow-hidden ${hotels.length > 0 ? 'h-1/2' : 'h-auto max-h-[85vh]'}`}>
          <div className="w-12 h-1.5 bg-gray-100 rounded-full mx-auto mt-4 mb-2 shrink-0" />
          <div className="flex-1 overflow-y-auto px-8 pb-32">
             {hotels.length === 0 ? (
                <div className="flex flex-col gap-6 pt-4 animate-in fade-in slide-in-from-bottom-4">
                    <div className="text-center space-y-2">
                        <div className="inline-block p-3 bg-blue-50 rounded-2xl text-blue-600 mb-2">
                            <BedDouble size={32} />
                        </div>
                        <h2 className="text-2xl font-black text-gray-800 tracking-tight">宿泊先を検討する</h2>
                        <p className="text-sm text-gray-500 font-medium leading-relaxed">
                            あなたの旅にぴったりの宿を見つけて、<br />候補リストに追加しましょう。
                        </p>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                        <div className="bg-white border border-gray-100 p-4 rounded-2xl shadow-sm flex items-start gap-3">
                            <div className="w-8 h-8 bg-black text-white rounded-full flex items-center justify-center font-bold text-sm shrink-0">1</div>
                            <div>
                                <p className="text-sm font-bold text-gray-800">範囲を囲って探す</p>
                                <p className="text-[11px] text-gray-500 leading-normal">右上のペンツールでマップ上のエリアを囲むと、その付近の空室状況を検索できます。</p>
                            </div>
                        </div>

                        <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-2xl shadow-sm flex items-start gap-3">
                            <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm shrink-0">2</div>
                            <div className="flex-1">
                                <p className="text-sm font-bold text-blue-900">楽天トラベルから直接取り込む</p>
                                <p className="text-[11px] text-blue-700/70 leading-normal mb-3">お気に入りの宿のURLを貼り付けるだけで、写真や詳細を自動でリストに追加できます。</p>
                                
                                <div className="flex gap-2">
                                    <input 
                                        type="text" 
                                        value={importUrl} 
                                        onChange={(e) => setImportUrl(e.target.value)} 
                                        placeholder="https://hotel.travel.rakuten.co.jp/..." 
                                        className="flex-1 bg-white border border-blue-200 rounded-xl px-3 py-2.5 text-xs outline-none focus:ring-2 focus:ring-blue-300 transition shadow-inner"
                                    />
                                    <button 
                                        onClick={executeImport} 
                                        disabled={isImporting || !importUrl} 
                                        className="bg-blue-600 text-white px-4 rounded-xl font-bold text-xs disabled:opacity-50 shadow-md active:scale-95 transition"
                                    >
                                        {isImporting ? <Loader2 size={16} className="animate-spin"/> : "追加"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <p className="text-[10px] font-black text-gray-400 text-center uppercase tracking-widest">Or Search on Web</p>
                        <a 
                            href={rakutenHomeUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            // onClickでログ送信
                            onClick={() => logAffiliateClick("楽天トラベルトップ", "hotel_search_banner")}
                            className="w-full bg-[#BF0000] text-white py-4 rounded-2xl font-black text-center flex items-center justify-center gap-3 shadow-lg active:scale-95 transition-transform"
                        >
                            楽天トラベルで探す <ExternalLink size={18}/>
                        </a>
                    </div>
                </div>
            ) : (
                  <div className="flex flex-col gap-6 pt-2 animate-in fade-in">
                      <div className="flex justify-between items-center">
                          <h3 className="text-xl font-black text-gray-800 flex items-center gap-2">
                              <TrendingUp size={22} className="text-blue-500"/> 
                              分析結果 
                              <span className="text-sm font-bold text-gray-500 ml-1">({hotels.length}件)</span>
                          </h3>
                          <button onClick={() => setShowSettings(true)} className="p-2 bg-slate-100 rounded-full text-gray-600"><SlidersHorizontal size={18}/></button>
                      </div>
                      <div className="w-full aspect-[4/3] bg-slate-50 rounded-[2rem] border border-gray-100 relative overflow-hidden shadow-inner shrink-0">
                          <ScatterPlot />
                      </div>
                      <div className="space-y-4 pb-12">
                          {hotels.slice(0, 8).map((hotel, i) => {
                              const unitPrice = Math.round(hotel.price / Math.max(1, searchedAdults));
                              return (
                                  <div key={i} className="bg-white p-4 rounded-2xl border border-gray-100 flex items-center gap-4 active:bg-slate-50 transition shadow-sm" onClick={() => handleSelectHotel(hotel)}>
                                      <div className="w-14 h-14 bg-slate-100 rounded-xl overflow-hidden shrink-0">
                                          {hotel.image_url ? <img src={hotel.image_url} className="w-full h-full object-cover" alt=""/> : <LinkIcon size={20} className="m-auto mt-4 text-gray-300"/>}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                          <h4 className="font-bold text-gray-800 text-xs truncate">{hotel.name}</h4>
                                          <p className="text-red-500 font-black text-sm">¥{unitPrice.toLocaleString()}<span className="text-[10px] text-gray-400 font-normal"> / 人</span></p>
                                      </div>
                                      <button onClick={(e)=>{e.stopPropagation(); handleAddCandidate(hotel)}} className="p-2 bg-blue-50 text-blue-600 rounded-full transition active:scale-90 shadow-sm"><Plus size={18}/></button>
                                  </div>
                              );
                          })}
                      </div>
                  </div>
              )}
          </div>
      </div>

      {/* 詳細カード */}
      {selectedHotel && (
          <div className="absolute inset-x-0 bottom-0 h-auto max-h-[85dvh] z-[100] bg-white/90 backdrop-blur-xl rounded-t-[2.5rem] shadow-[0_-20px_60px_rgba(0,0,0,0.3)] border-t border-white/50 animate-in slide-in-from-bottom-10 duration-500 flex flex-col relative">
              
              {/* ▼▼▼ 閉じるボタンを画像外に配置 ▼▼▼ */}
              <button 
                  onClick={() => setSelectedHotel(null)} 
                  className="absolute top-5 right-6 p-2.5 bg-slate-100/80 hover:bg-slate-200/80 backdrop-blur-md rounded-full text-gray-500 transition-all active:scale-90 z-50 shadow-sm"
              >
                  <X size={20}/>
              </button>

              <div className="w-12 h-1.5 bg-gray-300/50 rounded-full mx-auto mt-3 mb-1 shrink-0" />
              
              <div className="flex-1 overflow-y-auto px-6 pb-8 overscroll-contain">
                  {/* ▼▼▼ 修正: aspect-[4/3] に変更して写真の縦幅を確保 ▼▼▼ */}
                  <div className="relative w-full aspect-[4/3] rounded-[2rem] overflow-hidden shadow-xl mt-4 mb-5 group shrink-0">
                      {selectedHotel.image_url ? (
                          <img src={selectedHotel.image_url} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" alt=""/>
                      ) : (
                          <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-300"><LinkIcon size={48}/></div>
                      )}
                      
                      <div className="absolute bottom-3 left-3 flex gap-2">
                          <div className="flex items-center gap-1 bg-white/95 backdrop-blur-sm px-2.5 py-1 rounded-full shadow-lg border border-white/50">
                              <Star size={12} fill="#F59E0B" className="text-orange-500"/>
                              <span className="text-xs font-black text-gray-800">{selectedHotel.rating}</span>
                          </div>
                          {selectedHotel.review_count > 0 && (
                              <div className="flex items-center gap-1 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full text-white shadow-lg">
                                  <span className="text-[9px] font-bold tracking-wider">{selectedHotel.review_count} REVIEWS</span>
                              </div>
                          )}
                      </div>
                  </div>

                  <div className="space-y-5">
                      <div className="pr-8"> 
                          <h3 className="font-black text-gray-900 text-xl leading-tight mb-2">{selectedHotel.name}</h3>
                          <div className="flex items-center gap-1.5 text-gray-500 text-[10px] font-bold">
                              <MapPin size={12} />
                              <span className="truncate">{selectedHotel.description ? selectedHotel.description.substring(0, 30) + "..." : "エリア検索結果"}</span>
                          </div>
                      </div>

                      <div className="bg-gradient-to-br from-slate-50 to-slate-100 p-4 rounded-[1.5rem] border border-white shadow-sm flex items-center justify-between relative overflow-hidden shrink-0">
                          <div className="relative z-10">
                              <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest mb-0.5">Lowest Price</p>
                              <div className="flex items-baseline gap-1">
                                  <span className="font-black text-2xl text-gray-900">
                                      ¥{Math.round(selectedHotel.price / Math.max(1, searchedAdults)).toLocaleString()}
                                  </span>
                                  <span className="text-[10px] text-gray-400 font-bold">~ / 人</span>
                              </div>
                          </div>
                          <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm text-blue-600">
                              <DollarSign size={20} />
                          </div>
                      </div>

                      {selectedHotel.description && (
                          <div className="px-1">
                              <p className="text-xs text-gray-500 leading-relaxed font-medium line-clamp-3">
                                  {selectedHotel.description}
                              </p>
                          </div>
                      )}

                      <div className="flex gap-3 pt-2 pb-6">
                          <button 
                              onClick={() => { handleAddCandidate(selectedHotel); setSelectedHotel(null); }} 
                              className="flex-[2] bg-gray-900 text-white py-3.5 rounded-[1.25rem] font-bold text-sm active:scale-95 transition-all shadow-xl shadow-gray-200 flex items-center justify-center gap-2 hover:bg-gray-800"
                          >
                              <Plus size={18} strokeWidth={3}/> 
                              <span>候補に追加</span>
                          </button>
                          
                          <a 
                              href={getAffiliateUrl(selectedHotel)} 
                              target="_blank" 
                              onClick={() => logAffiliateClick(selectedHotel.name, "hotel_search_detail")}
                              className="flex-1 bg-white text-gray-900 py-3.5 rounded-[1.25rem] border border-gray-200 font-bold text-sm active:scale-95 transition-all shadow-sm flex items-center justify-center gap-2 hover:bg-gray-50"
                          >
                              <span className="text-[10px]">詳細</span>
                              <ExternalLink size={16}/>
                          </a>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* 3. 条件設定 */}
      {showSettings && (
          <div className="absolute inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end animate-in fade-in duration-300">
              <div className="bg-white w-full rounded-t-[2.5rem] p-8 shadow-2xl space-y-8 animate-in slide-in-from-bottom-10 max-h-[90vh] overflow-y-auto">
                  <div className="flex justify-between items-center"><h3 className="text-2xl font-black text-gray-800">Filters</h3><button onClick={() => setShowSettings(false)} className="p-2 bg-slate-100 rounded-full hover:bg-gray-200"><X size={20}/></button></div>
                  
                  {searchArea && searchArea.radius > 3.0 && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 flex items-start gap-3">
                          <AlertTriangle className="text-yellow-500 shrink-0 mt-0.5" size={20} />
                          <div className="text-xs text-yellow-800 font-bold leading-relaxed">
                              範囲が広すぎます（半径 {searchArea.radius}km）。<br/>
                              検索結果の精度が落ちる可能性がありますが、可能な限り多くの宿を検索します。
                          </div>
                      </div>
                  )}
                  
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

                      <div className="space-y-3">
                          <label className="text-[10px] font-black text-gray-400 ml-1 uppercase flex items-center gap-2"><Utensils size={14}/> Meal Plan</label>
                          <div className="flex gap-2 overflow-x-auto no-scrollbar">
                              {[
                                  { label: "2食付", value: 'half_board' }, // 1番目
                                  { label: "朝食付", value: 'breakfast' },
                                  { label: "素泊まり", value: 'room_only' },
                                  { label: "指定なし", value: 'none' } // 最後
                              ].map((opt) => (
                                  <button
                                      key={opt.value}
                                      onClick={() => setConditions({ ...conditions, mealType: opt.value as any })}
                                      className={`flex-1 py-3 px-2 rounded-xl font-bold text-xs transition-all whitespace-nowrap ${
                                          conditions.mealType === opt.value
                                              ? 'bg-blue-600 text-white shadow-lg'
                                              : 'bg-slate-50 text-gray-500 hover:bg-slate-100'
                                      }`}
                                  >
                                      {opt.label}
                                  </button>
                              ))}
                          </div>
                      </div>

                      <div className="space-y-1">
                          <div className="flex justify-between px-1"><label className="text-[10px] font-black text-gray-400 uppercase">1人1泊の予算</label><span className="text-sm font-black text-blue-600">{conditions.budgetMax >= 50000 ? "上限なし" : `¥${conditions.budgetMax.toLocaleString()}`}</span></div>
                          <input type="range" min="5000" max="50000" step="1000" value={conditions.budgetMax} onChange={(e) => setConditions({...conditions, budgetMax: parseInt(e.target.value)})} className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600"/>
                      </div>

                      <button onClick={executeSearch} disabled={isLoading} className="w-full bg-black text-white py-5 rounded-[2rem] font-black text-lg shadow-xl flex items-center justify-center gap-2 active:scale-95 transition-transform">
                          {isLoading ? <Loader2 className="animate-spin"/> : <><Search size={22}/> Search properties</>}
                      </button>
                  </div>
              </div>
          </div>
      )}
      
      {/* 宿泊日選択モーダル */}
      {pendingHotel && (
          <div className="absolute inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
              <div className="bg-white w-full max-w-sm rounded-[2rem] p-8 shadow-2xl relative flex flex-col gap-4">
                  <div className="text-center">
                      <h3 className="text-lg font-black text-gray-900 mb-1">いつ泊まりますか？</h3>
                      <p className="text-xs text-gray-500 font-bold truncate px-4">{pendingHotel.name}</p>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto pr-1">
                      <button 
                          onClick={() => confirmAddHotel(0)} 
                          className="w-full py-3 bg-gray-100 rounded-xl font-bold text-gray-500 hover:bg-gray-200 text-xs transition"
                      >
                          未定 (リストにとりあえず追加)
                      </button>
                      {Array.from({ length: travelDays }).map((_, i) => {
                          const dayNum = i + 1;
                          if (dayNum === travelDays) return null;

                          return (
                              <button 
                                  key={i} 
                                  onClick={() => confirmAddHotel(dayNum)} 
                                  className="w-full py-3 bg-orange-50 text-orange-600 border border-orange-100 rounded-xl font-bold text-sm hover:bg-orange-100 transition flex items-center justify-center gap-2"
                              >
                                  <BedDouble size={16}/> 
                                  Day {dayNum} - {dayNum + 1} <span className="text-[10px] opacity-70">({dayNum}泊目)</span>
                              </button>
                          );
                      })}
                  </div>

                  <button 
                      onClick={() => setPendingHotel(null)} 
                      className="w-full py-3 text-gray-400 font-bold text-xs hover:text-gray-600 transition mt-2"
                  >
                      キャンセル
                  </button>
              </div>
          </div>
      )}

      {importedHotel && !pendingHotel && (
          <div className="absolute inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
              <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-6 shadow-2xl relative flex flex-col items-center text-center animate-in zoom-in-95 duration-300">
                  <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4 shadow-sm">
                      <Check size={32} strokeWidth={3} />
                  </div>
                  <h3 className="text-xl font-black text-gray-900 mb-2">追加しました！</h3>
                  
                  <div className="w-full aspect-video rounded-2xl overflow-hidden bg-gray-100 mb-4 shadow-inner relative border border-gray-100">
                       {importedHotel.image_url ? (
                           <img src={importedHotel.image_url} className="w-full h-full object-cover" alt="" />
                       ) : (
                           <div className="w-full h-full flex items-center justify-center text-gray-300"><LinkIcon size={32}/></div>
                       )}
                       <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/60 to-transparent">
                           <p className="text-white font-bold text-xs truncate">{importedHotel.name}</p>
                       </div>
                  </div>
                  
                  <div className="flex gap-2 w-full">
                      <button 
                        onClick={() => setImportedHotel(null)} 
                        className="flex-1 bg-black text-white py-4 rounded-2xl font-bold hover:scale-[1.02] active:scale-95 transition shadow-lg"
                      >
                        OK
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* ズームインジケーターUI */}
      <div 
          className={`fixed top-0 right-0 bottom-0 w-16 z-[60] pointer-events-none transition-opacity duration-300 flex justify-end ${
              showZoomUI ? 'opacity-100' : 'opacity-0'
          }`}
      >
          {/* 背景の黒い帯 */}
          <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-black/40 to-transparent"></div>

          {/* 目盛り（Rail） */}
          <div className="h-full w-2 border-r border-white/30 mr-4 flex flex-col justify-between py-12 opacity-50">
              {Array.from({ length: 20 }).map((_, i) => (
                  <div key={i} className="w-1.5 h-px bg-white/50 self-end"></div>
              ))}
          </div>

          {/* 動くツマミ（Knob） */}
          <div 
              ref={zoomKnobRef}
              className="absolute top-0 right-2 w-auto h-0 flex items-center justify-end pr-2 will-change-transform"
              style={{ transform: 'translateY(0px)' }} // 初期値
          >
              {/* 指の横に出るラベル */}
              <div className="mr-3 bg-black/80 backdrop-blur text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-lg">
                  ZOOM
              </div>

              {/* ツマミ本体 */}
              <div className="w-8 h-8 -mr-2 bg-white rounded-full shadow-[0_0_15px_rgba(255,255,255,0.6)] flex items-center justify-center relative">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  {/* ピンガ（波紋）アニメーション */}
                  <div className="absolute inset-0 rounded-full border border-white animate-ping opacity-50"></div>
              </div>
          </div>
      </div>

    </div>
  );
}