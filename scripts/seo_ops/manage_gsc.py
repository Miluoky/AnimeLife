#!/usr/bin/env python3
"""
manage_gsc.py — Google Search Console & Indexing Manager for AnimeLife.top

Handles:
1. Authentication via service_account.json
2. Fetching Sitemaps & status
3. Querying Search Analytics (Clicks, Impressions, CTR, Positions)
4. URL Inspection
5. Batch Indexing API ping
"""

import os
import sys
import json
import argparse

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

from google.oauth2 import service_account
from google.auth.transport.requests import Request
import requests

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
KEY_PATH = os.path.join(SCRIPT_DIR, "service_account.json")

SCOPES = [
    "https://www.googleapis.com/auth/webmasters.readonly",
    "https://www.googleapis.com/auth/webmasters",
    "https://www.googleapis.com/auth/indexing"
]

def get_auth_session():
    if not os.path.exists(KEY_PATH):
        print(f"[!] Key not found at: {KEY_PATH}")
        sys.exit(1)

    creds = service_account.Credentials.from_service_account_file(KEY_PATH, scopes=SCOPES)
    creds.refresh(Request())
    session = requests.Session()
    session.headers.update({
        "Authorization": f"Bearer {creds.token}",
        "Content-Type": "application/json"
    })
    return session

def check_sites(session):
    print("\n🔍 --- Проверка доступных ресурсов в Google Search Console ---")
    url = "https://www.googleapis.com/webmasters/v3/sites"
    r = session.get(url)
    if r.status_code != 200:
        print(f"[!] Ошибка доступа к сайтам ({r.status_code}):\n{r.text}")
        return []
    data = r.json()
    entries = data.get("siteEntry", [])
    if not entries:
        print("[*] Сайтов не найдено. Убедитесь, что email сервисного аккаунта добавлен в Search Console.")
        return []
    for site in entries:
        print(f"  • {site.get('siteUrl')} (Уровень доступа: {site.get('permissionLevel')})")
    return [s.get("siteUrl") for s in entries]

def check_sitemaps(session, site_url):
    print(f"\n🗺️ --- Статус Sitemaps для {site_url} ---")
    encoded = requests.utils.quote(site_url, safe='')
    url = f"https://www.googleapis.com/webmasters/v3/sites/{encoded}/sitemaps"
    r = session.get(url)
    if r.status_code != 200:
        print(f"[!] Ошибка получения sitemaps ({r.status_code}):\n{r.text}")
        return
    data = r.json()
    sitemaps = data.get("sitemap", [])
    if not sitemaps:
        print("  Карты сайта не найдены в API.")
        return
    for sm in sitemaps:
        print(f"  • Путь: {sm.get('path')}")
        print(f"    Последняя загрузка: {sm.get('lastDownloaded')}")
        print(f"    Ошибки: {sm.get('errors', 0)}, Предупреждения: {sm.get('warnings', 0)}")
        for content in sm.get("contents", []):
            print(f"    -> Тип: {content.get('type')}, Найдено: {content.get('submitted')}, В индексе: {content.get('indexed')}")

def query_analytics(session, site_url, days=7):
    print(f"\n📈 --- Поисковая аналитика за последние {days} дней ({site_url}) ---")
    encoded = requests.utils.quote(site_url, safe='')
    url = f"https://www.googleapis.com/webmasters/v3/sites/{encoded}/searchAnalytics/query"
    
    # Calculate dates
    from datetime import datetime, timedelta
    end_date = (datetime.now() - timedelta(days=2)).strftime("%Y-%m-%d")
    start_date = (datetime.now() - timedelta(days=days + 2)).strftime("%Y-%m-%d")
    
    payload = {
        "startDate": start_date,
        "endDate": end_date,
        "dimensions": ["query"],
        "rowLimit": 10
    }
    r = session.post(url, json=payload)
    if r.status_code != 200:
        print(f"[!] Ошибка запроса аналитики ({r.status_code}):\n{r.text}")
        return
    rows = r.json().get("rows", [])
    if not rows:
        print("  Данных за выбранный период пока нет (статистика в GSC появляется с задержкой в 2-3 дня).")
        return
    print(f"  {'Запрос':<35} | {'Клики':<6} | {'Показы':<8} | {'CTR':<6} | {'Позиция':<6}")
    print("  " + "-" * 70)
    for row in rows:
        q = row['keys'][0]
        clicks = row.get('clicks', 0)
        impressions = row.get('impressions', 0)
        ctr = f"{row.get('ctr', 0)*100:.1f}%"
        pos = f"{row.get('position', 0):.1f}"
        print(f"  {q:<35} | {clicks:<6} | {impressions:<8} | {ctr:<6} | {pos:<6}")

def inspect_url(session, site_url, inspection_url):
    print(f"\n🔎 --- Проверка URL: {inspection_url} ---")
    url = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect"
    payload = {
        "inspectionUrl": inspection_url,
        "siteUrl": site_url
    }
    r = session.post(url, json=payload)
    if r.status_code != 200:
        print(f"[!] Ошибка инспекции ({r.status_code}):\n{r.text}")
        return
    data = r.json().get("inspectionResult", {})
    idx_res = data.get("indexStatusResult", {})
    print(f"  • Вердикт: {idx_res.get('verdict')}")
    print(f"  • Покрытие (Coverage): {idx_res.get('coverageState')}")
    print(f"  • Канонический Google: {idx_res.get('googleCanonical')}")
    print(f"  • Канонический пользователя: {idx_res.get('userCanonical')}")
    print(f"  • Последний обход: {idx_res.get('lastCrawlTime')}")
    print(f"  • Робот обхода: {idx_res.get('crawledAs')}")

def ping_indexing(session, target_url):
    print(f"\n⚡ --- Отправка в Google Indexing API: {target_url} ---")
    url = "https://indexing.googleapis.com/v3/urlNotifications:publish"
    payload = {
        "url": target_url,
        "type": "URL_UPDATED"
    }
    r = session.post(url, json=payload)
    if r.status_code in [200, 202]:
        print(f"  ✔ Успешно отправлено! Робот уведомит очередь.")
    else:
        print(f"  [!] Ошибка Indexing API ({r.status_code}):\n{r.text}")

def main():
    parser = argparse.ArgumentParser(description="Google Search Console Manager for AnimeLife")
    parser.add_argument("--check", action="store_true", help="Проверить сайты и sitemaps")
    parser.add_argument("--inspect", type=str, help="Инспектировать конкретный URL")
    parser.add_argument("--ping", type=str, help="Отправить URL на быструю индексацию")
    args = parser.parse_args()

    session = get_auth_session()
    sites = check_sites(session)
    
    if not sites:
        return

    site_url = sites[0]
    check_sitemaps(session, site_url)
    query_analytics(session, site_url)

    if args.inspect:
        inspect_url(session, site_url, args.inspect)
    if args.ping:
        ping_indexing(session, args.ping)

if __name__ == "__main__":
    main()
