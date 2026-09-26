import ParentBusTrackingModule from "@/pages/tenant/parent-modules/ParentBusTrackingModule";

/**
 * The student's own bus, stop and crew, from their transport assignment.
 * This showed an invented driver and conductor (with a real-looking phone
 * number), route and timings to every student.
 */
export function StudentTransportModule() {
  return <ParentBusTrackingModule audience="student" />;
}

export default StudentTransportModule;
