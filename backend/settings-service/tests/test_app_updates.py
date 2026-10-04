"""GET /api/app-updates/latest — run with: python -m pytest tests"""

import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes import app_updates

SHA = "a" * 64


def release(**over):
    r = {
        "version": "1.3.0",
        "version_code": 4,
        "file": "android/Higoverse-1.3.0.apk",
        "sha256": SHA,
        "size": 1234,
        "release_notes": "Faster stock lists.",
    }
    r.update(over)
    return r


@pytest.fixture
def client(tmp_path, monkeypatch):
    path = tmp_path / "releases.json"
    monkeypatch.setattr(app_updates, "RELEASES_FILE", path)
    monkeypatch.setattr(app_updates, "_cache", {"mtime": None, "data": {}})
    app = FastAPI()
    app.include_router(app_updates.router)
    c = TestClient(app)
    c.path = path
    return c


def write(client, data):
    client.path.write_text(json.dumps(data), encoding="utf-8")
    app_updates._cache["mtime"] = None  # same-second writes keep the mtime


def test_no_manifest_means_no_releases(client):
    r = client.get("/api/app-updates/latest")
    assert r.status_code == 200
    assert r.json() == {"android": None, "windows": None}


def test_both_platforms_with_download_url(client):
    write(client, {
        "android": release(),
        "windows": release(file="desktop/Higoverse-Setup-1.3.0.exe", version_code=10300, force_update=True),
    })
    body = client.get("/api/app-updates/latest").json()
    assert body["android"]["download_url"] == "https://higoverse.com/downloads/android/Higoverse-1.3.0.apk"
    assert body["android"]["sha256"] == SHA
    assert body["android"]["force_update"] is False
    assert body["windows"]["force_update"] is True
    assert body["windows"]["version_code"] == 10300


def test_single_platform(client):
    write(client, {"android": release()})
    assert client.get("/api/app-updates/latest?platform=android").json()["version"] == "1.3.0"
    assert client.get("/api/app-updates/latest?platform=windows").status_code == 404
    assert client.get("/api/app-updates/latest?platform=ios").status_code == 422


@pytest.mark.parametrize("bad", [
    {"file": "../../etc/passwd"},
    {"file": "https://evil.example/x.apk"},
    {"sha256": "abc"},
    {"version": "latest"},
    {"version_code": 0},
])
def test_invalid_entries_are_left_out(client, bad):
    write(client, {"android": release(**bad), "windows": release(file="desktop/a.exe")})
    body = client.get("/api/app-updates/latest").json()
    assert body["android"] is None
    assert body["windows"] is not None


def test_broken_json_is_ignored(client):
    client.path.write_text("{not json", encoding="utf-8")
    assert client.get("/api/app-updates/latest").json() == {"android": None, "windows": None}


def test_cache_header(client):
    assert "max-age=60" in client.get("/api/app-updates/latest").headers["cache-control"]
