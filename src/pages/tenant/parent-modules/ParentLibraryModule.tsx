import { FamilyLibrary } from "@/components/library/FamilyLibrary";

/** The selected child's library record (it showed invented loans before). */
export function ParentLibraryModule({ child }: { child?: any }) {
  const name = child ? [child.first_name, child.last_name].filter(Boolean).join(" ") : null;
  return <FamilyLibrary studentId={child?.student_id ?? null} studentName={name} audience="parent" />;
}

export default ParentLibraryModule;
