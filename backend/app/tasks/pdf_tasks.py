"""
PDF generation background tasks.
Generates report cards, fee invoices, and ID cards.
"""
import logging
import os
import uuid
from typing import Any, Optional

from app.celery_app import celery_app
from app.cache import cache

logger = logging.getLogger("altrix.tasks.pdf")

PDF_OUTPUT_DIR = os.getenv("PDF_OUTPUT_DIR", "/tmp/altrix_pdfs")


def _ensure_dir(path: str):
    os.makedirs(path, exist_ok=True)


@celery_app.task(
    name="app.tasks.pdf_tasks.generate_report_card_pdf",
    bind=True,
    max_retries=2,
    default_retry_delay=120,
    queue="pdfs",
)
def generate_report_card_pdf(
    self,
    student_id: str,
    exam_id: str,
    school_id: str,
    output_path: Optional[str] = None,
):
    """
    Generate a PDF report card for a student's exam results.
    Returns the file path of the generated PDF.
    """
    try:
        import asyncio
        from reportlab.lib.pagesizes import A4
        from reportlab.lib import colors
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
        from reportlab.lib.styles import getSampleStyleSheet

        async def _fetch_data():
            from app.database import get_db_context
            from app.models.people import Student
            from app.models.exams import ExamResult, Exam
            from sqlalchemy import select

            async with get_db_context() as db:
                student_result = await db.execute(
                    select(Student).where(Student.id == uuid.UUID(student_id))
                )
                student = student_result.scalar_one_or_none()
                results_q = await db.execute(
                    select(ExamResult).where(
                        ExamResult.exam_id == uuid.UUID(exam_id),
                        ExamResult.student_id == uuid.UUID(student_id),
                    )
                )
                results = results_q.scalars().all()
                return student, results

        async def _check_cache():
            cache_key = cache.build_key(school_id=school_id, base_key=f"pdf:report_card:{student_id}:{exam_id}")
            return await cache.get(cache_key)

        loop = asyncio.new_event_loop()
        cached_file = loop.run_until_complete(_check_cache())
        if cached_file and os.path.exists(cached_file):
            loop.close()
            logger.info(f"Returning cached report card PDF for student {student_id}")
            return {"status": "generated", "path": cached_file}

        student, results = loop.run_until_complete(_fetch_data())
        loop.close()

        if not student:
            logger.warning(f"Student {student_id} not found for PDF generation")
            return {"error": "Student not found"}

        _ensure_dir(PDF_OUTPUT_DIR)
        filename = output_path or os.path.join(
            PDF_OUTPUT_DIR, f"report_card_{student_id}_{exam_id}.pdf"
        )

        styles = getSampleStyleSheet()
        doc = SimpleDocTemplate(filename, pagesize=A4)
        elements: list[Any] = []

        # Header
        elements.append(Paragraph("STUDENT REPORT CARD", styles["Title"]))
        elements.append(Spacer(1, 12))
        elements.append(Paragraph(
            f"Student: {student.first_name} {student.last_name or ''}",
            styles["Normal"]
        ))
        elements.append(Spacer(1, 12))

        # Results table
        data: list[list[Any]] = [["Subject", "Marks Obtained", "Max Marks", "Grade"]]
        for r in results:
            data.append([
                str(r.subject_id or "-"),
                str(r.marks_obtained or 0),
                str(r.max_marks or 100),
                str(r.grade or "-"),
            ])

        if len(data) > 1:
            table = Table(data, colWidths=[200, 100, 100, 80])
            table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e40af")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("ALIGN", (1, 0), (-1, -1), "CENTER"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f0f4ff")]),
            ]))
            elements.append(table)

        doc.build(elements)
        
        async def _set_cache():
            cache_key = cache.build_key(school_id=school_id, base_key=f"pdf:report_card:{student_id}:{exam_id}")
            await cache.set(cache_key, filename, ttl=86400)

        loop2 = asyncio.new_event_loop()
        loop2.run_until_complete(_set_cache())
        loop2.close()

        logger.info(f"Report card PDF generated: {filename}")
        return {"status": "generated", "path": filename}

    except Exception as exc:
        logger.error(f"Report card PDF failed for student {student_id}: {exc}")
        raise self.retry(exc=exc)


@celery_app.task(
    name="app.tasks.pdf_tasks.generate_fee_invoice_pdf",
    bind=True,
    max_retries=2,
    default_retry_delay=60,
    queue="pdfs",
)
def generate_fee_invoice_pdf(
    self,
    voucher_id: str,
    school_id: str,
    output_path: Optional[str] = None,
):
    """Generate a printable fee invoice PDF."""
    try:
        import asyncio
        from reportlab.lib.pagesizes import A4
        from reportlab.lib import colors
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
        from reportlab.lib.styles import getSampleStyleSheet

        async def _fetch():
            from app.database import get_db_context
            from app.models.finance import FeeVoucher
            from app.models.people import Student
            from sqlalchemy import select

            async with get_db_context() as db:
                v_res = await db.execute(select(FeeVoucher).where(FeeVoucher.id == uuid.UUID(voucher_id)))
                voucher = v_res.scalar_one_or_none()
                student = None
                if voucher:
                    s_res = await db.execute(select(Student).where(Student.id == voucher.student_id))
                    student = s_res.scalar_one_or_none()
                return voucher, student

        async def _check_cache():
            cache_key = cache.build_key(school_id=school_id, base_key=f"pdf:invoice:{voucher_id}")
            return await cache.get(cache_key)

        loop = asyncio.new_event_loop()
        cached_file = loop.run_until_complete(_check_cache())
        if cached_file and os.path.exists(cached_file):
            loop.close()
            logger.info(f"Returning cached invoice PDF for voucher {voucher_id}")
            return {"status": "generated", "path": cached_file}

        voucher, student = loop.run_until_complete(_fetch())
        loop.close()

        if not voucher:
            return {"error": "Voucher not found"}

        _ensure_dir(PDF_OUTPUT_DIR)
        filename = output_path or os.path.join(PDF_OUTPUT_DIR, f"invoice_{voucher_id}.pdf")
        styles = getSampleStyleSheet()
        doc = SimpleDocTemplate(filename, pagesize=A4)
        elements: list[Any] = []

        elements.append(Paragraph("FEE INVOICE", styles["Title"]))
        elements.append(Spacer(1, 12))

        student_name = f"{student.first_name} {student.last_name or ''}" if student else "-"
        info = [
            ["Invoice No:", voucher.invoice_number or str(voucher_id)[:8]],
            ["Student:", student_name],
            ["Total Amount:", f"PKR {voucher.total_amount:,.2f}"],
            ["Status:", voucher.status.upper()],
            ["Due Date:", str(voucher.due_date or "-")],
        ]

        tbl = Table(info, colWidths=[150, 300])
        tbl.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.lightgrey),
            ("PADDING", (0, 0), (-1, -1), 8),
        ]))
        elements.append(tbl)
        doc.build(elements)

        async def _set_cache():
            cache_key = cache.build_key(school_id=school_id, base_key=f"pdf:invoice:{voucher_id}")
            await cache.set(cache_key, filename, ttl=86400)

        loop2 = asyncio.new_event_loop()
        loop2.run_until_complete(_set_cache())
        loop2.close()

        logger.info(f"Invoice PDF generated: {filename}")
        return {"status": "generated", "path": filename}

    except Exception as exc:
        logger.error(f"Invoice PDF failed for {voucher_id}: {exc}")
        raise self.retry(exc=exc)


@celery_app.task(
    name="app.tasks.pdf_tasks.generate_id_card_pdf",
    bind=True,
    max_retries=2,
    queue="pdfs",
)
def generate_id_card_pdf(
    self,
    student_id: str,
    school_id: str,
    output_path: Optional[str] = None,
):
    """Generate a student ID card PDF."""
    try:
        import asyncio
        from reportlab.lib.pagesizes import A6
        from reportlab.lib import colors
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
        from reportlab.lib.styles import getSampleStyleSheet

        async def _fetch():
            from app.database import get_db_context
            from app.models.people import Student
            from app.models.core import School
            from sqlalchemy import select

            async with get_db_context() as db:
                s_res = await db.execute(select(Student).where(Student.id == uuid.UUID(student_id)))
                student = s_res.scalar_one_or_none()
                sch_res = await db.execute(select(School).where(School.id == uuid.UUID(school_id)))
                school = sch_res.scalar_one_or_none()
                return student, school

        async def _check_cache():
            cache_key = cache.build_key(school_id=school_id, base_key=f"pdf:id_card:{student_id}")
            return await cache.get(cache_key)

        loop = asyncio.new_event_loop()
        cached_file = loop.run_until_complete(_check_cache())
        if cached_file and os.path.exists(cached_file):
            loop.close()
            logger.info(f"Returning cached ID card PDF for student {student_id}")
            return {"status": "generated", "path": cached_file}

        student, school = loop.run_until_complete(_fetch())
        loop.close()

        if not student:
            return {"error": "Student not found"}

        _ensure_dir(PDF_OUTPUT_DIR)
        filename = output_path or os.path.join(PDF_OUTPUT_DIR, f"id_card_{student_id}.pdf")
        styles = getSampleStyleSheet()
        doc = SimpleDocTemplate(filename, pagesize=A6)
        elements: list[Any] = []

        school_name = school.name if school else "AltRix School"
        elements.append(Paragraph(school_name.upper(), styles["Title"]))
        elements.append(Paragraph("STUDENT ID CARD", styles["Heading2"]))
        elements.append(Spacer(1, 12))

        name = f"{student.first_name} {student.last_name or ''}"
        data = [
            ["Name:", name],
            ["Roll No:", student.roll_number or "-"],
            ["Gender:", student.gender or "-"],
            ["Blood Group:", student.blood_group or "-"],
        ]
        tbl = Table(data, colWidths=[80, 160])
        tbl.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
        ]))
        elements.append(tbl)
        doc.build(elements)

        async def _set_cache():
            cache_key = cache.build_key(school_id=school_id, base_key=f"pdf:id_card:{student_id}")
            await cache.set(cache_key, filename, ttl=86400)

        loop2 = asyncio.new_event_loop()
        loop2.run_until_complete(_set_cache())
        loop2.close()

        logger.info(f"ID card PDF generated: {filename}")
        return {"status": "generated", "path": filename}

    except Exception as exc:
        logger.error(f"ID card PDF failed for {student_id}: {exc}")
        raise self.retry(exc=exc)
