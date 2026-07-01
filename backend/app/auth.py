import secrets

from fastapi import Cookie, HTTPException, Response

SESSION_COOKIE = "session"

_sessions: dict[str, int] = {}


def create_session(response: Response, user_id: int) -> None:
    token = secrets.token_urlsafe(32)
    _sessions[token] = user_id
    response.set_cookie(key=SESSION_COOKIE, value=token, httponly=True, samesite="lax")


def get_user_id(session: str | None) -> int | None:
    if session is None:
        return None
    return _sessions.get(session)


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
