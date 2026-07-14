-- Migration: Create Transport (Bus Tracking) and Events/PTM booking tables
-- Matches Python ORM models exactly.

-- 1. Bus Routes
CREATE TABLE IF NOT EXISTS public.bus_routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    route_name VARCHAR NOT NULL,
    route_code VARCHAR,
    description TEXT,
    start_location VARCHAR,
    end_location VARCHAR,
    estimated_duration_mins INTEGER,
    morning_departure VARCHAR,
    afternoon_departure VARCHAR,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- 2. Bus Stops
CREATE TABLE IF NOT EXISTS public.bus_stops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    route_id UUID NOT NULL REFERENCES public.bus_routes(id) ON DELETE CASCADE,
    stop_name VARCHAR NOT NULL,
    address TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    stop_order INTEGER NOT NULL DEFAULT 0,
    estimated_arrival_time VARCHAR,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- 3. Buses
CREATE TABLE IF NOT EXISTS public.buses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    route_id UUID REFERENCES public.bus_routes(id) ON DELETE SET NULL,
    bus_number VARCHAR NOT NULL,
    license_plate VARCHAR,
    capacity INTEGER,
    make_model VARCHAR,
    color VARCHAR,
    driver_name VARCHAR,
    driver_phone VARCHAR,
    driver_photo_url VARCHAR,
    driver_cnic VARCHAR,
    conductor_name VARCHAR,
    conductor_phone VARCHAR,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_gps_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    last_known_latitude DOUBLE PRECISION,
    last_known_longitude DOUBLE PRECISION,
    last_location_at TIMESTAMPTZ,
    status VARCHAR DEFAULT 'parked',
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- 4. Bus Student Assignments
CREATE TABLE IF NOT EXISTS public.bus_student_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    bus_id UUID NOT NULL REFERENCES public.buses(id) ON DELETE CASCADE,
    stop_id UUID REFERENCES public.bus_stops(id) ON DELETE SET NULL,
    pickup_type VARCHAR NOT NULL DEFAULT 'both',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- 5. Bus Live GPS Logs
CREATE TABLE IF NOT EXISTS public.bus_live_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bus_id UUID NOT NULL REFERENCES public.buses(id) ON DELETE CASCADE,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    speed DOUBLE PRECISION,
    heading DOUBLE PRECISION,
    accuracy DOUBLE PRECISION,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6. School Events
CREATE TABLE IF NOT EXISTS public.school_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    campus_id UUID REFERENCES public.campuses(id) ON DELETE SET NULL,
    title VARCHAR NOT NULL,
    description TEXT,
    event_type VARCHAR NOT NULL DEFAULT 'general',
    event_date DATE NOT NULL,
    start_time VARCHAR,
    end_time VARCHAR,
    location VARCHAR,
    cover_image_url VARCHAR,
    status VARCHAR NOT NULL DEFAULT 'upcoming',
    audience VARCHAR NOT NULL DEFAULT 'all',
    rsvp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    rsvp_count INTEGER DEFAULT 0,
    max_attendees INTEGER,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- 7. Event Photos
CREATE TABLE IF NOT EXISTS public.event_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES public.school_events(id) ON DELETE CASCADE,
    photo_url VARCHAR NOT NULL,
    thumbnail_url VARCHAR,
    caption VARCHAR,
    sort_order INTEGER NOT NULL DEFAULT 0,
    uploaded_by UUID,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- 8. PTM Meeting Slots
CREATE TABLE IF NOT EXISTS public.ptm_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    teacher_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    slot_date DATE NOT NULL,
    start_time VARCHAR NOT NULL,
    end_time VARCHAR NOT NULL,
    location VARCHAR,
    slot_type VARCHAR NOT NULL DEFAULT 'manual',
    max_bookings INTEGER NOT NULL DEFAULT 1,
    current_bookings INTEGER NOT NULL DEFAULT 0,
    status VARCHAR NOT NULL DEFAULT 'available',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- 9. PTM Bookings
CREATE TABLE IF NOT EXISTS public.ptm_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    slot_id UUID NOT NULL REFERENCES public.ptm_slots(id) ON DELETE CASCADE,
    parent_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    status VARCHAR NOT NULL DEFAULT 'confirmed',
    parent_notes TEXT,
    teacher_notes TEXT,
    meeting_summary TEXT,
    cancelled_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- 10. Helper function to fetch teacher directory details (RPC replacement)
CREATE OR REPLACE FUNCTION public.get_child_teachers_detailed(_school_id UUID, _student_id UUID)
RETURNS TABLE (
    teacher_user_id UUID,
    display_name VARCHAR,
    email VARCHAR,
    phone_number VARCHAR,
    subject_name VARCHAR,
    is_class_teacher BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT 
        tsa.teacher_user_id,
        COALESCE(hsd.full_name, p.display_name, p.email)::VARCHAR AS display_name,
        p.email::VARCHAR AS email,
        hsd.phone_number::VARCHAR AS phone_number,
        sub.name::VARCHAR AS subject_name,
        (se.class_section_id = cs.id AND cs.class_teacher_id = tsa.teacher_user_id) AS is_class_teacher
    FROM public.teacher_subject_assignments tsa
    JOIN public.student_enrollments se ON se.class_section_id = tsa.class_section_id AND se.school_id = tsa.school_id
    JOIN public.class_sections cs ON cs.id = se.class_section_id
    LEFT JOIN public.hr_staff_directory hsd ON hsd.linked_user_id = tsa.teacher_user_id AND hsd.school_id = tsa.school_id
    LEFT JOIN public.profiles p ON p.id = tsa.teacher_user_id
    LEFT JOIN public.subjects sub ON sub.id = tsa.subject_id
    WHERE tsa.school_id = _school_id
      AND se.student_id = _student_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
