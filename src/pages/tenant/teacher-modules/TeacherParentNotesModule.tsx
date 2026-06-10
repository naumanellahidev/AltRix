import { useParams } from "react-router-dom";
import { useTenant } from "@/hooks/useTenant";
import { useMemo } from "react";
import { useOfflineSections, useOfflineTeacherAssignments } from "@/hooks/useOfflineData";
import { ParentBehaviorNotesView } from "@/components/behavior/ParentBehaviorNotesView";

export function TeacherParentNotesModule() {
  const { schoolSlug } = useParams();
  const tenant = useTenant(schoolSlug);
  const schoolId = tenant.status === "ready" ? tenant.schoolId : null;

  const sectionsData = useOfflineSections(schoolId);
  const teacherAssignmentsData = useOfflineTeacherAssignments(schoolId);

  const restrictToSectionIds = useMemo(() => {
    const teacherSectionIds = new Set(
      teacherAssignmentsData.data.map((a) => a.classSectionId)
    );
    return sectionsData.data
      .filter((s) => teacherSectionIds.has(s.id))
      .map((s) => s.id);
  }, [sectionsData.data, teacherAssignmentsData.data]);

  return (
    <ParentBehaviorNotesView
      schoolId={schoolId}
      restrictToSectionIds={restrictToSectionIds}
      title="Parent Notes (My Classes)"
    />
  );
}

export default TeacherParentNotesModule;
