"use client";

// ビルドエラー回避：動的レンダリングを強制
export const dynamic = 'force-dynamic';

import React, { Suspense, useEffect, useRef, useState, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
// @ts-ignore
import 'mapbox-gl/dist/mapbox-gl.css';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { 
  Search, X, Plus, ExternalLink, Map as MapIcon, History, Trash2, 
  MapPinned, Users, Edit2, CheckCircle, HelpCircle, TrendingUp,
  BedDouble, ChevronDown, ChevronUp, Calendar, MapPin,
  Image as ImageIcon, Users as UsersIcon,
  PenTool, Loader2, Clock, ThumbsUp, Link as LinkIcon, MessageSquare,
  Save, XCircle, Edit3, ArrowRight, Maximize,
  Car, Train, Footprints, Zap, Plane, Ship, Camera, Globe, ArrowLeftCircle, Database,
  Banknote, ExternalLink as ExternalLinkIcon, StickyNote, Sparkles,Bus,
  CalendarCheck, CalendarX, User, AlertCircle, Check // ← ★これらを追加 // ← ★ここに追加
} from 'lucide-react';
import TutorialModal from './components/TutorialModal'; // ★追加
import BottomNav from './components/BottomNav';
import HotelListView from './components/HotelListView';
import PlanView from './components/PlanView';
import MenuView from './components/MenuView';
import Ticker from './components/Ticker';
import SwipeView from './components/SwipeView';
// import LegalModal from './components/LegalModal';
import WelcomePage from './components/WelcomePage';

// ★追加アイコン
import { Binoculars,  GripHorizontal } from 'lucide-react';

import { createPortal } from 'react-dom';



const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const SpotImage = ({ src, alt, className, onClick }: { src?: string | null, alt: string, className?: string, onClick?: () => void }) => {
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
    const handleError = () => {
        setIsLoading(false);
        setHasError(true);
    };

    if (!src || hasError || (!src.startsWith('http') && !src.startsWith('data:'))) {
        return (
            <div className={`flex flex-col items-center justify-center bg-gray-100 text-gray-300 ${className}`} onClick={onClick}>
                <ImageIcon size={24} />
            </div>
        );
    }

    return (
        <div className={`relative overflow-hidden bg-gray-100 ${className}`} onClick={onClick}>
            {isLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600 bg-gray-100 z-10">
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
            />
        </div>
    );
};

type Tab = 'explore' | 'agent' | 'swipe' | 'plan' | 'menu';
type FilterStatus = 'all' | 'confirmed' | 'candidate' | 'hotel_candidate';

type SearchHistoryItem = {
  id: string;
  name: string;
  place_name: string;
  center: [number, number];
  timestamp: number;
};

export type AreaSearchParams = {
  latitude: number;
  longitude: number;
  radius: number;
  // ▼▼▼ 追加: ポリゴン座標の型定義 ▼▼▼
  polygon: number[][];
};

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
// ▼▼▼ 追加: GeoapifyのAPIキー ▼▼▼
const GEOAPIFY_API_KEY = process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY || "";
const RAKUTEN_AFFILIATE_ID = "4fcc24e4.174bb117.4fcc24e5.5b178353"; 

// page.tsx (105行目付近)
const TRANSPORT_MODES = [
  { id: 'car', icon: <Car size={12}/>, label: '車' },
  { id: 'train', icon: <Train size={12}/>, label: '電車' },
  { id: 'walk', icon: <Footprints size={12}/>, label: '徒歩' },
  // ▼▼▼ 修正: 新幹線(Zap) を バス(Bus) に変更 ▼▼▼
  { id: 'bus', icon: <Bus size={12}/>, label: 'バス' }, 
  // { id: 'shinkansen', icon: <Zap size={12}/>, label: '新幹線' }, // 元のコード
  { id: 'plane', icon: <Plane size={12}/>, label: '飛行機' },
  { id: 'ship', icon: <Ship size={12}/>, label: '船' },
];

const UD_COLORS = [
    '#F59E0B', '#3B82F6', '#10B981', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6',
    '#F97316', '#06B6D4', '#84CC16', '#EAB308', '#D946EF', '#64748B', '#A855F7', '#FB7185',
    '#22C55E', '#0EA5E9', '#F43F5E', '#78716C'
];
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

const calculateSimpleSchedule = (items: any[], startTime: string = "") => {
    if (!startTime) {
        return items.map(item => ({
            ...item,
            arrival: item.arrival || null,
            departure: item.departure || null,
            stay_min: item.stay_min || (item.spot ? item.spot.stay_time : 60) || 60
        }));
    }
    let currentTime = new Date(`2000-01-01T${startTime}:00`);
    return items.map((item) => {
        const newItem = { ...item };
        if (item.type === 'travel') {
            const duration = item.duration_min || 30;
            currentTime = new Date(currentTime.getTime() + duration * 60000);
        } else if (item.type === 'spot') {
            newItem.arrival = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            // ▼▼▼ 修正: デフォルトの || 60 を削除し、なければ null にする ▼▼▼
            let stayTime = item.stay_min || (item.spot ? item.spot.stay_time : null);
            
            // ホテルの場合は例外的に600分(10時間)などを維持してもOKですが、ここも未定にしたければ null に
            if (item.spot.is_hotel && !stayTime) stayTime = 600; 

            // 時間計算用には 0 を使うが、表示用(newItem.stay_min)は null のままにする
            const durationForCalc = stayTime || 0;
            
            currentTime = new Date(currentTime.getTime() + durationForCalc * 60000);
            newItem.departure = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            newItem.stay_min = stayTime; // nullならnullのまま
        }
        return newItem;
    });
};

// --- オンボーディング（機能紹介）モーダル ---


function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomId = searchParams.get('room');
  const isTrial = searchParams.get('trial') === 'true'; // ★これを追加

  const [currentTab, setCurrentTab] = useState<Tab>('explore');
  const [planSpots, setPlanSpots] = useState<any[]>([]);
  const [spotVotes, setSpotVotes] = useState<any[]>([]);
  const [userName, setUserName] = useState(""); 
  const [isCreating, setIsCreating] = useState(false);
  const [isJoined, setIsJoined] = useState(false);
  const [voteBadgeCount, setVoteBadgeCount] = useState(0);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  const [candidates, setCandidates] = useState<any[]>([]);
  const [likedHistory, setLikedHistory] = useState<string[]>([]);
  const [nopedHistory, setNopedHistory] = useState<string[]>([]);
  // const [isSuggesting, setIsSuggesting] = useState(false);

  // ★追加: お試しモード用のポップアップ管理
  const [showTrialPopup, setShowTrialPopup] = useState(false);
  const hasShownTrialPopup = useRef(false); // 何度も出ないようにするためのフラグ

 

  // ▼▼▼ ここから追加: お試しモードの初回ガイド管理 ▼▼▼
  const [showTrialGuide, setShowTrialGuide] = useState(false);

  useEffect(() => {
      // お試しモードの時だけ、初回かどうかを判定してガイドを表示
      if (isTrial) {
          const hasSeenGuide = localStorage.getItem('rh_trial_guide_seen');
          if (!hasSeenGuide) {
              setShowTrialGuide(true);
          }
      }
  }, [isTrial]);

  const closeTrialGuide = () => {
      localStorage.setItem('rh_trial_guide_seen', 'true');
      setShowTrialGuide(false);
  };
  // ▲▲▲ ここまで追加 ▲▲▲

  // ★追加: スワイプチュートリアルの状態管理
  const [showSwipeTutorial, setShowSwipeTutorial] = useState(false);
  const [dontShowTutorial, setDontShowTutorial] = useState(false);

  // ★★★ 追加: 徒歩スケール表示用のState ★★★
  const [scaleLabel, setScaleLabel] = useState("");

  const [selectedHotelDay, setSelectedHotelDay] = useState<number>(0);

  // ★追加: 計画ピン（確定・候補・宿）のマーカーを管理するRef
const planMarkersRef = useRef<mapboxgl.Marker[]>([]);

const logAffiliateClick = async (spotName: string, source: string) => {
    if (!roomId) return;
    await supabase.from('affiliate_logs').insert({
        room_id: roomId,
        user_name: userName || 'Guest',
        spot_name: spotName,
        source_view: source
    });
};

// ▼▼▼ 追加: 周辺検索結果を保持するState ▼▼▼
  const [nearbyCandidates, setNearbyCandidates] = useState<any[]>([]);
  const [isSearchingNearby, setIsSearchingNearby] = useState(false);

 /// ▼▼▼ 周辺スポット検索関数 (件数確保・黒ピン表示修正版) ▼▼▼
 // ▼▼▼ 周辺スポット検索関数 (座標正規化・重複完全排除・件数確保版) ▼▼▼
  const handleSearchNearby = async () => {
      // トグル動作：既に表示中ならクリアして終了
      if (nearbyCandidates.length > 0) {
          setNearbyCandidates([]);
          return;
      }

     // 変更前: if (!map.current || !roomId) return;
if (!map.current) return; // ★変更: roomIdが無くても動くようにする
      const { lng, lat } = map.current.getCenter();
      
      setIsSearchingNearby(true);
      try {
          const SEARCH_RADIUS = 10000; // 10km
          let allCandidates: any[] = [];
          
          // -------------------------------------------------------------
          // 【ステップ1】 「観光地」キーワード検索 (質重視)
          // -------------------------------------------------------------
          try {
              const queryParams = `query=${encodeURIComponent("観光地")}&lat=${lat}&lng=${lng}`;
              const res = await fetch(`${API_BASE_URL}/api/search_places?${queryParams}`);
              if (res.ok) {
                  const data = await res.json();
                  if (data.results && Array.isArray(data.results)) {
                      const touristSpots = data.results.map((s: any) => ({
                          ...s,
                          // Mapbox形式(center)をcoordinatesに統一
                          coordinates: s.center, 
                          is_nearby: true,
                          // 表示用IDを強制的にユニークにする
                          id: `tourist-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
                      }));
                      allCandidates = [...allCandidates, ...touristSpots];
                  }
              }
          } catch (e) {
              console.log("Tourist spot search failed, continuing...");
          }

          // -------------------------------------------------------------
          // 【ステップ2】 結果が10件未満なら、広範囲検索('wide')も実行して混ぜる
          // -------------------------------------------------------------
          // ※重複排除で減ることを考慮し、多めに確保する
          if (allCandidates.length < 10) {
              const mode = 'wide'; 
              const latKey = Math.round(lat * 1000) / 1000;
              const lngKey = Math.round(lng * 1000) / 1000;
              const cacheKey = `nearby-${latKey}-${lngKey}-${mode}`;
              const now = new Date().getTime();
              const cacheDuration = 3 * 24 * 60 * 60 * 1000; 

              let fallbackSpots: any[] = [];

              // (A) Cache Check
  let cachedData = null;
  if (roomId) {
      const { data } = await supabase
          .from('room_api_cache')
          .select('*')
          .eq('room_id', roomId)
          .eq('key', cacheKey)
          .maybeSingle();
      cachedData = data;
  }

  if (cachedData && (now - new Date(cachedData.created_at).getTime() < cacheDuration)) {
      fallbackSpots = cachedData.data;
  } else {
      // (B) API Call
      const res = await fetch(`${API_BASE_URL}/api/nearby_spots`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ latitude: lat, longitude: lng, radius: SEARCH_RADIUS, mode: mode })
      });
      if (res.ok) {
          const data = await res.json();
          fallbackSpots = data.spots || [];
          if (fallbackSpots.length > 0 && roomId) { // ★変更: roomIdがある時だけ保存
              await supabase.from('room_api_cache').upsert({
                  room_id: roomId, key: cacheKey, data: fallbackSpots, created_at: new Date().toISOString()
              });
          }
      }
  }

              // 補充データの正規化 (ここが重要)
              const formattedFallback = fallbackSpots.map((s: any) => {
                  // coordinatesがない場合、latitude/longitudeから作成
                  let coords = s.coordinates;
                  if (!coords && s.longitude && s.latitude) {
                      coords = [s.longitude, s.latitude];
                  }
                  
                  return {
                      ...s,
                      coordinates: coords,
                      is_nearby: true,
                      // 表示用IDを強制的にユニークにする (planSpotsのIDと被らないように)
                      id: `fallback-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
                  };
              });
              
              allCandidates = [...allCandidates, ...formattedFallback];
          }

          // -------------------------------------------------------------
          // 【ステップ3】 フィルタリング (重複除去)
          // -------------------------------------------------------------
          const uniqueSpots: any[] = [];
          
          allCandidates.forEach((s: any) => {
              // (1) 座標データが完全に欠落しているものは除外
              if (!s.coordinates || !Array.isArray(s.coordinates) || s.coordinates.length < 2) return;
              
              // (2) 既存プラン(planSpots)との重複チェック (名前 または 距離)
              const isAlreadyInPlan = planSpots.some(p => {
                  // 名前が完全一致
                  if (p.name === s.name) return true;
                  // 座標があり、かつ距離が非常に近い(50m以内)なら同一とみなす
                  if (p.coordinates && s.coordinates) {
                      const dist = calculateDistance(p.coordinates[1], p.coordinates[0], s.coordinates[1], s.coordinates[0]);
                      return dist < 0.05; // 50m
                  }
                  return false;
              });
              if (isAlreadyInPlan) return;

              // (3) 今回の候補リスト内での重複チェック (距離100m以内)
              const isDuplicateInCandidates = uniqueSpots.some(existing => {
                  const dist = calculateDistance(
                      existing.coordinates[1], existing.coordinates[0],
                      s.coordinates[1], s.coordinates[0]
                  );
                  return dist < 0.1; // 100m
              });

              if (!isDuplicateInCandidates) {
                  uniqueSpots.push(s);
              }
          });

          // 上位5件に絞る
          const limitedSpots = uniqueSpots.slice(0, 5);
          
          setNearbyCandidates(limitedSpots);
          
          if (limitedSpots.length === 0) {
              alert("周辺に新しいスポットが見つかりませんでした");
          } 

      } catch (e) {
          console.error(e);
          alert("検索に失敗しました");
      } finally {
          setIsSearchingNearby(false);
      }
  };

  // ▼▼▼ 追加: 写真で選ぶ（スワイプモードへ移動） ▼▼▼
  const handleGoToPhotoSwipe = () => {
      // SwipeViewへ候補として渡す
      // 一時的なIDを付与して、SwipeViewが正しく認識できるようにする
      setCandidates(nearbyCandidates.map(s => ({
          ...s,
          id: s.id || `nearby-${Date.now()}-${Math.random()}`, 
          status: 'candidate'
      })));
      setCurrentTab('swipe');
  };

  // ...existing.useState
  
// ★修正: チュートリアルモーダル表示用
  const [showTutorial, setShowTutorial] = useState(false);
  const [forceGuideTutorial, setForceGuideTutorial] = useState(false); // ★追加

  // ★修正: 初回ロード時にフラグチェック (招待者向け)
  useEffect(() => {
      // ルームに参加済み (isJoined && roomId) の場合のみチェック
      if (isJoined && roomId) {
          // TutorialModal.tsx で保存するキーと同じものを使う ('rh_tutorial_seen')
          const hasSeen = localStorage.getItem('rh_tutorial_seen');
          
          if (!hasSeen) {
              // 少し遅らせて表示することで、画面遷移の違和感を減らす
              const timer = setTimeout(() => setShowTutorial(true), 1500);
              return () => clearTimeout(timer);
          }
      }
  }, [isJoined, roomId]);

  // ★追加: お試しモード時のローカルストレージ同期
  useEffect(() => {
      if (isTrial) {
          // 初回マウント時に読み込み
          const savedSpots = localStorage.getItem('rh_trial_spots');
          const savedVotes = localStorage.getItem('rh_trial_votes');
          if (savedSpots) setPlanSpots(JSON.parse(savedSpots));
          if (savedVotes) setSpotVotes(JSON.parse(savedVotes));
      }
  }, [isTrial]);

  useEffect(() => {
      if (isTrial) {
          // データが変化するたびに保存
          localStorage.setItem('rh_trial_spots', JSON.stringify(planSpots));
          localStorage.setItem('rh_trial_votes', JSON.stringify(spotVotes));
      }
  }, [planSpots, spotVotes, isTrial]);

  // ★追加: メニューから呼び出すための関数
  const openTutorialFromMenu = () => {
      setForceGuideTutorial(true); // メニューからは「いきなりガイド」モードで
      setShowTutorial(true);
  };

  const [isEditingMemo, setIsEditingMemo] = useState(false); 
  const [editCommentValue, setEditCommentValue] = useState("");
  const [editLinkValue, setEditLinkValue] = useState("");

  // ★追加: 金額編集用のState
  const [editPriceValue, setEditPriceValue] = useState("");
  
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [editDescValue, setEditDescValue] = useState("");
  const [showVoteDetailSpot, setShowVoteDetailSpot] = useState<any>(null);

  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);

  // ★追加: ピンをタップしてフォーカス中かどうかを判定するフラグ
const isFocusingSpotRef = useRef(false);

  
  // ★追加: 右端ズーム用のジェスチャー状態管理
const rightEdgeGestureRef = useRef({
    isActive: false,
    startY: 0,
    startZoom: 0
});
// ★追加: ズームUIの表示制御用
const [showZoomUI, setShowZoomUI] = useState(false);
const [zoomSide, setZoomSide] = useState<'right' | 'left'>('right');
// ★追加: ツマミ（Knob）を直接DOM操作するためのRef（再レンダリング防止）
const zoomKnobRef = useRef<HTMLDivElement>(null);
  const searchMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const [lng, setLng] = useState(135.758767);
  const [lat, setLat] = useState(34.985120);
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedResult, setSelectedResult] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'default' | 'searching' | 'selected'>('default');
  const [sessionToken, setSessionToken] = useState("");
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [isFocused, setIsFocused] = useState(false);

  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  
  const [sheetHeight, setSheetHeight] = useState(140);
  const [isDragging, setIsDragging] = useState(false);
  const dragInfo = useRef({ startY: 0, startHeight: 0, hasMoved: false });

  

  

 // --- 追加する状態と関数 ---
const [draggedTimelineIndex, setDraggedTimelineIndex] = useState<number | null>(null);

const onTimelineDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData('text/plain', String(index));
    setDraggedTimelineIndex(index);
};

// ★追加: 自動スクロール関数
const startTimelineAutoScroll = (direction: 'up' | 'down') => {
    if (timelineScrollInterval.current) return;
    const container = timelineListRef.current; // 後述のdivにrefを追加する必要あり
    if (!container) return;

    timelineScrollInterval.current = setInterval(() => {
        const speed = 15;
        if (direction === 'up') {
            container.scrollTop -= speed;
        } else {
            container.scrollTop += speed;
        }
    }, 16);
};

const stopTimelineAutoScroll = () => {
    if (timelineScrollInterval.current) {
        clearInterval(timelineScrollInterval.current);
        timelineScrollInterval.current = null;
    }
};
const onTimelineDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    // ★追加: オートスクロール判定
    const container = timelineListRef.current;
    if (container) {
        const { top, bottom } = container.getBoundingClientRect();
        const mouseY = e.clientY;
        
        // ▼▼▼ 修正: 閾値を 100 → 20 に変更して、端まで行かないとスクロールしないようにする ▼▼▼
        const threshold = 20; 

        if (mouseY < top + threshold) {
            startTimelineAutoScroll('up');
        } else if (mouseY > bottom - threshold) {
            startTimelineAutoScroll('down');
        } else {
            stopTimelineAutoScroll();
        }
    }
};
// page.tsx 内の onTimelineDrop を以下に置き換え
// page.tsx 内の onTimelineDrop 関数をすべて入れ替えてください

const onTimelineDrop = async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    stopTimelineAutoScroll(); 
    const sourceIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (isNaN(sourceIndex) || sourceIndex === targetIndex) return;

    const draggedItem = displayTimeline[sourceIndex];
    if (!draggedItem || draggedItem.type !== 'spot') return;

    // ▼▼▼ 修正: 複数移動対応のペアリングロジック ▼▼▼
    const pairs: { travels: any[], item: any }[] = [];
    let pendingTravels: any[] = [];

    displayTimeline.forEach(item => {
        if (item.type === 'travel') {
            pendingTravels.push(item);
        } else if (item.type === 'spot') {
            pairs.push({ travels: pendingTravels, item: item });
            pendingTravels = [];
        }
    });

    // 移動元の特定
    const sourcePairIndex = pairs.findIndex(p => p.item === draggedItem);
    if (sourcePairIndex === -1) return;

    // 移動先の特定
    let targetPairIndex = 0;
    for(let i = 0; i < targetIndex; i++){
        if(displayTimeline[i].type === 'spot') targetPairIndex++;
    }
    
    // ★修正: 上から下へ移動する際、ドロップした位置の「後ろ」に挿入されるようにするため、
    // インデックスを減らす処理を削除します。
    // if (sourcePairIndex < targetPairIndex) {
    //    targetPairIndex--;
    // }

    // 並び替え
    const [movedPair] = pairs.splice(sourcePairIndex, 1);
    pairs.splice(targetPairIndex, 0, movedPair);

    // 再構築
    const finalTimeline: any[] = [];
    pairs.forEach((pair, index) => {
        if (index > 0) {
            if (pair.travels.length > 0) {
                finalTimeline.push(...pair.travels);
            } else {
                // ▼▼▼ 修正: デフォルトを徒歩・未定に変更 ▼▼▼
                finalTimeline.push({ type: 'travel', duration_min: null, transport_mode: 'walk' });
            }
        }
        finalTimeline.push(pair.item);
    });
    // ▼▼▼ 修正ここまで ▲▲▲

    setDisplayTimeline(finalTimeline);
    setDraggedTimelineIndex(null);
    
    // 保存処理 (既存ロジック)
    if (roomId && selectedConfirmDay > 0) {
        const storageKey = `rh_plan_${roomId}_day_${selectedConfirmDay}`;
        localStorage.setItem(storageKey, JSON.stringify({ 
            timeline: finalTimeline, 
            updatedAt: Date.now() 
        }));
    }

    const justSpots = pairs.map(p => p.item.spot);
    for (let i = 0; i < justSpots.length; i++) {
        await supabase
            .from('spots')
            .update({ order: i })
            .eq('id', justSpots[i].id);
    }

    setPlanSpots(prev => {
        const next = [...prev];
        justSpots.forEach((s, idx) => {
            const i = next.findIndex(p => p.id === s.id);
            if (i !== -1) next[i].order = idx;
        });
        return [...next].sort((a, b) => (a.order || 0) - (b.order || 0));
    });
};

  const handleDragStart = (e: React.TouchEvent | React.MouseEvent) => {
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      dragInfo.current = { startY: clientY, startHeight: sheetHeight, hasMoved: false };
      setIsDragging(true);
  };

  const handleDragMove = (e: React.TouchEvent | React.MouseEvent) => {
      if (!isDragging) return;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const delta = dragInfo.current.startY - clientY; 
      if (Math.abs(delta) > 5) dragInfo.current.hasMoved = true;
      if (dragInfo.current.hasMoved) {
          const newHeight = Math.max(140, Math.min(window.innerHeight * 0.9, dragInfo.current.startHeight + delta));
          setSheetHeight(newHeight);
      }
  };

  const handleDragEnd = () => { setIsDragging(false); };

  const handleHeaderClick = (e: React.MouseEvent) => {
      if (dragInfo.current.hasMoved) return; 
      const isExpanded = sheetHeight > window.innerHeight * 0.4;
      setSheetHeight(isExpanded ? 140 : window.innerHeight * 0.65);
  };

  const [isDrawing, setIsDrawing] = useState(false);
  const tempDrawCoords = useRef<number[][]>([]);
  const [initialSearchArea, setInitialSearchArea] = useState<AreaSearchParams | null>(null);

  const [showDateModal, setShowDateModal] = useState(false);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [adultNum, setAdultNum] = useState<number>(2); 
  // ★追加: 旅行名用のState
  const [roomName, setRoomName] = useState("");
  const [spotToAssignDay, setSpotToAssignDay] = useState<any>(null); 

  // ★追加: 複製追加（2回目以降の追加）を行うスポットを一時保持するState
  const [spotToDuplicate, setSpotToDuplicate] = useState<any>(null);

  const [travelDays, setTravelDays] = useState<number>(1);
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);

  const [selectedConfirmDay, setSelectedConfirmDay] = useState<number>(0);
  const [selectedCandidateArea, setSelectedCandidateArea] = useState<string>('all');
  
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [autoShowScreenshot, setAutoShowScreenshot] = useState(false);
  const [showVoterListModal, setShowVoterListModal] = useState(false);
  const [notification, setNotification] = useState<{ text: string, color: string } | null>(null);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const attemptedImageFetch = useRef<Set<string>>(new Set());
  // ▼▼▼ 追加: 住所の再取得を試みたスポットIDを記録するRef ▼▼▼
  const attemptedAddressFetch = useRef<Set<string>>(new Set());
  const [displayTimeline, setDisplayTimeline] = useState<any[]>([]);

  // ▼▼▼ 追加: 詳細モーダルのスワイプ用State ▼▼▼
  const [modalDragY, setModalDragY] = useState(0);
  const [isModalDragging, setIsModalDragging] = useState(false);
  const modalDragStartRef = useRef<number>(0);
  // ▲▲▲ 追加ここまで ▲▲▲

  // ★追加: タイムラインリストのDOM参照用と、スクロール制御用
const timelineListRef = useRef<HTMLDivElement>(null);
const timelineScrollInterval = useRef<NodeJS.Timeout | null>(null);

// ▼▼▼ 追加: 住所からエリア（市町村）を抽出するヘルパー関数 ▼▼▼
// ▼▼▼ 改善版: エリア抽出ロジック ▼▼▼

// ▼▼▼ 修正: 住所抽出ロジックの改善 ▼▼▼

const PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
  "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
  "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
  "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"
];

// page.tsx の 285行目付近 (extractPrefecture 関数)

const extractPrefecture = (spot: any) => {
    const text = spot.description || spot.place_name || spot.name || "";
    
    // 1. 都道府県リスト（富山県 など）から検索
    for (const pref of PREFECTURES) {
        if (text.includes(pref)) return pref;
    }
    
    // 2. 「県」が抜けている場合（富山 など）の救済措置を追加
    for (const pref of PREFECTURES) {
        const shortPref = pref.replace(/[都府県]$/, ""); // "富山" に変換
        // 2文字以上の都道府県名（北海、東京など）が含まれていれば補完して返す
        if (shortPref.length >= 2 && text.includes(shortPref)) {
            return pref; 
        }
    }
    
    // 主要都市の救済（既存のまま）
    if (text.includes("京都")) return "京都府";
    if (text.includes("大阪")) return "大阪府";
    if (text.includes("東京")) return "東京都";
    
    return "その他";
};

// page.tsx の extractCity を修正
// page.tsx の extractCity 関数を修正

// page.tsx の extractCity と isInvalidAddress を修正

// page.tsx の extractCity 関数を修正

// 正規表現で「郡」を削除し、「市」を最優先で抽出するロジック
const extractCity = (spot: any) => {
    const text = spot.description || spot.place_name || spot.name || "";
    let addressBody = text;
    const pref = extractPrefecture(spot);

    if (pref !== "その他") {
        const splitByFull = text.split(pref);
        if (splitByFull.length > 1) {
            addressBody = splitByFull[1];
        } else {
            const shortPref = pref.replace(/[都府県]$/, "");
            const splitByShort = text.split(shortPref);
            if (splitByShort.length > 1) {
                addressBody = splitByShort[1].replace(/^[県都府道]/, "");
            }
        }
    }

    // 郡を削除
    let cleanBody = addressBody.replace(/[一-龠ぁ-んァ-ン]{1,6}郡/g, '');

    // 市を優先
    const cityMatch = cleanBody.match(/([一-龠ぁ-んァ-ン]{1,6}市)/);
    if (cityMatch) return cityMatch[1]; 

    // 区
    const wardMatch = cleanBody.match(/([一-龠ぁ-んァ-ン]{1,6}区)/);
    if (wardMatch) return wardMatch[1];

    // 町村
    const townMatch = cleanBody.match(/([一-龠ぁ-んァ-ン]{1,6}[町村])/);
    if (townMatch) return townMatch[1];

    return pref !== "その他" ? "市町村不明" : "その他";
};

// 判定ロジックを「AI補完が必要か」という基準にする
const isInvalidAddress = (spot: any) => {
    const city = extractCity(spot);
    const pref = extractPrefecture(spot);
    
    // 住所が NN や 調査中 の場合、または解析結果が「不明」「その他」なら AI 出動
    return !spot.description || 
           spot.description.includes("住所調査中") || 
           spot.description.includes("NN") || 
           city === "市町村不明" || 
           city === "その他" ||
           pref === "その他";
};

const getSpotArea = (spot: any, mode: 'city' | 'prefecture') => {
    return mode === 'prefecture' ? extractPrefecture(spot) : extractCity(spot);
};

  // ...既存のuseState
  const [isSuggesting, setIsSuggesting] = useState(false);

  // ...既存のuseStateなどの下に追加...

    // ★追加: 全スポットを見てエリア名を「名寄せ」するロジック
    // 例: リスト内に「富山市」と「科学博物館富山市」がある場合、短い「富山市」に統一する
    const normalizedCityMap = useMemo(() => {
        const map = new Map<string, string>(); // spotId -> 統一されたエリア名
        if (!planSpots || planSpots.length === 0) return map;

        // 1. まず全スポットの生のエリア名を抽出
        const tempMap = new Map<string, string>();
        const uniqueCities = new Set<string>();

        planSpots.forEach(s => {
            const city = extractCity(s);
            tempMap.set(s.id, city);
            if (city !== "市町村不明" && city !== "その他") {
                uniqueCities.add(city);
            }
        });

        const sortedUniqueCities = Array.from(uniqueCities).sort((a, b) => a.length - b.length);

        // 2. 名寄せ処理 (包含関係チェック)
        planSpots.forEach(s => {
            let city = tempMap.get(s.id) || "その他";

            if (city !== "市町村不明" && city !== "その他") {
                // 自分より短くて、自分の名前に含まれている「きれいな都市名」が他にあるか探す
                // 例: city="科学博物館富山市", candidate="富山市" -> endsWithでマッチ -> "富山市"を採用
                const betterCity = sortedUniqueCities.find(candidate => 
                    candidate !== city && city.endsWith(candidate)
                );
                
                if (betterCity) {
                    city = betterCity;
                }
            }
            map.set(s.id, city);
        });

        return map;
    }, [planSpots]);

  // ★追加: 現在フォーカス（赤ピン表示）されているスポットのIDを保持
//const [focusedSpotId, setFocusedSpotId] = useState<string | null>(null);

// ★追加: 最新の状態を常に参照するためのRef
const sheetHeightRef = useRef(sheetHeight);
const focusedSpotIdRef = useRef<string | null>(null);

// 1. 変数の定義エリア（180行目あたり、他のuseRefの近く）に追加
const searchRequestId = useRef(0); // ★追加: 通信の競合を防ぐためのID管理

// ★追加: sheetHeightが変化するたびにRefを更新
useEffect(() => {
    sheetHeightRef.current = sheetHeight;
}, [sheetHeight]);

  // ...既存のuseState定義のあたり...

  // ★追加: エリア区分のモード ('city' | 'prefecture')
  const [groupingMode, setGroupingMode] = useState<'city' | 'prefecture'>('city');

  // ★追加: ルームごとの設定をロード
  useEffect(() => {
      if (roomId) {
          const savedMode = localStorage.getItem(`rh_grouping_mode_${roomId}`);
          if (savedMode === 'prefecture') {
              setGroupingMode('prefecture');
          }
      }
  }, [roomId]);

  // ★追加: モード切替と保存
  const toggleGroupingMode = () => {
      const nextMode = groupingMode === 'city' ? 'prefecture' : 'city';
      setGroupingMode(nextMode);
      setSelectedCandidateArea('all'); // モード切替時は「すべて」にリセット
      if (roomId) {
          localStorage.setItem(`rh_grouping_mode_${roomId}`, nextMode);
      }
  };
  
  // ★追加: シークレットモード警告用
  // const [showIncognitoWarning, setShowIncognitoWarning] = useState(false);

  const planSpotsRef = useRef(planSpots);
  useEffect(() => { planSpotsRef.current = planSpots; }, [planSpots]);

  // 未読管理
  const mountTimeRef = useRef(Date.now());
  const hasShownArrivalNotice = useRef(false); // ★追加：通知済みフラグ
  // 160行目付近（hasShownArrivalNotice の近く）
const [arrivalModalSpots, setArrivalModalSpots] = useState<any[]>([]); // ★追加：モーダル用
  const [lastVisited, setLastVisited] = useState<Record<string, number>>({});
  const [highlightThresholds, setHighlightThresholds] = useState<Record<string, number>>({});
  const [isLastVisitedLoaded, setIsLastVisitedLoaded] = useState(false);
  const getContextKey = (status: string, day: number) => {
      if (status === 'hotel_candidate') return 'hotel_candidate';
      return `${status}_${day || 0}`;
  };

  

  useEffect(() => {
      if (roomId) {
          try {
              const saved = localStorage.getItem(`rh_last_visited_${roomId}`);
              if (saved) setLastVisited(JSON.parse(saved));
          } catch(e) {}
          setIsLastVisitedLoaded(true); // ロード完了
      }
  }, [roomId]);
  // ▼▼▼ 修正: 既読管理のロジック (リロード対策版) ▼▼▼
  // ▼▼▼ 修正: 既読管理のロジック (リロード対策版) ▼▼▼
 useEffect(() => {
      if (!roomId) return;
      if (filterStatus === 'all') return;
      if (!isLastVisitedLoaded) return; // ロード前は実行しない（ハイライト消滅防止）
      
      let currentDay = 0;
      if (filterStatus === 'confirmed') currentDay = selectedConfirmDay;
      if (filterStatus === 'hotel_candidate') currentDay = selectedHotelDay;

      const key = getContextKey(filterStatus, currentDay);
      const now = Date.now();

      // 1. ハイライト用の基準時間を「画面を開いた瞬間」の状態で固定する
      setHighlightThresholds(prev => {
          // 既にこのキーの基準時間があれば更新しない（リロード直後などでちらつくのを防ぐ）
          // タブを切り替えた時だけ更新したいが、useEffectは切り替え時に走るため、
          // 単純に「現在のlastVisited（＝前回の閲覧時間）」をセットすればOK
          return { ...prev, [key]: lastVisited[key] || 0 };
      });

      // 2. 次回訪問用に「既読（現在時刻）」として即座に保存する
      setLastVisited(prev => {
          if (prev[key] && now - prev[key] < 1000) return prev; // 短時間の連打防止

          const next = { ...prev, [key]: now };
          localStorage.setItem(`rh_last_visited_${roomId}`, JSON.stringify(next));
          return next;
      });
      
  }, [filterStatus, selectedConfirmDay, selectedHotelDay, roomId, isLastVisitedLoaded]); 
  // ▲▲▲ 修正ここまで ▲▲▲
  // ▲▲▲ 修正ここまで ▲▲▲

  // ▼▼▼ 追加: 黄色ハイライト判定用の関数 ▼▼▼
  const isHighlighted = (spot: any) => {
      const key = getContextKey(spot.status, spot.day);
      
      // ハイライト用の基準時間があればそれを使う。なければ通常の既読時間を使う。
      // これにより、この画面にいる間はずっと「入室時の未読状態」で判定される。
      const threshold = highlightThresholds[key] !== undefined ? highlightThresholds[key] : (lastVisited[key] || 0);
      
      const timeToCheck = new Date(spot.updated_at || spot.created_at).getTime();
      return timeToCheck > threshold;
  };
  // ▲▲▲ 追加ここまで ▲▲▲

  const isNewSpot = (spot: any) => {
      const key = getContextKey(spot.status, spot.day);
      // その画面を最後に見た時間（未訪問なら0）
      const threshold = lastVisited[key] || 0; 
      
      // 作成日時 または 更新日時 の新しい方を使う
      const timeToCheck = new Date(spot.updated_at || spot.created_at).getTime();
      
      // 最後に見た時間より新しければ「新着」
      return timeToCheck > threshold;
  };

  // Unread counts の計算ロジック修正
  const unreadCounts = useMemo(() => {
      const counts = {
          confirmed: 0,
          candidate: 0,
          hotel_candidate: 0,
          confirmedDays: {} as Record<number, number>,
          candidateDays: {} as Record<number, number>,
          hotelDays: {} as Record<number, number>,
      };
      
      planSpots.forEach(s => {
          if (isNewSpot(s)) {
              const d = s.day || 0;
              
              // カテゴリごとのカウント
              if (s.status === 'confirmed') {
                  counts.confirmed++;
                  counts.confirmedDays[d] = (counts.confirmedDays[d] || 0) + 1;
              } else if (s.status === 'candidate') {
                  counts.candidate++;
                  counts.candidateDays[d] = (counts.candidateDays[d] || 0) + 1;
              } else if (s.status === 'hotel_candidate') {
                  counts.hotel_candidate++;
                  counts.hotelDays[d] = (counts.hotelDays[d] || 0) + 1;
              }
          }
      });
      return counts;
  }, [planSpots, lastVisited, userName]); // userNameの依存は残すが、ロジックからは除外（自分のもカウントするため）

  // ... (後略)

  // ★追加: スワイプチュートリアルの表示トリガー
  useEffect(() => {
      if (currentTab === 'swipe' && (candidates.length > 0 || planSpots.length > 0)) {
          const seen = localStorage.getItem('rh_swipe_tutorial_seen');
          if (!seen) {
              setShowSwipeTutorial(true);
          }
      }
  }, [currentTab, candidates.length, planSpots.length]);

  const handleCloseTutorial = () => {
      if (dontShowTutorial) {
          localStorage.setItem('rh_swipe_tutorial_seen', 'true');
      }
      setShowSwipeTutorial(false);
  };

  useEffect(() => {
    setIsDrawing(false);
    setInitialSearchArea(null);
    tempDrawCoords.current = [];
  }, []);



  useEffect(() => {
      const wakeBackend = () => {
          fetch(`${API_BASE_URL}/`, { method: 'GET' })
              .then(() => console.log(`🔌 Backend Ping: ${new Date().toLocaleTimeString()}`))
              .catch(() => console.log("💤 Backend might be sleeping or unreachable"));
      };
      wakeBackend();
      const intervalId = setInterval(wakeBackend, 10 * 60 * 1000);
      return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (roomId) {
        const savedSettings = localStorage.getItem(`rh_settings_${roomId}`);
        if (savedSettings) {
            try {
                const parsed = JSON.parse(savedSettings);
                if(parsed.start) setStartDate(parsed.start);
                if(parsed.end) setEndDate(parsed.end);
                if(parsed.adultNum) setAdultNum(parsed.adultNum);
            } catch(e) { console.error("Settings load error", e); }
        } else {
            const savedDates = localStorage.getItem(`rh_dates_${roomId}`);
            if (savedDates) {
                try {
                    const { start, end } = JSON.parse(savedDates);
                    if(start) setStartDate(start);
                    if(end) setEndDate(end);
                } catch(e){}
            }
        }
        setIsSettingsLoaded(true);
    } else { setIsSettingsLoaded(true); }
  }, [roomId]);

  useEffect(() => {
    document.body.style.overscrollBehavior = 'none';
    return () => { document.body.style.overscrollBehavior = ''; };
  }, []);

  useEffect(() => {
      if (startDate && endDate) {
          const start = new Date(startDate);
          const end = new Date(endDate);
          const diffTime = Math.abs(end.getTime() - start.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
          setTravelDays(diffDays > 0 ? diffDays : 1);
      } else { setTravelDays(1); }
      if (roomId && isSettingsLoaded) {
          localStorage.setItem(`rh_settings_${roomId}`, JSON.stringify({ start: startDate, end: endDate, adultNum }));
      }
  }, [startDate, endDate, adultNum, roomId, isSettingsLoaded]);

  // page.tsx 352行目付近の useEffect を修正
// page.tsx
// page.tsx (該当のuseEffect)

// page.tsx 870行目付近の useEffect

// page.tsx 870行目付近

 // page.tsx 870行目付近の useEffect (タイムライン表示用) を以下に置き換えてください

// ★修正: タイムライン生成ロジック (Day変更時の即時反映対応版)
  useEffect(() => {
    // 確定リスト表示モード以外なら何もしない
    if (filterStatus !== 'confirmed' || !roomId) return;

    const day = selectedConfirmDay === 0 ? 0 : selectedConfirmDay;
    
    // Day 0 (未定) の場合は単純にリスト表示
    if (day === 0) {
         setDisplayTimeline(planSpots.filter(s => s.status === 'confirmed' && (s.day === 0 || !s.day)).map(s => ({ type: 'spot', spot: s })));
         return;
    }
    
    // --- ここから Day 1以降のロジック ---

    // 1. DB上の最新スポットリストを取得 (前日の宿も含む)
    // ★重要: ここで filter をかけるため、Dayを変更したスポットは自動的に除外されます
    let validSpotsInDB = planSpots.filter(s => s.status === 'confirmed' && s.day === day);
    
    // 前日の宿を含めるロジック
    if (day > 1) {
        const prevDayHotel = planSpots.find(s => 
            s.status === 'confirmed' && 
            s.day === day - 1 && 
            (s.is_hotel || isHotel(s.name))
        );
        if (prevDayHotel && !validSpotsInDB.some(s => s.id === prevDayHotel.id)) {
            validSpotsInDB = [prevDayHotel, ...validSpotsInDB];
        }
    }

    // 2. ローカルストレージから「並び順」を取得
    const storageKey = `rh_plan_${roomId}_day_${day}`;
    const savedPlanStr = localStorage.getItem(storageKey);
    
    let tempTimeline: any[] = [];

    if (savedPlanStr) {
        try {
            const savedData = JSON.parse(savedPlanStr);
            if (savedData.timeline && Array.isArray(savedData.timeline)) {
                
                tempTimeline = savedData.timeline.map((item: any) => {
                    if (item.type === 'spot') {
                        // ★重要: ここでDBに存在しない（Day移動した）スポットは freshSpot が undefined になる
                        const freshSpot = validSpotsInDB.find(s => String(s.id) === String(item.spot.id));
                        
                        // DBにない(=移動した)スポットは null を返して消去する
                        return freshSpot ? { 
                            ...item, 
                            spot: { ...item.spot, ...freshSpot },
                            image: freshSpot.image_url || item.image 
                        } : null; 
                    }
                    return item; 
                }).filter(Boolean); // nullを除去
            }
        } catch(e) { console.error("Parse error", e); }
    }

    // クリーニング処理
    const cleanTimeline: any[] = [];
    tempTimeline.forEach((item) => {
        if (item.type === 'spot') {
            if (cleanTimeline.length > 0 && cleanTimeline[cleanTimeline.length - 1].type === 'spot') {
                cleanTimeline.push({ type: 'travel', duration_min: null, transport_mode: 'walk' });
            }
            cleanTimeline.push(item);
        } else if (item.type === 'travel') {
            if (cleanTimeline.length > 0) {
                 cleanTimeline.push(item);
            }
        }
    });
    if (cleanTimeline.length > 0 && cleanTimeline[cleanTimeline.length - 1].type === 'travel') {
        cleanTimeline.pop();
    }
    
    let finalTimeline = cleanTimeline;

    // 3. 新規またはDB順での初期生成
    if (finalTimeline.length === 0 && validSpotsInDB.length > 0) {
        validSpotsInDB.sort((a, b) => (a.order || 0) - (b.order || 0));
        validSpotsInDB.forEach((spot, i) => {
             finalTimeline.push({ type: 'spot', spot, stay_min: spot.stay_time || null });
            if (i < validSpotsInDB.length - 1) { 
                 finalTimeline.push({ type: 'travel', duration_min: null, transport_mode: 'walk' }); 
            }
         });
         finalTimeline = calculateSimpleSchedule(finalTimeline, "09:00");
    } else {
        // DBにあるのにタイムラインにない（新しくこのDayに移動してきた）スポットを追加
        const timelineSpotIds = new Set(finalTimeline.filter(t => t.type === 'spot').map(t => String(t.spot.id)));
        const newSpots = validSpotsInDB.filter(s => !timelineSpotIds.has(String(s.id)));

        if (newSpots.length > 0) {
            newSpots.forEach(s => {
                if (finalTimeline.length > 0) {
                     finalTimeline.push({ type: 'travel', duration_min: null, transport_mode: 'walk' });
                }
               finalTimeline.push({ type: 'spot', spot: s, stay_min: null });
            });
        }
    }

    setDisplayTimeline(finalTimeline);

    // ★追加: 最新の状態（移動して消えた状態など）を即座にローカルストレージへ保存
    // これにより、リロードしても「移動前の日」にスポットが残るのを防ぐ
    if (finalTimeline.length > 0 || validSpotsInDB.length === 0) {
        localStorage.setItem(storageKey, JSON.stringify({ 
            timeline: finalTimeline, 
            updatedAt: Date.now() 
        }));
    }

  }, [filterStatus, selectedConfirmDay, planSpots, roomId, currentTab]);
  const fetchSpotImage = async (name: string) => {
      try {
          const res = await fetch(`${API_BASE_URL}/api/get_spot_image?query=${encodeURIComponent(name)}`);
          if (res.ok) {
              const data = await res.json();
              if (data.image_url && (data.image_url.startsWith('http') || data.image_url.startsWith('https'))) {
                  return data.image_url;
              }
          }
      } catch (e) { console.error("Image fetch failed", e); }
      return null;
  };

  // ▼▼▼ 追加: 詳細情報（住所・画像・説明）をまとめて取得 ▼▼▼
  // ▼▼▼ 修正: 座標も渡せるように変更 ▼▼▼
  const fetchSpotInfo = async (name: string, lat?: number, lng?: number) => {
      try {
          let url = `${API_BASE_URL}/api/get_spot_info?query=${encodeURIComponent(name)}`;
          // 座標があればクエリパラメータに追加
          if (lat !== undefined && lng !== undefined) {
              url += `&lat=${lat}&lng=${lng}`;
          }
          const res = await fetch(url);
          if (res.ok) return await res.json();
      } catch (e) { console.error("Spot info fetch failed", e); }
      return null;
  };

  // 600行目付近（loadRoomData 関連の useEffect の後あたり）に追加

// 600行目付近（先程追加した useEffect）を以下に置き換え

useEffect(() => {
    if (!roomId || !isJoined || planSpots.length === 0 || hasShownArrivalNotice.current) return;

    const lastSeenKey = `rh_last_arrival_${roomId}`;
    const lastSeenStr = localStorage.getItem(lastSeenKey);
    const now = Date.now();

    if (!lastSeenStr) {
        localStorage.setItem(lastSeenKey, now.toString());
        hasShownArrivalNotice.current = true;
        return;
    }

    const lastSeen = parseInt(lastSeenStr);
    
    // 前回訪問以降に自分以外が追加したスポットを取得
    const newArrivalSpots = planSpots.filter(s => {
        const createdAt = new Date(s.created_at).getTime();
        return createdAt > lastSeen && s.added_by !== userName;
    });

    if (newArrivalSpots.length > 0) {
        // 通知ではなくモーダルにスポットリストをセットする
        setArrivalModalSpots(newArrivalSpots);
    }

    localStorage.setItem(lastSeenKey, now.toString());
    hasShownArrivalNotice.current = true;

}, [roomId, isJoined, planSpots]);
  useEffect(() => {
    if (planSpots.length > 0) {
        planSpots.forEach(async (spot) => {
            if (!spot.image_url && !attemptedImageFetch.current.has(spot.id)) {
                attemptedImageFetch.current.add(spot.id);
                const existingSpotWithImage = planSpots.find(s => s.name === spot.name && s.image_url);
                if (existingSpotWithImage) {
                     setPlanSpots(prev => prev.map(s => s.id === spot.id ? { ...s, image_url: existingSpotWithImage.image_url } : s));
                     if (roomId) supabase.from('spots').update({ image_url: existingSpotWithImage.image_url }).eq('id', spot.id).then();
                     return;
                }
                const url = await fetchSpotImage(spot.name);
                if (url) {
                    setPlanSpots(prev => prev.map(s => s.id === spot.id ? { ...s, image_url: url } : s));
                    if (roomId) { supabase.from('spots').update({ image_url: url }).eq('id', spot.id).then(); }
                }
            }
        });
    }
  }, [planSpots, roomId]);
  // ▼▼▼ 追加: 住所が不明・「その他」のスポットを自動修正する処理 ▼▼▼
// ▼▼▼ 追加: 住所自動修正（バッジ点灯なし版） ▼▼▼
// page.tsx 内の住所自動修正 useEffect (940行目付近) を確認/調整

// page.tsx の自動修正 useEffect を強化
// 自動修正を行う useEffect 内の判定ロジック
// page.tsx 940行目付近の useEffect

useEffect(() => {
    if (!roomId || planSpots.length === 0) return;

    planSpots.forEach(async (spot) => {
        // 現在の状態が「不明」かチェック
        if (isInvalidAddress(spot) && !attemptedAddressFetch.current.has(spot.id)) {
            attemptedAddressFetch.current.add(spot.id);

            // バックエンドの AI 補完 API を叩く
            const info = await fetchSpotInfo(spot.name, spot.coordinates?.[1], spot.coordinates?.[0]);

            if (info && info.description && !info.description.includes("NN") && !info.description.includes("調査中")) {
                // フロントの表示を即座に更新
                setPlanSpots(prev => prev.map(s => 
                    s.id === spot.id ? { ...s, description: info.description, comment: info.comment || s.comment } : s
                ));

                // Supabase に AI が特定した正確な住所を保存する
                await supabase.from('spots').update({ 
                    description: info.description,
                    comment: info.comment || spot.comment
                }).eq('id', spot.id);
            }
        }
    });
}, [planSpots, roomId]);

  // ... (前略)

  // ... (前略)

 // ... (前略)

 const getAffiliateUrl = (spot: any) => {
      // 日付パース
      const parseLocalYMD = (ymd: string) => {
          if (!ymd) return null;
          const parts = ymd.split('-').map(Number);
          if (parts.length !== 3) return null;
          return new Date(parts[0], parts[1] - 1, parts[2]);
      };

      // 1. 基準日
      let targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + 30);

      if (startDate) {
          const parsedStart = parseLocalYMD(startDate);
          if (parsedStart) targetDate = parsedStart;
      }

      // 2. Dayによる日付加算
      const dayNum = Number(spot.day);
      if (!isNaN(dayNum) && dayNum > 0) {
          targetDate.setDate(targetDate.getDate() + (dayNum - 1));
      }

      // 3. チェックアウト日
      const checkOutDate = new Date(targetDate);
      checkOutDate.setDate(targetDate.getDate() + 1);

      // 4. パラメータ用変数
      const y1 = targetDate.getFullYear();
      const m1 = targetDate.getMonth() + 1;
      const d1 = targetDate.getDate();
      const y2 = checkOutDate.getFullYear();
      const m2 = checkOutDate.getMonth() + 1;
      const d2 = checkOutDate.getDate();

      // ★ご指定のパラメータ文字列（順序・構成を完全に一致）
      const paramString = `f_flg=PLAN&f_otona_su=${adultNum}&f_heya_su=1&f_kin=&f_kin2=&f_s1=0&f_s2=0&f_y1=0&f_y2=0&f_y3=0&f_y4=0&f_nen1=${y1}&f_tuki1=${m1}&f_hi1=${d1}&f_nen2=${y2}&f_tuki2=${m2}&f_hi2=${d2}&f_hak=1&f_tel=&f_tscm_flg=&f_p_no=&f_custom_code=&f_search_type=&f_service=&f_rm_equip=&f_sort=minNo`;
      // 5. 楽天IDの抽出ロジック（強化版）
      const extractRakutenId = (url: string) => {
          if (!url) return null;
          // plan/数字, HOTEL/数字, no=数字 などのパターンに対応
          const match = url.match(/hotelinfo\/plan\/(\d+)/) || url.match(/HOTEL\/(\d+)/) || url.match(/no=(\d+)/);
          return match ? match[1] : null;
      };

      let hotelId = null;
      
      // 保存されたURLからIDを探す
      if (spot.url) {
          hotelId = extractRakutenId(spot.url);
      }
      // spot.id 自体が数値（楽天ID）の場合
      if (!hotelId && spot.id && /^\d+$/.test(String(spot.id))) {
          hotelId = spot.id;
      }

      // ★ IDがある場合（これが本命）
      if (hotelId) {
          return `https://hotel.travel.rakuten.co.jp/hotelinfo/plan/${hotelId}?${paramString}`;
      } 
      
      // IDがどうしても不明な場合のみ検索URLにする（ただし後ろのパラメータ順序は合わせる）
      return `https://search.travel.rakuten.co.jp/ds/hotel/search?f_query=${encodeURIComponent(spot.name)}&${paramString}`;
  };

 // page.tsx 690行目付近の allParticipants を以下に書き換え

// page.tsx 750行目付近

const allParticipants = useMemo(() => {
    // ユーザーごとの「最初の活動時間」を記録
    const userActivityMap = new Map<string, number>();

    // 1. スポット追加データから時間を取得
    planSpots.forEach(s => {
        if (!s.added_by) return;
        const time = new Date(s.created_at).getTime();
        if (!userActivityMap.has(s.added_by) || time < userActivityMap.get(s.added_by)!) {
            userActivityMap.set(s.added_by, time);
        }
    });

    // 2. 投票データから時間を取得
    spotVotes.forEach(v => {
        if (!v.user_name) return;
        const time = new Date(v.created_at).getTime();
        if (!userActivityMap.has(v.user_name) || time < userActivityMap.get(v.user_name)!) {
            userActivityMap.set(v.user_name, time);
        }
    });

    // 3. 自分自身を追加（まだ活動がない場合）
    if (userName && !userActivityMap.has(userName)) {
        userActivityMap.set(userName, mountTimeRef.current);
    }

    // ★ データベース上の「活動開始が古い順」に並び替える
    // これにより、新しい人が入っても既存メンバーのインデックス（色）が変わらない
    return Array.from(userActivityMap.keys()).sort((a, b) => 
        (userActivityMap.get(a) || 0) - (userActivityMap.get(b) || 0)
    );
}, [planSpots, spotVotes, userName]);

  const getUserColor = (name: string) => {
      if (!name) return '#9CA3AF';
      let hash = 0;
      // 名前の文字列から一意の数値を計算（ハッシュ化）
      for (let i = 0; i < name.length; i++) { 
          hash = name.charCodeAt(i) + ((hash << 5) - hash); 
      }
      // 計算した数値を元にカラーパレットから色を取得
      return UD_COLORS[Math.abs(hash) % UD_COLORS.length];
  };

  //const rakutenHomeUrl = `https://hb.afl.rakuten.co.jp/hgc/${RAKUTEN_AFFILIATE_ID}/?pc=${encodeURIComponent("https://travel.rakuten.co.jp/")}&m=${encodeURIComponent("https://travel.rakuten.co.jp/")}`;
const rakutenHomeUrl = "https://travel.rakuten.co.jp/";
 // page.tsx の 752行目付近にある filteredSpots を以下に書き換え

// page.tsx 750行目付近

// page.tsx 750行目付近の filteredSpots を以下に置き換え

const filteredSpots = useMemo(() => {
    // 1. ALL表示
    if (filterStatus === 'all') return planSpots;
    
    let spots = planSpots;
    
    // 2. 確定リスト (Dayごとの表示 + 前日の宿表示ロジック)
    if (filterStatus === 'confirmed') {
        const currentDaySpots = planSpots.filter(s => s.status === 'confirmed' && (s.day || 0) === selectedConfirmDay);
        
        if (selectedConfirmDay > 1) {
            const prevDayHotel = planSpots.find(s => 
                s.status === 'confirmed' && 
                s.day === selectedConfirmDay - 1 && 
                (s.is_hotel || isHotel(s.name))
            );
            if (prevDayHotel && !currentDaySpots.some(s => s.id === prevDayHotel.id)) {
                return [prevDayHotel, ...currentDaySpots];
            }
        }
        return currentDaySpots;
    } 
    
    // 3. 候補リスト (★並び替えロジックを追加)
    else if (filterStatus === 'candidate') {
        // フィルタリング: 「候補」または「確定したスポット（ホテル以外）」
        let candidateSpots = planSpots.filter(s => 
            s.status === 'candidate' || 
            (s.status === 'confirmed' && !s.is_hotel && !isHotel(s.name))
        );
        
        // エリア絞り込み
        if (selectedCandidateArea !== 'all') {
            candidateSpots = candidateSpots.filter(s => {
                // ★修正: 名寄せ後のエリア名と比較する
                if (groupingMode === 'city') {
                    const normalizedArea = normalizedCityMap.get(s.id) || extractCity(s);
                    return normalizedArea === selectedCandidateArea;
                } else {
                    return extractPrefecture(s) === selectedCandidateArea;
                }
            });
        }

        // ★ 並び替えロジック
        candidateSpots.sort((a, b) => {
            const aIsConfirmed = a.status === 'confirmed';
            const bIsConfirmed = b.status === 'confirmed';
            const aIsNew = isHighlighted(a);
            const bIsNew = isHighlighted(b);

            // ① 候補 vs 確定: 候補を上に
            if (!aIsConfirmed && bIsConfirmed) return -1;
            if (aIsConfirmed && !bIsConfirmed) return 1;

            // ② 候補同士の場合: 新着(黄色)を上に
            if (!aIsConfirmed && !bIsConfirmed) {
                if (aIsNew && !bIsNew) return -1;
                if (!aIsNew && bIsNew) return 1;
            }

            // ③ 確定同士、または上記以外: 新しい順(作成日時降順)
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });

        return candidateSpots;
    }
    
    // 4. 宿候補リスト (Dayごとの表示)
    else if (filterStatus === 'hotel_candidate') {
        spots = planSpots.filter(s => 
            s.status === 'hotel_candidate' || 
            (s.status === 'confirmed' && (s.is_hotel || isHotel(s.name)))
        );
        spots = spots.filter(s => (s.day || 0) === selectedHotelDay);
    }
    
    return spots;
  }, [planSpots, filterStatus, selectedConfirmDay, selectedCandidateArea, selectedHotelDay, groupingMode, lastVisited, normalizedCityMap]); 
  // ★重要: 依存配列の最後に normalizedCityMap を追加しました
  // ↑依存配列に lastVisited を追加して、既読時に並び順が更新されるようにします
// ▼▼▼ 修正: candidateAreas の生成ロジック ▼▼▼
  // ▼▼▼ 修正: candidateAreas の生成ロジック (確定スポットも含める) ▼▼▼
// ▼▼▼ 修正: candidateAreas の生成ロジック (確定スポットも含めるが、ホテルは除外) ▼▼▼
// ★追加: 全スポットを見てエリア名を「名寄せ」するロジック


// ★追加: 名寄せ後のエリアでグループ化（これが spotsByCity）
const spotsByCity = useMemo(() => {
    const groups: Record<string, any[]> = {};
    
    // 候補リストに表示すべきスポットのみを対象にする
    const targetSpots = planSpots.filter(s => 
        s.status === 'candidate' || 
        (s.status === 'confirmed' && !s.is_hotel && !isHotel(s.name))
    );

    targetSpots.forEach(spot => {
        // groupingModeが 'prefecture' なら県名、'city' なら名寄せ済みの市名を使う
        let area = "その他";
        if (groupingMode === 'prefecture') {
            area = extractPrefecture(spot);
        } else {
            // ★ここで508行目で定義した normalizedCityMap を参照します
            area = normalizedCityMap.get(spot.id) || extractCity(spot);
        }
        
        if (!groups[area]) groups[area] = [];
        groups[area].push(spot);
    });
    
    return groups;
}, [planSpots, normalizedCityMap, groupingMode]);

// ★修正: spotsByCity のキーを使ってエリアリストを生成
const candidateAreas = useMemo(() => {
    return Object.keys(spotsByCity).sort();
}, [spotsByCity]);

 // ▼▼▼ 修正: スポット追加時などに勝手にズームアウトしないように依存配列を変更 ▼▼▼
  useEffect(() => {
      // ピンフォーカス中（スポット選択中）なら、勝手に全体表示しない
      if (isFocusingSpotRef.current) return;

      if (currentTab === 'explore' && !isSearching && !selectedResult && map.current) {
          fitBoundsToSpots(filteredSpots);
      }
      // ★修正: エリア変更(selectedCandidateArea)やDay変更時にも発火するように依存配列を追加
  }, [filterStatus, currentTab, selectedCandidateArea, selectedConfirmDay, selectedHotelDay]);

  const handleStatusChangeClick = (spot: any, newStatus: string) => {
      // ▼▼▼ 修正: 以前は 'candidate' の場合に 0 にしていましたが、spot.day をそのまま維持するように変更
      const targetDay = spot.day; 
      
      if (newStatus !== 'confirmed' && newStatus !== spot.status) {
          // メッセージから「日付はリセットされます」を削除
          const msg = newStatus === 'hotel_candidate' 
            ? "宿リストに戻しますか？" 
            : "候補リストに戻しますか？";
            
          if (!confirm(msg)) return;
      }

      if (newStatus === 'confirmed') { 
          setSpotToAssignDay(spot); 
      } else { 
          // 維持した targetDay (spot.day) を渡す
          updateSpotStatus(spot, newStatus, targetDay); 
      }
  };

  const confirmSpotDay = async (day: number) => {
      if (!spotToAssignDay) return;
      await updateSpotStatus(spotToAssignDay, 'confirmed', day);
      setSpotToAssignDay(null);
      if(day > 0) setSelectedConfirmDay(day);
  };

  // ★追加: 日程を指定して複製（新規追加）を実行する関数
  const confirmDuplicateSpot = async (day: number) => {
      if (!spotToDuplicate) return;

      // addSpotを呼び出して新規追加（IDはaddSpot内で新しく生成されるため別物になる）
      await addSpot({
          name: spotToDuplicate.text || spotToDuplicate.name,
          description: spotToDuplicate.place_name || spotToDuplicate.description,
          coordinates: spotToDuplicate.center || spotToDuplicate.coordinates,
          image_url: spotToDuplicate.image_url,
          is_hotel: spotToDuplicate.is_hotel,
          status: 'confirmed', // 最初から確定にする
          day: day             // 指定したDayを入れる
      });

      setSpotToDuplicate(null);
      
      // 追加した日のリストを表示
      if (day > 0) {
          setFilterStatus('confirmed');
          setSelectedConfirmDay(day);
      }
  };
  // ★★★ 追加: ここに挿入してください ★★★
// ★修正: 名前での一致判定を削除し、IDでの厳密な判定にする
  const handleSpotUpdate = (updatedSpot: any) => {
      setPlanSpots(prev => prev.map(s => {
          // IDが存在し、かつ一致する場合のみ更新する
          if (s.id && String(s.id) === String(updatedSpot.id)) {
              return { ...s, ...updatedSpot };
          }
          // IDがない（一時的なスポット）場合のみ名前で判定するなどの救済措置を残すなら以下
          // if (!s.id && s.name === updatedSpot.name) return { ...s, ...updatedSpot };
          
          return s;
      }));
      
      // 選択中の詳細表示も更新
      if (selectedResult && String(selectedResult.id) === String(updatedSpot.id)) {
          setSelectedResult((prev: any) => ({ ...prev, ...updatedSpot }));
      }
  };
  // ★★★ 追加ここまで ★★★

// ... 既存のコード ...

  // ★修正: ステータス更新関数 (候補に戻す時にdayを0にする処理を追加)
  const updateSpotStatus = async (spot: any, newStatus: string, day: number = 0) => {
      // 楽観的UI更新
      setPlanSpots(prev => prev.map(s => {
          if (s.id === spot.id) {
              return { 
                  ...s, 
                  status: newStatus, 
                  day: newStatus === 'candidate' ? 0 : day // ★ここが重要: 候補なら0、確定なら指定日
              };
          }
          return s;
      }));

      // DB更新
      if (spot.id && !String(spot.id).startsWith('spot-') && !String(spot.id).startsWith('ai-')) {
          try {
              const updates: any = { status: newStatus };
              // 候補に戻す場合は day を 0 (未定) に、確定の場合は指定の day に更新
              if (newStatus === 'candidate') {
                  updates.day = 0;
              } else if (newStatus === 'confirmed') {
                  updates.day = day;
              }
              
              await supabase.from('spots').update(updates).eq('id', spot.id);
          } catch (e) {
              console.error("Status update failed", e);
          }
      }
  };

  // ... 既存のコード ...

// ★修正: Day変更時の処理（ID判定・通知・キャッシュ整合性を強化）
  const updateSpotDay = async (spot: any, newDay: number) => {
      if (!roomId || !spot.id) return;
      if (spot.day === newDay) return; // 変更がなければ終了
      
      const now = new Date().toISOString();

      // 1. 楽観的UI更新 (Optimistic Update)
      // IDが完全に一致するものだけを更新することで、同名の別スポットを巻き込まない
      setPlanSpots(prev => prev.map(s => {
          if (String(s.id) === String(spot.id)) {
              return { ...s, day: newDay, updated_at: now };
          }
          return s;
      }));

      // 2. 詳細モーダルを開いている場合、その表示も新しいDayに更新
      if (selectedResult && String(selectedResult.id) === String(spot.id)) { 
          setSelectedResult((prev: any) => ({ ...prev, day: newDay })); 
      }
      
      // 3. ユーザーへのフィードバック (通知)
      const dayLabel = newDay === 0 ? "未定リスト" : `Day ${newDay}`;
      setNotification({ 
          text: `「${spot.name}」を ${dayLabel} に移動しました`, 
          color: 'bg-indigo-600' 
      });
      setTimeout(() => setNotification(null), 3000);

      // 4. データベース更新
      const { error } = await supabase
          .from('spots')
          .update({ day: newDay, updated_at: now })
          .eq('id', spot.id); // 名前ではなくIDで指定
      
      if (error) { 
          console.error("Day update failed:", error); 
          // エラー時は強制リロードして整合性を保つ
          loadRoomData(roomId); 
      }
  };


  // ★追加: 検索履歴を保存するヘルパー関数
  const addToSearchHistory = (item: SearchHistoryItem) => {
      setSearchHistory(prev => {
          // 重複を除外 (IDまたは名前で一致する古いものを消す)
          const filtered = prev.filter(h => h.id !== item.id && h.name !== item.name);
          // 新しいものを先頭に追加し、最大10件に制限
          const newHistory = [item, ...filtered].slice(0, 10);
          localStorage.setItem('mapbox_search_history', JSON.stringify(newHistory));
          return newHistory;
      });
  };

  const handleToggleVote = async (spotId: string | number) => {
    if (!userName || !roomId) return alert("名前を入力してください");

    // 対象のスポット情報を特定
    const targetSpot = planSpots.find(s => String(s.id) === String(spotId));
    if (!targetSpot) return;

    const targetName = targetSpot.name;

    // ★重要: 同じ名前のスポットIDを全て取得する
    const sameNameSpots = planSpots.filter(s => s.name === targetName);
    const sameNameSpotIds = sameNameSpots.map(s => String(s.id));

    // 現在のスポットに対して自分が投票しているか確認
    const myVote = spotVotes.find(v => String(v.spot_id) === String(spotId) && v.user_name === userName && v.vote_type === 'like');
    const isLiking = !myVote; // 投票がないなら「いいね」する、あるなら「解除」する

    // 1. 楽観的UI更新
    if (isLiking) {
        // 全ての同名スポットに投票を追加
        const newVotes = sameNameSpots.map(s => ({
            id: `temp-${s.id}-${Date.now()}`,
            room_id: roomId,
            spot_id: s.id,
            user_name: userName,
            vote_type: 'like',
            created_at: new Date().toISOString()
        }));
        setSpotVotes(prev => [...prev, ...newVotes]);
    } else {
        // 全ての同名スポットから自分の投票を削除
        setSpotVotes(prev => prev.filter(v => 
            !(sameNameSpotIds.includes(String(v.spot_id)) && v.user_name === userName)
        ));
    }

    // 2. データベース更新 (並列実行)
    if (isLiking) {
        // まだ投票していないIDのみ抽出してINSERT
        // (既に投票済みのIDに対して重複投票しないようチェック)
        const votesToInsert = sameNameSpots
            .filter(s => !spotVotes.some(v => String(v.spot_id) === String(s.id) && v.user_name === userName))
            .map(s => ({
                room_id: roomId,
                spot_id: s.id,
                user_name: userName,
                vote_type: 'like'
            }));
            
        if (votesToInsert.length > 0) {
            await supabase.from('votes').insert(votesToInsert);
        }
    } else {
        // 同名のスポットIDに対する自分の投票を全て削除
        await supabase.from('votes')
            .delete()
            .eq('room_id', roomId)
            .eq('user_name', userName)
            .in('spot_id', sameNameSpotIds);
    }
  };

 // 2. handleSearch 関数を以下のように修正（880行目付近）
const handleSearch = async (overrideQuery?: string) => {
    const activeQuery = overrideQuery || query; 
    if(!activeQuery) return;

    // リクエストIDを発行・更新
    const currentRequestId = ++searchRequestId.current;

    setIsSearching(true);
    try {
        let results: any[] = [];
        
        // 1. ルーム内キャッシュ検索
        if (roomId) {
            const { data: cached } = await supabase.from('room_search_cache').select('*').eq('room_id', roomId).ilike('text', `%${activeQuery}%`).limit(5);
            if (cached && cached.length > 0) {
                const cachedResults = cached.map(item => ({ 
                    id: item.id, 
                    name: item.text, 
                    place_name: item.place_name || item.text, 
                    center: item.center, 
                    image_url: item.image_url, 
                    is_room_cache: true 
                }));
                results = [...cachedResults];
            }
        }

        // 2. メインの検索（バックエンド API）
        let queryParams = `query=${encodeURIComponent(activeQuery)}`;
        if (map.current) {
            const { lng, lat } = map.current.getCenter();
            queryParams += `&lat=${lat}&lng=${lng}`;
        }

        try {
            const res = await fetch(`${API_BASE_URL}/api/search_places?${queryParams}`);
            if (res.ok) {
                const data = await res.json();
                if (data.results && Array.isArray(data.results)) {
                    const newSuggestions = data.results.filter((s: any) => !results.some(r => r.name === s.name));
                    results = [...results, ...newSuggestions];
                }
            }
        } catch (e) {
            console.error("Backend search failed", e);
        }

        // ★★★ 3. フォールバック: キャッシュもバックエンドも「0件」だった場合のみMapbox APIを叩く ★★★
        if (results.length === 0 && MAPBOX_TOKEN) {
            try {
                const mapboxUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(activeQuery)}.json?access_token=${MAPBOX_TOKEN}&language=ja&country=jp&types=region,place,locality,neighborhood`;
                const mapboxRes = await fetch(mapboxUrl);
                if (mapboxRes.ok) {
                    const mapboxData = await mapboxRes.json();
                    if (mapboxData.features && mapboxData.features.length > 0) {
                        const placeResults = mapboxData.features.map((f: any) => ({
                            id: f.id,
                            name: f.text_ja || f.text,
                            place_name: f.place_name_ja || f.place_name,
                            center: f.center // [lng, lat]
                        }));
                        results = [...results, ...placeResults];
                    }
                }
            } catch (e) {
                console.error("Mapbox fallback search failed", e);
            }
        }
        // ★★★ 変更ここまで ★★★

        // 4. 最新のリクエストか確認してState更新
        if (currentRequestId === searchRequestId.current) {
            setSearchResults(results);
        }

    } catch (e) { 
        console.error("Search failed", e); 
    } finally { 
        // ローディング解除も、最新のリクエストの場合のみ行う
        if (currentRequestId === searchRequestId.current) {
            setIsSearching(false); 
        }
    }
};

  const showResultOnMap = (name: string, desc: string, center: number[], isSaved: boolean) => {
      if (!map.current) return;
      map.current.flyTo({ center: center as [number, number], zoom: 16, offset: [0, -150] });
      const el = document.createElement('div'); 
      el.innerHTML = `<div style="width:24px; height:24px; background:#EF4444; border:3px solid white; border-radius:50%; box-shadow:0 4px 10px rgba(239,68,68,0.4);"></div>`;
      const marker = new mapboxgl.Marker({ element: el }).setLngLat(center as [number, number]).addTo(map.current);
      searchMarkersRef.current.push(marker);
      setSelectedResult({ text: name, place_name: desc, center: center, is_saved: isSaved, voters: [] });
      setViewMode('selected');
      setIsEditingMemo(false);
      setEditCommentValue("");
      setEditLinkValue("");
      setIsEditingDesc(false);
  };

  const handleSelectSuggestion = async (suggestion: any) => {
    setSearchResults([]); setQuery(suggestion.name || suggestion.text);
    setIsFocused(false); 
    
    // パターンA: 既にキャッシュや履歴にあるものを選択した場合
    if (suggestion.is_room_cache) {
        const isSaved = planSpots.some(s => s.name === suggestion.name);
        showResultOnMap(suggestion.name, suggestion.place_name, suggestion.center, isSaved);
        if (suggestion.image_url) { setSelectedResult((prev: any) => ({ ...prev, image_url: suggestion.image_url })); }
        
        // ★履歴に追加（トップに移動）
        addToSearchHistory({
            id: suggestion.id || `cache-${Date.now()}`,
            name: suggestion.name || suggestion.text,
            place_name: suggestion.place_name || "",
            center: suggestion.center,
            timestamp: Date.now()
        });
        return;
    }
    
    if (suggestion.is_history && suggestion.center) {
        const isSaved = planSpots.some(s => s.name === suggestion.name);
        showResultOnMap(suggestion.name, suggestion.place_name, suggestion.center, isSaved);
        const img = await fetchSpotImage(suggestion.name);
        if(img) setSelectedResult((prev: any) => ({...prev, image_url: img}));

        // ★履歴を更新（トップに移動）
        addToSearchHistory({
            id: suggestion.id,
            name: suggestion.name,
            place_name: suggestion.place_name,
            center: suggestion.center,
            timestamp: Date.now()
        });
        return;
    }

    // パターンB: Mapboxの検索結果（新規）を選択した場合
    // ▼▼▼ 変更: Geoapifyの結果（新規）を選択した場合 ▼▼▼
    // Geoapify検索結果(suggestion)には既に center [lng, lat] が含まれているため、
    // APIを再度叩く必要がありません。そのまま表示します。
    try {
        const center = suggestion.center; // handleSearchでセットした [lon, lat]
        const name = suggestion.name;
        const address = suggestion.place_name;

        const isSaved = planSpots.some(s => s.name === name);
        showResultOnMap(name, address, center, isSaved);
        
        const img = await fetchSpotImage(name);
        if(img) setSelectedResult((prev: any) => ({...prev, image_url: img}));
        
        // 履歴に追加
        addToSearchHistory({
            id: suggestion.id || `geoapify-${Date.now()}`,
            name: name,
            place_name: address,
            center: center,
            timestamp: Date.now()
        });

        if (roomId) {
            await supabase.from('room_search_cache').insert({
                room_id: roomId, 
                text: name, 
                place_name: address, 
                center: center, 
                image_url: img || null, 
                mapbox_id: null // mapbox_idはないのでnull
            });
        }
    } catch(e) { 
        console.error(e);
        alert("詳細情報の取得に失敗しました"); 
    }
    // ▲▲▲ 変更ここまで ▲▲▲
  };

  useEffect(() => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) { setSessionToken(crypto.randomUUID()); } 
    else { setSessionToken(Math.random().toString(36).substring(2)); }
    const savedHistory = localStorage.getItem('mapbox_search_history');
    if (savedHistory) { try { setSearchHistory(JSON.parse(savedHistory)); } catch (e) {} }
  }, []);

  useEffect(() => {
    setIsAuthLoading(true);
    if (roomId) {
      const savedName = localStorage.getItem(`route_hacker_user_${roomId}`);
      if (savedName) { setUserName(savedName); setIsJoined(true); } else { setIsJoined(false); }
    } else { setIsJoined(false); setUserName(""); }
    setIsAuthLoading(false);
  }, [roomId]);

 
   

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => { if (query.trim()) { handleSearch(); } else { setSearchResults([]); } }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [query]);

  useEffect(() => {
    if (currentTab === 'explore' && map.current) { setTimeout(() => { map.current?.resize(); fitBoundsToSpots(planSpots); }, 100); }
  }, [currentTab]);


// Whoo風 右端スワイプでのズーム機能 + UI連動
  // --- page.tsx 1310行目付近 ---

// --- page.tsx 1310行目付近 ---
// page.tsx 1310行目付近
useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
        // ★追加: exploreタブ（地図画面）以外ではズーム機能を無効化する
        if (currentTab !== 'explore' || selectedResult) return;
        // 1本指以外の操作、または「かこって検索」中は無視
        if (e.touches.length !== 1 || isDrawing) return;

        const touch = e.touches[0];
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        const edgeThreshold = 60; 

        // リスト（ボトムシート）が表示されているエリアか判定
        if (filterStatus !== 'all') {
            const sheetTop = screenHeight - sheetHeight;
            if (touch.clientY > sheetTop) return;
        }

        const isRight = touch.clientX > screenWidth - edgeThreshold;
        const isLeft = touch.clientX < edgeThreshold;

        if (isRight || isLeft) {
            rightEdgeGestureRef.current = {
                isActive: true,
                startY: touch.clientY,
                startZoom: map.current?.getZoom() || 14
            };
            
            setZoomSide(isRight ? 'right' : 'left');
            setShowZoomUI(true);
            
            if (zoomKnobRef.current) {
                zoomKnobRef.current.style.transform = `translateY(${touch.clientY}px)`;
            }

            if (navigator.vibrate) navigator.vibrate(10);
        }
    };

    const onTouchMove = (e: TouchEvent) => {
        // isActive が false（explore以外で開始した場合など）なら何もしない
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

    window.addEventListener('touchstart', onTouchStart, { passive: false });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchEnd);

    return () => {
        window.removeEventListener('touchstart', onTouchStart);
        window.removeEventListener('touchmove', onTouchMove);
        window.removeEventListener('touchend', onTouchEnd);
        window.removeEventListener('touchcancel', onTouchEnd);
    };
    // ★依存配列に currentTab を追加するのを忘れずに！
}, [isDrawing, isAuthLoading, isJoined, filterStatus, sheetHeight, currentTab, selectedResult]); // ← selectedResult を追加

  // ★修正: 詳細画面を開いている時のリアルタイム同期もID優先にする
  useEffect(() => {
    if (selectedResult && roomId) {
      // 【修正点】ここも名前検索(text)ではなく、IDでの一致を最優先にする
      let currentSpot = null;
      if (selectedResult.id) {
          currentSpot = planSpots.find(s => String(s.id) === String(selectedResult.id));
      }
      if (!currentSpot) {
          currentSpot = planSpots.find(s => s.name === selectedResult.text);
      }
      // 見つからなければ今の表示を維持
      currentSpot = currentSpot || selectedResult;

      const spotId = currentSpot.id || selectedResult.id;
      const voters = spotVotes.filter(v => String(v.spot_id) === String(spotId) && v.vote_type === 'like').map(v => v.user_name);
      const uniqueVoters = Array.from(new Set(voters));
      
      // 保存済み判定もID優先で
      const isSaved = planSpots.some(s => s.id ? String(s.id) === String(spotId) : s.name === selectedResult.text);

      if (isSaved && currentSpot && !isEditingMemo) {
          if (currentSpot.comment !== editCommentValue) setEditCommentValue(currentSpot.comment || "");
          if (currentSpot.link !== editLinkValue) setEditLinkValue(currentSpot.link || "");
          const currentPrice = currentSpot.price ?? currentSpot.cost ?? "";
          if (String(currentPrice) !== String(editPriceValue)) setEditPriceValue(String(currentPrice));
      }

      setSelectedResult((prev: any) => ({
        ...prev,
        id: currentSpot.id || prev.id, 
        voters: uniqueVoters,
        is_saved: isSaved,
        comment: currentSpot.comment,
        link: currentSpot.link,
        day: currentSpot.day || 0, // ここで正しいDayが反映されるようになる
        status: currentSpot.status || 'candidate',
        price: currentSpot.price // priceも同期
      }));
    }
  }, [spotVotes, planSpots, isEditingMemo]);

  const saveToRoomHistory = (id: string, name: string) => {
    if (typeof window === 'undefined') return;
    try {
        const historyStr = localStorage.getItem('rh_room_history') || '[]';
        const history: { id: string, name: string, lastVisited: number }[] = JSON.parse(historyStr);
        const filtered = history.filter(h => h.id !== id);
        filtered.unshift({ id, name: name || '名無しの旅', lastVisited: Date.now() });
        const trimmed = filtered.slice(0, 10);
        localStorage.setItem('rh_room_history', JSON.stringify(trimmed));
    } catch (e) { console.error("Failed to save room history", e); }
  };

  // ---------------------------------------------------------
  // ▼▼▼ 修正対象：loadRoomData と useEffect を正しい形に直す ▼▼▼
  // ---------------------------------------------------------

const loadRoomData = async (id: string) => {
    // 1. ルーム情報の取得
    const { data: roomData } = await supabase.from('rooms').select('*').eq('id', id).single();
    
    // 2. 取得したデータをStateに反映
    if (roomData) { 
        saveToRoomHistory(id, roomData.name); 

        // ★追加: 旅行名(name) をStateにセット
        if (roomData.name) setRoomName(roomData.name);

        if (roomData.start_date) setStartDate(roomData.start_date);
        if (roomData.end_date) setEndDate(roomData.end_date);
        if (roomData.adult_num) setAdultNum(roomData.adult_num);
    } else { 
        saveToRoomHistory(id, 'Unknown Trip'); 
    }
    // ... (続きはそのまま)

    // 3. スポット一覧の取得
    const { data: spots } = await supabase.from('spots').select('*').eq('room_id', id).order('order', { ascending: true });
    
    // 4. 投票データの取得
    const { data: allVotes } = await supabase.from('votes').select('*').eq('room_id', id);

    if (spots) {
      setPlanSpots(spots);
      // マップの範囲調整
      if (currentTab === 'explore' && !isSearching && !selectedResult) { fitBoundsToSpots(spots); }
    }
    if (allVotes) setSpotVotes(allVotes);
  };
  // ★重要：ここで loadRoomData 関数を閉じる

  // ▼▼▼ ここから useEffect (関数の外に配置) ▼▼▼
  // page.tsx

// ---------------------------------------------------------
  // ▼▼▼ 修正: リアルタイム・低コスト同期ロジック ▼▼▼
  // ---------------------------------------------------------
  // リアルタイム同期 & 低コスト更新ロジック
 // リアルタイム同期 & 低コスト更新ロジック
  // ... (前略)

  // リアルタイム同期 & 低コスト更新ロジック
  useEffect(() => {
    if (!roomId || !isJoined) return;

    // 初回ロード
    loadRoomData(roomId);

    console.log("🚀 Realtime subscription starting for room:", roomId);

    const channel = supabase.channel('room_updates')
        // 1. スポットの変更監視
        .on('postgres_changes', { event: '*', schema: 'public', table: 'spots', filter: `room_id=eq.${roomId}` }, (payload) => {
            console.log("🔔 Spot change received:", payload.eventType, payload.new); 

            const { eventType, new: newRecord, old: oldRecord } = payload;

            setPlanSpots(prev => {
                let nextSpots = [...prev];

                if (eventType === 'INSERT') {
                    const tempIndex = nextSpots.findIndex(s => 
                        String(s.id).startsWith('temp-') && 
                        s.name === newRecord.name
                    );

                    if (tempIndex !== -1) {
                        nextSpots[tempIndex] = newRecord;
                    } else if (!nextSpots.some(s => s.id === newRecord.id)) {
                        nextSpots.push(newRecord);
                    }
                } 
                else if (eventType === 'UPDATE') {
                    const index = nextSpots.findIndex(s => s.id === newRecord.id);
                    if (index !== -1) {
                        const oldSpot = nextSpots[index];
                        
                        // ▼▼▼ 修正: 住所自動修正の判定を強化 ▼▼▼
                        // 「元が住所不明/調査中/空」かつ「新しいデータで住所が入った」場合
                        const isAutoAddressFix = (
                            (!oldSpot.description || oldSpot.description.includes('住所調査中') || oldSpot.description === '住所不明') &&
                            (newRecord.description && !newRecord.description.includes('住所調査中') && newRecord.description !== '住所不明')
                        );

                        // 更新データをコピーを作成してから操作する
                        const recordToApply = { ...newRecord };

                        if (isAutoAddressFix) {
                            // ここで強制的に「古い更新日時」で上書きし、新着/未読判定（黄色表示）を回避する
                            recordToApply.updated_at = oldSpot.updated_at;
                            // デバッグ用（必要なければ削除可）
                            console.log("🙈 住所自動修正のため、新着バッジを回避しました");
                        }
                        // ▲▲▲ 修正ここまで ▲▲▲

                        nextSpots[index] = { ...nextSpots[index], ...recordToApply };
                    }
                }
                else if (eventType === 'DELETE') {
                    nextSpots = nextSpots.filter(s => s.id !== oldRecord.id);
                }

                return nextSpots.sort((a, b) => (a.order || 0) - (b.order || 0));
            });
        })
        
        // ... (後略: 投票やルーム情報の監視はそのまま)
        
        // 2. 投票の変更監視
        .on('postgres_changes', { event: '*', schema: 'public', table: 'votes', filter: `room_id=eq.${roomId}` }, (payload) => {
            console.log("🗳 Vote change:", payload.eventType);
            const { eventType, new: newRecord, old: oldRecord } = payload; // payload.new が正しい

            if (eventType === 'INSERT') {
                setSpotVotes(prev => {
                    if (prev.some(v => v.id === newRecord.id)) return prev;
                    return [...prev, newRecord];
                });
            } else if (eventType === 'UPDATE') {
                setSpotVotes(prev => prev.map(v => v.id === newRecord.id ? newRecord : v));
            } else if (eventType === 'DELETE') {
                setSpotVotes(prev => prev.filter(v => v.id !== oldRecord.id));
            }
        })

       // 3. 旅行設定の変更監視
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (payload) => {
            const newData = payload.new;
            if (newData.name) setRoomName(newData.name);
            if (newData.start_date) setStartDate(newData.start_date);
            if (newData.end_date) setEndDate(newData.end_date);
            if (newData.adult_num) setAdultNum(newData.adult_num);
        })
        // ★重要: ここに .subscribe() を追加！これがないと動きません
        .subscribe((status) => {
            console.log("📡 Subscription status:", status);
        });

      return () => { 
          console.log("🔌 Unsubscribing...");
          supabase.removeChannel(channel); 
      };
  }, [roomId, isJoined]);

  // ---------------------------------------------------------
  // ▲▲▲ 修正完了 ▲▲▲
  // ---------------------------------------------------------

  const fitBoundsToSpots = (spots: any[]) => {
      if (!map.current || spots.length === 0) return;
      const bounds = new mapboxgl.LngLatBounds();
      let hasValidCoords = false;
      spots.forEach((spot: any) => {
          if (spot.coordinates && Array.isArray(spot.coordinates) && spot.coordinates.length === 2) {
              bounds.extend(spot.coordinates as [number, number]);
              hasValidCoords = true;
          }
      });
      if (hasValidCoords) { map.current.fitBounds(bounds, { padding: { top: 150, bottom: 200, left: 40, right: 40 }, maxZoom: 15, duration: 1000 }); }
  };

  

  const handleNopeCandidate = (spot: any) => {
    setNopedHistory(prev => [...prev, spot.name]);
    setCandidates(prev => prev.filter(s => s.id !== spot.id));
  };
// 即時反映（楽観的UI）対応版の addSpot
  const addSpot = async (spot: any) => {
    // 重複チェック
    //if (planSpots.some(s => s.name === spot.name && s.room_id === roomId)) {
      //alert("このスポットは既に追加されています");
      //return;
    //}
const now = new Date().toISOString(); // ★現在時刻

// ★追加: 既存の同名スポットがあれば、メモ・リンク・金額・画像を引き継ぐ
    const existingSpot = planSpots.find(s => s.name === spot.name);
    // データベースに送るデータを作成
   // データベースに送るデータを作成
    const newSpotPayload = {
      room_id: roomId,
      name: spot.name,
      description: spot.description,
      coordinates: spot.coordinates,
      order: planSpots.length,
      added_by: userName,
      votes: 0,
      image_url: spot.image_url,
      is_hotel: spot.is_hotel || false,
      status: spot.status || 'candidate',
      day: spot.day || 0,
      // ▼▼▼ 修正後: 追加元の金額やURLデータをしっかり引き継ぎ、重複を排除 ▼▼▼
      price: spot.price || existingSpot?.price || null,
      url: spot.url || existingSpot?.url || "",
      rating: spot.rating || existingSpot?.rating || 0,
      detailed_ratings: spot.detailed_ratings || existingSpot?.detailed_ratings || null, 
      created_at: now,
      updated_at: now
    };

    // ★重要: ここで先にローカルStateに追加してしまう (仮IDを持たせる)
    // これにより、DBの応答を待たずに画面に反映されます
    const optimisticSpot = { ...newSpotPayload, id: `temp-${Date.now()}` };
    setPlanSpots(prev => [...prev, optimisticSpot]);


    // ▼▼▼ ここから追加 ▼▼▼
    if (isTrial) {
        // 初めて追加した時だけポップアップを表示
        if (!hasShownTrialPopup.current) {
            setTimeout(() => setShowTrialPopup(true), 800); // 少し遅らせて出すと自然です
            hasShownTrialPopup.current = true;
        }
        resetSearchState(); 
        setQuery(""); 
        setNotification({ text: `「${spot.name}」を追加しました（お試し中）`, color: 'bg-black' });
        setTimeout(() => setNotification(null), 3000);
        return; // ★DB保存処理には進まず終了
    }
    // ▲▲▲ ここまで追加 ▲▲▲

    // DBに追加
    const { data, error } = await supabase.from('spots').insert([newSpotPayload]).select().single();
    
    if (error) {
      console.error("Add spot error:", error);
      alert("追加に失敗しました");
      // エラー時はロールバック（追加した仮スポットを消す）
      setPlanSpots(prev => prev.filter(s => s.id !== optimisticSpot.id));
      return;
    }
    
    // DB登録成功後、仮IDのスポットを正式なデータ(ID付き)に置き換える
    if (data) { 
       // ▼▼▼ ここから置換 ▼▼▼
        setPlanSpots(prev => prev.map(s => {
            if (s.id === optimisticSpot.id) {
                // バックグラウンド更新の競合対策
                // もしDB登録中に fetchSpotInfo が完了してローカルの住所が更新されていた場合、
                // DBから返ってきた古いデータ(data)ではなく、ローカルの最新情報(s)を採用する
                if (s.description !== optimisticSpot.description && s.description !== "住所調査中...") {
                     const mergedData = { ...data, description: s.description, comment: s.comment, image_url: s.image_url };
                     
                     // DB側も最新情報で即座に更新しておく
                     if (roomId) {
                         supabase.from('spots').update({
                             description: s.description,
                             comment: s.comment,
                             image_url: s.image_url
                         }).eq('id', data.id).then();
                     }
                     return mergedData;
                }
                // 変更がなければDBのデータをそのまま使う
                return data;
            }
            return s;
        }));
        // ▲▲▲ 置換ここまで ▲▲▲

        // 自分が追加したものは自動で「いいね」
       // ★追加: 自分が追加したものは自動で「いいね」するが、
        // ここでも「同名共有」のロジックを一応意識しておく（handleToggleVote任せでも良いが念のため）
        if (userName) {
             const { data: voteData } = await supabase.from('votes').insert({ 
                room_id: roomId, 
                spot_id: data.id, 
                user_name: userName, 
                vote_type: 'like' 
            }).select().single();
            if (voteData) { setSpotVotes(prev => [...prev, voteData]); }
        }

        // 状態のリセット
        resetSearchState(); 
        setQuery(""); 
        setSessionToken(Math.random().toString(36)); 
        setEditCommentValue("");
        setEditLinkValue("");
        setIsEditingMemo(false);

        // 通知
        const displayStatus = data.status === 'confirmed' ? '確定' : (data.status === 'hotel_candidate' ? '宿リスト' : '候補');
        const dayText = data.day > 0 ? ` (Day ${data.day})` : '';
        setNotification({ text: `「${spot.name}」を${displayStatus}に追加しました${dayText}`, color: 'bg-black' });
        setTimeout(() => setNotification(null), 3000);
    }
  };

  // addSpot を使って保存処理を行う関数
  const handleLikeCandidate = async (spot: any) => {
    setLikedHistory(prev => [...prev, spot.name]);
    setCandidates(prev => prev.filter(s => s.id !== spot.id));
    // ここで新しい addSpot を呼び出すことで即時反映されます
    await addSpot({ ...spot, status: 'candidate' });
  };
 

 // ★修正: 削除処理もIDで厳密に判定する
  const removeSpot = async (spot: any) => {
    if (!roomId) return;
    if (!spot.id) return; 
    
    // 確認メッセージ
    if (!confirm(`本当に「${spot.name || spot.text}」をリストから削除しますか？`)) return;

    const targetId = String(spot.id);

    // 1. ローカルStateから削除 (ID不一致のものだけ残す)
    setPlanSpots(prev => prev.filter(s => String(s.id) !== targetId));

    // 2. 削除対象を閲覧中だった場合、詳細モーダルを閉じる
    if (selectedResult && String(selectedResult.id) === targetId) {
        setSelectedResult(null);
        setViewMode('default');
    }

    // 3. データベースから削除
    // (一時IDやAI提案IDでない場合のみDB削除を実行)
    if (!targetId.startsWith('temp-') && !targetId.startsWith('ai-')) {
        await supabase.from('spots').delete().eq('id', spot.id);
    }
  };

  const updateSpots = (newSpots: any[]) => { setPlanSpots(newSpots); };

  const resetSearchState = () => {
    setSearchResults([]); 
    setSelectedResult(null); 
    setViewMode('default'); 
    searchMarkersRef.current.forEach(marker => marker.remove()); 
    searchMarkersRef.current = []; 
    setIsEditingDesc(false); 
    setIsFocused(false);
    // ★追加: 入力内容をクリア
    setQuery("");
    // ★追加: フォーカスRefをリセット
    focusedSpotIdRef.current = null;
  };
// page.tsx の handlePreviewSpot 関数の近くに追加

// ★修正: リストの「地図ボタン」でも赤ピンを表示し、フォーカス状態を同期する




  const handleModalTouchMove = (e: React.TouchEvent) => {
      if (!isModalDragging) return;
      const currentY = e.touches[0].clientY;
      const delta = currentY - modalDragStartRef.current;
      
      // 下方向（プラス）への移動のみ許可
      if (delta > 0) {
          // e.preventDefault(); // 必要に応じて有効化
          setModalDragY(delta);
      }
  };

 const handleModalTouchEnd = () => {
      setIsModalDragging(false);
      
      // 100px以上スワイプしたら閉じる
      if (modalDragY > 100) {
          setSelectedResult(null);
          setViewMode('default');
      }
      
      // 位置をリセット
      setModalDragY(0);
  };

  // ★修正: ここに定義（handlePreviewSpotの外）
  const handleModalTouchStart = (e: React.TouchEvent) => {
      modalDragStartRef.current = e.touches[0].clientY;
      setIsModalDragging(true);
  };

  // ★修正: handlePreviewSpot の定義（余計な focusSpotInList 定義を削除）
  // ★修正: ID優先で特定するロジックに変更
 // ★修正: 詳細を開く際、IDが一致するものを最優先で探す
  const handlePreviewSpot = (spot: any, openMemo: boolean = false) => {
    setCurrentTab('explore');
    focusedSpotIdRef.current = String(spot.id);
    
    // 【重要】まずIDで完全一致するスポットを探す
    let dbSpot = null;
    if (spot.id) {
        dbSpot = planSpots.find(s => String(s.id) === String(spot.id));
    }
    // 見つからない場合のみ名前で探す（救済措置）
    if (!dbSpot) {
        dbSpot = planSpots.find(s => s.name === spot.name);
    }
    
    const sourceSpot = dbSpot || spot;

    // ... (以下変更なし)
    const isSaved = planSpots.some(s => s.id ? String(s.id) === String(sourceSpot.id) : s.name === sourceSpot.name);
    const spotId = sourceSpot.id; 
    const voters = spotVotes.filter(v => String(v.spot_id) === String(spotId) && v.vote_type === 'like').map(v => v.user_name);
    const uniqueVoters = Array.from(new Set(voters));
    
    if (!sourceSpot.image_url && !attemptedImageFetch.current.has(sourceSpot.id)) {
        fetchSpotImage(sourceSpot.name).then(url => {
            if (url) {
                setPlanSpots(prev => prev.map(s => s.id === sourceSpot.id ? { ...s, image_url: url } : s));
                if(roomId && sourceSpot.id) supabase.from('spots').update({ image_url: url }).eq('id', sourceSpot.id).then();
            }
        });
    }

    setEditCommentValue(sourceSpot.comment || "");
    setEditLinkValue(sourceSpot.link || "");
    setEditPriceValue(sourceSpot.price ?? sourceSpot.cost ?? "");
    
    setIsEditingMemo(openMemo);

    const previewData = { 
        ...sourceSpot, 
        id: sourceSpot.id, // IDを確実に渡す
        text: sourceSpot.name, 
        place_name: sourceSpot.description, 
        center: sourceSpot.coordinates || sourceSpot.center,
        is_saved: isSaved, 
        voters: uniqueVoters, 
        added_by: sourceSpot.added_by, 
        image_url: sourceSpot.image_url, 
        comment: sourceSpot.comment, 
        link: sourceSpot.link, 
        day: sourceSpot.day || 0, 
        status: sourceSpot.status || 'candidate',
        is_hotel: sourceSpot.is_hotel,
        price: sourceSpot.price 
    };

    setSelectedResult(previewData);
    setViewMode('selected');
    setIsEditingDesc(false);
    
    if (map.current && sourceSpot.coordinates) {
        searchMarkersRef.current.forEach(marker => marker.remove());
        searchMarkersRef.current = [];
        const el = document.createElement('div'); 
        el.innerHTML = `<div style="width:24px; height:24px; background:#EF4444; border:3px solid white; border-radius:50%; box-shadow:0 4px 10px rgba(239,68,68,0.4);"></div>`;
        const marker = new mapboxgl.Marker({ element: el }).setLngLat(sourceSpot.coordinates).addTo(map.current);
        searchMarkersRef.current.push(marker);
        setTimeout(() => { if (map.current) { map.current?.resize(); } }, 300);
    }
  };

  // ★修正: focusSpotInList をここに定義（handlePreviewSpotの後）
  const focusSpotInList = (spot: any) => {
    // 1. Refを使って判定（2回目タップなら詳細表示）
    if (focusedSpotIdRef.current === String(spot.id)) {
        handlePreviewSpot(spot);
        return;
    }

    focusedSpotIdRef.current = String(spot.id);
    isFocusingSpotRef.current = true;

    // --- ステータス判定 ---
    const isSpotHotel = spot.is_hotel || isHotel(spot.name);
    let targetStatus: FilterStatus = 'candidate';
    let targetDay = spot.day || 0;

    if (filterStatus === 'candidate') {
        const canShowInCandidate = spot.status === 'candidate' || (spot.status === 'confirmed' && !isSpotHotel);
        if (canShowInCandidate) {
            targetStatus = 'candidate';
        } else {
            if (spot.status === 'confirmed') targetStatus = 'confirmed';
            else if (spot.status === 'hotel_candidate') targetStatus = 'hotel_candidate';
        }
    } else {
        if (spot.status === 'confirmed') targetStatus = 'confirmed';
        else if (spot.status === 'hotel_candidate') targetStatus = 'hotel_candidate';
        else targetStatus = 'candidate';
    }

    setFilterStatus(targetStatus);

    // --- Day・エリアの維持判定 ---
    if (targetStatus === 'confirmed') {
        setSelectedConfirmDay(targetDay);
    } else if (targetStatus === 'hotel_candidate') {
        setSelectedHotelDay(targetDay);
    } else if (targetStatus === 'candidate') {
        const spotArea = getSpotArea(spot, groupingMode);
        const isVisibleInCurrentArea = (selectedCandidateArea === 'all') || (selectedCandidateArea === spotArea);
        if (!isVisibleInCurrentArea) {
            setSelectedCandidateArea(spotArea);
        }
    }

    // --- 高さ制御 ---
    const MIN_OPEN_HEIGHT = 260;
    const currentHeight = sheetHeightRef.current;
    if (currentHeight < MIN_OPEN_HEIGHT) {
        setSheetHeight(MIN_OPEN_HEIGHT); 
    }

    // --- マーカー表示 ---
    if (map.current && spot.coordinates) {
        searchMarkersRef.current.forEach(marker => marker.remove());
        searchMarkersRef.current = [];
        
        const el = document.createElement('div');
        el.innerHTML = `<div style="width:24px; height:24px; background:#EF4444; border:3px solid white; border-radius:50%; box-shadow:0 4px 10px rgba(239,68,68,0.4);"></div>`;
        
        // 赤ピンをクリックしたら詳細を開く
        el.onclick = (e) => {
            e.stopPropagation();
            handlePreviewSpot(spot);
        };

        const marker = new mapboxgl.Marker({ element: el })
            .setLngLat(spot.coordinates)
            .addTo(map.current);
        
        searchMarkersRef.current.push(marker);
    }

    // --- スクロール処理 ---
    setTimeout(() => {
        const container = timelineListRef.current;
        const element = document.getElementById(`spot-item-${spot.id}`);
        
        if (container && element) {
            // 確定リストの時だけ詰める、それ以外は余白を持つ
            const offset = targetStatus === 'confirmed' ? 0 : 80;
            const topPos = element.offsetTop - offset;
            container.scrollTo({ top: topPos, behavior: 'smooth' });
            
            element.classList.add('ring-2', 'ring-red-500', 'bg-red-50');
            setTimeout(() => {
                element.classList.remove('ring-2', 'ring-red-500', 'bg-red-50');
            }, 2000);
        }
        
        setTimeout(() => { isFocusingSpotRef.current = false; }, 1000);
    }, 250); 
  };

  // ★修正: handleLocateOnMap をここに定義
  const handleLocateOnMap = (e: React.MouseEvent, spot: any) => {
    e.stopPropagation(); 
    if (!map.current || !spot.coordinates) return;

    focusedSpotIdRef.current = String(spot.id);

    map.current.flyTo({
        center: spot.coordinates as [number, number],
        zoom: 16,
        offset: [0, -150] 
    });

    searchMarkersRef.current.forEach(marker => marker.remove());
    searchMarkersRef.current = [];
    
    const el = document.createElement('div');
    el.innerHTML = `<div style="width:24px; height:24px; background:#EF4444; border:3px solid white; border-radius:50%; box-shadow:0 4px 10px rgba(239,68,68,0.4);"></div>`;
    
    el.onclick = (e) => {
        e.stopPropagation();
        handlePreviewSpot(spot);
    };

    const marker = new mapboxgl.Marker({ element: el })
        .setLngLat(spot.coordinates)
        .addTo(map.current);
    
    searchMarkersRef.current.push(marker);

    if (navigator.vibrate) navigator.vibrate(10);
  };

  const handleAutoSearch = (keyword: string) => { setQuery(keyword); setCurrentTab('explore'); };
  const handleSearchFromChat = (keyword: string) => { setCurrentTab('explore'); setQuery(keyword); setIsFocused(true); setTimeout(() => { handleSearch(keyword); }, 300); };
  
  const handleReceiveCandidates = (newCandidates: any[]) => {
      const spotsWithIds = newCandidates.map((s) => ({ ...s, id: `ai-suggest-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, status: 'candidate' }));
      setCandidates(spotsWithIds);
  };

 const handleSaveMemo = async () => {
      if (!selectedResult || !roomId) return;
      
      const priceVal = editPriceValue === "" ? null : parseInt(editPriceValue, 10);
      const targetName = selectedResult.text || selectedResult.name; // ★名前を取得

      // 1. ローカルStateの更新（名前が一致するものを全て更新）
      setPlanSpots(prev => prev.map(s => {
          if (s.name === targetName) {
              return { 
                  ...s, 
                  comment: editCommentValue, 
                  link: editLinkValue,
                  price: priceVal 
              };
          }
          return s;
      }));

      // 詳細モーダル自身の表示も更新
      setSelectedResult((prev: any) => ({ 
          ...prev, 
          comment: editCommentValue, 
          link: editLinkValue,
          price: priceVal 
      }));
      
      setIsEditingMemo(false);

      // 2. データベースの更新（ルームID と 名前 で一括更新）
      // これにより、Dayが違っても同じ名前なら全て書き換わります
      await supabase.from('spots')
          .update({ 
              comment: editCommentValue, 
              link: editLinkValue,
              price: priceVal 
          })
          .eq('room_id', roomId)
          .eq('name', targetName);
  };

  const handleSaveDescription = () => {
      if (!selectedResult) return;
      const updated = { ...selectedResult, place_name: editDescValue };
      setSelectedResult(updated);
      setIsEditingDesc(false);
  };
  // 旅行設定モーダルの「保存して閉じる」ボタンのonClick処理を修正

 // 旅行設定モーダルの「保存して閉じる」ボタンの処理
 const handleSaveSettings = async () => {
      if (!roomId) {
          setShowDateModal(false);
          return;
      }

      // ★修正: name を追加し、adult_num の0対策を入れる
      const { error } = await supabase.from('rooms').update({
          name: roomName || "無題の旅行", // 空ならデフォルト
          start_date: startDate,
          end_date: endDate,
          adult_num: adultNum > 0 ? adultNum : 1 // 0なら1に戻す
      }).eq('id', roomId);

      if (error) {
          console.error("Settings update failed", error);
          alert("設定の保存に失敗しました");
      } else {
          setShowDateModal(false);
      }
  };

  const getIconForSuggestion = (item: any) => {
    if (item.is_room_cache) return <Database size={16} className="text-blue-500 mt-0.5 shrink-0" />;
    if (item.is_history) return <History size={16} className="text-gray-600 mt-0.5 shrink-0" />;
    return <MapIcon size={16} className="text-gray-600 mt-0.5 shrink-0" />;
  };

  

  const updateDrawSource = (coords: number[][]) => {
      if (!map.current) return;
      const source: any = map.current.getSource('draw-source');
      if (source) { source.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }); }
  };

  const startDrawing = () => {
    tempDrawCoords.current = [];
    updateDrawSource([]);
    setIsDrawing(true);
    if (map.current) {
        map.current.dragPan.disable();
        map.current.getCanvas().style.cursor = 'crosshair';
    }
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    tempDrawCoords.current = [];
    updateDrawSource([]);
    if (map.current) {
        map.current.dragPan.enable();
        map.current.getCanvas().style.cursor = '';
        map.current.off('touchstart', onTouchStart);
        map.current.off('touchmove', onTouchMove);
        map.current.off('touchend', onTouchEnd);
        map.current.off('mousedown', onMouseDown);
        map.current.off('mousemove', onMouseMove);
        map.current.off('mouseup', onMouseUp);
    }
  };

 const finishDrawing = () => {
    const coords = tempDrawCoords.current;
    if (coords.length < 2) { stopDrawing(); return; }
    
    // 座標計算ロジック
    let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;
    coords.forEach(c => { const [lng, lat] = c; if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng; if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat; });
    const centerLat = (minLat + maxLat) / 2; const centerLng = (minLng + maxLng) / 2;
    
    // 半径計算
    let radiusKm = (calculateDistance(centerLat, centerLng, maxLat, maxLng) / 2) * 1.1;
    if (radiusKm < 0.1) radiusKm = 0.5; 
    if (radiusKm > 5.0) radiusKm = 5.0; 
    
    // ▼▼▼ 修正: polygonプロパティに座標配列(coords)を渡す ▼▼▼
    setInitialSearchArea({ 
        latitude: centerLat, 
        longitude: centerLng, 
        radius: Number(radiusKm.toFixed(2)),
        polygon: coords 
    });
    
    stopDrawing();
    setCurrentTab('agent');
  };

  useEffect(() => {
    if (isDrawing) { stopDrawing(); }
    if (currentTab !== 'agent') { setInitialSearchArea(null); }
  }, [currentTab]);

  const onTouchStart = (e: any) => { if (!isDrawing) return; if (e.originalEvent.touches && e.originalEvent.touches.length > 1) return; if (e.originalEvent) e.originalEvent.preventDefault(); tempDrawCoords.current = [[e.lngLat.lng, e.lngLat.lat]]; updateDrawSource(tempDrawCoords.current); };
  const onTouchMove = (e: any) => { if (!isDrawing) return; if (e.originalEvent.touches && e.originalEvent.touches.length > 1) return; if (e.originalEvent) e.originalEvent.preventDefault(); tempDrawCoords.current.push([e.lngLat.lng, e.lngLat.lat]); updateDrawSource(tempDrawCoords.current); };
  const onTouchEnd = (e: any) => { if (!isDrawing) return; if (tempDrawCoords.current.length > 0) { finishDrawing(); } };
  const onMouseDown = (e: any) => { if (!isDrawing) return; tempDrawCoords.current = [[e.lngLat.lng, e.lngLat.lat]]; updateDrawSource(tempDrawCoords.current); };
  const onMouseMove = (e: any) => { if (!isDrawing) return; if (tempDrawCoords.current.length === 0) return; tempDrawCoords.current.push([e.lngLat.lng, e.lngLat.lat]); updateDrawSource(tempDrawCoords.current); };
  const onMouseUp = () => { if (!isDrawing) return; if (tempDrawCoords.current.length > 0) finishDrawing(); };

  useEffect(() => {
    if (!map.current) return;
    if (isDrawing) {
        map.current.on('touchstart', onTouchStart);
        map.current.on('touchmove', onTouchMove);
        map.current.on('touchend', onTouchEnd);
        map.current.on('mousedown', onMouseDown);
        map.current.on('mousemove', onMouseMove);
        map.current.on('mouseup', onMouseUp);
    } else {
        map.current.off('touchstart', onTouchStart);
        map.current.off('touchmove', onTouchMove);
        map.current.off('touchend', onTouchEnd);
        map.current.off('mousedown', onMouseDown);
        map.current.off('mousemove', onMouseMove);
        map.current.off('mouseup', onMouseUp);
    }
  }, [isDrawing]);

  useEffect(() => {
    // ★修正: お試しモード(isTrial)の時は、参加(isJoined)していなくても地図を表示する
    if (isAuthLoading || (!isTrial && !isJoined)) return;
    if (map.current) return; 
    mapboxgl.accessToken = MAPBOX_TOKEN;
    if (mapContainer.current) {
     map.current = new mapboxgl.Map({ container: mapContainer.current, style: 'mapbox://styles/mapbox/streets-v12', center: [lng, lat], zoom: 14, pitch: 0, bearing: 0, antialias: true }); map.current.on('load', () => {
        if (!map.current) return;


        // ▼▼▼ 追加: 日本語ラベル化 ＆ 道路シールド非表示処理 ▼▼▼
        const style = map.current.getStyle();
        if (style && style.layers) {
            style.layers.forEach((layer) => {
                // 1. 道路番号のマーク（シールド）を非表示にする
                // 'shield' という名前が含まれるレイヤー（road-number-shieldなど）を隠す
                if (layer.type === 'symbol' && layer.id.includes('shield')) {
                    map.current?.setLayoutProperty(layer.id, 'visibility', 'none');
                }

                // 2. 日本語ラベルへの強制変換（既存の処理）
                if (layer.type === 'symbol' && layer.layout && layer.layout['text-field']) {
                    map.current?.setLayoutProperty(layer.id, 'text-field', [
                        'coalesce',
                        ['get', 'name_ja'],
                        ['get', 'name']
                    ]);
                }
            });
        }
        // ▲▲▲ 追加ここまで ▲▲▲

        
        map.current.resize();
        map.current.addSource('draw-source', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } } });
        map.current.addLayer({ id: 'draw-line', type: 'line', source: 'draw-source', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#EF4444', 'line-width': 4, 'line-opacity': 0.8 } });
        map.current.addLayer({ id: 'draw-fill', type: 'fill', source: 'draw-source', paint: { 'fill-color': '#EF4444', 'fill-opacity': 0.2 } });
        map.current.setPadding({ top: 150, bottom: 200, left: 0, right: 0 }); 
        const layers = map.current.getStyle().layers;
        const labelLayerId = layers?.find((layer) => layer.type === 'symbol' && layer.layout?.['text-field'])?.id;
        if(!map.current.getLayer('3d-buildings')) { map.current.addLayer({ 'id': '3d-buildings', 'source': 'composite', 'source-layer': 'building', 'filter': ['==', 'extrude', 'true'], 'type': 'fill-extrusion', 'minzoom': 15, 'paint': { 'fill-extrusion-color': '#aaa', 'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.05, ['get', 'height']], 'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.05, ['get', 'min_height']], 'fill-extrusion-opacity': 0.6 } }, labelLayerId); }
        // ▼▼▼ 修正: マップ上のスポットクリック時の処理 ▼▼▼
        // ▼▼▼ 修正: マップ上のスポット・駅・バス停クリック時の処理 ▼▼▼
        const clickableLayers = ['poi-label', 'transit-label'];

        // カーソルスタイル変更（対象レイヤーに乗ったとき指マークにする）
        clickableLayers.forEach(layer => {
             map.current?.on('mouseenter', layer, () => { if(map.current) map.current.getCanvas().style.cursor = 'pointer'; });
             map.current?.on('mouseleave', layer, () => { if(map.current) map.current.getCanvas().style.cursor = ''; });
        });

        map.current.on('click', (e) => {
          if (!map.current) return;
          
          // クリック地点にあるフィーチャーを取得（POIと交通機関の両方をチェック）
          const features = map.current.queryRenderedFeatures(e.point, { layers: clickableLayers });
          if (!features || features.length === 0) return;

          const feature = features[0];
          const name = feature.properties?.name || "名称不明";
          // Mapboxの住所データ（不完全な場合が多い）
          const rawAddress = feature.properties?.address || "";
          
          // 一時的なID生成
          const tempId = Date.now();
          // @ts-ignore
          const coordinates = feature.geometry.coordinates.slice();
          const isSaved = planSpotsRef.current.some(s => s.name === name);

          // 1. まずは仮の状態で表示（住所はMapboxのデータを使用）
          setSelectedResult({ 
              id: tempId, 
              text: name, 
              place_name: rawAddress || "住所調査中...", // 仮の住所
              center: coordinates, 
              is_saved: isSaved, 
              voters: [],
              comment: "" // 仮の説明
          });
          setViewMode('selected');
          setIsEditingDesc(false);
          setIsEditingMemo(false);
          setEditCommentValue(""); // 初期化
          setEditLinkValue("");
          
          map.current?.flyTo({ center: coordinates as [number, number], zoom: 16, offset: [0, -200] });
          
          // 2. バックエンドから正確な「住所」と「説明文(Wiki)」を取得して更新
          // 2. バックエンドから正確な「住所」と「説明文(Wiki)」を取得して更新
          const [clickedLng, clickedLat] = coordinates; // coordinatesは [lng, lat] の順
          fetchSpotInfo(name, clickedLat, clickedLng).then(info => {
              if (info) {
                  // A. 選択中のポップアップ(selectedResult)を更新
                  setSelectedResult((prev: any) => {
                      if (!prev || prev.id !== tempId) return prev;
                      
                      return {
                          ...prev,
                          place_name: info.description || prev.place_name,
                          image_url: info.image_url,
                          comment: info.comment || ""
                      };
                  });
                  
                  // 編集フォームの初期値も更新
                  if (info.comment) {
                      setEditCommentValue(prev => prev === "" ? info.comment : prev);
                  }

                  // ▼▼▼ 追加: 既にリストに追加されていたら、後追いで更新する処理 ▼▼▼
                  setPlanSpots(prevSpots => {
                      return prevSpots.map(s => {
                          // 名前が一致し、かつ住所が「調査中」のままのスポットを探す
                          if (s.name === name && (s.description === "住所調査中..." || s.description === "住所調査中")) {
                              
                              const newDesc = info.description || s.description;
                              const newComment = info.comment || s.comment;
                              const newImage = info.image_url || s.image_url;

                              // IDが確定している(DBにある)なら、DBも更新する
                              if (s.id && !String(s.id).startsWith('temp-') && roomId) {
                                  supabase.from('spots').update({ 
                                      description: newDesc,
                                      comment: newComment,
                                      image_url: newImage,
                                      updated_at: new Date().toISOString()
                                  }).eq('id', s.id).then(res => {
                                      if(res.error) console.error("Late update failed", res.error);
                                  });
                              }
                              
                              // ローカルの状態を更新 (仮IDの場合もこれで表示は直る)
                              return { 
                                  ...s, 
                                  description: newDesc,
                                  comment: newComment,
                                  image_url: newImage
                              };
                          }
                          return s;
                      });
                  });
                  // ▲▲▲ 追加ここまで ▲▲▲
              }
          });
        });


        // ★★★ 追加: 徒歩スケールの計算ロジック (ここから) ★★★
        const updateScale = () => {
            if (!map.current) return;
            
            // 画面上の幅 100px が、地図上で何メートルかを計算
            const y = map.current.getContainer().clientHeight / 2; // 画面中央の緯度基準
            // 画面中央付近の左端(0px)と、そこから100px右の地点の座標を取得
            const p1 = map.current.unproject([0, y]);
            const p2 = map.current.unproject([100, y]);

            // 距離計算 (既存のcalculateDistance関数を使用: 単位km)
            const distKm = calculateDistance(p1.lat, p1.lng, p2.lat, p2.lng);
            const distM = distKm * 1000;
            
            // 不動産業界の徒歩所要時間基準：80m/分 で計算
            const minutes = Math.round(distM / 80);

            if (minutes >= 180) {
                setScaleLabel("徒歩3時間以上");
            } else if (minutes >= 60) {
                const h = Math.floor(minutes / 60);
                const m = minutes % 60;
                setScaleLabel(`徒歩約${h}時間${m > 0 ? m + '分' : ''}`);
            } else {
                setScaleLabel(`徒歩約${minutes}分`);
            }
        };

        // 地図が動いたりズームしたら再計算
        map.current.on('move', updateScale);
        map.current.on('zoom', updateScale);
        updateScale(); // 初期表示用
        // ★★★ 追加: 徒歩スケールの計算ロジック (ここまで) ★★★
        // ▲▲▲ 修正ここまで ▲▲▲
      });
      
    }
    // ★追加: クリーンアップ関数
    return () => {
        if (map.current) {
            map.current.remove();
            map.current = null;
        }
    };
  }, [isAuthLoading, isJoined, isTrial]); // ★ isTrial を追加

// ---------------------------------------------------------
  // ▼▼▼ 修正: マーカー描画ロジックの軽量化・最適化版 ▼▼▼
  // ---------------------------------------------------------
  // ---------------------------------------------------------
  // ▼▼▼ 修正: マーカー描画ロジック (周辺検索対応版) ▼▼▼
  // ---------------------------------------------------------
 // page.tsx 1445行目付近：マーカー描画 useEffect の全域を差し替え

// page.tsx 1445行目付近の useEffect

// page.tsx 1445行目付近の useEffect を以下に置き換え

// ---------------------------------------------------------
// ▼▼▼ 修正版：マーカー描画ロジック (得票数最大値表示 & ホテル数字優先) ▼▼▼
// ---------------------------------------------------------
// ---------------------------------------------------------
// ▼▼▼ 修正版：マーカー描画ロジック (得票数最大値 & 複数ピン同期 & 宿優先) ▼▼▼
// ---------------------------------------------------------// ---------------------------------------------------------
// ▼▼▼ 修正版：マーカー描画ロジック (投票数・名寄せ・即時反映対応) ▼▼▼
// ---------------------------------------------------------
// ---------------------------------------------------------
// ▼▼▼ 修正版：マーカー描画ロジック (追加者の自動1票を廃止 & 0票表示対応) ▼▼▼
// ---------------------------------------------------------
// ---------------------------------------------------------
// ▼▼▼ 修正版：マーカー描画ロジック (確定リスト以外は得票数を優先) ▼▼▼
// ---------------------------------------------------------
// ---------------------------------------------------------
// ▼▼▼ 修正版：マーカー描画ロジック (宿リストも得票数表示 & 青ピン維持) ▼▼▼
// ---------------------------------------------------------
useEffect(() => {
    if (!map.current) return;

    // 1. 既存マーカーをすべて削除
    planMarkersRef.current.forEach(marker => marker.remove());
    planMarkersRef.current = [];

    const isDayView = filterStatus === 'confirmed' && selectedConfirmDay > 0;
    const spotIndicesMap = new Map<string, number[]>();

    if (isDayView) {
        displayTimeline.filter(t => t.type === 'spot').forEach((item, idx) => {
            const spotId = String(item.spot.id); 
            const indices = spotIndicesMap.get(spotId) || [];
            indices.push(idx + 1); 
            spotIndicesMap.set(spotId, indices);
        });
    }

    const renderedSpotIds = new Set<string>();
    const spotsToRender: any[] = [];

    // ▼▼▼ 修正: 基本の表示セット（現在のリスト絞り込みを反映） ▼▼▼
    // これにより、「Day1の宿」や「京都市の候補」といった現在の絞り込みは必ず守られます
    if (isDayView) {
        displayTimeline.forEach(item => {
            if (item.type === 'spot' && !renderedSpotIds.has(String(item.spot.id))) {
                spotsToRender.push(item.spot);
                renderedSpotIds.add(String(item.spot.id));
            }
        });
    } else {
        filteredSpots.forEach(s => {
            if (!renderedSpotIds.has(String(s.id))) {
                spotsToRender.push(s);
                renderedSpotIds.add(String(s.id));
            }
        });
    }

    // ▼▼▼ 追加: 「他方のピン」を表示するロジック ▼▼▼
    
    // パターンA: 宿リスト('hotel_candidate')を見ているなら、追加で「全候補」も地図に出す
   if (filterStatus === 'hotel_candidate') {
        planSpots.forEach(s => {
            // まだ表示リストに入っておらず...
            if (!renderedSpotIds.has(String(s.id))) {
                // ▼▼▼ 修正: 「候補」または「確定」なら表示する ▼▼▼
                if (s.status === 'candidate' || s.status === 'confirmed') {
                    spotsToRender.push(s);
                    renderedSpotIds.add(String(s.id));
                }
                // ▲▲▲ 修正ここまで ▲▲▲
            }
        });
    }
    
    // パターンB: 候補リスト('candidate')を見ているなら、追加で「全宿」も地図に出す
    else if (filterStatus === 'candidate') {
        planSpots.forEach(s => {
            const isSpotHotel = s.status === 'hotel_candidate' || s.is_hotel || isHotel(s.name);
            // まだ表示リストに入っておらず、かつ「ホテル」とみなせるもの
            if (!renderedSpotIds.has(String(s.id)) && isSpotHotel) {
                spotsToRender.push(s);
                renderedSpotIds.add(String(s.id));
            }
        });
    }
    // ▲▲▲ 追加ここまで ▲▲▲

    if (currentTab === 'explore') {
        nearbyCandidates.forEach(s => {
            const sid = String(s.id);
            if (!renderedSpotIds.has(sid)) {
                spotsToRender.push(s);
                renderedSpotIds.add(sid);
            }
        });
    }

    // 2. マーカー生成ループ
    spotsToRender.forEach((spot) => {
        const isNearby = spot.is_nearby === true;
        const isConfirmed = spot.status === 'confirmed';
        const isSpotHotel = isHotel(spot.name) || spot.is_hotel;
        const size = 24; 
        const confirmedColor = '#2563EB';

        let displayLabel: string = "";
        let participants: string[] = [];
        let voteCount = 0;

        if (!isNearby) {
            // 純粋な投票データ(LIKE)のみを抽出
            const likes = spotVotes
                .filter(v => String(v.spot_id) === String(spot.id) && v.vote_type === 'like')
                .map(v => v.user_name);
            
            participants = Array.from(new Set(likes)).filter(Boolean) as string[];
            voteCount = participants.length;
        }

        let currentFontSize = '14px';

        // ★ラベル(数字)の表示ロジック
        if (isDayView && isConfirmed) {
            // Day 1, Day 2などの詳細表示中：訪れる順番(1, 2...)
            const indices = spotIndicesMap.get(String(spot.id)) || [];
            displayLabel = indices.join(',');
            if (displayLabel.length > 2) currentFontSize = '10px';
        } else if (filterStatus === 'confirmed' && isConfirmed) {
            // 「確定リスト」タブ：設定されたDayを表示
            displayLabel = String(spot.day || '?');
        } else {
            // 「ALL」「候補」「宿リスト」タブ：
            // 確定スポットであっても、共通して「得票数」を表示する
            displayLabel = String(voteCount);
        }

        let hotelInfoHtml = ''; 
        if (!isNearby && isSpotHotel && spot.price > 0) {
            hotelInfoHtml = `<div style="position:absolute; bottom:100%; left:50%; transform:translateX(-50%) translateY(-8px); background:white; padding:2px 6px; border-radius:6px; font-size:10px; font-weight:bold; color:#d32f2f; white-space:nowrap; box-shadow:0 2px 4px rgba(0,0,0,0.2); display:flex; flex-direction:column; align-items:center;"><span>¥${Number(spot.price).toLocaleString()}</span><div style="position:absolute; top:100%; left:50%; transform:translateX(-50%); width:0; height:0; border-left:4px solid transparent; border-right:4px solid transparent; border-top:4px solid white;"></div></div>`;
        }

        const el = document.createElement('div');
        el.className = 'marker-plan';
        el.style.cursor = 'pointer';

        if (isNearby) {
            el.innerHTML = `<div style="position:relative; display:flex; flex-direction:column; align-items:center;"><div style="width:24px; height:24px; background:black; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 5px rgba(0,0,0,0.3);"><div style="width:20px; height:20px; background:white; border-radius:50%; display:flex; align-items:center; justify-content:center; color:black; font-weight:bold; font-size:10px;">?</div></div><div style="width:0; height:0; border-left:4px solid transparent; border-right:4px solid transparent; border-top:6px solid black; margin-top:-1px;"></div></div>`;
        } else if (isConfirmed) {
            // ★修正：どのタブであっても「確定済み」なら青いピンを表示する
            el.innerHTML = `
                <div style="position:relative; display:flex; flex-direction:column; align-items:center;">
                    ${hotelInfoHtml}
                    <div style="width:${size + 6}px; height:${size + 6}px; background:${confirmedColor}; border-radius:${isDayView ? '6px' : '50%'}; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 10px rgba(0,0,0,0.5);">
                        <div style="width:${size}px; height:${size}px; background:${confirmedColor}; border-radius:${isDayView ? '5px' : '50%'}; display:flex; align-items:center; justify-content:center; color:white; font-weight:800; font-size:${currentFontSize}; border:1px solid rgba(255,255,255,0.3);">
                            ${displayLabel}
                        </div>
                    </div>
                    <div style="width:0; height:0; border-left:5px solid transparent; border-right:5px solid transparent; border-top:7px solid ${confirmedColor}; margin-top:-1px;"></div>
                </div>`;
        } else {
            // 候補ピン（グラデーション/黄色）
            let gradientString = '#9CA3AF';
            if (participants.length > 0) {
                const segmentSize = 100 / participants.length;
                const gradientParts = participants.map((name, i) => { 
                    const color = getUserColor(name); 
                    return `${color} ${i * segmentSize}% ${(i + 1) * segmentSize}%`; 
                });
                gradientString = `conic-gradient(${gradientParts.join(', ')})`;
            }

            el.innerHTML = `
                <div style="position:relative; display:flex; flex-direction:column; align-items:center;">
                    ${hotelInfoHtml}
                    <div style="width:${size + 6}px; height:${size + 6}px; background:${gradientString}; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 5px rgba(0,0,0,0.3);">
                        <div style="width:${size}px; height:${size}px; background:${isSpotHotel ? '#FEF9C3' : '#FFFFFF'}; border-radius:50%; display:flex; align-items:center; justify-content:center; color:${isSpotHotel ? '#CA8A04' : '#1E3A8A'}; font-weight:800; font-size:12px; border:1px solid rgba(0,0,0,0.1);">
                            ${displayLabel}
                        </div>
                    </div>
                    <div style="width:0; height:0; border-left:5px solid transparent; border-right:5px solid transparent; border-top:7px solid ${isSpotHotel ? '#FEF9C3' : '#FFFFFF'}; margin-top:-1px;"></div>
                </div>`;
        }

       // ★変更: 詳細表示ではなく、リスト内の該当箇所へフォーカスする
el.onclick = (e) => { 
            e.stopPropagation(); 

            // ★修正: 周辺スポット(isNearby)の場合は、即座に詳細を開く
            if (isNearby) {
                handlePreviewSpot(spot);
            } else {
                // それ以外の通常スポットは、今まで通りリストの場所へフォーカス
                focusSpotInList(spot); 
            }
        };
        
        if (spot.coordinates) {
            const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
                .setLngLat(spot.coordinates as [number, number])
                .addTo(map.current!);
            planMarkersRef.current.push(marker);
        }
    });

}, [filteredSpots, planSpots, displayTimeline, nearbyCandidates, spotVotes, currentTab, filterStatus, selectedConfirmDay]);
// ---------------------------------------------------------
  // ★変更: トライアルモードでない場合のみ認証・参加チェックを行う
  if (!isTrial && (isAuthLoading || (!roomId && !isJoined) || (roomId && !isJoined))) {
    return (
        <>
            <WelcomePage inviteRoomId={roomId} />
        </>
    );
  }

  return (
    <main className="relative w-screen h-[100dvh] bg-slate-100 overflow-hidden flex flex-col font-sans">
      
      {/* ★追加: トライアルモードを終了して戻るボタン */}
      {isTrial && (
          <div className="absolute top-4 left-4 z-[100]">
              <button 
                  onClick={() => router.push('/?step=create')} // ★変更
                  className="bg-white/90 backdrop-blur px-4 py-2 rounded-full shadow-lg font-bold text-sm flex items-center gap-2 hover:scale-105 active:scale-95 transition border border-gray-200 text-gray-700"
              >
                  <ArrowLeftCircle size={16}/> 終了して部屋を作る
              </button>
          </div>
      )}


      <Ticker />

      

            {/* ★追加: オンボーディングモーダル (他の警告より手前に表示したい場合は順序調整) */}
   {showTutorial && (
                <TutorialModal 
                    onClose={() => setShowTutorial(false)} 
                    forceGuide={forceGuideTutorial} 
                />
            )}
      
      {/* ★追加: スワイプチュートリアルモーダル */}
      {showSwipeTutorial && (
          <div className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
              <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl relative overflow-hidden">
                  <div className="flex justify-center gap-8 mb-6">
                      <div className="flex flex-col items-center gap-2">
                          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center text-red-500 shadow-sm border border-red-200">
                              <X size={32} strokeWidth={3}/>
                          </div>
                          <span className="text-xs font-bold text-gray-400">NOPE</span>
                          <div className="text-[10px] text-gray-400 font-bold">← Left</div>
                      </div>
                      <div className="flex flex-col items-center gap-2">
                          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center text-blue-500 shadow-sm border border-blue-200">
                              <ThumbsUp size={32} strokeWidth={3}/>
                          </div>
                          <span className="text-xs font-bold text-blue-500">LIKE</span>
                          <div className="text-[10px] text-blue-400 font-bold">Right →</div>
                      </div>
                  </div>
                  
                  <h3 className="text-xl font-black text-center text-gray-800 mb-2">スワイプで仕分け</h3>
                  <p className="text-sm text-gray-500 text-center mb-6 leading-relaxed">
                      気になるスポットは右へ、<br/>
                      興味がないなら左へスワイプ。<br/>
                      あなたの好みをAIが学習します。
                  </p>

                  <div className="flex items-center justify-center gap-2 mb-6 cursor-pointer" onClick={() => setDontShowTutorial(!dontShowTutorial)}>
                      <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${dontShowTutorial ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'}`}>
                          {dontShowTutorial && <Check size={14} className="text-white"/>}
                      </div>
                      <span className="text-xs font-bold text-gray-500 select-none">今後表示しない</span>
                  </div>

                  <button 
                      onClick={handleCloseTutorial} 
                      className="w-full py-4 bg-black text-white rounded-2xl font-bold text-sm hover:scale-[1.02] active:scale-95 transition shadow-lg"
                  >
                      はじめる
                  </button>
              </div>
          </div>
      )}

      {/* ★追加: お試しモードからルーム作成への誘導ポップアップ */}
      {showTrialPopup && (
          <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-300">
              <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl relative flex flex-col items-center text-center animate-in zoom-in-95">
                  <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4 shadow-sm">
                      <Users size={32} />
                  </div>
                  <h3 className="text-xl font-black text-gray-900 mb-2">友達とシェアしませんか？</h3>
                  <p className="text-sm text-gray-500 mb-6 leading-relaxed font-medium">
                      ルームを作成すると、友達を招待して<br/>一緒にプランを編集できるようになります！<br/>
                  </p>
                  <div className="flex flex-col gap-3 w-full">
                      <button 
                          onClick={() => router.push('/?step=create')} // ★変更
                          className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-lg hover:scale-[1.02] active:scale-95 transition shadow-xl shadow-blue-200"
                      >
                          部屋を作ってシェアする
                      </button>
                      <button 
                          onClick={() => setShowTrialPopup(false)} 
                          className="w-full py-3 text-gray-400 font-bold hover:text-gray-600 transition"
                      >
                          今はお試しを続ける
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* ★追加: お試しモードの使い方ガイド */}
      {showTrialGuide && (
          <div className="fixed inset-0 z-[250] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-300">
              <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl relative flex flex-col items-center animate-in zoom-in-95">
                  <h3 className="text-2xl font-black text-gray-900 mb-6 tracking-tight">使い方のヒント 💡</h3>
                  
                  <div className="space-y-4 mb-8 w-full">
                      {/* 囲って検索 */}
                      <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 flex items-start gap-4">
                          <div className="w-12 h-12 bg-emerald-600 text-white rounded-full flex items-center justify-center shrink-0 shadow-md">
                              <PenTool size={20} />
                          </div>
                          <div>
                              <h4 className="font-bold text-emerald-900 text-sm mb-1">マップを囲って検索</h4>
                              <p className="text-xs text-emerald-800/80 leading-relaxed font-medium">
                                  右上の万年筆ボタンを押して地図をなぞると、囲んだ範囲の宿を検索できます。
                              </p>
                          </div>
                      </div>

                      {/* 散布図で表示 */}
                      <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 flex items-start gap-4">
                          <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center shrink-0 shadow-md">
                              <TrendingUp size={20} />
                          </div>
                          <div>
                              <h4 className="font-bold text-blue-900 text-sm mb-1">散布図でコスパ分析</h4>
                              <p className="text-xs text-blue-800/80 leading-relaxed font-medium">
                                  検索結果は「価格」と「評価」のグラフで表示され、条件にぴったりの宿がひと目でわかります。
                              </p>
                          </div>
                      </div>
                  </div>

                  <button 
                      onClick={closeTrialGuide} 
                      className="w-full bg-gray-900 text-white py-4 rounded-2xl font-black text-lg hover:scale-[1.02] active:scale-95 transition shadow-xl"
                  >
                      はじめる
                  </button>
              </div>
          </div>
      )}

      {/* 1150行目付近（他のモーダルの後ろなど）に挿入 */}

{arrivalModalSpots.length > 0 && (
    <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
        <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl relative flex flex-col items-center text-center animate-in zoom-in-95 duration-300">
            {/* アイコン */}
            <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-4 shadow-sm">
                <Sparkles size={32} />
            </div>

            <h3 className="text-xl font-black text-gray-900 mb-2">新着スポットがあります！</h3>
            <p className="text-sm text-gray-500 mb-6">
                前回の訪問以降、メンバーによって以下のスポットが追加されました。
            </p>

            {/* スポットリスト */}
            <div className="w-full max-h-40 overflow-y-auto mb-8 space-y-2 pr-1 custom-scrollbar">
                {arrivalModalSpots.map((spot, idx) => (
                    <div key={idx} className="bg-gray-50 p-3 rounded-xl border border-gray-100 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-200 shrink-0">
                            {spot.image_url ? (
                                <img src={spot.image_url} className="w-full h-full object-cover" alt="" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-400"><MapPin size={14}/></div>
                            )}
                        </div>
                        <span className="text-sm font-bold text-gray-800 truncate flex-1 text-left">{spot.name}</span>
                    </div>
                ))}
            </div>
            
            <div className="flex flex-col gap-3 w-full">
                <button 
                    onClick={() => {
                        setCurrentTab('swipe'); // スワイプ（提案）タブへ移動
                        setArrivalModalSpots([]);
                    }} 
                    className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black text-lg hover:scale-[1.02] active:scale-95 transition shadow-xl shadow-indigo-200 flex items-center justify-center gap-2"
                >
                    <ThumbsUp size={20}/> 投票しにいく
                </button>
                <button 
                    onClick={() => setArrivalModalSpots([])} 
                    className="w-full py-3 text-gray-400 font-bold hover:text-gray-600 transition"
                >
                    あとで見に行く
                </button>
            </div>
        </div>
    </div>
)}

      {showVoterListModal && selectedResult && (
          <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setShowVoterListModal(false)}>
              <div className="bg-white w-full max-w-xs rounded-[2rem] p-6 shadow-2xl relative overflow-hidden flex flex-col max-h-[60vh]" onClick={(e) => e.stopPropagation()}>
                  <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2 border-b border-gray-100 pb-2 shrink-0">
                      <UsersIcon size={20} className="text-blue-500"/>
                      投票した人 <span className="text-gray-400 text-sm font-medium">({selectedResult.voters.length})</span>
                  </h3>
                  <div className="overflow-y-auto space-y-2 pr-1 custom-scrollbar flex-1 min-h-0">
                      {selectedResult.voters.map((voter: string) => (
                          <div key={voter} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-xl transition cursor-default">
                              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-sm shrink-0" style={{ backgroundColor: getUserColor(voter) }}>
                                  {voter.slice(0, 1)}
                              </div>
                              <span className="font-bold text-gray-700 text-sm truncate">{voter}</span>
                          </div>
                      ))}
                  </div>
                  <button onClick={() => setShowVoterListModal(false)} className="mt-4 w-full py-3 bg-gray-100 font-bold text-gray-600 rounded-xl hover:bg-gray-200 transition active:scale-95 shrink-0">閉じる</button>
              </div>
          </div>
      )}

      {expandedImage && (
          <div className="fixed inset-0 z-[110] bg-black/90 flex items-center justify-center p-4 animate-in fade-in duration-300" onClick={() => setExpandedImage(null)}>
              <button className="absolute top-4 right-4 text-white p-2 bg-white/20 hover:bg-white/40 rounded-full transition">
                  <X size={24}/>
              </button>
              <img src={expandedImage} alt="Fullscreen" className="max-w-full max-h-full object-contain shadow-2xl" onClick={(e) => e.stopPropagation()}/>
          </div>
      )}


{notification && (
    <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-top-4 duration-300 pointer-events-none">
        {/* rounded-full を rounded-2xl に、items-center を items-start に変更し whitespace-pre-wrap を追加 */}
        <div className={`px-6 py-4 rounded-2xl shadow-2xl ${notification.color} text-white font-bold text-sm flex items-start gap-3 backdrop-blur-md max-w-[90vw] whitespace-pre-wrap`}>
            <CheckCircle size={18} className="text-white shrink-0 mt-0.5"/>
            <div className="flex-1">{notification.text}</div>
        </div>
    </div>
)}

      {showActivityLog && (
          <div 
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-200"
            onClick={() => setShowActivityLog(false)} 
          >
              <div 
                className="bg-white w-full max-w-sm rounded-[2rem] p-6 shadow-2xl relative flex flex-col max-h-[80vh]"
                onClick={(e) => e.stopPropagation()} 
              >
                  <div className="flex justify-between items-center p-5 border-b border-gray-100 shrink-0 bg-white z-10">
                      <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                          <Clock size={20} className="text-blue-600"/> タイムライン
                      </h3>
                      <button 
                          onClick={() => setShowActivityLog(false)} 
                          className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition active:scale-90"
                      >
                          <X size={18}/>
                      </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar min-h-0 overscroll-contain touch-auto">
                      {planSpots.length === 0 ? (
                          <div className="text-center text-gray-600 text-xs py-8">履歴はありません</div>
                      ) : (
                          [...planSpots].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((spot) => (
                              <div key={spot.id} className="flex gap-3">
                                 <div className="flex flex-col items-center">
                                      {/* ここはタイムラインの装飾なので変更なし（青色固定） */}
                                      <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 shrink-0"></div>
                                      <div className="w-0.5 flex-1 bg-gray-200 my-1"></div>
                                  </div>
                                  <div className="bg-gray-50 p-3 rounded-xl flex-1 border border-gray-100">
                                      <p className="text-[10px] text-gray-400 mb-1 font-mono">
                                          {new Date(spot.created_at).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                      </p>
                                      <div className="flex items-center gap-1.5 mb-1.5">
                                          {/* ▼ 修正: getUDColor -> getUserColor に変更 */}
                                          <div className="w-4 h-4 rounded-full shadow-sm shrink-0" style={{ backgroundColor: getUserColor(spot.added_by) }}></div>
                                          <span className="text-xs font-bold text-gray-700 truncate max-w-[120px]">{spot.added_by}</span>
                                      </div>
                                      <p className="text-sm font-bold text-gray-800 leading-tight">「{spot.name}」を追加しました</p>
                                  </div>
                              </div>
                          ))
                      )}
                      <div className="h-2 shrink-0"></div>
                  </div>
              </div>
          </div>
      )}

      {showDateModal && (
          <div className="absolute inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-200">
              <div className="bg-white w-full max-w-sm rounded-[2rem] p-8 shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 to-purple-600"></div>
                  <h3 className="text-xl font-black text-gray-900 flex items-center gap-2 mb-6"><Calendar size={24} className="text-blue-600"/> 旅行設定</h3>
                  <div className="space-y-4">
                      {/* 旅行名 */}
                      <div>
                          <label className="text-xs font-bold text-gray-600 ml-1 mb-1 block uppercase tracking-wider">Trip Name</label>
                          <input 
                              type="text" 
                              value={roomName} 
                              onChange={(e)=>setRoomName(e.target.value)} 
                              placeholder="例: 京都旅行"
                              className="w-full bg-gray-50 p-4 rounded-2xl font-bold text-gray-800 border border-gray-100 focus:ring-2 focus:ring-blue-100 outline-none placeholder:text-gray-300"
                          />
                      </div>

                      {/* 日付 */}
                      <div><label className="text-xs font-bold text-gray-600 ml-1 mb-1 block uppercase tracking-wider">Start Date</label><input type="date" value={startDate} onChange={(e)=>setStartDate(e.target.value)} className="w-full bg-gray-50 p-4 rounded-2xl font-bold text-gray-800 border border-gray-100 focus:ring-2 focus:ring-blue-100 outline-none"/></div>
                      <div><label className="text-xs font-bold text-gray-600 ml-1 mb-1 block uppercase tracking-wider">End Date</label><input type="date" value={endDate} onChange={(e)=>setEndDate(e.target.value)} className="w-full bg-gray-50 p-4 rounded-2xl font-bold text-gray-800 border border-gray-100 focus:ring-2 focus:ring-blue-100 outline-none"/></div>
                      
                      {/* 人数 (0入力許容) */}
                      <div>
                          <label className="text-xs font-bold text-gray-400 ml-1 mb-1 block uppercase tracking-wider flex items-center gap-1"><UsersIcon size={12}/> Travelers</label>
                          <input 
                              type="number" 
                              min="1" 
                              max="20" 
                              value={adultNum === 0 ? '' : adultNum} 
                              onChange={(e) => {
                                  const val = e.target.value;
                                  setAdultNum(val === '' ? 0 : parseInt(val));
                              }} 
                              className="w-full bg-gray-50 p-4 rounded-2xl font-bold text-gray-800 border border-gray-100 focus:ring-2 focus:ring-blue-100 outline-none"
                          />
                      </div>
                  </div>
                  
                  {/* 保存ボタン */}
                  <button onClick={handleSaveSettings} className="w-full bg-black text-white py-4 rounded-2xl font-bold mt-6 hover:scale-[1.02] active:scale-95 transition shadow-xl">保存して閉じる</button>
                  
                  {/* ★追加: 閉じる（キャンセル）ボタン */}
                  <button 
                      onClick={() => setShowDateModal(false)} 
                      className="w-full py-3 text-gray-400 font-bold text-xs hover:text-gray-600 transition mt-2"
                  >
                      閉じる
                  </button>
              </div>
          </div>
      )}

     {/* 日程割り当てモーダル */}
      {/* 日程割り当てモーダル */}
      {spotToAssignDay && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200" onClick={() => setSpotToAssignDay(null)}>
          <div className="bg-white w-full max-w-sm rounded-[2rem] p-8 shadow-2xl relative flex flex-col gap-4" onClick={e => e.stopPropagation()}>
            <div className="text-center">
                <h3 className="text-lg font-black text-gray-900 mb-1">日程を変更</h3>
                <p className="text-xs text-gray-500 font-bold truncate px-4">{spotToAssignDay.name}</p>
            </div>

            {/* ★追加: 宿かどうかを判定して色を切り替える */}
            {(() => {
                const isTargetHotel = spotToAssignDay.is_hotel || (spotToAssignDay.name && (spotToAssignDay.name.includes('ホテル') || spotToAssignDay.name.includes('旅館')));
                const activeClass = isTargetHotel ? 'bg-orange-500 text-white shadow-md' : 'bg-blue-600 text-white shadow-md';
                const activeRing = isTargetHotel ? 'ring-2 ring-orange-200' : 'ring-2 ring-blue-200';
                const hoverClass = isTargetHotel 
                    ? 'hover:bg-orange-50 hover:border-orange-200 hover:text-orange-600' 
                    : 'hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600';

                return (
                    <div className="grid grid-cols-1 gap-2 max-h-[60vh] overflow-y-auto pr-1">
                       <button 
                          onClick={() => confirmSpotDay(0)} 
                          className={`w-full py-3 rounded-xl font-bold text-xs transition flex items-center justify-center gap-2
                            ${spotToAssignDay.day === 0 ? activeClass : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}
                          `}
                       >
                          未定にする
                       </button>
                       
                      {Array.from({ length: travelDays }).map((_, i) => {
                           const dayNum = i + 1;
                           const isSelected = spotToAssignDay.day === dayNum;
                           
                           // 宿の場合は「Day 1-2」のように表記する
                           // 宿の場合、最終日（帰る日）は宿泊しないため除外
                           if (isTargetHotel && dayNum === travelDays) return null;
                           
                           const dayLabel = isTargetHotel ? `Day ${dayNum} - ${dayNum+1}` : `Day ${dayNum}`;
                           
                           return (
                               <button 
                                   key={i}
                                   onClick={() => confirmSpotDay(dayNum)} 
                                   className={`w-full py-3 rounded-xl font-bold text-sm transition flex items-center justify-center gap-2 border
                                     ${isSelected 
                                       ? `${activeClass} ${activeRing} border-transparent`
                                       : `bg-white border-gray-200 text-gray-600 ${hoverClass}`}
                                   `}
                               >
                                   <Calendar size={16}/> {dayLabel}
                               </button>
                           );
                       })}
                    </div>
                );
            })()}

            <button 
                onClick={() => setSpotToAssignDay(null)} 
                className="w-full py-3 text-gray-400 font-bold text-xs hover:text-gray-600 transition mt-2"
            >
                キャンセル
            </button>
          </div>
        </div>
      )}

      {/* 既存の spotToAssignDay モーダルの閉じタグの後に以下を追加 */}

      {/* ★追加: 複製追加時の日程選択モーダル */}
      {spotToDuplicate && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200" onClick={() => setSpotToDuplicate(null)}>
          <div className="bg-white w-full max-w-sm rounded-[2rem] p-8 shadow-2xl relative flex flex-col gap-4" onClick={e => e.stopPropagation()}>
            <div className="text-center">
                <h3 className="text-lg font-black text-gray-900 mb-1">いつ行きますか？</h3>
                <p className="text-xs text-gray-500 font-bold truncate px-4">「{spotToDuplicate.text || spotToDuplicate.name}」を追加</p>
            </div>

            <div className="grid grid-cols-1 gap-2 max-h-[60vh] overflow-y-auto pr-1">
               {/* 候補（未定）として追加するボタン */}
               <button 
                  onClick={() => confirmDuplicateSpot(0)} 
                  className="w-full py-3 rounded-xl font-bold text-xs transition flex items-center justify-center gap-2 bg-yellow-500 text-white shadow-md hover:bg-yellow-600"
               >
                  未定に追加
               </button>
               
               {/* Dayボタン */}
               {Array.from({ length: travelDays }).map((_, i) => {
                   const dayNum = i + 1;
                   const isTargetHotel = spotToDuplicate.is_hotel || isHotel(spotToDuplicate.text || spotToDuplicate.name);
                   
                   // 宿の場合、最終日は表示しない
                   if (isTargetHotel && dayNum === travelDays) return null;
                   
                   const dayLabel = isTargetHotel ? `Day ${dayNum} - ${dayNum+1} (宿)` : `Day ${dayNum}`;
                   
                   return (
                       <button 
                           key={i}
                           onClick={() => confirmDuplicateSpot(dayNum)} 
                           className="w-full py-3 rounded-xl font-bold text-sm transition flex items-center justify-center gap-2 border bg-white border-gray-200 text-gray-600 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200"
                       >
                           <Calendar size={16}/> {dayLabel}
                       </button>
                   );
               })}
            </div>

            <button 
                onClick={() => setSpotToDuplicate(null)} 
                className="w-full py-3 text-gray-400 font-bold text-xs hover:text-gray-600 transition mt-2"
            >
                キャンセル
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 relative overflow-hidden flex flex-col md:flex-row">
        <div className={`relative h-full w-full md:flex-1 ${currentTab === 'explore' ? 'block' : 'hidden md:block'}`}>
          <div ref={mapContainer} className="absolute top-0 left-0 w-full h-full z-0" style={{ touchAction: isDrawing ? 'none' : 'auto' }} />

          {/* ★★★ 追加: 徒歩時間スケール (ここから) ★★★ */}
          {currentTab === 'explore' && scaleLabel && (
              <div className="absolute top-32 left-4 z-10 pointer-events-none drop-shadow-md flex flex-col items-start animate-in fade-in duration-500">
                   {/* テキストラベル */}
                   <span className="text-[10px] font-bold text-gray-600 bg-white/90 px-2 py-0.5 rounded-md mb-0.5 whitespace-nowrap border border-white/50 backdrop-blur-sm shadow-sm">
                       {scaleLabel}
                   </span>
                   {/* 100px幅の定規バー */}
                   <div className="w-[100px] h-2 border-x-2 border-b-2 border-gray-600/80 bg-white/20 backdrop-blur-[1px] relative">
                        {/* 中央の目盛り */}
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-1 bg-gray-600/50"></div>
                   </div>
              </div>
          )}
          {/* ★★★ 追加: 徒歩時間スケール (ここまで) ★★★ */}
          
          {/* ▼▼▼ 修正: マップ右上のボタン群 ▼▼▼ */}
          {/* ▼▼▼ 修正: マップ右上のボタン群 ▼▼▼ */}
          <div className="absolute top-32 right-4 z-20 flex flex-col gap-3 items-end">
             {/* 囲って検索（ペンツール）ボタン */}
             <button 
                onClick={() => isDrawing ? stopDrawing() : startDrawing()} 
                className={`shadow-xl font-bold transition-all duration-300 flex items-center justify-center border-2 ${
                    isDrawing 
                    ? 'w-12 h-12 rounded-full bg-red-500 border-red-400 text-white animate-pulse scale-110' // 描画中（そのまま）
                    : isTrial 
                        ? 'w-16 h-16 rounded-full bg-white text-emerald-600 shadow-2xl scale-105 hover:scale-110 border-4 border-emerald-100' // ★ お試し時: 大きく、テーマカラーのエメラルド色で目立たせる
                        : 'w-12 h-12 rounded-full bg-white border-white text-gray-700 hover:scale-110' // 通常（本番）
                }`}
             >
                 {isDrawing ? <X size={24}/> : (
                     <PenTool size={isTrial ? 28 : 20}/> // ★ アイコンサイズもお試し時は大きく
                 )}
             </button>
             
             {/* ▼▼▼ ログイン（本番）時のみ表示するボタン ▼▼▼ */}
             {!isTrial && (
                 <>
                     {/* 周辺を探すボタン */}
                     <button 
                        onClick={handleSearchNearby} 
                        className={`w-12 h-12 rounded-full shadow-xl transition-all duration-300 flex items-center justify-center border-2 
                            ${nearbyCandidates.length > 0 
                                ? 'bg-black text-white border-black hover:bg-gray-800' // 表示中
                                : 'bg-white text-gray-700 border-white hover:bg-gray-50 hover:scale-110' // 通常
                            } 
                            ${isSearchingNearby ? 'animate-bounce' : ''}`}
                        title="この周辺のスポットを探す"
                     >
                         {isSearchingNearby ? <Loader2 size={20} className="animate-spin text-blue-500"/> : <Binoculars size={20}/>}
                     </button>

                     {/* 全体を表示ボタン */}
                     <button 
                        onClick={() => {
                            if (planSpots.length > 0) {
                                fitBoundsToSpots(planSpots);
                            } else {
                                map.current?.flyTo({ center: [lng, lat], zoom: 14 });
                            }
                        }}
                        className="w-12 h-12 rounded-full shadow-xl bg-white text-gray-700 hover:scale-110 hover:bg-gray-50 border-2 border-white transition-all duration-300 flex items-center justify-center"
                        title="全体を表示"
                     >
                         <Maximize size={20}/>
                     </button>
                 </>
             )}

             {isDrawing && (
                 <div className="absolute top-1 right-14 bg-black/80 backdrop-blur text-white px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap shadow-lg">
                     {isTrial ? "画面をなぞって範囲を指定" : "かこって検索"}
                 </div>
             )}
          </div>
          {/* ▲▲▲ 修正ここまで ▲▲▲ */}
          {/* ▲▲▲ 修正ここまで ▲▲▲ */}

           {/* ▼▼▼ 追加: 「写真で選ぶ」フローティングボタン (周辺候補がある時だけ出現) ▼▼▼ */}
           {currentTab === 'explore' && nearbyCandidates.length > 0 && (
               <div className="absolute bottom-40 left-1/2 -translate-x-1/2 z-30 animate-in slide-in-from-bottom-4 fade-in">
                   <button
                       onClick={handleGoToPhotoSwipe}
                       className="bg-black text-white px-6 py-3 rounded-full font-bold shadow-2xl flex items-center gap-2 hover:scale-105 active:scale-95 transition border border-gray-700"
                   >
                       <Camera size={18} />
                       <span className="text-sm">写真で選ぶ ({nearbyCandidates.length}件)</span>
                   </button>
                   
                   {/* 閉じるボタン（検索結果をクリアして閉じる） */}
                   <button 
                       onClick={() => { setNearbyCandidates([]); }}
                       className="absolute -top-2 -right-2 bg-gray-200 text-gray-600 rounded-full p-1 shadow-sm hover:bg-gray-300"
                   >
                       <X size={12}/>
                   </button>
               </div>
           )}

          {currentTab === 'explore' && allParticipants.length > 0 && (
              <div className="absolute bottom-36 left-4 z-10 flex flex-col gap-2 pointer-events-none">
                  {allParticipants.map(name => (
                      <div key={name} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/80 backdrop-blur-md border border-white/40 shadow-sm animate-in slide-in-from-left-2">
                          <span className="w-2 h-2 rounded-full shadow-sm" style={{ backgroundColor: getUserColor(name) }}></span>
                          <span className={`text-xs font-bold truncate max-w-[80px] ${name === userName ? 'text-blue-600' : 'text-gray-700'}`}>{name}</span>
                      </div>
                  ))}
              </div>
          )}
          
       {currentTab === 'explore' && (
            <div className="absolute top-0 left-0 right-0 z-20 flex flex-col items-center pt-4 px-4 pointer-events-none">
              
              

              {/* ★追加: マーキーアニメーションのスタイル定義 */}
              <style jsx>{`
              // ...
                @keyframes marquee {
                  0% { transform: translateX(0); }
                  100% { transform: translateX(-100%); }
                }
                .animate-marquee-scroll {
                  display: inline-block;
                  white-space: nowrap;
                  animation: marquee 8s linear infinite;
                  padding-left: 100%; /* 右端から開始 */
                }
              `}</style>

              <div className="bg-white/90 backdrop-blur-xl p-2 pr-4 rounded-[2rem] shadow-2xl flex items-center gap-2 border border-white/50 w-full max-w-md pointer-events-auto transition-all duration-300 focus-within:ring-4 focus-within:ring-blue-100/50">
                <button onClick={() => setShowActivityLog(true)} className="p-3 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-500 transition shrink-0"><History size={18}/></button>
                <button onClick={() => setShowDateModal(true)} className="p-3 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-500 transition shrink-0"><Calendar size={18}/></button>
                <div className="h-6 w-px bg-gray-200 shrink-0"></div>
                
                {/* ★修正: インプットエリアと流れるテキスト */}
                <div className="flex-1 relative h-10 overflow-hidden flex items-center min-w-0">
                    {/* 流れるプレースホルダー (入力がなく、フォーカスされていない時のみ表示) */}
                    {!query && !isFocused && (
                        <div className="absolute inset-0 flex items-center pointer-events-none opacity-40">
                            <div className="animate-marquee-scroll text-sm font-bold text-gray-500">
                                場所やキーワードを検索...      場所やキーワードを検索...
                            </div>
                        </div>
                    )}
                    
                    <input 
                        type="text" 
                        value={query} 
                        onFocus={() => setIsFocused(true)} 
                        onBlur={() => setTimeout(() => setIsFocused(false), 200)} 
                        onChange={(e) => { setQuery(e.target.value); }} 
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()} 
                        // placeholder属性は削除し、上のdivで代用
                        className="w-full h-full bg-transparent outline-none text-gray-800 text-sm font-bold relative z-10" 
                    />
                </div>
                
                {query && <button onClick={resetSearchState} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 transition shrink-0"><X size={16}/></button>}
                
                {/* AIローディング表示の切り替え */}
<div className="flex items-center shrink-0">
  {isSearching ? (
    // 🔍 検索中（AI補正中）の表示
    <div className="flex items-center gap-1 bg-indigo-50 px-2 py-1.5 rounded-full border border-indigo-100 animate-pulse">
      <Loader2 size={16} className="animate-spin text-indigo-600" />
      <span className="text-[10px] font-black text-indigo-600 mr-1">AI</span>
    </div>
  ) : (
    // 通常時のAI提案タブへの移動ボタン
    <button 
      onClick={() => setCurrentTab('swipe')} 
      className="bg-gradient-to-tr from-indigo-500 to-purple-600 text-white w-10 h-10 rounded-full font-black text-xs shadow-md hover:scale-110 transition active:scale-95 flex items-center justify-center shrink-0"
      title="AI提案ページへ"
    >
      AI
    </button>
  )}
</div>



                <button onClick={() => handleSearch()} className="bg-black text-white p-3 rounded-full hover:bg-gray-800 shadow-md transition active:scale-95 shrink-0"><Search size={18} /></button>
              </div>
              
              {/* 以下は変更なし */}
              {isFocused && ((query && searchResults.length > 0) || (!query && searchHistory.length > 0)) && (
                <div className="mt-2 w-full max-w-md bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/50 overflow-hidden max-h-60 overflow-y-auto pointer-events-auto animate-in slide-in-from-top-2">
                  {(query ? searchResults : searchHistory.map(h => ({...h, is_history: true}))).map((item) => (
                    <div key={item.mapbox_id || item.id} onClick={() => handleSelectSuggestion(item)} className="p-4 hover:bg-blue-50 border-b border-gray-100/50 flex items-start gap-3 cursor-pointer transition">
                      <div className="bg-gray-100 p-2 rounded-full mt-0.5 text-gray-500">{getIconForSuggestion(item)}</div>
                      <div className="overflow-hidden text-left"><p className="font-bold text-sm text-gray-800 truncate">{item.name || item.text}</p><p className="text-[10px] text-gray-400 line-clamp-1">{item.full_address || item.place_formatted || item.place_name}</p></div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2 mt-3 overflow-x-auto max-w-full pb-2 px-1 pointer-events-auto no-scrollbar mask-gradient">
                  <button 
                      onClick={() => { 
                          setFilterStatus('all'); 
                          setSheetHeight(140);         
                      }} 
                      className={`px-5 py-2.5 rounded-full text-xs font-black shadow-lg backdrop-blur-md transition border hover:scale-105 active:scale-95 flex items-center gap-1.5 ${filterStatus === 'all' ? 'bg-black text-white border-black' : 'bg-white/90 text-gray-600 border-white hover:bg-white'}`}
                  >
                      ALL
                  </button>
                  <button 
                      onClick={() => { 
                          setFilterStatus('confirmed'); 
                          setSheetHeight(window.innerHeight * 0.65); 
                      }} 
                      className={`px-5 py-2.5 rounded-full text-xs font-black shadow-lg backdrop-blur-md transition border flex items-center gap-1.5 hover:scale-105 active:scale-95 relative ${filterStatus === 'confirmed' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white/90 text-gray-600 border-white hover:bg-white'}`}
                  >
                      <CheckCircle size={14}/> 確定
                      {filterStatus !== 'confirmed' && unreadCounts.confirmed > 0 && (
                          <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white animate-pulse"></span>
                      )}
                  </button>
                  <button 
                      onClick={() => { 
                          setFilterStatus('candidate'); 
                          setSheetHeight(window.innerHeight * 0.65); 
                      }} 
                      className={`px-5 py-2.5 rounded-full text-xs font-black shadow-lg backdrop-blur-md transition border flex items-center gap-1.5 hover:scale-105 active:scale-95 relative ${filterStatus === 'candidate' ? 'bg-yellow-500 text-white border-yellow-500' : 'bg-white/90 text-gray-600 border-white hover:bg-white'}`}
                  >
                      <HelpCircle size={14}/> 候補
                      {filterStatus !== 'candidate' && unreadCounts.candidate > 0 && (
                          <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white animate-pulse"></span>
                      )}
                  </button>
                  <button 
                      onClick={() => { 
                          setFilterStatus('hotel_candidate'); 
                          setSheetHeight(window.innerHeight * 0.65); 
                      }} 
                      className={`px-5 py-2.5 rounded-full text-xs font-black shadow-lg backdrop-blur-md transition border flex items-center gap-1.5 hover:scale-105 active:scale-95 relative ${filterStatus === 'hotel_candidate' ? 'bg-orange-500 text-white border-orange-500' : 'bg-white/90 text-gray-600 border-white hover:bg-white'}`}
                  >
                      <BedDouble size={14}/> 宿
                      {filterStatus !== 'hotel_candidate' && unreadCounts.hotel_candidate > 0 && (
                          <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white animate-pulse"></span>
                      )}
                  </button>
              </div>
            </div>
          )}

         

          {viewMode === 'selected' && selectedResult && (
            <div className="absolute bottom-0 left-0 w-full z-40 p-4 pb-20 pointer-events-none flex justify-center items-end h-full">
              
              {/* ▼▼▼ 修正: モーダル本体のdiv ▼▼▼ */}
              <div 
                  className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl pointer-events-auto overflow-hidden animate-in slide-in-from-bottom-10 border border-gray-100 flex flex-col max-h-[70vh]"
                  style={{ 
                      transform: `translateY(${modalDragY}px)`, 
                      transition: isModalDragging ? 'none' : 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)' 
                  }}
              >
                
                {/* ▼▼▼ 修正: touch-none をクラスに追加 ▼▼▼ */}
  <div 
      className="relative h-32 shrink-0 bg-gray-200 cursor-grab active:cursor-grabbing touch-none" 
      onTouchStart={handleModalTouchStart}
      onTouchMove={handleModalTouchMove}
      onTouchEnd={handleModalTouchEnd}
  >
    {/* ★追加: ドラッグ可能を示すバー（ツマミ） */}
    <div className="absolute top-2 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-white/50 rounded-full z-20 backdrop-blur-sm pointer-events-none"></div>
                  <SpotImage 
                      src={selectedResult.image_url} 
                      alt={selectedResult.text} 
                      className="w-full h-full object-cover"
                      onClick={() => selectedResult.image_url && setExpandedImage(selectedResult.image_url)}
                  />
                  
                  {/* ... (閉じるボタンやグラデーションなどの既存コードはそのまま) ... */}
                  <button 
                    onClick={() => { setSelectedResult(null); setViewMode('default'); }} 
                    className="absolute top-3 right-3 bg-black/40 hover:bg-black/60 text-white p-1.5 rounded-full transition backdrop-blur-sm z-10"
                  >
                    <X size={16}/>
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 p-4 pt-10 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none">
                      {/* ... (タイトル等の既存コード) ... */}
                      <h2 className="text-xl font-black text-white leading-tight truncate">{selectedResult.text}</h2>
                      {isEditingDesc ? (
                          // ...
                          <div className="flex gap-2 mt-1 pointer-events-auto">
                              <input autoFocus value={editDescValue} onChange={(e) => setEditDescValue(e.target.value)} className="flex-1 bg-white/90 text-black text-xs rounded px-2 py-1 outline-none"/>
                              <button onClick={handleSaveDescription} className="bg-blue-600 text-white px-2 py-1 rounded text-xs font-bold">保存</button>
                          </div>
                      ) : (
                          <p className="text-[10px] text-gray-200 flex items-center gap-1 font-medium truncate pointer-events-auto" onClick={() => { setIsEditingDesc(true); setEditDescValue(selectedResult.place_name); }}>
                              <MapPin size={10} className="shrink-0"/> {selectedResult.place_name} <Edit2 size={8} className="opacity-50"/>
                          </p>
                      )}
                  </div>
                </div>

                

                <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-white overscroll-contain">
                  
                 {/* ▼▼▼ 修正: 日程と予約状況を横並びにして省スペース化 ▼▼▼ */}
                  {(() => {
                      const isSpotHotel = isHotel(selectedResult.text) || selectedResult.is_hotel;
                      const showDate = selectedResult.is_saved && selectedResult.id && selectedResult.status !== 'candidate';
                      const showReservation = isSpotHotel && selectedResult.is_saved;

                      if (!showDate && !showReservation) return null;

                      return (
                          <div className="flex gap-2">
                              {showDate && (
                                  <div className={`bg-white p-2 rounded-xl border border-gray-100 shadow-sm flex flex-col justify-center gap-1 ${showReservation ? 'flex-1 items-center' : 'w-full flex-row justify-between items-center px-3'}`}>
                                      <span className="text-[10px] font-bold text-gray-500 flex items-center gap-1">
                                          <Calendar size={12}/> {showReservation ? '日程' : '日程・グループ'}
                                      </span>
                                      <div className="relative">
                                          <select 
                                              value={selectedResult.day || 0} 
                                              onChange={(e) => updateSpotDay(selectedResult, parseInt(e.target.value))}
                                              className={`appearance-none bg-gray-50 border border-gray-200 text-gray-800 text-[10px] font-bold py-1.5 pl-2 pr-6 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 ${showReservation ? 'text-center w-full' : ''}`}
                                          >
                                              <option value={0}>未定</option>
                                              {Array.from({ length: travelDays }).map((_, i) => {
                                                  const dayNum = i + 1;
                                                  // ホテルの場合、最終日は除外＆表記変更
                                                  if (isSpotHotel && dayNum === travelDays) return null;
                                                  const label = isSpotHotel ? `Day ${dayNum}-${dayNum + 1}` : `Day ${dayNum}`;
                                                  return <option key={dayNum} value={dayNum}>{label}</option>;
                                              })}
                                          </select>
                                          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1 text-gray-500">
                                              <ChevronDown size={10} />
                                          </div>
                                      </div>
                                  </div>
                              )}

                              {showReservation && (
                                  <div className="flex-1 bg-white p-2 rounded-xl border border-gray-100 shadow-sm flex flex-col items-center justify-center gap-1">
                                      <span className="text-[10px] font-bold text-gray-500 flex items-center gap-1">
                                          <CalendarCheck size={12}/> 予約
                                      </span>
                                      <ReservationButton 
                                          spot={selectedResult} 
                                          roomId={roomId!} 
                                          onUpdate={handleSpotUpdate} 
                                          currentUser={userName}
                                          compact={true}
                                      />
                                  </div>
                              )}
                          </div>
                      );
                  })()}

                  {selectedResult.is_saved ? (
                      <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 space-y-2">
                           <div className="flex justify-between items-center">
                               <label className="text-[10px] font-bold text-gray-600 uppercase flex items-center gap-1">
                                   <MessageSquare size={10}/> メモ & リンク
                               </label>
                               {!isEditingMemo && (
                                   <button onClick={() => setIsEditingMemo(true)} className="text-blue-600 hover:bg-blue-50 p-1 rounded transition">
                                       <Edit2 size={12}/>
                                   </button>
                               )}
                           </div>

                          {isEditingMemo ? (
                               <div className="space-y-2 animate-in fade-in">
                                   <textarea 
                                       placeholder="メモを入力..." 
                                       value={editCommentValue} 
                                       onChange={(e) => setEditCommentValue(e.target.value)} 
                                       className="w-full bg-white p-2 rounded-lg text-xs border border-gray-600 focus:ring-2 focus:ring-blue-100 outline-none resize-none h-16"
                                   />
                                   {/* ★追加: 金額入力欄 */}
                                   <div className="relative">
                                       <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14}/>
                                       <input 
                                           type="number"
                                           placeholder={selectedResult.is_hotel || isHotel(selectedResult.text) ? "宿泊費 (例: 12000)" : "予算 (例: 1500)"}
                                           value={editPriceValue} 
                                           onChange={(e) => setEditPriceValue(e.target.value)} 
                                           className="w-full bg-white p-2 pl-9 rounded-lg text-xs border border-gray-600 focus:ring-2 focus:ring-blue-100 outline-none"
                                       />
                                   </div>

                                   <input 
                                       type="text"
                                       placeholder="URL" 
                                       value={editLinkValue} 
                                       onChange={(e) => setEditLinkValue(e.target.value)} 
                                       className="w-full bg-white p-2 rounded-lg text-xs border border-gray-600 focus:ring-2 focus:ring-blue-100 outline-none"
                                   />
                                   <div className="flex gap-2">
                                       <button onClick={() => setIsEditingMemo(false)} className="flex-1 py-1.5 rounded-lg text-[10px] font-bold text-gray-600 bg-gray-600">キャンセル</button>
                                       <button onClick={handleSaveMemo} className="flex-1 py-1.5 rounded-lg text-[10px] font-bold text-white bg-blue-600">保存</button>
                                   </div>
                               </div>
                           ) : (
                               <div className="space-y-1.5">
                                   {selectedResult.comment ? (
                                       <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">{selectedResult.comment}</p>
                                   ) : (
                                       <span className="text-[10px] text-gray-400 italic">メモなし</span>
                                   )}
                                   
                                   {/* ★追加: 金額表示 */}
                                  {/* page.tsx 1770行目付近：詳細パネル内 */}

{/* ★修正：price が存在し、かつ 0 より大きい場合のみ表示 */}
{(selectedResult.price && selectedResult.price > 0) && (
    <div className="flex items-center gap-1 text-[10px] font-bold text-yellow-700 bg-yellow-50 px-2 py-1.5 rounded-lg border border-yellow-100 w-fit">
        <Banknote size={12}/> 
        <span>¥{Number(selectedResult.price).toLocaleString()}</span>
    </div>
)}

                                   {selectedResult.link && (
                                       <a href={selectedResult.link} target="_blank" className="flex items-center gap-1.5 text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1.5 rounded-lg hover:bg-blue-100 transition w-fit max-w-full">
                                           <LinkIcon size={10} className="shrink-0"/> <span className="truncate">{selectedResult.link}</span>
                                       </a>
                                   )}
                               </div>
                           )}
                      </div>
                  ) : (
                      <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                          <div className="flex items-center gap-2 mb-1 cursor-pointer" onClick={() => setIsEditingMemo(!isEditingMemo)}>
                              <Plus size={12} className="text-gray-400"/>
                              <span className="text-xs font-bold text-gray-600">メモ・リンクを追加 (任意)</span>
                              <ChevronDown size={12} className={`text-gray-600 transition-transform ${isEditingMemo ? 'rotate-180' : ''}`}/>
                          </div>
                          {isEditingMemo && (
                              <div className="space-y-2 pt-2 animate-in slide-in-from-top-1">
                                  <textarea placeholder="メモ..." value={editCommentValue} onChange={(e) => setEditCommentValue(e.target.value)} className="w-full bg-white p-2 rounded-lg text-xs border border-gray-600 outline-none resize-none h-12"/>
                                  <input type="text" placeholder="URL" value={editLinkValue} onChange={(e) => setEditLinkValue(e.target.value)} className="w-full bg-white p-2 rounded-lg text-xs border border-gray-600 outline-none"/>
                              </div>
                          )}
                      </div>
                  )}
                  
                  {selectedResult.is_saved && selectedResult.id && (
                      <div className="flex items-center justify-between bg-white p-2 rounded-xl border border-gray-600 shadow-sm gap-2">
                          <div 
                              className="flex-1 overflow-x-auto no-scrollbar flex items-center gap-1 pl-1 mr-2 mask-gradient-r cursor-pointer active:opacity-70 transition"
                              onClick={() => setShowVoterListModal(true)}
                          >
                              {selectedResult.voters.length > 0 ? (
                                  selectedResult.voters.map((voter: string) => (
                                      <div 
                                          key={voter} 
                                          className="px-2.5 py-1 rounded-full text-[10px] font-bold text-white shadow-sm whitespace-nowrap shrink-0 border border-white/20" 
                                          style={{ backgroundColor: getUserColor(voter) }}
                                      >
                                          {voter.slice(0, 3)}
                                      </div>
                                  ))
                              ) : <span className="text-[10px] text-gray-400 pl-1 font-bold">投票なし</span>}
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                              <button 
                                  onClick={() => handleToggleVote(selectedResult.id)} 
                                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition flex items-center gap-1 ${
                                      selectedResult.voters.includes(userName) 
                                      ? 'bg-red-50 text-red-500 border border-red-100' 
                                      : 'bg-black text-white shadow-md'
                                  }`}
                              >
                                  {selectedResult.voters.includes(userName) ? '投票取消' : <><ThumbsUp size={10}/> 投票</>}
                              </button>
                          </div>
                      </div>
                  )}

                  <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                      {selectedResult.is_saved && (selectedResult.status === 'candidate' || selectedResult.status === 'hotel_candidate') && (
    <button 
        onClick={(e) => { e.stopPropagation(); handleStatusChangeClick(selectedResult, 'confirmed'); }} 
        // ▼▼▼ 修正: bg-black → bg-blue-600, hover:bg-gray-800 → hover:bg-blue-700
        className="flex items-center gap-1 bg-blue-600 text-white px-3 py-2 rounded-lg text-[10px] font-bold hover:bg-blue-700 transition whitespace-nowrap shrink-0 shadow-sm"
    >
        <CheckCircle size={12}/> 確定にする
    </button>
)}
                      
                     {selectedResult.is_saved && selectedResult.status === 'confirmed' && (
                          <button 
                              // ▼▼▼ 修正: 宿判定を追加し、引数を変える
                              onClick={(e) => { 
                                  e.stopPropagation(); 
                                  const isSpotHotel = isHotel(selectedResult.text) || selectedResult.is_hotel;
                                  const nextStatus = isSpotHotel ? 'hotel_candidate' : 'candidate';
                                  handleStatusChangeClick(selectedResult, nextStatus); 
                              }} 
                              className="flex items-center gap-1 bg-gray-100 text-gray-600 px-3 py-2 rounded-lg text-[10px] font-bold hover:bg-gray-200 transition whitespace-nowrap shrink-0 border border-gray-200"
                          >
                              <ArrowLeftCircle size={12}/> 
                              {/* 表示文言も少し調整（任意） */}
                              {(isHotel(selectedResult.text) || selectedResult.is_hotel) ? '宿リストに戻す' : '候補に戻す'}
                          </button>
                      )}

                    

{/* ▼▼▼ 修正: 楽天とそれ以外でボタンを出し分け ▼▼▼ */}
{/* ▼▼▼ 修正: 詳細モーダル内のボタン出し分け ▼▼▼ */}
                      {/* page.tsx 1850行目付近 */}

{(isHotel(selectedResult.text) || selectedResult.is_hotel) && (
    selectedResult.source === 'external_link' ? (
        // 外部サイト（Airbnb, 公式, etc）の場合
        <button 
            onClick={() => window.open(selectedResult.url, '_blank')} 
            className="flex items-center gap-1 bg-gray-900 text-white px-3 py-2 rounded-lg text-[10px] font-bold hover:bg-gray-700 transition whitespace-nowrap shrink-0 shadow-sm"
        >
            元のサイトで見る <ExternalLink size={12}/>
        </button>
    ) : (
        // 楽天トラベルの場合
        <button 
            onClick={() => window.open(getAffiliateUrl(selectedResult), '_blank')} 
            className="flex items-center gap-1 bg-[#BF0000] text-white px-3 py-2 rounded-lg text-[10px] font-bold hover:bg-[#900000] transition whitespace-nowrap shrink-0 shadow-sm"
        >
            <span className="opacity-75 text-[9px] border border-white/50 px-0.5 rounded-[2px] mr-0.5">PR</span>
            楽天で見る <ExternalLink size={12}/>
        </button>
    )
)}
                      {/* ▲▲▲ 修正ここまで ▲▲▲ */}
{/* ▲▲▲ 修正ここまで ▲▲▲ */}

                      <a 
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedResult.text)}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 bg-gray-100 px-3 py-2 rounded-lg text-[10px] font-bold text-gray-600 hover:bg-gray-200 transition whitespace-nowrap shrink-0"
                      >
                          <MapPinned size={12}/> Google Maps
                      </a>
                      
                      <a 
                          href={`https://www.google.com/search?q=${encodeURIComponent(selectedResult.text)}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 bg-blue-50 px-3 py-2 rounded-lg text-[10px] font-bold text-blue-600 hover:bg-blue-100 transition whitespace-nowrap shrink-0"
                      >
                          <Globe size={12}/> Web検索
                      </a>

                      {selectedResult.link && (
                          <a href={selectedResult.link} target="_blank" className="flex items-center gap-1 bg-green-50 px-3 py-2 rounded-lg text-[10px] font-bold text-green-600 hover:bg-green-100 transition whitespace-nowrap shrink-0">
                              <LinkIcon size={12}/> 公式/参考
                          </a>
                      )}
                  </div>
                </div>

                <div className="p-4 bg-gray-50 border-t border-gray-100 shrink-0">
                  {selectedResult.is_saved ? (
                      /* ▼▼▼ 修正: 追加ボタン（左）と削除ボタン（右） ▼▼▼ */
                      <div className="flex gap-2">
                          <button 
                              onClick={() => { 
                                  // ★修正: いきなり addSpot せず、複製用Stateにセットしてモーダルを出す
                                  setSpotToDuplicate(selectedResult);
                              }} 
                              className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-blue-700 transition active:scale-95 shadow-lg"
                          >
                              {/* 何か所目かを計算して表示 */}
                              <Plus size={16}/> {planSpots.filter(s => s.name === selectedResult.text).length + 1}か所目として追加
                          </button>
                          
                          <button 
                              onClick={() => removeSpot(selectedResult)} 
                              // ... (削除ボタンのclassなどはそのまま)
                              className="w-1/3 bg-white text-red-500 border border-red-100 py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-red-50 transition active:scale-95 shadow-sm"
                          >
                              <Trash2 size={14}/> 削除
                          </button>
                      </div>
                      /* ▲▲▲ 修正ここまで ▲▲▲ */
                      /* ▲▲▲ 修正ここまで ▲▲▲ */
                  ) : (
                     <button
    onClick={() => { 
        addSpot({ 
            name: selectedResult.text, 
            description: selectedResult.place_name, 
            // ▼▼▼ 修正: 座標のフォールバックを追加
            coordinates: selectedResult.center || selectedResult.coordinates, 
            // ▼▼▼ 追加: 画像とホテル情報も保存
            image_url: selectedResult.image_url,
            is_hotel: selectedResult.is_hotel,
            status: 'candidate' 
        }); 
        setSelectedResult((prev: any) => ({...prev, is_saved: true})); 
    }} 
    className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg hover:bg-blue-700 transition active:scale-95"
>
    <Plus size={16}/> リストに追加
</button>
                  )}
                </div>

              </div>
            </div>
          )}

         {filterStatus !== 'all' && (
              <div 
                className={`absolute left-0 right-0 z-30 bg-white/90 backdrop-blur-xl shadow-[0_-5px_30px_rgba(0,0,0,0.1)] flex flex-col rounded-t-[2rem] border-t border-white/50`}
                style={{ 
                    height: `${sheetHeight}px`, 
                    bottom: 0,
                    marginBottom: 0,
                    transition: isDragging ? 'none' : 'height 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)', 
                    overscrollBehavior: 'none'
                }}
              >
                  {/* ヘッダー部分 */}
                  <div className="flex items-center justify-between px-4 py-3 shrink-0 gap-3 border-b border-gray-100/50 cursor-grab active:cursor-grabbing" 
                      onTouchStart={handleDragStart}
                      onTouchMove={handleDragMove}
                      onTouchEnd={handleDragEnd}
                      onMouseDown={handleDragStart}
                      onMouseMove={handleDragMove}
                      onMouseUp={handleDragEnd}
                      onMouseLeave={handleDragEnd}
                      onClick={handleHeaderClick}
                      style={{ touchAction: 'none' }} 
                  >
                      {/* ツマミ */}
                      <div className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1 bg-gray-300 rounded-full pointer-events-none"></div>
                      
                      <div 
                          className="flex-1 overflow-x-auto no-scrollbar flex items-center gap-2 mask-gradient-r"
                          style={{ touchAction: 'pan-x' }}
                      >
                          {/* 確定・候補・宿（すべて共通でDayボタンを表示） */}
                          {/* 確定・候補・宿の切り替えタブ */}
                          {(filterStatus === 'confirmed' || filterStatus === 'candidate' || filterStatus === 'hotel_candidate') ? (
                              <>
                                  {/* ▼▼▼ 追加: 候補リストの場合だけ「エリア」ボタンを表示 ▼▼▼ */}
                                  {filterStatus === 'candidate' ? (
                                      <>
                                          {/* ▼▼▼ 追加: 区分切替ボタン ▼▼▼ */}
                                          <button 
                                              onClick={(e) => { e.stopPropagation(); toggleGroupingMode(); }}
                                              className="px-3 py-2 rounded-full text-[10px] font-bold whitespace-nowrap transition border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-200 flex items-center gap-1 shrink-0"
                                          >
                                              <MapPinned size={12}/>
                                              {groupingMode === 'city' ? '市町村' : '県別'}
                                          </button>
                                          
                                          {/* 区切り線 */}
                                          <div className="w-px h-6 bg-gray-200 shrink-0 mx-1"></div>

                                         {/* ▼▼▼ 既存: 「すべて」ボタン ▼▼▼ */}
                                          {/* ▼▼▼ 修正: 「すべて」ボタン (確定ホテルを除外してカウント) ▼▼▼ */}
                                          <button 
                                              onClick={(e) => { e.stopPropagation(); setSelectedCandidateArea('all'); }}
                                              className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition border flex-shrink-0 flex items-center gap-1 relative ${
                                                  selectedCandidateArea === 'all'
                                                  ? 'bg-yellow-500 text-white border-yellow-500'
                                                  : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-100'
                                              }`}
                                          >
                                              すべて <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${selectedCandidateArea === 'all' ? 'bg-white/20' : 'bg-gray-100'}`}>
                                                  {planSpots.filter(s => s.status === 'candidate' || (s.status === 'confirmed' && !s.is_hotel && !isHotel(s.name))).length}
                                              </span>
                                          </button>

                                          {/* ▼▼▼ 修正: エリア別ボタンリスト (確定ホテルを除外してカウント) ▼▼▼ */}
                                          {candidateAreas.map((area) => {
    const isActive = selectedCandidateArea === area;
    // ★修正: spotsByCity から直接長さを取得（高速＆名寄せ反映）
    const count = spotsByCity[area]?.length || 0;
    
    return (
        <button
                                                      key={area}
// ... (後略)
                                                      // ... (省略) ...
                                                      onClick={(e) => { e.stopPropagation(); setSelectedCandidateArea(area); }}
                                                      className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition border flex-shrink-0 flex items-center gap-1 relative ${
                                                          isActive 
                                                          ? 'bg-yellow-500 text-white border-yellow-500' 
                                                          : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-100'
                                                      }`}
                                                  >
                                                      {area}
                                                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white/20' : 'bg-gray-100'}`}>
                                                          {count}
                                                      </span>
                                                  </button>
                                              );
                                          })}
                                      </>
                                  ) : (
                                    // ...既存のDayボタン処理...
                                      /* ▼▼▼ 既存の Dayボタン (確定リスト・宿リスト用) ▼▼▼ */
                                      <>
                                          <button 
                                              onClick={(e) => { 
                                                  e.stopPropagation(); 
                                                  if (filterStatus === 'confirmed') setSelectedConfirmDay(0);
                                                  else setSelectedHotelDay(0);
                                              }}
                                              className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition border flex-shrink-0 flex items-center gap-1 relative ${
                                                  (filterStatus === 'confirmed' ? selectedConfirmDay : selectedHotelDay) === 0 
                                                  ? (filterStatus === 'confirmed' ? 'bg-blue-600 text-white border-blue-600' : 'bg-orange-500 text-white border-orange-500')
                                                  : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-100'
                                              }`}
                                          >
                                              未定 <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${(filterStatus === 'confirmed' ? selectedConfirmDay : selectedHotelDay) === 0 ? 'bg-white/20' : 'bg-gray-100'}`}>
                                                  {/* 宿リストの場合は、確定済みホテルも含めてカウントする */}
                                                  {filterStatus === 'hotel_candidate' 
                                                    ? planSpots.filter(s => (s.status === 'hotel_candidate' || (s.status === 'confirmed' && (s.is_hotel || isHotel(s.name)))) && (!s.day || s.day === 0)).length
                                                    : planSpots.filter(s => s.status === filterStatus && (!s.day || s.day === 0)).length
                                                  }
                                              </span>
                                          </button>

                                          {Array.from({ length: travelDays }).map((_, i) => {
                                              const dayNum = i + 1;
                                              let isActive = false;
                                              if (filterStatus === 'confirmed') isActive = selectedConfirmDay === dayNum;
                                              else isActive = selectedHotelDay === dayNum;

                                              if (filterStatus === 'hotel_candidate' && dayNum === travelDays) return null;

                                              let activeClass = 'bg-blue-600 text-white border-blue-600';
                                              if (filterStatus === 'hotel_candidate') activeClass = 'bg-orange-500 text-white border-orange-500';

                                              const label = filterStatus === 'hotel_candidate' ? `Day ${dayNum}-${dayNum+1}` : `Day ${dayNum}`;
                                              
                                              // ★修正: 宿リストの場合は、確定済みホテルも含めてカウントする
                                              const spotCount = filterStatus === 'hotel_candidate'
                                                ? planSpots.filter(s => (s.status === 'hotel_candidate' || (s.status === 'confirmed' && (s.is_hotel || isHotel(s.name)))) && s.day === dayNum).length
                                                : planSpots.filter(s => s.status === filterStatus && s.day === dayNum).length;
                                              return (
                                                  <button 
                                                    key={dayNum}
                                                    onClick={(e) => { 
                                                        e.stopPropagation(); 
                                                        if (filterStatus === 'confirmed') setSelectedConfirmDay(dayNum);
                                                        else setSelectedHotelDay(dayNum);
                                                    }}
                                                    className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition border flex-shrink-0 flex items-center gap-1 relative ${isActive ? activeClass : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-100'}`}
                                                  >
                                                    {label}
                                                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white/20' : 'bg-gray-100'}`}>
                                                        {spotCount}
                                                    </span>
                                                  </button>
                                              );
                                          })}
                                      </>
                                  )}
                              </>
                          ) : null}
                      </div>

                      <div className="flex items-center gap-2">
                        {filterStatus === 'confirmed' && selectedConfirmDay > 0 && (
                            <>
                                <button 
                                    onClick={(e) => { 
                                        e.stopPropagation(); 
                                        setCurrentTab('plan'); 
                                        setAutoShowScreenshot(true); 
                                    }}
                                    className="p-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-600 rounded-full transition shrink-0 shadow-sm active:scale-90"
                                    title="行程表を画像保存"
                                >
                                    <Camera size={16}/>
                                </button>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); setCurrentTab('plan'); }}
                                    className="p-2 bg-indigo-600 hover:bg-indigo-700 rounded-full text-white transition shrink-0 shadow-sm active:scale-90"
                                    title="旅程を編集"
                                >
                                    <Edit3 size={16}/>
                                </button>
                            </>
                        )}
                        <button 
                            onClick={(e) => { e.stopPropagation(); setSheetHeight(sheetHeight > 300 ? 140 : window.innerHeight * 0.65); }}
                            className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-500 transition shrink-0 active:scale-90"
                        >
                            {sheetHeight > 300 ? <ChevronDown size={20}/> : <ChevronUp size={20}/>}
                        </button>
                      </div>
                  </div>

                  {/* List content */}
                  
                  <div 
    ref={timelineListRef} // ★ここに追加
    className="flex-1 overflow-y-auto p-4 space-y-3 pb-32 bg-gray-50/50"
>    
                      {/* ★追加: 未判定の候補がある場合、提案ページへの誘導ボタンを表示 */}
                      {filterStatus === 'candidate' && candidates.length > 0 && (
                          <div 
                              onClick={() => setCurrentTab('swipe')}
                              className="block w-full mb-1 group cursor-pointer"
                          >
                              <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm flex items-center justify-between hover:bg-indigo-50/50 hover:border-indigo-200 transition active:scale-[0.98]">
                                  <div className="flex items-center gap-3">
                                      <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white shrink-0 shadow-sm">
                                          <Sparkles size={18} />
                                      </div>
                                      <div className="flex flex-col">
                                          <div className="flex items-center gap-1 mb-0.5">
                                              <span className="bg-red-100 text-red-600 px-1.5 py-[1px] rounded-[3px] text-[8px] font-black leading-none animate-pulse">NEW</span>
                                              <span className="text-[10px] font-bold text-gray-500">AI提案・新着スポット</span>
                                          </div>
                                          <span className="text-sm font-bold text-gray-800 group-hover:text-indigo-600 transition-colors">提案ページで投票する ({candidates.length}件)</span>
                                      </div>
                                  </div>
                                  <div className="bg-gray-50 p-2 rounded-full group-hover:bg-indigo-600 group-hover:text-white transition-colors text-gray-400">
                                      <ThumbsUp size={16} />
                                  </div>
                              </div>
                          </div>
                      )}

                      {filterStatus === 'hotel_candidate' && (
                          // ... 既存の楽天ボタン ...
                          <a 
                            href={rakutenHomeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => logAffiliateClick("楽天トラベルトップ", "hotel_list_banner")}
                            className="block w-full mb-1 group cursor-pointer no-underline"
                        >
                              <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm flex items-center justify-between hover:bg-orange-50/50 hover:border-orange-200 transition active:scale-[0.98]">
                                  <div className="flex items-center gap-3">
                                      <div className="w-10 h-10 bg-[#BF0000] rounded-full flex items-center justify-center text-white shrink-0 shadow-sm">
                                          <span className="font-black text-[8px] tracking-tighter">Rakuten</span>
                                      </div>
                                      <div className="flex flex-col">
                                          <div className="flex items-center gap-1 mb-0.5">
                                              <span className="border border-gray-300 text-gray-400 px-1 py-[1px] rounded-[3px] text-[8px] font-medium leading-none">PR</span>
                                              <span className="text-[10px] font-bold text-gray-500">楽天トラベル</span>
                                          </div>
                                          <span className="text-sm font-bold text-gray-800 group-hover:text-[#BF0000] transition-colors">公式サイトで宿を検索する</span>
                                      </div>
                                  </div>
                                  <div className="bg-gray-50 p-2 rounded-full group-hover:bg-[#BF0000] group-hover:text-white transition-colors text-gray-400">
                                      <ExternalLink size={16} />
                                  </div>
                              </div>
                          </a>
                      )}
                      
                      {filteredSpots.length === 0 ? (
                          <div className="text-center text-gray-400 py-12 text-sm font-bold opacity-50">
                              {filterStatus === 'confirmed' ? (
                                  <>スポットがありません<br/>候補リストから追加してください</>
                              ) : filterStatus === 'hotel_candidate' ? (
                                  <>スポットがありません<br/>囲って検索か、ホテルページより<br/>URLで追加してください</>
                              ) : filterStatus === 'candidate' ? (
                                  <>スポットがありません<br/>マップかAI提案から追加してください</>
                              ) : (
                                  <>スポットがありません<br/>マップから追加してください</>
                              )}
                          </div>
                     ) : (
                          (() => {
                              // 表示対象のDayを判定
                              let targetDay = -1; 
                              if (filterStatus === 'confirmed') targetDay = selectedConfirmDay;
                              // ▼▼▼ 修正: candidate の分岐を削除 (エリア分けになったためDay判定不要) ▼▼▼
                              else if (filterStatus === 'hotel_candidate') targetDay = selectedHotelDay;

                              // スポットをフィルタリング (Dayで絞り込み)
                              let displaySpots = filteredSpots;

                              if (targetDay !== -1 && displaySpots.length === 0) {
                                  return <div className="text-center text-gray-400 py-10 text-xs font-medium">この日のスポットはまだありません</div>;
                              }

                              if (filterStatus === 'confirmed' && targetDay > 0) {
                                  if (displayTimeline.length === 0) return <div className="text-center text-gray-400 py-10 text-xs font-medium">ロード中...</div>;
                                  return (
                                      <div className="animate-in slide-in-from-bottom-4 fade-in duration-300 relative pl-4 pb-10">
                                          <div className="absolute left-[19px] top-4 bottom-4 w-[2px] bg-gray-200 z-0"></div>

                                        {/* 確定リスト（タイムライン） */}
                                        {displayTimeline.map((item, idx) => {
                                            if (item.type === 'spot') {
                                                const spot = item.spot;
                                                const voteCount = spotVotes.filter((v: any) => String(v.spot_id) === String(spot.id) && v.vote_type === 'like').length;
                                                const isSpotHotel = isHotel(spot.name) || spot.is_hotel;
                                                // const isNew = isNewSpot(spot);
                                                const isNew = isHighlighted(spot);
                                                const visitOrder = displayTimeline.slice(0, idx + 1).filter(t => t.type === 'spot').length;

                                             return (
                                                    <div 
                                                       // ★修正: keyは必ず一意なIDを使う（無ければidxだが、基本ID推奨）
                key={spot.id ? `spot-${spot.id}` : `spot-idx-${idx}`} 
                id={`spot-item-${spot.id}`}
                                                       
                                                        className={`relative z-10 mb-4 pl-8 group transition-all duration-200 ${
                                                            draggedTimelineIndex === idx ? 'opacity-40 scale-[0.98]' : 'opacity-100'
                                                        }`}
                                                        // ドラッグイベントのバインド
                                                        draggable={true}
                                                        onDragStart={(e) => onTimelineDragStart(e, idx)}
                                                        onDragOver={onTimelineDragOver}
                                                        onDrop={(e) => onTimelineDrop(e, idx)}
                                                        onDragEnd={() => setDraggedTimelineIndex(null)}
                                                    >
                                                        {/* 到着時刻 */}
                                                        {/* 到着時刻 (整合性チェック付き) */}
{(() => {
    // ★追加: 時間が未設定の場合は '?' を表示して終了
    if (!item.arrival) {
        return (
            <div className="absolute left-[-16px] top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white border-2 border-gray-200 text-gray-400 flex items-center justify-center font-bold text-[12px] shadow-sm z-20">
                ?
            </div>
        );
    }
    let isInconsistent = false;
    try {
        const prevTravel = displayTimeline[idx - 1];
        const prevSpot = displayTimeline[idx - 2];

        if (prevTravel && prevTravel.type === 'travel' && prevSpot && prevSpot.type === 'spot' && prevSpot.departure && item.arrival) {
            const [pH, pM] = prevSpot.departure.split(':').map(Number);
            const [cH, cM] = item.arrival.split(':').map(Number);
            const travelMin = prevTravel.duration_min || 0;
            
            const expectedMin = (pH * 60 + pM + travelMin) % 1440;
            const currentMin = (cH * 60 + cM) % 1440;
            
            if (expectedMin !== currentMin) {
                isInconsistent = true;
            }
        }
    } catch (e) {
        // 計算エラー時は無視
    }

    return (
        <div className={`absolute left-[-16px] top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white border-2 flex items-center justify-center font-bold text-[10px] shadow-sm z-20 ${
            isInconsistent 
            ? "border-red-500 text-red-500 underline decoration-red-500 decoration-wavy" // 矛盾時は赤
            : "border-indigo-600 text-indigo-600" // 通常時は青
        }`}>
            {item.arrival.split(':')[0]}:{item.arrival.split(':')[1]}
        </div>
    );
})()}

                                                        {/* スポットカード本体 */}
                                                        <div 
                                                            className={`rounded-xl shadow-sm border overflow-hidden flex min-h-16 transition active:scale-[0.98] cursor-grab active:cursor-grabbing hover:border-indigo-300 ${
                                                                // ★修正: 新着なら黄色背景と太枠
                                                                isNew 
                                                                    ? 'bg-yellow-50 border-yellow-400 ring-2 ring-yellow-200' 
                                                                    : 'bg-white border-gray-100'
                                                            }`}
                                                            onClick={() => handlePreviewSpot(spot)}
                                                        >
                                                            {/* ★追加: NEWバッジ */}
                                                            {isNew && (
                                                                <div className="absolute -top-1 -right-1 z-20 bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow-sm animate-bounce">
                                                                    N
                                                                </div>
                                                            )}
                                                            
                                                            <div className="w-16 bg-gray-100 shrink-0 relative">
                                                                <div className="absolute top-1 left-1 bg-blue-600 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded shadow-sm border border-white/50 z-10">
                                                                    {visitOrder}
                                                                </div>
                                                                <SpotImage src={spot.image_url || item.image} alt="" className="w-full h-full"/>
                                                            </div>
                                                            
                                                            <div className="flex-1 p-2 flex flex-col justify-between overflow-hidden">
    <div className="flex justify-between items-start gap-2">
        <h3 className="font-bold text-gray-800 text-xs truncate flex-1 leading-snug">{spot.name}</h3>
        
       {/* ★★★ ここに追加: 宿なら予約ボタンを表示 ★★★ */}
        {isSpotHotel && (
            <ReservationButton 
                spot={spot} 
                roomId={roomId!} 
                onUpdate={handleSpotUpdate} 
                currentUser={userName}
                compact={true}
            />
        )}
        
        {voteCount > 0 && <span className="flex items-center gap-0.5 text-[9px] font-bold text-blue-500 bg-blue-50 px-1 py-0.5 rounded ml-1 shrink-0"><ThumbsUp size={8}/> {voteCount}</span>}
    </div>
                                                                
                                                               <div className="flex justify-between items-end gap-2 mt-1">
                                                                    {/* 左側: タグ（時間・金額・リンク）とメモ */}
                                                                    <div className="flex flex-col gap-1 overflow-hidden flex-1 min-w-0">
                                                                        {/* タグ表示行 */}
                                                                        <div className="flex flex-wrap gap-1 items-center">
                                                                            {/* 滞在時間 */}
                                                                            {/* 滞在時間 (自動計算に変更) */}
{/* 滞在時間 (自動計算 + 警告表示) */}
{/* 滞在時間 (自動計算 + 整合性チェック) */}
{/* 滞在時間 (自動計算 + 整合性チェック) */}
                                                                            <div className="text-[10px] truncate flex items-center gap-1 shrink-0 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">
                                                                                <Clock size={10} className="text-gray-400"/>
                                                                                {(() => {
                                                                                    // 安全策: データがない場合はデフォルト表示
                                                                                    if (!item.arrival || !item.departure) {
                                                                                         // ★修正1: データ不足時は「?分」
                                                                                         return <span className="text-gray-400">{(item.stay_min && item.stay_min > 0) ? `${item.stay_min}分` : '?分'}</span>;
                                                                                    }

                                                                                    try {
                                                                                        // 1. 滞在時間の計算 (マイナスチェック)
                                                                                        const [sH, sM] = item.arrival.split(':').map(Number);
                                                                                        const [eH, eM] = item.departure.split(':').map(Number);
                                                                                        const diff = (eH * 60 + eM) - (sH * 60 + sM);
                                                                                        
                                                                                        const isNegative = diff < 0; // マイナスかどうか
                                                                                        
                                                                                        const abs = Math.abs(diff);
                                                                                        const h = Math.floor(abs / 60);
                                                                                        const m = abs % 60;
                                                                                        const sign = isNegative ? "-" : "";
                                                                                        
                                                                                        let text = `${sign}${m}分`;
                                                                                        if (h > 0) {
                                                                                            text = `${sign}${h}時間${m > 0 ? m + "分" : ""}`;
                                                                                        }
                                                                                        
                                                                                        // ... (中略: 整合性チェックなどはそのまま) ...

                                                                                        // 赤くするかどうかの判定
                                                                                        const isWarning = isNegative ;

                                                                                        return (
                                                                                            <span className={`font-medium ${
                                                                                                isWarning
                                                                                                ? 'text-red-500 underline decoration-red-500 decoration-wavy'
                                                                                                : 'text-gray-400'
                                                                                            }`}>
                                                                                                {text}
                                                                                            </span>
                                                                                        );
                                                                                    } catch (e) {
                                                                                        // エラー時は安全に元の分数を表示
                                                                                        // ★修正2: エラー時も「?分」対応
                                                                                        return <span className="text-gray-400">{(item.stay_min && item.stay_min > 0) ? `${item.stay_min}分` : '?分'}</span>;
                                                                                    }
                                                                                })()}
                                                                            </div>

                                                                            {/* 金額 (price優先) */}
                                                                            {/* page.tsx 1850行目付近：タイムライン（確定リスト）内 */}

{/* ★修正：こちらも同様に price > 0 で判定 */}
{(spot.price && spot.price > 0) && (
    <div className="flex items-center gap-1 text-[10px] font-bold text-yellow-700 bg-yellow-50 px-1.5 py-0.5 rounded border border-yellow-100 shrink-0">
        <Banknote size={10}/> ¥{Number(spot.price).toLocaleString()}
    </div>
)}

                                                                            {/* ユーザー追加リンク */}
                                                                            {spot.link && (
                                                                                <a 
                                                                                    href={spot.link} 
                                                                                    target="_blank" 
                                                                                    rel="noopener noreferrer" 
                                                                                    onClick={(e) => e.stopPropagation()}
                                                                                    className="flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 shrink-0 hover:bg-blue-100 transition"
                                                                                >
                                                                                    <LinkIcon size={10}/> リンク
                                                                                </a>
                                                                            )}
                                                                        </div>

                                                                        {/* テキスト行 (メモ or 説明) */}
                                                                        {spot.comment ? (
    <span className="text-[10px] text-gray-600 font-medium truncate flex-1 flex items-center gap-1">
        <MessageSquare size={10} className="shrink-0 text-gray-400"/> 
        {/* ★修正: 10文字制限を追加 */}
        {spot.comment.length > 10 ? spot.comment.slice(0, 10) + "..." : spot.comment}
    </span>
) : (
    <span className="text-[10px] text-gray-300 truncate flex-1">{spot.description}</span>
)}
                                                                    </div>

                                                                    {/* 右側: アクションボタン */}
                                                                   {/* page.tsx 1485行目付近：確定リストの「アクションボタン」エリアを書き換え */}

<div className="flex gap-1 items-center shrink-0 mb-0.5">
    {/* ★ 追加：地図ズームボタン */}
    <button 
        onClick={(e) => handleLocateOnMap(e, spot)}
        className="text-gray-400 hover:text-indigo-600 transition p-1.5 bg-gray-50 rounded-lg border border-gray-100"
        title="地図で場所を確認"
    >
        <MapPinned size={14}/>
    </button>

    {isSpotHotel && (
        <button 
            onClick={(e) => { e.stopPropagation(); window.open(getAffiliateUrl(spot), '_blank'); }}
            className="flex items-center gap-1 bg-[#BF0000] text-white px-2 py-0.5 rounded text-[9px] font-bold hover:bg-[#900000] transition shrink-0 shadow-sm"
        >
            <span className="opacity-75 text-[8px] border border-white/50 px-0.5 rounded-[2px]">PR</span>
            楽天 <ExternalLink size={8}/>
        </button>
    )}
    <button onClick={(e) => { e.stopPropagation(); removeSpot(spot); }} className="text-gray-300 hover:text-red-500 transition p-1"><Trash2 size={12}/></button>
</div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                       } else if (item.type === 'travel') {
    const mode = TRANSPORT_MODES.find(m => m.id === (item.transport_mode || 'car')) || TRANSPORT_MODES[0];
    
    // ▼▼▼ 修正: 0分または未設定の場合は「?」を表示する判定に変更 ▼▼▼
    // const isTimeSet = idx > 0 && displayTimeline[idx - 1]?.departure; // ← 以前のロジック（削除）

    const durationVal = Number(item.duration_min || 0);
    const hasDuration = durationVal > 0;

    return (
        <div 
            key={`travel-${idx}`} 
            className="relative pl-8 pb-4"
            onDragOver={onTimelineDragOver}
            onDrop={(e) => onTimelineDrop(e, idx + 1)} 
        >
            <div className="absolute left-[-1px] top-0 bottom-0 w-0.5 bg-gray-200"></div>
            <div className="ml-4 flex flex-col gap-1">
                {/* 移動手段と時間 */}
                <div className="flex items-center gap-2 text-xs text-gray-400 font-bold bg-gray-50 px-2 py-1 rounded w-max border border-gray-100">
                    {mode.icon}
                    {/* ▼▼▼ 修正: 0より大きい場合のみ数値を表示、それ以外は '?' ▼▼▼ */}
                    <span>{hasDuration ? durationVal : '?'}分 移動</span>
                </div>

                                                            {/* 詳細情報タグ (時間・金額・リンク・メモ) */}
                                                            {!!(item.transport_departure || item.transport_arrival || item.cost || item.url || item.note) && (    <div className="flex flex-col gap-1 mt-0.5">
                                                                    <div className="flex flex-wrap gap-1 items-center">
                                                                        {/* 出発・到着時間 */}
                                                                     {!!(item.transport_departure || item.transport_arrival || item.cost || item.url || item.note) && (
                                                                            <div className="flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 shrink-0">
                                                                                <Clock size={10}/>
                                                                                {item.transport_departure && <span>{item.transport_departure}発</span>}
                                                                                {item.transport_departure && item.transport_arrival && <span className="text-indigo-300 mx-0.5">→</span>}
                                                                                {item.transport_arrival && <span>{item.transport_arrival}着</span>}
                                                                            </div>
                                                                        )}

                                                                        {/* 金額 */}
                                                                       
{/* 修正前: {item.cost && ( ... )} */}


{(item.cost && Number(item.cost) > 0) && (
    <div className="flex items-center gap-1 text-[10px] font-bold text-yellow-700 bg-yellow-50 px-1.5 py-0.5 rounded border border-yellow-100 shrink-0">
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
                                                                                className="flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 shrink-0 hover:bg-blue-100 transition"
                                                                            >
                                                                                <LinkIcon size={10}/> リンク
                                                                            </a>
                                                                        )}
                                                                    </div>

                                                                    {/* メモ */}
                                                                    {item.note && (
                                                                        <div className="text-[10px] text-gray-600 font-medium truncate flex items-center gap-1 min-w-0">
                                                                            <StickyNote size={10} className="shrink-0 text-gray-400"/> {item.note}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        })}
                                          
                                          <div className="absolute left-[20px] bottom-0 w-3 h-3 bg-gray-400 rounded-full -translate-x-1/2 border-2 border-white"></div>
                                      </div>
                                  );
                              }
                              
                              // 通常リスト表示 (候補, 宿, Day0)
                              return (
                                <div className="space-y-3">
                                    {displaySpots.map((spot, idx) => {
                                        const voteCount = spotVotes.filter((v: any) => String(v.spot_id) === String(spot.id) && v.vote_type === 'like').length;
                                        const isSpotHotel = isHotel(spot.name) || spot.is_hotel;
                                        // const isNew = isNewSpot(spot);
                                        const isNew = isHighlighted(spot);

                                        
                                        return (
                                            <div 
                                               // <div 
                                                // ★修正: ここもIDを優先キーにする
            key={spot.id ? `list-${spot.id}` : `list-idx-${idx}`} 
            id={`spot-item-${spot.id}`}
                                                //className={`rounded-xl shadow-sm border overflow-hidden flex h-16 transition active:scale-[0.98] animate-in slide-in-from-bottom-2 fade-in relative ${ 
                                                /* ▼▼▼ 修正: 背景色のクラス判定を変更 ▼▼▼ */
                                                className={`rounded-xl shadow-sm border overflow-hidden flex h-16 transition active:scale-[0.98] animate-in slide-in-from-bottom-2 fade-in relative ${
                                                    isNew 
                                                        ? 'bg-yellow-50 border-yellow-400 ring-2 ring-yellow-200' // 新着（黄色）
                                                        : spot.status === 'confirmed'
                                                            ? 'bg-blue-50 border-blue-200' // 確定済み（薄い青） ★ここを変更
                                                            : 'bg-white border-gray-100'   // 通常（白）
                                                }`}
                                                /* ▲▲▲ 修正ここまで ▲▲▲ */
                                                onClick={() => handlePreviewSpot(spot)}
                                            >   
                                                {isNew && (
                                                    <div className="absolute top-0 right-0 z-20 w-0 h-0 border-t-[20px] border-t-red-500 border-l-[20px] border-l-transparent pointer-events-none">
                                                        <span className="absolute -top-[18px] -left-[8px] text-white text-[8px] font-black">N</span>
                                                    </div>
                                                )}
                                                
                                                <div className="w-16 bg-gray-100 shrink-0 relative">
    <SpotImage src={spot.image_url} alt="" className="w-full h-full"/>
</div>
<div className="flex-1 p-2 flex flex-col justify-between overflow-hidden">
    <div className="flex justify-between items-start gap-2">
        <h3 className="font-bold text-gray-800 text-xs truncate flex-1 leading-snug">{spot.name}</h3>
        
        {/* ★★★ ここに追加: 宿なら予約ボタンを表示（ただし宿リスト表示時は隠す） ★★★ */}
        {isSpotHotel && filterStatus !== 'hotel_candidate' && (
            <ReservationButton 
                spot={spot} 
                roomId={roomId!} 
                onUpdate={handleSpotUpdate} 
                currentUser={userName}
                compact={true}
            />
        )}

        <div className="flex gap-1 shrink-0 ml-1">
            {voteCount > 0 && <span className="flex items-center gap-0.5 text-[9px] font-bold text-blue-500 bg-blue-50 px-1 py-0.5 rounded"><ThumbsUp size={8}/> {voteCount}</span>}
        
        {/* ▼▼▼ 修正1: 確定にするボタン (未確定のものにだけ表示) ▼▼▼ */}
        {/* 旧: {(filterStatus === 'hotel_candidate' || (filterStatus === 'candidate' && spot.status !== 'confirmed')) && ( */}
        {((filterStatus === 'hotel_candidate' || filterStatus === 'candidate') && spot.status !== 'confirmed') && (
            <button 
                onClick={(e) => { e.stopPropagation(); handleStatusChangeClick(spot, 'confirmed'); }} 
                className="bg-blue-600 text-white text-[9px] px-2 py-0.5 rounded font-bold hover:bg-blue-700 transition"
            >
                確定にする
            </button>
        )}
        
        {/* ▼▼▼ 修正2: 戻すボタン (確定済みスポットに表示、宿リスト時も含む) ▼▼▼ */}
        {/* 旧: {(filterStatus === 'confirmed' || (filterStatus === 'candidate' && spot.status === 'confirmed')) && ( */}
        {(filterStatus === 'confirmed' || ((filterStatus === 'candidate' || filterStatus === 'hotel_candidate') && spot.status === 'confirmed')) && (
            <button 
                onClick={(e) => { 
                    e.stopPropagation(); 
                    const nextStatus = (isHotel(spot.name) || spot.is_hotel) ? 'hotel_candidate' : 'candidate';
                    handleStatusChangeClick(spot, nextStatus); 
                }} 
                className="bg-gray-100 border border-gray-200 text-gray-600 text-[9px] px-2 py-0.5 rounded font-bold hover:bg-gray-200 transition whitespace-nowrap"
            >
                {(isHotel(spot.name) || spot.is_hotel) ? '宿リストに戻す' : '候補に戻す'}
            </button>
        )}
                                                            
                                                        </div>
                                                    </div>
                                                   {/* page.tsx 1665行目付近：displaySpots.map 内 */}
<div className="flex gap-2 items-center justify-between mt-1">
    {/* 左側：メモまたは説明文 */}
    {spot.comment ? (
        <span className="text-[10px] text-gray-600 font-medium truncate flex-1 flex items-center gap-1 min-w-0">
            <MessageSquare size={10} className="shrink-0 text-gray-400"/> 
            {spot.comment.length > 10 ? spot.comment.slice(0, 10) + "..." : spot.comment}
        </span>
    ) : (
        <span className="text-[10px] text-gray-300 truncate flex-1 min-w-0">{spot.description}</span>
    )}

    {/* 右側：アクションボタン（確定リストと位置を合わせる） */}
    

    {/* 右側：アクションボタン */}
    <div className="flex gap-1 items-center shrink-0 ml-2">
        {/* マップジャンプボタン */}
        <button 
            onClick={(e) => handleLocateOnMap(e, spot)}
            className="text-gray-400 hover:text-indigo-600 transition p-1.5 bg-gray-50 rounded-lg border border-gray-100"
        >
            <MapPinned size={14}/>
        </button>

        {/* ▼▼▼ 修正: ボタンの出し分けロジックを整理 ▼▼▼ */}
        {isSpotHotel && (
            spot.source === 'external_link' ? (
                // 汎用サイト（Airbnb, 公式など）の場合
                <button 
                    onClick={(e) => { 
                        e.stopPropagation(); 
                        window.open(spot.url, '_blank'); 
                    }}
                    className="flex items-center gap-1 bg-gray-900 text-white px-2 py-0.5 rounded text-[9px] font-bold hover:bg-gray-700 transition shrink-0 shadow-sm"
                >
                    サイト <ExternalLink size={8}/>
                </button>
            ) : (
                // 楽天トラベルの場合
                <button 
                    onClick={(e) => { 
                        e.stopPropagation(); 
                        logAffiliateClick(spot.name, "main_list_item");
                        window.open(getAffiliateUrl(spot), '_blank');
                    }}
                    className="flex items-center gap-1 bg-[#BF0000] text-white px-2 py-0.5 rounded text-[9px] font-bold hover:bg-[#900000] transition shrink-0 shadow-sm"
                >
                    <span className="opacity-75 text-[8px] border border-white/50 px-0.5 rounded-[2px]">PR</span>
                    楽天 <ExternalLink size={8}/>
                </button>
            )
        )}
        {/* ▲▲▲ 修正ここまで ▲▲▲ */}
        
        {/* 削除ボタン */}
        <button onClick={(e) => { e.stopPropagation(); removeSpot(spot); }} className="p-1 text-gray-300 hover:text-red-500 transition">
            <Trash2 size={12}/>
        </button>
    </div>
</div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                              );
                          })()
                      )}
                  </div>
              </div>
          )}
        </div>
        
        <div className={`flex flex-col z-20 md:w-[400px] md:h-full md:bg-gray-50 md:border-l md:border-gray-200 md:shadow-xl md:relative absolute top-0 left-0 right-0 bottom-16 transition-colors duration-300 ${currentTab === 'explore' ? 'bg-transparent pointer-events-none' : 'bg-gray-50 pointer-events-auto'}`}>
          <div className="flex-1 overflow-hidden relative pb-16 md:pb-0">
             <div className={currentTab === 'explore' ? 'hidden' : 'block h-full'}>
               {currentTab === 'agent' && (
                 <div className="w-full h-full">
                    <HotelListView 
                        spots={planSpots} 
                        spotVotes={spotVotes} 
                        currentUser={userName} 
                        roomId={roomId!} 
                        initialSearchArea={initialSearchArea} 
                        onAddSpot={addSpot}
                        onAutoSearch={handleAutoSearch} 
                        travelDays={travelDays} // ★追加: これを渡す
                        
                    />
                 </div>
               )}
               {currentTab === 'plan' && (
                   <div className="w-full h-full">
                       <PlanView 
                           spots={planSpots} 
                           onRemove={(idx) => removeSpot(planSpots[idx])} 
                           onUpdateSpots={updateSpots} 
                           roomId={roomId!} 
                           travelDays={travelDays} 
                           autoShowScreenshot={autoShowScreenshot}
                           onScreenshotClosed={() => setAutoShowScreenshot(false)}
                           
                           // ★追加: ここで親の状態(startDate, adultNum)を渡す
                           startDate={startDate}
                           adultNum={adultNum}
                           // ★追加: ユーザー名を渡す
                           currentUser={userName}
                        />
                   </div>
               )}
               {currentTab === 'menu' && (
                   <div className="w-full h-full">
                       <MenuView 
                           spots={planSpots} 
                           onOpenTutorial={openTutorialFromMenu} 
                       />
                   </div>
               )}
               
               {currentTab === 'swipe' && (
                   <div className="w-full h-full bg-gray-50">
                       <SwipeView 
                           spots={candidates.length > 0 ? candidates : planSpots} 
                           spotVotes={spotVotes} 
                           onRemove={(idx) => removeSpot(planSpots[idx])} 
                           currentUser={userName} 
                           roomId={roomId!} 
                           onPreview={handlePreviewSpot} 
                           candidates={candidates} 
                           onLike={handleLikeCandidate} 
                           onNope={handleNopeCandidate} 
                           isLoadingMore={isSuggesting} 
                           onSearchOnMap={handleSearchFromChat} 
                           onReceiveCandidates={handleReceiveCandidates}
                           allParticipants={allParticipants}
                       />
                   </div>
               )}
             </div>
          </div>
        </div>
        {/* ズームインジケーターUI */}
{/* ズームインジケーターUI (左右対応版) */}
<div 
    className={`fixed top-0 bottom-0 w-16 z-[60] pointer-events-none transition-opacity duration-300 flex ${
        showZoomUI ? 'opacity-100' : 'opacity-0'
    } ${
        zoomSide === 'right' ? 'right-0 justify-end' : 'left-0 justify-start' // ★左右で配置を反転
    }`}
>
    {/* 背景の黒い帯 */}
    <div className={`absolute top-0 bottom-0 w-12 from-black/40 to-transparent ${
        zoomSide === 'right' ? 'right-0 bg-gradient-to-l' : 'left-0 bg-gradient-to-r' // ★グラデ向き反転
    }`}></div>

    {/* 目盛り（Rail） */}
    <div className={`h-full w-2 border-white/30 flex flex-col justify-between py-12 opacity-50 ${
        zoomSide === 'right' ? 'border-r mr-4' : 'border-l ml-4' // ★線の位置反転
    }`}>
        {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className={`w-1.5 h-px bg-white/50 ${
                zoomSide === 'right' ? 'self-end' : 'self-start' // ★目盛りの向き反転
            }`}></div>
        ))}
    </div>

    {/* 動くツマミ（Knob） */}
    <div 
        ref={zoomKnobRef}
        className={`absolute top-0 w-auto h-0 flex items-center will-change-transform ${
            zoomSide === 'right' ? 'right-2 justify-end pr-2' : 'left-2 justify-start pl-2' // ★ツマミ位置反転
        }`}
        style={{ transform: 'translateY(0px)' }}
    >
        {/* ラベル (右側のときは左に、左側のときは右に表示) */}
        <div className={`bg-black/80 backdrop-blur text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-lg ${
            zoomSide === 'right' ? 'mr-3' : 'ml-3 order-last' // ★順序入れ替え
        }`}>
            ZOOM
        </div>

        {/* ツマミ本体 */}
        <div className={`w-8 h-8 bg-white rounded-full shadow-[0_0_15px_rgba(255,255,255,0.6)] flex items-center justify-center relative ${
            zoomSide === 'right' ? '-mr-2' : '-ml-2' // ★マージン反転
        }`}>
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            <div className="absolute inset-0 rounded-full border border-white animate-ping opacity-50"></div>
        </div>
    </div>
</div>
        <div className="absolute bottom-0 left-0 w-full z-[50] pointer-events-auto">
          <BottomNav currentTab={currentTab} onTabChange={setCurrentTab} voteBadge={voteBadgeCount} />
        </div>
      </div>
    </main>
  );
}
// page.tsx の export default function Home... の上あたりに追加

// --- 予約管理ボタンコンポーネント ---
// --- 予約管理ボタンコンポーネント (改良版) ---
// --- 予約管理ボタンコンポーネント (確認フロー付き) ---
// --- 予約管理ボタンコンポーネント (確認フロー・担当者選択機能付き) ---
// 予約管理ボタンコンポーネント (修正版: イベント伝播阻止を追加)
// page.tsx & PlanView.tsx の ReservationButton をこれに置き換えてください

// 予約管理ボタンコンポーネント (Portal対応版: ドラッグ影響を完全回避)
const ReservationButton = ({ spot, roomId, onUpdate, currentUser, compact = false }: { spot: any, roomId: string, onUpdate: (s: any) => void, currentUser?: string, compact?: boolean }) => {
    const [showModal, setShowModal] = useState(false);
    const [nameInput, setNameInput] = useState("");
    const [isUpdating, setIsUpdating] = useState(false);
    const [viewMode, setViewMode] = useState<'default' | 'confirm_cancel'>('default');
    const [mounted, setMounted] = useState(false); // マウント状態管理

    useEffect(() => {
        setMounted(true); // クライアントサイドでのみレンダリング
    }, []);

    const isReserved = spot.reservation_status === 'reserved';

    const handleOpen = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setNameInput(spot.reserved_by || currentUser || "Guest");
        setViewMode('default');
        setShowModal(true);
    };

    const handleUpdateStatus = async (status: 'reserved' | 'unreserved') => {
        if (!spot.id) return;
        setIsUpdating(true);
        try {
            const updates = {
                reservation_status: status,
                reserved_by: status === 'reserved' ? nameInput : null
            };
            
            if (!String(spot.id).startsWith('spot-') && !String(spot.id).startsWith('ai-')) {
                await supabase.from('spots').update(updates).eq('id', spot.id);
            }
            
            onUpdate({ ...spot, ...updates });
            setShowModal(false);
        } catch (e) {
            alert("更新エラーが発生しました");
        } finally {
            setIsUpdating(false);
        }
    };

    // モーダルの中身
    const modalContent = (
        <div 
            className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={(e) => { e.stopPropagation(); }} // 背景クリックの伝播防止
        >
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm animate-in zoom-in-95">
                {!isReserved ? (
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
                                onClick={() => setShowModal(false)}
                                className="flex-1 bg-gray-100 text-gray-500 font-bold py-3 rounded-xl hover:bg-gray-200 transition"
                            >
                                キャンセル
                            </button>
                            <button 
                                onClick={() => handleUpdateStatus('reserved')}
                                disabled={!nameInput.trim() || isUpdating}
                                className="flex-1 bg-green-600 text-white font-bold py-3 rounded-xl hover:bg-green-700 transition flex items-center justify-center gap-2 shadow-md shadow-green-200"
                            >
                                {isUpdating ? <Loader2 className="animate-spin"/> : <Check size={18}/>}
                                はい
                            </button>
                        </div>
                    </>
                ) : viewMode === 'confirm_cancel' ? (
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
                                onClick={() => setViewMode('default')}
                                className="flex-1 bg-gray-100 text-gray-500 font-bold py-3 rounded-xl hover:bg-gray-200 transition"
                            >
                                いいえ
                            </button>
                            <button 
                                onClick={() => handleUpdateStatus('unreserved')}
                                disabled={isUpdating}
                                className="flex-1 bg-red-500 text-white font-bold py-3 rounded-xl hover:bg-red-600 transition flex items-center justify-center gap-2 shadow-md shadow-red-200"
                            >
                                {isUpdating ? <Loader2 className="animate-spin"/> : <Trash2 size={18}/>}
                                はい
                            </button>
                        </div>
                    </>
                ) : (
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
                                onClick={() => setViewMode('confirm_cancel')}
                                className="w-full bg-white border-2 border-red-100 text-red-500 font-bold py-3 rounded-xl hover:bg-red-50 transition flex items-center justify-center gap-2"
                            >
                                未予約に戻す
                            </button>
                            <button 
                                onClick={() => setShowModal(false)}
                                className="w-full text-gray-400 font-bold py-2 text-sm hover:text-gray-600"
                            >
                                閉じる
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );

    return (
        <>
            <button 
                onClick={handleOpen}
                // 親のドラッグを阻止
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
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

            {/* Portalを使ってbody直下に描画 */}
            {showModal && mounted && createPortal(modalContent, document.body)}
        </>
    );
};
export default function Home() {

    
  return (
    <Suspense fallback={<div className="flex h-screen w-screen items-center justify-center bg-gray-50"><div className="animate-pulse flex flex-col items-center gap-4"><div className="w-16 h-16 bg-gray-200 rounded-full"></div><div className="h-4 w-32 bg-gray-200 rounded"></div></div></div>}>
      <HomeContent />
    </Suspense>
  );
}