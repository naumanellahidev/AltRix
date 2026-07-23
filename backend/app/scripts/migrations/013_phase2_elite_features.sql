-- ==============================================================================
-- AltRix School ERP — Migration 013: Phase 2 Elite Features & Feature Toggles
-- ==============================================================================

-- 1. Extend School Feature Flags Table
ALTER TABLE school_feature_flags
ADD COLUMN IF NOT EXISTS wellbeing_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS inventory_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS alumni_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS public_admissions_enabled BOOLEAN DEFAULT TRUE;

-- 2. Student Health & Infirmary Tables
CREATE TABLE IF NOT EXISTS student_medical_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id UUID NOT NULL,
    blood_group VARCHAR(10),
    allergies TEXT,
    chronic_conditions TEXT,
    emergency_contact_name VARCHAR(255),
    emergency_contact_phone VARCHAR(50),
    doctor_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS infirmary_visit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id UUID NOT NULL,
    visit_date TIMESTAMPTZ DEFAULT NOW(),
    symptoms TEXT NOT NULL,
    treatment TEXT,
    medication_given VARCHAR(255),
    nurse_name VARCHAR(150),
    status VARCHAR(50) DEFAULT 'in_clinic',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vaccination_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id UUID NOT NULL,
    vaccine_name VARCHAR(150) NOT NULL,
    dose_number VARCHAR(50),
    administered_date VARCHAR(50),
    status VARCHAR(50) DEFAULT 'completed',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS first_aid_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id UUID NOT NULL,
    incident_type VARCHAR(150) NOT NULL,
    location VARCHAR(150),
    action_taken TEXT NOT NULL,
    parent_notified BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. School Asset & Inventory Management Tables
CREATE TABLE IF NOT EXISTS inventory_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    category_name VARCHAR(100) DEFAULT 'General',
    item_name VARCHAR(200) NOT NULL,
    sku_barcode VARCHAR(100),
    total_quantity INT DEFAULT 1,
    available_quantity INT DEFAULT 1,
    min_reorder_threshold INT DEFAULT 5,
    unit_price NUMERIC(10,2),
    room_location VARCHAR(150),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    transaction_type VARCHAR(50) NOT NULL,
    quantity INT NOT NULL,
    issued_to VARCHAR(200),
    department VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Alumni Network & Placement Tables
CREATE TABLE IF NOT EXISTS alumni_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id UUID,
    full_name VARCHAR(200) NOT NULL,
    graduation_year INT NOT NULL,
    higher_education_uni VARCHAR(255),
    current_company VARCHAR(255),
    designation VARCHAR(150),
    email VARCHAR(255),
    phone VARCHAR(50),
    linkedin_url VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alumni_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    event_title VARCHAR(200) NOT NULL,
    event_date VARCHAR(50) NOT NULL,
    location VARCHAR(200),
    description TEXT,
    rsvp_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alumni_donations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    alumni_id UUID NOT NULL REFERENCES alumni_profiles(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL,
    purpose VARCHAR(150) DEFAULT 'Scholarship Fund',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
