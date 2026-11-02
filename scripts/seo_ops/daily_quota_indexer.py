#!/usr/bin/env python3
"""
daily_quota_indexer.py — Automated Google Indexing API Submitter for AnimeLife
Takes up to remaining daily quota (e.g. 150 URLs) of discovered/priority pages
and submits them directly to Google Indexing API.
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

from google.oauth2 import service_account
from google.auth.transport.requests import Request
import requests

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
KEY_PATH = os.path.join(SCRIPT_DIR, "service_account.json")
HISTORY_FILE = os.path.join(SCRIPT_DIR, "indexed_urls_history.json")
ORIGIN = "https://animelife.top"

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

def load_history():
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_history(history):
    with open(HISTORY_FILE, "w", encoding="utf-8") as f:
        json.dump(history, f, ensure_ascii=False, indent=2)

def gather_candidate_urls():
    candidates = []

    # 1. Important portal landings & categories
    landings = [
        "/",
        "/catalog",
        "/top",
        "/schedule",
        "/collections",
        "/season",
        "/community",
        "/random",
        "/scene",
        "/changelog",
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
        "/theme/isekai",
        "/theme/reincarnation",
        "/theme/time-travel",
        "/theme/survival",
        "/best/2026",
        "/best/2025",
        "/best/2024",
        "/year/2026",
        "/year/2025",
        "/year/2024",
        "/type/tv",
        "/type/movie",
        "/type/ova",
    ]
    for p in landings:
        candidates.append(f"{ORIGIN}{p}")

    # 2. Fetch top popular & ongoing titles from Shikimori
    headers = {'User-Agent': 'AnimeLife-IndexBot/1.0 (https://animelife.top)'}
    
    # Ongoing titles (highest priority for daily search intent)
    try:
        r = requests.get('https://shikimori.one/api/animes?status=ongoing&limit=50', headers=headers, timeout=10)
        if r.status_code == 200:
            for item in r.json():
                url = f"{ORIGIN}{anime_path(item['id'], item.get('name'))}"
                candidates.append(url)
    except Exception as e:
        print(f"[!] Warning fetching ongoing titles: {e}")

    # Popular titles (pages 1-5, up to 250 anime)
    for page in range(1, 6):
        try:
            r = requests.get(f'https://shikimori.one/api/animes?order=popularity&censored=true&limit=50&page={page}', headers=headers, timeout=10)
            if r.status_code == 200:
                for item in r.json():
                    url = f"{ORIGIN}{anime_path(item['id'], item.get('name'))}"
                    candidates.append(url)
            time.sleep(0.3)
        except Exception as e:
            print(f"[!] Warning fetching page {page}: {e}")
            break

    # Deduplicate while preserving order
    seen = set()
    unique_candidates = []
    for u in candidates:
        if u not in seen:
            seen.add(u)
            unique_candidates.append(u)

    return unique_candidates

def main():
    max_quota = 150  # Keep within 200 daily limit (we sent 41 earlier)
    if len(sys.argv) > 1:
        try:
            max_quota = int(sys.argv[1])
        except ValueError:
            pass

    if not os.path.exists(KEY_PATH):
        print(f"[!] Ключ сервисного аккаунта не найден: {KEY_PATH}")
        sys.exit(1)

    print("🔐 Авторизация сервисного аккаунта Google...")
    creds = service_account.Credentials.from_service_account_file(
        KEY_PATH, scopes=["https://www.googleapis.com/auth/indexing"]
    )
    creds.refresh(Request())
    session = requests.Session()
    session.headers.update({
        "Authorization": f"Bearer {creds.token}",
        "Content-Type": "application/json"
    })

    api_url = "https://indexing.googleapis.com/v3/urlNotifications:publish"

    history = load_history()
    today_str = datetime.now().strftime("%Y-%m-%d")

    print("📡 Сбор канонических URL из sitemap-структуры и каталога...")
    all_candidates = gather_candidate_urls()
    print(f"Всего собрано уникальных URL: {len(all_candidates)}")

    # Filter out URLs already indexed today
    to_submit = []
    for u in all_candidates:
        last_sub = history.get(u, {}).get("date")
        if last_sub != today_str:
            to_submit.append(u)

    print(f"Осталось неотправленных за сегодня: {len(to_submit)}")
    target_batch = to_submit[:max_quota]
    print(f"🚀 Будет отправлено в текущей партии: {len(target_batch)} URL (лимит партии: {max_quota})")

    success_count = 0
    fail_count = 0

    for i, target_url in enumerate(target_batch, 1):
        payload = {
            "url": target_url,
            "type": "URL_UPDATED"
        }
        try:
            r = session.post(api_url, json=payload, timeout=10)
            if r.status_code in (200, 202):
                print(f"[{i:03d}/{len(target_batch):03d}] ✔ OK (200): {target_url}")
                history[target_url] = {
                    "date": today_str,
                    "timestamp": datetime.now().isoformat(),
                    "status": r.status_code
                }
                success_count += 1
            elif r.status_code == 429:
                print(f"[{i:03d}/{len(target_batch):03d}] ⚠ 429 Quota Exceeded! Достигнут суточный лимит Google API.")
                fail_count += 1
                break
            else:
                print(f"[{i:03d}/{len(target_batch):03d}] ✖ FAIL ({r.status_code}): {target_url} -> {r.text[:60]}")
                fail_count += 1
        except Exception as e:
            print(f"[{i:03d}/{len(target_batch):03d}] ✖ ERROR: {target_url} -> {e}")
            fail_count += 1
        
        time.sleep(0.12)

    save_history(history)

    print("\n" + "=" * 60)
    print("✨ ИТОГ ОТПРАВКИ В GOOGLE INDEXING API:")
    print(f"  • Успешно принято Googlebot: {success_count} URL")
    print(f"  • Ошибок / Ограничений:     {fail_count}")
    print(f"  • Всего сохранено в истории: {len(history)} URL")
    print("=" * 60)

if __name__ == "__main__":
    main()
