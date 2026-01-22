"use client";

import { useState, useEffect, useRef, useMemo } from 'react';
import { 
  MapPin, Car, Clock, X, Loader2, Sparkles, MinusCircle, 
  Edit3, Train, Plane, Ship, Footprints, Zap, 
  Image as ImageIcon, Link as LinkIcon, Camera, Upload, 
  Trash2, PlusCircle, MapPinned, ArrowRight, ArrowLeft,
  ChevronDown, ChevronUp, Layers, Banknote, ExternalLink, StickyNote
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// html2canvasの型定義回避のためのダミー宣言
declare global {
    interface Window {
        html2canvas: any;
    }
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const RAKUTEN_AFFILIATE_ID = "4fcc24e4.174bb117.4fcc24e5.5b178353"; 

// --- 画像表示用コンポーネント ---
const SpotImage = ({ src, alt, className }: { src?: string | null, alt: string, className?: string }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    const imgRef = useRef<HTMLImageElement>(null);

    useEffect(() => {
        if (src && (src.startsWith('http') || src.startsWith('data:'))) {
            setIsLoading(true);
            setHasError(false);
        } else {
            setIsLoading(false);
            setHasError(true);
        }
    }, [src]);

    useEffect(() => {
        if (imgRef.current && imgRef.current.complete) {
            setIsLoading(false);
        }
    }, [src]);

    const handleLoad = () => setIsLoading(false);
    const handleError = () => { setIsLoading(false); setHasError(true); };

    if (!src || hasError || (!src.startsWith('http') && !src.startsWith('data:'))) {
        return (
            <div className={`flex flex-col items-center justify-center bg-gray-100 text-gray-300 ${className}`}>
                <ImageIcon size={24} />
            </div>
        );
    }

    return (
        <div className={`relative overflow-hidden bg-gray-100 ${className}`}>
            {isLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 bg-gray-100 z-10">
                    <Loader2 size={16} className="animate-spin mb-1"/>
                </div>
            )}
            <img 
                ref={imgRef}
                key={src} 
                src={src} 
                alt={alt} 
                onLoad={handleLoad}
                onError={handleError}
                className={`w-full h-full object-cover transition-opacity duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
                draggable={false} 
                crossOrigin="anonymous" // CORS対策
            />
        </div>
    );
};

interface Props {
  spots: any[];
  onRemove: (spot: any) => void;
  onUpdateSpots: (newSpots: any[]) => void;
  roomId: string;
  travelDays?: number;
  autoShowScreenshot?: boolean;
  onScreenshotClosed?: () => void;
  startDate?: string;
  adultNum?: number;
}

const TRANSPORT_MODES = [
  { id: 'car', icon: <Car size={16}/>, label: '車', googleMode: 'driving' },
  { id: 'train', icon: <Train size={16}/>, label: '電車', googleMode: 'transit' },
  { id: 'walk', icon: <Footprints size={16}/>, label: '徒歩', googleMode: 'walking' },
  { id: 'shinkansen', icon: <Zap size={16}/>, label: '新幹線', googleMode: 'transit' },
  { id: 'plane', icon: <Plane size={16}/>, label: '飛行機', googleMode: 'transit' },
  { id: 'ship', icon: <Ship size={16}/>, label: '船', googleMode: 'transit' },
];

export default function PlanView({ 
    spots, onRemove, onUpdateSpots, roomId, travelDays = 1, 
    autoShowScreenshot, onScreenshotClosed,
    startDate, adultNum = 2
}: Props) {  
  
  const captureRef = useRef<HTMLDivElement>(null); 
  const scrollContainerRef = useRef<HTMLDivElement>(null); 
  
  // ★追加: リストコンテナへの参照と、スクロール制御用のRef
  const listRef = useRef<HTMLDivElement>(null);
  const scrollInterval = useRef<NodeJS.Timeout | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [routeGeoJSON, setRouteGeoJSON] = useState<any>(null);
  const [isPlanGenerated, setIsPlanGenerated] = useState(false);
  
  const [optimizeCount, setOptimizeCount] = useState(0);
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);

  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("18:00");
  const [startSpotName, setStartSpotName] = useState<string>("");
  const [endSpotName, setEndSpotName] = useState<string>("");
  
  const [editItem, setEditItem] = useState<{index: number, type: 'spot' | 'travel', data: any} | null>(null);
  const [showScreenshotMode, setShowScreenshotMode] = useState(false);
  const [showUnusedList, setShowUnusedList] = useState(true);
  const [isSavingImage, setIsSavingImage] = useState(false);
  const attemptedImageFetch = useRef<Set<string>>(new Set());
  const [selectedDay, setSelectedDay] = useState<number>(1);

  const displayDays = Math.max(travelDays, 1);
  const [activeTransportMenuIndex, setActiveTransportMenuIndex] = useState<number | null>(null);

  useEffect(() => {
      if (autoShowScreenshot) setShowScreenshotMode(true);
  }, [autoShowScreenshot]);

  const handleCloseScreenshot = () => {
      setShowScreenshotMode(false);
      if (onScreenshotClosed) onScreenshotClosed();
  };

  useEffect(() => {
      if (timeline.length === 0) return;

      setTimeline(prev => prev.map(item => {
          if (item.type !== 'spot') return item;
          
          const freshSpot = spots.find(s => 
              (s.id && String(s.id) === String(item.spot.id)) || 
              s.name === item.spot.name
          );

          if (freshSpot) {
              const needsUpdate = 
                  item.spot.comment !== freshSpot.comment ||
                  item.spot.link !== freshSpot.link ||
                  item.spot.cost !== freshSpot.price ||
                  item.image !== (freshSpot.image_url || item.image);

              if (needsUpdate) {
                  return { 
                      ...item, 
                      spot: {
                          ...item.spot,    
                          ...freshSpot,    
                          cost: freshSpot.price,      
                          comment: freshSpot.comment, 
                          link: freshSpot.link,       
                          url: freshSpot.link, 
                          image_url: freshSpot.image_url
                      },
                      image: freshSpot.image_url || item.image 
                  };
              }
          }
          return item;
      }));
  }, [spots, timeline.length]);

  const prevDayHotel = useMemo(() => {
      if (selectedDay <= 1) return null;
      return spots.find(s => 
          s.status === 'confirmed' && 
          s.day === selectedDay - 1 && 
          (s.is_hotel || s.category === 'hotel' || /ホテル|旅館|宿/.test(s.name))
      );
  }, [spots, selectedDay]);

  const activeDaySpots = useMemo(() => {
      const current = spots.filter(s => 
          s.status === 'confirmed' && 
          (s.day === selectedDay || s.day === 0)
      );

      if (prevDayHotel) {
          if (!current.find(s => (s.id && String(s.id) === String(prevDayHotel.id)) || s.name === prevDayHotel.name)) {
              return [prevDayHotel, ...current];
          }
      }
      return current;
  }, [spots, selectedDay, prevDayHotel]);

  const unusedSpots = useMemo(() => {
      const usedSpotIds = new Set<string>();
      const usedSpotNames = new Set<string>();

      timeline.forEach(item => {
          if (item.type === 'spot') {
              if (item.spot.id) usedSpotIds.add(String(item.spot.id));
              if (item.spot.name) usedSpotNames.add(item.spot.name);
          }
      });

      return activeDaySpots.filter(spot => {
          const id = spot.id ? String(spot.id) : null;
          const name = spot.name;
          if (id && usedSpotIds.has(id)) return false;
          if (name && usedSpotNames.has(name)) return false;
          return true;
      });
  }, [activeDaySpots, timeline]);

  const getAffiliateUrl = (hotel: any) => {
    let targetUrl = "";

    // パターンA: IDがある場合
    if (hotel.id) {
        targetUrl = `https://hotel.travel.rakuten.co.jp/hotelinfo/plan/${hotel.id}?f_teikei=&f_heya_su=1&f_sort=min_charge`;
    }
    // パターンB: 既存URL
    else if (hotel.url && hotel.url.includes('rakuten.co.jp')) {
        targetUrl = hotel.url;
    }
    // フォールバック
    else {
        targetUrl = `https://search.travel.rakuten.co.jp/ds/hotel/search?f_query=${encodeURIComponent(hotel.name)}`;
    }

    return targetUrl;
  };

  const getDirectionsUrl = (index: number) => {
      const prevSpot = timeline[index - 1]?.spot?.name;
      const nextSpot = timeline[index + 1]?.spot?.name;
      const prevDepartureTime = timeline[index - 1]?.departure;
      const mode = TRANSPORT_MODES.find(m => m.id === (timeline[index].transport_mode || 'car'))?.googleMode || 'driving';
      
      if (prevSpot && nextSpot && prevDepartureTime) {
          const [hours, minutes] = prevDepartureTime.split(':').map(Number);
          const date = new Date();
          date.setHours(hours, minutes, 0, 0);

          if (date.getTime() < Date.now()) {
              date.setDate(date.getDate() + 1);
          }

          const timestamp = Math.floor(date.getTime() / 1000);
          return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(prevSpot)}&destination=${encodeURIComponent(nextSpot)}&travelmode=${mode}&departure_time=${timestamp}`;
      }
      return null;
  };
  
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !editItem) return;
      const reader = new FileReader();
      reader.onloadend = () => {
          setEditItem({ ...editItem, data: { ...editItem.data, image: reader.result as string } });
      };
      reader.readAsDataURL(file);
  };

  const calculateSchedule = (currentTimeline: any[]) => {
      let currentTime = new Date(`2000-01-01T${startTime}:00`);
      const newTimeline = currentTimeline.map((item) => {
          const newItem = { ...item };
          if (item.type === 'travel') {
              const duration = item.duration_min !== undefined ? item.duration_min : 0;
              currentTime = new Date(currentTime.getTime() + duration * 60000);
          } else if (item.type === 'spot') {
              newItem.arrival = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              
              let stayTime = item.stay_min;
              if (stayTime === undefined || stayTime === null) {
                  stayTime = item.spot.stay_time || 60;
              }

              if (item.spot.is_hotel) {
                  const nextMorning = new Date(currentTime);
                  nextMorning.setDate(nextMorning.getDate() + 1);
                  const [nextH, nextM] = startTime.split(':').map(Number);
                  nextMorning.setHours(nextH, nextM, 0, 0);
                  const diffMin = (nextMorning.getTime() - currentTime.getTime()) / 60000;
                  stayTime = Math.max(diffMin, 60);
                  newItem.is_overnight = true;
              }
              currentTime = new Date(currentTime.getTime() + stayTime * 60000);
              newItem.departure = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              newItem.stay_min = stayTime;
          }
          return newItem;
      });
      return newTimeline;
  };

  useEffect(() => {
      if (timeline.length > 0) {
          setTimeline(calculateSchedule(timeline));
      }
  }, [startTime]);

  const fetchSpotImage = async (name: string) => {
      try {
          const res = await fetch(`${API_BASE_URL}/api/get_spot_image?query=${encodeURIComponent(name)}`);
          if (res.ok) {
              const data = await res.json();
              return data.image_url;
          }
      } catch (e) { console.error("Image fetch failed", e); }
      return null;
  };

  useEffect(() => {
    if (timeline.length > 0) {
        const newTimeline = [...timeline];
        newTimeline.forEach((item, index) => {
            if (item.type === 'spot') {
                const spotId = item.spot.id || item.spot.name;
                const currentSpot = spots.find(s => (s.id && String(s.id) === String(spotId)) || s.name === item.spot.name);
                if (currentSpot && currentSpot.image_url) return; 

                if ((!item.image && !item.spot.image_url) && !attemptedImageFetch.current.has(spotId)) {
                    attemptedImageFetch.current.add(spotId);
                    fetchSpotImage(item.spot.name).then(url => {
                        if (url) {
                            setTimeline(prev => {
                                const next = [...prev];
                                if (next[index] && next[index].type === 'spot') {
                                    next[index] = { ...next[index], image: url, spot: { ...next[index].spot, image_url: url } };
                                }
                                return next;
                            });
                            if (roomId && item.spot.id && !String(item.spot.id).startsWith('spot-')) {
                                supabase.from('spots').update({ image_url: url }).eq('id', item.spot.id).then();
                            }
                        }
                    });
                }
            }
        });
    }
  }, [timeline, roomId, spots]);

  useEffect(() => {
    if (roomId && isPlanGenerated) {
        const storageKey = `rh_plan_${roomId}_day_${selectedDay}`;
        localStorage.setItem(storageKey, JSON.stringify({ timeline, routeGeoJSON, updatedAt: Date.now() }));
    }
  }, [timeline, routeGeoJSON, isPlanGenerated, roomId, selectedDay]);

  useEffect(() => {
    if (roomId) {
        const storageKey = `rh_plan_${roomId}_day_${selectedDay}`;
        const savedPlan = localStorage.getItem(storageKey);
        if (savedPlan) {
            try {
                const data = JSON.parse(savedPlan);
                setTimeline(Array.isArray(data.timeline) ? data.timeline : []);
                setRouteGeoJSON(data.routeGeoJSON || null);
                setIsPlanGenerated(true);
                return;
            } catch (e) { console.error("Restore error", e); }
        }
        setTimeline([]);
        setRouteGeoJSON(null);
        setIsPlanGenerated(false);
    }
  }, [roomId, selectedDay]); 

  const handleAutoGenerate = async () => {
    if (activeDaySpots.length < 2) return alert("この日のスポットが2つ以上必要です");
    
    if (isPlanGenerated && !confirm("現在のルート表示は失われます。\n最適化を実行してもよろしいですか？")) {
        return;
    }

    setIsProcessing(true);
    try {
      let targetSpots = [...activeDaySpots];

      if (prevDayHotel) {
          const others = targetSpots.filter(s => 
              !(s.id && String(s.id) === String(prevDayHotel.id)) && s.name !== prevDayHotel.name
          );
          others.sort((a, b) => (b.votes || 0) - (a.votes || 0));
          
          targetSpots = [prevDayHotel, ...others];
      } else {
          targetSpots.sort((a, b) => (b.votes || 0) - (a.votes || 0));
      }

      const res = await fetch(`${API_BASE_URL}/api/optimize_route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            spots: targetSpots, 
            start_time: startTime, 
            end_time: endTime, 
            start_spot_name: startSpotName || null, 
            end_spot_name: endSpotName || null 
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const initialTimeline = data.timeline || [];
      const calculatedTimeline = calculateSchedule(initialTimeline);

      setTimeline(calculatedTimeline);
      setRouteGeoJSON(data.route_geometry);
      setIsPlanGenerated(true);
      
      const newCount = optimizeCount + 1;
      setOptimizeCount(newCount);
      supabase.from('rooms').update({ optimize_count: newCount }).eq('id', roomId).then();
    } catch (e: any) { alert(`エラー: ${e.message}`); } finally { setIsProcessing(false); }
  };

  // --- ★追加: 自動スクロール制御関数 ---
  const startAutoScroll = (direction: 'up' | 'down', container: HTMLDivElement) => {
    if (scrollInterval.current) return; // すでにスクロール中なら何もしない
    
    scrollInterval.current = setInterval(() => {
        const speed = 15; // スクロール速度 (ピクセル/tick)
        if (direction === 'up') {
            container.scrollTop -= speed;
        } else {
            container.scrollTop += speed;
        }
    }, 16); // 60fps程度
  };

  const stopAutoScroll = () => {
    if (scrollInterval.current) {
        clearInterval(scrollInterval.current);
        scrollInterval.current = null;
    }
  };

  const onDragStart = (e: React.DragEvent, timelineIndex: number) => {
      e.dataTransfer.setData('text/plain', String(timelineIndex));
      e.dataTransfer.effectAllowed = "move";
      setTimeout(() => { setDraggedItemIndex(timelineIndex); }, 0);
  };

  const onDragEnd = (e: React.DragEvent) => { 
      setDraggedItemIndex(null); 
      stopAutoScroll(); // ドラッグ終了時にスクロール停止
  };
  
  // ★変更: onDragOverで自動スクロールをトリガー
  const onDragOver = (e: React.DragEvent) => { 
      e.preventDefault(); 
      e.dataTransfer.dropEffect = "move"; 

      const container = listRef.current;
      if (!container) return;

      const { top, bottom } = container.getBoundingClientRect();
      const mouseY = e.clientY;
      const threshold = 100; // 端から100px以内ならスクロール開始

      if (mouseY < top + threshold) {
          startAutoScroll('up', container);
      } else if (mouseY > bottom - threshold) {
          startAutoScroll('down', container);
      } else {
          stopAutoScroll(); // 範囲外なら停止
      }
  };
  
  const onDrop = async (e: React.DragEvent, targetTimelineIndex: number) => {
    e.preventDefault();
    e.stopPropagation(); 
    stopAutoScroll(); // ドロップ時にスクロール停止

    const rawIndex = e.dataTransfer.getData('text/plain');
    const sourceIndex = parseInt(rawIndex, 10);
    const effectiveSourceIndex = !isNaN(sourceIndex) ? sourceIndex : draggedItemIndex;
    if (effectiveSourceIndex === null || effectiveSourceIndex === targetTimelineIndex) return;

    const draggedItem = timeline[effectiveSourceIndex];
    if (!draggedItem || draggedItem.type !== 'spot') return; 

    // 1. ローカルのタイムラインを並び替え
    const currentSpotsOnly = timeline.filter(item => item.type === 'spot');
    const currentTravelsOnly = timeline.filter(item => item.type === 'travel');
    const draggedSpotIndex = currentSpotsOnly.findIndex(s => s.spot.name === draggedItem.spot.name);
    
    let insertIndex = 0;
    for(let i=0; i < targetTimelineIndex; i++) {
        if(timeline[i].type === 'spot' && i !== effectiveSourceIndex) { insertIndex++; }
    }

    const newSpotsOrder = [...currentSpotsOnly];
    const [movedSpot] = newSpotsOrder.splice(draggedSpotIndex, 1);
    newSpotsOrder.splice(insertIndex, 0, movedSpot);

    const reconstructedTimeline: any[] = [];
    newSpotsOrder.forEach((spotItem, i) => {
        reconstructedTimeline.push(spotItem);
        if (i < newSpotsOrder.length - 1) {
            const existingTravel = currentTravelsOnly[i]; 
            if (existingTravel) reconstructedTimeline.push(existingTravel);
            else reconstructedTimeline.push({ type: 'travel', duration_min: 30, transport_mode: 'car' });
        }
    });

    // ローカルStateの更新
    setTimeline(calculateSchedule(reconstructedTimeline));
    setDraggedItemIndex(null);

    // 2. データベースと親コンポーネントの更新
    if (roomId) {
        // 並び替えられたスポットのリスト抽出
        const activeSpots = newSpotsOrder.map(item => item.spot);
        const fullSpotsList = [...spots]; // 親から渡された全スポット

        // orderの更新
        activeSpots.forEach((s, idx) => {
            // DB更新
            supabase.from('spots').update({ order: idx }).eq('id', s.id).then();
            
            // ローカルリスト内での更新
            const target = fullSpotsList.find(fs => fs.id === s.id);
            if (target) {
                target.order = idx;
            }
        });

        // 親コンポーネント(Page.tsx)へ通知
        // 順番通りにソートして渡す
        fullSpotsList.sort((a, b) => (a.order || 0) - (b.order || 0));
        onUpdateSpots(fullSpotsList);

        // LocalStorageも即座に更新 (Page.tsxが参照するキーを更新)
        const storageKey = `rh_plan_${roomId}_day_${selectedDay}`;
        localStorage.setItem(storageKey, JSON.stringify({ 
            timeline: calculateSchedule(reconstructedTimeline), 
            updatedAt: Date.now() 
        }));
    }
  };

const handleEditSave = async () => {
      if (!editItem) return;
      
      const newTimeline = [...timeline];
      newTimeline[editItem.index] = editItem.data;
      setTimeline(calculateSchedule(newTimeline));

      if (editItem.type === 'spot' && roomId) {
          const spotId = editItem.data.spot.id;
          
          const updates = {
              comment: editItem.data.spot.comment,
              link: editItem.data.url,
              price: editItem.data.spot.cost ? parseInt(editItem.data.spot.cost) : null
          };

          const newSpots = spots.map(s => {
              if ((s.id && String(s.id) === String(spotId)) || s.name === editItem.data.spot.name) {
                  return { ...s, ...updates };
              }
              return s;
          });
          onUpdateSpots(newSpots);

          if (spotId && !String(spotId).startsWith('spot-') && !String(spotId).startsWith('ai-')) {
              try {
                  await supabase
                      .from('spots')
                      .update(updates)
                      .eq('id', spotId);
              } catch (e) {
                  console.error("Failed to update spot details", e);
              }
          }
      }

      setEditItem(null);
  };

const handleTimeChange = (index: number, value: string) => {
    const val = value === '' ? 0 : parseInt(value, 10);
    if (isNaN(val)) return;
    
    const newTimeline = [...timeline];
    if (newTimeline[index].type === 'travel') {
        newTimeline[index].duration_min = val;
    } else {
        newTimeline[index].stay_min = val;
        if(newTimeline[index].spot) newTimeline[index].spot.stay_time = val;
    }
    setTimeline(newTimeline);
};

const handleDepartureChange = (index: number, newDeparture: string) => {
    const newTimeline = [...timeline];
    if (newTimeline[index]) {
        newTimeline[index].departure = newDeparture;
        setTimeline(newTimeline);
    }
};

const handleArrivalChange = (index: number, newArrival: string) => {
    const newTimeline = [...timeline];
    if (newTimeline[index]) {
        newTimeline[index].arrival = newArrival;
        setTimeline(newTimeline);
    }
};

  const handleTransportChange = (index: number, mode: string) => {
      const newTimeline = [...timeline];
      newTimeline[index].transport_mode = mode;
      setTimeline(calculateSchedule(newTimeline));
  };

  const toggleSpotInclusion = (spot: any, isAdding: boolean) => {
    if (isAdding) {
        const lastItem = timeline[timeline.length - 1];
        const newItems = [];
        if (lastItem && lastItem.type === 'spot') {
            newItems.push({ type: 'travel', duration_min: 30, transport_mode: 'car' });
        }
        newItems.push({ type: 'spot', spot, stay_min: 60 });
        const newTimeline = [...timeline, ...newItems];
        setTimeline(calculateSchedule(newTimeline));
    } else {
        if (!confirm("スケジュールから外しますか？")) return;
        const spotIndex = timeline.findIndex(t => t.type === 'spot' && t.spot.name === spot.name);
        if (spotIndex === -1) return;
        let newTimeline = [...timeline];
        if (spotIndex === 0) {
            if (newTimeline[1]?.type === 'travel') newTimeline.splice(0, 2); 
            else newTimeline.splice(0, 1);
        } else {
             if (newTimeline[spotIndex - 1]?.type === 'travel') newTimeline.splice(spotIndex - 1, 2); 
             else newTimeline.splice(spotIndex, 1);
        }
        if (newTimeline.length > 0 && newTimeline[newTimeline.length - 1].type === 'travel') newTimeline.pop();
        setTimeline(calculateSchedule(newTimeline));
    }
  };

  const handleDownloadImage = async () => {
      if (!captureRef.current) return;
      setIsSavingImage(true);
      try {
          let html2canvasFunc = window.html2canvas;
          if (!html2canvasFunc) {
              try {
                  const module = await import('html2canvas');
                  html2canvasFunc = module.default;
              } catch (e) {
                  if (!document.querySelector('script[src*="html2canvas"]')) {
                      const script = document.createElement('script');
                      script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
                      document.head.appendChild(script);
                      await new Promise((resolve, reject) => {
                          script.onload = resolve;
                          script.onerror = reject;
                      });
                  }
                  await new Promise(r => setTimeout(r, 200));
                  html2canvasFunc = window.html2canvas;
              }
          }
          if (!html2canvasFunc) throw new Error("画像生成ライブラリの読み込みに失敗しました");
          const element = captureRef.current;
          const originalScroll = window.scrollY;
          window.scrollTo(0, 0);
          const canvas = await html2canvasFunc(element, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
          window.scrollTo(0, originalScroll);
          const link = document.createElement('a');
          link.href = canvas.toDataURL('image/png');
          link.download = `plan_day${selectedDay}_${Date.now()}.png`;
          link.click();
      } catch (error) { console.error("Screenshot failed", error); alert("画像の保存に失敗しました。もう一度お試しください。"); } finally { setIsSavingImage(false); }
  };

  if (showScreenshotMode) {
      let spotCounter = 0;
      return (
          <div ref={scrollContainerRef} className="fixed inset-0 z-[100] bg-white text-gray-900 overflow-y-auto">
              <div className="sticky top-0 left-0 right-0 pt-20 pb-4 px-6 z-50 flex items-center justify-between bg-white/95 backdrop-blur-sm border-b border-gray-100 shadow-sm">
                   <button onClick={handleCloseScreenshot} className="flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-gray-900 transition bg-gray-100 px-4 py-3 rounded-full shadow-sm">
                       <ArrowLeft size={18}/> 戻る
                   </button>
                   <button onClick={handleDownloadImage} disabled={isSavingImage || timeline.length === 0} className="flex items-center gap-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition px-5 py-3 rounded-full shadow-md disabled:opacity-50">
                       {isSavingImage ? <Loader2 size={18} className="animate-spin"/> : <Camera size={18}/>} <span>画像保存</span>
                   </button>
              </div>
              <div ref={captureRef} className="p-8 max-w-lg mx-auto min-h-screen bg-white pb-32">
                  <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-200">
                      <div><p className="text-xs font-bold text-gray-400 tracking-wider">TRAVEL LOG</p><h1 className="text-3xl font-black tracking-tight text-gray-800">Day {selectedDay}</h1></div>
                      <div className="flex gap-1" data-html2canvas-ignore="true">
                         {Array.from({ length: displayDays }).map((_, i) => (
                              <button key={i} onClick={() => { setSelectedDay(i + 1); setIsPlanGenerated(false); setRouteGeoJSON(null); }} className={`w-8 h-8 rounded-full text-xs font-bold transition-all border flex items-center justify-center ${selectedDay === i + 1 ? 'bg-black text-white border-black' : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'}`}>
                                  {i + 1}
                              </button>
                          ))}
                      </div>
                  </div>
                  <div className="space-y-0 relative pl-4">
                      <div className="absolute left-[19px] top-2 bottom-2 w-[2px] bg-gray-200 z-0"></div>
                      {timeline.length === 0 && <div className="text-center py-20 text-gray-400 text-sm font-bold">ルートが生成されていません</div>}
                      {timeline.map((item, i) => {
                          if (item.type === 'spot') {
                              const displaySpot = spots.find(s => (s.id && String(s.id) === String(item.spot.id)) || s.name === item.spot.name) || item.spot;
                              const displayImage = displaySpot.image_url || item.image || item.spot.image_url;
                              spotCounter++;
                              return (
                                  <div key={i} className="relative z-10 mb-8 pl-10 break-inside-avoid">
                                      <div className="absolute left-0 top-1 w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center font-bold text-lg text-white border-4 border-white shadow-sm">{spotCounter}</div>
                                      <div>
                                          <div className="flex items-center gap-2 mb-1">
                                              <span className="text-xl font-bold tracking-tight text-indigo-600">{item.arrival}</span>
                                              <ArrowRight size={14} className="text-gray-400"/>
                                              <span className="text-sm font-medium text-gray-500">{item.departure}</span>
                                          </div>
                                          <h3 className="text-lg font-bold leading-snug mb-1 text-gray-800">{item.spot.name}</h3>
                                          {item.spot.cost && <div className="text-xs font-bold text-gray-500 mb-1 flex items-center gap-1"><Banknote size={12}/> ¥{Number(item.spot.cost).toLocaleString()}</div>}
                                          {displayImage ? (<div className="w-full h-40 mb-2 rounded-lg overflow-hidden bg-gray-100 mt-2 border border-gray-200 shadow-sm"><img src={displayImage} alt={item.spot.name} className="w-full h-full object-cover" crossOrigin="anonymous"/></div>) : null}
                                          {item.spot.comment && <p className="text-xs text-gray-600 bg-gray-50 p-2 rounded border border-gray-100 mt-1 whitespace-pre-wrap">{item.spot.comment}</p>}
                                          <div className="text-xs text-gray-500 flex items-center gap-1 mt-1"><Clock size={12}/> 滞在: {item.stay_min}分</div>
                                      </div>
                                  </div>
                              );
                          } else if (item.type === 'travel') {
                              const mode = TRANSPORT_MODES.find(m => m.id === (item.transport_mode || 'car')) || TRANSPORT_MODES[0];
                              return (
                                  <div key={i} className="relative z-10 mb-8 pl-12 flex flex-col gap-1">
                                      <div className="flex items-center gap-2 text-gray-400 text-xs font-bold">{mode.icon} <span>{item.duration_min}分 移動</span></div>
                                      
                                      <div className="flex flex-wrap gap-2">
                                          {(item.transport_departure || item.transport_arrival) && (
                                              <div className="text-xs font-bold text-gray-600 flex items-center gap-1 bg-gray-100 px-2 py-1 rounded w-max">
                                                  {item.transport_departure && <span>{item.transport_departure}発</span>}
                                                  {item.transport_departure && item.transport_arrival && <ArrowRight size={10} className="text-gray-400"/>}
                                                  {item.transport_arrival && <span>{item.transport_arrival}着</span>}
                                              </div>
                                          )}
                                          {item.cost && (
                                              <div className="text-xs font-bold text-gray-500 flex items-center gap-1 bg-gray-50 px-2 py-1 rounded w-max border border-gray-200">
                                                  <Banknote size={10}/> ¥{Number(item.cost).toLocaleString()}
                                              </div>
                                          )}
                                      </div>
                                      {item.note && <div className="text-[10px] text-gray-500 bg-gray-50 p-1.5 rounded border border-gray-100 max-w-[200px] flex items-start gap-1"><StickyNote size={10} className="shrink-0 mt-0.5"/> {item.note}</div>}
                                  </div>
                              );
                          }
                      })}
                  </div>
              </div>
          </div>
      );
  }

  let spotCounter = 0;

  return (
    <div className="flex flex-col h-full bg-gray-50 relative font-sans text-gray-800 overflow-hidden">
      
      {editItem && (
          <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[70vh] mb-16">
                  
                  {/* ヘッダー (固定) */}
                  <div className="flex justify-between items-center border-b border-gray-100 p-4 shrink-0">
                      <h3 className="font-bold text-gray-800 flex items-center gap-2">
                          <Edit3 size={16}/> {editItem.type === 'spot' ? 'スポット詳細を編集' : '移動詳細を編集'}
                      </h3>
                      <button onClick={() => setEditItem(null)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 text-gray-500"><X size={16}/></button>
                  </div>
                  
                  {/* コンテンツ (スクロール可能) */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* --- スポット編集モード --- */}
                    {editItem.type === 'spot' && (
                        <>
                            <div>
                                <label className="text-xs font-bold text-gray-500 mb-1 block">予算・費用</label>
                                <div className="relative">
                                    <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16}/>
                                    <input 
                                        type="number" 
                                        placeholder="例: 1500"
                                        value={editItem.data.spot?.cost || ''} 
                                        onChange={(e) => setEditItem({...editItem, data: {...editItem.data, spot: {...editItem.data.spot, cost: e.target.value}}})} 
                                        className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 pl-10 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-gray-800 transition"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 mb-1 block">参考URL</label>
                                <input type="text" value={editItem.data.url || ''} onChange={(e) => setEditItem({...editItem, data: {...editItem.data, url: e.target.value}})} className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-gray-800 transition"/>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 mb-1 block">メモ</label>
                                <textarea value={editItem.data.spot?.comment || ''} onChange={(e) => setEditItem({...editItem, data: {...editItem.data, spot: {...editItem.data.spot, comment: e.target.value}}})} className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-gray-800 h-20 resize-none transition"/>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 mb-2 block">写真</label>
                                <div className="relative h-40 w-full rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                                    {editItem.data.image ? (
                                        <>
                                            <SpotImage src={editItem.data.image} alt="preview" className="w-full h-full"/>
                                            <button onClick={() => setEditItem({...editItem, data: {...editItem.data, image: null}})} className="absolute top-2 right-2 bg-white/80 text-gray-700 p-2 rounded-full hover:bg-red-50 hover:text-red-500 shadow-sm"><Trash2 size={16}/></button>
                                        </>
                                    ) : (
                                        <label className="flex flex-col items-center justify-center h-full w-full cursor-pointer hover:bg-gray-100 transition text-gray-400 hover:text-indigo-500">
                                            <Upload size={20} className="mb-1"/>
                                            <span className="text-xs">画像をアップロード</span>
                                            <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden"/>
                                        </label>
                                    )}
                                </div>
                            </div>
                        </>
                    )}

                    {/* --- 移動編集モード --- */}
                    {editItem.type === 'travel' && (
                        <>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-bold text-gray-500 mb-1 block">出発時間</label>
                                    <input 
                                        type="time" 
                                        value={editItem.data.transport_departure || ''} 
                                        onChange={(e) => setEditItem({...editItem, data: {...editItem.data, transport_departure: e.target.value}})} 
                                        className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm font-bold focus:border-indigo-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 mb-1 block">到着時間</label>
                                    <input 
                                        type="time" 
                                        value={editItem.data.transport_arrival || ''} 
                                        onChange={(e) => setEditItem({...editItem, data: {...editItem.data, transport_arrival: e.target.value}})} 
                                        className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm font-bold focus:border-indigo-500 outline-none"
                                    />
                                </div>
                            </div>
                            
                            <div>
                                <label className="text-xs font-bold text-gray-500 mb-1 block">交通費</label>
                                <div className="relative">
                                    <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16}/>
                                    <input 
                                        type="number" 
                                        placeholder="例: 500"
                                        value={editItem.data.cost || ''} 
                                        onChange={(e) => setEditItem({...editItem, data: {...editItem.data, cost: e.target.value}})} 
                                        className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 pl-10 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-gray-800 transition"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-gray-500 mb-1 block">移動メモ (乗り場・便名など)</label>
                                <textarea 
                                    value={editItem.data.note || ''} 
                                    onChange={(e) => setEditItem({...editItem, data: {...editItem.data, note: e.target.value}})} 
                                    className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-gray-800 h-20 resize-none transition"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 mb-1 block">参考URL (時刻表など)</label>
                                <input 
                                    type="text" 
                                    value={editItem.data.url || ''} 
                                    onChange={(e) => setEditItem({...editItem, data: {...editItem.data, url: e.target.value}})} 
                                    className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-gray-800 transition"
                                />
                            </div>
                        </>
                    )}
                  </div>

                  {/* フッター (固定) */}
                  <div className="p-4 border-t border-gray-100 shrink-0">
                      <button onClick={handleEditSave} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-200">変更を保存</button>
                  </div>
              </div>
          </div>
      )}

      {/* ★変更: ref={listRef} を追加 */}
      <div 
        ref={listRef}
        className="flex-1 overflow-y-auto relative bg-gray-50 pb-20 custom-scrollbar min-h-0"
      >
        
        <div className="bg-white px-4 py-4 border-b border-gray-100 flex flex-col gap-3 sticky top-0 z-20 shadow-sm">

            <div className="flex justify-between items-center gap-2">
                <div className="flex gap-2 overflow-x-auto no-scrollbar flex-1">
                    {Array.from({ length: displayDays }).map((_, i) => (
                        <button 
                            key={i} 
                            onClick={() => { setSelectedDay(i + 1); setIsPlanGenerated(false); setRouteGeoJSON(null); }}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all shadow-sm border ${selectedDay === i + 1 ? 'bg-black text-white border-black' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-100'}`}
                        >
                            Day {i + 1}
                        </button>
                    ))}
                </div>
                
                <div className="flex items-center gap-2 shrink-0">
                    {isPlanGenerated && (
                        <>
                            <button onClick={() => setShowScreenshotMode(true)} className="p-2 bg-white text-gray-500 border border-gray-200 rounded-full shadow-sm hover:text-indigo-600 transition"><Camera size={18}/></button>
                        </>
                    )}
                </div>
            </div>
            
            <button 
                onClick={handleAutoGenerate} 
                disabled={activeDaySpots.length < 2 || isProcessing}
                className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-indigo-700 transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 disabled:shadow-none"
            >
                {isProcessing ? <Loader2 className="animate-spin w-4 h-4"/> : <Sparkles size={16}/>} ルート最適化(未実装)
            </button>
        </div>

        <div className="p-4">
            {!isPlanGenerated ? (
                 <div className="flex flex-col items-center justify-center py-12 text-center space-y-4 opacity-60">
                     <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center border border-gray-200 shadow-sm"><MapPin size={24} className="text-gray-400"/></div>
                     <div>
                        <h2 className="text-lg font-bold text-gray-700">ルートを作成しましょう</h2>
                        <p className="text-xs text-gray-500">Day {selectedDay} には {activeDaySpots.length}箇所のスポットがあります</p>
                     </div>
                 </div>
            ) : (
                <div className={`relative`}>
                    <div className="absolute left-[24px] top-4 bottom-4 w-0.5 bg-gray-200 z-0"></div>

                    {unusedSpots.length > 0 && (
                        <div className="mb-6 relative z-10 pl-14">
                            <button onClick={() => setShowUnusedList(!showUnusedList)} className="flex items-center gap-2 text-xs font-bold text-gray-500 mb-3 hover:text-indigo-600 transition bg-white/50 px-3 py-1 rounded-full w-max border border-gray-200">
                                <Layers size={14}/> 待機中スポット ({unusedSpots.length}) {showUnusedList ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
                            </button>
                            {showUnusedList && (
                                <div className="space-y-2">
                                    {unusedSpots.map((spot, i) => {
                                        const latestSpot = spots.find(s => (s.id && String(s.id) === String(spot.id)) || s.name === spot.name) || spot;
                                        return (
                                            <div key={`unused-${spot.id || i}`} className="bg-white p-3 rounded-lg border border-gray-200 flex justify-between items-center group shadow-sm">
                                                <div className="flex items-center gap-2 overflow-hidden">
                                                    {latestSpot.image_url && <img src={latestSpot.image_url} alt="" className="w-8 h-8 rounded-md object-cover bg-gray-100 shrink-0"/>}
                                                    <span className="text-xs font-medium text-gray-600 truncate flex-1">{spot.name}</span>
                                                </div>
                                                <button onClick={() => toggleSpotInclusion(spot, true)} className="text-indigo-600 hover:text-indigo-500 p-1 bg-indigo-50 rounded-full"><PlusCircle size={18}/></button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {timeline?.map((item, i) => {
                        if (item.type === 'spot') {
                          spotCounter++;
                          return (
                            <div 
                                key={`spot-${item.spot.id || i}`} 
                                className={`relative mb-6 z-10 pl-14 group transition-all duration-200 ${draggedItemIndex === i ? 'opacity-40 scale-[0.98]' : ''}`}
                                draggable={true} 
                                onDragStart={(e) => onDragStart(e, i)} 
                                onDragEnd={onDragEnd}
                                onDragOver={onDragOver} 
                                onDrop={(e) => onDrop(e, i)}
                                style={{ touchAction: 'pan-y' }} 
                            >
                              <div className={`absolute left-0 top-6 -translate-y-1/2 w-12 h-12 rounded-xl flex flex-col items-center justify-center font-bold shadow-md border-[3px] z-20 transition-transform bg-white border-white text-indigo-600 ring-1 ring-gray-100`}>
                                <span className="text-lg leading-none">{String(spotCounter).padStart(2, '0')}</span>
                              </div>
                              
                              

                              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:border-indigo-400 hover:shadow-md transition-all cursor-grab active:cursor-grabbing" onClick={() => setEditItem({index: i, type: 'spot', data: item})}>
                                <div className="flex min-h-[6rem]">
                                    <div className="w-24 bg-gray-100 shrink-0 relative border-r border-gray-100">
                                        {(() => {
                                            const displaySpot = spots.find(s => 
                                                (s.id && String(s.id) === String(item.spot.id)) || 
                                                s.name === item.spot.name
                                            ) || item.spot;
                                            const displayImage = displaySpot.image_url || item.image || item.spot.image_url;
                                            
                                            return <SpotImage src={displayImage} alt={item.spot.name} className="w-full h-full"/>;
                                        })()}
                                        
                                        {item.is_overnight && <div className="absolute top-0 right-0 bg-indigo-600 text-white text-[9px] font-bold px-1.5 py-0.5 shadow-sm">宿泊</div>}
                                    </div>

                                    <div className="flex-1 p-3 flex flex-col justify-between">

                                        <div>
                                            <div className="flex justify-between items-start mb-1">
                                                <h3 className="font-bold text-gray-800 text-sm line-clamp-1">{item.spot.name}</h3>
                                                <button onClick={(e) => { e.stopPropagation(); toggleSpotInclusion(item.spot, false); }} className="text-gray-400 hover:text-red-500 p-1"><MinusCircle size={16}/></button>
                                            </div>
                                           {/* 修正箇所：スポットの到着・出発時間入力部分 */}
                                           {/* --- PlanView.tsx 1250行目付近: 到着時間入力エリア --- */}

<div className="flex items-center gap-2 text-xs font-bold text-indigo-500 font-mono bg-indigo-50 w-max px-2 py-0.5 rounded" onClick={(e) => e.stopPropagation()}>
    {(() => {
        // ▼▼▼ 追加: 前のスポットからの時間の整合性チェック ▼▼▼
        let isArrivalInconsistent = false;
        // 2つ前の要素(前のスポット)と、1つ前の要素(移動)を取得
        const prevTravel = timeline[i - 1];
        const prevSpot = timeline[i - 2];
        
        // 前のスポットの出発時間 と 移動時間 がある場合のみ計算
        if (prevTravel && prevTravel.type === 'travel' && prevSpot && prevSpot.type === 'spot' && prevSpot.departure && item.arrival) {
            const [pH, pM] = prevSpot.departure.split(':').map(Number);
            const [cH, cM] = item.arrival.split(':').map(Number);
            const travelMin = prevTravel.duration_min || 0;
            
            // 分単位に変換して比較 (24時間表記のループを考慮して 1440 で割った余り)
            const expectedMin = (pH * 60 + pM + travelMin) % 1440;
            const currentMin = (cH * 60 + cM) % 1440;
            
            if (expectedMin !== currentMin) {
                isArrivalInconsistent = true;
            }
        }
        // ▲▲▲ 追加ここまで ▲▲▲

        return (
            <input 
                type="time" 
                value={item.arrival || ""} 
                onChange={(e) => handleArrivalChange(i, e.target.value)}
                className={`bg-transparent font-bold text-xs font-mono w-[36px] text-center focus:outline-none border-b border-transparent focus:border-indigo-300 p-0 ${
                    isArrivalInconsistent 
                    ? "text-red-500 underline decoration-red-500 decoration-wavy" // 不整合なら赤＋波線
                    : "text-indigo-600" // 通常時はインディゴ
                }`}
            />
        );
    })()}
    
    <ArrowRight size={10} className="text-indigo-300"/>
    
    <input 
        type="time" 
        value={item.departure || ""} 
        onChange={(e) => handleDepartureChange(i, e.target.value)}
        className="bg-transparent text-indigo-600 font-bold text-xs font-mono w-[36px] text-center focus:outline-none border-b border-transparent focus:border-indigo-300 p-0"
    />
</div>
                                        </div>

                                       {/* --- PlanView.tsx の type==='spot' 内の下部エリア --- */}
                                        <div className="flex flex-col gap-1.5 mt-2">
                                            {/* タグエリア (時間、金額、リンク) */}
                                            <div className="flex flex-wrap gap-1.5 items-center">
                                                {!item.is_overnight && (
                                                    <div className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded border border-gray-200" onClick={(e) => e.stopPropagation()}>
                                                        <Clock size={10} className="text-gray-500"/>
                                                        {/* ★修正箇所：滞在時間を自動計算して表示に変更 */}
                                                        {/* 滞在時間表示 (自動計算 + 警告スタイル) */}
<span className="text-xs font-bold">
    {(() => {
        if (!item.arrival || !item.departure) return <span className="text-gray-700">0分</span>;
        
        const [sH, sM] = item.arrival.split(':').map(Number);
        const [eH, eM] = item.departure.split(':').map(Number);
        const diff = (eH * 60 + eM) - (sH * 60 + sM);
        
        // ★判定: マイナスの場合は警告扱い
        const isInvalid = diff < 0;

        const abs = Math.abs(diff);
        const h = Math.floor(abs / 60);
        const m = abs % 60;
        const sign = isInvalid ? "-" : "";
        
        let text = `${sign}${m}分`;
        if (h > 0) {
            text = `${sign}${h}時間${m > 0 ? m + "分" : ""}`;
        }
        
        return (
            <span className={
                isInvalid 
                ? "text-red-500 underline decoration-red-500 decoration-wavy" // 赤文字＋波線
                : "text-gray-700" // 通常
            }>
                {text}
            </span>
        );
    })()}
</span>
                                                    </div>
                                                )}

                                                {/* 金額タグ */}
                                                {item.spot.cost && (
                                                    <div className="flex items-center gap-1 bg-yellow-50 px-2 py-1 rounded border border-yellow-100 text-[10px] font-bold text-yellow-700">
                                                        <Banknote size={10}/>
                                                        ¥{Number(item.spot.cost).toLocaleString()}
                                                    </div>
                                                )}

                                                {/* リンクタグ (ユーザー追加リンク) */}
                                                {item.spot.link && (
                                                    <a 
                                                        href={item.spot.link} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="flex items-center gap-1 bg-blue-50 px-2 py-1 rounded border border-blue-100 text-[10px] font-bold text-blue-600 hover:bg-blue-100 transition"
                                                    >
                                                        <LinkIcon size={10}/> リンク
                                                    </a>
                                                )}

                                                {/* 楽天アフィリエイトリンク (宿の場合) */}
                                                {item.spot.is_hotel && (
                                                    <a href={getAffiliateUrl(item.spot)} target="_blank" onClick={(e)=>e.stopPropagation()} className="bg-orange-50 text-orange-600 px-2 py-1 rounded text-[10px] font-bold border border-orange-200 hover:bg-orange-100 transition shadow-sm flex items-center gap-1">
                                                        <ExternalLink size={10}/> 空室確認(無効)
                                                    </a>
                                                )}
                                            </div>

                                            {/* メモ表示エリア (あれば表示) */}
                                            {item.spot.comment && (
                                                <div className="text-[10px] text-gray-600 bg-gray-50 p-2 rounded border border-gray-100 w-full whitespace-pre-wrap flex items-start gap-1">
                                                    <StickyNote size={10} className="shrink-0 mt-0.5 text-gray-400"/>
                                                    {item.spot.comment}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                              </div>
                            </div>
                          );
                        } else if (item.type === 'travel') {
                          const mode = TRANSPORT_MODES.find(m => m.id === (item.transport_mode || 'car')) || TRANSPORT_MODES[0];
                          const mapLink = getDirectionsUrl(i);

                          return (
                            <div 
                                key={`travel-${i}`} 
                                className="pl-14 mb-6 relative group"
                                onDragOver={onDragOver}
                                onDrop={(e) => onDrop(e, i)}
                            >
                                <div className="flex flex-col gap-1 w-full sm:w-auto">
                                    <div className="flex items-center gap-3">
                                        <div className="h-full absolute left-[24px] top-0 bottom-0 flex flex-col items-center justify-center z-0"></div>
                                        
                                        <div className="bg-white border border-gray-200 rounded-full px-4 py-2 flex items-center gap-3 text-xs shadow-sm hover:border-gray-300 transition w-full sm:w-auto relative">
                                            
                                            <div 
                                                className="text-gray-500 cursor-pointer hover:text-indigo-600 flex items-center gap-1 transition relative" 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setActiveTransportMenuIndex(activeTransportMenuIndex === i ? null : i);
                                                }}
                                            >
                                                {mode.icon}
                                                <ChevronDown size={10} className="opacity-50"/>
                                            </div>

                                            {activeTransportMenuIndex === i && (
                                                <>
                                                    <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setActiveTransportMenuIndex(null); }} />
                                                    
                                                    <div className="absolute top-full left-0 mt-2 bg-white shadow-xl rounded-xl border border-gray-100 p-2 z-50 flex flex-wrap gap-1 w-[180px] animate-in fade-in zoom-in-95">
                                                        {TRANSPORT_MODES.map((m) => (
                                                            <button
                                                                key={m.id}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleTransportChange(i, m.id);
                                                                    setActiveTransportMenuIndex(null);
                                                                }}
                                                                className={`p-2 rounded-lg flex flex-col items-center justify-center gap-1 w-[50px] h-[50px] transition ${
                                                                    m.id === mode.id 
                                                                    ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' 
                                                                    : 'hover:bg-gray-50 text-gray-500 border border-transparent'
                                                                }`}
                                                            >
                                                                {m.icon}
                                                                <span className="text-[9px] font-bold leading-none">{m.label}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </>
                                            )}

                                            <div className="h-4 w-px bg-gray-200"></div>
                                            <div className="flex items-center gap-1">
                                                <input type="number" value={item.duration_min} onChange={(e) => handleTimeChange(i, e.target.value)} className="w-8 bg-transparent text-center font-bold text-gray-600 focus:text-indigo-600 outline-none"/>
                                                <span className="text-[10px] text-gray-400">分</span>
                                            </div>
                                            {mapLink && (
                                                <a href={mapLink} target="_blank" className="text-gray-400 hover:text-green-600 ml-1 transition"><MapPinned size={14}/></a>
                                            )}
                                            
                                            <button 
                                                onClick={() => setEditItem({index: i, type: 'travel', data: item})}
                                                className="ml-2 text-gray-400 hover:text-indigo-600 p-1 rounded-full hover:bg-gray-100 transition"
                                            >
                                                <Edit3 size={12}/>
                                            </button>
                                        </div>
                                    </div>

                                    {(item.transport_departure || item.transport_arrival || item.note || item.url || item.cost) && (
                                        <div className="flex flex-wrap gap-2 mt-1 ml-2">
                                            {(item.transport_departure || item.transport_arrival) && (
                                                <div className="bg-indigo-50 border border-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1">
                                                    <Clock size={10}/>
                                                    {item.transport_departure && <span>{item.transport_departure}発</span>}
                                                    {item.transport_departure && item.transport_arrival && <span className="mx-0.5 text-indigo-300">→</span>}
                                                    {item.transport_arrival && <span>{item.transport_arrival}着</span>}
                                                </div>
                                            )}
                                            {item.cost && (
                                                <div className="bg-yellow-50 border border-yellow-100 text-yellow-700 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1">
                                                    <Banknote size={10}/> ¥{Number(item.cost).toLocaleString()}
                                                </div>
                                            )}
                                            {item.note && (
                                                <div className="bg-gray-100 border border-gray-200 text-gray-600 px-2 py-0.5 rounded text-[10px] flex items-center gap-1 max-w-[200px] truncate">
                                                    <StickyNote size={10}/> {item.note}
                                                </div>
                                            )}
                                            {item.url && (
                                                <a href={item.url} target="_blank" className="bg-blue-50 border border-blue-100 text-blue-600 px-2 py-0.5 rounded text-[10px] flex items-center gap-1 hover:bg-blue-100">
                                                    <LinkIcon size={10}/> リンク
                                                </a>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                          );
                        }
                    })}
                    
                    <div className="absolute left-[24px] bottom-0 w-3 h-3 bg-gray-400 rounded-full -translate-x-1/2 border-2 border-white shadow-sm"></div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
}