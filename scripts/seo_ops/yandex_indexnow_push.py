#!/usr/bin/env python3
"""
yandex_indexnow_push.py — Mass submission of AnimeLife catalog & landing pages
to Yandex & Bing via the IndexNow protocol (limit: up to 10,000 URLs/day).
"""

import os
import sys
import time
import json
import re
import unicodedata
from datetime import datetime

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import requests

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ORIGIN = "https://animelife.top"
HOST = "animelife.top"
INDEXNOW_KEY = "1f1cc51ef66817b225635b21a78e5cc0"
KEY_LOCATION = f"{ORIGIN}/{INDEXNOW_KEY}.txt"

ENDPOINTS = [
    ("Яндекс (Yandex)", "https://yandex.com/indexnow"),
    ("Bing & IndexNow.org", "https://api.indexnow.org/indexnow")
]

def anime_slug(name):
    if not name:
        return ''
    norm = unicodedata.normalize('NFKD', name)
    s = ''.join(c for c in norm if not unicodedata.combining(c))
    s = re.sub(r'[^a-zA-Z0-9]+', '-', s.lower()).strip('-')
    if len(s) <= 60:
        return s
    s = s[:61]
    last_dash = s.rfind('-')
    return s[:last_dash] if last_dash > 0 else s

def anime_path(aid, name):
    slug = anime_slug(name)
    return f"/anime/{aid}-{slug}" if slug else f"/anime/{aid}"

def collect_all_urls():
    urls = []

    # 1. Landing pages & categories
    landings = [
        "/",
        "/en",
        "/catalog",
        "/top",
        "/schedule",
        "/collections",
        "/season",
        "/community",
        "/random",
        "/scene",
        "/changelog",
        "/ongoing",
        "/genre/action",
        "/genre/adventure",
        "/genre/comedy",
        "/genre/drama",
        "/genre/fantasy",
        "/genre/romance",
        "/genre/sci-fi",
        "/genre/mystery",
        "/genre/horror",
        "/genre/thriller",
        "/genre/psychological",
        "/genre/slice-of-life",
        "/genre/supernatural",
        "/genre/school",
        "/genre/sports",
        "/genre/mecha",
        "/genre/martial-arts",
        "/genre/historical",
        "/genre/military",
        "/genre/music",
        "/genre/samurai",
        "/genre/space",
        "/genre/super-power",
        "/genre/vampire",
        "/genre/demons",
        "/genre/game",
        "/genre/harem",
        "/genre/parody",
        "/genre/police",
        "/genre/kids",
        "/genre/cars",
        "/genre/gourmet",
        "/genre/work-life",
        "/genre/shounen",
        "/genre/seinen",
        "/genre/shoujo",
        "/genre/josei",
        "/theme/isekai",
        "/theme/reincarnation",
        "/theme/time-travel",
        "/theme/survival",
        "/theme/high-stakes-game",
        "/theme/villainess",
        "/best/2026",
        "/best/2025",
        "/best/2024",
        "/best/2023",
        "/best/2022",
        "/best/2021",
        "/best/2020",
        "/year/2026",
        "/year/2025",
        "/year/2024",
        "/year/2023",
        "/type/tv",
        "/type/movie",
        "/type/ova",
        "/type/ona",
        "/type/special",
    ]
    for p in landings:
        urls.append(f"{ORIGIN}{p}")

    # 2. Ongoings from Shikimori
    headers = {'User-Agent': 'AnimeLife-IndexBot/1.0 (https://animelife.top)'}
    print("📡 Получение списка онгоингов из Shikimori...")
    try:
        r = requests.get('https://shikimori.one/api/animes?status=ongoing&limit=50', headers=headers, timeout=10)
        if r.status_code == 200:
            for item in r.json():
                urls.append(f"{ORIGIN}{anime_path(item['id'], item.get('name'))}")
    except Exception as e:
        print(f"[!] Ошибка загрузки онгоингов: {e}")

    # 3. Popular titles (10 pages x 50 = 500 titles)
    print("📡 Получение топ-500 популярных тайтлов из каталога...")
    for page in range(1, 11):
        try:
            r = requests.get(
                f'https://shikimori.one/api/animes?order=popularity&censored=true&limit=50&page={page}',
                headers=headers,
                timeout=10
            )
            if r.status_code == 200:
                items = r.json()
                if not items:
                    break
                for item in items:
                    urls.append(f"{ORIGIN}{anime_path(item['id'], item.get('name'))}")
            time.sleep(0.2)
        except Exception as e:
            print(f"[!] Ошибка загрузки страницы {page}: {e}")
            break

    # Deduplicate while preserving order
    seen = set()
    unique_urls = []
    for u in urls:
        if u not in seen:
            seen.add(u)
            unique_urls.append(u)

    return unique_urls

def submit_indexnow(urls):
    print(f"\n🚀 Подготовка отправки {len(urls)} URL через протокол IndexNow...")
    payload = {
        "host": HOST,
        "key": INDEXNOW_KEY,
        "keyLocation": KEY_LOCATION,
        "urlList": urls
    }

    results = {}
    for name, endpoint in ENDPOINTS:
        print(f"\n📤 Отправка в {name} ({endpoint})...")
        try:
            r = requests.post(
                endpoint,
                json=payload,
                headers={"Content-Type": "application/json; charset=utf-8"},
                timeout=20
            )
            if r.status_code in (200, 202):
                print(f"  ✔ УСПЕШНО ({r.status_code})! {name} принял все {len(urls)} URL.")
                results[name] = "OK"
            else:
                print(f"  ✖ Ответ {r.status_code}: {r.text[:150]}")
                results[name] = f"HTTP {r.status_code}"
        except Exception as e:
            print(f"  ✖ Ошибка запроса к {name}: {e}")
            results[name] = f"Error: {e}"

    return results

def main():
    print("=" * 60)
    print("✨ ЗАПУСК МАССОВОГО ПУША INDEXNOW ДЛЯ ЯНДЕКСА И BING")
    print("=" * 60)
    urls = collect_all_urls()
    print(f"\nСобрано уникальных канонических URL: {len(urls)}")

    results = submit_indexnow(urls)
    
    print("\n" + "=" * 60)
    print("📊 ИТОГОВЫЙ ОТЧЕТ INDEXNOW:")
    for name, status in results.items():
        print(f"  • {name}: {status}")
    print("=" * 60)

if __name__ == "__main__":
    main()
