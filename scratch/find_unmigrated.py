import os
import re

hooks_dir = r"d:\Altrix Duplicate\src\hooks"
src_dir = r"d:\Altrix Duplicate\src"
output_path = r"d:\Altrix Duplicate\scratch\find_unmigrated_output.txt"

with open(output_path, "w", encoding="utf-8") as out:
    out.write("--- Scanning Hooks ---\n")
    for root, dirs, files in os.walk(hooks_dir):
        for file in files:
            if file.endswith((".ts", ".tsx")):
                path = os.path.join(root, file)
                with open(path, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()
                if "supabase" in content.lower():
                    has_fastapi = "use_fastapi" in content.lower()
                    is_realtime_offline = any(x in file.lower() for x in ["prefetch", "realtime", "typing", "session", "connection", "toast", "sync", "draft", "offline"])
                    if not has_fastapi and not is_realtime_offline:
                        out.write(f"Hook references Supabase but lacks USE_FASTAPI: {file}\n")

    out.write("\n--- Scanning Components / Pages for direct Supabase calls ---\n")
    for root, dirs, files in os.walk(src_dir):
        if "hooks" in root:
            continue
        for file in files:
            if file.endswith((".ts", ".tsx")):
                path = os.path.join(root, file)
                with open(path, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()
                if "supabase.from(" in content:
                    has_fastapi = "use_fastapi" in content.lower() or "apiclient" in content.lower()
                    rel_path = os.path.relpath(path, src_dir)
                    if not has_fastapi:
                        out.write(f"Component/Page queries Supabase directly: {rel_path}\n")

print("Done scanning.")
