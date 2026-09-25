"""
Global search (the command palette): students, parents, staff, classes, CRM
leads, library books, buses and inventory, each limited to who may see it.

Staff search the school. A parent or student finds only their own children
(or themselves), and the school's classes and library catalogue: never other
families' children, parents' phone numbers, staff contacts or leads. CRM
leads are for the roles that work the CRM.

Every statement runs in its own savepoint, so one that fails is logged and
skipped rather than aborting the rest of the search.
"""
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import text

from app.dependencies import CurrentUser, DbSession
from app.utils.permissions import expand_roles
from app.utils.security import get_allowed_student_ids

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/search", tags=["Search"])

FAMILY_ROLES = {"parent", "student"}
#: As the database's can_work_crm().
CRM_ROLES = {"super_admin", "school_owner", "principal", "marketing_staff"}


class SearchResultItem(BaseModel):
    entity: str  # "students" | "parents" | "staff" | "leads" | "classes" | "transport" | "library" | "inventory"
    id: str
    title: str
    subtitle: str
    status: Optional[str] = None
    url: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class GlobalSearchResponse(BaseModel):
    query: str
    total: int
    results: List[SearchResultItem]


async def _rows(db, sql: str, params: dict, what: str) -> list:
    try:
        async with db.begin_nested():
            return (await db.execute(text(sql), params)).fetchall()
    except Exception as exc:
        logger.warning("Global search: the %s lookup failed: %s", what, exc)
        return []


def _name(first, last, fallback: str) -> str:
    return " ".join(p for p in (first, last) if p) or fallback


@router.get("/global", response_model=GlobalSearchResponse)
async def global_search(
    current_user: CurrentUser,
    db: DbSession,
    q: str = Query(..., min_length=1, max_length=100, description="Search term"),
    limit: int = Query(30, ge=1, le=100),
):
    if not current_user.school_id:
        return GlobalSearchResponse(query=q, total=0, results=[])

    roles = set(expand_roles(list(current_user.roles or [])))
    staff = bool(current_user.is_super_admin or (roles - FAMILY_ROLES))
    crm = bool(current_user.is_super_admin or (roles & CRM_ROLES))
    p = {"sid": str(current_user.school_id), "term": f"%{q.strip()}%"}
    results: List[SearchResultItem] = []

    # 1. Students: the school for staff; a family's own children otherwise.
    scope = "TRUE"
    if not staff:
        allowed = await get_allowed_student_ids(current_user, db) or []
        p["ids"] = [str(s) for s in allowed]
        scope = "s.id::text = ANY(:ids)"
    if staff or p.get("ids"):
        for s_id, fn, ln, roll, code, p_name, st in await _rows(db, f"""
            SELECT s.id, s.first_name, s.last_name, s.roll_number, s.student_code, s.parent_name, s.status
            FROM students s
            WHERE s.school_id = CAST(:sid AS uuid) AND {scope} AND (
                s.first_name ILIKE :term OR s.last_name ILIKE :term OR
                (s.first_name || ' ' || COALESCE(s.last_name, '')) ILIKE :term OR
                s.roll_number ILIKE :term OR s.student_code ILIKE :term OR
                s.registration_number ILIKE :term OR s.phone ILIKE :term)
            ORDER BY s.first_name
            LIMIT 8""", p, "student"):
            sub = f"Roll: {roll or code or '—'}" + (f" • Parent: {p_name}" if p_name and staff else "")
            results.append(SearchResultItem(entity="students", id=str(s_id), title=_name(fn, ln, "Student"),
                                            subtitle=sub, status=st))

    if staff:
        # 2. Parents, from the contact details on the student's record.
        for s_id, p_name, p_phone, p_email, s_fn, s_ln in await _rows(db, """
            SELECT DISTINCT ON (s.parent_name, s.parent_phone)
                   s.id, s.parent_name, s.parent_phone, s.parent_email, s.first_name, s.last_name
            FROM students s
            WHERE s.school_id = CAST(:sid AS uuid) AND COALESCE(s.parent_name, '') <> '' AND (
                s.parent_name ILIKE :term OR s.parent_phone ILIKE :term OR s.parent_email ILIKE :term)
            ORDER BY s.parent_name, s.parent_phone, s.first_name
            LIMIT 8""", p, "parent"):
            child = _name(s_fn, s_ln, "Student")
            results.append(SearchResultItem(
                entity="parents", id=str(s_id), title=str(p_name),
                subtitle=f"Child: {child} • {p_phone or p_email or 'no contact on file'}",
                metadata={"phone": p_phone, "email": p_email, "child": child}))

        # 3. Staff: accounts with a current staff role (never the platform
        #    owner), then HR directory entries not linked to an account.
        for u_id, role, d_name, email, ph in await _rows(db, """
            SELECT DISTINCT ON (u.user_id) u.user_id, u.role, pr.display_name, pr.email, pr.phone
            FROM user_roles u
            LEFT JOIN profiles pr ON pr.id = u.user_id
            WHERE u.school_id = CAST(:sid AS uuid)
              AND u.role::text NOT IN ('student', 'parent')
              AND (u.end_date IS NULL OR u.end_date >= CURRENT_DATE)
              AND NOT EXISTS (SELECT 1 FROM platform_super_admins psa WHERE psa.user_id = u.user_id)
              AND (pr.display_name ILIKE :term OR pr.email ILIKE :term OR pr.phone ILIKE :term
                   OR u.role::text ILIKE :term)
            ORDER BY u.user_id, u.role
            LIMIT 8""", p, "staff account"):
            role_label = str(role or "staff").replace("_", " ").title()
            results.append(SearchResultItem(
                entity="staff", id=str(u_id), title=str(d_name or email or role_label),
                subtitle=f"{role_label} • {email or ph or 'no contact on file'}",
                metadata={"role": str(role), "email": email, "phone": ph}))
        for hr_id, fn, email, ph, pos, dept in await _rows(db, """
            SELECT d.id, d.full_name, d.email, d.phone, d.position, d.department
            FROM hr_staff_directory d
            WHERE d.school_id = CAST(:sid AS uuid) AND d.is_active AND d.linked_user_id IS NULL AND (
                d.full_name ILIKE :term OR d.email ILIKE :term OR d.phone ILIKE :term OR
                d.position ILIKE :term OR d.department ILIKE :term)
            LIMIT 6""", p, "staff directory"):
            results.append(SearchResultItem(
                entity="staff", id=str(hr_id), title=str(fn),
                subtitle=f"{pos or dept or 'Staff'} • {email or ph or 'no contact on file'}",
                metadata={"position": pos, "department": dept, "email": email}))

    # 4. Classes.
    for c_id, name, gr in await _rows(db, """
        SELECT c.id, c.name, c.grade_level
        FROM academic_classes c
        WHERE c.school_id = CAST(:sid AS uuid) AND (c.name ILIKE :term OR CAST(c.grade_level AS text) ILIKE :term)
        ORDER BY c.name
        LIMIT 6""", p, "class"):
        results.append(SearchResultItem(entity="classes", id=str(c_id), title=f"Class: {name}",
                                        subtitle=f"Grade level: {gr}" if gr is not None else "Class"))

    # 5. CRM leads, for the roles that work the CRM.
    if crm:
        for l_id, full_name, email, ph, st in await _rows(db, """
            SELECT l.id, l.full_name, l.email, l.phone, l.status
            FROM crm_leads l
            WHERE l.school_id = CAST(:sid AS uuid) AND (
                l.full_name ILIKE :term OR l.email ILIKE :term OR l.phone ILIKE :term)
            ORDER BY l.created_at DESC
            LIMIT 6""", p, "lead"):
            results.append(SearchResultItem(entity="leads", id=str(l_id), title=str(full_name or "Lead"),
                                            subtitle=ph or email or "no contact on file", status=st))

    # 6. The library catalogue.
    for b_id, title, author, bar, avail, total in await _rows(db, """
        SELECT b.id, b.title, b.author, b.barcode, b.available_copies, b.total_copies
        FROM library_books b
        WHERE b.school_id = CAST(:sid AS uuid) AND (
            b.title ILIKE :term OR b.author ILIKE :term OR b.isbn ILIKE :term OR b.barcode ILIKE :term)
        LIMIT 6""", p, "library"):
        copies = f"{avail}/{total} available" if avail is not None and total is not None else "copies not recorded"
        results.append(SearchResultItem(
            entity="library", id=str(b_id), title=f"Book: {title}",
            subtitle=f"{author or 'Author not recorded'} • {copies}" + (f" • {bar}" if bar and staff else ""),
            status=None if avail is None else ("available" if avail > 0 else "all copies out")))

    if staff:
        # 7. Buses.
        for v_id, bus, reg, driver, st in await _rows(db, """
            SELECT v.id, v.bus_number, v.registration_no, v.driver_name, v.status
            FROM vehicles v
            WHERE v.school_id = CAST(:sid AS uuid) AND (
                v.bus_number ILIKE :term OR v.registration_no ILIKE :term OR v.driver_name ILIKE :term)
            LIMIT 4""", p, "vehicle"):
            results.append(SearchResultItem(
                entity="transport", id=str(v_id), title=f"Bus: {bus or reg or 'unnumbered'}",
                subtitle=f"Driver: {driver or 'not assigned'} • Reg: {reg or '—'}", status=st))

        # 8. Inventory.
        for i_id, item, cat, sku, qty in await _rows(db, """
            SELECT i.id, i.item_name, i.category_name, i.sku_barcode, i.available_quantity
            FROM inventory_items i
            WHERE i.school_id = CAST(:sid AS uuid) AND (
                i.item_name ILIKE :term OR i.category_name ILIKE :term OR i.sku_barcode ILIKE :term)
            LIMIT 4""", p, "inventory"):
            results.append(SearchResultItem(
                entity="inventory", id=str(i_id), title=f"Item: {item}",
                subtitle=f"{cat or 'Uncategorised'} • In stock: {qty if qty is not None else '—'}"
                         + (f" • {sku}" if sku else ""),
                status=None if qty is None else ("in stock" if qty > 0 else "out of stock")))

    return GlobalSearchResponse(query=q, total=len(results), results=results[:limit])
