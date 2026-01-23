"use client";

import React, { useState, useMemo, useEffect, useRef } from 'react';
// @ts-ignore
import TinderCard from 'react-tinder-card';
import { MapPin, RotateCcw, Sparkles, Loader2, Search, CheckCircle, ImageOff, Instagram, MapPinned, Globe, BrainCircuit, ScanSearch, History, Info } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// page.tsxと同じIDを使用
const RAKUTEN_AFFILIATE_ID = "4fcc24e4.174bb117.4fcc24e5.5b178353";

const LOADING_TIPS = [
    "💡 気になるスポットは→スワイプで保存しましょう",
    "💡 興味のないスポットは←スワイプで却下しましょう",
    "⚠️ AIは指定エリア外の場所を提案することがあります",
    "🕒 施設の営業時間は季節により変更される場合があります",
    "📅 正確な情報は必ず公式サイトをご確認ください",
    "🚗 交通状況により移動時間が変わることがあります",
    "💡 気になるスポットは右スワイプで保存しましょう",
    "💡 メーターはイメージです。実際の処理を反映していません"
];

interface Props {
  spots: any[];
  spotVotes?: any[];
  onRemove: (index: number) => void;
  currentUser?: string;
  roomId?: string;
  candidates?: any[];
  onLike?: (spot: any) => void;
  onNope?: (spot: any) => void;
  onReceiveCandidates?: (candidates: any[]) => void;
  onPreview?: (spot: any) => void;
  isLoadingMore?: boolean;
  onSearchOnMap?: (keyword: string) => void;
  allParticipants?: string[]; 
}

const UD_COLORS = [
    '#F59E0B', '#3B82F6', '#10B981', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6',
    '#F97316', '#06B6D4', '#84CC16', '#EAB308', '#D946EF', '#64748B', '#A855F7', '#FB7185',
    '#22C55E', '#0EA5E9', '#F43F5E', '#78716C'
];

export default function SwipeView({ 
  spots, spotVotes = [], currentUser = "", roomId = "",
  candidates = [], onLike, onNope, onReceiveCandidates,
  onPreview, isLoadingMore, onSearchOnMap,
  allParticipants = [] 
}: Props) {
  
  const [lastDirection, setLastDirection] = useState<string>();
  const [votedSpotIds, setVotedSpotIds] = useState<Set<string>>(new Set());
  const [images, setImages] = useState<{[key: string]: string | null}>({}); 
  const [isClient, setIsClient] = useState(false);
  const [areImagesReady, setAreImagesReady] = useState(false);

  // 検索・ストリーミング関連ステート
  const [inputTheme, setInputTheme] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [detectedCandidates, setDetectedCandidates] = useState<string[]>([]); 
  const [foundSpots, setFoundSpots] = useState<any[]>([]);
  
  const [progress, setProgress] = useState(0);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const listEndRef = useRef<HTMLDivElement>(null);
  
  const [tempLikedSpots, setTempLikedSpots] = useState<any[]>([]);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const isSuggestionMode = candidates && candidates.length > 0;

  // ストレージキー (ルーム・ユーザーごとに保存)
  const storageKey = `swiped_ids_${roomId}_${currentUser}`;

  // ★改善: 初期マウント時にSessionStorageから状態を復元
  useEffect(() => {
    setIsClient(true);
    const saved = sessionStorage.getItem(storageKey);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) {
                setVotedSpotIds(new Set(parsed));
            }
        } catch (e) {
            console.error("Failed to load swiped ids", e);
        }
    }
  }, [storageKey]);

  const getUserColor = (name: string) => {
      const index = allParticipants.indexOf(name);
      if (index === -1) return '#9CA3AF';
      return UD_COLORS[index % UD_COLORS.length];
  };

  // 外部(DB)からの投票データとローカルの状態を同期
  useEffect(() => {
    if (spotVotes && currentUser) {
        const myVotedIds = spotVotes
                .filter(v => v.user_name === currentUser)
                .map(v => String(v.spot_id));
        
        setVotedSpotIds(prev => {
            const next = new Set(prev);
            myVotedIds.forEach(id => next.add(id));
            // sessionStorageにも反映
            if (next.size > prev.size) {
                sessionStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
            }
            return next;
        });
    }
  }, [spotVotes, currentUser, storageKey]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none'; 
    document.body.style.touchAction = 'none'; 

    return () => {
      document.body.style.overflow = '';
      document.body.style.overscrollBehavior = '';
      document.body.style.touchAction = '';
    };
  }, []);

  useEffect(() => {
      if (isSuggestionMode && candidates && candidates.length === 0 && tempLikedSpots.length > 0) {
          setShowConfirmModal(true);
      }
  }, [candidates, isSuggestionMode, tempLikedSpots]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isSearching) {
      setProgress(0);
      const duration = 15000;
      const intervalTime = 100;
      const steps = duration / intervalTime;
      const increment = 95 / steps;

      interval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 95) return 95;
          return prev + increment;
        });
      }, intervalTime);
    } else {
      setProgress(0);
    }
    return () => clearInterval(interval);
  }, [isSearching]);

  useEffect(() => {
      let interval: NodeJS.Timeout;
      if (isSearching) {
          setCurrentTipIndex(0);
          interval = setInterval(() => {
              setCurrentTipIndex(prev => (prev + 1) % LOADING_TIPS.length);
          }, 4000); 
      }
      return () => clearInterval(interval);
  }, [isSearching]);

  const handleStartSearch = async () => {
      if (!inputTheme.trim() || isSearching) return;
      setIsSearching(true);
      setLoadingMessage("AIとの接続を確立中...");
      setDetectedCandidates([]);
      setFoundSpots([]);
      setProgress(0);
      
      try {
          // ▼▼▼ 修正: 名前だけでなく座標も含めたオブジェクト配列を作成する ▼▼▼
          const existing = [...spots, ...(candidates || [])].map(s => ({
              name: s.name,
              coordinates: s.coordinates
          }));
          
          const response = await fetch(`${API_BASE_URL}/api/suggest_spots`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ theme: inputTheme, existing_spots: existing }), // オブジェクト配列を送信
          });

          if (!response.body) throw new Error("No response body");

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let finalSpots: any[] = [];

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || ""; 

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const data = JSON.parse(line);
                    
                    if (data.type === 'status') {
                        setLoadingMessage(data.message);
                    } else if (data.type === 'candidates') {
                        setDetectedCandidates(data.names);
                        setLoadingMessage(data.message);
                    } else if (data.type === 'spot_found') {
                        const newSpot = data.spot;
                        setFoundSpots(prev => {
                            if (prev.some(s => s.name === newSpot.name)) return prev;
                            return [newSpot, ...prev]; 
                        });
                        finalSpots.push(newSpot);
                    } else if (data.type === 'done') {
                        setProgress(100); 
                        setLoadingMessage(`完了！ ${data.count}箇所のスポットが見つかりました`);
                        await new Promise(r => setTimeout(r, 1000));
                        if (onReceiveCandidates) onReceiveCandidates(finalSpots);
                        setIsSearching(false);
                        return;
                    } else if (data.type === 'error') {
                        alert(`エラー: ${data.message}`);
                        setIsSearching(false);
                        return;
                    }
                } catch (e) {
                    console.error("JSON Parse Error", e);
                }
            }
          }

      } catch (e) {
          console.error(e);
          alert("通信エラーが発生しました");
          setIsSearching(false);
      }
  };

  // page.tsx の getAffiliateUrl と同じロジックを実装
  // SwipeView.tsx 内の getAffiliateUrl 関数

  const getAffiliateUrl = (spot: any) => {
    const adultNum = 2; // デフォルト値
    let targetUrl = "";

    if (spot.url && spot.url.includes('rakuten.co.jp')) { 
        targetUrl = spot.url; 
    }
    else if (spot.id && /^\d+$/.test(String(spot.id))) {
        // ▼▼▼ 日付計算ロジック (ここが必要でした) ▼▼▼
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
        // ▲▲▲ ここまで ▲▲▲

        targetUrl = `https://hotel.travel.rakuten.co.jp/hotelinfo/plan/${spot.id}?f_teikei=&f_heya_su=1&f_otona_su=${adultNum}&f_nen1=${y1}&f_tuki1=${m1}&f_hi1=${d1}&f_nen2=${y2}&f_tuki2=${m2}&f_hi2=${d2}&f_sort=min_charge`;
    }
    else {
        const queryName = spot.name || "";
        targetUrl = spot.url || `https://search.travel.rakuten.co.jp/ds/hotel/search?f_teikei=&f_query=${encodeURIComponent(queryName)}&f_sort=min_charge`;
    }

    // アフィリエイトIDによる変換を行わず、そのまま返す
    return targetUrl;
  };
  
  const getInstagramTag = (query: string) => encodeURIComponent(query.replace(/[\s\(\)（）「」、。]/g, ''));
  const openInstagramApp = (query: string) => window.location.href = `instagram://explore/tags/${getInstagramTag(query)}`;
  const openWebSearch = (query: string) => window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank');

  const activeSpots = useMemo(() => {
    if (isSuggestionMode && candidates) {
        return candidates
            .map((spot, index) => ({ ...spot, originalIndex: index }))
            .filter(s => !votedSpotIds.has(s.id ? String(s.id) : s.name));
    }
    return spots
      .map((spot, index) => ({ ...spot, originalIndex: index }))
      .filter(s => s.added_by !== currentUser) 
      .filter(s => s.id && !votedSpotIds.has(String(s.id))); 
  }, [spots, votedSpotIds, currentUser, candidates, isSuggestionMode]);

  useEffect(() => {
    const preloadImages = async () => {
        if (activeSpots.length === 0) { setAreImagesReady(true); return; }
        const targets = activeSpots.filter(s => images[s.name] === undefined);
        if (targets.length === 0) { setAreImagesReady(true); return; }
        setAreImagesReady(false);
        const results = await Promise.all(targets.map(async (spot) => {
            if (spot.image_url) return { name: spot.name, url: spot.image_url };
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

    // スワイプした瞬間にローカルStateとSessionStorageを即時更新
    const spotKey = spot.id ? String(spot.id) : spot.name;
    setVotedSpotIds(prev => {
        const next = new Set(prev).add(spotKey);
        sessionStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
        return next;
    });

    // AI提案モードの場合
    if (isSuggestionMode) {
        if (direction === 'right') {
            setTempLikedSpots(prev => [...prev, spot]);
            if (onLike) onLike(spot); 
        } else if (onNope) {
            onNope(spot);
        }
        return;
    }
    
    // 通常モードの場合
    if (!spot.id) return;
    
    const voteType = direction === 'right' ? 'like' : 'nope';
    
    // ★追加: 親コンポーネント(page.tsx)に通知して即時反映させるためのコールバックを呼ぶ
    // (page.tsx側で onLike={handleVoteUpdate} のように渡す必要がありますが、
    //  現状はSupabaseのリアルタイム更新(subscription)で反映される仕組みです。
    //  もしそれが遅いなら、ここでも onLike を呼んでローカル更新させる手があります)
    
    await supabase.from('votes').insert([{
      room_id: roomId, spot_id: spot.id, user_name: currentUser, vote_type: voteType
    }]);
    
    if (direction === 'right') await supabase.rpc('increment_votes', { spot_id: spot.id });
  };

  const handleConfirmAddSpots = async () => {
      setIsVerifying(true);
      try {
          for (const spot of tempLikedSpots) {
              const newSpot = { 
                  room_id: roomId, 
                  name: spot.name, 
                  description: spot.description, 
                  coordinates: spot.coordinates, 
                  order: spots.length, 
                  added_by: currentUser || 'AI', 
                  votes: 0,
                  image_url: spot.image_url,
                  is_hotel: spot.is_hotel || false,
                  status: 'candidate', 
                  day: 0
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

  const sortedDisplayCandidates = useMemo(() => {
      const pendingNames = detectedCandidates.filter(name => !foundSpots.some(s => s.name === name));
      
      return [
          ...foundSpots.map(s => ({ type: 'found', data: s, key: s.name })),
          ...pendingNames.map(name => ({ type: 'pending', data: { name }, key: name }))
      ];
  }, [detectedCandidates, foundSpots]);

  if (!isClient) return null;

  return (
    <div 
        className="relative w-full h-full bg-white overflow-hidden flex flex-col items-center justify-center overscroll-none"
        style={{ touchAction: 'none' }} 
    >
      {/* 1. 初期状態 */}
      {activeSpots.length === 0 && !isSearching && !showConfirmModal && (
          <div className="w-full max-w-md p-8 text-center animate-in fade-in zoom-in duration-300">
              <div className="mb-6 flex justify-center">
                  <div className="w-20 h-20 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center shadow-inner">
                      <Sparkles size={40} />
                  </div>
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">
                  {isSuggestionMode ? "候補がなくなりました" : "スワイプ完了！"}
              </h2>
              <p className="text-gray-500 mb-8 whitespace-pre-wrap">
                  {isSuggestionMode ? "右スワイプした場所を確認しましょう" : "地名やテーマを入力して\nAIに新しいプランを相談しよう"}
              </p>
              
              <div className="relative w-full mb-4">
                    <input 
                        type="text"
                        value={inputTheme}
                        onChange={(e) => setInputTheme(e.target.value)}
                        placeholder="例: 京都の穴場、箱根の日帰り..."
                        className="w-full bg-gray-100 text-gray-800 text-lg font-bold text-center border-2 border-transparent focus:border-blue-500 rounded-2xl p-4 outline-none transition shadow-inner placeholder:text-gray-400 touch-auto"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleStartSearch();
                        }}
                    />
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
          <div 
              className="w-full h-full absolute inset-0 bg-slate-50 z-[200] flex flex-col overflow-hidden animate-in fade-in duration-300"
              style={{ touchAction: 'none' }}
          >
             <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
                <div className="w-[150vw] h-[150vw] opacity-10 rounded-full bg-[conic-gradient(from_0deg,transparent_0deg,transparent_200deg,#3B82F6_360deg)] animate-[spin_4s_linear_infinite]"></div>
             </div>
             
             <style jsx>{`
                @keyframes pop-bounce {
                    0% { transform: scale(0.5); opacity: 0; }
                    60% { transform: scale(1.05); opacity: 1; }
                    100% { transform: scale(1); opacity: 1; }
                }
             `}</style>

             <div className="relative z-10 flex flex-col items-center justify-center py-6 shrink-0 bg-white/60 backdrop-blur-md border-b border-blue-100 shadow-lg px-6">
                 <div className="relative mb-2">
                    <div className="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-30 duration-1000"></div>
                    <BrainCircuit size={48} className="text-blue-600 relative z-10 animate-pulse" />
                 </div>
                 <h3 className="text-xl font-black text-gray-800 tracking-tight animate-pulse mb-1">{loadingMessage}</h3>
                 
                 <div className="w-full max-w-xs h-2 bg-gray-200 rounded-full overflow-hidden relative shadow-inner mt-2">
                     <div 
                        className="h-full bg-blue-500 rounded-full transition-all duration-300 ease-out shadow-[0_0_8px_rgba(59,130,246,0.6)]"
                        style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                     ></div>
                 </div>
                 <div className="text-[10px] font-bold text-gray-400 mt-1 flex justify-between w-full max-w-xs mb-2">
                     <span>SCANNING...</span>
                     <span>{Math.round(progress)}%</span>
                 </div>

                 <p key={currentTipIndex} className="text-xs text-gray-500 mt-1 text-center animate-in fade-in slide-in-from-bottom-1 duration-500 px-4 min-h-[1.5em] font-medium flex items-center gap-1">
                     <Info size={12} className="inline text-blue-400"/>
                     {LOADING_TIPS[currentTipIndex]}
                 </p>
             </div>

             <div className="relative z-10 flex-1 overflow-y-auto w-full max-w-md mx-auto space-y-4 py-6 px-4 scrollbar-hide">
                {sortedDisplayCandidates.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-400 space-y-6">
                        <ScanSearch size={64} className="animate-bounce text-blue-500 relative z-10 drop-shadow-lg"/>
                        <span className="text-lg font-black tracking-[0.2em] text-blue-300 animate-pulse">SEARCHING...</span>
                    </div>
                ) : (
                    sortedDisplayCandidates.map((item) => {
                        const isFound = item.type === 'found';
                        const name = item.data.name;
                        const spot = isFound ? item.data : null;
                        
                        return (
                            <div key={item.key} 
                                style={{ animation: isFound ? 'pop-bounce 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards' : 'none' }}
                                className={`relative overflow-hidden flex items-center p-4 rounded-2xl border-2 transition-all duration-300 ${
                                    isFound 
                                    ? "bg-white border-blue-200 shadow-xl translate-y-0 opacity-100 scale-100" 
                                    : "bg-white/40 border-dashed border-gray-300 opacity-50 translate-y-2 scale-95"
                                }`}
                            >
                                <div className={`w-14 h-14 rounded-xl shrink-0 overflow-hidden flex items-center justify-center mr-4 shadow-sm transition-colors duration-500 ${isFound ? "bg-gray-100" : "bg-blue-50"}`}>
                                    {isFound && spot.image_url ? (
                                        <img src={spot.image_url} alt="" className="w-full h-full object-cover"/>
                                    ) : (
                                        isFound ? <MapPin size={24} className="text-blue-500"/> : <Loader2 size={20} className="animate-spin text-blue-300"/>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-center mb-1">
                                        <p className={`text-base font-black truncate ${isFound ? "text-gray-800" : "text-gray-400"}`}>{name}</p>
                                        {isFound && <CheckCircle size={20} className="text-green-500 shrink-0 ml-2 drop-shadow-md"/>}
                                    </div>
                                    <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                                        <div className={`h-full w-full ${isFound ? "bg-gradient-to-r from-blue-400 via-blue-500 to-indigo-600" : "bg-gradient-to-r from-gray-200 via-white to-gray-200 animate-[shimmer_1s_infinite]"}`}></div>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={listEndRef} />
             </div>
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
                          {isVerifying ? <><Loader2 className="animate-spin"/> 保存中...</> : "確定して追加する"}
                      </button>
                      <button onClick={() => { setShowConfirmModal(false); setTempLikedSpots([]); }} className="w-full text-gray-400 font-bold py-2 hover:text-gray-600">キャンセル</button>
                  </div>
              </div>
          </div>
      )}

      {/* 4. スワイプカード */}
      {activeSpots.length > 0 && areImagesReady && !showConfirmModal && !isSearching && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center animate-in zoom-in duration-300">
        {/* ▼▼▼ 修正: z-indexをカード(1000~)より高い値(2000)に変更して最前面に表示 ▼▼▼ */}
            <div className="absolute top-6 z-[2000] pointer-events-none animate-in fade-in slide-in-from-top-2 duration-500">
                <div className="bg-black/40 backdrop-blur-md text-white px-5 py-2 rounded-full text-xs font-black tracking-widest shadow-lg border border-white/10 flex items-center gap-2">
                    <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                    REMAINING: {activeSpots.length}
                </div>
            </div>
            <div className="relative w-full h-full max-w-md mx-auto flex items-center justify-center pointer-events-none">
                {activeSpots.map((spot, index) => {
                const bgImage = images[spot.name] || spot.image_url; 
                const voters = isSuggestionMode ? [] : spotVotes.filter(v => v.spot_id === spot.id && v.vote_type === 'like').map(v => v.user_name);
                const uniqueVoters = Array.from(new Set(voters)) as string[];
                return (
                    <div key={spot.id || spot.name} className="absolute inset-0 p-4 flex items-center justify-center pointer-events-auto" style={{ zIndex: 1000 + index, touchAction: 'none' }}>
                    <TinderCard className="swipe w-full h-full flex items-center justify-center" onSwipe={(dir: string) => {}} onCardLeftScreen={(dir: string) => onCardLeftScreen(dir, spot)} preventSwipe={['up', 'down']} swipeRequirementType="position" swipeThreshold={100}>
                        <div className={`relative w-[90vw] h-[75vh] max-w-[360px] max-h-[640px] bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-gray-100`}>
                        <div className="absolute inset-0 z-0 bg-gray-100">
                            {bgImage ? (<img src={bgImage} alt={spot.name} className="w-full h-full object-cover"/>) : (<div className="w-full h-full flex flex-col items-center justify-center text-gray-400"><ImageOff size={48} className="mb-2 opacity-30"/><span className="text-xs font-bold tracking-widest opacity-30">NO IMAGE</span></div>)}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 pointer-events-none"></div>
                        </div>
                        
                        <div className="absolute top-16 right-4 z-20 flex flex-col gap-3 items-center">
                            <button 
                                onTouchEnd={(e) => { e.stopPropagation(); if (onPreview) onPreview(spot); }} 
                                onClick={(e) => { e.stopPropagation(); if (onPreview) onPreview(spot); }} 
                                className="w-10 h-10 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/30 shadow-lg hover:bg-white/40 transition active:scale-95"
                            >
                                <Info size={20}/>
                            </button>
                            <button onTouchEnd={(e) => { e.stopPropagation(); openInstagramApp(spot.name); }} onClick={(e) => { e.stopPropagation(); openInstagramApp(spot.name); }} className="w-10 h-10 bg-gradient-to-tr from-yellow-500 via-pink-500 to-purple-600 rounded-full flex items-center justify-center text-white border border-white/30 shadow-lg hover:scale-110 transition active:scale-95"><Instagram size={20}/></button>
                            <button 
                                onTouchEnd={(e) => { e.stopPropagation(); openWebSearch(spot.name); }} 
                                onClick={(e) => { e.stopPropagation(); openWebSearch(spot.name); }} 
                                className="h-10 px-3 bg-blue-500/80 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/30 shadow-lg hover:scale-110 transition active:scale-95 gap-1.5"
                            >
                                <Globe size={16}/>
                                <span className="text-xs font-bold">Google</span>
                            </button>
                        </div>

                        <div className="mt-auto p-6 text-white relative z-10 flex flex-col gap-3 w-full pointer-events-none">
                            {isSuggestionMode && (
                                <div className={`self-start text-white text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 mb-1 shadow-sm bg-purple-600`}>
                                    <Sparkles size={10}/> AI Suggestion
                                </div>
                            )}

                            <div>
                                <h3 className="text-3xl font-black drop-shadow-lg leading-tight mb-1">{spot.name}</h3>
                                <div className="flex items-center gap-2 text-xs text-gray-200 mb-2">
                                    <MapPin size={12} />
                                    <span>{spot.is_hotel ? "宿泊施設" : (spot.category || "観光スポット")}</span>
                                </div>
                                <div className="relative mt-2 mb-2 pointer-events-auto">
                                    <div className="bg-white/90 backdrop-blur text-gray-800 text-sm font-bold p-3 rounded-xl shadow-lg leading-relaxed relative">
                                        <div className="absolute -top-2 left-4 w-3 h-3 bg-white/90 rotate-45 transform origin-bottom-left"></div>
                                        <span className="mr-1">💡</span> {spot.description || "説明文はありません"}
                                    </div>
                                </div>
                            </div>
                            
                            {!isSuggestionMode && uniqueVoters.length > 0 && (
                                <div className="flex -space-x-2 overflow-hidden py-1">
                                    {uniqueVoters.slice(0, 5).map((voter, i) => (
                                        <div key={i} className="w-8 h-8 rounded-full border-2 border-white/50 flex items-center justify-center text-[10px] font-bold text-white shadow-sm" style={{ backgroundColor: getUserColor(voter) }}>{voter.slice(0,1)}</div>
                                    ))}
                                </div>
                            )}
                            
                            <div className="flex justify-between items-end pt-2 border-t border-white/20 mt-1 pointer-events-auto">
                                <div className="flex-1"/>
                                {spot.is_hotel && (
                                    <button 
                                        onTouchEnd={(e) => { e.stopPropagation(); window.open(getAffiliateUrl(spot), '_blank'); }} 
                                        onClick={(e) => { e.stopPropagation(); window.open(getAffiliateUrl(spot), '_blank'); }} 
                                        className="bg-gradient-to-r from-yellow-400 to-orange-500 text-black hover:scale-105 text-xs font-bold py-2 px-4 rounded-full flex items-center gap-1 shadow-lg backdrop-blur-sm transition active:scale-95"
                                    >
                                        <Search size={14}/> 楽天で詳細を見る
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