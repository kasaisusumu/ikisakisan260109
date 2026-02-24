"use client";

import React, { useState, useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { ArrowLeft, Search, X, MapPin, Loader2, PenTool } from 'lucide-react';
import HotelListView from './HotelListView';

// 環境変数の取得
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Props {
  onClose: () => void;
}

// 距離計算ヘルパー
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; 
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

export default function WelcomeMapMode({ onClose }: Props) {
  // --- State ---
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  
  // ★追加: 詳細画面が開いているかどうかの状態
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // 検索関連
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const searchMarkersRef = useRef<mapboxgl.Marker[]>([]);

  // 描画関連
  const [isDrawing, setIsDrawing] = useState(false);
  const tempDrawCoords = useRef<number[][]>([]);
  const [initialSearchArea, setInitialSearchArea] = useState<any | null>(null);
  // HotelListView操作用
  const [focusLocation, setFocusLocation] = useState<{center: [number, number], zoom: number} | null>(null);

  // --- Mapbox Initialization ---
  useEffect(() => {
    if (!mapContainer.current) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [139.6917, 35.6895], // 東京デフォルト
      zoom: 13,
      pitch: 45,
      antialias: true
    });

    map.current.on('load', () => {
      if (!map.current) return;

      // 日本語化 & シールド非表示
      const style = map.current.getStyle();
      if (style && style.layers) {
          style.layers.forEach((layer) => {
              if (layer.type === 'symbol' && layer.id.includes('shield')) {
                  map.current?.setLayoutProperty(layer.id, 'visibility', 'none');
              }
              if (layer.type === 'symbol' && layer.layout && layer.layout['text-field']) {
                  map.current?.setLayoutProperty(layer.id, 'text-field', [
                      'coalesce', ['get', 'name_ja'], ['get', 'name']
                  ]);
              }
          });
      }

      // 描画用レイヤーの追加
      map.current.addSource('draw-source', { 
        type: 'geojson', 
        data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } } 
      });
      map.current.addLayer({ 
        id: 'draw-line', type: 'line', source: 'draw-source', 
        layout: { 'line-cap': 'round', 'line-join': 'round' }, 
        paint: { 'line-color': '#EF4444', 'line-width': 4, 'line-opacity': 0.8 } 
      });
      map.current.addLayer({ 
        id: 'draw-fill', type: 'fill', source: 'draw-source', 
        paint: { 'fill-color': '#EF4444', 'fill-opacity': 0.2 } 
      });

      // 3D建物
      const layers = map.current.getStyle().layers;
      const labelLayerId = layers?.find((layer) => layer.type === 'symbol' && layer.layout?.['text-field'])?.id;
      if(!map.current.getLayer('3d-buildings')) { 
        map.current.addLayer({ 
            'id': '3d-buildings', 
            'source': 'composite', 
            'source-layer': 'building', 
            'filter': ['==', 'extrude', 'true'], 
            'type': 'fill-extrusion', 
            'minzoom': 15, 
            'paint': { 
                'fill-extrusion-color': '#aaa', 
                'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.05, ['get', 'height']], 
                'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.05, ['get', 'min_height']], 
                'fill-extrusion-opacity': 0.6 
            } 
        }, labelLayerId); 
      }
    });

    return () => {
      map.current?.remove();
    };
  }, []);

  // --- Search Logic ---
  const handleSearch = async (overrideQuery?: string) => {
    const activeQuery = overrideQuery || query;
    if (!activeQuery) return;

    setIsSearching(true);
    try {
        let queryParams = `query=${encodeURIComponent(activeQuery)}`;
        if (map.current) {
            const { lng, lat } = map.current.getCenter();
            queryParams += `&lat=${lat}&lng=${lng}`;
        }

        const res = await fetch(`${API_BASE_URL}/api/search_places?${queryParams}`);
        if (res.ok) {
            const data = await res.json();
            if (data.results) {
                setSearchResults(data.results);
            }
        }
    } catch (e) {
        console.error("Search failed", e);
    } finally {
        setIsSearching(false);
    }
  };

  const handleSelectSuggestion = (suggestion: any) => {
    setQuery(suggestion.name || suggestion.text);
    setSearchResults([]);
    setIsFocused(false);

    if (suggestion.center) {
        // HotelListViewへ移動指示を出す
        setFocusLocation({ center: suggestion.center, zoom: 16 });
        
        // マーカー表示 (WelcomeMapMode側の地図にも表示)
        if (map.current) {
            map.current.flyTo({ center: suggestion.center, zoom: 16 });
            searchMarkersRef.current.forEach(m => m.remove());
            searchMarkersRef.current = [];
            const el = document.createElement('div');
            el.innerHTML = `<div style="width:24px; height:24px; background:#EF4444; border:3px solid white; border-radius:50%; box-shadow:0 4px 10px rgba(239,68,68,0.4);"></div>`;
            const marker = new mapboxgl.Marker({ element: el }).setLngLat(suggestion.center).addTo(map.current);
            searchMarkersRef.current.push(marker);
        }
    }
  };

  const resetSearchState = () => {
      setQuery("");
      setSearchResults([]);
      searchMarkersRef.current.forEach(m => m.remove());
      searchMarkersRef.current = [];
  };

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => { 
        if (query.trim()) { handleSearch(); } else { setSearchResults([]); } 
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [query]);


  // --- Drawing Logic ---
  const updateDrawSource = (coords: number[][]) => {
      if (!map.current) return;
      const source: any = map.current.getSource('draw-source');
      if (source) { 
          source.setData({ 
              type: 'Feature', 
              properties: {}, 
              geometry: { type: 'LineString', coordinates: coords } 
          }); 
      }
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
    }
  };

  const finishDrawing = () => {
    const coords = tempDrawCoords.current;
    if (coords.length < 3) { stopDrawing(); return; }
    
    // 範囲計算
    let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;
    coords.forEach(c => { 
        const [lng, lat] = c; 
        if (lng < minLng) minLng = lng; 
        if (lng > maxLng) maxLng = lng; 
        if (lat < minLat) minLat = lat; 
        if (lat > maxLat) maxLat = lat; 
    });
    
    const centerLat = (minLat + maxLat) / 2; 
    const centerLng = (minLng + maxLng) / 2;
    
    // 半径計算
    let radiusKm = (calculateDistance(centerLat, centerLng, maxLat, maxLng) / 2) * 1.1;
    if (radiusKm < 0.1) radiusKm = 0.5; 
    if (radiusKm > 5.0) radiusKm = 5.0; 
    
    setInitialSearchArea({ 
        latitude: centerLat, 
        longitude: centerLng, 
        radius: Number(radiusKm.toFixed(2)),
        polygon: coords 
    });
    
    stopDrawing();
  };

  // イベントハンドラ
  const onTouchStart = (e: any) => { if (!isDrawing) return; if (e.originalEvent.touches && e.originalEvent.touches.length > 1) return; if (e.originalEvent) e.originalEvent.preventDefault(); tempDrawCoords.current = [[e.lngLat.lng, e.lngLat.lat]]; updateDrawSource(tempDrawCoords.current); };
  const onTouchMove = (e: any) => { if (!isDrawing) return; if (e.originalEvent.touches && e.originalEvent.touches.length > 1) return; if (e.originalEvent) e.originalEvent.preventDefault(); tempDrawCoords.current.push([e.lngLat.lng, e.lngLat.lat]); updateDrawSource(tempDrawCoords.current); };
  const onTouchEnd = () => { if (!isDrawing) return; if (tempDrawCoords.current.length > 0) { finishDrawing(); } };
  
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


  // --- Render ---
  return (
    <div className="fixed inset-0 z-[9999] bg-slate-50 animate-in fade-in duration-300">
      
      {/* 1. 全画面Map Container (absolute inset-0) */}
      <div className="absolute inset-0 z-0">
        <div ref={mapContainer} className="w-full h-full" style={{ touchAction: isDrawing ? 'none' : 'auto' }} />
      </div>

      {/* 2. UI Overlay Layer */}
      <div className="absolute inset-0 z-10 pointer-events-none">
          
          {/* 左上: 戻るボタン */}
          {/* ★修正: z-30 に下げて、検索候補(z-50)より後ろにする */}
          <div className="absolute top-24 left-4 z-30 pointer-events-auto">
            <button 
              onClick={onClose}
              className="bg-white/90 backdrop-blur-md text-slate-800 px-4 py-3 rounded-full font-bold text-sm shadow-xl flex items-center gap-2 border border-slate-100 hover:bg-white transition active:scale-95"
            >
              <ArrowLeft size={18} />
              トップに戻る
            </button>
          </div>

          {/* 上部: 検索バー */}
          {/* ★修正: 詳細画面(isDetailOpen)が開いている時は隠す (opacity-0 & pointer-events-none) */}
          <div className={`absolute top-0 left-0 right-0 z-50 flex flex-col items-center pt-4 px-4 pointer-events-auto transition-all duration-300 ${isDetailOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
              <div className="bg-white/90 backdrop-blur-xl p-2 pr-4 rounded-[2rem] shadow-2xl flex items-center gap-2 border border-white/50 w-full max-w-md focus-within:ring-4 focus-within:ring-emerald-100/50">
                    <Search className="text-gray-400 ml-2" size={20}/>
                    
                    <div className="flex-1 relative h-10 overflow-hidden flex items-center min-w-0">
                        <input 
                            type="text" 
                            value={query} 
                            placeholder="場所やキーワードを検索..."
                            onFocus={() => setIsFocused(true)} 
                            onChange={(e) => { setQuery(e.target.value); }} 
                            className="w-full h-full bg-transparent outline-none text-gray-800 text-sm font-bold relative z-10 placeholder:text-gray-400" 
                        />
                    </div>
                    
                    {query && (
                        <button onClick={resetSearchState} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 transition shrink-0">
                            <X size={16}/>
                        </button>
                    )}
              </div>

              {/* 検索結果サジェスト */}
              {isFocused && searchResults.length > 0 && (
                <div className="mt-2 w-full max-w-md bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/50 overflow-hidden max-h-60 overflow-y-auto animate-in slide-in-from-top-2">
                  {searchResults.map((item) => (
                    <div key={item.id} onClick={() => handleSelectSuggestion(item)} className="p-4 hover:bg-emerald-50 border-b border-gray-100/50 flex items-start gap-3 cursor-pointer transition">
                      <div className="bg-gray-100 p-2 rounded-full mt-0.5 text-gray-500">
                        <MapPin size={16} />
                      </div>
                      <div className="overflow-hidden text-left">
                          <p className="font-bold text-sm text-gray-800 truncate">{item.name}</p>
                          <p className="text-[10px] text-gray-400 line-clamp-1">{item.place_name}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </div>

          {/* 右側: かこって検索ボタン */}
          {/* ★修正: 詳細画面時は隠す */}
          <div className={`absolute top-32 right-4 flex flex-col gap-3 pointer-events-auto transition-opacity duration-300 ${isDetailOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                <button 
                    onClick={() => isDrawing ? stopDrawing() : startDrawing()} 
                    className={`w-12 h-12 rounded-full shadow-xl font-bold transition-all duration-300 flex items-center justify-center border-2 ${isDrawing ? 'bg-red-500 border-red-400 text-white animate-pulse scale-110' : 'bg-white border-white text-gray-700 hover:scale-110'}`}
                    title="かこって検索"
                >
                    {isDrawing ? <X size={24}/> : <PenTool size={20}/>}
                </button>
                {isDrawing && <div className="absolute top-1 right-14 bg-black/80 backdrop-blur text-white px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap shadow-lg">囲んでエリア検索</div>}
          </div>

          {/* サイドバー (HotelListView) - 右寄せ & オーバーレイ */}
          {/* ★修正: 詳細が開いている時は z-index を上げて検索バー(z-50)より上にする */}
          <div className={`absolute right-0 top-0 bottom-0 w-full md:w-[400px] pointer-events-none flex flex-col justify-end md:justify-start transition-all duration-0 ${isDetailOpen ? 'z-[60]' : 'z-20'}`}>
              <div className="w-full h-[50vh] md:h-full bg-transparent pointer-events-auto flex flex-col">
                   <div className="flex-1 overflow-hidden relative bg-transparent md:bg-gray-50/90 md:backdrop-blur-md md:border-l md:border-gray-200 md:shadow-xl">
                        <div className="w-full h-full bg-gray-50 rounded-t-[2rem] md:rounded-none shadow-[0_-5px_20px_rgba(0,0,0,0.1)] md:shadow-none border-t border-gray-200 md:border-none overflow-hidden">
                            <HotelListView 
                                spots={[]}              
                                spotVotes={[]}          
                                currentUser="Guest"     
                                roomId="demo"           
                                onAutoSearch={() => {}} 
                                travelDays={1}
                                initialSearchArea={initialSearchArea} 
                                showLocationSearch={false} 
                                onAddSpot={() => alert("デモモードでは保存されません")}
                                focusLocation={focusLocation}
                                // ★追加: 詳細画面の開閉状態を親に通知
                                onDetailOpen={setIsDetailOpen}
                            />
                        </div>
                   </div>
              </div>
          </div>
      </div>
    </div>
  );
}