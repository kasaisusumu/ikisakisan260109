"use client";

import React, { useState, useEffect } from 'react';
import { 
  Map as MapIcon, Calendar, Users, ArrowRight, Check, Copy, 
  Plane, Sparkles, Share2, ShieldCheck, Loader2, Send 
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

type Step = 'intro' | 'create' | 'share' | 'terms';

interface WelcomePageProps {
  inviteRoomId?: string | null;
}

// 安全なUUID生成関数
const generateUUID = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

export default function WelcomePage({ inviteRoomId }: WelcomePageProps) {
  const router = useRouter();
  
  // ステート管理
  const [step, setStep] = useState<Step>(inviteRoomId ? 'terms' : 'intro');
  const [isLoading, setIsLoading] = useState(false);
  const [roomName, setRoomName] = useState(''); // 旅行名
  const [userName, setUserName] = useState(''); // 自分の名前
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // 空文字も許容するため <number | string>
  const [adultNum, setAdultNum] = useState<number | string>(2);
  
  const [generatedRoomId, setGeneratedRoomId] = useState<string | null>(inviteRoomId || null);
  const [shareUrl, setShareUrl] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [inviteRoomName, setInviteRoomName] = useState<string>('');

  // 招待された場合のデータ取得
  useEffect(() => {
    if (inviteRoomId) {
      const fetchRoom = async () => {
        try {
            const { data, error } = await supabase.from('rooms').select('name').eq('id', inviteRoomId).single();
            if (data) {
              setInviteRoomName(data.name);
              setStep('terms'); 
            }
        } catch(e) {
            console.error("Invalid Room ID", e);
        }
      };
      fetchRoom();
    }
  }, [inviteRoomId]);

  // 旅行を作成する処理
  const handleCreateTrip = async () => {
    if (!roomName || !userName) return alert('旅行名とあなたの名前を入力してください');
    
    setIsLoading(true);
    
    // 互換性のある関数を使ってUUIDを生成
    const newRoomId = generateUUID();
    
    // 1. Supabaseにルーム作成
    const { error } = await supabase.from('rooms').insert({
      id: newRoomId,
      name: roomName,
      created_by: userName
    });

    if (error) {
      console.error("Supabase Error:", error);
      alert(`エラーが発生しました: ${error.message}`);
      setIsLoading(false);
      return;
    }

    // 2. ローカルストレージに設定を保存
    localStorage.setItem(`rh_settings_${newRoomId}`, JSON.stringify({
      start: startDate,
      end: endDate,
      // 保存時は必ず数値に戻す
      adultNum: Number(adultNum) || 1
    }));
    
    // ユーザー名を保存
    localStorage.setItem(`route_hacker_user_${newRoomId}`, userName);

    setGeneratedRoomId(newRoomId);
    
    // シェア用URLの生成
    if (typeof window !== 'undefined') {
      const url = `${window.location.origin}?room=${newRoomId}`;
      setShareUrl(url);
    }
    
    setIsLoading(false);
    setStep('share');
  };

  // シェア用メッセージの生成
  const getShareMessage = () => {
    return `「${roomName}」のしおりを作りました！\nここから参加して一緒に計画しよう✈️\n${shareUrl}`;
  };

  // リンクをコピー (説明文付き)
  const copyLink = async () => {
    const textToCopy = getShareMessage();
    
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = textToCopy;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
          document.execCommand('copy');
        } catch (err) {
          console.error('Fallback copy failed', err);
          alert('コピーできませんでした。');
          return;
        }
        document.body.removeChild(textArea);
      }
      
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed', err);
      alert('コピーできませんでした。');
    }
  };

  // LINEで送る
  const shareToLine = () => {
    const text = getShareMessage();
    // LINEのURLスキームを使ってメッセージ画面を開く
    window.open(`https://line.me/R/msg/text/?${encodeURIComponent(text)}`, '_blank');
  };

  // 参加処理（招待・作成共通）
  const handleJoin = () => {
    if (!userName && inviteRoomId) return alert('名前を入力してください');
    
    if (inviteRoomId) {
       localStorage.setItem(`route_hacker_user_${inviteRoomId}`, userName);
       window.location.href = `/?room=${inviteRoomId}`;
    } else if (generatedRoomId) {
       window.location.href = `/?room=${generatedRoomId}`;
    }
  };

  // --- Step 1: イントロダクション ---
  if (step === 'intro') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center relative overflow-hidden">
        <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-blue-200 rounded-full blur-3xl opacity-30"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-96 h-96 bg-purple-200 rounded-full blur-3xl opacity-30"></div>

        <div className="max-w-md w-full relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="mb-8 flex justify-center">
             <div className="w-20 h-20 bg-white rounded-3xl shadow-xl flex items-center justify-center transform -rotate-6">
                <Plane className="text-blue-600" size={40} />
             </div>
          </div>
          
          <h1 className="text-4xl font-black text-slate-800 mb-4 tracking-tight">
            旅のしおりを<br/><span className="text-blue-600">みんなで作ろう</span>
          </h1>
          <p className="text-slate-500 mb-10 leading-relaxed font-medium">
            行きたい場所をマップに追加して、<br/>
            AIと一緒に最適なルートを見つけましょう。<br/>
            URLを共有すれば、友達と同時編集できます。
          </p>

          <div className="grid grid-cols-1 gap-4 mb-10 text-left">
            <FeatureItem icon={<MapIcon size={20}/>} title="マップで直感的に" desc="気になる場所をポチッと追加" />
            <FeatureItem icon={<Sparkles size={20}/>} title="AIがルート提案" desc="効率的な巡り方を自動計算" />
            <FeatureItem icon={<Share2 size={20}/>} title="リアルタイム共有" desc="URLを送るだけで共同編集" />
          </div>

          <button 
            onClick={() => setStep('create')}
            className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold text-lg shadow-lg hover:bg-slate-800 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            しおりを作る <ArrowRight size={20}/>
          </button>
        </div>
      </div>
    );
  }

  // --- Step 2: 旅行情報の入力 ---
  if (step === 'create') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center p-6 relative">
         <div className="w-full max-w-md mt-10 animate-in slide-in-from-right-8 fade-in duration-500">
            <button onClick={() => setStep('intro')} className="text-slate-400 font-bold text-sm mb-6 hover:text-slate-600 transition">← 戻る</button>
            
            <h2 className="text-2xl font-black text-slate-800 mb-2">新しい旅行を作成</h2>
            <p className="text-slate-500 text-sm mb-8">基本情報を入力してください（後で変更可能）</p>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">旅行のタイトル</label>
                <input 
                  autoFocus
                  type="text" 
                  placeholder="例：卒業旅行 in 京都 🍵" 
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  className="w-full bg-slate-50 p-4 rounded-2xl font-bold text-lg text-slate-800 border-2 border-transparent focus:border-blue-500 focus:bg-white transition outline-none"
                />
              </div>

              <div className="space-y-2">
                 <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">あなたの名前（ニックネーム）</label>
                 <input 
                   type="text" 
                   placeholder="例：たろう" 
                   value={userName}
                   onChange={(e) => setUserName(e.target.value)}
                   className="w-full bg-slate-50 p-4 rounded-2xl font-bold text-lg text-slate-800 border-2 border-transparent focus:border-blue-500 focus:bg-white transition outline-none"
                 />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1"><Calendar size={12}/> 開始日</label>
                  <input type="date" value={startDate} onChange={(e)=>setStartDate(e.target.value)} className="w-full bg-slate-50 p-3 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100"/>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1"><Calendar size={12}/> 終了日</label>
                  <input type="date" value={endDate} onChange={(e)=>setEndDate(e.target.value)} className="w-full bg-slate-50 p-3 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100"/>
                </div>
              </div>

              <div className="space-y-2">
                 <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1"><Users size={12}/> 人数</label>
                 <div className="relative">
                    <input 
                      type="number" 
                      min="1" 
                      placeholder="人数"
                      value={adultNum} 
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "") {
                          setAdultNum("");
                        } else {
                          const num = parseInt(val);
                          if (!isNaN(num)) setAdultNum(num);
                        }
                      }}
                      className="w-full bg-slate-50 p-4 rounded-2xl font-bold text-lg text-slate-800 border-2 border-transparent focus:border-blue-500 focus:bg-white transition outline-none"
                    />
                    <div className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 font-bold pointer-events-none">
                      名
                    </div>
                 </div>
              </div>
            </div>

            <div className="mt-10">
              <button 
                onClick={handleCreateTrip}
                disabled={!roomName || !userName || isLoading}
                className={`w-full py-4 rounded-2xl font-bold text-lg shadow-xl transition-all flex items-center justify-center gap-2
                  ${(!roomName || !userName || isLoading) ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700 hover:scale-[1.02] active:scale-95'}
                `}
              >
                {isLoading ? <Loader2 className="animate-spin"/> : '次へ進む'}
              </button>
            </div>
         </div>
      </div>
    );
  }

  // --- Step 3: URL共有 ---
  if (step === 'share') {
    return (
      <div className="min-h-screen bg-blue-600 flex flex-col items-center justify-center p-6 relative">
         <div className="w-full max-w-md bg-white rounded-[2rem] p-8 shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="flex flex-col items-center text-center mb-8">
               <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4">
                 <Check size={32} strokeWidth={3} />
               </div>
               <h2 className="text-2xl font-black text-slate-800">しおりを作成しました！</h2>
               <p className="text-slate-500 mt-2 font-medium">友達にリンクを送って<br/>一緒に編集しましょう。</p>
            </div>

            {/* LINEで送るボタン (メイン) */}
            <button 
              onClick={shareToLine}
              className="w-full bg-[#06C755] text-white py-4 rounded-2xl font-bold text-lg shadow-lg hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 mb-4"
            >
              <Send size={20} /> LINEで送る
            </button>

            <div className="bg-slate-100 p-4 rounded-xl flex items-center gap-3 mb-6 border border-slate-200">
               <div className="flex-1 overflow-hidden">
                  <p className="text-xs text-slate-400 font-bold mb-1">招待リンク</p>
                  <p className="text-sm font-bold text-slate-700 truncate">{shareUrl}</p>
               </div>
               <button 
                 onClick={copyLink}
                 className={`p-3 rounded-xl transition-all font-bold text-sm shrink-0 flex flex-col items-center justify-center w-16
                    ${isCopied ? 'bg-slate-700 text-white' : 'bg-white text-slate-700 shadow-sm hover:bg-slate-50'}
                 `}
               >
                 {isCopied ? <Check size={18}/> : <Copy size={18}/>}
                 <span className="text-[10px] mt-1">{isCopied ? 'OK' : 'コピー'}</span>
               </button>
            </div>

            <button 
              onClick={() => setStep('terms')}
              className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold text-lg shadow-lg hover:scale-[1.02] active:scale-95 transition-all"
            >
              計画を始める
            </button>
         </div>
      </div>
    );
  }

  // --- Step 4 (Invite/Terms): 規約と開始 ---
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 relative">
       <div className="w-full max-w-md bg-white rounded-[2rem] p-8 shadow-xl animate-in slide-in-from-bottom-4 duration-500">
          <div className="text-center mb-8">
             <h2 className="text-xl font-black text-slate-800 mb-2">
               {inviteRoomId ? `「${inviteRoomName || '旅行'}」に参加` : 'あと少しで完了です'}
             </h2>
             <p className="text-sm text-slate-500">サービスを利用する前に確認してください</p>
          </div>

          {inviteRoomId && (
             <div className="mb-6 space-y-2">
                 <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">あなたの名前</label>
                 <input 
                   autoFocus
                   type="text" 
                   placeholder="ニックネームを入力" 
                   value={userName}
                   onChange={(e) => setUserName(e.target.value)}
                   className="w-full bg-slate-50 p-4 rounded-2xl font-bold text-lg text-slate-800 border-2 border-transparent focus:border-blue-500 focus:bg-white transition outline-none"
                 />
             </div>
          )}

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 mb-6 max-h-40 overflow-y-auto">
             <h3 className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1"><ShieldCheck size={12}/> 利用規約・免責事項</h3>
             <p className="text-[10px] text-slate-500 leading-relaxed">
               本サービスはベータ版であり、データの永続性を保証しません。入力された情報はブラウザのローカルストレージおよびデータベースに保存されます。個人を特定できる情報の入力は避けてください。生成されたAIの情報は不正確な場合があります。必ず公式サイト等で最新情報をご確認ください。
             </p>
          </div>

          <button 
            onClick={handleJoin}
            disabled={!!inviteRoomId && !userName}
            className={`w-full py-4 rounded-2xl font-bold text-lg shadow-lg transition-all
              ${(inviteRoomId && !userName) ? 'bg-slate-200 text-slate-400' : 'bg-blue-600 text-white hover:bg-blue-700 hover:scale-[1.02] active:scale-95'}
            `}
          >
            {inviteRoomId ? '参加する' : '同意してはじめる'}
          </button>
       </div>
    </div>
  );
}

// サブコンポーネント: 特徴リストアイテム
function FeatureItem({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
  return (
    <div className="flex items-center gap-4 bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
      <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div>
        <h3 className="font-bold text-slate-800">{title}</h3>
        <p className="text-xs text-slate-500">{desc}</p>
      </div>
    </div>
  );
}