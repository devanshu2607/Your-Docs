import sys
import time
from pathlib import Path

from sqlalchemy import text

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from Database.DataBase import Base, Engine  # noqa: E402

# Import models so SQLAlchemy registers every table before create_all runs.
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
    wait_for_database()
    Base.metadata.create_all(bind=Engine)
    print("Database tables created or already present.")


if __name__ == "__main__":
    main()
