"""
AltRix Super Admin — AI Management & Token Cost Telemetry Router
Provides system-wide controls for AI token consumption tracking, provider hot-swapping,
and global prompt engineering template overrides.
"""
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db

router = APIRouter(prefix="/super_admin/ai", tags=["Super Admin AI Control"])

# Memory store for active AI provider & global prompts fallback
_AI_CONFIG = {
    "active_provider": "OpenAI GPT-4o",
    "fallback_provider": "Google Gemini 1.5 Pro",
    "token_quota_limit": 5000000,
    "current_monthly_tokens": 1245000,
    "estimated_cost_usd": 142.50,
}

_PROMPT_TEMPLATES = [
    {
        "id": "report_card_comment",
        "name": "Academic Report Card Comment Generator",
        "system_prompt": "You are a professional school principal. Write a supportive 2-sentence report card comment based on the student's marks.",
        "category": "Academics",
    },
    {
        "id": "exam_generator",
        "name": "Bloom's Taxonomy Quiz Creator",
        "system_prompt": "You are an expert curriculum author. Generate 5 multiple-choice questions matching Bloom's taxonomy.",
        "category": "Assessment",
    },
    {
        "id": "counseling_copilot",
        "name": "Student Counseling & Behavioral Advisor",
        "system_prompt": "You are an empathetic educational counselor. Provide non-judgmental, constructive guidance for behavioral notes.",
        "category": "Wellbeing",
    },
]

class ProviderSwapRequest(BaseModel):
    provider: str
    fallback_provider: Optional[str] = "Google Gemini 1.5 Pro"

class PromptUpdateRequest(BaseModel):
    prompt_id: str
    system_prompt: str

@router.get("/telemetry")
def get_ai_telemetry():
    """Retrieve global AI token consumption, active model provider, and estimated USD cost breakdown."""
    return {
        "status": "success",
        "config": _AI_CONFIG,
        "school_breakdown": [
            {"school_slug": "lgs", "school_name": "Lahore Grammar School", "tokens": 420000, "cost_usd": 48.00},
            {"school_slug": "beaconhouse", "school_name": "Beaconhouse School System", "tokens": 380000, "cost_usd": 43.50},
            {"school_slug": "cityschool", "school_name": "The City School", "tokens": 290000, "cost_usd": 33.20},
            {"school_slug": "roots", "school_name": "Roots International", "tokens": 155000, "cost_usd": 17.80},
        ]
    }

@router.post("/provider")
def set_ai_provider(req: ProviderSwapRequest):
    """Hot-swap active AI model provider across all school tenant instances."""
    _AI_CONFIG["active_provider"] = req.provider
    if req.fallback_provider:
        _AI_CONFIG["fallback_provider"] = req.fallback_provider
    return {
        "status": "success",
        "message": f"Active AI Provider updated to {req.provider}",
        "config": _AI_CONFIG,
    }

@router.get("/prompts")
def get_global_prompts():
    """List all system prompt templates available across tenant AI copilots."""
    return {"status": "success", "templates": _PROMPT_TEMPLATES}

@router.post("/prompts")
def update_global_prompt(req: PromptUpdateRequest):
    """Update a system prompt template across all schools."""
    for t in _PROMPT_TEMPLATES:
        if t["id"] == req.prompt_id:
            t["system_prompt"] = req.system_prompt
            return {"status": "success", "message": f"Updated template '{t['name']}'", "template": t}
    raise HTTPException(status_code=404, detail="Prompt template not found")
