import { FamilyHostel } from "@/components/hostel/FamilyHostel";

/** The selected child's hostel stay (it showed an invented one before). */
export function ParentHostelModule({ child }: { child?: any }) {
  return <FamilyHostel studentId={child?.student_id ?? null} audience="parent" />;
}

export default ParentHostelModule;
