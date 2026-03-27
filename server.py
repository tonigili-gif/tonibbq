from __future__ import annotations

import json
import re
import sys
from copy import deepcopy
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data" / "groups"
HOST = "0.0.0.0"
PORT = 8042
GROUP_PATTERN = re.compile(r"^[A-Z0-9_-]{3,40}$")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def blank_group(group_code: str) -> dict:
    return {
        "groupCode": group_code,
        "plan": {
            "date": "",
            "responseDeadlineEnabled": False,
            "responseDeadline": "",
            "adults": "",
            "children": "",
            "bbqReserved": "",
            "tablesReserved": "",
            "notes": "",
            "archivedAt": "",
            "updatedAt": ""
        },
        "archivedPlans": [],
        "friends": [],
        "expenses": [],
        "items": [],
        "messages": []
    }


class ToniBBQHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/health":
            self._send_json({"status": "ok", "time": now_iso()})
            return

        if parsed.path.startswith("/api/groups/"):
            group_code = self._extract_group_code(parsed.path)
            if not group_code:
                self._send_json({"error": "invalid group code"}, status=HTTPStatus.BAD_REQUEST)
                return

            record = self._load_group_record(group_code)
            self._send_json(record)
            return

        return super().do_GET()

    def do_PUT(self):
        parsed = urlparse(self.path)
        if not parsed.path.startswith("/api/groups/"):
            self._send_json({"error": "not found"}, status=HTTPStatus.NOT_FOUND)
            return

        group_code = self._extract_group_code(parsed.path)
        if not group_code:
            self._send_json({"error": "invalid group code"}, status=HTTPStatus.BAD_REQUEST)
            return

        length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(length)

        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except json.JSONDecodeError:
            self._send_json({"error": "invalid json"}, status=HTTPStatus.BAD_REQUEST)
            return

        current = self._load_group_record(group_code)
        merged_group = merge_group_data(current["group"], payload.get("group") or blank_group(group_code))
        revision = int(current.get("revision", 0)) + 1

        record = {
            "revision": revision,
            "updatedAt": now_iso(),
            "group": merged_group
        }

        self._save_group_record(group_code, record)
        self._send_json(record)

    def log_message(self, format, *args):
        sys.stdout.write("%s - - [%s] %s\n" % (self.address_string(), self.log_date_time_string(), format % args))

    def _extract_group_code(self, path: str) -> str | None:
        encoded = path.rsplit("/", 1)[-1]
        group_code = unquote(encoded).upper()
        if not GROUP_PATTERN.match(group_code):
            return None
        return group_code

    def _group_path(self, group_code: str) -> Path:
        return DATA_DIR / f"{group_code}.json"

    def _load_group_record(self, group_code: str) -> dict:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        path = self._group_path(group_code)
        if not path.exists():
            return {
                "revision": 0,
                "updatedAt": "",
                "group": blank_group(group_code)
            }
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {
                "revision": 0,
                "updatedAt": "",
                "group": blank_group(group_code)
            }

    def _save_group_record(self, group_code: str, record: dict) -> None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        path = self._group_path(group_code)
        path.write_text(json.dumps(record, ensure_ascii=True, indent=2), encoding="utf-8")

    def _send_json(self, payload: dict, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=True).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


def merge_group_data(existing: dict, incoming: dict) -> dict:
    group_code = incoming.get("groupCode") or existing.get("groupCode") or ""
    plan = merge_plan(existing.get("plan") or {}, incoming.get("plan") or {})
    archived_plans = merge_archived_plans(existing.get("archivedPlans") or [], incoming.get("archivedPlans") or [])
    friends = merge_friends(existing.get("friends") or [], incoming.get("friends") or [])
    expenses = merge_expenses(existing.get("expenses") or [], incoming.get("expenses") or [])
    items = merge_items(existing.get("items") or [], incoming.get("items") or [])
    messages = merge_messages(existing.get("messages") or [], incoming.get("messages") or [])
    return {
        "groupCode": group_code,
        "plan": plan,
        "archivedPlans": archived_plans,
        "friends": friends,
        "expenses": expenses,
        "items": items,
        "messages": messages
    }


def merge_plan(existing: dict, incoming: dict) -> dict:
    existing_time = existing.get("updatedAt") or ""
    incoming_time = incoming.get("updatedAt") or ""
    chosen = incoming if incoming_time >= existing_time else existing
    merged = deepcopy(chosen)
    merged.setdefault("date", "")
    merged.setdefault("responseDeadlineEnabled", False)
    merged.setdefault("responseDeadline", "")
    merged.setdefault("adults", "")
    merged.setdefault("children", "")
    merged.setdefault("bbqReserved", "")
    merged.setdefault("tablesReserved", "")
    merged.setdefault("notes", "")
    merged.setdefault("archivedAt", "")
    merged.setdefault("updatedAt", "")
    return merged


def merge_friends(existing: list[dict], incoming: list[dict]) -> list[dict]:
    merged: dict[str, dict] = {}

    for friend in existing + incoming:
        friend_id = friend.get("id")
        if not friend_id:
            continue
        previous = merged.get(friend_id)
        if previous is None or (friend.get("updatedAt") or "") >= (previous.get("updatedAt") or ""):
            merged[friend_id] = {
                "id": friend_id,
                "deviceId": friend.get("deviceId", ""),
                "name": friend.get("name", ""),
                "updatedAt": friend.get("updatedAt", "")
            }

    deduped: dict[str, dict] = {}
    for friend in merged.values():
        key = friend.get("name", "").strip().lower()
        previous = deduped.get(key)
        if not previous or (friend.get("updatedAt") or "") >= (previous.get("updatedAt") or ""):
            deduped[key] = friend

    return sorted(deduped.values(), key=lambda friend: friend.get("name", "").lower())


def merge_items(existing: list[dict], incoming: list[dict]) -> list[dict]:
    merged: dict[str, dict] = {}
    for item in existing + incoming:
        item_id = item.get("id")
        if not item_id:
            continue
        previous = merged.get(item_id)
        if previous is None or (item.get("updatedAt") or "") >= (previous.get("updatedAt") or ""):
            merged[item_id] = {
                "id": item_id,
                "name": item.get("name", ""),
                "quantity": item.get("quantity", ""),
                "ownerId": item.get("ownerId", ""),
                "updatedAt": item.get("updatedAt", ""),
                "completedAt": item.get("completedAt", ""),
                "deletedAt": item.get("deletedAt", "")
            }

    return sorted(merged.values(), key=lambda item: item.get("updatedAt", ""), reverse=True)


def merge_expenses(existing: list[dict], incoming: list[dict]) -> list[dict]:
    merged: dict[str, dict] = {}
    for entry in existing + incoming:
        friend_id = entry.get("friendId")
        if not friend_id:
            continue
        previous = merged.get(friend_id)
        if previous is None or (entry.get("updatedAt") or "") >= (previous.get("updatedAt") or ""):
            merged[friend_id] = {
                "friendId": friend_id,
                "included": bool(entry.get("included")),
                "adultsCount": str(entry.get("adultsCount", "0")),
                "paid": str(entry.get("paid", "")),
                "updatedAt": entry.get("updatedAt", "")
            }

    return sorted(merged.values(), key=lambda item: item.get("friendId", ""))


def merge_messages(existing: list[dict], incoming: list[dict]) -> list[dict]:
    merged: dict[str, dict] = {}
    for message in existing + incoming:
        message_id = message.get("id")
        if not message_id:
            continue
        previous = merged.get(message_id)
        if previous is None or (message.get("updatedAt") or "") >= (previous.get("updatedAt") or ""):
            merged[message_id] = {
                "id": message_id,
                "authorId": message.get("authorId", ""),
                "text": message.get("text", ""),
                "photoDataUrl": message.get("photoDataUrl", ""),
                "createdAt": message.get("createdAt", ""),
                "updatedAt": message.get("updatedAt", ""),
                "deletedAt": message.get("deletedAt", "")
            }

    return sorted(merged.values(), key=lambda message: message.get("createdAt", ""))


def merge_archived_plans(existing: list[dict], incoming: list[dict]) -> list[dict]:
    merged: dict[str, dict] = {}
    for entry in existing + incoming:
        entry_id = entry.get("id")
        if not entry_id:
            continue
        previous = merged.get(entry_id)
        if previous is None or (entry.get("updatedAt") or "") >= (previous.get("updatedAt") or ""):
            merged[entry_id] = deepcopy(entry)

    return sorted(merged.values(), key=lambda entry: entry.get("archivedAt", ""), reverse=True)


def run() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer((HOST, PORT), ToniBBQHandler)
    print(f"ToniBBQ server running on http://127.0.0.1:{PORT}")
    print("Open the same server IP from other mobiles on the same Wi-Fi.")
    server.serve_forever()


if __name__ == "__main__":
    run()
