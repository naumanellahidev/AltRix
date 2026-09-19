import { MySeatsView } from "@/components/exams/MySeatsView";
import type { ChildInfo } from "@/hooks/useMyChildren";

/** The selected child's exam halls and seats, as allocated by the school. */
export function ParentSeatingModule({ child }: { child?: ChildInfo | null }) {
  if (!child) {
    return <div className="py-12 text-center text-muted-foreground">Please select a child to see their exam seats.</div>;
  }
  return (
    <MySeatsView
      audience="parent"
      studentId={child.student_id}
      studentName={[child.first_name, child.last_name].filter(Boolean).join(" ")}
    />
  );
}

export default ParentSeatingModule;
