"use client";

import { Map, BedDouble, Flame, Calendar, Settings } from 'lucide-react';

type Tab = 'explore' | 'agent' | 'swipe' | 'plan' | 'menu';

interface Props {
  currentTab: Tab;
  onTabChange: (tab: Tab) => void;
  voteBadge?: number;
}

export default function BottomNav({ currentTab, onTabChange, voteBadge = 0 }: Props) {
  const tabs = [
    { id: 'explore', label: 'Map', icon: Map },
    { id: 'agent',   label: 'List', icon: BedDouble }, // ★ アイコンとラベルを変更
    { id: 'swipe',   label: 'Vote',icon: Flame },
    { id: 'plan',    label: 'Plan',icon: Calendar },
    { id: 'menu',    label: 'Menu',icon: Settings },
  ] as const;

  return (
    <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 w-[90%] max-w-md z-[9999] pb-safe">
      <div className="glass rounded-full px-2 py-3 flex justify-between items-center shadow-2xl border border-white/50 ring-1 ring-black/5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className="relative flex flex-col items-center justify-center w-full h-full group"
            >
              <div className={`relative p-2 rounded-full transition-all duration-300 ${isActive ? 'bg-blue-100 text-blue-600 scale-110' : 'text-gray-400 hover:bg-gray-100'}`}>
                <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                
                {/* 通知バッジ */}
                {tab.id === 'swipe' && voteBadge > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-white shadow-sm z-10 animate-pulse">
                    {voteBadge > 99 ? '99+' : voteBadge}
                  </span>
                )}
              </div>
              {/* アクティブ時のみラベルを表示 */}
              {isActive && (
                 <span className="absolute -bottom-6 text-[10px] font-bold text-blue-600 animate-in slide-in-from-bottom-1 fade-in duration-200">
                    {tab.label}
                 </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}