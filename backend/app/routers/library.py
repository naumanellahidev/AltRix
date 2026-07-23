"""
Library Management router: books catalog, issues, returns, fines, reservations.
"""
from typing import List, Optional
from uuid import UUID
from datetime import date, datetime, timedelta
from pydantic import BaseModel, ConfigDict
from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select, update

from app.dependencies import CurrentUser, DbSession
from app.models.library import LibraryBook, BookIssue, BookReservation

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

class BookOutSchema(BookCreateSchema):
    id: UUID
    school_id: UUID
    created_at: Optional[datetime]
    model_config = ConfigDict(from_attributes=True)

class IssueCreateSchema(BaseModel):
    book_id: UUID
    borrower_id: UUID
    borrower_type: Optional[str] = "student"
    due_days: Optional[int] = 14

class IssueOutSchema(BaseModel):
    id: UUID
    school_id: UUID
    book_id: UUID
    borrower_id: UUID
    borrower_type: str
    issue_date: Optional[date]
    due_date: date
    return_date: Optional[date]
    fine_amount: float
    fine_paid: bool
    status: str
    model_config = ConfigDict(from_attributes=True)

class ReservationCreateSchema(BaseModel):
    book_id: UUID
    student_id: UUID

class ReservationOutSchema(ReservationCreateSchema):
    id: UUID
    school_id: UUID
    reserved_at: Optional[datetime]
    status: str
    model_config = ConfigDict(from_attributes=True)


# --- Books Catalog Endpoints ---
@router.get("/books", response_model=List[BookOutSchema])
async def list_books(
    current_user: CurrentUser,
    db: DbSession,
    search: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
):
    if not current_user.school_id:
        return []
    stmt = select(LibraryBook).where(LibraryBook.school_id == current_user.school_id)
    if category:
        stmt = stmt.where(LibraryBook.category == category)
    if search:
        stmt = stmt.where(
            (LibraryBook.title.ilike(f"%{search}%")) |
            (LibraryBook.author.ilike(f"%{search}%")) |
            (LibraryBook.barcode == search) |
            (LibraryBook.isbn == search)
        )
    try:
        res = await db.execute(stmt)
        return list(res.scalars().all())
    except Exception:
        return []

@router.post("/books", response_model=BookOutSchema)
async def create_book(payload: BookCreateSchema, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise HTTPException(status_code=400, detail="User has no associated school")
    book = LibraryBook(school_id=current_user.school_id, **payload.model_dump())
    db.add(book)
    await db.commit()
    await db.refresh(book)
    return book


# --- Issue & Return Endpoints ---
@router.get("/issues", response_model=List[IssueOutSchema])
async def list_issues(
    current_user: CurrentUser,
    db: DbSession,
    status_filter: Optional[str] = Query(None),
):
    if not current_user.school_id:
        return []
    stmt = select(BookIssue).where(BookIssue.school_id == current_user.school_id)
    if status_filter:
        stmt = stmt.where(BookIssue.status == status_filter)
    try:
        res = await db.execute(stmt)
        return list(res.scalars().all())
    except Exception:
        return []

@router.post("/issue", response_model=IssueOutSchema)
async def issue_book(payload: IssueCreateSchema, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise HTTPException(status_code=400, detail="User has no associated school")
    
    # Check book availability
    stmt = select(LibraryBook).where(LibraryBook.id == payload.book_id, LibraryBook.school_id == current_user.school_id)
    res = await db.execute(stmt)
    book = res.scalar_one_or_none()
    if not book:
        raise HTTPException(status_code=440, detail="Book not found")
    if book.available_copies <= 0:
        raise HTTPException(status_code=400, detail="No copies currently available for issue")

    # Decrement available copies
    book.available_copies -= 1
    
    today = date.today()
    due_date = today + timedelta(days=payload.due_days or 14)
    
    issue = BookIssue(
        school_id=current_user.school_id,
        book_id=payload.book_id,
        borrower_id=payload.borrower_id,
        borrower_type=payload.borrower_type or "student",
        issue_date=today,
        due_date=due_date,
        status="issued"
    )
    db.add(issue)
    await db.commit()
    await db.refresh(issue)
    return issue

@router.post("/return/{issue_id}", response_model=IssueOutSchema)
async def return_book(issue_id: UUID, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise HTTPException(status_code=400, detail="User has no associated school")
    
    stmt = select(BookIssue).where(BookIssue.id == issue_id, BookIssue.school_id == current_user.school_id)
    res = await db.execute(stmt)
    issue = res.scalar_one_or_none()
    if not issue:
        raise HTTPException(status_code=404, detail="Book issue record not found")
    if issue.status == "returned":
        raise HTTPException(status_code=400, detail="Book already returned")

    today = date.today()
    issue.return_date = today
    issue.status = "returned"

    # Calculate fine if overdue ($10 per day default)
    if today > issue.due_date:
        days_overdue = (today - issue.due_date).days
        issue.fine_amount = days_overdue * 10.0

    # Increment available copies back
    stmt_book = select(LibraryBook).where(LibraryBook.id == issue.book_id)
    res_book = await db.execute(stmt_book)
    book = res_book.scalar_one_or_none()
    if book:
        book.available_copies += 1

    await db.commit()
    await db.refresh(issue)
    return issue


# --- Reservations Endpoints ---
@router.get("/reservations", response_model=List[ReservationOutSchema])
async def list_reservations(current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        return []
    stmt = select(BookReservation).where(BookReservation.school_id == current_user.school_id)
    try:
        res = await db.execute(stmt)
        return list(res.scalars().all())
    except Exception:
        return []

@router.post("/reserve", response_model=ReservationOutSchema)
async def reserve_book(payload: ReservationCreateSchema, current_user: CurrentUser, db: DbSession):
    if not current_user.school_id:
        raise HTTPException(status_code=400, detail="User has no associated school")
    reservation = BookReservation(
        school_id=current_user.school_id,
        book_id=payload.book_id,
        student_id=payload.student_id,
        status="pending"
    )
    db.add(reservation)
    await db.commit()
    await db.refresh(reservation)
    return reservation
