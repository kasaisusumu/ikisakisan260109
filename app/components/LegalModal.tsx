"use client";

import { useState, useEffect } from 'react';
import { ShieldCheck, Info, CheckCircle2, AlertTriangle, Scale, ExternalLink, FileText, Lock } from 'lucide-react';

export default function LegalModal() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // 規約のバージョン管理
    const TERMS_VERSION = 'mapwith_agreed_v2';
    const hasAgreed = localStorage.getItem(TERMS_VERSION);
    if (!hasAgreed) {
      setIsOpen(true);
    }
  }, []);

  const handleAgree = () => {
    const TERMS_VERSION = 'mapwith_agreed_v2';
    localStorage.setItem(TERMS_VERSION, 'true');
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300">
        
        {/* ヘッダー */}
        <div className="p-6 border-b bg-gradient-to-r from-slate-50 to-white shrink-0">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-slate-800 p-2.5 rounded-xl text-white shadow-md">
                <Scale size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-800">利用規約およびプライバシーポリシー</h2>
              <p className="text-xs text-gray-500 font-bold">MapWithをご利用いただく前に、必ず以下の内容をご確認ください。</p>
            </div>
          </div>
        </div>

        {/* コンテンツエリア (スクロール可能) */}
        <div className="p-6 overflow-y-auto text-sm text-gray-600 space-y-10 leading-relaxed bg-white custom-scrollbar">
          
          {/* 【利用規約】 */}
          <section className="space-y-6">
            <div className="flex items-center gap-2 border-b-2 border-slate-800 pb-2">
              <FileText className="text-slate-800" size={20} />
              <h3 className="text-lg font-black text-gray-900">MapWith 利用規約</h3>
            </div>
            
            <div className="space-y-4 text-xs text-gray-600">
              <p>
                この利用規約（以下、「本規約」といいます。）は、MapWith開発チーム（以下、「運営者」といいます。）が提供する旅行計画共有サービス「MapWith」（以下、「本サービス」といいます。）の利用条件を定めるものです。ユーザーの皆様には、本規約に従って本サービスをご利用いただきます。
              </p>

              <div>
                <h4 className="font-bold text-gray-800 mb-1">第1条（適用）</h4>
                <p>本規約は、ユーザーと運営者との間の本サービスの利用に関わる一切の関係に適用されるものとします。</p>
              </div>

              <div>
                <h4 className="font-bold text-gray-800 mb-1">第2条（サービスの提供と変更）</h4>
                <p>1. 本サービスは現在ベータ版（開発中）として提供されています。運営者は、ユーザーに事前に通知することなく、本サービスの内容の全部または一部を変更、追加、または提供を中止することができるものとします。</p>
                <p>2. 運営者は、システムの保守、点検、その他の理由により、本サービスの提供を一時的に中断することがあります。</p>
              </div>

              <div>
                <h4 className="font-bold text-gray-800 mb-1">第3条（禁止事項）</h4>
                <p>ユーザーは、本サービスの利用にあたり、以下の行為をしてはなりません。</p>
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li>法令または公序良俗に違反する行為</li>
                  <li>犯罪行為に関連する行為</li>
                  <li>本サービスに含まれる著作権、商標権等の知的財産権を侵害する行為</li>
                  <li>本サービスのサーバーやネットワークシステムに過度な負荷をかける行為（リバースエンジニアリング、スクレイピング等を含む）</li>
                  <li>他のユーザーに関する個人情報等を不正に収集または蓄積する行為</li>
                  <li>その他、運営者が不適切と判断する行為</li>
                </ul>
              </div>

              <div>
                <h4 className="font-bold text-gray-800 mb-1">第4条（免責事項）</h4>
                <p>1. 本サービス内で提供されるAIによる提案（スポット情報、ルート計算、所要時間等）は、生成AIの特性上、不正確な情報や架空の情報（ハルシネーション）が含まれる場合があります。実際の交通状況や施設の営業情報等は、必ず公式サイト等でご自身で確認してください。</p>
                <p>2. 本サービスはデータの永続的な保存を保証するものではありません。予期せぬ不具合やサーバーの仕様変更等により、旅行計画のデータが消失する可能性があります。重要な情報はご自身で別途バックアップを取得してください。</p>
                <p>3. 運営者は、本サービスの利用によって生じたユーザーのいかなる損害（旅行の遅延、金銭的損失等を含む）についても、一切の責任を負わないものとします。</p>
              </div>

              <div>
                <h4 className="font-bold text-gray-800 mb-1">第5条（広告およびアフィリエイトについて）</h4>
                <p>本サービスでは、運営を継続するため、楽天トラベルアフィリエイト等の広告プログラムを利用しています。アプリ内の宿泊予約リンク等を経由して予約が成立した場合、運営者に成果報酬が発生することがあります。</p>
              </div>
            </div>
          </section>

          {/* 【プライバシーポリシー】 */}
          <section className="space-y-6">
            <div className="flex items-center gap-2 border-b-2 border-emerald-600 pb-2">
              <Lock className="text-emerald-600" size={20} />
              <h3 className="text-lg font-black text-gray-900">プライバシーポリシー</h3>
            </div>
            
            <div className="space-y-4 text-xs text-gray-600">
              <p>
                運営者は、本サービスにおけるユーザーの情報の取扱いについて、以下のとおりプライバシーポリシーを定めます。
              </p>

              <div>
                <h4 className="font-bold text-gray-800 mb-1">1. 収集する情報</h4>
                <p>本サービスでは、以下の情報を収集・保存する場合があります。</p>
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li>ユーザーが入力した情報（ニックネーム、旅行のタイトル、日程、追加したスポット情報、メモ等）</li>
                  <li>利用環境に関する情報（Cookie、ブラウザの種類、アクセスログ等）</li>
                </ul>
                <p className="mt-1 text-red-500 font-bold">※本サービスには、本名、住所、電話番号などの機密性の高い個人情報を入力しないようお願いいたします。</p>
              </div>

              <div>
                <h4 className="font-bold text-gray-800 mb-1">2. 情報の利用目的</h4>
                <p>収集した情報は、以下の目的で利用されます。</p>
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li>本サービスの提供、運営、維持のため（旅行計画のリアルタイム同期等）</li>
                  <li>ユーザーの利便性向上のための機能改善、新機能の開発のため</li>
                  <li>不正利用の防止および対応のため</li>
                  <li>外部API（AIへのプロンプト等）への連携のため</li>
                </ul>
              </div>

              <div>
                <h4 className="font-bold text-gray-800 mb-1">3. 外部APIへの情報提供</h4>
                <p>本サービスは、機能提供のために以下の外部サービスと通信を行います。その際、検索に必要なテキストデータ等が各事業者に送信されます。</p>
                <ul className="list-none mt-1 space-y-2 bg-gray-50 p-3 rounded-lg text-[10px] font-mono text-gray-500">
                  <li>・OpenAI API (GPT Models): AIによる旅行プラン提案のため</li>
                  <li>・Mapbox API / OpenStreetMap: 地図の表示およびルート計算のため</li>
                  <li>・Google Maps Platform: スポット検索（Geocoding/Places）のため</li>
                  <li>・Rakuten Travel API: 宿泊施設の検索・空室情報取得のため</li>
                </ul>
              </div>

              <div>
                <h4 className="font-bold text-gray-800 mb-1">4. 第三者提供</h4>
                <p>運営者は、法令に基づく場合を除き、ユーザーの事前の同意を得ることなく、収集したデータを第三者に提供することはありません。</p>
              </div>

              <div>
                <h4 className="font-bold text-gray-800 mb-1">5. お問い合わせ窓口</h4>
                <p>本ポリシーに関するご質問やお問い合わせは、本サービス内のお問い合わせフォームよりご連絡ください。</p>
              </div>
            </div>
          </section>

        </div>

        {/* フッター */}
        <div className="p-5 border-t bg-gray-50 shrink-0">
          <p className="text-[11px] font-bold text-gray-500 mb-4 text-center">
             「同意して始める」をクリックすることで、上記の利用規約および<br className="hidden sm:block"/>
             プライバシーポリシー、Cookieの使用に同意したものとみなされます。
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