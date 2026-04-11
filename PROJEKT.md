# API do scrapowania danych o wolnych miejscach w szpitalach

źródło: https://szpitale.lublin.uw.gov.pl/page/

## Wymagania

1. Pobieranie danych o wolnych łóżkach w szpitalach z podziałem na oddziały, szpitale i oddziały w szpitalach
2. Geokodowanie danych o lokalizacji szpitali
3. Dane muszą być względnie świeże (na tej stronce którą mamy mamy codzinenie nowe)

## Baza danych

Handler od bazy danych taki żebym mógł w łatwy sposób zmienić z np. SQLite na Postgresa i przemigrować zebrane dane

Modele Pydantic dla poszczególnych danych

### Modele:

#### hospital - szpital
model przechowujący dane o szpitalach - nazwy, oddziały, lokalizację (lattitude i longtitude)

Pola:

- id
- hospital_name
- address
- lattitude
- longtitude

- created_at
- updated_at
- deleted_at

#### department - oddział

- id
- department_name

- created_at
- updated_at
- deleted_at

#### hospital_department - oddział w konkretnym szpitalu

- id
- department_id
- hospital_id
- total_beds
- free_beds

- created_at
- updated_at
- deleted_at

#### ingestion_task

- id
- status
- progress
- current_step
- message