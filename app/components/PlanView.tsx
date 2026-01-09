"use client";

import { useState, useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MapPin, Car, Clock, X, Info, Map as MapIcon, Save, BookOpen, Trash2, Settings, Loader2, Sparkles, PlusCircle, MinusCircle, RefreshCw, BedDouble, ExternalLink, Lock, Share2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
// @ts-ignore
import TinderCard from 'react-tinder-card';

const MAPBOX_TOKEN = "pk.eyJ1Ijoia2FzYWlzdXN1bXUwMSIsImEiOiJjbWljb2E1cWEwb2d5MmpvaXkwdWhtNjhjIn0.wA6FIZGDGor8jXsx-RNosA";

interface Props {
  spots: any[];
  onRemove: (spot: any) => void;
  onUpdateSpots: (newSpots: any[]) => void;
  
  roomId: string;
}

export default function PlanView({ spots, onRemove, onUpdateSpots, roomId }: Props) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [unusedSpots, setUnusedSpots] = useState<any[]>([]); 
  const [routeGeoJSON, setRouteGeoJSON] = useState<any>(null);
  const [isPlanGenerated, setIsPlanGenerated] = useState(false);
  
  // アンロック状態管理
  const [isUnlocked, setIsUnlocked] = useState(false);

  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
  const [optimizeCount, setOptimizeCount] = useState(0);

  const [selectedMapSpot, setSelectedMapSpot] = useState<any>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("18:00");
  const [startSpotName, setStartSpotName] = useState<string>("");
  const [endSpotName, setEndSpotName] = useState<string>("");
  const [isPinListOpen, setIsPinListOpen] = useState(false);
  const [pinnedPlans, setPinnedPlans] = useState<any[]>([]);

  // 宿が含まれているかチェック（タイムライン表示制御用）
  const hasHotel = spots.some(s => s.category === 'hotel' || s.name.includes('ホテル') || s.name.includes('旅館') || s.name.includes('民宿'));

  useEffect(() => {
    // 宿がある、または以前アンロック済みならアンロック
    if (hasHotel) {
        setIsUnlocked(true);
    } else {
        // 過去に解除済みかチェック
        const unlocked = typeof window !== 'undefined' ? localStorage.getItem(`rh_unlocked_${roomId}`) : null;
        if (unlocked) setIsUnlocked(true);
        else setIsUnlocked(false);
    }
  }, [spots, roomId, hasHotel]);

  useEffect(() => {
    if (isPlanGenerated && spots.length > 0) {
      const currentSpotNames = new Set(spots.map(s => s.name));
      setTimeline(prev => (prev || []).filter(item => {
        if (item.type === 'travel') return true;
        return currentSpotNames.has(item.spot.name);
      }));
      setUnusedSpots(prev => (prev || []).filter(s => currentSpotNames.has(s.name)));
      const knownNames = new Set([
          ...(timeline || []).filter(t => t.type === 'spot').map(t => t.spot.name),
          ...(unusedSpots || []).map(s => s.name)
      ]);
      const newSpots = spots.filter(s => !knownNames.has(s.name));
      if (newSpots.length > 0) setUnusedSpots(prev => [...(prev || []), ...newSpots]);
    }
  }, [JSON.stringify(spots)]);

  useEffect(() => {
    const fetchStatus = async () => {
      const { data } = await supabase.from('rooms').select('optimize_count').eq('id', roomId).single();
      if (data) setOptimizeCount(data.optimize_count || 0);
    };
    fetchStatus();
  }, [roomId]);

  useEffect(() => {
    if (roomId) {
        const savedPlan = localStorage.getItem(`rh_plan_${roomId}`);
        if (savedPlan) {
            try {
                const data = JSON.parse(savedPlan);
                setTimeline(Array.isArray(data.timeline) ? data.timeline : []);
                setUnusedSpots(Array.isArray(data.unusedSpots) ? data.unusedSpots : []);
                setRouteGeoJSON(data.routeGeoJSON || null);
                setIsPlanGenerated(true);
            } catch (e) { console.error("Restore error", e); }
        }
    }
  }, [roomId]);

  useEffect(() => {
    if (roomId && isPlanGenerated) {
        localStorage.setItem(`rh_plan_${roomId}`, JSON.stringify({ timeline, unusedSpots, routeGeoJSON }));
    }
  }, [timeline, unusedSpots, routeGeoJSON, isPlanGenerated, roomId]);

  const fetchPinnedPlans = async () => {
      const { data } = await supabase.from('pinned_plans').select('*').eq('room_id', roomId).order('created_at', { ascending: false });
      if (data) setPinnedPlans(data);
  };
  useEffect(() => { if (isPinListOpen) fetchPinnedPlans(); }, [isPinListOpen]);

  const handlePinPlan = async () => {
      if (!isPlanGenerated) return;
      const title = prompt("プラン名を入力:", `プラン ${new Date().toLocaleTimeString()}`);
      if (!title) return;
      const planData = { timeline, unusedSpots, routeGeoJSON };
      const { error } = await supabase.from('pinned_plans').insert([{ room_id: roomId, title: title, plan_data: planData }]);
      if (!error) alert("保存しました！📌");
  };

  const handleLoadPin = (plan: any) => {
      if (!confirm(`「${plan.title}」を復元しますか？`)) return;
      const data = plan.plan_data;
      setTimeline(Array.isArray(data.timeline) ? data.timeline : []);
      setUnusedSpots(Array.isArray(data.unusedSpots) ? data.unusedSpots : []);
      setRouteGeoJSON(data.routeGeoJSON);
      setIsPlanGenerated(true);
      const allSpots = [...(data.timeline || []).filter((t:any)=>t.type==='spot').map((t:any)=>t.spot), ...(data.unusedSpots || [])];
      onUpdateSpots(allSpots);
      setIsPinListOpen(false);
  };
  
  const handleDeletePin = async (id: string) => {
      if(!confirm("削除しますか？")) return;
      await supabase.from('pinned_plans').delete().eq('id', id);
      fetchPinnedPlans();
  };

  const handleAutoGenerate = async () => {
    if (spots.length < 2) return alert("スポットを2つ以上選んでください");
    setIsProcessing(true);
    try {
      // ★ ここで現在のIPを自動取得（魔法の1行）
      const baseUrl = typeof window !== 'undefined' 
        ? `http://${window.location.hostname}:8000` 
        : "http://localhost:8000";

      const targetSpots = [...spots].sort((a, b) => (b.votes || 0) - (a.votes || 0));
      
      const res = await fetch(`${baseUrl}/api/optimize_route`, {
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

      setTimeline(data.timeline || []);
      setUnusedSpots(data.unused_spots || []);
      setRouteGeoJSON(data.route_geometry);
      setIsPlanGenerated(true);
      setShowSettings(false);
      
      const newCount = optimizeCount + 1;
      setOptimizeCount(newCount);
      supabase.from('rooms').update({ optimize_count: newCount }).eq('id', roomId).then();
    } catch (e: any) { alert(`エラー: ${e.message}`); } finally { setIsProcessing(false); }
  };

  const recalculateRoute = async (currentTimeline: any[]) => {
    const activeSpots = currentTimeline.filter(item => item.type === 'spot').map(item => item.spot);
    if (activeSpots.length < 2) {
        setTimeline(currentTimeline.filter(t => t.type === 'spot')); 
        setRouteGeoJSON(null);
        return;
    }
    setIsProcessing(true);
    try {
        // ★ ここでも自動取得
        const baseUrl = typeof window !== 'undefined' 
          ? `http://${window.location.hostname}:8000` 
          : "http://localhost:8000";

        const res = await fetch(`${baseUrl}/api/calculate_route`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ spots: activeSpots, start_time: startTime }),
        });
        const data = await res.json();
        if (data.timeline) {
            setTimeline(data.timeline);
            setRouteGeoJSON(data.route_geometry);
        }
    } catch(e) { console.error(e); } finally { setIsProcessing(false); }
  };

  const handleUnlockByShare = () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const text = `旅のプランを考え中！🗺️\nこのルートどうかな？\n\n${url}`;
    
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text);
        alert("リンクをコピーしました！\nLINEなどでメンバーに共有してください。");
        setIsUnlocked(true);
        localStorage.setItem(`rh_unlocked_${roomId}`, 'true');
    } else {
        alert("コピーできませんでした。URLを手動で共有してください。");
        setIsUnlocked(true);
        localStorage.setItem(`rh_unlocked_${roomId}`, 'true');
    }
  };

  const onDragStart = (e: React.DragEvent, index: number) => { setDraggedItemIndex(index); };
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const onDrop = (e: React.DragEvent, dropIndex: number) => {
    if (draggedItemIndex === null || draggedItemIndex === dropIndex) return;
    const spotIndices = timeline.map((item, i) => item.type === 'spot' ? i : -1).filter(i => i !== -1);
    const fromSpotIndex = spotIndices.indexOf(draggedItemIndex);
    const toSpotIndex = spotIndices.indexOf(dropIndex);
    if (fromSpotIndex === -1 || toSpotIndex === -1) return;

    const currentSpots = timeline.filter(t => t.type === 'spot').map(t => t.spot);
    const newSpotsArray = [...currentSpots];
    const [moved] = newSpotsArray.splice(fromSpotIndex, 1);
    newSpotsArray.splice(toSpotIndex, 0, moved);

    const tempTimeline = newSpotsArray.map(s => ({ type: 'spot', spot: s })); 
    setTimeline(tempTimeline);
    recalculateRoute(tempTimeline);
    setDraggedItemIndex(null);
  };

  const toggleSpotInclusion = (spot: any, isAdding: boolean) => {
    setSelectedMapSpot(null); 
    if (isAdding) {
        const newUnused = unusedSpots.filter(s => s.name !== spot.name);
        setUnusedSpots(newUnused);
        const currentSpots = timeline.filter(t => t.type === 'spot').map(t => t.spot);
        recalculateRoute([...currentSpots, spot].map(s => ({ type: 'spot', spot: s })));
    } else {
        const newSpots = timeline.filter(t => t.type === 'spot' && t.spot.name !== spot.name).map(t => t.spot);
        setUnusedSpots(prev => [...prev, spot]);
        recalculateRoute(newSpots.map(s => ({ type: 'spot', spot: s })));
    }
  };

  const handleEditTime = (index: number, field: 'stay_min' | 'duration_min', value: string) => {
    const val = parseInt(value, 10);
    if (isNaN(val)) return;
    const newTimeline = [...timeline];
    newTimeline[index][field] = val;
    if (field === 'stay_min' && newTimeline[index].spot) newTimeline[index].spot.stay_time = val;
    setTimeline(newTimeline);
  };

  useEffect(() => {
    mapboxgl.accessToken = MAPBOX_TOKEN;
    if (!map.current && mapContainer.current) {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/light-v11',
        center: [135.758767, 34.985120], 
        zoom: 10
      });
      map.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');
    }

    const activePoints = (timeline || []).filter(t => t.type === 'spot').map(t => t.spot);
    const allDisplaySpots = [...activePoints, ...(unusedSpots || [])];

    if (map.current && allDisplaySpots.length > 0) {
        const updateMap = () => {
            if (!map.current) return;
            document.querySelectorAll('.marker-plan-map').forEach(e => e.remove());

            const bounds = new mapboxgl.LngLatBounds();
            activePoints.forEach((spot, i) => {
                const el = document.createElement('div');
                el.className = 'marker-plan-map';
                el.innerHTML = `<div style="background-color:#2563EB; width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:white; font-weight:bold; border:2px solid white; box-shadow:0 2px 5px rgba(0,0,0,0.3);">${i + 1}</div>`;
                el.style.cursor = 'pointer';
                el.onclick = (e) => { e.stopPropagation(); setSelectedMapSpot({ spot, type: 'active' }); };
                new mapboxgl.Marker(el).setLngLat(spot.coordinates).addTo(map.current!);
                bounds.extend(spot.coordinates);
            });
            unusedSpots.forEach((spot) => {
                const el = document.createElement('div');
                el.className = 'marker-plan-map';
                el.innerHTML = `<div style="background-color:#9CA3AF; width:20px; height:20px; border-radius:50%; border:2px solid white;"></div>`;
                el.style.cursor = 'pointer';
                el.onclick = (e) => { e.stopPropagation(); setSelectedMapSpot({ spot, type: 'unused' }); };
                new mapboxgl.Marker(el).setLngLat(spot.coordinates).addTo(map.current!);
                bounds.extend(spot.coordinates);
            });

            if (routeGeoJSON) {
                const sourceId = 'route';
                if (map.current.getSource(sourceId)) {
                    (map.current.getSource(sourceId) as mapboxgl.GeoJSONSource).setData(routeGeoJSON);
                } else {
                    if (!map.current.getLayer(sourceId)) {
                        map.current.addLayer({
                            id: sourceId, type: 'line',
                            source: { type: 'geojson', data: routeGeoJSON },
                            layout: { 'line-join': 'round', 'line-cap': 'round' },
                            paint: { 'line-color': '#3B82F6', 'line-width': 5, 'line-opacity': 0.7 }
                        });
                    }
                }
            }
            if (!bounds.isEmpty()) map.current.fitBounds(bounds, { padding: 60, duration: 1000 });
        };
        if (map.current.isStyleLoaded()) updateMap();
        else map.current.once('styledata', updateMap);
    }
  }, [timeline, unusedSpots, routeGeoJSON]);

  if (!isPlanGenerated) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center bg-white">
         <div className="mb-6 p-6 bg-blue-50 rounded-full animate-pulse"><Sparkles size={48} className="text-blue-500"/></div>
         <h2 className="text-2xl font-black text-gray-800 mb-2">最適なルートを生成</h2>
         <p className="text-gray-500 mb-8 max-w-xs mx-auto">
           {spots.length}箇所のスポットを効率よく回る<br/>魔法のようなプランを作成します。
         </p>
         <button onClick={handleAutoGenerate} disabled={isProcessing} className="w-full max-w-xs bg-blue-600 text-white py-4 rounded-2xl font-bold text-lg shadow-xl hover:scale-105 transition flex items-center justify-center gap-2">
            {isProcessing ? <Loader2 className="animate-spin"/> : 'ルートを生成する 🚀'}
         </button>
      </div>
    );
  }
  
  let spotCounter = 0;
  
  return (
    <div className="flex flex-col h-full bg-slate-50 relative">
      
      {showSettings && (
          <div className="absolute inset-0 z-50 bg-white/95 backdrop-blur-sm p-6 flex flex-col animate-in slide-in-from-bottom-10">
              <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2"><Settings size={24}/> ルート設定</h2>
                  <button onClick={() => setShowSettings(false)} className="p-2 bg-gray-100 rounded-full"><X size={20}/></button>
              </div>
              <div className="space-y-6">
                  <div>
                      <label className="block text-sm font-bold text-gray-600 mb-1">出発時刻</label>
                      <input type="time" value={startTime} onChange={(e)=>setStartTime(e.target.value)} className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 font-bold"/>
                  </div>
                  <div>
                      <label className="block text-sm font-bold text-gray-600 mb-1">終了時刻（目安）</label>
                      <input type="time" value={endTime} onChange={(e)=>setEndTime(e.target.value)} className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 font-bold"/>
                  </div>
                  <div>
                      <label className="block text-sm font-bold text-gray-600 mb-1">出発地点（スポット名）</label>
                      <input type="text" value={startSpotName} onChange={(e)=>setStartSpotName(e.target.value)} placeholder="例：京都駅" className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200"/>
                  </div>
                  <div>
                      <label className="block text-sm font-bold text-gray-600 mb-1">終了地点（スポット名）</label>
                      <input type="text" value={endSpotName} onChange={(e)=>setEndSpotName(e.target.value)} placeholder="例：ホテル" className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200"/>
                  </div>
                  <button onClick={handleAutoGenerate} className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold shadow-lg mt-4">設定を保存して再生成</button>
              </div>
          </div>
      )}

      {isPinListOpen && (
          <div className="absolute inset-0 z-50 bg-white/95 backdrop-blur-sm p-6 flex flex-col animate-in fade-in">
              <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2"><BookOpen size={24}/> 保存済みプラン</h2>
                  <button onClick={() => setIsPinListOpen(false)} className="p-2 bg-gray-100 rounded-full"><X size={20}/></button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-3">
                  {pinnedPlans.length === 0 ? (
                      <p className="text-center text-gray-400 mt-10">保存されたプランはありません</p>
                  ) : (
                      pinnedPlans.map((plan) => (
                          <div key={plan.id} className="bg-white border border-gray-200 p-4 rounded-xl shadow-sm flex justify-between items-center">
                              <div onClick={() => handleLoadPin(plan)} className="flex-1 cursor-pointer">
                                  <h3 className="font-bold text-gray-800">{plan.title}</h3>
                                  <p className="text-xs text-gray-500">{new Date(plan.created_at).toLocaleString()}</p>
                              </div>
                              <button onClick={() => handleDeletePin(plan.id)} className="p-2 text-red-400 hover:text-red-600"><Trash2 size={18}/></button>
                          </div>
                      ))
                  )}
              </div>
          </div>
      )}

      {selectedMapSpot && (
        <div className="absolute top-4 left-4 right-4 z-20 bg-white/90 backdrop-blur rounded-2xl p-4 shadow-xl border border-blue-100 animate-in slide-in-from-top-5">
            <div className="flex justify-between items-start mb-2">
                <h3 className="font-bold text-gray-800 text-lg">{selectedMapSpot.spot.name}</h3>
                <button onClick={() => setSelectedMapSpot(null)} className="p-1 bg-gray-100 rounded-full"><X size={16}/></button>
            </div>
            {selectedMapSpot.spot.description && <p className="text-xs text-gray-500 mb-3 line-clamp-2">{selectedMapSpot.spot.description}</p>}
            <div className="flex gap-2">
                {selectedMapSpot.type === 'unused' ? (
                    <button onClick={() => toggleSpotInclusion(selectedMapSpot.spot, true)} className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-xs font-bold shadow-md">ルートに追加</button>
                ) : (
                    <button onClick={() => toggleSpotInclusion(selectedMapSpot.spot, false)} className="flex-1 bg-red-50 text-red-600 border border-red-100 py-2 rounded-lg text-xs font-bold">ルートから外す</button>
                )}
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedMapSpot.spot.name)}`} target="_blank" className="flex-1 bg-gray-100 text-gray-600 py-2 rounded-lg text-xs font-bold text-center">Google Map</a>
            </div>
        </div>
      )}
      
      <div className="h-[40%] w-full relative shrink-0 shadow-lg z-10">
        <div ref={mapContainer} className="w-full h-full" />
        <div className="absolute top-3 left-3 bg-white/90 backdrop-blur px-3 py-1.5 rounded-full shadow-sm text-xs font-bold text-blue-800 border border-blue-100 flex items-center gap-2">
            <MapPin size={12}/> {spots.length}箇所
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 relative pb-24 bg-slate-50"> 
        
        {/* ロック時のオーバーレイ (宿がない場合) */}
        {!isUnlocked && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/60 backdrop-blur-[2px]">
                <div className="bg-white p-6 rounded-2xl shadow-2xl text-center max-w-xs border border-blue-100 animate-in zoom-in duration-300">
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Lock className="text-blue-600" size={24}/>
                    </div>
                    <h3 className="font-black text-xl text-gray-800 mb-1">タイムライン詳細</h3>
                    <p className="text-xs text-gray-500 mb-4">
                        正確な時間を計算するには、<br/>
                        拠点の「宿」が必要です。
                    </p>
                    <button 
                        onClick={() => {
                            // リストタブなどへの誘導が必要ならここに実装
                            alert("リストタブから宿を追加・チェックしてください！");
                        }}
                        className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 rounded-xl font-bold shadow-lg hover:scale-105 transition flex items-center justify-center gap-2"
                    >
                        <BedDouble size={18}/> 宿を探してアンロック
                    </button>
                </div>
            </div>
        )}

        <div className={`relative pl-4 space-y-0 ${!isUnlocked ? 'filter blur-sm select-none pointer-events-none' : ''}`}>
          <div className="absolute left-[27px] top-4 bottom-0 w-0.5 bg-gray-200 z-0"></div>

          {timeline?.map((item, i) => {
            if (item.type === 'spot') {
              spotCounter++;
              return (
                <div key={`spot-${i}`} className="relative group mb-6 z-10 pl-8" draggable={isUnlocked} onDragStart={(e) => onDragStart(e, i)} onDragOver={onDragOver} onDrop={(e) => onDrop(e, i)}>
                  <div className="absolute left-0 top-3 bg-blue-600 text-white w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shadow-md border-2 border-white z-10">
                    {spotCounter}
                  </div>
                  
                  <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 hover:border-blue-300 transition active:scale-[0.99]">
                    <div className="flex justify-between items-start">
                        <div>
                            <span className="font-bold text-gray-800 block text-base">{item.spot.name}</span>
                            <div className="text-xs text-gray-400 font-mono mt-1 flex items-center gap-1">
                                <Clock size={10}/> {item.arrival} - {item.departure}
                            </div>
                        </div>
                        {isUnlocked && <button onClick={() => toggleSpotInclusion(item.spot, false)} className="text-gray-300 hover:text-red-500 p-1"><MinusCircle size={18}/></button>}
                    </div>
                    {item.spot.stay_time > 0 && (
                        <div className="mt-3 pt-2 border-t border-dashed border-gray-100 flex items-center gap-2">
                             <span className="text-[10px] font-bold text-gray-400">滞在:</span>
                             <input 
                                type="number" 
                                value={item.stay_min || item.spot.stay_time} 
                                onChange={(e) => handleEditTime(i, 'stay_min', e.target.value)}
                                className="w-12 bg-gray-50 border border-gray-200 rounded text-center text-xs font-bold p-1 focus:border-blue-500 outline-none"
                             />
                             <span className="text-[10px] text-gray-400">分</span>
                        </div>
                    )}
                  </div>
                </div>
              );
            } else if (item.type === 'travel') {
              return (
                <div key={`travel-${i}`} className="pl-8 mb-6 relative">
                    <div className="flex items-center gap-3">
                        <div className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 border border-blue-100 shadow-sm">
                            <Car size={12}/>
                            <span>移動: 約{item.duration_min}分</span>
                        </div>
                        {isUnlocked && <a href={item.google_maps_url} target="_blank" rel="noreferrer" className="text-[10px] text-gray-400 hover:text-blue-500 flex items-center gap-1 bg-white px-2 py-1 rounded-full border border-gray-100 shadow-sm"><MapIcon size={10}/> ルート</a>}
                    </div>
                </div>
              );
            }
          })}

          {unusedSpots.length > 0 && (
              <div className="mt-8 pt-6 border-t border-gray-200">
                  <h3 className="text-xs font-bold text-gray-400 mb-3 flex items-center gap-2"><Trash2 size={12}/> ルートに含まれていないスポット</h3>
                  <div className="space-y-3">
                      {unusedSpots.map((spot, i) => (
                          <div key={`unused-${i}`} className="bg-gray-50 p-3 rounded-xl border border-gray-200 opacity-70 flex justify-between items-center">
                              <span className="text-sm font-bold text-gray-600">{spot.name}</span>
                              <button onClick={() => toggleSpotInclusion(spot, true)} className="bg-white text-blue-600 p-1.5 rounded-lg shadow-sm hover:bg-blue-50"><PlusCircle size={16}/></button>
                          </div>
                      ))}
                  </div>
              </div>
          )}
        </div>
      </div>
      
      <div className="absolute bottom-0 left-0 w-full z-20 bg-white/80 backdrop-blur border-t border-gray-200 p-2 pb-safe">
        <div className="flex justify-evenly items-center gap-2 max-w-md mx-auto">
            <button disabled={!isUnlocked} onClick={handlePinPlan} className="flex-1 flex flex-col items-center gap-1 p-2 text-gray-500 hover:text-blue-600 transition disabled:opacity-30"><Save size={20}/><span className="text-[10px] font-bold">保存</span></button>
            <button onClick={() => setIsPinListOpen(true)} className="flex-1 flex flex-col items-center gap-1 p-2 text-gray-500 hover:text-blue-600 transition"><BookOpen size={20}/><span className="text-[10px] font-bold">読込</span></button>
            <button onClick={handleAutoGenerate} disabled={isProcessing} className="bg-blue-600 text-white w-14 h-14 rounded-full shadow-lg shadow-blue-200 hover:scale-105 transition flex items-center justify-center -mt-6 border-4 border-white">
                {isProcessing ? <Loader2 className="animate-spin"/> : <Sparkles size={24}/>}
            </button>
            <button onClick={() => recalculateRoute(timeline)} disabled={!isUnlocked || isProcessing} className="flex-1 flex flex-col items-center gap-1 p-2 text-gray-500 hover:text-blue-600 transition disabled:opacity-30"><RefreshCw size={20}/><span className="text-[10px] font-bold">再計算</span></button>
            <button onClick={() => setShowSettings(true)} className="flex-1 flex flex-col items-center gap-1 p-2 text-gray-500 hover:text-blue-600 transition"><Settings size={20}/><span className="text-[10px] font-bold">設定</span></button>
        </div>
      </div>
    </div>
  );
}