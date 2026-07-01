import os

import pytest
from fastapi.testclient import TestClient

from app.main import app

requires_api_key = pytest.mark.skipif(
    not os.environ.get("OPENROUTER_API_KEY"),
    reason="OPENROUTER_API_KEY not set",
)


@requires_api_key
def test_ai_ping_answers_basic_math():
    client = TestClient(app)
    response = client.get("/api/ai/ping")
    assert response.status_code == 200
    assert "4" in response.json()["reply"]
