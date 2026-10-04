"""Latest app releases for the self-updating Android and Windows apps.

One public endpoint, read by both apps in the background:

    GET /api/app-updates/latest            -> {"android": {...}, "windows": {...}}
    GET /api/app-updates/latest?platform=android

Releases are described by ``releases.json`` in the downloads folder that nginx
serves at https://higoverse.com/downloads/ (``deploy/publish-release.sh``
writes it). Nothing here touches the database, and no credentials are needed:
the response only says which file to download and its SHA-256.
"""

import json
import os
import re
from pathlib import Path
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import BaseModel, Field, ValidationError, field_validator

router = APIRouter(prefix="/api/app-updates", tags=["App updates"])

RELEASES_FILE = Path(os.getenv("APP_RELEASES_FILE", "/var/www/higoverse/downloads/releases.json"))
DOWNLOADS_URL = os.getenv("APP_DOWNLOADS_URL", "https://higoverse.com/downloads/").rstrip("/") + "/"

_SEMVER = re.compile(r"^\d+\.\d+\.\d+$")
_SHA256 = re.compile(r"^[0-9a-f]{64}$")
_FILE = re.compile(r"^(android|desktop)/[A-Za-z0-9._-]+$")


class Release(BaseModel):
    """One platform's entry in releases.json."""

    version: str
    version_code: int = Field(gt=0)
    file: str  # path under the downloads folder, e.g. "android/Higoverse-1.3.0.apk"
    sha256: str
    size: Optional[int] = Field(default=None, gt=0)
    force_update: bool = False
    # Installs older than this must update even when force_update is false.
    min_supported_version_code: int = Field(default=0, ge=0)
    release_notes: str = ""
    published_at: Optional[str] = None

    @field_validator("version")
    @classmethod
    def _semver(cls, v: str) -> str:
        if not _SEMVER.match(v):
            raise ValueError("version must look like 1.2.3")
        return v

    @field_validator("sha256")
    @classmethod
    def _sha(cls, v: str) -> str:
        v = v.lower()
        if not _SHA256.match(v):
            raise ValueError("sha256 must be 64 hex characters")
        return v

    @field_validator("file")
    @classmethod
    def _file(cls, v: str) -> str:
        # Only files inside the two download folders: no "..", no other hosts.
        if not _FILE.match(v):
            raise ValueError("file must be android/<name> or desktop/<name>")
        return v

    def public(self) -> dict:
        return {
            "version": self.version,
            "version_code": self.version_code,
            "download_url": DOWNLOADS_URL + self.file,
            "sha256": self.sha256,
            "size": self.size,
            "force_update": self.force_update,
            "min_supported_version_code": self.min_supported_version_code,
            "release_notes": self.release_notes,
            "published_at": self.published_at,
        }


# releases.json is re-read only when it changes on disk.
_cache: dict = {"mtime": None, "data": {}}


def _load() -> dict[str, Release]:
    try:
        mtime = RELEASES_FILE.stat().st_mtime_ns
    except OSError:
        return {}
    if _cache["mtime"] != mtime:
        releases: dict[str, Release] = {}
        try:
            raw = json.loads(RELEASES_FILE.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            raw = {}
        for platform in ("android", "windows"):
            entry = raw.get(platform) if isinstance(raw, dict) else None
            if entry is None:
                continue
            try:
                releases[platform] = Release.model_validate(entry)
            except ValidationError:
                # A broken entry is left out rather than sent to the apps.
                continue
        _cache.update(mtime=mtime, data=releases)
    return _cache["data"]


@router.get("/latest")
def latest(
    response: Response,
    platform: Optional[Literal["android", "windows"]] = Query(default=None),
):
    releases = _load()
    # Short shared cache: apps check at most every few hours, and a new
    # release still reaches everyone within a minute.
    response.headers["Cache-Control"] = "public, max-age=60"
    if platform:
        if platform not in releases:
            raise HTTPException(status_code=404, detail="No release published for this platform")
        return releases[platform].public()
    return {p: (releases[p].public() if p in releases else None) for p in ("android", "windows")}
