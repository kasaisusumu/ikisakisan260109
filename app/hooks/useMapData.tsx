import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export const useMapData = (roomId: string | null) => {
  const [planSpots, setPlanSpots] = useState<any[]>([]);
  const [spotVotes, setSpotVotes] = useState<any[]>([]);
  const [userName, setUserName] = useState("");
  const [isJoined, setIsJoined] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // データのロード
  const loadRoomData = useCallback(async () => {
    if (!roomId) return;
    
    const { data: spots } = await supabase
      .from('spots')
      .select('*')
      .eq('room_id', roomId)
      .order('order', { ascending: true });
      
    if (spots) setPlanSpots(spots);

    const { data: votes } = await supabase
      .from('votes')
      .select('*')
      .eq('room_id', roomId);
      
    if (votes) setSpotVotes(votes);
  }, [roomId]);

  // 初期化と認証
  useEffect(() => {
    setIsAuthLoading(true);
    if (roomId) {
      const savedName = localStorage.getItem(`route_hacker_user_${roomId}`);
      if (savedName) {
        setUserName(savedName);
        setIsJoined(true);
      } else {
        setIsJoined(false);
        setUserName("");
      }
    } else {
      setIsJoined(false);
      setUserName("");
    }
    setIsAuthLoading(false);
  }, [roomId]);

  // リアルタイム更新の購読
  useEffect(() => {
    if (roomId && isJoined) {
      loadRoomData();
      const channel = supabase.channel('room_updates')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'spots', filter: `room_id=eq.${roomId}` }, loadRoomData)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'votes', filter: `room_id=eq.${roomId}` }, loadRoomData)
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [roomId, isJoined, loadRoomData]);

  // スポットの追加（page.tsxの高機能版ロジックを統合）
  const addSpot = async (spot: any, selectedResult?: any) => {
    if (!roomId) return;
    
    let coords = spot.coordinates;
    if (!coords && spot.center) coords = spot.center;
    
    const spotName = spot.name || spot.text || "名称不明";
    // selectedResultがある場合はそちらの説明を優先（ユーザーが編集している可能性があるため）
    const desc = (selectedResult?.id === spot.id && selectedResult.place_name) 
      ? selectedResult.place_name 
      : (spot.description || spot.place_name || "");
      
    const status = spot.status || 'candidate';

    const newSpotPayload = { 
        room_id: roomId, 
        name: spotName, 
        description: desc, 
        coordinates: coords, 
        order: planSpots.length, 
        added_by: userName || 'Guest', 
        votes: 0,
        status: status,
        price: spot.price || null,
        rating: spot.rating || null,
        image_url: spot.image_url || null,
        url: spot.url || null,
        plan_id: spot.plan_id || null,
        is_hotel: spot.is_hotel || false,
        day: 0
    };

    const { data, error } = await supabase.from('spots').insert([newSpotPayload]).select().single();
    
    if (error) {
      console.error("Add spot error:", error);
      throw new Error("スポットの追加に失敗しました");
    }
    
    if (data) {
      setPlanSpots(prev => [...prev, data]);
      return data;
    }
  };

  // スポットの削除
  const removeSpot = async (spot: any) => {
    if (!roomId) return;
    // 名前での削除ではなくIDでの削除を推奨しますが、既存ロジックに合わせています
    // もしIDがあるならID優先に変更
    if (spot.id && typeof spot.id !== 'string') { 
        // SupabaseのIDは通常numberですが、UUIDの場合はstring
        await supabase.from('spots').delete().eq('id', spot.id);
        setPlanSpots(prev => prev.filter(s => s.id !== spot.id));
    } else {
        await supabase.from('spots').delete().eq('room_id', roomId).eq('name', spot.name || spot.text);
        setPlanSpots(prev => prev.filter(s => s.name !== (spot.name || spot.text)));
    }
  };

  // ステータス更新（page.tsxから移動）
  const updateSpotStatus = async (spot: any, newStatus: string, day: number = 0) => {
      if (!roomId) return;
      
      // 楽観的UI更新
      setPlanSpots(prev => prev.map(s => s.id === spot.id ? { ...s, status: newStatus, day: day } : s));
      
      const { error } = await supabase
        .from('spots')
        .update({ status: newStatus, day: day })
        .eq('id', spot.id);
        
      if (error) { 
        console.error("Status update failed:", error); 
        loadRoomData(); // 失敗したら元に戻すために再ロード
      }
  };

  // 一括更新（PlanViewなどで使用）
  const updateSpots = (newSpots: any[]) => {
      setPlanSpots(newSpots);
      // 必要であればここでDBへの並び順保存処理などを追加
  };

  return { 
    planSpots, 
    spotVotes, 
    userName, 
    setUserName, 
    isJoined, 
    setIsJoined, 
    isAuthLoading, 
    addSpot, 
    removeSpot, 
    updateSpotStatus,
    updateSpots,
    loadRoomData // 手動リロード用
  };
};