import asyncio
import json
import os
from typing import Any

import httpx

# Google Gemini via its OpenAI-compatible endpoint. One reliable provider with
# a real free tier (much higher daily limits than OpenRouter's free pool) and
# verified strict json_schema structured-output support.
GEMINI_API_URL = (
    "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
)

# Pinned to gemini-2.5-flash deliberately (probed 2026-07-02): the app makes
# the model echo the full board back, and newer Flash models behind the
# "gemini-flash-latest" alias consistently block that with the RECITATION
# content filter (empty response). 2.5-flash handles it reliably.
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

# Free-tier 429s (per-minute quota) usually clear quickly; one short retry
# cycle rides them out without keeping the user waiting long.
RETRYABLE_STATUS_CODES = {429, 500, 502, 503}
MAX_ATTEMPTS = 3

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


async def _chat_completion(payload: dict[str, Any]) -> str:
    request_json = {"model": GEMINI_MODEL, **payload}
    async with httpx.AsyncClient(timeout=30) as client:
        for attempt in range(MAX_ATTEMPTS):
            response = await client.post(
                GEMINI_API_URL,
                headers={
                    "Authorization": f"Bearer {os.environ['GEMINI_API_KEY']}"
                },
                json=request_json,
            )
            if (
                response.status_code in RETRYABLE_STATUS_CODES
                and attempt + 1 < MAX_ATTEMPTS
            ):
                await asyncio.sleep(2**attempt)
                continue
            response.raise_for_status()
            choice = response.json()["choices"][0]
            content = choice["message"].get("content")
            if not content:
                # Gemini can return an empty message when a content filter
                # fires (e.g. finish_reason "content_filter: RECITATION").
                # Transient enough to be worth the remaining retries.
                if attempt + 1 < MAX_ATTEMPTS:
                    await asyncio.sleep(2**attempt)
                    continue
                raise ValueError(
                    f"AI returned no content "
                    f"(finish_reason: {choice.get('finish_reason')})"
                )
            return content
    raise RuntimeError("unreachable: loop always returns or raises")


async def ask_ai(message: str) -> str:
    return await _chat_completion(
        {"messages": [{"role": "user", "content": message}]}
    )


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

    payload = {
        "messages": messages,
        "response_format": {
            "type": "json_schema",
            "json_schema": CHAT_RESPONSE_SCHEMA,
        },
    }

    # Even schema-constrained models occasionally emit malformed JSON;
    # that's a transient model failure, so ask once more before giving up.
    for attempt in range(2):
        content = await _chat_completion(payload)
        try:
            parsed = json.loads(content)
            break
        except json.JSONDecodeError:
            if attempt == 1:
                raise

    board_update = parsed.get("board_update")
    return {
        "reply": parsed["reply"],
        "board_update": _board_update_to_board_data(board_update)
        if board_update
        else None,
    }
