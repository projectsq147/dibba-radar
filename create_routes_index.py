#!/usr/bin/env python3
"""
Create routes index from collected route data
"""
import json
import glob
import os

def create_routes_index():
    """Generate routes-index.json from all route data files"""
    
    data_dir = "/home/runman_/.openclaw/workspace/dibba-radar/data"
    routes = []
    
    # Find all JSON route files (except routes-index.json)
    json_files = glob.glob(f"{data_dir}/*.json")
    json_files = [f for f in json_files if not f.endswith("routes-index.json")]
    
    print(f"Found {len(json_files)} route data files")
    
    for json_file in sorted(json_files):
        try:
            with open(json_file, 'r') as f:
                route_data = json.load(f)
            
            # Extract metadata
            route_info = {
                "id": route_data["id"],
                "name": route_data["name"], 
                "shortName": route_data["name"].split("(")[0].strip() if "(" in route_data["name"] else route_data["name"],
                "start": route_data["start"],
                "end": route_data["end"],
                "distance_km": route_data["distance_km"],
                "duration_min": route_data["duration_min"],
                "cameras": len(route_data["cameras"]),
                "dataFile": route_data["id"]
            }
            
            routes.append(route_info)
            print(f"✓ {route_info['id']}: {route_info['distance_km']}km, {route_info['cameras']} cameras")
            
        except Exception as e:
            print(f"✗ Error processing {json_file}: {e}")
            continue
    
    # Sort routes by distance (longest first)
    routes.sort(key=lambda x: x["distance_km"], reverse=True)
    
    # Create index structure
    routes_index = {
        "routes": routes,
        "summary": {
            "total_routes": len(routes),
            "total_cameras": sum(r["cameras"] for r in routes),
            "total_distance_km": round(sum(r["distance_km"] for r in routes), 1),
            "generated_at": "2024-02-14T10:16:00Z"
        }
    }
    
    # Save to file
    index_file = f"{data_dir}/routes-index.json"
    with open(index_file, 'w') as f:
        json.dump(routes_index, f, indent=2)
    
    print(f"\n✓ Created routes index: {index_file}")
    print(f"  Total routes: {routes_index['summary']['total_routes']}")
    print(f"  Total cameras: {routes_index['summary']['total_cameras']}")
    print(f"  Total distance: {routes_index['summary']['total_distance_km']} km")
    
    return routes_index

if __name__ == "__main__":
    create_routes_index()