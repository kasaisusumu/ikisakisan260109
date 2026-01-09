"use client";

import { useState, useRef } from 'react';
import { Copy, Check, FileText, Shield, Mail, Info, HelpCircle, ExternalLink, User, Download, Image as ImageIcon, Music } from 'lucide-react';
import html2canvas from 'html2canvas';

interface Props {
  spots: any[];
  
}

type Template = 'simple' | 'music' | 'retro';

export default function MenuView({ spots }: Props) {
  const printRef = useRef<HTMLDivElement>(null);
  const [template, setTemplate] = useState<Template>('simple');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  // ★ 修正: 安全なコピー機能 (HTTP環境対応)
  const handleCopyLink = () => {
    if (typeof window === 'undefined') return;
    
    const url = window.location.href;

    // モダンな方法 (HTTPS環境)
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
        .catch(() => {
          // 失敗したらフォールバック
          fallbackCopy(url);
        });
    } else {
      // 古い方法 (HTTP環境など)
      fallbackCopy(url);
    }
  };

  const fallbackCopy = (text: string) => {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      
      // 画面外に配置
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

  // 画像ダウンロード処理
  const handleDownload = async () => {
    if (!printRef.current) return;
    setIsGenerating(true);
    try {
      const canvas = await html2canvas(printRef.current, {
        // @ts-ignore
        backgroundColor: template === 'retro' ? '#fdf6e3' : '#ffffff',
        scale: 2,
        useCORS: true,
      });
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `route-hacker-${template}-${Date.now()}.png`;
      link.click();
    } catch (e) {
      alert("画像生成に失敗しました");
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleSection = (section: string) => {
    setActiveSection(activeSection === section ? null : section);
  };

  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

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
          <button 
            onClick={handleCopyLink}
            className={`px-4 rounded-lg font-bold text-white transition flex items-center gap-2 ${copied ? 'bg-green-500' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {copied ? <Check size={16}/> : <Copy size={16}/>}
          </button>
        </div>
        <p className="text-[10px] text-gray-400 mt-2">このURLをLINEなどで送って、友達を招待しましょう。</p>
      </div>

      {/* シェア画像作成 */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6">
        <h3 className="font-bold text-gray-700 mb-4 text-sm flex items-center gap-2"><ImageIcon size={16}/> 旅のしおり作成</h3>
        
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2 no-scrollbar">
            <button onClick={() => setTemplate('simple')} className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${template === 'simple' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200'}`}><FileText size={14}/> Simple</button>
            <button onClick={() => setTemplate('music')} className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${template === 'music' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}><Music size={14}/> Music</button>
            <button onClick={() => setTemplate('retro')} className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${template === 'retro' ? 'bg-orange-700 text-white border-orange-700' : 'bg-white text-gray-600 border-gray-200'}`}><ImageIcon size={14}/> Retro</button>
        </div>

        <button onClick={handleDownload} disabled={isGenerating || spots.length === 0} className="w-full bg-gradient-to-r from-pink-500 to-purple-600 text-white py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 shadow-md active:scale-95 transition disabled:opacity-50">
            {isGenerating ? '作成中...' : <><Download size={16}/> 画像を保存</>}
        </button>
      </div>

      {/* 2. 使い方ガイド */}
      <div className="mb-6">
        <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2 text-sm"><HelpCircle size={16}/> 使い方</h3>
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

      {/* 3. 法的情報・運営情報 */}
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

      {/* 4. お問い合わせ */}
      <div className="mt-auto text-center pb-8">
        <a 
          href="https://forms.gle/example" // ★ あなたのGoogleフォーム等のURLに書き換えてください
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

      {/* 隠しレンダリングエリア (画像生成用) */}
      <div className="absolute -top-[9999px] left-0">
        <div ref={printRef} className={`w-[375px] h-[667px] p-8 flex flex-col relative overflow-hidden ${template === 'simple' ? 'bg-white text-black' : template === 'music' ? 'bg-gradient-to-b from-gray-900 to-black text-white' : 'bg-[#f4ecd8] text-[#5c4033]'}`}>
          <div className="flex justify-between items-end mb-8 border-b-2 border-current pb-4">
            <div><p className="text-xs opacity-60">ROUTE HACKER</p><h1 className="text-3xl font-black tracking-tighter">TRIP PLAN</h1></div>
            <p className="text-sm font-bold">{today}</p>
          </div>
          <div className="flex-1 space-y-6">
            {spots.slice(0, 6).map((spot, i) => (
              <div key={i} className="flex gap-4 items-center">
                <span className={`text-xl font-bold opacity-50 ${template === 'music' ? 'font-mono' : ''}`}>{String(i + 1).padStart(2, '0')}</span>
                <div><p className={`font-bold text-lg leading-tight ${template === 'retro' ? 'font-serif' : ''}`}>{spot.name}</p><p className="text-xs opacity-60 line-clamp-1">{spot.description}</p></div>
              </div>
            ))}
          </div>
          <div className="mt-auto pt-6 border-t border-current flex justify-between items-center">
            <div><p className="text-[10px] opacity-60">TOTAL SPOTS</p><p className="text-xl font-bold">{spots.length}</p></div>
            <div className="text-right"><p className="text-[10px] opacity-60">GENERATED BY</p><p className="font-bold">Route Hacker AI</p></div>
          </div>
        </div>
      </div>

    </div>
  );
}