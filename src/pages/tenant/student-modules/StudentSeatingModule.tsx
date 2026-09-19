import { MySeatsView } from "@/components/exams/MySeatsView";

/** The student's own exam halls and seats, as allocated by the school. */
export function StudentSeatingModule() {
  return <MySeatsView audience="student" />;
}

export default StudentSeatingModule;
