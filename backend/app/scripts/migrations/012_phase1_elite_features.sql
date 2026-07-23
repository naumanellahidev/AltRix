-- ==============================================================================
-- AltRix School ERP — Migration 012: Phase 1 Elite Features & Feature Toggles
-- ==============================================================================

-- 1. School Feature Flags Table
CREATE TABLE IF NOT EXISTS school_feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE UNIQUE,
    transport_enabled BOOLEAN DEFAULT TRUE,
    library_enabled BOOLEAN DEFAULT TRUE,
    parent_app_enabled BOOLEAN DEFAULT TRUE,
    document_cert_enabled BOOLEAN DEFAULT TRUE,
    ai_features_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Transport Management Tables
CREATE TABLE IF NOT EXISTS driver_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    license_number VARCHAR(100) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    cnic VARCHAR(50),
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    bus_number VARCHAR(50) NOT NULL,
    registration_no VARCHAR(100) NOT NULL,
    seating_capacity INT NOT NULL DEFAULT 40,
    driver_id UUID REFERENCES driver_profiles(id) ON DELETE SET NULL,
    conductor_name VARCHAR(255),
    conductor_phone VARCHAR(50),
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bus_routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    route_name VARCHAR(255) NOT NULL,
    start_point VARCHAR(255) NOT NULL,
    end_point VARCHAR(255) NOT NULL,
    morning_departure VARCHAR(50),
    evening_departure VARCHAR(50),
    monthly_fare NUMERIC(10, 2) DEFAULT 0.00,
    vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bus_stops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID NOT NULL REFERENCES bus_routes(id) ON DELETE CASCADE,
    stop_name VARCHAR(255) NOT NULL,
    stop_order INT NOT NULL DEFAULT 1,
    estimated_morning_time VARCHAR(50),
    estimated_evening_time VARCHAR(50),
    landmark VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS student_transport_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id UUID NOT NULL,
    route_id UUID NOT NULL REFERENCES bus_routes(id) ON DELETE CASCADE,
    stop_id UUID REFERENCES bus_stops(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'active',
    assigned_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transport_event_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    route_id UUID REFERENCES bus_routes(id) ON DELETE CASCADE,
    vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL, -- e.g., 'departed_school', 'arrived_stop', 'delayed', 'breakdown', 'arrived_school'
    current_location VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Library Management Tables
CREATE TABLE IF NOT EXISTS library_books (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    author VARCHAR(255) NOT NULL,
    isbn VARCHAR(50),
    barcode VARCHAR(100) UNIQUE,
    category VARCHAR(100) NOT NULL DEFAULT 'General',
    publisher VARCHAR(255),
    publication_year INT,
    total_copies INT DEFAULT 1,
    available_copies INT DEFAULT 1,
    shelf_location VARCHAR(100),
    cover_image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS book_issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    book_id UUID NOT NULL REFERENCES library_books(id) ON DELETE CASCADE,
    borrower_id UUID NOT NULL, -- student or staff profile id
    borrower_type VARCHAR(50) DEFAULT 'student', -- 'student' or 'staff'
    issue_date DATE DEFAULT CURRENT_DATE,
    due_date DATE NOT NULL,
    return_date DATE,
    fine_amount NUMERIC(10, 2) DEFAULT 0.00,
    fine_paid BOOLEAN DEFAULT FALSE,
    status VARCHAR(50) DEFAULT 'issued', -- 'issued', 'returned', 'overdue', 'lost'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS book_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    book_id UUID NOT NULL REFERENCES library_books(id) ON DELETE CASCADE,
    student_id UUID NOT NULL,
    reserved_at TIMESTAMPTZ DEFAULT NOW(),
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'fulfilled', 'cancelled'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Document Vault & Certificate Engine Tables
CREATE TABLE IF NOT EXISTS student_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id UUID NOT NULL,
    document_name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL DEFAULT 'General', -- 'Birth Certificate', 'Previous TC', 'CNIC/B-Form', 'Medical', 'Other'
    file_url TEXT NOT NULL,
    uploaded_by UUID,
    expires_at DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS issued_certificates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id UUID NOT NULL,
    certificate_type VARCHAR(100) NOT NULL, -- 'transfer_certificate', 'character_certificate', 'bonafide', 'noc'
    certificate_number VARCHAR(100) NOT NULL UNIQUE,
    issue_date DATE DEFAULT CURRENT_DATE,
    remarks TEXT,
    qr_verification_code VARCHAR(100) NOT NULL UNIQUE,
    issued_by UUID,
    status VARCHAR(50) DEFAULT 'valid', -- 'valid', 'revoked'
    created_at TIMESTAMPTZ DEFAULT NOW()
);
