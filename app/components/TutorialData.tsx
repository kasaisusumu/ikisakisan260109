import React from 'react';
import { 
  Map as MapIcon, Users, Sparkles, MoveHorizontal, ArrowRight,
  Lightbulb, ListChecks, BedDouble, PenTool, GripVertical, Check,
  ThumbsUp, ThumbsDown, Star, MousePointer2, Hand, Search
} from 'lucide-react';

export interface TutorialStep {
  title: string;
  desc: string;
  color: string;
  visual: React.ReactNode;
}

export const tutorialSteps: TutorialStep[] = [
  {
    title: "リアルタイムで地図を囲む",
    desc: "URLをシェアすれば、友達と同じ地図を\nリアルタイムで操作できます。\n「ここどう？」とピンを立てて会話しよう📍",
    color: "bg-blue-500",
    visual: (
      <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
        {/* Central Map: 大きく表示 */}
        <div className="relative h-[70%] aspect-square bg-white rounded-2xl shadow-lg border-2 border-blue-100 flex items-center justify-center z-10 animate-[bounce_3s_infinite]">
          <MapIcon className="text-blue-500 w-[60%] h-[60%]" strokeWidth={1.5} />
          {/* Bouncing Pin */}
          <div className="absolute -top-[15%] -right-[15%] bg-red-500 text-white p-[6%] rounded-full shadow-md animate-bounce">
            <MapIcon className="w-5 h-5 md:w-6 md:h-6" />
          </div>
        </div>
        
        {/* Orbiting Elements */}
        <div className="absolute h-[110%] aspect-square border-2 border-dashed border-blue-200 rounded-full animate-[spin_12s_linear_infinite]"></div>
        
        {/* Floating Users */}
        <div className="absolute top-[5%] right-[5%] bg-green-100 p-[3%] rounded-full shadow-sm animate-pulse">
          <Users className="text-green-600 w-6 h-6 md:w-8 md:h-8" />
        </div>
        <div className="absolute bottom-[5%] left-[5%] bg-orange-100 p-[3%] rounded-full shadow-sm animate-pulse delay-700">
          <Users className="text-orange-600 w-6 h-6 md:w-8 md:h-8" />
        </div>
      </div>
    )
  },
  {
    title: "AI提案で追加もラクラク",
    desc: "面倒な検索や入力作業はAIにおまかせ。\n提案されるスポットをスワイプするだけで、\n行きたい場所がどんどんリストに追加されます✨",
    color: "bg-purple-500",
    visual: (
      <div className="relative w-full h-full flex items-center justify-center overflow-visible">
        
        {/* Background Card (Stack effect) */}
        <div className="absolute h-[85%] aspect-[3/4] bg-purple-50 rounded-xl border border-purple-100 rotate-[-6deg] scale-90"></div>
        
        {/* Main Swipe Card - Animating Right */}
        <div className="relative h-[85%] aspect-[3/4] bg-white rounded-xl shadow-xl border border-purple-100 flex flex-col items-center p-[5%] 
                        origin-bottom-left animate-[cardSwipeRight_2.5s_ease-in-out_infinite]">
          
          {/* Card Content */}
          <div className="w-full h-[55%] bg-purple-50 rounded-lg mb-[5%] overflow-hidden relative flex items-center justify-center">
             <Sparkles className="text-purple-400 w-[50%] h-[50%]" />
             <div className="absolute top-1 right-1 text-yellow-400 animate-spin"><Star size={14} fill="currentColor"/></div>
          </div>
          <div className="w-full h-[6%] bg-gray-100 rounded-full mb-[5%]"></div>
          <div className="w-2/3 h-[6%] bg-gray-100 rounded-full mr-auto"></div>
          
          {/* LIKE Stamp */}
          <div className="absolute top-[35%] left-0 border-4 border-green-500 text-green-500 font-black text-sm md:text-lg px-2 py-0.5 rounded -rotate-12 opacity-0 animate-[stampPop_2.5s_ease-in-out_infinite]">
            LIKE
          </div>
        </div>

        {/* Hand Icon Animating (Swipe Gesture) - 大きく */}
        <div className="absolute bottom-[-5%] left-[40%] z-20 drop-shadow-2xl animate-[handSwipeGesture_2.5s_ease-in-out_infinite]">
            <Hand className="fill-white stroke-slate-800 w-12 h-12 md:w-16 md:h-16" strokeWidth={1.5} />
        </div>
      </div>
    )
  },
  {
    title: "とりあえず「候補」へ！",
    desc: "気になった場所はまず「候補リスト」に保存。\n「確定」は別にあるから、思いついた場所を\nブレスト感覚でどんどん追加しよう💡",
    color: "bg-yellow-500",
    visual: (
      <div className="relative w-full h-full flex items-center justify-center gap-[4%] px-2 overflow-visible">
        
        {/* 候補BOX (Candidate) */}
        <div className="h-[85%] aspect-[3/4] bg-yellow-50 rounded-xl border-2 border-yellow-300 border-dashed flex flex-col items-center justify-end p-[5%] relative">
           <div className="absolute -top-[10%] bg-yellow-100 text-yellow-700 text-[10px] font-bold px-2 py-1 rounded-full border border-yellow-200 whitespace-nowrap z-10 shadow-sm">
             とりあえず候補
           </div>
           
           {/* Dropping Items */}
           <div className="absolute -top-[25%] animate-[bounce_2s_infinite]">
              <div className="bg-white p-2 rounded-lg shadow-md border border-yellow-200">
                <Lightbulb className="text-yellow-500 w-6 h-6" fill="currentColor"/>
              </div>
           </div>
           
           {/* Items inside box */}
           <div className="w-full h-[60%] bg-white/80 rounded-lg border border-yellow-100 shadow-inner flex flex-col gap-1.5 p-1.5 overflow-hidden">
              <div className="h-[20%] bg-yellow-100 rounded w-full animate-pulse"></div>
              <div className="h-[20%] bg-yellow-100 rounded w-3/4 animate-pulse delay-75"></div>
              <div className="h-[20%] bg-yellow-100 rounded w-1/2 animate-pulse delay-150"></div>
           </div>
        </div>

        {/* Arrow */}
        <div className="text-gray-300 animate-pulse flex flex-col items-center shrink-0">
          <ArrowRight className="w-8 h-8 md:w-10 md:h-10" strokeWidth={3} />
        </div>

        {/* 確定BOX (Decided) */}
        <div className="h-[85%] aspect-[3/4] bg-blue-50 rounded-xl border-2 border-blue-200 flex flex-col items-center justify-end p-[5%] relative">
           <div className="absolute -top-[10%] bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-1 rounded-full border border-blue-200 whitespace-nowrap z-10 shadow-sm">
             あとで確定
           </div>
           <div className="w-full h-[60%] bg-white rounded-lg border border-blue-100 shadow-sm flex flex-col gap-1 p-1 items-center justify-center group overflow-hidden">
              <div className="absolute inset-0 flex items-center justify-center bg-blue-50/50 opacity-0 animate-[ping_3s_infinite]">
                 <Check className="text-blue-500 w-10 h-10" strokeWidth={3} />
              </div>
              <ListChecks className="text-blue-400 w-8 h-8" />
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
      <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
        {/* Map Background Grid */}
        <div className="absolute inset-0 opacity-10 grid grid-cols-6 grid-rows-4 gap-2 animate-[pulse_5s_infinite]">
          {[...Array(24)].map((_,i) => <div key={i} className="bg-gray-400 rounded-sm"></div>)}
        </div>
        
        {/* Animated Lasso Line (SVG) */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
          <path 
            d="M80,40 Q120,10 160,30 T200,60 T160,100 T100,90 T80,40" 
            fill="rgba(239, 68, 68, 0.05)" 
            stroke="#EF4444" 
            strokeWidth="4" 
            strokeDasharray="8 6"
            strokeLinecap="round"
            className="animate-[pulse_1.5s_infinite]"
          />
        </svg>

        {/* Pen Tool - Orbiting */}
        <div className="absolute inset-0 flex items-center justify-center animate-[spin_4s_linear_infinite]">
             <div className="w-[70%] h-[50%] relative">
                 <div className="absolute -top-4 left-1/2 bg-red-500 text-white p-2 rounded-full shadow-xl z-30 transform -rotate-45">
                    <PenTool className="w-5 h-5 md:w-6 md:h-6" />
                 </div>
             </div>
        </div>

        {/* Hotels Popping up */}
        <div className="absolute top-[30%] left-[30%] bg-white p-[2%] rounded-xl shadow-lg border border-red-100 z-20 animate-[bounce_2s_infinite]">
          <BedDouble className="text-red-500 w-5 h-5 md:w-6 md:h-6"/>
        </div>
        <div className="absolute bottom-[30%] right-[30%] bg-white p-[2%] rounded-xl shadow-lg border border-red-100 z-20 animate-[bounce_2.5s_infinite] delay-300">
          <BedDouble className="text-red-500 w-5 h-5 md:w-6 md:h-6"/>
        </div>
      </div>
    )
  },
  {
    title: "宿は「散布図」で比較",
    desc: "検索結果は「金額×評価」の散布図で表示。\n高いけど良い宿、安くて良い宿が一目瞭然。\nコスパ最強の宿を賢く見つけよう📊",
    color: "bg-pink-500",
    visual: (
      <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
         {/* Scatter Plot Card: 幅90%, 高さ80%に拡大 */}
         <div className="relative w-[90%] h-[80%] bg-white rounded-xl shadow-xl border border-gray-200 p-[5%]">
            
            {/* Axis Labels */}
            <div className="absolute -left-3 top-1/2 -translate-y-1/2 -rotate-90 text-[10px] font-bold text-gray-400">金額</div>
            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] font-bold text-gray-400">評価</div>

            {/* Grid Lines & Dots */}
            <div className="w-full h-full border-l-2 border-b-2 border-gray-200 relative">
                
                {/* Random Dots */}
                <div className="absolute bottom-[20%] left-[20%] w-2 h-2 bg-pink-300 rounded-full animate-ping"></div>
                <div className="absolute top-[20%] right-[20%] w-2 h-2 bg-pink-300 rounded-full animate-ping delay-300"></div>
                <div className="absolute top-[30%] left-[30%] w-2 h-2 bg-pink-300 rounded-full animate-ping delay-500"></div>

                {/* Target Dot (Good Cost Performance) */}
                <div className="absolute bottom-[30%] right-[20%] z-10">
                    <div className="absolute -inset-3 bg-pink-500 rounded-full opacity-30 animate-ping"></div>
                    <div className="relative w-4 h-4 md:w-5 md:h-5 bg-pink-500 rounded-full shadow-lg border-2 border-white flex items-center justify-center animate-bounce">
                      <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                    </div>
                </div>
                
                {/* Tooltip */}
                <div className="absolute bottom-[55%] right-[5%] bg-gray-900 text-white text-[10px] px-3 py-1 rounded-full shadow-lg whitespace-nowrap animate-[float_2s_infinite] delay-100 z-20">
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
      <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
        {/* Timeline Container: 高さを90%に */}
        <div className="w-[70%] h-[90%] bg-white rounded-xl shadow-xl border border-gray-100 p-2 relative overflow-hidden flex flex-col gap-3">
          
          {/* Connecting Line */}
          <div className="absolute top-4 bottom-4 left-4 w-1 bg-gray-100 z-0"></div>

          {/* Item 1 - Static */}
          <div className="flex items-center gap-2 relative z-10 opacity-60">
            <div className="w-2 h-2 bg-gray-300 rounded-full shrink-0 ml-2"></div>
            <div className="bg-gray-50 p-2 rounded-lg flex-1 text-[9px] font-bold text-gray-500 border border-gray-100">
                10:00 京都駅集合
            </div>
          </div>
          
          {/* Item 2 - BEING DRAGGED (Animated) */}
          <div className="flex items-center gap-2 relative z-20 transform scale-110 -rotate-2 animate-[float_2s_infinite]">
            <div className="text-green-500"><GripVertical size={16}/></div>
            <div className="bg-green-50 p-2.5 rounded-lg flex-1 text-[10px] font-bold text-green-800 border-2 border-green-200 shadow-lg flex justify-between items-center">
                <span>11:30 清水寺</span>
                <MousePointer2 size={16} className="text-gray-400 absolute bottom-0 right-0 fill-gray-400 animate-[bounce_1s_infinite]"/>
            </div>
          </div>
          
          {/* Item 3 */}
          <div className="flex items-center gap-2 relative z-10 opacity-60 translate-y-2">
            <div className="w-2 h-2 bg-orange-300 rounded-full shrink-0 ml-2"></div>
            <div className="bg-orange-50 p-2 rounded-lg flex-1 text-[9px] font-bold text-orange-800 border border-orange-100">
                13:00 ランチ
            </div>
          </div>

        </div>
      </div>
    )
  }
];