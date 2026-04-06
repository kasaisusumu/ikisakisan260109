"use client";

import { supabase } from '@/lib/supabase';
import { useState, useMemo, useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import HotelCompareView from './HotelCompareView';
import RadarChart from './RadarChart'; // ※パスはフォルダ構成に合わせて微調整してください（例: '@/components/RadarChart'）
import { 
  Search, ExternalLink, MapPin, ArrowLeft,
  X, TrendingUp, DollarSign,
  Star, Loader2, PenTool, Trash2, Plus, Calendar, Users, SlidersHorizontal, Link as LinkIcon, Download, ChevronUp, ChevronDown, Check, AlertTriangle, BedDouble,
  Utensils , Info, Map as MapIcon
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

// === レーダーチャート用コンポーネントを追加 ===


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
    // ▼▼▼ この3行を追加 ▼▼▼
    minRating: number;
    minReviewCount: number;
    hotelType: 'all' | 'hotel' | 'ryokan';
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
  isTrial?: boolean;
  onBack?: () => void;
}

export default function HotelListView({ 
  spots, spotVotes, currentUser, onAddSpot, roomId, initialSearchArea, travelDays, 
  isTrial, onBack, onPreviewSpot, onAutoSearch 
}: Props) {
  
  const logAffiliateClick = async (spotName: string, source: string) => {
    if (isTrial || !roomId) return; 
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

  const [displayDay, setDisplayDay] = useState(0);

  const [reviewModalData, setReviewModalData] = useState<{ spot: any, key: string, label: string } | null>(null);

  // 既存のStateの下あたりに追加
const [fetchingSpotIds, setFetchingSpotIds] = useState<Set<string>>(new Set());
const [detailModalHotel, setDetailModalHotel] = useState<any>(null);

// ▼ 既存のStateの下に追加
  const [showMapInResult, setShowMapInResult] = useState(false);

  // ▼ 地図の表示・非表示が切り替わったときにMapboxをリサイズして崩れを防ぐ
  useEffect(() => {
      if (map.current) {
          setTimeout(() => map.current?.resize(), 400); // アニメーション終了後にリサイズ
      }
  }, [hotels.length, showMapInResult]);

  const rightEdgeGestureRef = useRef({
      isActive: false,
      startY: 0,
      startZoom: 0
  });
  const [showZoomUI, setShowZoomUI] = useState(false);
  const zoomKnobRef = useRef<HTMLDivElement>(null);

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
          // ▼▼▼ この3行を追加 ▼▼▼
          minRating: 0,
          minReviewCount: 0,
          hotelType: 'all' as const,
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

  useEffect(() => {
      if (!isTrial && roomId) { 
          localStorage.setItem(`rh_hotel_conditions_${roomId}`, JSON.stringify(conditions));
      }
  }, [conditions, roomId, isTrial]);

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
            
            setShowZoomUI(true);
            
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

        if (zoomKnobRef.current) {
            zoomKnobRef.current.style.transform = `translateY(${touch.clientY}px)`;
        }
    };

    const onTouchEnd = () => {
        rightEdgeGestureRef.current.isActive = false;
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

  
const handleSelectHotel = async (hotel: any) => {
    setActiveHotelId(hotel.id);
    
    // viewedHotelIds に追加（これでカードが蓄積されます）
    setViewedHotelIds(prev => {
        const next = new Set(prev);
        next.add(hotel.id);
        return next;
    });

    if (map.current) {
        map.current.flyTo({ 
            center: hotel.coordinates, 
            zoom: 16, 
            offset: [0, -window.innerHeight * 0.1], // モーダルがフルスクリーンではないので少し下げる
            duration: 1000 
        });
    }
    if (isExpanded) setIsExpanded(false);

    // ▼ レーダーチャート用の詳細データがなければ取得する処理
    if (!hotel.detailed_ratings && !fetchingSpotIds.has(hotel.id)) {
        setFetchingSpotIds(prev => new Set([...prev, hotel.id]));
        try {
            const res = await fetch(`${API_BASE_URL}/api/import_rakuten_hotel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: `https://hotel.travel.rakuten.co.jp/hotelinfo/plan/${hotel.id}` })
            });
            if (res.ok) {
                const data = await res.json();
                if (data.spot && data.spot.detailed_ratings) {
                    // 該当ホテルのデータを更新
                    setHotels(prev => prev.map(h => 
                        h.id === hotel.id ? { ...h, detailed_ratings: data.spot.detailed_ratings, comment: data.spot.comment } : h
                    ));
                }
            }
        } catch (e) {
            console.error(e);
        } finally {
            setFetchingSpotIds(prev => {
                const next = new Set(prev);
                next.delete(hotel.id);
                return next;
            });
        }
    }
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
    let y1, m1, d1, y2, m2, d2;
    if (conditions.checkin && conditions.checkout) {
        const cIn = new Date(conditions.checkin);
        const cOut = new Date(conditions.checkout);
        y1 = cIn.getFullYear();
        m1 = cIn.getMonth() + 1;
        d1 = cIn.getDate();
        y2 = cOut.getFullYear();
        m2 = cOut.getMonth() + 1;
        d2 = cOut.getDate();
    } else {
        const today = new Date();
        today.setDate(today.getDate() + 30);
        y1 = today.getFullYear();
        m1 = today.getMonth() + 1;
        d1 = today.getDate();
        const tmr = new Date(today);
        tmr.setDate(tmr.getDate() + 1);
        y2 = tmr.getFullYear();
        m2 = tmr.getMonth() + 1;
        d2 = tmr.getDate();
    }
    
    const otonaSu = conditions.adults || 2;
    const hotelId = hotel.id;

    const paramString = `f_syu=&f_teikei=&f_campaign=&f_flg=PLAN&f_otona_su=${otonaSu}&f_heya_su=1&f_s1=0&f_s2=0&f_y1=0&f_y2=0&f_y3=0&f_y4=0&f_kin=&f_nen1=${y1}&f_tuki1=${m1}&f_hi1=${d1}&f_nen2=${y2}&f_tuki2=${m2}&f_hi2=${d2}&f_kin2=&f_hak=&f_tel=&f_tscm_flg=&f_p_no=&f_custom_code=&f_search_type=&f_static=1&f_tel=&f_service=&f_rm_equip=&f_sort=minNo`;

    if (hotelId) {
         return `https://hotel.travel.rakuten.co.jp/hotelinfo/plan/${hotelId}?${paramString}`;
    }
    
    return `https://search.travel.rakuten.co.jp/ds/hotel/search?f_query=${encodeURIComponent(hotel.name)}&${paramString}`;
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
    
   // 1. 横軸の最小値を、検索条件（または実際の最低評価）に合わせて動的に変更
    const baseMinRating = conditions.minRating > 0 ? conditions.minRating : 3.0;
    // 念のため、実際の検索結果の中にベースより低い評価があればそれに合わせる（見切れ防止）
    const actualMinRating = hotels.length > 0 ? Math.min(...hotels.map(h => h.rating || 3.0)) : 3.0;
    const minRating = Math.min(baseMinRating, actualMinRating); 
    const maxRating = 5.0;

    const prices = hotels.map(h => Math.round(h.price / Math.max(1, searchedAdults))).filter(p => p > 0);
    
    const minP = prices.length ? Math.min(...prices) * 0.9 : 0;
    const maxP = prices.length ? Math.max(...prices) * 1.1 : 30000;
    
    const maxReviews = useMemo(() => Math.max(...hotels.map(h => h.review_count || 0), 1), [hotels]);

    // プロットが左にはみ出さないように Math.max でガード
    const getX = (rating: number) => paddingLeft + ((Math.max(rating, minRating) - minRating) / (maxRating - minRating)) * (width - paddingLeft - paddingRight);
    const getY = (price: number) => (height - paddingBottom) - ((price - minP) / (maxP - minP)) * (height - paddingBottom - paddingTop);
    
    // 2. 最小値に合わせて、メモリ（縦線の間隔と数値）を最適化
    let ratingTicks: number[] = [];
    if (minRating >= 4.5) {
        ratingTicks = [4.5, 4.6, 4.7, 4.8, 4.9, 5.0]; // 0.1刻み
    } else if (minRating >= 4.0) {
        ratingTicks = [4.0, 4.2, 4.4, 4.6, 4.8, 5.0]; // 0.2刻み
    } else if (minRating >= 3.5) {
        ratingTicks = [3.5, 3.8, 4.1, 4.4, 4.7, 5.0]; // 0.3刻み
    } else {
        ratingTicks = [3.0, 3.5, 4.0, 4.5, 5.0];      // 0.5刻み（デフォルト）
    }
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

    setIsLoading(true); setHotels([]); setActiveHotelId(null); setViewedHotelIds(new Set()); // 追加
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
            meal_type: mealTypeParam,
            // ▼▼▼ APIへの送信パラメータに追加 ▼▼▼
            min_rating: conditions.minRating > 0 ? conditions.minRating : undefined,
            min_review_count: conditions.minReviewCount > 0 ? conditions.minReviewCount : undefined,
            hotel_type: conditions.hotelType !== 'all' ? conditions.hotelType : undefined,
        };
        
        console.log("Searching with:", body); 

        const res = await fetch(`${API_BASE_URL}/api/search_hotels_vacant`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        const data = await res.json();
        
        if (data.hotels?.length > 0) { 
            // ▼▼▼ フロントエンドでの絞り込み（API側が未対応の場合の保険） ▼▼▼
            let filteredHotels = data.hotels;
            
            if (conditions.minRating > 0) {
                filteredHotels = filteredHotels.filter((h: any) => (h.rating || 0) >= conditions.minRating);
            }
            if (conditions.minReviewCount > 0) {
                filteredHotels = filteredHotels.filter((h: any) => (h.review_count || 0) >= conditions.minReviewCount);
            }
            if (conditions.hotelType === 'hotel') {
                filteredHotels = filteredHotels.filter((h: any) => !h.name.includes('旅館') && !h.name.includes('民宿'));
            } else if (conditions.hotelType === 'ryokan') {
                filteredHotels = filteredHotels.filter((h: any) => h.name.includes('旅館') || h.name.includes('民宿') || h.name.includes('和') || h.name.includes('温泉'));
            }
            // ▲▲▲ 追加ここまで ▲▲▲

            if (filteredHotels.length > 0) {
                setHotels(filteredHotels); 
                if (map.current) {
                    const bounds = new mapboxgl.LngLatBounds();
                    searchArea.polygon.forEach(coord => bounds.extend(coord as [number, number]));
                    map.current.fitBounds(bounds, { padding: 80, duration: 1500 });
                }
            } else {
                alert("条件（評価やレビュー数など）に合う宿が範囲内に見つかりませんでした。");
                setShowSettings(true);
            }
        }
        else {
            alert("条件に合う宿が見つかりませんでした。\n条件を変更して再検索してください。");
            setShowSettings(true);
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
      
    {isTrial && onBack && (
        <div className="absolute top-4 left-4 z-50">
            <button onClick={onBack} className="w-10 h-10 bg-white/90 backdrop-blur rounded-full flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition">
                <ArrowLeft size={20} className="text-gray-700"/>
            </button>
        </div>
    )}

      {/* 上半分：マップエリア */}
      {/* 修正箇所: h-1/2 の部分を (showMapInResult ? 'h-1/2' : 'h-0') に変更 */}
      <div className={`absolute inset-0 z-0 transition-all duration-500 ${hotels.length > 0 ? (showMapInResult ? 'h-1/2' : 'h-0') : 'h-full'}`}>
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

      {/* 下半分（または全画面）：検索結果・メニューエリア */}
      {/* 修正箇所: rounded-t や h-1/2 の条件分岐を変更 */}
      <div className={`absolute bottom-0 left-0 right-0 z-30 bg-white shadow-[0_-10px_60px_rgba(0,0,0,0.15)] flex flex-col transition-all duration-500 overflow-hidden ${
          hotels.length > 0 
          ? (showMapInResult ? 'h-1/2 rounded-t-[2.5rem]' : 'h-full rounded-none pt-4') 
          : 'h-auto max-h-[85vh] rounded-t-[2.5rem]'
      }`}>      
          <div className="w-12 h-1.5 bg-gray-100 rounded-full mx-auto mt-4 mb-2 shrink-0" />
          
          <div className="flex-1 overflow-y-auto px-8 pb-32">
            {hotels.length === 0 ? (
                (() => {
                    const allAddedHotels = spots.filter(s => 
                        s.status === 'hotel_candidate' || 
                        (s.status === 'confirmed' && (s.is_hotel || isHotel(s.name)))
                    );

                    if (allAddedHotels.length > 0) {
                        const filteredByDay = allAddedHotels.filter(s => (s.day || 0) === displayDay);

                        return (
                            <div className="pt-20 animate-in fade-in">
                                
                                <div className="flex gap-2 overflow-x-auto no-scrollbar mb-8 pb-2 mask-gradient">
                                    <button 
                                        onClick={() => setDisplayDay(0)}
                                        className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition border ${displayDay === 0 ? 'bg-orange-500 text-white border-orange-500 shadow-md' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                                    >
                                        未定 ({allAddedHotels.filter(s => !s.day || s.day === 0).length})
                                    </button>
                                    {Array.from({ length: travelDays }).map((_, i) => {
                                        const d = i + 1;
                                        if (d === travelDays) return null;
                                        const count = allAddedHotels.filter(s => s.day === d).length;
                                        return (
                                            <button 
                                                key={d}
                                                onClick={() => setDisplayDay(d)}
                                                className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition border ${displayDay === d ? 'bg-orange-500 text-white border-orange-500 shadow-md' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                                            >
                                                Day {d}-{d+1} ({count})
                                            </button>
                                        );
                                    })}
                                </div>

                                {filteredByDay.length > 0 ? (
                                    <HotelCompareView 
                                        spots={filteredByDay} 
                                        onSelectHotel={(spot) => onPreviewSpot && onPreviewSpot(spot)} 
                                        adultNum={searchedAdults}
                                    />
                                ) : (
                                    <div className="text-center py-12 bg-slate-50 rounded-[2rem] border border-dashed border-gray-200 mb-4">
                                        <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm">
                                            <Calendar className="text-gray-300" size={24}/>
                                        </div>
                                        <p className="text-xs text-gray-400 font-bold">この日の宿はまだ追加されていません</p>
                                    </div>
                                )}
                                
                                <div className="mt-4 px-2">
                                    <button 
                                        onClick={() => setShowSettings(true)}
                                        className="w-full bg-slate-100 text-gray-600 py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-200 transition"
                                    >
                                        <Search size={18}/> 新しい条件で宿を検索する
                                    </button>
                                </div>
                            </div>
                        );
                    }

                    return (
                        <div className="flex flex-col gap-6 pt-16 animate-in fade-in slide-in-from-bottom-4">
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

                                {!isTrial && (
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
                                )}
                            </div>

                            <div className="space-y-3 pb-10">
                                <p className="text-[10px] font-black text-gray-400 text-center uppercase tracking-widest">Or Search on Web</p>
                                <a 
                                    href={rakutenHomeUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    onClick={() => logAffiliateClick("楽天トラベルトップ", "hotel_search_banner")}
                                    className="w-full bg-[#BF0000] text-white py-4 rounded-2xl font-black text-center flex items-center justify-center gap-3 shadow-lg active:scale-95 transition-transform"
                                >
                                    楽天トラベルで探す <ExternalLink size={18}/>
                                </a>
                            </div>
                        </div>
                    );
                })()
            ) : (
                <div className="flex flex-col gap-6 pt-20 animate-in fade-in pb-10">
                    
<div className="flex justify-between items-center">
    <h3 className="text-xl font-black text-gray-800 flex items-center gap-2">
        <TrendingUp size={22} className="text-blue-500"/> 
        分析結果 
        <span className="text-sm font-bold text-gray-500 ml-1">({hotels.length}件)</span>
    </h3>
    <div className="flex items-center gap-2">
        {/* ▼ 地図切り替えボタンを追加 */}
        <button 
            onClick={() => setShowMapInResult(!showMapInResult)} 
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold flex items-center gap-1.5 transition-colors ${showMapInResult ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 text-gray-600 hover:bg-slate-200'}`}
        >
            <MapIcon size={14}/> {showMapInResult ? '地図を隠す' : '地図で表示'}
        </button>
        {/* ▲ ここまで */}
        <button onClick={() => setShowSettings(true)} className="p-2 bg-slate-100 rounded-full text-gray-600 hover:bg-slate-200 transition-colors"><SlidersHorizontal size={18}/></button>
    </div>
</div>
                    <div className="w-full aspect-[4/3] bg-slate-50 rounded-[2rem] border border-gray-100 relative overflow-hidden shadow-inner shrink-0">
                        <ScatterPlot />
                    </div>
                   

{/* 蓄積されたホテルカードの横スクロール表示 */}
{viewedHotelIds.size > 0 ? (
    <div className="flex gap-4 overflow-x-auto px-2 pb-4 no-scrollbar mask-gradient" style={{ scrollBehavior: 'smooth' }}>
        {/* 新しくクリックしたものが一番左に来るように reverse() しています */}
        {Array.from(viewedHotelIds).reverse().map((id) => {
            const hotel = hotels.find(h => h.id === id);
            if (!hotel) return null;
            
            const unitPrice = Math.round(hotel.price / Math.max(1, searchedAdults));
            const isSelected = activeHotelId === hotel.id;
            const isLoading = fetchingSpotIds.has(hotel.id);
            const targetUrl = getAffiliateUrl(hotel);

            return (
                <div 
                    key={hotel.id} 
                    className={`min-w-[260px] bg-white rounded-3xl p-4 flex flex-col gap-4 relative cursor-pointer active:scale-[0.98] transition-all duration-300 ${
                        isSelected 
                        ? 'border-2 border-red-500 shadow-md ring-2 ring-red-100 transform -translate-y-1'
                        : 'border border-gray-100 shadow-sm'
                    }`}
                    onClick={() => handleSelectHotel(hotel)}
                >
                    <div className="w-full h-32 bg-gray-100 rounded-2xl overflow-hidden shrink-0 relative">
                        {hotel.image_url ? (
                            <img src={hotel.image_url} className="w-full h-full object-cover" alt="" />
                        ) : (
                            <div className="flex h-full items-center justify-center text-gray-300"><BedDouble size={32}/></div>
                        )}
                        {hotel.rating > 0 && (
                            <div className={`absolute top-2 right-2 backdrop-blur-md text-white px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 ${isSelected ? 'bg-red-500/90' : 'bg-black/60'}`}>
                                <Star size={10} className="text-yellow-400" fill="currentColor"/> {hotel.rating}
                            </div>
                        )}
                    </div>

                    <div>
                        <h4 className={`font-black text-sm line-clamp-2 leading-tight mb-1 ${isSelected ? 'text-red-600' : 'text-gray-800'}`}>{hotel.name}</h4>
                        <div className="flex items-center gap-1 text-[10px] text-gray-400 font-bold mb-2">
                            <MapPin size={10} className="shrink-0"/> <span className="truncate">{hotel.description || "エリア検索結果"}</span>
                        </div>
                        {hotel.price > 0 && (
                            <p className="text-orange-500 font-black text-lg leading-none mt-1">
                                ¥{unitPrice.toLocaleString()}<span className="text-[10px] text-gray-400 font-bold ml-1">~ /人</span>
                            </p>
                        )}
                    </div>

                    {/* レーダーチャート */}
                    <div className={`flex items-center justify-center rounded-2xl py-2 h-[160px] transition-colors ${isSelected ? 'bg-red-50' : 'bg-gray-50/50'}`}>
                       <RadarChart ratings={hotel.detailed_ratings} color={isSelected ? "#EF4444" : "#F97316"} isLoading={isLoading} onLabelClick={(key, label) => setReviewModalData({ spot: hotel, key, label })} /> </div>

                    <div className="flex gap-2 mt-auto pt-2">
                        <button 
                            onClick={(e) => { e.stopPropagation(); setDetailModalHotel(hotel); }}
                            className="flex-[1] bg-gray-800 text-white py-3 rounded-xl font-bold text-[11px] flex items-center justify-center gap-1 hover:bg-gray-700 transition-colors"
                        >
                            <Info size={14} /> 詳細
                        </button>
                        <button 
                            onClick={(e) => { e.stopPropagation(); handleAddCandidate(hotel); }}
                            className="flex-[1.2] bg-blue-600 text-white py-3 rounded-xl font-bold text-[11px] flex items-center justify-center gap-1 hover:bg-blue-700 transition-colors"
                        >
                            <Plus size={14} /> 候補に追加
                        </button>
                    </div>
                </div>
            );
        })}
    </div>
) : (
    <div className="text-center py-8 bg-slate-50/50 rounded-3xl border border-dashed border-gray-200 mt-2 mx-2">
        <p className="text-[11px] text-gray-400 font-bold leading-relaxed">
            上のグラフの点やマップのピンをタップすると<br/>ここにホテルの比較カードが追加されます
        </p>
    </div>
)}
                </div>
            )}
          </div>
      </div>

      

{detailModalHotel && (
    <div 
        className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in"
        onClick={() => setDetailModalHotel(null)}
    >
        <div 
            className="bg-gray-50 w-full sm:max-w-md h-[85vh] sm:h-auto sm:max-h-[90vh] rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-8 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
        >
            <div className="w-full h-56 relative shrink-0 bg-gray-200">
                <button 
                    onClick={() => setDetailModalHotel(null)}
                    className="absolute top-4 left-4 z-10 bg-black/50 backdrop-blur-md px-4 py-2 rounded-full flex items-center gap-2 text-white hover:bg-black/70 transition-colors text-xs font-bold shadow-lg"
                >
                    <ArrowLeft size={16} /> 戻る
                </button>

                {detailModalHotel.image_url ? (
                    <img src={detailModalHotel.image_url} className="w-full h-full object-cover" alt="" />
                ) : (
                    <div className="flex h-full items-center justify-center text-gray-400"><BedDouble size={48}/></div>
                )}
                
                <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-md text-white px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg">
                    <Star size={12} className="text-yellow-400" fill="currentColor"/> 
                    {detailModalHotel.rating > 0 ? detailModalHotel.rating : "評価なし"}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6">
                <div>
                    <h3 className="text-xl font-black text-gray-800 leading-tight mb-2">{detailModalHotel.name}</h3>
                    <div className="flex items-start gap-1.5 text-xs text-gray-500 font-medium mb-3">
                        <MapPin size={14} className="shrink-0 mt-0.5 text-orange-500"/> 
                        <span>{detailModalHotel.description}</span>
                    </div>
                    {detailModalHotel.price > 0 && (
                        <p className="text-orange-600 font-black text-2xl leading-none">
                            ¥{Math.round(detailModalHotel.price / Math.max(1, searchedAdults)).toLocaleString()}<span className="text-xs text-gray-400 font-bold ml-1">~ /人</span>
                        </p>
                    )}
                </div>

                <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                    <h4 className="text-xs font-bold text-gray-500 mb-2 flex items-center gap-1"><TrendingUp size={14}/> 評価バランス</h4>
                    <div className="flex justify-center h-[180px]">
                      <RadarChart ratings={detailModalHotel.detailed_ratings} color="#F97316" isLoading={fetchingSpotIds.has(detailModalHotel.id)} onLabelClick={(key, label) => setReviewModalData({ spot: detailModalHotel, key, label })} /> </div>
                </div>

                {detailModalHotel.comment && (
                    <div className="bg-orange-50/50 rounded-2xl p-4 border border-orange-100">
                        <h4 className="text-xs font-bold text-orange-800 mb-2 flex items-center gap-1"><Info size={14}/> プラン・ホテルの特徴</h4>
                        <p className="text-sm text-gray-700 leading-relaxed font-medium whitespace-pre-wrap">
                            {detailModalHotel.comment.replace(/<[^>]*>?/gm, '')}
                        </p>
                    </div>
                )}
                <div className="h-4"></div>
            </div>

            <div className="p-4 bg-white border-t border-gray-100 shrink-0 flex gap-2">
                {!isTrial && (
                    <button 
                        onClick={() => { handleAddCandidate(detailModalHotel); setDetailModalHotel(null); }} 
                        className="flex-[1] bg-gray-900 text-white py-3.5 rounded-2xl font-bold text-sm active:scale-95 transition-all shadow-lg flex items-center justify-center gap-2 hover:bg-gray-800"
                    >
                        <Plus size={18} strokeWidth={3}/> <span>候補に追加</span>
                    </button>
                )}
                <a 
                    href={getAffiliateUrl(detailModalHotel)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => logAffiliateClick(detailModalHotel.name, "hotel_search_detail")}
                    className={`bg-white text-gray-900 py-3.5 rounded-2xl border border-gray-200 font-bold text-sm active:scale-95 transition-all shadow-sm flex items-center justify-center gap-2 hover:bg-gray-50 ${isTrial ? 'w-full' : 'flex-[1]'}`}
                >
                    <span className="text-xs">楽天で見る</span><ExternalLink size={16}/>
                </a>
            </div>
        </div>
    </div>
)}

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
                                  { label: "2食付", value: 'half_board' },
                                  { label: "朝食付", value: 'breakfast' },
                                  { label: "素泊まり", value: 'room_only' },
                                  { label: "指定なし", value: 'none' }
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

                      {/* ▼▼▼ ここから追加：評価・レビュー数・施設タイプ ▼▼▼ */}
                      <div className="space-y-3">
                          <label className="text-[10px] font-black text-gray-400 ml-1 uppercase flex items-center gap-2"><Star size={14}/> Minimum Rating</label>
                          <div className="flex gap-2 overflow-x-auto no-scrollbar">
                              {[
                                  { label: "指定なし", value: 0 },
                                  { label: "★ 3.5+", value: 3.5 },
                                  { label: "★ 4.0+", value: 4.0 },
                                  { label: "★ 4.5+", value: 4.5 }
                              ].map((opt) => (
                                  <button
                                      key={opt.value}
                                      onClick={() => setConditions({ ...conditions, minRating: opt.value })}
                                      className={`flex-1 py-3 px-2 rounded-xl font-bold text-xs transition-all whitespace-nowrap ${
                                          conditions.minRating === opt.value
                                              ? 'bg-blue-600 text-white shadow-lg'
                                              : 'bg-slate-50 text-gray-500 hover:bg-slate-100'
                                      }`}
                                  >
                                      {opt.label}
                                  </button>
                              ))}
                          </div>
                      </div>

                      <div className="space-y-3">
                          <label className="text-[10px] font-black text-gray-400 ml-1 uppercase flex items-center gap-2"><PenTool size={14}/> Review Count</label>
                          <div className="flex gap-2 overflow-x-auto no-scrollbar">
                              {[
                                  { label: "指定なし", value: 0 },
                                  { label: "10件+", value: 10 },
                                  { label: "50件+", value: 50 },
                                  { label: "100件+", value: 100 }
                              ].map((opt) => (
                                  <button
                                      key={opt.value}
                                      onClick={() => setConditions({ ...conditions, minReviewCount: opt.value })}
                                      className={`flex-1 py-3 px-2 rounded-xl font-bold text-xs transition-all whitespace-nowrap ${
                                          conditions.minReviewCount === opt.value
                                              ? 'bg-blue-600 text-white shadow-lg'
                                              : 'bg-slate-50 text-gray-500 hover:bg-slate-100'
                                      }`}
                                  >
                                      {opt.label}
                                  </button>
                              ))}
                          </div>
                      </div>

                      <div className="space-y-3">
                          <label className="text-[10px] font-black text-gray-400 ml-1 uppercase flex items-center gap-2"><BedDouble size={14}/> Property Type</label>
                          <div className="flex gap-2 overflow-x-auto no-scrollbar">
                              {[
                                  { label: "すべて", value: 'all' },
                                  { label: "ホテル", value: 'hotel' },
                                  { label: "旅館・和室", value: 'ryokan' }
                              ].map((opt) => (
                                  <button
                                      key={opt.value}
                                      onClick={() => setConditions({ ...conditions, hotelType: opt.value as any })}
                                      className={`flex-1 py-3 px-2 rounded-xl font-bold text-xs transition-all whitespace-nowrap ${
                                          conditions.hotelType === opt.value
                                              ? 'bg-blue-600 text-white shadow-lg'
                                              : 'bg-slate-50 text-gray-500 hover:bg-slate-100'
                                      }`}
                                  >
                                      {opt.label}
                                  </button>
                              ))}
                          </div>
                      </div>
                      {/* ▲▲▲ 追加ここまで ▲▲▲ */}

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
      
      {pendingHotel && (
          <div className="absolute inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
              <div className="bg-white w-full max-w-sm rounded-[2rem] p-8 shadow-2xl relative flex flex-col gap-4">
                  <div className="text-center">
                      <h3 className="text-lg font-black text-gray-900 mb-1">いつ泊まりますか？</h3>
                      <p className="text-xs text-gray-500 font-bold truncate px-4">{pendingHotel.name}</p>
                  </div>
                  <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto pr-1">
                      <button onClick={() => confirmAddHotel(0)} className="w-full py-3 bg-gray-100 rounded-xl font-bold text-gray-500 hover:bg-gray-200 text-xs transition">未定</button>
                      {Array.from({ length: travelDays }).map((_, i) => {
                          const d = i + 1; if (d === travelDays) return null;
                          return (
                              <button key={i} onClick={() => confirmAddHotel(d)} className="w-full py-3 bg-orange-50 text-orange-600 border border-orange-100 rounded-xl font-bold text-sm hover:bg-orange-100 transition flex items-center justify-center gap-2">
                                  <BedDouble size={16}/> Day {d} - {d + 1}
                              </button>
                          );
                      })}
                  </div>
                  <button onClick={() => setPendingHotel(null)} className="w-full py-3 text-gray-400 font-bold text-xs hover:text-gray-600 transition mt-2">キャンセル</button>
              </div>
          </div>
      )}

      <div className={`fixed top-0 right-0 bottom-0 w-16 z-[60] pointer-events-none transition-opacity duration-300 flex justify-end ${showZoomUI ? 'opacity-100' : 'opacity-0'}`}>
          <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-black/40 to-transparent"></div>
          <div ref={zoomKnobRef} className="absolute top-0 right-2 w-auto h-0 flex items-center justify-end pr-2 will-change-transform" style={{ transform: 'translateY(0px)' }}>
              <div className="w-8 h-8 -mr-2 bg-white rounded-full shadow-lg flex items-center justify-center relative"><div className="w-2 h-2 bg-blue-500 rounded-full"></div></div>
          </div>
      </div>

      {/* ▼▼▼ ここから追加：検索中のローディング画面 ▼▼▼ */}
      {isLoading && (
          <div className="absolute inset-0 z-[120] bg-slate-50/70 backdrop-blur-md flex flex-col items-center justify-center animate-in fade-in duration-300">
              <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl flex flex-col items-center gap-5 border border-gray-100">
                  <div className="relative flex items-center justify-center w-16 h-16 bg-blue-50 rounded-2xl">
                      <Loader2 className="text-blue-600 animate-spin absolute" size={32} />
                      <Search className="text-blue-600/50" size={16} />
                  </div>
                  <div className="text-center">
                      <p className="text-xl font-black text-gray-800 tracking-tight">空室を検索中...</p>
                      <p className="text-[11px] font-bold text-gray-500 mt-2">条件に合う最高の宿を探しています</p>
                  </div>
              </div>
          </div>
      )}
      {/* ▲▲▲ 追加ここまで ▲▲▲ */}

      {/* ▼ レビュー確認用のモーダル ▼ */}
            {reviewModalData && (
                <div 
                    className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in p-4"
                    onClick={() => setReviewModalData(null)}
                >
                    <div 
                        className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl flex flex-col gap-4 animate-in zoom-in-95"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div>
                            <h3 className="font-black text-gray-800 text-lg leading-tight mb-1">{reviewModalData.spot.name}</h3>
                            <p className="text-sm font-bold text-orange-600">
                                「{reviewModalData.label}」に関する評価・レビュー
                            </p>
                        </div>

                        <div className="bg-gray-50 rounded-2xl p-4 text-sm text-gray-600 border border-gray-100 min-h-[120px] flex flex-col items-center justify-center text-center gap-2">
                            <p className="font-bold text-gray-400">詳細なテキストレビューデータは<br/>楽天トラベルでご確認いただけます</p>
                        </div>

                        <div className="flex gap-2 mt-2">
                            <button 
                                onClick={() => setReviewModalData(null)}
                                className="flex-1 bg-gray-100 text-gray-600 py-3.5 rounded-xl font-bold text-sm hover:bg-gray-200 transition-colors"
                            >
                                閉じる
                            </button>
                            <a 
                                href={`https://hotel.travel.rakuten.co.jp/hotelinfo/plan/${reviewModalData.spot.id}#review`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-[1.5] bg-[#BF0000] text-white py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-1 shadow-md hover:bg-red-800 transition-colors"
                            >
                                楽天で口コミを見る <ExternalLink size={16} />
                            </a>
                        </div>
                    </div>
                </div>
            )}
            {/* ▲ レビュー確認用のモーダルここまで ▲ */}
    </div>
  );
}