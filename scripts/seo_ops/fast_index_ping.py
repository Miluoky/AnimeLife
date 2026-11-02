#!/usr/bin/env python3
"""
Fast Indexing & Recrawl Ping Utility for AnimeLife (https://animelife.top).

Supported APIs:
1. Google Indexing API v3:
   - Uses Google Service Account JSON.
   - Directly creates and signs JWT using RS256 (via cryptography or google-auth).
   - Sends 'URL_UPDATED' or 'URL_DELETED' notifications.
2. Yandex Webmaster API v4:
   - Authenticates using Yandex OAuth token.
   - Discovers user_id and host_id (https:animelife.top:443).
   - Checks daily recrawl quota and submits URLs to the re-indexing queue.
3. IndexNow API (Yandex, Bing, Seznam):
   - Submits updated URLs in batches to IndexNow endpoints.

Usage:
  python fast_index_ping.py --url https://animelife.top/anime/12345 --event publish_episode
  python fast_index_ping.py --batch-file urls.txt --event new_anime
  python fast_index_ping.py --url https://animelife.top/anime/54321 --event dmca_delete --dry-run
"""

import argparse
import base64
import json
import logging
import os
import sys
import time
from typing import Dict, List, Optional, Tuple

import requests

try:
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import padding
    from cryptography.hazmat.primitives.serialization import load_pem_private_key
    HAS_CRYPTOGRAPHY = True
except ImportError:
    HAS_CRYPTOGRAPHY = False

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("FastIndexPing")

DEFAULT_ORIGIN = "https://animelife.top"
GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token"
GOOGLE_INDEXING_SCOPE = "https://www.googleapis.com/auth/indexing"
GOOGLE_INDEXING_ENDPOINT = "https://indexing.googleapis.com/v3/urlNotifications:publish"
YANDEX_WEBMASTER_API = "https://api.webmaster.yandex.net/v4"
INDEXNOW_ENDPOINTS = [
    "https://yandex.com/indexnow",
    "https://api.indexnow.org/indexnow",
]


class GoogleIndexingClient:
    """Production client for Google Indexing API v3 with self-contained JWT signing."""

    def __init__(self, service_account_path: Optional[str] = None):
        self.service_account_path = service_account_path or os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON")
        self.credentials: Optional[Dict] = None
        self.access_token: Optional[str] = None
        self.token_expiry: float = 0.0

        if self.service_account_path and os.path.exists(self.service_account_path):
            with open(self.service_account_path, "r", encoding="utf-8") as f:
                self.credentials = json.load(f)
            logger.info("Loaded Google Service Account for client_email: %s", self.credentials.get("client_email"))
        else:
            logger.warning("Google Service Account JSON not found or not specified.")

    def _generate_jwt(self) -> str:
        """Create and sign an RS256 JWT for OAuth2 token exchange without third-party SDKs."""
        if not self.credentials:
            raise ValueError("Service account credentials not loaded.")
        if not HAS_CRYPTOGRAPHY:
            raise RuntimeError("Python 'cryptography' library is required to sign JWT.")

        now = int(time.time())
        header = {"alg": "RS256", "typ": "JWT"}
        payload = {
            "iss": self.credentials["client_email"],
            "scope": GOOGLE_INDEXING_SCOPE,
            "aud": GOOGLE_TOKEN_URI,
            "exp": now + 3600,
            "iat": now,
        }

        def b64_encode(data: bytes) -> str:
            return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")

        encoded_header = b64_encode(json.dumps(header).encode("utf-8"))
        encoded_payload = b64_encode(json.dumps(payload).encode("utf-8"))
        signing_input = f"{encoded_header}.{encoded_payload}".encode("utf-8")

        private_key = load_pem_private_key(
            self.credentials["private_key"].encode("utf-8"),
            password=None,
        )
        signature = private_key.sign(
            signing_input,
            padding.PKCS1v15(),
            hashes.SHA256(),
        )
        encoded_signature = b64_encode(signature)
        return f"{encoded_header}.{encoded_payload}.{encoded_signature}"

    def get_access_token(self) -> str:
        """Fetch or refresh OAuth2 Bearer token from Google."""
        if self.access_token and time.time() < (self.token_expiry - 60):
            return self.access_token

        jwt_assertion = self._generate_jwt()
        response = requests.post(
            GOOGLE_TOKEN_URI,
            data={
                "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                "assertion": jwt_assertion,
            },
            timeout=15,
        )
        if response.status_code != 200:
            raise RuntimeError(f"Failed to obtain Google access token: {response.status_code} {response.text}")

        token_data = response.json()
        self.access_token = token_data["access_token"]
        self.token_expiry = time.time() + token_data.get("expires_in", 3600)
        logger.info("Successfully refreshed Google OAuth2 access token.")
        return self.access_token

    def notify(self, url: str, action: str = "URL_UPDATED", dry_run: bool = False) -> Dict:
        """
        Send single URL notification to Google Indexing API.
        Action: 'URL_UPDATED' or 'URL_DELETED'
        """
        if dry_run:
            logger.info("[DRY-RUN] Google Indexing API: %s -> %s", action, url)
            return {"status": "dry-run", "url": url, "action": action}

        token = self.get_access_token()
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        body = {"url": url, "type": action}

        # Handle rate limiting with exponential backoff
        for attempt in range(1, 4):
            response = requests.post(GOOGLE_INDEXING_ENDPOINT, headers=headers, json=body, timeout=15)
            if response.status_code == 200:
                logger.info("Google Indexing API accepted %s for %s", action, url)
                return response.json()
            elif response.status_code in (429, 500, 503):
                wait = attempt * 2
                logger.warning("Google API rate limited (HTTP %d). Retry %d/3 in %ds...", response.status_code, attempt, wait)
                time.sleep(wait)
            else:
                logger.error("Google Indexing API error %d: %s", response.status_code, response.text)
                return {"error": response.text, "status_code": response.status_code}

        return {"error": "Exceeded retry attempts", "status_code": 429}


class YandexWebmasterClient:
    """Production client for Yandex Webmaster API v4 recrawl queue."""

    def __init__(self, oauth_token: Optional[str] = None, host_url: str = DEFAULT_ORIGIN):
        self.oauth_token = oauth_token or os.getenv("YANDEX_WEBMASTER_TOKEN")
        self.host_url = host_url
        self.user_id: Optional[int] = None
        self.host_id: Optional[str] = None
        self.headers = {
            "Authorization": f"OAuth {self.oauth_token}",
            "Content-Type": "application/json",
        } if self.oauth_token else {}

    def is_configured(self) -> bool:
        return bool(self.oauth_token)

    def _initialize_host(self):
        """Fetch user_id and determine host_id for site."""
        if self.user_id and self.host_id:
            return

        if not self.oauth_token:
            raise ValueError("Yandex OAuth token not provided.")

        # 1. Get user_id
        res_user = requests.get(f"{YANDEX_WEBMASTER_API}/user/", headers=self.headers, timeout=15)
        if res_user.status_code != 200:
            raise RuntimeError(f"Yandex Webmaster user query failed: {res_user.status_code} {res_user.text}")
        self.user_id = res_user.json()["user_id"]

        # 2. Get hosts list
        res_hosts = requests.get(f"{YANDEX_WEBMASTER_API}/user/{self.user_id}/hosts/", headers=self.headers, timeout=15)
        if res_hosts.status_code != 200:
            raise RuntimeError(f"Yandex Webmaster hosts query failed: {res_hosts.status_code} {res_hosts.text}")

        hosts = res_hosts.json().get("hosts", [])
        # Find matching host (e.g., https:animelife.top:443)
        target_domain = self.host_url.replace("https://", "").replace("http://", "").strip("/")
        for h in hosts:
            if target_domain in h.get("ascii_host_url", "") or target_domain in h.get("unicode_host_url", ""):
                self.host_id = h["host_id"]
                break

        if not self.host_id and hosts:
            self.host_id = hosts[0]["host_id"]
            logger.warning("Exact host matching '%s' not found. Defaulting to first host: %s", target_domain, self.host_id)
        elif not self.host_id:
            raise RuntimeError(f"No hosts found in Yandex Webmaster for user {self.user_id}")

        logger.info("Yandex Webmaster initialized: user_id=%s, host_id=%s", self.user_id, self.host_id)

    def get_quota(self) -> Dict:
        """Retrieve daily re-crawl quota and remaining allowances."""
        self._initialize_host()
        url = f"{YANDEX_WEBMASTER_API}/user/{self.user_id}/hosts/{self.host_id}/recrawl/quota"
        res = requests.get(url, headers=self.headers, timeout=15)
        if res.status_code == 200:
            quota = res.json()
            logger.info("Yandex recrawl quota: daily_quota=%s, quota_remainder=%s", quota.get("daily_quota"), quota.get("quota_remainder"))
            return quota
        logger.error("Failed to fetch Yandex recrawl quota: %d %s", res.status_code, res.text)
        return {}

    def recrawl(self, url: str, dry_run: bool = False) -> Dict:
        """Submit URL to Yandex re-crawl queue."""
        if dry_run:
            logger.info("[DRY-RUN] Yandex Webmaster recrawl queue: %s", url)
            return {"status": "dry-run", "url": url}

        self._initialize_host()
        endpoint = f"{YANDEX_WEBMASTER_API}/user/{self.user_id}/hosts/{self.host_id}/recrawl/queue"
        body = {"url": url}

        res = requests.post(endpoint, headers=self.headers, json=body, timeout=15)
        if res.status_code == 202:
            data = res.json()
            logger.info("Yandex Webmaster queued URL %s (task_id=%s, quota_remainder=%s)", url, data.get("task_id"), data.get("quota_remainder"))
            return data
        elif res.status_code == 429:
            logger.warning("Yandex Webmaster recrawl quota exceeded (HTTP 429) for %s", url)
            return {"error": "quota_exceeded", "status_code": 429}
        else:
            logger.error("Yandex Webmaster recrawl error %d: %s", res.status_code, res.text)
            return {"error": res.text, "status_code": res.status_code}


class IndexNowClient:
    """Production client for IndexNow protocol."""

    def __init__(self, origin: str = DEFAULT_ORIGIN, key: Optional[str] = None):
        self.origin = origin
        self.host = origin.replace("https://", "").replace("http://", "").strip("/")
        self.key = key or os.getenv("INDEXNOW_KEY")

        # Fallback: discover public/<key>.txt if running inside repository
        if not self.key:
            public_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "public")
            if os.path.exists(public_dir):
                for f in os.listdir(public_dir):
                    if len(f) == 36 and f.endswith(".txt"):  # 32 hex chars + .txt = 36
                        self.key = f[:-4]
                        break

    def submit(self, url_list: List[str], dry_run: bool = False) -> Dict[str, int]:
        """Submit URLs to IndexNow endpoints."""
        if not self.key:
            logger.warning("IndexNow key not configured; skipping IndexNow submission.")
            return {}

        if dry_run:
            logger.info("[DRY-RUN] IndexNow submitting %d URLs with key %s", len(url_list), self.key)
            return {"dry-run": 200}

        payload = {
            "host": self.host,
            "key": self.key,
            "keyLocation": f"{self.origin}/{self.key}.txt",
            "urlList": url_list,
        }

        results = {}
        for endpoint in INDEXNOW_ENDPOINTS:
            try:
                res = requests.post(endpoint, json=payload, headers={"Content-Type": "application/json; charset=utf-8"}, timeout=15)
                results[endpoint] = res.status_code
                if res.status_code in (200, 202):
                    logger.info("IndexNow endpoint %s accepted %d URLs (HTTP %d)", endpoint, len(url_list), res.status_code)
                else:
                    logger.warning("IndexNow endpoint %s responded HTTP %d: %s", endpoint, res.status_code, res.text)
            except Exception as e:
                logger.error("IndexNow endpoint %s connection failure: %s", endpoint, str(e))
                results[endpoint] = 0

        return results


def run_pipeline(urls: List[str], event: str, dry_run: bool = False) -> Dict[str, Any]:
    """Execute ping sequence across Google Indexing, Yandex Webmaster, and IndexNow."""
    logger.info("Starting fast indexing pipeline for %d URLs (Event: %s, DryRun: %s)", len(urls), event, dry_run)

    google_action = "URL_DELETED" if event == "dmca_delete" else "URL_UPDATED"
    google_client = GoogleIndexingClient()
    yandex_client = YandexWebmasterClient()
    indexnow_client = IndexNowClient()

    summary = {
        "event": event,
        "total_urls": len(urls),
        "google_results": [],
        "yandex_results": [],
        "indexnow_results": {},
    }

    # 1. Google Indexing API
    if google_client.credentials or dry_run:
        logger.info("--- Submitting to Google Indexing API ---")
        for u in urls:
            try:
                res = google_client.notify(u, action=google_action, dry_run=dry_run)
                summary["google_results"].append({"url": u, "result": res})
            except Exception as e:
                logger.error("Google notification error for %s: %s", u, str(e))
                summary["google_results"].append({"url": u, "error": str(e)})
            time.sleep(0.1)  # small throttle

    # 2. Yandex Webmaster Re-crawl
    if (yandex_client.is_configured() or dry_run) and event != "dmca_delete":
        logger.info("--- Submitting to Yandex Webmaster Recrawl Queue ---")
        try:
            if not dry_run:
                yandex_client.get_quota()
            for u in urls:
                res = yandex_client.recrawl(u, dry_run=dry_run)
                summary["yandex_results"].append({"url": u, "result": res})
                time.sleep(0.2)
        except Exception as e:
            logger.error("Yandex Webmaster execution error: %s", str(e))

    # 3. IndexNow Protocol
    if event != "dmca_delete":
        logger.info("--- Submitting to IndexNow Protocol ---")
        summary["indexnow_results"] = indexnow_client.submit(urls, dry_run=dry_run)

    logger.info("Fast indexing pipeline finished successfully.")
    return summary


def main():
    parser = argparse.ArgumentParser(description="AnimeLife Fast Search Engine Indexing & Recrawl Ping Utility")
    parser.add_argument("--url", help="Target URL to ping")
    parser.add_argument("--batch-file", help="Path to text file with one URL per line")
    parser.add_argument(
        "--event",
        choices=["publish_episode", "new_anime", "content_update", "dmca_delete"],
        default="publish_episode",
        help="Event type triggering the notification",
    )
    parser.add_argument("--dry-run", action="store_true", help="Simulate without making actual external API calls")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose debug logging")

    args = parser.parse_args()

    if args.verbose:
        logger.setLevel(logging.DEBUG)

    urls = []
    if args.url:
        urls.append(args.url.strip())
    if args.batch_file:
        if not os.path.exists(args.batch_file):
            logger.error("Batch file %s does not exist.", args.batch_file)
            sys.exit(1)
        with open(args.batch_file, "r", encoding="utf-8") as f:
            for line in f:
                l = line.strip()
                if l and not l.startswith("#"):
                    urls.append(l)

    if not urls:
        logger.error("No target URLs specified. Provide --url or --batch-file.")
        parser.print_help()
        sys.exit(1)

    # Remove duplicates preserving order
    unique_urls = list(dict.fromkeys(urls))
    results = run_pipeline(unique_urls, event=args.event, dry_run=args.dry_run)
    print(json.dumps(results, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
