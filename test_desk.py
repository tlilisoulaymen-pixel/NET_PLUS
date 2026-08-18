"""
Test /desk and /app for Administrator.
"""
import urllib.request
import urllib.parse
import http.cookiejar
import json


def test_admin_desk():
    base_url = "http://localhost:8080"
    cj = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

    # 1. Login as Administrator
    login_data = urllib.parse.urlencode({"usr": "Administrator", "pwd": "Netplus123!"}).encode("utf-8")
    req = urllib.request.Request(f"{base_url}/api/method/login", data=login_data, headers={
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json"
    })
    resp = opener.open(req)
    print("Login:", resp.read().decode("utf-8"))

    # 2. Check GET /app
    try:
        req = urllib.request.Request(f"{base_url}/app", headers={"User-Agent": "Mozilla/5.0"})
        resp = opener.open(req)
        print(f"GET /app -> final url: {resp.url}, status: {resp.status}, length: {len(resp.read())}")
    except Exception as e:
        print(f"GET /app error: {e}")

    # 3. Check GET /desk
    try:
        req = urllib.request.Request(f"{base_url}/desk", headers={"User-Agent": "Mozilla/5.0"})
        resp = opener.open(req)
        print(f"GET /desk -> final url: {resp.url}, status: {resp.status}, length: {len(resp.read())}")
    except Exception as e:
        print(f"GET /desk error: {e}")

    # 4. Check GET /desk/service-contract
    try:
        req = urllib.request.Request(f"{base_url}/desk/service-contract", headers={"User-Agent": "Mozilla/5.0"})
        resp = opener.open(req)
        print(f"GET /desk/service-contract -> final url: {resp.url}, status: {resp.status}, length: {len(resp.read())}")
    except Exception as e:
        print(f"GET /desk/service-contract error: {e}")


if __name__ == "__main__":
    test_admin_desk()
