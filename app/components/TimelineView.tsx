"use client";

import { useMemo, useState } from 'react';
import { Clock, MapPin, Trash2, Car, Navigation, Play, Pause, StopCircle, Loader2 } from 'lucide-react';
import mapboxgl from 'mapbox-gl';

interface Props {
  spots: any[];
  onRemove: (index: number) => void;
  // 親から map の参照を受け取る
  mapRef: React.MutableRefObject<mapboxgl.Map | null>;
}

export default function TimelineView({ spots, onRemove, mapRef }: Props) {
  const [isPlaying, setIsPlaying] = useState(false);

  // 時間計算ロジック
  const timeline = useMemo(() => {
    let currentTime = 9 * 60; // 9:00 AM start
    return spots.map((spot, index) => {
      const startMin = currentTime;
      const stayTime = spot.stay_time || 90;
      const endMin = startMin + stayTime;
      const travelTime = 30; // 仮の移動時間
      currentTime = endMin + travelTime;

      return {
        ...spot,
        startTime: `${Math.floor(startMin/60).toString().padStart(2, '0')}:${(startMin%60).toString().padStart(2, '0')}`,
        endTime: `${Math.floor(endMin/60).toString().padStart(2, '0')}:${(endMin%60).toString().padStart(2, '0')}`,
        travelTime,
        isLast: index === spots.length - 1
      };
    });
  }, [spots]);

  // 3Dドローンツアー再生
  const startDroneTour = async () => {
    if (!mapRef.current || spots.length === 0) return;
    setIsPlaying(true);

    const map = mapRef.current;

    // 1. 3Dモードに切り替え
    map.easeTo({ pitch: 60, bearing: 0, duration: 1000 });

    // 2. 順番に巡回
    for (let i = 0; i < spots.length; i++) {
        const spot = spots[i];
        
        await new Promise<void>((resolve) => {
            map.flyTo({
                center: spot.coordinates,
                zoom: 17,
                speed: 0.5,
                curve: 1,
                pitch: 60,
                bearing: (i * 45) % 360, 
                essential: true
            });
            
            map.once('moveend', () => {
                setTimeout(resolve, 1500); // 滞在時間
            });
        });
    }

    // 3. 全体が見えるように戻す
    if (spots.length > 0) {
        const bounds = new mapboxgl.LngLatBounds();
        spots.forEach(s => bounds.extend(s.coordinates));
        map.fitBounds(bounds, { padding: 50, pitch: 0, bearing: 0 });
    }
    setIsPlaying(false);
  };

  if (spots.length === 0) {
    return (
        <div className="flex flex-col items-center justify-center h-full text-gray-400 p-8 text-center bg-slate-50">
          <div className="bg-white p-6 rounded-full shadow-sm mb-4">
              <MapPin size={48} className="text-blue-200" />
          </div>
          <h3 className="text-lg font-bold text-gray-600 mb-2">プランが空っぽです</h3>
          <p className="text-sm">マップや検索からスポットを追加して<br/>最高の旅程を作りましょう！</p>
        </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-4 pb-24 relative">
      
      {/* ヘッダー & 再生ボタン */}
      <div className="flex justify-between items-end mb-6 px-2 sticky top-0 bg-slate-50/95 backdrop-blur z-20 py-2 border-b border-gray-100">
        <div>
            <h2 className="text-2xl font-black text-gray-800">Day 1</h2>
            <p className="text-xs text-gray-500 font-bold">Total: {spots.length} Spots</p>
        </div>
        <button 
            onClick={startDroneTour}
            disabled={isPlaying}
            className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold shadow-md transition transform active:scale-95 ${isPlaying ? 'bg-gray-200 text-gray-400' : 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:shadow-lg'}`}
        >
            {isPlaying ? <Loader2 className="animate-spin" size={16}/> : <Play size={16} fill="currentColor"/>}
            {isPlaying ? 'ツアー中...' : '3Dツアー再生'}
        </button>
      </div>

      <div className="space-y-0 relative z-10">
        <div className="absolute left-[27px] top-4 bottom-4 w-0.5 bg-gray-200 z-0"></div>

        {timeline.map((item, i) => (
          <div key={i} className="relative z-10 animate-in slide-in-from-bottom-2" style={{ animationDelay: `${i * 50}ms` }}>
            <div className="flex gap-4 mb-1">
              <div className="flex flex-col items-center min-w-[54px] pt-1">
                <span className="text-xs font-bold text-gray-800 bg-slate-50 px-1">{item.startTime}</span>
                <div className={`w-3 h-3 rounded-full border-2 mt-1 mb-1 ${i === 0 ? 'bg-blue-500 border-blue-200' : 'bg-white border-blue-500'}`}></div>
                <span className="text-[10px] text-gray-400 font-mono bg-slate-50 px-1">{item.endTime}</span>
              </div>

              <div className="flex-1 bg-white rounded-xl p-3 shadow-sm border border-gray-100 relative group active:scale-[0.98] transition-transform duration-100">
                 <button 
                    onClick={() => onRemove(i)}
                    className="absolute top-2 right-2 p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full transition"
                 >
                    <Trash2 size={16}/>
                 </button>

                 <div className="flex gap-3">
                    <div className="w-16 h-16 bg-gray-100 rounded-lg shrink-0 overflow-hidden">
                        {item.image_url ? (
                            <img src={item.image_url} className="w-full h-full object-cover" alt=""/>
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-300"><MapPin size={20}/></div>
                        )}
                    </div>
                    <div className="flex-1 min-w-0 py-0.5">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded">
                                {item.is_hotel || item.source === 'rakuten' ? '宿泊' : '観光'}
                            </span>
                        </div>
                        <h3 className="font-bold text-gray-800 truncate text-base">{item.name}</h3>
                        <p className="text-xs text-gray-500 truncate">{item.description}</p>
                    </div>
                 </div>
              </div>
            </div>

            {!item.isLast && (
                <div className="flex gap-4 mb-1 h-12">
                    <div className="min-w-[54px]"></div>
                    <div className="flex-1 flex items-center pl-4">
                        <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 px-3 py-1 rounded-full border border-gray-100">
                            <Car size={12} />
                            <span className="font-bold">移動: {item.travelTime}分</span>
                        </div>
                    </div>
                </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}