-- Multi-Campus & Multi-School Isolation & Data Architecture Migration
-- Ensures every school has distinct campuses, and every campus has rich, isolated operational data.

BEGIN;

-- 1. Standardize and create Campuses for all Schools
-- Beacon Campuses
UPDATE public.campuses 
SET slug = 'beacon-lahore', name = 'Beacon Lahore Campus' 
WHERE id = 'a847833c-90a7-4f25-b793-8a813eee2215';

UPDATE public.campuses 
SET slug = 'beacon-main', name = 'Beacon Main Campus' 
WHERE id = '249bfc5e-f7c2-4103-bef1-ec4bdae2cdd8';

-- LGS Campuses
INSERT INTO public.campuses (id, school_id, name, slug, address, phone, email, is_active, created_at, updated_at)
VALUES 
  ('aaaaaaaa-1111-4444-8888-000000000001', 'c4e835dd-b67d-4f88-9763-5561ff057116', 'LGS Gulberg Campus', 'lgs-gulberg', 'Main Gulberg III, Lahore', '+92 42 35712345', 'gulberg@lgs.edu.pk', true, NOW(), NOW()),
  ('aaaaaaaa-1111-4444-8888-000000000002', 'c4e835dd-b67d-4f88-9763-5561ff057116', 'LGS Johar Town Campus', 'lgs-johar', 'Block G, Johar Town, Lahore', '+92 42 35312345', 'johar@lgs.edu.pk', true, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET 
  name = EXCLUDED.name, 
  slug = EXCLUDED.slug, 
  is_active = true,
  updated_at = NOW();

-- American School Campuses
INSERT INTO public.campuses (id, school_id, name, slug, address, phone, email, is_active, created_at, updated_at)
VALUES 
  ('bbbbbbbb-2222-4444-8888-000000000001', '8a40ec06-7a91-4e68-9375-d59e312762f9', 'American Central Campus', 'american-central', 'Sector F-7/2, Islamabad', '+92 51 2654321', 'central@american.edu.pk', true, NOW(), NOW()),
  ('bbbbbbbb-2222-4444-8888-000000000002', '8a40ec06-7a91-4e68-9375-d59e312762f9', 'American Executive Campus', 'american-executive', 'DHA Phase 5, Islamabad', '+92 51 5789012', 'executive@american.edu.pk', true, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET 
  name = EXCLUDED.name, 
  slug = EXCLUDED.slug, 
  is_active = true,
  updated_at = NOW();

-- 2. Fix historical mislinked sessions (LGS attendance sessions that had beacon campus_id)
UPDATE public.attendance_sessions
SET campus_id = 'aaaaaaaa-1111-4444-8888-000000000001'
WHERE school_id = 'c4e835dd-b67d-4f88-9763-5561ff057116';

-- 3. Seed Class Sections for Beacon Lahore Campus
INSERT INTO public.class_sections (id, school_id, campus_id, grade_level, section_name, max_capacity, is_active, created_at, updated_at)
VALUES 
  ('11111111-aaaa-4444-8888-000000000001', '70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8', 'a847833c-90a7-4f25-b793-8a813eee2215', 'Grade 9', '9-LHR-A', 35, true, NOW(), NOW()),
  ('11111111-aaaa-4444-8888-000000000002', '70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8', 'a847833c-90a7-4f25-b793-8a813eee2215', 'Grade 10', '10-LHR-A', 35, true, NOW(), NOW()),
  ('11111111-aaaa-4444-8888-000000000003', '70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8', 'a847833c-90a7-4f25-b793-8a813eee2215', 'Grade 11', '11-LHR-Sci', 30, true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 4. Seed Class Sections for LGS Campuses
INSERT INTO public.class_sections (id, school_id, campus_id, grade_level, section_name, max_capacity, is_active, created_at, updated_at)
VALUES 
  ('22222222-aaaa-4444-8888-000000000001', 'c4e835dd-b67d-4f88-9763-5561ff057116', 'aaaaaaaa-1111-4444-8888-000000000001', 'Grade 9', '9-Gulberg-A', 30, true, NOW(), NOW()),
  ('22222222-aaaa-4444-8888-000000000002', 'c4e835dd-b67d-4f88-9763-5561ff057116', 'aaaaaaaa-1111-4444-8888-000000000001', 'Grade 10', '10-Gulberg-A', 30, true, NOW(), NOW()),
  ('22222222-aaaa-4444-8888-000000000003', 'c4e835dd-b67d-4f88-9763-5561ff057116', 'aaaaaaaa-1111-4444-8888-000000000002', 'Grade 9', '9-Johar-A', 30, true, NOW(), NOW()),
  ('22222222-aaaa-4444-8888-000000000004', 'c4e835dd-b67d-4f88-9763-5561ff057116', 'aaaaaaaa-1111-4444-8888-000000000002', 'Grade 10', '10-Johar-A', 30, true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 5. Seed Class Sections for American School Campuses
INSERT INTO public.class_sections (id, school_id, campus_id, grade_level, section_name, max_capacity, is_active, created_at, updated_at)
VALUES 
  ('33333333-aaaa-4444-8888-000000000001', '8a40ec06-7a91-4e68-9375-d59e312762f9', 'bbbbbbbb-2222-4444-8888-000000000001', 'Grade 9', '9-Central-A', 25, true, NOW(), NOW()),
  ('33333333-aaaa-4444-8888-000000000002', '8a40ec06-7a91-4e68-9375-d59e312762f9', 'bbbbbbbb-2222-4444-8888-000000000001', 'Grade 10', '10-Central-A', 25, true, NOW(), NOW()),
  ('33333333-aaaa-4444-8888-000000000003', '8a40ec06-7a91-4e68-9375-d59e312762f9', 'bbbbbbbb-2222-4444-8888-000000000002', 'Grade 9', '9-Exec-A', 25, true, NOW(), NOW()),
  ('33333333-aaaa-4444-8888-000000000004', '8a40ec06-7a91-4e68-9375-d59e312762f9', 'bbbbbbbb-2222-4444-8888-000000000002', 'Grade 10', '10-Exec-A', 25, true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 6. Seed Students for Beacon Lahore Campus
INSERT INTO public.students (id, school_id, campus_id, class_section_id, admission_number, roll_number, full_name, guardian_name, guardian_phone, guardian_email, emergency_contact, status, date_of_birth, gender, blood_group, created_at, updated_at)
VALUES
  ('44444444-bbbb-4444-8888-000000000001', '70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8', 'a847833c-90a7-4f25-b793-8a813eee2215', '11111111-aaaa-4444-8888-000000000001', 'BLHR-101', '01', 'Zainab Fatima', 'Dr. Tariq Mahmood', '+92 300 1122334', 'tariq@gmail.com', '+92 300 1122334', 'active', '2010-03-15', 'female', 'O+', NOW(), NOW()),
  ('44444444-bbbb-4444-8888-000000000002', '70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8', 'a847833c-90a7-4f25-b793-8a813eee2215', '11111111-aaaa-4444-8888-000000000001', 'BLHR-102', '02', 'Hassan Raza', 'Syed Raza Ali', '+92 301 2233445', 'raza@gmail.com', '+92 301 2233445', 'active', '2010-07-20', 'male', 'B+', NOW(), NOW()),
  ('44444444-bbbb-4444-8888-000000000003', '70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8', 'a847833c-90a7-4f25-b793-8a813eee2215', '11111111-aaaa-4444-8888-000000000002', 'BLHR-103', '03', 'Maryam Naveed', 'Naveed Ashraf', '+92 302 3344556', 'naveed@gmail.com', '+92 302 3344556', 'active', '2009-11-12', 'female', 'A+', NOW(), NOW()),
  ('44444444-bbbb-4444-8888-000000000004', '70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8', 'a847833c-90a7-4f25-b793-8a813eee2215', '11111111-aaaa-4444-8888-000000000003', 'BLHR-104', '04', 'Bilal Ahmed', 'Ahmed Khan', '+92 303 4455667', 'ahmed@gmail.com', '+92 303 4455667', 'active', '2008-05-18', 'male', 'AB+', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 7. Seed Students for LGS Campuses
INSERT INTO public.students (id, school_id, campus_id, class_section_id, admission_number, roll_number, full_name, guardian_name, guardian_phone, guardian_email, emergency_contact, status, date_of_birth, gender, blood_group, created_at, updated_at)
VALUES
  ('55555555-bbbb-4444-8888-000000000001', 'c4e835dd-b67d-4f88-9763-5561ff057116', 'aaaaaaaa-1111-4444-8888-000000000001', '22222222-aaaa-4444-8888-000000000001', 'LGS-GUL-01', '01', 'Ayesha Malik', 'Malik Usman', '+92 321 5566778', 'usman@gmail.com', '+92 321 5566778', 'active', '2010-04-10', 'female', 'A+', NOW(), NOW()),
  ('55555555-bbbb-4444-8888-000000000002', 'c4e835dd-b67d-4f88-9763-5561ff057116', 'aaaaaaaa-1111-4444-8888-000000000001', '22222222-aaaa-4444-8888-000000000002', 'LGS-GUL-02', '02', 'Hamza Butt', 'Khurram Butt', '+92 322 6677889', 'butt@gmail.com', '+92 322 6677889', 'active', '2009-08-22', 'male', 'O+', NOW(), NOW()),
  ('55555555-bbbb-4444-8888-000000000003', 'c4e835dd-b67d-4f88-9763-5561ff057116', 'aaaaaaaa-1111-4444-8888-000000000002', '22222222-aaaa-4444-8888-000000000003', 'LGS-JOH-01', '01', 'Mahnoor Imran', 'Imran Siddiqui', '+92 323 7788990', 'imran@gmail.com', '+92 323 7788990', 'active', '2010-09-05', 'female', 'B+', NOW(), NOW()),
  ('55555555-bbbb-4444-8888-000000000004', 'c4e835dd-b67d-4f88-9763-5561ff057116', 'aaaaaaaa-1111-4444-8888-000000000002', '22222222-aaaa-4444-8888-000000000004', 'LGS-JOH-02', '02', 'Daniyal Shah', 'Shahid Shah', '+92 324 8899001', 'shah@gmail.com', '+92 324 8899001', 'active', '2009-12-30', 'male', 'A-', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 8. Seed Students for American School Campuses
INSERT INTO public.students (id, school_id, campus_id, class_section_id, admission_number, roll_number, full_name, guardian_name, guardian_phone, guardian_email, emergency_contact, status, date_of_birth, gender, blood_group, created_at, updated_at)
VALUES
  ('66666666-bbbb-4444-8888-000000000001', '8a40ec06-7a91-4e68-9375-d59e312762f9', 'bbbbbbbb-2222-4444-8888-000000000001', '33333333-aaaa-4444-8888-000000000001', 'AMS-CEN-01', '01', 'Sarah Khan', 'Farhan Khan', '+92 333 1122334', 'farhan@gmail.com', '+92 333 1122334', 'active', '2010-01-25', 'female', 'O-', NOW(), NOW()),
  ('66666666-bbbb-4444-8888-000000000002', '8a40ec06-7a91-4e68-9375-d59e312762f9', 'bbbbbbbb-2222-4444-8888-000000000001', '33333333-aaaa-4444-8888-000000000002', 'AMS-CEN-02', '02', 'Omar Farooq', 'Farooq Sheikh', '+92 334 2233445', 'farooq@gmail.com', '+92 334 2233445', 'active', '2009-06-14', 'male', 'B-', NOW(), NOW()),
  ('66666666-bbbb-4444-8888-000000000003', '8a40ec06-7a91-4e68-9375-d59e312762f9', 'bbbbbbbb-2222-4444-8888-000000000002', '33333333-aaaa-4444-8888-000000000003', 'AMS-EXE-01', '01', 'Esha Rehman', 'Atif Rehman', '+92 335 3344556', 'atif@gmail.com', '+92 335 3344556', 'active', '2010-08-19', 'female', 'AB+', NOW(), NOW()),
  ('66666666-bbbb-4444-8888-000000000004', '8a40ec06-7a91-4e68-9375-d59e312762f9', 'bbbbbbbb-2222-4444-8888-000000000002', '33333333-aaaa-4444-8888-000000000004', 'AMS-EXE-02', '02', 'Rayyan Ali', 'Ali Zafar', '+92 336 4455667', 'zafar@gmail.com', '+92 336 4455667', 'active', '2009-03-08', 'male', 'A+', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 9. Seed Invoices for Beacon Lahore, LGS, and American Campuses
INSERT INTO public.fee_invoices (id, school_id, campus_id, student_id, invoice_number, billing_month, due_date, total_amount, paid_amount, discount_amount, fine_amount, balance, status, fee_breakdown, created_at, updated_at)
VALUES
  -- Beacon Lahore
  ('77777777-cccc-4444-8888-000000000001', '70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8', 'a847833c-90a7-4f25-b793-8a813eee2215', '44444444-bbbb-4444-8888-000000000001', 'INV-BLHR-2026-08-01', '2026-08', '2026-08-25', 18500, 18500, 0, 0, 0, 'paid', '{"tuition": 15000, "lab": 2500, "library": 1000}', NOW(), NOW()),
  ('77777777-cccc-4444-8888-000000000002', '70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8', 'a847833c-90a7-4f25-b793-8a813eee2215', '44444444-bbbb-4444-8888-000000000002', 'INV-BLHR-2026-08-02', '2026-08', '2026-08-25', 18500, 0, 0, 0, 18500, 'unpaid', '{"tuition": 15000, "lab": 2500, "library": 1000}', NOW(), NOW()),
  -- LGS Gulberg & Johar
  ('77777777-cccc-4444-8888-000000000003', 'c4e835dd-b67d-4f88-9763-5561ff057116', 'aaaaaaaa-1111-4444-8888-000000000001', '55555555-bbbb-4444-8888-000000000001', 'INV-LGS-GUL-01', '2026-08', '2026-08-25', 22000, 22000, 0, 0, 0, 'paid', '{"tuition": 18000, "sports": 2000, "it": 2000}', NOW(), NOW()),
  ('77777777-cccc-4444-8888-000000000004', 'c4e835dd-b67d-4f88-9763-5561ff057116', 'aaaaaaaa-1111-4444-8888-000000000002', '55555555-bbbb-4444-8888-000000000003', 'INV-LGS-JOH-01', '2026-08', '2026-08-25', 22000, 0, 0, 0, 22000, 'unpaid', '{"tuition": 18000, "sports": 2000, "it": 2000}', NOW(), NOW()),
  -- American Central & Exec
  ('77777777-cccc-4444-8888-000000000005', '8a40ec06-7a91-4e68-9375-d59e312762f9', 'bbbbbbbb-2222-4444-8888-000000000001', '66666666-bbbb-4444-8888-000000000001', 'INV-AMS-CEN-01', '2026-08', '2026-08-25', 30000, 30000, 0, 0, 0, 'paid', '{"tuition": 25000, "activity": 5000}', NOW(), NOW()),
  ('77777777-cccc-4444-8888-000000000006', '8a40ec06-7a91-4e68-9375-d59e312762f9', 'bbbbbbbb-2222-4444-8888-000000000002', '66666666-bbbb-4444-8888-000000000003', 'INV-AMS-EXE-01', '2026-08', '2026-08-25', 30000, 0, 0, 0, 30000, 'unpaid', '{"tuition": 25000, "activity": 5000}', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 10. Seed Staff Campus Assignments
INSERT INTO public.staff_campus_assignments (id, user_id, campus_id, is_primary, assigned_at)
VALUES
  -- Beacon Staff
  ('88888888-dddd-4444-8888-000000000001', '6e3e1047-c839-4e86-9be6-3131ca8ad474', '249bfc5e-f7c2-4103-bef1-ec4bdae2cdd8', true, NOW()), -- Principal to Beacon Main
  ('88888888-dddd-4444-8888-000000000002', 'ac80b81e-bec1-400f-bfc7-524489dc2289', '249bfc5e-f7c2-4103-bef1-ec4bdae2cdd8', true, NOW()), -- Teacher 1 to Beacon Main
  ('88888888-dddd-4444-8888-000000000003', '0d2bcf0a-05be-49f6-a9c0-7aa924f7d259', 'a847833c-90a7-4f25-b793-8a813eee2215', true, NOW()), -- Teacher 2 to Beacon Lahore
  -- LGS Staff
  ('88888888-dddd-4444-8888-000000000004', '0cf2609f-2f3f-4fd2-9922-30c830dd0bf8', 'aaaaaaaa-1111-4444-8888-000000000001', true, NOW()), -- LGS Principal to Gulberg
  ('88888888-dddd-4444-8888-000000000005', '5e63054f-dd10-4bac-9702-908eefa066ef', 'aaaaaaaa-1111-4444-8888-000000000001', true, NOW()), -- LGS Teacher to Gulberg
  -- American Staff
  ('88888888-dddd-4444-8888-000000000006', '9a35abca-cb17-4e9d-a519-564424e24583', 'bbbbbbbb-2222-4444-8888-000000000001', true, NOW())  -- American Principal to Central
ON CONFLICT (id) DO NOTHING;

COMMIT;
