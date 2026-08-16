import psycopg2

conn = psycopg2.connect("postgresql://altrix_app:29790f6c861ea7cd47a7624da6e6fef99f0e2df8ae35313f@127.0.0.1:5432/altrix")
cur = conn.cursor()

cur.execute("""
    UPDATE auth.users 
    SET encrypted_password = crypt('Owner888', gen_salt('bf', 10)), updated_at = NOW() 
    WHERE LOWER(TRIM(email)) = 'beaconowner@gmail.com';

    UPDATE auth.users 
    SET encrypted_password = crypt('Hr888', gen_salt('bf', 10)), updated_at = NOW() 
    WHERE LOWER(TRIM(email)) = 'beaconhr@gmail.com';
""")

conn.commit()
cur.close()
conn.close()
print("Passwords updated successfully.")
