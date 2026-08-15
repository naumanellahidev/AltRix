-- 1. Ensure all student accounts have school_memberships & user_roles in Beacon
INSERT INTO public.school_memberships (id, school_id, user_id, status, created_at)
SELECT gen_random_uuid(), s.id, u.id, 'active', now()
FROM auth.users u, public.schools s
WHERE u.email = 'aliakbar@gmail.com' AND s.slug = 'beacon'
AND NOT EXISTS (SELECT 1 FROM public.school_memberships sm WHERE sm.user_id = u.id AND sm.school_id = s.id);

INSERT INTO public.user_roles (id, school_id, user_id, role, created_at)
SELECT gen_random_uuid(), s.id, u.id, 'student', now()
FROM auth.users u, public.schools s
WHERE u.email = 'aliakbar@gmail.com' AND s.slug = 'beacon'
AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id AND ur.school_id = s.id);

INSERT INTO public.school_memberships (id, school_id, user_id, status, created_at)
SELECT gen_random_uuid(), s.id, u.id, 'active', now()
FROM auth.users u, public.schools s
WHERE u.email = 'akbarali@gmail.com' AND s.slug = 'beacon'
AND NOT EXISTS (SELECT 1 FROM public.school_memberships sm WHERE sm.user_id = u.id AND sm.school_id = s.id);

INSERT INTO public.user_roles (id, school_id, user_id, role, created_at)
SELECT gen_random_uuid(), s.id, u.id, 'student', now()
FROM auth.users u, public.schools s
WHERE u.email = 'akbarali@gmail.com' AND s.slug = 'beacon'
AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id AND ur.school_id = s.id);

-- 2. Standardize passwords across all accounts
UPDATE auth.users SET encrypted_password = crypt('Super888', gen_salt('bf')), updated_at = now() WHERE email = 'naumancheema643@gmail.com';
UPDATE auth.users SET encrypted_password = crypt('Owner888', gen_salt('bf')), updated_at = now() WHERE email = 'beaconowner@gmail.com';
UPDATE auth.users SET encrypted_password = crypt('Admin888', gen_salt('bf')), updated_at = now() WHERE email = 'beaconadmin@gmail.com';
UPDATE auth.users SET encrypted_password = crypt('Principal888', gen_salt('bf')), updated_at = now() WHERE email = 'beaconryk@gmail.com';
UPDATE auth.users SET encrypted_password = crypt('Hr888', gen_salt('bf')), updated_at = now() WHERE email = 'beaconhr@gmail.com';
UPDATE auth.users SET encrypted_password = crypt('Accountant888', gen_salt('bf')), updated_at = now() WHERE email = 'beaconaccountant@gmail.com';
UPDATE auth.users SET encrypted_password = crypt('Academic888', gen_salt('bf')), updated_at = now() WHERE email = 'beaconacademic@gmail.com';
UPDATE auth.users SET encrypted_password = crypt('Counselor888', gen_salt('bf')), updated_at = now() WHERE email = 'beaconcounselor@gmail.com';
UPDATE auth.users SET encrypted_password = crypt('Admin888', gen_salt('bf')), updated_at = now() WHERE email = 'schooladmin@gmail.com';
UPDATE auth.users SET encrypted_password = crypt('Teacher888', gen_salt('bf')), updated_at = now() WHERE email = 'teacher1@gmail.com';
UPDATE auth.users SET encrypted_password = crypt('Teacher888', gen_salt('bf')), updated_at = now() WHERE email = 'teacher2@gmail.com';
UPDATE auth.users SET encrypted_password = crypt('Teacher888', gen_salt('bf')), updated_at = now() WHERE email = 'teacher3@gmail.com';
UPDATE auth.users SET encrypted_password = crypt('Teacher888', gen_salt('bf')), updated_at = now() WHERE email = 'naumanellahi.dev@gmail.com';
UPDATE auth.users SET encrypted_password = crypt('Student888', gen_salt('bf')), updated_at = now() WHERE email = 'student@gmail.com';
UPDATE auth.users SET encrypted_password = crypt('Student888', gen_salt('bf')), updated_at = now() WHERE email = 'student1@gmail.com';
UPDATE auth.users SET encrypted_password = crypt('Student888', gen_salt('bf')), updated_at = now() WHERE email = 'student2@gmail.com';
UPDATE auth.users SET encrypted_password = crypt('Student888', gen_salt('bf')), updated_at = now() WHERE email = 'aliakbar@gmail.com';
UPDATE auth.users SET encrypted_password = crypt('Student888', gen_salt('bf')), updated_at = now() WHERE email = 'akbarali@gmail.com';
UPDATE auth.users SET encrypted_password = crypt('Parent888', gen_salt('bf')), updated_at = now() WHERE email = 'parent1@gmail.com';
UPDATE auth.users SET encrypted_password = crypt('Principal888', gen_salt('bf')), updated_at = now() WHERE email = 'american@gmail.com';
UPDATE auth.users SET encrypted_password = crypt('Principal888', gen_salt('bf')), updated_at = now() WHERE email = 'lgs@gmail.com';
UPDATE auth.users SET encrypted_password = crypt('Teacher888', gen_salt('bf')), updated_at = now() WHERE email = 'teacher1lgs@gmail.com';
