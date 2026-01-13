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
  PenTool, Loader2, Clock, ThumbsUp
} from 'lucide-react';
import BottomNav from './components/BottomNav';
import HotelListView from './components/HotelListView';
import PlanView from './components/PlanView';
import MenuView from './components/MenuView';
import Ticker from './components/Ticker';
import SwipeView from './components/SwipeView';
import LegalModal from './components/LegalModal';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// --- 画像表示用コンポーネント (ローディング表示付き) ---
const SpotImage = ({ src, alt, className }: { src?: string | null, alt: string, className?: string }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        if (src && (src.startsWith('http') || src.startsWith('data:'))) {
            setIsLoading(true);
            setHasError(false);
        } else {
            setIsLoading(false);
            setHasError(true);
        }
    }, [src]);

    const handleLoad = () => setIsLoading(false);
    const handleError = () => {
        setIsLoading(false);
        setHasError(true);
    };

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
                    <Loader2 size={20} className="animate-spin mb-1"/>
                </div>
            )}
            <img 
                src={src} 
                alt={alt} 
                onLoad={handleLoad}
                onError={handleError}
                className={`w-full h-full object-cover transition-opacity duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
            />
        </div>
    );
};

// --- 型定義 ---
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
  const [isSuggesting, setIsSuggesting] = useState(false);

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
  const [isListExpanded, setIsListExpanded] = useState(false);

  // お絵描き関連
  const [isDrawing, setIsDrawing] = useState(false);
  const tempDrawCoords = useRef<number[][]>([]);
  const [initialSearchArea, setInitialSearchArea] = useState<AreaSearchParams | null>(null);

  // 日程・人数設定
  const [showDateModal, setShowDateModal] = useState(false);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [adultNum, setAdultNum] = useState<number>(2); 
  const [spotToAssignDay, setSpotToAssignDay] = useState<any>(null); 
  const [travelDays, setTravelDays] = useState<number>(1);
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);

  // 確定リストの選択中のDay
  const [selectedConfirmDay, setSelectedConfirmDay] = useState<number>(1);
  
  // タイムライン（履歴）モーダル用
  const [showActivityLog, setShowActivityLog] = useState(false);

  // 画像取得済みフラグ管理
  const attemptedImageFetch = useRef<Set<string>>(new Set());

  const planSpotsRef = useRef(planSpots);
  useEffect(() => { planSpotsRef.current = planSpots; }, [planSpots]);

  useEffect(() => {
    setIsDrawing(false);
    setInitialSearchArea(null);
    tempDrawCoords.current = [];
  }, []);

  useEffect(() => {
    if (isDrawing) { stopDrawing(); }
    if (currentTab !== 'agent') { setInitialSearchArea(null); }
  }, [currentTab]);

  // ★追加: ページロード時にRenderを起こす (Wake-up Ping)
  useEffect(() => {
      fetch(`${API_BASE_URL}/`, { method: 'GET' })
          .then(() => console.log("🔌 Backend Woken Up"))
          .catch(() => console.log("💤 Backend might be sleeping or unreachable"));
  }, []);

  // 設定の読み込み処理
  useEffect(() => {
    if (roomId) {
        const savedSettings = localStorage.getItem(`rh_settings_${roomId}`);
        if (savedSettings) {
            try {
                const parsed = JSON.parse(savedSettings);
                if(parsed.start) setStartDate(parsed.start);
                if(parsed.end) setEndDate(parsed.end);
                if(parsed.adultNum) setAdultNum(parsed.adultNum);
            } catch(e) {
                console.error("Settings load error", e);
            }
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
    } else {
        setIsSettingsLoaded(true);
    }
  }, [roomId]);

  // 設定の保存処理 & 日数計算
  useEffect(() => {
      if (startDate && endDate) {
          const start = new Date(startDate);
          const end = new Date(endDate);
          const diffTime = Math.abs(end.getTime() - start.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
          setTravelDays(diffDays > 0 ? diffDays : 1);
      } else {
          setTravelDays(1);
      }
      
      if (roomId && isSettingsLoaded) {
          localStorage.setItem(`rh_settings_${roomId}`, JSON.stringify({ start: startDate, end: endDate, adultNum }));
      }
  }, [startDate, endDate, adultNum, roomId, isSettingsLoaded]);

  // --- 画像自動補完ロジック ---
  const fetchSpotImage = async (name: string) => {
      try {
          const res = await fetch(`${API_BASE_URL}/api/get_spot_image?query=${encodeURIComponent(name)}`);
          if (res.ok) {
              const data = await res.json();
              return data.image_url;
          }
      } catch (e) {
          console.error("Image fetch failed", e);
      }
      return null;
  };

  useEffect(() => {
    if (planSpots.length > 0) {
        planSpots.forEach(async (spot) => {
            if (!spot.image_url && !attemptedImageFetch.current.has(spot.id)) {
                attemptedImageFetch.current.add(spot.id);
                
                const url = await fetchSpotImage(spot.name);
                if (url) {
                    setPlanSpots(prev => prev.map(s => s.id === spot.id ? { ...s, image_url: url } : s));
                    if (roomId) {
                        supabase.from('spots').update({ image_url: url }).eq('id', spot.id).then();
                    }
                }
            }
        });
    }
  }, [planSpots, roomId]);

  const getAffiliateUrl = (spot: any) => {
      if (spot.id && /^\d+$/.test(spot.id)) {
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

          const targetUrl = `https://hotel.travel.rakuten.co.jp/hotelinfo/plan/${spot.id}?f_teikei=&f_heya_su=1&f_otona_su=${adultNum}&f_nen1=${y1}&f_tuki1=${m1}&f_hi1=${d1}&f_nen2=${y2}&f_tuki2=${m2}&f_hi2=${d2}&f_sort=min_charge`;

          if (RAKUTEN_AFFILIATE_ID) {
              return `https://hb.afl.rakuten.co.jp/hgc/${RAKUTEN_AFFILIATE_ID}/?pc=${encodeURIComponent(targetUrl)}&m=${encodeURIComponent(targetUrl)}`;
          }
          return targetUrl;
      }
      return spot.url || `https://search.travel.rakuten.co.jp/ds/hotel/search?f_teikei=&f_query=${encodeURIComponent(spot.name)}`;
  };

  const allParticipants = useMemo(() => {
      const users = new Set<string>();
      if (userName) users.add(userName);
      planSpots.forEach(s => { if (s.added_by) users.add(s.added_by); });
      spotVotes.forEach(v => { if (v.user_name) users.add(v.user_name); });
      return Array.from(users);
  }, [planSpots, spotVotes, userName]);

  const filteredSpots = useMemo(() => {
      if (filterStatus === 'all') return planSpots;
      if (filterStatus === 'confirmed') return planSpots.filter(s => s.status === 'confirmed');
      return planSpots.filter(s => (s.status || 'candidate') === filterStatus);
  }, [planSpots, filterStatus]);

  const handleStatusChangeClick = (spot: any, newStatus: string) => {
      if (newStatus !== 'confirmed' && newStatus !== spot.status) {
          if (!confirm("候補リストに戻しますか？\n設定された日付はリセットされます。")) return;
      }
      
      if (newStatus === 'confirmed') {
          setSpotToAssignDay(spot);
      } else {
          updateSpotStatus(spot, newStatus, 0); 
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
      setPlanSpots(prev => prev.map(s => s.id === spot.id ? { ...s, status: newStatus, day: day } : s));
      const { error } = await supabase.from('spots').update({ status: newStatus, day: day }).eq('id', spot.id);
      if (error) { console.error("Status update failed:", error); loadRoomData(roomId); }
  };

  // --- 投票機能 (Optimistic Update) ---
  const handleToggleVote = async (spotId: string | number) => {
    if (!userName || !roomId) return alert("名前を入力してください");
    
    const targetId = String(spotId); // IDを文字列化して比較
    const myVote = spotVotes.find(v => String(v.spot_id) === targetId && v.user_name === userName);

    if (myVote) {
        // Optimistic: ローカルで即座に削除
        setSpotVotes(prev => prev.filter(v => v.id !== myVote.id));
        
        const { error } = await supabase.from('votes').delete().eq('id', myVote.id);
        if (error) {
            console.error("Vote remove failed", error);
            loadRoomData(roomId); // エラー時はリロード
        }
    } else {
        // Optimistic: ローカルで即座に追加 (仮ID)
        const tempVote = { 
            id: `temp-${Date.now()}`, 
            room_id: roomId, 
            spot_id: spotId,
            user_name: userName, 
            vote_type: 'like' 
        };
        setSpotVotes(prev => [...prev, tempVote]);

        const { data, error } = await supabase.from('votes').insert({
            room_id: roomId,
            spot_id: spotId,
            user_name: userName,
            vote_type: 'like'
        }).select().single();
        
        if (error) {
            console.error("Vote add failed", error);
            setSpotVotes(prev => prev.filter(v => v.id !== tempVote.id)); // エラー時は戻す
        } else if (data) {
            // 本物のデータに差し替え
            setSpotVotes(prev => prev.map(v => v.id === tempVote.id ? data : v));
        }
    }
  };

  const handleSearch = async (overrideQuery?: string) => {
      const activeQuery = overrideQuery || query; 
      if(!activeQuery) return;
      setIsSearching(true);
      try {
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
        if (data.suggestions) { setSearchResults(data.suggestions); }
      } catch (e) { console.error(e); } finally { setIsSearching(false); }
  }; 

  const showResultOnMap = (name: string, desc: string, center: number[], isSaved: boolean) => {
      if (!map.current) return;
      map.current.flyTo({ center: center as [number, number], zoom: 16, offset: [0, -150] });
      const el = document.createElement('div'); 
      el.innerHTML = `<div style="width:24px; height:24px; background:#EF4444; border:3px solid white; border-radius:50%; box-shadow:0 4px 10px rgba(239,68,68,0.4);"></div>`;
      const marker = new mapboxgl.Marker({ element: el }).setLngLat(center as [number, number]).addTo(map.current);
      searchMarkersRef.current.push(marker);
      // 型エラー修正: prevの型をanyにする
      setSelectedResult({ text: name, place_name: desc, center: center, is_saved: isSaved, voters: [] });
      setViewMode('selected');
      setIsEditingDesc(false);
  };

  const handleSelectSuggestion = async (suggestion: any) => {
    setSearchResults([]); setQuery(suggestion.name);
    setIsFocused(false); 
    if (suggestion.is_history && suggestion.center) {
        const isSaved = planSpots.some(s => s.name === suggestion.name);
        showResultOnMap(suggestion.name, suggestion.place_name, suggestion.center, isSaved);
        const img = await fetchSpotImage(suggestion.name);
        // 型エラー修正: prevの型をanyにする
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
        // 型エラー修正: prevの型をanyにする
        if(img) setSelectedResult((prev: any) => ({...prev, image_url: img}));
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
    if (roomId && isJoined) {
      loadRoomData(roomId);
      const channel = supabase.channel('room_updates')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'spots', filter: `room_id=eq.${roomId}` }, () => loadRoomData(roomId))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'votes', filter: `room_id=eq.${roomId}` }, () => loadRoomData(roomId))
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [roomId, isJoined]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => { if (query.trim()) { handleSearch(); } else { setSearchResults([]); } }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [query]);

  useEffect(() => {
    if (roomId && isJoined) loadRoomData(roomId);
    if (currentTab === 'explore' && map.current) { setTimeout(() => { map.current?.resize(); fitBoundsToSpots(planSpots); }, 100); }
  }, [currentTab]);

  useEffect(() => {
    if (selectedResult && roomId) {
      const currentSpot = planSpots.find(s => s.name === selectedResult.text) || selectedResult; 
      const spotId = currentSpot.id || selectedResult.id;
      // 投票データを同期 (文字型比較で安全に)
      const voters = spotVotes.filter(v => String(v.spot_id) === String(spotId) && v.vote_type === 'like').map(v => v.user_name);
      const uniqueVoters = Array.from(new Set(voters));
      const isSaved = planSpots.some(s => s.name === selectedResult.text);

      // 型エラー修正: prevの型をanyにする
      setSelectedResult((prev: any) => ({
        ...prev,
        id: currentSpot.id || prev.id, 
        voters: uniqueVoters,
        is_saved: isSaved,
      }));
    }
  }, [spotVotes, planSpots]);

  const loadRoomData = async (id: string) => {
    const { data: spots } = await supabase.from('spots').select('*').eq('room_id', id).order('order', { ascending: true });
    const { data: allVotes } = await supabase.from('votes').select('*').eq('room_id', id);
    if (spots) {
      setPlanSpots(spots);
      if (currentTab === 'explore' && !isSearching && !selectedResult) { fitBoundsToSpots(spots); }
    }
    if (allVotes) setSpotVotes(allVotes.filter((v: any) => v.vote_type === 'like'));
  };

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

  const handleCreateRoom = async () => {
    if (!userName) return alert("名前を入力してください");
    setIsCreating(true);
    const { data: room } = await supabase.from('rooms').insert([{ name: userName }]).select().single();
    if (room) { localStorage.setItem(`route_hacker_user_${room.id}`, userName); setIsJoined(true); router.push(`/?room=${room.id}`); }
    setIsCreating(false);
  };

  const handleJoinRoom = () => {
    if (!userName) return alert("名前を入力してください");
    if (roomId) { localStorage.setItem(`route_hacker_user_${roomId}`, userName); setIsJoined(true); }
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
    let coords = spot.coordinates;
    if (!coords && spot.center) coords = spot.center;
    
    const spotName = spot.name || spot.text || "名称不明";
    const desc = (selectedResult?.id === spot.id && selectedResult.place_name) ? selectedResult.place_name : (spot.description || spot.place_name || "");
    const status = spot.status || 'candidate';

    let imageToSave = spot.image_url;
    if (selectedResult && selectedResult.text === spotName && selectedResult.image_url) {
        imageToSave = selectedResult.image_url;
    }

    if (!imageToSave) {
        imageToSave = await fetchSpotImage(spotName);
    }

    const newSpotPayload = { 
        room_id: roomId, 
        name: spotName, 
        description: desc, 
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
        day: 0
    };

    const { data, error } = await supabase.from('spots').insert([newSpotPayload]).select().single();
    if (error) { console.error("Add spot error:", error); alert("スポットの追加に失敗しました"); return; }
    if (data) { setPlanSpots(prev => [...prev, data]); resetSearchState(); setQuery(""); setSessionToken(Math.random().toString(36)); }
  };

  const removeSpot = async (spot: any) => {
    if (!roomId) return;
    if (!confirm(`本当に「${spot.name || spot.text}」をリストから削除しますか？`)) return;
    await supabase.from('spots').delete().eq('room_id', roomId).eq('name', spot.name || spot.text);
    setPlanSpots(prev => prev.filter(s => s.name !== (spot.name || spot.text)));
    if (selectedResult?.name === spot.name) setSelectedResult(null); 
  };

  const updateSpots = (newSpots: any[]) => { setPlanSpots(newSpots); };

  const resetSearchState = () => {
    setSearchResults([]); setSelectedResult(null); setViewMode('default'); searchMarkersRef.current.forEach(marker => marker.remove()); searchMarkersRef.current = []; setIsEditingDesc(false); setIsFocused(false);
  };

  const handlePreviewSpot = (spot: any) => {
    setCurrentTab('explore');
    const isSaved = planSpots.some(s => s.name === spot.name);
    // 投票データの同期
    const spotId = spot.id; // DB ID
    const voters = spotVotes.filter(v => String(v.spot_id) === String(spotId) && v.vote_type === 'like').map(v => v.user_name);
    const uniqueVoters = Array.from(new Set(voters));
    
    if (!spot.image_url && !attemptedImageFetch.current.has(spot.id)) {
        fetchSpotImage(spot.name).then(url => {
            if (url) {
                setPlanSpots(prev => prev.map(s => s.id === spot.id ? { ...s, image_url: url } : s));
                // 型エラー修正: prevの型をanyにする
                setSelectedResult((prev: any) => (prev && prev.text === spot.name ? { ...prev, image_url: url } : prev));
                if(roomId && spot.id) supabase.from('spots').update({ image_url: url }).eq('id', spot.id).then();
            }
        });
    }

    // 保存済みならDBのIDを使う（投票機能に必要）
    const dbSpot = planSpots.find(s => s.name === spot.name);
    const previewId = dbSpot ? dbSpot.id : spot.id;

    const previewData = { ...spot, id: previewId, text: spot.name, place_name: spot.description, is_saved: isSaved, voters: uniqueVoters, added_by: spot.added_by, image_url: spot.image_url };
    setSelectedResult(previewData);
    setViewMode('selected');
    setIsEditingDesc(false);
    setTimeout(() => { if (map.current) { map.current?.resize(); map.current?.flyTo({ center: spot.coordinates, zoom: 16, offset: [0, -150] }); } }, 300);
  };

  const handleAutoSearch = (keyword: string) => { setQuery(keyword); setCurrentTab('explore'); };
  const handleSearchFromChat = (keyword: string) => { setCurrentTab('explore'); setQuery(keyword); setIsFocused(true); setTimeout(() => { handleSearch(keyword); }, 300); };
  
  const handleReceiveCandidates = (newCandidates: any[]) => {
      const spotsWithIds = newCandidates.map((s) => ({ ...s, id: `ai-suggest-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, status: 'candidate' }));
      setCandidates(spotsWithIds);
  };

  const handleSaveDescription = () => {
      if (!selectedResult) return;
      const updated = { ...selectedResult, place_name: editDescValue };
      setSelectedResult(updated);
      setIsEditingDesc(false);
  };

  const getIconForSuggestion = (item: any) => {
    if (item.is_history) return <History size={16} className="text-gray-500 mt-0.5 shrink-0" />;
    return <MapIcon size={16} className="text-gray-400 mt-0.5 shrink-0" />;
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
    if (radiusKm < 0.1) radiusKm = 0.5; if (radiusKm > 3.0) radiusKm = 3.0;
    
    setInitialSearchArea({ latitude: centerLat, longitude: centerLng, radius: radiusKm });
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
          map.current?.flyTo({ center: coordinates, zoom: 16, offset: [0, -200] });
          
          fetchSpotImage(name).then(img => {
              // 型エラー修正: prevの型をanyにする
              if(img) setSelectedResult((prev: any) => ({...prev, image_url: img}));
          });
        });
      });
    }
  }, [isAuthLoading, isJoined]);

  useEffect(() => {
    if (!map.current) return;
    const markers = document.getElementsByClassName('marker-plan');
    while(markers.length > 0) markers[0].parentNode?.removeChild(markers[0]);
    
    filteredSpots.forEach((spot) => {
        const voters = spotVotes.filter(v => v.spot_id === spot.id).map(v => v.user_name);
        const participants = [spot.added_by, ...voters];
        const uniqueParticipants = Array.from(new Set(participants));
        const size = 24; 
        const segmentSize = 100 / uniqueParticipants.length;
        const gradientParts = uniqueParticipants.map((name, i) => { const color = getUDColor(name as string); return `${color} ${i * segmentSize}% ${(i + 1) * segmentSize}%`; });
        const gradientString = `conic-gradient(${gradientParts.join(', ')})`;
        const el = document.createElement('div'); 
        el.className = 'marker-plan'; 
        el.style.cursor = 'pointer';
        const isSpotHotel = isHotel(spot.name) || spot.is_hotel;
        const voteCount = uniqueParticipants.length;
        const baseColor = isSpotHotel ? '#FEF9C3' : '#FFFFFF'; 
        const textColor = isSpotHotel ? '#CA8A04' : '#1E3A8A'; 
        
        const isConfirmed = spot.status === 'confirmed';

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
            el.innerHTML = `<div style="position:relative; display:flex; flex-direction:column; align-items:center; transform:translateY(-50%);">${hotelInfoHtml}<div style="width:${size + 6}px; height:${size + 6}px; background:black; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 10px rgba(0,0,0,0.5);"><div style=\"width:${size}px; height:${size}px; background:black; border-radius:50%; display:flex; align-items:center; justify-content:center; color:white; font-weight:800; font-size:12px; border:1px solid rgba(255,255,255,0.3);\">${isSpotHotel ? '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg>' : (spot.day || '')}</div></div><div style="width:0; height:0; border-left:5px solid transparent; border-right:5px solid transparent; border-top:7px solid black; margin-top:-1px; filter:drop-shadow(0 1px 1px rgba(0,0,0,0.1));"></div></div>`;
        } else {
            el.innerHTML = `<div style="position:relative; display:flex; flex-direction:column; align-items:center; transform:translateY(-50%);">${hotelInfoHtml}<div style="width:${size + 6}px; height:${size + 6}px; background:${gradientString}; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 5px rgba(0,0,0,0.3);"><div style="width:${size}px; height:${size}px; background:${baseColor}; border-radius:50%; display:flex; align-items:center; justify-content:center; color:${textColor}; font-weight:800; font-size:12px; border:1px solid rgba(0,0,0,0.1);">${isSpotHotel ? '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg>' : (voteCount > 0 ? voteCount : '')}</div></div><div style="width:0; height:0; border-left:5px solid transparent; border-right:5px solid transparent; border-top:7px solid ${baseColor}; margin-top:-1px; filter:drop-shadow(0 1px 1px rgba(0,0,0,0.1));"></div></div>`;
        }
        el.onclick = (e) => { e.stopPropagation(); handlePreviewSpot(spot); };
        new mapboxgl.Marker({ element: el, anchor: 'bottom' }).setLngLat(spot.coordinates).addTo(map.current!);
      });
  }, [JSON.stringify(filteredSpots), JSON.stringify(spotVotes)]); 

  if (isAuthLoading || (!roomId && !isJoined) || (roomId && !isJoined)) {
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center p-6 bg-gradient-to-b from-blue-600 to-purple-800 text-white">
        <LegalModal />
        <div className="bg-white/10 backdrop-blur-lg border border-white/20 text-white p-10 rounded-[3rem] shadow-2xl w-full max-w-md text-center">
          <h1 className="text-4xl font-black mb-4 tracking-tight drop-shadow-sm">Route Hacker 🗺️</h1>
          <p className="text-blue-100 mb-8 font-medium">AIと地図で、最高の旅をハックしよう。</p>
          <div className="space-y-4">
            <input 
                type="text" 
                placeholder="あなたのお名前" 
                className="w-full p-4 bg-white/20 border border-white/30 rounded-2xl text-lg placeholder-blue-200 focus:ring-4 focus:ring-blue-400/50 outline-none text-center font-bold" 
                value={userName} 
                onChange={(e) => setUserName(e.target.value)}
            />
            {roomId ? (
              <button onClick={handleJoinRoom} disabled={!userName} className="w-full bg-white text-blue-600 font-black py-4 rounded-2xl text-xl hover:bg-blue-50 transition shadow-lg disabled:opacity-50">チームに参加する 🤝</button>
            ) : (
              <button onClick={handleCreateRoom} disabled={isCreating || !userName} className="w-full bg-blue-500 text-white font-black py-4 rounded-2xl text-xl hover:bg-blue-400 transition shadow-lg disabled:opacity-50">{isCreating ? '作成中...' : '新しい旅を始める 🚀'}</button>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative w-screen h-[100dvh] bg-slate-100 overflow-hidden flex flex-col font-sans">
      <LegalModal />
      <Ticker />
      
      {/* タイムライン（履歴）モーダル */}
      {showActivityLog && (
          <div 
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-200"
            onClick={() => setShowActivityLog(false)} // モーダル外クリックで閉じる
          >
              <div 
                className="bg-white w-full max-w-sm rounded-[2rem] p-6 shadow-2xl relative flex flex-col max-h-[80vh]"
                onClick={(e) => e.stopPropagation()} // 内部クリックは伝播させない
              >
                 {/* ヘッダー部分 */}
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
                  {/* リスト部分：touch-autoでスクロール操作を許可し、overscroll-containで連鎖を防ぐ */}
                  <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar min-h-0 overscroll-contain touch-auto">
                      {planSpots.length === 0 ? (
                          <div className="text-center text-gray-400 text-xs py-8">履歴はありません</div>
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

      {/* 設定モーダル */}
      {showDateModal && (
          <div className="absolute inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-200">
              <div className="bg-white w-full max-w-sm rounded-[2rem] p-8 shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 to-purple-600"></div>
                  <h3 className="text-xl font-black text-gray-900 flex items-center gap-2 mb-6"><Calendar size={24} className="text-blue-600"/> 旅行設定</h3>
                  <div className="space-y-4">
                      <div><label className="text-xs font-bold text-gray-400 ml-1 mb-1 block uppercase tracking-wider">Start Date</label><input type="date" value={startDate} onChange={(e)=>setStartDate(e.target.value)} className="w-full bg-gray-50 p-4 rounded-2xl font-bold text-gray-800 border border-gray-100 focus:ring-2 focus:ring-blue-100 outline-none"/></div>
                      <div><label className="text-xs font-bold text-gray-400 ml-1 mb-1 block uppercase tracking-wider">End Date</label><input type="date" value={endDate} onChange={(e)=>setEndDate(e.target.value)} className="w-full bg-gray-50 p-4 rounded-2xl font-bold text-gray-800 border border-gray-100 focus:ring-2 focus:ring-blue-100 outline-none"/></div>
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
                  <button onClick={() => setSpotToAssignDay(null)} className="w-full py-3 text-gray-400 font-bold hover:text-gray-600">キャンセル</button>
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
             {isDrawing && <div className="absolute top-1 right-14 bg-black/80 backdrop-blur text-white px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap shadow-lg">なぞって検索</div>}
          </div>

          {currentTab === 'explore' && allParticipants.length > 0 && (
              <div className="absolute bottom-36 left-4 z-10 flex flex-col gap-2 pointer-events-none">
                  {allParticipants.map(name => (
                      <div key={name} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/80 backdrop-blur-md border border-white/40 shadow-sm animate-in slide-in-from-left-2">
                          <span className="w-2 h-2 rounded-full shadow-sm" style={{ backgroundColor: getUDColor(name) }}></span>
                          <span className={`text-xs font-bold truncate max-w-[80px] ${name === userName ? 'text-blue-600' : 'text-gray-700'}`}>{name}</span>
                      </div>
                  ))}
              </div>
          )}
          
          {currentTab === 'explore' && (
            <div className="absolute top-0 left-0 right-0 z-20 flex flex-col items-center pt-4 px-4 pointer-events-none">
              <div className="bg-white/90 backdrop-blur-xl p-2 rounded-[2rem] shadow-2xl flex items-center gap-2 border border-white/50 w-full max-w-md pointer-events-auto transition-all duration-300 focus-within:ring-4 focus-within:ring-blue-100/50">
                
                {/* タイムラインボタン */}
                <button onClick={() => setShowActivityLog(true)} className="p-3 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-500 transition"><History size={18}/></button>
                
                {/* カレンダーボタン */}
                <button onClick={() => setShowDateModal(true)} className="p-3 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-500 transition"><Calendar size={18}/></button>
                
                <div className="h-6 w-px bg-gray-200"></div>
                <input 
                    type="text" 
                    value={query} 
                    onFocus={() => setIsFocused(true)} 
                    onBlur={() => setTimeout(() => setIsFocused(false), 200)} 
                    onChange={(e) => { setQuery(e.target.value); }} 
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()} 
                    placeholder="場所やキーワードを検索..." 
                    className="flex-1 bg-transparent outline-none text-gray-800 placeholder-gray-400 text-sm font-bold" 
                />
                {query && <button onClick={resetSearchState} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 transition"><X size={16}/></button>}
                <button onClick={() => handleSearch()} className="bg-black text-white p-3 rounded-full hover:bg-gray-800 shadow-md transition active:scale-95"><Search size={18} /></button>
              </div>
              
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
                  <button onClick={() => { setFilterStatus('all'); setIsListExpanded(false); }} className={`px-5 py-2.5 rounded-full text-xs font-black shadow-lg backdrop-blur-md transition border hover:scale-105 active:scale-95 ${filterStatus === 'all' ? 'bg-black text-white border-black' : 'bg-white/90 text-gray-600 border-white hover:bg-white'}`}>ALL</button>
                  <button onClick={() => { setFilterStatus('confirmed'); setIsListExpanded(true); }} className={`px-5 py-2.5 rounded-full text-xs font-black shadow-lg backdrop-blur-md transition border flex items-center gap-1.5 hover:scale-105 active:scale-95 ${filterStatus === 'confirmed' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white/90 text-gray-600 border-white hover:bg-white'}`}><CheckCircle size={14}/> 確定</button>
                  <button onClick={() => { setFilterStatus('candidate'); setIsListExpanded(true); }} className={`px-5 py-2.5 rounded-full text-xs font-black shadow-lg backdrop-blur-md transition border flex items-center gap-1.5 hover:scale-105 active:scale-95 ${filterStatus === 'candidate' ? 'bg-yellow-500 text-white border-yellow-500' : 'bg-white/90 text-gray-600 border-white hover:bg-white'}`}><HelpCircle size={14}/> 候補</button>
                  <button onClick={() => { setFilterStatus('hotel_candidate'); setIsListExpanded(true); }} className={`px-5 py-2.5 rounded-full text-xs font-black shadow-lg backdrop-blur-md transition border flex items-center gap-1.5 hover:scale-105 active:scale-95 ${filterStatus === 'hotel_candidate' ? 'bg-orange-500 text-white border-orange-500' : 'bg-white/90 text-gray-600 border-white hover:bg-white'}`}><BedDouble size={14}/> 宿</button>
              </div>
            </div>
          )}

          {viewMode === 'selected' && selectedResult && (
            <div className="absolute bottom-0 left-0 w-full z-40 p-4 pb-24 pointer-events-none flex justify-center">
              <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.3)] pointer-events-auto overflow-hidden animate-in slide-in-from-bottom-10 border border-gray-100">
                <div className="p-6 relative">
                  <button onClick={() => { setSelectedResult(null); setViewMode('default'); }} className="absolute top-5 right-5 bg-gray-100 hover:bg-gray-200 text-gray-500 p-2 rounded-full transition z-10"><X size={18}/></button>
                  
                  {/* 画像表示エリア (SpotImageを使用) */}
                  <div className="w-full h-40 rounded-xl overflow-hidden mb-4 bg-gray-100 shadow-inner">
                      <SpotImage 
                          src={selectedResult.image_url} 
                          alt={selectedResult.text} 
                          className="w-full h-full"
                      />
                  </div>

                  <div className="pr-10 mb-4">
                      <h2 className="text-2xl font-black text-gray-900 leading-tight mb-1">{selectedResult.text}</h2>
                      {isEditingDesc ? (
                          <div className="flex gap-2 mt-2"><input autoFocus value={editDescValue} onChange={(e) => setEditDescValue(e.target.value)} className="flex-1 bg-gray-50 border border-blue-200 rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-blue-100"/><button onClick={handleSaveDescription} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md">保存</button></div>
                      ) : (
                          <p className="text-xs text-gray-500 flex items-center gap-2 cursor-pointer hover:text-blue-600 transition font-medium" onClick={() => { setIsEditingDesc(true); setEditDescValue(selectedResult.place_name); }}>
                              <MapPin size={12} className="shrink-0 text-blue-400"/> {selectedResult.place_name} <Edit2 size={10} className="opacity-50"/>
                          </p>
                      )}
                  </div>
                  
                  {/* 詳細モーダル内：投票セクション */}
                  {selectedResult.is_saved && selectedResult.id && (
                      <div className="mb-6 bg-gray-50 p-4 rounded-xl border border-gray-100">
                          <div className="flex justify-between items-center mb-3">
                              <h3 className="text-xs font-bold text-gray-400 flex items-center gap-1"><UsersIcon size={12}/> 投票メンバー ({selectedResult.voters.length})</h3>
                              <button 
                                  onClick={() => handleToggleVote(selectedResult.id)} 
                                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${selectedResult.voters.includes(userName) ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-blue-600 text-white shadow-md'}`}
                              >
                                  {selectedResult.voters.includes(userName) ? '取り消す' : <><ThumbsUp size={12}/> 投票する</>}
                              </button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                              {selectedResult.voters.length === 0 ? (
                                  <span className="text-xs text-gray-400">まだ投票はありません</span>
                              ) : (
                                  selectedResult.voters.map((voter: string) => (
                                      <div key={voter} className="flex items-center gap-1 bg-white px-2 py-1 rounded-md border border-gray-200 shadow-sm">
                                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getUDColor(voter) }}></div>
                                          <span className="text-xs font-bold text-gray-600">{voter}</span>
                                      </div>
                                  ))
                              )}
                          </div>
                      </div>
                  )}

                  <div className="flex gap-2 mb-6 overflow-x-auto no-scrollbar pb-2">
                      <a href={`http://googleusercontent.com/maps.google.com/?q=${encodeURIComponent(selectedResult.text)}`} target="_blank" className="flex items-center gap-1.5 bg-gray-50 px-4 py-2.5 rounded-2xl text-xs font-bold text-gray-600 border border-gray-100 hover:bg-gray-100 transition whitespace-nowrap"><MapPinned size={14}/> Google Maps</a>
                  </div>
                  <div className="flex gap-3">
                      {selectedResult.is_saved ? (
                          <button onClick={() => removeSpot(selectedResult)} className="flex-1 bg-red-50 text-red-600 border border-red-100 py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 hover:bg-red-100 transition active:scale-95"><Trash2 size={18}/> 削除する</button>
                      ) : (
                          <button onClick={() => { addSpot({ name: selectedResult.text, description: selectedResult.place_name, coordinates: selectedResult.center, status: 'candidate' }); setSelectedResult((prev: any) => ({...prev, is_saved: true})); }} className="flex-1 bg-black text-white py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-xl hover:scale-[1.02] active:scale-95 transition"><Plus size={18}/> リストに追加</button>
                      )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {filterStatus !== 'all' && (
              <div className={`absolute left-4 right-4 z-30 bg-white/95 backdrop-blur-xl rounded-t-[2.5rem] shadow-[0_-10px_60px_rgba(0,0,0,0.15)] transition-all duration-500 cubic-bezier(0.32,0.72,0,1) flex flex-col ${isListExpanded ? 'bottom-0 h-[60%]' : 'bottom-0 h-24'}`} style={{ marginBottom: isListExpanded ? '0' : '84px' }}>
                  <div className="w-full pt-4 pb-2 cursor-pointer flex flex-col items-center shrink-0 border-b border-gray-50 hover:bg-gray-50/50 transition z-10" onClick={() => setIsListExpanded(!isListExpanded)}>
                      <div className="w-12 h-1.5 bg-gray-200 rounded-full mb-3"></div>
                      <div className="w-full flex justify-between items-center px-8">
                          <h2 className="font-black text-gray-800 flex items-center gap-2 text-xl">
                              {filterStatus === 'confirmed' && <div className="p-2 bg-blue-100 text-blue-600 rounded-xl"><CheckCircle size={20}/></div>}
                              {filterStatus === 'candidate' && <div className="p-2 bg-yellow-100 text-yellow-600 rounded-xl"><HelpCircle size={20}/></div>}
                              {filterStatus === 'hotel_candidate' && <div className="p-2 bg-orange-100 text-orange-600 rounded-xl"><BedDouble size={20}/></div>}
                              <span className="ml-1">リスト ({filteredSpots.length})</span>
                          </h2>
                          <button className="p-2.5 bg-gray-100 rounded-full text-gray-500">{isListExpanded ? <ChevronDown size={20}/> : <ChevronUp size={20}/>}</button>
                      </div>
                  </div>
                  
                  {/* Day切り替えタブ (Confirmedのみ) */}
                  {filterStatus === 'confirmed' && isListExpanded && (
                      <div className="px-4 py-2 border-b border-gray-100 overflow-x-auto no-scrollbar flex gap-2">
                          {[0, ...Array.from({ length: travelDays }, (_, i) => i + 1)].map(day => (
                              <button 
                                key={day}
                                onClick={(e) => { e.stopPropagation(); setSelectedConfirmDay(day); }}
                                className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition border ${selectedConfirmDay === day ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'}`}
                              >
                                {day === 0 ? '未定' : `Day ${day}`}
                              </button>
                          ))}
                      </div>
                  )}

                  <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-32">
                      {filteredSpots.length === 0 ? (
                          <div className="text-center text-gray-400 py-12 text-sm font-bold opacity-50">スポットがありません<br/>マップから追加してください</div>
                      ) : (
                          filterStatus === 'confirmed' ? (
                            // 選択中のDayのみ表示
                            (() => {
                                const spotsInDay = filteredSpots.filter(s => (s.day || 0) === selectedConfirmDay);
                                if (spotsInDay.length === 0) {
                                    return <div className="text-center text-gray-400 py-10 text-xs">この日の予定はまだありません</div>;
                                }
                                return (
                                    <div className="animate-in slide-in-from-bottom-4 fade-in duration-300">
                                        <div className="space-y-3">
                                            {spotsInDay.map((spot, idx) => {
                                                const voteCount = spotVotes.filter((v: any) => String(v.spot_id) === String(spot.id)).length;
                                                return (
                                                    <div key={spot.id || idx} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex h-28 transition active:scale-[0.98]" onClick={() => handlePreviewSpot(spot)}>
                                                        <div className="w-24 bg-gray-100 shrink-0 relative">
                                                            <SpotImage src={spot.image_url} alt="" className="w-full h-full"/>
                                                        </div>
                                                        <div className="flex-1 p-3 flex flex-col justify-between overflow-hidden">
                                                            <div className="flex justify-between items-start">
                                                                <h3 className="font-bold text-gray-800 text-sm truncate flex-1">{spot.name}</h3>
                                                                {/* 投票数表示 */}
                                                                <div className="flex items-center gap-1 text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded-lg shrink-0 ml-2">
                                                                    <ThumbsUp size={12} className={voteCount > 0 ? "text-blue-500 fill-blue-500" : "text-gray-400"}/> {voteCount}
                                                                </div>
                                                            </div>
                                                            <div className="flex gap-2 mt-auto">
                                                                {(isHotel(spot.name) || spot.is_hotel) && <a href={getAffiliateUrl(spot)} target="_blank" className="flex-1 bg-gradient-to-r from-orange-400 to-red-500 text-white text-[10px] py-2 rounded-lg font-bold flex items-center justify-center gap-1 shadow-md hover:shadow-lg transition" onClick={(e) => e.stopPropagation()}>楽天 <ExternalLink size={10}/></a>}
                                                                <button onClick={(e) => { e.stopPropagation(); handleStatusChangeClick(spot, (isHotel(spot.name) || spot.is_hotel) ? 'hotel_candidate' : 'candidate'); }} className="flex-1 bg-gray-100 text-gray-600 text-[10px] py-2 rounded-lg font-bold hover:bg-gray-200 transition">候補に戻す</button>
                                                                <button onClick={(e) => { e.stopPropagation(); removeSpot(spot); }} className="px-3 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition"><Trash2 size={14}/></button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })()
                          ) : (
                            filteredSpots.map((spot, idx) => {
                              const voteCount = spotVotes.filter((v: any) => String(v.spot_id) === String(spot.id)).length;
                              return (
                                <div key={spot.id || idx} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex h-28 transition active:scale-[0.98] animate-in slide-in-from-bottom-2 fade-in" onClick={() => handlePreviewSpot(spot)}>
                                    <div className="w-24 bg-gray-100 shrink-0 relative">
                                        <SpotImage src={spot.image_url} alt="" className="w-full h-full"/>
                                    </div>
                                    <div className="flex-1 p-3 flex flex-col justify-between overflow-hidden">
                                        <div className="flex justify-between items-start">
                                            <h3 className="font-bold text-gray-800 text-sm truncate flex-1">{spot.name}</h3>
                                            {/* 投票数表示 */}
                                            <div className="flex items-center gap-1 text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded-lg shrink-0 ml-2">
                                                <ThumbsUp size={12} className={voteCount > 0 ? "text-blue-500 fill-blue-500" : "text-gray-400"}/> {voteCount}
                                            </div>
                                        </div>
                                        <div className="flex gap-2 mt-auto">
                                            {(isHotel(spot.name) || spot.is_hotel) && <a href={getAffiliateUrl(spot)} target="_blank" className="flex-1 bg-gradient-to-r from-orange-400 to-red-500 text-white text-[10px] py-2 rounded-lg font-bold flex items-center justify-center gap-1 shadow-md hover:shadow-lg transition" onClick={(e) => e.stopPropagation()}>楽天 <ExternalLink size={10}/></a>}
                                            <button onClick={(e) => { e.stopPropagation(); handleStatusChangeClick(spot, 'confirmed'); }} className="flex-1 bg-black text-white text-[10px] py-2 rounded-lg font-bold hover:bg-gray-800 shadow-md transition">確定にする</button>
                                            <button onClick={(e) => { e.stopPropagation(); removeSpot(spot); }} className="px-3 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition"><Trash2 size={14}/></button>
                                        </div>
                                    </div>
                                </div>
                              );
                            })
                          )
                      )}
                  </div>
              </div>
          )}
        </div>
        
        {/* サイドバーエリア */}
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
               {currentTab === 'plan' && <div className="w-full h-full"><PlanView spots={planSpots} onRemove={(idx) => removeSpot(planSpots[idx])} onUpdateSpots={updateSpots} roomId={roomId!} travelDays={travelDays} /></div>}
               {currentTab === 'menu' && <div className="w-full h-full"><MenuView spots={planSpots} /></div>}
               {currentTab === 'swipe' && <div className="w-full h-full bg-gray-50"><SwipeView spots={candidates.length > 0 ? candidates : planSpots} spotVotes={spotVotes} onRemove={(idx) => removeSpot(planSpots[idx])} currentUser={userName} roomId={roomId!} onPreview={handlePreviewSpot} candidates={candidates} onLike={handleLikeCandidate} onNope={handleNopeCandidate} isLoadingMore={isSuggesting} onSearchOnMap={handleSearchFromChat} onReceiveCandidates={handleReceiveCandidates}/></div>}
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