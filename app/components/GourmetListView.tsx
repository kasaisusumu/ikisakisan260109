"use client";

import React, { useState, useEffect } from 'react';
import { Utensils, X, Search, DollarSign, Check, Loader2, Users } from 'lucide-react';

export default function GourmetListView({ spots, roomId, travelDays, onAddSpot, initialSearchArea }: any) {
    const [displayDay, setDisplayDay] = useState(0);
    const [showSettings, setShowSettings] = useState(true); // 囲んだら即設定を開く
    const [isLoading, setIsLoading] = useState(false);
    const [hotels, setHotels] = useState(spots);
    const [conditions, setConditions] = useState({ genre: 'all', budget: 'all', privateRoom: false, keyword: '' });

    const executeSearch = async () => {
        setIsLoading(true);
        try {
            const body = {
                latitude: initialSearchArea.latitude,
                longitude: initialSearchArea.longitude,
                radius: initialSearchArea.radius,
                polygon: initialSearchArea.polygon,
                ...conditions
            };
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/search_restaurants`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
            });
            const data = await res.json();
            setHotels(data.spots || []);
            setShowSettings(false);
        } catch (e) { alert("検索失敗"); } finally { setIsLoading(false); }
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 pt-16 pb-20">
            <div className="px-6 flex justify-between items-center mb-4">
                <h3 className="font-black text-xl flex items-center gap-2"><Utensils className="text-rose-500"/> 分析結果</h3>
                <button onClick={() => setShowSettings(true)} className="text-[10px] bg-black text-white px-3 py-1 rounded-full font-bold">条件変更</button>
            </div>

            {/* 散布図エリア */}
            <div className="mx-6 h-40 bg-white rounded-3xl p-4 shadow-sm">
                {/* 以前作成したScatterPlotをここに配置 */}
            </div>

            {/* リスト表示 */}
            <div className="flex-1 overflow-y-auto px-6 space-y-3">
                {hotels.map((spot: any) => (
                    <div key={spot.id} className="bg-white p-4 rounded-2xl flex items-center gap-4">
                        <img src={spot.image_url} className="w-16 h-16 rounded-xl object-cover" />
                        <div className="flex-1">
                            <h4 className="font-bold text-sm">{spot.name}</h4>
                            <p className="text-rose-600 font-black">¥{spot.price?.toLocaleString()}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* 条件入力モーダル */}
            {showSettings && (
                <div className="absolute inset-0 z-[100] bg-white p-8">
                    <div className="flex justify-between mb-8"><h2 className="font-black text-2xl">条件設定</h2><X onClick={() => setShowSettings(false)}/></div>
                    <div className="space-y-6">
                        <input placeholder="キーワード" onChange={e => setConditions({...conditions, keyword: e.target.value})} className="w-full p-4 bg-gray-50 rounded-xl"/>
                        <select onChange={e => setConditions({...conditions, genre: e.target.value})} className="w-full p-4 bg-gray-50 rounded-xl">
                            <option value="all">ジャンル指定なし</option>
                            <option value="G001">居酒屋</option>
                            <option value="G008">焼肉</option>
                        </select>
                        <button onClick={executeSearch} className="w-full py-4 bg-rose-500 text-white rounded-xl font-bold">
                            {isLoading ? <Loader2 className="animate-spin"/> : "検索する"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}