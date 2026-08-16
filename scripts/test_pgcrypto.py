import psycopg2

conn = psycopg2.connect("postgresql://altrix_app:29790f6c861ea7cd47a7624da6e6fef99f0e2df8ae35313f@127.0.0.1:5432/altrix")
cur = conn.cursor()

passwords_to_try = [
    "Owner888", "Owner@888", "Owner@123", "Beaconowner@888", "Beacon@888", "Admin888", "SuperAdmin@888",
    "Hr888", "Hr@888", "Hr@123", "BeaconHr@888", "Password888", "P@ssword888", "P@ssword123", "12345678",
    "Admin@123", "Altrix@888", "Altrix888", "Beacon123", "Beacon888", "Owner123", "Hr123"
]

for email in ['beaconowner@gmail.com', 'beaconhr@gmail.com', 'beaconadmin@gmail.com']:
    print(f"\nTesting {email}:")
    for p in passwords_to_try:
        cur.execute("SELECT (encrypted_password = crypt(%s, encrypted_password)) FROM auth.users WHERE LOWER(TRIM(email)) = %s", (p, email))
        row = cur.fetchone()
        if row and row[0]:
            print(f"  MATCH FOUND: {p}")
            break
    else:
        print("  No match in list")

cur.close()
conn.close()
