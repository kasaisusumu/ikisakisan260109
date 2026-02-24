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
    print("✅ System initialized with Strict Address Logic (No Gun, City Priority)")
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
    meal_type: Optional[str] = None
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
    radius: int = 3000
    limit: int = 20
    mode: str = "standard" 

# ---------------------------------------------------------
# ユーティリティ & 住所正規化ロジック (強化版)
# ---------------------------------------------------------

WIKI_HEADERS = {
    "User-Agent": "RouteHackerBot/1.0 (contact@example.com)"
}

def haversine_distance(coord1, coord2):
    R = 6371
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
    inside = False
    j = len(poly_coords) - 1
    for i in range(len(poly_coords)):
        xi, yi = poly_coords[i][0], poly_coords[i][1]
        xj, yj = poly_coords[j][0], poly_coords[j][1]
        
        intersect = ((yi > lat) != (yj > lat)) and \
            (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)
        if intersect:
            inside = not inside
        j = i
    return inside

PREF_NORMALIZER = {
    "北海道": "北海道", "Hokkaido": "北海道",
    "青森": "青森県", "Aomori": "青森県", "岩手": "岩手県", "Iwate": "岩手県",
    "宮城": "宮城県", "Miyagi": "宮城県", "秋田": "秋田県", "Akita": "秋田県",
    "山形": "山形県", "Yamagata": "山形県", "福島": "福島県", "Fukushima": "福島県",
    "茨城": "茨城県", "Ibaraki": "茨城県", "栃木": "栃木県", "Tochigi": "栃木県",
    "群馬": "群馬県", "Gunma": "群馬県", "埼玉": "埼玉県", "Saitama": "埼玉県",
    "千葉": "千葉県", "Chiba": "千葉県", "東京": "東京都", "Tokyo": "東京都",
    "神奈川": "神奈川県", "Kanagawa": "神奈川県", "新潟": "新潟県", "Niigata": "新潟県",
    "富山": "富山県", "Toyama": "富山県", "石川": "石川県", "Ishikawa": "石川県",
    "福井": "福井県", "Fukui": "福井県", "山梨": "山梨県", "Yamanashi": "山梨県",
    "長野": "長野県", "Nagano": "長野県", "岐阜": "岐阜県", "Gifu": "岐阜県",
    "静岡": "静岡県", "Shizuoka": "静岡県", "愛知": "愛知県", "Aichi": "愛知県",
    "三重": "三重県", "Mie": "三重県", "滋賀": "滋賀県", "Shiga": "滋賀県",
    "京都": "京都府", "Kyoto": "京都府", "大阪": "大阪府", "Osaka": "大阪府",
    "兵庫": "兵庫県", "Hyogo": "兵庫県", "奈良": "奈良県", "Nara": "奈良県",
    "和歌山": "和歌山県", "Wakayama": "和歌山県", "鳥取": "鳥取県", "Tottori": "鳥取県",
    "島根": "島根県", "Shimane": "島根県", "岡山": "岡山県", "Okayama": "岡山県",
    "広島": "広島県", "Hiroshima": "広島県", "山口": "山口県", "Yamaguchi": "山口県",
    "徳島": "徳島県", "Tokushima": "徳島県", "香川": "香川県", "Kagawa": "香川県",
    "愛媛": "愛媛県", "Ehime": "愛媛県", "高知": "高知県", "Kochi": "高知県",
    "福岡": "福岡県", "Fukuoka": "福岡県", "佐賀": "佐賀県", "Saga": "佐賀県",
    "長崎": "長崎県", "Nagasaki": "長崎県", "熊本": "熊本県", "Kumamoto": "熊本県",
    "大分": "大分県", "Oita": "大分県", "宮崎": "宮崎県", "Miyazaki": "宮崎県",
    "鹿児島": "鹿児島県", "Kagoshima": "鹿児島県", "沖縄": "沖縄県", "Okinawa": "沖縄県"
}

def extract_and_fix_address(raw_address: str) -> str:
    """
    複雑な文字列から都道府県と市区町村を独立して抽出し、正しい順序（県+市）で再結合する。
    ★ルール: 
    1. 「郡」は削除
    2. 「市」がある場合は区町村を無視（市を優先）
    3. 「科学博物館富山市」のようなケースは末尾の「富山市」を採用
    """
    if not raw_address: return ""

    # 1. ゴミ掃除
    working_text = re.sub(r'(Japan|日本|〒\d{3}-\d{4})', ' ', raw_address)
    working_text = re.sub(r'[ \t,]+', ' ', working_text).strip()

    # ★ 郡を削除 (例: "愛知郡東郷町" -> "東郷町", "石川郡野々市町" -> "野々市町")
    working_text = re.sub(r'[一-龠ぁ-んァ-ン]{1,6}郡', '', working_text)

    # 2. 都道府県の特定と抽出
    found_pref = ""
    for k, v in PREF_NORMALIZER.items():
        if k in working_text or v in working_text:
            found_pref = v
            # 県名を文字列から除去（市町村の誤検知を防ぐため）
            working_text = working_text.replace(v, " ").replace(k, " ")
            break
    
    # 3. 市区町村の特定と抽出
    found_city = ""
    
    # 漢字・ひらがな・カタカナが1〜6文字続き、最後に「市・区・町・村」が来るものを全検索
    # 例: "科学博物館富山市" -> "博物館富山市" (6文字) などがマッチする可能性あり
    matches = re.findall(r'([一-龠ぁ-んァ-ン]{1,6}(?:市|区|町|村))', working_text)
    
    if matches:
        candidates = [m for m in matches if len(m) >= 2]
        
        if candidates:
            # 優先度: 市 > 区 > 町 > 村
            city_candidates = [m for m in candidates if m.endswith("市")]
            ward_candidates = [m for m in candidates if m.endswith("区")]
            town_candidates = [m for m in candidates if m.endswith("町") or m.endswith("村")]
            
            # ★ルール適用: 市がある場合は市のみ採用。区や町村は無視。
            if city_candidates:
                # "科学博物館富山市" のようなノイズ混入対策
                # 末尾が「市」の候補のうち、最もそれらしい（短い、かつ「館」「園」などで始まらない）ものを探す
                best_city = city_candidates[0]
                
                # もし候補の中に「館」や「園」が含まれていたら、その文字以降を採用する
                # 例: "博物館富山市" -> "富山市"
                for noise in ['館', '園', '所', '場', '校', '局']:
                    if noise in best_city:
                        parts = best_city.split(noise)
                        if len(parts) > 1 and len(parts[-1]) >= 2: # 分割後も2文字以上なら採用
                            best_city = parts[-1]
                
                found_city = best_city
            
            elif ward_candidates:
                found_city = ward_candidates[0]
            elif town_candidates:
                found_city = town_candidates[0]
            else:
                found_city = candidates[0]

    # 4. 再構築
    if found_pref and found_city:
        return f"{found_pref}{found_city}"
    
    # 県だけ見つかった場合
    if found_pref:
        clean_remains = working_text.strip()
        # 残りがシンプルで短いなら結合、そうでなければ県のみ
        if clean_remains and len(clean_remains) < 20 and not re.search(r'[0-9]', clean_remains):
             return f"{found_pref}{clean_remains}"
        return found_pref
        
    # 市だけ見つかった場合
    if found_city:
        return found_city

    return working_text.strip() or raw_address

def get_clean_address(props: dict) -> str:
    """Geoapifyのプロパティから綺麗な日本語住所を生成する"""
    state = props.get('state', '')
    if state in ['NN', 'Other', 'Others', 'その他', 'JP', 'Japan']: state = ''

    city = props.get('city', '') or props.get('town', '') or props.get('village', '') or props.get('municipality', '')
    if city in ['NN', 'Other', 'Others', 'その他']: city = ''
    
    # ★郡 (county) は一切使用しない
    # county = props.get('county', '') 
    
    ward = props.get('suburb', '') or props.get('district', '') 
    if ward in ['NN', 'Other', 'Others', 'その他']: ward = ''
    
    formatted = props.get("formatted", "")

    # プロパティが揃っている場合は結合して作成
    if state and (city or ward):
        if state in PREF_NORMALIZER:
            state = PREF_NORMALIZER[state]
        elif not any(state.endswith(s) for s in ['都', '道', '府', '県']):
            if state == '東京': state += '都'
            elif state in ['京都', '大阪']: state += '府'
            elif state != '北海道': state += '県'
            
        # 県名の重複防止
        state_core = state
        for suffix in ['都', '府', '県']:
            if state_core.endswith(suffix): state_core = state_core[:-1]
        
        if city and not any(city.endswith(s) for s in ["市", "区", "町", "村"]):
            city += "市"

        address_parts = [state]
        
        # ★ルール適用: 市がある場合は市のみ。区は追加しない。
        if city:
            address_parts.append(city)
        elif ward:
            address_parts.append(ward)
        
        return "".join(address_parts)

    # プロパティ不備時は formatted 文字列を強力な正規化関数に通す
    clean_formatted = formatted.replace("NN", "").replace(" ,", "").replace(", ", "").strip()
    return extract_and_fix_address(clean_formatted)

# ---------------------------------------------------------
# 外部API連携関数 (変更なし)
# ---------------------------------------------------------
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
    info = await fetch_wikipedia_info(client, query)
    return info.get("image_url")

async def fetch_wikipedia_info(client, query: str, target_name: str = None):
    if not query: return {"image_url": None, "summary": None}
    
    cache_key = f"wiki_info_v4:{query}"
    cached = get_cache(cache_key)
    if cached: return cached

    try:
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
        
        info_url = "https://ja.wikipedia.org/w/api.php"
        info_params = {
            "action": "query", "prop": "pageimages|extracts", "pageids": page_id, 
            "pithumbsize": 500, "exintro": 1, "explaintext": 1, "exchars": 200, "format": "json"
        }
        info_res = await fetch_with_retry(client, info_url, params=info_params, headers=WIKI_HEADERS, initial_timeout=3.0)
        
        if not info_res: return {"image_url": None, "summary": None}
        
        info_data = info_res.json()
        pages = info_data.get("query", {}).get("pages", {})
        page = pages.get(str(page_id))
        
        if page:
            image_url = page.get("thumbnail", {}).get("source")
            summary = page.get("extract", "").replace("\n", "")
            if "参照" in summary or "曖昧さ回避" in summary: summary = None
            if summary and len(summary) >= 200: summary = summary.rstrip("、。") + "..."
            
            result = {"image_url": image_url, "summary": summary}
            set_cache(cache_key, result)
            return result
    except Exception as e:
        print(f"Wiki info fetch error: {e}")
    return {"image_url": None, "summary": None}

async def fetch_spot_coordinates(client, target_name: str, search_query: str):
    cache_key = f"geo_v5:{target_name}:{search_query}"
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

                    # ★ 住所の正規化呼び出し (郡削除・市優先ロジック適用)
                    desc = get_clean_address(props)
                    if not desc: desc = "住所不明"

                    state = props.get("state", "")
                    city = props.get("city", "") or props.get("town", "")
                    wiki_query = f"{result_name} {state}".strip()
                    if len(wiki_query) < len(result_name) + 2: wiki_query = search_query

                    try:
                        wiki_info = await fetch_wikipedia_info(client, wiki_query, target_name=result_name)
                        image_url = wiki_info.get("image_url")
                        if wiki_info.get("summary"): wiki_summary = wiki_info["summary"]
                    except: pass

                    result_data = {
                        "name": result_name, "description": desc, 
                        "coordinates": feat["geometry"]["coordinates"],
                        "image_url": image_url, "comment": wiki_summary or "" 
                    }
                    set_cache(cache_key, result_data)
                    return result_data
    except Exception as e:
        print(f"Coord fetch failed for {target_name}: {e}")
    return None

async def fetch_spot_by_coordinates(client, lat: float, lng: float, fallback_name: str):
    lat_k = round(lat, 6)
    lng_k = round(lng, 6)
    cache_key = f"geo_reverse_v2:{lat_k}:{lng_k}"
    
    cached = get_cache(cache_key)
    if cached: return cached

    try:
        url = "https://api.geoapify.com/v1/geocode/reverse"
        params = {"lat": lat, "lon": lng, "apiKey": GEOAPIFY_API_KEY, "lang": "ja", "limit": 1}
        res = await fetch_with_retry(client, url, params=params, initial_timeout=8.0, retries=3)

        image_url = None
        wiki_summary = None
        
        if res and res.status_code == 200:
            data = res.json()
            if "features" in data and len(data["features"]) > 0:
                props = data["features"][0]["properties"]
                result_name = props.get("name", "")
                if not result_name: result_name = fallback_name

                # ★ 住所の正規化呼び出し
                desc = get_clean_address(props)
                desc = re.sub(r'〒\d{3}-\d{4}', '', desc).strip()
                if not desc: desc = "住所不明"

                state = props.get("state", "")
                city = props.get("city", "") or props.get("town", "")
                wiki_query = f"{result_name} {state} {city}".strip()

                try:
                    wiki_info = await fetch_wikipedia_info(client, wiki_query, target_name=result_name)
                    image_url = wiki_info.get("image_url")
                    if wiki_info.get("summary"): wiki_summary = wiki_info["summary"]
                except: pass

                result_data = {
                    "name": result_name, "description": desc,
                    "coordinates": [lng, lat], "image_url": image_url,
                    "comment": wiki_summary or "" 
                }
                set_cache(cache_key, result_data)
                return result_data
    except Exception as e:
        print(f"Reverse Geo Error: {e}")
    return None

# ==========================================
# 🧠 AIヘルパー関数
# ==========================================
async def get_official_name_by_ai(query: str) -> str:
    cache_key = f"query_norm_v1:{query}"
    cached = get_cache(cache_key)
    if cached: return cached

    prompt = f"""
    タスク: ユーザーの検索語句「{query}」を、Google Mapsやナビで検索した際に最もヒットしやすい『正式名称』または『漢字表記』に修正してください。
    ルール: 余計な説明は一切不要。修正後の単語のみを出力すること。
    例: そらてらす -> SORA terrace
    """
    try:
        res = await aclient.chat.completions.create(
            model="gpt-4o-mini", messages=[{"role": "user", "content": prompt}], max_tokens=50, temperature=0.0
        )
        normalized_name = res.choices[0].message.content.strip().replace('"', '').replace("「", "").replace("」", "")
        set_cache(cache_key, normalized_name)
        return normalized_name
    except: return query

async def get_structured_address_by_ai(name: str, raw_address: str = "") -> Dict[str, str]:
    cache_key = f"address_fix_v2:{name}:{raw_address}"
    cached = get_cache(cache_key)
    if cached: return cached

    prompt = f"""
    タスク: スポット「{name}」の正確な住所を特定し、都道府県と市区町村に分解してください。
    現在の不完全な住所情報: {raw_address}
    ルール:
    1. 出力は以下のJSON形式のみ: {{ "prefecture": "〇〇県", "city": "〇〇市", "full_address": "〇〇県〇〇市..." }}
    2. "city" は市・区・町・村まで。
    """
    try:
        res = await aclient.chat.completions.create(
            model="gpt-4o-mini", messages=[{"role": "user", "content": prompt}], response_format={"type": "json_object"}, temperature=0.0
        )
        data = json.loads(res.choices[0].message.content)
        set_cache(cache_key, data)
        return data
    except:
        return {"prefecture": "", "city": "", "full_address": raw_address}

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
        if req.mode == "wide": categories = "commercial.shopping_mall,catering.restaurant,entertainment,leisure.park"
        else: categories = "tourism,building.historic,natural,entertainment.culture,religion"
        params = {
            "categories": categories, "filter": f"circle:{req.longitude},{req.latitude},{req.radius}",
            "bias": f"proximity:{req.longitude},{req.latitude}", "limit": 20, "apiKey": GEOAPIFY_API_KEY, "lang": "ja"
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
                    coords = feat.get("geometry", {}).get("coordinates")
                    if not coords: continue
                    formatted = get_clean_address(props) # ★ここでも適用
                    search_query = f"{name} {props.get('state', '')}".strip()
                    base_spots.append({
                        "id": f"nearby-{props.get('place_id')}", "name": name, "description": formatted, 
                        "coordinates": coords, "is_nearby": True, "search_query": search_query, "image_url": None, "comment": "" 
                    })
        # Wiki enrich
        async def enrich(s):
            try:
                w = await fetch_wikipedia_info(client, s["search_query"], target_name=s["name"])
                if w["image_url"]: s["image_url"] = w["image_url"]
                if w["summary"]: s["comment"] = w["summary"]
            except: pass
            return s
        enriched_spots = await asyncio.gather(*[enrich(s) for s in base_spots]) if base_spots else []
        result = {"spots": enriched_spots}
        if enriched_spots: set_cache(cache_key, result)
        return result
    except: return {"spots": []}

@app.get("/api/get_spot_image")
async def get_spot_image(query: str):
    global http_client
    if http_client is None: return {"image_url": None}
    img_url = await fetch_wikipedia_image(http_client, query)
    return {"image_url": img_url}

@app.post("/api/import_rakuten_hotel")
async def import_rakuten_hotel(req: ImportRequest):
    if not RAKUTEN_APP_ID: 
        return {"error": "サーバーの楽天APIキー設定が見つかりません。"}
    hotel_no = None
    final_url = req.url.strip()
    global http_client
    if http_client is None: 
        return {"error": "サーバーを準備中です。少し待ってから再度お試しください。"}
    client = http_client

    try:
        cache_key = f"rakuten_import_v3:{final_url}"
        cached = get_cache(cache_key)
        if cached: return cached

        if "rakuten.co.jp" in final_url:
            try:
                res = await fetch_with_retry(client, final_url, initial_timeout=10.0)
                if res: final_url = str(res.url)
            except: pass
        
        path_patterns = [r'hotelinfo/plan/(\d+)', r'HOTEL/(\d+)', r'hotel/(\d+)', r'travel\.rakuten\.co\.jp/.*?/(\d+)']
        for pattern in path_patterns:
            match = re.search(pattern, final_url, re.IGNORECASE)
            if match:
                hotel_no = match.group(1)
                break
        if not hotel_no:
            parsed = urllib.parse.urlparse(final_url)
            qs = urllib.parse.parse_qs(parsed.query)
            for key in ["f_no", "no", "hotelNo", "hotel_no"]:
                if key in qs:
                    hotel_no = qs[key][0]; break
        if not hotel_no: return {"error": "URLからホテルIDを特定できませんでした。"}

        params = {"applicationId": RAKUTEN_APP_ID, "format": "json", "hotelNo": hotel_no, "datumType": 1}
        api_url = "https://app.rakuten.co.jp/services/api/Travel/SimpleHotelSearch/20170426"
        res = await fetch_with_retry(client, api_url, params=params, initial_timeout=15.0)
        
        if not res or res.status_code != 200: return {"error": f"楽天APIから情報を取得できませんでした。 (ID: {hotel_no})"}
        data = res.json()
        if "hotels" not in data or not data["hotels"]: return {"error": "該当するホテル情報が楽天APIに見つかりませんでした。"}

        raw_hotel = data["hotels"][0]
        hotel_content = raw_hotel["hotel"] if "hotel" in raw_hotel else raw_hotel
        basic = None
        user_review = {}
        if isinstance(hotel_content, list):
            for item in hotel_content:
                if "hotelBasicInfo" in item: basic = item["hotelBasicInfo"]
                if "userReview" in item: user_review = item["userReview"]
                if "hotelRatingInfo" in item: user_review = item["hotelRatingInfo"]
        else: basic = hotel_content.get("hotelBasicInfo")

        if not basic: return {"error": "ホテル情報の解析に失敗しました。"}
        address = f"{basic.get('address1', '')}{basic.get('address2', '')}"
        # ★ここでも住所正規化を通す
        address = re.sub(r'[一-龠ぁ-んァ-ン]{1,6}郡', '', address)

        spot_data = {
            "id": str(basic["hotelNo"]), "name": basic["hotelName"], "description": address, 
            "coordinates": [basic["longitude"], basic["latitude"]], "image_url": basic.get("hotelImageUrl"), 
            "url": basic.get("hotelInformationUrl"), "price": basic.get("hotelMinCharge", 0), 
            "rating": basic.get("reviewAverage", 3.0), "source": "rakuten", "is_hotel": True, "status": "hotel_candidate",
            "comment": basic.get("hotelSpecial", "")[:100] + "..." 
        }
        result = {"spot": spot_data}
        set_cache(cache_key, result)
        return result
    except Exception as e:
        print(f"Import Error: {e}")
        return {"error": f"取込処理中に予期せぬエラーが発生しました: {str(e)}"}

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
    c_in = req.checkin_date or (today + timedelta(days=30)).strftime("%Y-%m-%d")
    c_out = req.checkout_date or (date.fromisoformat(c_in) + timedelta(days=1)).strftime("%Y-%m-%d")

    base_params = {
        "applicationId": RAKUTEN_APP_ID, "format": "json", "latitude": req.latitude, "longitude": req.longitude,
        "searchRadius": safe_radius, "datumType": 1, "hits": 30, "sort": "standard",
        "checkinDate": c_in, "checkoutDate": c_out, "adultNum": req.adult_num,
    }
    if req.max_price: base_params["maxCharge"] = req.max_price
    if req.min_price: base_params["minCharge"] = req.min_price
    if req.meal_type == 'room_only': base_params["breakfastFlag"] = 0; base_params["dinnerFlag"] = 0
    elif req.meal_type == 'breakfast': base_params["breakfastFlag"] = 1; base_params["dinnerFlag"] = 0 
    elif req.meal_type == 'half_board': base_params["breakfastFlag"] = 1; base_params["dinnerFlag"] = 1

    url = "https://app.rakuten.co.jp/services/api/Travel/VacantHotelSearch/20170426"

    async def fetch_page(page_num):
        try:
            p = base_params.copy(); p["page"] = page_num
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
                    basic = None
                    for item in hotel_content:
                        if "hotelBasicInfo" in item: basic = item["hotelBasicInfo"]
                    if not basic: continue
                    hotel_id = str(basic["hotelNo"])
                    if hotel_id in seen_ids: continue
                    if req.polygon and not is_inside_polygon(basic["latitude"], basic["longitude"], req.polygon): continue

                    best_price = float('inf'); best_plan_id, best_room_class = None, None; found_valid_plan = False
                    for j in range(1, len(hotel_content)):
                        r_info = hotel_content[j].get("roomInfo")
                        if isinstance(r_info, list) and len(r_info) >= 2:
                            r_basic = r_info[0].get("roomBasicInfo", {})
                            if req.meal_type == 'room_only' and (r_basic.get("withBreakfastFlag") == 1 or r_basic.get("withDinnerFlag") == 1): continue
                            elif req.meal_type == 'breakfast' and r_basic.get("withBreakfastFlag") != 1: continue
                            elif req.meal_type == 'half_board' and (r_basic.get("withBreakfastFlag") != 1 or r_basic.get("withDinnerFlag") != 1): continue
                            r_charge = r_info[1].get("dailyCharge")
                            if r_charge and r_charge.get("total", 0) > 0 and r_charge["total"] < best_price:
                                best_price = r_charge["total"]
                                best_plan_id = r_info[0].get("roomBasicInfo", {}).get("planId")
                                best_room_class = r_info[0].get("roomBasicInfo", {}).get("roomClass")
                                found_valid_plan = True

                    if not found_valid_plan: continue
                    if req.min_price and best_price < req.min_price: continue
                    if req.max_price and best_price > req.max_price: continue
                    
                    address = f"{basic.get('address1', '')}{basic.get('address2', '')}"
                    address = re.sub(r'[一-龠ぁ-んァ-ン]{1,6}郡', '', address)

                    all_hotels.append({
                        "id": hotel_id, "name": basic["hotelName"], "description": address, 
                        "coordinates": [basic["longitude"], basic["latitude"]], "image_url": basic.get("hotelImageUrl"), 
                        "url": basic.get("hotelInformationUrl"), "price": int(best_price), "rating": basic.get("reviewAverage") or 0.0,
                        "source": "rakuten", "is_hotel": True, "plan_id": best_plan_id, "room_class": best_room_class, 
                        "status": "hotel_candidate", "comment": basic.get("hotelSpecial", "")[:60] + "..." 
                    })
                    seen_ids.add(hotel_id)
                except: continue
        result = {"hotels": all_hotels}
        if all_hotels: set_cache(cache_key, result)
        return result
    except Exception as e:
        traceback.print_exc()
        return {"error": f"システムエラー: {str(e)}"}

@app.post("/api/suggest_spots")
async def suggest_spots(req: SuggestRequest):
    return StreamingResponse(suggest_spots_generator(req), media_type="application/x-ndjson")

async def suggest_spots_generator(req: SuggestRequest):
    global http_client
    if http_client is None:
        yield json.dumps({"type": "error", "message": "Server starting..."}) + "\n"; return
    client = http_client
    yield json.dumps({"type": "status", "message": "AIが候補地をリストアップ中..."}) + "\n"
    
    existing_names = []
    for item in req.existing_spots:
        if isinstance(item, dict): existing_names.append(item.get("name", ""))
        elif isinstance(item, str): existing_names.append(item)
        elif hasattr(item, "name"): existing_names.append(item.name)

    prompt = f"""
    場所: {req.theme}
    タスク: 観光客に人気の「超有名・王道観光スポット」を人気順に15個挙げてください。
    条件:
    1. ホテルや宿泊施設は除外。
    2. 既存リスト: {", ".join(existing_names)} は絶対に除外。
    3. 出力はJSON形式のオブジェクト配列とする。
    4. 各スポット: {{"name": "正式名称", "search_query": "地図検索クエリ", "summary": "一言説明", "category": "カテゴリ"}}
    """
    target_spots = []
    try:
        ai_res = await aclient.chat.completions.create(
            model="gpt-4o-mini", messages=[{"role": "user", "content": prompt}], response_format={"type": "json_object"}, max_tokens=1500
        )
        json_data = json.loads(ai_res.choices[0].message.content)
        raw_spots = json_data.get("spots", [])
        seen_names = set(existing_names)
        for s in raw_spots:
            if s["name"] not in seen_names: target_spots.append(s); seen_names.add(s["name"])
        target_spots = target_spots[:10]
        yield json.dumps({"type": "candidates", "names": [s["name"] for s in target_spots], "message": "位置情報を照合中..."}) + "\n"
    except Exception as e:
        yield json.dumps({"type": "error", "message": f"AI生成エラー: {str(e)}"}) + "\n"; return

    found_count = 0; seen_coords = []
    async def fetch_and_enrich(spot_info):
        res = await fetch_spot_coordinates(client, spot_info["name"], spot_info["search_query"])
        if res:
            if spot_info.get("summary"): res["comment"] = spot_info.get("summary")
            res["category"] = spot_info.get("category", "観光スポット")
            return res
        return None

    tasks = [fetch_and_enrich(s) for s in target_spots]
    for future in asyncio.as_completed(tasks):
        try:
            res = await future
            if res and res["coordinates"] != [0.0, 0.0]:
                if res["coordinates"] in seen_coords: continue
                seen_coords.append(res["coordinates"])
                found_count += 1
                yield json.dumps({"type": "spot_found", "spot": {**res, "stay_time": 90, "source": "ai", "is_hotel": False, "status": "candidate"}}) + "\n"
        except: continue
    yield json.dumps({"type": "done", "count": found_count}) + "\n"

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
    route = data['routes'][0]; timeline = []; current = start_min
    for i, spot in enumerate(calc_spots):
        stay = spot.stay_time or 60; arr = current; dep = arr + stay
        timeline.append({"type": "spot", "spot": {**spot.model_dump(), "stay_time": stay}, "arrival": f"{int(arr//60):02d}:{int(arr%60):02d}", "departure": f"{int(dep//60):02d}:{int(dep%60):02d}"})
        if i < len(calc_spots) - 1:
            dur = 30
            if i < len(route.get('legs', [])): dur = math.ceil(route['legs'][i]['duration'] / 60)
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
    try: sh, sm = map(int, req.start_time.split(':')); eh, em = map(int, req.end_time.split(':')); start, limit = sh*60+sm, eh*60+em
    except: start, limit = 540, 1080
    return await calculate_route_fallback(http_client, spots, start, limit)

@app.get("/api/search_places")
async def search_places(query: str, lat: Optional[float] = None, lng: Optional[float] = None):
    global http_client
    if http_client is None: return {"results": []}
    client = http_client
    cache_key_raw = f"search_places_smart_v2:{query}:{lat}:{lng}"
    cached_raw = get_cache(cache_key_raw)
    if cached_raw: return cached_raw
    async def execute_search(search_q):
        local_results = []
        try:
            geo_url = "https://api.geoapify.com/v1/geocode/search"
            geo_params = {"text": search_q, "apiKey": GEOAPIFY_API_KEY, "lang": "ja", "limit": 5, "countrycode": "jp"}
            if lat and lng: geo_params["bias"] = f"proximity:{lng},{lat}"
            res = await fetch_with_retry(client, geo_url, params=geo_params, initial_timeout=5.0)
            if res and res.status_code == 200:
                data = res.json()
                for feat in data.get("features", []):
                    props = feat["properties"]
                    name = props.get("name", "") or props.get("formatted", "").split(",")[0]
                    clean_fmt = get_clean_address(props)
                    local_results.append({"id": feat["properties"].get("place_id"), "name": name, "place_name": clean_fmt, "center": feat["geometry"]["coordinates"], "type": "location"})
        except: pass
        if len(local_results) < 3:
            try:
                places_url = "https://api.geoapify.com/v2/places"
                p_params = {"name": search_q, "apiKey": GEOAPIFY_API_KEY, "lang": "ja", "limit": 5}
                if lat and lng: p_params["bias"] = f"proximity:{lng},{lat}"
                res = await fetch_with_retry(client, places_url, params=p_params, initial_timeout=5.0)
                if res and res.status_code == 200:
                    data = res.json()
                    for feat in data.get("features", []):
                        props = feat["properties"]
                        name = props.get("name", ""); 
                        if not name: continue
                        clean_fmt = get_clean_address(props)
                        local_results.append({"id": feat["properties"].get("place_id"), "name": name, "place_name": clean_fmt, "center": feat["geometry"]["coordinates"], "type": "place"})
            except: pass
        return local_results
    results = await execute_search(query)
    response_data = {"results": results}
    set_cache(cache_key_raw, response_data)
    return response_data

@app.get("/api/get_spot_info")
async def get_spot_info(query: str, lat: Optional[float] = None, lng: Optional[float] = None):
    global http_client
    if http_client is None: return {}
    client = http_client
    data = None
    if lat is not None and lng is not None: data = await fetch_spot_by_coordinates(client, lat, lng, query)
    if not data: data = await fetch_spot_coordinates(client, query, query)
    current_desc = data.get("description", "") if data else ""
    has_pref = any(p in current_desc for p in PREF_NORMALIZER.values())
    is_invalid = (not current_desc or "NN" in current_desc or "調査中" in current_desc or "不明" in current_desc or not has_pref)
    if is_invalid:
        ai_data = await get_structured_address_by_ai(query, current_desc)
        if ai_data.get("full_address"):
            if not data: data = {"name": query, "coordinates": [lng or 0.0, lat or 0.0]}
            data["description"] = ai_data["full_address"]
    wiki = await fetch_wikipedia_info(client, query, target_name=query)
    if data:
        data["image_url"] = data.get("image_url") or wiki.get("image_url")
        data["comment"] = data.get("comment") or wiki.get("summary") or ""
        return data
    return {"name": query, "description": "", "image_url": wiki.get("image_url"), "comment": wiki.get("summary") or ""}