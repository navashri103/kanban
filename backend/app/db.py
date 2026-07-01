import json
import sqlite3
from pathlib import Path
from typing import Any

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "pm.db"


def get_connection() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = get_connection()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS boards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
                data TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
            )
            """
        )
        conn.commit()
    finally:
        conn.close()


def get_user_by_username(username: str) -> sqlite3.Row | None:
    conn = get_connection()
    try:
        return conn.execute(
            "SELECT * FROM users WHERE username = ?", (username,)
        ).fetchone()
    finally:
        conn.close()


def create_user(username: str, password_hash: str) -> int:
    conn = get_connection()
    try:
        cursor = conn.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (username, password_hash),
        )
        conn.commit()
        return cursor.lastrowid
    finally:
        conn.close()


def create_board(user_id: int, data: dict[str, Any]) -> None:
    conn = get_connection()
    try:
        conn.execute(
            "INSERT INTO boards (user_id, data) VALUES (?, ?)",
            (user_id, json.dumps(data)),
        )
        conn.commit()
    finally:
        conn.close()


def get_board(user_id: int) -> dict[str, Any] | None:
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT data FROM boards WHERE user_id = ?", (user_id,)
        ).fetchone()
        return json.loads(row["data"]) if row else None
    finally:
        conn.close()


def save_board(user_id: int, data: dict[str, Any]) -> None:
    conn = get_connection()
    try:
        conn.execute(
            "UPDATE boards SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?",
            (json.dumps(data), user_id),
        )
        conn.commit()
    finally:
        conn.close()
