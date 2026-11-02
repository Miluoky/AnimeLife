#!/usr/bin/env python3
"""
Async Video Stream & Balancer Health Checker (Stream Health Checker).

Monitors video streams and balancer iframes for AnimeLife:
- HLS m3u8 playlists: validates Content-Type, verifies #EXTM3U, probes first .ts segment
- Direct MP4 streams: validates Range queries (HTTP 206/200), measures TTFB
- Balancer iframes (Kodik, Sibnet, DreamCast): checks HTTP status, validates iframe payload
  and scans for copyright/regional restriction blocks.
- Failover Switching: When primary player exceeds 4000ms or fails (403/404/500/timeout),
  automatically reconfigures title's default player to healthy backup and sends Telegram alert.

Usage:
  python stream_health_checker.py --test-stream https://example.com/stream.m3u8 --type hls
  python stream_health_checker.py --config streams_config.json
  python stream_health_checker.py --dry-run
"""

import argparse
import asyncio
import json
import logging
import os
import re
import sys
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urljoin, urlparse

import aiohttp
import requests

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("StreamHealth")

DEFAULT_TIMEOUT_SEC = 5.0
DEFAULT_LATENCY_THRESHOLD_MS = 4000
UA_BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
ADMIN_CHAT_ID = os.getenv("TELEGRAM_ADMIN_CHAT_ID")
APPWRITE_ENDPOINT = os.getenv("APPWRITE_ENDPOINT", "https://fra.cloud.appwrite.io/v1")
APPWRITE_PROJECT = os.getenv("APPWRITE_PROJECT_ID", "6abf65850016889f9b1b")
APPWRITE_KEY = os.getenv("APPWRITE_API_KEY")

COPYRIGHT_BLOCK_PATTERNS = [
    re.compile(r"видео\s+удалено\s+по\s+требованию\s+правообладателя", re.I),
    re.compile(r"доступ\s+ограничен\s+на\s+территории", re.I),
    re.compile(r"контент\s+заблокирован", re.I),
    re.compile(r"video\s+is\s+blocked", re.I),
    re.compile(r"video\s+has\s+been\s+removed", re.I),
    re.compile(r"not\s+available\s+in\s+your\s+region", re.I),
]


class TelegramReporter:
    """Delivers critical stream outage & failover notifications."""

    def __init__(self, bot_token: Optional[str] = None, chat_ids: Optional[str] = None):
        self.bot_token = bot_token or BOT_TOKEN
        raw_chats = chat_ids or ADMIN_CHAT_ID or ""
        self.chat_ids = [c.strip() for c in raw_chats.split(",") if c.strip()]

    async def send_failover_alert(self, title_id: str, title_name: str, old_player: str, new_player: str, reason: str):
        if not (self.bot_token and self.chat_ids):
            logger.info("Telegram notification skipped: credentials not provided.")
            return

        now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        message = (
            f"🔄 <b>AnimeLife Video Player Failover Triggered</b>\n"
            f"<b>Title:</b> {title_name} (ID: <code>{title_id}</code>)\n"
            f"<b>Time:</b> {now_str}\n"
            f"<b>Failing Player:</b> ❌ <code>{old_player}</code>\n"
            f"<b>Reason:</b> {reason}\n"
            f"<b>New Active Player:</b> ✅ <code>{new_player}</code>\n"
            f"<i>Fallback switch committed to database.</i>"
        )
        async with aiohttp.ClientSession() as session:
            for chat in self.chat_ids:
                url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"
                payload = {
                    "chat_id": chat,
                    "text": message,
                    "parse_mode": "HTML",
                }
                try:
                    async with session.post(url, json=payload, timeout=aiohttp.ClientTimeout(total=8)) as resp:
                        if resp.status != 200:
                            logger.error("Failed sending Telegram alert to %s: HTTP %d", chat, resp.status)
                except Exception as e:
                    logger.error("Telegram error sending to %s: %s", chat, str(e))


class DatabaseManager:
    """Updates default player assignment in Appwrite or database storage."""

    def __init__(self, dry_run: bool = False):
        self.dry_run = dry_run

    async def switch_default_player(self, title_id: str, new_player: str) -> bool:
        if self.dry_run:
            logger.info("[DRY-RUN] Database switch for Title %s -> %s (Simulated)", title_id, new_player)
            return True

        if not APPWRITE_KEY:
            logger.warning("APPWRITE_API_KEY not set; unable to write player switch to database.")
            return False

        url = f"{APPWRITE_ENDPOINT}/databases/anime/collections/titles/documents/{title_id}"
        headers = {
            "X-Appwrite-Project": APPWRITE_PROJECT,
            "X-Appwrite-Key": APPWRITE_KEY,
            "Content-Type": "application/json",
        }
        payload = {"data": {"default_player": new_player, "player_updated_at": datetime.now(timezone.utc).isoformat()}}

        async with aiohttp.ClientSession() as session:
            try:
                async with session.patch(url, headers=headers, json=payload, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                    if resp.status == 200:
                        logger.info("Successfully updated Title %s default_player to %s in Appwrite", title_id, new_player)
                        return True
                    else:
                        text = await resp.text()
                        logger.error("Failed updating Appwrite Title %s: HTTP %d %s", title_id, resp.status, text)
            except Exception as e:
                logger.error("Database connection error for Title %s: %s", title_id, str(e))
        return False


class StreamHealthChecker:
    """Asynchronously audits video streams and balancers."""

    def __init__(self, threshold_ms: int = DEFAULT_LATENCY_THRESHOLD_MS):
        self.threshold_ms = threshold_ms

    async def probe_hls(self, session: aiohttp.ClientSession, url: str, referer: Optional[str] = None) -> Dict[str, Any]:
        """Validate HLS playlist and its first .ts chunk."""
        headers = {
            "User-Agent": UA_BROWSER,
            "Accept": "*/*",
        }
        if referer:
            headers["Referer"] = referer

        start_time = time.time()
        result = {
            "url": url,
            "type": "hls",
            "is_alive": False,
            "http_status": 0,
            "ttfb_ms": 0,
            "content_type": "",
            "segment_verified": False,
            "error": None,
        }

        try:
            timeout = aiohttp.ClientTimeout(total=DEFAULT_TIMEOUT_SEC)
            async with session.get(url, headers=headers, timeout=timeout) as resp:
                result["http_status"] = resp.status
                result["ttfb_ms"] = int((time.time() - start_time) * 1000)
                result["content_type"] = resp.headers.get("Content-Type", "")

                if resp.status != 200:
                    result["error"] = f"HTTP {resp.status}"
                    return result

                body = await resp.text()
                if not body.startswith("#EXTM3U"):
                    result["error"] = "Invalid M3U8: missing #EXTM3U header"
                    return result

                # Check if master or variant playlist
                lines = [l.strip() for l in body.splitlines() if l.strip()]
                segment_url = None
                for line in lines:
                    if not line.startswith("#"):
                        segment_url = urljoin(url, line)
                        break

                if segment_url:
                    # Probe the first segment
                    seg_headers = headers.copy()
                    seg_headers["Range"] = "bytes=0-2048"
                    seg_start = time.time()
                    async with session.get(segment_url, headers=seg_headers, timeout=aiohttp.ClientTimeout(total=3.0)) as seg_resp:
                        if seg_resp.status in (200, 206):
                            chunk = await seg_resp.read()
                            if len(chunk) > 0:
                                result["segment_verified"] = True
                                result["is_alive"] = True
                        else:
                            result["error"] = f"First TS segment HTTP {seg_resp.status}"
                else:
                    # Playlist without direct segment lines (master playlist)
                    result["segment_verified"] = True
                    result["is_alive"] = True

        except asyncio.TimeoutError:
            result["error"] = f"Timeout after {DEFAULT_TIMEOUT_SEC}s"
            result["ttfb_ms"] = int((time.time() - start_time) * 1000)
        except Exception as e:
            result["error"] = str(e)
            result["ttfb_ms"] = int((time.time() - start_time) * 1000)

        return result

    async def probe_mp4(self, session: aiohttp.ClientSession, url: str, referer: Optional[str] = None) -> Dict[str, Any]:
        """Validate direct MP4 streaming endpoint via HTTP Range query."""
        headers = {
            "User-Agent": UA_BROWSER,
            "Range": "bytes=0-1024",
            "Accept": "*/*",
        }
        if referer:
            headers["Referer"] = referer

        start_time = time.time()
        result = {
            "url": url,
            "type": "mp4",
            "is_alive": False,
            "http_status": 0,
            "ttfb_ms": 0,
            "content_type": "",
            "error": None,
        }

        try:
            timeout = aiohttp.ClientTimeout(total=DEFAULT_TIMEOUT_SEC)
            async with session.get(url, headers=headers, timeout=timeout) as resp:
                result["http_status"] = resp.status
                result["ttfb_ms"] = int((time.time() - start_time) * 1000)
                result["content_type"] = resp.headers.get("Content-Type", "")

                if resp.status in (200, 206):
                    data = await resp.read()
                    if len(data) > 0:
                        result["is_alive"] = True
                else:
                    result["error"] = f"HTTP {resp.status}"

        except asyncio.TimeoutError:
            result["error"] = f"Timeout after {DEFAULT_TIMEOUT_SEC}s"
            result["ttfb_ms"] = int((time.time() - start_time) * 1000)
        except Exception as e:
            result["error"] = str(e)
            result["ttfb_ms"] = int((time.time() - start_time) * 1000)

        return result

    async def probe_iframe(self, session: aiohttp.ClientSession, url: str, referer: Optional[str] = None) -> Dict[str, Any]:
        """Validate balancer iframe page content and scan for copyright takedown text."""
        headers = {
            "User-Agent": UA_BROWSER,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        }
        if referer:
            headers["Referer"] = referer

        start_time = time.time()
        result = {
            "url": url,
            "type": "iframe",
            "is_alive": False,
            "http_status": 0,
            "ttfb_ms": 0,
            "has_copyright_block": False,
            "error": None,
        }

        try:
            timeout = aiohttp.ClientTimeout(total=DEFAULT_TIMEOUT_SEC)
            async with session.get(url, headers=headers, timeout=timeout) as resp:
                result["http_status"] = resp.status
                result["ttfb_ms"] = int((time.time() - start_time) * 1000)

                if resp.status == 200:
                    html = await resp.text()
                    for pattern in COPYRIGHT_BLOCK_PATTERNS:
                        if pattern.search(html):
                            result["has_copyright_block"] = True
                            result["error"] = "Copyright/Regional block screen detected"
                            return result

                    # Success if 200 and no block strings found
                    result["is_alive"] = True
                else:
                    result["error"] = f"HTTP {resp.status}"

        except asyncio.TimeoutError:
            result["error"] = f"Timeout after {DEFAULT_TIMEOUT_SEC}s"
            result["ttfb_ms"] = int((time.time() - start_time) * 1000)
        except Exception as e:
            result["error"] = str(e)
            result["ttfb_ms"] = int((time.time() - start_time) * 1000)

        return result

    async def evaluate_title(self, session: aiohttp.ClientSession, title_cfg: Dict[str, Any], dry_run: bool = False) -> Dict[str, Any]:
        """Evaluate a title's players, test fallback if necessary, and execute failover switch."""
        title_id = title_cfg["id"]
        title_name = title_cfg.get("name", f"Title #{title_id}")
        default_player = title_cfg.get("default_player", "kodik")
        players = title_cfg.get("players", {})

        logger.info("Auditing title '%s' (ID: %s, Default: %s)", title_name, title_id, default_player)

        eval_summary = {
            "title_id": title_id,
            "title_name": title_name,
            "original_player": default_player,
            "active_player": default_player,
            "failover_occurred": False,
            "player_results": {},
        }

        # Check default player first
        primary_info = players.get(default_player)
        primary_healthy = False
        primary_reason = ""

        if not primary_info:
            primary_reason = f"Config for default player '{default_player}' missing"
        else:
            p_type = primary_info.get("type", "iframe")
            p_url = primary_info["url"]
            p_ref = primary_info.get("referer")

            if p_type == "hls":
                p_res = await self.probe_hls(session, p_url, p_ref)
            elif p_type == "mp4":
                p_res = await self.probe_mp4(session, p_url, p_ref)
            else:
                p_res = await self.probe_iframe(session, p_url, p_ref)

            eval_summary["player_results"][default_player] = p_res

            if not p_res["is_alive"]:
                primary_reason = f"Stream dead ({p_res.get('error')})"
            elif p_res["ttfb_ms"] > self.threshold_ms:
                primary_reason = f"TTFB latency exceeded: {p_res['ttfb_ms']}ms > {self.threshold_ms}ms"
            else:
                primary_healthy = True

        if primary_healthy:
            logger.info("Title '%s': Primary player '%s' is HEALTHY (TTFB: %dms)", title_name, default_player, p_res["ttfb_ms"])
            return eval_summary

        logger.warning("Title '%s': Primary player '%s' FAILED: %s. Initiating fallback search...", title_name, default_player, primary_reason)

        # Search for healthy backup player
        backup_candidates = [p_name for p_name in players.keys() if p_name != default_player]
        healthy_backup = None

        for b_name in backup_candidates:
            b_info = players[b_name]
            b_type = b_info.get("type", "iframe")
            b_url = b_info["url"]
            b_ref = b_info.get("referer")

            if b_type == "hls":
                b_res = await self.probe_hls(session, b_url, b_ref)
            elif b_type == "mp4":
                b_res = await self.probe_mp4(session, b_url, b_ref)
            else:
                b_res = await self.probe_iframe(session, b_url, b_ref)

            eval_summary["player_results"][b_name] = b_res

            if b_res["is_alive"] and b_res["ttfb_ms"] <= self.threshold_ms:
                healthy_backup = b_name
                logger.info("Title '%s': Found healthy backup player '%s' (TTFB: %dms)", title_name, b_name, b_res["ttfb_ms"])
                break

        if healthy_backup:
            # Trigger DB switch and Telegram alert
            db = DatabaseManager(dry_run=dry_run)
            tg = TelegramReporter()

            switched = await db.switch_default_player(title_id, healthy_backup)
            if switched:
                eval_summary["active_player"] = healthy_backup
                eval_summary["failover_occurred"] = True
                await tg.send_failover_alert(title_id, title_name, default_player, healthy_backup, primary_reason)
        else:
            logger.error("CRITICAL: Title '%s' has NO healthy backup players available!", title_name)

        return eval_summary


async def run_checker(config_path: Optional[str] = None, single_url: Optional[str] = None,
                      single_type: str = "hls", dry_run: bool = False, threshold_ms: int = DEFAULT_LATENCY_THRESHOLD_MS):
    checker = StreamHealthChecker(threshold_ms=threshold_ms)

    conn = aiohttp.TCPConnector(limit=20, ssl=False)
    async with aiohttp.ClientSession(connector=conn) as session:
        if single_url:
            logger.info("Testing standalone stream %s (type=%s)", single_url, single_type)
            if single_type == "hls":
                res = await checker.probe_hls(session, single_url)
            elif single_type == "mp4":
                res = await checker.probe_mp4(session, single_url)
            else:
                res = await checker.probe_iframe(session, single_url)
            print(json.dumps(res, indent=2, ensure_ascii=False))
            return

        # Load configurations
        if config_path and os.path.exists(config_path):
            with open(config_path, "r", encoding="utf-8") as f:
                titles = json.load(f)
        else:
            # Demonstration titles dataset
            titles = [
                {
                    "id": "21",
                    "name": "One Piece",
                    "default_player": "kodik",
                    "players": {
                        "kodik": {
                            "type": "iframe",
                            "url": "https://kodik.info/serial/21/test",
                            "referer": "https://animelife.top",
                        },
                        "sibnet": {
                            "type": "mp4",
                            "url": "https://video.sibnet.ru/shell.php?videoid=12345",
                            "referer": "https://video.sibnet.ru",
                        },
                        "dreamcast": {
                            "type": "hls",
                            "url": "https://animelife.top/api/shiki/api/animes/21",
                            "referer": "https://animelife.top",
                        },
                    },
                }
            ]

        results = []
        for t in titles:
            r = await checker.evaluate_title(session, t, dry_run=dry_run)
            results.append(r)

        print(json.dumps(results, indent=2, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description="AnimeLife Stream & Balancer Health Checker")
    parser.add_argument("--test-stream", help="Direct URL to test single stream")
    parser.add_argument("--type", choices=["hls", "mp4", "iframe"], default="hls", help="Stream type")
    parser.add_argument("--config", help="Path to titles and streams configuration JSON")
    parser.add_argument("--threshold-ms", type=int, default=DEFAULT_LATENCY_THRESHOLD_MS, help="Max acceptable TTFB latency (default: 4000ms)")
    parser.add_argument("--dry-run", action="store_true", help="Simulate without modifying database")

    args = parser.parse_args()

    asyncio.run(
        run_checker(
            config_path=args.config,
            single_url=args.test_stream,
            single_type=args.type,
            dry_run=args.dry_run,
            threshold_ms=args.threshold_ms,
        )
    )


if __name__ == "__main__":
    main()
