"""Quick admin login test."""
import requests

BASE = "http://172.20.0.8:8080"

for pwd in ["NetplusAdmin2024", "Netplus123!", "admin"]:
    s = requests.Session()
    r = s.post(f"{BASE}/api/method/login",
               json={"usr": "Administrator", "pwd": pwd},
               allow_redirects=False)
    print(f"pwd={pwd!r} -> {r.status_code} sid={'yes' if 'sid' in s.cookies else 'NO'}")
    if r.status_code == 200:
        print("  SUCCESS with", pwd)
        break
