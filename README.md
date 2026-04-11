# Aegis Insight

In-memory baza grafowa dla scenariuszy OSINT, z API FastAPI i prostym frontendem Next.js.

## Struktura

- `graph_db/` - rdzen bazy grafowej, modele i factory danych
- `api/` - warstwa FastAPI
- `wizualizacja/` - prosty frontend Next.js do wizualizacji relacji

## Uruchomienie backendu (FastAPI)

```bash
python -m pip install -r api/requirements.txt
uvicorn api.main:app --reload
```

API domyslnie: `http://127.0.0.1:8000`

## Google Earth Engine (warstwa mapy)

Aby wlaczyc warstwe `Google Earth Engine (terrain)` w widoku mapy, ustaw w backendzie:

```bash
export GEE_SERVICE_ACCOUNT_EMAIL="service-account@your-project.iam.gserviceaccount.com"
export GEE_PROJECT="your-gcp-project-id"
export GEE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"
```

Bez tych zmiennych frontend automatycznie zostanie przy standardowych warstwach mapy.

## Uruchomienie frontendu (Next.js)

```bash
cd wizualizacja
npm install
npm run dev
```

Frontend domyslnie: `http://127.0.0.1:3000`

## Konfiguracja API URL w frontendzie

Opcjonalnie ustaw:

```bash
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```
