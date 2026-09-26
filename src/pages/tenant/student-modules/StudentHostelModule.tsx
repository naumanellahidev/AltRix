import { FamilyHostel } from "@/components/hostel/FamilyHostel";

/** The student's own hostel stay (it showed an invented one before). */
export function StudentHostelModule({ myStudent }: { myStudent?: any }) {
  return <FamilyHostel studentId={myStudent?.status === "ready" ? myStudent.studentId : null} audience="student" />;
}

export default StudentHostelModule;
