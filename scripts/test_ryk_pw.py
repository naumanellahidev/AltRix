import bcrypt

hb = b"$2a$10$KjXx9F7/Wb6acf70dNbidedj4RroqXKdgJLUihxzDATa3sMILvIq."
if hb.startswith(b"$2a$"):
    hb = b"$2b$" + hb[4:]

passwords = [
    'Principal888', 'Admin888', 'Owner888', 'Beacon888', 'password', 'password123',
    'beacon123', 'admin', 'admin123', '12345678', '123456', 'Secret123!',
    'Altrix123!', 'beaconryk', 'beaconryk123', 'Principal123', 'Principal@123',
    'Principal@888', 'Beacon@888', 'ryk888', 'beaconryk888'
]

for p in passwords:
    if bcrypt.checkpw(p.encode('utf-8'), hb):
        print(f"FOUND MATCH for beaconryk: {p}")
        break
else:
    print("No match found in candidates")
