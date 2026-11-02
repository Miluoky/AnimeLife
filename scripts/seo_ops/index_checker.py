#!/usr/bin/env python3
"""
Search Engine Index & Live HTTP Health Checker for AnimeLife (https://animelife.top).

Features:
1. Automated URL Inspection:
   - Evaluates HTTP response codes (200, 301, 404, 500, 503).
   - Validates canonical tags and X-Robots-Tag / meta robots headers (noindex detection).
   - Measures Time to First Byte (TTFB).
2. Search Engine Index Verification:
   - Google URL Inspection API / Google Custom Search API.
   - Yandex Search API (XML / Cloud Search) check for 'url:animelife.top/...'
3. Persistent State Tracking:
   - SQLite database (.health/index_history.db) tracking status over time.
   - Detects transitions: INDEXED -> DROPPED, 200 -> 404/503.
4. Telegram Incident Alerting:
   - Sends formatted alert notifications to Telegram admin chats.
"""

import argparse
import json
import logging
import os
import re
import sqlite3
import sys
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple
from urllib.parse import quote_plus, urlparse

import requests

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("IndexChecker")

DEFAULT_ORIGIN = "https://animelife.top"
DEFAULT_DB_PATH = ".health/index_history.db"
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
ADMIN_CHAT_ID = os.getenv("TELEGRAM_ADMIN_CHAT_ID")


class IndexStorage:
    """SQLite-backed history storage for page indexing and HTTP health."""

    def __init__(self, db_path: str = DEFAULT_DB_PATH):
        self.db_path = db_path
        os.makedirs(os.path.dirname(self.db_path) or ".", exist_ok=True)
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS page_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    url TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    http_code INTEGER NOT NULL,
                    response_time_ms INTEGER NOT NULL,
                    canonical TEXT,
                    is_noindex INTEGER NOT NULL,
                    google_indexed INTEGER NOT NULL,
                    yandex_indexed INTEGER NOT NULL,
                    alert_sent INTEGER NOT NULL DEFAULT 0
                )
                """
            )
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_page_url ON page_history(url)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_page_timestamp ON page_history(timestamp)")
            conn.commit()

    def get_latest_status(self, url: str) -> Optional[Dict]:
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM page_history WHERE url = ? ORDER BY id DESC LIMIT 1",
                (url,),
            )
            row = cursor.fetchone()
            return dict(row) if row else None

    def record_check(self, record: Dict) -> int:
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO page_history 
                (url, timestamp, http_code, response_time_ms, canonical, is_noindex, google_indexed, yandex_indexed, alert_sent)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record["url"],
                    record["timestamp"],
                    record["http_code"],
                    record["response_time_ms"],
                    record.get("canonical"),
                    1 if record.get("is_noindex") else 0,
                    1 if record.get("google_indexed") else 0,
                    1 if record.get("yandex_indexed") else 0,
                    1 if record.get("alert_sent") else 0,
                ),
            )
            conn.commit()
            return cursor.lastrowid


class TelegramNotifier:
    """Telegram alert delivery engine."""

    def __init__(self, bot_token: Optional[str] = None, chat_ids: Optional[str] = None):
        self.bot_token = bot_token or BOT_TOKEN
        raw_chats = chat_ids or ADMIN_CHAT_ID or ""
        self.chat_ids = [c.strip() for c in raw_chats.split(",") if c.strip()]

    def is_active(self) -> bool:
        return bool(self.bot_token and self.chat_ids)

    def send_alert(self, message: str) -> bool:
        if not self.is_active():
            logger.debug("Telegram alert skipped: Bot token or chat IDs not configured.")
            return False

        success = True
        for chat_id in self.chat_ids:
            endpoint = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"
            payload = {
                "chat_id": chat_id,
                "text": message,
                "parse_mode": "HTML",
                "disable_web_page_preview": True,
            }
            try:
                r = requests.post(endpoint, json=payload, timeout=10)
                if r.status_code != 200:
                    logger.error("Failed sending Telegram alert to %s: %s", chat_id, r.text)
                    success = False
            except Exception as e:
                logger.error("Telegram network failure for %s: %s", chat_id, str(e))
                success = False
        return success


class SearchEngineInspector:
    """Inspects search index status via official APIs or verification endpoints."""

    def __init__(self, google_api_key: Optional[str] = None, google_cx: Optional[str] = None,
                 yandex_xml_user: Optional[str] = None, yandex_xml_key: Optional[str] = None):
        self.google_api_key = google_api_key or os.getenv("GOOGLE_SEARCH_API_KEY")
        self.google_cx = google_cx or os.getenv("GOOGLE_SEARCH_CX")
        self.yandex_xml_user = yandex_xml_user or os.getenv("YANDEX_XML_USER")
        self.yandex_xml_key = yandex_xml_key or os.getenv("YANDEX_XML_KEY")

    def check_google_index(self, url: str) -> bool:
        """Check if URL appears in Google index using Custom Search API."""
        if not (self.google_api_key and self.google_cx):
            logger.debug("Google Search API credentials not set; assuming indexed for probe.")
            return True

        endpoint = "https://www.googleapis.com/customsearch/v1"
        params = {
            "key": self.google_api_key,
            "cx": self.google_cx,
            "q": f"info:{url}",
            "num": 1,
        }
        try:
            res = requests.get(endpoint, params=params, timeout=10)
            if res.status_code == 200:
                data = res.json()
                total_results = int(data.get("searchInformation", {}).get("totalResults", "0"))
                return total_results > 0
            logger.warning("Google Search API status %d: %s", res.status_code, res.text)
        except Exception as e:
            logger.error("Google Index probe failed: %s", str(e))
        return True

    def check_yandex_index(self, url: str) -> bool:
        """Check if URL is in Yandex index using Yandex XML Search."""
        if not (self.yandex_xml_user and self.yandex_xml_key):
            logger.debug("Yandex XML credentials not set; assuming indexed for probe.")
            return True

        endpoint = "https://yandex.com/search/xml"
        query = f"url:{url}"
        params = {
            "user": self.yandex_xml_user,
            "key": self.yandex_xml_key,
            "query": query,
            "lr": 225,  # Russia
        }
        try:
            res = requests.get(endpoint, params=params, timeout=10)
            if res.status_code == 200:
                # Basic check for found documents in XML
                return "<doc id=" in res.text or "<found priority=\"all\">" in res.text
            logger.warning("Yandex XML Search API status %d: %s", res.status_code, res.text)
        except Exception as e:
            logger.error("Yandex Index probe failed: %s", str(e))
        return True


def probe_http_health(url: str, user_agent: str = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)") -> Dict:
    """Perform detailed HTTP probe: status, canonical, noindex header and HTML meta tags."""
    headers = {
        "User-Agent": user_agent,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
    }
    start = time.time()
    try:
        res = requests.get(url, headers=headers, timeout=12, allow_redirects=False)
        ttfb = int((time.time() - start) * 1000)

        canonical = None
        is_noindex = False

        # Header check: X-Robots-Tag
        x_robots = res.headers.get("X-Robots-Tag", "").lower()
        if "noindex" in x_robots:
            is_noindex = True

        # Link header check for canonical
        link_header = res.headers.get("Link", "")
        if 'rel="canonical"' in link_header:
            match = re.search(r'<([^>]+)>;\s*rel="canonical"', link_header)
            if match:
                canonical = match.group(1)

        # Body parse for meta robots and canonical
        content_type = res.headers.get("Content-Type", "")
        if "text/html" in content_type and res.status_code == 200:
            text = res.text[:20000]  # Examine head section
            if not is_noindex and re.search(r'<meta[^>]+name=["\']robots["\'][^>]+content=["\'][^"\']*noindex[^"\']*["\']', text, re.I):
                is_noindex = True

            if not canonical:
                can_match = re.search(r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']+)["\']', text, re.I)
                if can_match:
                    canonical = can_match.group(1)

        is_cf_challenge = False
        if res.status_code == 403 and re.search(r'challenge-platform|cf-chl|Just a moment|cloudflare', res.text, re.I):
            is_cf_challenge = True

        return {
            "url": url,
            "http_code": res.status_code,
            "response_time_ms": ttfb,
            "canonical": canonical,
            "is_noindex": is_noindex,
            "is_cf_challenge": is_cf_challenge,
            "redirect_url": res.headers.get("Location") if res.status_code in (301, 302, 307, 308) else None,
            "error": None,
        }
    except requests.Timeout:
        return {
            "url": url,
            "http_code": 504,
            "response_time_ms": int((time.time() - start) * 1000),
            "canonical": None,
            "is_noindex": False,
            "redirect_url": None,
            "error": "TimeoutError",
        }
    except Exception as e:
        return {
            "url": url,
            "http_code": 500,
            "response_time_ms": int((time.time() - start) * 1000),
            "canonical": None,
            "is_noindex": False,
            "redirect_url": None,
            "error": str(e),
        }


def format_alert_message(url: str, current: Dict, previous: Optional[Dict], issue_type: str) -> str:
    """Format HTML Telegram alert."""
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    lines = [
        f"🚨 <b>AnimeLife SEO Alert: {issue_type}</b>",
        f"<b>URL:</b> <code>{url}</code>",
        f"<b>Time:</b> {now_str}",
        f"<b>HTTP Status:</b> <code>{current['http_code']}</code> (TTFB: {current['response_time_ms']} ms)",
    ]
    if current.get("is_noindex"):
        lines.append("⚠️ <b>CRITICAL:</b> Page returns <code>noindex</code> robots tag!")
    if current.get("redirect_url"):
        lines.append(f"↪️ <b>Redirect To:</b> <code>{current['redirect_url']}</code>")
    if previous:
        lines.append(f"<b>Previous State:</b> HTTP {previous.get('http_code')}, Google:{previous.get('google_indexed')}, Yandex:{previous.get('yandex_indexed')}")
    lines.append("\n<i>Action required: Inspect Cloudflare Worker, Appwrite API, or DMCA status.</i>")
    return "\n".join(lines)


def run_checks(urls: List[str], check_search_engines: bool = False, db_path: str = DEFAULT_DB_PATH, cf_challenge_ok: bool = False) -> List[Dict]:
    storage = IndexStorage(db_path)
    notifier = TelegramNotifier()
    inspector = SearchEngineInspector() if check_search_engines else None

    results = []
    now_iso = datetime.now(timezone.utc).isoformat()

    logger.info("Evaluating %d URLs...", len(urls))
    for url in urls:
        prev = storage.get_latest_status(url)
        http_res = probe_http_health(url)

        google_indexed = inspector.check_google_index(url) if inspector else (prev.get("google_indexed", 1) if prev else 1)
        yandex_indexed = inspector.check_yandex_index(url) if inspector else (prev.get("yandex_indexed", 1) if prev else 1)

        record = {
            "url": url,
            "timestamp": now_iso,
            "http_code": http_res["http_code"],
            "response_time_ms": http_res["response_time_ms"],
            "canonical": http_res["canonical"],
            "is_noindex": http_res["is_noindex"],
            "google_indexed": 1 if google_indexed else 0,
            "yandex_indexed": 1 if yandex_indexed else 0,
            "alert_sent": 0,
        }

        # Anomaly detection
        alert_needed = False
        issue_title = ""

        is_healthy_code = http_res["http_code"] in (200, 301, 302) or (cf_challenge_ok and http_res.get("is_cf_challenge"))

        if not is_healthy_code:
            alert_needed = True
            issue_title = f"Page Down (HTTP {http_res['http_code']})"
        elif http_res["is_noindex"]:
            alert_needed = True
            issue_title = "Unexpected 'noindex' detected on Production URL"
        elif prev and prev.get("google_indexed") == 1 and not google_indexed:
            alert_needed = True
            issue_title = "Dropped from Google Index"
        elif prev and prev.get("yandex_indexed") == 1 and not yandex_indexed:
            alert_needed = True
            issue_title = "Dropped from Yandex Index"

        if alert_needed:
            logger.warning("ANOMALY detected on %s: %s", url, issue_title)
            alert_msg = format_alert_message(url, http_res, prev, issue_title)
            sent = notifier.send_alert(alert_msg)
            record["alert_sent"] = 1 if sent else 0

        storage.record_check(record)
        results.append(record)
        logger.info("Checked %s: HTTP %d in %dms (noindex=%s)", url, record["http_code"], record["response_time_ms"], record["is_noindex"])

    return results


def load_sitemap_urls(sitemap_url: str = f"{DEFAULT_ORIGIN}/sitemap-pages.xml") -> List[str]:
    try:
        res = requests.get(sitemap_url, timeout=15)
        if res.status_code == 200:
            urls = re.findall(r"<loc>([^<]+)</loc>", res.text)
            logger.info("Discovered %d URLs from sitemap %s", len(urls), sitemap_url)
            return urls
    except Exception as e:
        logger.error("Failed loading sitemap: %s", str(e))
    return [DEFAULT_ORIGIN + "/"]


def main():
    parser = argparse.ArgumentParser(description="AnimeLife Search Engine Indexing & HTTP Health Monitor")
    parser.add_argument("--url", help="Target URL to check")
    parser.add_argument("--sitemap", help="Load URLs from sitemap XML", action="store_true")
    parser.add_argument("--sitemap-url", default=f"{DEFAULT_ORIGIN}/sitemap-pages.xml", help="URL of sitemap XML")
    parser.add_argument("--file", help="File with list of URLs")
    parser.add_argument("--check-engines", action="store_true", help="Perform real Google/Yandex index existence checks")
    parser.add_argument("--cf-challenge-ok", action="store_true", help="Treat Cloudflare 403 bot challenges as alive instead of down")
    parser.add_argument("--db", default=DEFAULT_DB_PATH, help="Path to SQLite database")

    args = parser.parse_args()

    urls = []
    if args.url:
        urls.append(args.url.strip())
    elif args.file:
        with open(args.file, "r", encoding="utf-8") as f:
            urls = [l.strip() for l in f if l.strip() and not l.startswith("#")]
    elif args.sitemap:
        urls = load_sitemap_urls(args.sitemap_url)
    else:
        # Default sample if nothing specified: high-traffic site entry points
        urls = [
            f"{DEFAULT_ORIGIN}/",
            f"{DEFAULT_ORIGIN}/catalog",
            f"{DEFAULT_ORIGIN}/ongoing",
            f"{DEFAULT_ORIGIN}/top",
            f"{DEFAULT_ORIGIN}/sitemap.xml",
        ]

    results = run_checks(urls, check_search_engines=args.check_engines, db_path=args.db, cf_challenge_ok=args.cf_challenge_ok)
    print(json.dumps(results, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
