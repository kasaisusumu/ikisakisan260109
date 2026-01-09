"use client";

import { useState, useEffect } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onStart: (theme: string) => void;
  isLoading: boolean;
  
}

export default function InitialModal({ isOpen, onStart, isLoading }: Props) {
  const [theme, setTheme] = useState("");
  const [progress, setProgress] = useState(0);

  // ★ プログレスバー制御ロジック
  useEffect(() => {
    if (isLoading) {
      setProgress(0);
      const interval = setInterval(() => {
        setProgress(prev => {
            // 90%までは高速に、それ以降はゆっくり進む（出粘る）
            if (prev < 90) {
                return prev + Math.random() * 15 + 5;
            } else if (prev < 99) {
                return prev + 0.2;
            }
            return prev;
        });
      }, 200);
      return () => clearInterval(interval);
    } else {
      setProgress(0);
    }
  }, [isLoading]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-6 backdrop-blur-md">
      <div className="bg-white w-full max-w-md rounded-2xl p-8 text-center shadow-2xl animate-in fade-in zoom-in duration-300 relative overflow-hidden">
        
        {/* ローディング中のプログレスバー */}
        {isLoading && (
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gray-100">
                <div 
                    className="h-full bg-gradient-to-r from-blue-500 to-purple-600 transition-all duration-200 ease-out"
                    style={{ width: `${Math.min(progress, 99)}%` }}
                ></div>
            </div>
        )}

        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Sparkles className="text-blue-600" size={32} />
        </div>
        <h2 className="text-2xl font-black text-gray-800 mb-2">旅のテーマを教えて！</h2>
        <p className="text-gray-500 text-sm mb-6">
          AIがあなたの好みに合わせて、<br/>おすすめスポットを10ヶ所ピックアップします。
        </p>

        <input 
          type="text"
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && theme && !isLoading && onStart(theme)}
          placeholder="例: 京都で美味しい抹茶と歴史巡り"
          className="w-full bg-gray-100 border-2 border-transparent focus:border-blue-500 rounded-xl p-4 text-lg text-center font-bold text-gray-800 outline-none transition mb-4"
          autoFocus
        />

        <button 
          onClick={() => onStart(theme)}
          disabled={isLoading || !theme}
          className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-4 rounded-xl font-bold text-lg shadow-lg hover:scale-105 transition disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2 relative overflow-hidden"
        >
          {isLoading ? (
              <span className="relative z-10 flex items-center gap-2">
                  <Loader2 className="animate-spin"/> 
                  AIが厳選中... {Math.floor(progress)}%
              </span>
          ) : 'スポットを探す 🚀'}
        </button>
        
        {isLoading && (
            <p className="text-xs text-gray-400 mt-3 animate-pulse">
                エリア内の最適なスポットを探しています...<br/>（少し時間がかかります）
            </p>
        )}
      </div>
    </div>
  );
}