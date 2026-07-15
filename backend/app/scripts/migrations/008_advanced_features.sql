-- Migration 008: Advanced Report Cards, Curriculum Framework, Enhanced Fee Portal
-- Run this after all previous migrations

-- ═══════════════════════════════════════════════════════════════════════════════
-- REPORT CARD SYSTEM
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS report_card_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    layout_config JSONB DEFAULT '{"orientation":"portrait","paper_size":"A4","show_school_logo":true,"show_student_photo":true,"show_watermark":false,"header_style":"classic","color_scheme":"default"}'::jsonb,
    grading_system TEXT NOT NULL DEFAULT 'percentage',
    show_position BOOLEAN NOT NULL DEFAULT TRUE,
    show_class_average BOOLEAN NOT NULL DEFAULT TRUE,
    show_highest_marks BOOLEAN NOT NULL DEFAULT FALSE,
    show_attendance BOOLEAN NOT NULL DEFAULT TRUE,
    show_co_curricular BOOLEAN NOT NULL DEFAULT TRUE,
    show_teacher_remarks BOOLEAN NOT NULL DEFAULT TRUE,
    show_principal_remarks BOOLEAN NOT NULL DEFAULT TRUE,
    show_trend_graph BOOLEAN NOT NULL DEFAULT TRUE,
    show_digital_signature BOOLEAN NOT NULL DEFAULT TRUE,
    principal_signature_name TEXT,
    principal_signature_title TEXT DEFAULT 'Principal',
    enable_qr_verification BOOLEAN NOT NULL DEFAULT TRUE,
    language TEXT NOT NULL DEFAULT 'en',
    co_curricular_categories JSONB DEFAULT '["Sports","Arts","Music","Drama","Debate","Community Service","Leadership"]'::jsonb,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS report_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    template_id UUID REFERENCES report_card_templates(id),
    exam_id UUID REFERENCES exams(id),
    period_type TEXT NOT NULL DEFAULT 'term',
    period_label TEXT,
    academic_year TEXT,
    total_marks FLOAT,
    max_total_marks FLOAT,
    percentage FLOAT,
    gpa FLOAT,
    overall_grade TEXT,
    position_in_class INTEGER,
    total_students_in_class INTEGER,
    attendance_percentage FLOAT,
    total_present_days INTEGER,
    total_school_days INTEGER,
    teacher_remarks TEXT,
    principal_remarks TEXT,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    published_at TIMESTAMPTZ,
    qr_verification_token TEXT UNIQUE,
    signed_by_name TEXT,
    signed_by_title TEXT,
    signed_at TIMESTAMPTZ,
    trend_data JSONB,
    generated_by UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS report_card_subject_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_card_id UUID NOT NULL REFERENCES report_cards(id) ON DELETE CASCADE,
    subject_id UUID REFERENCES subjects(id),
    subject_name TEXT NOT NULL,
    marks_obtained FLOAT,
    max_marks FLOAT,
    percentage FLOAT,
    grade TEXT,
    gpa_points FLOAT,
    position_in_subject INTEGER,
    class_average FLOAT,
    highest_in_class FLOAT,
    teacher_comment TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS co_curricular_grades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_card_id UUID NOT NULL REFERENCES report_cards(id) ON DELETE CASCADE,
    activity_name TEXT NOT NULL,
    category TEXT,
    grade TEXT,
    score FLOAT,
    max_score FLOAT,
    remarks TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS grade_scales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    min_percentage FLOAT NOT NULL,
    max_percentage FLOAT NOT NULL DEFAULT 100,
    gpa_points FLOAT,
    description TEXT,
    color TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- CURRICULUM FRAMEWORK
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS curriculum_presets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    description TEXT,
    is_global BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    grade_structure JSONB DEFAULT '{"grading_type":"percentage","pass_percentage":33,"grade_boundaries":[]}'::jsonb,
    strand_definitions JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ
);

-- Seed default curriculum presets
INSERT INTO curriculum_presets (id, name, code, description, is_global, grade_structure, strand_definitions)
VALUES
    (gen_random_uuid(), 'Punjab Board (SNC)', 'punjab_snc', 'Single National Curriculum - Punjab Board', TRUE,
     '{"grading_type":"percentage","pass_percentage":33,"grade_boundaries":[{"label":"A+","min":90,"max":100},{"label":"A","min":80,"max":89},{"label":"B","min":70,"max":79},{"label":"C","min":60,"max":69},{"label":"D","min":50,"max":59},{"label":"E","min":33,"max":49},{"label":"F","min":0,"max":32}]}'::jsonb,
     '[{"subject":"English","strands":["Reading","Writing","Listening","Speaking","Grammar"]},{"subject":"Mathematics","strands":["Number Sense","Algebra","Geometry","Measurement","Data Handling"]},{"subject":"Urdu","strands":["Reading","Writing","Grammar","Comprehension"]},{"subject":"Science","strands":["Life Science","Physical Science","Earth Science"]},{"subject":"Islamiat","strands":["Quran","Hadith","Islamic History","Ethics"]}]'::jsonb),
    (gen_random_uuid(), 'Cambridge IGCSE', 'cambridge', 'Cambridge International IGCSE Curriculum', TRUE,
     '{"grading_type":"letter","pass_percentage":30,"grade_boundaries":[{"label":"A*","min":90,"max":100},{"label":"A","min":80,"max":89},{"label":"B","min":70,"max":79},{"label":"C","min":60,"max":69},{"label":"D","min":50,"max":59},{"label":"E","min":40,"max":49},{"label":"F","min":30,"max":39},{"label":"G","min":20,"max":29},{"label":"U","min":0,"max":19}]}'::jsonb,
     '[{"subject":"English Language","strands":["Reading","Writing","Directed Writing","Composition"]},{"subject":"Mathematics","strands":["Number","Algebra","Functions","Coordinate Geometry","Trigonometry","Vectors","Statistics","Probability"]},{"subject":"Physics","strands":["Motion","Energy","Waves","Electricity","Magnetism","Nuclear Physics"]},{"subject":"Chemistry","strands":["States of Matter","Atoms","Stoichiometry","Electrochemistry","Chemical Energetics","Organic Chemistry"]},{"subject":"Biology","strands":["Cell Biology","Organisation","Infection","Bioenergetics","Homeostasis","Inheritance","Ecology"]}]'::jsonb),
    (gen_random_uuid(), 'IB Middle Years Programme', 'ib_myp', 'International Baccalaureate MYP Framework', TRUE,
     '{"grading_type":"criterion","pass_percentage":28,"grade_boundaries":[{"label":"7","min":85,"max":100},{"label":"6","min":72,"max":84},{"label":"5","min":58,"max":71},{"label":"4","min":44,"max":57},{"label":"3","min":30,"max":43},{"label":"2","min":15,"max":29},{"label":"1","min":1,"max":14}]}'::jsonb,
     '[{"subject":"Language & Literature","strands":["Analysing","Organising","Producing Text","Using Language"]},{"subject":"Mathematics","strands":["Knowing & Understanding","Investigating Patterns","Communicating","Applying Mathematics"]},{"subject":"Sciences","strands":["Knowing & Understanding","Inquiring & Designing","Processing & Evaluating","Reflecting on Science"]},{"subject":"Individuals & Societies","strands":["Knowing & Understanding","Investigating","Communicating","Thinking Critically"]}]'::jsonb)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS learning_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    preset_id UUID REFERENCES curriculum_presets(id),
    subject_id UUID REFERENCES subjects(id),
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    strand TEXT,
    sub_strand TEXT,
    grade_level INTEGER,
    bloom_level TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS assessment_lo_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    assessment_id UUID NOT NULL REFERENCES academic_assessments(id) ON DELETE CASCADE,
    learning_outcome_id UUID NOT NULL REFERENCES learning_outcomes(id) ON DELETE CASCADE,
    weightage FLOAT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assessment_criteria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    assessment_id UUID REFERENCES academic_assessments(id) ON DELETE CASCADE,
    learning_outcome_id UUID REFERENCES learning_outcomes(id),
    criteria_name TEXT NOT NULL,
    description TEXT,
    max_score FLOAT NOT NULL DEFAULT 4,
    rubric_levels JSONB DEFAULT '[{"level":4,"label":"Exceeding","description":"Exceeds expected standards consistently"},{"level":3,"label":"Meeting","description":"Meets expected standards"},{"level":2,"label":"Approaching","description":"Approaching expected standards"},{"level":1,"label":"Beginning","description":"Below expected standards"}]'::jsonb,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS criteria_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    criteria_id UUID NOT NULL REFERENCES assessment_criteria(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    score FLOAT,
    level_achieved TEXT,
    teacher_feedback TEXT,
    scored_by UUID,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS strand_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    subject_id UUID REFERENCES subjects(id),
    strand_name TEXT NOT NULL,
    sub_strand_name TEXT,
    academic_year TEXT,
    term_label TEXT,
    score FLOAT,
    max_score FLOAT,
    percentage FLOAT,
    level TEXT,
    grade TEXT,
    assessed_by UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS grade_boundaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    subject_id UUID REFERENCES subjects(id),
    preset_id UUID REFERENCES curriculum_presets(id),
    label TEXT NOT NULL,
    min_percentage FLOAT NOT NULL,
    max_percentage FLOAT NOT NULL DEFAULT 100,
    gpa_equivalent FLOAT,
    description TEXT,
    is_passing BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- ENHANCED FEE PORTAL
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS installment_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL REFERENCES fee_invoices(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    total_amount FLOAT NOT NULL,
    total_installments INTEGER NOT NULL,
    installment_amount FLOAT NOT NULL,
    frequency TEXT NOT NULL DEFAULT 'monthly',
    start_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS installment_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES installment_plans(id) ON DELETE CASCADE,
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    installment_number INTEGER NOT NULL,
    due_date DATE NOT NULL,
    amount FLOAT NOT NULL,
    paid_amount FLOAT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    payment_id UUID REFERENCES fee_payments(id),
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sibling_discounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sibling_number INTEGER NOT NULL,
    discount_type TEXT NOT NULL DEFAULT 'percent',
    discount_value FLOAT NOT NULL,
    applies_to TEXT DEFAULT 'tuition',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS tax_certificates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    parent_user_id UUID,
    fiscal_year TEXT NOT NULL,
    certificate_number TEXT NOT NULL UNIQUE,
    total_fees_paid FLOAT NOT NULL,
    total_tuition FLOAT NOT NULL DEFAULT 0,
    total_other_charges FLOAT NOT NULL DEFAULT 0,
    school_ntn TEXT,
    payment_details JSONB,
    generated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fee_escalations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL REFERENCES fee_invoices(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    escalation_level INTEGER NOT NULL DEFAULT 1,
    escalation_type TEXT NOT NULL DEFAULT 'reminder',
    overdue_days INTEGER NOT NULL DEFAULT 0,
    overdue_amount FLOAT NOT NULL,
    action_taken TEXT,
    notification_sent BOOLEAN NOT NULL DEFAULT FALSE,
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    escalated_by UUID,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_gateway_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    gateway_name TEXT NOT NULL,
    display_name TEXT,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    config JSONB,
    supported_methods TEXT,
    min_amount FLOAT,
    max_amount FLOAT,
    processing_fee_type TEXT,
    processing_fee_value FLOAT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ,
    UNIQUE (school_id, gateway_name)
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_report_cards_school ON report_cards(school_id);
CREATE INDEX IF NOT EXISTS idx_report_cards_student ON report_cards(student_id);
CREATE INDEX IF NOT EXISTS idx_report_cards_published ON report_cards(school_id, is_published);
CREATE INDEX IF NOT EXISTS idx_report_card_entries_card ON report_card_subject_entries(report_card_id);
CREATE INDEX IF NOT EXISTS idx_co_curricular_card ON co_curricular_grades(report_card_id);
CREATE INDEX IF NOT EXISTS idx_grade_scales_school ON grade_scales(school_id);
CREATE INDEX IF NOT EXISTS idx_report_card_qr ON report_cards(qr_verification_token);

CREATE INDEX IF NOT EXISTS idx_learning_outcomes_school ON learning_outcomes(school_id);
CREATE INDEX IF NOT EXISTS idx_learning_outcomes_subject ON learning_outcomes(subject_id);
CREATE INDEX IF NOT EXISTS idx_learning_outcomes_strand ON learning_outcomes(school_id, strand);
CREATE INDEX IF NOT EXISTS idx_assessment_lo_map ON assessment_lo_mappings(assessment_id);
CREATE INDEX IF NOT EXISTS idx_criteria_scores_student ON criteria_scores(student_id);
CREATE INDEX IF NOT EXISTS idx_strand_assessments_student ON strand_assessments(student_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_grade_boundaries_school ON grade_boundaries(school_id);

CREATE INDEX IF NOT EXISTS idx_installment_plans_invoice ON installment_plans(invoice_id);
CREATE INDEX IF NOT EXISTS idx_installment_plans_student ON installment_plans(student_id);
CREATE INDEX IF NOT EXISTS idx_installment_payments_plan ON installment_payments(plan_id);
CREATE INDEX IF NOT EXISTS idx_sibling_discounts_school ON sibling_discounts(school_id);
CREATE INDEX IF NOT EXISTS idx_tax_certificates_student ON tax_certificates(student_id, fiscal_year);
CREATE INDEX IF NOT EXISTS idx_fee_escalations_invoice ON fee_escalations(invoice_id);
CREATE INDEX IF NOT EXISTS idx_fee_escalations_active ON fee_escalations(school_id, resolved);
CREATE INDEX IF NOT EXISTS idx_gateway_configs_school ON payment_gateway_configs(school_id);
