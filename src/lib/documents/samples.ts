/**
 * The fictional student the design pickers are drawn with.
 *
 * Samples are built from this, never from a real child: a design gallery is
 * shown to whoever opens the settings, and a real student's marks, photograph
 * and date of birth are not decoration. The name says plainly that it is a
 * sample, so a card that escapes onto a desk cannot be mistaken for a record.
 */
import type { ReportCardDetail } from "./report-card";
import type { IdCardStudent } from "./id-card";

export const SAMPLE_REPORT_CARD: ReportCardDetail = {
  report_card: {
    id: "sample",
    period_label: "Term 2",
    academic_year: "2026-2027",
    total_marks: "512.500",
    max_total_marks: "600.000",
    percentage: "85.417",
    overall_grade: "A",
    position_in_class: 3,
    total_students_in_class: 38,
    attendance_percentage: "94.500",
    total_present_days: 104,
    total_school_days: 110,
    teacher_remarks: "Consistent, attentive work all term. Reading every day is paying off.",
    principal_remarks: "An excellent term. Well done.",
    is_published: true,
    published_at: "2026-09-18T09:00:00Z",
    signed_by_name: "Principal",
    signed_by_title: "Principal",
    trend_data: [
      { label: "Term 1", percentage: 78 },
      { label: "Term 2", percentage: 81.5 },
      { label: "Term 3", percentage: 85.4 },
    ],
  },
  subject_entries: [
    ["English", 88, "A"],
    ["Urdu", 91, "A+"],
    ["Mathematics", 84, "A"],
    ["Science", 87, "A"],
    ["Islamiat", 90, "A+"],
    ["Social Studies", 83, "A"],
  ].map(([name, marks, grade], i) => ({
    subject_name: String(name),
    marks_obtained: String(marks),
    max_marks: "100.000",
    percentage: String(marks),
    grade: String(grade),
    class_average: "72.4",
    highest_in_class: "96",
    position_in_subject: (i % 5) + 1,
  })),
  co_curricular: [
    { activity_name: "Debate Society", category: "Speech", grade: "A", remarks: "Inter-school finalist." },
    { activity_name: "Cricket", category: "Sports", grade: "B" },
  ],
  student: {
    id: "sample",
    first_name: "Sample",
    last_name: "Student",
    roll_number: "17",
    registration_number: "SAMPLE-0417",
    date_of_birth: "2014-03-12",
    class_name: "Grade 7",
    section_name: "Blue",
  },
};

export const SAMPLE_ID_CARD_STUDENT: IdCardStudent = {
  id: "sample",
  first_name: "Sample",
  last_name: "Student",
  roll_number: "17",
  registration_number: "SAMPLE-0417",
  date_of_birth: "2014-03-12",
  blood_group: "B+",
  card_valid_until: "2027-06-30",
  profile_image_url: null,
  emergency_contact: "0300 0000000",
  class_name: "Grade 7",
  section_name: "Blue",
};
