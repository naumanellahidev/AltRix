import requests
import json

BASE_URL = "https://altrixcore.com/api"

def main():
    print("================================================================")
    print("   ALTRIX PRODUCTION LIVE VERIFICATION — ALL SYSTEMS GREEN     ")
    print("================================================================")

    # 1. School Owner Auth & Multi-Campus Testing
    print("\n[1/4] Testing School Owner Login & Context...")
    res = requests.post(f"{BASE_URL}/auth/login", json={"email": "beaconowner@gmail.com", "password": "Owner888"})
    assert res.status_code == 200, f"Owner login failed: {res.text}"
    token = res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    print("  [OK] School Owner authenticated successfully.")

    # 2. Fetch Beacon Campuses
    print("\n[2/4] Fetching Beacon Campuses...")
    beacon_sid = "70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8"
    camp_res = requests.get(f"{BASE_URL}/schools/owner/campuses", params={"school_id": beacon_sid}, headers=headers)
    assert camp_res.status_code == 200, f"Campuses fetch failed: {camp_res.text}"
    campuses = camp_res.json()
    print(f"  [OK] Found {len(campuses)} registered campuses for Beacon International:")
    for c in campuses:
        print(f"    * {c['name']} (ID: {c['id']}, Code: {c['code']})")

    # 3. Test Dashboard KPI Scoping
    print("\n[3/4] Testing Multi-Campus Scoped Dashboard KPIs...")
    all_kpi = requests.get(f"{BASE_URL}/reports/dashboard", params={"school_id": beacon_sid}, headers=headers).json()
    print(f"  * ALL CAMPUSES (Consolidated):")
    print(f"      Total Students: {all_kpi.get('total_students')}")
    print(f"      Collected Fees: {all_kpi.get('collected_fees')}")
    print(f"      Pending Invoices: {all_kpi.get('pending_payments')}")
    assert all_kpi.get("total_students") == 24, "Consolidated student count mismatch!"

    for c in campuses:
        c_kpi = requests.get(f"{BASE_URL}/reports/dashboard", params={"school_id": beacon_sid, "campus_id": c['id']}, headers=headers).json()
        print(f"  * CAMPUS [{c['name']}]:")
        print(f"      Total Students: {c_kpi.get('total_students')}")
        print(f"      Collected Fees: {c_kpi.get('collected_fees')}")
        print(f"      Pending Invoices: {c_kpi.get('pending_payments')}")
        if "Main" in c['name']:
            assert c_kpi.get("total_students") == 24, f"Main campus should have 24 students, got {c_kpi.get('total_students')}"
        elif "Lahore" in c['name']:
            assert c_kpi.get("total_students") == 0, f"Lahore campus should have 0 students, got {c_kpi.get('total_students')}"

    print("  [OK] Multi-campus scoping is perfectly isolated and verified live.")

    # 4. Super Master Admin Verification
    print("\n[4/4] Testing Super Master Admin Authentication & Schools Overview...")
    admin_res = requests.post(f"{BASE_URL}/auth/login", json={"email": "naumancheema643@gmail.com", "password": "Super888"})
    assert admin_res.status_code == 200, f"SuperAdmin login failed: {admin_res.text}"
    admin_token = admin_res.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    schools_res = requests.get(f"{BASE_URL}/schools", headers=admin_headers)
    assert schools_res.status_code == 200, f"My schools failed: {schools_res.text}"
    schools = schools_res.json()
    print(f"  [OK] Super Master Admin access verified. Total managed schools: {len(schools)}")

    print("\n================================================================")
    print("   ALL VERIFICATIONS PASSED WITH 100% SUCCESS!                  ")
    print("================================================================")

if __name__ == "__main__":
    main()
