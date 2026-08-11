#!/usr/bin/env python3
import asyncio, os, uuid
from app.database import AsyncSessionLocal
from app.routers.feature_flags import get_school_feature_flags
from app.dependencies import AuthenticatedUser

async def test():
    async with AsyncSessionLocal() as db:
        user = AuthenticatedUser(
            id="6e3e1047-c839-4e86-9be6-3131ca8ad474",
            email="beaconryk@gmail.com",
            roles=["principal"],
            school_id="70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8",
            is_super_admin=False
        )
        school_id = uuid.UUID("70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8")
        result = await get_school_feature_flags(school_id=school_id, db=db, current_user=user)
        print("SUCCESS! Feature flags result:", result)

asyncio.run(test())
