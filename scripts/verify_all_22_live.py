import requests

BASE_URL = "https://altrixcore.com/api"

USERS = [
    # Master Super Admin
    {"email": "naumancheema643@gmail.com", "password": "Super888", "slug": "beacon", "expected_role": "super_admin"},
    # Beacon International School Accounts
    {"email": "beaconowner@gmail.com", "password": "Owner888", "slug": "beacon", "expected_role": "school_owner"},
    {"email": "beaconadmin@gmail.com", "password": "SuperAdmin@888", "slug": "beacon", "expected_role": "school_owner"},
    {"email": "beaconryk@gmail.com", "password": "Principal888", "slug": "beacon", "expected_role": "principal"},
    {"email": "beaconhr@gmail.com", "password": "Hr888", "slug": "beacon", "expected_role": "hr_manager"},
    {"email": "beaconaccountant@gmail.com", "password": "Accountant888", "slug": "beacon", "expected_role": "accountant"},
    {"email": "beaconacademic@gmail.com", "password": "Academic888", "slug": "beacon", "expected_role": "academic_coordinator"},
    {"email": "beaconcounselor@gmail.com", "password": "Counselor888", "slug": "beacon", "expected_role": "counselor"},
    {"email": "schooladmin@gmail.com", "password": "Admin888", "slug": "beacon", "expected_role": "school_admin"},
    {"email": "teacher1@gmail.com", "password": "Teacher888", "slug": "beacon", "expected_role": "teacher"},
    {"email": "teacher2@gmail.com", "password": "Teacher888", "slug": "beacon", "expected_role": "teacher"},
    {"email": "teacher3@gmail.com", "password": "Teacher888", "slug": "beacon", "expected_role": "teacher"},
    {"email": "naumanellahi.dev@gmail.com", "password": "Teacher888", "slug": "beacon", "expected_role": "teacher"},
    {"email": "student@gmail.com", "password": "Student888", "slug": "beacon", "expected_role": "student"},
    {"email": "student1@gmail.com", "password": "Student888", "slug": "beacon", "expected_role": "student"},
    {"email": "student2@gmail.com", "password": "Student888", "slug": "beacon", "expected_role": "student"},
    {"email": "aliakbar@gmail.com", "password": "Student888", "slug": "beacon", "expected_role": "student"},
    {"email": "akbarali@gmail.com", "password": "Student888", "slug": "beacon", "expected_role": "student"},
    {"email": "parent1@gmail.com", "password": "Parent888", "slug": "beacon", "expected_role": "parent"},
    # Other Institutes
    {"email": "american@gmail.com", "password": "Principal888", "slug": "american", "expected_role": "principal"},
    {"email": "lgs@gmail.com", "password": "Principal888", "slug": "lgs", "expected_role": "principal"},
    {"email": "teacher1lgs@gmail.com", "password": "Teacher888", "slug": "lgs", "expected_role": "teacher"},
]

def main():
    print(f"Verifying live authentication for all {len(USERS)} accounts on https://altrixcore.com...")
    passed = 0
    failed = 0

    for idx, u in enumerate(USERS, 1):
        email = u["email"]
        pwd = u["password"]
        slug = u["slug"]
        expected_role = u["expected_role"]

        res = requests.post(f"{BASE_URL}/auth/login", json={"email": email, "password": pwd})
        if res.status_code == 200:
            data = res.json()
            user_id = data.get("user_id") or data.get("user", {}).get("id")
            token = data.get("access_token")
            # Verify user can query /auth/me
            me_res = requests.get(f"{BASE_URL}/auth/me", headers={"Authorization": f"Bearer {token}"})
            if me_res.status_code == 200:
                print(f"[{idx:02d}/22] PASS: {email:30s} -> Authenticated & Active (UID: {user_id[:8]}...)")
                passed += 1
            else:
                print(f"[{idx:02d}/22] FAIL: {email:30s} -> Login OK but /auth/me failed ({me_res.status_code})")
                failed += 1
        else:
            print(f"[{idx:02d}/22] FAIL: {email:30s} -> {res.status_code} ({res.text})")
            failed += 1

    print("\n" + "="*50)
    print(f"SUMMARY: Total={len(USERS)}, PASSED={passed}, FAILED={failed}")
    print("="*50)

if __name__ == "__main__":
    main()
