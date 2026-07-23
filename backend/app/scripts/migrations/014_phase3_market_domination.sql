-- ==============================================================================
-- AltRix School ERP — Migration 014: Phase 3 Market Domination Features
-- ==============================================================================

-- 1. Extend School Feature Flags Table
ALTER TABLE school_feature_flags
ADD COLUMN IF NOT EXISTS hostel_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS appraisals_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS seating_plan_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS white_label_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS multilang_enabled BOOLEAN DEFAULT TRUE;

-- 2. Hostel & Boarding Facility Management Tables
CREATE TABLE IF NOT EXISTS hostel_buildings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    total_floors INT DEFAULT 3,
    warden_name VARCHAR(150),
    warden_phone VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hostel_rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    building_name VARCHAR(150) DEFAULT 'Main Hostel Block',
    room_number VARCHAR(50) NOT NULL,
    capacity INT DEFAULT 2,
    occupied_count INT DEFAULT 0,
    room_type VARCHAR(50) DEFAULT 'Standard Non-AC',
    fee_per_term NUMERIC(10,2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hostel_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    room_id UUID NOT NULL REFERENCES hostel_rooms(id) ON DELETE CASCADE,
    student_id UUID NOT NULL,
    check_in_date VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hostel_attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id UUID NOT NULL,
    attendance_date VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'present',
    warden_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hostel_mess_menu (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    day_of_week VARCHAR(50) NOT NULL,
    breakfast VARCHAR(255) NOT NULL,
    lunch VARCHAR(255) NOT NULL,
    dinner VARCHAR(255) NOT NULL,
    special_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. White Label & Custom Domain Settings Table
CREATE TABLE IF NOT EXISTS white_label_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE UNIQUE,
    custom_domain VARCHAR(255),
    custom_smtp_host VARCHAR(255),
    custom_smtp_port INT DEFAULT 587,
    custom_smtp_user VARCHAR(255),
    custom_logo_url VARCHAR(500),
    custom_primary_color VARCHAR(50) DEFAULT '#0284c7',
    hide_altrix_branding BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
