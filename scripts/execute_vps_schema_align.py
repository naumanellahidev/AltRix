#!/usr/bin/env python3
import subprocess
import sys

sql = """
ALTER TABLE public.book_issues ADD COLUMN IF NOT EXISTS fine_per_day NUMERIC(10, 2) DEFAULT 20.00;
ALTER TABLE public.book_issues ADD COLUMN IF NOT EXISTS campus_id UUID;

ALTER TABLE public.library_books ADD COLUMN IF NOT EXISTS campus_id UUID;
ALTER TABLE public.library_books ADD COLUMN IF NOT EXISTS barcode VARCHAR(100);
ALTER TABLE public.library_books ADD COLUMN IF NOT EXISTS shelf_location VARCHAR(100);
ALTER TABLE public.library_books ADD COLUMN IF NOT EXISTS publisher VARCHAR(255);
ALTER TABLE public.library_books ADD COLUMN IF NOT EXISTS publication_year INTEGER;

CREATE TABLE IF NOT EXISTS public.book_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL,
    campus_id UUID,
    book_id UUID NOT NULL,
    student_id UUID NOT NULL,
    reserved_at TIMESTAMPTZ DEFAULT now(),
    status VARCHAR(50) DEFAULT 'active'
);

ALTER TABLE public.school_events ADD COLUMN IF NOT EXISTS campus_id UUID;
ALTER TABLE public.school_events ADD COLUMN IF NOT EXISTS audience VARCHAR(50) DEFAULT 'all';
ALTER TABLE public.school_events ADD COLUMN IF NOT EXISTS rsvp_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.school_events ADD COLUMN IF NOT EXISTS rsvp_count INTEGER DEFAULT 0;
ALTER TABLE public.school_events ADD COLUMN IF NOT EXISTS max_attendees INTEGER;

GRANT ALL ON ALL TABLES IN SCHEMA public TO altrix_app;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO altrix_app;
GRANT ALL ON ALL TABLES IN SCHEMA public TO altrix_admin;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO altrix_admin;
"""

print("Executing SQL migrations directly on production VPS via SSH...")
p = subprocess.Popen(
    ["ssh", "altrixadmin@169.58.111.159", "sudo -u postgres psql -d altrix"],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True
)
out, err = p.communicate(input=sql)
print("STDOUT:\n", out)
print("STDERR:\n", err)
print("EXIT CODE:", p.returncode)

if p.returncode != 0:
    sys.exit(1)

# Now verify the columns on book_issues
p2 = subprocess.run(
    ["ssh", "altrixadmin@169.58.111.159", "sudo -u postgres psql -d altrix -c '\\d book_issues'"],
    capture_output=True,
    text=True
)
print("=== VERIFIED BOOK_ISSUES TABLE ===")
print(p2.stdout)
