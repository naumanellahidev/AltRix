-- Create platform_billing_plans
CREATE TABLE IF NOT EXISTS platform_billing_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR NOT NULL,
    slug VARCHAR NOT NULL UNIQUE,
    price_monthly INTEGER,
    price_annual INTEGER,
    max_students INTEGER,
    max_campuses INTEGER,
    features JSONB,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Create exam_datesheets
CREATE TABLE IF NOT EXISTS exam_datesheets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    class_section_id UUID NOT NULL REFERENCES class_sections(id) ON DELETE CASCADE,
    subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
    exam_date VARCHAR NOT NULL,
    start_time VARCHAR,
    end_time VARCHAR,
    room VARCHAR,
    max_marks DOUBLE PRECISION,
    passing_marks DOUBLE PRECISION,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Create assessment_results
CREATE TABLE IF NOT EXISTS assessment_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    assessment_id UUID NOT NULL REFERENCES academic_assessments(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    marks_obtained DOUBLE PRECISION,
    grade VARCHAR,
    remarks TEXT,
    is_absent BOOLEAN DEFAULT FALSE,
    graded_by UUID,
    created_at TIMESTAMPTZ DEFAULT now()
);
