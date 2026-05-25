"use client";

import React, { useState, useEffect } from 'react';
import { 
  Map as MapIcon, Calendar, Users, ArrowRight, Check, Copy, 
  Plane, Sparkles, Share2, ShieldCheck, Loader2, Send, 
  XCircle, AlertTriangle, MapPinned, PenTool, ThumbsUp,
  FileText, User, Lock, X, Plus, Clock, Trash2, ExternalLink, Mail,
  Smartphone, Zap, MessageCircle, Info // ← 末尾に Info を追加
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useRouter, useSearchParams } from 'next/navigation';
import { tutorialSteps } from './TutorialData';

type Step = 'intro' | 'create' | 'share' | 'terms' | 'mapSearch';
type ModalType = 'none' | 'terms' | 'privacy' | 'developer' | 'contact';

type RoomHistoryItem = {
    id: string;
    name: string;
    lastVisited: number;
};

interface WelcomePageProps {
  inviteRoomId?: string | null;
}

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

const UD_COLORS = [
    '#F59E0B', '#3B82F6', '#10B981', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6',
    '#F97316', '#06B6D4', '#84CC16', '#EAB308', '#D946EF', '#64748B', '#A855F7', '#FB7185',
    '#22C55E', '#0EA5E9', '#F43F5E', '#78716C',
    '#B91C1C', '#1D4ED8', '#047857', '#B45309', '#6D28D9', '#BE185D', '#4338CA', '#0F766E',
    '#C2410C', '#0369A1', '#4D7C0F', '#A16207', '#A21CAF', '#334155', '#7E22CE', 
    '#15803D', '#0E7490', '#BE123C', '#F87171', '#60A5FA', '#34D399', '#FBBF24', '#A78BFA',
    '#F472B6', '#818CF8', '#2DD4BF', '#FB923C', '#38BDF8', '#A3E635', '#C084FC'
];

const getUserColor = (name: string) => {
    if (!name) return '#9CA3AF';
    let hash = 0;
    for (let i = 0; i < name.length; i++) { hash = name.charCodeAt(i) + ((hash << 5) - hash); }
    return UD_COLORS[Math.abs(hash) % UD_COLORS.length];
};

export default function WelcomePage({ inviteRoomId }: WelcomePageProps) {
  const router = useRouter();
  const searchParams = useSearchParams(); 
  const isDirectCreate = searchParams.get('step') === 'create'; 
  
  const [step, setStep] = useState<Step>(inviteRoomId ? 'terms' : (isDirectCreate ? 'create' : 'intro'));
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
  
  const [activeModal, setActiveModal] = useState<ModalType>('none');
  const [roomHistory, setRoomHistory] = useState<RoomHistoryItem[]>([]);

  const [showIncognitoWarning, setShowIncognitoWarning] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [isSubmittingContact, setIsSubmittingContact] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
        try {
            const historyStr = localStorage.getItem('rh_room_history');
            if (historyStr) {
                const parsed: RoomHistoryItem[] = JSON.parse(historyStr);
                parsed.sort((a, b) => b.lastVisited - a.lastVisited);
                setRoomHistory(parsed);
            }
        } catch (e) {
            console.error(e);
        }
    }
  }, []);

  const handleDeleteRoom = (e: React.MouseEvent, roomId: string) => {
    e.stopPropagation(); 
    if (!confirm("この旅の履歴を削除しますか？\n（復元することはできません）")) return;

    const newHistory = roomHistory.filter(room => room.id !== roomId);
    setRoomHistory(newHistory);
    
    if (typeof window !== 'undefined') {
      localStorage.setItem('rh_room_history', JSON.stringify(newHistory));
    }
  };

  const checkIncognitoAndExecute = async (action: () => void) => {
    let isIncognito = false;
    if ('storage' in navigator && 'estimate' in navigator.storage) {
        try {
            const { quota } = await navigator.storage.estimate();
            if (quota && quota < 120 * 1024 * 1024) isIncognito = true;
        } catch (e) {}
    }
    if (!isIncognito) {
        try {
            const testKey = '__test_incognito__';
            localStorage.setItem(testKey, '1');
            localStorage.removeItem(testKey);
        } catch (e) {
            isIncognito = true;
        }
    }

    if (isIncognito) {
        setPendingAction(() => action);
        setShowIncognitoWarning(true);
    } else {
        action();
    }
  };

  const handleAcceptWarning = () => {
      setShowIncognitoWarning(false);
      if (pendingAction) {
          pendingAction();
          setPendingAction(null);
      }
  };

  useEffect(() => {
    if (inviteRoomId) {
      const fetchRoomAndMembers = async () => {
        try {
            const { data: roomData } = await supabase.from('rooms').select('name, created_by').eq('id', inviteRoomId).single();
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

    try {
      const trialSpotsStr = localStorage.getItem('rh_trial_spots');
      if (trialSpotsStr) {
        const trialSpots = JSON.parse(trialSpotsStr);
        if (Array.isArray(trialSpots) && trialSpots.length > 0) {
          const now = new Date().toISOString();
          const spotsToInsert = trialSpots.map((spot: any, index: number) => {
            const { id, room_id, ...rest } = spot; 
            return { ...rest, room_id: newRoomId, added_by: userName, created_at: now, updated_at: now, order: index };
          });
          
          const { data: insertedSpots, error: insertError } = await supabase.from('spots').insert(spotsToInsert).select();

          if (!insertError && insertedSpots && insertedSpots.length > 0) {
            const votesToInsert = insertedSpots.map(spot => ({
              room_id: newRoomId, spot_id: spot.id, user_name: userName, vote_type: 'like'
            }));
            await supabase.from('votes').insert(votesToInsert);
            localStorage.removeItem('rh_trial_spots');
            localStorage.removeItem('rh_trial_votes');
          }
        }
      }
    } catch (e) {
      console.error("Failed to import trial data", e);
    }

    localStorage.setItem(`rh_settings_${newRoomId}`, JSON.stringify({ start: startDate, end: endDate, adultNum: Number(adultNum) || 1 }));
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

  const handleJoin = () => {
    if (!userName && inviteRoomId) return alert('名前を入力してください');
    const TERMS_VERSION = 'route_hacker_agreed_v1';
    localStorage.setItem(TERMS_VERSION, 'true');
    if (inviteRoomId) {
       localStorage.setItem(`route_hacker_user_${inviteRoomId}`, userName);
       window.location.href = `/?room=${inviteRoomId}`;
    } else if (generatedRoomId) {
       window.location.href = `/?room=${generatedRoomId}`;
    }
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingContact(true);

    try {
      const { error } = await supabase
        .from('contacts')
        .insert([{ name: contactName, email: contactEmail, message: contactMessage }]);

      if (error) throw error;

      alert('お問い合わせを受け付けました。ご記入ありがとうございます。');
      
      setContactName('');
      setContactEmail('');
      setContactMessage('');
      setActiveModal('none'); 

    } catch (error) {
      console.error('Contact submit error:', error);
      alert('送信に失敗しました。時間をおいて再度お試しください。');
    } finally {
      setIsSubmittingContact(false);
    }
  };

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
                onClick={handleAcceptWarning} 
                className="w-full py-4 bg-gray-200 text-gray-600 rounded-2xl font-bold text-sm hover:bg-gray-300 transition"
            >
                理解してはじめる
            </button>
        </div>
    </div>
  ) : null;

  const infoModal = activeModal !== 'none' ? (
    <div className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200" onClick={() => setActiveModal('none')}>
        <div className="bg-white w-full max-w-sm rounded-[2rem] p-8 shadow-2xl relative flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
            <button 
                onClick={() => setActiveModal('none')} 
                className="absolute top-4 right-4 p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition z-10"
            >
                <X size={20} className="text-gray-500"/>
            </button>
            
            <h3 className="text-xl font-black text-gray-900 mb-6 flex items-center gap-2">
                {activeModal === 'terms' && <><FileText className="text-emerald-500"/> 利用規約</>}
                {activeModal === 'privacy' && <><Lock className="text-emerald-500"/> プライバシーポリシー</>}
                {activeModal === 'developer' && <><User className="text-emerald-500"/> 運営者情報</>}
                {activeModal === 'contact' && <><Mail className="text-emerald-500"/> お問い合わせ</>}
            </h3>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar text-sm text-gray-600 leading-relaxed pr-2">
                {activeModal === 'terms' && (
                    <div className="space-y-4 text-xs">
                        <p>
                            この利用規約（以下、「本規約」といいます。）は、MapWith開発チーム（以下、「運営者」といいます。）が提供する旅行計画共有サービス「MapWith」（以下、「本サービス」といいます。）の利用条件を定めるものです。ユーザーの皆様には、本規約に従って本サービスをご利用いただきます。
                        </p>
                        <div>
                            <p className="font-bold text-gray-800">第1条（適用）</p>
                            <p>本規約は、ユーザーと運営者との間の本サービスの利用に関わる一切の関係に適用されるものとします。</p>
                        </div>
                        <div>
                            <p className="font-bold text-gray-800">第2条（サービスの提供と変更）</p>
                            <p>1. 本サービスは現在ベータ版（開発中）として提供されています。運営者は、ユーザーに事前に通知することなく、本サービスの内容を変更、追加、または提供を中止することができるものとします。</p>
                            <p>2. 運営者は、システムの保守、点検、その他の理由により、本サービスの提供を一時的に中断することがあります。</p>
                        </div>
                        <div>
                            <p className="font-bold text-gray-800">第3条（禁止事項）</p>
                            <p>ユーザーは、本サービスの利用にあたり、以下の行為をしてはなりません。</p>
                            <ul className="list-disc pl-5 mt-1 space-y-1">
                                <li>法令または公序良俗に違反する行為</li>
                                <li>犯罪行為に関連する行為</li>
                                <li>本サービスに含まれる著作権、商標権等の知的財産権を侵害する行為</li>
                                <li>サーバーやネットワークシステムに過度な負荷をかける行為（スクレイピング等を含む）</li>
                                <li>他のユーザーに関する個人情報等を不正に収集または蓄積する行為</li>
                            </ul>
                        </div>
                        <div>
                            <p className="font-bold text-gray-800">第4条（免責事項）</p>
                            <p>1. 本サービス内で提供されるAIによる提案やルート計算等は不正確な情報が含まれる場合があります。施設の営業情報等は必ず公式サイト等でご確認ください。</p>
                            <p>2. 本サービスはデータの永続的な保存を保証しません。予期せぬ不具合等によりデータが消失する可能性があるため、重要な情報はご自身でバックアップを取得してください。</p>
                            <p>3. 運営者は、本サービスの利用によって生じたユーザーのいかなる損害についても、一切の責任を負いません。</p>
                        </div>
                        <div>
                            <p className="font-bold text-gray-800">第5条（広告およびアフィリエイトについて）</p>
                            <p>本サービスでは、運営継続のため楽天トラベルアフィリエイト等の広告プログラムを利用しています。リンクを経由して予約が成立した場合、運営者に成果報酬が発生することがあります。</p>
                        </div>
                    </div>
                )}
                {activeModal === 'privacy' && (
                    <div className="space-y-4 text-xs">
                        <p>運営者は、本サービスにおけるユーザーの情報の取扱いについて、以下のとおりプライバシーポリシーを定めます。</p>
                        <div>
                            <p className="font-bold text-gray-800">1. 収集する情報</p>
                            <p>本サービスでは、ユーザーが入力した情報（ニックネーム、旅行タイトル、日程、スポット情報、メモ等）および利用環境に関する情報（Cookie、アクセスログ等）を収集・保存します。</p>
                            <p className="mt-1 text-red-500 font-bold">※本名や住所などの機密性の高い個人情報は入力しないようお願いいたします。</p>
                        </div>
                        <div>
                            <p className="font-bold text-gray-800">2. 情報の利用目的</p>
                            <p>収集した情報は、本サービスの提供・維持（旅行計画のリアルタイム同期等）、利便性向上のための機能改善、および外部APIへの連携のために利用されます。</p>
                        </div>
                        <div>
                            <p className="font-bold text-gray-800">3. 外部APIへの情報提供</p>
                            <p>本サービスは機能提供のため、以下の外部サービスと通信を行います。</p>
                            <ul className="list-disc pl-5 mt-1 space-y-1 text-[11px]">
                                <li>OpenAI API (旅行プラン提案)</li>
                                <li>Mapbox API / OpenStreetMap (地図表示・ルート計算)</li>
                                <li>Google Maps Platform (スポット検索)</li>
                                <li>Rakuten Travel API (宿泊施設検索)</li>
                            </ul>
                        </div>
                        <div>
                            <p className="font-bold text-gray-800">4. 第三者提供</p>
                            <p>運営者は、法令に基づく場合を除き、ユーザーの事前の同意を得ることなく、収集したデータを第三者に提供することはありません。</p>
                        </div>
                    </div>
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
                            <a 
                                href="https://x.com/greenday__0504" 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-sm font-bold text-emerald-600 hover:text-emerald-700 transition flex items-center gap-1"
                            >
                                <ExternalLink size={14} />
                                @greenday__0504
                            </a>
                        </div>
                    </div>
                )}
                {activeModal === 'contact' && (
                    <form onSubmit={handleContactSubmit} className="space-y-4 pb-2">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-500">お名前</label>
                            <input 
                                type="text" 
                                required 
                                value={contactName}
                                onChange={(e) => setContactName(e.target.value)}
                                className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-emerald-500 transition" 
                                placeholder="例: 山田 太郎" 
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-500">メールアドレス</label>
                            <input 
                                type="email" 
                                required 
                                value={contactEmail}
                                onChange={(e) => setContactEmail(e.target.value)}
                                className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-emerald-500 transition" 
                                placeholder="例: email@example.com" 
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-500">お問い合わせ内容</label>
                            <textarea 
                                required 
                                value={contactMessage}
                                onChange={(e) => setContactMessage(e.target.value)}
                                className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 text-sm h-32 outline-none focus:border-emerald-500 resize-none transition" 
                                placeholder="ご意見や不具合の報告などをご記入ください..."
                            />
                        </div>
                        <button 
                            type="submit" 
                            disabled={isSubmittingContact}
                            className={`w-full py-3.5 rounded-xl font-bold text-sm shadow-md transition-all flex justify-center items-center gap-2
                                ${isSubmittingContact ? 'bg-emerald-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700 active:scale-95'} text-white`}
                        >
                            {isSubmittingContact ? <Loader2 className="animate-spin" size={18} /> : '送信する'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    </div>
  ) : null;

  const usageSteps = [
    { step: 1, title: "しおりを作る", desc: "旅行の名前を決めて、\nあなただけの計画ページを作成。", icon: <Plus size={24} className="text-white"/>, color: "bg-emerald-500" },
    { step: 2, title: "友達に送る", desc: "URLをコピーしてLINEでシェア。\nログインなしですぐに参加可能！", icon: <MessageCircle size={24} className="text-white"/>, color: "bg-teal-500" },
    { step: 3, title: "一緒に計画！", desc: "マップ検索やAI提案から、\n行きたい場所をどんどん追加。", icon: <Users size={24} className="text-white"/>, color: "bg-cyan-600" }
  ];

if (step === 'intro') {
    return (
      <>
        <div className="h-[100dvh] w-full bg-slate-50 relative flex flex-col overflow-hidden">
            
            {/* --- ↓ここから追加：動く背景画像のカスタムアニメーション設定↓ --- */}
            <style>{`
                @keyframes float-left {
                    0%, 100% { transform: translateY(0px) rotate(-8deg) scale(1.0); }
                    50% { transform: translateY(-15px) rotate(-4deg) scale(1.0); }
                }
                @keyframes float-right {
                    0%, 100% { transform: translateY(0px) rotate(10deg) scale(1.0); }
                    50% { transform: translateY(15px) rotate(6deg) scale(1.0); }
                }
                .animate-float-left-slow {
                    animation: float-left 10s ease-in-out infinite;
                }
                .animate-float-right-slow {
                    animation: float-right 12s ease-in-out infinite;
                }
                .mask-fade-bottom-strong {
                    mask-image: linear-gradient(to bottom, black 20%, transparent 90%);
                    -webkit-mask-image: linear-gradient(to bottom, black 20%, transparent 90%);
                }
            `}</style>

            {/* 動く背景画像コンテナ：もっとアップで、より自然にフェードアウト */}
            <div className="absolute top-0 left-0 w-full h-[65vh] overflow-hidden pointer-events-none z-0 mask-fade-bottom-strong opacity-80">
                <img 
                    src="/images/feature_sync.jpg" 
                    alt="bg-feature-1" 
                    className="absolute -top-12 -left-20 w-72 rounded-[2.5rem] shadow-[0_10px_40px_rgba(0,0,0,0.1)] border-2 border-white/50 animate-float-left-slow"
                />
                <img 
                    src="/images/feature_hotel.jpg" 
                    alt="bg-feature-2" 
                    className="absolute top-20 -right-24 w-80 rounded-[2.5rem] shadow-[0_10px_40px_rgba(0,0,0,0.1)] border-2 border-white/50 animate-float-right-slow"
                />
            </div>
            {/* --- ↑ここまで追加↑ --- */}

            <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-emerald-200 rounded-full blur-3xl opacity-30 pointer-events-none z-0"></div>
            <div className="absolute bottom-[-10%] left-[-10%] w-96 h-96 bg-teal-200 rounded-full blur-3xl opacity-30 pointer-events-none z-0"></div>

          <div className="flex-1 overflow-y-auto w-full custom-scrollbar relative z-10">
                <div className="max-w-md w-full mx-auto p-6 text-center animate-in fade-in slide-in-from-bottom-8 duration-700">
                    
                    {/* ★ 変更：スクロール時にタイトルが上部に固定されるよう sticky と z-50 を追加。
                                固定時に上部が空きすぎないよう、余白(pt-20)を mt-16 と pt-4 に分割しました */}
                    <div className="mb-12 mt-16 pt-4 pb-4  top-0 z-50 relative">
                        {/* 文字の裏のぼかし背景：スクロール時に下の要素が透けすぎないよう backdrop-blur を追加し少し強化 */}
                        <div className="absolute inset-0 bg-white/80 backdrop-blur-md blur-2xl rounded-full z-[-1] scale-110"></div>

                        <div className="mb-6 flex justify-center">
                            {/* アイコンの背景もより不透明な白に変更 */}
                            <div className="w-20 h-20 bg-white/95 rounded-[1.5rem] shadow-xl flex items-center justify-center transform -rotate-3 border-4 border-white relative">
                                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500 to-teal-600 opacity-10 rounded-[1.5rem]"></div>
                                <Plane className="text-emerald-600 relative z-10" size={40} />
                                <Sparkles className="absolute -top-2 -right-2 text-amber-400 animate-pulse" size={24} />
                            </div>
                        </div>
                        
                        <h1 className="text-4xl font-black text-slate-800 mb-3 tracking-tight leading-tight">
                            <span className="text-emerald-600 drop-shadow-[0_1px_2px_rgba(0,0,0,0.1)]">MapWith</span>
                        </h1>
                        <p className="text-lg font-bold text-slate-700 tracking-wide mb-3 drop-shadow-[0_1px_2px_rgba(0,0,0,0.1)]">リンク1つで、最高の旅計画を。</p>
                        
                        <div className="flex flex-wrap justify-center gap-2 mt-4 relative z-10">
                            {/* バッジの背景をより不透明な白に変更し、テキストをはっきりさせる */}
                            <span className="bg-white text-emerald-700 text-[10px] font-black px-3 py-1 rounded-full border border-emerald-200 shadow-sm flex items-center gap-1">
                                <Zap size={10} fill="currentColor"/> ログイン不要
                            </span>
                            <span className="bg-white text-teal-700 text-[10px] font-black px-3 py-1 rounded-full border border-teal-200 shadow-sm flex items-center gap-1">
                                <Users size={10} fill="currentColor"/> 複数人で同時編集
                            </span>
                            <span className="bg-white text-cyan-700 text-[10px] font-black px-3 py-1 rounded-full border border-cyan-200 shadow-sm flex items-center gap-1">
                                <Smartphone size={10} fill="currentColor"/> アプリDL不要
                            </span>
                        </div>
                    </div>

                    <div className="mb-12 text-left bg-white/90 rounded-[2rem] p-6 border border-white/50 shadow-sm relative z-40">
                        <h3 className="text-base font-black text-slate-800 mb-6 flex items-center gap-2">
                            <span className="w-8 h-8 bg-emerald-500 text-white rounded-lg flex items-center justify-center shadow-md">
                                <Info size={18} />
                            </span>
                            簡単3stepでスタート
                        </h3>
                        <div className="space-y-5">
                            {usageSteps.map((item, idx) => (
                                <div key={idx} className="flex items-start gap-4 group">
                                    <div className={`w-12 h-12 rounded-2xl ${item.color} flex items-center justify-center shrink-0 shadow-lg transform group-hover:rotate-6 transition-transform`}>
                                        {item.icon}
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-sm text-slate-800 mb-1">{item.title}</h4>
                                        <p className="text-[10px] text-slate-500 leading-relaxed whitespace-pre-wrap font-medium">{item.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* --- ↓↓↓ ここから追加：画像付きの注目機能セクション ↓↓↓ --- */}
                    <div className="mb-12 text-left">
                        <h3 className="text-base font-black text-slate-800 mb-6 flex items-center gap-2">
                            <span className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center shadow-sm">
                                <Sparkles size={18} />
                            </span>
                            圧倒的に便利な独自機能
                        </h3>

                        <div className="space-y-6">
                            {/* 機能カード1：リアルタイム同期＆投票 */}
                            <div className="bg-white rounded-[2rem] p-4 shadow-lg border border-slate-100 relative group overflow-hidden">
                                <div className="bg-slate-50 rounded-[1.5rem] overflow-hidden mb-4 relative border border-slate-100">
                                    <img 
                                        src="/images/feature_sync.jpg" 
                                        alt="リアルタイム同期と投票機能" 
                                        className="w-full h-auto object-contain transform group-hover:scale-[1.02] transition-transform duration-500" 
                                    />
                                </div>
                                <div className="px-2 pb-2">
                                    <h4 className="text-lg font-black text-slate-800 mb-2">
                                        マップも、投票も。<br/>すべてが<span className="text-emerald-600">リアルタイム同期</span>
                                    </h4>
                                    <p className="text-xs text-slate-500 font-medium leading-relaxed">
                                        誰かがスポットを追加すると、全員の画面に一瞬で反映されます。行きたい場所には「いいね（投票）」をして、みんなの意見をマップ上で視覚化できます。
                                    </p>
                                </div>
                            </div>

                            {/* 機能カード2：宿検索＆散布図 */}
                            <div className="bg-white rounded-[2rem] p-4 shadow-lg border border-slate-100 relative group overflow-hidden">
                                <div className="bg-slate-50 rounded-[1.5rem] overflow-hidden mb-4 relative border border-slate-100">
                                    <img 
                                        src="/images/feature_hotel.jpg" 
                                        alt="なぞって検索と散布図" 
                                        className="w-full h-auto object-contain transform group-hover:scale-[1.02] transition-transform duration-500" 
                                    />
                                </div>
                                <div className="px-2 pb-2">
                                    <h4 className="text-lg font-black text-slate-800 mb-2">
                                        宿は、指で囲って探す。<br/>散布図で<span className="text-emerald-600">「コスパ最強」</span>の宿が<br/>一目瞭然
                                    </h4>
                                    <p className="text-xs text-slate-500 font-medium leading-relaxed">
                                        泊まりたいエリアをマップ上で指でなぞるだけで、一気に空室検索。結果は「評価 × 価格」の散布図になるので、一番コスパの良い宿を瞬時に見つけ出せます。
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                    {/* --- ↑↑↑ 追加ここまで ↑↑↑ --- */}

                    {/* --- ↓ FEATURESカードのイラスト改善版 ↓ --- */}
                    <div className="mb-12 relative">
                         <div className="flex items-center gap-2 mb-4 justify-between">
                            <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">Features</h3>
                            <p className="text-[10px] text-slate-400 font-bold">スワイプで詳しく 👉</p>
                        </div>

                        <div className="flex overflow-x-auto pb-6 px-4 gap-4 snap-x snap-mandatory -mx-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
                            {tutorialSteps.map((s, i) => (
                                <div key={i} className="snap-center shrink-0 w-[85%] max-w-[320px] bg-white p-6 rounded-[2rem] shadow-xl border border-slate-100 flex flex-col items-center text-center first:ml-2 last:mr-2">
                                    {/* ★変更ポイント：イラストコンテナ
                                        - イラストがつぶれないように、内側の svg や img に対して強制的にフィットさせるクラスを追加
                                        - transform scale-90 の不要なラッパーを削除し、直接イラストを描画
                                    */}
                                    <div className={`w-full h-40 rounded-2xl ${s.color} bg-opacity-10 mb-4 flex items-center justify-center relative overflow-hidden p-2
                                                     [&_svg]:max-h-full [&_svg]:max-w-full [&_svg]:h-auto [&_svg]:w-auto [&_svg]:flex-shrink-0
                                                     [&_img]:max-h-full [&_img]:max-w-full [&_img]:h-auto [&_img]:w-auto [&_img]:object-contain [&_img]:flex-shrink-0`}>
                                        {s.visual}
                                    </div>
                                    <h3 className="text-base font-black text-slate-800 mb-2">{s.title}</h3>
                                    <p className="text-[10px] text-slate-500 font-bold leading-relaxed whitespace-pre-wrap">
                                        {s.desc}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                    {/* --- ↑ 改善版ここまで ↑ --- */}

                    {roomHistory.length > 0 && (
                        <div className="mb-12 border-t border-slate-200 pt-10 text-left animate-in fade-in duration-500">
                            <h3 className="text-base font-black text-slate-800 mb-4 flex items-center gap-2">
                                <Clock className="text-emerald-500" size={20}/> 最近作成したしおり
                            </h3>
                            <div className="space-y-3">
                                {roomHistory.map((room) => (
                                    <div 
                                        key={room.id} 
                                        onClick={() => { window.location.href = `/?room=${room.id}`; }}
                                        className="flex items-center justify-between p-4 bg-white/80 backdrop-blur rounded-2xl shadow-sm border border-slate-200 cursor-pointer hover:border-emerald-300 hover:shadow-md hover:bg-white transition group active:scale-[0.98]"
                                    >
                                        <div className="overflow-hidden pr-4 w-full">
                                            <p className="font-bold text-slate-800 text-sm truncate group-hover:text-emerald-600 transition-colors">
                                                {room.name || "名称未設定の旅"}
                                            </p>
                                            <p className="text-[10px] text-slate-400 font-mono mt-1 flex items-center gap-1">
                                                {new Date(room.lastVisited).toLocaleDateString()}
                                                <ExternalLink size={10} className="inline opacity-50"/>
                                            </p>
                                        </div>
                                        <button 
                                            onClick={(e) => handleDeleteRoom(e, room.id)}
                                            className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition z-10 flex-shrink-0"
                                        >
                                            <Trash2 size={18}/>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex flex-wrap items-center justify-center gap-4 mt-8 mb-4 opacity-60">
                        <button onClick={() => setActiveModal('terms')} className="text-[10px] font-bold text-slate-400 hover:text-slate-600 transition">利用規約</button>
                        <button onClick={() => setActiveModal('privacy')} className="text-[10px] font-bold text-slate-400 hover:text-slate-600 transition">プライバシーポリシー</button>
                        <button onClick={() => setActiveModal('developer')} className="text-[10px] font-bold text-slate-400 hover:text-slate-600 transition">運営者情報</button>
                        <button onClick={() => setActiveModal('contact')} className="text-[10px] font-bold text-slate-400 hover:text-slate-600 transition">お問い合わせ</button>
                    </div>
                    <p className="text-[9px] text-slate-300 font-medium mb-12">© 2024 MapWith Team</p>

                    <div className="h-[220px] w-full shrink-0"></div>
                </div>
            </div>

           {/* ★ ボタンエリア：flex gap-3 で横並びに変更 */}
            <div className="absolute bottom-0 left-0 w-full p-4 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent z-20 pointer-events-none pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
                <div className="max-w-md mx-auto flex gap-3 pointer-events-auto">
                    <button 
                        onClick={() => checkIncognitoAndExecute(() => setStep('create'))}
                        className="flex-1 bg-emerald-600 text-white py-4 rounded-[1.2rem] font-black text-sm shadow-xl shadow-emerald-200 hover:bg-emerald-700 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                        しおりを作成 <ArrowRight size={18}/>
                    </button>

                    <button 
                        onClick={() => checkIncognitoAndExecute(() => router.push('/?trial=true'))}
                        className="flex-1 bg-white text-emerald-800 border-2 border-emerald-100 py-4 rounded-[1.2rem] font-bold text-xs shadow-sm hover:bg-emerald-50 active:scale-95 transition-all flex items-center justify-center gap-2 leading-tight"
                    >
                        <MapPinned size={16} className="shrink-0"/>
                        <span>機能をお試し</span>
                    </button>
                </div>
            </div>
        </div>

        {warningModal}
        {infoModal}
      </>
    );
  }

  if (step === 'create') {
    return (
      <>
        <div className="min-h-[100dvh] bg-slate-50 flex flex-col items-center justify-center p-4 relative overflow-hidden">
            {/* イントロ画面と統一感のある背景のふんわりした光 */}
            <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-emerald-200 rounded-full blur-3xl opacity-30 pointer-events-none z-0"></div>
            <div className="absolute bottom-[-10%] left-[-10%] w-96 h-96 bg-teal-200 rounded-full blur-3xl opacity-30 pointer-events-none z-0"></div>

            {/* 入力フォーム全体をすりガラス風の美しいカードに変更 */}
            <div className="w-full max-w-md bg-white/80 backdrop-blur-xl rounded-[2.5rem] p-8 shadow-2xl border border-white/80 relative z-10 animate-in zoom-in-95 fade-in duration-500 mt-8 mb-8">
                
                {/* 戻るボタンをカード左上の丸いアイコンボタンに */}
                <button onClick={() => setStep('intro')} className="absolute top-6 left-6 w-10 h-10 bg-white rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 shadow-sm border border-slate-100 transition-all hover:scale-105 active:scale-95">
                    <ArrowLeft size={18}/>
                </button>
                
                <div className="text-center mt-2 mb-8">
                    <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-[1.2rem] flex items-center justify-center mx-auto mb-4 shadow-inner transform -rotate-3 border-2 border-white">
                        <MapPinned size={32} />
                    </div>
                    <h2 className="text-2xl font-black text-slate-800 mb-2 tracking-tight">旅の始まり。</h2>
                    <p className="text-slate-500 text-xs font-bold">基本情報を入力してしおりを作成します</p>
                </div>

                <div className="space-y-6">
                    {/* 旅行のタイトル */}
                    <div className="space-y-2 group">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 group-focus-within:text-emerald-600 transition-colors">旅行のタイトル</label>
                        <input autoFocus type="text" placeholder="例：卒業旅行 in 京都 🍵" value={roomName} onChange={(e) => setRoomName(e.target.value)} className="w-full bg-white p-4 rounded-2xl font-bold text-base text-slate-800 border-2 border-slate-100 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all outline-none shadow-sm"/>
                    </div>
                    
                    {/* あなたの名前 */}
                    <div className="space-y-2 group">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 group-focus-within:text-emerald-600 transition-colors">あなたの名前</label>
                        <input type="text" placeholder="例：たろう" value={userName} onChange={(e) => setUserName(e.target.value)} className="w-full bg-white p-4 rounded-2xl font-bold text-base text-slate-800 border-2 border-slate-100 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all outline-none shadow-sm"/>
                    </div>

                    {/* 日程 */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2 group">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1.5 group-focus-within:text-emerald-600 transition-colors"><Calendar size={12}/> 開始日</label>
                            <input type="date" value={startDate} onChange={(e)=>setStartDate(e.target.value)} className="w-full bg-white p-3.5 rounded-2xl font-bold text-sm text-slate-700 border-2 border-slate-100 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all outline-none shadow-sm"/>
                        </div>
                        <div className="space-y-2 group">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1.5 group-focus-within:text-emerald-600 transition-colors"><Calendar size={12}/> 終了日</label>
                            <input type="date" value={endDate} onChange={(e)=>setEndDate(e.target.value)} className="w-full bg-white p-3.5 rounded-2xl font-bold text-sm text-slate-700 border-2 border-slate-100 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all outline-none shadow-sm"/>
                        </div>
                    </div>

                    {/* 人数 */}
                    <div className="space-y-2 group">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1.5 group-focus-within:text-emerald-600 transition-colors"><Users size={12}/> 人数</label>
                        <div className="relative">
                            <input type="number" min="1" placeholder="人数" value={adultNum} onChange={(e) => { const val = e.target.value; if (val === "") { setAdultNum(""); } else { const num = parseInt(val); if (!isNaN(num)) setAdultNum(num); } }} className="w-full bg-white p-4 rounded-2xl font-bold text-base text-slate-800 border-2 border-slate-100 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all outline-none shadow-sm"/>
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold pointer-events-none">名</div>
                        </div>
                    </div>
                </div>

                <div className="mt-8">
                    <button onClick={handleCreateTrip} disabled={!roomName || !userName || isLoading} className={`w-full py-4.5 rounded-[1.5rem] font-black text-base shadow-xl transition-all flex items-center justify-center gap-2 ${(!roomName || !userName || isLoading) ? 'bg-slate-100 text-slate-300 cursor-not-allowed shadow-none' : 'bg-emerald-600 text-white hover:bg-emerald-700 hover:scale-[1.02] active:scale-95 shadow-emerald-200'}`}>
                        {isLoading ? <Loader2 className="animate-spin"/> : <><Sparkles size={18}/> しおりを作成する</>}
                    </button>
                </div>
            </div>
        </div>
        {warningModal}
        {infoModal}
      </>
    );
  }

  if (step === 'share') {
    return (
      <>
        <div className="min-h-[100dvh] bg-emerald-600 flex flex-col items-center justify-center p-6 relative">
            <div className="w-full max-w-md bg-white rounded-[2.5rem] p-10 shadow-2xl animate-in zoom-in-95 duration-300">
                <div className="flex flex-col items-center text-center mb-10">
                    <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mb-6 shadow-inner">
                        <Check size={40} strokeWidth={3} />
                    </div>
                    <h2 className="text-2xl font-black text-slate-800 mb-2">準備完了！</h2>
                    <p className="text-slate-500 font-medium">友達を招待して<br/>一緒にワクワクを形にしましょう。</p>
                </div>

                <button onClick={shareToLine} className="w-full bg-[#06C755] text-white py-4.5 rounded-[1.5rem] font-black text-lg shadow-xl hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 mb-4">
                    <Send size={22} /> LINEで招待を送る
                </button>

                <div className="bg-slate-50 p-5 rounded-2xl flex items-center gap-3 mb-10 border border-slate-100">
                    <div className="flex-1 overflow-hidden">
                        <p className="text-[10px] text-slate-400 font-black uppercase mb-1">Invite Link</p>
                        <p className="text-sm font-bold text-slate-600 truncate">{shareUrl}</p>
                    </div>
                    <button onClick={copyLink} className={`p-4 rounded-2xl transition-all font-bold text-sm shrink-0 flex flex-col items-center justify-center w-20 h-20 ${isCopied ? 'bg-slate-800 text-white' : 'bg-white text-slate-700 shadow-sm border border-slate-100 hover:bg-slate-50'}`}>
                        {isCopied ? <Check size={24}/> : <Copy size={24}/>}
                        <span className="text-[10px] mt-1 font-black">{isCopied ? 'Copied' : 'Copy'}</span>
                    </button>
                </div>

                <button onClick={() => setStep('terms')} className="w-full bg-slate-900 text-white py-4.5 rounded-[1.5rem] font-black text-lg shadow-xl hover:bg-slate-800 hover:scale-[1.02] active:scale-95 transition-all">
                    計画をはじめる
                </button>
            </div>
        </div>
        {warningModal}
        {infoModal}
      </>
    );
  }

  return (
    <>
        <div className="min-h-[100dvh] bg-slate-50 flex flex-col items-center justify-center p-6 relative">
            <div className="w-full max-w-md bg-white rounded-[2.5rem] p-10 shadow-2xl animate-in slide-in-from-bottom-4 duration-500">
                <div className="text-center mb-10">
                    <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <ShieldCheck className="text-emerald-600" size={32} />
                    </div>
                    <h2 className="text-2xl font-black text-slate-800 mb-2">
                        {inviteRoomId ? `「${inviteRoomName || '旅行'}」に参加` : 'あと少しです'}
                    </h2>
                    <p className="text-sm text-slate-500 font-medium tracking-wide">
                        {inviteRoomId ? 'ニックネームを入力してください' : '利用条件を確認してください'}
                    </p>
                </div>

                {inviteRoomId && (
                    <div className="mb-8 space-y-3">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">あなたの名前</label>
                        <input autoFocus type="text" placeholder="例：たろう" value={userName} onChange={(e) => setUserName(e.target.value)} className={`w-full bg-slate-50 p-5 rounded-2xl font-bold text-lg text-slate-800 border-2 transition-all outline-none ${existingMembers.includes(userName) ? 'border-red-400 focus:border-red-400 bg-red-50' : 'border-transparent focus:border-emerald-500 focus:bg-white'}`}/>
                        {existingMembers.includes(userName) && (
                            <p className="text-[10px] font-bold text-red-500 flex items-center gap-1 mt-1 ml-1 animate-in slide-in-from-top-1 fade-in">
                                <AlertTriangle size={12} /> この名前はすでにメンバーに存在します
                            </p>
                        )}

                        {existingMembers.length > 0 && (
                            <div className="mt-8 bg-slate-50 rounded-2xl p-5 border border-slate-100">
                                <p className="text-[10px] font-black text-slate-400 mb-4 text-center uppercase tracking-widest">
                                    Members ({existingMembers.length})
                                </p>
                                <div className="flex flex-wrap justify-center gap-4">
                                    {existingMembers.map(member => (
                                        <div key={member} className="flex flex-col items-center gap-2">
                                            <div 
                                                className="w-12 h-12 rounded-2xl flex items-center justify-center text-white text-sm font-black shadow-sm ring-4 ring-white"
                                                style={{ backgroundColor: getUserColor(member) }}
                                            >
                                                {member.slice(0, 1)}
                                            </div>
                                            <span className="text-[10px] font-bold text-slate-600 truncate max-w-[60px]">
                                                {member}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 mb-8">
                    <h3 className="text-xs font-black text-slate-700 mb-3 flex items-center gap-2 uppercase tracking-wider">
                        <FileText size={14} className="text-slate-400"/> Legal & Privacy
                    </h3>
                    <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
                        本サービスは現在開発中のベータ版です。入力されたデータはブラウザおよびクラウドに保存され、メンバー間で共有されます。AIによる提案は不正確な場合があるため、必ず公式サイト等で最新情報をご確認ください。
                    </p>
                </div>

                <button onClick={() => checkIncognitoAndExecute(handleJoin)} disabled={!!inviteRoomId && (!userName || existingMembers.includes(userName))} className={`w-full py-5 rounded-[1.5rem] font-black text-lg shadow-xl transition-all ${(inviteRoomId && (!userName || existingMembers.includes(userName))) ? 'bg-slate-100 text-slate-300 cursor-not-allowed shadow-none' : 'bg-emerald-600 text-white hover:bg-emerald-700 hover:scale-[1.02] active:scale-95'}`}>
                    {inviteRoomId ? 'しおりに参加する' : '同意してはじめる'}
                </button>
            </div>
        </div>
        {warningModal}
        {infoModal}
    </>
  );
}

const ArrowLeft = ({ size, className }: { size: number, className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="m12 19-7-7 7-7M19 12H5"/>
    </svg>
);