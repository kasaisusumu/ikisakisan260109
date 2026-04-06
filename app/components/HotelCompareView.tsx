// components/HotelCompareView.tsx
"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Star, MapPin, BedDouble, ExternalLink, X, Info, TrendingUp, ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import RadarChart from './RadarChart'; // ※パスはフォルダ構成に合わせて微調整してください（例: '@/components/RadarChart'）

// === レーダーチャート用コンポーネント ===
// ★修正: isLoading プロパティを追加


export default function HotelCompareView({ spots, onSelectHotel, adultNum = 1 }: { spots: any[], onSelectHotel: (s: any) => void, adultNum?: number }) {
    
    const attemptedFetch = useRef<Set<string>>(new Set());
    
    // ★追加: データの取得中状態を管理（ローディング表示用）
    const [fetchingSpotIds, setFetchingSpotIds] = useState<Set<string>>(new Set());

    const [reviewModalData, setReviewModalData] = useState<{ spot: any, key: string, label: string } | null>(null);

    const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [detailModalSpot, setDetailModalSpot] = useState<any | null>(null);

    useEffect(() => {
        const fetchMissingData = async () => {
            const missingSpots = spots.filter(s =>
                !s.detailed_ratings &&
                !attemptedFetch.current.has(s.id) &&
                (s.url || /^\d+$/.test(String(s.id)))
            );

            if (missingSpots.length === 0) return;

            // 取得対象のIDをローディング状態にする
            setFetchingSpotIds(prev => new Set([...prev, ...missingSpots.map(s => s.id)]));

            // ★修正: 全ての宿を「並列」で一気に取得する（圧倒的に早くなります）
            await Promise.all(missingSpots.map(async (spot) => {
                attemptedFetch.current.add(spot.id);

                try {
                    const { data: dbSpot } = await supabase
                        .from('spots')
                        .select('detailed_ratings')
                        .eq('id', spot.id)
                        .maybeSingle();

                    if (dbSpot && dbSpot.detailed_ratings) {
                        return; // 既にDBにあればスキップ
                    }

                    const targetUrl = spot.url || `https://hotel.travel.rakuten.co.jp/hotelinfo/plan/${spot.id}`;
                    const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

                    const res = await fetch(`${API_BASE_URL}/api/import_rakuten_hotel`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url: targetUrl })
                    });

                    if (res.ok) {
                        const data = await res.json();
                        if (data.spot && data.spot.detailed_ratings) {
                            await supabase.from('spots').update({
                                detailed_ratings: data.spot.detailed_ratings,
                                price: spot.price > 0 ? spot.price : data.spot.price,
                                rating: spot.rating > 0 ? spot.rating : data.spot.rating,
                                image_url: spot.image_url || data.spot.image_url,
                            }).eq('id', spot.id);
                        }
                    }
                } catch (e) {
                    console.error("Failed to fetch missing hotel data for", spot.name, e);
                } finally {
                    // 成功・失敗に関わらず、処理が終わったらローディングを解除する
                    setFetchingSpotIds(prev => {
                        const next = new Set(prev);
                        next.delete(spot.id);
                        return next;
                    });
                }
            }));
        };

        if (spots.length > 0) {
            fetchMissingData();
        }
    }, [spots]);

    const getUnitPrice = (price: number) => Math.round(price / Math.max(1, adultNum));

    const validSpots = spots.filter(s => s.price > 0 && s.rating > 0);
    const minP = validSpots.length ? Math.min(...validSpots.map(s => getUnitPrice(s.price))) * 0.95 : 0;
    const maxP = validSpots.length ? Math.max(...validSpots.map(s => getUnitPrice(s.price))) * 1.05 : 30000;
    const minR = 3.0; const maxR = 5.0;

    const ratingTicks = [3.0, 3.5, 4.0, 4.5, 5.0];
    const priceTicks = validSpots.length > 0 ? [Math.floor(minP), Math.floor((minP + maxP) / 2), Math.floor(maxP)] : [];

    const handlePlotClick = (spot: any) => {
        setSelectedSpotId(spot.id);
        
        if (scrollContainerRef.current) {
            const container = scrollContainerRef.current;
            const card = container.querySelector(`[data-spot-id="${spot.id}"]`) as HTMLElement;
            
            if (card) {
                const containerWidth = container.offsetWidth;
                const cardLeft = card.offsetLeft;
                const cardWidth = card.offsetWidth;
                
                container.scrollTo({
                    left: cardLeft - containerWidth / 2 + cardWidth / 2,
                    behavior: 'smooth'
                });
            }
        }
    };

    return (
        <>
            <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 pb-8">
                <div className="flex items-center justify-between px-2">
                    <div>
                        <h2 className="text-xl font-black text-gray-800 tracking-tight">候補の比較</h2>
                        <p className="text-[11px] text-gray-500 font-medium">現在追加されている宿の分析データです</p>
                    </div>
                    <div className="w-10 h-10 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center">
                        <BedDouble size={20} />
                    </div>
                </div>

                {/* 散布図 (コスパ比較) */}
                <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm space-y-2">
                    <h3 className="text-sm font-bold text-gray-700 ml-1">コスパ・評価マトリクス</h3>
                    <div className="w-full h-[180px] relative px-4 mt-2">
                        <svg viewBox="0 0 300 170" className="w-full h-full overflow-visible">
                            <line x1="30" y1="140" x2="290" y2="140" stroke="#d1d5db" strokeWidth="1.5"/>
                            <line x1="30" y1="10" x2="30" y2="140" stroke="#d1d5db" strokeWidth="1.5"/>
                            
                            {ratingTicks.map(r => {
                                const x = 30 + ((r - minR) / (maxR - minR)) * 260;
                                return (
                                    <g key={`x-${r}`}>
                                        <line x1={x} y1={10} x2={x} y2={140} stroke="#f3f4f6" strokeWidth="1" strokeDasharray="3 3" />
                                        <text x={x} y={152} fontSize="8" fill="#9ca3af" textAnchor="middle" fontWeight="bold">{r.toFixed(1)}</text>
                                    </g>
                                );
                            })}

                            {priceTicks.map((p, i) => {
                                const y = 140 - ((p - minP) / (maxP - minP)) * 130;
                                return (
                                    <g key={`y-${i}`}>
                                        <line x1={30} y1={y} x2={290} y2={y} stroke="#f3f4f6" strokeWidth="1" strokeDasharray="3 3" />
                                        <text x={25} y={y + 3} fontSize="8" fill="#9ca3af" textAnchor="end" fontWeight="bold">
                                            {p >= 10000 ? `${(p / 10000).toFixed(1)}万` : `¥${(p / 1000).toFixed(0)}k`}
                                        </text>
                                    </g>
                                );
                            })}

                            <text x="160" y="165" fontSize="8" fill="#9ca3af" textAnchor="middle" fontWeight="bold">評価 (低 ← → 高)</text>
                            <text x="5" y="75" fontSize="8" fill="#9ca3af" transform="rotate(-90, 5, 75)" textAnchor="middle" fontWeight="bold">価格</text>
                            
                            {validSpots.map((spot, i) => {
                                const x = 30 + ((spot.rating - minR) / (maxR - minR)) * 260;
                                const unitPrice = getUnitPrice(spot.price);
                                const y = 140 - ((unitPrice - minP) / (maxP - minP)) * 130;
                                const isSelected = selectedSpotId === spot.id;

                                return (
                                    <g key={i} className="cursor-pointer group" onClick={() => handlePlotClick(spot)}>
                                        <circle 
                                            cx={x} cy={y} r={isSelected ? "10" : "6"} 
                                            fill={isSelected ? "#EF4444" : "#F97316"} 
                                            fillOpacity={isSelected ? "1" : "0.7"} 
                                            stroke="white" strokeWidth={isSelected ? "2" : "1.5"} 
                                            className={`transition-all duration-300 ${!isSelected && 'group-hover:r-8'}`} 
                                        />
                                        <text 
                                            x={x} y={y - (isSelected ? 14 : 10)} 
                                            fontSize="9" fill={isSelected ? "#EF4444" : "#4B5563"} 
                                            textAnchor="middle" 
                                            className={`transition-opacity font-bold ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                                        >
                                            {spot.name.substring(0, 8)}
                                        </text>
                                    </g>
                                );
                            })}
                        </svg>
                    </div>
                </div>

                {/* 各ホテルの詳細カード (横スクロール) */}
                <div 
                    ref={scrollContainerRef}
                    className="flex gap-4 overflow-x-auto px-2 pb-4 no-scrollbar mask-gradient"
                    style={{ scrollBehavior: 'smooth' }}
                >
                    {spots.map((spot, index) => {
                        const unitPrice = getUnitPrice(spot.price);
                        const isSelected = selectedSpotId === spot.id;
                        const targetUrl = spot.url || `https://hotel.travel.rakuten.co.jp/hotelinfo/plan/${spot.id}`;
                        const isLoading = fetchingSpotIds.has(spot.id); // ★追加
                        
                        return (
                            <div 
                                key={index} 
                                data-spot-id={spot.id}
                                className={`min-w-[260px] bg-white rounded-3xl p-4 flex flex-col gap-4 relative cursor-pointer active:scale-[0.98] transition-all duration-300 ${
                                    isSelected 
                                    ? 'border-2 border-red-500 shadow-md ring-2 ring-red-100 transform -translate-y-1'
                                    : 'border border-gray-100 shadow-sm'
                                }`}
                                onClick={() => setSelectedSpotId(spot.id)}
                            >
                                <div className="w-full h-32 bg-gray-100 rounded-2xl overflow-hidden shrink-0 relative">
                                    {spot.image_url ? (
                                        <img src={spot.image_url} className="w-full h-full object-cover" alt="" />
                                    ) : (
                                        <div className="flex h-full items-center justify-center text-gray-300"><BedDouble size={32}/></div>
                                    )}
                                    {spot.rating > 0 && (
                                        <div className={`absolute top-2 right-2 backdrop-blur-md text-white px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 ${isSelected ? 'bg-red-500/90' : 'bg-black/60'}`}>
                                            <Star size={10} className="text-yellow-400" fill="currentColor"/> {spot.rating}
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <h4 className={`font-black text-sm line-clamp-2 leading-tight mb-1 ${isSelected ? 'text-red-600' : 'text-gray-800'}`}>{spot.name}</h4>
                                    <div className="flex items-center gap-1 text-[10px] text-gray-400 font-bold mb-2">
                                        <MapPin size={10} className="shrink-0"/> <span className="truncate">{spot.description}</span>
                                    </div>
                                    {spot.price > 0 && (
                                        <p className="text-orange-500 font-black text-lg leading-none mt-1">
                                            ¥{unitPrice.toLocaleString()}<span className="text-[10px] text-gray-400 font-bold ml-1">~ /人</span>
                                        </p>
                                    )}
                                </div>

                                {/* レーダーチャート */}
                                <div className={`flex items-center justify-center rounded-2xl py-2 h-[160px] transition-colors ${isSelected ? 'bg-red-50' : 'bg-gray-50/50'}`}>
                                  <RadarChart ratings={spot.detailed_ratings} color={isSelected ? "#EF4444" : "#F97316"} isLoading={isLoading} onLabelClick={(key, label) => setReviewModalData({ spot, key, label })} />

                                  </div>

                                {/* 詳細を見るボタンと楽天ボタン */}
                                <div className="flex gap-2 mt-auto pt-2">
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setDetailModalSpot(spot);
                                        }}
                                        className="flex-[1] bg-gray-800 text-white py-3 rounded-xl font-bold text-[11px] flex items-center justify-center gap-1 hover:bg-gray-700 transition-colors"
                                    >
                                        <Info size={14} /> 詳細
                                    </button>
                                    <a 
                                        href={targetUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="flex-[1.2] bg-[#BF0000] text-white py-3 rounded-xl font-bold text-[11px] flex items-center justify-center gap-1 hover:bg-red-800 transition-colors"
                                    >
                                        楽天で見る <ExternalLink size={14} />
                                    </a>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 詳細確認用のオーバーレイ・モーダル */}
            {detailModalSpot && (
                <div 
                    className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in"
                    onClick={() => setDetailModalSpot(null)}
                >
                    <div 
                        className="bg-gray-50 w-full sm:max-w-md h-[85vh] sm:h-auto sm:max-h-[90vh] rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-8 shadow-2xl relative"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* モーダルのヘッダー（画像） */}
                        <div className="w-full h-56 relative shrink-0 bg-gray-200">
                            <button 
                                onClick={() => setDetailModalSpot(null)}
                                className="absolute top-4 left-4 z-10 bg-black/50 backdrop-blur-md px-4 py-2 rounded-full flex items-center gap-2 text-white hover:bg-black/70 transition-colors text-xs font-bold shadow-lg"
                            >
                                <ArrowLeft size={16} /> 戻る
                            </button>

                            {detailModalSpot.image_url ? (
                                <img src={detailModalSpot.image_url} className="w-full h-full object-cover" alt="" />
                            ) : (
                                <div className="flex h-full items-center justify-center text-gray-400"><BedDouble size={48}/></div>
                            )}
                            
                            <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-md text-white px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg">
                                <Star size={12} className="text-yellow-400" fill="currentColor"/> 
                                {detailModalSpot.rating > 0 ? detailModalSpot.rating : "評価なし"}
                            </div>
                        </div>

                        {/* モーダルのスクロールコンテンツ */}
                        <div className="flex-1 overflow-y-auto p-5 space-y-6">
                            
                            <div>
                                <h3 className="text-xl font-black text-gray-800 leading-tight mb-2">{detailModalSpot.name}</h3>
                                <div className="flex items-start gap-1.5 text-xs text-gray-500 font-medium mb-3">
                                    <MapPin size={14} className="shrink-0 mt-0.5 text-orange-500"/> 
                                    <span>{detailModalSpot.description}</span>
                                </div>
                                {detailModalSpot.price > 0 && (
                                    <p className="text-orange-600 font-black text-2xl leading-none">
                                        ¥{getUnitPrice(detailModalSpot.price).toLocaleString()}<span className="text-xs text-gray-400 font-bold ml-1">~ /人</span>
                                    </p>
                                )}
                            </div>

                            {/* レーダーチャート */}
                            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                                <h4 className="text-xs font-bold text-gray-500 mb-2 flex items-center gap-1"><TrendingUp size={14}/> 評価バランス</h4>
                                <div className="flex justify-center h-[180px]">
                                   <RadarChart ratings={detailModalSpot.detailed_ratings} color="#F97316" isLoading={fetchingSpotIds.has(detailModalSpot.id)} onLabelClick={(key, label) => setReviewModalData({ spot: detailModalSpot, key, label })} /> </div>
                            </div>

                            {/* プラン内容・ホテルの特徴 */}
                            {detailModalSpot.comment && (
                                <div className="bg-orange-50/50 rounded-2xl p-4 border border-orange-100">
                                    <h4 className="text-xs font-bold text-orange-800 mb-2 flex items-center gap-1"><Info size={14}/> プラン・ホテルの特徴</h4>
                                    <p className="text-sm text-gray-700 leading-relaxed font-medium whitespace-pre-wrap">
                                        {detailModalSpot.comment.replace(/<[^>]*>?/gm, '')}
                                    </p>
                                </div>
                            )}
                            
                            <div className="h-4"></div>
                        </div>

                        {/* モーダルの固定フッター */}
                        <div className="p-4 bg-white border-t border-gray-100 shrink-0">
                            <a 
                                href={detailModalSpot.url || `https://hotel.travel.rakuten.co.jp/hotelinfo/plan/${detailModalSpot.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-full bg-[#BF0000] text-white py-4 rounded-2xl font-black text-center flex items-center justify-center gap-2 shadow-lg hover:bg-red-800 active:scale-95 transition-all"
                            >
                                全ての写真・プランを楽天で見る <ExternalLink size={18} />
                            </a>
                        </div>
                    </div>
                </div>
            )}

            {/* ▼ レビュー確認用のモーダル ▼ */}
            {reviewModalData && (
                <div 
                    className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in p-4"
                    onClick={() => setReviewModalData(null)}
                >
                    <div 
                        className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl flex flex-col gap-4 animate-in zoom-in-95"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div>
                            <h3 className="font-black text-gray-800 text-lg leading-tight mb-1">{reviewModalData.spot.name}</h3>
                            <p className="text-sm font-bold text-orange-600">
                                「{reviewModalData.label}」に関する評価・レビュー
                            </p>
                        </div>

                        <div className="bg-gray-50 rounded-2xl p-4 text-sm text-gray-600 border border-gray-100 min-h-[120px] flex flex-col items-center justify-center text-center gap-2">
                            <p className="font-bold text-gray-400">詳細なテキストレビューデータは<br/>楽天トラベルでご確認いただけます</p>
                        </div>

                        <div className="flex gap-2 mt-2">
                            <button 
                                onClick={() => setReviewModalData(null)}
                                className="flex-1 bg-gray-100 text-gray-600 py-3.5 rounded-xl font-bold text-sm hover:bg-gray-200 transition-colors"
                            >
                                閉じる
                            </button>
                            <a 
                                href={`https://hotel.travel.rakuten.co.jp/hotelinfo/plan/${reviewModalData.spot.id}#review`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-[1.5] bg-[#BF0000] text-white py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-1 shadow-md hover:bg-red-800 transition-colors"
                            >
                                楽天で口コミを見る <ExternalLink size={16} />
                            </a>
                        </div>
                    </div>
                </div>
            )}
            {/* ▲ レビュー確認用のモーダルここまで ▲ */}
        </>
    );
}