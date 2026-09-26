import logging
from typing import List, Optional
from uuid import UUID
from decimal import Decimal, ROUND_HALF_UP
from datetime import date, datetime, timedelta
from pydantic import BaseModel, ConfigDict
from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select, update, or_

from app.dependencies import CurrentUser, DbSession
from app.models.library import LibraryBook, BookIssue, BookReservation
from app.utils.pagination import ListPageParams

logger = logging.getLogger("app.library")
router = APIRouter(prefix="/library", tags=["Library Management"])


# --- Schemas ---
class BookCreateSchema(BaseModel):
    title: str
    author: str
    isbn: Optional[str] = None
    barcode: Optional[str] = None
    category: Optional[str] = "General"
    publisher: Optional[str] = None
    publication_year: Optional[int] = None
    total_copies: int = 1
    available_copies: int = 1
    shelf_location: Optional[str] = None
    cover_image_url: Optional[str] = None
    campus_id: Optional[UUID] = None

class BookUpdateSchema(BaseModel):
    title: Optional[str] = None
    author: Optional[str] = None
    isbn: Optional[str] = None
    barcode: Optional[str] = None
    category: Optional[str] = None
    publisher: Optional[str] = None
    publication_year: Optional[int] = None
    total_copies: Optional[int] = None
    available_copies: Optional[int] = None
    shelf_location: Optional[str] = None
    cover_image_url: Optional[str] = None
    campus_id: Optional[UUID] = None

class BookOutSchema(BookCreateSchema):
    id: UUID
    school_id: UUID
    campus_id: Optional[UUID] = None
    created_at: Optional[datetime]
    model_config = ConfigDict(from_attributes=True)

class IssueCreateSchema(BaseModel):
    book_id: UUID
    borrower_id: str
    borrower_type: Optional[str] = "student"
    due_days: Optional[int] = 14
    fine_per_day: Optional[float] = 20.0
    campus_id: Optional[UUID] = None

class IssueOutSchema(BaseModel):
    id: UUID
    school_id: UUID
    campus_id: Optional[UUID] = None
    book_id: UUID
    borrower_id: UUID
    borrower_type: str
    issue_date: Optional[date] = None
    due_date: date
    return_date: Optional[date] = None
    fine_amount: Optional[float] = 0.0
    fine_per_day: Optional[float] = 20.0
    fine_paid: Optional[bool] = False
    status: Optional[str] = "issued"
    created_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)

class ReservationCreateSchema(BaseModel):
    book_id: UUID
    student_id: str
    campus_id: Optional[UUID] = None

class ReservationOutSchema(BaseModel):
    id: UUID
    school_id: UUID
    campus_id: Optional[UUID] = None
    book_id: UUID
    student_id: UUID
    reserved_at: Optional[datetime]
    status: str
    model_config = ConfigDict(from_attributes=True)


# --- Books Catalog Endpoints ---
def _to_uuid(val) -> Optional[UUID]:
    if not val:
        return None
    if isinstance(val, UUID):
        return val
    try:
        return UUID(str(val))
    except Exception:
        return None

def _strict_uuid(val, what: str) -> UUID:
    """A real id, or a 400. This used to turn any text (a name, say) into a
    made-up id, so loans and reservations pointed at students who do not exist."""
    try:
        return UUID(str(val))
    except Exception:
        raise HTTPException(status_code=400, detail=f"{what} is not a valid id")


def _is_staff(user) -> bool:
    from app.utils.permissions import expand_roles
    return bool(user.is_super_admin or set(expand_roles(user.roles or [])) - {"parent", "student"})


def _require_staff(user) -> None:
    # None of the library's writes checked the caller: a parent or a student
    # could add, change and delete books, and issue and return them.
    if not _is_staff(user):
        raise HTTPException(status_code=403, detail="Only the school's staff can manage the library.")


async def _family_student_ids(user, db) -> Optional[set]:
    """None for staff; otherwise the students this family account may see."""
    if _is_staff(user):
        return None
    from app.utils.security import get_allowed_student_ids
    return {str(x) for x in (await get_allowed_student_ids(user, db) or [])}


async def _student_in_school(db, student_id: UUID, school_uuid: UUID) -> None:
    from sqlalchemy import text as _t
    found = await db.execute(_t("SELECT 1 FROM students WHERE id = :s AND school_id = :sch"),
                             {"s": student_id, "sch": school_uuid})
    if found.first() is None:
        raise HTTPException(status_code=404, detail="Student not found in this school")


def _fine(days_overdue: int, rate) -> Decimal:
    """Money is exact: days x the daily rate, to the paisa."""
    return (Decimal(days_overdue) * Decimal(str(rate))).quantize(Decimal("0.01"), ROUND_HALF_UP)


# --- Books Catalog Endpoints ---
@router.get("/books", response_model=List[BookOutSchema])
async def list_books(
    current_user: CurrentUser,
    db: DbSession,
    page: ListPageParams, search: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    campus_id: Optional[UUID] = Query(None),
):
    school_uuid = _to_uuid(current_user.school_id)
    if not school_uuid:
        return []
    effective_cid = campus_id if isinstance(campus_id, (UUID, str)) else _to_uuid(current_user.campus_id)
    stmt = select(LibraryBook).where(LibraryBook.school_id == school_uuid)
    if effective_cid:
        stmt = stmt.where(or_(LibraryBook.campus_id == effective_cid, LibraryBook.campus_id.is_(None)))
    if category and category != "All":
        stmt = stmt.where(LibraryBook.category == category)
    if search:
        stmt = stmt.where(
            (LibraryBook.title.ilike(f"%{search}%")) |
            (LibraryBook.author.ilike(f"%{search}%")) |
            (LibraryBook.barcode == search) |
            (LibraryBook.isbn == search)
        )
    try:
        res = await db.execute(page.apply(stmt))
        return list(res.scalars().all())
    except Exception as e:
        logger.warning(f"Error listing library books: {e}")
        return []

@router.post("/books", response_model=BookOutSchema)
async def create_book(payload: BookCreateSchema, current_user: CurrentUser, db: DbSession):
    _require_staff(current_user)
    school_uuid = _to_uuid(current_user.school_id)
    if not school_uuid:
        raise HTTPException(status_code=400, detail="User has no associated school")
    effective_cid = payload.campus_id if isinstance(payload.campus_id, (UUID, str)) else _to_uuid(current_user.campus_id)
    book_data = payload.model_dump(exclude={"campus_id"})
    try:
        book = LibraryBook(
            school_id=school_uuid,
            campus_id=effective_cid,
            **book_data
        )
        db.add(book)
        await db.commit()
        await db.refresh(book)
        return book
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to create book: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=f"Failed to create book: {str(e)}")


# --- Issue & Return Endpoints ---
@router.get("/issues", response_model=List[IssueOutSchema])
async def list_issues(
    current_user: CurrentUser,
    db: DbSession,
    page: ListPageParams,
    status_filter: Optional[str] = Query(None),
    campus_id: Optional[UUID] = Query(None),
):
    school_uuid = _to_uuid(current_user.school_id)
    if not school_uuid:
        return []
    effective_cid = campus_id if isinstance(campus_id, (UUID, str)) else _to_uuid(current_user.campus_id)
    stmt = select(BookIssue).where(BookIssue.school_id == school_uuid)
    # Everyone's loans and fines went to any account. A family sees its own.
    family = await _family_student_ids(current_user, db)
    if family is not None:
        if not family:
            return []
        stmt = stmt.where(BookIssue.borrower_type == "student",
                          BookIssue.borrower_id.in_([UUID(x) for x in family]))
    if effective_cid:
        stmt = stmt.where(or_(BookIssue.campus_id == effective_cid, BookIssue.campus_id.is_(None)))
    if status_filter:
        stmt = stmt.where(BookIssue.status == status_filter)
    try:
        res = await db.execute(page.apply(stmt))
        issues = list(res.scalars().all())
        today = date.today()
        # Automatically compute live overdue fines
        for iss in issues:
            if iss.status != "returned" and iss.due_date and today > iss.due_date:
                days_overdue = (today - iss.due_date).days
                rate = iss.fine_per_day if iss.fine_per_day is not None else 20
                iss.fine_amount = _fine(days_overdue, rate)
        return issues
    except Exception as e:
        logger.warning(f"Error listing book issues: {e}")
        raise HTTPException(status_code=503, detail="The library loans could not be loaded.")


@router.post("/issue", response_model=IssueOutSchema)
async def issue_book(payload: IssueCreateSchema, current_user: CurrentUser, db: DbSession):
    _require_staff(current_user)
    school_uuid = _to_uuid(current_user.school_id)
    if not school_uuid:
        raise HTTPException(status_code=400, detail="User has no associated school")
    
    # Check book availability
    stmt = select(LibraryBook).where(LibraryBook.id == payload.book_id, LibraryBook.school_id == school_uuid)
    res = await db.execute(stmt)
    book = res.scalar_one_or_none()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    if book.available_copies <= 0:
        raise HTTPException(status_code=400, detail="No copies currently available for issue")

    # Decrement available copies
    book.available_copies = max(0, book.available_copies - 1)
    
    today = date.today()
    due_date = today + timedelta(days=payload.due_days or 14)
    borrower_uuid = _strict_uuid(payload.borrower_id, "borrower_id")
    if (payload.borrower_type or "student") == "student":
        await _student_in_school(db, borrower_uuid, school_uuid)
    
    raw_cid = payload.campus_id if getattr(payload, "campus_id", None) else (current_user.campus_id or book.campus_id)
    effective_cid = None
    if raw_cid:
        try:
            cid_uuid = UUID(str(raw_cid))
            from app.models.campus import Campus
            res_camp = await db.execute(select(Campus.id).where(Campus.id == cid_uuid, Campus.school_id == school_uuid))
            if res_camp.scalar_one_or_none():
                effective_cid = cid_uuid
        except Exception:
            effective_cid = None
    
    issue = BookIssue(
        school_id=school_uuid,
        campus_id=effective_cid,
        book_id=payload.book_id,
        borrower_id=borrower_uuid,
        borrower_type=payload.borrower_type or "student",
        issue_date=today,
        due_date=due_date,
        fine_per_day=payload.fine_per_day if payload.fine_per_day is not None else 20.0,
        fine_amount=0.00,
        fine_paid=False,
        status="issued"
    )
    
    try:
        db.add(issue)
        await db.commit()
        await db.refresh(issue)
        return issue
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to issue book: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=f"Failed to issue book: {str(e)}")


@router.post("/return/{issue_id}", response_model=IssueOutSchema)
async def return_book(issue_id: UUID, current_user: CurrentUser, db: DbSession):
    _require_staff(current_user)
    school_uuid = _to_uuid(current_user.school_id)
    if not school_uuid:
        raise HTTPException(status_code=400, detail="User has no associated school")
    
    stmt = select(BookIssue).where(BookIssue.id == issue_id, BookIssue.school_id == school_uuid)
    res = await db.execute(stmt)
    issue = res.scalar_one_or_none()
    if not issue:
        raise HTTPException(status_code=404, detail="Book issue record not found")
    if issue.status == "returned":
        raise HTTPException(status_code=400, detail="Book already returned")

    today = date.today()
    issue.return_date = today
    issue.status = "returned"

    if today > issue.due_date:
        days_overdue = (today - issue.due_date).days
        rate = issue.fine_per_day if issue.fine_per_day is not None else 20
        issue.fine_amount = _fine(days_overdue, rate)

    # Increment available copies
    stmt_book = select(LibraryBook).where(LibraryBook.id == issue.book_id, LibraryBook.school_id == school_uuid)
    res_book = await db.execute(stmt_book)
    book = res_book.scalar_one_or_none()
    if book and book.available_copies < book.total_copies:
        book.available_copies += 1

    try:
        await db.commit()
        await db.refresh(issue)
        return issue
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to return book: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=f"Failed to return book: {str(e)}")


# --- Reservations Endpoints ---
@router.get("/reservations", response_model=List[ReservationOutSchema])
async def list_reservations(
    current_user: CurrentUser,
    db: DbSession,
    page: ListPageParams, campus_id: Optional[UUID] = Query(None),
):
    school_uuid = _to_uuid(current_user.school_id)
    if not school_uuid:
        return []
    effective_cid = campus_id if isinstance(campus_id, (UUID, str)) else _to_uuid(current_user.campus_id)
    stmt = select(BookReservation).where(BookReservation.school_id == school_uuid)
    family = await _family_student_ids(current_user, db)
    if family is not None:
        if not family:
            return []
        stmt = stmt.where(BookReservation.student_id.in_([UUID(x) for x in family]))
    if effective_cid:
        stmt = stmt.where(or_(BookReservation.campus_id == effective_cid, BookReservation.campus_id.is_(None)))
    try:
        res = await db.execute(page.apply(stmt))
        return list(res.scalars().all())
    except Exception as e:
        logger.warning(f"Error listing reservations: {e}")
        return []

@router.post("/reservations", response_model=ReservationOutSchema)
async def reserve_book(payload: ReservationCreateSchema, current_user: CurrentUser, db: DbSession):
    school_uuid = _to_uuid(current_user.school_id)
    if not school_uuid:
        raise HTTPException(status_code=400, detail="User has no associated school")
    
    stmt = select(LibraryBook).where(LibraryBook.id == payload.book_id, LibraryBook.school_id == school_uuid)
    res = await db.execute(stmt)
    book = res.scalar_one_or_none()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
        
    student_uuid = _strict_uuid(payload.student_id, "student_id")
    family = await _family_student_ids(current_user, db)
    if family is not None and str(student_uuid) not in family:
        raise HTTPException(status_code=403, detail="You can only reserve a book for yourself or your own child.")
    await _student_in_school(db, student_uuid, school_uuid)
    raw_cid = payload.campus_id if getattr(payload, "campus_id", None) else (current_user.campus_id or book.campus_id)
    effective_cid = None
    if raw_cid:
        try:
            cid_uuid = UUID(str(raw_cid))
            from app.models.campus import Campus
            res_camp = await db.execute(select(Campus.id).where(Campus.id == cid_uuid, Campus.school_id == school_uuid))
            if res_camp.scalar_one_or_none():
                effective_cid = cid_uuid
        except Exception:
            effective_cid = None
    
    try:
        reservation = BookReservation(
            school_id=school_uuid,
            campus_id=effective_cid,
            book_id=payload.book_id,
            student_id=student_uuid,
            status="pending"
        )
        db.add(reservation)
        await db.commit()
        await db.refresh(reservation)
        return reservation
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to reserve book: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=f"Failed to reserve book: {str(e)}")

@router.put("/books/{book_id}", response_model=BookOutSchema)
async def update_book(book_id: UUID, payload: BookUpdateSchema, current_user: CurrentUser, db: DbSession):
    _require_staff(current_user)
    school_uuid = _to_uuid(current_user.school_id)
    if not school_uuid:
        raise HTTPException(status_code=400, detail="User has no associated school")
    stmt = select(LibraryBook).where(LibraryBook.id == book_id, LibraryBook.school_id == school_uuid)
    res = await db.execute(stmt)
    book = res.scalar_one_or_none()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    
    update_data = payload.model_dump(exclude_unset=True)
    for field, val in update_data.items():
        setattr(book, field, val)
        
    try:
        await db.commit()
        await db.refresh(book)
        return book
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to update book: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=f"Failed to update book: {str(e)}")


@router.delete("/books/{book_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_book(book_id: UUID, current_user: CurrentUser, db: DbSession):
    _require_staff(current_user)
    school_uuid = _to_uuid(current_user.school_id)
    if not school_uuid:
        raise HTTPException(status_code=400, detail="User has no associated school")
    stmt = select(LibraryBook).where(LibraryBook.id == book_id, LibraryBook.school_id == school_uuid)
    res = await db.execute(stmt)
    book = res.scalar_one_or_none()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    
    from sqlalchemy import delete as sql_delete
    try:
        # Clean up dependent circulation issues & reservations first
        await db.execute(sql_delete(BookIssue).where(BookIssue.book_id == book_id))
        await db.execute(sql_delete(BookReservation).where(BookReservation.book_id == book_id))
        await db.delete(book)
        await db.commit()
        return {"message": "Book deleted successfully"}
    except Exception as e:
        await db.rollback()
        logger.error(f"Failed to delete book: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=f"Failed to delete book: {str(e)}")

