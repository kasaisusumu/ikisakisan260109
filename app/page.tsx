"use client";

// ビルドエラー回避：動的レンダリングを強制
export const dynamic = 'force-dynamic';

import React, { Suspense, useEffect, useRef, useState, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
// ... (imports省略: 変更なし) ...
import { 
  Search, X, Plus, ExternalLink, Map as MapIcon, History, Trash2, 
  MapPinned, Users, Edit2, CheckCircle, HelpCircle, 
  BedDouble, ChevronDown, ChevronUp, Calendar, MapPin,
  Image as ImageIcon, Users as UsersIcon,
  PenTool, Loader2, Clock, ThumbsUp, Link as LinkIcon, MessageSquare,
  Save, XCircle, Edit3, ArrowRight, Maximize,
  Car, Train, Footprints, Zap, Plane, Ship, Camera, Globe, ArrowLeftCircle, Database,
  Banknote, ExternalLink as ExternalLinkIcon, StickyNote // アイコン追加確認
} from 'lucide-react';

// ... (コンポーネントインポート省略: 変更なし) ...
import BottomNav from './components/BottomNav';
import HotelListView from './components/HotelListView';
import PlanView from './components/PlanView';
import MenuView from './components/MenuView';
import Ticker from './components/Ticker';
import SwipeView from './components/SwipeView';
import LegalModal from './components/LegalModal';
import WelcomePage from './components/WelcomePage';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ... (SpotImage コンポーネント省略: 変更なし) ...
const SpotImage = ({ src, alt, className, onClick }: { src?: string | null, alt: string, className?: string, onClick?: () => void }) => {
    // ... (中身変更なし) ...
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

// ... (型定義など省略: 変更なし) ...
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

function HomeContent() {
  // ... (Hooks定義省略: 変更なし) ...
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
  const [isSuggesting, setIsSuggesting] = useState(false);

  const [isEditingMemo, setIsEditingMemo] = useState(false); 
  const [editCommentValue, setEditCommentValue] = useState("");
  const [editLinkValue, setEditLinkValue] = useState("");
  
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [editDescValue, setEditDescValue] = useState("");
  const [showVoteDetailSpot, setShowVoteDetailSpot] = useState<any>(null);

  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
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

  // ... (handleDragStart, handleDragMove, handleDragEnd, handleHeaderClick 省略: 変更なし) ...
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

  const planSpotsRef = useRef(planSpots);
  useEffect(() => { planSpotsRef.current = planSpots; }, [planSpots]);

  // ... (未読管理ロジック 省略: 変更なし) ...
  const mountTimeRef = useRef(Date.now());
  const [lastVisited, setLastVisited] = useState<Record<string, number>>({});
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
  const isNewSpot = (spot: any) => {
      // 自分が追加したものもハイライトする場合はここをコメントアウト解除
      // if (spot.added_by === userName) return false; 
      const key = getContextKey(spot.status, spot.day);
      const threshold = lastVisited[key] ?? mountTimeRef.current;
      return new Date(spot.created_at).getTime() > threshold;
  };
  const unreadCounts = useMemo(() => {
      const counts = {
          confirmed: 0,
          candidate: 0,
          hotel_candidate: 0,
          confirmedDays: {} as Record<number, number>,
          candidateDays: {} as Record<number, number>,
      };
      planSpots.forEach(s => {
          if (isNewSpot(s)) {
              if (s.status === 'confirmed') {
                  counts.confirmed++;
                  const d = s.day || 0;
                  counts.confirmedDays[d] = (counts.confirmedDays[d] || 0) + 1;
              } else if (s.status === 'candidate') {
                  counts.candidate++;
                  const d = s.day || 0;
                  counts.candidateDays[d] = (counts.candidateDays[d] || 0) + 1;
              } else if (s.status === 'hotel_candidate') {
                  counts.hotel_candidate++;
              }
          }
      });
      return counts;
  }, [planSpots, lastVisited, userName]);

  // ... (useEffect for drawing reset etc 省略) ...
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

  // ... (設定読み込み useEffect 省略) ...
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

  // ... (Timeline構築 logic 省略) ...
  useEffect(() => {
      if (filterStatus === 'confirmed' && roomId) {
          const day = selectedConfirmDay === 0 ? 0 : selectedConfirmDay;
          if (day === 0) {
               setDisplayTimeline(planSpots.filter(s => s.status === 'confirmed' && (s.day === 0 || !s.day)).map(s => ({ type: 'spot', spot: s })));
               return;
          }
          const storageKey = `rh_plan_${roomId}_day_${day}`;
          const savedPlan = localStorage.getItem(storageKey);
          let timeline = [];
          if (savedPlan) {
              try {
                  const data = JSON.parse(savedPlan);
                  if (data.timeline && Array.isArray(data.timeline)) { timeline = data.timeline; }
              } catch(e) { console.error("Plan parse error", e); }
          }
          const spotsInDay = planSpots.filter(s => s.status === 'confirmed' && s.day === day);
          const storageSpotIds = new Set(timeline.filter((t: any) => t.type === 'spot').map((t: any) => String(t.spot.id || t.spot.name)));
          if (timeline.length === 0 || spotsInDay.length !== storageSpotIds.size) {
               const newTimeline: any[] = [];
               spotsInDay.forEach((spot, i) => {
                   newTimeline.push({ type: 'spot', spot, stay_min: spot.stay_time || 60 });
                   if (i < spotsInDay.length - 1) { newTimeline.push({ type: 'travel', duration_min: 30, transport_mode: 'car' }); }
               });
               timeline = calculateSimpleSchedule(newTimeline);
          }
          setDisplayTimeline(timeline);
      }
  }, [filterStatus, selectedConfirmDay, planSpots, roomId, currentTab]);

  // ... (fetchSpotImage useEffect 省略) ...
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

  const getAffiliateUrl = (spot: any) => {
      let targetUrl = "";
      if (spot.url && spot.url.includes('rakuten.co.jp')) { targetUrl = spot.url; }
      else if (spot.id && /^\d+$/.test(spot.id)) {
          const today = new Date();
          const nextMonth = new Date(today);
          nextMonth.setDate(today.getDate() + 30);
          const y1 = nextMonth.getFullYear();
          const m1 = nextMonth.getMonth() + 1;
          const d1 = nextMonth.getDate();
          const nextDay = new Date(nextMonth);
          nextDay.setDate(nextMonth.getDate() + 1);
          const y2 = nextDay.getFullYear();
          const m2 = nextDay.getMonth() + 1;
          const d2 = nextDay.getDate();
          targetUrl = `https://hotel.travel.rakuten.co.jp/hotelinfo/plan/${spot.id}?f_teikei=&f_heya_su=1&f_otona_su=${adultNum}&f_nen1=${y1}&f_tuki1=${m1}&f_hi1=${d1}&f_nen2=${y2}&f_tuki2=${m2}&f_hi2=${d2}&f_sort=min_charge`;
      }
      else {
          const queryName = spot.name || "";
          targetUrl = spot.url || `https://search.travel.rakuten.co.jp/ds/hotel/search?f_teikei=&f_query=${encodeURIComponent(queryName)}&f_sort=min_charge`;
      }
      if (RAKUTEN_AFFILIATE_ID) {
           return `https://hb.afl.rakuten.co.jp/hgc/${RAKUTEN_AFFILIATE_ID}/?pc=${encodeURIComponent(targetUrl)}&m=${encodeURIComponent(targetUrl)}`;
      }
      return targetUrl;
  };

  const allParticipants = useMemo(() => {
      const users = new Set<string>();
      if (userName) users.add(userName);
      planSpots.forEach(s => { if (s.added_by) users.add(s.added_by); });
      spotVotes.forEach(v => { if (v.user_name) users.add(v.user_name); });
      return Array.from(users).sort();
  }, [planSpots, spotVotes, userName]);

  const getUserColor = (name: string) => {
      const index = allParticipants.indexOf(name);
      if (index === -1) return '#9CA3AF';
      return UD_COLORS[index % UD_COLORS.length];
  };

  const rakutenHomeUrl = useMemo(() => {
      let targetUrl = 'https://travel.rakuten.co.jp/';
      if (startDate) {
          try {
              const [y, m, d] = startDate.split('-').map(Number);
              const start = new Date(y, m - 1, d);
              const end = new Date(start); 
              end.setDate(start.getDate() + 1); 
              const y1 = start.getFullYear();
              const m1 = start.getMonth() + 1;
              const d1 = start.getDate();
              const y2 = end.getFullYear();
              const m2 = end.getMonth() + 1;
              const d2 = end.getDate();
              targetUrl = `https://search.travel.rakuten.co.jp/ds/hotel/search?f_teikei=&f_heya_su=1&f_otona_su=${adultNum}&f_nen1=${y1}&f_tuki1=${m1}&f_hi1=${d1}&f_nen2=${y2}&f_tuki2=${m2}&f_hi2=${d2}&f_sort=min_charge`;
          } catch(e) { console.error("Date parse error for Rakuten URL", e); }
      }
      if (RAKUTEN_AFFILIATE_ID) {
          return `https://hb.afl.rakuten.co.jp/hgc/${RAKUTEN_AFFILIATE_ID}/?pc=${encodeURIComponent(targetUrl)}&m=${encodeURIComponent(targetUrl)}`;
      }
      return targetUrl;
  }, [startDate, adultNum]);

  // ... (filteredSpots, fitBoundsToSpots useEffect 省略) ...
  const filteredSpots = useMemo(() => {
      if (filterStatus === 'all') return planSpots;
      let spots = planSpots;
      if (filterStatus === 'confirmed') {
          spots = planSpots.filter(s => s.status === 'confirmed');
          spots = spots.filter(s => (s.day || 0) === selectedConfirmDay);
      } 
      else if (filterStatus === 'candidate') {
          spots = planSpots.filter(s => (s.status || 'candidate') === 'candidate');
          spots = spots.filter(s => (s.day || 0) === selectedCandidateDay);
      } 
      else {
          spots = planSpots.filter(s => (s.status || 'candidate') === filterStatus);
      }
      return spots;
  }, [planSpots, filterStatus, selectedConfirmDay, selectedCandidateDay]);

  useEffect(() => {
      if (currentTab === 'explore' && !isSearching && !selectedResult && map.current) {
          fitBoundsToSpots(filteredSpots);
      }
  }, [filteredSpots, currentTab]);

  const handleStatusChangeClick = (spot: any, newStatus: string) => {
      if (newStatus !== 'confirmed' && newStatus !== spot.status) {
          if (!confirm("候補リストに戻しますか？\n設定された日付はリセットされます。")) return;
      }
      if (newStatus === 'confirmed') { setSpotToAssignDay(spot); } else { updateSpotStatus(spot, newStatus, 0); }
  };

  const confirmSpotDay = async (day: number) => {
      if (!spotToAssignDay) return;
      await updateSpotStatus(spotToAssignDay, 'confirmed', day);
      setSpotToAssignDay(null);
      if(day > 0) setSelectedConfirmDay(day);
  };

  const updateSpotStatus = async (spot: any, newStatus: string, day: number = 0) => {
      if (!roomId) return;
      // Optimistic update
      setPlanSpots(prev => prev.map(s => s.id === spot.id ? { ...s, status: newStatus, day: day } : s));
      const { error } = await supabase.from('spots').update({ status: newStatus, day: day }).eq('id', spot.id);
      if (error) { console.error("Status update failed:", error); loadRoomData(roomId); } // Fallback
  };

  const updateSpotDay = async (spot: any, newDay: number) => {
      if (!roomId) return;
      setPlanSpots(prev => prev.map(s => s.id === spot.id ? { ...s, day: newDay } : s));
      if (selectedResult && selectedResult.id === spot.id) { setSelectedResult((prev: any) => ({ ...prev, day: newDay })); }
      const { error } = await supabase.from('spots').update({ day: newDay }).eq('id', spot.id);
      if (error) { console.error("Day update failed:", error); loadRoomData(roomId); }
  };

  const handleToggleVote = async (spotId: string | number) => {
    if (!userName || !roomId) return alert("名前を入力してください");
    const targetId = String(spotId);
    const myVote = spotVotes.find(v => String(v.spot_id) === targetId && v.user_name === userName);

    if (myVote) {
        if (myVote.vote_type === 'like') {
            // Like -> Nope (論理削除的な扱いだが、スワイプ除外のためNopeへ更新)
            const newVote = { ...myVote, vote_type: 'nope' };
            setSpotVotes(prev => prev.map(v => v.id === myVote.id ? newVote : v));
            await supabase.from('votes').update({ vote_type: 'nope' }).eq('id', myVote.id);
        } else {
            // Nope -> Like
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

  // ... (Search logic 省略: 変更なし) ...
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

  // ... (Map marker logic 省略: 変更なし) ...
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
    if (suggestion.is_room_cache) {
        const isSaved = planSpots.some(s => s.name === suggestion.name);
        showResultOnMap(suggestion.name, suggestion.place_name, suggestion.center, isSaved);
        if (suggestion.image_url) { setSelectedResult((prev: any) => ({ ...prev, image_url: suggestion.image_url })); }
        return;
    }
    if (suggestion.is_history && suggestion.center) {
        const isSaved = planSpots.some(s => s.name === suggestion.name);
        showResultOnMap(suggestion.name, suggestion.place_name, suggestion.center, isSaved);
        const img = await fetchSpotImage(suggestion.name);
        if(img) setSelectedResult((prev: any) => ({...prev, image_url: img}));
        return;
    }
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

  // ★★★ 重要変更箇所：リアルタイム更新の最適化 ★★★
  useEffect(() => {
    if (roomId && isJoined) {
      // 初期ロードだけ行う
      loadRoomData(roomId);

      const channel = supabase.channel('room_updates')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'spots', filter: `room_id=eq.${roomId}` }, (payload) => {
            // 全読み込み(loadRoomData)をやめて、Payloadを使ってローカルStateを更新
            if (payload.eventType === 'INSERT') {
                const newSpot = payload.new;
                setPlanSpots(prev => {
                    if (prev.some(s => s.id === newSpot.id)) return prev; // 重複防止
                    return [...prev, newSpot].sort((a, b) => (a.order || 0) - (b.order || 0));
                });
            } else if (payload.eventType === 'UPDATE') {
                const updatedSpot = payload.new;
                setPlanSpots(prev => prev.map(s => s.id === updatedSpot.id ? updatedSpot : s));
            } else if (payload.eventType === 'DELETE') {
                const deletedSpotId = payload.old.id;
                setPlanSpots(prev => prev.filter(s => s.id !== deletedSpotId));
            }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'votes', filter: `room_id=eq.${roomId}` }, (payload) => {
            // Votesも同様に差分更新
            if (payload.eventType === 'INSERT') {
                setSpotVotes(prev => [...prev, payload.new]);
            } else if (payload.eventType === 'UPDATE') {
                setSpotVotes(prev => prev.map(v => v.id === payload.new.id ? payload.new : v));
            } else if (payload.eventType === 'DELETE') {
                setSpotVotes(prev => prev.filter(v => v.id !== payload.old.id));
            }
        })
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }
  }, [roomId, isJoined]);

  // ... (他のuseEffect類 省略: 変更なし) ...
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => { if (query.trim()) { handleSearch(); } else { setSearchResults([]); } }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [query]);

  useEffect(() => {
    // ここでの loadRoomData は削除（上のuseEffectで初期化済み）
    if (currentTab === 'explore' && map.current) { setTimeout(() => { map.current?.resize(); fitBoundsToSpots(planSpots); }, 100); }
  }, [currentTab]);

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

  const loadRoomData = async (id: string) => {
    const { data: spots } = await supabase.from('spots').select('*').eq('room_id', id).order('order', { ascending: true });
    const { data: allVotes } = await supabase.from('votes').select('*').eq('room_id', id);
    const { data: roomData } = await supabase.from('rooms').select('name').eq('id', id).single();
    if (roomData) { saveToRoomHistory(id, roomData.name); } else { saveToRoomHistory(id, 'Unkown Trip'); }

    if (spots) {
      setPlanSpots(spots);
      if (currentTab === 'explore' && !isSearching && !selectedResult) { fitBoundsToSpots(spots); }
    }
    if (allVotes) setSpotVotes(allVotes);
  };

  // ... (以下、各種ヘルパー関数など省略: 変更なし) ...
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

  const handleLikeCandidate = async (spot: any) => {
    setLikedHistory(prev => [...prev, spot.name]);
    setCandidates(prev => prev.filter(s => s.id !== spot.id));
    await addSpot({ ...spot, status: 'candidate' });
  };

  const handleNopeCandidate = (spot: any) => {
    setNopedHistory(prev => [...prev, spot.name]);
    setCandidates(prev => prev.filter(s => s.id !== spot.id));
  };

  const addSpot = async (spot: any) => {
    if (!roomId) return alert("ルームIDが見つかりません。");
    const spotName = spot.name || spot.text || "名称不明";
    const isDuplicate = planSpots.some(s => s.name === spotName);
    if (isDuplicate) { if (!confirm(`「${spotName}」は既にリストに追加されています。\n重複して追加しますか？`)) { return; } }

    let coords = spot.coordinates;
    if (!coords && spot.center) coords = spot.center;
    
    let commentToSave = editCommentValue;
    let descToSave = (selectedResult?.id === spot.id && selectedResult.place_name) ? selectedResult.place_name : (spot.description || spot.place_name || "");

    if (!commentToSave && spot.summary) {
        commentToSave = spot.summary;
        if (spot.description === spot.summary) { descToSave = spot.place_formatted || spot.formatted_address || "住所情報なし"; }
    }

    const status = spot.status || 'candidate';
    let imageToSave = spot.image_url;
    if (!imageToSave && selectedResult && selectedResult.text === spotName && selectedResult.image_url) { imageToSave = selectedResult.image_url; }
    if (!imageToSave) { const existingSpot = planSpots.find(s => s.name === spotName && s.image_url); if (existingSpot) { imageToSave = existingSpot.image_url; } }
    if (!imageToSave) { imageToSave = await fetchSpotImage(spotName); }
    if (imageToSave && imageToSave.startsWith('data:')) { imageToSave = null; }

    const newSpotPayload = { 
        room_id: roomId, 
        name: spotName, 
        description: descToSave, 
        coordinates: coords, 
        order: planSpots.length, 
        added_by: userName || 'Guest', 
        votes: 0,
        status: status,
        price: spot.price || null,
        rating: spot.rating || null,
        image_url: imageToSave || null, 
        url: spot.url || null,
        plan_id: spot.plan_id || null,
        is_hotel: spot.is_hotel || false,
        day: 0, 
        comment: commentToSave,
        link: editLinkValue
    };

    // Optimistic update
    // setPlanSpots(prev => [...prev, { ...newSpotPayload, id: `temp-${Date.now()}` }]); // リアルタイムリスナーがあるので楽観的更新は不要、あるいはリスナーで重複除外する

    const { data, error } = await supabase.from('spots').insert([newSpotPayload]).select().single();
    if (error) { console.error("Add spot error:", error); alert("スポットの追加に失敗しました"); return; }
    if (data) { 
        // リアルタイムリスナーが追加してくれるのでここでは何もしなくても良いが、即時反映のため残してもOK
        // ただし重複に注意
        // setPlanSpots(prev => [...prev, data]); 
        
        if (userName) {
            const { data: voteData } = await supabase.from('votes').insert({ room_id: roomId, spot_id: data.id, user_name: userName, vote_type: 'like' }).select().single();
            if (voteData) { setSpotVotes(prev => [...prev, voteData]); }
        }
        resetSearchState(); 
        setQuery(""); 
        setSessionToken(Math.random().toString(36)); 
        setEditCommentValue("");
        setEditLinkValue("");
        setIsEditingMemo(false);
        const displayStatus = status === 'confirmed' ? '確定' : '候補';
        setNotification({ text: `「${spotName}」を${displayStatus}に追加しました (日程未定)`, color: status === 'confirmed' ? 'bg-blue-600' : 'bg-black' });
        setTimeout(() => setNotification(null), 3000);
    }
  };

  const removeSpot = async (spot: any) => {
    if (!roomId) return;
    if (!spot.id) return; 
    if (!confirm(`本当に「${spot.name || spot.text}」をリストから削除しますか？`)) return;
    
    // Optimistic delete
    setPlanSpots(prev => prev.filter(s => s.id !== spot.id));
    
    await supabase.from('spots').delete().eq('id', spot.id);
    if (selectedResult?.id === spot.id) setSelectedResult(null); 
  };

  const updateSpots = (newSpots: any[]) => { setPlanSpots(newSpots); };

  const resetSearchState = () => {
    setSearchResults([]); setSelectedResult(null); setViewMode('default'); searchMarkersRef.current.forEach(marker => marker.remove()); searchMarkersRef.current = []; setIsEditingDesc(false); setIsFocused(false);
  };

  // ... (handlePreviewSpot, handleAutoSearch, handleSearchFromChat, handleReceiveCandidates, handleSaveMemo, handleSaveDescription, getIconForSuggestion, Drawing関連 logic 省略: 変更なし) ...
  const handlePreviewSpot = (spot: any, openMemo: boolean = false) => {
    setCurrentTab('explore');
    const isSaved = planSpots.some(s => s.name === spot.name);
    const spotId = spot.id; 
    const voters = spotVotes.filter(v => String(v.spot_id) === String(spotId) && v.vote_type === 'like').map(v => v.user_name);
    const uniqueVoters = Array.from(new Set(voters));
    
    if (!spot.image_url && !attemptedImageFetch.current.has(spot.id)) {
        fetchSpotImage(spot.name).then(url => {
            if (url) {
                setPlanSpots(prev => prev.map(s => s.id === spot.id ? { ...s, image_url: url } : s));
                if(roomId && spot.id) supabase.from('spots').update({ image_url: url }).eq('id', spot.id).then();
            }
        });
    }

    const dbSpot = planSpots.find(s => s.name === spot.name);
    const previewId = dbSpot ? dbSpot.id : spot.id;

    if (dbSpot) {
        setEditCommentValue(dbSpot.comment || "");
        setEditLinkValue(dbSpot.link || "");
    } else {
        setEditCommentValue("");
        setEditLinkValue("");
    }
    
    setIsEditingMemo(openMemo);

    const previewData = { 
        ...spot, 
        id: previewId, 
        text: spot.name, 
        place_name: spot.description, 
        is_saved: isSaved, 
        voters: uniqueVoters, 
        added_by: spot.added_by, 
        image_url: spot.image_url, 
        comment: spot.comment, 
        link: spot.link, 
        day: dbSpot ? (dbSpot.day || 0) : 0, 
        status: dbSpot ? dbSpot.status : 'candidate' 
    };
    setSelectedResult(previewData);
    setViewMode('selected');
    setIsEditingDesc(false);
    
    if (map.current && spot.coordinates) {
        searchMarkersRef.current.forEach(marker => marker.remove());
        searchMarkersRef.current = [];
        const el = document.createElement('div'); 
        el.innerHTML = `<div style="width:24px; height:24px; background:#EF4444; border:3px solid white; border-radius:50%; box-shadow:0 4px 10px rgba(239,68,68,0.4);"></div>`;
        const marker = new mapboxgl.Marker({ element: el }).setLngLat(spot.coordinates).addTo(map.current);
        searchMarkersRef.current.push(marker);
        setTimeout(() => { if (map.current) { map.current?.resize(); map.current?.flyTo({ center: spot.coordinates, zoom: 16, offset: [0, -150] }); } }, 300);
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
      // Optimistic
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
    let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;
    coords.forEach(c => { const [lng, lat] = c; if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng; if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat; });
    const centerLat = (minLat + maxLat) / 2; const centerLng = (minLng + maxLng) / 2;
    let radiusKm = (calculateDistance(centerLat, centerLng, maxLat, maxLng) / 2) * 1.1;
    if (radiusKm < 0.1) radiusKm = 0.5; 
    if (radiusKm > 5.0) radiusKm = 5.0; 
    setInitialSearchArea({ latitude: centerLat, longitude: centerLng, radius: Number(radiusKm.toFixed(2)) });
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
  }, [isAuthLoading, isJoined]);

  // ... (Map marker rendering useEffect 省略: 変更なし) ...
  useEffect(() => {
    if (!map.current) return;
    const markers = document.getElementsByClassName('marker-plan');
    while(markers.length > 0) markers[0].parentNode?.removeChild(markers[0]);
    
    filteredSpots.forEach((spot, index) => { 
        const voters = spotVotes.filter(v => v.spot_id === spot.id && v.vote_type === 'like').map(v => v.user_name);
        const participants = [spot.added_by, ...voters];
        const uniqueParticipants = Array.from(new Set(participants));
        const size = 24; 
        const segmentSize = 100 / uniqueParticipants.length;
        const gradientParts = uniqueParticipants.map((name, i) => { const color = getUserColor(name as string); return `${color} ${i * segmentSize}% ${(i + 1) * segmentSize}%`; });
        const gradientString = `conic-gradient(${gradientParts.join(', ')})`;
        const el = document.createElement('div'); 
        el.className = 'marker-plan'; 
        el.style.cursor = 'pointer';
        const isSpotHotel = isHotel(spot.name) || spot.is_hotel;
        const voteCount = uniqueParticipants.length;
        const baseColor = isSpotHotel ? '#FEF9C3' : '#FFFFFF'; 
        const textColor = isSpotHotel ? '#CA8A04' : '#1E3A8A'; 
        const isConfirmed = spot.status === 'confirmed';
        const confirmedColor = '#2563EB';
        const isDayView = filterStatus === 'confirmed' && selectedConfirmDay > 0;

        let hotelInfoHtml = '';
        if (isSpotHotel && spot.price) {
            hotelInfoHtml = `
                <div style="position:absolute; bottom:100%; left:50%; transform:translateX(-50%) translateY(-8px); background:white; padding:2px 6px; border-radius:6px; font-size:10px; font-weight:bold; color:#d32f2f; white-space:nowrap; box-shadow:0 2px 4px rgba(0,0,0,0.2); display:flex; flex-direction:column; align-items:center;">
                    <span>¥${spot.price.toLocaleString()}</span>
                    ${spot.rating ? `<span style="font-size:8px; color:#f57c00;">★${spot.rating}</span>` : ''}
                    <div style="position:absolute; top:100%; left:50%; transform:translateX(-50%); width:0; height:0; border-left:4px solid transparent; border-right:4px solid transparent; border-top:4px solid white;"></div>
                </div>
            `;
        }

        if (isConfirmed) {
            if (isDayView) {
                el.innerHTML = `<div style="position:relative; display:flex; flex-direction:column; align-items:center; transform:translateY(-50%);">${hotelInfoHtml}<div style="width:${size + 6}px; height:${size + 6}px; background:${confirmedColor}; border-radius:6px; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 10px rgba(0,0,0,0.5);"><div style="width:${size}px; height:${size}px; background:${confirmedColor}; border-radius:5px; display:flex; align-items:center; justify-content:center; color:white; font-weight:800; font-size:14px; border:1px solid rgba(255,255,255,0.3);">${index + 1}</div></div><div style="width:0; height:0; border-left:5px solid transparent; border-right:5px solid transparent; border-top:7px solid ${confirmedColor}; margin-top:-1px; filter:drop-shadow(0 1px 1px rgba(0,0,0,0.1));"></div></div>`;
            } else {
                el.innerHTML = `<div style="position:relative; display:flex; flex-direction:column; align-items:center; transform:translateY(-50%);">${hotelInfoHtml}<div style="width:${size + 6}px; height:${size + 6}px; background:${confirmedColor}; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 10px rgba(0,0,0,0.5);"><div style=\"width:${size}px; height:${size}px; background:${confirmedColor}; border-radius:50%; display:flex; align-items:center; justify-content:center; color:white; font-weight:800; font-size:12px; border:1px solid rgba(255,255,255,0.3);\">${isSpotHotel ? '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg>' : (spot.day || '')}</div></div><div style="width:0; height:0; border-left:5px solid transparent; border-right:5px solid transparent; border-top:7px solid ${confirmedColor}; margin-top:-1px; filter:drop-shadow(0 1px 1px rgba(0,0,0,0.1));"></div></div>`;
            }
        } else {
            el.innerHTML = `<div style="position:relative; display:flex; flex-direction:column; align-items:center; transform:translateY(-50%);">${hotelInfoHtml}<div style="width:${size + 6}px; height:${size + 6}px; background:${gradientString}; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 5px rgba(0,0,0,0.3);"><div style="width:${size}px; height:${size}px; background:${baseColor}; border-radius:50%; display:flex; align-items:center; justify-content:center; color:${textColor}; font-weight:800; font-size:12px; border:1px solid rgba(0,0,0,0.1);">${isSpotHotel ? '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg>' : (voteCount > 0 ? voteCount : '')}</div></div><div style="width:0; height:0; border-left:5px solid transparent; border-right:5px solid transparent; border-top:7px solid ${baseColor}; margin-top:-1px; filter:drop-shadow(0 1px 1px rgba(0,0,0,0.1));"></div></div>`;
        }
        el.onclick = (e) => { e.stopPropagation(); handlePreviewSpot(spot); };
        new mapboxgl.Marker({ element: el, anchor: 'bottom' }).setLngLat(spot.coordinates).addTo(map.current!);
      });
  }, [JSON.stringify(filteredSpots), JSON.stringify(spotVotes)]); 

  if (isAuthLoading || (!roomId && !isJoined) || (roomId && !isJoined)) {
    return <WelcomePage inviteRoomId={roomId} />;
  }

  // ... (return JSX 省略: 変更なし) ...
  return (
    <main className="relative w-screen h-[100dvh] bg-slate-100 overflow-hidden flex flex-col font-sans">
      <LegalModal />
      <Ticker />
      
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
              <div className={`px-6 py-3 rounded-full shadow-2xl ${notification.color} text-white font-bold text-sm flex items-center gap-2 backdrop-blur-md`}>
                  <CheckCircle size={16} className="text-white"/>
                  {notification.text}
              </div>
          </div>
      )}

      {/* Activity Log, Date Modal, AssignDay Modal, etc. (omitted for brevity as logic didn't change) */}
      
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
                                      <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 shrink-0"></div>
                                      <div className="w-0.5 flex-1 bg-gray-200 my-1"></div>
                                  </div>
                                  <div className="bg-gray-50 p-3 rounded-xl flex-1 border border-gray-100">
                                      <p className="text-[10px] text-gray-400 mb-1 font-mono">
                                          {new Date(spot.created_at).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                      </p>
                                      <div className="flex items-center gap-1.5 mb-1.5">
                                          <div className="w-4 h-4 rounded-full shadow-sm shrink-0" style={{ backgroundColor: getUDColor(spot.added_by) }}></div>
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
                      <div><label className="text-xs font-bold text-gray-600 ml-1 mb-1 block uppercase tracking-wider">Start Date</label><input type="date" value={startDate} onChange={(e)=>setStartDate(e.target.value)} className="w-full bg-gray-50 p-4 rounded-2xl font-bold text-gray-800 border border-gray-100 focus:ring-2 focus:ring-blue-100 outline-none"/></div>
                      <div><label className="text-xs font-bold text-gray-600 ml-1 mb-1 block uppercase tracking-wider">End Date</label><input type="date" value={endDate} onChange={(e)=>setEndDate(e.target.value)} className="w-full bg-gray-50 p-4 rounded-2xl font-bold text-gray-800 border border-gray-100 focus:ring-2 focus:ring-blue-100 outline-none"/></div>
                      <div>
                          <label className="text-xs font-bold text-gray-400 ml-1 mb-1 block uppercase tracking-wider flex items-center gap-1"><UsersIcon size={12}/> Travelers</label>
                          <input type="number" min="1" max="10" value={adultNum} onChange={(e)=>setAdultNum(parseInt(e.target.value) || 1)} className="w-full bg-gray-50 p-4 rounded-2xl font-bold text-gray-800 border border-gray-100 focus:ring-2 focus:ring-blue-100 outline-none"/>
                      </div>
                  </div>
                  <button onClick={() => setShowDateModal(false)} className="w-full bg-black text-white py-4 rounded-2xl font-bold mt-6 hover:scale-[1.02] active:scale-95 transition shadow-xl">保存して閉じる</button>
              </div>
          </div>
      )}

      {spotToAssignDay && (
          <div className="absolute inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-200">
              <div className="bg-white w-full max-w-sm rounded-[2rem] p-8 shadow-2xl space-y-6">
                  <div className="text-center">
                      <h3 className="text-xl font-black text-gray-900 mb-1">いつ行きますか？</h3>
                      <p className="text-sm text-gray-500 font-medium">{spotToAssignDay.name}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 max-h-60 overflow-y-auto p-1">
                      <button onClick={() => confirmSpotDay(0)} className="col-span-2 py-4 bg-gray-100 rounded-2xl font-bold text-gray-500 hover:bg-gray-200 transition">未定 (とりあえずリストへ)</button>
                      {Array.from({ length: travelDays }).map((_, i) => (
                          <button key={i} onClick={() => confirmSpotDay(i + 1)} className="py-4 bg-blue-50 text-blue-600 border border-blue-100 rounded-2xl font-bold hover:bg-blue-100 transition">
                              {i + 1}日目
                          </button>
                      ))}
                  </div>
                  <button onClick={() => setSpotToAssignDay(null)} className="w-full py-3 text-gray-600 font-bold hover:text-gray-600">キャンセル</button>
              </div>
          </div>
      )}

      <div className="flex-1 relative overflow-hidden flex flex-col md:flex-row">
        <div className={`relative h-full w-full md:flex-1 ${currentTab === 'explore' ? 'block' : 'hidden md:block'}`}>
          <div ref={mapContainer} className="absolute top-0 left-0 w-full h-full z-0" style={{ touchAction: isDrawing ? 'none' : 'auto' }} />

          {/* ... (Map controls 省略: 変更なし) ... */}
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
              {/* ★修正1: pr-12 を追加して、右側にAIボタン1個分強の余白を作り、ボタン全体を左に寄せます */}
              <div className="bg-white/90 backdrop-blur-xl p-2 pr-3 rounded-[2rem] shadow-2xl flex items-center gap-2 border border-white/50 w-full max-w-md pointer-events-auto transition-all duration-300 focus-within:ring-4 focus-within:ring-blue-100/50">
                <button onClick={() => setShowActivityLog(true)} className="p-3 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-500 transition shrink-0"><History size={18}/></button>
                <button onClick={() => setShowDateModal(true)} className="p-3 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-500 transition shrink-0"><Calendar size={18}/></button>
                <div className="h-6 w-px bg-gray-200 shrink-0"></div>
                
                {/* ★修正2: min-w-0 を追加して、画面が狭い時に正しく縮むようにします */}
                <input 
                    type="text" 
                    value={query} 
                    onFocus={() => setIsFocused(true)} 
                    onBlur={() => setTimeout(() => setIsFocused(false), 200)} 
                    onChange={(e) => { setQuery(e.target.value); }} 
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()} 
                    placeholder="場所やキーワードを検索..." 
                    className="flex-1 bg-transparent outline-none text-gray-800 placeholder-gray-400 text-sm font-bold min-w-0" 
                />
                
                {query && <button onClick={resetSearchState} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 transition shrink-0"><X size={16}/></button>}
                
                <button 
                    onClick={() => setCurrentTab('swipe')} 
                    className="bg-gradient-to-tr from-indigo-500 to-purple-600 text-white w-10 h-10 rounded-full font-black text-xs shadow-md hover:scale-110 transition active:scale-95 flex items-center justify-center shrink-0"
                    title="AI提案ページへ"
                >
                    AI
                </button>

                {/* ★修正3: shrink-0 を追加して、ボタンが潰れないようにします */}
                <button onClick={() => handleSearch()} className="bg-black text-white p-3 rounded-full hover:bg-gray-800 shadow-md transition active:scale-95 shrink-0"><Search size={18} /></button>
              </div>
              
              {/* ... (Search results dropdown 省略: 変更なし) ... */}
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

              {/* ... (Filter buttons 省略: 変更なし) ... */}
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

                {/* Detail modal content (omitted for brevity) - No logic changes needed here, as selectedResult is local state */}
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
                              className="flex items-center gap-1 bg-black text-white px-3 py-2 rounded-lg text-[10px] font-bold hover:bg-gray-800 transition whitespace-nowrap shrink-0 shadow-sm"
                          >
                              <CheckCircle size={12}/> 確定にする
                          </button>
                      )}
                      
                      {selectedResult.is_saved && selectedResult.status === 'confirmed' && (
                          <button 
                              onClick={(e) => { e.stopPropagation(); handleStatusChangeClick(selectedResult, 'candidate'); }} 
                              className="flex items-center gap-1 bg-gray-100 text-gray-600 px-3 py-2 rounded-lg text-[10px] font-bold hover:bg-gray-200 transition whitespace-nowrap shrink-0 border border-gray-200"
                          >
                              <ArrowLeftCircle size={12}/> 候補に戻す
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
                          {(filterStatus === 'confirmed' || filterStatus === 'candidate') ? (
                              <>
                                  <button 
                                      onClick={(e) => { 
                                          e.stopPropagation(); 
                                          if (filterStatus === 'confirmed') setSelectedConfirmDay(0);
                                          else setSelectedCandidateDay(0);
                                      }}
                                      className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition border flex-shrink-0 flex items-center gap-1 relative ${
                                          (filterStatus === 'confirmed' ? selectedConfirmDay : selectedCandidateDay) === 0 
                                          ? (filterStatus === 'confirmed' ? 'bg-blue-600 text-white border-blue-600' : 'bg-yellow-500 text-white border-yellow-500')
                                          : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-100'
                                      }`}
                                  >
                                      未定 <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${(filterStatus === 'confirmed' ? selectedConfirmDay : selectedCandidateDay) === 0 ? 'bg-white/20' : 'bg-gray-100'}`}>
                                          {planSpots.filter(s => s.status === filterStatus && (!s.day || s.day === 0)).length}
                                      </span>
                                      {/* バッジ表示 */}
                                      {((filterStatus === 'confirmed' ? selectedConfirmDay : selectedCandidateDay) !== 0) && 
                                       (filterStatus === 'confirmed' ? unreadCounts.confirmedDays[0] > 0 : unreadCounts.candidateDays[0] > 0) && (
                                          <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white animate-pulse"></span>
                                      )}
                                  </button>
                                  {Array.from({ length: travelDays }).map((_, i) => {
                                      const dayNum = i + 1;
                                      const isActive = (filterStatus === 'confirmed' ? selectedConfirmDay : selectedCandidateDay) === dayNum;
                                      const activeClass = filterStatus === 'confirmed' 
                                          ? 'bg-blue-600 text-white border-blue-600'
                                          : 'bg-yellow-500 text-white border-yellow-500';

                                      return (
                                          <button 
                                            key={dayNum}
                                            onClick={(e) => { 
                                                e.stopPropagation(); 
                                                if (filterStatus === 'confirmed') setSelectedConfirmDay(dayNum);
                                                else setSelectedCandidateDay(dayNum);
                                            }}
                                            className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition border flex-shrink-0 flex items-center gap-1 relative ${isActive ? activeClass : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-100'}`}
                                          >
                                            Day {dayNum} <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white/20' : 'bg-gray-100'}`}>
                                                {planSpots.filter(s => s.status === filterStatus && s.day === dayNum).length}
                                            </span>
                                            {/* バッジ表示 */}
                                            {!isActive && 
                                             (filterStatus === 'confirmed' ? unreadCounts.confirmedDays[dayNum] > 0 : unreadCounts.candidateDays[dayNum] > 0) && (
                                                <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white animate-pulse"></span>
                                            )}
                                          </button>
                                      );
                                  })}
                              </>
                          ) : (
                              <div className="flex items-center gap-2 text-gray-800 px-2" onClick={() => setSheetHeight(sheetHeight > 300 ? 140 : window.innerHeight * 0.65)}>
                                  {filterStatus === 'hotel_candidate' && <BedDouble size={16} className="text-orange-500"/>}
                                  <span className="font-bold text-sm">
                                      宿泊候補 
                                      <span className="ml-2 text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{filteredSpots.length}</span>
                                  </span>
                              </div>
                          )}
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

                  {/* List content (same logic, visual only) */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-32 bg-gray-50/50">
                      {/* ... (Rakuten Banner, empty state, and list rendering logic omitted as it's identical) ... */}
                      {filterStatus === 'hotel_candidate' && (
                          <div 
                              onClick={() => window.open(rakutenHomeUrl, '_blank')}
                              className="block w-full mb-1 group cursor-pointer"
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
                          </div>
                      )}
                      
                      {filteredSpots.length === 0 ? (
                          <div className="text-center text-gray-400 py-12 text-sm font-bold opacity-50">
                              スポットがありません<br/>マップから追加してください
                          </div>
                      ) : (
                          (() => {
                              let targetDay = -1; 
                              if (filterStatus === 'confirmed') targetDay = selectedConfirmDay;
                              else if (filterStatus === 'candidate') targetDay = selectedCandidateDay;

                              let displaySpots = filteredSpots;
                              if (targetDay !== -1) {
                                  displaySpots = filteredSpots.filter(s => (s.day || 0) === targetDay);
                              }

                              if (targetDay !== -1 && displaySpots.length === 0) {
                                  return <div className="text-center text-gray-400 py-10 text-xs font-medium">この日のスポットはまだありません</div>;
                              }

                              if (filterStatus === 'confirmed' && targetDay > 0) {
                                  if (displayTimeline.length === 0) return <div className="text-center text-gray-400 py-10 text-xs font-medium">ロード中...</div>;
                                  return (
                                      <div className="animate-in slide-in-from-bottom-4 fade-in duration-300 relative pl-4 pb-10">
                                          <div className="absolute left-[19px] top-4 bottom-4 w-[2px] bg-gray-200 z-0"></div>

                                          {displayTimeline.map((item, idx) => {
                                              if (item.type === 'spot') {
                                                  const spot = item.spot;
                                                  const voteCount = spotVotes.filter((v: any) => String(v.spot_id) === String(spot.id) && v.vote_type === 'like').length;
                                                  const isSpotHotel = isHotel(spot.name) || spot.is_hotel;
                                                  const isNew = isNewSpot(spot);
                                                  const visitOrder = displayTimeline.slice(0, idx + 1).filter(t => t.type === 'spot').length;

                                                  return (
                                                      <div key={`spot-${idx}`} className="relative z-10 mb-4 pl-8 group">
                                                          <div className="absolute left-[-16px] top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white border-2 border-indigo-600 flex items-center justify-center font-bold text-indigo-600 text-[10px] shadow-sm z-20">
                                                              {item.arrival?.split(':')[0]}:{item.arrival?.split(':')[1]}
                                                          </div>

                                                          <div 
                                                              className={`rounded-xl shadow-sm border overflow-hidden flex h-16 transition active:scale-[0.98] cursor-pointer hover:border-indigo-300 ${
                                                                  isNew ? 'bg-yellow-50 border-yellow-300 ring-1 ring-yellow-200' : 'bg-white border-gray-100'
                                                              }`} 
                                                              onClick={() => handlePreviewSpot(spot)}
                                                          >
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
                                                                  
                                                                  <div className="flex justify-between items-end gap-2">
                                                                      <div className="flex items-center gap-2 overflow-hidden">
                                                                          <div className="text-[10px] text-gray-400 truncate flex items-center gap-1 shrink-0">
                                                                              <Clock size={10}/> {item.stay_min}分
                                                                          </div>
                                                                          
                                                                          {spot.cost && (
                                                                              <div className="flex items-center gap-1 text-[10px] font-bold text-yellow-700 bg-yellow-50 px-1.5 py-0.5 rounded border border-yellow-100 shrink-0">
                                                                                  <Banknote size={10}/> ¥{Number(spot.cost).toLocaleString()}
                                                                              </div>
                                                                          )}
                                                                      </div>

                                                                      {spot.comment && !isSpotHotel ? (
                                                                          <span className="text-[10px] text-gray-600 font-medium truncate flex-1 flex items-center gap-1 min-w-0">
                                                                              <MessageSquare size={10} className="shrink-0 text-gray-400"/> {spot.comment}
                                                                          </span>
                                                                      ) : (
                                                                          <span className="text-[10px] text-gray-300 truncate flex-1 min-w-0">{spot.description}</span>
                                                                      )}

                                                                      <div className="flex gap-2 items-center shrink-0">
                                                                           {spot.url && !isSpotHotel && (
                                                                               <a 
                                                                                   href={spot.url} 
                                                                                   target="_blank" 
                                                                                   rel="noopener noreferrer"
                                                                                   onClick={(e) => e.stopPropagation()}
                                                                                   className="flex items-center gap-1 bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5 rounded text-[9px] font-bold hover:bg-blue-100 transition shrink-0"
                                                                               >
                                                                                   <LinkIcon size={8}/> Link
                                                                               </a>
                                                                           )}

                                                                           {isSpotHotel && (
                                                                               <button 
                                                                                   onClick={(e) => { 
                                                                                       e.stopPropagation(); 
                                                                                       window.open(getAffiliateUrl(spot), '_blank'); 
                                                                                   }}
                                                                                   className="flex items-center gap-1 bg-[#BF0000] text-white px-2 py-0.5 rounded text-[9px] font-bold hover:bg-[#900000] transition shrink-0 shadow-sm"
                                                                               >
                                                                                   <span className="opacity-75 text-[8px] border border-white/50 px-0.5 rounded-[2px]">PR</span>
                                                                                   楽天 <ExternalLink size={8}/>
                                                                               </button>
                                                                           )}
                                                                           <button onClick={(e) => { e.stopPropagation(); removeSpot(spot); }} className="text-gray-300 hover:text-red-500 transition"><Trash2 size={12}/></button>
                                                                      </div>
                                                                  </div>
                                                              </div>
                                                          </div>
                                                      </div>
                                                  );
                                              } else if (item.type === 'travel') {
                                                  const mode = TRANSPORT_MODES.find(m => m.id === (item.transport_mode || 'car')) || TRANSPORT_MODES[0];
                                                  return (
                                                      <div key={`travel-${idx}`} className="relative pl-8 pb-4">
                                                          <div className="absolute left-[-1px] top-0 bottom-0 w-0.5 bg-gray-200"></div>
                                                          <div className="ml-4 flex flex-col gap-1">
                                                              <div className="flex items-center gap-2 text-xs text-gray-400 font-bold bg-gray-50 px-2 py-1 rounded w-max border border-gray-100">
                                                                  {mode.icon}
                                                                  <span>{item.duration_min}分 移動</span>
                                                              </div>
                                                              {(item.transport_departure || item.transport_arrival || item.cost || item.note || item.url) && (
                                                                  <div className="flex flex-wrap gap-2 ml-1">
                                                                      {(item.transport_departure || item.transport_arrival) && (
                                                                          <div className="text-[10px] font-bold text-gray-600 flex items-center gap-1 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded">
                                                                              {item.transport_departure && <span>{item.transport_departure}発</span>}
                                                                              <ArrowRight size={8} className="text-indigo-300"/>
                                                                              {item.transport_arrival && <span>{item.transport_arrival}着</span>}
                                                                          </div>
                                                                      )}
                                                                      {item.cost && (
                                                                          <div className="text-[10px] font-bold text-yellow-700 flex items-center gap-1 bg-yellow-50 border border-yellow-100 px-1.5 py-0.5 rounded">
                                                                              <Banknote size={8}/> ¥{Number(item.cost).toLocaleString()}
                                                                          </div>
                                                                      )}
                                                                      {item.note && (
                                                                          <div className="text-[10px] text-gray-500 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded flex items-center gap-1 max-w-[150px] truncate">
                                                                              <StickyNote size={8}/> {item.note}
                                                                          </div>
                                                                      )}
                                                                      {item.url && (
                                                                          <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-500 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded flex items-center gap-1 hover:bg-blue-100">
                                                                              <LinkIcon size={8}/> Link
                                                                          </a>
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
                              
                              return (
                                <div className="space-y-3">
                                    {displaySpots.map((spot, idx) => {
                                        const voteCount = spotVotes.filter((v: any) => String(v.spot_id) === String(spot.id) && v.vote_type === 'like').length;
                                        const isSpotHotel = isHotel(spot.name) || spot.is_hotel;
                                        const isNew = isNewSpot(spot);
                                        
                                        return (
                                            <div 
                                                key={spot.id || idx} 
                                                className={`rounded-xl shadow-sm border overflow-hidden flex h-16 transition active:scale-[0.98] animate-in slide-in-from-bottom-2 fade-in ${
                                                    isNew ? 'bg-yellow-50 border-yellow-300 ring-1 ring-yellow-200' : 'bg-white border-gray-100'
                                                }`}
                                                onClick={() => handlePreviewSpot(spot)}
                                            >   
                                                <div className="w-16 bg-gray-100 shrink-0 relative">
                                                    <SpotImage src={spot.image_url} alt="" className="w-full h-full"/>
                                                </div>
                                                <div className="flex-1 p-2 flex flex-col justify-between overflow-hidden">
                                                    <div className="flex justify-between items-start">
                                                        <h3 className="font-bold text-gray-800 text-xs truncate flex-1">{spot.name}</h3>
                                                        <div className="flex gap-1 shrink-0 ml-1">
                                                            {voteCount > 0 && <span className="flex items-center gap-0.5 text-[9px] font-bold text-blue-500 bg-blue-50 px-1 py-0.5 rounded"><ThumbsUp size={8}/> {voteCount}</span>}
                                                            {(filterStatus === 'candidate' || filterStatus === 'hotel_candidate') && (
                                                                <button onClick={(e) => { e.stopPropagation(); handleStatusChangeClick(spot, 'confirmed'); }} className="bg-black text-white text-[9px] px-2 py-0.5 rounded font-bold hover:bg-gray-800 transition">確定にする</button>
                                                            )}
                                                            {filterStatus === 'confirmed' && (
                                                                <button 
                                                                    onClick={(e) => { e.stopPropagation(); handleStatusChangeClick(spot, 'candidate'); }} 
                                                                    className="bg-gray-100 border border-gray-200 text-gray-600 text-[9px] px-2 py-0.5 rounded font-bold hover:bg-gray-200 transition whitespace-nowrap"
                                                                >
                                                                    候補に戻す
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
                                                        {isSpotHotel && (
                                                            <button 
                                                                onClick={(e) => { 
                                                                    e.stopPropagation(); 
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