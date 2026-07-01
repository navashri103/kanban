import os

import httpx
import pytest
from fastapi.testclient import TestClient

from app import main
from app.ai import _board_update_to_board_data

requires_api_key = pytest.mark.skipif(
    not os.environ.get("OPENROUTER_API_KEY"),
    reason="OPENROUTER_API_KEY not set",
)


def signed_up_client(username: str = "alice") -> TestClient:
    client = TestClient(main.app)
    client.post("/api/signup", json={"username": username, "password": "secret123"})
    return client


def test_board_update_cards_array_converts_to_dict_keyed_by_id():
    update = {
        "columns": [{"id": "col-1", "title": "Backlog", "cardIds": ["card-1"]}],
        "cards": [{"id": "card-1", "title": "Task", "details": "details"}],
    }
    result = _board_update_to_board_data(update)
    assert result["cards"] == {"card-1": {"id": "card-1", "title": "Task", "details": "details"}}
    assert result["columns"] == update["columns"]


def test_chat_requires_session():
    client = TestClient(main.app)
    response = client.post("/api/ai/chat", json={"message": "hi", "history": []})
    assert response.status_code == 401


def test_chat_with_no_board_update_leaves_board_unchanged(monkeypatch):
    client = signed_up_client()
    original_board = client.get("/api/board").json()

    async def fake_chat_about_board(message, history, board):
        return {"reply": "Just chatting, no changes needed.", "board_update": None}

    monkeypatch.setattr(main, "chat_about_board", fake_chat_about_board)

    response = client.post("/api/ai/chat", json={"message": "How's it going?", "history": []})
    assert response.status_code == 200
    body = response.json()
    assert body["board_update"] is None
    assert "changes needed" in body["reply"]
    assert client.get("/api/board").json() == original_board


def test_chat_with_board_update_persists_it(monkeypatch):
    client = signed_up_client()

    new_board = {
        "columns": [{"id": "col-backlog", "title": "Backlog", "cardIds": ["card-new"]}],
        "cards": [{"id": "card-new", "title": "Added by AI", "details": ""}],
    }

    async def fake_chat_about_board(message, history, board):
        return {
            "reply": "Added the card.",
            "board_update": _board_update_to_board_data(new_board),
        }

    monkeypatch.setattr(main, "chat_about_board", fake_chat_about_board)

    response = client.post(
        "/api/ai/chat", json={"message": "Add a card", "history": []}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["board_update"]["cards"]["card-new"]["title"] == "Added by AI"

    refetched = client.get("/api/board").json()
    assert refetched["cards"]["card-new"]["title"] == "Added by AI"


def test_chat_falls_back_gracefully_on_ai_failure(monkeypatch):
    client = signed_up_client()
    original_board = client.get("/api/board").json()

    async def failing_chat_about_board(message, history, board):
        raise httpx.HTTPStatusError(
            "rate limited", request=httpx.Request("POST", "http://x"), response=httpx.Response(429)
        )

    monkeypatch.setattr(main, "chat_about_board", failing_chat_about_board)

    response = client.post("/api/ai/chat", json={"message": "hi", "history": []})
    assert response.status_code == 200
    body = response.json()
    assert body["board_update"] is None
    assert "couldn't reach the AI" in body["reply"]
    assert client.get("/api/board").json() == original_board


@requires_api_key
def test_chat_real_call_adds_a_card_end_to_end():
    client = signed_up_client("bob")
    response = client.post(
        "/api/ai/chat",
        json={
            "message": "Add a card called Integration Test Card to the Backlog column.",
            "history": [],
        },
    )
    assert response.status_code == 200
    board = client.get("/api/board").json()
    titles = [card["title"] for card in board["cards"].values()]
    assert "Integration Test Card" in titles
