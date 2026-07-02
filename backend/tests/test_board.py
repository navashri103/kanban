from fastapi.testclient import TestClient

from app.main import app


def signed_up_client(username: str = "alice", password: str = "secret123") -> TestClient:
    client = TestClient(app)
    client.post("/api/signup", json={"username": username, "password": password})
    return client


def test_get_board_requires_session():
    client = TestClient(app)
    response = client.get("/api/board")
    assert response.status_code == 401


def test_get_board_returns_seeded_board_after_signup():
    client = signed_up_client()
    response = client.get("/api/board")
    assert response.status_code == 200
    data = response.json()
    assert len(data["columns"]) == 5
    assert "card-1" in data["cards"]


def test_put_board_persists_changes():
    client = signed_up_client()
    board = client.get("/api/board").json()
    board["columns"][0]["title"] = "Renamed Column"

    response = client.put("/api/board", json=board)
    assert response.status_code == 200

    refetched = client.get("/api/board").json()
    assert refetched["columns"][0]["title"] == "Renamed Column"


def test_two_users_have_independent_boards():
    alice = signed_up_client("alice", "secret123")
    bob = signed_up_client("bob", "secret456")

    alice_board = alice.get("/api/board").json()
    alice_board["columns"][0]["title"] = "Alice's Column"
    alice.put("/api/board", json=alice_board)

    bob_board = bob.get("/api/board").json()
    assert bob_board["columns"][0]["title"] != "Alice's Column"


def test_put_board_rejects_cardid_referencing_missing_card():
    client = signed_up_client()
    board = client.get("/api/board").json()
    board["columns"][0]["cardIds"].append("card-does-not-exist")

    response = client.put("/api/board", json=board)
    assert response.status_code == 422
    # The stored board is untouched.
    assert "card-does-not-exist" not in client.get("/api/board").json()["columns"][0]["cardIds"]


def test_put_board_rejects_card_key_mismatching_card_id():
    client = signed_up_client()
    board = client.get("/api/board").json()
    board["cards"]["card-1"]["id"] = "card-other"

    response = client.put("/api/board", json=board)
    assert response.status_code == 422


def test_put_board_rejects_card_in_two_columns():
    client = signed_up_client()
    board = client.get("/api/board").json()
    board["columns"][1]["cardIds"].append(board["columns"][0]["cardIds"][0])

    response = client.put("/api/board", json=board)
    assert response.status_code == 422


def test_put_board_rejects_zero_and_too_many_columns():
    client = signed_up_client()
    board = client.get("/api/board").json()

    response = client.put("/api/board", json={"columns": [], "cards": {}})
    assert response.status_code == 422

    board["columns"] += [
        {"id": f"col-extra-{i}", "title": "Extra", "cardIds": []} for i in range(4)
    ]
    assert len(board["columns"]) == 9
    response = client.put("/api/board", json=board)
    assert response.status_code == 422


def test_board_data_is_read_from_disk_not_cached_in_memory():
    # Every db.py call opens and closes its own sqlite3 connection, so a brand
    # new client logging in fresh has no way to see this data except by
    # reading it back from the sqlite file - proving it's real persistence,
    # not an in-memory illusion tied to one TestClient/session.
    setup_client = signed_up_client()
    board = setup_client.get("/api/board").json()
    board["columns"][0]["title"] = "Still Here"
    setup_client.put("/api/board", json=board)

    fresh_client = TestClient(app)
    fresh_client.post(
        "/api/login", json={"username": "alice", "password": "secret123"}
    )
    refetched = fresh_client.get("/api/board").json()
    assert refetched["columns"][0]["title"] == "Still Here"
