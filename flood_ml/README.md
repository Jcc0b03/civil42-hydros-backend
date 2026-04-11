# Flood ML (Lubelskie)

This folder contains standalone ML pipelines for flood-risk prediction based on historical IMGW data.

## Data sources

- Daily hydro observations (historical):
  - `http://danepubliczne.imgw.pl/data/dane_pomiarowo_obserwacyjne/dane_hydrologiczne/dobowe/{year}/codz_{year}_{month}.zip`
- Historical hydrological warnings archive:
  - `http://danepubliczne.imgw.pl/data/arch/ost_hydro/{year}/{month}.zip`
- Live hydro data:
  - `http://danepubliczne.imgw.pl/api/data/hydro/`

## What the model predicts

Binary classification:
- `1`: elevated flood risk for the requested hospital in Lubelskie
- `0`: low risk

Labels are derived from historical warning documents that:
- include `lubelskie`
- include flood-related keywords (`wezbr`, `powodz`, `gwałtowne wzrosty stanów`, etc.)
- exclude drought warnings (`susza`)

## Train global model

```bash
/home/jakubw/Programowanie/hackathon_42civil/.venv/bin/python flood_ml/train_model.py --start-year 2010 --end-year 2024
```

Artifacts are stored in:
- `flood_ml/artifacts/flood_risk_model.joblib`
- `flood_ml/artifacts/flood_risk_model_meta.json`

## Live prediction

```bash
/home/jakubw/Programowanie/hackathon_42civil/.venv/bin/python flood_ml/predict_live.py
```

Output contains:
- risk probability
- binary prediction
- feature snapshot used for inference

## Hospital-aware model

Train:

```bash
/home/jakubw/Programowanie/hackathon_42civil/.venv/bin/python flood_ml/train_hospital_model.py --start-year 2010 --end-year 2024
```

Predict for a specific hospital:

```bash
/home/jakubw/Programowanie/hackathon_42civil/.venv/bin/python flood_ml/predict_hospital_model.py \
  --hospital-name "Szpital X" \
  --address "ul. Przykładowa 1, Lublin" \
  --latitude 51.25 \
  --longitude 22.57 \
  --total-beds 120 \
  --free-beds 12
```

API endpoint:

- `POST /api/flood/ml-prediction`
- body: `{"hospital": {...}}`
