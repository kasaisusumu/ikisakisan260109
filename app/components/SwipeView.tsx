"use client";

import React, { useState, useMemo, useEffect } from 'react';
// @ts-ignore
import TinderCard from 'react-tinder-card';
import { MapPin, RotateCcw, Sparkles, Loader2, Search, CheckCircle, ImageOff, Instagram, MapPinned, Globe, ExternalLink, ChevronDown, History } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const API_BASE_URL = typeof window !== "undefined" 
  ? `http://${window.location.hostname}:8000` 
  : "http://localhost:8000";

interface Props {
  spots: any[];
  spotVotes?: any[];
  onRemove: (index: number) => void;
  currentUser?: string;
  roomId?: string;
  onPreview?: (spot: any) => void;
  candidates?: any[];
  onStartSuggest?: (theme: string) => void;
  onLike?: (spot: any) => void;
  onNope?: (spot: any) => void;
  isLoadingMore?: boolean;
  onSearchOnMap?: (keyword: string) => void;
  onReceiveCandidates?: (candidates: any[]) => void;
}

const UD_COLORS = ['#E69F00', '#56B4E9', '#009E73', '#F0E442', '#0072B2', '#D55E00', '#CC79A7', '#000000'];
const getUDColor = (name: string) => {
  if (!name) return '#9CA3AF';
  let hash = 0;
  for (let i = 0; i < name.length; i++) { hash = name.charCodeAt(i) + ((hash << 5) - hash); }
  const index = Math.abs(hash) % UD_COLORS.length;
  return UD_COLORS[index];
};

const PREFECTURES = [
    "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
    "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
    "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
    "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
    "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
    "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
    "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"
];

export default function SwipeView({ 
  spots, spotVotes = [], onRemove, currentUser = "", roomId = "", onPreview,
  candidates = [], onLike, onNope, isLoadingMore, onReceiveCandidates 
}: Props) {
  
  const [lastDirection, setLastDirection] = useState<string>();
  const [votedSpotIds, setVotedSpotIds] = useState<Set<string>>(new Set());
  const [isHistoryMode, setIsHistoryMode] = useState(false);
  const [voteHistory, setVoteHistory] = useState<any[]>([]);
  const [images, setImages] = useState<{[key: string]: string | null}>({}); 
  const [isClient, setIsClient] = useState(false);
  const [areImagesReady, setAreImagesReady] = useState(false);

  const [inputTheme, setInputTheme] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  
  const [tempLikedSpots, setTempLikedSpots] = useState<any[]>([]);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const isSuggestionMode = candidates && candidates.length > 0;

  useEffect(() => {
    setIsClient(true);
    if (!isSuggestionMode && roomId && currentUser) {
      fetchVoteHistory();
    }
  }, [roomId, currentUser, isSuggestionMode]);

  useEffect(() => {
      if (isSuggestionMode && candidates && candidates.length === 0 && tempLikedSpots.length > 0) {
          setShowConfirmModal(true);
      }
  }, [candidates, isSuggestionMode, tempLikedSpots]);

  const fetchVoteHistory = async () => {
    const { data } = await supabase
      .from('votes')
      .select('id, spot_id, vote_type, created_at, spots(*)')
      .eq('room_id', roomId)
      .eq('user_name', currentUser)
      .order('created_at', { ascending: false });

    if (data) {
      const ids = new Set(data.map(v => v.spot_id));
      setVotedSpotIds(ids);
      setVoteHistory(data);
    }
  };

  const handleStartSearch = async () => {
      if (!inputTheme.trim() || isSearching) return;
      setIsSearching(true);
      
      try {
          const existing = [...spots.map(s => s.name), ...(candidates || []).map(s => s.name)];
          const res = await fetch(`${API_BASE_URL}/api/suggest_spots`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ theme: inputTheme, existing_spots: existing }),
          });
          const data = await res.json();
          
          if (data.spots && data.spots.length > 0) {
              if (onReceiveCandidates) onReceiveCandidates(data.spots);
          } else {
              alert("スポットが見つかりませんでした。別の地名で試してみてください。");
          }
      } catch (e) {
          console.error(e);
          alert("通信エラーが発生しました");
      } finally {
          setIsSearching(false);
      }
  };

  const getRakutenUrl = (query: string) => `https://search.travel.rakuten.co.jp/ds/hotel/search?f_teikei=&f_query=${encodeURIComponent(query)}`;
  const getGoogleMapUrl = (query: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  const getInstagramTag = (query: string) => encodeURIComponent(query.replace(/[\s\(\)（）「」、。]/g, ''));
  const openInstagramApp = (query: string) => window.location.href = `instagram://explore/tags/${getInstagramTag(query)}`;
  const openWebSearch = (query: string) => window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank');

  const activeSpots = useMemo(() => {
    if (isSuggestionMode && candidates) {
        return candidates.map((spot, index) => ({ ...spot, originalIndex: index }));
    }
    return spots
      .map((spot, index) => ({ ...spot, originalIndex: index }))
      .filter(s => s.added_by !== currentUser) 
      .filter(s => s.id && !votedSpotIds.has(s.id)); 
  }, [spots, votedSpotIds, currentUser, candidates, isSuggestionMode]);

  useEffect(() => {
    const preloadImages = async () => {
        if (activeSpots.length === 0) { setAreImagesReady(true); return; }
        const targets = activeSpots.filter(s => images[s.name] === undefined);
        if (targets.length === 0) { setAreImagesReady(true); return; }
        setAreImagesReady(false);
        const results = await Promise.all(targets.map(async (spot) => {
            if (spot.image_url) return { name: spot.name, url: spot.image_url };
            try {
                const wikiRes = await fetch(`https://ja.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent(spot.name)}&gsrlimit=1&prop=pageimages&piprop=original&origin=*`);
                const wikiData = await wikiRes.json();
                const pages = wikiData.query?.pages;
                if (pages) {
                    const pageId = Object.keys(pages)[0];
                    const url = pages[pageId]?.original?.source;
                    if (url) return { name: spot.name, url };
                }
            } catch (e) {}
            return { name: spot.name, url: null };
        }));
        setImages(prev => {
            const newImages = { ...prev };
            results.forEach(r => { if(r) newImages[r.name] = r.url; });
            return newImages;
        });
        setAreImagesReady(true);
    };
    preloadImages();
  }, [activeSpots]);

  const onCardLeftScreen = async (direction: string, spot: any) => {
    setLastDirection(direction);
    
    // 提案モード: 一時リストへ保存
    if (isSuggestionMode) {
        if (direction === 'right') {
            setTempLikedSpots(prev => [...prev, spot]);
            if (onLike) onLike(spot); 
        } else if (onNope) {
            if (onNope) onNope(spot);
        }
        return;
    }

    // 通常モード: 即時保存
    if (!spot.id) return;
    setVotedSpotIds(prev => new Set(prev).add(spot.id));
    const voteType = direction === 'right' ? 'like' : 'nope';
    await supabase.from('votes').insert([{
      room_id: roomId, spot_id: spot.id, user_name: currentUser, vote_type: voteType
    }]);
    if (direction === 'right') await supabase.rpc('increment_votes', { spot_id: spot.id });
  };

  const handleRewind = async () => {
    if (isSuggestionMode) return alert("提案モードでは戻れません");
    if (voteHistory.length === 0) return;
    const lastVote = voteHistory[0];
    await supabase.from('votes').delete().eq('id', lastVote.id);
    if (lastVote.vote_type === 'like') await supabase.rpc('decrement_votes', { spot_id: lastVote.spot_id });
    setVotedSpotIds(prev => { const next = new Set(prev); next.delete(lastVote.spot_id); return next; });
    setVoteHistory(prev => prev.slice(1));
    setLastDirection(undefined);
  };

  const handleConfirmAddSpots = async () => {
      setIsVerifying(true);
      try {
          const res = await fetch(`${API_BASE_URL}/api/verify_spots`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ spots: tempLikedSpots }),
          });
          const data = await res.json();
          const verifiedSpots = data.spots || tempLikedSpots;

          for (const spot of verifiedSpots) {
              const newSpot = { 
                  room_id: roomId, 
                  name: spot.name, 
                  description: spot.description, 
                  coordinates: spot.coordinates, 
                  order: spots.length, 
                  added_by: currentUser || 'AI', 
                  votes: 0,
                  is_hotel: spot.is_hotel || false 
              };
              await supabase.from('spots').insert([newSpot]);
          }
          setTempLikedSpots([]);
          setShowConfirmModal(false);
      } catch (e) {
          alert("保存エラー");
      } finally {
          setIsVerifying(false);
      }
  };

  if (!isClient) return null;

  return (
    <div className="relative w-full h-full bg-white overflow-hidden flex flex-col items-center justify-center">
      
      {/* 1. 初期状態 (提案検索画面) */}
      {activeSpots.length === 0 && !isSearching && !showConfirmModal && (
          <div className="w-full max-w-md p-8 text-center animate-in fade-in zoom-in duration-300">
              <div className="mb-6 flex justify-center">
                  <div className="w-20 h-20 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center shadow-inner">
                      <Sparkles size={40} />
                  </div>
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">次はどこへ行く？</h2>
              <p className="text-gray-500 mb-8">都道府県を選択すると、<br/>人気の観光スポットを提案します。</p>
              
              <div className="relative w-full mb-4">
                  <div className="relative">
                    <select 
                        value={inputTheme}
                        onChange={(e) => setInputTheme(e.target.value)}
                        className="w-full bg-gray-100 text-gray-800 text-lg font-bold text-center border-2 border-transparent focus:border-blue-500 rounded-2xl p-4 pr-10 outline-none transition shadow-inner appearance-none cursor-pointer hover:bg-gray-200"
                    >
                        <option value="" disabled>都道府県を選択してください</option>
                        {PREFECTURES.map(pref => (
                            <option key={pref} value={pref}>{pref}</option>
                        ))}
                    </select>
                    <div className="absolute right-4 top-1/2 transform -translate-y-1/2 pointer-events-none text-gray-400">
                        <ChevronDown size={24} />
                    </div>
                  </div>
              </div>

              <button 
                  onClick={handleStartSearch}
                  disabled={!inputTheme}
                  className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold shadow-md hover:bg-blue-700 disabled:opacity-30 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
              >
                  <Search size={20}/> 提案を受け取る
              </button>
          </div>
      )}

      {/* 2. 検索中 */}
      {isSearching && (
          <div className="flex flex-col items-center gap-4 animate-pulse">
              <Loader2 className="animate-spin text-blue-500" size={48}/>
              <p className="text-gray-500 font-bold">「{inputTheme}」のスポットを探しています...</p>
          </div>
      )}

      {/* 3. 確認モーダル */}
      {showConfirmModal && (
          <div className="absolute inset-0 z-[250] bg-white/90 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
              <div className="bg-white w-full max-w-sm rounded-3xl p-8 shadow-2xl space-y-6 border border-gray-100">
                  <div className="text-center">
                      <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4"><CheckCircle size={32}/></div>
                      <h3 className="text-2xl font-black text-gray-800">チェック完了！</h3>
                      <p className="text-gray-500">以下の{tempLikedSpots.length}件をプランに追加します。</p>
                  </div>
                  
                  <div className="max-h-48 overflow-y-auto bg-gray-50 rounded-xl p-3 space-y-2 border border-gray-100">
                      {tempLikedSpots.map((spot, i) => (
                          <div key={i} className="flex items-center gap-3 p-3 bg-white rounded-lg shadow-sm">
                              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs shrink-0">{i+1}</div>
                              <span className="text-sm font-bold text-gray-700 truncate">{spot.name}</span>
                          </div>
                      ))}
                  </div>

                  <div className="space-y-3">
                      <button 
                          onClick={handleConfirmAddSpots} 
                          disabled={isVerifying}
                          className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-blue-500 transition disabled:opacity-70 flex items-center justify-center gap-2 shadow-lg shadow-blue-200"
                      >
                          {isVerifying ? <><Loader2 className="animate-spin"/> 位置情報を確認中...</> : "確定して追加する"}
                      </button>
                      <button onClick={() => { setShowConfirmModal(false); setTempLikedSpots([]); }} className="w-full text-gray-400 font-bold py-2 hover:text-gray-600">キャンセル</button>
                  </div>
              </div>
          </div>
      )}

      {/* 4. スワイプカード */}
      {activeSpots.length > 0 && areImagesReady && !showConfirmModal && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center">
            {!isSuggestionMode && (
                <div className="absolute top-4 right-4 z-50 flex gap-3">
                <button onClick={handleRewind} disabled={voteHistory.length === 0} className="p-3 rounded-full shadow-md border bg-white text-yellow-500 border-gray-200 hover:bg-gray-50"><RotateCcw size={20} /></button>
                <button onClick={() => setIsHistoryMode(true)} className="bg-white text-gray-600 p-3 rounded-full border border-gray-200 shadow-md hover:bg-gray-50"><History size={20} /></button>
                </div>
            )}
            <div className="relative w-full h-full max-w-md mx-auto flex items-center justify-center pointer-events-none">
                {activeSpots.map((spot, index) => {
                const bgImage = images[spot.name]; 
                const voters = isSuggestionMode ? [] : spotVotes.filter(v => v.spot_id === spot.id && v.vote_type === 'like').map(v => v.user_name);
                const uniqueVoters = Array.from(new Set(voters)) as string[];
                return (
                    <div key={spot.id || spot.name} className="absolute inset-0 p-4 flex items-center justify-center pointer-events-auto" style={{ zIndex: 1000 + index }}>
                    <TinderCard className="swipe w-full h-full flex items-center justify-center" onSwipe={(dir: string) => {}} onCardLeftScreen={(dir: string) => onCardLeftScreen(dir, spot)} preventSwipe={['up', 'down']} swipeRequirementType="position" swipeThreshold={100}>
                        <div className={`relative w-[90vw] h-[75vh] max-w-[360px] max-h-[640px] bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-gray-100`}>
                        <div className="absolute inset-0 z-0 bg-gray-100">
                            {bgImage ? (<img src={bgImage} alt={spot.name} className="w-full h-full object-cover"/>) : (<div className="w-full h-full flex flex-col items-center justify-center text-gray-400"><ImageOff size={48} className="mb-2 opacity-30"/><span className="text-xs font-bold tracking-widest opacity-30">NO IMAGE</span></div>)}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 pointer-events-none"></div>
                        </div>
                        <div className="absolute top-16 right-4 z-20 flex flex-col gap-3">
                            <button onTouchEnd={(e) => { e.stopPropagation(); window.open(getGoogleMapUrl(spot.name), '_blank'); }} onClick={(e) => { e.stopPropagation(); window.open(getGoogleMapUrl(spot.name), '_blank'); }} className="w-10 h-10 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/30 shadow-lg hover:bg-white/40 transition active:scale-95"><MapPinned size={20}/></button>
                            <button onTouchEnd={(e) => { e.stopPropagation(); openInstagramApp(spot.name); }} onClick={(e) => { e.stopPropagation(); openInstagramApp(spot.name); }} className="w-10 h-10 bg-gradient-to-tr from-yellow-500 via-pink-500 to-purple-600 rounded-full flex items-center justify-center text-white border border-white/30 shadow-lg hover:scale-110 transition active:scale-95"><Instagram size={20}/></button>
                            <button onTouchEnd={(e) => { e.stopPropagation(); openWebSearch(spot.name); }} onClick={(e) => { e.stopPropagation(); openWebSearch(spot.name); }} className="w-10 h-10 bg-blue-500/80 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/30 shadow-lg hover:scale-110 transition active:scale-95"><Globe size={20}/></button>
                        </div>
                        <div className="mt-auto p-6 text-white relative z-10 flex flex-col gap-3 w-full pointer-events-none">
                           
                            {/* バッジ表示部分: AI Suggestionのみに統一 */}
                            {isSuggestionMode && (
                                <div className={`self-start text-white text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 mb-1 shadow-sm bg-purple-600`}>
                                    <Sparkles size={10}/> AI Suggestion
                                </div>
                            )}

                            <div><h3 className="text-3xl font-black drop-shadow-lg leading-tight mb-1">{spot.name}</h3><div className="flex items-center gap-2 text-xs text-gray-200 mb-2"><MapPin size={12} /><span>{spot.is_hotel ? "宿泊施設" : "観光スポット"}</span></div><div className="relative mt-2 mb-2 pointer-events-auto"><div className="bg-white/90 backdrop-blur text-gray-800 text-sm font-bold p-3 rounded-xl shadow-lg leading-relaxed relative"><div className="absolute -top-2 left-4 w-3 h-3 bg-white/90 rotate-45 transform origin-bottom-left"></div><span className="mr-1">💡</span> {spot.description || "説明文はありません"}</div></div></div>
                            
                            {!isSuggestionMode && uniqueVoters.length > 0 && (<div className="flex -space-x-2 overflow-hidden py-1">{uniqueVoters.slice(0, 5).map((voter: any, i: number) => (<div key={i} className="w-8 h-8 rounded-full border-2 border-white/50 flex items-center justify-center text-[10px] font-bold text-white shadow-sm" style={{ backgroundColor: getUDColor(voter) }}>{voter.slice(0,1)}</div>))}</div>)}
                            
                            <div className="flex justify-between items-end pt-2 border-t border-white/20 mt-1 pointer-events-auto">
                                <div className="flex-1"/>
                                {/* ホテルの場合のみ楽天ボタンを表示、AI提案の場合は非表示(空のdiv) */}
                                {spot.is_hotel && (
                                    <button onTouchEnd={(e) => { e.stopPropagation(); window.open(getRakutenUrl(spot.query || spot.name), '_blank'); }} onClick={(e) => { e.stopPropagation(); window.open(getRakutenUrl(spot.query || spot.name), '_blank'); }} className="bg-gradient-to-r from-yellow-400 to-orange-500 text-black hover:scale-105 text-xs font-bold py-2 px-4 rounded-full flex items-center gap-1 shadow-lg backdrop-blur-sm transition active:scale-95">
                                        <Search size={14}/> 空室・料金をチェック (PR)
                                    </button>
                                )}
                            </div>
                        </div>
                        </div>
                    </TinderCard>
                    </div>
                );
                })}
            </div>
            {lastDirection && (<div className="absolute bottom-24 left-0 w-full flex justify-center gap-8 z-50 pointer-events-none animate-fade-out"><h2 className={`text-4xl font-black ${lastDirection === 'right' ? 'text-green-500' : 'text-red-500'} drop-shadow-lg`}>{lastDirection === 'right' ? 'LIKE!' : 'NOPE'}</h2></div>)}
        </div>
      )}
    </div>
  );
}