import asyncio
import math
import os
import io
import base64
import json
import time
from datetime import datetime
from pathlib import Path
from typing import Any

import httpx
import openai
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware

# Load API keys from .env in project root
load_dotenv(Path(__file__).resolve().parent / ".env")

app = FastAPI(
    title="Lublin – Awaria Środowiskowa Dashboard",
    description="API zarządzania kryzysowego: jakość powietrza, meteo, obiekty wrażliwe, strefy zagrożenia, ryzyko powodziowe.",
    version="1.1.0",
    openapi_tags=[
        {
            "name": "Jakość powietrza",
            "description": "Dane PM2.5/PM10 ze stacji GIOŚ w okolicy Lublina",
        },
        {
            "name": "Pogoda",
            "description": "Warunki meteorologiczne z IMGW (wiatr, temperatura, opad)",
        },
        {
            "name": "Obiekty wrażliwe",
            "description": "Szkoły, szpitale, DPS-y, przedszkola z OpenStreetMap",
        },
        {
            "name": "Strefa zagrożenia",
            "description": "Analiza: łączy powietrze + meteo → strefy i rekomendacje",
        },
        {
            "name": "Powódź",
            "description": "Dane hydrologiczne IMGW, ostrzeżenia powodziowe, analiza szpitali",
        },
        {
            "name": "Głos",
            "description": "Sterowanie głosowe: Whisper STT → GPT-4o → ElevenLabs TTS",
        },
    ],
)
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

LUBLIN_LAT = 51.2465
LUBLIN_LON = 22.5684
SEARCH_RADIUS_KM = 30

GIOS_BASE = "https://api.gios.gov.pl/pjp-api/v1/rest"
IMGW_BASE = "https://danepubliczne.imgw.pl/api/data"
IMGW_HYDRO = "https://danepubliczne.imgw.pl/api/data/hydro"
IMGW_WARNINGS_HYDRO = "https://danepubliczne.imgw.pl/api/data/warningshydro"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"

LUBELSKIE_RIVERS = {
    "bug",
    "wieprz",
    "wisła",
    "san",
    "tyśmienica",
    "huczwa",
    "bystrzyca",
    "krzna",
    "tanew",
    "por",
    "kurówka",
    "giełczew",
    "uherka",
    "łabuńka",
    "wołkowianka",
    "ciemięga",
}


# ── helpers ──────────────────────────────────────────────────────────────────


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def classify_aqi(pm25, pm10) -> dict:
    """Return danger level + recommendations based on PM values."""
    val = pm25 if pm25 is not None else (pm10 / 2 if pm10 is not None else None)
    if val is None:
        return {"level": "brak danych", "color": "#999", "actions": []}

    if val <= 13:
        return {
            "level": "bardzo dobry",
            "color": "#00e400",
            "actions": ["Brak zagrożenia – normalna aktywność."],
        }
    if val <= 35:
        return {
            "level": "dobry / umiarkowany",
            "color": "#ffff00",
            "actions": ["Osoby wrażliwe powinny ograniczyć długi wysiłek na zewnątrz."],
        }
    if val <= 55:
        return {
            "level": "dostateczny",
            "color": "#ff7e00",
            "actions": [
                "Ogranicz aktywność na zewnątrz.",
                "Zamknij okna w szkołach i DPS-ach.",
                "Wydaj ostrzeżenie dla mieszkańców.",
            ],
        }
    if val <= 75:
        return {
            "level": "zły",
            "color": "#ff0000",
            "actions": [
                "🚨 Zamknij szkoły i przedszkola lub przejdź na tryb zdalny.",
                "Ogranicz transport publiczny do minimum.",
                "Uruchom ostrzeżenie RCB / RSO.",
                "Szpitale: przygotuj oddziały pulmonologiczne.",
            ],
        }
    return {
        "level": "bardzo zły / alarmowy",
        "color": "#7e0023",
        "actions": [
            "🚨🚨 EWAKUACJA punktowa DPS-ów i szpitali w strefie.",
            "Zamknij wszystkie placówki oświatowe.",
            "Zakaz wychodzenia z budynków bez maski FFP2/FFP3.",
            "Wstrzymaj ruch drogowy w strefie zagrożenia.",
            "Aktywuj Miejski Zespół Zarządzania Kryzysowego.",
        ],
    }


def wind_zone_polygon(
    lat: float, lon: float, direction_deg: float, speed_kmh: float, aqi_level: str
) -> list[list[float]]:
    """Generate a fan-shaped danger zone downwind from the source."""
    multiplier = {
        "bardzo dobry": 0,
        "dobry / umiarkowany": 0,
        "dostateczny": 1,
        "zły": 2,
        "bardzo zły / alarmowy": 3,
    }.get(aqi_level, 0)
    if multiplier == 0:
        return []
    radius_km = max(1, speed_kmh * 0.3 * multiplier)
    spread = 40
    points: list[list[float]] = [[lat, lon]]
    for angle_offset in range(-spread, spread + 1, 5):
        bearing = math.radians(direction_deg + angle_offset)
        dlat = (radius_km / 111.32) * math.cos(bearing)
        dlon = (radius_km / (111.32 * math.cos(math.radians(lat)))) * math.sin(bearing)
        points.append([lat + dlat, lon + dlon])
    points.append([lat, lon])
    return points


# ── GIOŚ (v1 JSON-LD API) ────────────────────────────────────────────────────


@app.get(
    "/api/air-quality", tags=["Jakość powietrza"], summary="Stacje GIOŚ – PM2.5 / PM10"
)
async def get_air_quality():
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(f"{GIOS_BASE}/station/findAll?page=0&size=500")
        data = r.json()

    all_stations = data.get("Lista stacji pomiarowych", [])

    nearby = [
        s
        for s in all_stations
        if s.get("WGS84 \u03c6 N")
        and s.get("WGS84 \u03bb E")
        and haversine(
            LUBLIN_LAT,
            LUBLIN_LON,
            float(s["WGS84 \u03c6 N"]),
            float(s["WGS84 \u03bb E"]),
        )
        <= SEARCH_RADIUS_KM
    ]

    results = []
    async with httpx.AsyncClient(timeout=15) as client:
        for station in nearby:
            sid = station["Identyfikator stacji"]
            try:
                sensors_r = await client.get(f"{GIOS_BASE}/station/sensors/{sid}")
                sensors_data = sensors_r.json()
                sensors = sensors_data.get(
                    "Lista stanowisk pomiarowych dla podanej stacji", []
                )

                index_r = await client.get(f"{GIOS_BASE}/aqindex/getIndex/{sid}")
                index_data = index_r.json().get("AqIndex", {})
            except Exception:
                continue

            pm25 = pm10 = None
            for sensor in sensors:
                param_code = sensor.get("Wska\u017anik - kod", "")
                sensor_id = sensor.get("Identyfikator stanowiska")
                if param_code not in ("PM2.5", "PM10") or not sensor_id:
                    continue
                try:
                    data_r = await client.get(f"{GIOS_BASE}/data/getData/{sensor_id}")
                    resp = data_r.json()
                    values = resp.get("Lista danych pomiarowych", [])
                    for v in values:
                        if v.get("Warto\u015b\u0107") is not None:
                            if param_code == "PM2.5":
                                pm25 = v["Warto\u015b\u0107"]
                            elif param_code == "PM10":
                                pm10 = v["Warto\u015b\u0107"]
                            break
                except Exception:
                    pass

            classification = classify_aqi(pm25, pm10)
            index_name = (
                index_data.get("Nazwa kategorii indeksu")
                if isinstance(index_data, dict)
                else None
            )
            results.append(
                {
                    "id": sid,
                    "name": station.get("Nazwa stacji", ""),
                    "lat": float(station["WGS84 \u03c6 N"]),
                    "lon": float(station["WGS84 \u03bb E"]),
                    "city": station.get("Nazwa miasta", ""),
                    "pm25": pm25,
                    "pm10": pm10,
                    "index": index_name,
                    **classification,
                }
            )

    return results


# ── IMGW (meteo) ─────────────────────────────────────────────────────────────


@app.get("/api/weather", tags=["Pogoda"], summary="Dane synoptyczne IMGW – Lublin")
async def get_weather():
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(f"{IMGW_BASE}/synop")
        all_data = r.json()

    lublin = None
    best_dist = 999
    for s in all_data:
        # IMGW doesn't return coords directly, match by name
        name = (s.get("stacja") or "").lower()
        if "lublin" in name:
            lublin = s
            break
        # Fallback – closest station by rough guess if name doesn't match
    if lublin is None:
        # try "Radawiec" which is the IMGW synoptic station near Lublin
        for s in all_data:
            if "radawiec" in (s.get("stacja") or "").lower():
                lublin = s
                break

    if lublin is None and all_data:
        lublin = all_data[0]  # last resort

    if lublin:
        wind_speed = float(lublin.get("predkosc_wiatru") or 0)
        wind_dir = float(lublin.get("kierunek_wiatru") or 0)
        return {
            "station": lublin.get("stacja"),
            "date": lublin.get("data_pomiaru"),
            "hour": lublin.get("godzina_pomiaru"),
            "temperature": lublin.get("temperatura"),
            "humidity": lublin.get("wilgotnosc_wzgledna"),
            "wind_speed_kmh": round(wind_speed * 3.6, 1),
            "wind_speed_ms": wind_speed,
            "wind_direction_deg": wind_dir,
            "pressure": lublin.get("cisnienie"),
            "rainfall": lublin.get("suma_opadu"),
            "visibility": lublin.get("widzialnosc"),
        }
    return {"error": "Brak danych IMGW"}


# ── OSM – obiekty wrażliwe ───────────────────────────────────────────────────


@app.get(
    "/api/sensitive-objects",
    tags=["Obiekty wrażliwe"],
    summary="Szkoły / szpitale / DPS-y / przedszkola",
)
async def get_sensitive_objects():
    query = f"""
    [out:json][timeout:25];
    (
      node["amenity"="school"](around:15000,{LUBLIN_LAT},{LUBLIN_LON});
      way["amenity"="school"](around:15000,{LUBLIN_LAT},{LUBLIN_LON});
      node["amenity"="hospital"](around:15000,{LUBLIN_LAT},{LUBLIN_LON});
      way["amenity"="hospital"](around:15000,{LUBLIN_LAT},{LUBLIN_LON});
      node["amenity"="clinic"](around:15000,{LUBLIN_LAT},{LUBLIN_LON});
      way["amenity"="clinic"](around:15000,{LUBLIN_LAT},{LUBLIN_LON});
      node["social_facility"="nursing_home"](around:15000,{LUBLIN_LAT},{LUBLIN_LON});
      way["social_facility"="nursing_home"](around:15000,{LUBLIN_LAT},{LUBLIN_LON});
      node["amenity"="kindergarten"](around:15000,{LUBLIN_LAT},{LUBLIN_LON});
      way["amenity"="kindergarten"](around:15000,{LUBLIN_LAT},{LUBLIN_LON});
      node["social_facility"="group_home"](around:15000,{LUBLIN_LAT},{LUBLIN_LON});
      way["social_facility"="group_home"](around:15000,{LUBLIN_LAT},{LUBLIN_LON});
    );
    out center;
    """
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(OVERPASS_URL, data={"data": query})
        data = r.json()

    results = []
    for el in data.get("elements", []):
        lat = el.get("lat") or el.get("center", {}).get("lat")
        lon = el.get("lon") or el.get("center", {}).get("lon")
        if not lat or not lon:
            continue
        tags = el.get("tags", {})
        amenity = tags.get("amenity", "")
        social = tags.get("social_facility", "")

        if social in ("nursing_home", "group_home"):
            category = "dps"
        elif amenity == "hospital":
            category = "szpital"
        elif amenity == "clinic":
            category = "przychodnia"
        elif amenity == "kindergarten":
            category = "przedszkole"
        elif amenity == "school":
            category = "szkoła"
        else:
            category = amenity or social

        results.append(
            {
                "name": tags.get("name", f"{category} (bez nazwy)"),
                "category": category,
                "lat": lat,
                "lon": lon,
            }
        )

    return results


# ── danger zone ──────────────────────────────────────────────────────────────


@app.get(
    "/api/danger-zone",
    tags=["Strefa zagrożenia"],
    summary="Analiza zagrożenia + rekomendacje",
)
async def get_danger_zone():
    """Combine air quality + weather to compute danger zones and recommendations."""
    air = await get_air_quality()
    weather = await get_weather()

    wind_dir = weather.get("wind_direction_deg", 0)
    wind_speed = weather.get("wind_speed_kmh", 0)

    zones = []
    global_actions: list[str] = []
    worst_level = "bardzo dobry"
    level_order = [
        "bardzo dobry",
        "dobry / umiarkowany",
        "dostateczny",
        "zły",
        "bardzo zły / alarmowy",
    ]

    for station in air:
        lvl = station.get("level", "brak danych")
        if lvl in level_order and level_order.index(lvl) > level_order.index(
            worst_level
        ):
            worst_level = lvl
            global_actions = station.get("actions", [])

        polygon = wind_zone_polygon(
            station["lat"], station["lon"], wind_dir, wind_speed, lvl
        )
        if polygon:
            zones.append(
                {
                    "station": station["name"],
                    "level": lvl,
                    "color": station["color"],
                    "polygon": polygon,
                }
            )

    return {
        "timestamp": datetime.now().isoformat(),
        "weather": weather,
        "worst_level": worst_level,
        "global_actions": global_actions,
        "zones": zones,
        "stations": air,
    }


# ── IMGW Hydrologia ─────────────────────────────────────────────────────────


def _is_lubelskie_station(station: dict) -> bool:
    """Check if a hydro station belongs to region near Lubelskie."""
    river = (station.get("rzeka") or "").lower().strip()
    if river in LUBELSKIE_RIVERS:
        return True
    province = (station.get("województwo") or station.get("wojewodztwo") or "").lower()
    return "lubelskie" in province


def _classify_water_level(station: dict) -> str:
    """Classify station status based on warning/alarm thresholds."""
    try:
        level = float(station.get("stan_wody") or 0)
    except (ValueError, TypeError):
        return "stable"

    alarm_raw = station.get("stan_alarmowy")
    warning_raw = station.get("stan_ostrzegawczy")

    try:
        alarm = float(alarm_raw) if alarm_raw else None
    except (ValueError, TypeError):
        alarm = None
    try:
        warning = float(warning_raw) if warning_raw else None
    except (ValueError, TypeError):
        warning = None

    if alarm and level >= alarm:
        return "critical"
    if warning and level >= warning:
        return "warning"
    return "stable"


@app.get("/api/hydro", tags=["Powódź"], summary="Stany wód – stacje IMGW w Lubelskim")
async def get_hydro():
    """Bieżące stany wód ze stacji hydrologicznych IMGW w woj. lubelskim."""
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(IMGW_HYDRO)
        all_stations = r.json()

    results = []
    for s in all_stations:
        if not _is_lubelskie_station(s):
            continue

        status = _classify_water_level(s)
        results.append(
            {
                "station": s.get("stacja"),
                "river": s.get("rzeka"),
                "province": s.get("województwo") or s.get("wojewodztwo"),
                "level_cm": s.get("stan_wody"),
                "level_date": s.get("stan_wody_data_pomiaru"),
                "temperature": s.get("temperatura_wody"),
                "warning_level": s.get("stan_ostrzegawczy"),
                "alarm_level": s.get("stan_alarmowy"),
                "trend": s.get("zjawisko_lodowe") or s.get("zjawisko_zapieczenie"),
                "status": status,
            }
        )

    results.sort(
        key=lambda x: {"critical": 0, "warning": 1, "stable": 2}.get(x["status"], 3)
    )
    return results


@app.get(
    "/api/flood-warnings", tags=["Powódź"], summary="Ostrzeżenia hydrologiczne IMGW"
)
async def get_flood_warnings():
    """Aktualnie obowiązujące ostrzeżenia hydrologiczne z IMGW."""
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(IMGW_WARNINGS_HYDRO)
        try:
            data = r.json()
        except Exception:
            return []

    if not isinstance(data, list):
        data = [data] if data else []

    warnings = []
    for w in data:
        region = (w.get("teren") or w.get("region") or "").lower()
        if "lubel" in region or "lubelskie" in region or not region:
            warnings.append(
                {
                    "id": w.get("id"),
                    "region": w.get("teren") or w.get("region"),
                    "level": w.get("stopien") or w.get("level"),
                    "phenomenon": w.get("zjawisko") or w.get("phenomenon"),
                    "start": w.get("od") or w.get("start"),
                    "end": w.get("do") or w.get("end"),
                    "description": w.get("tresc")
                    or w.get("opis")
                    or w.get("description"),
                    "probability": w.get("prawdopodobienstwo"),
                }
            )

    return warnings


@app.get(
    "/api/flood-hospitals",
    tags=["Powódź"],
    summary="Szpitale vs. powódź – status operacyjny",
)
async def get_flood_hospitals():
    """
    Krzyżuje dane o szpitalach (OSM) z bieżącymi stanami wód (IMGW).
    Zwraca status każdego szpitala:
    - evacuate:   w promieniu 5 km od stacji w stanie alarmowym
    - at_risk:    w promieniu 10 km od stacji w stanie ostrzegawczym
    - redirect:   operacyjny, ale może przyjąć zasoby z ewakuowanych
    - operational: brak zagrożenia
    """
    hydro_data = await get_hydro()
    sensitive = await get_sensitive_objects()

    hospitals = [
        obj for obj in sensitive if obj["category"] in ("szpital", "przychodnia")
    ]

    critical_stations = [s for s in hydro_data if s["status"] == "critical"]
    warning_stations = [s for s in hydro_data if s["status"] == "warning"]

    # Approximate coordinates for known hydro stations in Lubelskie
    STATION_COORDS: dict[str, tuple[float, float]] = {
        "Włodawa": (51.55, 23.55),
        "Dorohusk": (51.17, 23.81),
        "Kodeń": (51.75, 23.60),
        "Terespol": (52.07, 23.62),
        "Lubartów": (51.46, 22.61),
        "Puławy": (51.41, 21.97),
        "Dęblin": (51.56, 21.85),
        "Annopol": (50.89, 21.86),
        "Kraśnik": (50.93, 22.23),
        "Zamość": (50.72, 23.25),
        "Chełm": (51.14, 23.47),
        "Biłgoraj": (50.54, 22.72),
        "Janów Lubelski": (50.70, 22.42),
        "Łęczna": (51.30, 22.88),
        "Wieprz": (51.25, 22.60),
        "Bystrzyca": (51.25, 22.55),
        "Lublin": (51.25, 22.57),
        "Radawiec": (51.22, 22.47),
        "Kozłówka": (51.45, 22.55),
        "Krasnystaw": (50.98, 23.17),
    }

    def get_station_coords(station_name: str) -> tuple[float, float] | None:
        if not station_name:
            return None
        name_lower = station_name.strip()
        for key, coords in STATION_COORDS.items():
            if key.lower() in name_lower.lower() or name_lower.lower() in key.lower():
                return coords
        return None

    EVAC_RADIUS_KM = 5
    RISK_RADIUS_KM = 10

    results = []
    evacuate_count = 0
    at_risk_count = 0

    for h in hospitals:
        h_lat, h_lon = h["lat"], h["lon"]
        status = "operational"
        nearest_threat = None
        threat_distance = None

        # Check against critical (alarm) stations
        for s in critical_stations:
            coords = get_station_coords(s.get("station", ""))
            if not coords:
                continue
            dist = haversine(h_lat, h_lon, coords[0], coords[1])
            if dist <= EVAC_RADIUS_KM:
                status = "evacuate"
                nearest_threat = s.get("station")
                threat_distance = round(dist, 1)
                break
            if dist <= RISK_RADIUS_KM and status != "evacuate":
                status = "at_risk"
                nearest_threat = s.get("station")
                threat_distance = round(dist, 1)

        # Check against warning stations (only if not already critical)
        if status == "operational":
            for s in warning_stations:
                coords = get_station_coords(s.get("station", ""))
                if not coords:
                    continue
                dist = haversine(h_lat, h_lon, coords[0], coords[1])
                if dist <= RISK_RADIUS_KM:
                    status = "at_risk"
                    nearest_threat = s.get("station")
                    threat_distance = round(dist, 1)
                    break

        if status == "evacuate":
            evacuate_count += 1
        elif status == "at_risk":
            at_risk_count += 1

        results.append(
            {
                **h,
                "flood_status": status,
                "nearest_threat_station": nearest_threat,
                "threat_distance_km": threat_distance,
            }
        )

    # Mark safe hospitals far from threats as able to redirect resources
    for r in results:
        if r["flood_status"] == "operational" and (
            evacuate_count > 0 or at_risk_count > 0
        ):
            r["flood_status"] = "redirect"

    results.sort(
        key=lambda x: {
            "evacuate": 0,
            "at_risk": 1,
            "redirect": 2,
            "operational": 3,
        }.get(x["flood_status"], 4)
    )

    return {
        "timestamp": datetime.now().isoformat(),
        "summary": {
            "total": len(results),
            "evacuate": evacuate_count,
            "at_risk": at_risk_count,
            "redirect": len(results) - evacuate_count - at_risk_count,
        },
        "hydro_alerts": [
            s for s in hydro_data if s["status"] in ("critical", "warning")
        ],
        "hospitals": results,
    }


# ── Voice Control ────────────────────────────────────────────────────────────

VOICE_SYSTEM_PROMPT_TEMPLATE = """\
Jesteś asystentem głosowym Centrum Dowodzenia Kryzysowego województwa lubelskiego.
Aplikacja monitoruje: szpitale, jakość powietrza, kamery miejskie, zagrożenia powodziowe, dane hydrologiczne IMGW.

Dostępne zakładki (tab):
- "map" – przegląd regionalny z mapą
- "hospitals" – lista szpitali z łóżkami

Panele boczne (panel):
- "map" – filtr terytorialny (powiaty / gminy)
- "live" – kamery na żywo
- "layers" – warstwy mapy
- "risk" – analiza ryzyka
- "files" – dane i pliki

Warstwy mapy (layer):
- "hospitals" – szpitale
- "floodZones" – strefy powodziowe
- "cameras" – kamery
- "powiatBoundaries" – granice powiatów
- "gminaBoundaries" – granice gmin

Na podstawie komendy głosowej, wybierz akcję i napisz KRÓTKIE potwierdzenie po polsku (1-3 zdania).
Jeśli komenda jest pytaniem lub prośbą o informacje, użyj akcji "info" i odpowiedz KONKRETNIE
w confirmation_text, korzystając z danych bieżących podanych poniżej. Podawaj liczby, nazwy, statusy.
Nie mów "sprawdź w zakładce" – odpowiedz od razu na podstawie danych.

──── BIEŻĄCE DANE DASHBOARDU ────
{live_data}
──────────────────────────────────"""


# ── Live data cache (TTL 30s) ────────────────────────────────────────────────
_live_cache: dict[str, Any] = {"text": "", "ts": 0.0}
_CACHE_TTL = 30  # seconds


async def _fetch_weather_summary() -> str:
    try:
        weather = await get_weather()
        return (
            f"POGODA: {weather.get('temperature_C', '?')}°C, "
            f"wiatr {weather.get('wind_speed_kmh', '?')} km/h ({weather.get('wind_direction', '?')}), "
            f"opad: {weather.get('precip_mm', 0)} mm, "
            f"ciśnienie: {weather.get('pressure_hPa', '?')} hPa"
        )
    except Exception:
        return "POGODA: brak danych"


async def _fetch_air_summary() -> str:
    try:
        air = await get_air_quality()
        if air:
            worst = max(air, key=lambda s: (s.get("pm25") or 0))
            return (
                f"JAKOŚĆ POWIETRZA: {len(air)} stacji. Najgorsza: {worst['name']} – "
                f"PM2.5={worst.get('pm25')}, PM10={worst.get('pm10')}, "
                f"poziom: {worst.get('level', '?')}"
            )
        return "JAKOŚĆ POWIETRZA: brak danych"
    except Exception:
        return "JAKOŚĆ POWIETRZA: brak danych"


async def _fetch_hydro_summary() -> str:
    try:
        hydro = await get_hydro()
        stations = hydro.get("stations", [])
        critical = [s for s in stations if s.get("status") == "critical"]
        warning = [s for s in stations if s.get("status") == "warning"]
        summary = f"HYDROLOGIA: {len(stations)} stacji."
        if critical:
            summary += f" KRYTYCZNE ({len(critical)}): " + ", ".join(
                f"{s.get('station', '?')} ({s.get('river', '?')}) – {s.get('water_level_cm', '?')} cm"
                for s in critical[:5]
            )
        if warning:
            summary += f" Ostrzegawcze ({len(warning)}): " + ", ".join(
                f"{s.get('station', '?')} ({s.get('river', '?')}) – {s.get('water_level_cm', '?')} cm"
                for s in warning[:5]
            )
        if not critical and not warning:
            summary += " Wszystkie stacje stabilne."
        return summary
    except Exception:
        return "HYDROLOGIA: brak danych"


async def _fetch_flood_summary() -> str:
    try:
        flood = await get_flood_hospitals()
        s = flood.get("summary", {})
        lines = [
            f"SZPITALE vs POWÓDŹ: {s.get('total', '?')} szpitali, "
            f"ewakuacja: {s.get('evacuate', 0)}, zagrożone: {s.get('at_risk', 0)}, "
            f"przekierowanie: {s.get('redirect', 0)}"
        ]
        for h in flood.get("hospitals", [])[:8]:
            if h.get("flood_status") in ("evacuate", "at_risk"):
                lines.append(
                    f"  - {h.get('name', '?')}: {h['flood_status']}, "
                    f"zagrożenie ze stacji: {h.get('nearest_threat_station', '?')} "
                    f"({h.get('threat_distance_km', '?')} km)"
                )
        return "\n".join(lines)
    except Exception:
        return "SZPITALE vs POWÓDŹ: brak danych"


async def _gather_live_summary() -> str:
    """Fetch key dashboard data (parallel, cached 30s) for GPT context."""
    now = time.monotonic()
    if now - _live_cache["ts"] < _CACHE_TTL and _live_cache["text"]:
        return _live_cache["text"]

    results = await asyncio.gather(
        _fetch_weather_summary(),
        _fetch_air_summary(),
        _fetch_hydro_summary(),
        _fetch_flood_summary(),
    )
    text = "\n".join(results)
    _live_cache["text"] = text
    _live_cache["ts"] = now
    return text


VOICE_TOOL = {
    "type": "function",
    "function": {
        "name": "execute_dashboard_action",
        "description": "Wykonaj akcję w dashboardzie kryzysowym na podstawie komendy głosowej",
        "parameters": {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": [
                        "switch_tab",
                        "open_panel",
                        "close_panel",
                        "search_territory",
                        "toggle_layer",
                        "info",
                    ],
                    "description": "Typ akcji do wykonania",
                },
                "tab": {
                    "type": "string",
                    "enum": ["map", "hospitals"],
                },
                "panel": {
                    "type": "string",
                    "enum": ["map", "live", "layers", "risk", "files"],
                },
                "territory_name": {
                    "type": "string",
                    "description": "Nazwa terytorium do wyszukania",
                },
                "territory_type": {
                    "type": "string",
                    "enum": ["powiat", "gmina"],
                },
                "layer": {
                    "type": "string",
                    "enum": [
                        "hospitals",
                        "floodZones",
                        "cameras",
                        "powiatBoundaries",
                        "gminaBoundaries",
                    ],
                },
                "layer_enabled": {
                    "type": "boolean",
                    "description": "Włącz (true) lub wyłącz (false) warstwę",
                },
                "confirmation_text": {
                    "type": "string",
                    "description": "Krótkie potwierdzenie głosowe po polsku",
                },
            },
            "required": ["action", "confirmation_text"],
        },
    },
}

ELEVENLABS_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"  # Rachel
ELEVENLABS_MODEL = "eleven_turbo_v2_5"  # faster than eleven_multilingual_v2


@app.post("/api/voice-control", tags=["Głos"], summary="Sterowanie głosowe dashboardem")
async def voice_control(file: UploadFile = File(...)):
    """
    Odbiera nagranie audio → transkrybuje (Whisper) → wyciąga akcję (GPT-4o)
    → generuje potwierdzenie głosowe (ElevenLabs) → zwraca JSON z akcją + audio.
    """
    audio_bytes = await file.read()

    openai_key = os.getenv("OPENAI_API_KEY")
    elevenlabs_key = os.getenv("ELEVEN_LABS_API_KEY")

    if not openai_key:
        return {"error": "Brak klucza OPENAI_API_KEY w zmiennych środowiskowych."}

    ai = openai.AsyncOpenAI(api_key=openai_key)

    # 1. Transcribe with Whisper + gather live data IN PARALLEL ────────────
    audio_file = io.BytesIO(audio_bytes)
    audio_file.name = file.filename or "audio.webm"

    transcript_coro = ai.audio.transcriptions.create(
        model="whisper-1",
        file=audio_file,
        language="pl",
    )
    live_data_coro = _gather_live_summary()

    transcript, live_data = await asyncio.gather(transcript_coro, live_data_coro)
    user_text = transcript.text

    # 2. Extract action with GPT-4o-mini function calling ─────────────────────
    system_prompt = VOICE_SYSTEM_PROMPT_TEMPLATE.format(live_data=live_data)

    chat = await ai.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_text},
        ],
        tools=[VOICE_TOOL],
        tool_choice={
            "type": "function",
            "function": {"name": "execute_dashboard_action"},
        },
    )

    tool_call = chat.choices[0].message.tool_calls[0]
    action_data = json.loads(tool_call.function.arguments)

    # 3. Generate voice confirmation with ElevenLabs TTS ──────────────────────
    confirmation = action_data.get("confirmation_text", "Wykonano.")
    audio_b64 = None

    if elevenlabs_key:
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                tts_r = await client.post(
                    f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}",
                    headers={
                        "xi-api-key": elevenlabs_key,
                        "Content-Type": "application/json",
                    },
                    json={
                        "text": confirmation,
                        "model_id": ELEVENLABS_MODEL,
                        "voice_settings": {
                            "stability": 0.5,
                            "similarity_boost": 0.75,
                        },
                    },
                )
                if tts_r.status_code == 200:
                    audio_b64 = base64.b64encode(tts_r.content).decode("utf-8")
        except Exception:
            pass  # TTS failure is non-critical; frontend still gets action

    return {
        "transcript": user_text,
        "action": action_data,
        "audio": audio_b64,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
