"""
Attendance models: sessions and entries for student attendance,
plus staff attendance.
"""
import uuid
from sqlalchemy import Column, DateTime, Date, ForeignKey, String, Text, Float, Numeric
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.database import Base


class AttendanceSession(Base):
    __tablename__ = "attendance_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    campus_id = Column(UUID(as_uuid=True), ForeignKey("campuses.id"), nullable=True)
    class_section_id = Column(UUID(as_uuid=True), ForeignKey("class_sections.id"), nullable=False)
    session_date = Column(Date, nullable=False)
    period_label = Column(String, nullable=True)
    created_by = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)


class AttendanceEntry(Base):
    __tablename__ = "attendance_entries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    campus_id = Column(UUID(as_uuid=True), ForeignKey("campuses.id"), nullable=True)
    session_id = Column(UUID(as_uuid=True), ForeignKey("attendance_sessions.id"), nullable=False)
    student_id = Column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False)
    status = Column(String, nullable=False, default="present")  # present, absent, late, excused
    note = Column(Text, nullable=True)
    created_by = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)


class StaffAttendance(Base):
    __tablename__ = "hr_staff_attendance"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    school_id = Column(UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), nullable=False)
    attendance_date = Column(Date, nullable=False)
    status = Column(String, nullable=False, default="present")  # present, absent, late, half_day, leave
    notes = Column(Text, nullable=True)
    recorded_by = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
    clock_in = Column(DateTime(timezone=True), nullable=True)
    clock_out = Column(DateTime(timezone=True), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    altitude = Column(Float, nullable=True)
    reviewed_by = Column(UUID(as_uuid=True), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)

    @property
    def campus_id(self):
        return None

    @campus_id.setter
    def campus_id(self, val):
        pass

    @property
    def check_in_time(self):
        return self.clock_in.isoformat() if self.clock_in else None

    @check_in_time.setter
    def check_in_time(self, val):
        if val:
            from datetime import datetime
            try:
                self.clock_in = datetime.fromisoformat(val)
            except ValueError:
                pass

    @property
    def check_out_time(self):
        return self.clock_out.isoformat() if self.clock_out else None

    @check_out_time.setter
    def check_out_time(self, val):
        if val:
            from datetime import datetime
            try:
                self.clock_out = datetime.fromisoformat(val)
            except ValueError:
                pass

    @property
    def marked_by(self):
        return self.recorded_by

    @marked_by.setter
    def marked_by(self, val):
        self.recorded_by = val

