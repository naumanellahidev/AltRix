import requests
import json

BASE_URL = "https://altrixcore.com/api"

def test_governance_and_auth():
    print("=== 1. Principal Login ===")
    s = requests.Session()
    login_res = s.post(f"{BASE_URL}/auth/login", json={
        "email": "beaconryk@gmail.com",
        "password": "Principal888"
    })
    print(f"Principal login status: {login_res.status_code}")
    if login_res.status_code != 200:
        print("Login failed:", login_res.text)
        return
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    print("\n=== 2. Principal Updates Password for beaconadmin@gmail.com via eduverse-staff-governance ===")
    target_user_id = "b79e0405-8a79-465c-80f9-81dd7c594822"
    new_pwd = "SuperAdmin@888"
    gov_res = s.post(
        f"{BASE_URL}/functions/eduverse-staff-governance",
        headers=headers,
        json={
            "action": "set_password",
            "schoolSlug": "beacon",
            "targetUserId": target_user_id,
            "password": new_pwd,
            "reason": "Principal updated password from staff directory"
        }
    )
    print(f"Set password response status: {gov_res.status_code}")
    print(f"Set password response body: {gov_res.text}")

    print("\n=== 3. Verify beaconadmin@gmail.com logs in with NEW password ===")
    admin_login_res = requests.post(f"{BASE_URL}/auth/login", json={
        "email": "beaconadmin@gmail.com",
        "password": new_pwd
    })
    print(f"Admin login status: {admin_login_res.status_code}")
    if admin_login_res.status_code == 200:
        print("SUCCESS! beaconadmin authenticated with updated password!")
    else:
        print("FAILED:", admin_login_res.text)

    print("\n=== 4. Test Case-Insensitive Email Login (e.g. BeaconAdmin@gmail.com) ===")
    case_res = requests.post(f"{BASE_URL}/auth/login", json={
        "email": "BeaconAdmin@Gmail.Com",
        "password": new_pwd
    })
    print(f"Case-insensitive login status: {case_res.status_code}")
    if case_res.status_code == 200:
        print("SUCCESS! Case-insensitive login verified.")
    else:
        print("FAILED:", case_res.text)

if __name__ == "__main__":
    test_governance_and_auth()
