#!/usr/bin/env python3
"""
yandex_indexnow_push.py — Mass submission of AnimeLife catalog & landing pages
to Yandex & Bing via the IndexNow protocol (limit: up to 10,000 URLs/day batching).
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
TOKEN_FILE = os.path.join(SCRIPT_DIR, ".yandex_token")

ENDPOINTS = [
    ("Яндекс (Yandex)", "https://yandex.com/indexnow"),
    ("Bing & IndexNow.org", "https://api.indexnow.org/indexnow")
]

BATCH_SIZE = 10000
TARGET_MAX_URLS = 10000

# ─── Master Datasets for SEO Landing Expansion ───

VOICE_STUDIOS = [
    "anilibria", "studio-band", "anidub", "dream-cast", "reanimedia",
    "shiza-project", "soviet-romantica", "voik-in-the-dark", "persona99",
    "kansai", "flarrow-films", "force-media", "anistar", "aniplay",
    "anifilm", "steponee", "jam-club", "amber", "devochki", "onwave",
    "anirise", "youmita", "youmiteam", "focasteam", "subtitry",
    "sv-dub", "newstudio", "alexfilm", "hdrezka-studio", "baibako",
    "lostfilm", "coldfilm", "jaskier", "tvshows", "profix-media",
    "vost-club", "ani-joy", "shikimori-dub", "crunchyroll-ru", "wakanim-ru"
]

FRANCHISE_CHRONOLOGIES = [
    "fate", "monogatari", "jojo", "attack-on-titan", "steins-gate",
    "sword-art-online", "naruto", "bleach", "one-piece", "dragon-ball",
    "gundam", "sailor-moon", "evangelion", "code-geass", "fullmetal-alchemist",
    "hunter-x-hunter", "fairy-tail", "gintama", "baki", "psycho-pass",
    "to-aru", "madoka-magica", "berserk", "vinland-saga", "haikyuu",
    "kuroko", "bungou-stray-dogs", "demon-slayer", "jujutsu-kaisen", "tokyo-ghoul",
    "re-zero", "overlord", "konosuba", "danmachi", "slayers",
    "inuyasha", "black-clover", "chainsaw-man", "mob-psycho-100", "seven-deadly-sins",
    "my-hero-academia", "death-note", "cowboy-bebop", "ghost-in-the-shell", "made-in-abyss",
    "dr-stone", "fire-force", "tokyo-revengers", "mushoku-tensei", "violet-evergarden"
]

ANIME_TROPES = [
    # Character Archetypes
    "op-from-start", "mc-hides-strength", "tsundere-romance", "yandere", "kuudere",
    "dandere", "anti-hero", "child-prodigy", "lone-wolf-ranger", "shadow-monarch",
    "villainess-redemption", "reincarnation-villain", "unreliable-narrator", "mentor-figure",
    "genius-detective", "foolish-hero", "fallen-hero", "gentle-giant", "charismatic-rival",
    "older-sister-type", "tomboy-heroine", "rich-girl-poor-boy", "school-delinquents",
    # Plot & Dynamics
    "time-loop", "time-travel-romance", "tournament-arc", "revenge-betrayal", "death-game",
    "battle-royale", "contract-marriage", "fake-dating", "body-swap", "memory-loss",
    "betrayal-arc", "split-personality", "curse-breaking", "locked-room-mystery", "heist-crew",
    "prison-break", "time-paradox", "chosen-one-subversion", "power-of-friendship", "training-arc",
    "beach-episode-trope", "school-festival-arc", "rescue-mission", "enemies-to-lovers",
    # Micro-genres & Themes
    "magic-academy", "dungeon-crawl", "virtual-reality", "mecha-pilots", "isekai-cheat-skills",
    "reborn-as-monster", "isekai-crafting", "isekai-farming", "slow-life", "otome-isekai",
    "isekai-restaurant", "isekai-kingdom-building", "cyberpunk", "space-opera", "post-apocalyptic",
    "urban-fantasy", "comedy-parody", "mafia-yakuza", "sports-underdog", "cooking-gourmet",
    "music-band", "superhero-society", "steampunk", "dark-fantasy", "apocalypse-zombies",
    "pandemic-survival", "dystopian-future", "gladiator-arena", "underground-city", "floating-islands",
    "cosmic-horror", "dream-world", "astral-projection", "portal-fantasy", "military-tactics",
    "airship-pirates", "submarine-battles", "wilderness-survival", "polar-expedition", "lost-civilization",
    "alien-invasion", "kaiju-defense", "space-colony", "vr-mmorpg", "tower-climbing",
    "dungeon-reset", "constellation-stream", "apocalypse-system", "hunter-guild-korea", "level-100-boss",
    "infinite-mana", "support-class-overpowered", "summoner-army", "necromancy", "dungeon-master",
    "guild-adventurers", "rank-f-to-rank-s", "exiled-from-hero-party", "evil-cult", "god-powers",
    "immortal-cultivation", "childhood-promise", "age-gap-romance", "cohabitation", "student-council",
    "sports-high-school", "music-idol", "idol-producer", "magical-girl", "bodyguard-romance",
    "arranged-marriage", "master-apprentice", "beast-companion", "vampire-hunter", "demon-slaying",
    "exorcist-school", "esper-powers", "psychic-battles", "mind-reading", "parallel-worlds",
    "glitch-in-reality", "isekai-blacksmith", "dragon-rider", "mythology-retelling", "greek-gods",
    "norse-mythology", "folk-tales", "samurai-lone-wolf", "ronin-journey", "ninja-clans",
    "assassin-for-hire", "detective-rivalry", "survival-island", "haunted-mansion", "ghost-whisperer",
    "mecha-military", "racing-drift", "boxing-underdog", "swimming-team", "volleyball-nationals",
    "baseball-koshien", "chess-shogi-genius", "card-game-battles", "gambling-thriller", "culinary-battles",
    "coffee-shop-daily", "bookstore-mystery", "art-school-life", "photography-club", "theater-drama",
    "voice-acting-industry", "manga-artist-life", "game-developer-story", "vigilante-justice", "cyborg-identity",
    "virtual-youtuber", "isekai-alchemist", "fairy-tail-retelling", "shapeshifter-romance", "witch-coven",
    "dark-arts-academy", "alchemist-secrets", "immortal-wanderer", "god-slayer", "reincarnated-as-dragon",
    "isekai-merchant", "slave-rebellion", "monarchy-overthrow", "stealth-assassin", "sniper-duels",
    "tactical-espionage", "double-agent", "undercover-cop", "bounty-hunter", "cyber-detective",
    "hacker-warfare", "ai-sentience", "android-emotions", "space-pirates", "asteroid-miners",
    "first-contact-alien", "time-police", "temporal-war", "reincarnation-regression", "healing-magic-cheat",
    "speedster-battles", "gravity-magic", "portal-hopping", "dimension-traveler", "isekai-doctor",
    "medieval-warfare", "siege-battle"
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

def check_yandex_token():
    """Verify presence of .yandex_token and display status."""
    token = os.getenv("YANDEX_TOKEN")
    if not token and os.path.exists(TOKEN_FILE):
        try:
            with open(TOKEN_FILE, "r", encoding="utf-8") as f:
                token = f.read().strip()
        except Exception:
            pass
    if token:
        masked = token[:6] + "..." + token[-4:] if len(token) > 12 else "***"
        print(f"🔑 Yandex Webmaster OAuth Token обнаружен: {masked}")
        return token
    else:
        print("ℹ️ Yandex OAuth Token не задан (.yandex_token отсутствует). Используется публичный IndexNow.")
        return None

def collect_all_urls():
    urls = []

    # 1. Base Landings & Categories
    landings = [
        "/", "/en", "/catalog", "/top", "/schedule", "/collections",
        "/season", "/community", "/random", "/scene", "/changelog", "/ongoing",
        "/genre/action", "/genre/adventure", "/genre/comedy", "/genre/drama",
        "/genre/fantasy", "/genre/romance", "/genre/sci-fi", "/genre/mystery",
        "/genre/horror", "/genre/thriller", "/genre/psychological", "/genre/slice-of-life",
        "/genre/supernatural", "/genre/school", "/genre/sports", "/genre/mecha",
        "/genre/martial-arts", "/genre/historical", "/genre/military", "/genre/music",
        "/genre/samurai", "/genre/space", "/genre/super-power", "/genre/vampire",
        "/genre/demons", "/genre/game", "/genre/harem", "/genre/parody",
        "/genre/police", "/genre/kids", "/genre/cars", "/genre/gourmet",
        "/genre/work-life", "/genre/shounen", "/genre/seinen", "/genre/shoujo",
        "/genre/josei", "/theme/isekai", "/theme/reincarnation", "/theme/time-travel",
        "/theme/survival", "/theme/high-stakes-game", "/theme/villainess",
        "/type/tv", "/type/movie", "/type/ova", "/type/ona", "/type/special"
    ]
    # Years and best rankings
    for y in range(1995, 2027):
        landings.append(f"/year/{y}")
        landings.append(f"/best/{y}")
    for y in [2024, 2025, 2026]:
        for season in ["winter", "spring", "summer", "fall"]:
            landings.append(f"/year/{y}/{season}")
    # Catalog pagination
    for p in range(2, 61):
        landings.append(f"/catalog?page={p}")

    for path in landings:
        urls.append(f"{ORIGIN}{path}")

    # 2. Voice Dubbing Studios (/voice/:studio_slug)
    print(f"🎙️ Добавление {len(VOICE_STUDIOS)} посадочных страниц студий озвучки...")
    for studio in VOICE_STUDIOS:
        urls.append(f"{ORIGIN}/voice/{studio}")

    # 3. Franchise Chronologies (/chronology/:id)
    print(f"⏳ Добавление {len(FRANCHISE_CHRONOLOGIES)} интерактивных таймлайнов франшиз...")
    for franchise in FRANCHISE_CHRONOLOGIES:
        urls.append(f"{ORIGIN}/chronology/{franchise}")

    # 4. 150+ Tropes & Micro-genres (/trope/:slug)
    print(f"🏷️ Добавление {len(ANIME_TROPES)} страниц микро-жанров и тропов...")
    for trope in ANIME_TROPES:
        urls.append(f"{ORIGIN}/trope/{trope}")

    # 5. Fetch Popular & Ongoing Titles from Shikimori API + Generate Episode URLs
    headers = {'User-Agent': 'AnimeLife-IndexBot/2.0 (https://animelife.top)'}
    print("📡 Получение онгоингов и каталога тайтлов из Shikimori API...")

    fetched_titles = []
    # Fetch ongoings
    try:
        r = requests.get('https://shikimori.one/api/animes?status=ongoing&limit=50', headers=headers, timeout=8)
        if r.status_code == 200:
            for item in r.json():
                fetched_titles.append((item['id'], item.get('name'), item.get('episodes_aired') or 12, True))
    except Exception as e:
        print(f"[!] Ошибка загрузки онгоингов: {e}")

    # Fetch up to 35 pages of popular catalog (35 x 50 = 1750 titles)
    print("📡 Постраничная выгрузка популярного каталога...")
    for page in range(1, 36):
        try:
            r = requests.get(
                f'https://shikimori.one/api/animes?order=popularity&censored=true&limit=50&page={page}',
                headers=headers,
                timeout=8
            )
            if r.status_code == 200:
                items = r.json()
                if not items:
                    break
                for item in items:
                    eps = item.get('episodes') or item.get('episodes_aired') or 12
                    fetched_titles.append((item['id'], item.get('name'), eps, False))
            else:
                break
            time.sleep(0.2)
        except Exception as e:
            print(f"[!] Ошибка загрузки страницы {page}: {e}")
            break

    # Add fetched anime and their individual episode player URLs (/watch/:id/:ep)
    for aid, name, eps, is_ongoing in fetched_titles:
        urls.append(f"{ORIGIN}{anime_path(aid, name)}")
        urls.append(f"{ORIGIN}/en/anime/{aid}")
        # Add episode pages (up to 12 episodes per title to expand candidates toward 10,000)
        max_episodes = min(int(eps) if eps else 12, 12 if not is_ongoing else 24)
        for ep in range(1, max_episodes + 1):
            urls.append(f"{ORIGIN}/watch/{aid}/{ep}")
            if len(urls) >= TARGET_MAX_URLS:
                break
        if len(urls) >= TARGET_MAX_URLS:
            break

    # Deduplicate while preserving insertion order
    seen = set()
    unique_urls = []
    for u in urls:
        if u not in seen:
            seen.add(u)
            unique_urls.append(u)
        if len(unique_urls) >= TARGET_MAX_URLS:
            break

    return unique_urls

def submit_indexnow(urls):
    print(f"\n🚀 Подготовка отправки {len(urls)} URL через протокол IndexNow...")
    
    # Split into batches of up to BATCH_SIZE (IndexNow max per request is 10,000)
    batches = [urls[i:i + BATCH_SIZE] for i in range(0, len(urls), BATCH_SIZE)]
    print(f"📦 Сформировано пакетов: {len(batches)} (размер батча: до {BATCH_SIZE} URL)")

    overall_results = {}

    for batch_idx, batch in enumerate(batches, start=1):
        print(f"\n--- Отправка батча #{batch_idx} ({len(batch)} URL) ---")
        payload = {
            "host": HOST,
            "key": INDEXNOW_KEY,
            "keyLocation": KEY_LOCATION,
            "urlList": batch
        }

        for name, endpoint in ENDPOINTS:
            print(f"📤 Отправка в {name} ({endpoint})...")
            try:
                r = requests.post(
                    endpoint,
                    json=payload,
                    headers={"Content-Type": "application/json; charset=utf-8"},
                    timeout=25
                )
                if r.status_code in (200, 202):
                    print(f"  ✔ УСПЕШНО ({r.status_code})! {name} принял все {len(batch)} URL.")
                    overall_results[f"{name} (batch {batch_idx})"] = "OK"
                else:
                    print(f"  ✖ Ответ {r.status_code}: {r.text[:160]}")
                    overall_results[f"{name} (batch {batch_idx})"] = f"HTTP {r.status_code}"
            except Exception as e:
                print(f"  ✖ Ошибка запроса к {name}: {e}")
                overall_results[f"{name} (batch {batch_idx})"] = f"Error: {e}"

            time.sleep(1.0)  # Rate limit pacing between endpoints

    return overall_results

def main():
    print("=" * 65)
    print("✨ ЗАПУСК МАССОВОГО ПУША INDEXNOW ДЛЯ ЯНДЕКСА И BING (MAX 10 000 URL)")
    print("=" * 65)
    
    check_yandex_token()

    urls = collect_all_urls()
    print(f"\n📊 Собрано уникальных канонических URL: {len(urls)}")

    results = submit_indexnow(urls)
    
    print("\n" + "=" * 65)
    print("📊 ИТОГОВЫЙ ОТЧЕТ ПУША INDEXNOW:")
    for name, status in results.items():
        print(f"  • {name}: {status}")
    print("=" * 65)

if __name__ == "__main__":
    main()
