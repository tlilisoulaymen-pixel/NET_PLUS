import requests

session = requests.Session()
BASE_URL = "http://localhost:8080"

def test_endpoint(url_path, expected_status, expected_text_in_response=""):
    resp = session.get(BASE_URL + url_path, allow_redirects=False)
    print(f"GET {url_path} -> Status {resp.status_code}")
    if resp.status_code in [301, 302, 303, 307, 308]:
        print(f"  Redirects to: {resp.headers.get('Location')}")
    elif expected_text_in_response and expected_text_in_response not in resp.text:
        print(f"  Warning: Expected text '{expected_text_in_response}' not found in response body.")

def login(user, pwd):
    resp = session.post(BASE_URL + "/api/method/login", data={"usr": user, "pwd": pwd})
    if resp.status_code == 200:
        print(f"Logged in as {user}")
    else:
        print(f"Failed to log in as {user} - Status {resp.status_code}")

print("--- Testing as Guest ---")
test_endpoint("/netplus-pwa", 302)

print("\n--- Testing as Operator ---")
login("operator1@netplus.ca", "Netplus123!")
test_endpoint("/netplus-pwa", 200, "netplus-operator")
test_endpoint("/api/method/netplus.api.operator_api.bootstrap", 200)

session.get(BASE_URL + "/?cmd=web_logout")

print("\n--- Testing as Supervisor ---")
login("supervisor1@netplus.ca", "Netplus123!")
test_endpoint("/netplus-pwa", 302)

session.get(BASE_URL + "/?cmd=web_logout")
