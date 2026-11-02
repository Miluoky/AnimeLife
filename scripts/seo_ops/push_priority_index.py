#!/usr/bin/env python3
"""
push_priority_index.py — Batch submit top priority pages to Google Indexing API.
"""

import os
import sys
import time

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

from google.oauth2 import service_account
from google.auth.transport.requests import Request
import requests

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
KEY_PATH = os.path.join(SCRIPT_DIR, "service_account.json")

PRIORITY_URLS = [
    # Core portals
    "https://animelife.top/",
    "https://animelife.top/catalog",
    "https://animelife.top/top",
    "https://animelife.top/schedule",
    "https://animelife.top/collections",
    "https://animelife.top/season",
    "https://animelife.top/community",
    "https://animelife.top/random",
    "https://animelife.top/scene",
    "https://animelife.top/changelog",

    # Popular and Trending Titles
    "https://animelife.top/anime/34572",  # Black Clover
    "https://animelife.top/anime/42897",  # Horimiya
    "https://animelife.top/anime/57334",  # Dandadan
    "https://animelife.top/anime/52299",  # Solo Leveling
    "https://animelife.top/anime/40748",  # Jujutsu Kaisen
    "https://animelife.top/anime/38000",  # Demon Slayer
    "https://animelife.top/anime/52991",  # Frieren
    "https://animelife.top/anime/44511",  # Chainsaw Man
    "https://animelife.top/anime/52034",  # Oshi no Ko
    "https://animelife.top/anime/54857",  # Re:Zero Season 3
    "https://animelife.top/anime/49596",  # Blue Lock
    "https://animelife.top/anime/41467",  # Bleach TYBW
    "https://animelife.top/anime/52588",  # Kaiju No. 8
    "https://animelife.top/anime/54900",  # Wind Breaker
    "https://animelife.top/anime/16498",  # Attack on Titan
    "https://animelife.top/anime/21",     # One Piece
    "https://animelife.top/anime/1735",   # Naruto Shippuden
    "https://animelife.top/anime/11061",  # Hunter x Hunter
    "https://animelife.top/anime/1535",   # Death Note
    "https://animelife.top/anime/22319",  # Tokyo Ghoul
    "https://animelife.top/anime/50265",  # Spy x Family
    "https://animelife.top/anime/42310",  # Cyberpunk: Edgerunners
    "https://animelife.top/anime/37521",  # Vinland Saga
    "https://animelife.top/anime/46569",  # Hell's Paradise
    "https://animelife.top/anime/39535",  # Mushoku Tensei
    "https://animelife.top/anime/35507",  # Classroom of the Elite
    "https://animelife.top/anime/48316",  # Eminence in Shadow
    "https://animelife.top/anime/11757",  # Sword Art Online
    "https://animelife.top/anime/5114",   # Fullmetal Alchemist: Brotherhood
    "https://animelife.top/anime/9253",   # Steins;Gate
    "https://animelife.top/anime/31964",  # My Hero Academia
]

def main():
    if not os.path.exists(KEY_PATH):
        print(f"[!] Ключ не найден: {KEY_PATH}")
        sys.exit(1)

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

    print(f"\n🚀 Запуск пакетной отправки {len(PRIORITY_URLS)} приоритетных URL в Google Indexing API...")
    success_count = 0
    fail_count = 0

    for i, target_url in enumerate(PRIORITY_URLS, 1):
        payload = {
            "url": target_url,
            "type": "URL_UPDATED"
        }
        try:
            r = session.post(api_url, json=payload, timeout=10)
            if r.status_code in (200, 202):
                print(f"[{i:02d}/{len(PRIORITY_URLS):02d}] ✔ OK: {target_url}")
                success_count += 1
            else:
                print(f"[{i:02d}/{len(PRIORITY_URLS):02d}] ✖ FAIL ({r.status_code}): {target_url} -> {r.text[:80]}")
                fail_count += 1
        except Exception as e:
            print(f"[{i:02d}/{len(PRIORITY_URLS):02d}] ✖ ERROR: {target_url} -> {e}")
            fail_count += 1
        time.sleep(0.15)

    print(f"\n✨ Итог отправки:")
    print(f"  • Успешно принято Google: {success_count}")
    print(f"  • Ошибок: {fail_count}")

if __name__ == "__main__":
    main()
