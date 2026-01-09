"use client";

import { useState, useEffect } from 'react';
import { ShieldCheck, Info, CheckCircle2 } from 'lucide-react';

export default function LegalModal() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // 初回訪問チェック
    const hasAgreed = localStorage.getItem('route_hacker_agreed');
    if (!hasAgreed) {
      setIsOpen(true);
    }
  }, []);

  const handleAgree = () => {
    localStorage.setItem('route_hacker_agreed', 'true');
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-300">
        
        {/* ヘッダー */}
        <div className="p-6 border-b bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-blue-100 p-2 rounded-full text-blue-600">
                <ShieldCheck size={28} />
            </div>
            <h2 className="text-xl font-black text-gray-800">ご利用の前に</h2>
          </div>
          <p className="text-sm text-gray-500 font-medium">
            安心・安全にご利用いただくための重要なお知らせ
          </p>
        </div>

        {/* コンテンツ */}
        <div className="p-6 overflow-y-auto text-sm text-gray-600 space-y-6 leading-relaxed bg-white">
          <section className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
            <h3 className="font-bold text-gray-800 mb-2 flex items-center gap-2">
                <Info size={16} className="text-blue-500"/> 免責事項
            </h3>
            <p>
              本アプリのAI提案、ルート計算、交通費概算は目安です。実際の交通状況や営業状況を保証するものではありません。
              利用により生じた損害について運営者は責任を負いかねます。
            </p>
          </section>

          <section>
            <h3 className="font-bold text-gray-800 mb-2 border-l-4 border-gray-300 pl-2">広告とCookieについて</h3>
            <p className="mb-2">
              本アプリは楽天トラベル等のアフィリエイトプログラムを利用しています。リンク経由での予約時に成果報酬が発生する場合があります。
            </p>
            <p>
              効果測定のためCookieを使用し、一部のデータを広告配信事業者に送信します。
            </p>
          </section>

          <section>
            <h3 className="font-bold text-gray-800 mb-2 border-l-4 border-gray-300 pl-2">地図データ</h3>
            <p className="font-mono text-xs">
              © Mapbox, © OpenStreetMap
            </p>
          </section>
        </div>

        {/* フッター */}
        <div className="p-5 border-t bg-gray-50">
          <button 
            onClick={handleAgree}
            className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-bold hover:bg-blue-700 active:scale-[0.98] transition shadow-lg shadow-blue-200 flex items-center justify-center gap-2"
          >
            <CheckCircle2 size={18} />
            上記に同意して始める
          </button>
        </div>

      </div>
    </div>
  );
}