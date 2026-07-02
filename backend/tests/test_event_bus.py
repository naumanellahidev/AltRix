import pytest
import uuid
from unittest.mock import AsyncMock, patch

from app.schemas import EventEnvelope
from app.services.event_bus import EnterpriseEventBus
import app.tasks.event_tasks


@pytest.mark.asyncio
async def test_event_bus_publish_validation():
    """
    Test that publishing validates structured metadata correctly.
    """
    event = EventEnvelope(
        event_name="AttendanceMarked",
        category="attendance",
        school_id=uuid.uuid4(),
        campus_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        entity_type="student",
        entity_id=uuid.uuid4(),
        payload={"student_name": "Test Student", "status": "Present"},
        metadata={"source": "api"}
    )
    
    # Mock DB session
    mock_db = AsyncMock()
    
    # Mock Redis client and disable Celery task dispatch to isolate event bus test
    with patch("app.services.event_bus.get_redis", return_value=AsyncMock()), \
         patch("app.tasks.event_tasks.process_event_task.apply_async") as mock_celery:
         
        result = await EnterpriseEventBus.publish(event, mock_db)
        
        # Verify execution
        assert result["status"] == "published"
        assert result["subscribers_triggered"] > 0
        assert mock_db.commit.called
        assert mock_celery.called


@pytest.mark.asyncio
async def test_event_bus_deduplication():
    """
    Verify smart event deduplication throttles twin events.
    """
    school_id = uuid.uuid4()
    event = EventEnvelope(
        event_name="AttendanceMarked",
        category="attendance",
        school_id=school_id,
        payload={"student_name": "Test Student"}
    )
    
    mock_db = AsyncMock()
    mock_redis = AsyncMock()
    
    # Simulate Redis SET NX returning False (meaning duplicate exists)
    mock_redis.set.return_value = False
    
    with patch("app.services.event_bus.get_redis", return_value=mock_redis):
        result = await EnterpriseEventBus.publish(event, mock_db)
        
        # Verify deduplication triggered
        assert result["status"] == "ignored"
        assert result["reason"] == "duplicate_throttled"
        assert not mock_db.commit.called
