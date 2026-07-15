-- Migration 010: Tier 3 Wow Factor Features DDL
-- Run this after previous migrations

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. OWNER AI INSIGHTS
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS owner_ai_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    
    revenue_forecast JSONB,
    enrollment_forecast JSONB,
    teacher_risk_scores JSONB,
    parent_sentiments JSONB,
    benchmark_scores JSONB,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_owner_ai_insights_school ON owner_ai_insights(school_id);


-- ══════════════════════════════════════════════════════════════════════════════
-- 2. DOCUMENT MANAGEMENT SYSTEM (DMS)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS school_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    
    owner_type VARCHAR(50) NOT NULL, -- student, staff
    owner_id UUID NOT NULL,
    
    document_type VARCHAR(100) NOT NULL, -- cnic, contract, medical, birth_certificate, cv, degree, other
    file_name VARCHAR(255) NOT NULL,
    file_url VARCHAR(512) NOT NULL,
    expiry_date DATE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_school_documents_owner ON school_documents(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_school_documents_expiry ON school_documents(expiry_date);


CREATE TABLE IF NOT EXISTS document_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    
    template_name VARCHAR(100) NOT NULL, -- transfer_certificate, character_certificate, bonafide, noc
    body_content TEXT NOT NULL,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_document_templates_school ON document_templates(school_id);


CREATE TABLE IF NOT EXISTS issued_certificates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    
    template_name VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    
    digital_signature_name VARCHAR(255),
    digital_signature_title VARCHAR(255),
    signed_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_issued_certificates_student ON issued_certificates(student_id);


-- ══════════════════════════════════════════════════════════════════════════════
-- 3. EXAMS SEATING ARRANGEMENTS & ROOMS
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS exam_rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    
    room_name VARCHAR(255) NOT NULL,
    capacity_rows INTEGER NOT NULL DEFAULT 10,
    capacity_cols INTEGER NOT NULL DEFAULT 10,
    total_capacity INTEGER NOT NULL DEFAULT 100,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_exam_rooms_school ON exam_rooms(school_id);


CREATE TABLE IF NOT EXISTS exam_seating_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    datesheet_id UUID NOT NULL REFERENCES exam_datesheets(id) ON DELETE CASCADE,
    room_id UUID NOT NULL REFERENCES exam_rooms(id) ON DELETE CASCADE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_exam_seating_plans_datesheet ON exam_seating_plans(datesheet_id);
CREATE INDEX IF NOT EXISTS idx_exam_seating_plans_room ON exam_seating_plans(room_id);


CREATE TABLE IF NOT EXISTS exam_seat_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seating_plan_id UUID NOT NULL REFERENCES exam_seating_plans(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    
    row_num INTEGER NOT NULL,
    col_num INTEGER NOT NULL,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_exam_seat_assignments_plan ON exam_seat_assignments(seating_plan_id);
CREATE INDEX IF NOT EXISTS idx_exam_seat_assignments_student ON exam_seat_assignments(student_id);


CREATE TABLE IF NOT EXISTS exam_invigilators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seating_plan_id UUID NOT NULL REFERENCES exam_seating_plans(id) ON DELETE CASCADE,
    staff_user_id UUID NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'primary', -- primary, secondary, helper
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_exam_invigilators_plan ON exam_invigilators(seating_plan_id);
