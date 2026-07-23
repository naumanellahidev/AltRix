"""
Feature flags router: Manage tenant-level feature toggles.
"""
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.dependencies import CurrentUser, DbSession
from app.models.feature_flags import SchoolFeatureFlag
from app.models.core import School

router = APIRouter(prefix="/feature-flags", tags=["Feature Flags"])


class FeatureFlagsSchema(BaseModel):
    school_id: UUID
    transport_enabled: bool = True
    library_enabled: bool = True
    parent_app_enabled: bool = True
    document_cert_enabled: bool = True
    ai_features_enabled: bool = True

    model_config = ConfigDict(from_attributes=True)


class FeatureFlagsUpdateSchema(BaseModel):
    transport_enabled: Optional[bool] = None
    library_enabled: Optional[bool] = None
    parent_app_enabled: Optional[bool] = None
    document_cert_enabled: Optional[bool] = None
    ai_features_enabled: Optional[bool] = None


@router.get("/{school_id}", response_model=FeatureFlagsSchema)
async def get_school_feature_flags(
    school_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
):
    stmt = select(SchoolFeatureFlag).where(SchoolFeatureFlag.school_id == school_id)
    res = await db.execute(stmt)
    flags = res.scalar_one_or_none()

    if not flags:
        # Create default flags if none exist
        flags = SchoolFeatureFlag(
            school_id=school_id,
            transport_enabled=True,
            library_enabled=True,
            parent_app_enabled=True,
            document_cert_enabled=True,
            ai_features_enabled=True,
        )
        db.add(flags)
        await db.commit()
        await db.refresh(flags)

    return flags


@router.patch("/{school_id}", response_model=FeatureFlagsSchema)
async def update_school_feature_flags(
    school_id: UUID,
    payload: FeatureFlagsUpdateSchema,
    db: DbSession,
    current_user: CurrentUser,
):
    stmt = select(SchoolFeatureFlag).where(SchoolFeatureFlag.school_id == school_id)
    res = await db.execute(stmt)
    flags = res.scalar_one_or_none()

    if not flags:
        flags = SchoolFeatureFlag(school_id=school_id)
        db.add(flags)

    if payload.transport_enabled is not None:
        flags.transport_enabled = payload.transport_enabled
    if payload.library_enabled is not None:
        flags.library_enabled = payload.library_enabled
    if payload.parent_app_enabled is not None:
        flags.parent_app_enabled = payload.parent_app_enabled
    if payload.document_cert_enabled is not None:
        flags.document_cert_enabled = payload.document_cert_enabled
    if payload.ai_features_enabled is not None:
        flags.ai_features_enabled = payload.ai_features_enabled

    await db.commit()
    await db.refresh(flags)
    return flags
