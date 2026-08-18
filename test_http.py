"""
Test actual HTTP login and page fetches as real browser client.
"""
import urllib.request
import urllib.parse
import http.cookiejar
import json
import sys


def test_http():
    base_url = "http://localhost:8080"

    users = [
        ("Administrator", "admin"),
        ("supervisor1@netplus.ca", "admin"),
        ("jdupont@gestionimmo.ca", "admin"),
        ("operator1@netplus.ca", "admin"),
    ]

    for username, password in users:
        print(f"\n==========================================")
        print(f"Testing HTTP login for: {username}")
        print(f"==========================================")

        cj = http.cookiejar.CookieJar()
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

        # 1. Login
        login_data = urllib.parse.urlencode({"usr": username, "pwd": password}).encode("utf-8")
        try:
            req = urllib.request.Request(f"{base_url}/api/method/login", data=login_data, headers={
                "User-Agent": "Mozilla/5.0",
                "Accept": "application/json"
            })
            resp = opener.open(req)
            login_json = json.loads(resp.read().decode("utf-8"))
            print(f"  Login response: {login_json.get('message', 'Logged In')}")
        except Exception as e:
            print(f"  [FAIL] Login failed: {e}")
            continue

        # 2. Test GET /portal
        try:
            req = urllib.request.Request(f"{base_url}/portal", headers={"User-Agent": "Mozilla/5.0"})
            resp = opener.open(req)
            content = resp.read().decode("utf-8", errors="ignore")
            print(f"  GET /portal -> HTTP {resp.status}, length: {len(content)} bytes")
            if "Server Error" in content or "500" in content[:200]:
                print(f"  [ERROR] Content preview: {content[:300]}")
            else:
                print(f"  [OK] /portal rendered cleanly")
        except urllib.error.HTTPError as e:
            print(f"  [HTTP ERROR] GET /portal: {e.code} {e.reason}")
            err_body = e.read().decode("utf-8", errors="ignore")
            print(f"  Error details: {err_body[:300]}")
        except Exception as e:
            print(f"  [ERROR] GET /portal error: {e}")

        # 3. Test GET /netplus-pwa
        try:
            req = urllib.request.Request(f"{base_url}/netplus-pwa", headers={"User-Agent": "Mozilla/5.0"})
            resp = opener.open(req)
            content = resp.read().decode("utf-8", errors="ignore")
            print(f"  GET /netplus-pwa -> HTTP {resp.status}, length: {len(content)} bytes")
        except urllib.error.HTTPError as e:
            print(f"  [HTTP ERROR] GET /netplus-pwa: {e.code} {e.reason}")
        except Exception as e:
            print(f"  [ERROR] GET /netplus-pwa: {e}")

    print("\n==========================================")
    print("All HTTP tests completed!")
    print("==========================================")


if __name__ == "__main__":
    test_http()
