"use client";

import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';

export default function Ticker() {
  // 流すニュースの内容（仮のデータ）
  // ※本来はSupabaseからリアルタイムで取得しますが、まずは演出としてランダム表示します
  const messages = [
    "追加されたスポットは、「候補」に追加されます！",
    "「提案」ページで観光地をAIに提案してもらうことが出来ます！",
    "ルームのリンクは「設定」ページからいつでもコピー出来ます！",
    "「確定」リストの旅程は、「旅程」ページから編集出来ます！",
    "画面右上の「万年筆ボタン」で、宿の囲って検索が出来ます！",
    "囲って検索は「金額×レビュー」の散布図で宿を比較出来ます！",
    "宿の追加は、楽天トラベルのURLのペーストでも可能です！",
  ];

  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    // 5秒ごとにメッセージを切り替える
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % messages.length);
    }, 6000);
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