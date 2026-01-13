"use client";

import { useState, useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { 
  MapPin, Car, Clock, X, Settings, Loader2, Sparkles, MinusCircle, RefreshCw, BedDouble, 
  ExternalLink, Calendar, Edit3, Train, Plane, Ship, Footprints, Zap, 
  Image as ImageIcon, FileText, Link as LinkIcon, Camera, Upload, Search,
  Save, BookOpen, Trash2, PlusCircle, MapPinned, GripVertical, MoreHorizontal, ArrowRight
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const RAKUTEN_AFFILIATE_ID = "4fcc24e4.174bb117.4fcc24e5.5b178353"; 

interface Props {
  spots: any[];
  onRemove: (spot: any) => void;
  onUpdateSpots: (newSpots: any[]) => void;
  roomId: string;
  travelDays?: number;
}

const TRANSPORT_MODES = [
  { id: 'car', icon: <Car size={14}/>, label: 'DRIVE', googleMode: 'driving' },
  { id: 'train', icon: <Train size={14}/>, label: 'TRAIN', googleMode: 'transit' },
  { id: 'walk', icon: <Footprints size={14}/>, label: 'WALK', googleMode: 'walking' },
  { id: 'shinkansen', icon: <Zap size={14}/>, label: 'EXPRESS', googleMode: 'transit' },
  { id: 'plane', icon: <Plane size={14}/>, label: 'FLIGHT', googleMode: 'transit' },
  { id: 'ship', icon: <Ship size={14}/>, label: 'FERRY', googleMode: 'transit' },
];

export default function PlanView({ spots, onRemove, onUpdateSpots, roomId, travelDays = 1 }: Props) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [unusedSpots, setUnusedSpots] = useState<any[]>([]); 
  const [routeGeoJSON, setRouteGeoJSON] = useState<any>(null);
  const [isPlanGenerated, setIsPlanGenerated] = useState(false);
  
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

  const [editItem, setEditItem] = useState<{index: number, type: 'spot' | 'travel', data: any} | null>(null);
  const [showScreenshotMode, setShowScreenshotMode] = useState(false);

  const maxSpotDay = Math.max(...spots.map(s => s.day || 0));
  const displayDays = Math.max(travelDays, maxSpotDay, 1);

  const [selectedDay, setSelectedDay] = useState<number>(1);
  const activeDaySpots = spots.filter(s => (s.status === 'confirmed') && (s.day === selectedDay || s.day === 0));

  const hasHotel = spots.some(s => s.is_hotel || s.name.includes('ホテル') || s.name.includes('旅館'));

  // アフィリエイトリンク生成
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
          const targetUrl = `https://hotel.travel.rakuten.co.jp/hotelinfo/plan/${spot.id}?f_teikei=&f_heya_su=1&f_otona_su=2&f_nen1=${y1}&f_tuki1=${m1}&f_hi1=${d1}&f_nen2=${y2}&f_tuki2=${m2}&f_hi2=${d2}&f_sort=min_charge`;
          if (RAKUTEN_AFFILIATE_ID) {
              return `https://hb.afl.rakuten.co.jp/hgc/${RAKUTEN_AFFILIATE_ID}/?pc=${encodeURIComponent(targetUrl)}&m=${encodeURIComponent(targetUrl)}`;
          }
          return targetUrl;
      }
      return spot.url || `https://search.travel.rakuten.co.jp/ds/hotel/search?f_teikei=&f_query=${encodeURIComponent(spot.name)}`;
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
          const timestamp = Math.floor(date.getTime() / 1000);
          return `http://googleusercontent.com/maps.google.com/?saddr=${encodeURIComponent(prevSpot)}&daddr=${encodeURIComponent(nextSpot)}&travelmode=${mode}&departure_time=${timestamp}`;
      }
      return null;
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !editItem) return;
      const reader = new FileReader();
      reader.onloadend = () => {
          setEditItem({
              ...editItem,
              data: { ...editItem.data, image: reader.result as string }
          });
      };
      reader.readAsDataURL(file);
  };

  const calculateSchedule = (currentTimeline: any[]) => {
      let currentTime = new Date(`2000-01-01T${startTime}:00`);
      const newTimeline = currentTimeline.map((item, index) => {
          const newItem = { ...item };
          if (item.type === 'travel') {
              const duration = item.duration_min || 0;
              currentTime = new Date(currentTime.getTime() + duration * 60000);
          } else if (item.type === 'spot') {
              newItem.arrival = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              let stayTime = item.stay_min || item.spot.stay_time || 60;
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
    if (hasHotel) {
        setIsUnlocked(true);
    } else {
        const unlocked = typeof window !== 'undefined' ? localStorage.getItem(`rh_unlocked_${roomId}`) : null;
        if (unlocked) setIsUnlocked(true);
        else setIsUnlocked(false);
    }
  }, [spots, roomId, hasHotel]);

  useEffect(() => {
    if (roomId && isPlanGenerated) {
        const storageKey = `rh_plan_${roomId}_day_${selectedDay}`;
        localStorage.setItem(storageKey, JSON.stringify({ timeline, unusedSpots, routeGeoJSON, updatedAt: Date.now() }));
    }
  }, [timeline, unusedSpots, routeGeoJSON, isPlanGenerated, roomId, selectedDay]);

  useEffect(() => {
    if (roomId) {
        const storageKey = `rh_plan_${roomId}_day_${selectedDay}`;
        const savedPlan = localStorage.getItem(storageKey);
        if (savedPlan) {
            try {
                const data = JSON.parse(savedPlan);
                setTimeline(Array.isArray(data.timeline) ? data.timeline : []);
                setUnusedSpots(Array.isArray(data.unusedSpots) ? data.unusedSpots : []);
                setRouteGeoJSON(data.routeGeoJSON || null);
                setIsPlanGenerated(true);
                return;
            } catch (e) { console.error("Restore error", e); }
        }
        if (activeDaySpots.length > 0) {
            setUnusedSpots(activeDaySpots);
            setTimeline([]);
            setRouteGeoJSON(null);
            setIsPlanGenerated(false);
        } else {
            setUnusedSpots([]);
            setTimeline([]);
            setRouteGeoJSON(null);
            setIsPlanGenerated(false);
        }
    }
  }, [roomId, selectedDay]); 

  useEffect(() => {
      if (!isPlanGenerated && activeDaySpots.length > 0) {
          setUnusedSpots(activeDaySpots);
      }
  }, [JSON.stringify(activeDaySpots), isPlanGenerated]);

  const fetchPinnedPlans = async () => {
      const { data } = await supabase.from('pinned_plans').select('*').eq('room_id', roomId).order('created_at', { ascending: false });
      if (data) setPinnedPlans(data);
  };
  useEffect(() => { if (isPinListOpen) fetchPinnedPlans(); }, [isPinListOpen]);

  const handlePinPlan = async () => {
      if (!isPlanGenerated) return;
      const title = prompt("プラン名を入力して保存:", `Day ${selectedDay} のプラン`);
      if (!title) return;
      const planData = { timeline, unusedSpots, routeGeoJSON, day: selectedDay };
      const { error } = await supabase.from('pinned_plans').insert([{ room_id: roomId, title: title, plan_data: planData }]);
      if (!error) alert("プランを保存しました！");
      else alert("保存に失敗しました");
  };

  const handleLoadPin = (plan: any) => {
      if (!confirm(`「${plan.title}」を復元しますか？\n現在の編集内容は上書きされます。`)) return;
      const data = plan.plan_data;
      setTimeline(calculateSchedule(data.timeline || []));
      setUnusedSpots(data.unusedSpots || []);
      setRouteGeoJSON(data.routeGeoJSON);
      setIsPlanGenerated(true);
      setIsPinListOpen(false);
  };
  
  const handleDeletePin = async (id: string) => {
      if(!confirm("削除しますか？")) return;
      await supabase.from('pinned_plans').delete().eq('id', id);
      fetchPinnedPlans();
  };

  const handleAutoGenerate = async () => {
    if (activeDaySpots.length < 2) return alert("この日のスポットが2つ以上必要です");
    setIsProcessing(true);
    try {
      const targetSpots = [...activeDaySpots].sort((a, b) => (b.votes || 0) - (a.votes || 0));
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
      setUnusedSpots(data.unused_spots || []);
      setRouteGeoJSON(data.route_geometry);
      setIsPlanGenerated(true);
      setShowSettings(false);
      
      const newCount = optimizeCount + 1;
      setOptimizeCount(newCount);
      supabase.from('rooms').update({ optimize_count: newCount }).eq('id', roomId).then();
    } catch (e: any) { alert(`エラー: ${e.message}`); } finally { setIsProcessing(false); }
  };

  const onDragStart = (e: React.DragEvent, index: number) => { setDraggedItemIndex(index); };
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  
  const onDrop = (e: React.DragEvent, dropIndex: number) => {
    if (draggedItemIndex === null || draggedItemIndex === dropIndex) return;
    const timelineIndices = timeline.map((item, i) => item.type === 'spot' ? i : -1).filter(i => i !== -1);
    if (!timelineIndices.includes(draggedItemIndex) || !timelineIndices.includes(dropIndex)) return;

    const newTimeline = [...timeline];
    
    // スポットの並べ替えロジック
    const spotsOnly = timeline.filter(t => t.type === 'spot');
    const fromSpotIndex = spotsOnly.findIndex(s => s.spot.name === timeline[draggedItemIndex].spot.name);
    const toSpotIndex = spotsOnly.findIndex(s => s.spot.name === timeline[dropIndex].spot.name);
    
    const [movedSpot] = spotsOnly.splice(fromSpotIndex, 1);
    spotsOnly.splice(toSpotIndex, 0, movedSpot);
    
    const reconstructedTimeline: any[] = [];
    spotsOnly.forEach((spotItem, i) => {
        reconstructedTimeline.push(spotItem);
        if (i < spotsOnly.length - 1) {
            reconstructedTimeline.push({ type: 'travel', duration_min: 30, transport_mode: 'car' });
        }
    });

    setTimeline(calculateSchedule(reconstructedTimeline));
    setDraggedItemIndex(null);
  };

  const handleEditSave = () => {
      if (!editItem) return;
      const newTimeline = [...timeline];
      newTimeline[editItem.index] = editItem.data;
      setTimeline(calculateSchedule(newTimeline));
      setEditItem(null);
  };

  const handleTimeChange = (index: number, value: string) => {
      const val = parseInt(value, 10);
      if (isNaN(val)) return;
      const newTimeline = [...timeline];
      if (newTimeline[index].type === 'travel') {
          newTimeline[index].duration_min = val;
      } else {
          newTimeline[index].stay_min = val;
          if(newTimeline[index].spot) newTimeline[index].spot.stay_time = val;
      }
      setTimeline(calculateSchedule(newTimeline));
  };

  const handleTransportChange = (index: number, mode: string) => {
      const newTimeline = [...timeline];
      newTimeline[index].transport_mode = mode;
      setTimeline(calculateSchedule(newTimeline));
  };

  const toggleSpotInclusion = (spot: any, isAdding: boolean) => {
    setSelectedMapSpot(null); 
    if (isAdding) {
        setUnusedSpots(prev => prev.filter(s => s.name !== spot.name));
        const newTimeline = [...timeline, { type: 'travel', duration_min: 30, transport_mode: 'car' }, { type: 'spot', spot, stay_min: 60 }];
        if(newTimeline[0].type === 'travel') newTimeline.shift();
        setTimeline(calculateSchedule(newTimeline));
    } else {
        setUnusedSpots(prev => [...prev, spot]);
        const newTimeline = timeline.filter(t => t.type !== 'spot' || t.spot.name !== spot.name);
        const cleanTimeline = newTimeline.filter((t, i) => {
             if (t.type === 'spot') return true;
             if (i === newTimeline.length - 1) return false;
             if (i > 0 && newTimeline[i-1].type === 'travel') return false;
             return true;
        });
        setTimeline(calculateSchedule(cleanTimeline));
    }
  };

  useEffect(() => {
    mapboxgl.accessToken = MAPBOX_TOKEN;
    if (!map.current && mapContainer.current) {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/dark-v11', // ダークモードマップ
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
                // ネオンブルーの番号ピン
                el.innerHTML = `<div style="background-color:#0ea5e9; width:28px; height:28px; border-radius:8px; display:flex; align-items:center; justify-content:center; color:white; font-weight:bold; border:2px solid #0f172a; box-shadow:0 0 10px #0ea5e9; font-family:monospace; font-size:14px;">${i + 1}</div>`;
                el.onclick = (e) => { e.stopPropagation(); setSelectedMapSpot({ spot, type: 'active' }); };
                new mapboxgl.Marker(el).setLngLat(spot.coordinates).addTo(map.current!);
                bounds.extend(spot.coordinates);
            });
            unusedSpots.forEach((spot) => {
                const el = document.createElement('div');
                el.className = 'marker-plan-map';
                el.innerHTML = `<div style="background-color:#475569; width:12px; height:12px; border-radius:50%; border:2px solid #0f172a;"></div>`;
                el.onclick = (e) => { e.stopPropagation(); setSelectedMapSpot({ spot, type: 'unused' }); };
                new mapboxgl.Marker(el).setLngLat(spot.coordinates).addTo(map.current!);
                bounds.extend(spot.coordinates);
            });
            if (routeGeoJSON) {
                const sourceId = 'route';
                if (!map.current.getSource(sourceId)) {
                    map.current.addSource(sourceId, { type: 'geojson', data: routeGeoJSON });
                    map.current.addLayer({ id: sourceId, type: 'line', source: sourceId, layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#0ea5e9', 'line-width': 3, 'line-opacity': 0.8, 'line-blur': 1 } });
                } else {
                    (map.current.getSource(sourceId) as mapboxgl.GeoJSONSource).setData(routeGeoJSON);
                }
            }
            if (!bounds.isEmpty()) map.current.fitBounds(bounds, { padding: 60, duration: 1000 });
        };
        if (map.current.isStyleLoaded()) updateMap();
        else map.current.once('styledata', updateMap);
    }
  }, [timeline, unusedSpots, routeGeoJSON]);

  // --- スクリーンショットモード (シンプル&スタイリッシュ) ---
  if (showScreenshotMode) {
      let spotCounter = 0;
      return (
          <div className="fixed inset-0 z-[100] bg-zinc-900 text-white overflow-y-auto">
              <div className="p-8 max-w-md mx-auto min-h-screen bg-zinc-950 border-x border-zinc-800">
                  <div className="flex justify-between items-end mb-12 pb-6 border-b border-zinc-800">
                      <div>
                          <p className="text-xs font-mono text-cyan-400 mb-2">/// TRAVEL LOG</p>
                          <h1 className="text-4xl font-black text-white tracking-tighter">Day {selectedDay}</h1>
                      </div>
                      <button onClick={() => setShowScreenshotMode(false)} className="bg-zinc-800 px-4 py-2 rounded-lg font-bold text-xs text-zinc-400 hover:text-white">CLOSE</button>
                  </div>
                  <div className="space-y-0 relative pl-4">
                      {/* Timeline Line */}
                      <div className="absolute left-[19px] top-4 bottom-4 w-[2px] bg-gradient-to-b from-cyan-500/50 to-purple-500/20 z-0"></div>
                      
                      {timeline.map((item, i) => {
                          if (item.type === 'spot') {
                              spotCounter++;
                              return (
                                  <div key={i} className="relative z-10 mb-12 pl-12 break-inside-avoid">
                                      <div className="absolute left-0 top-1 w-10 h-10 bg-zinc-900 rounded-xl flex items-center justify-center font-mono font-bold text-lg text-cyan-400 border-2 border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
                                          {String(spotCounter).padStart(2, '0')}
                                      </div>
                                      <div>
                                          <div className="flex items-center gap-3 mb-2">
                                              <span className="text-2xl font-black text-white tracking-tight">{item.arrival}</span>
                                              <ArrowRight size={14} className="text-zinc-600"/>
                                              <span className="text-sm font-bold text-zinc-500">{item.departure}</span>
                                          </div>
                                          <h3 className="text-lg font-bold text-zinc-200 leading-snug mb-2">{item.spot.name}</h3>
                                          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-zinc-900 border border-zinc-800 rounded-md text-xs font-mono text-zinc-400">
                                              <Clock size={12}/> {item.stay_min} MIN
                                          </div>
                                      </div>
                                  </div>
                              );
                          } else if (item.type === 'travel') {
                              const mode = TRANSPORT_MODES.find(m => m.id === (item.transport_mode || 'car')) || TRANSPORT_MODES[0];
                              return (
                                  <div key={i} className="relative z-10 mb-12 pl-16 flex items-center gap-4 text-zinc-500 font-mono text-xs">
                                      <div className="bg-zinc-900 p-2 rounded-lg border border-zinc-800 text-zinc-400">{mode.icon}</div>
                                      <span className="tracking-widest">{item.duration_min} MIN TRANSIT</span>
                                  </div>
                              );
                          }
                      })}
                  </div>
                  <div className="mt-20 pt-8 border-t border-zinc-800 flex justify-between items-center text-zinc-600 font-mono text-[10px]">
                      <span>GENERATED BY ROUTE HACKER</span>
                      <span>{new Date().toLocaleDateString()}</span>
                  </div>
              </div>
          </div>
      );
  }

  // --- メイン描画 (Dark Tech UI) ---
  let spotCounter = 0;

  return (
    <div className="flex flex-col h-full bg-zinc-950 relative font-sans text-zinc-200">
      
      {/* 編集モーダル (Dark Glass) */}
      {editItem && (
          <div className="absolute inset-0 z-[60] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
              <div className="bg-zinc-900/90 w-full max-w-sm rounded-2xl p-6 shadow-[0_0_40px_rgba(0,0,0,0.5)] border border-zinc-800 space-y-6">
                  <div className="flex justify-between items-center border-b border-zinc-800 pb-4">
                      <h3 className="text-lg font-bold text-white flex items-center gap-2"><Edit3 size={18} className="text-cyan-400"/> EDIT DETAILS</h3>
                      <button onClick={() => setEditItem(null)} className="p-1 bg-zinc-800 rounded-full text-zinc-400 hover:text-white"><X size={16}/></button>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                        <label className="text-[10px] font-bold text-zinc-500 mb-1 flex items-center gap-1 uppercase tracking-wider"><LinkIcon size={10}/> Link URL</label>
                        <input type="text" value={editItem.data.url || ''} onChange={(e) => setEditItem({...editItem, data: {...editItem.data, url: e.target.value}})} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-sm outline-none focus:border-cyan-500 text-white placeholder-zinc-700 transition"/>
                    </div>
                    
                    <div>
                        <label className="text-[10px] font-bold text-zinc-500 mb-2 flex items-center gap-1 uppercase tracking-wider"><ImageIcon size={10}/> Photo</label>
                        {editItem.data.image ? (
                            <div className="relative h-32 w-full rounded-lg overflow-hidden group border border-zinc-800">
                                <img src={editItem.data.image} alt="preview" className="w-full h-full object-cover opacity-80"/>
                                <button onClick={() => setEditItem({...editItem, data: {...editItem.data, image: null}})} className="absolute top-2 right-2 bg-black/80 text-white p-1.5 rounded-md hover:bg-red-500 transition"><Trash2 size={14}/></button>
                            </div>
                        ) : (
                            <label className="flex flex-col items-center justify-center h-24 border-2 border-dashed border-zinc-800 rounded-lg cursor-pointer hover:bg-zinc-800/50 hover:border-zinc-700 transition group">
                                <Upload size={20} className="text-zinc-600 group-hover:text-cyan-400 mb-1"/>
                                <span className="text-xs font-bold text-zinc-500 group-hover:text-zinc-300">Upload Image</span>
                                <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden"/>
                            </label>
                        )}
                    </div>

                    <div>
                        <label className="text-[10px] font-bold text-zinc-500 mb-1 flex items-center gap-1 uppercase tracking-wider"><FileText size={10}/> Memo</label>
                        <textarea value={editItem.data.note || ''} onChange={(e) => setEditItem({...editItem, data: {...editItem.data, note: e.target.value}})} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-sm outline-none focus:border-cyan-500 text-white placeholder-zinc-700 h-24 resize-none" placeholder="Write a note..."/>
                    </div>
                  </div>

                  <button onClick={handleEditSave} className="w-full bg-cyan-600 text-black py-3 rounded-lg font-black text-sm hover:bg-cyan-500 transition shadow-[0_0_15px_rgba(8,145,178,0.4)]">SAVE CHANGES</button>
              </div>
          </div>
      )}

      {/* 設定モーダル */}
      {showSettings && (
          <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-md p-6 flex flex-col animate-in slide-in-from-bottom-10">
              <div className="flex justify-between items-center mb-8 border-b border-zinc-800 pb-4">
                  <h2 className="text-2xl font-black text-white tracking-tight font-mono">SYSTEM CONFIG</h2>
                  <button onClick={() => setShowSettings(false)} className="p-2 bg-zinc-800 rounded-full hover:bg-zinc-700 transition"><X size={20}/></button>
              </div>
              <div className="space-y-8 flex-1">
                  <div className="grid grid-cols-2 gap-6">
                      <div><label className="block text-xs font-bold text-cyan-500 mb-2 font-mono">START TIME</label><input type="time" value={startTime} onChange={(e)=>setStartTime(e.target.value)} className="w-full p-4 bg-zinc-900 rounded-xl font-mono font-bold text-xl text-white outline-none border border-zinc-800 focus:border-cyan-500 transition"/></div>
                      <div><label className="block text-xs font-bold text-fuchsia-500 mb-2 font-mono">END TIME</label><input type="time" value={endTime} onChange={(e)=>setEndTime(e.target.value)} className="w-full p-4 bg-zinc-900 rounded-xl font-mono font-bold text-xl text-white outline-none border border-zinc-800 focus:border-fuchsia-500 transition"/></div>
                  </div>
                  <button onClick={handleAutoGenerate} className="w-full bg-white text-black py-4 rounded-xl font-black text-lg shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:scale-[1.02] transition flex items-center justify-center gap-2"><Sparkles size={20}/> RE-GENERATE ROUTE</button>
              </div>
          </div>
      )}

      {/* マップ表示エリア */}
      <div className="h-[38%] w-full relative shrink-0 shadow-2xl z-10 rounded-b-[2rem] overflow-hidden border-b border-zinc-800">
        <div ref={mapContainer} className="w-full h-full" />
        
        {/* 日程タブ */}
        <div className="absolute top-4 left-0 right-0 overflow-x-auto no-scrollbar flex gap-3 z-10 px-4 pb-2 snap-x">
            {Array.from({ length: displayDays }).map((_, i) => (
                <button 
                    key={i} 
                    onClick={() => { setSelectedDay(i + 1); setIsPlanGenerated(false); setRouteGeoJSON(null); }}
                    className={`snap-center px-5 py-2 rounded-md text-xs font-bold whitespace-nowrap shadow-lg transition-all active:scale-95 font-mono border ${selectedDay === i + 1 ? 'bg-cyan-950/80 border-cyan-500 text-cyan-400 backdrop-blur-md' : 'bg-black/60 border-zinc-700 text-zinc-500 hover:bg-zinc-900'}`}
                >
                    DAY {String(i + 1).padStart(2, '0')}
                </button>
            ))}
        </div>
        
        {/* スクショボタン */}
        {isPlanGenerated && (
            <button onClick={() => setShowScreenshotMode(true)} className="absolute bottom-4 right-4 bg-black/80 backdrop-blur-md text-white px-4 py-2 rounded-full font-bold shadow-lg text-xs flex items-center gap-2 border border-zinc-700 hover:bg-zinc-800 transition">
                <Camera size={14}/> VIEW LOG
            </button>
        )}
      </div>

      {/* タイムラインリストエリア */}
      <div className="flex-1 overflow-y-auto bg-zinc-950 relative pb-28 pt-4"> 
        {!isPlanGenerated ? (
             <div className="flex flex-col items-center justify-center h-full text-center p-8 space-y-6">
                 <div className="w-24 h-24 bg-zinc-900 rounded-full shadow-[0_0_30px_rgba(0,0,0,0.8)] border border-zinc-800 flex items-center justify-center"><Sparkles size={40} className="text-cyan-400 animate-pulse"/></div>
                 <div>
                    <h2 className="text-2xl font-black text-white mb-2 tracking-tight">DAY {selectedDay} PLAN</h2>
                    <p className="text-sm text-zinc-500 font-mono">TARGETS: {activeDaySpots.length} SPOTS</p>
                 </div>
                 <button onClick={handleAutoGenerate} disabled={activeDaySpots.length < 2 || isProcessing} className="w-full max-w-xs bg-cyan-600 text-black py-4 rounded-xl font-black shadow-[0_0_20px_rgba(8,145,178,0.3)] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-cyan-500 transition active:scale-95 text-sm flex items-center justify-center gap-2">
                    {isProcessing ? <Loader2 className="animate-spin"/> : 'INITIATE ROUTE'}
                 </button>
             </div>
        ) : (
            <div className={`relative px-4 py-4 space-y-0 ${!isUnlocked ? 'filter blur-sm select-none pointer-events-none' : ''}`}>
              
              {/* タイムラインの線 (Glowing Line) */}
              <div className="absolute left-[34px] top-6 bottom-6 w-0.5 bg-zinc-800 z-0 rounded-full">
                  <div className="absolute top-0 bottom-0 left-0 right-0 bg-gradient-to-b from-cyan-500 via-purple-500 to-transparent opacity-50"></div>
              </div>

              {timeline?.map((item, i) => {
                if (item.type === 'spot') {
                  spotCounter++;
                  const isHotelSpot = item.spot.is_hotel;
                  return (
                    <div 
                        key={`spot-${i}`} 
                        className="relative group mb-8 z-10 pl-12 select-none" 
                        draggable={isUnlocked} 
                        onDragStart={(e) => onDragStart(e, i)} 
                        onDragOver={onDragOver} 
                        onDrop={(e) => onDrop(e, i)}
                    >
                      {/* ドラッグハンドル */}
                      <div className="absolute left-0 top-6 text-zinc-600 cursor-grab active:cursor-grabbing p-1 hover:text-cyan-400 transition">
                          <GripVertical size={16}/>
                      </div>

                      {/* 番号バッジ (Neon Style) */}
                      <div className={`absolute left-[20px] top-6 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black shadow-lg border-2 z-20 ${isHotelSpot ? 'bg-orange-900/80 border-orange-500 text-orange-400' : 'bg-cyan-950/80 border-cyan-500 text-cyan-400'}`}>
                        {isHotelSpot ? <BedDouble size={14}/> : String(Math.floor(i/2) + 1).padStart(2, '0')}
                      </div>
                      
                      {/* スポットカード (Dark Card) */}
                      <div className={`bg-zinc-900/80 backdrop-blur-sm p-4 rounded-xl shadow-lg border relative overflow-hidden transition-all hover:border-cyan-500/50 ${isHotelSpot ? 'border-orange-500/30' : 'border-zinc-800'} ${draggedItemIndex === i ? 'opacity-50 scale-95 border-dashed border-cyan-500' : ''}`}>
                        <div className="flex justify-between items-start gap-3">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-baseline gap-2 mb-1">
                                    <span className="text-lg font-black text-white font-mono leading-none tracking-tight">{item.arrival}</span>
                                    <span className="text-xs font-bold text-zinc-500">- {item.departure}</span>
                                </div>
                                <span className="font-bold text-zinc-300 text-sm line-clamp-1">{item.spot.name}</span>
                                {item.is_overnight && <span className="inline-block mt-2 px-2 py-0.5 bg-indigo-900/50 text-indigo-300 border border-indigo-500/30 rounded text-[10px] font-bold">OVERNIGHT</span>}
                            </div>
                            
                            {/* アクションボタン */}
                            <div className="flex flex-col gap-1">
                                <button onClick={() => setEditItem({index: i, type: 'spot', data: item})} className="p-2 bg-zinc-800 rounded-lg text-zinc-400 hover:text-cyan-400 hover:bg-zinc-700 transition"><Edit3 size={14}/></button>
                                {isUnlocked && <button onClick={() => toggleSpotInclusion(item.spot, false)} className="p-2 bg-zinc-800 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-zinc-700 transition"><MinusCircle size={14}/></button>}
                            </div>
                        </div>

                        {/* 滞在時間入力 */}
                        {!item.is_overnight && (
                            <div className="mt-3 flex items-center gap-2 bg-black/30 p-1.5 rounded-lg w-max border border-zinc-800">
                                 <Clock size={12} className="text-zinc-500"/>
                                 <input type="number" value={item.stay_min || item.spot.stay_time} onChange={(e) => handleTimeChange(i, e.target.value)} className="w-8 bg-transparent text-center text-xs font-bold outline-none text-zinc-300 font-mono"/>
                                 <span className="text-[10px] font-bold text-zinc-600">MIN</span>
                            </div>
                        )}
                        
                        {/* 楽天トラベルリンク */}
                        {isHotelSpot && (
                            <a href={getAffiliateUrl(item.spot)} target="_blank" className="mt-3 block w-full text-center bg-gradient-to-r from-orange-600 to-red-600 text-white text-xs font-bold py-2.5 rounded-lg shadow-md hover:brightness-110 transition flex items-center justify-center gap-1 active:scale-95">
                                <Search size={14}/> CHECK AVAILABILITY
                            </a>
                        )}

                        {/* メタデータ表示 */}
                        {(item.url || item.image || item.note) && (
                            <div className="mt-3 pt-3 border-t border-zinc-800 flex gap-2 flex-wrap">
                                {item.url && <a href={item.url} target="_blank" className="text-cyan-500 bg-cyan-950/30 border border-cyan-900 p-1.5 rounded hover:text-cyan-400 transition"><LinkIcon size={14}/></a>}
                                {item.image && (
                                    <div className="w-full h-32 rounded-lg overflow-hidden border border-zinc-700 mt-1 shadow-inner">
                                        <img src={item.image} alt="uploaded" className="w-full h-full object-cover"/>
                                    </div>
                                )}
                                {item.note && <div className="w-full text-xs text-zinc-400 bg-zinc-950/50 p-3 rounded-lg border border-zinc-800 font-mono">{item.note}</div>}
                            </div>
                        )}
                      </div>
                    </div>
                  );
                } 
                // --- 移動 ---
                else if (item.type === 'travel') {
                  const mode = TRANSPORT_MODES.find(m => m.id === (item.transport_mode || 'car')) || TRANSPORT_MODES[0];
                  const mapLink = getDirectionsUrl(i);

                  return (
                    <div key={`travel-${i}`} className="pl-12 mb-8 relative group select-none">
                        <div className="flex items-center gap-2">
                            {/* 移動手段チップ (Tech Chip) */}
                            <div className="bg-black border border-zinc-800 px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-3 shadow-sm text-zinc-500 group-hover:border-zinc-600 transition font-mono">
                                <div className="cursor-pointer flex items-center gap-2 hover:text-cyan-400 transition" onClick={() => {
                                    const nextModeIdx = (TRANSPORT_MODES.findIndex(m => m.id === mode.id) + 1) % TRANSPORT_MODES.length;
                                    handleTransportChange(i, TRANSPORT_MODES[nextModeIdx].id);
                                }}>
                                    {mode.icon}
                                    <span className="uppercase">{mode.label}</span>
                                </div>
                                <span className="text-zinc-700">|</span>
                                <input 
                                    type="number" 
                                    value={item.duration_min} 
                                    onChange={(e) => handleTimeChange(i, e.target.value)}
                                    className="w-8 bg-transparent text-center outline-none font-bold text-zinc-300"
                                />
                                <span className="text-[10px]">MIN</span>
                            </div>
                            
                            {/* Googleマップリンク */}
                            {mapLink && (
                                <a href={mapLink} target="_blank" className="p-1.5 bg-zinc-900 text-zinc-400 rounded-md hover:text-green-400 hover:border-green-900 border border-zinc-800 transition">
                                    <MapPinned size={14} />
                                </a>
                            )}

                            <button onClick={() => setEditItem({index: i, type: 'travel', data: item})} className="text-zinc-600 hover:text-cyan-400 p-1 opacity-0 group-hover:opacity-100 transition"><Edit3 size={14}/></button>
                        </div>
                    </div>
                  );
                }
              })}

              {/* 未使用スポット */}
              {unusedSpots.length > 0 && (
                  <div className="mt-12 pt-8 border-t border-zinc-800">
                      <h3 className="text-xs font-bold text-zinc-600 mb-4 flex items-center gap-2 uppercase tracking-widest"><Trash2 size={12}/> Standby Spots</h3>
                      <div className="space-y-3">
                          {unusedSpots.map((spot, i) => (
                              <div key={`unused-${i}`} className="bg-zinc-900/50 p-3 rounded-xl border border-zinc-800 flex justify-between items-center opacity-60 hover:opacity-100 transition shadow-sm hover:border-zinc-600">
                                  <span className="text-xs font-bold text-zinc-400 truncate flex-1">{spot.name}</span>
                                  <button onClick={() => toggleSpotInclusion(spot, true)} className="bg-zinc-800 text-cyan-400 p-1.5 rounded-lg shadow hover:bg-zinc-700 transition"><PlusCircle size={16}/></button>
                              </div>
                          ))}
                      </div>
                  </div>
              )}
            </div>
        )}
      </div>
      
      {/* フッター操作ドック (Cyber Dock) */}
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-20 flex gap-4">
        <div className="bg-zinc-900/90 backdrop-blur-md rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] border border-zinc-700 p-2 flex items-center gap-1 ring-1 ring-white/5">
            <button disabled={!isUnlocked} onClick={handlePinPlan} className="p-3 text-zinc-400 hover:text-cyan-400 hover:bg-zinc-800 rounded-xl transition disabled:opacity-30"><Save size={20}/></button>
            <button onClick={() => setIsPinListOpen(true)} className="p-3 text-zinc-400 hover:text-cyan-400 hover:bg-zinc-800 rounded-xl transition"><BookOpen size={20}/></button>
            <div className="w-px h-6 bg-zinc-700 mx-1"></div>
            <button onClick={() => setTimeline(calculateSchedule(timeline))} disabled={!isUnlocked || isProcessing} className="p-3 text-zinc-400 hover:text-green-400 hover:bg-zinc-800 rounded-xl transition disabled:opacity-30"><RefreshCw size={20}/></button>
            <button onClick={() => setShowSettings(true)} className="p-3 text-zinc-400 hover:text-fuchsia-400 hover:bg-zinc-800 rounded-xl transition"><Settings size={20}/></button>
        </div>
        
        {/* 再生成ボタン */}
        <button onClick={handleAutoGenerate} disabled={isProcessing} className="bg-white text-black w-14 h-14 rounded-2xl shadow-[0_0_20px_rgba(255,255,255,0.3)] flex items-center justify-center hover:scale-105 transition active:scale-95 border-2 border-zinc-200">
            {isProcessing ? <Loader2 className="animate-spin text-black"/> : <Sparkles size={24} className="text-fuchsia-600"/>}
        </button>
      </div>

      {isPinListOpen && (
          <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-sm p-6 flex flex-col animate-in fade-in duration-200">
              <div className="flex justify-between items-center mb-6 border-b border-zinc-800 pb-4"><h2 className="text-xl font-black text-white flex items-center gap-2 font-mono">SAVED_DATA</h2><button onClick={() => setIsPinListOpen(false)} className="p-2 bg-zinc-800 rounded-full hover:bg-zinc-700 transition"><X size={20}/></button></div>
              <div className="flex-1 overflow-y-auto space-y-3 p-1">
                  {pinnedPlans.map((plan) => (
                      <div key={plan.id} className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl shadow-sm hover:border-cyan-500/50 transition flex justify-between items-center group cursor-pointer" onClick={() => handleLoadPin(plan)}>
                          <div className="flex-1">
                              <h3 className="font-bold text-zinc-200">{plan.title}</h3>
                              <p className="text-[10px] text-zinc-500 font-mono mt-1">{new Date(plan.created_at).toLocaleString()}</p>
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); handleDeletePin(plan.id); }} className="p-2 text-zinc-600 hover:text-red-500 hover:bg-zinc-800 rounded-lg transition"><Trash2 size={18}/></button>
                      </div>
                  ))}
              </div>
          </div>
      )}
    </div>
  );
}