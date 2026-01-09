"use client";

import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';

export default function Ticker() {
  // 流すニュースの内容（仮のデータ）
  // ※本来はSupabaseからリアルタイムで取得しますが、まずは演出としてランダム表示します
  const messages = [
    "📢 京都エリアで「ルート最適化」が実行されました",
    "✨ 東京エリアで「宿予約」により制限が解除されました！",
    "📢 大阪エリアで「AI検索」が実行中...",
    "🔥 福岡エリアで「スワイプ投票」が盛り上がっています",
    "✨ 北海道エリアで「幹事ハック機能」がアンロックされました",
    "📢 沖縄エリアで新しい旅の計画がスタートしました",
  ];

  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    // 3秒ごとにメッセージを切り替える
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % messages.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-gray-900 text-white text-xs py-2 px-4 flex items-center justify-center shadow-md relative z-50 overflow-hidden">
      <div className="flex items-center gap-2 animate-fade-in-up key={currentIndex}">
        <Bell size={12} className="text-yellow-400 animate-bounce" />
        <span className="font-medium tracking-wide">
          {messages[currentIndex]}
        </span>
      </div>
    </div>
  );
}