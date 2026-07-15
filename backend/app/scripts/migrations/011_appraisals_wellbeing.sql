-- Migration 011: Staff Appraisals & Student Wellbeing System DDL
-- Run this after previous migrations

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. STAFF APPRAISALS & KPI TABLES
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS staff_kpi_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    staff_user_id UUID NOT NULL,
    
    punctuality_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    results_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    parent_feedback_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    co_curricular_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    average_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    
    evaluation_period VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_staff_kpi_scores_staff ON staff_kpi_scores(staff_user_id);


CREATE TABLE IF NOT EXISTS staff_appraisals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    staff_user_id UUID NOT NULL,
    
    self_appraisal_text TEXT NOT NULL,
    reviewer_user_id UUID,
    review_comments TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'pending_review', -- pending_review, approved, rejected
    salary_increment_pct DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_staff_appraisals_staff ON staff_appraisals(staff_user_id);
CREATE INDEX IF NOT EXISTS idx_staff_appraisals_status ON staff_appraisals(status);


CREATE TABLE IF NOT EXISTS teacher_feedback_360 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    staff_user_id UUID NOT NULL,
    student_id UUID REFERENCES students(id) ON DELETE SET NULL,
    
    rating INTEGER NOT NULL DEFAULT 5,
    comments TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_teacher_feedback_360_teacher ON teacher_feedback_360(staff_user_id);


CREATE TABLE IF NOT EXISTS performance_improvement_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    staff_user_id UUID NOT NULL,
    
    issues_identified TEXT NOT NULL,
    action_steps TEXT NOT NULL,
    deadline_date DATE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active', -- active, completed, failed
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_performance_plans_staff ON performance_improvement_plans(staff_user_id);


-- ══════════════════════════════════════════════════════════════════════════════
-- 2. STUDENT WELLBEING & MEDICAL RECORDS
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS student_medical_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE UNIQUE,
    
    allergies TEXT,
    conditions TEXT,
    medications TEXT,
    health_insurance_info TEXT,
    emergency_contact_name VARCHAR(255),
    emergency_contact_phone VARCHAR(50),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_student_med_records_student ON student_medical_records(student_id);


CREATE TABLE IF NOT EXISTS infirmary_visit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    
    visit_date DATE NOT NULL,
    reason VARCHAR(255) NOT NULL,
    treatment_given TEXT,
    doctor_notes TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'treated', -- treated, referred_to_hospital
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_infirmary_visit_logs_student ON infirmary_visit_logs(student_id);


CREATE TABLE IF NOT EXISTS vaccination_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    
    vaccine_name VARCHAR(255) NOT NULL,
    dose_number INTEGER NOT NULL DEFAULT 1,
    administered_date DATE NOT NULL,
    next_due_date DATE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_vaccination_records_student ON vaccination_records(student_id);


CREATE TABLE IF NOT EXISTS first_aid_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    
    incident_description TEXT NOT NULL,
    first_aid_given TEXT NOT NULL,
    reporter_user_id UUID NOT NULL,
    incident_date DATE NOT NULL,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_first_aid_incidents_student ON first_aid_incidents(student_id);


CREATE TABLE IF NOT EXISTS wellbeing_surveys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    
    mood_score INTEGER NOT NULL DEFAULT 5,
    stress_level INTEGER NOT NULL DEFAULT 5,
    notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_wellbeing_surveys_student ON wellbeing_surveys(student_id);


CREATE TABLE IF NOT EXISTS medical_directory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    
    contact_name VARCHAR(255) NOT NULL,
    specialty VARCHAR(255),
    phone VARCHAR(50) NOT NULL,
    hospital_name VARCHAR(255),
    address TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_medical_directory_school ON medical_directory(school_id);
