"use client";

import { Map, BedDouble, Sparkles, Calendar, Menu } from 'lucide-react';

type Tab = 'explore' | 'agent' | 'swipe' | 'plan' | 'menu';

interface Props {
  currentTab: Tab;
  onTabChange: (tab: Tab) => void;
  voteBadge?: number;
}

export default function BottomNav({ currentTab, onTabChange, voteBadge = 0 }: Props) {
  const tabs = [
    { id: 'explore', label: '地図', icon: Map },
    { id: 'agent',   label: 'ホテル', icon: BedDouble },
    { id: 'swipe',   label: '提案', icon: Sparkles },
    { id: 'plan',    label: '旅程', icon: Calendar },
    { id: 'menu',    label: '設定', icon: Menu },
  ] as const;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] w-[92%] max-w-md">
      <div className="bg-white/80 backdrop-blur-2xl border border-white/20 rounded-[2.5rem] p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.15)] flex justify-between items-center ring-1 ring-black/5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`relative flex flex-col items-center justify-center py-3 rounded-[2rem] transition-all duration-500 ease-spring ${
                isActive ? 'flex-[2] bg-black text-white shadow-xl' : 'flex-1 text-gray-400 hover:text-gray-600'
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                {isActive && <span className="text-xs font-black tracking-tight">{tab.label}</span>}
              </div>
              
              {tab.id === 'swipe' && voteBadge > 0 && !isActive && (
                <span className="absolute top-2 right-4 w-2 h-2 bg-red-500 rounded-full border border-white" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}