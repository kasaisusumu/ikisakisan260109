"use client";

import { useState, useEffect, useRef, useMemo } from 'react';
import { 
  MapPin, Car, Clock, X, Loader2, Sparkles, MinusCircle, 
  Edit3, Train, Plane, Ship, Footprints, Zap, 
  Image as ImageIcon, Link as LinkIcon, Camera, Upload, 
  Trash2, PlusCircle, MapPinned, ArrowRight, ArrowLeft,
  ChevronDown, ChevronUp, Layers, Banknote, ExternalLink, StickyNote, Bus,
  CalendarCheck, CalendarX, User, AlertCircle, Check,RotateCcw // ★追加
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// html2canvas回避
declare global {
    interface Window {
        html2canvas: any;
    }
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// --- 画像コンポーネント ---
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
                crossOrigin="anonymous"
            />
        </div>
    );
};

// --- 予約管理ボタンコンポーネント ---
// --- 予約管理モーダルコンポーネント (新規追加: ロジックと表示を担当) ---
const ReservationModal = ({ 
    spot, 
    roomId, 
    onUpdate, 
    currentUser, 
    onClose 
}: { 
    spot: any, 
    roomId: string, 
    onUpdate: (s: any) => void, 
    currentUser?: string, 
    onClose: () => void 
}) => {
    const [nameInput, setNameInput] = useState(spot.reserved_by || currentUser || "Guest");
    const [isUpdating, setIsUpdating] = useState(false);
    const [viewMode, setViewMode] = useState<'default' | 'confirm_cancel'>('default');

    const isReserved = spot.reservation_status === 'reserved';

    const handleUpdateStatus = async (status: 'reserved' | 'unreserved') => {
        if (!spot.id) return;
        setIsUpdating(true);
        try {
            const updates = {
                reservation_status: status,
                reserved_by: status === 'reserved' ? nameInput : null
            };
            
            // DB更新
            if (!String(spot.id).startsWith('spot-') && !String(spot.id).startsWith('ai-')) {
                await supabase.from('spots').update(updates).eq('id', spot.id);
            }
            
            onUpdate({ ...spot, ...updates });
            onClose(); // 更新成功時に閉じる
        } catch (e) {
            alert("更新エラーが発生しました");
        } finally {
            setIsUpdating(false);
        }
    };

    const renderModalContent = () => {
        if (!isReserved) {
            return (
                <>
                    <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2 text-lg">
                        <span className="text-2xl">🏨</span> 予約完了にしますか？
                    </h3>
                    <div className="mb-6">
                        <label className="text-xs font-bold text-gray-500 mb-1 block">予約担当者 (変更可能)</label>
                        <div className="relative">
                            <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                            <input 
                                type="text" 
                                value={nameInput}
                                onChange={(e) => setNameInput(e.target.value)}
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 pl-10 pr-3 text-base font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
                                placeholder="名前を入力"
                            />
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1 ml-1">※実際に予約サイトでの手続きを済ませてから押してください</p>
                    </div>
                    <div className="flex gap-3">
                        <button 
                            type="button"
                            onClick={onClose}
                            className="flex-1 bg-gray-100 text-gray-500 font-bold py-3 rounded-xl hover:bg-gray-200 transition"
                        >
                            キャンセル
                        </button>
                        <button 
                            type="button"
                            onClick={() => handleUpdateStatus('reserved')}
                            disabled={!nameInput.trim() || isUpdating}
                            className="flex-1 bg-green-600 text-white font-bold py-3 rounded-xl hover:bg-green-700 transition flex items-center justify-center gap-2 shadow-md shadow-green-200"
                        >
                            {isUpdating ? <Loader2 className="animate-spin"/> : <Check size={18}/>}
                            はい
                        </button>
                    </div>
                </>
            );
        }

        if (viewMode === 'confirm_cancel') {
            return (
                <>
                    <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2 text-lg text-red-600">
                        <AlertCircle size={24}/> 未予約に戻しますか？
                    </h3>
                    <p className="text-sm text-gray-600 mb-6 font-medium">
                        ステータスを「未予約」に戻します。<br/>
                        <span className="text-xs text-gray-400">※実際の予約キャンセルは宿への連絡が必要です。</span>
                    </p>
                    <div className="flex gap-3">
                        <button 
                            type="button"
                            onClick={() => setViewMode('default')}
                            className="flex-1 bg-gray-100 text-gray-500 font-bold py-3 rounded-xl hover:bg-gray-200 transition"
                        >
                            いいえ
                        </button>
                        <button 
                            type="button"
                            onClick={() => handleUpdateStatus('unreserved')}
                            disabled={isUpdating}
                            className="flex-1 bg-red-500 text-white font-bold py-3 rounded-xl hover:bg-red-600 transition flex items-center justify-center gap-2 shadow-md shadow-red-200"
                        >
                            {isUpdating ? <Loader2 className="animate-spin"/> : <Trash2 size={18}/>}
                            はい
                        </button>
                    </div>
                </>
            );
        }

        return (
            <>
                <div className="text-center mb-6">
                    <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Check size={32} strokeWidth={4}/>
                    </div>
                    <h3 className="font-black text-xl text-gray-800">予約済み</h3>
                    <div className="mt-2 inline-flex items-center gap-2 bg-gray-50 px-4 py-2 rounded-full border border-gray-100">
                        <User size={14} className="text-gray-400"/>
                        <span className="text-sm font-bold text-gray-700">{spot.reserved_by}</span>
                    </div>
                </div>
                <div className="space-y-3">
                    <button 
                        type="button"
                        onClick={() => setViewMode('confirm_cancel')}
                        className="w-full bg-white border-2 border-red-100 text-red-500 font-bold py-3 rounded-xl hover:bg-red-50 transition flex items-center justify-center gap-2"
                    >
                        未予約に戻す
                    </button>
                    <button 
                        type="button"
                        onClick={onClose}
                        className="w-full text-gray-400 font-bold py-2 text-sm hover:text-gray-600"
                    >
                        閉じる
                    </button>
                </div>
            </>
        );
    };

    return (
        <div 
            className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 cursor-default" 
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
        >
            <div 
                className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm animate-in zoom-in-95" 
                onClick={(e) => e.stopPropagation()}
            >
                {renderModalContent()}
            </div>
        </div>
    );
};

// --- 予約管理ボタンコンポーネント (修正版: 表示とクリックイベントのみ) ---
const ReservationButton = ({ 
    spot, 
    onClick, 
    compact = false 
}: { 
    spot: any, 
    onClick: () => void, 
    compact?: boolean 
}) => {
    const isReserved = spot.reservation_status === 'reserved';
    
    return (
        <button 
            type="button"
            onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onClick();
            }}
            className={`flex items-center justify-center gap-1.5 rounded-lg font-bold shadow-sm transition-all border shrink-0 z-20 ${
                compact ? "px-2 py-1 text-[9px]" : "px-3 py-1.5 text-[10px]"
            } ${
                isReserved 
                ? "bg-green-500 text-white border-green-600 hover:bg-green-600 shadow-green-200" 
                : "bg-white text-red-500 border-red-200 hover:bg-red-50"
            }`}
        >
            {isReserved ? <Check size={compact ? 12 : 14} strokeWidth={3}/> : <AlertCircle size={compact ? 12 : 14}/>}
            <span>{isReserved ? "予約済" : "未予約！"}</span>
        </button>
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
  currentUser?: string;
}

const TRANSPORT_MODES = [
  { id: 'car', icon: <Car size={16}/>, label: '車', googleMode: 'driving' },
  { id: 'train', icon: <Train size={16}/>, label: '電車', googleMode: 'transit' },
  { id: 'walk', icon: <Footprints size={16}/>, label: '徒歩', googleMode: 'walking' },
  { id: 'bus', icon: <Bus size={16}/>, label: 'バス', googleMode: 'transit' },
  { id: 'plane', icon: <Plane size={16}/>, label: '飛行機', googleMode: 'transit' },
  { id: 'ship', icon: <Ship size={16}/>, label: '船', googleMode: 'transit' },
];

export default function PlanView({ 
    spots, onRemove, onUpdateSpots, roomId, travelDays = 1, 
    autoShowScreenshot, onScreenshotClosed,
    startDate, adultNum = 2,
    currentUser
}: Props) {  

  const logAffiliateClick = async (spotName: string) => {
      if (!roomId) return;
      await supabase.from('affiliate_logs').insert({
          room_id: roomId,
          user_name: currentUser || 'Guest',
          spot_name: spotName,
          source_view: 'plan_timeline'
      });
  };
  
  const captureRef = useRef<HTMLDivElement>(null); 
  const scrollContainerRef = useRef<HTMLDivElement>(null); 
  const listRef = useRef<HTMLDivElement>(null);
  const scrollInterval = useRef<NodeJS.Timeout | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [routeGeoJSON, setRouteGeoJSON] = useState<any>(null);
  const [isPlanGenerated, setIsPlanGenerated] = useState(false);
  
  const [optimizeCount, setOptimizeCount] = useState(0);
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);

  const [startTime, setStartTime] = useState(""); 
  const [endTime, setEndTime] = useState("");     
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

  // PlanView関数の中の useState 定義付近に追加
const [reservationTargetSpot, setReservationTargetSpot] = useState<any | null>(null);

  useEffect(() => {
      if (autoShowScreenshot) setShowScreenshotMode(true);
  }, [autoShowScreenshot]);

  const handleCloseScreenshot = () => {
      setShowScreenshotMode(false);
      if (onScreenshotClosed) onScreenshotClosed();
  };
// ▼▼▼ 追加: 時間の差分を計算するヘルパー関数 ▼▼▼
  const calculateTimeDiff = (start: string, end: string) => {
      if (!start || !end) return 0;
      const [sH, sM] = start.split(':').map(Number);
      const [eH, eM] = end.split(':').map(Number);
      return (eH * 60 + eM) - (sH * 60 + sM);
  };
  // 1. calculateSchedule を先に定義 (useEffectで使用するため)
  // --- 修正: スケジュール計算ロジック（移動時間の自動反映） ---
  // 1. calculateSchedule を先に定義 (useEffectで使用するため)
 // PlanView.tsx

  const calculateSchedule = (currentTimeline: any[]) => {
      if (!startTime) {
        return currentTimeline.map((item) => ({
            ...item,
            arrival: item.arrival || null,
            departure: item.departure || null,
            // ▼▼▼ 修正: デフォルトの60分フォールバックを削除 (undefinedならそのまま) ▼▼▼
            stay_min: item.stay_min ?? (item.type === 'spot' ? (item.spot.stay_time || null) : undefined),
            
            // ▼▼▼ 修正: ここが 30 になっていたのを null に変更 ▼▼▼
            // 修正前: duration_min: item.duration_min ?? (item.type === 'travel' ? 30 : undefined),
            duration_min: item.duration_min ?? (item.type === 'travel' ? null : undefined),
        }));
    }
      let currentTime = new Date(`2000-01-01T${startTime}:00`);
      const newTimeline = currentTimeline.map((item) => {
          const newItem = { ...item };
          if (item.type === 'travel') {
              const duration = item.duration_min !== undefined ? item.duration_min : 0;
              currentTime = new Date(currentTime.getTime() + duration * 60000);
          } else if (item.type === 'spot') {
              newItem.arrival = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              
              // ▼▼▼ 修正: 初期値を60分に固定せず、未設定(null/undefined)なら0分として計算を進める ▼▼▼
              let stayTime = item.stay_min;
              // DBに保存された stay_time があれば使うが、それもなければ null (未定) とする
              if (stayTime === undefined || stayTime === null) {
                  stayTime = item.spot.stay_time || null;
              }

              // 計算用に数値化（未定なら0分として時間を進める）
              let calcStayTime = stayTime || 0;

              if (item.spot.is_hotel) {
                  const nextMorning = new Date(currentTime);
                  nextMorning.setDate(nextMorning.getDate() + 1);
                  const [nextH, nextM] = startTime.split(':').map(Number);
                  nextMorning.setHours(nextH, nextM, 0, 0);
                  const diffMin = (nextMorning.getTime() - currentTime.getTime()) / 60000;
                  calcStayTime = Math.max(diffMin, 60);
                  newItem.is_overnight = true;
                  // ホテルの場合は計算結果を stay_min にも反映
                  stayTime = calcStayTime;
              }
              // 時間を進める
              currentTime = new Date(currentTime.getTime() + calcStayTime * 60000);
              
              newItem.departure = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              // ★修正: null の場合は null のまま保持して「?」を表示できるようにする
              newItem.stay_min = stayTime;
          }
          return newItem;
      });
      return newTimeline;
  };

  // ▼▼▼▼▼ 修正: ここから記述順序を変更（useMemoを先に定義） ▼▼▼▼▼

  // 1. 前日の宿を特定 (Day 2以降の場合)
  const prevDayHotel = useMemo(() => {
      if (selectedDay <= 1) return null;
      return spots.find(s => 
          s.status === 'confirmed' && 
          s.day === selectedDay - 1 && 
          (s.is_hotel || s.category === 'hotel' || /ホテル|旅館|宿/.test(s.name))
      );
  }, [spots, selectedDay]);

  // 2. この日の有効なスポットリスト (前日の宿を含む)
  const activeDaySpots = useMemo(() => {
      const current = spots.filter(s => 
          s.status === 'confirmed' && 
          (s.day === selectedDay || s.day === 0)
      );

      if (prevDayHotel) {
          // 重複チェック (念のため)
          if (!current.find(s => (s.id && String(s.id) === String(prevDayHotel.id)) || s.name === prevDayHotel.name)) {
              return [prevDayHotel, ...current];
          }
      }
      return current;
  }, [spots, selectedDay, prevDayHotel]);

  // 3. 待機中スポット (useMemo)
  const unusedSpots = useMemo(() => {
      const usedSpotIds = new Set<string>();
      timeline.forEach(item => {
          if (item.type === 'spot' && item.spot.id) {
              usedSpotIds.add(String(item.spot.id));
          }
      });

      return activeDaySpots.filter(spot => {
          const id = spot.id ? String(spot.id) : null;
          // IDが存在し、かつ既に使われていれば除外する
          if (id && usedSpotIds.has(String(id))) return false;
          return true;
      });
  }, [activeDaySpots, timeline]);

  // 4. 同期処理 (activeDaySpots を使用)
// 4. 同期処理 (activeDaySpots を使用)
  // ★修正: 型変換を厳密に行い、データの変更（予約状態など）を確実に反映させる
  useEffect(() => {
      // 1. この日の有効なスポットリストを取得（dayを数値に変換して比較）
      let currentActiveSpots = spots.filter(s => s.status === 'confirmed' && Number(s.day) === selectedDay);

      // 前日の宿を取得してリストの先頭に追加
      if (selectedDay > 1) {
          const prevDayHotel = spots.find(s => 
              s.status === 'confirmed' && 
              Number(s.day) === selectedDay - 1 && 
              (s.is_hotel || s.category === 'hotel' || /ホテル|旅館|宿/.test(s.name))
          );
          // まだリストに含まれていなければ追加
          if (prevDayHotel && !currentActiveSpots.find(s => String(s.id) === String(prevDayHotel.id))) {
              currentActiveSpots = [prevDayHotel, ...currentActiveSpots];
          }
      }

      const activeSpotIds = new Set(currentActiveSpots.map(s => String(s.id)));
      const seenSpotIds = new Set<string>();
      let cleanTimeline: any[] = [];

      // 既存のタイムラインを走査して、最新のスポット情報で更新
      timeline.forEach(item => {
          if (item.type === 'travel') {
              cleanTimeline.push(item);
              return;
          }
          
          if (!item.spot.id) return;
          const sId = String(item.spot.id);
          
          // この日に存在するスポットなら維持＆最新データマージ
          if (activeSpotIds.has(sId) && !seenSpotIds.has(sId)) {
              const freshSpot = currentActiveSpots.find(s => String(s.id) === sId);
              cleanTimeline.push({
                  ...item,
                  // ★重要: ここで最新の freshSpot 情報（予約ステータス等）を確実に上書きマージする
                  spot: { ...item.spot, ...(freshSpot || {}) },
                  image: (freshSpot && freshSpot.image_url) || item.image
              });
              seenSpotIds.add(sId);
          }
      });

      // 新規追加されたスポットがあれば末尾に追加
      // 新規追加されたスポットがあれば末尾に追加
      const newSpots = currentActiveSpots.filter(s => !seenSpotIds.has(String(s.id)));
      newSpots.forEach(s => {
          if (cleanTimeline.length > 0 && cleanTimeline[cleanTimeline.length - 1].type === 'spot') {
              // ▼▼▼ 修正: デフォルトを徒歩に変更 ▼▼▼
              cleanTimeline.push({ type: 'travel', duration_min: null, transport_mode: 'walk' });
          }
          cleanTimeline.push({ type: 'spot', spot: s, stay_min: null });
      });

      // 構造の正規化（スポット-移動-スポット の形に整える）
     // 構造の正規化（スポット-移動-スポット の形に整える）
      const normalized: any[] = [];
      cleanTimeline.forEach((item) => {
          if (item.type === 'spot') {
              if (normalized.length > 0 && normalized[normalized.length - 1].type === 'spot') {
    normalized.push({ type: 'travel', duration_min: null, transport_mode: 'car' });
}
              normalized.push(item);
          } else if (item.type === 'travel') {
              if (normalized.length === 0) return;
              // ▼▼▼ 修正: 連続する移動を許可するため、重複チェックを削除 ▼▼▼
              // if (normalized[normalized.length - 1].type === 'travel') return; <-- これを削除
              normalized.push(item);
          }
      });
      if (normalized.length > 0 && normalized[normalized.length - 1].type === 'travel') {
          normalized.pop();
      }

      if (JSON.stringify(normalized) !== JSON.stringify(timeline)) {
        setTimeline(calculateSchedule(normalized));
        // ▼ ここを追加：タイムラインが作成されたら表示フラグをオンにする
        if (normalized.length > 0) {
            setIsPlanGenerated(true);
        }
    }

  }, [activeDaySpots, timeline.length]); // 依存配列は activeDaySpots 推奨 (前の修正同様)
  // ▲▲▲▲▲ 修正ここまで ▲▲▲▲▲
// ▼▼▼ 追加: 移動ブロックの追加・削除ハンドラ ▼▼▼
 // ▼▼▼ 追加: 移動ブロックの追加・削除ハンドラ ▼▼▼
  const addTravel = (index: number) => {
      const newTimeline = [...timeline];
      // 現在の移動ブロックの後ろに「徒歩・時間未定」をデフォルトとして追加
      // 修正: duration_min: 10 -> null
      newTimeline.splice(index + 1, 0, { type: 'travel', duration_min: null, transport_mode: 'walk' });
      setTimeline(calculateSchedule(newTimeline));
  };

  const removeTravel = (index: number) => {
      // ▼▼▼ 追加: 削除前の確認アラート ▼▼▼
      if (!confirm("この移動を削除しますか？")) return;

      const newTimeline = [...timeline];
      newTimeline.splice(index, 1);
      // 全て消えたら正規化で自動復活するので、ここでは単に消すだけでOK
      setTimeline(calculateSchedule(newTimeline));
  };
  // 予約状態更新ハンドラ
  const handleSpotUpdate = (updatedSpot: any) => {
      const newSpots = spots.map(s => {
          if ((s.id && String(s.id) === String(updatedSpot.id)) || s.name === updatedSpot.name) {
              return { ...s, ...updatedSpot };
          }
          return s;
      });
      onUpdateSpots(newSpots);
  };

  const getAffiliateUrl = (hotel: any) => {
      const parseLocalYMD = (ymd: string) => {
          if (!ymd) return null;
          const parts = ymd.split('-').map(Number);
          if (parts.length !== 3) return null;
          return new Date(parts[0], parts[1] - 1, parts[2]);
      };

      let targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + 30);

      if (startDate) {
          const parsedStart = parseLocalYMD(startDate);
          if (parsedStart) targetDate = parsedStart;
      }

      const dayNum = Number(hotel.day || selectedDay);
      if (!isNaN(dayNum) && dayNum > 0) {
          targetDate.setDate(targetDate.getDate() + (dayNum - 1));
      }

      const checkOutDate = new Date(targetDate);
      checkOutDate.setDate(targetDate.getDate() + 1);

      const y1 = targetDate.getFullYear();
      const m1 = targetDate.getMonth() + 1;
      const d1 = targetDate.getDate();
      const y2 = checkOutDate.getFullYear();
      const m2 = checkOutDate.getMonth() + 1;
      const d2 = checkOutDate.getDate();

      const paramString = `f_syu=&f_teikei=&f_campaign=&f_flg=PLAN&f_otona_su=${adultNum}&f_heya_su=1&f_s1=0&f_s2=0&f_y1=0&f_y2=0&f_y3=0&f_y4=0&f_kin=&f_nen1=${y1}&f_tuki1=${m1}&f_hi1=${d1}&f_nen2=${y2}&f_tuki2=${m2}&f_hi2=${d2}&f_kin2=&f_hak=&f_tel=&f_tscm_flg=&f_p_no=&f_custom_code=&f_search_type=&f_static=1&f_tel=&f_service=&f_rm_equip=&f_sort=minNo`;

      const extractRakutenId = (url: string) => {
          if (!url) return null;
          const match = url.match(/hotelinfo\/plan\/(\d+)/) || url.match(/HOTEL\/(\d+)/) || url.match(/no=(\d+)/);
          return match ? match[1] : null;
      };

      let hotelId = null;
      if (hotel.url) hotelId = extractRakutenId(hotel.url);
      if (!hotelId && hotel.id && /^\d+$/.test(String(hotel.id))) hotelId = hotel.id;

      if (hotelId) {
          return `https://hotel.travel.rakuten.co.jp/hotelinfo/plan/${hotelId}?${paramString}`;
      } 
      
      return `https://search.travel.rakuten.co.jp/ds/hotel/search?f_query=${encodeURIComponent(hotel.name)}&${paramString}`;
  };

  // --- 修正: Google Maps URL生成ロジック ---
  // --- 修正: Google Maps URL生成ロジック (連続移動対応版) ---
  const getDirectionsUrl = (index: number) => {
      // さかのぼって「出発地（スポット）」を探す
      let prevSpotItem = null;
      for (let k = index - 1; k >= 0; k--) {
          if (timeline[k].type === 'spot') {
              prevSpotItem = timeline[k];
              break;
          }
      }

      // 先に進んで「目的地（スポット）」を探す
      let nextSpotItem = null;
      for (let k = index + 1; k < timeline.length; k++) {
          if (timeline[k].type === 'spot') {
              nextSpotItem = timeline[k];
              break;
          }
      }
      
      if (!prevSpotItem || !nextSpotItem) return null;

      const origin = prevSpotItem.spot.name;
      const destination = nextSpotItem.spot.name;
      
      // 現在の移動モード
      const currentModeId = timeline[index].transport_mode || 'car';
      const modeEntry = TRANSPORT_MODES.find(m => m.id === currentModeId);
      const googleMode = modeEntry ? modeEntry.googleMode : 'driving'; 

      let url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=${googleMode}`;

      // 出発時間
      if (prevSpotItem.departure) {
          const [hours, minutes] = prevSpotItem.departure.split(':').map(Number);
          const date = new Date();
          date.setHours(hours, minutes, 0, 0);
          if (date.getTime() < Date.now()) {
              date.setDate(date.getDate() + 1);
          }
          const timestamp = Math.floor(date.getTime() / 1000);
          url += `&departure_time=${timestamp}`;
      }
      return url;
  };
  // ★追加: 移動セグメントを追加する関数
  const addTravelSegment = (index: number) => {
      const newTimeline = [...timeline];
      // 現在の移動の下に、新しい移動（徒歩・時間未定）を挿入
      newTimeline.splice(index + 1, 0, { 
          type: 'travel', 
          duration_min: null, 
          transport_mode: 'walk' 
      });
      setTimeline(calculateSchedule(newTimeline));
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

  useEffect(() => {
      if (timeline.length > 0) setTimeline(calculateSchedule(timeline));
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

  const startAutoScroll = (direction: 'up' | 'down', container: HTMLDivElement) => {
    if (scrollInterval.current) return; 
    scrollInterval.current = setInterval(() => {
        const speed = 15; 
        if (direction === 'up') container.scrollTop -= speed;
        else container.scrollTop += speed;
    }, 16); 
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
      stopAutoScroll(); 
  };
  
  const onDragOver = (e: React.DragEvent) => { 
      e.preventDefault(); 
      e.dataTransfer.dropEffect = "move"; 

      const container = listRef.current;
      if (!container) return;
      const { top, bottom } = container.getBoundingClientRect();
      const mouseY = e.clientY;
      const threshold = 100; 

      if (mouseY < top + threshold) startAutoScroll('up', container);
      else if (mouseY > bottom - threshold) startAutoScroll('down', container);
      else stopAutoScroll(); 
  };
  
  // PlanView.tsx 内の onDrop 関数をすべて入れ替えてください

const onDrop = async (e: React.DragEvent, targetTimelineIndex: number) => {
    e.preventDefault();
    e.stopPropagation(); 
    stopAutoScroll(); 

    // 1. ドラッグされた要素のインデックスを取得
    const rawIndex = e.dataTransfer.getData('text/plain');
    const sourceIndex = parseInt(rawIndex, 10);
    const effectiveSourceIndex = !isNaN(sourceIndex) ? sourceIndex : draggedItemIndex;
    
    // 無効な操作なら終了
    if (effectiveSourceIndex === null || effectiveSourceIndex === targetTimelineIndex) return;

    const draggedItem = timeline[effectiveSourceIndex];
    if (!draggedItem || draggedItem.type !== 'spot') return; 

    // 2. ペア化 ({ travels: any[], item: any })
    const pairs: { travels: any[], item: any }[] = [];
    let pendingTravels: any[] = [];

    timeline.forEach(item => {
        if (item.type === 'travel') {
            pendingTravels.push(item);
        } else if (item.type === 'spot') {
            pairs.push({ travels: pendingTravels, item: item });
            pendingTravels = [];
        }
    });

    // 3. 移動元のペアを特定
    const sourcePairIndex = pairs.findIndex(p => 
        (p.item.spot.id && String(p.item.spot.id) === String(draggedItem.spot.id)) || 
        p.item.spot.name === draggedItem.spot.name
    );
    if (sourcePairIndex === -1) return;

    // 4. 移動先のペアインデックスを特定
    let targetPairIndex = 0;
    for(let i = 0; i < targetTimelineIndex; i++) {
        if(timeline[i].type === 'spot') targetPairIndex++;
    }
    
    // ★修正: 下方向への移動時にインデックスを減らさないことで、「ドロップした要素の後ろ」に挿入されるようにする
    // if (sourcePairIndex < targetPairIndex) {
    //    targetPairIndex--; 
    // }

    // 5. 並び替え実行
    const [movedPair] = pairs.splice(sourcePairIndex, 1);
    
    // 移動元を削除した分、インデックスがずれるので、下方向への移動の時だけ調整が必要なケースがあるが、
    // 「ドロップした場所の後ろ」に入れたい場合は、削除前のターゲットインデックスそのままでOK。
    // 上方向への移動（Source > Target）の場合は、そのまま「ドロップした場所の手前」に入る。
    
    // ただし、配列から要素を抜いた後に挿入するため、
    // 「下へ移動」かつ「抜いた要素より後ろ」に挿入する場合、ターゲットインデックスは1つ前詰めになっているため、
    // 補正なし（targetPairIndexそのまま）で挿入すると、直感的には「ドロップした要素の次」に入る挙動になります。

    // 例: [A, B, C] で A(0) を B(1) にドロップ。Target=1。
    // Aを抜く -> [B, C]。Target 1 に挿入 -> [B, A, C]。 AとBが入れ替わる（正解）。

    pairs.splice(targetPairIndex, 0, movedPair);

    // 6. タイムラインの再構築
    // 6. タイムラインの再構築
    const reconstructedTimeline: any[] = [];
    pairs.forEach((pair, index) => {
        if (index > 0) {
            if (pair.travels.length > 0) {
                reconstructedTimeline.push(...pair.travels);
            } else {
                // ▼▼▼ 修正: ここがまだ 'car', 30 でした。'walk', null に変更します ▼▼▼
                // 修正前: reconstructedTimeline.push({ type: 'travel', duration_min: 30, transport_mode: 'car' });
                reconstructedTimeline.push({ type: 'travel', duration_min: null, transport_mode: 'walk' });
            }
        }
        reconstructedTimeline.push(pair.item);
    });

    // 7. State更新
    setTimeline(reconstructedTimeline); 
    setDraggedItemIndex(null);

    // 8. データの永続化
    if (roomId) {
        const activeSpots = reconstructedTimeline
            .filter(t => t.type === 'spot')
            .map(item => item.spot);

        const fullSpotsList = [...spots]; 

        activeSpots.forEach((s, idx) => {
            if (s.id && !String(s.id).startsWith('temp-') && !String(s.id).startsWith('ai-')) {
                supabase.from('spots').update({ order: idx }).eq('id', s.id).then();
            }
            const target = fullSpotsList.find(fs => (fs.id && String(fs.id) === String(s.id)) || fs.name === s.name);
            if (target) {
                target.order = idx;
            }
        });

        fullSpotsList.sort((a, b) => (a.order || 0) - (b.order || 0));
        onUpdateSpots(fullSpotsList);

        const storageKey = `rh_plan_${roomId}_day_${selectedDay}`;
        localStorage.setItem(storageKey, JSON.stringify({ 
            timeline: reconstructedTimeline, 
            updatedAt: Date.now() 
        }));
    }
  };

  const handleEditSave = async () => {
      if (!editItem) return;
      
      const newTimeline = [...timeline];
      newTimeline[editItem.index] = editItem.data;
      setTimeline(newTimeline); 
      
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

  // ▼▼▼ 修正: 出発時間が変更されたら滞在時間を自動計算 ▼▼▼
  // ▼▼▼ 修正: 出発時間が変更されたら滞在時間を自動計算（空ならリセット） ▼▼▼
  const handleDepartureChange = (index: number, newDeparture: string) => {
    const newTimeline = [...timeline];
    if (newTimeline[index]) {
        newTimeline[index].departure = newDeparture;
        
        // 片方でも空なら滞在時間を未定(null)に戻す
        if (!newDeparture || !newTimeline[index].arrival) {
            newTimeline[index].stay_min = null;
        } else {
            // 両方揃っていれば計算
            const diff = calculateTimeDiff(newTimeline[index].arrival, newDeparture);
            if (diff >= 0) {
                newTimeline[index].stay_min = diff;
                if (newTimeline[index].spot) {
                    newTimeline[index].spot.stay_time = diff;
                }
            }
        }
        setTimeline(newTimeline);
    }
  };

  // ▼▼▼ 修正: 到着・出発時間をリセットしたら滞在時間も未定に戻す ▼▼▼
// ▼▼▼ 修正: 時間リセット前に確認を入れる ▼▼▼
  const handleTimeReset = (index: number) => {
      if (!confirm("時間をリセットしてもよろしいですか？")) return;

      const newTimeline = [...timeline];
      if (newTimeline[index]) {
          newTimeline[index].arrival = "";
          newTimeline[index].departure = "";
          newTimeline[index].stay_min = null;
          if (newTimeline[index].spot) {
              newTimeline[index].spot.stay_time = null;
          }
          setTimeline(newTimeline);
      }
  };

  // ▼▼▼ 修正: 到着時間が変更されたら滞在時間を自動計算（空ならリセット） ▼▼▼
  const handleArrivalChange = (index: number, newArrival: string) => {
    const newTimeline = [...timeline];
    if (newTimeline[index]) {
        newTimeline[index].arrival = newArrival;

        // 片方でも空なら滞在時間を未定(null)に戻す
        if (!newArrival || !newTimeline[index].departure) {
            newTimeline[index].stay_min = null;
        } else {
            // 両方揃っていれば計算
            const diff = calculateTimeDiff(newArrival, newTimeline[index].departure);
            if (diff >= 0) {
                newTimeline[index].stay_min = diff;
                if (newTimeline[index].spot) {
                    newTimeline[index].spot.stay_time = diff;
                }
            }
        }
        setTimeline(newTimeline);
    }
  };

  const handleTransportChange = (index: number, mode: string) => {
      const newTimeline = [...timeline];
      newTimeline[index].transport_mode = mode;
      setTimeline(newTimeline); 
  };

// ... existing code ...
  const toggleSpotInclusion = (spot: any, isAdding: boolean) => {
    if (isAdding) {
        // ... (追加処理はそのまま) ...
        const lastItem = timeline[timeline.length - 1];
        const newItems = [];
        if (lastItem && lastItem.type === 'spot') {
           // ★修正: duration_min: 30 → null
           newItems.push({ type: 'travel', duration_min: null, transport_mode: 'walk' });
        }
      // ▼▼▼ 修正: 初期値を 60 → null に変更 ▼▼▼
        newItems.push({ type: 'spot', spot, stay_min: null });
        const newTimeline = [...timeline, ...newItems];
        setTimeline(calculateSchedule(newTimeline));

        if (roomId && spot.id) {
            const newSpots = spots.map(s => {
                if (s.id && String(s.id) === String(spot.id)) {
                    return { ...s, day: selectedDay }; 
                }
                return s;
            });
            onUpdateSpots(newSpots);
            if (!String(spot.id).startsWith('spot-') && !String(spot.id).startsWith('temp-')) {
                supabase.from('spots').update({ day: selectedDay }).eq('id', spot.id).then();
            }
        }

    } else {
        // --- 削除処理 ---
        if (!confirm("スケジュールから外しますか？")) return;
        
        // 1. ローカルのタイムラインから削除
        const spotIndex = timeline.findIndex(t => t.type === 'spot' && String(t.spot.id) === String(spot.id));
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

        // 2. データ上の「日付」を未定(0)に変更してPageリストに反映させる
        // ★修正: 「この日のスポット」である場合のみ、DBの日付をリセットする。
        // 前日の宿（day !== selectedDay）の場合は、タイムライン表示から消すだけでDBは更新しない。
        // ▼▼▼ 修正: 型変換して比較 (spot.dayが文字列の場合があるため) ▼▼▼
        if (roomId && spot.id && Number(spot.day) === selectedDay) {
            const newSpots = spots.map(s => {
                if (s.id && String(s.id) === String(spot.id)) {
                    return { ...s, day: 0 }; 
                }
                return s;
            });
            onUpdateSpots(newSpots);

            if (!String(spot.id).startsWith('spot-') && !String(spot.id).startsWith('temp-')) {
                supabase.from('spots').update({ day: 0 }).eq('id', spot.id).then();
            }
        }
    }
  };
// ... existing code ...

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
                              
                              // ★修正: 時間設定済みかどうかの判定（値が入っているか）
                              const isTimeSet = item.duration_min !== null && item.duration_min !== undefined && item.duration_min !== '';

                              return (
                                  <div key={i} className="relative z-10 mb-8 pl-12 flex flex-col gap-1">
                                      {/* ▼▼▼ 修正: 値がない場合は '?' を表示 ▼▼▼ */}
                                      <div className="flex items-center gap-2 text-gray-400 text-xs font-bold">
                                          {mode.icon} 
                                          <span>{isTimeSet ? item.duration_min : '?'}分 移動</span>
                                      </div>
                                      
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
                  
                  {/* ヘッダー */}
                  <div className="flex justify-between items-center border-b border-gray-100 p-4 shrink-0">
                      <h3 className="font-bold text-gray-800 flex items-center gap-2">
                          <Edit3 size={16}/> {editItem.type === 'spot' ? 'スポット詳細を編集' : '移動詳細を編集'}
                      </h3>
                      <button onClick={() => setEditItem(null)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 text-gray-500"><X size={16}/></button>
                  </div>
                  
                  {/* コンテンツ */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {editItem.type === 'spot' && (
                        <>
                            <div>
                                <label className="text-xs font-bold text-gray-500 mb-1 block">
                                    {editItem.data.spot?.is_hotel ? '宿泊費 (目安)' : '予算・費用'}
                                </label>
                                <div className="relative">
                                    <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16}/>
                                    <input 
                                        type="number" 
                                        placeholder={editItem.data.spot?.is_hotel ? "例: 12000" : "例: 1500"}
                                        value={editItem.data.spot?.cost ?? editItem.data.spot?.price ?? ''} 
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setEditItem({
                                                ...editItem, 
                                                data: {
                                                    ...editItem.data, 
                                                    spot: {
                                                        ...editItem.data.spot, 
                                                        cost: val === '' ? null : val,
                                                        price: val === '' ? null : val
                                                    }
                                                }
                                            });
                                        }} 
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

                    {editItem.type === 'travel' && (
                        <>
                            <div className="grid grid-cols-2 gap-3">
                                {/* 出発時間 */}
                                <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="text-xs font-bold text-gray-500 block">出発時間</label>
                                        {/* ★追加: リセットボタン */}
                                        {editItem.data.transport_departure && (
                                            <button 
                                                onClick={() => setEditItem({...editItem, data: {...editItem.data, transport_departure: ""}})}
                                                className="text-[10px] text-gray-400 hover:text-indigo-600 flex items-center gap-1 transition bg-gray-100 px-2 py-0.5 rounded-md hover:bg-gray-200"
                                                title="未設定に戻す"
                                            >
                                                <RotateCcw size={10} /> リセット
                                            </button>
                                        )}
                                    </div>
                                    <input 
                                        type="time" 
                                        value={editItem.data.transport_departure || ''} 
                                        onChange={(e) => setEditItem({...editItem, data: {...editItem.data, transport_departure: e.target.value}})} 
                                        className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm font-bold focus:border-indigo-500 outline-none"
                                    />
                                </div>

                                {/* 到着時間 */}
                                <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="text-xs font-bold text-gray-500 block">到着時間</label>
                                        {/* ★追加: リセットボタン */}
                                        {editItem.data.transport_arrival && (
                                            <button 
                                                onClick={() => setEditItem({...editItem, data: {...editItem.data, transport_arrival: ""}})}
                                                className="text-[10px] text-gray-400 hover:text-indigo-600 flex items-center gap-1 transition bg-gray-100 px-2 py-0.5 rounded-md hover:bg-gray-200"
                                                title="未設定に戻す"
                                            >
                                                <RotateCcw size={10} /> リセット
                                            </button>
                                        )}
                                    </div>
                                    <input 
                                        type="time" 
                                        value={editItem.data.transport_arrival || ''} 
                                        onChange={(e) => setEditItem({...editItem, data: {...editItem.data, transport_arrival: e.target.value}})} 
                                        className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm font-bold focus:border-indigo-500 outline-none"
                                    />
                                </div>
                            </div>
                            
                            {/* 以下、交通費などはそのまま */}
                            <div>
                                <label className="text-xs font-bold text-gray-500 mb-1 block">交通費</label>
                                {/* ... */}
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
                                <label className="text-xs font-bold text-gray-500 mb-1 block">移動メモ</label>
                                <textarea 
                                    value={editItem.data.note || ''} 
                                    onChange={(e) => setEditItem({...editItem, data: {...editItem.data, note: e.target.value}})} 
                                    className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-gray-800 h-20 resize-none transition"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 mb-1 block">参考URL</label>
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

                  {/* フッター */}
                  <div className="p-4 border-t border-gray-100 shrink-0">
                      <button onClick={handleEditSave} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-200">変更を保存</button>
                  </div>
              </div>
          </div>
      )}

      {/* ▼▼▼ 追加: 予約管理モーダルをここに配置 ▼▼▼ */}
      {reservationTargetSpot && (
          <ReservationModal
              spot={reservationTargetSpot}
              roomId={roomId}
              currentUser={currentUser}
              onUpdate={(updatedSpot) => {
                  handleSpotUpdate(updatedSpot);
                  // 必要であればここで setReservationTargetSpot(null) をしてもよいが、
                  // ReservationModal内部の onClose で閉じるロジックにしてあるので必須ではない
                  // (ただしModal側で onClose を呼んでいるので、ここで state を null にしないと閉じない)
              }}
              onClose={() => setReservationTargetSpot(null)}
          />
      )}
      {/* ▲▲▲ 追加ここまで ▲▲▲ */}

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
            
            {/* ▼▼▼ 修正: ルート最適化ボタンを削除 ▼▼▼ */}
            {/* <button 
                onClick={handleAutoGenerate} 
                disabled={activeDaySpots.length < 2 || isProcessing}
                className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-indigo-700 transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 disabled:shadow-none"
            >
                {isProcessing ? <Loader2 className="animate-spin w-4 h-4"/> : <Sparkles size={16}/>} ルート最適化(未実装)
            </button> */}
            {/* ▲▲▲ 削除ここまで ▲▲▲ */}
        </div>

        <div className="p-4">
            {/* 修正前：{!isPlanGenerated ? ( */}
    {activeDaySpots.length === 0 ? ( // スポットが0件の時だけメッセージを出す
         <div className="flex flex-col items-center justify-center py-12 text-center space-y-4 opacity-60">
             <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center border border-gray-200 shadow-sm"><MapPin size={24} className="text-gray-400"/></div>
             <div>
                <h2 className="text-lg font-bold text-gray-700">スポットを追加してください</h2>
                <p className="text-xs text-gray-500">まだ Day {selectedDay} にスポットがありません</p>
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
                                           
                                            <div className="flex items-center gap-2 text-xs font-bold text-indigo-500 font-mono bg-indigo-50 w-max px-2 py-0.5 rounded" onClick={(e) => e.stopPropagation()}>
                                                <input 
                                                    type="time" 
                                                    value={item.arrival || ""} 
                                                    onChange={(e) => handleArrivalChange(i, e.target.value)}
                                                    className="bg-transparent font-bold text-xs font-mono w-[36px] text-center focus:outline-none border-b border-transparent focus:border-indigo-300 p-0 text-indigo-600"
                                                />
                                                <ArrowRight size={10} className="text-indigo-300"/>
                                                <input 
                                                    type="time" 
                                                    value={item.departure || ""} 
                                                    onChange={(e) => handleDepartureChange(i, e.target.value)}
                                                    className="bg-transparent text-indigo-600 font-bold text-xs font-mono w-[36px] text-center focus:outline-none border-b border-transparent focus:border-indigo-300 p-0"
                                                />
                                                
                                                {/* ▼▼▼ 追加: 時間リセットボタン ▼▼▼ */}
                                                {(item.arrival || item.departure) && (
                                                    <button 
                                                        onClick={() => handleTimeReset(i)} 
                                                        className="ml-1 text-indigo-400 hover:text-indigo-600 p-0.5 rounded-full hover:bg-indigo-100 transition"
                                                        title="時間を未設定に戻す"
                                                    >
                                                        <RotateCcw size={10} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex flex-col gap-1.5 mt-2">
                                            <div className="flex flex-wrap gap-1.5 items-center">
                                                
                                                {/* ★★★ 予約管理ボタン（ホテルのみ） ★★★ */}
                                                {item.spot.is_hotel && (
                                                    <div onClick={(e) => e.stopPropagation()}>
                                                       <ReservationButton 
    spot={item.spot} 
    onClick={() => setReservationTargetSpot(item.spot)} // クリック時にstateにセットするだけにする
/>
                                                    </div>
                                                )}

                                               {!item.is_overnight && (
                                                    <div className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded border border-gray-200" onClick={(e) => e.stopPropagation()}>
                                                        <Clock size={10} className="text-gray-500"/>
                                                        {/* ▼▼▼ 修正: stay_min が null/0 の場合は「?分」を表示 ▼▼▼ */}
                                                        <span className="text-xs font-bold text-gray-700">
                                                            {(item.stay_min && item.stay_min > 0) ? `${item.stay_min}分` : '?分'}
                                                        </span>
                                                    </div>
                                                )}

                                                {(item.spot.cost && Number(item.spot.cost) > 0) && (
    <div className="flex items-center gap-1 ...">
        <Banknote size={10}/>
        ¥{Number(item.spot.cost).toLocaleString()}
    </div>
)}

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

                                                {item.spot.is_hotel && (
                                                    <a 
                                                        href={getAffiliateUrl(item.spot)} 
                                                        target="_blank" 
                                                        onClick={(e)=> {
                                                            e.stopPropagation();
                                                            logAffiliateClick(item.spot.name);
                                                        }} 
                                                        className="bg-orange-50 text-orange-600 px-2 py-1 rounded text-[10px] font-bold border border-orange-200 hover:bg-orange-100 transition shadow-sm flex items-center gap-1"
                                                    >
                                                        <ExternalLink size={10}/> 空室確認
                                                    </a>
                                                )}
                                            </div>

                                            {item.spot.comment && (
                                                <div className="text-[10px] text-gray-600 bg-gray-50 p-2 rounded border border-gray-100 w-full whitespace-pre-wrap flex items-start gap-1">
                                                    <StickyNote size={10} className="shrink-0 mt-0.5 text-gray-400"/>
                                                    {item.spot.comment.length > 10 ? item.spot.comment.slice(0, 10) + "..." : item.spot.comment}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                              </div>
                            </div>
                          );
                        // ... (前略)
// ... (前略)
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
            <div className="flex items-center gap-2">
                {/* 左側の縦線 */}
                <div className="h-full absolute left-[24px] top-0 bottom-0 flex flex-col items-center justify-center z-0"></div>
                
                {/* ▼▼▼ 修正箇所: ボタンを全てこのメインバーの中に統合 ▼▼▼ */}
                <div className="bg-white border border-gray-200 rounded-full px-3 py-2 flex items-center gap-2 text-xs shadow-sm hover:border-gray-300 transition w-full sm:w-auto relative justify-between sm:justify-start">
                    
                    {/* 左側グループ（移動手段・時間） */}
                    <div className="flex items-center gap-2 flex-1 sm:flex-none">
                        {/* 移動手段ドロップダウン */}
                        <div 
                            className="text-gray-500 cursor-pointer hover:text-indigo-600 flex items-center gap-1 transition relative shrink-0" 
                            onClick={(e) => {
                                e.stopPropagation();
                                setActiveTransportMenuIndex(activeTransportMenuIndex === i ? null : i);
                            }}
                        >
                            {mode.icon}
                            <ChevronDown size={10} className="opacity-50"/>
                        </div>

                        {/* ... (ドロップダウンメニューの中身は変更なし) ... */}
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

                        <div className="h-4 w-px bg-gray-200 shrink-0"></div>
                        
                        {/* 時間入力 */}
                       {/* 時間入力 */}
                        <div className="flex items-center gap-1 shrink-0">
                            <input 
                                type="text" 
                                inputMode="numeric"
                                value={item.duration_min > 0 ? item.duration_min : ''} 
                                placeholder="?"
                                onChange={(e) => handleTimeChange(i, e.target.value)} 
                                className="w-8 bg-transparent text-center font-bold text-gray-600 focus:text-indigo-600 outline-none placeholder:text-gray-300" 
                                onClick={(e) => e.stopPropagation()}
                            />
                            <span className="text-[10px] text-gray-400">分</span>
                        </div>
                    </div>

                    {/* 右側グループ（アクションボタン群） */}
                    <div className="flex items-center gap-1 shrink-0">
                        {/* GoogleMapボタン */}
                        {mapLink && (
                            <a href={mapLink} target="_blank" className="text-gray-400 hover:text-green-600 p-1 transition flex items-center"><MapPinned size={14}/></a>
                        )}
                        
                        <div className="h-4 w-px bg-gray-200 mx-1"></div>

                        {/* 編集ボタン */}
                        <button 
                            onClick={() => setEditItem({index: i, type: 'travel', data: item})}
                            className="text-gray-400 hover:text-indigo-600 p-1 rounded-full hover:bg-gray-100 transition"
                            title="詳細を編集"
                        >
                            <Edit3 size={12}/>
                        </button>

                        {/* ▼▼▼ ここに移動・スタイル変更した追加・削除ボタン ▼▼▼ */}
                        {/* 追加ボタン */}
                        <button 
                            onClick={() => addTravel(i)}
                            className="text-gray-400 hover:text-indigo-600 p-1 rounded-full hover:bg-gray-100 transition"
                            title="経由・乗り換えを追加"
                        >
                            <PlusCircle size={12} />
                        </button>

                        {/* 削除ボタン */}
                        <button 
                            onClick={() => removeTravel(i)}
                            className="text-gray-400 hover:text-red-500 p-1 rounded-full hover:bg-gray-100 transition"
                            title="この移動を削除"
                        >
                            <Trash2 size={12} />
                        </button>
                        {/* ▲▲▲ ここまで ▲▲▲ */}
                    </div>
                </div>
                {/* ▲▲▲ メインバー終了 ▲▲▲ */}

                {/* 以前ここにあった外側のボタンは削除されました */}

            </div>

            {/* ... (詳細タグ表示部分は変更なし) ... */}
            {(item.transport_departure || item.transport_arrival || item.note || item.url || item.cost) && (
                <div className="flex flex-wrap gap-2 mt-1 ml-2">
                   {/* ▼▼▼ 修正: 詳細情報（時間・金額・リンク・メモ）を表示するコードを追加 ▼▼▼ */}
            {(item.transport_departure || item.transport_arrival || item.note || item.url || item.cost) && (
                <div className="flex flex-col gap-1.5 mt-2 ml-1">
                    <div className="flex flex-wrap gap-2 items-center">
                        
                        {/* 出発・到着時間 */}
                        {(item.transport_departure || item.transport_arrival) && (
                            <div className="flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded border border-indigo-100 shrink-0">
                                <Clock size={10}/>
                                {item.transport_departure && <span>{item.transport_departure}発</span>}
                                {item.transport_departure && item.transport_arrival && <span className="text-indigo-300 mx-0.5">→</span>}
                                {item.transport_arrival && <span>{item.transport_arrival}着</span>}
                            </div>
                        )}

                        {/* 金額 */}
                        {item.cost && (
                            <div className="flex items-center gap-1 text-[10px] font-bold text-yellow-700 bg-yellow-50 px-2 py-1 rounded border border-yellow-100 shrink-0">
                                <Banknote size={10}/> ¥{Number(item.cost).toLocaleString()}
                            </div>
                        )}

                        {/* リンク */}
                        {item.url && (
                            <a 
                                href={item.url} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-100 shrink-0 hover:bg-blue-100 transition"
                            >
                                <LinkIcon size={10}/> リンク
                            </a>
                        )}
                    </div>

                    {/* メモ */}
                    {item.note && (
                        <div className="text-[10px] text-gray-600 bg-gray-50 p-2 rounded border border-gray-100 w-full max-w-[90%] whitespace-pre-wrap flex items-start gap-1">
                            <StickyNote size={10} className="shrink-0 mt-0.5 text-gray-400"/>
                            {item.note}
                        </div>
                    )}
                </div>
            )}
            {/* ▲▲▲ 追加ここまで ▲▲▲ */}
                </div>
            )}
        </div>
    </div>
    );
}
// ... (後略)
                    })}

                    {/* ▼▼▼ 追加: ここから ▼▼▼ */}
                    {/* リストの一番下にドロップするための透明なエリア */}
                    <div 
                        className="h-24 w-full relative z-0 -mt-4"
                        onDragOver={onDragOver}
                        onDrop={(e) => onDrop(e, timeline.length)}
                    />
                    {/* ▲▲▲ 追加: ここまで ▲▲▲ */}
                    
                    <div className="absolute left-[24px] bottom-0 w-3 h-3 bg-gray-400 rounded-full -translate-x-1/2 border-2 border-white shadow-sm"></div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
}