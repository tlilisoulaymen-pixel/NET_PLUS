import requests

BASE_URL = "http://localhost:8080"
session = requests.Session()

def test_endpoint(url_path, expected_status, expected_text_in_response=""):
    resp = session.get(BASE_URL + url_path, allow_redirects=False)
    print(f"GET {url_path} -> Status {resp.status_code}")
    if resp.status_code in (301, 302, 303, 307, 308):
        print(f"  Redirects to: {resp.headers.get('Location')}")
    if expected_text_in_response and expected_text_in_response not in resp.text:
        print(f"  Warning: Expected text '{expected_text_in_response}' not found in response body.")

def test_post_endpoint(url_path):
    resp = session.post(BASE_URL + url_path)
    print(f"POST {url_path} -> Status {resp.status_code}")
    if resp.status_code != 200:
        print(resp.text)

print("--- Testing as Guest ---")
test_endpoint("/netplus-supervision", 301)

print("\n--- Testing as Operator ---")
session.post(BASE_URL + "/api/method/login", data={"usr": "operator1@netplus.ca", "pwd": "Netplus123!"})
print("Logged in as operator1@netplus.ca")
test_endpoint("/netplus-supervision", 403)
test_post_endpoint("/api/method/netplus.api.supervisor_api.bootstrap")

print("\n--- Testing as Supervisor ---")
session = requests.Session()
session.post(BASE_URL + "/api/method/login", data={"usr": "supervisor1@netplus.ca", "pwd": "Netplus123!"})
print("Logged in as supervisor1@netplus.ca")
test_endpoint("/netplus-supervision", 200)
test_post_endpoint("/api/method/netplus.api.supervisor_api.bootstrap")
