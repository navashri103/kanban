import secrets
import time

from fastapi import Cookie, HTTPException, Response

SESSION_COOKIE = "session"
SESSION_TTL_SECONDS = 7 * 24 * 60 * 60

# token -> (user_id, expires_at). Expired entries are dropped on lookup, so the
# dict can't grow unboundedly with stale sessions.
_sessions: dict[str, tuple[int, float]] = {}


def create_session(response: Response, user_id: int) -> None:
    token = secrets.token_urlsafe(32)
    _sessions[token] = (user_id, time.time() + SESSION_TTL_SECONDS)
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        httponly=True,
        samesite="lax",
        max_age=SESSION_TTL_SECONDS,
    )


def get_user_id(session: str | None) -> int | None:
    if session is None:
        return None
    entry = _sessions.get(session)
    if entry is None:
        return None
    user_id, expires_at = entry
    if time.time() >= expires_at:
        _sessions.pop(session, None)
        return None
    return user_id


def end_session(session: str | None, response: Response) -> None:
    if session is not None:
        _sessions.pop(session, None)
    response.delete_cookie(SESSION_COOKIE)


def require_session(
    session: str | None = Cookie(default=None, alias=SESSION_COOKIE),
) -> int:
    user_id = get_user_id(session)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user_id
