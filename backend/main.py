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
RAKUTEN_APP_ID = os.getenv("RAKUTEN_APP_ID") # ★追加: Renderの環境変数に設定してください

app = FastAPI()

# CORS設定: 全てのオリジンからのアクセスを許可
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
# ユーティリティ: Geoapifyで座標取得
# ---------------------------------------------------------
async def fetch_spot_coordinates(client, spot_name: str, area_context: str = ""):
    try:
        clean_name = re.sub(r'[\(（].*?[\)）]', '', spot_name).strip()
        query = f"{clean_name} {area_context}".strip()
        
        url = "https://api.geoapify.com/v1/geocode/search"
        params = {
            "text": query,
            "apiKey": GEOAPIFY_API_KEY,
            "lang": "ja",
            "limit": 3,
            "countrycode": "jp"
        }
        
        res = await client.get(url, params=params, timeout=10.0)
        
        if res.status_code == 200:
            data = res.json()
            if "features" in data:
                for feat in data["features"]:
                    props = feat["properties"]
                    result_name = props.get("name", "")
                    
                    # 簡易フィルタ: 名前が含まれているか確認
                    def normalize(s): return s.replace(" ", "").replace("　", "")
                    n_query = normalize(clean_name)
                    n_result = normalize(result_name)

                    if n_query not in n_result and n_result not in n_query:
                        continue

                    formatted_addr = props.get("formatted", "")
                    desc = formatted_addr.replace(clean_name, "").replace(area_context, "").strip(", ")

                    return {
                        "name": result_name,
                        "description": desc or "AIおすすめスポット",
                        "coordinates": feat["geometry"]["coordinates"],
                    }
                return None
        else:
            print(f"Geoapify Error {res.status_code}")
    except Exception as e:
        print(f"Coord fetch failed for {spot_name}: {e}")
    return None

# ---------------------------------------------------------
# API: 楽天トラベル 空室/ホテル検索 (本番実装)
# ---------------------------------------------------------
@app.post("/api/search_hotels_vacant")
async def search_hotels_vacant(req: VacantSearchRequest):
    """
    楽天トラベルAPI (SimpleHotelSearch) を使用して周辺のホテルを検索します。
    """
    if not RAKUTEN_APP_ID:
        return {"error": "サーバー側で楽天Application IDが設定されていません。"}

    async with httpx.AsyncClient(verify=False) as client:
        # 1. 楽天APIのリクエストパラメータ構築
        params = {
            "applicationId": RAKUTEN_APP_ID,
            "format": "json",
            "latitude": req.latitude,
            "longitude": req.longitude,
            "searchRadius": req.radius, # 0.1 ~ 3.0 (単位: km)
            "datumType": 1, # WGS84
            "hits": 30, # 取得件数
            "sort": "standard",
        }

        # 絞り込み条件 (API仕様に合わせて設定)
        # ※SimpleHotelSearchではsqueezeConditionで1つだけ指定可能などが一般的
        if "large_bath" in req.squeeze:
            params["squeezeCondition"] = "large_bath"
        elif "breakfast" in req.squeeze:
            params["squeezeCondition"] = "breakfast"
        
        try:
            # 2. API呼び出し
            url = "https://app.rakuten.co.jp/services/api/Travel/SimpleHotelSearch/20170426"
            res = await client.get(url, params=params, timeout=10.0)
            data = res.json()

            if "error" in data:
                print(f"Rakuten API Error: {data['error_description']}")
                return {"error": f"楽天APIエラー: {data['error_description']}"}

            hotels = []
            if "hotels" in data:
                for h_group in data["hotels"]:
                    # 楽天APIのレスポンス構造: [ {hotelBasicInfo}, {hotelRatingInfo} ]
                    basic = h_group[0]["hotelBasicInfo"]
                    rating_info = h_group[1]["hotelRatingInfo"] if len(h_group) > 1 and "hotelRatingInfo" in h_group[1] else {}

                    price = basic.get("hotelMinCharge", 0) # 最安値

                    # 3. サーバーサイドでの価格フィルタリング
                    # (APIのSimpleHotelSearchには価格フィルタがない場合があるため)
                    if price == 0: continue # 価格不明は除外
                    if req.min_price and price < req.min_price: continue
                    if req.max_price and price > req.max_price: continue

                    hotels.append({
                        "id": str(basic["hotelNo"]),
                        "name": basic["hotelName"],
                        "description": basic.get("hotelSpecial", "")[:60] + "...",
                        "coordinates": [basic["longitude"], basic["latitude"]],
                        "image_url": basic.get("hotelImageUrl"),
                        "url": basic.get("hotelInformationUrl"),
                        "price": price,
                        "rating": rating_info.get("serviceAverage", 0) or 3.0, # 評価がない場合は3.0
                        "review_count": rating_info.get("reviewCount", 0),
                        "source": "rakuten",
                        "is_hotel": True
                    })
            
            # 価格が安い順、または評価順などでソートする場合はここで
            # hotels.sort(key=lambda x: x['price']) 

            return {"hotels": hotels}

        except Exception as e:
            print(f"Rakuten Search Failed: {e}")
            traceback.print_exc()
            return {"error": "ホテル検索中にエラーが発生しました"}

# ---------------------------------------------------------
# API: AIスポット提案
# ---------------------------------------------------------
@app.post("/api/suggest_spots")
async def suggest_spots(req: SuggestRequest):
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
            ai_res = await aclient.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                max_tokens=800
            )
            spot_names = json.loads(ai_res.choices[0].message.content).get("spots", [])
            target_names = list(dict.fromkeys(spot_names))[:10]
            
            tasks = [fetch_spot_coordinates(client, name, req.theme) for name in target_names]
            results = await asyncio.gather(*tasks)
            
            seen_coords = []
            for res in results:
                if res and res["coordinates"] and res["coordinates"] != [0.0, 0.0]:
                    if res["coordinates"] in seen_coords: continue
                    formatted_spots.append({
                        "name": res["name"],
                        "description": res["description"],
                        "coordinates": res["coordinates"],
                        "stay_time": 90,
                        "source": "ai",
                        "is_hotel": False 
                    })
                    seen_coords.append(res["coordinates"])

        except Exception as e:
            print(f"AI Suggestion Error: {e}")
            pass
            
    return {"spots": formatted_spots}

@app.post("/api/verify_spots")
async def verify_spots(req: VerifyRequest):
    return {"spots": req.spots}

# ---------------------------------------------------------
# ルート最適化
# ---------------------------------------------------------
def generate_google_maps_url(origin_name, dest_name):
    base = "https://www.google.com/maps/dir/?api=1"
    return f"{base}&origin={urllib.parse.quote(origin_name)}&destination={urllib.parse.quote(dest_name)}&travelmode=driving"

async def calculate_route_fallback(client, ordered_spots, start_min, limit_min):
    if not ordered_spots: return {"error": "スポットがありません"}
    
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