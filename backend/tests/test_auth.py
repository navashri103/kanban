import time

from fastapi.testclient import TestClient

from app import auth
from app.main import app


def test_signup_creates_account_and_session():
    client = TestClient(app)
    response = client.post(
        "/api/signup", json={"username": "alice", "password": "secret123"}
    )
    assert response.status_code == 200
    assert "session" in response.cookies
    assert client.get("/api/session").json() == {"authenticated": True}


def test_signup_with_duplicate_username_is_rejected():
    client = TestClient(app)
    client.post("/api/signup", json={"username": "alice", "password": "secret123"})

    other_client = TestClient(app)
    response = other_client.post(
        "/api/signup", json={"username": "alice", "password": "different"}
    )
    assert response.status_code == 409


def test_login_with_correct_password_succeeds():
    signup_client = TestClient(app)
    signup_client.post(
        "/api/signup", json={"username": "alice", "password": "secret123"}
    )

    login_client = TestClient(app)
    response = login_client.post(
        "/api/login", json={"username": "alice", "password": "secret123"}
    )
    assert response.status_code == 200
    assert login_client.get("/api/session").json() == {"authenticated": True}


def test_login_with_wrong_password_is_rejected():
    signup_client = TestClient(app)
    signup_client.post(
        "/api/signup", json={"username": "alice", "password": "secret123"}
    )

    login_client = TestClient(app)
    response = login_client.post(
        "/api/login", json={"username": "alice", "password": "wrong"}
    )
    assert response.status_code == 401
    assert login_client.get("/api/session").json() == {"authenticated": False}


def test_login_with_unknown_username_is_rejected():
    client = TestClient(app)
    response = client.post(
        "/api/login", json={"username": "nobody", "password": "whatever"}
    )
    assert response.status_code == 401


def test_session_reports_unauthenticated_without_cookie():
    client = TestClient(app)
    assert client.get("/api/session").json() == {"authenticated": False}


def test_signup_rejects_password_shorter_than_8_chars():
    client = TestClient(app)
    response = client.post(
        "/api/signup", json={"username": "alice", "password": "short7c"}
    )
    assert response.status_code == 422


def test_login_still_accepts_pre_existing_short_passwords():
    # The 8-char minimum applies to signup only; login just checks the hash.
    client = TestClient(app)
    response = client.post(
        "/api/login", json={"username": "nobody", "password": "x"}
    )
    assert response.status_code == 401  # unknown user, not 422


def test_expired_session_is_rejected_and_removed():
    client = TestClient(app)
    client.post("/api/signup", json={"username": "alice", "password": "secret123"})
    token = client.cookies["session"]

    user_id, _ = auth._sessions[token]
    auth._sessions[token] = (user_id, time.time() - 1)

    assert client.get("/api/session").json() == {"authenticated": False}
    assert token not in auth._sessions


def test_logout_clears_session():
    client = TestClient(app)
    client.post("/api/signup", json={"username": "alice", "password": "secret123"})
    assert client.get("/api/session").json() == {"authenticated": True}

    client.post("/api/logout")
    assert client.get("/api/session").json() == {"authenticated": False}
