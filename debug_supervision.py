import requests, re

s = requests.Session()
s.post('http://localhost:8080/api/method/login', data={'usr': 'supervisor1@netplus.ca', 'pwd': 'Netplus123!'})

# Get the page and extract the real CSRF token
r = s.get('http://localhost:8080/netplus-supervision')
m = re.search(r'csrf:\s*"([a-f0-9]+)"', r.text)
csrf = m.group(1) if m else ""
print(f"CSRF token: {csrf[:20]}...")

# Now call bootstrap WITH the CSRF token (as the JS does)
resp = s.post(
    'http://localhost:8080/api/method/netplus.api.supervisor_api.bootstrap',
    headers={'Content-Type': 'application/json', 'X-Frappe-CSRF-Token': csrf}
)
print(f"Bootstrap status: {resp.status_code}")
if resp.status_code != 200:
    print(resp.text[:500])
else:
    import json
    data = resp.json()
    print("Profile:", data.get('message', {}).get('profile'))
    print("KPIs:", data.get('message', {}).get('kpis'))
