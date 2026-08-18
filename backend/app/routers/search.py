"""
Global search router: High-performance multi-entity search for Students, Staff, Parents, Classes, CRM Leads, Library, Transport, and Assets.
"""
from typing import List, Optional, Dict, Any
from uuid import UUID
from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel
from sqlalchemy import text

from app.dependencies import CurrentUser, DbSession

router = APIRouter(prefix="/search", tags=["Search"])


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


@router.get("/global", response_model=GlobalSearchResponse)
async def global_search(
    q: str = Query(..., min_length=1, max_length=100, description="Search term"),
    limit: int = Query(30, ge=1, le=100),
    current_user: CurrentUser = None,
    db: DbSession = None,
):
    if not current_user or not current_user.school_id:
        return GlobalSearchResponse(query=q, total=0, results=[])

    school_id = str(current_user.school_id)
    term = f"%{q.strip()}%"
    results: List[SearchResultItem] = []

    # 1. Students Search
    try:
        stmt = text("""
            SELECT id, first_name, last_name, roll_number, student_code, phone, parent_name, status
            FROM students
            WHERE school_id = :sid AND (
                first_name ILIKE :term OR
                last_name ILIKE :term OR
                roll_number ILIKE :term OR
                student_code ILIKE :term OR
                phone ILIKE :term OR
                registration_number ILIKE :term
            )
            ORDER BY first_name ASC
            LIMIT 8
        """)
        res = await db.execute(stmt, {"sid": school_id, "term": term})
        for row in res.fetchall():
            s_id, fn, ln, roll, code, ph, p_name, st = row
            name = f"{fn or ''} {ln or ''}".strip() if (fn or ln) else "Student"
            sub = f"Roll: {roll or code or 'N/A'} • Parent: {p_name or 'N/A'}"
            results.append(SearchResultItem(
                entity="students",
                id=str(s_id),
                title=name,
                subtitle=sub,
                status=st or "enrolled",
                metadata={"phone": ph, "parent_name": p_name}
            ))
    except Exception:
        pass

    # 2. Parents Search (from students table + user_roles)
    try:
        stmt = text("""
            SELECT DISTINCT ON (parent_name, parent_phone) 
                id, parent_name, parent_phone, parent_email, first_name, last_name
            FROM students
            WHERE school_id = :sid AND parent_name IS NOT NULL AND parent_name != '' AND (
                parent_name ILIKE :term OR
                parent_phone ILIKE :term OR
                parent_email ILIKE :term
            )
            ORDER BY parent_name, parent_phone, first_name ASC
            LIMIT 8
        """)
        res = await db.execute(stmt, {"sid": school_id, "term": term})
        for row in res.fetchall():
            s_id, p_name, p_phone, p_email, s_fn, s_ln = row
            s_name = f"{s_fn or ''} {s_ln or ''}".strip() or "Student"
            sub = f"Child: {s_name} • Phone: {p_phone or p_email or 'N/A'}"
            results.append(SearchResultItem(
                entity="parents",
                id=str(s_id),
                title=str(p_name),
                subtitle=sub,
                status="active",
                metadata={"phone": p_phone, "email": p_email, "child": s_name}
            ))
    except Exception:
        pass

    # 3. Staff & Faculty Search (Profiles + User Roles + HR Staff Directory)
    try:
        # A: User roles + profiles
        stmt = text("""
            SELECT u.id, u.user_id, u.role, p.display_name, p.email, p.phone
            FROM user_roles u
            LEFT JOIN profiles p ON u.user_id = p.id
            WHERE u.school_id = :sid AND u.role NOT IN ('student', 'parent') AND (
                p.display_name ILIKE :term OR
                p.email ILIKE :term OR
                p.phone ILIKE :term OR
                u.role ILIKE :term
            )
            LIMIT 8
        """)
        res = await db.execute(stmt, {"sid": school_id, "term": term})
        for row in res.fetchall():
            r_id, u_id, role, d_name, email, ph = row
            role_label = str(role or "staff").replace("_", " ").title()
            name = str(d_name or email or role_label)
            sub = f"{role_label} • {email or ph or 'Campus Staff'}"
            results.append(SearchResultItem(
                entity="staff",
                id=str(u_id or r_id),
                title=name,
                subtitle=sub,
                status="active",
                metadata={"role": role, "email": email, "phone": ph}
            ))

        # B: HR Staff Directory (for employees not yet linked to profiles)
        stmt_hr = text("""
            SELECT id, full_name, email, phone, position, department
            FROM hr_staff_directory
            WHERE school_id = :sid AND is_active = true AND (
                full_name ILIKE :term OR
                email ILIKE :term OR
                phone ILIKE :term OR
                position ILIKE :term OR
                department ILIKE :term
            )
            LIMIT 6
        """)
        res_hr = await db.execute(stmt_hr, {"sid": school_id, "term": term})
        for row in res_hr.fetchall():
            hr_id, fn, email, ph, pos, dept = row
            if fn and not any(r.title == fn for r in results if r.entity == "staff"):
                sub = f"{pos or dept or 'Staff'} • {email or ph or 'Active'}"
                results.append(SearchResultItem(
                    entity="staff",
                    id=str(hr_id),
                    title=str(fn),
                    subtitle=sub,
                    status="active",
                    metadata={"position": pos, "department": dept, "email": email}
                ))
    except Exception:
        pass

    # 4. Academic Classes & Sections Search
    try:
        stmt = text("""
            SELECT id, name, grade_level
            FROM academic_classes
            WHERE school_id = :sid AND (
                name ILIKE :term OR 
                CAST(grade_level AS TEXT) ILIKE :term
            )
            ORDER BY name ASC
            LIMIT 6
        """)
        res = await db.execute(stmt, {"sid": school_id, "term": term})
        for row in res.fetchall():
            c_id, name, gr = row
            sub = f"Grade Level: {gr or 'Academic'}"
            results.append(SearchResultItem(
                entity="classes",
                id=str(c_id),
                title=f"Class: {name}",
                subtitle=sub,
                status="active"
            ))
    except Exception:
        pass

    # 5. CRM Leads Search
    try:
        stmt = text("""
            SELECT id, student_name, parent_name, phone, status
            FROM crm_leads
            WHERE school_id = :sid AND (
                student_name ILIKE :term OR
                parent_name ILIKE :term OR
                phone ILIKE :term
            )
            ORDER BY created_at DESC
            LIMIT 6
        """)
        res = await db.execute(stmt, {"sid": school_id, "term": term})
        for row in res.fetchall():
            l_id, s_name, p_name, ph, st = row
            name = str(s_name or "Applicant Lead")
            sub = f"Parent: {p_name or 'N/A'} • {ph or ''}"
            results.append(SearchResultItem(
                entity="leads",
                id=str(l_id),
                title=name,
                subtitle=sub,
                status=st or "new"
            ))
    except Exception:
        pass

    # 6. Library Books Search
    try:
        stmt = text("""
            SELECT id, title, author, isbn, barcode, available_copies, total_copies
            FROM library_books
            WHERE school_id = :sid AND (
                title ILIKE :term OR
                author ILIKE :term OR
                isbn ILIKE :term OR
                barcode ILIKE :term
            )
            LIMIT 6
        """)
        res = await db.execute(stmt, {"sid": school_id, "term": term})
        for row in res.fetchall():
            b_id, title, author, isbn, bar, avail, total = row
            sub = f"by {author or 'Unknown'} • Avail: {avail}/{total} • Barcode: {bar or 'N/A'}"
            results.append(SearchResultItem(
                entity="library",
                id=str(b_id),
                title=f"Book: {title}",
                subtitle=sub,
                status="available" if avail > 0 else "borrowed"
            ))
    except Exception:
        pass

    # 7. Transport Vehicles Search
    try:
        stmt = text("""
            SELECT id, bus_number, registration_no, driver_name
            FROM transport_vehicles
            WHERE school_id = :sid AND (
                bus_number ILIKE :term OR
                registration_no ILIKE :term OR
                driver_name ILIKE :term
            )
            LIMIT 4
        """)
        res = await db.execute(stmt, {"sid": school_id, "term": term})
        for row in res.fetchall():
            v_id, bus_num, reg, driver = row
            sub = f"Driver: {driver or 'Unassigned'} • Reg: {reg or 'N/A'}"
            results.append(SearchResultItem(
                entity="transport",
                id=str(v_id),
                title=f"Bus: {bus_num}",
                subtitle=sub,
                status="active"
            ))
    except Exception:
        pass

    # 8. Inventory Items Search
    try:
        stmt = text("""
            SELECT id, item_name, category, sku, quantity
            FROM inventory_items
            WHERE school_id = :sid AND (
                item_name ILIKE :term OR
                category ILIKE :term OR
                sku ILIKE :term
            )
            LIMIT 4
        """)
        res = await db.execute(stmt, {"sid": school_id, "term": term})
        for row in res.fetchall():
            i_id, item_name, cat, sku, qty = row
            sub = f"Category: {cat or 'General'} • Qty: {qty or 0} • SKU: {sku or 'N/A'}"
            results.append(SearchResultItem(
                entity="inventory",
                id=str(i_id),
                title=f"Asset: {item_name}",
                subtitle=sub,
                status="in_stock"
            ))
    except Exception:
        pass

    return GlobalSearchResponse(
        query=q,
        total=len(results),
        results=results[:limit]
    )
