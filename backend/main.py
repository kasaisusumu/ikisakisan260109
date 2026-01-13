from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator
from typing import Optional, List, Any
import os
import json
import urllib.parse
import asyncio
import httpx 
from dotenv import load_dotenv
from openai import AsyncOpenAI 
import math
import re 
import traceback
from datetime import date, timedelta 
import random 

load_dotenv()

# ==========================================
# 🔑 設定
# ==========================================
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
MAPBOX_ACCESS_TOKEN = os.getenv("MAPBOX_ACCESS_TOKEN")
GEOAPIFY_API_KEY = os.getenv("GEOAPIFY_API_KEY")
RAKUTEN_APP_ID = os.getenv("RAKUTEN_APP_ID")

app = FastAPI()

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
    checkin_date: Optional[str] = None
    checkout_date: Optional[str] = None
    adult_num: int = 2

class ImportRequest(BaseModel):
    url: str

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
    plan_id: Optional[str] = None
    room_class: Optional[str] = None
    status: str = "candidate"
    day: int = 0

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
# ユーティリティ
# ---------------------------------------------------------
async def fetch_spot_coordinates(client, target_name: str, search_query: str):
    try:
        clean_query = re.sub(r'[\(（].*?[\)）]', '', search_query).strip()
        
        # ★改善: limitを5に設定し、複数候補を取得
        url = "https://api.geoapify.com/v1/geocode/search"
        params = {"text": clean_query, "apiKey": GEOAPIFY_API_KEY, "lang": "ja", "limit": 5, "countrycode": "jp"}
        
        res = await client.get(url, params=params, timeout=10.0)
        
        if res.status_code == 200:
            data = res.json()
            if "features" in data and len(data["features"]) > 0:
                # ★改善: 上位から順にチェックし、条件に合うものが見つかれば採用
                for i, feat in enumerate(data["features"]):
                    props = feat["properties"]
                    result_name = props.get("name", "")
                    
                    # ★改善: 名前がない（空文字やNone）場合はスキップ（無題の間引き）
                    if not result_name or not result_name.strip():
                        print(f"    🗑️ [Skip #{i+1}] No Name (Address only?) -> Skipping")
                        continue

                    formatted_addr = props.get("formatted", "")
                    
                    def normalize(s): return s.replace(" ", "").replace("　", "")
                    n_target = normalize(target_name)
                    n_result = normalize(result_name)
                    
                    if len(n_target) == 0: continue
                    
                    # 照合ロジック
                    is_contained = (n_target in n_result) or (n_result in n_target)
                    common_chars = sum(1 for c in n_target if c in n_result)
                    match_ratio = common_chars / len(n_target) if len(n_target) > 0 else 0
                    
                    status_icon = "❌"
                    if is_contained or match_ratio >= 0.5:
                        status_icon = "✅"
                    
                    print(f"    👉 [Check #{i+1}] AI: '{target_name}' vs API: '{result_name}' | Ratio: {match_ratio:.2f} | {status_icon}")

                    if is_contained or match_ratio >= 0.5:
                        desc = formatted_addr.replace(result_name, "").strip(", ")
                        return {"name": result_name, "description": desc or "AIおすすめスポット", "coordinates": feat["geometry"]["coordinates"]}
            else:
                print(f"    ⚠️ [NotFound] No results for '{clean_query}'")

    except Exception as e:
        print(f"Coord fetch failed for {target_name}: {e}")
    return None

# ---------------------------------------------------------
# API: 楽天URLからのホテルインポート
# ---------------------------------------------------------
@app.post("/api/import_rakuten_hotel")
async def import_rakuten_hotel(req: ImportRequest):
    if not RAKUTEN_APP_ID:
        return {"error": "サーバー設定エラー: RAKUTEN_APP_IDが設定されていません"}

    hotel_no = None
    final_url = req.url

    async with httpx.AsyncClient(verify=False, follow_redirects=True) as client:
        try:
            if "rakuten.co.jp" in req.url:
                try:
                    res = await client.get(req.url, timeout=10.0)
                    final_url = str(res.url)
                except Exception as e:
                    print(f"Redirect follow failed: {e}")
            
            match = re.search(r'travel\.rakuten\.co\.jp/.*?/(\d+)', final_url)
            if match:
                hotel_no = match.group(1)
            else:
                parsed = urllib.parse.urlparse(final_url)
                qs = urllib.parse.parse_qs(parsed.query)
                if "f_no" in qs: hotel_no = qs["f_no"][0]
                elif "no" in qs: hotel_no = qs["no"][0]

            if not hotel_no:
                return {"error": "URLからホテルIDを特定できませんでした。楽天トラベルのホテルページURLか確認してください。"}

            params = {
                "applicationId": RAKUTEN_APP_ID,
                "format": "json",
                "hotelNo": hotel_no,
                "datumType": 1,
            }
            api_url = "https://app.rakuten.co.jp/services/api/Travel/SimpleHotelSearch/20170426"
            res = await client.get(api_url, params=params, timeout=10.0)
            
            if res.status_code != 200:
                return {"error": "ホテル情報の取得に失敗しました。"}

            data = res.json()
            if "hotels" not in data or not data["hotels"]:
                return {"error": "該当するホテルが見つかりませんでした。"}

            raw_hotel = data["hotels"][0]
            basic = None
            
            hotel_content = raw_hotel
            if isinstance(raw_hotel, dict) and "hotel" in raw_hotel:
                hotel_content = raw_hotel["hotel"]
            
            if isinstance(hotel_content, list) and len(hotel_content) > 0:
                basic = hotel_content[0].get("hotelBasicInfo")
            elif isinstance(hotel_content, dict):
                basic = hotel_content.get("hotelBasicInfo")

            if not basic:
                return {"error": "ホテル情報の解析に失敗しました。"}

            spot_data = {
                "id": str(basic["hotelNo"]),
                "name": basic["hotelName"],
                "description": basic.get("hotelSpecial", "")[:100] + "...",
                "coordinates": [basic["longitude"], basic["latitude"]],
                "image_url": basic.get("hotelImageUrl"),
                "url": basic.get("hotelInformationUrl"),
                "price": basic.get("hotelMinCharge", 0),
                "rating": basic.get("reviewAverage", 3.0),
                "source": "rakuten",
                "is_hotel": True,
                "status": "hotel_candidate"
            }
            
            return {"spot": spot_data}

        except Exception as e:
            print(f"Import Error: {e}")
            return {"error": "処理中にエラーが発生しました。"}

# ---------------------------------------------------------
# API: 楽天トラベル (VacantHotelSearch)
# ---------------------------------------------------------
@app.post("/api/search_hotels_vacant")
async def search_hotels_vacant(req: VacantSearchRequest):
    if not RAKUTEN_APP_ID:
        return {"error": "サーバー設定エラー: RAKUTEN_APP_IDが設定されていません"}

    async with httpx.AsyncClient(verify=False) as client:
        safe_radius = round(req.radius, 1)
        today = date.today()
        c_in = req.checkin_date
        c_out = req.checkout_date
        
        if not c_in:
            next_month = today + timedelta(days=30)
            c_in = next_month.strftime("%Y-%m-%d")
        if not c_out:
            try:
                c_in_obj = date.fromisoformat(c_in)
                c_out = (c_in_obj + timedelta(days=1)).strftime("%Y-%m-%d")
            except:
                c_out = (today + timedelta(days=31)).strftime("%Y-%m-%d")

        params = {
            "applicationId": RAKUTEN_APP_ID,
            "format": "json",
            "latitude": req.latitude,
            "longitude": req.longitude,
            "searchRadius": safe_radius,
            "datumType": 1,
            "hits": 30,
            "sort": "standard",
            "checkinDate": c_in,
            "checkoutDate": c_out,
            "adultNum": req.adult_num,
        }
        
        if req.max_price: params["maxCharge"] = req.max_price
        if req.min_price: params["minCharge"] = req.min_price

        try:
            url = "https://app.rakuten.co.jp/services/api/Travel/VacantHotelSearch/20170426"
            res = await client.get(url, params=params, timeout=10.0)
            
            if res.status_code == 404:
                return {"hotels": []}

            if res.status_code != 200:
                try:
                    error_json = res.json()
                    error_desc = error_json.get("error_description", str(res.text))
                    return {"error": f"楽天APIエラー: {error_desc}"}
                except:
                    return {"error": f"楽天API通信エラー: HTTP {res.status_code}"}

            data = res.json()
            hotels = []
            
            if "hotels" in data:
                raw_hotels = data["hotels"]
                for i, h_group in enumerate(raw_hotels):
                    try:
                        hotel_content = h_group
                        if isinstance(h_group, dict) and "hotel" in h_group:
                            hotel_content = h_group["hotel"]
                        
                        if not isinstance(hotel_content, list) or len(hotel_content) == 0:
                            continue

                        basic = hotel_content[0].get("hotelBasicInfo")
                        if not basic: continue

                        best_price = float('inf')
                        best_plan_id = None
                        best_room_class = None
                        found_valid_plan = False
                        
                        for j in range(1, len(hotel_content)):
                            room_container = hotel_content[j]
                            if "roomInfo" in room_container:
                                r_info = room_container["roomInfo"]
                                if isinstance(r_info, list) and len(r_info) >= 2:
                                    r_basic = r_info[0].get("roomBasicInfo")
                                    r_charge = r_info[1].get("dailyCharge")
                                    
                                    if r_basic and r_charge:
                                        total = r_charge.get("total", 0)
                                        if total and total > 0:
                                            if total < best_price:
                                                best_price = total
                                                best_plan_id = r_basic.get("planId")
                                                best_room_class = r_basic.get("roomClass")
                                                found_valid_plan = True

                        if not found_valid_plan: continue
                        if req.min_price and best_price < req.min_price: continue
                        if req.max_price and best_price > req.max_price: continue

                        name = basic["hotelName"]
                        review_avg = basic.get("reviewAverage")
                        final_rating = review_avg if review_avg else 3.0
                        
                        hotels.append({
                            "id": str(basic["hotelNo"]),
                            "name": name,
                            "description": basic.get("hotelSpecial", "")[:60] + "...",
                            "coordinates": [basic["longitude"], basic["latitude"]],
                            "image_url": basic.get("hotelImageUrl"),
                            "url": basic.get("hotelInformationUrl"),
                            "price": int(best_price),
                            "rating": final_rating,
                            "review_count": basic.get("reviewCount", 0),
                            "source": "rakuten",
                            "is_hotel": True,
                            "plan_id": best_plan_id,
                            "room_class": best_room_class,
                            "status": "hotel_candidate"
                        })
                    except Exception as parse_err:
                        print(f"⚠️ Parse Error at index {i}: {parse_err}")
                        continue
            
            return {"hotels": hotels}

        except Exception as e:
            traceback.print_exc()
            return {"error": f"システムエラー: {str(e)}"}

# ---------------------------------------------------------
# API: AI提案 (検索精度強化版)
# ---------------------------------------------------------
@app.post("/api/suggest_spots")
async def suggest_spots(req: SuggestRequest):
    formatted_spots = []
    
    prompt = f"""
    場所: {req.theme}
    タスク: 観光客に人気の「超有名・王道観光スポット」を10〜15個挙げてください。
    条件:
    1. ホテルや宿泊施設は除外。
    2. 既存リスト: {", ".join(req.existing_spots)} は除外。
    3. 出力はJSON形式のオブジェクト配列とする。
    4. 各スポットについて、以下の2つのフィールドを含めること。
       - "name": 地図APIで見つかりやすい正式名称（通称や略称は避ける）
       - "search_query": そのスポットを地図APIで確実にヒットさせるための検索クエリ（例: "スポット名 + 都道府県 + 市区町村"）

    出力例:
    {{
      "spots": [
        {{ "name": "金閣寺", "search_query": "金閣寺 京都府京都市北区" }},
        {{ "name": "東京タワー", "search_query": "東京タワー 東京都港区芝公園" }}
      ]
    }}
    """
    
    async with httpx.AsyncClient(verify=False) as client:
        try:
            print(f"\n🚀 [AI Start] Request Theme: {req.theme}")
            
            ai_res = await aclient.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                max_tokens=1000
            )
            
            content = ai_res.choices[0].message.content
            json_data = json.loads(content)
            raw_spots = json_data.get("spots", [])
            
            spot_names_log = [s.get("name") for s in raw_spots]
            print(f"🤖 [AI Proposal]: {spot_names_log}")
            
            seen_names = set()
            target_spots = []
            for s in raw_spots:
                if s["name"] not in seen_names:
                    target_spots.append(s)
                    seen_names.add(s["name"])
            target_spots = target_spots[:10]

            # 2. 住所特定（Geoapify）
            tasks = [fetch_spot_coordinates(client, s["name"], s["search_query"]) for s in target_spots]
            results = await asyncio.gather(*tasks)
            
            seen_coords = []
            for res in results:
                if res and res["coordinates"] != [0.0, 0.0] and res["coordinates"] not in seen_coords:
                    formatted_spots.append({**res, "stay_time": 90, "source": "ai", "is_hotel": False, "status": "candidate"})
                    seen_coords.append(res["coordinates"])
            
            verified_names = [s['name'] for s in formatted_spots]
            print(f"✅ [Verified Result]: {verified_names}")
            print(f"📉 [Drop Rate]: {len(raw_spots)} -> {len(formatted_spots)}\n")

        except Exception as e:
            print(f"❌ [Error]: {e}")
            traceback.print_exc()

    return {"spots": formatted_spots}

@app.post("/api/verify_spots")
async def verify_spots(req: VerifyRequest):
    return {"spots": req.spots}

# ---------------------------------------------------------
# ルート最適化
# ---------------------------------------------------------
async def calculate_route_fallback(client, ordered_spots, start_min, limit_min):
    if not ordered_spots: return {"error": "スポットがありません"}
    coords = ";".join([f"{s.coordinates[0]},{s.coordinates[1]}" for s in ordered_spots])
    url = f"https://api.mapbox.com/directions/v5/mapbox/driving/{coords}"
    res = await client.get(url, params={"access_token": MAPBOX_ACCESS_TOKEN, "geometries": "geojson"})
    data = res.json()
    if "routes" not in data or not data['routes']: return {"error": "ルート計算失敗"}
    
    route = data['routes'][0]
    timeline = []
    current = start_min
    for i, spot in enumerate(ordered_spots):
        stay = spot.stay_time or 60
        arr = current
        dep = arr + stay
        if dep > limit_min: break
        timeline.append({
            "type": "spot", "spot": {**spot.model_dump(), "stay_time": stay},
            "arrival": f"{int(arr//60):02d}:{int(arr%60):02d}",
            "departure": f"{int(dep//60):02d}:{int(dep%60):02d}"
        })
        if i < len(route['legs']):
            dur = math.ceil(route['legs'][i]['duration'] / 60)
            if i+1 < len(ordered_spots):
                gurl = f"https://www.google.com/maps/dir/?api=1&origin={urllib.parse.quote(spot.name)}&destination={urllib.parse.quote(ordered_spots[i+1].name)}&travelmode=driving"
                timeline.append({"type": "travel", "duration_min": dur, "google_maps_url": gurl})
            current = dep + dur
    used = set(t['spot']['name'] for t in timeline if t['type']=='spot')
    return {"timeline": timeline, "unused_spots": [s for s in ordered_spots if s.name not in used], "route_geometry": route['geometry']}

@app.post("/api/optimize_route")
@app.post("/api/calculate_route")
async def calculate_route_endpoint(req: OptimizeRequest):
    spots = [s for s in req.spots if s.coordinates and len(s.coordinates) >= 2]
    if len(spots) < 2: return {"error": "2箇所以上必要"}
    try:
        sh, sm = map(int, req.start_time.split(':'))
        eh, em = map(int, req.end_time.split(':'))
        start, limit = sh*60+sm, eh*60+em
    except: start, limit = 540, 1080
    async with httpx.AsyncClient(verify=False) as client:
        return await calculate_route_fallback(client, spots, start, limit)