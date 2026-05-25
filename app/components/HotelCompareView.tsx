// components/HotelCompareView.tsx
"use client";

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { 
    Star, MapPin, BedDouble, ExternalLink, X, Info, TrendingUp, 
    ArrowLeft, Map as MapIcon, Trash2, Calendar, User, ThumbsUp, RefreshCw,
    SlidersHorizontal, Search, Loader2 // ←追加
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import RadarChart from './RadarChart'; 
import { useSearchParams } from 'next/navigation';
import mapboxgl from 'mapbox-gl';
// @ts-ignore
import 'mapbox-gl/dist/mapbox-gl.css';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

interface HotelCompareViewProps {
    spots: any[];
    onSelectHotel: (s: any) => void;
    adultNum?: number;
    travelDays?: number;
    onUpdateSpotDay?: (spotId: string, day: number) => void;
    onDeleteSpot?: (spotId: string) => void;
}

export default function HotelCompareView({ 
    spots: initialSpots, 
    onSelectHotel, 
    adultNum = 1,
    travelDays = 4,
    onUpdateSpotDay,
    onDeleteSpot
}: HotelCompareViewProps) {
    
    const searchParams = useSearchParams();
    const roomId = searchParams.get('room');

    const [fetchedData, setFetchedData] = useState<Record<string, any>>({});
    const [isUpdatingPrices, setIsUpdatingPrices] = useState(false);
    const [updateProgress, setUpdateProgress] = useState(0); 
    
    // ▼ 追加: ホテルごとの個別条件をローカルストレージから復元して保持
    const [hotelConditions, setHotelConditions] = useState<Record<string, {adults: number, mealType: string}>>(() => {
        try {
            const saved = localStorage.getItem(`rh_ind_hotel_conditions_${roomId || 'default'}`);
            return saved ? JSON.parse(saved) : {};
        } catch (e) { return {}; }
    });

    const spots = initialSpots.map(s => fetchedData[s.id] ? { ...s, ...fetchedData[s.id] } : s);

    const attemptedFetch = useRef<Set<string>>(new Set());
    const [fetchingSpotIds, setFetchingSpotIds] = useState<Set<string>>(new Set());
    const isUpdatingRef = useRef(false);

    const [reviewModalData, setReviewModalData] = useState<{ spot: any, key: string, label: string } | null>(null);
    const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);
    
    // ▼ 追加: 個別条件設定ポップアップ用の状態
    const [conditionModalSpot, setConditionModalSpot] = useState<any | null>(null);
    const [tempCondition, setTempCondition] = useState<{ adults: number, mealType: string }>({ adults: 2, mealType: 'half_board' });

    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const mapScrollContainerRef = useRef<HTMLDivElement>(null);
    const [detailModalSpot, setDetailModalSpot] = useState<any | null>(null);

    const [showMap, setShowMap] = useState(false);
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<mapboxgl.Map | null>(null);
    const markersRef = useRef<mapboxgl.Marker[]>([]);

    const [longPressMenuSpot, setLongPressMenuSpot] = useState<any | null>(null);
    const pressTimer = useRef<NodeJS.Timeout | null>(null);
    const isLongPress = useRef(false);
    const touchStartPos = useRef<{x: number, y: number} | null>(null);

    // 個別条件が変更されたらローカルストレージに保存
    useEffect(() => {
        localStorage.setItem(`rh_ind_hotel_conditions_${roomId || 'default'}`, JSON.stringify(hotelConditions));
    }, [hotelConditions, roomId]);

    const parseUrlParams = (urlStr: string) => {
        const defaultDate = new Date();
        defaultDate.setDate(defaultDate.getDate() + 30);
        
        const result = {
            checkinDate: defaultDate.toISOString().split('T')[0],
            adults: adultNum || 2,
            mealType: 'half_board'
        };

        if (!urlStr) return result;
        try {
            const url = new URL(urlStr);
            const params = new URLSearchParams(url.search);
            
            const yen1 = params.get('f_nen1');
            const tsuki1 = params.get('f_tuki1');
            const hi1 = params.get('f_hi1');
            if (yen1 && tsuki1 && hi1) {
                const d = new Date(Number(yen1), Number(tsuki1) - 1, Number(hi1));
                if (!isNaN(d.getTime())) result.checkinDate = d.toISOString().split('T')[0];
            }
            
            const otona = params.get('f_otona_su');
            if (otona) {
                result.adults = Number(otona) || result.adults;
            } 
            const s1 = params.get('f_s1');
            const s2 = params.get('f_s2');
            if (s1 === '1' && s2 === '1') result.mealType = 'half_board';
            else if (s1 === '1' && s2 === '0') result.mealType = 'breakfast';
            else if (s1 === '0' && s2 === '0') result.mealType = 'room_only';
        } catch (e) {
            try {
                const savedSettings = localStorage.getItem(`rh_hotel_conditions_${roomId || ''}`);
                if (savedSettings) {
                    const parsed = JSON.parse(savedSettings);
                    if (parsed.checkin) result.checkinDate = parsed.checkin;
                    if (parsed.adults) result.adults = parsed.adults;
                    if (parsed.mealType) result.mealType = parsed.mealType;
                }
            } catch (err) {}
        }
        return result;
    };

    useEffect(() => {
        const fetchMissingData = async () => {
            const missingSpots = initialSpots.filter(s =>
                (!s.detailed_ratings || !s.price || s.price === 0) &&
                !attemptedFetch.current.has(s.id) &&
                (s.url || /^\d+$/.test(String(s.id)))
            );

            if (missingSpots.length === 0) return;
            setFetchingSpotIds(prev => new Set([...prev, ...missingSpots.map(s => s.id)]));

            for (const spot of missingSpots) {
                attemptedFetch.current.add(spot.id);
                try {
                    const { data: dbSpot } = await supabase.from('spots').select('detailed_ratings, price, rating, image_url').eq('id', spot.id).maybeSingle();
                    if (dbSpot && dbSpot.detailed_ratings && dbSpot.price > 0) {
                        setFetchedData(prev => ({ ...prev, [spot.id]: dbSpot }));
                        continue; 
                    }

                    const targetUrl = spot.url || `https://hotel.travel.rakuten.co.jp/hotelinfo/plan/${spot.id}`;
                    const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

                    const res = await fetch(`${API_BASE_URL}/api/import_rakuten_hotel`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url: targetUrl })
                    });

                    if (res.ok) {
                        const data = await res.json();
                        if (data.spot && data.spot.detailed_ratings) {
                            const newPrice = spot.price > 0 ? spot.price : data.spot.price;
                            const newRating = spot.rating > 0 ? spot.rating : data.spot.rating;
                            const newImageUrl = spot.image_url || data.spot.image_url;

                            setFetchedData(prev => ({
                                ...prev,
                                [spot.id]: {
                                    detailed_ratings: data.spot.detailed_ratings,
                                    price: newPrice,
                                    rating: newRating,
                                    image_url: newImageUrl
                                }
                            }));

                            await supabase.from('spots').update({
                                detailed_ratings: data.spot.detailed_ratings,
                                price: newPrice,
                                rating: newRating,
                                image_url: newImageUrl,
                            }).eq('id', spot.id);
                        }
                    }
                } catch (e) {
                    console.error("Failed to fetch missing hotel data", e);
                } finally {
                    setFetchingSpotIds(prev => {
                        const next = new Set(prev);
                        next.delete(spot.id);
                        return next;
                    });
                }
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        };
        if (initialSpots.length > 0) fetchMissingData();
    }, [initialSpots]);

    // ▼ 日付のタイムゾーンズレ（過去日になってしまうバグ）を防ぐためのフォーマット関数
    const formatLocalYMD = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    // ▼ 追加: ホテル単体の料金を再取得する関数（条件変更時に発火）
    const updateSingleHotelPrice = async (spot: any, condition: { adults: number, mealType: string }) => {
        setFetchingSpotIds(prev => new Set([...prev, spot.id]));
        try {
            const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
            let latestPrice = spot.price;

            const targetUrl = spot.url || `https://hotel.travel.rakuten.co.jp/hotelinfo/plan/${spot.id}`;
            const match = targetUrl.match(/hotelinfo\/plan\/(\d+)/) || targetUrl.match(/HOTEL\/(\d+)/) || targetUrl.match(/no=(\d+)/);
            const hotelNo = match ? match[1] : ( /^\d+$/.test(String(spot.id)) ? spot.id : undefined );

            const savedSettings = JSON.parse(localStorage.getItem(`rh_settings_${roomId}`) || '{}');
            const savedConditions = JSON.parse(localStorage.getItem(`rh_hotel_conditions_${roomId}`) || '{}');
            const defaultDate = formatLocalYMD(new Date());
            const checkinDateStr = savedSettings.start || savedConditions.checkin || defaultDate;
            
            if (spot.coordinates && spot.coordinates.length === 2) {
                const parts = checkinDateStr.split('-').map(Number);
                // ローカルタイムでDateオブジェクトを生成
                let inDate = new Date(parts[0], parts[1] - 1, parts[2]);
                const dayNum = Number(spot.day || 1);
                if (dayNum > 0) inDate.setDate(inDate.getDate() + (dayNum - 1));
                const outDate = new Date(inDate);
                outDate.setDate(inDate.getDate() + 1);

                // ▼ 修正: toISOStringの罠を回避し、正しい日本の日付文字列を生成
                const checkin_date = formatLocalYMD(inDate);
                const checkout_date = formatLocalYMD(outDate);

                const vacantRes = await fetch(`${API_BASE_URL}/api/search_hotels_vacant`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        latitude: spot.coordinates[1], 
                        longitude: spot.coordinates[0],
                        radius: 0.5,
                        hotel_no: hotelNo,
                        checkin_date,
                        checkout_date,
                        adult_num: condition.adults,
                        meal_type: condition.mealType === 'none' ? undefined : condition.mealType,
                        hotel_type: 'all',
                        min_rating: 0,
                        min_reviews: 0,
                        force_refresh: true
                    })
                });
                
                if (vacantRes.ok) {
                    const vData = await vacantRes.json();
                    if (vData.hotels && vData.hotels.length > 0) {
                        // ▼ 修正: 文字列型(String)に変換して厳密に比較し、取りこぼしを防ぐ
                        const exactHotel = vData.hotels.find((h: any) => String(h.id) === String(spot.id) || String(h.id) === String(hotelNo));
                        if (exactHotel && exactHotel.price > 0) {
                            latestPrice = exactHotel.price;
                        } else {
                            latestPrice = -1; // 実際に指定条件でのプランなし
                        }
                    } else {
                        latestPrice = -1;
                    }
                }
            }

            setFetchedData(prev => ({
                ...prev,
                [spot.id]: {
                    ...prev[spot.id],
                    price: latestPrice,
                }
            }));

            if (latestPrice > 0) {
                await supabase.from('spots').update({ price: latestPrice }).eq('id', spot.id);
            }

        } catch (e) {
            console.error("Failed to update single hotel", e);
        } finally {
            setFetchingSpotIds(prev => {
                const next = new Set(prev);
                next.delete(spot.id);
                return next;
            });
            setConditionModalSpot(null); // モーダルを閉じる
        }
    };

    const updateHotelPrices = useCallback(async (force = false) => {
        // ▼ 修正: ここでもローカル日付関数を使用
        const today = formatLocalYMD(new Date());
        const storageKey = `last_price_update_${roomId || 'default'}`;
        const lastUpdate = localStorage.getItem(storageKey);

        if (isUpdatingRef.current) return;
        if (!force && lastUpdate === today) return;

        const hotelSpots = initialSpots.filter(s => s.url || /^\d+$/.test(String(s.id)));
        if (hotelSpots.length === 0) return;

        isUpdatingRef.current = true;
        setIsUpdatingPrices(true);
        setUpdateProgress(0);
        
        const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const total = hotelSpots.length;
        let count = 0;

        try {
            for (const spot of hotelSpots) {
                try {
                    let detailed_ratings = spot.detailed_ratings;
                    let rating = spot.rating;
                    let latestPrice = spot.price;

                    const targetUrl = spot.url || `https://hotel.travel.rakuten.co.jp/hotelinfo/plan/${spot.id}`;
                    const match = targetUrl.match(/hotelinfo\/plan\/(\d+)/) || targetUrl.match(/HOTEL\/(\d+)/) || targetUrl.match(/no=(\d+)/);
                    const hotelNo = match ? match[1] : ( /^\d+$/.test(String(spot.id)) ? spot.id : undefined );
                    
                    const basicRes = await fetch(`${API_BASE_URL}/api/import_rakuten_hotel`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url: targetUrl, force_refresh: true }) 
                    });

                    if (basicRes.ok) {
                        const data = await basicRes.json();
                        if (data.spot) {
                            detailed_ratings = data.spot.detailed_ratings || detailed_ratings;
                            rating = data.spot.rating || rating;
                        }
                    }

                    const savedSettings = JSON.parse(localStorage.getItem(`rh_settings_${roomId}`) || '{}');
                    const savedConditions = JSON.parse(localStorage.getItem(`rh_hotel_conditions_${roomId}`) || '{}');
                    const defaultDate = formatLocalYMD(new Date());
                    const checkinDateStr = savedSettings.start || savedConditions.checkin || defaultDate;
                    
                    const currentAdults = hotelConditions[spot.id]?.adults || adultNum || savedSettings.adultNum || savedConditions.adults || 2;
                    const currentMealType = hotelConditions[spot.id]?.mealType || savedConditions.mealType || 'half_board';

                    if (spot.coordinates && spot.coordinates.length === 2) {
                        const parts = checkinDateStr.split('-').map(Number);
                        let inDate = new Date(parts[0], parts[1] - 1, parts[2]);
                        
                        const dayNum = Number(spot.day || 1);
                        if (dayNum > 0) {
                            inDate.setDate(inDate.getDate() + (dayNum - 1));
                        }
                        
                        const outDate = new Date(inDate);
                        outDate.setDate(inDate.getDate() + 1);

                        // ▼ 修正: 正しい日本の日付文字列を生成
                        const checkin_date = formatLocalYMD(inDate);
                        const checkout_date = formatLocalYMD(outDate);

                        const vacantRes = await fetch(`${API_BASE_URL}/api/search_hotels_vacant`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ 
                                latitude: spot.coordinates[1], 
                                longitude: spot.coordinates[0],
                                radius: 0.5,
                                hotel_no: hotelNo, 
                                checkin_date,
                                checkout_date,
                                adult_num: currentAdults,
                                meal_type: currentMealType === 'none' ? undefined : currentMealType,
                                hotel_type: 'all',
                                min_rating: 0,
                                min_reviews: 0,
                                force_refresh: true
                            })
                        });
                        
                        if (vacantRes.ok) {
                            const vData = await vacantRes.json();
                            if (vData.hotels && vData.hotels.length > 0) {
                                // ▼ 修正: 文字列型(String)に変換して比較
                                const exactHotel = vData.hotels.find((h: any) => String(h.id) === String(spot.id) || String(h.id) === String(hotelNo));
                                if (exactHotel && exactHotel.price > 0) {
                                    latestPrice = exactHotel.price;
                                } else {
                                    latestPrice = -1;
                                }
                            } else {
                                latestPrice = -1;
                            }
                        }
                    }

                    setFetchedData(prev => ({
                        ...prev,
                        [spot.id]: {
                            ...prev[spot.id],
                            price: latestPrice,
                            detailed_ratings,
                            rating
                        }
                    }));

                    if (latestPrice > 0) {
                        await supabase.from('spots').update({
                            price: latestPrice,
                            detailed_ratings,
                            rating,
                        }).eq('id', spot.id);
                    }

                } catch (e) {
                    console.error(`Failed to update data for spot: ${spot.id}`, e);
                }
                
                count++;
                setUpdateProgress(Math.round((count / total) * 100));
                await new Promise(resolve => setTimeout(resolve, 1000)); 
            }

            localStorage.setItem(storageKey, today);
            
        } finally {
            isUpdatingRef.current = false; 
            setIsUpdatingPrices(false);
            setUpdateProgress(0);
        }
    }, [initialSpots, roomId, adultNum, hotelConditions]);
    useEffect(() => {
        if (initialSpots.length > 0) {
            updateHotelPrices(false);
        }
    }, [initialSpots.length, updateHotelPrices]);

 const getAffiliateUrl = useCallback((spot: any) => {
        const savedSettings = JSON.parse(localStorage.getItem(`rh_settings_${roomId}`) || '{}');
        const savedConditions = JSON.parse(localStorage.getItem(`rh_hotel_conditions_${roomId}`) || '{}');
        
        let indConditions: Record<string, any> = {};
        try {
            const savedInd = localStorage.getItem(`rh_ind_hotel_conditions_${roomId || 'default'}`);
            if (savedInd) indConditions = JSON.parse(savedInd);
        } catch(e) {}

        const checkinDate = savedSettings.start || savedConditions.checkin || new Date().toISOString().split('T')[0];
        
        const fallbackAdults = typeof adultNum !== 'undefined' ? adultNum : (savedSettings.adultNum || savedConditions.adults || 2);
        const adults = indConditions[spot.id]?.adults || fallbackAdults;

        const parts = checkinDate.split('-').map(Number);
        let targetDate = new Date(parts[0], parts[1] - 1, parts[2]);

        const dayNum = Number(spot.day || 1);
        if (dayNum > 0) {
            targetDate.setDate(targetDate.getDate() + (dayNum - 1));
        }

        const checkOutDate = new Date(targetDate);
        checkOutDate.setDate(targetDate.getDate() + 1);

        const y1 = targetDate.getFullYear(); const m1 = targetDate.getMonth() + 1; const d1 = targetDate.getDate();
        const y2 = checkOutDate.getFullYear(); const m2 = checkOutDate.getMonth() + 1; const d2 = checkOutDate.getDate();
        
        // ▼ 修正: 誤って小学生を追加していた f_s1, f_s2 の条件分岐を完全に削除！
        // ▼ さらに、f_s1, f_s2 (小学生) と f_y1～f_y6 (幼児) をすべて「空」にして大人だけの検索に固定
        const paramString = `f_flg=PLAN&f_otona_su=${adults}&f_heya_su=1&f_kin=&f_kin2=&f_s1=&f_s2=&f_y1=&f_y2=&f_y3=&f_y4=&f_y5=&f_y6=&f_nen1=${y1}&f_tuki1=${m1}&f_hi1=${d1}&f_nen2=${y2}&f_tuki2=${m2}&f_hi2=${d2}&f_hak=1&f_tel=&f_tscm_flg=&f_p_no=&f_custom_code=&f_search_type=&f_service=&f_rm_equip=&f_sort=minNo`;
        
        const extractRakutenId = (url: string) => {
            if (!url) return null;
            const match = url.match(/hotelinfo\/plan\/(\d+)/) || url.match(/HOTEL\/(\d+)/) || url.match(/no=(\d+)/);
            return match ? match[1] : null;
        };

        const hotelId = extractRakutenId(spot.url || "") || ( /^\d+$/.test(String(spot.id)) ? spot.id : null);
        
        if (hotelId) return `https://hotel.travel.rakuten.co.jp/hotelinfo/plan/${hotelId}?${paramString}`;
        return `https://search.travel.rakuten.co.jp/ds/hotel/search?f_query=${encodeURIComponent(spot.name)}&${paramString}`;
    }, [roomId, typeof adultNum !== 'undefined' ? adultNum : null]);

    // ▼ 修正: ホテルごとの人数を参照して一人当たりの金額を計算
    const getUnitPrice = useCallback((spot: any, price: number) => {
        const adults = hotelConditions[spot.id]?.adults || adultNum || 2;
        return Math.round(price / Math.max(1, adults));
    }, [adultNum, hotelConditions]);

    const validSpots = spots.filter(s => s.price > 0 && s.rating > 0);
    const minP = validSpots.length ? Math.min(...validSpots.map(s => getUnitPrice(s, s.price))) * 0.95 : 0;
    const maxP = validSpots.length ? Math.max(...validSpots.map(s => getUnitPrice(s, s.price))) * 1.05 : 30000;
    const minR = 3.0; const maxR = 5.0;

    const ratingTicks = [3.0, 3.5, 4.0, 4.5, 5.0];
    const priceTicks = validSpots.length > 0 ? [Math.floor(minP), Math.floor((minP + maxP) / 2), Math.floor(maxP)] : [];

    const handlePlotClick = (spot: any) => {
        setSelectedSpotId(spot.id);
        if (showMap && map.current && spot.coordinates && spot.coordinates.length === 2) {
            map.current?.flyTo({ center: spot.coordinates, zoom: 16, offset: [0, -window.innerHeight * 0.05], duration: 1000 });
        }
        const activeContainer = showMap ? mapScrollContainerRef.current : scrollContainerRef.current;
        if (activeContainer) {
            const card = activeContainer.querySelector(`[data-spot-id="${spot.id}"]`) as HTMLElement;
            if (card) {
                const containerWidth = activeContainer.offsetWidth;
                const cardLeft = card.offsetLeft;
                const cardWidth = card.offsetWidth;
                activeContainer.scrollTo({ left: cardLeft - containerWidth / 2 + cardWidth / 2, behavior: 'smooth' });
            }
        }
    };

    const handlePointerDown = (e: React.PointerEvent, spot: any) => {
        isLongPress.current = false;
        touchStartPos.current = { x: e.clientX, y: e.clientY };
        pressTimer.current = setTimeout(() => {
            isLongPress.current = true;
            setLongPressMenuSpot(spot);
            if (navigator.vibrate) navigator.vibrate(50); 
        }, 500); 
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!touchStartPos.current || !pressTimer.current) return;
        const MathAbs = Math.abs;
        if (MathAbs(e.clientX - touchStartPos.current.x) > 10 || MathAbs(e.clientY - touchStartPos.current.y) > 10) {
            clearTimeout(pressTimer.current);
            pressTimer.current = null;
        }
    };

    const handlePointerUp = () => {
        if (pressTimer.current) {
            clearTimeout(pressTimer.current);
            pressTimer.current = null;
        }
        setTimeout(() => { isLongPress.current = false; }, 100);
    };

    const handleDayChange = async (spotId: string, day: number) => {
        if (onUpdateSpotDay) {
            onUpdateSpotDay(spotId, day);
        } else {
            await supabase.from('spots').update({ day }).eq('id', spotId); 
        }
        setLongPressMenuSpot(null);
    };

    const handleDelete = async (spotId: string) => {
        if (window.confirm("このホテルを候補から削除してもよろしいですか？")) {
            if (onDeleteSpot) {
                onDeleteSpot(spotId);
            } else {
                await supabase.from('spots').delete().eq('id', spotId); 
            }
            setLongPressMenuSpot(null);
        }
    };

    // ▼ 追加: 個別条件モーダルを開く処理
    const handleOpenConditionModal = (spot: any) => {
        setConditionModalSpot(spot);
        const savedSettings = JSON.parse(localStorage.getItem(`rh_settings_${roomId}`) || '{}');
        const savedConditions = JSON.parse(localStorage.getItem(`rh_hotel_conditions_${roomId}`) || '{}');
        const defaultAdults = adultNum || savedSettings.adultNum || savedConditions.adults || 2;
        const defaultMeal = savedConditions.mealType || 'half_board';
        
        setTempCondition({
            adults: hotelConditions[spot.id]?.adults || defaultAdults,
            mealType: hotelConditions[spot.id]?.mealType || defaultMeal
        });
    };

    useEffect(() => {
        if (!mapContainer.current) return;
        mapboxgl.accessToken = MAPBOX_TOKEN;
        const spotsWithCoords = spots.filter(s => s.coordinates && s.coordinates.length === 2);
        let center: [number, number] = [135.758767, 34.985120]; 
        if (spotsWithCoords.length > 0) center = spotsWithCoords[0].coordinates; 

        map.current = new mapboxgl.Map({ container: mapContainer.current, style: 'mapbox://styles/mapbox/streets-v12', center: center, zoom: 12 });
        return () => { map.current?.remove(); };
    }, []);

    useEffect(() => {
        if (!map.current || !spots) return;
        markersRef.current.forEach(m => m.remove());
        markersRef.current = [];
        const bounds = new mapboxgl.LngLatBounds();
        let hasValidCoords = false;

        spots.forEach(spot => {
            if (!spot.coordinates || spot.coordinates.length !== 2) return;
            hasValidCoords = true;
            bounds.extend(spot.coordinates as [number, number]);

            const el = document.createElement('div');
            const isSelected = selectedSpotId === spot.id;
            const color = isSelected ? '#EF4444' : '#F97316';
            const zIndex = isSelected ? 99 : 5;
            const unitPrice = getUnitPrice(spot, spot.price); // 修正
            const displayPrice = unitPrice >= 10000 ? `${(unitPrice/10000).toFixed(1)}万` : `¥${unitPrice.toLocaleString()}`;

            el.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;z-index:${zIndex};cursor:pointer;">
                <div style="background:white;padding:2px 6px;border-radius:6px;font-size:10px;font-weight:bold;color:${color};box-shadow:0 2px 4px rgba(0,0,0,0.2);margin-bottom:2px;white-space:nowrap;border:1px solid ${color};">${spot.price > 0 ? displayPrice : '満室'}</div>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3" fill="white"></circle></svg>
            </div>`;
            el.onclick = () => handlePlotClick(spot);
            
            const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' }).setLngLat(spot.coordinates).addTo(map.current!);
            markersRef.current.push(marker);
        });

        if (hasValidCoords && showMap && !selectedSpotId) {
            map.current?.fitBounds(bounds, { padding: 50, maxZoom: 15, duration: 1000 });
        }
    }, [spots, selectedSpotId, showMap, getUnitPrice]);

    useEffect(() => {
        if (showMap && map.current) {
            setTimeout(() => {
                map.current?.resize();
                const bounds = new mapboxgl.LngLatBounds();
                let hasValidCoords = false;
                spots.forEach(s => {
                    if (s.coordinates && s.coordinates.length === 2) { hasValidCoords = true; bounds.extend(s.coordinates as [number, number]); }
                });
                if (hasValidCoords && !selectedSpotId) {
                    map.current?.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 400 });
                }
            }, 300); 
        }
    }, [showMap, spots]);

    const renderCompareViewContent = (isMapMode: boolean) => {
        const activeScrollRef = isMapMode ? mapScrollContainerRef : scrollContainerRef;
        return (
            <div className={`flex flex-col gap-6 ${!isMapMode && 'animate-in fade-in slide-in-from-bottom-4'}`}>
                <div className="flex items-center justify-between px-2">
                    <div>
                        <h2 className="text-xl font-black text-gray-800 tracking-tight">候補の比較</h2>
                        <p className="text-[11px] text-gray-500 font-medium">追加された宿を長押しで管理できます</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => updateHotelPrices(true)} 
                            disabled={isUpdatingPrices}
                            className="px-3 py-1.5 rounded-full text-[11px] font-bold flex items-center gap-1.5 transition-colors bg-slate-100 text-gray-600 hover:bg-slate-200 disabled:opacity-50 min-w-[100px] justify-center"
                        >
                            {isUpdatingPrices ? (
                                <div className="relative flex items-center justify-center w-3.5 h-3.5">
                                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 24 24">
                                        <circle cx="12" cy="12" r="10" fill="none" className="stroke-current text-gray-300" strokeWidth="4" />
                                        <circle 
                                            cx="12" cy="12" r="10" fill="none" 
                                            className="stroke-current text-blue-500 transition-all duration-300 ease-out" 
                                            strokeWidth="4" strokeLinecap="round"
                                            pathLength="100" strokeDasharray="100" 
                                            strokeDashoffset={100 - updateProgress} 
                                        />
                                    </svg>
                                </div>
                            ) : (
                                <RefreshCw size={14} />
                            )}
                            <span className="w-12 text-left">
                                {isUpdatingPrices ? `更新 ${updateProgress}%` : '料金を更新'}
                            </span>
                        </button>

                        <button 
                            onClick={() => setShowMap(!showMap)} 
                            className={`px-3 py-1.5 rounded-full text-[11px] font-bold flex items-center gap-1.5 transition-colors ${showMap ? 'bg-orange-600 text-white shadow-md' : 'bg-slate-100 text-gray-600 hover:bg-slate-200'}`}
                        >
                            <MapIcon size={14}/> {showMap ? '地図を隠す' : '地図で表示'}
                        </button>
                        <div className="w-10 h-10 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center">
                            <BedDouble size={20} />
                        </div>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm space-y-2">
                    <h3 className="text-sm font-bold text-gray-700 ml-1">コスパ・評価マトリクス</h3>
                    <div className="w-full h-[180px] relative px-4 mt-2">
                        <svg viewBox="0 0 300 170" className="w-full h-full overflow-visible">
                            <line x1="30" y1="140" x2="290" y2="140" stroke="#d1d5db" strokeWidth="1.5"/>
                            <line x1="30" y1="10" x2="30" y2="140" stroke="#d1d5db" strokeWidth="1.5"/>
                            {ratingTicks.map(r => {
                                const x = 30 + ((r - minR) / (maxR - minR)) * 260;
                                return (
                                    <g key={`x-${r}`}>
                                        <line x1={x} y1={10} x2={x} y2={140} stroke="#f3f4f6" strokeWidth="1" strokeDasharray="3 3" />
                                        <text x={x} y={152} fontSize="8" fill="#9ca3af" textAnchor="middle" fontWeight="bold">{r.toFixed(1)}</text>
                                    </g>
                                );
                            })}
                            {priceTicks.map((p, i) => {
                                const y = 140 - ((p - minP) / (maxP - minP)) * 130;
                                return (
                                    <g key={`y-${i}`}>
                                        <line x1="30" y1={y} x2={290} y2={y} stroke="#f3f4f6" strokeWidth="1" strokeDasharray="3 3" />
                                        <text x={25} y={y + 3} fontSize="8" fill="#9ca3af" textAnchor="end" fontWeight="bold">{p >= 10000 ? `${(p / 10000).toFixed(1)}万` : `¥${(p / 1000).toFixed(0)}k`}</text>
                                    </g>
                                );
                            })}
                            <text x="160" y="165" fontSize="8" fill="#9ca3af" textAnchor="middle" fontWeight="bold">評価 (低 ← → 高)</text>
                            <text x="5" y="75" fontSize="8" fill="#9ca3af" transform="rotate(-90, 5, 75)" textAnchor="middle" fontWeight="bold">価格</text>
                            {validSpots.map((spot, i) => {
                                const x = 30 + ((spot.rating - minR) / (maxR - minR)) * 260;
                                const unitPrice = getUnitPrice(spot, spot.price); // 修正
                                const y = 140 - ((unitPrice - minP) / (maxP - minP)) * 130;
                                const isSelected = selectedSpotId === spot.id;
                                return (
                                    <g key={i} className="cursor-pointer group" onClick={() => handlePlotClick(spot)}>
                                        <circle cx={x} cy={y} r={isSelected ? "10" : "6"} fill={isSelected ? "#EF4444" : "#F97316"} fillOpacity={isSelected ? "1" : "0.7"} stroke="white" strokeWidth={isSelected ? "2" : "1.5"} className={`transition-all duration-300 ${!isSelected && 'group-hover:r-8'}`} />
                                        <text x={x} y={y - (isSelected ? 14 : 10)} fontSize="9" fill={isSelected ? "#EF4444" : "#4B5563"} textAnchor="middle" className={`transition-opacity font-bold ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>{spot.name.substring(0, 8)}</text>
                                    </g>
                                );
                            })}
                        </svg>
                    </div>
                </div>

                <div ref={activeScrollRef} className="flex gap-4 overflow-x-auto px-2 pb-4 no-scrollbar mask-gradient" style={{ scrollBehavior: 'smooth' }}>
                    {spots.map((spot, index) => {
                        const unitPrice = getUnitPrice(spot, spot.price); // 修正
                        const isSelected = selectedSpotId === spot.id;
                        const targetUrl = getAffiliateUrl(spot);
                        const isLoading = fetchingSpotIds.has(spot.id); 
                        
                        return (
                            <div 
                                key={index} 
                                data-spot-id={spot.id}
                                className={`min-w-[260px] bg-white rounded-3xl p-4 flex flex-col gap-4 relative cursor-pointer active:scale-[0.98] transition-all duration-300 select-none ${
                                    isSelected ? 'border-2 border-red-500 shadow-md ring-2 ring-red-100 transform -translate-y-1' : 'border border-gray-100 shadow-sm'
                                }`}
                                style={{ WebkitTouchCallout: 'none' }} 
                                onPointerDown={(e) => handlePointerDown(e, spot)}
                                onPointerMove={handlePointerMove}
                                onPointerUp={handlePointerUp}
                                onPointerLeave={handlePointerUp}
                                onPointerCancel={handlePointerUp}
                                onContextMenu={(e) => e.preventDefault()} 
                                onClick={(e) => {
                                    if (isLongPress.current) { e.preventDefault(); e.stopPropagation(); return; }
                                    handlePlotClick(spot);
                                }}
                            >
                                <div className="w-full h-32 bg-gray-100 rounded-2xl overflow-hidden shrink-0 relative pointer-events-none">
                                    {spot.image_url ? <img src={spot.image_url} className="w-full h-full object-cover" alt="" /> : <div className="flex h-full items-center justify-center text-gray-300"><BedDouble size={32}/></div>}
                                    {spot.rating > 0 && <div className={`absolute top-2 right-2 backdrop-blur-md text-white px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 ${isSelected ? 'bg-red-500/90' : 'bg-black/60'}`}><Star size={10} className="text-yellow-400" fill="currentColor"/> {spot.rating}</div>}
                                </div>
                                <div className="pointer-events-none">
                                    <h4 className={`font-black text-sm line-clamp-2 leading-tight mb-1 ${isSelected ? 'text-red-600' : 'text-gray-800'}`}>{spot.name}</h4>
                                    <div className="flex items-center gap-1 text-[10px] text-gray-400 font-bold mb-2"><MapPin size={10} className="shrink-0"/> <span className="truncate">{spot.description}</span></div>
                                    
                                    {/* ▼ 修正: -1 の場合は「条件に合うプランなし」と表示 */}
                                    {spot.price > 0 ? (
                                        <p className="text-orange-500 font-black text-lg leading-none mt-1">¥{unitPrice.toLocaleString()}<span className="text-[10px] text-gray-400 font-bold ml-1">~ /人</span></p>
                                    ) : spot.price === -1 ? (
                                        <p className="text-red-500 font-bold text-sm mt-1">指定条件でのプランなし</p>
                                    ) : null}
                                </div>
                                <div className={`flex items-center justify-center rounded-2xl py-2 h-[160px] transition-colors pointer-events-none ${isSelected ? 'bg-red-50' : 'bg-gray-50/50'}`}>
                                  <RadarChart ratings={spot.detailed_ratings} color={isSelected ? "#EF4444" : "#F97316"} isLoading={isLoading} onLabelClick={(key, label) => setReviewModalData({ spot, key, label })} />
                                </div>

                                {/* ▼ 修正: 「詳細」ボタンを廃止し、「条件設定」に変更 */}
                                <div className="flex gap-2 mt-auto pt-2">
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); handleOpenConditionModal(spot); }}
                                        className="flex-[1] bg-gray-100 text-gray-600 py-3 rounded-xl font-bold text-[11px] flex items-center justify-center gap-1 hover:bg-gray-200 transition-colors"
                                    ><SlidersHorizontal size={14} /> 条件設定</button>
                                    <a 
                                        href={targetUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                                        className="flex-[1.2] bg-[#BF0000] text-white py-3 rounded-xl font-bold text-[11px] flex items-center justify-center gap-1 hover:bg-red-800 transition-colors"
                                    >楽天で見る(PR) <ExternalLink size={14} /></a>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <>
            {!showMap && renderCompareViewContent(false)}

            <div className={`fixed inset-0 bg-slate-50 flex flex-col font-sans overflow-hidden transition-all duration-500 ${showMap ? 'z-[150] opacity-100 visible' : 'z-[-10] opacity-0 invisible pointer-events-none'}`}>
                <div className="absolute top-0 left-0 right-0 h-[45%] z-0 bg-slate-100"><div ref={mapContainer} className="w-full h-full" /></div>
                <div className={`absolute bottom-0 left-0 right-0 h-[55%] z-10 bg-white shadow-[0_-10px_60px_rgba(0,0,0,0.15)] rounded-t-[2.5rem] flex flex-col overflow-hidden transition-transform duration-500 ${showMap ? 'translate-y-0' : 'translate-y-full'}`}>
                    <div className="w-12 h-1.5 bg-gray-100 rounded-full mx-auto mt-4 mb-2 shrink-0" />
                    <div className="flex-1 overflow-y-auto px-6 pb-24 pt-2">{showMap && renderCompareViewContent(true)}</div>
                </div>
            </div>

            {/* ▼ 追加: ホテル個別条件設定用モーダル */}
            {conditionModalSpot && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in p-4" onClick={() => setConditionModalSpot(null)}>
                    <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl flex flex-col gap-5 animate-in zoom-in-95" onClick={(e) => e.stopPropagation()}>
                        <div>
                            <h3 className="font-black text-gray-800 text-lg leading-tight mb-1">{conditionModalSpot.name}</h3>
                            <p className="text-xs font-bold text-gray-500">このホテルの検索条件（人数・食事）</p>
                        </div>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1">宿泊人数（大人）</label>
                                <select 
                                    value={tempCondition.adults} 
                                    onChange={(e) => setTempCondition(prev => ({...prev, adults: Number(e.target.value)}))}
                                    className="w-full bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-xl focus:ring-orange-500 focus:border-orange-500 block p-3 font-bold"
                                >
                                    {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}名</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1">食事条件</label>
                                <select 
                                    value={tempCondition.mealType} 
                                    onChange={(e) => setTempCondition(prev => ({...prev, mealType: e.target.value}))}
                                    className="w-full bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-xl focus:ring-orange-500 focus:border-orange-500 block p-3 font-bold"
                                >
                                    <option value="half_board">朝夕食あり</option>
                                    <option value="breakfast">朝食のみ</option>
                                    <option value="room_only">素泊まり</option>
                                    <option value="none">指定なし（全プラン）</option>
                                </select>
                            </div>
                        </div>

                        <div className="flex gap-2 mt-2">
                            <button 
                                onClick={() => setConditionModalSpot(null)} 
                                className="flex-1 bg-gray-100 text-gray-600 py-3.5 rounded-xl font-bold text-sm hover:bg-gray-200 transition-colors"
                            >キャンセル</button>
                            <button 
                                onClick={() => {
                                    setHotelConditions(prev => ({...prev, [conditionModalSpot.id]: tempCondition}));
                                    updateSingleHotelPrice(conditionModalSpot, tempCondition);
                                }} 
                                disabled={fetchingSpotIds.has(conditionModalSpot.id)}
                                className="flex-[1.5] bg-orange-500 text-white py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-1 shadow-md hover:bg-orange-600 transition-colors disabled:opacity-50"
                            >
                                {fetchingSpotIds.has(conditionModalSpot.id) ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                                再計算する
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {longPressMenuSpot && (
                <div 
                    className="fixed inset-0 z-[400] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in"
                    onClick={() => setLongPressMenuSpot(null)}
                >
                    <div 
                        className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl flex flex-col gap-5 animate-in slide-in-from-bottom-8"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div>
                            <p className="text-[10px] font-bold text-gray-400 mb-1">ホテル情報の管理</p>
                            <h3 className="font-black text-gray-800 text-lg leading-tight line-clamp-2">{longPressMenuSpot.name}</h3>
                        </div>

                        <div className="bg-slate-50 rounded-2xl p-4 border border-gray-100 space-y-3">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-500 font-bold flex items-center gap-1.5"><User size={14}/> 追加者</span>
                                <span className="font-black text-gray-800">{longPressMenuSpot.user_name || longPressMenuSpot.added_by || '不明'}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-500 font-bold flex items-center gap-1.5"><ThumbsUp size={14}/> 獲得票数</span>
                                <span className="font-black text-orange-600 flex items-center gap-1"><Star size={14} fill="currentColor"/> {longPressMenuSpot.votes || 0} 票</span>
                            </div>
                        </div>
                        
                        <div>
                            <span className="text-gray-500 font-bold text-xs flex items-center gap-1.5 mb-3"><Calendar size={14}/> 宿泊日の変更</span>
                            <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                                <button 
                                    onClick={() => handleDayChange(longPressMenuSpot.id, 0)} 
                                    className={`py-2.5 rounded-xl text-xs font-bold transition-all ${!longPressMenuSpot.day || longPressMenuSpot.day === 0 ? 'bg-orange-500 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                >
                                    未定
                                </button>
                                {Array.from({length: travelDays}).map((_, i) => {
                                    const d = i + 1;
                                    if (d >= travelDays) return null; 
                                    const isSelected = longPressMenuSpot.day === d;
                                    return (
                                        <button 
                                            key={d} 
                                            onClick={() => handleDayChange(longPressMenuSpot.id, d)} 
                                            className={`py-2.5 rounded-xl text-xs font-bold transition-all ${isSelected ? 'bg-orange-500 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                        >
                                            Day {d}-{d+1}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        <div className="flex gap-2 mt-2 pt-4 border-t border-gray-100">
                            <button 
                                onClick={() => setLongPressMenuSpot(null)} 
                                className="flex-[1] bg-gray-100 text-gray-600 py-3.5 rounded-xl font-bold text-xs hover:bg-gray-200 transition-colors"
                            >
                                キャンセル
                            </button>
                            <button 
                                onClick={() => handleDelete(longPressMenuSpot.id)} 
                                className="flex-[1.5] bg-red-50 text-red-600 py-3.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-red-100 transition-colors border border-red-100"
                            >
                                <Trash2 size={16}/> 候補から削除
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {reviewModalData && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in p-4" onClick={() => setReviewModalData(null)}>
                    <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl flex flex-col gap-4 animate-in zoom-in-95" onClick={(e) => e.stopPropagation()}>
                        <div>
                            <h3 className="font-black text-gray-800 text-lg leading-tight mb-1">{reviewModalData.spot.name}</h3>
                            <p className="text-sm font-bold text-orange-600">「{reviewModalData.label}」に関する評価・レビュー</p>
                        </div>
                        <div className="bg-gray-50 rounded-2xl p-4 text-sm text-gray-600 border border-gray-100 min-h-[120px] flex flex-col items-center justify-center text-center gap-2">
                            <p className="font-bold text-gray-400">詳細なテキストレビューデータは<br/>楽天トラベルでご確認いただけます</p>
                        </div>
                        <div className="flex gap-2 mt-2">
                            <button onClick={() => setReviewModalData(null)} className="flex-1 bg-gray-100 text-gray-600 py-3.5 rounded-xl font-bold text-sm hover:bg-gray-200 transition-colors">閉じる</button>
                            <a href={`https://hotel.travel.rakuten.co.jp/hotelinfo/plan/${reviewModalData.spot.id}#review`} target="_blank" rel="noopener noreferrer" className="flex-[1.5] bg-[#BF0000] text-white py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-1 shadow-md hover:bg-red-800 transition-colors">楽天で口コミを見る <ExternalLink size={16} /></a>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}