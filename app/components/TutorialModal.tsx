"use client";

import React, { useState } from 'react';
import { 
  ArrowRight, ArrowLeft, X, Sparkles, HelpCircle
} from 'lucide-react';
// ★追加: 共通データファイルをインポート
import { tutorialSteps } from './TutorialData';

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
  // ★修正: 共通データを使用
  const currentStep = tutorialSteps[step];

  const handleNext = () => {
    if (step < tutorialSteps.length - 1) {
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
        <div className="bg-gray-50 pt-8 pb-4 px-6 relative overflow-hidden flex items-center justify-center h-64">
            {/* Background Blob */}
            <div className={`absolute -top-20 -right-20 w-64 h-64 ${currentStep.color} rounded-full blur-3xl opacity-20 transition-colors duration-500`}></div>
            <div className={`absolute -bottom-10 -left-10 w-40 h-40 ${currentStep.color} rounded-full blur-2xl opacity-10 transition-colors duration-500`}></div>
            
            <div key={step} className="animate-in zoom-in-95 duration-500 w-full h-full flex items-center justify-center">
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
            <div className="flex justify-center gap-1.5 mb-6 mt-4">
                {tutorialSteps.map((_, i) => (
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
                    {step === tutorialSteps.length - 1 ? 'はじめる' : '次へ'} <ArrowRight size={20}/>
                </button>
            </div>

        </div>
      </div>
    </div>
  );
}