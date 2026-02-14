#!/usr/bin/env python3
"""
Test single route collection for debugging
"""
import sys
sys.path.append('.')
from route_collector import RouteCollector

# Test E311 route
route_config = {
    'id': 'e311-mbz',
    'name': 'E311 Sheikh Mohammed bin Zayed Road (Abu Dhabi to RAK)',
    'start': {'name': 'Al Falah City Abu Dhabi', 'lat': 24.45, 'lon': 54.32},
    'end': {'name': 'RAK City Center', 'lat': 25.79, 'lon': 55.94},
    'bbox': (24.3, 54.2, 25.9, 56.1)  # south, west, north, east
}

collector = RouteCollector()

print("Testing single route collection...")
try:
    route_data = collector.collect_route_data(route_config)
    if route_data:
        print("Success!")
        print(f"Route: {route_data['name']}")
        print(f"Distance: {route_data['distance_km']} km")
        print(f"Duration: {route_data['duration_min']} min")
        print(f"Cameras: {len(route_data['cameras'])}")
    else:
        print("Failed to collect route data")
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()