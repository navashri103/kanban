import logging
from pathlib import Path

import bcrypt
import httpx
from fastapi import Cookie, Depends, FastAPI, HTTPException, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app import db
from app.ai import ask_ai, chat_about_board
from app.auth import (
    SESSION_COOKIE,
    create_session,
    end_session,
    get_user_id,
    require_session,
)
from app.seed import INITIAL_BOARD

app = FastAPI(title="Project Management MVP")
logger = logging.getLogger(__name__)

db.init_db()


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


class Credentials(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


@app.post("/api/signup")
async def signup(credentials: Credentials, response: Response) -> dict[str, str]:
    if db.get_user_by_username(credentials.username) is not None:
        raise HTTPException(status_code=409, detail="Username already taken")
    password_hash = bcrypt.hashpw(
        credentials.password.encode(), bcrypt.gensalt()
    ).decode()
    user_id = db.create_user(credentials.username, password_hash)
    db.create_board(user_id, INITIAL_BOARD)
    create_session(response, user_id)
    return {"status": "ok"}


@app.post("/api/login")
async def login(credentials: Credentials, response: Response) -> dict[str, str]:
    user = db.get_user_by_username(credentials.username)
    if user is None or not bcrypt.checkpw(
        credentials.password.encode(), user["password_hash"].encode()
    ):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    create_session(response, user["id"])
    return {"status": "ok"}


@app.post("/api/logout")
async def logout(
    response: Response,
    session: str | None = Cookie(default=None, alias=SESSION_COOKIE),
) -> dict[str, str]:
    end_session(session, response)
    return {"status": "ok"}


@app.get("/api/session")
async def session_status(
    session: str | None = Cookie(default=None, alias=SESSION_COOKIE),
) -> dict[str, bool]:
    return {"authenticated": get_user_id(session) is not None}


class CardModel(BaseModel):
    id: str
    title: str
    details: str


class ColumnModel(BaseModel):
    id: str
    title: str
    cardIds: list[str]


class BoardModel(BaseModel):
    columns: list[ColumnModel]
    cards: dict[str, CardModel]


@app.get("/api/board")
async def get_board(user_id: int = Depends(require_session)) -> BoardModel:
    data = db.get_board(user_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Board not found")
    return BoardModel(**data)


@app.put("/api/board")
async def put_board(
    board: BoardModel, user_id: int = Depends(require_session)
) -> dict[str, str]:
    db.save_board(user_id, board.model_dump())
    return {"status": "ok"}


@app.get("/api/ai/ping")
async def ai_ping() -> dict[str, str]:
    reply = await ask_ai("What is 2+2? Answer with just the number.")
    return {"reply": reply}


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    history: list[ChatMessage] = Field(default_factory=list)


class ChatResponse(BaseModel):
    reply: str
    board_update: BoardModel | None = None


@app.post("/api/ai/chat")
async def ai_chat(
    chat_request: ChatRequest, user_id: int = Depends(require_session)
) -> ChatResponse:
    board = db.get_board(user_id)
    if board is None:
        raise HTTPException(status_code=404, detail="Board not found")

    try:
        result = await chat_about_board(
            chat_request.message,
            [message.model_dump() for message in chat_request.history],
            board,
        )
    except (httpx.HTTPStatusError, KeyError, ValueError) as error:
        logger.warning("AI chat request failed: %s", error)
        return ChatResponse(
            reply="Sorry, I couldn't reach the AI just now. Please try again.",
            board_update=None,
        )

    board_update = result["board_update"]
    if board_update is not None:
        db.save_board(user_id, board_update)

    return ChatResponse(
        reply=result["reply"],
        board_update=BoardModel(**board_update) if board_update else None,
    )


STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

app.mount(
    "/", StaticFiles(directory=STATIC_DIR, html=True, check_dir=False), name="static"
)
