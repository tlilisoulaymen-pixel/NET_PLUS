import requests

BASE = "http://localhost:8080"

def test_login_and_page(user, pwd, target_url):
    s = requests.Session()
    # 1. Login
    login_resp = s.post(f"{BASE}/api/method/login", data={"usr": user, "pwd": pwd})
    print(f"Login {user} status:", login_resp.status_code)
    
    # 2. Get target page
    page_resp = s.get(f"{BASE}{target_url}")
    print(f"GET {target_url} status:", page_resp.status_code, "Length:", len(page_resp.text))
    assert page_resp.status_code == 200, f"Failed with status {page_resp.status_code}"
    print(f"[OK] {user} -> {target_url} is 200 OK!")


def main():
    print("--- Testing Operator ---")
    test_login_and_page("operator1@netplus.ca", "admin", "/netplus-pwa")
    
    print("--- Testing Supervisor ---")
    test_login_and_page("supervisor1@netplus.ca", "admin", "/netplus-supervision")
    
    print("--- Testing Client ---")
    test_login_and_page("jdupont@gestionimmo.ca", "admin", "/netplus-client")
    
    print("--- Testing Administrator on Operator PWA ---")
    test_login_and_page("Administrator", "admin", "/netplus-pwa")
    
    print("\n>>> ALL 4 PORTALS LOADED WITH STATUS 200 OK! <<<")

if __name__ == "__main__":
    main()
