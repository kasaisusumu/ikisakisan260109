"use client";

import { useState, useRef, useEffect } from 'react';
import { Send, Bot, MapPin, Map as MapIcon, User } from 'lucide-react';
import { supabase } from '@/lib/supabase';

// const API_BASE_URL = "http://192.168.1.211:8000"; 
// 現在のブラウザのホスト名を使ってAPIのURLを自動設定
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Message = {
  id: string | number;
  role: 'user' | 'ai';
  text: string;
  spots?: any[];
};

interface Props {
  onPreviewSpot: (spot: any) => void;
  roomId: string;
}

export default function AgentView({ onPreviewSpot, roomId }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ... (useEffectなどのロジックは元のまま維持) ...
  useEffect(() => {
    if (!roomId) return;
    const fetchMessages = async () => {
      const { data } = await supabase.from('messages').select('*').eq('room_id', roomId).order('created_at', { ascending: true });
      if (data && data.length > 0) setMessages(data);
      else setMessages([{ id: 'init', role: 'ai', text: 'こんにちは！\n旅の相談、なんでも聞いてくださいね。' }]);
    };
    fetchMessages();

    const channel = supabase.channel('chat_room').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` }, (payload) => {
        setMessages(prev => {
          const exists = prev.some(m => m.id === payload.new.id);
          if (exists) return prev;
          return [...prev, payload.new as Message];
        });
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [roomId]);

  useEffect(() => { 
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; 
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const userText = input;
    setInput("");
    setIsLoading(true);

    try {
      const tempId = Date.now();
      setMessages(prev => [...prev, { id: tempId, role: 'user', text: userText }]);
      await supabase.from('messages').insert([{ room_id: roomId, role: 'user', text: userText }]);

      const res = await fetch(`${API_BASE_URL}/api/chat_search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userText, area: "" }), 
      });
      
      const data = await res.json();
      const { data: savedAiMsg } = await supabase.from('messages').insert([{ 
          room_id: roomId, role: 'ai', text: data.reply, spots: data.results 
      }]).select().single();

      if (savedAiMsg) setMessages(prev => [...prev, savedAiMsg]);
    } catch (e) {
      setMessages(prev => [...prev, { id: Date.now(), role: 'ai', text: 'エラーが発生しました。' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 relative">
      <div className="glass sticky top-0 z-10 px-4 py-3 border-b flex items-center gap-3">
        <div className="bg-gradient-to-tr from-blue-500 to-purple-500 p-2 rounded-full text-white shadow-md">
            <Bot size={20} /> 
        </div>
        <div>
            <h2 className="font-bold text-gray-800 text-sm">AI Travel Agent</h2>
            <p className="text-[10px] text-green-600 flex items-center gap-1">● Online</p>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-6 pb-20">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
            {/* Avatar */}
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm ${msg.role === 'user' ? 'bg-gray-200 text-gray-500' : 'bg-blue-100 text-blue-600'}`}>
                {msg.role === 'user' ? <User size={14}/> : <Bot size={14}/>}
            </div>

            <div className={`max-w-[80%] space-y-2`}>
                <div className={`p-3 rounded-2xl text-sm whitespace-pre-wrap shadow-sm ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'}`}>
                    {msg.text}
                </div>
                {msg.spots && (msg.spots as any[]).length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar px-1">
                    {(msg.spots as any[]).map((spot: any, idx: number) => (
                        <div key={idx} className="bg-white p-2 rounded-xl border border-gray-200 shadow-sm min-w-[160px] w-[160px] flex flex-col gap-2">
                            <div className="h-20 bg-gray-100 rounded-lg overflow-hidden relative">
                                <img src={`https://source.unsplash.com/featured/300x200/?${encodeURIComponent(spot.name)},japan`} className="w-full h-full object-cover" alt="" />
                                <button onClick={() => onPreviewSpot(spot)} className="absolute bottom-1 right-1 bg-white/80 p-1 rounded-full text-blue-600 shadow-sm"><MapIcon size={12}/></button>
                            </div>
                            <div>
                                <p className="font-bold text-xs truncate text-gray-800">{spot.name}</p>
                                <p className="text-[10px] text-gray-500 line-clamp-1">{spot.description}</p>
                            </div>
                        </div>
                    ))}
                    </div>
                )}
            </div>
          </div>
        ))}
        {isLoading && (
            <div className="flex gap-2">
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center"><Bot size={14}/></div>
                <div className="bg-white px-4 py-3 rounded-2xl rounded-tl-none border border-gray-100 shadow-sm flex gap-1 items-center">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></span>
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-100"></span>
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-200"></span>
                </div>
            </div>
        )}
      </div>

      <div className="absolute bottom-20 left-0 w-full px-4 pointer-events-none">
        <div className="glass rounded-full p-2 flex gap-2 pointer-events-auto shadow-xl ring-1 ring-black/5">
          <input 
            type="text" 
            value={input} 
            onChange={(e) => setInput(e.target.value)} 
            onKeyDown={(e) => e.key === 'Enter' && handleSend()} 
            placeholder="メッセージを入力..." 
            className="flex-1 bg-transparent px-3 text-sm text-gray-800 outline-none placeholder-gray-400"
          />
          <button 
            onClick={handleSend} 
            disabled={isLoading || !input} 
            className="bg-blue-600 text-white w-10 h-10 rounded-full flex items-center justify-center hover:bg-blue-700 disabled:opacity-50 transition shadow-md active:scale-95"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}