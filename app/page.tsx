"use client";

// ビルドエラー回避：動的レンダリングを強制
export const dynamic = 'force-dynamic';

import React, { Suspense, useEffect, useRef, useState, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { 
  Search, X, Plus, ExternalLink, Map as MapIcon, History, Trash2, 
  MapPinned, Users, Edit2, CheckCircle, HelpCircle, 
  BedDouble, ChevronDown, ChevronUp, Calendar, MapPin,
  Image as ImageIcon, Users as UsersIcon,
  PenTool, Loader2, Clock, ThumbsUp, Link as LinkIcon, MessageSquare,
  Save, XCircle, Edit3, ArrowRight, Maximize,
  Car, Train, Footprints, Zap, Plane, Ship, Camera, Globe, ArrowLeftCircle, Database,
  Banknote, ExternalLink as ExternalLinkIcon, StickyNote, Check,Sparkles
} from 'lucide-react';

import BottomNav from './components/BottomNav';
import HotelListView from './components/HotelListView';
import PlanView from './components/PlanView';
import MenuView from './components/MenuView';
import Ticker from './components/Ticker';
import SwipeView from './components/SwipeView';
import LegalModal from './components/LegalModal';
import WelcomePage from './components/WelcomePage';

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
const RAKUTEN_AFFILIATE_ID = "4fcc24e4.174bb117.4fcc24e5.5b178353"; 

const TRANSPORT_MODES = [
  { id: 'car', icon: <Car size={12}/>, label: '車' },
  { id: 'train', icon: <Train size={12}/>, label: '電車' },
  { id: 'walk', icon: <Footprints size={12}/>, label: '徒歩' },
  { id: 'shinkansen', icon: <Zap size={12}/>, label: '新幹線' },
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

const calculateSimpleSchedule = (items: any[], startTime: string = "09:00") => {
    let currentTime = new Date(`2000-01-01T${startTime}:00`);
    return items.map((item) => {
        const newItem = { ...item };
        if (item.type === 'travel') {
            const duration = item.duration_min || 30;
            currentTime = new Date(currentTime.getTime() + duration * 60000);
        } else if (item.type === 'spot') {
            newItem.arrival = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            let stayTime = item.stay_min || item.spot.stay_time || 60;
            if (item.spot.is_hotel) stayTime = 600; 
            currentTime = new Date(currentTime.getTime() + stayTime * 60000);
            newItem.departure = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            newItem.stay_min = stayTime;
        }
        return newItem;
    });
};

// --- オンボーディング（機能紹介）モーダル ---
const OnboardingModal = ({ onClose }: { onClose: () => void }) => {
    const [step, setStep] = useState(0);
    const [dontShow, setDontShow] = useState(false);

    const handleNext = () => {
        if (step < 2) {
            setStep(s => s + 1);
        } else {
            handleComplete();
        }
    };

    const handleComplete = () => {
        if (dontShow) {
            localStorage.setItem('rh_onboarding_seen', 'true');
        }
        onClose();
    };

    const steps = [
        {
            title: "みんなで地図を作ろう",
            desc: "リアルタイムで地図にピンを立てて、\n旅行の行き先をみんなで決めよう🗺️",
            visual: (
                <div className="relative w-40 h-40 mx-auto flex items-center justify-center">
                    <div className="absolute inset-0 bg-blue-100 rounded-full animate-pulse opacity-50"></div>
                    <div className="w-32 h-32 bg-white rounded-full shadow-lg flex items-center justify-center relative border-4 border-blue-50">
                        <MapIcon size={64} className="text-blue-500" />
                        <div className="absolute -bottom-2 -right-2 bg-green-500 text-white p-3 rounded-full border-4 border-white shadow-md">
                            <Users size={24} />
                        </div>
                        <div className="absolute -top-2 -left-2 bg-indigo-500 text-white p-2 rounded-full border-4 border-white shadow-md">
                            <MapPinned size={20} />
                        </div>
                    </div>
                </div>
            )
        },
        {
            title: "便利な機能がいっぱい",
            desc: "AIによるスポット提案、指で囲って宿検索、\nみんなで投票機能などが使えます✨",
            visual: (
                <div className="relative w-40 h-40 mx-auto flex items-center justify-center">
                    <div className="w-32 h-32 bg-gradient-to-tr from-yellow-100 to-orange-100 rounded-full shadow-lg flex items-center justify-center relative border-4 border-white">
                        <div className="grid grid-cols-2 gap-3 p-4">
                            <div className="flex flex-col items-center gap-1">
                                <div className="bg-purple-500 text-white p-2 rounded-xl shadow-sm"><Sparkles size={20}/></div>
                                <span className="text-[8px] font-bold text-purple-600">AI提案</span>
                            </div>
                            <div className="flex flex-col items-center gap-1">
                                <div className="bg-red-500 text-white p-2 rounded-xl shadow-sm"><PenTool size={20}/></div>
                                <span className="text-[8px] font-bold text-red-600">囲って検索</span>
                            </div>
                            <div className="flex flex-col items-center gap-1 col-span-2">
                                <div className="bg-blue-500 text-white p-2 rounded-xl shadow-sm"><ThumbsUp size={20}/></div>
                                <span className="text-[8px] font-bold text-blue-600">投票</span>
                            </div>
                        </div>
                    </div>
                </div>
            )
        },
        {
            title: "準備はOK？",
            desc: "さあ、最高の旅行プラン作りを\nはじめましょう！✈️",
            visual: (
                <div className="relative w-40 h-40 mx-auto flex items-center justify-center">
                    <div className="absolute inset-0 bg-blue-500/10 rounded-full animate-[spin_10s_linear_infinite]"></div>
                    <div className="w-32 h-32 bg-blue-600 rounded-full shadow-xl flex items-center justify-center relative border-4 border-blue-100 overflow-hidden group">
                        <Plane size={64} className="text-white relative z-10 group-hover:translate-x-2 group-hover:-translate-y-2 transition-transform duration-500" />
                        <div className="absolute inset-0 bg-gradient-to-tr from-blue-600 to-cyan-400 opacity-80"></div>
                        {/* Clouds */}
                        <div className="absolute top-6 left-4 w-8 h-8 bg-white/20 rounded-full blur-md"></div>
                        <div className="absolute bottom-8 right-6 w-10 h-10 bg-white/20 rounded-full blur-md"></div>
                    </div>
                </div>
            )
        }
    ];

    return (
        <div className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden flex flex-col items-center text-center">
                
                {/* ステップインジケーター */}
                <div className="flex gap-2 mb-8">
                    {steps.map((_, i) => (
                        <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? 'w-8 bg-blue-600' : 'w-2 bg-gray-200'}`}></div>
                    ))}
                </div>

                {/* コンテンツエリア (アニメーション付き切り替え) */}
                <div className="w-full mb-8 min-h-[280px] flex flex-col justify-between animate-in slide-in-from-right-4 fade-in duration-300" key={step}>
                    <div className="mb-6">
                        {steps[step].visual}
                    </div>
                    <div>
                        <h3 className="text-2xl font-black text-gray-800 mb-4">{steps[step].title}</h3>
                        <p className="text-sm text-gray-500 font-bold leading-relaxed whitespace-pre-wrap">
                            {steps[step].desc}
                        </p>
                    </div>
                </div>

                {/* フッターアクション */}
                <div className="w-full space-y-4">
                    <button 
                        onClick={handleNext}
                        className="w-full bg-gray-900 text-white py-4 rounded-2xl font-bold text-lg hover:scale-[1.02] active:scale-95 transition shadow-lg flex items-center justify-center gap-2"
                    >
                        {step === 2 ? 'はじめる' : '次へ'} <ArrowRight size={20}/>
                    </button>

                    <div 
                        className="flex items-center justify-center gap-2 cursor-pointer py-2" 
                        onClick={() => setDontShow(!dontShow)}
                    >
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${dontShow ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'}`}>
                            {dontShow && <Check size={14} className="text-white"/>}
                        </div>
                        <span className="text-xs font-bold text-gray-400 select-none">今後表示しない</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomId = searchParams.get('room');

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

  // ★追加: スワイプチュートリアルの状態管理
  const [showSwipeTutorial, setShowSwipeTutorial] = useState(false);
  const [dontShowTutorial, setDontShowTutorial] = useState(false);

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

  // ...existing.useState
  
  // ★追加: オンボーディング表示用
  const [showOnboarding, setShowOnboarding] = useState(false);

  // ★追加: 初回ロード時にフラグチェック
  useEffect(() => {
      // ルームに参加済み、かつローカルストレージにフラグがない場合に表示
      if (isJoined && roomId) {
          const hasSeen = localStorage.getItem('rh_onboarding_seen');
          if (!hasSeen) {
              // 少し遅らせて表示することで、画面遷移の違和感を減らす
              const timer = setTimeout(() => setShowOnboarding(true), 1000);
              return () => clearTimeout(timer);
          }
      }
  }, [isJoined, roomId]);

  const [isEditingMemo, setIsEditingMemo] = useState(false); 
  const [editCommentValue, setEditCommentValue] = useState("");
  const [editLinkValue, setEditLinkValue] = useState("");
  
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [editDescValue, setEditDescValue] = useState("");
  const [showVoteDetailSpot, setShowVoteDetailSpot] = useState<any>(null);

  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);

  
  // ★追加: 右端ズーム用のジェスチャー状態管理
const rightEdgeGestureRef = useRef({
    isActive: false,
    startY: 0,
    startZoom: 0
});
// ★追加: ズームUIの表示制御用
const [showZoomUI, setShowZoomUI] = useState(false);
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
        const threshold = 100;

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
const onTimelineDrop = async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    stopTimelineAutoScroll(); // ★追加
    const sourceIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (isNaN(sourceIndex) || sourceIndex === targetIndex) return;

    // 1. 現在の表示用タイムラインをコピーして並び替える
    const newTimeline = [...displayTimeline];
    const sourceItem = newTimeline[sourceIndex];
    if (!sourceItem || sourceItem.type !== 'spot') return;

    // 配列から抜き取って挿入
    const [movedItem] = newTimeline.splice(sourceIndex, 1);
    newTimeline.splice(targetIndex, 0, movedItem);

    // 2. 移動(travel)アイテムを正しい位置に再配置して再計算
    const justSpots = newTimeline.filter(item => item.type === 'spot').map(item => item.spot);
    const reconstructed: any[] = [];
    justSpots.forEach((spot, i) => {
        reconstructed.push({ type: 'spot', spot, stay_min: spot.stay_time || 60 });
        if (i < justSpots.length - 1) {
            reconstructed.push({ type: 'travel', duration_min: 30, transport_mode: 'car' });
        }
    });

    // 時間を振り直す
    const finalTimeline = calculateSimpleSchedule(reconstructed);

    // ...既存のuseState
  
  

    // 3. ローカルの State を即座に更新
    setDisplayTimeline(finalTimeline);
    
    // 4. localStorage を即座に更新（これが重要！）
    if (roomId && selectedConfirmDay > 0) {
        const storageKey = `rh_plan_${roomId}_day_${selectedConfirmDay}`;
        localStorage.setItem(storageKey, JSON.stringify({ 
            timeline: finalTimeline, 
            updatedAt: Date.now() 
        }));
    }

    // 5. DB (Supabase) の order カラムを一括更新
    for (let i = 0; i < justSpots.length; i++) {
        await supabase
            .from('spots')
            .update({ order: i })
            .eq('id', justSpots[i].id);
    }

    // 全体リスト（planSpots）も同期
    setPlanSpots(prev => {
        const next = [...prev];
        justSpots.forEach((s, idx) => {
            const i = next.findIndex(p => p.id === s.id);
            if (i !== -1) next[i].order = idx;
        });
        return [...next].sort((a, b) => (a.order || 0) - (b.order || 0));
    });

    setDraggedTimelineIndex(null);
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
  const [travelDays, setTravelDays] = useState<number>(1);
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);

  const [selectedConfirmDay, setSelectedConfirmDay] = useState<number>(0);
  const [selectedCandidateDay, setSelectedCandidateDay] = useState<number>(0);
  
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [autoShowScreenshot, setAutoShowScreenshot] = useState(false);
  const [showVoterListModal, setShowVoterListModal] = useState(false);
  const [notification, setNotification] = useState<{ text: string, color: string } | null>(null);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const attemptedImageFetch = useRef<Set<string>>(new Set());
  const [displayTimeline, setDisplayTimeline] = useState<any[]>([]);

  // ★追加: タイムラインリストのDOM参照用と、スクロール制御用
const timelineListRef = useRef<HTMLDivElement>(null);
const timelineScrollInterval = useRef<NodeJS.Timeout | null>(null);

  // ...既存のuseState
  const [isSuggesting, setIsSuggesting] = useState(false);
  
  // ★追加: シークレットモード警告用
  const [showIncognitoWarning, setShowIncognitoWarning] = useState(false);

  const planSpotsRef = useRef(planSpots);
  useEffect(() => { planSpotsRef.current = planSpots; }, [planSpots]);

  // 未読管理
  const mountTimeRef = useRef(Date.now());
  const hasShownArrivalNotice = useRef(false); // ★追加：通知済みフラグ
  // 160行目付近（hasShownArrivalNotice の近く）
const [arrivalModalSpots, setArrivalModalSpots] = useState<any[]>([]); // ★追加：モーダル用
  const [lastVisited, setLastVisited] = useState<Record<string, number>>({});
  const getContextKey = (status: string, day: number) => {
      if (status === 'hotel_candidate') return 'hotel_candidate';
      return `${status}_${day || 0}`;
  };

  useEffect(() => {
    const detectIncognito = async () => {
        // 一般的なブラウザ（Chrome/Edge/Firefoxなど）でのクオータ制限チェックによる検知
        // シークレットモードではストレージ容量(quota)が極端に少なく制限されることが多い
        if ('storage' in navigator && 'estimate' in navigator.storage) {
            try {
                const { quota } = await navigator.storage.estimate();
                // 120MB以下ならシークレットモードの可能性が高いと判断（通常のPC/スマホならGB単位あるため）
                if (quota && quota < 120 * 1024 * 1024) {
                    setShowIncognitoWarning(true);
                    return;
                }
            } catch (e) {}
        }
        
        // iOS Safariなどのプライベートモードでは localStorage への書き込みがエラーになる、
        // または保持されないケースがあるため簡易チェック
        try {
            const testKey = '__test_incognito__';
            localStorage.setItem(testKey, '1');
            localStorage.removeItem(testKey);
        } catch (e) {
            setShowIncognitoWarning(true);
        }
    };
    detectIncognito();
  }, []);

  useEffect(() => {
      if (roomId) {
          try {
              const saved = localStorage.getItem(`rh_last_visited_${roomId}`);
              if (saved) setLastVisited(JSON.parse(saved));
          } catch(e) {}
      }
  }, [roomId]);
  useEffect(() => {
      if (!roomId) return;
      let currentStatus = filterStatus;
      if (currentStatus === 'all') return;
      let currentDay = 0;
      if (currentStatus === 'confirmed') currentDay = selectedConfirmDay;
      if (currentStatus === 'candidate') currentDay = selectedCandidateDay;
      const key = getContextKey(currentStatus, currentDay);
      return () => {
          const now = Date.now();
          setLastVisited(prev => {
              const next = { ...prev, [key]: now };
              localStorage.setItem(`rh_last_visited_${roomId}`, JSON.stringify(next));
              return next;
          });
      };
  }, [filterStatus, selectedConfirmDay, selectedCandidateDay, roomId]);
 // ... (前略)

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
    if (isDrawing) { stopDrawing(); }
    if (currentTab !== 'agent') { setInitialSearchArea(null); }
  }, [currentTab]);

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

useEffect(() => {
    if (filterStatus === 'confirmed' && roomId) {
        const day = selectedConfirmDay === 0 ? 0 : selectedConfirmDay;
        
        // Day0の場合は単純表示
        if (day === 0) {
             setDisplayTimeline(planSpots.filter(s => s.status === 'confirmed' && (s.day === 0 || !s.day)).map(s => ({ type: 'spot', spot: s })));
             return;
        }
        
        const storageKey = `rh_plan_${roomId}_day_${day}`;
        const savedPlan = localStorage.getItem(storageKey);
        let timeline: any[] = [];
        
        // ローカルストレージから復元
        if (savedPlan) {
            try {
                const data = JSON.parse(savedPlan);
                if (data.timeline && Array.isArray(data.timeline)) { timeline = data.timeline; }
            } catch(e) { console.error("Plan parse error", e); }
        }

        // --- その日のスポット一覧を取得（最新のplanSpotsから） ---
        let spotsInDay = planSpots.filter(s => s.status === 'confirmed' && s.day === day);

        // 2日目以降なら前日の宿を追加
        if (day > 1) {
            const prevDayHotel = planSpots.find(s => 
                s.status === 'confirmed' && 
                s.day === day - 1 && 
                (s.is_hotel || isHotel(s.name))
            );
            if (prevDayHotel && !spotsInDay.some(s => s.id === prevDayHotel.id)) {
                spotsInDay = [prevDayHotel, ...spotsInDay];
            }
        }

        // 並び順が変わったかチェック
        const storageSpotIds = timeline.filter((t: any) => t.type === 'spot').map((t: any) => String(t.spot.id));
        const currentSpotIds = spotsInDay.map(s => String(s.id));
        const isOrderDifferent = JSON.stringify(storageSpotIds) !== JSON.stringify(currentSpotIds);

        // ▼▼▼ ロジック修正箇所 ▼▼▼
        if (timeline.length === 0 || isOrderDifferent) {
             // 1. 初回ロード または 並び順が変わっている場合 → 作り直し
             const newTimeline: any[] = [];
             spotsInDay.forEach((spot, i) => {
                 newTimeline.push({ type: 'spot', spot, stay_min: spot.stay_time || 60 });
                 if (i < spotsInDay.length - 1) { 
                     newTimeline.push({ type: 'travel', duration_min: 30, transport_mode: 'car' }); 
                 }
             });
             timeline = calculateSimpleSchedule(newTimeline);
             
             // ローカルストレージも更新
             localStorage.setItem(storageKey, JSON.stringify({ timeline, updatedAt: Date.now() }));
        } else {
             // 2. 並び順は同じだが、中身（メモや金額）が変わっている場合 → planSpotsの最新データで上書き
             timeline = timeline.map(item => {
                 if (item.type === 'spot') {
                     // planSpots (DB由来の最新データ) から同じIDのスポットを探す
                     const freshSpot = spotsInDay.find(s => String(s.id) === String(item.spot.id));
                     if (freshSpot) {
                         return { 
                             ...item, 
                             spot: { 
                                 ...item.spot,    // 既存のプロパティ（stay_minなど）を維持しつつ
                                 ...freshSpot,    // 最新のDBデータで上書き（comment, link, priceなど）
                                 image_url: freshSpot.image_url // 画像URLも最新に
                             }, 
                             image: freshSpot.image_url || item.image 
                         };
                     }
                 }
                 return item;
             });
        }
        // ▲▲▲ 修正ここまで ▲▲▲

        setDisplayTimeline(timeline);
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

      // 1. 基準日 (startDate優先)
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

      // 3. チェックアウト日 (1泊)
      const checkOutDate = new Date(targetDate);
      checkOutDate.setDate(targetDate.getDate() + 1);

      // 4. パラメータ生成
      const y1 = targetDate.getFullYear();
      const m1 = targetDate.getMonth() + 1;
      const d1 = targetDate.getDate();
      const y2 = checkOutDate.getFullYear();
      const m2 = checkOutDate.getMonth() + 1;
      const d2 = checkOutDate.getDate();
      const pad = (n: number) => n.toString().padStart(2, '0');

      // ★追加: URLから楽天IDを抽出するヘルパー
      const extractRakutenId = (url: string) => {
          if (!url) return null;
          const match = url.match(/hotelinfo\/plan\/(\d+)/) || url.match(/HOTEL\/(\d+)/);
          return match ? match[1] : null;
      };

      let targetUrl = "";
      let hotelId = null;

      // IDの特定（保存済みURLから抽出、または未保存スポットのIDを使用）
      if (spot.url && spot.url.includes('rakuten')) {
          hotelId = extractRakutenId(spot.url);
      }
      if (!hotelId && spot.id && /^\d+$/.test(String(spot.id))) {
          hotelId = spot.id;
      }

      // URL生成
      if (hotelId) {
          // IDが判明している場合 -> 日付・人数付きプラン一覧へ
          targetUrl = `https://hotel.travel.rakuten.co.jp/hotelinfo/plan/${hotelId}?f_teikei=&f_heya_su=1&f_otona_su=${adultNum}&f_nen1=${y1}&f_tuki1=${pad(m1)}&f_hi1=${pad(d1)}&f_nen2=${y2}&f_tuki2=${pad(m2)}&f_hi2=${pad(d2)}&f_sort=min_charge`;
      } else if (spot.url && spot.url.includes('rakuten.co.jp')) {
          // ID不明だが楽天URLがある場合 -> そのまま
          targetUrl = spot.url;
      } else {
          // フォールバック検索
          targetUrl = `https://search.travel.rakuten.co.jp/ds/hotel/search?f_query=${encodeURIComponent(spot.name)}&f_teikei=&f_heya_su=1&f_otona_su=${adultNum}&f_nen1=${y1}&f_tuki1=${pad(m1)}&f_hi1=${pad(d1)}&f_nen2=${y2}&f_tuki2=${pad(m2)}&f_hi2=${pad(d2)}&f_sort=min_charge`;
      }

      // ★修正: アフィリエイトリンクに変換して返す
      //if (RAKUTEN_AFFILIATE_ID) {
        //  return `https://hb.afl.rakuten.co.jp/hgc/${RAKUTEN_AFFILIATE_ID}/?pc=${encodeURIComponent(targetUrl)}&m=${encodeURIComponent(targetUrl)}`;
      //}

      return targetUrl;
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
      const index = allParticipants.indexOf(name);
      if (index === -1) return '#9CA3AF';
      return UD_COLORS[index % UD_COLORS.length];
  };

  //const rakutenHomeUrl = `https://hb.afl.rakuten.co.jp/hgc/${RAKUTEN_AFFILIATE_ID}/?pc=${encodeURIComponent("https://travel.rakuten.co.jp/")}&m=${encodeURIComponent("https://travel.rakuten.co.jp/")}`;
const rakutenHomeUrl = "https://travel.rakuten.co.jp/";
 // page.tsx の 752行目付近にある filteredSpots を以下に書き換え

// page.tsx 750行目付近

const filteredSpots = useMemo(() => {
    if (filterStatus === 'all') return planSpots;
    
    let spots = planSpots;
    
    if (filterStatus === 'confirmed') {
        // ...（確定リストのロジックはそのまま）...
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
    else if (filterStatus === 'candidate') {
        spots = planSpots.filter(s => (s.status || 'candidate') === 'candidate');
        spots = spots.filter(s => (s.day || 0) === selectedCandidateDay);
    } 
    // ▼▼▼ 追加修正: 宿リストの場合も日付で絞り込む ▼▼▼
    else if (filterStatus === 'hotel_candidate') {
        spots = planSpots.filter(s => s.status === 'hotel_candidate');
        spots = spots.filter(s => (s.day || 0) === selectedHotelDay);
    }
    // ▲▲▲ 追加ここまで ▲▲▲
    else {
        spots = planSpots.filter(s => (s.status || 'candidate') === filterStatus);
    }
    return spots;
    // ▼▼▼ 修正: 依存配列に selectedHotelDay を追加 ▼▼▼
}, [planSpots, filterStatus, selectedConfirmDay, selectedCandidateDay, selectedHotelDay]);

  useEffect(() => {
      if (currentTab === 'explore' && !isSearching && !selectedResult && map.current) {
          fitBoundsToSpots(filteredSpots);
      }
  }, [filteredSpots, currentTab]);

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

 const updateSpotStatus = async (spot: any, newStatus: string, day: number = 0) => {
      if (!roomId) return;
      
      const now = new Date().toISOString(); // ★現在時刻
      
      // ローカルStateを更新（updated_atを更新してハイライトさせる）
      setPlanSpots(prev => prev.map(s => s.id === spot.id ? { ...s, status: newStatus, day: day, updated_at: now } : s));
      
      // DB更新
      const { error } = await supabase.from('spots').update({ status: newStatus, day: day, updated_at: now }).eq('id', spot.id);
      
      if (error) { console.error("Status update failed:", error); loadRoomData(roomId); } 
  };

  const updateSpotDay = async (spot: any, newDay: number) => {
      if (!roomId) return;
      
      const now = new Date().toISOString(); // ★現在時刻

      setPlanSpots(prev => prev.map(s => s.id === spot.id ? { ...s, day: newDay, updated_at: now } : s));
      if (selectedResult && selectedResult.id === spot.id) { setSelectedResult((prev: any) => ({ ...prev, day: newDay })); }
      
      const { error } = await supabase.from('spots').update({ day: newDay, updated_at: now }).eq('id', spot.id);
      if (error) { console.error("Day update failed:", error); loadRoomData(roomId); }
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
    const targetId = String(spotId);
    const myVote = spotVotes.find(v => String(v.spot_id) === targetId && v.user_name === userName);

    if (myVote) {
        if (myVote.vote_type === 'like') {
            const newVote = { ...myVote, vote_type: 'nope' };
            setSpotVotes(prev => prev.map(v => v.id === myVote.id ? newVote : v));
            await supabase.from('votes').update({ vote_type: 'nope' }).eq('id', myVote.id);
        } else {
            const newVote = { ...myVote, vote_type: 'like' };
            setSpotVotes(prev => prev.map(v => v.id === myVote.id ? newVote : v));
            await supabase.from('votes').update({ vote_type: 'like' }).eq('id', myVote.id);
        }
    } else {
        const tempVote = { id: `temp-${Date.now()}`, room_id: roomId, spot_id: spotId, user_name: userName, vote_type: 'like' };
        setSpotVotes(prev => [...prev, tempVote]);
        const { data, error } = await supabase.from('votes').insert({ room_id: roomId, spot_id: spotId, user_name: userName, vote_type: 'like' }).select().single();
        if (error) setSpotVotes(prev => prev.filter(v => v.id !== tempVote.id)); 
        else if (data) setSpotVotes(prev => prev.map(v => v.id === tempVote.id ? data : v));
    }
  };

  const handleSearch = async (overrideQuery?: string) => {
      const activeQuery = overrideQuery || query; 
      if(!activeQuery) return;
      setIsSearching(true);
      try {
        let results: any[] = [];
        if (roomId) {
            const { data: cached } = await supabase.from('room_search_cache').select('*').eq('room_id', roomId).ilike('text', `%${activeQuery}%`).limit(5);
            if (cached && cached.length > 0) {
                const cachedResults = cached.map(item => ({ id: item.id, name: item.text, place_name: item.place_name || item.text, center: item.center, image_url: item.image_url, is_room_cache: true }));
                results = [...cachedResults];
            }
        }
        const token = MAPBOX_TOKEN;
        const bounds = map.current!.getBounds();
        let bbox = "";
        if (bounds) bbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
        let url = `https://api.mapbox.com/search/searchbox/v1/suggest?q=${encodeURIComponent(activeQuery)}&access_token=${token}&session_token=${sessionToken}&language=ja&limit=10&bbox=${bbox}&types=poi,place,address`;
        let res = await fetch(url);
        let data = await res.json();
        if (!data.suggestions || data.suggestions.length < 2) {
          url = `https://api.mapbox.com/search/searchbox/v1/suggest?q=${encodeURIComponent(activeQuery)}&access_token=${token}&session_token=${sessionToken}&language=ja&limit=10&proximity=${lng},${lat}&types=poi,place,address`;
          res = await fetch(url);
          data = await res.json();
        }
        if (data.suggestions) {
            const newSuggestions = data.suggestions.filter((s: any) => !results.some(r => r.name === s.name || r.text === s.name));
            results = [...results, ...newSuggestions];
        }
        setSearchResults(results);
      } catch (e) { console.error(e); } finally { setIsSearching(false); }
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
    try {
      const token = MAPBOX_TOKEN;
      const url = `https://api.mapbox.com/search/searchbox/v1/retrieve/${suggestion.mapbox_id}?access_token=${token}&session_token=${sessionToken}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.features && data.features.length > 0) {
        const feature = data.features[0];
        const [searchLng, searchLat] = feature.geometry.coordinates;
        const name = feature.properties.name;
        const address = feature.properties.full_address || feature.properties.place_formatted || "";
        const isSaved = planSpots.some(s => s.name === name);
        showResultOnMap(name, address, [searchLng, searchLat], isSaved);
        const img = await fetchSpotImage(name);
        if(img) setSelectedResult((prev: any) => ({...prev, image_url: img}));
        
        // ★履歴に追加
        addToSearchHistory({
            id: suggestion.mapbox_id || `hist-${Date.now()}`,
            name: name,
            place_name: address,
            center: [searchLng, searchLat],
            timestamp: Date.now()
        });

        if (roomId) {
            await supabase.from('room_search_cache').insert({
                room_id: roomId, text: name, place_name: address, center: [searchLng, searchLat], image_url: img || null, mapbox_id: suggestion.mapbox_id
            });
        }
      }
    } catch(e) { alert("詳細情報の取得に失敗しました"); }
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
            
            // ★追加: UIを表示
            setShowZoomUI(true);
            
            // ★追加: ツマミをタッチ位置へ移動
            if (zoomKnobRef.current) {
                zoomKnobRef.current.style.transform = `translateY(${touch.clientY}px)`;
            }

            // (任意) 触覚フィードバック
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

        // ★追加: ツマミの位置を更新 (ReactのStateを使わず直接DOMを操作して高速化)
        if (zoomKnobRef.current) {
            zoomKnobRef.current.style.transform = `translateY(${touch.clientY}px)`;
        }
    };

    const onTouchEnd = () => {
        rightEdgeGestureRef.current.isActive = false;
        // ★追加: UIを非表示
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
 }, [isDrawing, isAuthLoading, isJoined]);

  useEffect(() => {
    if (selectedResult && roomId) {
      const currentSpot = planSpots.find(s => s.name === selectedResult.text) || selectedResult; 
      const spotId = currentSpot.id || selectedResult.id;
      const voters = spotVotes.filter(v => String(v.spot_id) === String(spotId) && v.vote_type === 'like').map(v => v.user_name);
      const uniqueVoters = Array.from(new Set(voters));
      const isSaved = planSpots.some(s => s.name === selectedResult.text);

      if (isSaved && currentSpot && !isEditingMemo) {
          if (currentSpot.comment !== editCommentValue) setEditCommentValue(currentSpot.comment || "");
          if (currentSpot.link !== editLinkValue) setEditLinkValue(currentSpot.link || "");
      }

      setSelectedResult((prev: any) => ({
        ...prev,
        id: currentSpot.id || prev.id, 
        voters: uniqueVoters,
        is_saved: isSaved,
        comment: currentSpot.comment,
        link: currentSpot.link,
        day: currentSpot.day || 0,
        status: currentSpot.status || 'candidate'
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
                        nextSpots[index] = { ...nextSpots[index], ...newRecord };
                    }
                } 
                else if (eventType === 'DELETE') {
                    nextSpots = nextSpots.filter(s => s.id !== oldRecord.id);
                }

                return nextSpots.sort((a, b) => (a.order || 0) - (b.order || 0));
            });
        })
        
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
    if (planSpots.some(s => s.name === spot.name && s.room_id === roomId)) {
      alert("このスポットは既に追加されています");
      return;
    }
const now = new Date().toISOString(); // ★現在時刻
    // データベースに送るデータを作成
    const newSpotPayload = {
      // ... (既存プロパティ)
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
      price: spot.price || 0,
      url: spot.url || "",
      rating: spot.rating || 0,
      created_at: now, // ★追加
      updated_at: now  // ★追加
    };

    // ★重要: ここで先にローカルStateに追加してしまう (仮IDを持たせる)
    // これにより、DBの応答を待たずに画面に反映されます
    const optimisticSpot = { ...newSpotPayload, id: `temp-${Date.now()}` };
    setPlanSpots(prev => [...prev, optimisticSpot]);

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
        setPlanSpots(prev => prev.map(s => s.id === optimisticSpot.id ? data : s));

        // 自分が追加したものは自動で「いいね」
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
 

  const removeSpot = async (spot: any) => {
    if (!roomId) return;
    if (!spot.id) return; 
    if (!confirm(`本当に「${spot.name || spot.text}」をリストから削除しますか？`)) return;
    setPlanSpots(prev => prev.filter(s => s.id !== spot.id));
    await supabase.from('spots').delete().eq('id', spot.id);
    if (selectedResult?.id === spot.id) setSelectedResult(null); 
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
  };

 const handlePreviewSpot = (spot: any, openMemo: boolean = false) => {
    setCurrentTab('explore');
    
    // 最新のデータを ID または 名前 で検索して取得
    const dbSpot = planSpots.find(s => (s.id && String(s.id) === String(spot.id)) || s.name === spot.name);
    
    // 実際にプレビュー表示に使用するベースデータ（最新があればそれを使う）
    const sourceSpot = dbSpot || spot;

    const isSaved = planSpots.some(s => s.name === sourceSpot.name);
    const spotId = sourceSpot.id; 
    const voters = spotVotes.filter(v => String(v.spot_id) === String(spotId) && v.vote_type === 'like').map(v => v.user_name);
    const uniqueVoters = Array.from(new Set(voters));
    
    // 画像がない場合のフェッチ処理
    if (!sourceSpot.image_url && !attemptedImageFetch.current.has(sourceSpot.id)) {
        fetchSpotImage(sourceSpot.name).then(url => {
            if (url) {
                setPlanSpots(prev => prev.map(s => s.id === sourceSpot.id ? { ...s, image_url: url } : s));
                if(roomId && sourceSpot.id) supabase.from('spots').update({ image_url: url }).eq('id', sourceSpot.id).then();
            }
        });
    }

    

    

    // 編集モード用の初期値をセット（最新データから）
    setEditCommentValue(sourceSpot.comment || "");
    setEditLinkValue(sourceSpot.link || "");
    
    setIsEditingMemo(openMemo);

    // ★修正: 最新の sourceSpot の情報を使って previewData を作る
    const previewData = { 
        ...sourceSpot, // 最新データを展開
        id: sourceSpot.id, 
        text: sourceSpot.name, 
        place_name: sourceSpot.description, 
        is_saved: isSaved, 
        voters: uniqueVoters, 
        added_by: sourceSpot.added_by, 
        
        // 以下の項目も sourceSpot (dbSpot) から確実に取る
        image_url: sourceSpot.image_url, 
        comment: sourceSpot.comment, 
        link: sourceSpot.link, 
        day: sourceSpot.day || 0, 
        status: sourceSpot.status || 'candidate' 
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

  const handleAutoSearch = (keyword: string) => { setQuery(keyword); setCurrentTab('explore'); };
  const handleSearchFromChat = (keyword: string) => { setCurrentTab('explore'); setQuery(keyword); setIsFocused(true); setTimeout(() => { handleSearch(keyword); }, 300); };
  
  const handleReceiveCandidates = (newCandidates: any[]) => {
      const spotsWithIds = newCandidates.map((s) => ({ ...s, id: `ai-suggest-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, status: 'candidate' }));
      setCandidates(spotsWithIds);
  };

  const handleSaveMemo = async () => {
      if (!selectedResult || !roomId) return;
      const updated = { ...selectedResult, comment: editCommentValue, link: editLinkValue };
      setSelectedResult(updated);
      setPlanSpots(prev => prev.map(s => s.id === updated.id ? { ...s, comment: editCommentValue, link: editLinkValue } : s));
      await supabase.from('spots').update({ comment: editCommentValue, link: editLinkValue }).eq('id', updated.id);
      setIsEditingMemo(false);
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
    if (isAuthLoading || !isJoined) return;
    if (map.current) return; 
    mapboxgl.accessToken = MAPBOX_TOKEN;
    if (mapContainer.current) {
      map.current = new mapboxgl.Map({ container: mapContainer.current, style: 'mapbox://styles/mapbox/streets-v12', center: [lng, lat], zoom: 14, pitch: 45, bearing: 0, antialias: true });
      map.current.on('load', () => {
        if (!map.current) return;
        map.current.resize();
        map.current.addSource('draw-source', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } } });
        map.current.addLayer({ id: 'draw-line', type: 'line', source: 'draw-source', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#EF4444', 'line-width': 4, 'line-opacity': 0.8 } });
        map.current.addLayer({ id: 'draw-fill', type: 'fill', source: 'draw-source', paint: { 'fill-color': '#EF4444', 'fill-opacity': 0.2 } });
        map.current.setPadding({ top: 150, bottom: 200, left: 0, right: 0 }); 
        const layers = map.current.getStyle().layers;
        const labelLayerId = layers?.find((layer) => layer.type === 'symbol' && layer.layout?.['text-field'])?.id;
        if(!map.current.getLayer('3d-buildings')) { map.current.addLayer({ 'id': '3d-buildings', 'source': 'composite', 'source-layer': 'building', 'filter': ['==', 'extrude', 'true'], 'type': 'fill-extrusion', 'minzoom': 15, 'paint': { 'fill-extrusion-color': '#aaa', 'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.05, ['get', 'height']], 'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.05, ['get', 'min_height']], 'fill-extrusion-opacity': 0.6 } }, labelLayerId); }
        map.current.on('click', 'poi-label', (e) => {
          if (!e.features || e.features.length === 0) return;
          const feature = e.features[0];
          const name = feature.properties?.name || "名称不明";
          const category = feature.properties?.category_en || feature.properties?.type || "";
          const address = feature.properties?.address || "";
          const initialDesc = category ? `${category} (${address})` : address || "詳細情報を入力してください";
          // @ts-ignore
          const coordinates = feature.geometry.coordinates.slice();
          const isSaved = planSpotsRef.current.some(s => s.name === name);
          setSelectedResult({ id: Date.now(), text: name, place_name: initialDesc, center: coordinates, is_saved: isSaved, voters: [] });
          setViewMode('selected');
          setIsEditingDesc(false);
          setIsEditingMemo(false);
          setEditCommentValue("");
          setEditLinkValue("");
          
          map.current?.flyTo({ center: coordinates, zoom: 16, offset: [0, -200] });
          
          fetchSpotImage(name).then(img => {
              if(img) setSelectedResult((prev: any) => ({...prev, image_url: img}));
          });
        });
      });
      
    }
    // ★追加: クリーンアップ関数
    return () => {
        if (map.current) {
            map.current.remove();
            map.current = null;
        }
    };
  }, [isAuthLoading, isJoined]);

// ---------------------------------------------------------
  // ▼▼▼ 修正: マーカー描画ロジックの軽量化・最適化版 ▼▼▼
  // ---------------------------------------------------------
  useEffect(() => {
    if (!map.current) return;

    // 1. 高速削除: Refに保存しておいたマーカーを直接削除（DOM検索しないので高速）
    planMarkersRef.current.forEach(marker => marker.remove());
    planMarkersRef.current = [];
    
    // 2. マーカー生成ループ
    filteredSpots.forEach((spot, index) => { 
        // 投票者・参加者の計算
        const voters = spotVotes.filter(v => v.spot_id === spot.id && v.vote_type === 'like').map(v => v.user_name);
        const participants = [spot.added_by, ...voters];
        const uniqueParticipants = Array.from(new Set(participants));
        
        // 色・グラデーションの計算
        const size = 24; 
        const segmentSize = 100 / uniqueParticipants.length;
        const gradientParts = uniqueParticipants.map((name, i) => { 
            const color = getUserColor(name as string); 
            return `${color} ${i * segmentSize}% ${(i + 1) * segmentSize}%`; 
        });
        const gradientString = `conic-gradient(${gradientParts.join(', ')})`;
        
        // スタイル変数の決定
        const isSpotHotel = isHotel(spot.name) || spot.is_hotel;
        const baseColor = isSpotHotel ? '#FEF9C3' : '#FFFFFF'; 
        const textColor = isSpotHotel ? '#CA8A04' : '#1E3A8A'; 
        const isConfirmed = spot.status === 'confirmed';
        const confirmedColor = '#2563EB';
        const isDayView = filterStatus === 'confirmed' && selectedConfirmDay > 0;
        const voteCount = uniqueParticipants.length;

        // ホテル情報の吹き出しHTML作成
        let hotelInfoHtml = '';
        if (isSpotHotel && spot.price) {
            hotelInfoHtml = `
                <div style="position:absolute; bottom:100%; left:50%; transform:translateX(-50%) translateY(-8px); background:white; padding:2px 6px; border-radius:6px; font-size:10px; font-weight:bold; color:#d32f2f; white-space:nowrap; box-shadow:0 2px 4px rgba(0,0,0,0.2); display:flex; flex-direction:column; align-items:center;">
                    <span>¥${Number(spot.price).toLocaleString()}</span>
                    ${spot.rating ? `<span style="font-size:8px; color:#f57c00;">★${spot.rating}</span>` : ''}
                    <div style="position:absolute; top:100%; left:50%; transform:translateX(-50%); width:0; height:0; border-left:4px solid transparent; border-right:4px solid transparent; border-top:4px solid white;"></div>
                </div>
            `;
        }

        // マーカー要素（コンテナ）の作成
        const el = document.createElement('div'); 
        el.className = 'marker-plan'; 
        el.style.cursor = 'pointer';

        // ピンのデザイン設定 (transform: translateY(-50%) は削除済み)
        if (isConfirmed) {
            if (isDayView) {
                // 確定(Day表示): 番号付き角丸ピン
                el.innerHTML = `<div style="position:relative; display:flex; flex-direction:column; align-items:center;">${hotelInfoHtml}<div style="width:${size + 6}px; height:${size + 6}px; background:${confirmedColor}; border-radius:6px; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 10px rgba(0,0,0,0.5);"><div style="width:${size}px; height:${size}px; background:${confirmedColor}; border-radius:5px; display:flex; align-items:center; justify-content:center; color:white; font-weight:800; font-size:14px; border:1px solid rgba(255,255,255,0.3);">${index + 1}</div></div><div style="width:0; height:0; border-left:5px solid transparent; border-right:5px solid transparent; border-top:7px solid ${confirmedColor}; margin-top:-1px; filter:drop-shadow(0 1px 1px rgba(0,0,0,0.1));"></div></div>`;
            } else {
                // 確定(全体): 日付入り丸ピン
                el.innerHTML = `<div style="position:relative; display:flex; flex-direction:column; align-items:center;">${hotelInfoHtml}<div style="width:${size + 6}px; height:${size + 6}px; background:${confirmedColor}; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 10px rgba(0,0,0,0.5);"><div style=\"width:${size}px; height:${size}px; background:${confirmedColor}; border-radius:50%; display:flex; align-items:center; justify-content:center; color:white; font-weight:800; font-size:12px; border:1px solid rgba(255,255,255,0.3);\">${isSpotHotel ? '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg>' : (spot.day || '')}</div></div><div style="width:0; height:0; border-left:5px solid transparent; border-right:5px solid transparent; border-top:7px solid ${confirmedColor}; margin-top:-1px; filter:drop-shadow(0 1px 1px rgba(0,0,0,0.1));"></div></div>`;
            }
        } else {
            // 候補・宿: 投票数入り丸ピン
            el.innerHTML = `<div style="position:relative; display:flex; flex-direction:column; align-items:center;">${hotelInfoHtml}<div style="width:${size + 6}px; height:${size + 6}px; background:${gradientString}; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 5px rgba(0,0,0,0.3);"><div style="width:${size}px; height:${size}px; background:${baseColor}; border-radius:50%; display:flex; align-items:center; justify-content:center; color:${textColor}; font-weight:800; font-size:12px; border:1px solid rgba(0,0,0,0.1);">${isSpotHotel ? '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg>' : (voteCount > 0 ? voteCount : '')}</div></div><div style="width:0; height:0; border-left:5px solid transparent; border-right:5px solid transparent; border-top:7px solid ${baseColor}; margin-top:-1px; filter:drop-shadow(0 1px 1px rgba(0,0,0,0.1));"></div></div>`;
        }
        
        // クリックイベント
        el.onclick = (e) => { e.stopPropagation(); handlePreviewSpot(spot); };
        
        // 3. マーカー登録 & Refに保存 (anchor: 'bottom' で位置ズレ防止)
        const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
            .setLngLat(spot.coordinates)
            .addTo(map.current!);
            
        planMarkersRef.current.push(marker);
    });
      
  }, [filteredSpots, spotVotes, currentTab, filterStatus, selectedConfirmDay]);

 // 認証中、または未参加（名前未入力）の場合
 // 認証中、または未参加（名前未入力）の場合
  if (isAuthLoading || (!roomId && !isJoined) || (roomId && !isJoined)) {
    return (
        <>
            {/* ここにあった showIncognitoWarning のブロックを削除し、WelcomePageのみにする */}
            <WelcomePage inviteRoomId={roomId} />
        </>
    );
  }

  return (
    <main className="relative w-screen h-[100dvh] bg-slate-100 overflow-hidden flex flex-col font-sans">
      <LegalModal />
      <Ticker />

      {/* ★追加: シークレットモード警告モーダル */}
     {showIncognitoWarning && (
                <div className="fixed inset-0 z-[999] bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
                    <div className="bg-white w-full max-w-sm rounded-[2rem] p-8 shadow-2xl relative text-center border-4 border-red-100">
                        <div className="w-20 h-20 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                            <XCircle size={40} />
                        </div>
                        <h3 className="text-xl font-black text-gray-900 mb-4">シークレットモード<br/>注意！</h3>
                        <p className="text-sm text-gray-600 mb-6 leading-relaxed font-bold">
                            現在、シークレットモード（プライベートブラウジング）で開いている可能性があります。<br/><br/>
                            <span className="text-red-500 bg-red-50 px-2 py-1 rounded">ブラウザを閉じるとデータが消えます</span><br/><br/>
                            作成したプランを保存するために、通常のモードで開き直すことを強くおすすめします。
                        </p>
                        <button 
                            onClick={() => setShowIncognitoWarning(false)} 
                            className="w-full py-4 bg-gray-200 text-gray-600 rounded-2xl font-bold text-sm hover:bg-gray-300 transition"
                        >
                            リスクを承知で続ける
                        </button>
                    </div>
                </div>
            )}

            {/* ★追加: オンボーディングモーダル (他の警告より手前に表示したい場合は順序調整) */}
      {showOnboarding && <OnboardingModal onClose={() => setShowOnboarding(false)} />}
      
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

      <div className="flex-1 relative overflow-hidden flex flex-col md:flex-row">
        <div className={`relative h-full w-full md:flex-1 ${currentTab === 'explore' ? 'block' : 'hidden md:block'}`}>
          <div ref={mapContainer} className="absolute top-0 left-0 w-full h-full z-0" style={{ touchAction: isDrawing ? 'none' : 'auto' }} />

          <div className="absolute top-32 right-4 z-20 flex flex-col gap-3">
             <button 
                onClick={() => isDrawing ? stopDrawing() : startDrawing()} 
                className={`w-12 h-12 rounded-full shadow-xl font-bold transition-all duration-300 flex items-center justify-center border-2 ${isDrawing ? 'bg-red-500 border-red-400 text-white animate-pulse scale-110' : 'bg-white border-white text-gray-700 hover:scale-110'}`}
             >
                 {isDrawing ? <X size={24}/> : <PenTool size={20}/>}
             </button>
             
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

             {isDrawing && <div className="absolute top-1 right-14 bg-black/80 backdrop-blur text-white px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap shadow-lg">かこって検索</div>}
          </div>

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
                
                <button 
                    onClick={() => setCurrentTab('swipe')} 
                    className="bg-gradient-to-tr from-indigo-500 to-purple-600 text-white w-10 h-10 rounded-full font-black text-xs shadow-md hover:scale-110 transition active:scale-95 flex items-center justify-center shrink-0"
                    title="AI提案ページへ"
                >
                    AI
                </button>

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
              <div className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl pointer-events-auto overflow-hidden animate-in slide-in-from-bottom-10 border border-gray-100 flex flex-col max-h-[70vh]">
                <div className="relative h-32 shrink-0 bg-gray-200">
                  <SpotImage 
                      src={selectedResult.image_url} 
                      alt={selectedResult.text} 
                      className="w-full h-full object-cover"
                      onClick={() => selectedResult.image_url && setExpandedImage(selectedResult.image_url)}
                  />
                  <button 
                    onClick={() => { setSelectedResult(null); setViewMode('default'); }} 
                    className="absolute top-3 right-3 bg-black/40 hover:bg-black/60 text-white p-1.5 rounded-full transition backdrop-blur-sm z-10"
                  >
                    <X size={16}/>
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 p-4 pt-10 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none">
                      <h2 className="text-xl font-black text-white leading-tight truncate">{selectedResult.text}</h2>
                      {isEditingDesc ? (
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

                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white overscroll-contain">
                  
                  {selectedResult.is_saved && selectedResult.id && (
                      <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between">
                          <span className="text-xs font-bold text-gray-500 flex items-center gap-1">
                              <Calendar size={14}/> 日程・グループ
                          </span>
                          <div className="relative">
                              <select 
                                  value={selectedResult.day || 0} 
                                  onChange={(e) => updateSpotDay(selectedResult, parseInt(e.target.value))}
                                  className="appearance-none bg-gray-50 border border-gray-200 text-gray-800 text-xs font-bold py-2 pl-3 pr-8 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100"
                              >
                                  <option value={0}>未定 (Day 0)</option>
                                  {Array.from({ length: travelDays }).map((_, i) => (
                                      <option key={i + 1} value={i + 1}>Day {i + 1}</option>
                                  ))}
                              </select>
                              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                                  <ChevronDown size={12} />
                              </div>
                          </div>
                      </div>
                  )}

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

                      {(isHotel(selectedResult.text) || selectedResult.is_hotel) && (
                        <button 
                            onClick={() => window.open(getAffiliateUrl(selectedResult), '_blank')} 
                            className="flex items-center gap-1 bg-[#BF0000] text-white px-3 py-2 rounded-lg text-[10px] font-bold hover:bg-[#900000] transition whitespace-nowrap shrink-0 shadow-sm"
                        >
                            <span className="opacity-75 text-[9px] border border-white/50 px-0.5 rounded-[2px] mr-0.5">PR</span>
                            楽天で見る <ExternalLink size={12}/>
                        </button>
                      )}

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
                      <button onClick={() => removeSpot(selectedResult)} className="w-full bg-white text-red-500 border border-red-100 py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-red-50 transition active:scale-95 shadow-sm">
                          <Trash2 size={14}/> リストから削除
                      </button>
                  ) : (
                      <button onClick={() => { addSpot({ name: selectedResult.text, description: selectedResult.place_name, coordinates: selectedResult.center, status: 'candidate' }); setSelectedResult((prev: any) => ({...prev, is_saved: true})); }} className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg hover:bg-blue-700 transition active:scale-95">
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
                          {(filterStatus === 'confirmed' || filterStatus === 'candidate' || filterStatus === 'hotel_candidate') ? (
                              <>
                                  <button 
                                      onClick={(e) => { 
                                          e.stopPropagation(); 
                                          if (filterStatus === 'confirmed') setSelectedConfirmDay(0);
                                          else if (filterStatus === 'candidate') setSelectedCandidateDay(0);
                                          else setSelectedHotelDay(0);
                                      }}
                                      className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition border flex-shrink-0 flex items-center gap-1 relative ${
                                          (filterStatus === 'confirmed' ? selectedConfirmDay : (filterStatus === 'candidate' ? selectedCandidateDay : selectedHotelDay)) === 0 
                                          ? (filterStatus === 'confirmed' ? 'bg-blue-600 text-white border-blue-600' : (filterStatus === 'candidate' ? 'bg-yellow-500 text-white border-yellow-500' : 'bg-orange-500 text-white border-orange-500'))
                                          : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-100'
                                      }`}
                                  >
                                      未定 <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${(filterStatus === 'confirmed' ? selectedConfirmDay : (filterStatus === 'candidate' ? selectedCandidateDay : selectedHotelDay)) === 0 ? 'bg-white/20' : 'bg-gray-100'}`}>
                                          {planSpots.filter(s => s.status === filterStatus && (!s.day || s.day === 0)).length}
                                      </span>
                                      
                                      {/* バッジ表示 */}
                                      {((filterStatus === 'confirmed' ? selectedConfirmDay : (filterStatus === 'candidate' ? selectedCandidateDay : selectedHotelDay)) !== 0) && 
                                       (filterStatus === 'confirmed' ? unreadCounts.confirmedDays[0] > 0 : 
                                        filterStatus === 'candidate' ? unreadCounts.candidateDays[0] > 0 :
                                        (unreadCounts.hotelDays && unreadCounts.hotelDays[0] > 0)) && (
                                          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold flex items-center justify-center rounded-full border-2 border-white shadow-sm z-10">
                                                  {filterStatus === 'confirmed' ? unreadCounts.confirmedDays[0] : (filterStatus === 'candidate' ? unreadCounts.candidateDays[0] : unreadCounts.hotelDays[0])}
                                              </span>
                                      )}
                                  </button>

                               {Array.from({ length: travelDays }).map((_, i) => {
                                      const dayNum = i + 1;
                                      
                                      // アクティブ判定
                                      let isActive = false;
                                      if (filterStatus === 'confirmed') isActive = selectedConfirmDay === dayNum;
                                      else if (filterStatus === 'candidate') isActive = selectedCandidateDay === dayNum;
                                      else isActive = selectedHotelDay === dayNum;

                                      // 宿リストの場合、最終日（帰る日）のタブは表示しない
                                      if (filterStatus === 'hotel_candidate' && dayNum === travelDays) return null;

                                      // 色設定
                                      let activeClass = 'bg-blue-600 text-white border-blue-600';
                                      if (filterStatus === 'candidate') activeClass = 'bg-yellow-500 text-white border-yellow-500';
                                      if (filterStatus === 'hotel_candidate') activeClass = 'bg-orange-500 text-white border-orange-500'; // ★念のため追加
                                      
                                      // ラベル設定 (宿の場合は "Day 1-2" 表記)
                                      const label = filterStatus === 'hotel_candidate' ? `Day ${dayNum}-${dayNum+1}` : `Day ${dayNum}`;

                                      // カウント計算（バッジ用）
                                      // ★修正: ここで宿リスト(hotelDays)のカウントも取得するように変更
                                      const unreadCount = filterStatus === 'confirmed' ? (unreadCounts.confirmedDays[dayNum] || 0) :
                                                          filterStatus === 'candidate' ? (unreadCounts.candidateDays[dayNum] || 0) :
                                                          (unreadCounts.hotelDays && unreadCounts.hotelDays[dayNum] || 0);

                                      // スポット数（右側の小さい数字）
                                      let spotCount = planSpots.filter(s => s.status === filterStatus && s.day === dayNum).length;
                                      
                                      // 確定リストで2日目以降の場合、前日の宿を含めるロジック
                                      if (filterStatus === 'confirmed' && dayNum > 1) {
                                          const prevHotel = planSpots.find(s => 
                                              s.status === 'confirmed' && 
                                              s.day === dayNum - 1 && 
                                              (s.is_hotel || isHotel(s.name))
                                          );
                                          if (prevHotel) {
                                              const isDuplicate = planSpots.some(s => s.status === 'confirmed' && s.day === dayNum && s.id === prevHotel.id);
                                              if (!isDuplicate) spotCount += 1;
                                          }
                                      }

                                      return (
                                          <button 
                                            key={dayNum}
                                            onClick={(e) => { 
                                                e.stopPropagation(); 
                                                if (filterStatus === 'confirmed') setSelectedConfirmDay(dayNum);
                                                else if (filterStatus === 'candidate') setSelectedCandidateDay(dayNum);
                                                else setSelectedHotelDay(dayNum);
                                            }}
                                            className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition border flex-shrink-0 flex items-center gap-1 relative ${isActive ? activeClass : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-100'}`}
                                          >
                                            {label}
                                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white/20' : 'bg-gray-100'}`}>
                                                {spotCount}
                                            </span>
                                            
                                            {/* ★追加: 未読バッジ (isActiveでない、かつ未読がある場合) */}
                                            {!isActive && unreadCount > 0 && (
                                                <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold flex items-center justify-center rounded-full border-2 border-white shadow-sm z-10 animate-pulse">
                                                    {unreadCount}
                                                </span>
                                            )}
                                          </button>
                                      );
                                  })}
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
                              else if (filterStatus === 'candidate') targetDay = selectedCandidateDay;
                              else if (filterStatus === 'hotel_candidate') targetDay = selectedHotelDay;

                              // スポットをフィルタリング (Dayで絞り込み)
                              let displaySpots = filteredSpots;
                              // filteredSpotsはfilterStatusで絞り込まれているが、Dayまでは考慮していない場合があるためここで再確認
                              //if (targetDay !== -1) {
                              //    displaySpots = planSpots.filter(s => s.status === filterStatus && (s.day || 0) === targetDay);
                              //}

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
                                                const isNew = isNewSpot(spot);
                                                const visitOrder = displayTimeline.slice(0, idx + 1).filter(t => t.type === 'spot').length;

                                             return (
                                                    <div 
                                                        key={`spot-${idx}`} 
                                                        // ★追加: スクロール用のID
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
            {item.arrival?.split(':')[0]}:{item.arrival?.split(':')[1]}
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
                                                                <div className="flex justify-between items-start">
                                                                    <h3 className="font-bold text-gray-800 text-xs truncate flex-1">{spot.name}</h3>
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
<div className="text-[10px] truncate flex items-center gap-1 shrink-0 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">
    <Clock size={10} className="text-gray-400"/>
    {(() => {
        // 安全策: データがない場合はデフォルト表示
        if (!item.arrival || !item.departure) {
             return <span className="text-gray-400">{item.stay_min || 0}分</span>;
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

            // 2. 前のスポットとの整合性チェック (時間が飛んでいないか)
            let isInconsistent = false;
            // idx は displayTimeline.map の引数として受け取っている前提
            const prevTravel = displayTimeline[idx - 1];
            const prevSpot = displayTimeline[idx - 2];

            if (prevTravel && prevTravel.type === 'travel' && prevSpot && prevSpot.type === 'spot' && prevSpot.departure) {
                const [pH, pM] = prevSpot.departure.split(':').map(Number);
                const [cH, cM] = item.arrival.split(':').map(Number);
                const travelMin = prevTravel.duration_min || 0;
                
                // 期待される到着時間
                const expectedMin = (pH * 60 + pM + travelMin) % 1440;
                // 実際の到着時間
                const currentMin = (cH * 60 + cM) % 1440;
                
                if (expectedMin !== currentMin) {
                    isInconsistent = true;
                }
            }

            // 赤くするかどうかの判定
            const isWarning = isNegative || isInconsistent;

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
            return <span className="text-gray-400">{item.stay_min || 0}分</span>;
        }
    })()}
</div>

                                                                            {/* 金額 (price優先) */}
                                                                            {(spot.price || spot.cost) && (
                                                                                <div className="flex items-center gap-1 text-[10px] font-bold text-yellow-700 bg-yellow-50 px-1.5 py-0.5 rounded border border-yellow-100 shrink-0">
                                                                                    <Banknote size={10}/> ¥{Number(spot.price || spot.cost).toLocaleString()}
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
                                                                        {spot.comment && !isSpotHotel ? (
                                                                            <span className="text-[10px] text-gray-600 font-medium truncate flex-1 flex items-center gap-1 min-w-0 mt-0.5">
                                                                                <MessageSquare size={10} className="shrink-0 text-gray-400"/> {spot.comment}
                                                                            </span>
                                                                        ) : (
                                                                            <span className="text-[10px] text-gray-300 truncate flex-1 min-w-0 mt-0.5">{spot.description}</span>
                                                                        )}
                                                                    </div>

                                                                    {/* 右側: アクションボタン */}
                                                                    <div className="flex gap-1 items-center shrink-0 mb-0.5">
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
                                                                <span>{item.duration_min}分 移動</span>
                                                            </div>

                                                            {/* 詳細情報タグ (時間・金額・リンク・メモ) */}
                                                            {(item.transport_departure || item.transport_arrival || item.cost || item.url || item.note) && (
                                                                <div className="flex flex-col gap-1 mt-0.5">
                                                                    <div className="flex flex-wrap gap-1 items-center">
                                                                        {/* 出発・到着時間 */}
                                                                        {(item.transport_departure || item.transport_arrival) && (
                                                                            <div className="flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 shrink-0">
                                                                                <Clock size={10}/>
                                                                                {item.transport_departure && <span>{item.transport_departure}発</span>}
                                                                                {item.transport_departure && item.transport_arrival && <span className="text-indigo-300 mx-0.5">→</span>}
                                                                                {item.transport_arrival && <span>{item.transport_arrival}着</span>}
                                                                            </div>
                                                                        )}

                                                                        {/* 金額 */}
                                                                        {item.cost && (
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
                                        const isNew = isNewSpot(spot);
                                        
                                        return (
                                            <div 
                                               // <div 
                                                key={spot.id || idx} 
                                                // ★追加: スクロール用のID
                                                id={`spot-item-${spot.id}`}
                                                //className={`rounded-xl shadow-sm border overflow-hidden flex h-16 transition active:scale-[0.98] animate-in slide-in-from-bottom-2 fade-in relative ${ 
                                                className={`rounded-xl shadow-sm border overflow-hidden flex h-16 transition active:scale-[0.98] animate-in slide-in-from-bottom-2 fade-in relative ${
                                                    // ★修正: 新着なら黄色
                                                    isNew 
                                                        ? 'bg-yellow-50 border-yellow-400 ring-2 ring-yellow-200' 
                                                        : 'bg-white border-gray-100'
                                                }`}
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
                                                    <div className="flex justify-between items-start">
                                                        <h3 className="font-bold text-gray-800 text-xs truncate flex-1">{spot.name}</h3>
                                                        <div className="flex gap-1 shrink-0 ml-1">
                                                            {voteCount > 0 && <span className="flex items-center gap-0.5 text-[9px] font-bold text-blue-500 bg-blue-50 px-1 py-0.5 rounded"><ThumbsUp size={8}/> {voteCount}</span>}
                                                            {(filterStatus === 'candidate' || filterStatus === 'hotel_candidate') && (
    <button 
        onClick={(e) => { e.stopPropagation(); handleStatusChangeClick(spot, 'confirmed'); }} 
        className="bg-blue-600 text-white text-[9px] px-2 py-0.5 rounded font-bold hover:bg-blue-700 transition"
    >
        確定にする
    </button>
)}
                                                            {filterStatus === 'confirmed' && (
                                                                <button 
                                                                    // ▼▼▼ 修正: 宿判定を行い、適切なステータスを渡す
                                                                    onClick={(e) => { 
                                                                        e.stopPropagation(); 
                                                                        const nextStatus = isSpotHotel ? 'hotel_candidate' : 'candidate';
                                                                        handleStatusChangeClick(spot, nextStatus); 
                                                                    }} 
                                                                    className="bg-gray-100 border border-gray-200 text-gray-600 text-[9px] px-2 py-0.5 rounded font-bold hover:bg-gray-200 transition whitespace-nowrap"
                                                                >
                                                                    {isSpotHotel ? '宿リストに戻す' : '候補に戻す'}
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                   <div className="flex gap-2 items-center justify-end mt-1">
                                                        {spot.comment ? (
                                                            <span className="text-[10px] text-gray-600 font-medium truncate flex-1 flex items-center gap-1"><MessageSquare size={10} className="shrink-0 text-gray-400"/> {spot.comment}</span>
                                                        ) : (
                                                            <span className="text-[10px] text-gray-300 truncate flex-1">{spot.description}</span>
                                                        )}

                                                        {/* ★追加: リンクボタン */}
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

                                                        {isSpotHotel && (
                                                            <button 
                                                                onClick={(e) => { 
                                                                    e.stopPropagation(); 
                                                                    // ★追加: ログ送信
                                    logAffiliateClick(spot.name, "main_list_item");
                                    window.open(getAffiliateUrl(spot), '_blank');
                                                                }}
                                                                className="flex items-center gap-1 bg-[#BF0000] text-white px-2 py-0.5 rounded text-[9px] font-bold hover:bg-[#900000] transition shrink-0 shadow-sm"
                                                            >
                                                                <span className="opacity-75 text-[8px] border border-white/50 px-0.5 rounded-[2px]">PR</span>
                                                                楽天で見る <ExternalLink size={8}/>
                                                            </button>
                                                        )}
                                                        <button onClick={(e) => { e.stopPropagation(); removeSpot(spot); }} className="p-1 text-gray-300 hover:text-red-500 transition"><Trash2 size={12}/></button>
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
               {currentTab === 'menu' && <div className="w-full h-full"><MenuView spots={planSpots} /></div>}
               
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
<div 
    className={`fixed top-0 right-0 bottom-0 w-16 z-[60] pointer-events-none transition-opacity duration-300 flex justify-end ${
        showZoomUI ? 'opacity-100' : 'opacity-0'
    }`}
>
    {/* 背景の黒い帯（フェードイン・アウト） */}
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
        <div className="absolute bottom-0 left-0 w-full z-[50] pointer-events-auto">
          <BottomNav currentTab={currentTab} onTabChange={setCurrentTab} voteBadge={voteBadgeCount} />
        </div>
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="flex h-screen w-screen items-center justify-center bg-gray-50"><div className="animate-pulse flex flex-col items-center gap-4"><div className="w-16 h-16 bg-gray-200 rounded-full"></div><div className="h-4 w-32 bg-gray-200 rounded"></div></div></div>}>
      <HomeContent />
    </Suspense>
  );
}