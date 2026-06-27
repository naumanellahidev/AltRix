import os
import json
import logging
import base64
from typing import Dict, Any, Optional
from uuid import UUID
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization
from pywebpush import webpush, WebPushException

logger = logging.getLogger("altrix.webpush")

# Path to cache VAPID keys locally
VAPID_KEYS_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "vapid_keys.json")

def generate_vapid_keys() -> Dict[str, str]:
    """Generate a standard Elliptic Curve SECP256R1 key pair for Web Push VAPID."""
    private_key = ec.generate_private_key(ec.SECP256R1())
    private_der = private_key.private_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    )
    public_key = private_key.public_key()
    public_der = public_key.public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint
    )
    private_b64 = base64.urlsafe_b64encode(private_der).decode('utf-8').rstrip('=')
    public_b64 = base64.urlsafe_b64encode(public_der).decode('utf-8').rstrip('=')
    return {
        "private_key": private_b64,
        "public_key": public_b64
    }

def get_vapid_keys() -> Dict[str, str]:
    """Retrieve VAPID keys from cache file or generate them on first run."""
    # Try reading from config first
    from app.config import settings
    # If settings have them, use them
    vapid_private = getattr(settings, "vapid_private_key", None)
    vapid_public = getattr(settings, "vapid_public_key", None)
    if vapid_private and vapid_public:
        return {"private_key": vapid_private, "public_key": vapid_public}

    if os.path.exists(VAPID_KEYS_FILE):
        try:
            with open(VAPID_KEYS_FILE, "r") as f:
                keys = json.load(f)
                if "private_key" in keys and "public_key" in keys:
                    return keys
        except Exception as e:
            logger.error(f"Failed to read VAPID keys file: {e}")

    # Generate new keys
    logger.info("Generating new VAPID keys...")
    keys = generate_vapid_keys()
    try:
        with open(VAPID_KEYS_FILE, "w") as f:
            json.dump(keys, f)
        logger.info(f"VAPID keys cached at: {VAPID_KEYS_FILE}")
    except Exception as e:
        logger.error(f"Failed to cache VAPID keys: {e}")

    return keys

async def send_web_push(subscription_info: Dict[str, Any], payload: Dict[str, Any]) -> bool:
    """Send a web push notification using pywebpush."""
    keys = get_vapid_keys()
    try:
        # Send web push
        webpush(
            subscription_info=subscription_info,
            data=json.dumps(payload),
            vapid_private_key=keys["private_key"],
            vapid_claims={"sub": "mailto:support@alt-rix.com"},
            timeout=5
        )
        return True
    except WebPushException as ex:
        # If subscription is expired or gone (410 / 404), notify caller to clean it up
        if ex.response is not None and ex.response.status_code in [404, 410]:
            logger.warning(f"Web Push subscription gone (status {ex.response.status_code}): {subscription_info['endpoint']}")
            raise ex
        logger.error(f"Failed to send web push: {ex}")
        return False
    except Exception as e:
        logger.error(f"Unexpected web push delivery error: {e}")
        return False

async def dispatch_notification(
    db,
    user_id: UUID,
    school_id: UUID,
    title: str,
    body: str,
    category: str = "general",
    action_url: Optional[str] = None
):
    """
    Core engine to dispatch a notification to a user.
    Checks preferences, logs to app_notifications (in-app), and sends web pushes for active PWA devices.
    """
    import uuid
    from app.models.misc import AppNotification
    
    # 1. Fetch user preferences
    # Default preferences: In-App is always true, Push is true, Email is false
    pref_in_app = True
    pref_push = True
    
    try:
        from sqlalchemy import text
        res = await db.execute(
            text("SELECT preferences FROM user_notification_preferences WHERE user_id = :uid AND school_id = :sid"),
            {"uid": user_id, "sid": school_id}
        )
        row = res.fetchone()
        if row and row[0]:
            prefs = row[0]
            cat_pref = prefs.get(category, {})
            pref_in_app = cat_pref.get("in_app", True)
            pref_push = cat_pref.get("push", True)
    except Exception as e:
        logger.error(f"Failed to read preferences: {e}")

    # 2. In-App Notification (database log)
    notif_id = None
    if pref_in_app:
        try:
            notif = AppNotification(
                user_id=user_id,
                school_id=school_id,
                title=title,
                body=body,
                type="info",
                category=category,
                action_url=action_url,
                read_at=None
            )
            db.add(notif)
            await db.flush() # Populate ID
            notif_id = notif.id
            logger.info(f"In-app notification saved for user {user_id}: {title}")
        except Exception as e:
            logger.error(f"Failed to save in-app notification: {e}")

    # 3. PWA Web Push Notifications
    if pref_push:
        try:
            from sqlalchemy import text
            res = await db.execute(
                text("SELECT id, endpoint, p256dh, auth FROM user_web_push_subscriptions WHERE user_id = :uid"),
                {"uid": user_id}
            )
            subs = res.fetchall()
            
            if subs:
                push_payload = {
                    "id": str(notif_id) if notif_id else str(uuid.uuid4()),
                    "title": title,
                    "body": body,
                    "category": category,
                    "action_url": action_url or ""
                }
                
                for sub in subs:
                    sub_id, endpoint, p256dh, auth = sub
                    sub_info = {
                        "endpoint": endpoint,
                        "keys": {
                            "p256dh": p256dh,
                            "auth": auth
                        }
                    }
                    try:
                        await send_web_push(sub_info, push_payload)
                    except WebPushException as ex:
                        if ex.response is not None and ex.response.status_code in [404, 410]:
                            # Delete expired subscription
                            await db.execute(
                                text("DELETE FROM user_web_push_subscriptions WHERE id = :sub_id"),
                                {"sub_id": sub_id}
                            )
                            logger.info(f"Deleted expired push subscription {sub_id} for user {user_id}")
        except Exception as e:
            logger.error(f"Failed to dispatch web push notifications: {e}")
