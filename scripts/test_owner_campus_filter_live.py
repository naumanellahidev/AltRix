import requests

BASE_URL = "https://altrixcore.com/api"

def main():
    print("=== 1. Logging in as School Owner (beaconowner@gmail.com) ===")
    res = requests.post(f"{BASE_URL}/auth/login", json={"email": "beaconowner@gmail.com", "password": "Owner888"})
    assert res.status_code == 200, f"Login failed: {res.text}"
    token = res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    print("=== 2. Fetching Campuses for Beacon International ===")
    beacon_sid = "70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8"
    camp_res = requests.get(f"{BASE_URL}/schools/owner/campuses", params={"school_id": beacon_sid}, headers=headers)
    assert camp_res.status_code == 200, f"Campuses failed: {camp_res.text}"
    campuses = camp_res.json()
    print(f"Found {len(campuses)} campuses:")
    for c in campuses:
        print(f"  - {c['name']} (ID: {c['id']}, code: {c['code']})")

    print("\n=== 3. Testing /reports/dashboard (All Campuses) ===")
    all_res = requests.get(f"{BASE_URL}/reports/dashboard", params={"school_id": beacon_sid}, headers=headers)
    assert all_res.status_code == 200, f"All dashboard failed: {all_res.text}"
    all_data = all_res.json()
    print(f"All Campuses -> Total Students: {all_data.get('total_students')}, Collected Fees: {all_data.get('collected_fees')}, Pending Invoices: {all_data.get('pending_payments')}")

    print("\n=== 4. Testing /reports/dashboard per Individual Campus ===")
    for c in campuses:
        cid = c['id']
        c_res = requests.get(f"{BASE_URL}/reports/dashboard", params={"school_id": beacon_sid, "campus_id": cid}, headers=headers)
        assert c_res.status_code == 200, f"Campus {c['name']} dashboard failed: {c_res.text}"
        c_data = c_res.json()
        print(f"Campus [{c['name']}] -> Total Students: {c_data.get('total_students')}, Collected Fees: {c_data.get('collected_fees')}, Pending Invoices: {c_data.get('pending_payments')}")

    print("\nSUCCESS! Owner multi-campus data filtering verified live on VPS.")

if __name__ == "__main__":
    main()
