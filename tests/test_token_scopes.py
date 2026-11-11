"""End-to-end scope isolation between session tokens and download tokens.

A session token authenticates API requests; a download token authorizes a
single GET /api/download. Neither may be used in the other's place — in
particular a leaked download token must not be able to drive the remote
cover-download endpoints (the SSRF surface) or any other session-only API.
"""

from pathlib import Path

import pytest


def _relative(path, music_root):
    return Path(path).relative_to(music_root).as_posix()


def _session_token(auth_headers):
    return auth_headers["Authorization"].split(" ", 1)[1]


def _download_token(client, auth_headers, path):
    response = client.post(
        "/api/download-token",
        headers=auth_headers,
        json={"path": path},
    )
    assert response.status_code == 200
    return response.get_json()["token"]


@pytest.fixture
def song(test_dir):
    path = test_dir / "song.mp3"
    path.write_bytes(b"audio-data")
    return path


def test_each_token_works_inside_its_own_scope(
    client, auth_headers, song, music_root
):
    session_token = _session_token(auth_headers)
    download_token = _download_token(
        client, auth_headers, _relative(song, music_root)
    )

    response = client.get(
        "/api/validate", headers={"Authorization": f"Bearer {session_token}"}
    )
    assert response.status_code == 200
    assert response.get_json()["valid"] is True

    response = client.get("/api/download", query_string={"token": download_token})
    assert response.status_code == 200
    assert response.data == b"audio-data"


SESSION_ONLY_REQUESTS = [
    ("GET", "/api/validate", {}),
    ("POST", "/api/download", {"json": {"path": "song.mp3"}}),
    ("POST", "/api/download-token", {"json": {"path": "song.mp3"}}),
    # The remote cover-download endpoints are the SSRF surface: a download
    # token must not be able to make the server fetch an arbitrary URL.
    (
        "GET",
        "/api/metadata/picture/preview?url=http://example.com/cover.jpg",
        {},
    ),
    (
        "POST",
        "/api/metadata/picture/url",
        {"json": {"url": "http://example.com/cover.jpg", "path": "song.mp3"}},
    ),
]


@pytest.mark.parametrize(
    "method,url,kwargs",
    SESSION_ONLY_REQUESTS,
    ids=[f"{method} {url.split('?')[0]}" for method, url, _ in SESSION_ONLY_REQUESTS],
)
def test_a_download_token_is_rejected_by_session_only_endpoints(
    client, auth_headers, song, music_root, method, url, kwargs
):
    download_token = _download_token(
        client, auth_headers, _relative(song, music_root)
    )

    response = client.open(
        url,
        method=method,
        headers={"Authorization": f"Bearer {download_token}"},
        **kwargs,
    )

    assert response.status_code == 401
    assert response.get_json()["error"] == "Token is invalid"


def test_a_session_token_is_rejected_by_the_token_download_endpoint(
    client, auth_headers, song, music_root
):
    session_token = _session_token(auth_headers)

    response = client.get("/api/download", query_string={"token": session_token})

    assert response.status_code == 401
    assert response.get_json()["error"] == "Token is invalid"
    assert response.data != b"audio-data"


def test_a_download_token_cannot_mint_further_download_tokens(
    client, auth_headers, song, music_root
):
    download_token = _download_token(
        client, auth_headers, _relative(song, music_root)
    )

    response = client.post(
        "/api/download-token",
        headers={"Authorization": f"Bearer {download_token}"},
        json={"path": _relative(song, music_root)},
    )

    assert response.status_code == 401
    assert response.get_json()["error"] == "Token is invalid"


def test_a_download_token_does_not_authorize_the_session_download_endpoint(
    client, auth_headers, song, music_root
):
    """POST /api/download takes a session token, not a download token."""
    download_token = _download_token(
        client, auth_headers, _relative(song, music_root)
    )

    response = client.post(
        "/api/download",
        headers={"Authorization": f"Bearer {download_token}"},
        json={"path": _relative(song, music_root), "isFolder": False},
    )

    assert response.status_code == 401
    assert response.get_json()["error"] == "Token is invalid"
