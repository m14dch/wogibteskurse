# Zürich Sport Portal API

Research notes on the sport portal's internal API. This is an undocumented API used by the official website — it may change without notice.

> **Note:** These endpoints belong to the City of Zürich. This documentation exists solely to support the development of this application.

---

## Operating policy

The Stadt Zürich sport portal API is undocumented and can change without notice. Treat it as an
external upstream dependency, not as a stable public contract.

This application keeps request behavior conservative:

- Course responses are cached server-side for a short period and identical concurrent requests share
  one in-flight upstream fetch.
- Course page fetching is bounded by `SPORT_PORTAL_PAGE_CONCURRENCY` and
  `SPORT_PORTAL_MAX_TOTAL_PAGES`.
- Upstream requests use `UPSTREAM_FETCH_TIMEOUT_MS`.
- Clearly transient failures such as timeouts, `429`, `502`, `503`, and `504` get at most one retry
  with short backoff. API/schema errors are not retried.
- Logs distinguish token, lookup, first-page, later-page, timeout, and schema failures, but must not
  include cookies, XSRF tokens, or full upstream payloads.

If the upstream API changes or becomes unavailable, `/api/courses` and `/api/lookups` should return a
stable user-facing error instead of exposing upstream internals.

---

## Base URL

```
https://www.stadt-zuerich.ch/sport-portal/API/api
```

---

## Authentication

The API uses CSRF protection via an XSRF token. To obtain a valid token:

1. Make a `GET` request to `https://www.stadt-zuerich.ch/sport-portal/angebot/ferienkurse`
2. Extract the `XSRF-TOKEN` cookie from the response
3. URL-decode it and pass it as the `x-xsrf-token` request header on subsequent API calls

The token appears to be long-lived (minutes to hours). We cache it server-side and refresh as needed.

---

## Endpoints

### `POST /courses`

Search and filter courses.

**Request headers:**

```
Content-Type: application/json
x-xsrf-token: <token>
```

**Request body:**

```json
{
  "kurstyp": 2,
  "aktivitaeten": [],
  "ferienwochen": [],
  "ferientyp": [2],
  "wochentage": [],
  "jahrgaenge": [],
  "geschlecht": null,
  "kategorien": [],
  "select1": [],
  "select2": [],
  "select3": [],
  "check1": false,
  "pageNumber": 0,
  "pageSize": 25
}
```

| Field          | Type             | Description                                  |
| -------------- | ---------------- | -------------------------------------------- |
| `kurstyp`      | `number`         | Course type. `2` = Ferienkurse               |
| `aktivitaeten` | `number[]`       | Activity IDs (from aktivitaet lookup)        |
| `ferienwochen` | `number[]`       | Holiday week IDs (1–5)                       |
| `ferientyp`    | `number[]`       | Holiday type IDs                             |
| `jahrgaenge`   | `number[]`       | Birth year keys (from jahrgangferien lookup) |
| `geschlecht`   | `number \| null` | Gender ID, or `null` for all                 |
| `kategorien`   | `number[]`       | Category IDs                                 |
| `check1`       | `boolean`        | `true` = only courses with available spots   |
| `pageNumber`   | `number`         | 0-indexed page number                        |
| `pageSize`     | `number`         | Results per page                             |

**Response:**

```json
{
  "statusCode": 22779,
  "success": true,
  "data": {
    "total": 408,
    "showButton": true,
    "results": [
      {
        "angebotId": 27881,
        "nummer": "FAB 11",
        "titel": "Ab auf die Bühne!",
        "titelUrl": "Ab_auf_die_Buehne!",
        "text": "...",
        "kurstypId": 2,
        "aktivitaetId": 340795,
        "ferientypId": 2,
        "ferienwocheId": 1,
        "schulkreisId": 5,
        "kategorieId": 1,
        "geschlechtId": 3,
        "jahrgangVon": 2014,
        "jahrgangBis": 2017,
        "von": "2026-07-13T10:00:00",
        "bis": "2026-07-17T16:00:00",
        "zeitpunkt1": "Sommerferien 2026, 1. Woche",
        "zeitpunkt2": "Montag bis Freitag",
        "zeitpunkt3": "10.00–16.00 Uhr",
        "jahrgang": "2014–2017",
        "geschlecht": "Mädchen und Knaben",
        "niveau": "",
        "kursOrt": "Nistplatz Mühlehalde",
        "adresse": {
          "adressId": 0,
          "geoKoordinaten": {
            "longitude": 0,
            "latitude": 0
          }
        },
        "anlageLaengengrad": 0,
        "anlageBreitengrad": 0,
        "hatFreiePlaetze": true,
        "hasBuchungscode": false,
        "status1": "Buchbar ab 05.05.2026",
        "status2": "Viele freie Plätze",
        "statusClass": "status-green",
        "anmeldeschluss": "0001-01-01T00:00:00",
        "bild": "<base64 encoded image>"
      }
    ]
  }
}
```

**Important:** `geoKoordinaten`, `anlageLaengengrad`, and `anlageBreitengrad` are always `0` in the list response. Coordinates are resolved from `kursOrt` via geocoding (seeded from the detail endpoint at build time).

**Status fields:** The API does not return a nested `status` object. Availability is communicated via three flat fields:

| Field             | Type             | Values                                                                                         |
| ----------------- | ---------------- | ---------------------------------------------------------------------------------------------- |
| `hatFreiePlaetze` | `boolean`        | `true` = places available                                                                      |
| `status2`         | `string \| null` | `"Viele freie Plätze"`, `"Wenige freie Plätze"`, `"Buchung auf Warteliste möglich"`, or `null` |
| `statusClass`     | `string \| null` | `"status-green"` (free), `"status-red"` (waitlist), or `null`                                  |

`status2` is authoritative for waitlist state and overrides `hatFreiePlaetze`.

---

### `GET /lookups/init/{type}`

Returns filter option lists. No auth required.

**Types:**

| Type             | Description          | Example values                            |
| ---------------- | -------------------- | ----------------------------------------- |
| `aktivitaet`     | Sport/activity types | `{key: "236842", value: "Fussball"}`      |
| `ferientyp`      | Holiday periods      | `{key: "2", value: "Sommerferien"}`       |
| `ferienwoche`    | Weeks within holiday | `{key: "1", value: "1. Woche"}`           |
| `schulkreis`     | School districts     | `{key: "1", value: "Uto"}`                |
| `kategorie`      | Course categories    | `{key: "2", value: "Sport"}`              |
| `jahrgangferien` | Birth years          | `{key: "5", value: 2012}`                 |
| `geschlecht`     | Gender               | `{key: "3", value: "Mädchen und Knaben"}` |

**Response:**

```json
{
  "statusCode": 22779,
  "success": true,
  "data": [{ "key": "2", "value": "Sommerferien" }]
}
```

Note: `key` is always a string, but `value` is a string for most types and a number for `jahrgangferien`.

---

### `GET /accounts/currentuser`

Returns the current user session. Always returns anonymous/guest state when not logged in. Called on page load by the portal — we don't need this.

---

## Geocoding

Since course coordinates are not available from the API, venue names are geocoded using the swisstopo geocoding API:

```
GET https://api3.geo.admin.ch/rest/services/api/SearchServer
  ?type=locations
  &searchText={kursOrt}+Zürich
  &sr=4326
  &lang=de
  &limit=1
```

Results include `lat` and `lon` in WGS84. Results are cached in SQLite to avoid redundant requests.

---

## Course detail page URL

Individual courses can be linked to on the official portal:

```
https://www.stadt-zuerich.ch/sport-portal/angebot/{angebotId}/{titelUrl}
```

Example: `https://www.stadt-zuerich.ch/sport-portal/angebot/27881/Ab_auf_die_Buehne!`

Example: `https://www.stadt-zuerich.ch/sport-portal/angebot/ferienkurse/Ab_auf_die_Buehne!/27881`
