/**
 * CounselorAtRiskModule
 * Wraps EarlyWarningSystem for the counseling/operations sidebar slot.
 */
import { EarlyWarningSystem } from "@/components/ai/EarlyWarningSystem";

interface Props { schoolId: string | null }

export function CounselorAtRiskModule({ schoolId }: Props) {
  return <EarlyWarningSystem schoolId={schoolId ?? ""} />;
}
