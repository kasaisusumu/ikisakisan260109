"use client";

import React, { useState } from 'react';
import { 
  Map as MapIcon, Users, ArrowRight, ArrowLeft, Check, X, 
  Sparkles, PenTool, ThumbsUp, HelpCircle,
  Search, BedDouble, BarChart3, GripVertical, MoveHorizontal,
  Lightbulb, ListPlus, ListChecks
} from 'lucide-react';

interface Props {
  onClose: () => void;
  forceGuide?: boolean; // ★追加: 強制的にガイドモードで開くフラグ
}

export default function TutorialModal({ onClose, forceGuide = false }: Props) {
  // forceGuideがtrueなら最初からガイドモード、そうでなければ確認モード('ask')
  const [mode, setMode] = useState<'ask' | 'guide'>(forceGuide ? 'guide' : 'ask');
  const [step, setStep] = useState(0);

  const handleComplete = (dontShowAgain: boolean = true) => {
    if (dontShowAgain) {
      localStorage.setItem('rh_tutorial_seen', 'true');
    }
    onClose();
  };

  // --- スライドデータ (全6枚) ---
  const steps = [
    {
      title: "リアルタイムで地図を囲む",
      desc: "URLをシェアすれば、友達と同じ地図を\nリアルタイムで操作できます。\n「ここどう？」とピンを立てて会話しよう📍",
      color: "bg-blue-500",
      visual: (
        <div className="relative w-full h-48 flex items-center justify-center">
          {/* Central Map */}
          <div className="absolute w-24 h-24 bg-white rounded-2xl shadow-lg border-2 border-blue-100 flex items-center justify-center z-10">
            <MapIcon className="text-blue-500" size={40} />
            {/* Pins */}
            <div className="absolute -top-3 -right-3 bg-red-500 text-white p-1.5 rounded-full shadow-md animate-bounce">
              <MapIcon size={12} />
            </div>
          </div>
          {/* Users Orbiting */}
          <div className="absolute w-40 h-40 border-2 border-dashed border-blue-200 rounded-full animate-[spin_10s_linear_infinite]"></div>
          {/* User Icons */}
          <div className="absolute top-4 right-10 bg-green-100 p-2 rounded-full shadow-sm animate-pulse">
            <Users className="text-green-600" size={20} />
          </div>
          <div className="absolute bottom-4 left-10 bg-orange-100 p-2 rounded-full shadow-sm animate-pulse delay-700">
            <Users className="text-orange-600" size={20} />
          </div>
        </div>
      )
    },
    {
      title: "スワイプで直感的に選ぶ",
      desc: "AIや友達が提案するスポットをカードで表示。\n「アリ」なら右、「ナシ」なら左へスワイプ！\nゲーム感覚で候補をサクサク仕分けられます🃏",
      color: "bg-purple-500",
      visual: (
        <div className="relative w-full h-48 flex items-center justify-center">
          {/* Background Cards */}
          <div className="absolute w-32 h-44 bg-gray-100 rounded-2xl rotate-[-10deg] scale-90 border border-gray-200 top-4"></div>
          <div className="absolute w-32 h-44 bg-gray-50 rounded-2xl rotate-[5deg] scale-95 border border-gray-200 top-3"></div>
          
          {/* Main Swipe Card */}
          <div className="relative w-32 h-44 bg-white rounded-2xl shadow-xl border border-purple-100 flex flex-col items-center p-3 rotate-[15deg] translate-x-4 transition-transform duration-500 group">
            <div className="w-full h-24 bg-purple-100 rounded-lg mb-3 overflow-hidden relative">
               <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-purple-300" size={32}/>
            </div>
            <div className="w-full h-2 bg-gray-100 rounded-full mb-2"></div>
            <div className="w-20 h-2 bg-gray-100 rounded-full mr-auto"></div>
            {/* LIKE Stamp */}
            <div className="absolute top-4 left-2 border-2 border-green-500 text-green-500 font-black text-xs px-1 rounded transform -rotate-12 opacity-80">
              LIKE
            </div>
            {/* Swipe Arrow Indicator */}
            <div className="absolute top-1/2 -right-12 text-green-500 animate-pulse">
                <MoveHorizontal size={32} />
            </div>
          </div>
        </div>
      )
    },
    {
      title: "とりあえず「候補」へ！",
      desc: "気になった場所はまず「候補リスト」に保存。\n「確定」は別にあるから、思いついた場所を\nブレスト感覚でどんどん追加しよう💡",
      color: "bg-yellow-500",
      visual: (
        <div className="relative w-full h-48 flex items-center justify-center gap-4">
          
          {/* 候補BOX (Candidate) */}
          <div className="w-32 h-36 bg-yellow-50 rounded-xl border-2 border-yellow-200 border-dashed flex flex-col items-center justify-end p-2 relative">
             <div className="absolute -top-3 bg-yellow-100 text-yellow-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-yellow-200">
               とりあえず候補
             </div>
             {/* Dropping Items Animation */}
             <div className="absolute top-0 animate-[bounce_2s_infinite]">
                <Lightbulb className="text-yellow-500 drop-shadow-md" size={24} fill="currentColor"/>
             </div>
             <div className="w-full h-20 bg-white rounded-lg border border-yellow-100 shadow-sm flex flex-col gap-1 p-1 overflow-hidden opacity-80">
                <div className="h-4 bg-yellow-100 rounded w-full"></div>
                <div className="h-4 bg-yellow-100 rounded w-3/4"></div>
                <div className="h-4 bg-yellow-100 rounded w-full"></div>
             </div>
          </div>

          {/* Arrow */}
          <div className="text-gray-300">
            <ArrowRight size={24} />
          </div>

          {/* 確定BOX (Decided) */}
          <div className="w-32 h-36 bg-blue-50 rounded-xl border-2 border-blue-200 flex flex-col items-center justify-end p-2 relative opacity-60 scale-90">
             <div className="absolute -top-3 bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-200">
               あとで確定
             </div>
             <div className="w-full h-20 bg-white rounded-lg border border-blue-100 shadow-sm flex flex-col gap-1 p-1 items-center justify-center">
                <ListChecks className="text-blue-300" size={32}/>
             </div>
          </div>

        </div>
      )
    },
    {
      title: "指で囲って宿検索",
      desc: "地図上の泊まりたいエリアを\n指でグルッとなぞって囲んでみてください。\nその範囲にあるホテルを一括で検索できます🏨",
      color: "bg-red-500",
      visual: (
        <div className="relative w-full h-48 flex items-center justify-center overflow-hidden">
          {/* Map Background */}
          <div className="absolute inset-0 opacity-10 grid grid-cols-6 grid-rows-4 gap-2">
            {[...Array(24)].map((_,i) => <div key={i} className="bg-gray-400 rounded-sm"></div>)}
          </div>
          
          {/* Lasso Line (SVG Animation) */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
            <path 
              d="M80,60 Q120,20 180,50 T240,100 T180,160 T100,140 T80,60" 
              fill="rgba(239, 68, 68, 0.1)" 
              stroke="#EF4444" 
              strokeWidth="3" 
              strokeDasharray="6 4"
              strokeLinecap="round"
              className="animate-[pulse_2s_infinite]"
            />
          </svg>

          {/* Hotels Popping up */}
          <div className="absolute top-24 left-36 bg-white p-1.5 rounded-lg shadow-md border border-red-100 z-20 animate-in zoom-in delay-300 duration-300">
            <BedDouble size={16} className="text-red-500"/>
          </div>
          <div className="absolute top-32 left-52 bg-white p-1.5 rounded-lg shadow-md border border-red-100 z-20 animate-in zoom-in delay-500 duration-300">
            <BedDouble size={16} className="text-red-500"/>
          </div>
          
          {/* Pen Tool Icon */}
          <div className="absolute top-16 left-24 bg-red-500 text-white p-2 rounded-full shadow-lg z-30 animate-bounce">
            <PenTool size={16} />
          </div>
        </div>
      )
    },
    {
      title: "宿は「散布図」で比較",
      desc: "検索結果は「金額×評価」の散布図で表示。\n高いけど良い宿、安くて良い宿が一目瞭然。\nコスパ最強の宿を賢く見つけよう📊",
      color: "bg-pink-500",
      visual: (
        <div className="relative w-full h-48 flex items-center justify-center">
           {/* Scatter Plot Card */}
           <div className="relative w-56 h-40 bg-white rounded-xl shadow-xl border border-gray-200 p-4">
              {/* Labels */}
              <div className="absolute -left-2 top-1/2 -translate-y-1/2 -rotate-90 text-[9px] font-bold text-gray-400">金額</div>
              <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] font-bold text-gray-400">評価（クチコミ）</div>

              {/* Grid Lines */}
              <div className="w-full h-full border-l border-b border-gray-200 relative">
                  {/* Dots */}
                  <div className="absolute bottom-[20%] left-[20%] w-2 h-2 bg-pink-200 rounded-full"></div>
                  <div className="absolute top-[20%] right-[20%] w-2 h-2 bg-pink-200 rounded-full"></div>
                  <div className="absolute top-[30%] left-[30%] w-2 h-2 bg-pink-200 rounded-full"></div>
                  
                  {/* Target Dot (Good Cost Performance) */}
                  <div className="absolute bottom-[30%] right-[20%] w-4 h-4 bg-pink-500 rounded-full shadow-lg border-2 border-white animate-pulse flex items-center justify-center">
                      <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                  </div>
                  
                  {/* Tooltip */}
                  <div className="absolute bottom-[45%] right-[5%] bg-gray-900 text-white text-[9px] px-2 py-1 rounded shadow-lg whitespace-nowrap animate-in fade-in slide-in-from-bottom-2">
                      コスパ最強!
                  </div>
              </div>
           </div>
        </div>
      )
    },
    {
      title: "旅程の整理もラクラク",
      desc: "確定したスポットはタイムラインに。\nドラッグ＆ドロップで順番を自由に入れ替え🔄\nメモやリンクもまとめて保存できます📝",
      color: "bg-green-500",
      visual: (
        <div className="relative w-full h-48 flex items-center justify-center">
          {/* Timeline Card */}
          <div className="w-56 bg-white rounded-2xl shadow-xl border border-gray-100 p-3 relative overflow-hidden flex flex-col gap-2">
            
            {/* Item 1 */}
            <div className="flex items-center gap-2 relative z-10">
              <div className="p-1 text-gray-300 cursor-grab"><GripVertical size={12}/></div>
              <div className="w-2 h-full bg-blue-500 rounded-full shrink-0"></div>
              <div className="bg-blue-50 p-2 rounded-lg flex-1 text-[10px] font-bold text-blue-800 border border-blue-100 flex justify-between">
                  <span>10:00 京都駅集合</span>
                  <Check size={10} />
              </div>
            </div>
            
            {/* Item 2 (Dragging Style) */}
            <div className="flex items-center gap-2 relative z-10 scale-105 shadow-lg -rotate-1 bg-white p-1 rounded-lg border border-green-200">
              <div className="p-1 text-gray-400 cursor-grabbing"><GripVertical size={12}/></div>
              <div className="w-2 h-full bg-green-500 rounded-full shrink-0"></div>
              <div className="bg-green-50 p-2 rounded-lg flex-1 text-[10px] font-bold text-green-800 border border-green-100">
                  11:30 清水寺
              </div>
              {/* Hand/Finger */}
               <div className="absolute -bottom-2 -right-2 text-2xl drop-shadow-md">👆</div>
            </div>
            
            {/* Item 3 */}
            <div className="flex items-center gap-2 relative z-10 opacity-50">
              <div className="p-1 text-gray-300"><GripVertical size={12}/></div>
              <div className="w-2 h-full bg-orange-500 rounded-full shrink-0"></div>
              <div className="bg-orange-50 p-2 rounded-lg flex-1 text-[10px] font-bold text-orange-800 border border-orange-100">
                  13:00 ランチ
              </div>
            </div>

          </div>
        </div>
      )
    }
  ];

  // --- 1. 確認画面 (Ask Mode) ---
  if (mode === 'ask') {
    return (
      <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-300">
        <div className="bg-white w-full max-w-sm rounded-[2rem] p-8 shadow-2xl relative text-center animate-in zoom-in-95 duration-300 overflow-hidden">
          
          {/* 背景装飾 */}
          <div className="absolute -top-20 -right-20 w-40 h-40 bg-blue-100 rounded-full blur-3xl opacity-50 pointer-events-none"></div>
          <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-purple-100 rounded-full blur-3xl opacity-50 pointer-events-none"></div>

          <div className="relative">
            <div className="w-16 h-16 bg-gradient-to-tr from-blue-100 to-purple-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner border border-white">
              <HelpCircle size={32} strokeWidth={2.5} />
            </div>
            
            <h3 className="text-xl font-black text-gray-900 mb-3">ようこそ！</h3>
            <p className="text-sm text-gray-500 font-bold mb-8 leading-relaxed">
              この旅行ルームに初めて参加されたようですね。<br/>
              MapWithの便利な機能ガイド（6枚）<br/>を見てみますか？
            </p>

            <div className="flex flex-col gap-3">
              <button 
                onClick={() => setMode('guide')}
                className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-black hover:scale-[1.02] transition shadow-lg flex items-center justify-center gap-2"
              >
                <Sparkles size={18} className="text-yellow-300"/> 使い方を見る
              </button>
              <button 
                onClick={() => handleComplete(true)}
                className="w-full bg-gray-100 text-gray-500 py-3.5 rounded-2xl font-bold hover:bg-gray-200 transition text-sm"
              >
                今は見ない
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- 2. ガイド画面 (Guide Mode) ---
  const currentStep = steps[step];

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(s => s + 1);
    } else {
      handleComplete(true);
    }
  };

  const handlePrev = () => {
    if (step > 0) {
      setStep(s => s - 1);
    } else {
        // 設定から開いた場合（forceGuide=true）は確認画面に戻らず閉じる
        if (forceGuide) {
            onClose();
        } else {
            setMode('ask');
        }
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-sm rounded-[2.5rem] overflow-hidden shadow-2xl relative flex flex-col animate-in slide-in-from-bottom-8 duration-500 h-auto min-h-[500px]">
        
        {/* Header Visual Area */}
        <div className="bg-gray-50 pt-8 pb-4 px-6 relative overflow-hidden">
            {/* Background Blob */}
            <div className={`absolute -top-20 -right-20 w-64 h-64 ${currentStep.color} rounded-full blur-3xl opacity-20 transition-colors duration-500`}></div>
            <div className={`absolute -bottom-10 -left-10 w-40 h-40 ${currentStep.color} rounded-full blur-2xl opacity-10 transition-colors duration-500`}></div>
            
            <div key={step} className="animate-in zoom-in-95 duration-500">
                {currentStep.visual}
            </div>

            {/* Close Button */}
            <button 
                onClick={() => handleComplete(true)} 
                className="absolute top-4 right-4 p-2 bg-white/80 backdrop-blur-sm rounded-full text-gray-400 hover:text-gray-800 transition z-20 shadow-sm"
            >
                <X size={20} />
            </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 px-8 pt-2 pb-8 flex flex-col relative bg-white">
            
            {/* Step Indicators */}
            <div className="flex justify-center gap-1.5 mb-6">
                {steps.map((_, i) => (
                    <div 
                        key={i} 
                        className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? `w-8 ${currentStep.color}` : 'w-2 bg-gray-200'}`}
                    ></div>
                ))}
            </div>

            {/* Text Content */}
            <div className="text-center mb-8 flex-1" key={`text-${step}`}>
                <h3 className="text-2xl font-black text-gray-800 mb-4 animate-in slide-in-from-right-4 fade-in duration-300">
                    {currentStep.title}
                </h3>
                <p className="text-sm text-gray-500 font-bold leading-relaxed whitespace-pre-wrap animate-in slide-in-from-right-4 fade-in duration-300 delay-75">
                    {currentStep.desc}
                </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 mt-auto">
                <button 
                    onClick={handlePrev}
                    className="p-4 rounded-2xl bg-gray-100 text-gray-500 hover:bg-gray-200 transition active:scale-95"
                >
                    <ArrowLeft size={20}/>
                </button>
                <button 
                    onClick={handleNext}
                    className={`flex-1 py-4 rounded-2xl font-bold text-white text-lg shadow-lg hover:opacity-90 transition active:scale-95 flex items-center justify-center gap-2 ${currentStep.color}`}
                >
                    {step === steps.length - 1 ? 'はじめる' : '次へ'} <ArrowRight size={20}/>
                </button>
            </div>

        </div>
      </div>
    </div>
  );
}