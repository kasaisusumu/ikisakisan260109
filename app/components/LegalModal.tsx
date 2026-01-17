"use client";

import { useState, useEffect } from 'react';
import { ShieldCheck, Info, CheckCircle2, AlertTriangle, Scale, ExternalLink, FileText } from 'lucide-react';

export default function LegalModal() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // 規約のバージョン管理（規約を変更した場合はキー末尾のv1をv2などに変更して再同意を求めることが一般的）
    const TERMS_VERSION = 'route_hacker_agreed_v1';
    const hasAgreed = localStorage.getItem(TERMS_VERSION);
    if (!hasAgreed) {
      setIsOpen(true);
    }
  }, []);

  const handleAgree = () => {
    const TERMS_VERSION = 'route_hacker_agreed_v1';
    localStorage.setItem(TERMS_VERSION, 'true');
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-300">
        
        {/* ヘッダー */}
        <div className="p-6 border-b bg-gradient-to-r from-slate-50 to-white shrink-0">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-blue-600 p-2.5 rounded-xl text-white shadow-md">
                <Scale size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-800">利用規約と免責事項</h2>
              <p className="text-xs text-gray-500 font-bold">ご利用前に必ずご確認ください</p>
            </div>
          </div>
        </div>

        {/* コンテンツエリア (スクロール可能) */}
        <div className="p-6 overflow-y-auto text-sm text-gray-600 space-y-8 leading-relaxed bg-white custom-scrollbar">
          
          {/* 1. サービスの性質について */}
          <section>
            <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2 text-base">
                <AlertTriangle size={18} className="text-amber-500"/>
                サービスの性質とデータについて
            </h3>
            <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 text-amber-900/80 text-xs font-medium space-y-2">
              <p>
                本サービスは開発中のベータ版（ポートフォリオ作品）です。
                システムの都合上、予告なくサービスを停止したり、保存された旅行計画などのデータが消失したりする可能性があります。
              </p>
              <p className="font-bold">
                重要な旅行計画の唯一の記録媒体として本サービスを利用することはお控えください。
              </p>
            </div>
          </section>

          {/* 2. AIと情報の正確性 */}
          <section>
            <h3 className="font-bold text-gray-800 mb-2 border-l-4 border-blue-500 pl-3">
              AI生成情報・ルート計算について
            </h3>
            <p className="mb-2">
              本アプリではOpenAI等の生成AIおよびMapboxを利用してスポット提案やルート計算を行っています。
            </p>
            <ul className="list-disc list-inside space-y-1 pl-1 text-gray-500 text-xs">
              <li>AIは架空の場所や誤った情報を提案する可能性があります（ハルシネーション）。</li>
              <li>提示される移動時間や交通費はあくまで概算であり、実際の交通状況を保証するものではありません。</li>
              <li>施設の営業時間や定休日は必ず公式サイト等で最新情報をご確認ください。</li>
            </ul>
          </section>

          {/* 3. 広告・アフィリエイト表記 (ステマ規制対応) */}
          <section>
            <h3 className="font-bold text-gray-800 mb-2 border-l-4 border-blue-500 pl-3">
              広告と収益化について
            </h3>
            <p className="mb-2">
              本アプリは、サービスの維持・運営のために以下の広告プログラムを利用しています。
            </p>
            <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 space-y-2">
               <p className="text-xs">
                 <span className="font-bold text-gray-700">楽天トラベル アフィリエイト:</span><br/>
                 アプリ内の「楽天で見る」「空室確認」等のリンクを経由して宿泊予約が行われた場合、運営者に成果報酬が発生する場合があります。これにより得られた収益はAPI利用料やサーバー代に充てられます。
               </p>
            </div>
          </section>

          {/* 4. 知的財産権・データソース */}
          <section>
            <h3 className="font-bold text-gray-800 mb-2 border-l-4 border-gray-300 pl-3">
              権利表記・データソース
            </h3>
            <p className="text-xs mb-2">本アプリは以下のAPI・データを利用して表示しています。</p>
            <ul className="text-[10px] font-mono text-gray-400 space-y-1 bg-gray-50 p-3 rounded-lg">
              <li>© Mapbox, © OpenStreetMap</li>
              <li>Supported by Rakuten Developers (Rakuten Travel API)</li>
              <li>Powered by OpenAI (GPT Models)</li>
              <li>Google Maps Platform (Geocoding/Places)</li>
            </ul>
          </section>

          {/* 5. 禁止事項 */}
          <section>
            <h3 className="font-bold text-gray-800 mb-2 border-l-4 border-gray-300 pl-3">
              禁止事項
            </h3>
            <p>
              公序良俗に反する内容の入力、サーバーへの過度な負荷をかける行為、リバースエンジニアリング等を禁止します。
              不適切と判断したデータは予告なく削除する場合があります。
            </p>
          </section>

        </div>

        {/* フッター */}
        <div className="p-5 border-t bg-gray-50 shrink-0">
          <p className="text-[10px] text-gray-400 mb-4 text-center">
             同意ボタンを押すことで、上記すべての条項および<br/>
             Cookie（クッキー）の使用に同意したものとみなされます。
          </p>
          <button 
            onClick={handleAgree}
            className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold hover:bg-slate-800 active:scale-[0.98] transition shadow-lg flex items-center justify-center gap-2"
          >
            <CheckCircle2 size={18} />
            上記の内容を理解し、同意して始める
          </button>
        </div>

      </div>
    </div>
  );
}