"""
Scraper: szpitale.lublin.uw.gov.pl
- Pobiera listę wszystkich oddziałów ze strony głównej
- Dla każdego oddziału pobiera dane wszystkich szpitali (nazwa, powiat, kategoria,
  ilość miejsc, wolne miejsca, telefon, adres, uwagi, data aktualizacji)
- Zapisuje wyniki do wolne_miejsca.json
"""

import requests
from bs4 import BeautifulSoup
import json
import time
import re
from datetime import datetime

BASE        = "https://szpitale.lublin.uw.gov.pl"
INDEX_URL   = f"{BASE}/page/"
DEPT_URL    = f"{BASE}/page/1,raporty-szpitali.html"
DELAY       = 0.8   # s między requestami

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Referer": BASE,
}

session = requests.Session()
session.headers.update(HEADERS)


def fetch(url: str) -> BeautifulSoup | None:
    try:
        r = session.get(url, timeout=15)
        r.raise_for_status()
        r.encoding = "utf-8"
        return BeautifulSoup(r.text, "html.parser")
    except requests.RequestException as e:
        print(f"  [BŁĄD] {url}: {e}")
        return None


def get_departments() -> list[dict]:
    """Pobiera listę oddziałów ze strony głównej (tabela report_table_list)."""
    soup = fetch(INDEX_URL)
    if not soup:
        return []

    departments = []
    for a in soup.select("a.report_department_link"):
        href = a.get("href", "")
        m = re.search(r"id=(\d+)", href)
        if m:
            departments.append({
                "id":   int(m.group(1)),
                "name": a.get_text(strip=True),
                "url":  BASE + href if href.startswith("/") else href,
            })
    return departments


def parse_department_page(soup: BeautifulSoup, dept_name: str) -> list[dict]:
    """
    Parsuje podstronę oddziału.
    Struktura:
      <td colspan=6 class=report_department_name>  — nazwa oddziału (potwierdzenie)
      <tr> <td>Powiat: <b>X</b></td> <td> ... tabela z kategoriami ... </td> </tr>
        wewnątrz: <td class=bg><b>Kategoria szpitala</b></td>
        wewnątrz: <div class=report_hospital_name>
                  <div class=report_hospital_details> (tabela z detalami)
        <span class=report_number><b>WOLNE</b></span>
        <td>DATA AKTUALIZACJI</td>
    """
    records = []

    # Zewnętrzne wiersze tabeli — każdy to jeden powiat
    outer_rows = soup.select("table.table > tr")

    current_powiat   = None
    current_kategoria = None

    for row in outer_rows:
        # Nagłówek oddziału — pomijamy
        dept_cell = row.find("td", class_="report_department_name")
        if dept_cell:
            continue

        # Wiersz z powiatu
        powiat_td = row.find("td", style=lambda s: s and "width: 15%" in s)
        if powiat_td:
            b = powiat_td.find("b")
            current_powiat = b.get_text(strip=True) if b else None

        # Szukamy wewnętrznych tabel kategorii (bg header)
        inner_tables = row.select("table.table")
        for itbl in inner_tables:
            # Nagłówek kategorii
            bg_td = itbl.find("td", class_="bg")
            if bg_td:
                current_kategoria = bg_td.get_text(strip=True)

            # Wiersze z szpitalami
            for irow in itbl.find_all("tr"):
                hospital_div = irow.find("div", class_="report_hospital_name")
                if not hospital_div:
                    continue

                hospital_name = hospital_div.get_text(strip=True)

                # Szczegóły (tabela wewnątrz report_hospital_details)
                details = {
                    "ilosc_miejsc": None,
                    "telefon": None,
                    "fax": None,
                    "adres": None,
                    "uwagi": None,
                    "mapa": None,
                }
                det_div = irow.find("div", class_="report_hospital_details")
                if det_div:
                    for drow in det_div.find_all("tr"):
                        cells = drow.find_all("td")
                        if len(cells) == 2:
                            key = cells[0].get_text(strip=True).lower()
                            val = cells[1].get_text(strip=True)
                            a_tag = cells[1].find("a")
                            if "ilość miejsc" in key:
                                details["ilosc_miejsc"] = int(val) if val.lstrip("-").isdigit() else val
                            elif "telefon" in key:
                                details["telefon"] = val or None
                            elif "fax" in key:
                                details["fax"] = val or None
                            elif "adres" in key:
                                details["adres"] = val or None
                            elif "uwagi" in key:
                                details["uwagi"] = val or None
                            elif "link do mapy" in key and a_tag:
                                details["mapa"] = a_tag.get("href")

                # Wolne miejsca
                wolne_span = irow.find("span", class_="report_number")
                wolne = None
                if wolne_span:
                    txt = wolne_span.get_text(strip=True)
                    try:
                        wolne = int(txt)
                    except ValueError:
                        wolne = txt

                # Data aktualizacji (ostatnia <td> w wierszu bez klasy)
                tds = irow.find_all("td", recursive=False)
                data_aktualizacji = None
                if len(tds) >= 3:
                    raw_date = tds[-1].get_text(strip=True)
                    if re.match(r"\d{4}-\d{2}-\d{2}", raw_date):
                        data_aktualizacji = raw_date

                records.append({
                    "oddzial":           dept_name,
                    "powiat":            current_powiat,
                    "kategoria_szpitala": current_kategoria,
                    "szpital":           hospital_name,
                    "ilosc_miejsc":      details["ilosc_miejsc"],
                    "wolne_miejsca":     wolne,
                    "telefon":           details["telefon"],
                    "adres":             details["adres"],
                    "uwagi":             details["uwagi"],
                    "link_mapa":         details["mapa"],
                    "data_aktualizacji": data_aktualizacji,
                })

    return records


def scrape_all() -> dict:
    print("▶ Pobieranie listy oddziałów...")
    departments = get_departments()
    if not departments:
        print("  Nie znaleziono żadnych oddziałów. Sprawdź połączenie.")
        return {}

    print(f"  Znaleziono {len(departments)} oddziałów.\n")

    all_records = []
    errors = []

    for i, dept in enumerate(departments, 1):
        print(f"  [{i:02d}/{len(departments)}] {dept['name']} (id={dept['id']})")
        soup = fetch(dept["url"])
        if soup is None:
            errors.append(dept["name"])
            continue

        records = parse_department_page(soup, dept["name"])
        print(f"           → {len(records)} szpitali")
        all_records.extend(records)
        time.sleep(DELAY)

    # Grupowanie: szpital → lista oddziałów
    hospitals: dict[str, dict] = {}
    for rec in all_records:
        key = rec["szpital"]
        if key not in hospitals:
            hospitals[key] = {
                "szpital":           rec["szpital"],
                "powiat":            rec["powiat"],
                "kategoria_szpitala": rec["kategoria_szpitala"],
                "adres":             rec["adres"],
                "telefon":           rec["telefon"],
                "link_mapa":         rec["link_mapa"],
                "oddzialy":          [],
            }
        hospitals[key]["oddzialy"].append({
            "oddzial":           rec["oddzial"],
            "ilosc_miejsc":      rec["ilosc_miejsc"],
            "wolne_miejsca":     rec["wolne_miejsca"],
            "uwagi":             rec["uwagi"],
            "data_aktualizacji": rec["data_aktualizacji"],
        })

    result = {
        "wygenerowano":      datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "liczba_szpitali":   len(hospitals),
        "liczba_oddzialow":  len(departments),
        "liczba_rekordow":   len(all_records),
        "bledy":             errors,
        "szpitale":          list(hospitals.values()),
    }
    return result


def main():
    data = scrape_all()
    if not data:
        return

    out_file = "wolne_miejsca.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"\n✅ Gotowe!")
    print(f"   Szpitali:  {data['liczba_szpitali']}")
    print(f"   Oddziałów: {data['liczba_oddzialow']}")
    print(f"   Rekordów:  {data['liczba_rekordow']}")
    print(f"   Błędów:    {len(data['bledy'])}")
    print(f"   → zapisano do: {out_file}")

    # Podgląd pierwszego szpitala
    if data["szpitale"]:
        print("\nPrzykład (pierwszy szpital):")
        print(json.dumps(data["szpitale"][0], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()