#!/usr/bin/env python3
"""
Collect all route data for Dibba Radar
"""
import json
import time
from route_collector import RouteCollector, ROUTES

def main():
    collector = RouteCollector()
    
    for i, route_config in enumerate(ROUTES):
        print(f"\n=== Processing route {i+1}/{len(ROUTES)}: {route_config['id']} ===")
        
        try:
            # Add delay between requests to be respectful
            if i > 0:
                time.sleep(3)
            
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
                print(f"  Distance: {route_data['distance_km']}km")
                print(f"  Duration: {route_data['duration_min']}min") 
                print(f"  Cameras: {len(route_data['cameras'])}")
                
            else:
                print(f"✗ No data collected for {route_config['id']}")
                
        except Exception as e:
            print(f"✗ Error collecting {route_config['id']}: {e}")
            import traceback
            traceback.print_exc()
            continue
            
    print("\n=== Route data collection complete ===")

if __name__ == "__main__":
    main()