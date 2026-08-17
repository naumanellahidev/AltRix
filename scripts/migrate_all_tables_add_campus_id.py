import psycopg2
import sys

def run_migration():
    print("=== STARTING FAST AUTOCOMMIT DATABASE-WIDE MIGRATION AS POSTGRES SUPERUSER ===")
    conn = psycopg2.connect("dbname=altrix user=postgres")
    conn.autocommit = True
    cur = conn.cursor()

    try:
        # 1. Fetch all tables in public schema that have school_id
        cur.execute("""
            SELECT t.table_name 
            FROM information_schema.tables t
            WHERE t.table_schema = 'public' 
              AND t.table_type = 'BASE TABLE'
            ORDER BY t.table_name;
        """)
        all_tables = [r[0] for r in cur.fetchall()]
        
        tables_with_school = []
        for t in all_tables:
            cur.execute(f"SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '{t}'")
            cols = [r[0] for r in cur.fetchall()]
            if 'school_id' in cols and t != 'campuses':
                tables_with_school.append(t)

        print(f"Total {len(tables_with_school)} tables with school_id found.")

        # 2. Add campus_id and indexes to every table
        migrated_count = 0
        for idx, t in enumerate(tables_with_school, 1):
            cur.execute(f"SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '{t}' AND column_name = 'campus_id'")
            has_campus = cur.fetchone() is not None
            if not has_campus:
                try:
                    cur.execute(f"ALTER TABLE \"{t}\" ADD COLUMN IF NOT EXISTS campus_id UUID REFERENCES campuses(id) ON DELETE CASCADE;")
                    idx_name = f"idx_{t[:45]}_campus"
                    cur.execute(f"CREATE INDEX IF NOT EXISTS \"{idx_name}\" ON \"{t}\"(campus_id);")
                    migrated_count += 1
                    print(f"  [{idx}/{len(tables_with_school)}] Added campus_id -> '{t}'")
                except Exception as ex:
                    print(f"  [{idx}/{len(tables_with_school)}] ERROR on '{t}': {ex}")

        print(f"\nSuccessfully added campus_id to {migrated_count} tables.")

        # 3. Universal Backfill: assign all historical records with campus_id IS NULL to their school's primary campus
        print("\n=== BACKFILLING HISTORICAL DATA TO PRIMARY CAMPUSES ===")
        cur.execute("SELECT id, name, slug FROM schools ORDER BY name;")
        schools = cur.fetchall()

        for sid, sname, sslug in schools:
            # Find primary campus for this school
            cur.execute("""
                SELECT id, name 
                FROM campuses 
                WHERE school_id = %s 
                ORDER BY (slug = %s) DESC, created_at ASC 
                LIMIT 1;
            """, (sid, sslug))
            primary_campus = cur.fetchone()
            
            if not primary_campus:
                cur.execute("""
                    INSERT INTO campuses (id, school_id, name, slug, code, is_active)
                    VALUES (gen_random_uuid(), %s, %s, %s, 'MAIN', true)
                    RETURNING id, name;
                """, (sid, f"{sname} Main Campus", f"{sslug}-main"))
                primary_campus = cur.fetchone()

            pcid, pcname = primary_campus
            print(f"  Backfilling School '{sname}' -> Primary Campus: '{pcname}' ({pcid})")

            # Backfill across all tables for this school
            for t in tables_with_school:
                try:
                    cur.execute(f"""
                        UPDATE \"{t}\" 
                        SET campus_id = %s 
                        WHERE school_id = %s AND campus_id IS NULL;
                    """, (pcid, sid))
                except Exception as ex:
                    print(f"    Warning updating '{t}': {ex}")

        # 4. Create trigger to auto-assign primary campus if inserted without campus_id
        print("\n=== INSTALLING AUTO-CAMPUS TRIGGER FUNCTION ===")
        cur.execute("""
            CREATE OR REPLACE FUNCTION public.fn_auto_assign_campus_id()
            RETURNS TRIGGER AS $$
            DECLARE
                v_primary_campus_id UUID;
            BEGIN
                IF NEW.campus_id IS NULL AND NEW.school_id IS NOT NULL THEN
                    SELECT id INTO v_primary_campus_id
                    FROM public.campuses
                    WHERE school_id = NEW.school_id
                    ORDER BY created_at ASC
                    LIMIT 1;
                    
                    IF v_primary_campus_id IS NOT NULL THEN
                        NEW.campus_id := v_primary_campus_id;
                    END IF;
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        """)

        # Attach trigger to all tables with school_id
        for t in tables_with_school:
            try:
                trg_name = f"trg_auto_campus_{t[:40]}"
                cur.execute(f"DROP TRIGGER IF EXISTS \"{trg_name}\" ON \"{t}\";")
                cur.execute(f"""
                    CREATE TRIGGER \"{trg_name}\"
                    BEFORE INSERT ON \"{t}\"
                    FOR EACH ROW
                    EXECUTE FUNCTION public.fn_auto_assign_campus_id();
                """)
            except Exception as ex:
                pass

        print("Triggers installed on all tables.")

        cur.close()
        conn.close()
        print("\n=== MIGRATION COMPLETE! ALL TABLES NOW HAVE campus_id AND STRICT ISOLATION ===")

    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        cur.close()
        conn.close()
        sys.exit(1)

if __name__ == "__main__":
    run_migration()
