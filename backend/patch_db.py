import asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from app.config import settings

async def main():
    url = settings.database_url
    if not url:
        print("DATABASE_URL is not configured.")
        return
    
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)
        
    print(f"Connecting to database: {url.split('@')[-1]}")
    engine = create_async_engine(url, isolation_level="AUTOCOMMIT")
    
    queries = [
        "DROP VIEW IF EXISTS public.student_fee_ledger CASCADE;",
        """CREATE OR REPLACE VIEW public.student_fee_ledger 
WITH (security_invoker = true) AS
SELECT 
  s.id AS student_id,
  s.school_id,
  s.first_name,
  s.last_name,
  s.student_code,
  COALESCE(inv.total_invoiced, 0) AS total_invoiced,
  COALESCE(pay.total_paid, 0) AS total_paid,
  COALESCE(inv.total_invoiced, 0) - COALESCE(pay.total_paid, 0) AS outstanding_balance,
  COALESCE(inv.invoice_count, 0) AS invoice_count,
  COALESCE(pay.payment_count, 0) AS payment_count,
  COALESCE(inv.overdue_amount, 0) AS overdue_amount,
  COALESCE(inv.overdue_count, 0) AS overdue_count
FROM public.students s
LEFT JOIN LATERAL (
  SELECT 
    SUM(fi.total_amount) AS total_invoiced,
    COUNT(fi.id) AS invoice_count,
    SUM(CASE WHEN fi.status = 'overdue' OR (fi.status != 'paid' AND fi.due_date < CURRENT_DATE) THEN fi.total_amount ELSE 0 END) AS overdue_amount,
    COUNT(CASE WHEN fi.status = 'overdue' OR (fi.status != 'paid' AND fi.due_date < CURRENT_DATE) THEN 1 END) AS overdue_count
  FROM public.fee_invoices fi
  WHERE fi.student_id = s.id AND fi.school_id = s.school_id
) inv ON true
LEFT JOIN LATERAL (
  SELECT 
    SUM(fp.amount) AS total_paid,
    COUNT(fp.id) AS payment_count
  FROM public.fee_payments fp
  JOIN public.fee_invoices fi ON fi.id = fp.invoice_id
  WHERE fi.student_id = s.id AND fp.school_id = s.school_id AND fp.status = 'success'
) pay ON true;""",
        "GRANT SELECT ON public.student_fee_ledger TO authenticated;",
        "NOTIFY pgrst, 'reload schema';"
    ]
    
    async with engine.begin() as conn:
        for q in queries:
            try:
                print(f"Executing: {q}")
                await conn.execute(text(q))
                print("Success!")
            except Exception as e:
                print(f"Error executing query: {e}")
                
    await engine.dispose()
    print("Database patched successfully!")

if __name__ == "__main__":
    asyncio.run(main())
