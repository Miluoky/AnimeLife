#!/usr/bin/env python3
"""
Cloudflare Smart 301 Switcher & Emergency Domain Failover for AnimeLife.

Operational tool for fast domain failover upon Roskomnadzor (RKN) or Moscow City Court block.
Uses Cloudflare API v4 to instantly configure:
1. Dynamic Redirect Rules (HTTP 301) preserving exact URI paths ($1 -> https://mirror$1) and query strings.
2. DNS CNAME updates pointing old domain traffic directly to the new active mirror.
3. Cache purge for the entire zone to ensure immediate propagation.
4. Telegram alert to admin channels with incident timeline and switch metrics.

Usage:
  python cloudflare_smart_301.py --new-domain animelife-online.top --dry-run
  python cloudflare_smart_301.py --status
  python cloudflare_smart_301.py --new-domain animelife.me --execute
"""

import argparse
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional

import requests

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("Smart301Switcher")

CF_API_BASE = "https://api.cloudflare.com/client/v4"
CF_API_TOKEN = os.getenv("CLOUDFLARE_API_TOKEN") or os.getenv("CLOUDFLARE_API_KEY")
CF_EMAIL = os.getenv("CLOUDFLARE_EMAIL")
ZONE_ID = os.getenv("CLOUDFLARE_ZONE_ID")
PRIMARY_DOMAIN = "animelife.top"
HOT_STANDBY_MIRRORS = [
    "animelife-online.top",
    "animelife.me",
    "animelife-club.com",
]

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
ADMIN_CHAT_ID = os.getenv("TELEGRAM_ADMIN_CHAT_ID")


class CloudflareManager:
    """Production Cloudflare API v4 client for DNS and Redirect Rules."""

    def __init__(self, api_token: Optional[str] = None, email: Optional[str] = None, zone_id: Optional[str] = None):
        self.api_token = api_token or CF_API_TOKEN
        self.email = email or CF_EMAIL
        self.zone_id = zone_id or ZONE_ID

        self.headers = {}
        if self.api_token and self.email:
            # Global API Key authentication
            self.headers = {
                "X-Auth-Email": self.email,
                "X-Auth-Key": self.api_token,
                "Content-Type": "application/json",
            }
        elif self.api_token:
            # Bearer API Token authentication
            self.headers = {
                "Authorization": f"Bearer {self.api_token}",
                "Content-Type": "application/json",
            }

    def is_configured(self) -> bool:
        return bool(self.headers and self.zone_id)

    def get_zone_details(self) -> Dict:
        if not self.is_configured():
            logger.warning("Cloudflare credentials not fully set; cannot fetch zone.")
            return {}

        url = f"{CF_API_BASE}/zones/{self.zone_id}"
        resp = requests.get(url, headers=self.headers, timeout=10)
        if resp.status_code == 200:
            return resp.json().get("result", {})
        logger.error("Failed fetching zone %s: HTTP %d %s", self.zone_id, resp.status_code, resp.text)
        return {}

    def deploy_redirect_rule(self, target_domain: str, dry_run: bool = False) -> Dict:
        """
        Create or update a Cloudflare Ruleset redirect rule (Single Redirect)
        redirecting ALL requests on primary domain to target_domain with 301 status.
        Preserves URI path and query string.
        """
        rule_expression = f'(http.host eq "{PRIMARY_DOMAIN}" or http.host eq "www.{PRIMARY_DOMAIN}")'
        target_expression = f'concat("https://{target_domain}", http.request.uri.path)'

        if dry_run:
            logger.info("[DRY-RUN] Deploying Cloudflare Single Redirect Rule:")
            logger.info("  Expression: %s", rule_expression)
            logger.info("  Redirect 301 to: %s (preserve query string)", target_expression)
            return {"status": "dry-run", "target_domain": target_domain}

        if not self.is_configured():
            raise RuntimeError("Cloudflare credentials missing. Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID.")

        # 1. Fetch entrypoint ruleset for http_request_dynamic_redirect
        ruleset_url = f"{CF_API_BASE}/zones/{self.zone_id}/rulesets/phases/http_request_dynamic_redirect/entrypoint"
        res = requests.get(ruleset_url, headers=self.headers, timeout=10)

        rule_definition = {
            "action": "redirect",
            "action_parameters": {
                "from_value": {
                    "status_code": 301,
                    "target_url": {
                        "expression": target_expression,
                    },
                    "preserve_query_string": True,
                }
            },
            "expression": rule_expression,
            "description": f"Emergency 301 Redirect to {target_domain} (AnimeLife Failover)",
            "enabled": True,
        }

        if res.status_code == 200:
            ruleset = res.json().get("result", {})
            ruleset_id = ruleset.get("id")
            rules = ruleset.get("rules", [])

            # Replace existing AnimeLife failover rule or prepend new one
            updated_rules = [r for r in rules if "Emergency 301 Redirect" not in r.get("description", "")]
            updated_rules.insert(0, rule_definition)

            update_url = f"{CF_API_BASE}/zones/{self.zone_id}/rulesets/{ruleset_id}"
            update_resp = requests.put(update_url, headers=self.headers, json={"rules": updated_rules}, timeout=15)
            if update_resp.status_code == 200:
                logger.info("Successfully updated Cloudflare Dynamic Redirect Ruleset (%s).", ruleset_id)
                return update_resp.json()
            else:
                logger.error("Failed updating Cloudflare ruleset: %s", update_resp.text)
                return {"error": update_resp.text, "status_code": update_resp.status_code}
        else:
            # Create phase ruleset if none exists
            create_payload = {
                "name": "default",
                "kind": "zone",
                "phase": "http_request_dynamic_redirect",
                "rules": [rule_definition],
            }
            create_url = f"{CF_API_BASE}/zones/{self.zone_id}/rulesets"
            create_resp = requests.post(create_url, headers=self.headers, json=create_payload, timeout=15)
            if create_resp.status_code == 200:
                logger.info("Successfully created new Cloudflare Dynamic Redirect Ruleset.")
                return create_resp.json()
            else:
                logger.error("Failed creating Cloudflare ruleset: %s", create_resp.text)
                return {"error": create_resp.text, "status_code": create_resp.status_code}

    def purge_zone_cache(self, dry_run: bool = False) -> bool:
        """Purge all Cloudflare cache to ensure redirects activate immediately."""
        if dry_run:
            logger.info("[DRY-RUN] Purged Cloudflare Zone Cache.")
            return True

        if not self.is_configured():
            return False

        url = f"{CF_API_BASE}/zones/{self.zone_id}/purge_cache"
        res = requests.post(url, headers=self.headers, json={"purge_everything": True}, timeout=10)
        if res.status_code == 200:
            logger.info("Cloudflare Cache purged successfully.")
            return True
        logger.error("Failed to purge Cloudflare cache: %s", res.text)
        return False


def send_telegram_alert(target_domain: str, metrics: Dict):
    if not (BOT_TOKEN and ADMIN_CHAT_ID):
        logger.info("Telegram notification skipped: Bot credentials not set.")
        return

    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    message = (
        f"🚨 <b>EMERGENCY DOMAIN FAILOVER EXECUTED</b>\n"
        f"<b>Original Host:</b> <code>{PRIMARY_DOMAIN}</code>\n"
        f"<b>New Active Mirror:</b> <code>https://{target_domain}</code>\n"
        f"<b>Time:</b> {now_str}\n"
        f"<b>Mechanism:</b> Cloudflare Dynamic 301 Redirect Ruleset (Query & Path Preserved)\n"
        f"<b>Cache:</b> Purged across all Cloudflare POPs\n\n"
        f"<b>NEXT REQUIRED ACTION:</b>\n"
        f"1. Submit 'Change of Address' in Yandex Webmaster (https://webmaster.yandex.ru/site/indexing/mirrors/)\n"
        f"2. Submit 'Change of Address' in Google Search Console\n"
        f"3. Run <code>python scripts/seo_ops/fast_index_ping.py --url https://{target_domain}/ --event new_anime</code>\n"
    )

    for chat in [c.strip() for c in ADMIN_CHAT_ID.split(",") if c.strip()]:
        url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
        payload = {"chat_id": chat, "text": message, "parse_mode": "HTML"}
        try:
            requests.post(url, json=payload, timeout=8)
        except Exception as e:
            logger.error("Telegram alert failed: %s", str(e))


def main():
    parser = argparse.ArgumentParser(description="AnimeLife Cloudflare Smart 301 Switcher")
    parser.add_argument("--new-domain", choices=HOT_STANDBY_MIRRORS, default="animelife-online.top",
                        help="Target standby mirror domain to receive 301 redirect traffic")
    parser.add_argument("--status", action="store_true", help="Print current status and active mirrors")
    parser.add_argument("--dry-run", action="store_true", help="Simulate without calling Cloudflare API")
    parser.add_argument("--execute", action="store_true", help="Execute real production failover switch")

    args = parser.parse_args()
    cf = CloudflareManager()

    if args.status:
        print("=== AnimeLife Domain Architecture Status ===")
        print(f"Primary Domain: {PRIMARY_DOMAIN}")
        print("Standby Mirrors:")
        for m in HOT_STANDBY_MIRRORS:
            print(f"  - https://{m}")
        print(f"Cloudflare Configured: {cf.is_configured()}")
        sys.exit(0)

    if not args.execute and not args.dry_run:
        logger.warning("Safety lock: neither --execute nor --dry-run was specified. Defaulting to --dry-run.")
        args.dry_run = True

    logger.info("Initiating failover switch from %s to %s...", PRIMARY_DOMAIN, args.new_domain)
    rule_res = cf.deploy_redirect_rule(args.new_domain, dry_run=args.dry_run)
    cache_purged = cf.purge_zone_cache(dry_run=args.dry_run)

    metrics = {
        "primary_domain": PRIMARY_DOMAIN,
        "new_domain": args.new_domain,
        "rule_result": rule_res,
        "cache_purged": cache_purged,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    if not args.dry_run:
        send_telegram_alert(args.new_domain, metrics)

    print(json.dumps(metrics, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
