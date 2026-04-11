from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional
from urllib.parse import parse_qs, unquote, urlparse

import requests

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
NOMINATIM_HEADERS = {
    "User-Agent": "szpitale-lublin-api/1.0 (local development)",
    "Accept": "application/json",
}
COORD_REGEX = re.compile(r"@(-?\d+\.\d+),(-?\d+\.\d+)")
COORD_PAIR_REGEX = re.compile(r"(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)")
COORD_3D_4D_REGEX = re.compile(r"!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)")


@dataclass
class Coordinates:
    latitude: Optional[float]
    longitude: Optional[float]
    source: str = ""


def parse_coordinates_from_url(url: str) -> Coordinates:
    if not url:
        return Coordinates(None, None, "")

    candidates = [url]
    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    for key in ("continue", "q", "query"):
        for value in query.get(key, []):
            if value:
                candidates.append(unquote(value))

    for candidate in candidates:
        match = COORD_REGEX.search(candidate)
        if match:
            return Coordinates(float(match.group(1)), float(match.group(2)), "map_url")

        match = COORD_3D_4D_REGEX.search(candidate)
        if match:
            return Coordinates(float(match.group(1)), float(match.group(2)), "map_url")

        pair = COORD_PAIR_REGEX.search(candidate)
        if pair:
            return Coordinates(float(pair.group(1)), float(pair.group(2)), "map_url")

    return Coordinates(None, None, "")


def resolve_map_url(
    session: requests.Session,
    url: str,
    timeout: int = 15,
    retries: int = 2,
    retry_backoff: float = 1.0,
) -> str:
    if not url:
        return ""

    attempts = max(1, retries)
    for attempt in range(1, attempts + 1):
        try:
            response = session.get(url, timeout=timeout, allow_redirects=True)
            response.raise_for_status()
            return response.url or url
        except requests.RequestException:
            if attempt >= attempts:
                return url
            import time

            time.sleep(max(0.0, retry_backoff * attempt))

    return url


def geocode_address(
    session: requests.Session,
    address: str,
    county: str = "",
    timeout: int = 30,
    retries: int = 3,
    retry_backoff: float = 1.0,
) -> Coordinates:
    query_parts = [address.strip(), county.strip(), "Polska"]
    query = ", ".join(part for part in query_parts if part)
    if not query:
        return Coordinates(None, None, "")

    attempts = max(1, retries)
    for attempt in range(1, attempts + 1):
        response = session.get(
            NOMINATIM_URL,
            params={"q": query, "format": "jsonv2", "limit": 1},
            headers=NOMINATIM_HEADERS,
            timeout=timeout,
        )
        if response.status_code == 429:
            retry_after = response.headers.get("Retry-After")
            wait_seconds = float(retry_after) if retry_after and retry_after.isdigit() else retry_backoff * attempt
            if attempt < attempts:
                import time

                time.sleep(max(0.0, wait_seconds))
                continue
            return Coordinates(None, None, "nominatim_rate_limited")

        response.raise_for_status()
        payload = response.json()
        if not payload:
            return Coordinates(None, None, "nominatim_empty")

        first = payload[0]
        latitude = first.get("lat")
        longitude = first.get("lon")
        if latitude is None or longitude is None:
            return Coordinates(None, None, "nominatim_missing")

        return Coordinates(float(latitude), float(longitude), "nominatim")

    return Coordinates(None, None, "nominatim_failed")
