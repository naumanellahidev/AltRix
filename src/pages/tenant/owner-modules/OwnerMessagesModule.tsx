import { MessagesModule } from "@/pages/tenant/modules/MessagesModule";
import { useActiveCampus } from "@/hooks/useActiveCampus";

interface Props {
  schoolId: string | null;
}

export function OwnerMessagesModule({ schoolId }: Props) {
  const activeCampusId = useActiveCampus(schoolId);

  if (!schoolId) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  // Remount the messaging stack on campus switch so all child queries refetch.
  return <MessagesModule key={activeCampusId ?? "all"} schoolId={schoolId} isStudentPortal={false} />;
}
