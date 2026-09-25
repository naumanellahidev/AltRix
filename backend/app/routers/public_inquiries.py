"""
The website enquiry form: a parent who is not signed in asks about admission.

It never worked for the people it is for. The page resolved the school, read
the form's settings and saved the enquiry through the signed-in data proxy,
and all three are refused without a login (401). A visitor saw the school not
found, or an error on submit. The one database function it called,
``create_public_lead``, did not exist either.

These two endpoints need no login: one reads what the form shows (the
school's public details and the form's settings), and one records the
enquiry through ``create_public_lead`` — which also puts it in front of the
admissions staff. Submissions are rate-limited per visitor.
"""
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.dependencies import DbSession
from app.utils.rate_limit import limiter

router = APIRouter(prefix="/public-inquiries", tags=["Public enquiries"])


class PublicInquiry(BaseModel):
    parent_name: str = Field(min_length=2, max_length=120)
    email: Optional[str] = Field(default=None, max_length=200)
    phone: Optional[str] = Field(default=None, max_length=32)
    student_name: Optional[str] = Field(default=None, max_length=120)
    student_grade: Optional[str] = Field(default=None, max_length=80)
    prior_school: Optional[str] = Field(default=None, max_length=200)
    message: Optional[str] = Field(default=None, max_length=1500)
    #: Left empty by people; filled by bots that fill every field.
    website: Optional[str] = Field(default=None, max_length=200)


@router.get("/{slug}")
async def inquiry_form(slug: str, db: DbSession):
    """What the form shows: the school's public details and the form's settings."""
    school = (await db.execute(text(
        "SELECT id, name, slug, logo_url, email, phone FROM schools WHERE slug = :slug LIMIT 1"
    ), {"slug": slug})).mappings().first()
    if not school:
        raise HTTPException(status_code=404, detail="That school was not found.")
    settings = (await db.execute(text(
        """
        SELECT form_title, show_logo, success_message, accent_color, fields_config, required_config
          FROM school_inquiry_settings WHERE school_id = CAST(:sid AS uuid) LIMIT 1
        """
    ), {"sid": str(school["id"])})).mappings().first()
    return {
        "school": {k: (str(v) if k == "id" else v) for k, v in dict(school).items()},
        "settings": dict(settings) if settings else None,
    }


@router.post("/{slug}", status_code=201)
@limiter.limit("5/minute")
async def submit_inquiry(request: Request, slug: str, body: PublicInquiry, db: DbSession):
    """Record the enquiry as a CRM lead and tell the school's admissions staff."""
    if body.website:
        # A bot filled the hidden field. Answered as if accepted, and dropped.
        return {"ok": True}
    if not (body.email or "").strip() and not (body.phone or "").strip():
        raise HTTPException(status_code=422, detail="Please give a phone number or an email address so the school can reply.")
    notes = " | ".join(part for part in (
        f"Child: {body.student_name.strip()}" if body.student_name and body.student_name.strip() else "",
        f"Target grade: {body.student_grade.strip()}" if body.student_grade and body.student_grade.strip() else "",
        f"Prior school: {body.prior_school.strip()}" if body.prior_school and body.prior_school.strip() else "",
        f"Message: {body.message.strip()}" if body.message and body.message.strip() else "",
    ) if part)
    try:
        lead_id = (await db.execute(text(
            "SELECT create_public_lead(:slug, :name, :email, :phone, :notes, 'Website Inquiry Form')"
        ), {
            "slug": slug, "name": body.parent_name, "email": body.email, "phone": body.phone,
            "notes": notes or None,
        })).scalar()
        await db.commit()
    except Exception as exc:
        await db.rollback()
        # The function's own messages ("That school was not found.") are for
        # the visitor; anything else is not.
        message = str(getattr(exc, "orig", exc)).split("\n")[0]
        if "not found" in message or "Please give" in message:
            raise HTTPException(status_code=422, detail=message.split(": ", 1)[-1])
        raise HTTPException(status_code=503, detail="The enquiry could not be saved. Please try again in a moment.")
    return {"ok": True, "lead_id": str(lead_id)}
