import math
from datetime import datetime
from typing import Any

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Lublin – Awaria Środowiskowa Dashboard",
    description="API zarządzania kryzysowego: jakość powietrza, meteo, obiekty wrażliwe, strefy zagrożenia.",
    version="1.0.0",
    openapi_tags=[
        {"name": "Jakość powietrza", "description": "Dane PM2.5/PM10 ze stacji GIOŚ w okolicy Lublina"},
        {"name": "Pogoda", "description": "Warunki meteorologiczne z IMGW (wiatr, temperatura, opad)"},
        {"name": "Obiekty wrażliwe", "description": "Szkoły, szpitale, DPS-y, przedszkola z OpenStreetMap"},
        {"name": "Strefa zagrożenia", "description": "Analiza: łączy powietrze + meteo → strefy i rekomendacje"},
    ],
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

LUBLIN_LAT = 51.2465
LUBLIN_LON = 22.5684
SEARCH_RADIUS_KM = 30

GIOS_BASE = "https://api.gios.gov.pl/pjp-api/v1/rest"
IMGW_BASE = "https://danepubliczne.imgw.pl/api/data"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"


# ── helpers ──────────────────────────────────────────────────────────────────

def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def classify_aqi(pm25, pm10) -> dict:
    """Return danger level + recommendations based on PM values."""
    val = pm25 if pm25 is not None else (pm10 / 2 if pm10 is not None else None)
    if val is None:
        return {"level": "brak danych", "color": "#999", "actions": []}

    if val <= 13:
        return {"level": "bardzo dobry", "color": "#00e400",
                "actions": ["Brak zagrożenia – normalna aktywność."]}
    if val <= 35:
        return {"level": "dobry / umiarkowany", "color": "#ffff00",
                "actions": ["Osoby wrażliwe powinny ograniczyć długi wysiłek na zewnątrz."]}
    if val <= 55:
        return {"level": "dostateczny", "color": "#ff7e00",
                "actions": [
                    "Ogranicz aktywność na zewnątrz.",
                    "Zamknij okna w szkołach i DPS-ach.",
                    "Wydaj ostrzeżenie dla mieszkańców.",
                ]}
    if val <= 75:
        return {"level": "zły", "color": "#ff0000",
                "actions": [
                    "🚨 Zamknij szkoły i przedszkola lub przejdź na tryb zdalny.",
                    "Ogranicz transport publiczny do minimum.",
                    "Uruchom ostrzeżenie RCB / RSO.",
                    "Szpitale: przygotuj oddziały pulmonologiczne.",
                ]}
    return {"level": "bardzo zły / alarmowy", "color": "#7e0023",
            "actions": [
                "🚨🚨 EWAKUACJA punktowa DPS-ów i szpitali w strefie.",
                "Zamknij wszystkie placówki oświatowe.",
                "Zakaz wychodzenia z budynków bez maski FFP2/FFP3.",
                "Wstrzymaj ruch drogowy w strefie zagrożenia.",
                "Aktywuj Miejski Zespół Zarządzania Kryzysowego.",
            ]}


def wind_zone_polygon(lat: float, lon: float, direction_deg: float, speed_kmh: float,
                       aqi_level: str) -> list[list[float]]:
    """Generate a fan-shaped danger zone downwind from the source."""
    multiplier = {"bardzo dobry": 0, "dobry / umiarkowany": 0, "dostateczny": 1,
                  "zły": 2, "bardzo zły / alarmowy": 3}.get(aqi_level, 0)
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

@app.get("/api/air-quality", tags=["Jakość powietrza"], summary="Stacje GIOŚ – PM2.5 / PM10")
async def get_air_quality():
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(f"{GIOS_BASE}/station/findAll?page=0&size=500")
        data = r.json()

    all_stations = data.get("Lista stacji pomiarowych", [])

    nearby = [s for s in all_stations
              if s.get("WGS84 \u03c6 N") and s.get("WGS84 \u03bb E")
              and haversine(LUBLIN_LAT, LUBLIN_LON,
                            float(s["WGS84 \u03c6 N"]), float(s["WGS84 \u03bb E"])) <= SEARCH_RADIUS_KM]

    results = []
    async with httpx.AsyncClient(timeout=15) as client:
        for station in nearby:
            sid = station["Identyfikator stacji"]
            try:
                sensors_r = await client.get(f"{GIOS_BASE}/station/sensors/{sid}")
                sensors_data = sensors_r.json()
                sensors = sensors_data.get("Lista stanowisk pomiarowych dla podanej stacji", [])

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
            index_name = index_data.get("Nazwa kategorii indeksu") if isinstance(index_data, dict) else None
            results.append({
                "id": sid,
                "name": station.get("Nazwa stacji", ""),
                "lat": float(station["WGS84 \u03c6 N"]),
                "lon": float(station["WGS84 \u03bb E"]),
                "city": station.get("Nazwa miasta", ""),
                "pm25": pm25,
                "pm10": pm10,
                "index": index_name,
                **classification,
            })

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

@app.get("/api/sensitive-objects", tags=["Obiekty wrażliwe"], summary="Szkoły / szpitale / DPS-y / przedszkola")
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

        results.append({
            "name": tags.get("name", f"{category} (bez nazwy)"),
            "category": category,
            "lat": lat,
            "lon": lon,
        })

    return results


# ── danger zone ──────────────────────────────────────────────────────────────

@app.get("/api/danger-zone", tags=["Strefa zagrożenia"], summary="Analiza zagrożenia + rekomendacje")
async def get_danger_zone():
    """Combine air quality + weather to compute danger zones and recommendations."""
    air = await get_air_quality()
    weather = await get_weather()

    wind_dir = weather.get("wind_direction_deg", 0)
    wind_speed = weather.get("wind_speed_kmh", 0)

    zones = []
    global_actions: list[str] = []
    worst_level = "bardzo dobry"
    level_order = ["bardzo dobry", "dobry / umiarkowany", "dostateczny", "zły", "bardzo zły / alarmowy"]

    for station in air:
        lvl = station.get("level", "brak danych")
        if lvl in level_order and level_order.index(lvl) > level_order.index(worst_level):
            worst_level = lvl
            global_actions = station.get("actions", [])

        polygon = wind_zone_polygon(station["lat"], station["lon"], wind_dir, wind_speed, lvl)
        if polygon:
            zones.append({
                "station": station["name"],
                "level": lvl,
                "color": station["color"],
                "polygon": polygon,
            })

    return {
        "timestamp": datetime.now().isoformat(),
        "weather": weather,
        "worst_level": worst_level,
        "global_actions": global_actions,
        "zones": zones,
        "stations": air,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
