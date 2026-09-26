import { FamilyLibrary } from "@/components/library/FamilyLibrary";

/** The student's own library record (it showed invented loans before). */
export function StudentLibraryModule({ myStudent }: { myStudent?: any; schoolId?: string | null }) {
  const studentId = myStudent?.status === "ready" ? myStudent.studentId : null;
  return <FamilyLibrary studentId={studentId} audience="student" />;
}

export default StudentLibraryModule;
