"use client";

import React, { useState, useEffect } from 'react';
import { 
  Map as MapIcon, Calendar, Users, ArrowRight, Check, Copy, 
  Plane, Sparkles, Share2, ShieldCheck, Loader2, Send, 
  XCircle, AlertTriangle, MapPinned, PenTool, ThumbsUp,
  FileText, User, Lock, X, Plus
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

type Step = 'intro' | 'create' | 'share' | 'terms';
type ModalType = 'none' | 'terms' | 'privacy' | 'developer';

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
  const [roomName, setRoomName] = useState(''); 
  const [userName, setUserName] = useState(''); 
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  const [adultNum, setAdultNum] = useState<number | string>(2);
  
  const [generatedRoomId, setGeneratedRoomId] = useState<string | null>(inviteRoomId || null);
  const [shareUrl, setShareUrl] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [inviteRoomName, setInviteRoomName] = useState<string>('');
  
  const [existingMembers, setExistingMembers] = useState<string[]>([]);
  
  // モーダル表示管理
  const [activeModal, setActiveModal] = useState<ModalType>('none');

  // シークレットモード警告用
  const [showIncognitoWarning, setShowIncognitoWarning] = useState(true);

  // 招待された場合のデータ取得
  useEffect(() => {
    if (inviteRoomId) {
      const fetchRoomAndMembers = async () => {
        try {
            const { data: roomData, error } = await supabase.from('rooms').select('name, created_by').eq('id', inviteRoomId).single();
            
            if (roomData) {
              setInviteRoomName(roomData.name);
              setStep('terms'); 

              const members = new Set<string>();
              if (roomData.created_by) members.add(roomData.created_by);

              const { data: votes } = await supabase.from('votes').select('user_name').eq('room_id', inviteRoomId);
              votes?.forEach(v => v.user_name && members.add(v.user_name));

              const { data: spots } = await supabase.from('spots').select('added_by').eq('room_id', inviteRoomId);
              spots?.forEach(s => s.added_by && members.add(s.added_by));

              setExistingMembers(Array.from(members));
            }
        } catch(e) {
            console.error("Fetch error", e);
        }
      };
      fetchRoomAndMembers();
    }
  }, [inviteRoomId]);

  // 旅行を作成する処理
  const handleCreateTrip = async () => {
    if (!roomName || !userName) return alert('旅行名とあなたの名前を入力してください');
    
    setIsLoading(true);
    
    const newRoomId = generateUUID();
    
    const { error } = await supabase.from('rooms').insert({
      id: newRoomId,
      name: roomName,
      created_by: userName,
      start_date: startDate || null,
      end_date: endDate || null,
      adult_num: Number(adultNum) || 1
    });

    if (error) {
      console.error("Supabase Error:", error);
      alert(`エラーが発生しました: ${error.message}`);
      setIsLoading(false);
      return;
    }

    // ローカルストレージにも保存
    localStorage.setItem(`rh_settings_${newRoomId}`, JSON.stringify({
      start: startDate,
      end: endDate,
      adultNum: Number(adultNum) || 1
    }));
    
    localStorage.setItem(`route_hacker_user_${newRoomId}`, userName);

    setGeneratedRoomId(newRoomId);
    
    if (typeof window !== 'undefined') {
      const url = `${window.location.origin}?room=${newRoomId}`;
      setShareUrl(url);
    }
    
    setIsLoading(false);
    setStep('share');
  };

  const getShareMessage = () => {
    return `「${roomName}」のしおりを作りました！\nここから参加して一緒に計画しよう✈️\n${shareUrl}`;
  };

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
        try { document.execCommand('copy'); } catch (err) { alert('コピーできませんでした。'); return; }
        document.body.removeChild(textArea);
      }
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) { alert('コピーできませんでした。'); }
  };

  const shareToLine = () => {
    const text = getShareMessage();
    window.open(`https://line.me/R/msg/text/?${encodeURIComponent(text)}`, '_blank');
  };

 // 125行目あたりにある handleJoin 関数を探して修正

  const handleJoin = () => {
    if (!userName && inviteRoomId) return alert('名前を入力してください');
    
    // ▼▼▼ 追加: 規約に同意したフラグを保存（LegalModalと同じキーを使用） ▼▼▼
    const TERMS_VERSION = 'route_hacker_agreed_v1';
    localStorage.setItem(TERMS_VERSION, 'true');
    // ▲▲▲ 追加ここまで ▲▲▲

    if (inviteRoomId) {
       localStorage.setItem(`route_hacker_user_${inviteRoomId}`, userName);
       window.location.href = `/?room=${inviteRoomId}`;
    } else if (generatedRoomId) {
       window.location.href = `/?room=${generatedRoomId}`;
    }
  };

  // 警告モーダル
  const warningModal = showIncognitoWarning ? (
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
        <div className="bg-white w-full max-w-sm rounded-[2rem] p-8 shadow-2xl relative text-center border-4 border-red-100 animate-in zoom-in-95 duration-300" onClick={(e) => e.stopPropagation()}>
            <div className="w-20 h-20 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                <XCircle size={40} />
            </div>
            <h3 className="text-xl font-black text-gray-900 mb-4">シークレットモードではうまく動作しません！<br/>注意！</h3>
            <p className="text-sm text-gray-600 mb-6 leading-relaxed font-bold">
                このアプリはブラウザにデータを保存します。<br/><br/>
                <span className="text-red-500 bg-red-50 px-2 py-1 rounded">ブラウザを閉じるとデータが消えます</span><br/><br/>
                必ずURLをコピーして控えておくか、<br/>通常モードでご利用ください。
            </p>
            <button 
                onClick={() => setShowIncognitoWarning(false)} 
                className="w-full py-4 bg-gray-200 text-gray-600 rounded-2xl font-bold text-sm hover:bg-gray-300 transition"
            >
                理解してはじめる
            </button>
        </div>
    </div>
  ) : null;

  // 情報表示用モーダル (規約・プライバシー・運営者)
  const infoModal = activeModal !== 'none' ? (
    <div className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200" onClick={() => setActiveModal('none')}>
        <div className="bg-white w-full max-w-sm rounded-[2rem] p-8 shadow-2xl relative flex flex-col max-h-[70vh]" onClick={(e) => e.stopPropagation()}>
            <button 
                onClick={() => setActiveModal('none')} 
                className="absolute top-4 right-4 p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition"
            >
                <X size={20} className="text-gray-500"/>
            </button>
            
            <h3 className="text-xl font-black text-gray-900 mb-6 flex items-center gap-2">
                {activeModal === 'terms' && <><FileText className="text-emerald-500"/> 利用規約</>}
                {activeModal === 'privacy' && <><Lock className="text-emerald-500"/> プライバシーポリシー</>}
                {activeModal === 'developer' && <><User className="text-emerald-500"/> 運営者情報</>}
            </h3>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar text-sm text-gray-600 leading-relaxed space-y-4 pr-2">
                {activeModal === 'terms' && (
                    <>
                        <p>この利用規約（以下，「本規約」といいます。）は，MapWith（以下，「当社」といいます。）がこのウェブサイト上で提供するサービス（以下，「本サービス」といいます。）の利用条件を定めるものです。登録ユーザーの皆さま（以下，「ユーザー」といいます。）には，本規約に従って，本サービスをご利用いただきます。</p>
                        <p className="font-bold">第1条（適用）</p>
                        <p>本規約は，ユーザーと当社との間の本サービスの利用に関わる一切の関係に適用されるものとします。</p>
                        <p className="font-bold">第2条（禁止事項）</p>
                        <p>ユーザーは，本サービスの利用にあたり，以下の行為をしてはなりません。</p>
                        <ul className="list-disc pl-5 space-y-1">
                            <li>法令または公序良俗に違反する行為</li>
                            <li>犯罪行為に関連する行為</li>
                            <li>本サービスの内容等，本サービスに含まれる著作権，商標権ほか知的財産権を侵害する行為</li>
                            <li>他のユーザーに関する個人情報等を収集または蓄積する行為</li>
                        </ul>
                    </>
                )}
                {activeModal === 'privacy' && (
                    <>
                        <p className="font-bold">1. 個人情報の収集</p>
                        <p>本アプリは、サービスの提供に必要な範囲で、ユーザーの入力情報（ニックネーム、旅行計画データ等）をブラウザのローカルストレージおよびデータベースに保存します。</p>
                        <p className="font-bold">2. 情報の利用目的</p>
                        <p>収集した情報は、旅行計画の共有、AIによる提案、サービスの改善のために利用されます。</p>
                        <p className="font-bold">3. 第三者への提供</p>
                        <p>法令に基づく場合を除き、ユーザーの同意なく個人情報を第三者に提供することはありません。</p>
                        <p className="font-bold">4. 免責事項</p>
                        <p>本サービスはベータ版であり、データの完全な保存を保証するものではありません。重要なデータはご自身でバックアップを取ることを推奨します。</p>
                    </>
                )}
                {activeModal === 'developer' && (
                    <div className="text-center py-4">
                        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Plane className="text-emerald-600" size={32} />
                        </div>
                        <h4 className="font-bold text-lg text-gray-800">MapWith Team</h4>
                        <p className="text-xs text-gray-500 mt-2">
                            「旅の計画をもっと楽しく、もっと自由に」<br/>
                            そんな想いで開発しています。
                        </p>
                        <div className="mt-6 p-4 bg-gray-50 rounded-xl text-left">
                            <p className="font-bold text-xs text-gray-400 uppercase mb-2">Contact</p>
                            <p className="text-sm font-medium">support@mapwith.example.com</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    </div>
  ) : null;

  const onboardingSteps = [
    {
        title: "みんなで地図を作ろう",
        desc: "MapWithなら、リアルタイムで\n友達と同じ地図を囲めます。\n行き先をみんなで決めよう🗺️",
        visual: (
            <div className="relative w-40 h-40 mx-auto flex items-center justify-center">
                <div className="absolute inset-0 bg-emerald-100 rounded-full animate-pulse opacity-50"></div>
                <div className="w-32 h-32 bg-white rounded-full shadow-lg flex items-center justify-center relative border-4 border-emerald-50">
                    <MapIcon size={64} className="text-emerald-500" />
                    <div className="absolute -bottom-2 -right-2 bg-teal-500 text-white p-3 rounded-full border-4 border-white shadow-md">
                        <Users size={24} />
                    </div>
                    <div className="absolute -top-2 -left-2 bg-lime-500 text-white p-2 rounded-full border-4 border-white shadow-md">
                        <MapPinned size={20} />
                    </div>
                </div>
            </div>
        )
    },
    {
        title: "便利な機能がいっぱい",
        desc: "AIによるスポット提案、指で囲って宿検索、\nみんなで投票機能などが使えます✨",
        visual: (
            <div className="relative w-40 h-40 mx-auto flex items-center justify-center">
                <div className="w-32 h-32 bg-gradient-to-tr from-yellow-50 to-emerald-50 rounded-full shadow-lg flex items-center justify-center relative border-4 border-white">
                    <div className="grid grid-cols-2 gap-3 p-4">
                        <div className="flex flex-col items-center gap-1">
                            <div className="bg-purple-400 text-white p-2 rounded-xl shadow-sm"><Sparkles size={20}/></div>
                            <span className="text-[8px] font-bold text-purple-500">AI提案</span>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                            <div className="bg-orange-400 text-white p-2 rounded-xl shadow-sm"><PenTool size={20}/></div>
                            <span className="text-[8px] font-bold text-orange-500">囲って検索</span>
                        </div>
                        <div className="flex flex-col items-center gap-1 col-span-2">
                            <div className="bg-emerald-500 text-white p-2 rounded-xl shadow-sm"><ThumbsUp size={20}/></div>
                            <span className="text-[8px] font-bold text-emerald-600">投票</span>
                        </div>
                    </div>
                </div>
            </div>
        )
    },
    {
        title: "準備はOK？",
        desc: "さあ、最高の旅行プラン作りを\nMapWithではじめましょう！✈️",
        visual: (
            <div className="relative w-40 h-40 mx-auto flex items-center justify-center">
                <div className="absolute inset-0 bg-emerald-500/10 rounded-full animate-[spin_10s_linear_infinite]"></div>
                {/* 枠線を濃くして視認性を向上 */}
                <div className="w-32 h-32 bg-emerald-600 rounded-full shadow-xl flex items-center justify-center relative border-4 border-emerald-200 overflow-hidden group">
                    <Plane size={64} className="text-white relative z-10" />
                    <div className="absolute inset-0 bg-gradient-to-tr from-emerald-600 to-teal-400 opacity-80"></div>
                    {/* Clouds */}
                    <div className="absolute top-6 left-4 w-8 h-8 bg-white/20 rounded-full blur-md"></div>
                    <div className="absolute bottom-8 right-6 w-10 h-10 bg-white/20 rounded-full blur-md"></div>
                </div>
            </div>
        )
    }
  ];

  // 使い方ステップの定義
  const usageSteps = [
    {
      step: 1,
      title: "ルーム作成",
      desc: "旅行のタイトルや日程を決めて、\nあなただけのしおりを作成。",
      icon: <Plus size={24} className="text-white"/>,
      color: "bg-emerald-500"
    },
    {
      step: 2,
      title: "URLをシェア！",
      desc: "作成した旅行ページのURLを\nLINEなどで友達に送ります。",
      icon: <Share2 size={24} className="text-white"/>,
      color: "bg-teal-500"
    },
    {
      step: 3,
      title: "スポットを追加→みんなで計画！",
      desc: "マップ検索やAI提案から、\n行きたい場所をどんどん追加。",
      icon: <MapPinned size={24} className="text-white"/>,
      color: "bg-cyan-600"
    }
  ];

  // --- Step 1: イントロダクション ---
  if (step === 'intro') {
    return (
      <>
        {/* メインコンテンツ */}
        <div className="min-h-screen bg-slate-50 relative overflow-hidden flex flex-col">
            {/* 背景装飾 */}
            <div className="fixed top-[-10%] right-[-10%] w-96 h-96 bg-emerald-200 rounded-full blur-3xl opacity-30 pointer-events-none"></div>
            <div className="fixed bottom-[-10%] left-[-10%] w-96 h-96 bg-teal-200 rounded-full blur-3xl opacity-30 pointer-events-none"></div>

            {/* スクロール領域 */}
            <div className="flex-1 overflow-y-auto w-full custom-scrollbar pb-32">
                <div className="max-w-md w-full mx-auto p-6 text-center relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-700">
                    
                    {/* ヒーローセクション */}
                    <div className="mb-12 pt-10">
                        <div className="mb-8 flex justify-center">
                            <div className="w-24 h-24 bg-white rounded-[2rem] shadow-xl flex items-center justify-center transform -rotate-3 border-4 border-white/50">
                                <div className="relative w-full h-full flex items-center justify-center overflow-hidden rounded-[1.7rem]">
                                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-500 to-teal-600 opacity-10"></div>
                                    <Plane className="text-emerald-600 relative z-10" size={48} />
                                    <MapIcon className="text-emerald-200 absolute -bottom-2 -right-2 opacity-50" size={60} />
                                </div>
                            </div>
                        </div>
                        
                        <h1 className="text-4xl font-black text-slate-800 mb-4 tracking-tight leading-tight">
                            <span className="text-emerald-600 inline-block mb-1">MapWith</span><br/>
                            ーみんなで旅行計画ー
                        </h1>
                        <p className="text-slate-500 leading-relaxed font-medium">
                            「どこ行く？」から「ここ行こう！」まで。<br/>
                            MapWithは、友達と地図を囲むような<br/>
                            新しい旅行計画サイトです。
                        </p>
                    </div>

                    {/* 機能紹介リスト */}
                    <div className="space-y-4 text-left mb-16">
                        <FeatureItem icon={<MapIcon size={20}/>} title="マップで直感的に" desc="気になる場所をポチッと追加" />
                        <FeatureItem icon={<Sparkles size={20}/>} title="AIがスポットを提案" desc="人気の観光地を自動ピックアップ" />
                        <FeatureItem icon={<Share2 size={20}/>} title="リアルタイム共有" desc="URLを送るだけで共同編集" />
                    </div>

                    {/* 詳細な機能紹介 */}
                    <div className="space-y-20 pb-20 border-t border-slate-200 pt-16">
                        {onboardingSteps.map((s, i) => (
                            <div key={i} className="flex flex-col items-center text-center space-y-4">
                                <div className="mb-2">
                                    {s.visual}
                                </div>
                                <h3 className="text-2xl font-black text-slate-800">{s.title}</h3>
                                <p className="text-sm text-slate-500 font-bold leading-relaxed whitespace-pre-wrap">
                                    {s.desc}
                                </p>
                            </div>
                        ))}
                    </div>

                    {/* 使い方セクション */}
                    <div className="mb-16 border-t border-slate-200 pt-16">
                        <h3 className="text-xl font-black text-slate-800 mb-8 flex items-center justify-center gap-2">
                            <span className="bg-emerald-100 text-emerald-600 px-3 py-1 rounded-full text-xs">How to</span>
                            使い方はかんたん
                        </h3>
                        <div className="space-y-4 relative">
                            {usageSteps.map((item, idx) => (
                                <div key={idx} className="bg-white/80 backdrop-blur p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 relative overflow-hidden text-left hover:scale-[1.02] transition duration-300">
                                    <div className={`absolute top-0 left-0 w-1.5 h-full ${item.color}`}></div>
                                    <div className={`w-12 h-12 rounded-2xl ${item.color} flex items-center justify-center shrink-0 shadow-md rotate-3`}>
                                        {item.icon}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-1.5 rounded uppercase tracking-wider">STEP {item.step}</span>
                                        </div>
                                        <h4 className="font-bold text-slate-800">{item.title}</h4>
                                        <p className="text-[10px] text-slate-500 mt-1 leading-relaxed whitespace-pre-wrap font-medium">{item.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* フッターリンクエリア */}
                    <div className="flex flex-wrap items-center justify-center gap-4 mt-8 mb-4 pointer-events-auto border-t border-slate-200/50 pt-8">
                        <button onClick={() => setActiveModal('terms')} className="text-xs font-bold text-gray-400 hover:text-gray-600 transition">利用規約</button>
                        <button onClick={() => setActiveModal('privacy')} className="text-xs font-bold text-gray-400 hover:text-gray-600 transition">プライバシーポリシー</button>
                        <button onClick={() => setActiveModal('developer')} className="text-xs font-bold text-gray-400 hover:text-gray-600 transition">運営者情報</button>
                    </div>
                    <div className="text-[10px] text-gray-300 font-medium">
                        © 2024 MapWith
                    </div>

                </div>
            </div>

            {/* 固定ボタンエリア */}
            <div className="fixed bottom-0 left-0 w-full p-6 bg-gradient-to-t from-slate-50 via-slate-50/95 to-transparent z-50">
                <div className="max-w-md mx-auto">
                    <button 
                        onClick={() => setStep('create')}
                        className="w-full bg-emerald-800 text-white py-4 rounded-2xl font-bold text-lg shadow-xl hover:bg-emerald-900 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                        しおりを作る <ArrowRight size={20}/>
                    </button>
                </div>
            </div>
        </div>

        {/* モーダル群 (ルートの最後に配置して最前面に表示) */}
        {warningModal}
        {infoModal}
      </>
    );
  }

  // --- Step 2: 旅行情報の入力 ---
  if (step === 'create') {
    return (
      <>
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
                    className="w-full bg-slate-50 p-4 rounded-2xl font-bold text-lg text-slate-800 border-2 border-transparent focus:border-emerald-500 focus:bg-white transition outline-none"
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">あなたの名前（ニックネーム）</label>
                    <input 
                    type="text" 
                    placeholder="例：たろう" 
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    className="w-full bg-slate-50 p-4 rounded-2xl font-bold text-lg text-slate-800 border-2 border-transparent focus:border-emerald-500 focus:bg-white transition outline-none"
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1"><Calendar size={12}/> 開始日</label>
                    <input type="date" value={startDate} onChange={(e)=>setStartDate(e.target.value)} className="w-full bg-slate-50 p-3 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-100"/>
                    </div>
                    <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1"><Calendar size={12}/> 終了日</label>
                    <input type="date" value={endDate} onChange={(e)=>setEndDate(e.target.value)} className="w-full bg-slate-50 p-3 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-100"/>
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
                        className="w-full bg-slate-50 p-4 rounded-2xl font-bold text-lg text-slate-800 border-2 border-transparent focus:border-emerald-500 focus:bg-white transition outline-none"
                        />
                        <div className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 font-bold pointer-events-none">
                        名
                        </div>
                    </div>
                </div>
                </div>

                <div className="mt-10 mb-10">
                <button 
                    onClick={handleCreateTrip}
                    disabled={!roomName || !userName || isLoading}
                    className={`w-full py-4 rounded-2xl font-bold text-lg shadow-xl transition-all flex items-center justify-center gap-2
                    ${(!roomName || !userName || isLoading) ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-700 hover:scale-[1.02] active:scale-95'}
                    `}
                >
                    {isLoading ? <Loader2 className="animate-spin"/> : '次へ進む'}
                </button>
                </div>
            </div>
        </div>
        {warningModal}
        {infoModal}
      </>
    );
  }

  // --- Step 3: URL共有 ---
  if (step === 'share') {
    return (
      <>
        <div className="min-h-screen bg-emerald-600 flex flex-col items-center justify-center p-6 relative">
            <div className="w-full max-w-md bg-white rounded-[2rem] p-8 shadow-2xl animate-in zoom-in-95 duration-300">
                <div className="flex flex-col items-center text-center mb-8">
                <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4">
                    <Check size={32} strokeWidth={3} />
                </div>
                <h2 className="text-2xl font-black text-slate-800">しおりを作成しました！</h2>
                <p className="text-slate-500 mt-2 font-medium">友達にリンクを送って<br/>一緒に編集しましょう。</p>
                </div>

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
        {warningModal}
        {infoModal}
      </>
    );
  }

  // --- Step 4 (Invite/Terms): 規約と開始 ---
  return (
    <>
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
                        className={`w-full bg-slate-50 p-4 rounded-2xl font-bold text-lg text-slate-800 border-2 transition outline-none
                            ${existingMembers.includes(userName) ? 'border-red-500 focus:border-red-500 bg-red-50' : 'border-transparent focus:border-emerald-500 focus:bg-white'}
                        `}
                        />
                        {existingMembers.includes(userName) && (
                            <p className="text-xs font-bold text-red-500 flex items-center gap-1 animate-in slide-in-from-top-1 fade-in">
                                <AlertTriangle size={12} /> この名前は既に使用されています
                            </p>
                        )}
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
                    ${(inviteRoomId && !userName) ? 'bg-slate-200 text-slate-400' : 'bg-emerald-600 text-white hover:bg-emerald-700 hover:scale-[1.02] active:scale-95'}
                    `}
                >
                    {inviteRoomId ? '参加する' : '同意してはじめる'}
                </button>
            </div>
        </div>
        {warningModal}
        {infoModal}
    </>
  );
}

function FeatureItem({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
  return (
    <div className="flex items-center gap-4 bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
      <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div>
        <h3 className="font-bold text-slate-800">{title}</h3>
        <p className="text-xs text-slate-500">{desc}</p>
      </div>
    </div>
  );
}