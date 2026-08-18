"""Quick check of what /netplus-pwa returns for a guest (no cookies)."""
import requests

BASE = "http://172.20.0.8:8080"

# Completely fresh session — no cookies = Guest
gs = requests.Session()
r = gs.get(f"{BASE}/netplus-pwa", allow_redirects=False, timeout=10)
print(f"Status: {r.status_code}")
print(f"Location: {r.headers.get('Location', 'NONE')}")
print(f"Body snippet: {r.text[:500]}")
