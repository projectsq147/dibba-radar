#!/usr/bin/env python3
"""
Route data collector for Dibba Radar
Collects speed camera data for UAE highway routes using:
- OpenStreetMap Overpass API for speed cameras
- OSRM for route geometry
"""

import requests
import json
import time
from typing import Dict, List, Tuple
import math

class RouteCollector:
    def __init__(self):
        self.overpass_url = "https://overpass-api.de/api/interpreter"
        self.osrm_url = "https://router.project-osrm.org/route/v1/driving"
        
    def haversine_distance(self, lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Calculate distance between two points in meters using haversine formula"""
        R = 6371000  # Earth's radius in meters
        
        lat1_rad = math.radians(lat1)
        lat2_rad = math.radians(lat2)
        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)
        
        a = math.sin(dlat/2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon/2)**2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
        
        return R * c

    def fetch_speed_cameras(self, bbox: Tuple[float, float, float, float]) -> List[Dict]:
        """Fetch speed cameras from Overpass API within bounding box"""
        south, west, north, east = bbox
        
        overpass_query = f"""
        [out:json][timeout:30];
        (
          node["highway"="speed_camera"]({south},{west},{north},{east});
        );
        out geom;
        """
        
        print(f"Querying Overpass API for cameras in bbox: {bbox}")
        
        response = requests.post(
            self.overpass_url,
            data=overpass_query,
            headers={'Content-Type': 'text/plain; charset=utf-8'}
        )
        
        if response.status_code != 200:
            print(f"Overpass API error: {response.status_code}")
            return []
            
        data = response.json()
        
        cameras = []
        for element in data.get('elements', []):
            camera = {
                'lat': element['lat'],
                'lon': element['lon'],
                'speed_limit': element.get('tags', {}).get('maxspeed', '?'),
                'source': 'osm'
            }
            cameras.append(camera)
            
        print(f"Found {len(cameras)} speed cameras")
        return cameras

    def fetch_osrm_route(self, start_lat: float, start_lon: float, 
                        end_lat: float, end_lon: float) -> Dict:
        """Fetch route geometry from OSRM"""
        
        url = f"{self.osrm_url}/{start_lon},{start_lat};{end_lon},{end_lat}?overview=full&geometries=geojson"
        
        print(f"Fetching OSRM route from {start_lat},{start_lon} to {end_lat},{end_lon}")
        
        response = requests.get(url)
        if response.status_code != 200:
            print(f"OSRM error: {response.status_code}")
            return {}
            
        return response.json()

    def point_to_line_distance(self, point_lat: float, point_lon: float, 
                              line_points: List[List[float]]) -> Tuple[float, int, Tuple[float, float]]:
        """
        Find the minimum distance from a point to a line (route)
        Returns: (min_distance_meters, closest_segment_index, (snap_lat, snap_lon))
        """
        min_distance = float('inf')
        closest_idx = 0
        snap_lat, snap_lon = point_lat, point_lon
        
        for i in range(len(line_points) - 1):
            # Current line segment
            lat1, lon1 = line_points[i][1], line_points[i][0]  # GeoJSON is [lon, lat]
            lat2, lon2 = line_points[i + 1][1], line_points[i + 1][0]
            
            # Project point onto line segment
            # Simplified projection - just check distance to both endpoints and midpoint
            distances = [
                self.haversine_distance(point_lat, point_lon, lat1, lon1),
                self.haversine_distance(point_lat, point_lon, lat2, lon2),
                self.haversine_distance(point_lat, point_lon, (lat1+lat2)/2, (lon1+lon2)/2)
            ]
            
            min_seg_dist = min(distances)
            if min_seg_dist < min_distance:
                min_distance = min_seg_dist
                closest_idx = i
                # Use the closest point (simplified)
                if distances[0] < distances[1]:
                    snap_lat, snap_lon = lat1, lon1
                else:
                    snap_lat, snap_lon = lat2, lon2
                    
        return min_distance, closest_idx, (snap_lat, snap_lon)

    def calculate_route_km(self, route_points: List[List[float]], point_index: int) -> float:
        """Calculate cumulative distance along route to given point index"""
        total_distance = 0
        
        for i in range(point_index):
            lat1, lon1 = route_points[i][1], route_points[i][0]
            lat2, lon2 = route_points[i + 1][1], route_points[i + 1][0]
            total_distance += self.haversine_distance(lat1, lon1, lat2, lon2)
            
        return total_distance / 1000.0  # Convert to km

    def snap_cameras_to_route(self, cameras: List[Dict], route_ab: List[List[float]], 
                             route_ba: List[List[float]], threshold_m: float = 750) -> Tuple[List[Dict], List[Dict]]:
        """Snap cameras to route within threshold distance"""
        
        snapped_cameras = []
        offroute_cameras = []
        
        for camera in cameras:
            lat, lon = camera['lat'], camera['lon']
            
            # Check distance to both route directions
            dist_ab, idx_ab, snap_ab = self.point_to_line_distance(lat, lon, route_ab)
            dist_ba, idx_ba, snap_ba = self.point_to_line_distance(lat, lon, route_ba)
            
            min_distance = min(dist_ab, dist_ba)
            
            if min_distance <= threshold_m:
                # Use the closer route
                if dist_ab <= dist_ba:
                    route_km = self.calculate_route_km(route_ab, idx_ab)
                    snap_lat, snap_lon = snap_ab
                    route_idx = idx_ab
                else:
                    route_km = self.calculate_route_km(route_ba, idx_ba)
                    snap_lat, snap_lon = snap_ba
                    route_idx = idx_ba
                
                snapped_camera = camera.copy()
                snapped_camera.update({
                    'snap_lat': snap_lat,
                    'snap_lon': snap_lon,
                    'route_km': round(route_km, 2),
                    'route_idx': route_idx,
                    'snap_m': int(min_distance),
                    'direction': 'both'  # Simplified - assume both directions
                })
                snapped_cameras.append(snapped_camera)
            else:
                offroute_camera = camera.copy()
                offroute_camera['snap_m'] = int(min_distance)
                offroute_cameras.append(offroute_camera)
                
        print(f"Snapped {len(snapped_cameras)} cameras, {len(offroute_cameras)} off-route")
        return snapped_cameras, offroute_cameras

    def collect_route_data(self, route_config: Dict) -> Dict:
        """Main function to collect all route data"""
        
        print(f"\n=== Collecting data for {route_config['name']} ===")
        
        # 1. Fetch speed cameras
        cameras = self.fetch_speed_cameras(route_config['bbox'])
        
        # 2. Fetch route geometry (both directions)
        start = route_config['start']
        end = route_config['end']
        
        route_ab_data = self.fetch_osrm_route(start['lat'], start['lon'], end['lat'], end['lon'])
        route_ba_data = self.fetch_osrm_route(end['lat'], end['lon'], start['lat'], start['lon'])
        
        if not route_ab_data.get('routes') or not route_ba_data.get('routes'):
            print("Failed to get route data from OSRM")
            return {}
            
        route_ab = route_ab_data['routes'][0]['geometry']['coordinates']
        route_ba = route_ba_data['routes'][0]['geometry']['coordinates']
        
        # Convert to [lat, lon] format for consistency
        route_ab_coords = [[coord[1], coord[0]] for coord in route_ab]
        route_ba_coords = [[coord[1], coord[0]] for coord in route_ba]
        
        # 3. Calculate route metrics
        distance_km = route_ab_data['routes'][0]['distance'] / 1000.0
        duration_min = route_ab_data['routes'][0]['duration'] / 60.0
        
        # 4. Snap cameras to route
        snapped_cameras, offroute_cameras = self.snap_cameras_to_route(
            cameras, route_ab, route_ba
        )
        
        # 5. Generate Waze chunks (simplified bounding boxes)
        bbox = route_config['bbox']
        waze_chunks = [
            [bbox[0], bbox[2], bbox[1], bbox[3]]  # [south, north, west, east]
        ]
        
        # 6. Build final data structure
        route_data = {
            'id': route_config['id'],
            'name': route_config['name'],
            'start': route_config['start'],
            'end': route_config['end'],
            'distance_km': round(distance_km, 2),
            'duration_min': round(duration_min),
            'route_ab': route_ab_coords,
            'route_ba': route_ba_coords,
            'cameras': snapped_cameras,
            'cameras_offroute': offroute_cameras,
            'waze_chunks': waze_chunks
        }
        
        print(f"Route stats: {distance_km:.1f}km, {duration_min:.0f}min, {len(snapped_cameras)} cameras")
        
        return route_data

# Route configurations
ROUTES = [
    {
        'id': 'e311-mbz',
        'name': 'E311 Sheikh Mohammed bin Zayed Road (Abu Dhabi to RAK)',
        'start': {'name': 'Al Falah City Abu Dhabi', 'lat': 24.45, 'lon': 54.32},
        'end': {'name': 'RAK City Center', 'lat': 25.79, 'lon': 55.94},
        'bbox': (24.3, 54.2, 25.9, 56.1)  # south, west, north, east
    },
    {
        'id': 'e611-emirates',
        'name': 'E611 Emirates Road (Dubai bypass)',
        'start': {'name': 'Sharjah International Airport', 'lat': 25.33, 'lon': 55.52},
        'end': {'name': 'Jebel Ali Port', 'lat': 25.01, 'lon': 55.06},
        'bbox': (24.9, 55.0, 25.4, 55.6)
    },
    {
        'id': 'e11-coastal',
        'name': 'E11 Sheikh Zayed Road (Abu Dhabi to Fujairah coastal)',
        'start': {'name': 'Abu Dhabi Marina Mall', 'lat': 24.49, 'lon': 54.32},
        'end': {'name': 'Fujairah City Center', 'lat': 25.12, 'lon': 56.33},
        'bbox': (24.4, 54.2, 25.2, 56.5)
    },
    {
        'id': 'e44-hatta',
        'name': 'E44 Dubai-Hatta Road',
        'start': {'name': 'Dubai Festival City', 'lat': 25.22, 'lon': 55.35},
        'end': {'name': 'Hatta Border', 'lat': 24.81, 'lon': 56.13},
        'bbox': (24.7, 55.3, 25.3, 56.2)
    },
    {
        'id': 'e66-kalba',
        'name': 'E66 Sharjah-Kalba Road',
        'start': {'name': 'Sharjah University City', 'lat': 25.31, 'lon': 55.45},
        'end': {'name': 'Kalba Corniche', 'lat': 25.07, 'lon': 56.35},
        'bbox': (25.0, 55.4, 25.4, 56.4)
    },
    {
        'id': 'e66-alain',
        'name': 'E66 Al Ain Road (Dubai to Al Ain)',
        'start': {'name': 'Dubai Academic City', 'lat': 25.11, 'lon': 55.41},
        'end': {'name': 'Al Ain Oasis', 'lat': 24.21, 'lon': 55.76},
        'bbox': (24.1, 55.3, 25.2, 55.8)
    }
]

if __name__ == "__main__":
    collector = RouteCollector()
    
    for route_config in ROUTES:
        try:
            # Add delay between requests to be respectful
            time.sleep(2)
            
            route_data = collector.collect_route_data(route_config)
            
            if route_data:
                # Save JSON file
                json_file = f"/home/runman_/.openclaw/workspace/dibba-radar/data/{route_config['id']}.json"
                with open(json_file, 'w') as f:
                    json.dump(route_data, f, indent=2)
                
                # Save JS file
                js_file = f"/home/runman_/.openclaw/workspace/dibba-radar/data/{route_config['id']}.js"
                js_content = f"""/* Auto-generated route data */
window.DibbaRadar = window.DibbaRadar || {{}};
window.DibbaRadar._routeData = {json.dumps(route_data)};"""
                
                with open(js_file, 'w') as f:
                    f.write(js_content)
                
                print(f"✓ Saved {route_config['id']} data files")
                
        except Exception as e:
            print(f"✗ Error collecting {route_config['id']}: {e}")
            
    print("\n=== Route data collection complete ===")