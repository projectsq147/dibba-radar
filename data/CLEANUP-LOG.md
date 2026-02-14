# Dibba Radar Data Cleanup Log

**Date:** 2026-02-14

## Summary

| Metric | Count |
|--------|-------|
| Total cameras before | 1041 |
| Total cameras after | 1014 |
| Duplicates removed (within 15m) | 27 |
| 10 km/h errors fixed | 12 |
| Unknown speed limits inferred | 101 |
| Out-of-bounds removed | 0 |

## Speed Limit Distribution After Cleanup

| Limit | Count |
|-------|-------|
| 40 | 2 |
| 60 | 36 |
| 70 | 22 |
| 80 | 122 |
| 90 | 16 |
| 100 | 95 |
| 110 | 26 |
| 120 | 141 |
| 130 | 35 |
| 140 | 127 |
| ? | 392 |

## Notes

- Duplicates: cameras within 15m of each other; kept the one with a numeric speed limit when possible.
- 10 km/h fixes: OSM tagging errors on highways corrected using nearby camera consensus (within 2km).
- Unknown inference: used 3 nearest cameras within 3km with bearing alignment (within 15 degrees) to infer limits.
- Coordinates validated against UAE bounding box (lat 22.0-26.5, lon 51.0-56.5).
- Cameras sorted by latitude descending, then longitude ascending.
- Segments array was NOT modified.
