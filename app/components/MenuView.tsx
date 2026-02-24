"use client";

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  Copy, Check, FileText, Shield, Mail, HelpCircle, 
  ExternalLink, User, Clock, Trash2, Plus, MessageCircle,
  PlayCircle // ★追加
} from 'lucide-react';

interface Props {
  spots: any[]; 
  onOpenTutorial: () => void; // ★追加: チュートリアルを開く関数を受け取る
}

type RoomHistoryItem = {
    id: string;
    name: string;
    lastVisited: number;
};

export default function MenuView({ spots, onOpenTutorial }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentRoomId = searchParams.get('room'); // URLから現在のルームIDを取得

  const [copied, setCopied] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  
  // 履歴関連のState
  const [roomHistory, setRoomHistory] = useState<RoomHistoryItem[]>([]);

  // 履歴の読み込み
  useEffect(() => {
      if (typeof window !== 'undefined') {
          try {
              const historyStr = localStorage.getItem('rh_room_history');
              if (historyStr) {
                  // 日付順（新しい順）にソートしておく
                  const parsed: RoomHistoryItem[] = JSON.parse(historyStr);
                  parsed.sort((a, b) => b.lastVisited - a.lastVisited);
                  setRoomHistory(parsed);
              }
          } catch (e) {
              console.error(e);
          }
      }
  }, []);

  // 履歴削除機能
  const handleDeleteRoom = (e: React.MouseEvent, roomId: string) => {
    e.stopPropagation(); // 親要素のクリックイベント（ルーム移動）を阻止
    
    if (!confirm("この旅の履歴を削除しますか？\n（復元することはできません）")) {
      return;
    }

    const newHistory = roomHistory.filter(room => room.id !== roomId);
    setRoomHistory(newHistory);
    
    if (typeof window !== 'undefined') {
      localStorage.setItem('rh_room_history', JSON.stringify(newHistory));
    }
  };

  // 新しい旅を作成（別タブ）
  const handleCreateNew = () => {
    window.open('/', '_blank');
  };

  // ルームを開く（別タブ）
  const handleOpenRoom = (roomId: string) => {
    // 現在のルームと同じなら何もしない
    if (roomId === currentRoomId) return; 
    window.open(`/?room=${roomId}`, '_blank');
  };

  // LINEでシェアする機能
  const handleShareLine = () => {
    if (typeof window === 'undefined') return;

    // 現在のルーム名を取得 (履歴から検索、なければデフォルト)
    const currentRoom = roomHistory.find(r => r.id === currentRoomId);
    const roomName = currentRoom ? currentRoom.name : '旅行';
    const url = window.location.href;

    // WelcomePageと同じ文言を作成
    const text = `「${roomName}」のしおりを作りました！\nここから参加して一緒に計画しよう✈️\n${url}`;

    // テキスト付きでLINE共有を開く
    window.open(`https://line.me/R/msg/text/?${encodeURIComponent(text)}`, '_blank');
  };

  // 安全なコピー機能 (HTTP環境対応)
  const handleCopyLink = () => {
    if (typeof window === 'undefined') return;
    
    const url = window.location.href;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
        .catch(() => fallbackCopy(url));
    } else {
      fallbackCopy(url);
    }
  };

  const fallbackCopy = (text: string) => {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.top = "0";
      textArea.style.left = "0";
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      
      if (successful) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        prompt("このURLをコピーしてください:", text);
      }
    } catch (err) {
      prompt("このURLをコピーしてください:", text);
    }
  };

  const toggleSection = (section: string) => {
    setActiveSection(activeSection === section ? null : section);
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 p-4 pb-24 overflow-y-auto">
      <h2 className="text-2xl font-bold mb-6 text-gray-800 flex items-center gap-2">
        ⚙️ メニュー & 設定
      </h2>

      {/* 1. 招待リンク共有 */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6">
        <h3 className="font-bold text-gray-700 mb-2 text-sm">友達を招待する</h3>
        <div className="flex gap-2">
          <input 
            readOnly 
            value={typeof window !== 'undefined' ? window.location.href : ''} 
            className="flex-1 bg-gray-100 text-xs p-3 rounded-lg text-gray-500 outline-none"
          />
          {/* コピーボタン */}
          <button 
            onClick={handleCopyLink}
            className={`px-4 rounded-lg font-bold text-white transition flex items-center gap-2 ${copied ? 'bg-green-500' : 'bg-blue-600 hover:bg-blue-700'}`}
            title="リンクをコピー"
          >
            {copied ? <Check size={16}/> : <Copy size={16}/>}
          </button>
          
          {/* LINE共有ボタン */}
          <button 
            onClick={handleShareLine}
            className="px-4 rounded-lg font-bold text-white transition flex items-center gap-2 bg-[#06C755] hover:bg-[#05b34c]"
            title="LINEで送る"
          >
            <MessageCircle size={16}/>
          </button>
        </div>
        <p className="text-[10px] text-gray-400 mt-2">このURLをLINEなどで送って、友達を招待しましょう。</p>
      </div>

      {/* 2. 新しい旅を作成 & 最近見た旅 */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6 animate-in slide-in-from-left-4">
          <h3 className="font-bold text-gray-700 mb-3 text-sm flex items-center gap-2">
              <Clock size={16} className="text-blue-500"/> 最近見た旅
          </h3>
          
          {/* 新しい旅を作成ボタン */}
          <button 
            onClick={handleCreateNew}
            className="w-full flex items-center justify-center gap-2 p-3 mb-3 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg font-bold text-sm transition border border-blue-200"
          >
            <Plus size={16} /> 新しい旅を作成
          </button>

          {/* 履歴リストエリア */}
          {roomHistory.length > 0 ? (
              <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1 custom-scrollbar">
                  {roomHistory.map((room) => {
                      // 現在のルームかどうか判定
                      const isCurrent = room.id === currentRoomId;

                      return (
                        <div 
                            key={room.id} 
                            onClick={() => handleOpenRoom(room.id)}
                            className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition active:scale-[0.98] border group relative shrink-0 ${
                                isCurrent 
                                    ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-200' // 現在地のスタイル
                                    : 'bg-gray-50 hover:bg-white border-transparent hover:border-blue-200' // 通常のスタイル
                            }`}
                        >
                            <div className="overflow-hidden pr-8 w-full">
                                <div className="flex items-center gap-2 mb-1">
                                    <p className={`font-bold text-sm truncate transition-colors ${
                                        isCurrent ? 'text-blue-700' : 'text-gray-800 group-hover:text-blue-600'
                                    }`}>
                                      {room.name || "名称未設定の旅"}
                                    </p>
                                    
                                    {/* NOWバッジ */}
                                    {isCurrent && (
                                        <span className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm animate-pulse flex-shrink-0">
                                            NOW
                                        </span>
                                    )}
                                </div>
                                <p className="text-[10px] text-gray-400 font-mono flex items-center gap-1">
                                    {new Date(room.lastVisited).toLocaleDateString()} 
                                    {!isCurrent && <ExternalLink size={10} className="inline"/>}
                                </p>
                            </div>
                            
                            {/* 削除ボタン */}
                            <button 
                              onClick={(e) => handleDeleteRoom(e, room.id)}
                              className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full transition z-10 flex-shrink-0"
                              title="履歴から削除"
                            >
                              <Trash2 size={16}/>
                            </button>
                        </div>
                      );
                  })}
              </div>
          ) : (
            <p className="text-center text-xs text-gray-400 py-2">閲覧履歴はありません</p>
          )}
      </div>

      {/* 3. 使い方ガイド */}
      <div className="mb-6">
        {/* ★修正: ヘッダー部分をflexにしてボタンを追加 */}
        <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-800 flex items-center gap-2 text-sm">
                <HelpCircle size={16}/> 使い方
            </h3>
            {/* ★追加: もう一度見るボタン */}
            <button 
                onClick={onOpenTutorial}
                className="flex items-center gap-1 bg-white text-blue-600 text-[10px] font-bold px-3 py-1.5 rounded-full border border-blue-100 shadow-sm hover:bg-blue-50 transition active:scale-95"
            >
                <PlayCircle size={12}/> もう一度見る
            </button>
        </div>
        
        <div className="space-y-2 text-xs text-gray-600 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="flex gap-3">
            <span className="bg-blue-100 text-blue-600 w-5 h-5 flex items-center justify-center rounded-full font-bold text-[10px] shrink-0">1</span>
            <p>「Map」タブで、行きたい場所を探して追加します。AIに相談してもOK！</p>
          </div>
          <div className="flex gap-3">
            <span className="bg-blue-100 text-blue-600 w-5 h-5 flex items-center justify-center rounded-full font-bold text-[10px] shrink-0">2</span>
            <p>「Vote」タブで、みんなが追加した候補をスワイプで投票します。</p>
          </div>
          <div className="flex gap-3">
            <span className="bg-blue-100 text-blue-600 w-5 h-5 flex items-center justify-center rounded-full font-bold text-[10px] shrink-0">3</span>
            <p>「Plan」タブで、AIが最適なルートとスケジュールを自動作成します。</p>
          </div>
        </div>
      </div>

      {/* 4. 法的情報・運営情報 */}
      <div className="space-y-2 mb-8">
        {/* 利用規約 */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <button onClick={() => toggleSection('terms')} className="w-full p-3 flex justify-between items-center text-left hover:bg-gray-50">
            <span className="font-bold text-xs text-gray-700 flex items-center gap-2"><FileText size={14}/> 利用規約</span>
            <span className="text-gray-400 text-[10px]">{activeSection === 'terms' ? '▲' : '▼'}</span>
          </button>
          {activeSection === 'terms' && (
            <div className="p-3 pt-0 text-[10px] text-gray-500 border-t border-gray-100 leading-relaxed">
              <p className="mb-2"><strong>第1条（適用）</strong><br/>本規約は、本サービスの利用に関する条件を定めるものです。</p>
              <p className="mb-2"><strong>第2条（禁止事項）</strong><br/>法令違反、公序良俗に反する行為、他者への迷惑行為等を禁止します。</p>
              <p><strong>第3条（免責）</strong><br/>本サービスは現状有姿で提供され、AIの提案内容やルート情報の正確性を保証しません。利用により生じた損害について運営者は責任を負いません。</p>
            </div>
          )}
        </div>

        {/* プライバシーポリシー */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <button onClick={() => toggleSection('privacy')} className="w-full p-3 flex justify-between items-center text-left hover:bg-gray-50">
            <span className="font-bold text-xs text-gray-700 flex items-center gap-2"><Shield size={14}/> プライバシーポリシー</span>
            <span className="text-gray-400 text-[10px]">{activeSection === 'privacy' ? '▲' : '▼'}</span>
          </button>
          {activeSection === 'privacy' && (
            <div className="p-3 pt-0 text-[10px] text-gray-500 border-t border-gray-100 leading-relaxed">
              <p className="mb-2"><strong>1. 情報の収集</strong><br/>本アプリは、入力された検索キーワード、位置情報（許可された場合）、Cookie等を収集します。</p>
              <p className="mb-2"><strong>2. 利用目的</strong><br/>サービスの提供、改善、およびアフィリエイト広告の効果測定のために利用します。</p>
              <p><strong>3. 第三者提供</strong><br/>法令に基づく場合を除き、同意なく第三者に個人情報を提供しません。</p>
            </div>
          )}
        </div>

        {/* 運営者情報 */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <button onClick={() => toggleSection('about')} className="w-full p-3 flex justify-between items-center text-left hover:bg-gray-50">
            <span className="font-bold text-xs text-gray-700 flex items-center gap-2"><User size={14}/> 運営者情報</span>
            <span className="text-gray-400 text-[10px]">{activeSection === 'about' ? '▲' : '▼'}</span>
          </button>
          {activeSection === 'about' && (
            <div className="p-3 pt-0 text-[10px] text-gray-500 border-t border-gray-100 leading-relaxed">
              <p><strong>運営:</strong> Route Hacker 開発チーム</p>
              <p><strong>所在地:</strong> 日本国内</p>
              <p><strong>連絡先:</strong> フォームよりお問い合わせください</p>
            </div>
          )}
        </div>
      </div>

      {/* 5. お問い合わせ */}
      <div className="mt-auto text-center pb-8">
        <a 
          href="https://forms.gle/example"
          target="_blank" 
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-blue-600 font-bold text-xs hover:underline"
        >
          <Mail size={14}/> お問い合わせはこちら <ExternalLink size={10}/>
        </a>
        <p className="text-[10px] text-gray-400 mt-2">
          © 2025 Route Hacker. All rights reserved.
        </p>
      </div>

    </div>
  );
}