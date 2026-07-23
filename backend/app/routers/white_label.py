"""
Router for Full White-Label & Custom Domain Configuration.
"""
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.dependencies import CurrentUser, DbSession
from app.models.white_label import WhiteLabelSettings

router = APIRouter(prefix="/white-label", tags=["White Label"])


class WhiteLabelSchema(BaseModel):
    school_id: UUID
    custom_domain: Optional[str] = None
    custom_smtp_host: Optional[str] = None
    custom_smtp_port: Optional[int] = 587
    custom_smtp_user: Optional[str] = None
    custom_logo_url: Optional[str] = None
    custom_primary_color: Optional[str] = "#0284c7"
    hide_altrix_branding: bool = True

    model_config = ConfigDict(from_attributes=True)


class WhiteLabelUpdateSchema(BaseModel):
    custom_domain: Optional[str] = None
    custom_smtp_host: Optional[str] = None
    custom_smtp_port: Optional[int] = None
    custom_smtp_user: Optional[str] = None
    custom_logo_url: Optional[str] = None
    custom_primary_color: Optional[str] = None
    hide_altrix_branding: Optional[bool] = None


@router.get("/{school_id}", response_model=WhiteLabelSchema)
async def get_white_label_settings(
    school_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
):
    stmt = select(WhiteLabelSettings).where(WhiteLabelSettings.school_id == school_id)
    res = await db.execute(stmt)
    settings = res.scalar_one_or_none()

    if not settings:
        settings = WhiteLabelSettings(
            school_id=school_id,
            custom_primary_color="#0284c7",
            hide_altrix_branding=True,
        )
        db.add(settings)
        await db.commit()
        await db.refresh(settings)

    return settings


@router.patch("/{school_id}", response_model=WhiteLabelSchema)
async def update_white_label_settings(
    school_id: UUID,
    payload: WhiteLabelUpdateSchema,
    db: DbSession,
    current_user: CurrentUser,
):
    stmt = select(WhiteLabelSettings).where(WhiteLabelSettings.school_id == school_id)
    res = await db.execute(stmt)
    settings = res.scalar_one_or_none()

    if not settings:
        settings = WhiteLabelSettings(school_id=school_id)
        db.add(settings)

    if payload.custom_domain is not None:
        settings.custom_domain = payload.custom_domain
    if payload.custom_smtp_host is not None:
        settings.custom_smtp_host = payload.custom_smtp_host
    if payload.custom_smtp_port is not None:
        settings.custom_smtp_port = payload.custom_smtp_port
    if payload.custom_smtp_user is not None:
        settings.custom_smtp_user = payload.custom_smtp_user
    if payload.custom_logo_url is not None:
        settings.custom_logo_url = payload.custom_logo_url
    if payload.custom_primary_color is not None:
        settings.custom_primary_color = payload.custom_primary_color
    if payload.hide_altrix_branding is not None:
        settings.hide_altrix_branding = payload.hide_altrix_branding

    await db.commit()
    await db.refresh(settings)
    return settings
