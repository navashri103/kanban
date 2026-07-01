import json
import os
from typing import Any

import httpx

OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_MODEL = os.environ.get("OPENROUTER_MODEL", "google/gemma-4-31b-it:free")

# board_update's cards are an array (not a dict keyed by id) because strict
# JSON Schema structured outputs can't express "object with arbitrary keys".
CHAT_RESPONSE_SCHEMA = {
    "name": "kanban_chat_reply",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "reply": {"type": "string"},
            "board_update": {
                "anyOf": [
                    {
                        "type": "object",
                        "properties": {
                            "columns": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "id": {"type": "string"},
                                        "title": {"type": "string"},
                                        "cardIds": {
                                            "type": "array",
                                            "items": {"type": "string"},
                                        },
                                    },
                                    "required": ["id", "title", "cardIds"],
                                    "additionalProperties": False,
                                },
                            },
                            "cards": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "id": {"type": "string"},
                                        "title": {"type": "string"},
                                        "details": {"type": "string"},
                                    },
                                    "required": ["id", "title", "details"],
                                    "additionalProperties": False,
                                },
                            },
                        },
                        "required": ["columns", "cards"],
                        "additionalProperties": False,
                    },
                    {"type": "null"},
                ]
            },
        },
        "required": ["reply", "board_update"],
        "additionalProperties": False,
    },
}

SYSTEM_PROMPT_TEMPLATE = (
    "You are an assistant embedded in a kanban board app. "
    "Here is the current board as JSON: {board_json}\n\n"
    "Respond to the user's message conversationally in `reply`. "
    "If (and only if) the user asks you to create, edit, move, or delete one or more cards, "
    "set `board_update` to the FULL updated board (not a diff) reflecting that change, "
    "using the same shape as the board above but with `cards` as an array of "
    "{{id, title, details}} objects instead of an object keyed by id. "
    "Invent a new unique id (e.g. \"card-<random>\") for any new card. "
    "If no board change is needed, set `board_update` to null."
)


async def ask_ai(message: str) -> str:
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            OPENROUTER_API_URL,
            headers={"Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}"},
            json={
                "model": OPENROUTER_MODEL,
                "messages": [{"role": "user", "content": message}],
            },
        )
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"]


def _board_update_to_board_data(update: dict[str, Any]) -> dict[str, Any]:
    return {
        "columns": update["columns"],
        "cards": {card["id"]: card for card in update["cards"]},
    }


async def chat_about_board(
    message: str, history: list[dict[str, str]], board: dict[str, Any]
) -> dict[str, Any]:
    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(board_json=json.dumps(board))
    messages = [{"role": "system", "content": system_prompt}, *history, {"role": "user", "content": message}]

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            OPENROUTER_API_URL,
            headers={"Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}"},
            json={
                "model": OPENROUTER_MODEL,
                "messages": messages,
                "response_format": {
                    "type": "json_schema",
                    "json_schema": CHAT_RESPONSE_SCHEMA,
                },
            },
        )
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]

    parsed = json.loads(content)
    board_update = parsed.get("board_update")
    return {
        "reply": parsed["reply"],
        "board_update": _board_update_to_board_data(board_update)
        if board_update
        else None,
    }
