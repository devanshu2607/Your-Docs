import sys
import time
from pathlib import Path

from sqlalchemy import text

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from Database.DataBase import Base, Engine  # noqa: E402

# Import models so SQLAlchemy registers every table before drop_all and create_all run.
import Models.Block_Model  # noqa: E402,F401
import Models.Collabration_Model  # noqa: E402,F401
import Models.Docs_Model  # noqa: E402,F401
import Models.Participating_Model  # noqa: E402,F401
import Models.User_Document  # noqa: E402,F401
import Models.User_Model  # noqa: E402,F401
import Models.User_Session  # noqa: E402,F401


def wait_for_database(max_attempts: int = 30, delay_seconds: int = 2) -> None:
    last_error = None
    for attempt in range(1, max_attempts + 1):
        try:
            with Engine.begin() as connection:
                connection.execute(text("SELECT 1"))
            return
        except Exception as exc:
            last_error = exc
            print(f"Database not ready yet, attempt {attempt}/{max_attempts}: {exc}")
            time.sleep(delay_seconds)
    raise RuntimeError("Database did not become ready in time") from last_error


def main() -> None:
    print("Waiting for database connection...")
    wait_for_database()
    
    print("Terminating other active connections...")
    try:
        with Engine.begin() as connection:
            connection.execute(text("""
                SELECT pg_terminate_backend(pid) 
                FROM pg_stat_activity 
                WHERE datname = current_database() 
                  AND pid <> pg_backend_pid();
            """))
    except Exception as e:
        print(f"Warning: Could not terminate other connections: {e}")

    print("WARNING: Dropping all tables cascadingly...")
    tables = [
        "Session_Participants_Table",
        "Collab_Session_Table",
        "User_Session_Table",
        "User_Docs",
        "Doc_Blocks",
        "Docs_table",
        "User_Table"
    ]
    with Engine.begin() as connection:
        connection.execute(text("SET lock_timeout = '15s'"))
        for table in tables:
            try:
                print(f"Dropping table {table} CASCADE...")
                connection.execute(text(f'DROP TABLE IF EXISTS "{table}" CASCADE'))
            except Exception as e:
                print(f"Failed to drop table {table}: {e}")

    print("Recreating all tables...")
    Base.metadata.create_all(bind=Engine)
    
    # Backfill join codes
    from scripts.add_join_codes import main as add_join_codes
    add_join_codes()
    print("Database tables rebuilt successfully.")



if __name__ == "__main__":
    main()
