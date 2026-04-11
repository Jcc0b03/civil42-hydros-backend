#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

from szpitale_api.ingest import build_sqlite_database

DEFAULT_BASE_URL = "https://szpitale.lublin.uw.gov.pl/page/"
DEFAULT_DB_PATH = Path("szpitale_lublin.sqlite3")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Buduje SQLite z danymi szpitali.")
    parser.add_argument("--db-path", default=str(DEFAULT_DB_PATH), help="Sciezka do pliku SQLite")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="Adres strony z oddzialami")
    parser.add_argument("--timeout", type=int, default=30, help="Timeout HTTP")
    parser.add_argument("--retries", type=int, default=3, help="Liczba prob HTTP")
    parser.add_argument("--retry-backoff", type=float, default=1.0, help="Backoff miedzy probami")
    parser.add_argument("--sleep", type=float, default=0.2, help="Przerwa miedzy raportami")
    parser.add_argument("--geocode-timeout", type=int, default=5, help="Timeout geokodowania Nominatim")
    parser.add_argument("--limit", type=int, default=None, help="Limit liczby oddzialow")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    db = build_sqlite_database(
        db_path=args.db_path,
        base_url=args.base_url,
        timeout=args.timeout,
        retries=args.retries,
        retry_backoff=args.retry_backoff,
        sleep_seconds=args.sleep,
        geocode_timeout=args.geocode_timeout,
        limit=args.limit,
    )
    print(f"Zbudowano baze SQLite: {db.path}")


if __name__ == "__main__":
    main()