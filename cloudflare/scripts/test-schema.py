"""SQLite smoke tests for the Cloudflare D1 migration, no cloud credentials required."""
import json
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parent.parent
sql = (root / "migrations" / "0001_initial.sql").read_text(encoding="utf-8")
db = sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys=ON")
db.executescript(sql)
snapshot = json.dumps({
    "app": "CasaFacile", "schemaVersion": 1,
    "household": {"id": "local", "name": "Casa"},
    "members": [{"id": "person", "name": "Io"}],
    "rooms": [], "chores": [], "history": [], "settings": {}
})
id = "11111111-1111-4111-8111-111111111111"
db.execute(
    "INSERT INTO households (id,name,snapshot_json,revision,owner_email,last_operation_id) "
    "VALUES (?,?,?,?,?,?)",
    (id, "Casa", snapshot, 1, "owner@example.it", "op-create"),
)
db.execute("INSERT INTO household_members (household_id,email,role) VALUES (?,?,?)",
           (id, "owner@example.it", "owner"))
db.execute(
    "INSERT INTO backups (id,household_id,revision,r2_key,created_by,bytes,sha256)"
    " VALUES (?,?,?,?,?,?,?)",
    ("b1", id, 1, "home/test-1.json", "owner@example.it", len(snapshot), "f" * 64),
)
# SQLite CASE compare-and-swap must allow only the first writer from revision 1.
first = db.execute(
    "UPDATE households SET revision=revision+1,last_operation_id=? "
    "WHERE id=? AND revision=?",
    ("op-a", id, 1),
)
assert first.rowcount == 1
second = db.execute(
    "UPDATE households SET revision=revision+1,last_operation_id=? "
    "WHERE id=? AND revision=?",
    ("op-b", id, 1),
)
assert second.rowcount == 0
# The backup insert must use the successful operation ID.
db.execute(
    "INSERT INTO backups (id,household_id,revision,r2_key,created_at,created_by,bytes,sha256) "
    "SELECT ?,id,revision,?,?,?,?,? FROM households WHERE id=? AND last_operation_id=?",
    ("b2", "home/test-2.json", "2026-11-09T12:00:00Z", "owner@example.it",
     len(snapshot), "a" * 64, id, "op-a"),
)
db.execute(
    "INSERT INTO backups (id,household_id,revision,r2_key,created_at,created_by,bytes,sha256) "
    "SELECT ?,id,revision,?,?,?,?,? FROM households WHERE id=? AND last_operation_id=?",
    ("b3", "home/test-3.json", "2026-11-09T12:01:00Z", "owner@example.it",
     len(snapshot), "b" * 64, id, "op-b"),
)
assert db.execute("SELECT count(*) FROM backups WHERE household_id=?", (id,)).fetchone()[0] == 2
# An invite may be claimed only once by the intended verified email.
db.execute(
    "INSERT INTO invitations (id,household_id,invited_email,role,token_hash,created_by,expires_at)"
    " VALUES (?,?,?,?,?,?,?)",
    ("i1", id, "guest@example.it", "viewer", "t" * 64, "owner@example.it", "2999-01-01T00:00:00Z"),
)
first_claim = db.execute(
    "UPDATE invitations SET accepted_at=?,accepted_operation_id=? "
    "WHERE id=? AND invited_email=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>?",
    ("2026-11-09T12:00:00Z", "accept-1", "i1", "guest@example.it", "2026-11-09T12:00:00Z"),
)
assert first_claim.rowcount == 1
later_claim = db.execute(
    "UPDATE invitations SET accepted_at=?,accepted_operation_id=? "
    "WHERE id=? AND invited_email=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>?",
    ("2026-11-09T12:01:00Z", "accept-2", "i1", "guest@example.it", "2026-11-09T12:01:00Z"),
)
assert later_claim.rowcount == 0
db.execute(
    "INSERT OR IGNORE INTO household_members (household_id,email,role,joined_at) "
    "SELECT household_id,invited_email,role,? FROM invitations "
    "WHERE id=? AND accepted_operation_id=?",
    ("2026-11-09T12:00:00Z", "i1", "accept-1"),
)
member = db.execute(
    "SELECT role FROM household_members WHERE household_id=? AND email=?",
    (id, "guest@example.it"),
).fetchone()
assert member == ("viewer",)
assert db.execute("PRAGMA foreign_key_check").fetchall() == []
print("Cloudflare D1 SQLite migration and revision/acceptance smoke tests: PASSED")
