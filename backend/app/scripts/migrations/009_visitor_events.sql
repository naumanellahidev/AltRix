-- Migration 009: Visitor Management and Enhanced Events Calendar DDL
-- Run this after previous migrations

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. VISITOR MANAGEMENT TABLES
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS visitor_passes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    parent_user_id UUID,
    student_id UUID REFERENCES students(id) ON DELETE SET NULL,
    
    visitor_name VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(255),
    cnic VARCHAR(50),
    
    photo_url VARCHAR(512),
    purpose VARCHAR(50) NOT NULL DEFAULT 'meeting',
    details TEXT,
    
    qr_code_token VARCHAR(255) NOT NULL UNIQUE,
    pass_type VARCHAR(50) NOT NULL DEFAULT 'pre_registered',
    checkin_status VARCHAR(50) NOT NULL DEFAULT 'pending',
    
    scheduled_date DATE NOT NULL,
    checkin_at TIMESTAMP WITH TIME ZONE,
    checkout_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_visitor_passes_school ON visitor_passes(school_id);
CREATE INDEX IF NOT EXISTS idx_visitor_passes_qr ON visitor_passes(qr_code_token);
CREATE INDEX IF NOT EXISTS idx_visitor_passes_parent ON visitor_passes(parent_user_id);
CREATE INDEX IF NOT EXISTS idx_visitor_passes_status ON visitor_passes(checkin_status);


CREATE TABLE IF NOT EXISTS visitor_blacklist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    
    name VARCHAR(255) NOT NULL,
    cnic VARCHAR(50),
    phone VARCHAR(50),
    
    reason TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_visitor_blacklist_school ON visitor_blacklist(school_id);
CREATE INDEX IF NOT EXISTS idx_visitor_blacklist_cnic ON visitor_blacklist(cnic);


-- ══════════════════════════════════════════════════════════════════════════════
-- 2. EVENTS EXTENSIONS TABLES
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS event_rsvps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES school_events(id) ON DELETE CASCADE,
    parent_user_id UUID NOT NULL,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    
    status VARCHAR(50) NOT NULL DEFAULT 'going',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_event_rsvps_school ON event_rsvps(school_id);
CREATE INDEX IF NOT EXISTS idx_event_rsvps_event ON event_rsvps(event_id);
CREATE INDEX IF NOT EXISTS idx_event_rsvps_parent ON event_rsvps(parent_user_id);


CREATE TABLE IF NOT EXISTS sports_scorecards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES school_events(id) ON DELETE CASCADE,
    
    title VARCHAR(255) NOT NULL,
    house_name VARCHAR(100) NOT NULL,
    points INTEGER NOT NULL DEFAULT 0,
    position INTEGER,
    details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_sports_scorecards_school ON sports_scorecards(school_id);
CREATE INDEX IF NOT EXISTS idx_sports_scorecards_event ON sports_scorecards(event_id);


CREATE TABLE IF NOT EXISTS annual_function_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES school_events(id) ON DELETE CASCADE,
    
    task_name VARCHAR(255) NOT NULL,
    assigned_to UUID,
    due_date DATE,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    priority VARCHAR(50) NOT NULL DEFAULT 'medium',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_annual_function_tasks_school ON annual_function_tasks(school_id);
CREATE INDEX IF NOT EXISTS idx_annual_function_tasks_event ON annual_function_tasks(event_id);
