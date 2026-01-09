"use client";

// ビルドエラー回避：動的レンダリングを強制
export const dynamic = 'force-dynamic';

// ReactとSuspenseを追加（ここが重要！）
import React, { Suspense, useEffect, useRef, useState, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Search, Menu, X, Plus, ExternalLink, Home as HomeIcon, Map as MapIcon, History, Sparkles, Trash2, BedDouble, Instagram, MapPinned, Users, Vote, Info, Crown, Heart, HeartOff, Edit2, Save } from 'lucide-react';
import BottomNav from './components/BottomNav';
import HotelListView from './components/HotelListView';
import PlanView from './components/PlanView';
import MenuView from './components/MenuView';
import Ticker from './components/Ticker';
import SwipeView from './components/SwipeView';
import LegalModal from './components/LegalModal';
import TimelineView from './components/TimelineView';

type Tab = 'explore' | 'agent' | 'swipe' | 'plan' | 'menu';

type SearchHistoryItem = {
  id: string;
  name: string;
  place_name: string;
  center: [number, number];
  feature_type: string;
  timestamp: number;
};

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
const API_BASE_URL = typeof window !== "undefined" 
  ? `http://${window.location.hostname}:8000` 
  : "http://localhost:8000";

const UD_COLORS = ['#F59E0B', '#3B82F6', '#10B981', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6'];
const getUDColor = (name: string) => {
  if (!name) return '#9CA3AF';
  let hash = 0;
  for (let i = 0; i < name.length; i++) { hash = name.charCodeAt(i) + ((hash << 5) - hash); }
  const index = Math.abs(hash) % UD_COLORS.length;
  return UD_COLORS[index];
};

const isHotel = (name: string) => {
    const keywords = ['ホテル', '旅館', '宿', '民宿', 'Hotel', 'Inn', 'Guest House', 'ホステル', 'リゾート'];
    return keywords.some(k => name.includes(k));
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
  const [newSuggestionReady, setNewSuggestionReady] = useState(false);

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

  const planSpotsRef = useRef(planSpots);
  useEffect(() => { planSpotsRef.current = planSpots; }, [planSpots]);

  const allParticipants = useMemo(() => {
      const users = new Set<string>();
      if (userName) users.add(userName);
      planSpots.forEach(s => { if (s.added_by) users.add(s.added_by); });
      spotVotes.forEach(v => { if (v.user_name) users.add(v.user_name); });
      return Array.from(users);
  }, [planSpots, spotVotes, userName]);

  useEffect(() => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
       setSessionToken(crypto.randomUUID());
    } else {
       setSessionToken(Math.random().toString(36).substring(2));
    }
    const savedHistory = localStorage.getItem('mapbox_search_history');
    if (savedHistory) { try { setSearchHistory(JSON.parse(savedHistory)); } catch (e) {} }
  }, []);

  useEffect(() => {
    setIsAuthLoading(true);
    if (roomId) {
      const savedName = localStorage.getItem(`route_hacker_user_${roomId}`);
      if (savedName) { setUserName(savedName); setIsJoined(true); }
      else { setIsJoined(false); }
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

  // ★ 追加: 入力に応じた自動検索 (Debounce処理)
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (query.trim()) {
        handleSearch();
      } else {
        setSearchResults([]); // クエリが空なら結果をクリア
      }
    }, 300); // 300ms待機してから検索

    return () => clearTimeout(delayDebounceFn);
  }, [query]);

  const showResultOnMap = (name: string, desc: string, center: number[], isSaved: boolean) => {
      if (!map.current) return;
      map.current.flyTo({ center: center as [number, number], zoom: 16, offset: [0, -150] });
      const el = document.createElement('div'); 
      el.innerHTML = `<div style="width:20px; height:20px; background:#EF4444; border:2px solid white; border-radius:50%; box-shadow:0 0 0 4px rgba(239,68,68,0.3);"></div>`;
      const marker = new mapboxgl.Marker({ element: el }).setLngLat(center as [number, number]).addTo(map.current);
      searchMarkersRef.current.push(marker);
      setSelectedResult({ text: name, place_name: desc, center: center, is_saved: isSaved, voters: [] });
      setViewMode('selected');
      setIsEditingDesc(false);
  };

  useEffect(() => {
    if (roomId && isJoined) loadRoomData(roomId);
    if (currentTab === 'explore' && map.current) {
        setTimeout(() => {
            map.current?.resize();
            fitBoundsToSpots(planSpots);
        }, 100);
    }
  }, [currentTab]);

  const loadRoomData = async (id: string) => {
    const { data: spots } = await supabase.from('spots').select('*').eq('room_id', id).order('order', { ascending: true });
    const { data: allVotes } = await supabase.from('votes').select('*').eq('room_id', id);

    if (spots) {
      setPlanSpots(spots);
      if (currentTab === 'explore' && !isSearching && !selectedResult) {
         fitBoundsToSpots(spots);
      }
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
      if (hasValidCoords) {
          map.current.fitBounds(bounds, { 
              padding: { top: 100, bottom: 200, left: 40, right: 40 }, 
              maxZoom: 15,
              duration: 1000
          });
      }
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
    await addSpot(spot);
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

    const newSpot = { room_id: roomId, name: spotName, description: desc, coordinates: coords, order: planSpots.length, added_by: userName || 'Guest', votes: 0 };
    const { error } = await supabase.from('spots').insert([newSpot]);
    if (!error) {
      setPlanSpots(prev => [...prev, newSpot]);
      resetSearchState();
      setQuery(""); 
      setSessionToken(Math.random().toString(36));
    }
  };

  const removeSpot = async (spot: any) => {
    if (!roomId) return;
    if (!confirm(`本当に「${spot.name || spot.text}」をリストから削除しますか？`)) return;

    await supabase.from('spots').delete().eq('room_id', roomId).eq('name', spot.name || spot.text);
    setPlanSpots(prev => prev.filter(s => s.name !== (spot.name || spot.text)));
    if (selectedResult?.name === spot.name) setSelectedResult(null); 
  };

  const handleVoteToggle = async (spotId: string) => {
    if (!roomId || !userName) return;
    const existingVote = spotVotes.find(v => v.spot_id === spotId && v.user_name === userName);
    if (existingVote) {
        await supabase.from('votes').delete().eq('id', existingVote.id);
        await supabase.rpc('decrement_votes', { spot_id: spotId });
        setSpotVotes(prev => prev.filter(v => v.id !== existingVote.id));
    } else {
        const { data: newVote } = await supabase.from('votes').insert([{
            room_id: roomId, spot_id: spotId, user_name: userName, vote_type: 'like'
        }]).select().single();
        if (newVote) {
            await supabase.rpc('increment_votes', { spot_id: spotId });
            setSpotVotes(prev => [...prev, newVote]);
        }
    }
  };

  const updateSpots = (newSpots: any[]) => { setPlanSpots(newSpots); };

  const resetSearchState = () => {
    setSearchResults([]); setSelectedResult(null); setViewMode('default'); searchMarkersRef.current.forEach(marker => marker.remove()); searchMarkersRef.current = [];
    setIsEditingDesc(false);
  };

  const handlePreviewSpot = (spot: any) => {
    setCurrentTab('explore');
    const isSaved = planSpots.some(s => s.name === spot.name);
    const voters = spotVotes.filter(v => v.spot_id === spot.id && v.vote_type === 'like').map(v => v.user_name);
    const uniqueVoters = Array.from(new Set(voters));
    const previewData = { ...spot, text: spot.name, place_name: spot.description, is_saved: isSaved, voters: uniqueVoters, added_by: spot.added_by };
    setSelectedResult(previewData);
    setViewMode('selected');
    setIsEditingDesc(false);
    setTimeout(() => {
      if (map.current) {
        map.current.resize();
        map.current.flyTo({ center: spot.coordinates, zoom: 16, offset: [0, -150] });
      }
    }, 300);
  };

  const handleAutoSearch = (keyword: string) => {
      setQuery(keyword);
      setCurrentTab('explore');
      setTimeout(() => { }, 100);
  };

  // チャットからマップ検索
  const handleSearchFromChat = (keyword: string) => {
      setCurrentTab('explore');
      setQuery(keyword);
      setIsFocused(true);
      setTimeout(() => { handleSearch(keyword); }, 300);
  };

  // ★ 新規: チャットから提案を受け取り、スワイプカードを表示する
  const handleReceiveCandidates = (newCandidates: any[]) => {
      // 一意なIDを付与してセット
      const spotsWithIds = newCandidates.map((s) => ({
          ...s,
          id: `ai-suggest-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
      }));
      setCandidates(spotsWithIds);
  };

  const handleSaveDescription = () => {
      if (!selectedResult) return;
      const updated = { ...selectedResult, place_name: editDescValue };
      setSelectedResult(updated);
      setIsEditingDesc(false);
  };

  // --- Map初期化 & マーカー処理 (省略せず維持) ---
  useEffect(() => {
    if (isAuthLoading || !isJoined) return;
    if (map.current) return; 
    mapboxgl.accessToken = MAPBOX_TOKEN;
    if (mapContainer.current) {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [lng, lat],
        zoom: 14,
        pitch: 45,
        bearing: 0,
        antialias: true
      });
      map.current.on('moveend', () => { if (map.current) { const c = map.current.getCenter(); setLng(c.lng); setLat(c.lat); } });
      map.current.on('load', () => {
        if (!map.current) return;
        map.current.resize();
        map.current.setPadding({ top: 80, bottom: 100, left: 0, right: 0 });
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
        });
      });
    }
  }, [isAuthLoading, isJoined]);

  useEffect(() => {
    if (!map.current) return;
    const markers = document.getElementsByClassName('marker-plan');
    while(markers.length > 0) markers[0].parentNode?.removeChild(markers[0]);
    planSpots.forEach((spot, index) => {
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
        const isSpotHotel = isHotel(spot.name);
        const voteCount = uniqueParticipants.length;
        const baseColor = isSpotHotel ? '#FEF9C3' : '#FFFFFF'; 
        const textColor = isSpotHotel ? '#CA8A04' : '#1E3A8A'; 
        el.innerHTML = `
          <div style="position:relative; display:flex; flex-direction:column; align-items:center; transform:translateY(-50%);">
            <div style="width:${size + 6}px; height:${size + 6}px; background:${gradientString}; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 5px rgba(0,0,0,0.3);">
               <div style="width:${size}px; height:${size}px; background:${baseColor}; border-radius:50%; display:flex; align-items:center; justify-content:center; color:${textColor}; font-weight:800; font-size:12px; border:1px solid rgba(0,0,0,0.1);">
                 ${isSpotHotel ? '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg>' : (voteCount > 0 ? voteCount : '')}
               </div>
            </div>
            <div style="width:0; height:0; border-left:5px solid transparent; border-right:5px solid transparent; border-top:7px solid ${baseColor}; margin-top:-1px; filter:drop-shadow(0 1px 1px rgba(0,0,0,0.1));"></div>
          </div>
        `;
        el.onclick = (e) => { e.stopPropagation(); handlePreviewSpot(spot); };
        new mapboxgl.Marker({ element: el, anchor: 'bottom' }).setLngLat(spot.coordinates).addTo(map.current!);
      });
  }, [JSON.stringify(planSpots), JSON.stringify(spotVotes)]); 

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

  const handleSelectSuggestion = async (suggestion: any) => {
    setSearchResults([]); setQuery(suggestion.name);
    if (suggestion.is_history && suggestion.center) {
        const isSaved = planSpots.some(s => s.name === suggestion.name);
        showResultOnMap(suggestion.name, suggestion.place_name, suggestion.center, isSaved);
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
      }
    } catch(e) { alert("詳細情報の取得に失敗しました"); }
  };

  const getIconForSuggestion = (item: any) => {
    if (item.is_history) return <History size={16} className="text-gray-500 mt-0.5 shrink-0" />;
    return <MapIcon size={16} className="text-gray-400 mt-0.5 shrink-0" />;
  };

  if (isAuthLoading || (!roomId && !isJoined) || (roomId && !isJoined)) {
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center p-6 bg-gradient-to-b from-blue-500 to-purple-600 text-white">
        <LegalModal />
        <div className="bg-white text-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-md text-center">
          <h1 className="text-3xl font-black mb-2">Route Hacker 🗺️</h1>
          <p className="text-gray-500 mb-6">{roomId ? "友達の旅に参加します" : "AIと地図で、最高の旅をハックしよう。"}</p>
          <div className="space-y-4">
            <input type="text" placeholder="あなたのお名前" className="w-full p-3 border border-gray-300 rounded-lg text-lg focus:ring-2 focus:ring-blue-500 outline-none" value={userName} onChange={(e) => setUserName(e.target.value)}/>
            {roomId ? (
              <button onClick={handleJoinRoom} disabled={!userName} className="w-full bg-green-600 text-white font-bold py-4 rounded-lg text-lg hover:bg-green-700 transition disabled:bg-gray-300">チームに参加する 🤝</button>
            ) : (
              <button onClick={handleCreateRoom} disabled={isCreating || !userName} className="w-full bg-blue-600 text-white font-bold py-4 rounded-lg text-lg hover:bg-blue-700 transition disabled:bg-gray-300">{isCreating ? '作成中...' : '新しい旅を始める 🚀'}</button>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative w-screen h-[100dvh] bg-gray-50 overflow-hidden flex flex-col">
      <LegalModal />
      <Ticker />
      
      {/* 共通のSwipeViewを呼び出す */}
      <div className="flex-1 relative overflow-hidden flex flex-col md:flex-row">
        <div className={`relative h-full w-full md:flex-1 ${currentTab === 'explore' ? 'block' : 'hidden md:block'}`}>
          <div ref={mapContainer} className="absolute top-0 left-0 w-full h-full z-0" />
          {currentTab === 'explore' && allParticipants.length > 0 && (
              <div className="absolute bottom-32 left-4 bg-white/30 backdrop-blur-sm p-2 rounded-xl border border-white/20 text-[10px] z-0 flex flex-col gap-1 select-none max-w-[140px]">
                  {allParticipants.map(name => (
                      <div key={name} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-white/40">
                          <span className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: getUDColor(name) }}></span>
                          <span className={`font-bold truncate ${name === userName ? 'text-blue-800' : 'text-gray-800'}`}>
                              {name}
                          </span>
                      </div>
                  ))}
              </div>
          )}
          {currentTab === 'explore' && (
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 w-11/12 max-w-md z-20">
              <div className="bg-white/95 backdrop-blur p-2 rounded-full shadow-lg flex items-center gap-2 border border-gray-200">
                <button className="p-2 hover:bg-gray-100 rounded-full" onClick={() => setCurrentTab('menu')}><Menu size={20} className="text-gray-600"/></button>
                <input type="text" value={query} onChange={(e) => { setQuery(e.target.value); setIsFocused(true); }} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} placeholder="検索 (例: 清水寺 / 京都ホテル)" className="flex-1 bg-transparent outline-none text-gray-800 placeholder-gray-400 text-base" />
                {query && <button onClick={resetSearchState} className="p-1 hover:bg-gray-100 rounded-full text-gray-400"><X size={18}/></button>}
                <button onClick={() => handleSearch()} className="bg-blue-600 text-white p-2 rounded-full hover:bg-blue-700 shadow-md transition"><Search size={18} /></button>
              </div>
              {((query && searchResults.length > 0) || (!query && isFocused && searchHistory.length > 0)) && (
                <div className="mt-2 bg-white/95 backdrop-blur rounded-xl shadow-2xl border border-gray-200 overflow-hidden max-h-60 overflow-y-auto">
                  {(query ? searchResults : searchHistory.map(h => ({...h, is_history: true}))).map((item) => (
                    <div key={item.mapbox_id || item.id} onClick={() => handleSelectSuggestion(item)} className="p-3 hover:bg-blue-50 border-b border-gray-100 flex items-start gap-3 cursor-pointer">
                      <div className="bg-gray-100 p-2 rounded-full mt-0.5">{getIconForSuggestion(item)}</div>
                      <div className="overflow-hidden text-left"><p className="font-bold text-sm text-gray-800 truncate">{item.name || item.text}</p><p className="text-xs text-gray-500 line-clamp-1">{item.full_address || item.place_formatted || item.place_name}</p></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {viewMode === 'selected' && selectedResult && (
            <div className="absolute bottom-0 left-0 w-full z-30 p-4 pb-20 pointer-events-none flex justify-center">
              <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl pointer-events-auto overflow-hidden animate-in slide-in-from-bottom-10 border border-gray-200">
                <div className="p-5 relative">
                  <button onClick={() => { setSelectedResult(null); setViewMode('default'); }} className="absolute top-4 right-4 bg-gray-100 hover:bg-gray-200 text-gray-500 p-1.5 rounded-full"><X size={18}/></button>
                  <div className="pr-8 mb-2">
                      <h2 className="text-xl font-bold text-gray-900 leading-tight">{selectedResult.text}</h2>
                      {isEditingDesc ? (
                          <div className="flex gap-2 mt-2"><input autoFocus value={editDescValue} onChange={(e) => setEditDescValue(e.target.value)} className="flex-1 border border-blue-300 rounded p-2 text-sm"/><button onClick={handleSaveDescription} className="bg-blue-600 text-white px-4 py-1 rounded-lg text-xs font-bold"><Save size={16}/></button></div>
                      ) : (
                          <p className="text-sm text-gray-500 mt-1 line-clamp-2 flex items-center gap-2">{selectedResult.place_name}<button onClick={() => { setIsEditingDesc(true); setEditDescValue(selectedResult.place_name); }} className="p-1.5 bg-gray-50 rounded-full text-gray-400 hover:text-blue-600"><Edit2 size={14}/></button></p>
                      )}
                  </div>
                  <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar">
                      <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedResult.text)}`} target="_blank" className="flex items-center gap-1 bg-gray-100 px-3 py-1.5 rounded-full text-xs font-bold text-gray-600 border border-gray-200"><MapPinned size={14}/> Google Maps</a>
                      <button onClick={() => setShowVoteDetailSpot(selectedResult)} className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold border ${selectedResult.voters?.length > 0 ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-gray-50 text-gray-400 border-gray-200'}`}><Users size={14}/> {selectedResult.voters?.length || 0}人が投票</button>
                  </div>
                  <div className="flex gap-3">
                      {selectedResult.is_saved ? (
                          <button onClick={() => removeSpot(selectedResult)} className="flex-1 bg-red-50 text-red-600 border border-red-200 py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2"><Trash2 size={18}/> 削除する</button>
                      ) : (
                          <button onClick={() => { addSpot({ name: selectedResult.text, description: selectedResult.place_name, coordinates: selectedResult.center }); setSelectedResult((prev: any) => ({...prev, is_saved: true})); }} className="flex-1 bg-blue-600 text-white py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg"><Plus size={18}/> 追加する</button>
                      )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className={`flex flex-col z-20 md:w-[400px] md:h-full md:bg-gray-50 md:border-l md:border-gray-200 md:shadow-xl md:relative absolute top-0 left-0 right-0 bottom-16 transition-colors duration-300 ${currentTab === 'explore' ? 'bg-transparent pointer-events-none' : 'bg-gray-50 pointer-events-auto'}`}>
          <div className="flex-1 overflow-hidden relative pb-16 md:pb-0">
             <div className={currentTab === 'explore' ? 'hidden' : 'block h-full'}>
               {currentTab === 'agent' && <div className="w-full h-full"><HotelListView spots={planSpots} onAutoSearch={handleAutoSearch} spotVotes={spotVotes} currentUser={userName} onPreviewSpot={handlePreviewSpot} roomId={roomId!} /></div>}
               {currentTab === 'plan' && <div className="w-full h-full"><PlanView spots={planSpots} onRemove={(idx) => removeSpot(planSpots[idx])} onUpdateSpots={updateSpots} roomId={roomId!} /></div>}
               {currentTab === 'menu' && <div className="w-full h-full"><MenuView spots={planSpots} /></div>}
               
               {/* --- SwipeView (スワイプ & チャット) --- */}
               {currentTab === 'swipe' && (
                 <div className="w-full h-full bg-gray-50">
                    <SwipeView 
                        spots={candidates.length > 0 ? candidates : planSpots} 
                        spotVotes={spotVotes} 
                        onRemove={(idx) => removeSpot(planSpots[idx])} 
                        currentUser={userName} 
                        roomId={roomId!} 
                        onPreview={handlePreviewSpot} 
                        
                        // Suggestion Mode (candidates)
                        candidates={candidates}
                        onLike={handleLikeCandidate} 
                        onNope={handleNopeCandidate} 
                        
                        // Chat & Action handlers
                        isLoadingMore={isSuggesting}
                        onSearchOnMap={handleSearchFromChat} 
                        
                        // ★ 新規: チャットからの提案受け取り用
                        onReceiveCandidates={handleReceiveCandidates}
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

// これをファイルの一番下に追加してください
export default function Home() {
  return (
    <Suspense fallback={<div className="flex h-screen w-screen items-center justify-center">Loading...</div>}>
      <HomeContent />
    </Suspense>
  );
}