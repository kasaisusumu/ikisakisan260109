"use client";

import { useState } from 'react';
import { MapPin, Users, Sparkles, CheckCircle, ArrowRight, Plane, Loader2, ShieldCheck, FileText } from 'lucide-react';

interface Props {
  onCreateRoom: (title: string) => Promise<void>;
  isCreating: boolean;
}

export default function LandingView({ onCreateRoom, isCreating }: Props) {
  const [title, setTitle] = useState("");
  const [isHuman, setIsHuman] = useState(false);
  const [agreed, setAgreed] = useState(false);

  // 全ての条件が揃ったか判定
  const canSubmit = title.trim().length > 0 && isHuman && agreed;

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans text-slate-800 flex flex-col">
      {/* ヘッダー */}
      <header className="px-6 py-6 flex justify-between items-center max-w-6xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 text-white p-2 rounded-xl shadow-md">
            <Plane size={24} strokeWidth={2.5} />
          </div>
          <span className="text-xl font-black tracking-tight text-slate-800">Route Hacker</span>
        </div>
        <nav className="hidden sm:flex gap-6 text-sm font-bold text-slate-500">
          <span className="cursor-default">機能</span>
          <span className="cursor-default">使い方</span>
        </nav>
      </header>

      {/* メインエリア */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center max-w-4xl mx-auto w-full">
        
        {/* キャッチコピー */}
        <div className="mb-10 animate-fade-in-up">
          <span className="inline-block bg-blue-100 text-blue-700 px-4 py-1.5 rounded-full text-xs font-black tracking-wider border border-blue-200 mb-6">
            ✨ AI搭載 旅行計画アプリ
          </span>
          <h1 className="text-4xl sm:text-6xl font-black mb-6 leading-[1.2] tracking-tight text-slate-900">
            その旅の計画、<br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">
              もっと自由に、賢く。
            </span>
          </h1>
          <p className="text-slate-500 text-lg mb-0 font-medium leading-relaxed max-w-xl mx-auto">
            URLをシェアするだけで、友だちとリアルタイム編集。<br/>
            地図、ホテル検索、ルート最適化までこれひとつで完結。
          </p>
        </div>

        {/* フォームカード */}
        <div className="bg-white p-8 sm:p-10 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.1)] w-full max-w-md border border-slate-100 relative overflow-hidden group animate-fade-in-up delay-100">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500"></div>
          
          <div className="space-y-6 text-left">
            <div>
              <label className="block text-xs font-black text-slate-400 mb-2 uppercase tracking-wider ml-1">旅行のタイトル</label>
              <input 
                type="text" 
                placeholder="例: 京都食い倒れツアー 🍵" 
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-lg font-bold outline-none focus:ring-4 focus:ring-blue-100/50 focus:border-blue-300 transition placeholder-slate-300 text-slate-800"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="space-y-3 pt-2">
              {/* ロボット認証（簡易） */}
              <label className="flex items-center gap-4 p-4 rounded-2xl border border-slate-200 cursor-pointer hover:bg-slate-50 hover:border-slate-300 transition select-none bg-slate-50/50">
                <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all duration-300 ${isHuman ? 'bg-green-500 border-green-500 scale-110' : 'border-slate-300 bg-white'}`}>
                  {isHuman && <CheckCircle size={16} className="text-white" />}
                </div>
                <input type="checkbox" className="hidden" checked={isHuman} onChange={() => setIsHuman(!isHuman)} />
                <span className="text-sm font-bold text-slate-600">私はロボットではありません 🤖</span>
              </label>

              {/* 利用規約 */}
              <label className="flex items-center gap-4 p-4 rounded-2xl border border-slate-200 cursor-pointer hover:bg-slate-50 hover:border-slate-300 transition select-none bg-slate-50/50">
                <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all duration-300 ${agreed ? 'bg-slate-900 border-slate-900 scale-110' : 'border-slate-300 bg-white'}`}>
                  {agreed && <CheckCircle size={16} className="text-white" />}
                </div>
                <input type="checkbox" className="hidden" checked={agreed} onChange={() => setAgreed(!agreed)} />
                <span className="text-sm font-medium text-slate-500">
                  <span className="underline hover:text-slate-800 font-bold flex items-center gap-1 inline-flex">利用規約 <FileText size={12}/></span> に同意する
                </span>
              </label>
            </div>

            <button 
              onClick={() => onCreateRoom(title)}
              disabled={!canSubmit || isCreating}
              className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black text-lg shadow-xl hover:bg-black hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2 mt-4"
            >
              {isCreating ? <Loader2 className="animate-spin" /> : <>はじめる <ArrowRight size={20} /></>}
            </button>
          </div>
        </div>
      </main>

      {/* 機能紹介セクション (Walica風イラスト) */}
      <section className="bg-white py-20 px-6 mt-12 border-t border-slate-100">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-3 gap-10">
            {[
              { icon: MapPin, title: "直感マップ操作", desc: "行きたい場所をタップするだけ。複雑な操作は一切不要です。", color: "bg-blue-100 text-blue-600" },
              { icon: Users, title: "みんなで編集", desc: "URLを送るだけで、誰でもすぐに旅の計画に参加できます。", color: "bg-green-100 text-green-600" },
              { icon: Sparkles, title: "AIルート提案", desc: "効率的な移動順序をAIが瞬時に計算して提案します。", color: "bg-purple-100 text-purple-600" }
            ].map((f, i) => (
              <div key={i} className="flex flex-col items-center text-center p-6 rounded-3xl hover:bg-slate-50 transition duration-300">
                <div className={`w-20 h-20 ${f.color} rounded-3xl shadow-sm flex items-center justify-center mb-6 transform rotate-3 hover:rotate-6 transition`}>
                  <f.icon size={36} />
                </div>
                <h3 className="text-xl font-black text-slate-800 mb-3">{f.title}</h3>
                <p className="text-slate-500 font-medium leading-relaxed text-sm">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="bg-slate-50 text-slate-400 py-10 text-center text-xs font-medium border-t border-slate-200">
        <p>© 2024 Route Hacker.</p>
      </footer>
    </div>
  );
}