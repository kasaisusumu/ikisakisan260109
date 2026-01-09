"use client";

import { useState } from 'react';
import { X, Crown, Check, Search, ExternalLink, MapPin, Star, Trophy, ArrowRight } from 'lucide-react';

interface Props {
  hotels: any[];
  onClose: () => void;
  onDecide: (id: string) => void;
  winnerId: string | null;
}

export default function ComparisonModal({ hotels, onClose, onDecide, winnerId }: Props) {
  const [prices, setPrices] = useState<{[key: string]: number}>({});
  const [inputtingId, setInputtingId] = useState<string | null>(null);

  const getRakutenUrl = (name: string) => 
    `https://search.travel.rakuten.co.jp/ds/hotel/search?f_teikei=&f_query=${encodeURIComponent(name)}`;

  const handleCheckPrice = (hotel: any) => {
    // 1. リンクを開く（Cookie付与）
    window.open(getRakutenUrl(hotel.name), '_blank');
    // 2. 戻ってきたら入力モードにする
    setTimeout(() => setInputtingId(hotel.id), 500);
  };

  return (
    <div className="fixed inset-0 z-[150] bg-slate-100 flex flex-col animate-in slide-in-from-bottom-10">
      {/* ヘッダー */}
      <div className="bg-white p-4 shadow-sm border-b flex justify-between items-center shrink-0">
        <div>
            <h2 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                <Trophy className="text-yellow-500" size={20}/> 宿の頂上決戦
            </h2>
            <p className="text-xs text-gray-500">条件を比べて、ベストな一軒を決めよう！</p>
        </div>
        <button onClick={onClose} className="bg-gray-100 p-2 rounded-full hover:bg-gray-200 transition"><X size={20}/></button>
      </div>

      {/* 比較テーブルエリア (横スクロール) */}
      <div className="flex-1 overflow-x-auto overflow-y-auto bg-slate-50 p-4">
        <div className="flex gap-4 min-w-max pb-safe">
          
          {hotels.map((hotel) => {
            const isWinner = winnerId === hotel.id;
            const price = prices[hotel.id];
            const isInputting = inputtingId === hotel.id;
            
            return (
              <div key={hotel.id} className={`w-[280px] flex flex-col bg-white rounded-2xl shadow-sm border-2 overflow-hidden relative transition-all duration-300 ${isWinner ? 'border-yellow-400 ring-4 ring-yellow-400/30 scale-100 z-10' : 'border-gray-200 scale-95 opacity-90'}`}>
                
                {/* 決定ボタン */}
                <button 
                    onClick={() => onDecide(hotel.id)}
                    className={`absolute top-3 right-3 z-20 px-3 py-1.5 rounded-full text-xs font-bold shadow-md flex items-center gap-1 transition active:scale-95 ${isWinner ? 'bg-black text-yellow-400' : 'bg-white/90 text-gray-400 hover:bg-yellow-400 hover:text-black'}`}
                >
                    {isWinner ? <><Check size={14}/> 決定済み</> : <><Crown size={14}/> これにする</>}
                </button>

                {/* 画像 */}
                <div className="h-40 w-full bg-gray-200 relative shrink-0">
                    <img src={`https://source.unsplash.com/featured/400x300/?hotel,room,${encodeURIComponent(hotel.name)}`} className="w-full h-full object-cover" alt=""/>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent"></div>
                    <div className="absolute bottom-3 left-3 right-3 text-white">
                        <h3 className="font-bold text-lg leading-tight shadow-black drop-shadow-md">{hotel.name}</h3>
                    </div>
                </div>

                {/* スペック表 */}
                <div className="p-4 flex-1 flex flex-col gap-4">
                    
                    {/* 価格（入力誘導） */}
                    <div className={`p-3 rounded-xl border transition ${price ? 'bg-white border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
                        <p className="text-xs font-bold mb-1 flex items-center gap-1 text-gray-600">
                            <Search size={12}/> 宿泊料金 (目安)
                        </p>
                        
                        {isInputting ? (
                            <div className="flex gap-1 animate-in fade-in">
                                <input 
                                    autoFocus
                                    type="number" 
                                    className="w-full p-2 text-sm border border-blue-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="確認した金額"
                                    onBlur={(e) => {
                                        if(e.target.value) setPrices(p => ({...p, [hotel.id]: parseInt(e.target.value)}));
                                        setInputtingId(null);
                                    }}
                                    onKeyDown={(e) => {
                                        if(e.key==='Enter') {
                                            if((e.target as HTMLInputElement).value) setPrices(p => ({...p, [hotel.id]: parseInt((e.target as HTMLInputElement).value)}));
                                            setInputtingId(null);
                                        }
                                    }}
                                />
                            </div>
                        ) : (
                            <div onClick={() => handleCheckPrice(hotel)} className="cursor-pointer">
                                {price ? (
                                    <p className="text-xl font-black text-green-600">¥{price.toLocaleString()}</p>
                                ) : (
                                    <div className="flex items-center justify-between bg-white border border-dashed border-red-300 rounded p-2 text-red-500 hover:bg-red-50 transition shadow-sm">
                                        <span className="text-sm font-bold">--- 円</span>
                                        <span className="text-[10px] bg-red-100 px-2 py-1 rounded-full flex items-center gap-1 font-bold">確認する <ExternalLink size={10}/></span>
                                    </div>
                                )}
                            </div>
                        )}
                        {!price && !isInputting && <p className="text-[9px] text-gray-400 mt-1 text-center">※タップして楽天トラベルで確認・入力</p>}
                    </div>

                    {/* アクセス */}
                    <div>
                        <p className="text-[10px] text-gray-400 font-bold mb-1">アクセス</p>
                        <p className="text-sm text-gray-700 flex items-start gap-1">
                            <MapPin size={14} className="mt-0.5 text-gray-400 shrink-0"/>
                            <span className="line-clamp-2">{hotel.description || "詳細なアクセス情報はリンク先で確認してください。"}</span>
                        </p>
                    </div>

                    {/* PRボタン */}
                    <div className="mt-auto pt-4">
                        <button 
                            onClick={() => handleCheckPrice(hotel)} 
                            className={`w-full py-3 rounded-xl font-bold text-sm shadow-sm flex items-center justify-center gap-2 transition active:scale-95 ${isWinner ? 'bg-gradient-to-r from-red-500 to-pink-600 text-white shadow-lg animate-pulse-slow' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                        >
                            {isWinner ? '今すぐ空室を確保 (PR)' : '詳細・写真を見る'} <ArrowRight size={16} className="opacity-50"/>
                        </button>
                    </div>
                </div>
              </div>
            );
          })}
          
          <div className="w-[100px] flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-2xl opacity-50 shrink-0">
              <p className="text-xs font-bold text-gray-400 text-center mb-2">もっと<br/>比較する</p>
              <div className="bg-gray-200 p-3 rounded-full text-gray-500"><Search size={20}/></div>
          </div>
        </div>
      </div>
    </div>
  );
}