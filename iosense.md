# IOsense API Tracking

State across sessions: auth model, API functionIDs used, resource IDs.

## Auth

- **Base URL:** `https://connector.iosense.io`
- **Dev:** SSO token (one-time, 60s TTL) exchanged via `validateSSOToken` → JWT stored in `frontend/.env.local` (`IOSENSE_BEARER_TOKEN`). JWT will expire; re-mint to refresh.
- **Prod:** JWT auto-injected — widgets via `props.authentication`; app/dashboard via `?token=` SSO exchange → `localStorage('bearer_token')`.
- **Org context:** `5b0d386f82d7525268dfbe06` (required `organisation` header on device APIs).
- **User ID:** `68e35dd58144113e8d16502f`

## API functionIDs used

| functionId | Endpoint | Purpose | Status |
|---|---|---|---|
| `validateSSOToken` | `GET /api/retrieve-sso-token/{token}` | Exchange SSO token → JWT + org + userId | ✅ verified 2026-06-19 |
| `findUserDevices` | `PUT /api/account/devices/{skip}/{limit}` | Paginated device list (org has **402** devices) | ✅ verified 2026-06-19 |
| `getWidgetData` | `PUT /api/account/ioLensWidget/getWidgetData` | Bucketed mean aggregation — `timeFrame:"day"` (1-day) & `"week"` + `weekStart:1` (7-day, Mon) | ✅ verified 2026-06-20 |
| `getAutoDownSampledData` | `PUT /api/account/widget/getAutoDownSampledData` | Raw points (downscale:1) for client-side 15-min means | ✅ verified 2026-06-20 |
| `getLastDPsofDevicesAndSensorProcessed` | `PUT /api/account/deviceData/getLastDPsofDevicesAndSensorProcessed` | Latest value per (devID,sensor) for staleness | ✅ verified 2026-06-20 |

**Notes:** data endpoints work with just `Authorization: Bearer <jwt>` (+ `ngsw-bypass`); the `organisation` header is NOT required for them. getWidgetData finest bucket = `hour`, so 15-min averages are computed client-side from raw points.

## Known resources

- **Devices:** 402 total. devType `ST-65 Vibration Asset` (10 sensors each) — e.g. `FLVA_A1717` (BLAST PUMP-1 MOTOR), `FLVA_A1718` (BLAST PUMP-1 PUMP), dewatering pumps, etc.
- **PD monitor devices:** `QTSCM_A1` (Delta 2), `QTSCM_B1` (Sub Station-B4), `QTSCM_C1` (Alpha 2) — devType `Custom Sections`, 675 sensors each.

## PD Monitoring Map (Partial Discharge)

App domain: 4 PD monitor locations. **Ultrasound = internal PD**, **TEV = external PD**.

| Location | devID | Ultrasound (D) | TEV (D) |
|---|---|---|---|
| Alpha2 (Incoming) | `QTSCM_C1` | `D44` | `D45` |
| Alpha2 (Outgoing) | `QTSCM_C1` | `D96` | `D97` |
| Delta 2 | `QTSCM_A1` | `D44` | `D45` |
| Sub Station-B4 | `QTSCM_B1` | `D44` | `D45` |

- Verified live via `getLastDPsofDevicesAndSensorCalibrated` on 2026-06-20 — all 8 pairs return data. Units come back as `.` (unitless).
- ⚠️ `QTSCM_C1` (both Alpha2 locations) last datapoint 2026-05-29 — stale vs A1/B1 (current). Recheck device connectivity.
