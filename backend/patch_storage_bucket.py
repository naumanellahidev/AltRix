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
        
    print(f"Connecting to database to fix storage bucket RLS...")
    engine = create_async_engine(url, isolation_level="AUTOCOMMIT")
    
    queries = [
        # Ensure bucket exists
        """
        INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) 
        VALUES ('exam-datesheets', 'exam-datesheets', true, 10485760, ARRAY['application/pdf']) 
        ON CONFLICT (id) DO NOTHING;
        """,
        # Drop old policies if they exist to avoid conflicts
        "DROP POLICY IF EXISTS \"Allow select datesheets\" ON storage.objects;",
        "DROP POLICY IF EXISTS \"Allow insert datesheets\" ON storage.objects;",
        "DROP POLICY IF EXISTS \"Allow update datesheets\" ON storage.objects;",
        "DROP POLICY IF EXISTS \"Allow delete datesheets\" ON storage.objects;",
        
        "DROP POLICY IF EXISTS \"Public Access\" ON storage.objects;",
        "DROP POLICY IF EXISTS \"Authenticated Insert\" ON storage.objects;",
        "DROP POLICY IF EXISTS \"Authenticated Update\" ON storage.objects;",
        "DROP POLICY IF EXISTS \"Authenticated Delete\" ON storage.objects;",
        
        # Create SELECT policy (public or authenticated)
        "CREATE POLICY \"Allow select datesheets\" ON storage.objects FOR SELECT TO public USING (bucket_id = 'exam-datesheets');",
        # Create INSERT policy
        "CREATE POLICY \"Allow insert datesheets\" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'exam-datesheets');",
        # Create UPDATE policy
        "CREATE POLICY \"Allow update datesheets\" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'exam-datesheets');",
        # Create DELETE policy
        "CREATE POLICY \"Allow delete datesheets\" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'exam-datesheets');",
        
        "NOTIFY pgrst, 'reload schema';"
    ]
    
    async with engine.begin() as conn:
        for q in queries:
            try:
                print(f"Executing: {q.strip()}")
                await conn.execute(text(q))
                print("Success!")
            except Exception as e:
                print(f"Error executing query: {e}")
                
    await engine.dispose()
    print("Storage bucket RLS patched successfully!")

if __name__ == "__main__":
    asyncio.run(main())
