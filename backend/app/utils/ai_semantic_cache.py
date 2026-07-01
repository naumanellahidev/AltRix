"""
AltRix AI Copilot — Enterprise Semantic Cache Engine
=====================================================

Architecture:
  Layer 1 (DB):     pg_trgm trigram similarity — fast candidate pre-filter (no extension needed,
                    pg_trgm is bundled with standard PostgreSQL/Supabase)
  Layer 2 (Python): Cosine similarity over a 160-term ERP-domain keyword vocabulary
  Security:         school_id + role_key EXACT MATCH enforced before any cache reuse
  Invalidation:     data_deps TEXT[] with GIN index — tag-based soft invalidation

Zero new pip packages required.
No Supabase extensions. No vector APIs.
Works with existing CacheManager (cache.py) and FastAPI architecture.

Cost Note: Ollama is self-hosted and free. The stats system tracks AI CALLS SAVED
(compute time saved) as the primary efficiency metric — not dollar cost.
"""

import json
import logging
import math
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger("app.ai_semantic_cache")


# ─── ERP Domain Vocabulary (160 keywords) ─────────────────────────────────────
# Curated to cover every major AltRix ERP module.
# These form the basis of the domain embedding vector.
_ERP_VOCABULARY_RAW: list[str] = [
    # Attendance
    "attendance", "present", "absent", "late", "truant", "session", "missing",
    "skip", "absentee", "punctuality", "daily", "weekly", "monthly", "marked",
    # Finance / Fees
    "fee", "fees", "payment", "invoice", "voucher", "pending", "paid", "overdue",
    "collection", "revenue", "defaulter", "installment", "dues", "balance", "amount",
    "payroll", "expense", "budget", "finance", "financial", "outstanding", "receipt",
    "transaction", "refund", "discount", "fine", "challan", "due", "total", "unpaid",
    # Students
    "student", "students", "enrollment", "enroll", "class", "section", "grade", "roll",
    "child", "children", "pupil", "learner", "weak", "strong", "top", "bottom",
    "profile", "detail", "details",
    # Academics / Exams
    "marks", "result", "exam", "test", "quiz", "score", "performance", "pass", "fail",
    "academic", "subject", "curriculum", "assignment", "homework", "report", "card",
    "progress", "assessment", "transcript", "grade", "grading", "rank",
    # Staff / HR
    "teacher", "staff", "faculty", "instructor", "hr", "human", "resources", "leave",
    "payroll", "salary", "allowance", "deduction", "bonus", "hire", "resign",
    # Behavior
    "behavior", "behaviour", "incident", "conduct", "discipline", "warning",
    "positive", "negative", "counseling", "note", "notes",
    # Reports / Analytics
    "report", "analytics", "summary", "trend", "comparison", "chart", "graph",
    "statistics", "average", "total", "count", "percentage", "rate", "analysis",
    "overview", "breakdown", "insights",
    # Admissions
    "admission", "application", "applicant", "convert", "registration", "new",
    "prospective", "inquiry",
    # Messaging
    "notice", "announcement", "message", "diary", "communication", "notify",
    # General ERP
    "campus", "school", "department", "timetable", "schedule", "holiday", "event",
    "parent", "guardian", "contact", "issues", "poor", "low", "high", "show",
    "find", "which", "list", "get", "give", "generate", "display",
]

# Deduplicate, sort, and index for stable vector positions
_VOCAB: list[str] = sorted(set(_ERP_VOCABULARY_RAW))
_VOCAB_INDEX: dict[str, int] = {word: i for i, word in enumerate(_VOCAB)}
_VOCAB_SIZE: int = len(_VOCAB_INDEX)


# ─── Cache Type TTLs (seconds) ─────────────────────────────────────────────────
CACHE_TTL: dict[str, int] = {
    "static_knowledge": 86400,   # 24 h — ERP help / navigation guidance
    "live_erp":         300,     # 5 min — live attendance, fee, student data
    "report":           1800,    # 30 min — analytics & aggregated summaries
    "conversation":     900,     # 15 min — short contextual follow-ups
}

# ─── Similarity Thresholds ─────────────────────────────────────────────────────
THRESHOLD_RETURN: float = 0.75   # Minimum cosine score to return cached result
THRESHOLD_HIGH:   float = 0.88   # High-confidence hit (no disclaimer added)


# ─── Data Dependency Tags → Invalidation Keywords ─────────────────────────────
# Maps ERP dependency tag → keywords that indicate a query depends on that data.
_DEP_KEYWORD_MAP: dict[str, list[str]] = {
    "attendance": [
        "attendance", "present", "absent", "late", "truant", "session",
        "missing", "skip", "absentee", "mark",
    ],
    "finance": [
        "fee", "fees", "payment", "invoice", "voucher", "pending", "paid",
        "overdue", "collection", "revenue", "defaulter", "dues", "balance",
        "outstanding", "receipt", "transaction", "challan", "unpaid", "salary",
        "payroll", "expense",
    ],
    "exams": [
        "marks", "result", "exam", "test", "quiz", "score", "performance",
        "pass", "fail", "grade", "report card", "assessment", "transcript",
    ],
    "students": [
        "student", "students", "enrollment", "enroll", "child", "children",
        "pupil", "weak", "strong", "top",
    ],
    "hr": [
        "hr", "human resources", "leave", "leave request", "payroll",
        "salary", "allowance", "deduction", "staff leave",
    ],
    "admissions": [
        "admission", "application", "applicant", "convert", "registration",
        "prospective", "inquiry",
    ],
    "behavior": [
        "behavior", "behaviour", "incident", "conduct", "discipline",
        "warning", "positive", "negative", "counseling",
    ],
}


# ─── Data Classes ──────────────────────────────────────────────────────────────

@dataclass
class CacheHit:
    """Represents a semantic cache match found for a user query."""
    entry_id: str
    response_text: str
    similarity_score: float
    cache_type: str
    is_high_confidence: bool = False


# ─── Pure Python Semantic Utilities ───────────────────────────────────────────

def normalize_query(text_input: str) -> str:
    """
    Normalize a query string for trigram comparison and embedding.
    Lowercases, strips punctuation, collapses whitespace.
    """
    text_input = text_input.lower()
    text_input = re.sub(r"[^\w\s]", " ", text_input)
    text_input = re.sub(r"\s+", " ", text_input).strip()
    return text_input


def compute_embedding(text_input: str) -> list[float]:
    """
    Compute a domain-keyword TF-style embedding vector over _VOCAB.

    Each position is the count of how many times that vocabulary word
    appears in the text, then L2-normalized to unit length.

    Pure Python — no numpy, scipy, or any external package required.
    Result: a float list of length _VOCAB_SIZE (sparse, L2-normalized).
    """
    normalized = normalize_query(text_input)
    words = normalized.split()
    vec = [0.0] * _VOCAB_SIZE
    for word in words:
        idx = _VOCAB_INDEX.get(word)
        if idx is not None:
            vec[idx] += 1.0
    # L2 normalize
    magnitude = math.sqrt(sum(v * v for v in vec))
    if magnitude > 0.0:
        vec = [v / magnitude for v in vec]
    return vec


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """
    Cosine similarity between two L2-normalized vectors.
    Since both are unit vectors, cos_sim = dot product.
    """
    if not a or not b or len(a) != len(b):
        return 0.0
    return min(1.0, sum(x * y for x, y in zip(a, b)))


def classify_cache_type(query: str, module: Optional[str] = None) -> str:
    """
    Infer the best cache_type from the query content and active UI module.

    Strategies:
    - Static: help/navigation questions → long TTL
    - Report: aggregation/trend queries → medium TTL
    - Conversation: very short follow-up → short TTL
    - live_erp: default for all live data queries
    """
    q = query.lower()
    static_signals = [
        "what is", "explain", "how do i", "how to", "tell me about",
        "what does", "help me", "guide me", "navigate to", "where is",
        "what are", "can you explain",
    ]
    if any(s in q for s in static_signals):
        return "static_knowledge"

    report_signals = [
        "report", "summary", "trend", "analytics", "chart", "graph",
        "compare", "comparison", "statistics", "overview", "breakdown",
        "analysis", "insights", "generate report",
    ]
    if any(s in q for s in report_signals):
        return "report"

    # Very short queries are usually follow-up conversation turns
    if len(q.split()) <= 5:
        return "conversation"

    return "live_erp"


def classify_data_deps(query: str, module: Optional[str] = None) -> list[str]:
    """
    Derive data dependency tags from query text and active UI module.
    These tags drive semantic cache invalidation when ERP data changes.
    """
    q = query.lower()
    deps: set[str] = set()

    # Module context is the strongest signal
    if module:
        m = module.lower()
        if "attend" in m:
            deps.add("attendance")
        if "finance" in m or "fee" in m or "payment" in m:
            deps.add("finance")
        if "exam" in m or "result" in m or "mark" in m:
            deps.add("exams")
        if "student" in m:
            deps.add("students")
        if "hr" in m or "leave" in m or "payroll" in m:
            deps.add("hr")
        if "admission" in m:
            deps.add("admissions")
        if "behavior" in m or "behaviour" in m:
            deps.add("behavior")

    # Also scan the query text for keyword signals
    for dep_tag, keywords in _DEP_KEYWORD_MAP.items():
        if any(kw in q for kw in keywords):
            deps.add(dep_tag)

    return list(deps) if deps else ["live_erp"]


def build_role_key(roles: list[str]) -> str:
    """
    Build a deterministic, sorted role key for cache partitioning.
    Ensures "teacher+principal" and "principal+teacher" produce the same key.
    """
    if not roles:
        return "no_role"
    return "_".join(sorted(set(r for r in roles if r)))


# ─── Semantic Cache Engine ─────────────────────────────────────────────────────

class SemanticCacheEngine:
    """
    Enterprise semantic cache for the AltRix AI Copilot.

    Pipeline:
      1. Trigram pre-filter  → DB-side (pg_trgm), returns top-N candidates
      2. Cosine similarity   → Python-side, re-ranks candidates
      3. Role key match      → strict security gate, no cross-role reuse
      4. Expiry / is_valid   → freshness check

    Security invariants:
      - school_id is always checked FIRST (tenant isolation)
      - role_key must EXACTLY match (no cross-role cache bleed)
      - super_admin responses are NEVER cached (too broad)
      - is_valid soft-delete preserves audit trail

    Ollama note:
      Ollama is self-hosted and free. Stats track AI_CALLS_SAVED (compute
      time savings) rather than dollar cost.
    """

    async def find_similar(
        self,
        db: AsyncSession,
        school_id: str,
        query: str,
        roles: list[str],
        module: Optional[str] = None,
        campus_id: Optional[str] = None,
        threshold: float = THRESHOLD_RETURN,
    ) -> Optional[CacheHit]:
        """
        Find a semantically similar cached AI response.

        Returns CacheHit if a valid, school-scoped, role-matched, unexpired
        entry exists with cosine similarity ≥ threshold.
        Returns None if no suitable entry found — caller generates fresh AI response.
        """
        # SECURITY: super_admin always gets fresh responses (avoids over-broad caching)
        if "super_admin" in roles:
            return None

        if not school_id or not query:
            return None

        role_key = build_role_key(roles)
        normalized_q = normalize_query(query)

        try:
            # ── Layer 1: DB-side trigram pre-filter ───────────────────────────
            # pg_trgm similarity() is a built-in Postgres function (no extension needed
            # beyond the pg_trgm module, which is enabled by default in Supabase/RDS).
            result = await db.execute(text("""
                SELECT
                    id::text,
                    query_text,
                    query_embedding,
                    role_key,
                    cache_type,
                    response_text,
                    similarity(query_normalized, :nq) AS trgm_score
                FROM public.ai_semantic_cache
                WHERE school_id = :school_id
                  AND is_valid = TRUE
                  AND expires_at > NOW()
                  AND (
                      :campus_id IS NULL
                      OR campus_id = :campus_id::uuid
                      OR campus_id IS NULL
                  )
                  AND similarity(query_normalized, :nq) > 0.20
                ORDER BY trgm_score DESC
                LIMIT 25
            """), {
                "school_id": school_id,
                "nq": normalized_q,
                "campus_id": campus_id,
            })
            candidates = result.fetchall()

            if not candidates:
                return None

            # ── Layer 2: Python cosine similarity re-ranking ──────────────────
            query_emb = compute_embedding(query)

            best_score: float = 0.0
            best: Optional[tuple] = None

            for row in candidates:
                (
                    entry_id, entry_query, entry_emb_json,
                    entry_role_key, entry_cache_type, response_text, trgm_score
                ) = row

                # ── SECURITY GATE: strict role key match ──────────────────────
                if entry_role_key != role_key:
                    continue

                # Parse stored embedding
                if not entry_emb_json:
                    continue
                try:
                    stored_emb: list[float] = (
                        entry_emb_json
                        if isinstance(entry_emb_json, list)
                        else json.loads(entry_emb_json)
                    )
                except Exception:
                    continue

                score = cosine_similarity(query_emb, stored_emb)
                if score > best_score:
                    best_score = score
                    best = (str(entry_id), response_text, entry_cache_type)

            if best is None or best_score < threshold:
                return None

            entry_id, response_text, cache_type = best
            return CacheHit(
                entry_id=entry_id,
                response_text=response_text,
                similarity_score=best_score,
                cache_type=cache_type,
                is_high_confidence=(best_score >= THRESHOLD_HIGH),
            )

        except Exception as e:
            logger.warning(f"Semantic cache lookup failed (non-fatal): {e}")
            return None

    async def store(
        self,
        db: AsyncSession,
        school_id: str,
        query: str,
        response: str,
        roles: list[str],
        module: Optional[str] = None,
        screen: Optional[str] = None,
        campus_id: Optional[str] = None,
        cache_type: Optional[str] = None,
        data_deps: Optional[list[str]] = None,
    ) -> Optional[str]:
        """
        Store a new AI response in the semantic cache.

        Returns the new entry's UUID string on success, None on failure.
        Failures are non-fatal — the AI response is always returned to the user.
        """
        # SECURITY: never cache super_admin responses
        if "super_admin" in roles:
            return None

        # Don't cache empty or error responses
        if not response or len(response.strip()) < 30:
            return None

        try:
            ct = cache_type or classify_cache_type(query, module)
            ttl_seconds = CACHE_TTL.get(ct, CACHE_TTL["live_erp"])
            expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)

            deps = data_deps or classify_data_deps(query, module)
            role_key = build_role_key(roles)
            normalized_q = normalize_query(query)
            embedding = compute_embedding(query)

            insert_result = await db.execute(text("""
                INSERT INTO public.ai_semantic_cache (
                    school_id, cache_type, query_text, query_normalized,
                    query_embedding, role_key, module_context, screen_context,
                    campus_id, response_text, data_deps, expires_at
                ) VALUES (
                    :school_id,
                    :cache_type,
                    :query_text,
                    :query_normalized,
                    :query_embedding::jsonb,
                    :role_key,
                    :module_context,
                    :screen_context,
                    :campus_id,
                    :response_text,
                    :data_deps,
                    :expires_at
                )
                RETURNING id::text
            """), {
                "school_id": school_id,
                "cache_type": ct,
                "query_text": query[:1000],
                "query_normalized": normalized_q[:500],
                "query_embedding": json.dumps(embedding),
                "role_key": role_key,
                "module_context": (module or "")[:100],
                "screen_context": (screen or "")[:200],
                "campus_id": campus_id,
                "response_text": response[:50000],
                "data_deps": deps,
                "expires_at": expires_at,
            })
            row = insert_result.fetchone()
            entry_id = str(row[0]) if row else None
            if entry_id:
                logger.debug(
                    f"Semantic cache stored: id={entry_id[:8]}.. "
                    f"type={ct} deps={deps} school={school_id}"
                )
            return entry_id

        except Exception as e:
            logger.warning(f"Semantic cache store failed (non-fatal): {e}")
            return None

    async def invalidate_by_deps(
        self,
        db: AsyncSession,
        school_id: str,
        dep_tags: list[str],
    ) -> int:
        """
        Soft-invalidate all entries matching any of the given data dependency tags
        for a specific school. Uses GIN index on data_deps for O(log n) performance.

        Sets is_valid=FALSE (soft delete) — preserves audit trail.
        """
        if not dep_tags or not school_id:
            return 0
        try:
            result = await db.execute(text("""
                UPDATE public.ai_semantic_cache
                SET is_valid = FALSE
                WHERE school_id = :school_id
                  AND is_valid = TRUE
                  AND data_deps && :dep_tags
            """), {
                "school_id": school_id,
                "dep_tags": dep_tags,
            })
            count = result.rowcount or 0
            if count > 0:
                logger.info(
                    f"Semantic cache: invalidated {count} entries "
                    f"for deps={dep_tags} in school={school_id}"
                )
            return count
        except Exception as e:
            logger.warning(f"Semantic cache invalidation failed (non-fatal): {e}")
            return 0

    async def invalidate_all(
        self,
        db: AsyncSession,
        school_id: str,
    ) -> int:
        """Soft-invalidate ALL cache entries for a school."""
        if not school_id:
            return 0
        try:
            result = await db.execute(text("""
                UPDATE public.ai_semantic_cache
                SET is_valid = FALSE
                WHERE school_id = :school_id AND is_valid = TRUE
            """), {"school_id": school_id})
            return result.rowcount or 0
        except Exception as e:
            logger.warning(f"Semantic cache full invalidation failed (non-fatal): {e}")
            return 0

    async def track_hit(
        self,
        db: AsyncSession,
        entry_id: str,
    ) -> None:
        """Increment hit counter and update last_used_at for a cache entry."""
        try:
            await db.execute(text("""
                UPDATE public.ai_semantic_cache
                SET hit_count = hit_count + 1,
                    last_used_at = NOW()
                WHERE id = :entry_id::uuid
            """), {"entry_id": entry_id})
        except Exception as e:
            logger.warning(f"Semantic cache hit tracking failed (non-fatal): {e}")

    async def record_hit_stats(
        self,
        db: AsyncSession,
        school_id: str,
    ) -> None:
        """Upsert daily stats row: increment cache_hits and ai_calls_saved."""
        try:
            await db.execute(text("""
                INSERT INTO public.ai_cache_stats
                    (school_id, stat_date, cache_hits, ai_calls_saved)
                VALUES
                    (:school_id, CURRENT_DATE, 1, 1)
                ON CONFLICT (school_id, stat_date) DO UPDATE
                SET cache_hits      = ai_cache_stats.cache_hits + 1,
                    ai_calls_saved  = ai_cache_stats.ai_calls_saved + 1,
                    updated_at      = NOW()
            """), {"school_id": school_id})
        except Exception as e:
            logger.warning(f"Semantic cache hit stat record failed (non-fatal): {e}")

    async def record_miss_stats(
        self,
        db: AsyncSession,
        school_id: str,
    ) -> None:
        """Upsert daily stats row: increment cache_misses."""
        try:
            await db.execute(text("""
                INSERT INTO public.ai_cache_stats
                    (school_id, stat_date, cache_misses)
                VALUES
                    (:school_id, CURRENT_DATE, 1)
                ON CONFLICT (school_id, stat_date) DO UPDATE
                SET cache_misses = ai_cache_stats.cache_misses + 1,
                    updated_at   = NOW()
            """), {"school_id": school_id})
        except Exception as e:
            logger.warning(f"Semantic cache miss stat record failed (non-fatal): {e}")

    async def get_stats(
        self,
        db: AsyncSession,
        school_id: str,
    ) -> dict:
        """
        Return comprehensive semantic cache performance statistics for a school.
        Ollama is free/self-hosted, so efficiency is measured in calls saved
        (compute time savings), not dollar cost.
        """
        try:
            # 30-day aggregate
            agg_res = await db.execute(text("""
                SELECT
                    COALESCE(SUM(cache_hits),     0) AS total_hits,
                    COALESCE(SUM(cache_misses),   0) AS total_misses,
                    COALESCE(SUM(ai_calls_saved), 0) AS calls_saved
                FROM public.ai_cache_stats
                WHERE school_id  = :school_id
                  AND stat_date >= CURRENT_DATE - INTERVAL '30 days'
            """), {"school_id": school_id})
            agg = agg_res.fetchone()
            total_hits   = int(agg[0]) if agg else 0
            total_misses = int(agg[1]) if agg else 0
            calls_saved  = int(agg[2]) if agg else 0
            total        = total_hits + total_misses
            hit_rate     = round((total_hits / total) * 100, 1) if total > 0 else 0.0

            # Active entries by type
            type_res = await db.execute(text("""
                SELECT cache_type, COUNT(*) AS cnt
                FROM public.ai_semantic_cache
                WHERE school_id = :school_id
                  AND is_valid  = TRUE
                  AND expires_at > NOW()
                GROUP BY cache_type
            """), {"school_id": school_id})
            entries_by_type = {row[0]: int(row[1]) for row in type_res.fetchall()}

            # Top cached queries (most reused)
            top_res = await db.execute(text("""
                SELECT query_text, hit_count, cache_type, last_used_at
                FROM public.ai_semantic_cache
                WHERE school_id = :school_id
                  AND is_valid  = TRUE
                ORDER BY hit_count DESC
                LIMIT 10
            """), {"school_id": school_id})
            top_queries = [
                {
                    "query":     row[0][:120],
                    "hits":      int(row[1]),
                    "type":      row[2],
                    "last_used": str(row[3]),
                }
                for row in top_res.fetchall()
            ]

            # 7-day daily breakdown
            daily_res = await db.execute(text("""
                SELECT stat_date, cache_hits, cache_misses, ai_calls_saved
                FROM public.ai_cache_stats
                WHERE school_id  = :school_id
                  AND stat_date >= CURRENT_DATE - INTERVAL '7 days'
                ORDER BY stat_date DESC
            """), {"school_id": school_id})
            daily = [
                {
                    "date":    str(row[0]),
                    "hits":    int(row[1]),
                    "misses":  int(row[2]),
                    "saved":   int(row[3]),
                }
                for row in daily_res.fetchall()
            ]

            return {
                "period":               "last_30_days",
                "total_requests":       total,
                "cache_hits":           total_hits,
                "cache_misses":         total_misses,
                "hit_rate_percent":     hit_rate,
                "ai_calls_saved":       calls_saved,
                "active_entries":       sum(entries_by_type.values()),
                "entries_by_type":      entries_by_type,
                "top_queries":          top_queries,
                "daily_breakdown":      daily,
                "ollama_note": (
                    "Ollama is self-hosted and free. "
                    "'ai_calls_saved' represents compute-time savings "
                    "and reduced model inference load."
                ),
            }
        except Exception as e:
            logger.warning(f"Semantic cache stats failed (non-fatal): {e}")
            return {"error": str(e), "total_requests": 0, "hit_rate_percent": 0.0}

    async def list_entries(
        self,
        db: AsyncSession,
        school_id: str,
        page: int = 1,
        page_size: int = 20,
        cache_type_filter: Optional[str] = None,
        valid_only: bool = True,
    ) -> dict:
        """
        Paginated list of semantic cache entries for admin inspection.
        """
        try:
            where_clauses = ["school_id = :school_id"]
            params: dict = {"school_id": school_id}

            if valid_only:
                where_clauses.append("is_valid = TRUE AND expires_at > NOW()")
            if cache_type_filter:
                where_clauses.append("cache_type = :cache_type")
                params["cache_type"] = cache_type_filter

            where_str = " AND ".join(where_clauses)
            offset = (page - 1) * page_size

            count_res = await db.execute(
                text(f"SELECT COUNT(*) FROM public.ai_semantic_cache WHERE {where_str}"),
                params
            )
            total = int(count_res.scalar() or 0)

            rows_res = await db.execute(text(f"""
                SELECT
                    id::text, cache_type, query_text, role_key,
                    module_context, hit_count, data_deps,
                    created_at, expires_at, is_valid
                FROM public.ai_semantic_cache
                WHERE {where_str}
                ORDER BY created_at DESC
                LIMIT :limit OFFSET :offset
            """), {**params, "limit": page_size, "offset": offset})

            entries = [
                {
                    "id":            str(row[0]),
                    "cache_type":    row[1],
                    "query":         (row[2] or "")[:100],
                    "role_key":      row[3],
                    "module":        row[4],
                    "hit_count":     int(row[5] or 0),
                    "data_deps":     row[6] or [],
                    "created_at":    str(row[7]),
                    "expires_at":    str(row[8]),
                    "is_valid":      row[9],
                }
                for row in rows_res.fetchall()
            ]

            return {
                "total":      total,
                "page":       page,
                "page_size":  page_size,
                "entries":    entries,
            }
        except Exception as e:
            logger.warning(f"Semantic cache list_entries failed (non-fatal): {e}")
            return {"total": 0, "page": page, "page_size": page_size, "entries": []}


# ─── Singleton ─────────────────────────────────────────────────────────────────
semantic_cache = SemanticCacheEngine()
