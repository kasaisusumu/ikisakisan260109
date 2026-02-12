from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator
from typing import Optional, List, Any, Dict, Union
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
from contextlib import asynccontextmanager
import sqlite3
import hashlib

load_dotenv()

# ==========================================
# 🔑 設定
# ==========================================
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
MAPBOX_ACCESS_TOKEN = os.getenv("MAPBOX_ACCESS_TOKEN")
GEOAPIFY_API_KEY = os.getenv("GEOAPIFY_API_KEY")
RAKUTEN_APP_ID = os.getenv("RAKUTEN_APP_ID")

# HTTPクライアント
http_client = None

# ==========================================
# 💾 キャッシュシステム (SQLite)
# ==========================================
DB_PATH = "cache.db"

def init_db():
    """キャッシュ用データベースの初期化"""
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS api_cache (
                key TEXT PRIMARY KEY,
                value TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()

def get_cache(key: str) -> Optional[Dict]:
    """キャッシュの取得"""
    try:
        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.execute("SELECT value FROM api_cache WHERE key = ?", (key,))
            row = cursor.fetchone()
            if row:
                return json.loads(row[0])
    except Exception as e:
        print(f"Cache Read Error: {e}")
    return None

def set_cache(key: str, data: Any):
    """キャッシュの保存"""
    try:
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute(
                "INSERT OR REPLACE INTO api_cache (key, value) VALUES (?, ?)",
                (key, json.dumps(data))
            )
            conn.commit()
    except Exception as e:
        print(f"Cache Write Error: {e}")

# ==========================================
# 🚀 アプリケーションライフサイクル
# ==========================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    global http_client
    http_client = httpx.AsyncClient(verify=False, timeout=30.0)
    print("✅ System initialized with SQLite Cache & Robust Retry Logic")
    yield
    if http_client:
        await http_client.aclose()

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

aclient = AsyncOpenAI(
    api_key=OPENAI_API_KEY,
    max_retries=5,     
    timeout=60.0       
)

# --- 型定義 ---
class ExistingSpot(BaseModel):
    name: str
    coordinates: Optional[List[float]] = None

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
    meal_type: Optional[str] = None # 'room_only', 'breakfast', 'half_board', 'none'
    polygon: Optional[List[List[float]]] = None 

class ImportRequest(BaseModel):
    url: str

class SuggestRequest(BaseModel):
    theme: str             
    existing_spots: List[Union[ExistingSpot, str, Dict[str, Any]]] = [] 
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
    comment: str = ""
    link: str = ""
    category: str = "観光スポット"

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

class NearbyRequest(BaseModel):
    latitude: float
    longitude: float
    radius: int = 3000  # デフォルト3km
    limit: int = 20
    mode: str = "standard" # 'standard' (観光) or 'wide' (商業施設・食事等)

# ---------------------------------------------------------
# ユーティリティ
# ---------------------------------------------------------

WIKI_HEADERS = {
    "User-Agent": "RouteHackerBot/1.0 (contact@example.com)"
}

def haversine_distance(coord1, coord2):
    R = 6371  # 地球の半径 (km)
    if not coord1 or not coord2: return float('inf')
    try:
        lat1, lon1 = math.radians(coord1[1]), math.radians(coord1[0])
        lat2, lon2 = math.radians(coord2[1]), math.radians(coord2[0])
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        a = math.sin(dlat / 2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2)**2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return R * c
    except:
        return float('inf')

def is_inside_polygon(lat, lng, poly_coords):
    # poly_coords is list of [lng, lat]
    inside = False
    j = len(poly_coords) - 1
    for i in range(len(poly_coords)):
        xi, yi = poly_coords[i][0], poly_coords[i][1] # lng, lat
        xj, yj = poly_coords[j][0], poly_coords[j][1]
        
        intersect = ((yi > lat) != (yj > lat)) and \
            (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)
        if intersect:
            inside = not inside
        j = i
    return inside

# ▼▼▼ 修正: 都道府県名変換・補完マップ ▼▼▼
# 漢字(接尾辞なし/あり)・ローマ字 -> 正しい都道府県名(漢字)
PREF_NORMALIZER = {
    # 北海道・東北
    "北海道": "北海道", "Hokkaido": "北海道",
    "青森": "青森県", "Aomori": "青森県",
    "岩手": "岩手県", "Iwate": "岩手県",
    "宮城": "宮城県", "Miyagi": "宮城県",
    "秋田": "秋田県", "Akita": "秋田県",
    "山形": "山形県", "Yamagata": "山形県",
    "福島": "福島県", "Fukushima": "福島県",
    # 関東
    "茨城": "茨城県", "Ibaraki": "茨城県",
    "栃木": "栃木県", "Tochigi": "栃木県",
    "群馬": "群馬県", "Gunma": "群馬県",
    "埼玉": "埼玉県", "Saitama": "埼玉県",
    "千葉": "千葉県", "Chiba": "千葉県",
    "東京": "東京都", "Tokyo": "東京都",
    "神奈川": "神奈川県", "Kanagawa": "神奈川県",
    # 中部
    "新潟": "新潟県", "Niigata": "新潟県",
    "富山": "富山県", "Toyama": "富山県",
    "石川": "石川県", "Ishikawa": "石川県",
    "福井": "福井県", "Fukui": "福井県",
    "山梨": "山梨県", "Yamanashi": "山梨県",
    "長野": "長野県", "Nagano": "長野県",
    "岐阜": "岐阜県", "Gifu": "岐阜県",
    "静岡": "静岡県", "Shizuoka": "静岡県",
    "愛知": "愛知県", "Aichi": "愛知県",
    # 近畿
    "三重": "三重県", "Mie": "三重県",
    "滋賀": "滋賀県", "Shiga": "滋賀県",
    "京都": "京都府", "Kyoto": "京都府",
    "大阪": "大阪府", "Osaka": "大阪府",
    "兵庫": "兵庫県", "Hyogo": "兵庫県",
    "奈良": "奈良県", "Nara": "奈良県",
    "和歌山": "和歌山県", "Wakayama": "和歌山県",
    # 中国
    "鳥取": "鳥取県", "Tottori": "鳥取県",
    "島根": "島根県", "Shimane": "島根県",
    "岡山": "岡山県", "Okayama": "岡山県",
    "広島": "広島県", "Hiroshima": "広島県",
    "山口": "山口県", "Yamaguchi": "山口県",
    # 四国
    "徳島": "徳島県", "Tokushima": "徳島県",
    "香川": "香川県", "Kagawa": "香川県",
    "愛媛": "愛媛県", "Ehime": "愛媛県",
    "高知": "高知県", "Kochi": "高知県",
    # 九州・沖縄
    "福岡": "福岡県", "Fukuoka": "福岡県",
    "佐賀": "佐賀県", "Saga": "佐賀県",
    "長崎": "長崎県", "Nagasaki": "長崎県",
    "熊本": "熊本県", "Kumamoto": "熊本県",
    "大分": "大分県", "Oita": "大分県",
    "宮崎": "宮崎県", "Miyazaki": "宮崎県",
    "鹿児島": "鹿児島県", "Kagoshima": "鹿児島県",
    "沖縄": "沖縄県", "Okinawa": "沖縄県"
}

# ▼▼▼ 修正: 住所整形用ヘルパー関数 (強制補完ロジック追加) ▼▼▼
def get_clean_address(props: dict) -> str:
    """Geoapifyのプロパティから綺麗な日本語住所を生成する"""
    state = props.get('state', '')
    
    # 1. 無効なstateのクリーニング
    if not state or state in ['NN', 'Other', 'Others', 'その他', 'JP', 'Japan']:
        state = ''
    
    formatted = props.get("formatted", "")
    
    # 2. stateが空の場合、または英字の場合、formattedから都道府県名を強制的に探す
    #    (例: formatted="Nagano, Nagano-shi..." -> state="長野県")
    if not state or all(ord(c) < 128 for c in state):
        for key, val in PREF_NORMALIZER.items():
            # フォーマット内に県名キーが含まれていればそれを採用
            if key in formatted:
                state = val
                break
    
    # 3. stateの正規化 (ローマ字や「長野」→「長野県」への変換)
    if state in PREF_NORMALIZER:
        state = PREF_NORMALIZER[state]
    else:
        # マップになくても、接尾辞がなければ補完を試みる
        if state and not any(state.endswith(s) for s in ['都', '道', '府', '県']):
            if state == '東京': state += '都'
            elif state in ['京都', '大阪']: state += '府'
            elif state != '北海道': state += '県'

    # 4. 市区町村・郡・区の取得
    city = props.get('city', '') or props.get('town', '') or props.get('village', '') or props.get('municipality', '')
    if city in ['NN', 'Other', 'Others', 'その他']: city = ''
    
    county = props.get('county', '') 
    if county in ['NN', 'Other', 'Others', 'その他']: county = ''
    
    ward = props.get('suburb', '') or props.get('district', '') 
    if ward in ['NN', 'Other', 'Others', 'その他']: ward = ''

    # 5. 日本の住所形式で結合
    address_parts = []
    if state: address_parts.append(state)
    if county and not city: address_parts.append(county)
    if city: address_parts.append(city)
    if ward: address_parts.append(ward)

    # 6. 生成
    if address_parts:
        return "".join(address_parts)

    # 7. フォールバック
    return formatted.replace("NN", "").replace(" ,", "").strip(", ")

async def fetch_with_retry(client, url, params=None, headers=None, retries=5, initial_timeout=10.0):
    current_timeout = initial_timeout
    wait_time = 1.0
    for attempt in range(retries + 1):
        try:
            res = await client.get(url, params=params, headers=headers, timeout=current_timeout)
            if res.status_code != 429 and res.status_code < 500:
                return res
            print(f"⚠️ API Busy (Status: {res.status_code}). Retrying... ({attempt+1}/{retries})")
        except (httpx.TimeoutException, httpx.ConnectError, httpx.ReadError, httpx.PoolTimeout) as e:
            print(f"⏳ Timeout/Network Error: {e}. Retrying... ({attempt+1}/{retries})")
        if attempt < retries:
            await asyncio.sleep(wait_time)
            wait_time *= 1.5
            current_timeout += 5.0
        else:
            print(f"❌ Max retries reached for {url}")
            if 'res' in locals(): return res
            return None

async def fetch_wikipedia_image(client, query: str):
    """(旧互換) 画像URLのみを取得"""
    info = await fetch_wikipedia_info(client, query)
    return info.get("image_url")

async def fetch_wikipedia_info(client, query: str, target_name: str = None):
    """
    画像と概要(summary)をまとめて取得する
    target_name が指定されている場合、ページタイトルにその名前が含まれているかチェックする
    """
    if not query: return {"image_url": None, "summary": None}
    
    # キャッシュキー
    cache_key = f"wiki_info_v4:{query}"
    cached = get_cache(cache_key)
    if cached: return cached

    try:
        # 1. 検索してページIDを取得
        search_url = "https://ja.wikipedia.org/w/api.php"
        search_params = {
            "action": "query", "list": "search", "srsearch": query,
            "format": "json", "utf8": 1, "srlimit": 5 
        }
        res = await fetch_with_retry(client, search_url, params=search_params, headers=WIKI_HEADERS, initial_timeout=3.0)
        
        if not res: return {"image_url": None, "summary": None}
        data = res.json()
        
        search_results = data.get("query", {}).get("search", [])
        if not search_results:
             return {"image_url": None, "summary": None}
             
        page_id = None
        
        if target_name:
            norm_target = target_name.replace(" ", "").replace("　", "")
            for item in search_results:
                title = item["title"].replace(" ", "").replace("　", "")
                if norm_target in title or title in norm_target:
                    page_id = item["pageid"]
                    break
        else:
            page_id = search_results[0]["pageid"]

        if not page_id:
             return {"image_url": None, "summary": None}
        
        # 2. 詳細情報を取得
        info_url = "https://ja.wikipedia.org/w/api.php"
        info_params = {
            "action": "query", 
            "prop": "pageimages|extracts", 
            "pageids": page_id, 
            "pithumbsize": 500,
            "exintro": 1,       
            "explaintext": 1,   
            "exchars": 200,     
            "format": "json"
        }
        info_res = await fetch_with_retry(client, info_url, params=info_params, headers=WIKI_HEADERS, initial_timeout=3.0)
        
        if not info_res: return {"image_url": None, "summary": None}
        
        info_data = info_res.json()
        pages = info_data.get("query", {}).get("pages", {})
        page = pages.get(str(page_id))
        
        if page:
            image_url = page.get("thumbnail", {}).get("source")
            summary = page.get("extract", "").replace("\n", "")
            
            if "参照" in summary or "曖昧さ回避" in summary:
                summary = None
            
            if summary and len(summary) >= 200:
                summary = summary.rstrip("、。") + "..."
            
            result = {"image_url": image_url, "summary": summary}
            set_cache(cache_key, result)
            return result
            
    except Exception as e:
        print(f"Wiki info fetch error: {e}")
    
    return {"image_url": None, "summary": None}

async def fetch_spot_coordinates(client, target_name: str, search_query: str):
    cache_key = f"geo_v4:{target_name}:{search_query}"
    cached = get_cache(cache_key)
    if cached: return cached

    try:
        clean_query = re.sub(r'[(（].*?[)）]', '', search_query).strip()
        url = "https://api.geoapify.com/v1/geocode/search"
        params = {"text": clean_query, "apiKey": GEOAPIFY_API_KEY, "lang": "ja", "limit": 3, "countrycode": "jp"}
        res = await fetch_with_retry(client, url, params=params, initial_timeout=8.0, retries=5)

        image_url = None
        wiki_summary = None
        
        if res and res.status_code == 200:
            data = res.json()
            if "features" in data and len(data["features"]) > 0:
                for i, feat in enumerate(data["features"]):
                    props = feat["properties"]
                    result_name = props.get("name", "")
                    if not result_name or not result_name.strip(): continue

                    formatted_addr = props.get("formatted", "")
                    def normalize(s): return s.replace(" ", "").replace("　", "")
                    n_target = normalize(target_name)
                    n_result = normalize(result_name)
                    
                    if len(n_target) == 0: continue
                    is_contained = (n_target in n_result) or (n_result in n_target)
                    common_chars = sum(1 for c in n_target if c in n_result)
                    match_ratio = common_chars / len(n_target) if len(n_target) > 0 else 0
                    is_match = is_contained or match_ratio >= 0.5

                    if is_match:
                        # ▼▼▼ 修正: get_clean_address を使用 ▼▼▼
                        desc = get_clean_address(props)
                        if not desc: desc = "住所不明"

                        state = props.get("state", "")
                        city = props.get("city", "") or props.get("town", "")
                        
                        wiki_query = f"{result_name} {state}".strip()
                        if len(wiki_query) < len(result_name) + 2:
                             wiki_query = search_query

                        try:
                            wiki_info = await fetch_wikipedia_info(client, wiki_query, target_name=result_name)
                            image_url = wiki_info.get("image_url")
                            if wiki_info.get("summary"):
                                wiki_summary = wiki_info["summary"]
                        except:
                            pass

                        result_data = {
                            "name": result_name, 
                            "description": desc, 
                            "coordinates": feat["geometry"]["coordinates"],
                            "image_url": image_url,
                            "comment": wiki_summary or "" 
                        }
                        set_cache(cache_key, result_data)
                        return result_data
    except Exception as e:
        print(f"Coord fetch failed for {target_name}: {e}")
    
    return None

async def fetch_spot_by_coordinates(client, lat: float, lng: float, fallback_name: str):
    lat_k = round(lat, 6)
    lng_k = round(lng, 6)
    cache_key = f"geo_reverse_v1:{lat_k}:{lng_k}"
    
    cached = get_cache(cache_key)
    if cached: return cached

    try:
        url = "https://api.geoapify.com/v1/geocode/reverse"
        params = {
            "lat": lat, 
            "lon": lng, 
            "apiKey": GEOAPIFY_API_KEY, 
            "lang": "ja", 
            "limit": 1
        }
        
        res = await fetch_with_retry(client, url, params=params, initial_timeout=8.0, retries=3)

        image_url = None
        wiki_summary = None
        
        if res and res.status_code == 200:
            data = res.json()
            if "features" in data and len(data["features"]) > 0:
                props = data["features"][0]["properties"]
                
                result_name = props.get("name", "")
                if not result_name:
                    result_name = fallback_name

                # ▼▼▼ 修正: get_clean_address を使用 ▼▼▼
                desc = get_clean_address(props)
                desc = re.sub(r'〒\d{3}-\d{4}', '', desc).strip()
                if not desc: desc = "住所不明"

                state = props.get("state", "")
                city = props.get("city", "") or props.get("town", "")
                wiki_query = f"{result_name} {state} {city}".strip()

                try:
                    wiki_info = await fetch_wikipedia_info(client, wiki_query, target_name=result_name)
                    image_url = wiki_info.get("image_url")
                    if wiki_info.get("summary"):
                        wiki_summary = wiki_info["summary"]
                except:
                    pass

                result_data = {
                    "name": result_name, 
                    "description": desc,
                    "coordinates": [lng, lat],
                    "image_url": image_url,
                    "comment": wiki_summary or "" 
                }
                set_cache(cache_key, result_data)
                return result_data
    except Exception as e:
        print(f"Reverse Geo Error: {e}")
    
    return None

# ---------------------------------------------------------
# API: 各種エンドポイント
# ---------------------------------------------------------

@app.post("/api/nearby_spots")
async def nearby_spots(req: NearbyRequest):
    global http_client
    if http_client is None: return {"spots": []}
    client = http_client

    lat_k = round(req.latitude, 3)
    lon_k = round(req.longitude, 3)
    cache_key = f"nearby_v4:{lat_k}:{lon_k}:{req.radius}:{req.mode}"
    
    cached = get_cache(cache_key)
    if cached: return cached

    try:
        url = "https://api.geoapify.com/v2/places"
        
        if req.mode == "wide":
            categories = "commercial.shopping_mall,commercial.department_store,catering.restaurant,catering.cafe,entertainment,leisure.park,public_transport"
        else:
            categories = "tourism,building.historic,natural,entertainment.culture,religion,natural.cave_entrance"

        params = {
            "categories": categories,
            "filter": f"circle:{req.longitude},{req.latitude},{req.radius}",
            "bias": f"proximity:{req.longitude},{req.latitude}",
            "limit": 20,
            "apiKey": GEOAPIFY_API_KEY,
            "lang": "ja"
        }

        res = await fetch_with_retry(client, url, params=params, initial_timeout=10.0)
        
        base_spots = []
        if res and res.status_code == 200:
            data = res.json()
            if "features" in data:
                for feat in data["features"]:
                    props = feat["properties"]
                    name = props.get("name", "")
                    if not name: continue 

                    geometry = feat.get("geometry")
                    if not geometry or "coordinates" not in geometry: continue
                    coords = geometry["coordinates"]
                    if not isinstance(coords, list) or len(coords) != 2: continue

                    # ▼▼▼ 修正: get_clean_address を使用 ▼▼▼
                    formatted = get_clean_address(props)
                    
                    categories_list = props.get("categories", [])
                    cat_str = "スポット"
                    if "catering" in str(categories_list): cat_str = "グルメ"
                    elif "commercial" in str(categories_list): cat_str = "ショッピング"
                    elif "tourism" in str(categories_list): cat_str = "観光"
                    elif "religion" in str(categories_list): cat_str = "寺社仏閣"
                    elif "natural" in str(categories_list): cat_str = "自然"

                    state = props.get('state', '')
                    city = props.get('city', '') or props.get('town', '')
                    search_query = f"{name} {state}".strip()

                    base_spots.append({
                        "id": f"nearby-{props.get('place_id')}",
                        "name": name,
                        "description": formatted, 
                        "coordinates": coords,
                        "is_nearby": True,
                        "category": cat_str,
                        "is_commercial": req.mode == "wide",
                        "search_query": search_query,
                        "image_url": None,
                        "comment": "" 
                    })

        async def enrich_spot(spot):
            try:
                wiki_data = await fetch_wikipedia_info(client, spot["search_query"], target_name=spot["name"])
                if wiki_data["image_url"]:
                    spot["image_url"] = wiki_data["image_url"]
                if wiki_data["summary"]:
                    spot["comment"] = wiki_data["summary"] 
            except:
                pass 
            return spot

        if base_spots:
            enriched_spots = await asyncio.gather(*[enrich_spot(s) for s in base_spots])
        else:
            enriched_spots = []

        result = {"spots": enriched_spots}
        if enriched_spots:
            set_cache(cache_key, result)
            
        return result

    except Exception as e:
        print(f"Nearby fetch error: {e}")
        return {"spots": []}


@app.get("/api/get_spot_image")
async def get_spot_image(query: str):
    global http_client
    if http_client is None: return {"image_url": None}
    img_url = await fetch_wikipedia_image(http_client, query)
    return {"image_url": img_url}

@app.post("/api/import_rakuten_hotel")
async def import_rakuten_hotel(req: ImportRequest):
    if not RAKUTEN_APP_ID: return {"error": "サーバー設定エラー"}
    hotel_no = None
    final_url = req.url
    global http_client
    if http_client is None: return {"error": "Server starting up..."}
    client = http_client

    try:
        cache_key = f"rakuten_import_v2:{req.url}"
        cached = get_cache(cache_key)
        if cached: return cached

        if "rakuten.co.jp" in req.url:
            try:
                res = await fetch_with_retry(client, req.url, initial_timeout=10.0)
                if res: final_url = str(res.url)
            except: pass
        
        match = re.search(r'travel\.rakuten\.co\.jp/.*?/(\d+)', final_url)
        if match: hotel_no = match.group(1)
        else:
            parsed = urllib.parse.urlparse(final_url)
            qs = urllib.parse.parse_qs(parsed.query)
            if "f_no" in qs: hotel_no = qs["f_no"][0]
            elif "no" in qs: hotel_no = qs["no"][0]

        if not hotel_no: return {"error": "URLからホテルIDを特定できませんでした。"}

        params = {"applicationId": RAKUTEN_APP_ID, "format": "json", "hotelNo": hotel_no, "datumType": 1}
        api_url = "https://app.rakuten.co.jp/services/api/Travel/SimpleHotelSearch/20170426"
        res = await fetch_with_retry(client, api_url, params=params, initial_timeout=15.0)
        
        if not res or res.status_code != 200: return {"error": "ホテル情報の取得に失敗しました。"}

        data = res.json()
        if "hotels" not in data or not data["hotels"]: return {"error": "該当するホテルが見つかりませんでした。"}

        raw_hotel = data["hotels"][0]
        hotel_content = raw_hotel["hotel"] if "hotel" in raw_hotel else raw_hotel
        
        # 構造解析
        basic = None
        user_review = {}
        if isinstance(hotel_content, list):
            for item in hotel_content:
                if "hotelBasicInfo" in item: basic = item["hotelBasicInfo"]
                if "userReview" in item: user_review = item["userReview"]
                if "hotelRatingInfo" in item: user_review = item["hotelRatingInfo"]
        else:
            basic = hotel_content.get("hotelBasicInfo")

        if not basic: return {"error": "ホテル情報の解析に失敗しました。"}

        address = f"{basic.get('address1', '')}{basic.get('address2', '')}"
        
        spot_data = {
            "id": str(basic["hotelNo"]), "name": basic["hotelName"],
            "description": address, 
            "coordinates": [basic["longitude"], basic["latitude"]],
            "image_url": basic.get("hotelImageUrl"), "url": basic.get("hotelInformationUrl"),
            "price": basic.get("hotelMinCharge", 0), 
            "rating": basic.get("reviewAverage", 3.0),
            
            # 詳細評価
            "service_rating": user_review.get("serviceAverage", 0.0),
            "location_rating": user_review.get("locationAverage", 0.0),
            "room_rating": user_review.get("roomAverage", 0.0),
            "equipment_rating": user_review.get("equipmentAverage", 0.0),
            "bath_rating": user_review.get("bathAverage", 0.0),
            "meal_rating": user_review.get("mealAverage", 0.0),

            "source": "rakuten", "is_hotel": True, "status": "hotel_candidate",
            "comment": basic.get("hotelSpecial", "")[:100] + "..." 
        }
        
        result = {"spot": spot_data}
        set_cache(cache_key, result)
        return result
    except Exception as e:
        print(f"Import Error: {e}")
        return {"error": "処理中にエラーが発生しました。"}

@app.post("/api/search_hotels_vacant")
async def search_hotels_vacant(req: VacantSearchRequest):
    if not RAKUTEN_APP_ID: return {"error": "サーバー設定エラー"}
    global http_client
    if http_client is None: return {"error": "Server starting up..."}
    client = http_client

    cache_key = f"rakuten_vacant_v4:{req.latitude}:{req.longitude}:{req.checkin_date}:{req.checkout_date}:{req.adult_num}:{req.min_price}:{req.max_price}:{req.meal_type}:{hashlib.md5(str(req.polygon).encode()).hexdigest() if req.polygon else 'all'}"
    
    cached = get_cache(cache_key)
    if cached: return cached

    safe_radius = min(round(req.radius, 2), 3.0)
    today = date.today()
    c_in = req.checkin_date
    c_out = req.checkout_date
    if not c_in: c_in = (today + timedelta(days=30)).strftime("%Y-%m-%d")
    if not c_out: c_out = (date.fromisoformat(c_in) + timedelta(days=1)).strftime("%Y-%m-%d")

    base_params = {
        "applicationId": RAKUTEN_APP_ID, "format": "json", "latitude": req.latitude, "longitude": req.longitude,
        "searchRadius": safe_radius, "datumType": 1, "hits": 30, "sort": "standard",
        "checkinDate": c_in, "checkoutDate": c_out, "adultNum": req.adult_num,
    }
    if req.max_price: base_params["maxCharge"] = req.max_price
    if req.min_price: base_params["minCharge"] = req.min_price

    if req.meal_type == 'room_only':
        base_params["breakfastFlag"] = 0
        base_params["dinnerFlag"] = 0
    elif req.meal_type == 'breakfast':
        base_params["breakfastFlag"] = 1
        base_params["dinnerFlag"] = 0 
    elif req.meal_type == 'half_board':
        base_params["breakfastFlag"] = 1
        base_params["dinnerFlag"] = 1

    url = "https://app.rakuten.co.jp/services/api/Travel/VacantHotelSearch/20170426"

    async def fetch_page(page_num):
        try:
            p = base_params.copy()
            p["page"] = page_num
            res = await fetch_with_retry(client, url, params=p, initial_timeout=15.0, retries=5)
            if res and res.status_code == 200: return res.json()
        except: pass
        return None

    try:
        results = await asyncio.gather(*[fetch_page(i) for i in range(1, 6)])
        all_hotels = []
        seen_ids = set()

        for data in results:
            if not data or "hotels" not in data: continue
            for h_group in data["hotels"]:
                try:
                    hotel_content = h_group["hotel"] if "hotel" in h_group else h_group
                    if not isinstance(hotel_content, list) or len(hotel_content) == 0: continue
                    
                    # 構造解析: hotelBasicInfo と userReview (ある場合) を探す
                    basic = None
                    user_review = {}
                    
                    for item in hotel_content:
                        if "hotelBasicInfo" in item:
                            basic = item["hotelBasicInfo"]
                        if "userReview" in item:
                            user_review = item["userReview"]
                        elif "hotelRatingInfo" in item:
                            user_review = item["hotelRatingInfo"]
                            
                    if not basic: continue
                    
                    hotel_id = str(basic["hotelNo"])
                    if hotel_id in seen_ids: continue

                    if req.polygon:
                        if not is_inside_polygon(basic["latitude"], basic["longitude"], req.polygon):
                            continue

                    best_price = float('inf')
                    best_plan_id, best_room_class = None, None
                    found_valid_plan = False
                    
                    # プラン検索 (index 1以降)
                    for j in range(1, len(hotel_content)):
                        r_info = hotel_content[j].get("roomInfo")
                        if isinstance(r_info, list) and len(r_info) >= 2:
                            r_basic = r_info[0].get("roomBasicInfo", {})
                            
                            # 食事条件チェック
                            if req.meal_type == 'room_only':
                                if r_basic.get("withBreakfastFlag") == 1 or r_basic.get("withDinnerFlag") == 1: continue
                            elif req.meal_type == 'breakfast':
                                if r_basic.get("withBreakfastFlag") != 1: continue
                            elif req.meal_type == 'half_board':
                                if r_basic.get("withBreakfastFlag") != 1 or r_basic.get("withDinnerFlag") != 1: continue

                            r_charge = r_info[1].get("dailyCharge")
                            if r_charge and r_charge.get("total", 0) > 0:
                                if r_charge["total"] < best_price:
                                    best_price = r_charge["total"]
                                    best_plan_id = r_info[0].get("roomBasicInfo", {}).get("planId")
                                    best_room_class = r_info[0].get("roomBasicInfo", {}).get("roomClass")
                                    found_valid_plan = True

                    if not found_valid_plan: continue
                    if req.min_price and best_price < req.min_price: continue
                    if req.max_price and best_price > req.max_price: continue
                    
                    address = f"{basic.get('address1', '')}{basic.get('address2', '')}"
                    
                    # ▼▼▼ データ構築 (詳細評価を含む) ▼▼▼
                    all_hotels.append({
                        "id": hotel_id, "name": basic["hotelName"],
                        "description": address, 
                        "coordinates": [basic["longitude"], basic["latitude"]],
                        "image_url": basic.get("hotelImageUrl"), "url": basic.get("hotelInformationUrl"),
                        "price": int(best_price), 
                        
                        "rating": basic.get("reviewAverage") or 0.0,
                        "service_rating": user_review.get("serviceAverage", 0.0),
                        "location_rating": user_review.get("locationAverage", 0.0),
                        "room_rating": user_review.get("roomAverage", 0.0),
                        "equipment_rating": user_review.get("equipmentAverage", 0.0),
                        "bath_rating": user_review.get("bathAverage", 0.0),
                        "meal_rating": user_review.get("mealAverage", 0.0),

                        "review_count": basic.get("reviewCount", 0), "source": "rakuten", "is_hotel": True,
                        "plan_id": best_plan_id, "room_class": best_room_class, "status": "hotel_candidate",
                        "comment": basic.get("hotelSpecial", "")[:60] + "..." 
                    })
                    seen_ids.add(hotel_id)
                except: continue
        
        result = {"hotels": all_hotels}
        if all_hotels: set_cache(cache_key, result)
        return result
    except Exception as e:
        traceback.print_exc()
        return {"error": f"システムエラー: {str(e)}"}

# ---------------------------------------------------------
# API: AI提案
# ---------------------------------------------------------
async def suggest_spots_generator(req: SuggestRequest):
    global http_client
    if http_client is None:
        yield json.dumps({"type": "error", "message": "Server starting..."}) + "\n"
        return
    client = http_client
    
    yield json.dumps({"type": "status", "message": "AIが候補地をリストアップ中..."}) + "\n"

    existing_names = []
    existing_check_list = []

    for item in req.existing_spots:
        if isinstance(item, dict):
            name = item.get("name", "")
            coords = item.get("coordinates")
            existing_names.append(name)
            existing_check_list.append({"name": name, "coordinates": coords})
        elif isinstance(item, str):
            existing_names.append(item)
            existing_check_list.append({"name": item, "coordinates": None})
        elif hasattr(item, "name"):
            existing_names.append(item.name)
            existing_check_list.append({"name": item.name, "coordinates": item.coordinates})

    prompt = f"""
    場所: {req.theme}
    タスク: 観光客に人気の「超有名・王道観光スポット」を人気順に15個挙げてください。
    条件:
    1. ホテルや宿泊施設は除外。
    2. 既存リスト: {", ".join(existing_names)} は絶対に除外。
    3. 出力はJSON形式のオブジェクト配列とする。
    4. 各スポットについて、以下の4つのフィールドを含めること。
       - "name": 地図APIで見つかりやすい正式名称
       - "search_query": 地図検索クエリ
       - "summary": その場所の魅力や特徴を伝える、20〜30文字程度の魅力的な一言説明文
       - "category": その場所のカテゴリ
    """
    
    target_spots = []
    try:
        ai_res = await aclient.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            max_tokens=1500
        )
        content = ai_res.choices[0].message.content
        json_data = json.loads(content)
        raw_spots = json_data.get("spots", [])
        
        seen_names = set(existing_names)
        for s in raw_spots:
            if s["name"] not in seen_names:
                target_spots.append(s)
                seen_names.add(s["name"])
        target_spots = target_spots[:10]

        yield json.dumps({
            "type": "candidates", 
            "names": [s["name"] for s in target_spots],
            "message": "位置情報を照合中..."
        }) + "\n"

    except Exception as e:
        yield json.dumps({"type": "error", "message": f"AI生成エラー: {str(e)}"}) + "\n"
        return

    found_count = 0
    seen_coords = []
    
    async def fetch_and_enrich(spot_info):
        res = await fetch_spot_coordinates(client, spot_info["name"], spot_info["search_query"])
        if res:
            ai_summary = spot_info.get("summary", "")
            if ai_summary:
                res["comment"] = ai_summary
                
            res["category"] = spot_info.get("category", "観光スポット")
            return res
        return None

    tasks = [fetch_and_enrich(s) for s in target_spots]
    
    for future in asyncio.as_completed(tasks):
        try:
            res = await future
            if res and res["coordinates"] != [0.0, 0.0]:
                
                is_duplicate = False
                def normalize(s): return s.replace(" ", "").replace("　", "")
                norm_res_name = normalize(res["name"])
                
                for ex in existing_check_list:
                    if normalize(ex["name"]) == norm_res_name:
                        is_duplicate = True
                        break
                    
                    if ex["coordinates"] and res["coordinates"]:
                        dist = haversine_distance(ex["coordinates"], res["coordinates"])
                        if dist < 0.2: 
                            is_duplicate = True
                            break
                
                if is_duplicate: continue
                if res["coordinates"] in seen_coords: continue

                spot_data = {
                    **res, 
                    "stay_time": 90, 
                    "source": "ai", 
                    "is_hotel": False, 
                    "status": "candidate"
                }
                seen_coords.append(res["coordinates"])
                found_count += 1
                
                yield json.dumps({"type": "spot_found", "spot": spot_data}) + "\n"
        except Exception as e:
            print(f"Error in task: {e}")
            continue
    
    yield json.dumps({"type": "done", "count": found_count}) + "\n"

@app.post("/api/suggest_spots")
async def suggest_spots(req: SuggestRequest):
    return StreamingResponse(suggest_spots_generator(req), media_type="application/x-ndjson")

@app.post("/api/verify_spots")
async def verify_spots(req: VerifyRequest):
    return {"spots": req.spots}

async def calculate_route_fallback(client, ordered_spots, start_min, limit_min):
    if not ordered_spots: return {"error": "スポットがありません"}
    coords_str = ";".join([f"{s.coordinates[0]:.5f},{s.coordinates[1]:.5f}" for s in ordered_spots[:25]])
    cache_key = f"route:{coords_str}:{start_min}:{limit_min}"
    cached = get_cache(cache_key)
    if cached: return cached

    calc_spots = ordered_spots[:25]
    request_coords = ";".join([f"{s.coordinates[0]},{s.coordinates[1]}" for s in calc_spots])
    url = f"https://api.mapbox.com/directions/v5/mapbox/driving/{request_coords}"
    
    res = await fetch_with_retry(client, url, params={"access_token": MAPBOX_ACCESS_TOKEN, "geometries": "geojson"}, initial_timeout=10.0, retries=5)
    if not res: return {"error": "ルート計算APIへの接続失敗"}
    
    data = res.json()
    if "routes" not in data or not data['routes']: return {"error": "ルート計算失敗"}
    
    route = data['routes'][0]
    timeline = []
    current = start_min
    
    for i, spot in enumerate(calc_spots):
        stay = spot.stay_time or 60
        arr = current
        dep = arr + stay
        timeline.append({
            "type": "spot", "spot": {**spot.model_dump(), "stay_time": stay},
            "arrival": f"{int(arr//60):02d}:{int(arr%60):02d}",
            "departure": f"{int(dep//60):02d}:{int(dep%60):02d}"
        })
        
        if i < len(calc_spots) - 1:
            dur = 30 
            if i < len(route.get('legs', [])):
                dur = math.ceil(route['legs'][i]['duration'] / 60)
            if i+1 < len(calc_spots):
                gurl = f"http://googleusercontent.com/maps.google.com/?saddr={urllib.parse.quote(spot.name)}&daddr={urllib.parse.quote(calc_spots[i+1].name)}&travelmode=driving"
                timeline.append({"type": "travel", "duration_min": dur, "transport_mode": "car", "google_maps_url": gurl})
            current = dep + dur
            
    used = set(t['spot']['name'] for t in timeline if t['type']=='spot')
    result = {"timeline": timeline, "unused_spots": [s for s in ordered_spots if s.name not in used], "route_geometry": route['geometry']}
    set_cache(cache_key, result)
    return result

@app.post("/api/optimize_route")
@app.post("/api/calculate_route")
async def calculate_route_endpoint(req: OptimizeRequest):
    spots = [s for s in req.spots if s.coordinates and len(s.coordinates) >= 2]
    if len(spots) < 2: return {"error": "2箇所以上必要"}
    global http_client
    if http_client is None: return {"error": "Server starting up..."}
    client = http_client

    try:
        sh, sm = map(int, req.start_time.split(':'))
        eh, em = map(int, req.end_time.split(':'))
        start, limit = sh*60+sm, eh*60+em
    except: start, limit = 540, 1080
    
    return await calculate_route_fallback(client, spots, start, limit)

@app.get("/api/search_places")
async def search_places(query: str):
    global http_client
    if http_client is None: return {"results": []}
    client = http_client

    cache_key = f"search_places_v1:{query}"
    cached = get_cache(cache_key)
    if cached: return cached

    try:
        clean_query = re.sub(r'[(（].*?[)）]', '', query).strip()
        url = "https://api.geoapify.com/v1/geocode/search"
        params = {
            "text": clean_query, 
            "apiKey": GEOAPIFY_API_KEY, 
            "lang": "ja", 
            "limit": 10, 
            "countrycode": "jp"
        }
        res = await fetch_with_retry(client, url, params=params, initial_timeout=5.0, retries=3)

        results = []
        if res and res.status_code == 200:
            data = res.json()
            if "features" in data:
                for feat in data["features"]:
                    props = feat["properties"]
                    name = props.get("name", "")
                    formatted = props.get("formatted", "")
                    if not name: name = formatted.split(",")[0] if formatted else clean_query

                    results.append({
                        "id": props.get("place_id"),
                        "name": name,
                        "place_name": formatted,
                        "center": feat["geometry"]["coordinates"],
                        "is_geoapify": True
                    })
        
        response_data = {"results": results}
        if results: set_cache(cache_key, response_data)
        return response_data
    except Exception as e:
        print(f"Search Error: {e}")
        return {"results": []}

@app.get("/api/get_spot_info")
async def get_spot_info(query: str, lat: Optional[float] = None, lng: Optional[float] = None):
    global http_client
    if http_client is None: return {}
    client = http_client
    
    if lat is not None and lng is not None:
        data = await fetch_spot_by_coordinates(client, lat, lng, query)
        if data: return data

    data = await fetch_spot_coordinates(client, query, query)
    if data: return data
    
    wiki = await fetch_wikipedia_info(client, query, target_name=query)
    return {
        "name": query,
        "description": "",
        "image_url": wiki.get("image_url"),
        "comment": wiki.get("summary") or ""
    }

@app.get("/")
async def root():
    return {"status": "active", "message": "Render is awake with Robust Retry!"}