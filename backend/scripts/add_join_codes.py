import random
import string
import sys
from pathlib import Path

from sqlalchemy import text

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from Database.DataBase import Engine  # noqa: E402

JOIN_CODE_LENGTH = 6
JOIN_CODE_ALPHABET = string.ascii_uppercase + string.digits


def generate_join_code() -> str:
    return "".join(random.choice(JOIN_CODE_ALPHABET) for _ in range(JOIN_CODE_LENGTH))


def main() -> None:
    with Engine.begin() as connection:
        connection.execute(text('ALTER TABLE "Docs_table" ADD COLUMN IF NOT EXISTS join_code VARCHAR(6)'))
        connection.execute(text('CREATE UNIQUE INDEX IF NOT EXISTS ix_Docs_table_join_code ON "Docs_table" (join_code)'))

        existing_codes = {
            row[0]
            for row in connection.execute(text('SELECT join_code FROM "Docs_table" WHERE join_code IS NOT NULL'))
        }
        docs_without_codes = connection.execute(text('SELECT id FROM "Docs_table" WHERE join_code IS NULL')).fetchall()

        for row in docs_without_codes:
            doc_id = row[0]
            for _ in range(30):
                code = generate_join_code()
                if code not in existing_codes:
                    existing_codes.add(code)
                    connection.execute(
                        text('UPDATE "Docs_table" SET join_code = :join_code WHERE id = :doc_id'),
                        {"join_code": code, "doc_id": doc_id},
                    )
                    break
            else:
                raise RuntimeError("Could not generate a unique join code")

    print(f"Join codes added/backfilled for {len(docs_without_codes)} document(s).")


if __name__ == "__main__":
    main()
