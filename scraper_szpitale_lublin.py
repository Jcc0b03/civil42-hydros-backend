#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import re
import time
from dataclasses import dataclass
from typing import Dict, List, Optional
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup, Tag

BASE_URL = "https://szpitale.lublin.uw.gov.pl/page/"
REPORT_LINK_CLASS = "report_department_link"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    )
}


@dataclass
class Department:
    department_name: str
    report_url: str
    report_id: Optional[int]


def fetch_html(session: requests.Session, url: str, timeout: int) -> BeautifulSoup:
    response = session.get(url, timeout=timeout)
    response.raise_for_status()
    return BeautifulSoup(response.text, "html.parser")


def fetch_html_with_retry(
    session: requests.Session,
    url: str,
    timeout: int,
    retries: int,
    retry_backoff: float,
) -> BeautifulSoup:
    last_error: Optional[Exception] = None
    attempts = max(1, retries)
    for attempt in range(1, attempts + 1):
        try:
            return fetch_html(session, url, timeout)
        except requests.RequestException as error:
            last_error = error
            if attempt < attempts:
                time.sleep(max(0.0, retry_backoff) * attempt)
    if last_error is not None:
        raise last_error
    raise RuntimeError("Nieoczekiwany blad pobierania HTML")


def extract_report_id(url: str) -> Optional[int]:
    match = re.search(r"[?&]id=(\d+)", url)
    if match:
        return int(match.group(1))
    return None


def parse_departments(soup: BeautifulSoup) -> List[Department]:
    departments: List[Department] = []
    seen_urls = set()
    for link in soup.select(f"a.{REPORT_LINK_CLASS}[href]"):
        if not isinstance(link, Tag):
            continue
        href = link.get("href", "").strip()
        if not href:
            continue
        full_url = urljoin(BASE_URL, href)
        if full_url in seen_urls:
            continue
        name = " ".join(link.get_text(" ", strip=True).split())
        if not name:
            continue
        departments.append(
            Department(
                department_name=name,
                report_url=full_url,
                report_id=extract_report_id(full_url),
            )
        )
        seen_urls.add(full_url)
    return departments


def parse_details_table(table: Tag) -> Dict[str, str]:
    details: Dict[str, str] = {}
    for row in table.select("tr"):
        cells = row.find_all("td")
        if len(cells) < 2:
            continue
        key = cells[0].get_text(" ", strip=True).replace(":", "").strip().lower()
        value_cell = cells[1]
        if "link do mapy" in key:
            map_link = value_cell.find("a", href=True)
            details["map_url"] = map_link["href"].strip() if map_link else ""
        else:
            details[key] = " ".join(value_cell.get_text(" ", strip=True).split())
    return details


def parse_report_page(department: Department, soup: BeautifulSoup) -> List[Dict[str, object]]:
    records: List[Dict[str, object]] = []
    current_county = ""

    content = soup.select_one("#content")
    if not isinstance(content, Tag):
        return records
    main_table = content.find("table", class_="table")
    if not isinstance(main_table, Tag):
        return records

    for row in main_table.find_all("tr", recursive=False):
        first_cell = row.find("td")
        if first_cell is None:
            continue

        text = first_cell.get_text(" ", strip=True)
        if "Powiat" in text:
            county_tag = first_cell.find("b")
            current_county = county_tag.get_text(" ", strip=True) if county_tag else text.replace("Powiat:", "").strip()

        category_table = row.find("table", class_="table")
        if not isinstance(category_table, Tag):
            continue

        category_header = category_table.select_one("tr td.bg b")
        category = category_header.get_text(" ", strip=True) if category_header else ""

        for item_row in category_table.select("tr"):
            hospital_name_tag = item_row.select_one("div.report_hospital_name")
            free_places_tag = item_row.select_one("span.report_number b")
            update_cells = item_row.find_all("td")
            if hospital_name_tag is None:
                continue

            hospital_name = " ".join(hospital_name_tag.get_text(" ", strip=True).split())
            free_places_raw = free_places_tag.get_text(" ", strip=True) if free_places_tag else ""
            updated_at = ""
            if len(update_cells) >= 3:
                updated_at = " ".join(update_cells[2].get_text(" ", strip=True).split())

            details_table = item_row.select_one("div.report_hospital_details table")
            details = parse_details_table(details_table) if isinstance(details_table, Tag) else {}

            records.append(
                {
                    "department": department.department_name,
                    "department_report_id": department.report_id,
                    "department_report_url": department.report_url,
                    "county": current_county,
                    "category": category,
                    "hospital_name": hospital_name,
                    "free_places": free_places_raw,
                    "updated_at": updated_at,
                    "total_places": details.get("ilość miejsc na oddziale", "") or details.get("ilosc miejsc na oddziale", ""),
                    "phone": details.get("telefon na oddział", "") or details.get("telefon na oddzial", ""),
                    "fax": details.get("fax na oddział", "") or details.get("fax na oddzial", ""),
                    "address": details.get("adres", ""),
                    "notes": details.get("uwagi", ""),
                    "map_url": details.get("map_url", ""),
                }
            )

    return records


def save_csv(path: str, rows: List[Dict[str, object]]) -> None:
    if not rows:
        return
    fieldnames = list(rows[0].keys())
    with open(path, "w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Scraper szpitali woj. lubelskiego")
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()

    with requests.Session() as session:
        session.headers.update(HEADERS)
        soup = fetch_html_with_retry(session, BASE_URL, 30, 3, 1.0)
        departments = parse_departments(soup)
        if args.limit is not None:
            departments = departments[: args.limit]
        all_rows: List[Dict[str, object]] = []
        for department in departments:
            report_soup = fetch_html_with_retry(session, department.report_url, 30, 3, 1.0)
            all_rows.extend(parse_report_page(department, report_soup))
        print(f"Zebrano {len(all_rows)} rekordow")
