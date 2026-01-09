from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator
from typing import Optional, List, Any
import os
import json
import urllib.parse
import asyncio
import httpx 
from openai import AsyncOpenAI 
import math
import re 
import traceback
from datetime import date, timedelta 
import random 

# ==========================================
# 🔑 設定
# ==========================================
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
MAPBOX_ACCESS_TOKEN = os.getenv("MAPBOX_ACCESS_TOKEN")
GEOAPIFY_API_KEY = os.getenv("GEOAPIFY_API_KEY")

# 1. このインポート行をファイルの一番上に追加してください
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# 2. app = FastAPI() のすぐ下に、このブロックを丸ごと追加してください


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

aclient = AsyncOpenAI(api_key=OPENAI_API_KEY)

# --- 型定義 ---
class SearchRequest(BaseModel):
    query: str
    area: str = "" 

class VacantSearchRequest(BaseModel):
    latitude: float
    longitude: float
    radius: float = 3.0
    min_price: Optional[int] = None
    max_price: Optional[int] = None
    squeeze: List[str] = [] 

class SuggestRequest(BaseModel):
    theme: str             
    existing_spots: list[str] = [] 
    liked_spots: list[str] = []
    noped_spots: list[str] = []
    area: str = ""         
    verify: bool = False   

class Spot(BaseModel):
    name: str
    description: str = ""
    coordinates: List[float]
    votes: int = 0
    stay_time: int = 0
    image_url: Optional[str] = None
    price: Optional[int] = None
    rating: Optional[float] = None
    url: Optional[str] = None
    source: str = "ai" 
    is_jalan: bool = False 
    mapbox_id: Optional[str] = None
    place_formatted: Optional[str] = None
    is_hotel: bool = False

    @field_validator('stay_time', 'votes', mode='before')
    def parse_int_fields(cls, v):
        if v is None: return 0
        if isinstance(v, (str, float)):
            try: return int(float(v))
            except: return 0
        return int(v)

    @field_validator('coordinates', mode='before')
    def parse_coordinates(cls, v):
        if isinstance(v, list):
            try: return [float(x) for x in v]
            except: return [0.0, 0.0]
        return v

class VerifyRequest(BaseModel):
    spots: List[Spot]

class OptimizeRequest(BaseModel):
    spots: List[Spot]
    start_time: str = "09:00" 
    end_time: str = "18:00"
    start_spot_name: Optional[str] = None
    end_spot_name: Optional[str] = None

# ---------------------------------------------------------
# ユーティリティ: Geoapifyで座標取得 (厳格なフィルタリング付き)
# ---------------------------------------------------------
async def fetch_spot_coordinates(client, spot_name: str, area_context: str = ""):
    """
    Geoapify APIを使用してスポットの座標と詳細を取得。
    検索結果の名前が元の名前を含まない場合は除外する（厳格一致）。
    """
    try:
        # 1. クエリの作成 (カッコ書きなどは除去)
        clean_name = re.sub(r'[\(（].*?[\)）]', '', spot_name).strip()
        # 検索精度向上のため、スポット名 + エリア名 で検索
        query = f"{clean_name} {area_context}".strip()
        
        url = "https://api.geoapify.com/v1/geocode/search"
        params = {
            "text": query,
            "apiKey": GEOAPIFY_API_KEY,
            "lang": "ja",
            "limit": 3, # 候補を少し多めに取って、正しいものを探す
            "countrycode": "jp"
        }
        
        res = await client.get(url, params=params, timeout=10.0)
        
        if res.status_code == 200:
            data = res.json()
            if "features" in data:
                # 候補の中から最も適切なものを探す
                for feat in data["features"]:
                    props = feat["properties"]
                    result_name = props.get("name", "")
                    
                    # --- フィルタリングロジック ---
                    
                    # NGワード除外
                    ng_words = ["小学校", "中学校", "高校", "大学", "病院", "交番", "警察署", "老人ホーム", "デイサービス", "薬局", "駐車場"]
                    if any(ng in result_name for ng in ng_words):
                        continue # 次の候補へ

                    # 名称一致チェック (ユーザー指定: spot_name in result_name のみ許可)
                    def normalize(s):
                        # スペース、全角スペースを除去して正規化
                        return s.replace(" ", "").replace("　", "")
                    
                    n_query = normalize(clean_name)
                    n_result = normalize(result_name)

                    # 条件: 検索した名前(n_query)が、結果の名前(n_result)に含まれていること
                    # 例: 検索「東京タワー」 -> 結果「東京タワー」 (OK)
                    # 例: 検索「東京タワー」 -> 結果「東京タワー駐車場」 (OK)
                    # 例: 検索「五箇山」 -> 結果「老人ホーム」 (NG: '五箇山'が含まれない)
                    # 例: 検索「東京タワー入口」 -> 結果「東京タワー」 (NG: 逆包含はダメ)
                    
                    if n_query not in n_result:
                        # 不一致の場合はスキップ
                        continue

                    # ここまで来たら採用
                    formatted_addr = props.get("formatted", "")
                    desc = formatted_addr.replace(clean_name, "").replace(area_context, "").strip(", ")

                    return {
                        "name": result_name, # Geoapifyの正確な名称を採用
                        "description": desc or "AIおすすめスポット",
                        "coordinates": feat["geometry"]["coordinates"],
                    }
                
                # ループ終了しても見つからなかった場合
                print(f"⚠️ No strictly matching result found for: {spot_name}")
                return None

        else:
            print(f"Geoapify Error {res.status_code}")

    except Exception as e:
        print(f"Coord fetch failed for {spot_name}: {e}")
    
    return None

# ---------------------------------------------------------
# モックデータ生成 (宿検索用)
# ---------------------------------------------------------
def generate_mock_hotels(lat, lng, radius_km, count=15):
    mock_hotels = []
    hotel_names = ["グランドホテル", "温泉旅館", "ビジネスホテル", "リゾートホテル", "ゲストハウス"]
    prefixes = ["第一", "ロイヤル", "セントラル", "シーサイド", "山手"]
    
    for i in range(count):
        r = radius_km * math.sqrt(random.random())
        theta = random.random() * 2 * math.pi
        dy = r * math.sin(theta) / 111.0
        dx = r * math.cos(theta) / (111.0 * math.cos(math.radians(lat)))
        
        mock_hotels.append({
            "id": f"mock_{i}",
            "name": f"{random.choice(prefixes)}{random.choice(hotel_names)} {chr(65+i)}",
            "description": "【デモ】快適な滞在をお約束します。",
            "coordinates": [lng + dx, lat + dy],
            "image_url": None,
            "url": "https://travel.rakuten.co.jp/", # リンク先はトップページ等のダミー
            "price": random.randint(5000, 30000),
            "rating": round(random.uniform(3.5, 5.0), 1),
            "source": "rakuten",
            "is_hotel": True
        })
    return mock_hotels

# ---------------------------------------------------------
# API: 楽天トラベル関連 (宿追加用 - モックのみ)
# ---------------------------------------------------------
@app.post("/api/search_hotels_vacant")
async def search_hotels_vacant(req: VacantSearchRequest):
    """
    リスト画面からの宿追加用。
    楽天APIキー等の処理は削除し、常にモックデータを返します。
    """
    return {"hotels": generate_mock_hotels(req.latitude, req.longitude, req.radius)}

# ---------------------------------------------------------
# API: AIスポット提案 (Geoapify版 + 厳格フィルタ)
# ---------------------------------------------------------
@app.post("/api/suggest_spots")
async def suggest_spots(req: SuggestRequest):
    """
    AIによる観光スポット提案。
    Geoapifyを使って座標を取得します。
    """
    formatted_spots = []
    
    prompt = f"""
    場所: {req.theme}
    タスク: 観光客に人気の「超有名・王道観光スポット」を15個挙げてください。
    条件: 
    - **ホテルや宿泊施設は絶対に含めないでください。**
    - 飲食店単体は含めないでください（食べ歩きエリアなどは可）。
    - 既にリストにある {", ".join(req.existing_spots) if req.existing_spots else "なし"} は除外してください。
    出力: JSON形式 {{ "spots": ["名称1", "名称2"...] }}
    """

    async with httpx.AsyncClient(verify=False) as client:
        try:
            # 1. AIにスポット名を列挙させる
            ai_res = await aclient.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                max_tokens=800
            )
            spot_names = json.loads(ai_res.choices[0].message.content).get("spots", [])
            
            # 重複排除して最大10件
            target_names = list(dict.fromkeys(spot_names))[:10]
            
            print(f"🤖 AI Candidates: {target_names}")

            # 2. Geoapifyで座標を取得 (並列処理)
            tasks = [fetch_spot_coordinates(client, name, req.theme) for name in target_names]
            results = await asyncio.gather(*tasks)
            
            # 3. 結果の集約
            seen_coords = []
            for res in results:
                if res and res["coordinates"] and res["coordinates"] != [0.0, 0.0]:
                    if res["coordinates"] in seen_coords:
                        continue
                    
                    formatted_spots.append({
                        "name": res["name"],
                        "description": res["description"],
                        "coordinates": res["coordinates"],
                        "stay_time": 90,
                        "source": "ai",
                        "is_hotel": False 
                    })
                    seen_coords.append(res["coordinates"])
            
            print(f"✅ Returns: {len(formatted_spots)} spots")
            print(f"📋 Final List: {[s['name'] for s in formatted_spots]}")

        except Exception as e:
            print(f"AI Suggestion Error: {e}")
            traceback.print_exc()
            pass
            
    return {"spots": formatted_spots}

@app.post("/api/verify_spots")
async def verify_spots(req: VerifyRequest):
    return {"spots": req.spots}

# ---------------------------------------------------------
# その他: ルート最適化など
# ---------------------------------------------------------
def generate_google_maps_url(origin_name, dest_name):
    base = "https://www.google.com/maps/dir/?api=1"
    return f"{base}&origin={urllib.parse.quote(origin_name)}&destination={urllib.parse.quote(dest_name)}&travelmode=driving"

async def calculate_route_fallback(client, ordered_spots, start_min, limit_min):
    # Mapbox Directions APIを使用 (ルート描画用)
    coords_string = ";".join([f"{s.coordinates[0]},{s.coordinates[1]}" for s in ordered_spots])
    url = f"https://api.mapbox.com/directions/v5/mapbox/driving/{coords_string}"
    params = {"access_token": MAPBOX_ACCESS_TOKEN, "geometries": "geojson"}
    
    res = await client.get(url, params=params)
    data = res.json()
    
    if "routes" not in data or not data['routes']:
            return {"error": "ルート計算失敗"}

    route = data['routes'][0]
    legs = route['legs']
    timeline = []
    current_time = start_min
    
    for i, spot in enumerate(ordered_spots):
        stay_min = spot.stay_time if spot.stay_time > 0 else 60
        arrival_time = current_time
        departure_time = arrival_time + stay_min
        if departure_time > limit_min: break
        
        timeline.append({
            "type": "spot",
            "spot": {**spot.model_dump(), "stay_time": stay_min},
            "stay_min": stay_min,
            "arrival": f"{int(arrival_time//60):02d}:{int(arrival_time%60):02d}",
            "departure": f"{int(departure_time//60):02d}:{int(departure_time%60):02d}",
        })

        if i < len(legs):
            travel_min = math.ceil(legs[i]['duration'] / 60)
            if i+1 < len(ordered_spots):
                next_spot = ordered_spots[i+1]
                g_url = generate_google_maps_url(spot.name, next_spot.name)
                timeline.append({
                    "type": "travel",
                    "duration_min": travel_min,
                    "google_maps_url": g_url
                })
            current_time = departure_time + travel_min

    used_names = set(t['spot']['name'] for t in timeline if t['type'] == 'spot')
    final_unused = [s for s in ordered_spots if s.name not in used_names]

    return {
        "timeline": timeline,
        "unused_spots": final_unused,
        "route_geometry": route['geometry']
    }

@app.post("/api/optimize_route")
@app.post("/api/calculate_route")
async def calculate_route_endpoint(req: OptimizeRequest):
    spots = [s for s in req.spots if s.coordinates and len(s.coordinates) >= 2]
    if len(spots) < 2: return {"error": "2箇所以上必要"}
    try:
        sh, sm = map(int, req.start_time.split(':'))
        start_min = sh * 60 + sm
        eh, em = map(int, req.end_time.split(':'))
        limit_min = eh * 60 + em
    except: start_min, limit_min = 540, 1080

    async with httpx.AsyncClient(verify=False) as client:
        return await calculate_route_fallback(client, spots, start_min, limit_min)