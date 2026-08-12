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
    wellbeing_enabled: bool = True
    inventory_enabled: bool = True
    alumni_enabled: bool = True
    public_admissions_enabled: bool = True
    hostel_enabled: bool = True
    appraisals_enabled: bool = True
    seating_plan_enabled: bool = True
    white_label_enabled: bool = True
    multilang_enabled: bool = True

    model_config = ConfigDict(from_attributes=True)


class FeatureFlagsUpdateSchema(BaseModel):
    transport_enabled: Optional[bool] = None
    library_enabled: Optional[bool] = None
    parent_app_enabled: Optional[bool] = None
    document_cert_enabled: Optional[bool] = None
    ai_features_enabled: Optional[bool] = None
    wellbeing_enabled: Optional[bool] = None
    inventory_enabled: Optional[bool] = None
    alumni_enabled: Optional[bool] = None
    public_admissions_enabled: Optional[bool] = None
    hostel_enabled: Optional[bool] = None
    appraisals_enabled: Optional[bool] = None
    seating_plan_enabled: Optional[bool] = None
    white_label_enabled: Optional[bool] = None
    multilang_enabled: Optional[bool] = None


@router.get("/{school_id}", response_model=FeatureFlagsSchema)
async def get_school_feature_flags(
    school_id: str,
    db: DbSession,
):
    from app.routers.misc import get_ai_status, get_school_ai_status
    import uuid
    import logging
    logger = logging.getLogger("app.routers.feature_flags")

    target_school_id: Optional[UUID] = None
    try:
        target_school_id = UUID(str(school_id).strip())
    except (ValueError, TypeError):
        try:
            stmt_school = select(School.id).where(School.slug == str(school_id).strip())
            res_school = await db.execute(stmt_school)
            target_school_id = res_school.scalar_one_or_none()
        except Exception as e:
            logger.warning(f"Error resolving school slug '{school_id}': {e}")
            target_school_id = None

    if not target_school_id:
        fallback_uuid = uuid.uuid4()
        return SchoolFeatureFlag(
            school_id=fallback_uuid,
            transport_enabled=True,
            library_enabled=True,
            parent_app_enabled=True,
            document_cert_enabled=True,
            ai_features_enabled=True,
            wellbeing_enabled=True,
            inventory_enabled=True,
            alumni_enabled=True,
            public_admissions_enabled=True,
            hostel_enabled=True,
            appraisals_enabled=True,
            seating_plan_enabled=True,
            white_label_enabled=True,
            multilang_enabled=True,
        )

    effective_ai = True
    try:
        global_ai = await get_ai_status(db)
        school_ai = await get_school_ai_status(db, str(target_school_id))
        effective_ai = global_ai and school_ai
    except Exception as e:
        logger.warning(f"Error checking AI status for school {target_school_id}: {e}")

    try:
        stmt = select(SchoolFeatureFlag).where(SchoolFeatureFlag.school_id == target_school_id)
        res = await db.execute(stmt)
        flags = res.scalar_one_or_none()

        if not flags:
            flags = SchoolFeatureFlag(
                school_id=target_school_id,
                transport_enabled=True,
                library_enabled=True,
                parent_app_enabled=True,
                document_cert_enabled=True,
                ai_features_enabled=effective_ai,
                wellbeing_enabled=True,
                inventory_enabled=True,
                alumni_enabled=True,
                public_admissions_enabled=True,
                hostel_enabled=True,
                appraisals_enabled=True,
                seating_plan_enabled=True,
                white_label_enabled=True,
                multilang_enabled=True,
            )
            try:
                db.add(flags)
                await db.commit()
                await db.refresh(flags)
            except Exception as e:
                logger.warning(f"Failed to persist initial feature flags for {target_school_id}: {e}")
                await db.rollback()
        else:
            if not effective_ai:
                flags.ai_features_enabled = False

        return flags
    except Exception as e:
        logger.warning(f"Exception fetching feature flags for school {target_school_id}: {e}")
        return SchoolFeatureFlag(
            school_id=target_school_id,
            transport_enabled=True,
            library_enabled=True,
            parent_app_enabled=True,
            document_cert_enabled=True,
            ai_features_enabled=effective_ai,
            wellbeing_enabled=True,
            inventory_enabled=True,
            alumni_enabled=True,
            public_admissions_enabled=True,
            hostel_enabled=True,
            appraisals_enabled=True,
            seating_plan_enabled=True,
            white_label_enabled=True,
            multilang_enabled=True,
        )


@router.patch("/{school_id}", response_model=FeatureFlagsSchema)
async def update_school_feature_flags(
    school_id: str,
    payload: FeatureFlagsUpdateSchema,
    db: DbSession,
    current_user: CurrentUser,
):
    import uuid
    target_school_id: Optional[UUID] = None
    try:
        target_school_id = UUID(str(school_id).strip())
    except (ValueError, TypeError):
        stmt_school = select(School.id).where(School.slug == str(school_id).strip())
        res_school = await db.execute(stmt_school)
        target_school_id = res_school.scalar_one_or_none()

    if not target_school_id:
        raise HTTPException(status_code=404, detail="School not found")

    stmt = select(SchoolFeatureFlag).where(SchoolFeatureFlag.school_id == target_school_id)
    res = await db.execute(stmt)
    flags = res.scalar_one_or_none()

    if not flags:
        flags = SchoolFeatureFlag(school_id=target_school_id)
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
    if payload.wellbeing_enabled is not None:
        flags.wellbeing_enabled = payload.wellbeing_enabled
    if payload.inventory_enabled is not None:
        flags.inventory_enabled = payload.inventory_enabled
    if payload.alumni_enabled is not None:
        flags.alumni_enabled = payload.alumni_enabled
    if payload.public_admissions_enabled is not None:
        flags.public_admissions_enabled = payload.public_admissions_enabled
    if payload.hostel_enabled is not None:
        flags.hostel_enabled = payload.hostel_enabled
    if payload.appraisals_enabled is not None:
        flags.appraisals_enabled = payload.appraisals_enabled
    if payload.seating_plan_enabled is not None:
        flags.seating_plan_enabled = payload.seating_plan_enabled
    if payload.white_label_enabled is not None:
        flags.white_label_enabled = payload.white_label_enabled
    if payload.multilang_enabled is not None:
        flags.multilang_enabled = payload.multilang_enabled

    await db.commit()
    await db.refresh(flags)
    return flags
