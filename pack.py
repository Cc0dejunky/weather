import os
import sqlite3

# --- CONFIGURATION ---
# The output file is named for easy identification in NotebookLM
OUTPUT_FILE = "DAISY_Project_Context.txt"

# Extensions to include in the text dump for full project context
TEXT_EXTENSIONS = {
    '.js', '.html', '.css', '.json', '.md', '.txt', 
    '.py', '.gitignore', '.manifest'
}

# Folders to completely ignore to keep the context clean
IGNORE_DIRS = {
    'node_modules', '__pycache__', '.git', '.vscode', '.venv',
    '.developer', '.agent', 'dist', 'build'
}

# Specific files to ignore
IGNORE_FILES = {
    'package-lock.json',
    'daisy_project_context.txt',
    '.ds_store',
    'thumbs.db'
}

def separator(title):
    """Creates a clear visual separator for NotebookLM to distinguish files."""
    return f"\n\n{'='*80}\nFILE: {title}\n{'='*80}\n"

def get_db_schema(db_path):
    """Extracts table structure from SQLite DBs if any are present."""
    if not os.path.exists(db_path):
        return "[DB Not Found]"
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT sql FROM sqlite_master WHERE type='table';")
        schema = "\n".join([row[0] for row in cursor.fetchall() if row and row[0]])
        conn.close()
        return f"--- DATABASE SCHEMA ({db_path}) ---\n{schema}\n"
    except Exception as e:
        return f"[Error reading DB schema: {e}]"

def pack_system():
    print(f"Packing project files into {OUTPUT_FILE}...")
    
    with open(OUTPUT_FILE, "w", encoding="utf-8") as out:
        # 1. ROOT FILE STRUCTURE (The "X-Ray")
        # This helps NotebookLM understand how the project is organized
        out.write("##### COMPLETE PROJECT STRUCTURE #####\n")
        for root, dirs, files in os.walk("."):
            dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
            level = root.replace('.', '', 1).count(os.sep)
            indent = ' ' * 4 * (level)
            out.write(f"{indent}{os.path.basename(root) if os.path.basename(root) else 'ROOT'}/\n")
            
            subindent = ' ' * 4 * (level + 1)
            for f in files:
                if f.lower() in IGNORE_FILES:
                    continue
                out.write(f"{subindent}{f}\n")

        # 2. SOURCE CODE & CONTENT
        # This section dumps the actual contents of the JS, HTML, CSS, and JSON files
        out.write("\n\n##### CORE SOURCE CODE #####\n")
        for root, dirs, files in os.walk("."):
            dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
            for file in files:
                if file.lower() in IGNORE_FILES:
                    continue
                
                ext = os.path.splitext(file)[1].lower()
                path = os.path.join(root, file)

                # Capture all targeted text-based files
                if ext in TEXT_EXTENSIONS:
                    # Skip the output file itself
                    if file.lower() == OUTPUT_FILE.lower(): continue
                    
                    out.write(separator(path))
                    try:
                        with open(path, "r", encoding="utf-8") as f:
                            out.write(f.read())
                    except Exception as e:
                        out.write(f"[Error reading file: {e}]")

                # Capture Database Schemas if applicable
                if file.endswith(".db"):
                    out.write(separator(path))
                    out.write(get_db_schema(path))

    print(f"DONE: DAISY's project data is now packed into {OUTPUT_FILE}")

if __name__ == "__main__":
    pack_system()
