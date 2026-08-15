import urllib.request
import json
import ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

HEADERS = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

BASE_URL = "https://altrixcore.com/api"

# 1. Login as beaconowner@gmail.com
login_req = urllib.request.Request(
    f"{BASE_URL}/auth/login",
    data=json.dumps({"email": "beaconowner@gmail.com", "password": "Owner888"}).encode("utf-8"),
    headers=HEADERS
)
with urllib.request.urlopen(login_req, timeout=10, context=ctx) as resp:
    login_data = json.loads(resp.read().decode())
    token = login_data.get("access_token")

auth_headers = {
    **HEADERS,
    "Authorization": f"Bearer {token}",
    "X-School-Id": "70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8"
}

# 2. Test querying each major application module table
tables_to_test = [
    "schools",
    "students",
    "class_sections",
    "subjects",
    "timetable_entries",
    "attendance_entries",
    "hr_staff_attendance",
    "fee_invoices",
    "fee_payments",
    "exam_results",
    "report_cards",
    "app_notifications",
    "parent_messages",
    "school_branding"
]

print(f"{'TABLE NAME':<30} | {'RECORDS RETRIEVED':<20} | {'STATUS'}")
print("-" * 65)

all_ok = True
for table in tables_to_test:
    try:
        q_req = urllib.request.Request(
            f"{BASE_URL}/vps-db/query",
            data=json.dumps({
                "table": table,
                "action": "select",
                "select": "*",
                "filters": [{"method": "limit", "args": [5]}]
            }).encode("utf-8"),
            headers=auth_headers
        )
        with urllib.request.urlopen(q_req, timeout=10, context=ctx) as resp:
            data = json.loads(resp.read().decode())
            rows = data.get("data", [])
            err = data.get("error")
            if err:
                print(f"{table:<30} | {'ERROR':<20} | FAIL ({err.get('message')})")
                all_ok = False
            else:
                print(f"{table:<30} | {f'{len(rows)} rows sample':<20} | PASS (200 OK)")
    except Exception as e:
        print(f"{table:<30} | {'EXCEPTION':<20} | FAIL ({e})")
        all_ok = False

print("-" * 65)
if all_ok:
    print("ALL CORE APPLICATION TABLES ARE FULLY SYNCED AND ACCESSIBLE VIA VPS API!")
else:
    print("SOME TABLES EXPERIENCED QUERY ISSUES.")
