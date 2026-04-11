from __future__ import annotations

import os
from threading import Lock

try:
    import ee
except ImportError:  # pragma: no cover - optional dependency
    ee = None


_init_lock = Lock()
_initialized = False


def _initialize_gee() -> bool:
    global _initialized

    if _initialized:
        return True

    if ee is None:
        return False

    service_account = os.getenv("GEE_SERVICE_ACCOUNT_EMAIL")
    private_key = os.getenv("GEE_PRIVATE_KEY")
    project = os.getenv("GEE_PROJECT")

    if not service_account or not private_key or not project:
        return False

    key_data = private_key.replace("\\n", "\n")

    with _init_lock:
        if _initialized:
            return True
        credentials = ee.ServiceAccountCredentials(service_account, key_data=key_data)
        ee.Initialize(credentials=credentials, project=project)
        _initialized = True

    return True


def get_terrain_tile_url() -> str | None:
    if not _initialize_gee():
        return None

    assert ee is not None

    terrain = ee.Image("USGS/SRTMGL1_003")
    visualization = {
        "min": 0,
        "max": 4200,
        "palette": [
            "0b1f3a",
            "1f4b99",
            "3f7f4f",
            "89a54a",
            "bca35a",
            "d0b38b",
            "e2ded5",
            "ffffff",
        ],
    }
    map_id = terrain.getMapId(visualization)
    return map_id["tile_fetcher"].url_format
