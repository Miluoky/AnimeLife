import sys
import os
from datetime import datetime, timedelta
import requests

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from manage_gsc import get_auth_session

session = get_auth_session()
site_url = 'sc-domain:animelife.top'
encoded = requests.utils.quote(site_url, safe='')
url = f'https://www.googleapis.com/webmasters/v3/sites/{encoded}/searchAnalytics/query'

end_date = (datetime.now() - timedelta(days=2)).strftime('%Y-%m-%d')
start_date = (datetime.now() - timedelta(days=28)).strftime('%Y-%m-%d')

payload = {
    'startDate': start_date,
    'endDate': end_date,
    'dimensions': ['page'],
    'rowLimit': 20
}
r = session.post(url, json=payload)
print("=== ТОП СТРАНИЦ ПО ВЫДАЧЕ GOOGLE (за 28 дней) ===")
for row in r.json().get('rows', []):
    page = row['keys'][0]
    clicks = row['clicks']
    impressions = row['impressions']
    pos = row['position']
    print(f"{page:<55} | Клики: {clicks:<3} | Показы: {impressions:<4} | Поз: {pos:.1f}")
