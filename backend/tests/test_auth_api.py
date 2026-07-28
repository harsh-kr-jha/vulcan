import json

import pytest

pytestmark = pytest.mark.django_db


def test_json_login_creates_authenticated_session(client, user, membership):
    response = client.post(
        "/api/auth/login/",
        data=json.dumps({"username": "manager", "password": "test-password"}),
        content_type="application/json",
    )

    assert response.status_code == 200
    assert client.get("/api/auth/me/").status_code == 200
