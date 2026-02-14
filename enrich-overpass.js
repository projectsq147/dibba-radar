#!/usr/bin/env node
// Enrich unknown speed cameras with road speed limits from OpenStreetMap via Overpass API
// Strategy: fetch ALL roads with maxspeed in the bounding box, then locally match cameras

const fs = require('fs');
const https = require('https');

const DATA_FILE = 'data/all-cameras.js';
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const SEARCH_RADIUS = 50; // meters
const CACHE_FILE = 'data/overpass-roads-cache.json';

// --- Load data ---
var window = { DibbaRadar: {} };
eval(fs.readFileSync(DATA_FILE, 'utf8'));
const data = window.DibbaRadar._allCameras;

const unknowns = [];
data.cameras.forEach((cam, idx) => {
  if (cam.speed_limit === '?') {
    unknowns.push({ idx, lat: cam.lat, lon: cam.lon });
  }
});

console.log(`Total cameras: ${data.cameras.length}`);
console.log(`Unknown speed_limit: ${unknowns.length}`);

// --- Helpers ---
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function parseMaxspeed(val) {
  if (!val) return null;
  val = val.toString().trim();
  const m = val.match(/^(\d+)\s*(km\/h)?$/);
  if (m) return m[1];
  return null;
}

const ROAD_PRIORITY = { motorway: 1, motorway_link: 2, trunk: 3, trunk_link: 4, primary: 5, primary_link: 6, secondary: 7, tertiary: 8 };

function queryOverpass(queryStr) {
  return new Promise((resolve, reject) => {
    const postData = `data=${encodeURIComponent(queryStr)}`;
    const url = new URL(OVERPASS_URL);
    
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'DibbaRadar-SpeedCameraEnrich/1.0',
      },
      timeout: 120000,
    };
    
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${body.substring(0, 300)}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`JSON parse error: ${e.message}\nBody: ${body.substring(0, 200)}`));
        }
      });
    });
    
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// --- Main ---
async function main() {
  let allWays = [];
  
  // Check cache
  if (fs.existsSync(CACHE_FILE)) {
    console.log('Loading roads from cache...');
    allWays = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    console.log(`Loaded ${allWays.length} ways from cache`);
  } else {
    // Compute bounding box with padding
    const lats = unknowns.map(c => c.lat);
    const lons = unknowns.map(c => c.lon);
    const pad = 0.005; // ~500m padding
    const bbox = `${Math.min(...lats)-pad},${Math.min(...lons)-pad},${Math.max(...lats)+pad},${Math.max(...lons)+pad}`;
    
    console.log(`Bounding box: ${bbox}`);
    
    // Split into grid cells to avoid timeout on large area queries
    const minLat = Math.min(...lats) - pad;
    const maxLat = Math.max(...lats) + pad;
    const minLon = Math.min(...lons) - pad;
    const maxLon = Math.max(...lons) + pad;
    
    // 4x4 grid
    const gridRows = 4;
    const gridCols = 4;
    const latStep = (maxLat - minLat) / gridRows;
    const lonStep = (maxLon - minLon) / gridCols;
    
    const seenIds = new Set();
    let cellNum = 0;
    const totalCells = gridRows * gridCols;
    
    for (let r = 0; r < gridRows; r++) {
      for (let c = 0; c < gridCols; c++) {
        cellNum++;
        const cellBbox = `${(minLat + r*latStep).toFixed(6)},${(minLon + c*lonStep).toFixed(6)},${(minLat + (r+1)*latStep).toFixed(6)},${(minLon + (c+1)*lonStep).toFixed(6)}`;
        
        // Check if any cameras are in this cell (with some margin)
        const cellCams = unknowns.filter(u => 
          u.lat >= minLat + r*latStep - 0.001 && u.lat <= minLat + (r+1)*latStep + 0.001 &&
          u.lon >= minLon + c*lonStep - 0.001 && u.lon <= minLon + (c+1)*lonStep + 0.001
        );
        
        if (cellCams.length === 0) {
          console.log(`Cell ${cellNum}/${totalCells}: no cameras, skipping`);
          continue;
        }
        
        const query = `[out:json][timeout:60];\nway(${cellBbox})["highway"]["maxspeed"];\nout body geom;`;
        
        console.log(`Cell ${cellNum}/${totalCells} (${cellCams.length} cams): querying...`);
        
        let retries = 3;
        while (retries > 0) {
          try {
            const result = await queryOverpass(query);
            const ways = result.elements || [];
            let newWays = 0;
            for (const way of ways) {
              if (!seenIds.has(way.id)) {
                seenIds.add(way.id);
                allWays.push(way);
                newWays++;
              }
            }
            console.log(`  Got ${ways.length} ways (${newWays} new), total: ${allWays.length}`);
            break;
          } catch (err) {
            retries--;
            console.error(`  Error: ${err.message}`);
            if (retries > 0) {
              const waitTime = retries === 2 ? 10000 : 30000;
              console.log(`  Retrying in ${waitTime/1000}s... (${retries} left)`);
              await sleep(waitTime);
            } else {
              console.error(`  Giving up on cell ${cellNum}`);
            }
          }
        }
        
        // Be polite between calls
        await sleep(3000);
      }
    }
    
    // Save cache
    fs.writeFileSync(CACHE_FILE, JSON.stringify(allWays));
    console.log(`\nCached ${allWays.length} ways to ${CACHE_FILE}`);
  }
  
  // --- Match cameras to roads ---
  console.log(`\nMatching ${unknowns.length} cameras against ${allWays.length} roads...`);
  
  let resolved = 0;
  
  for (const cam of unknowns) {
    let candidates = [];
    
    for (const way of allWays) {
      const maxspeed = parseMaxspeed(way.tags?.maxspeed);
      if (!maxspeed) continue;
      
      if (!way.geometry || way.geometry.length === 0) continue;
      
      // Find closest point on way to camera
      let minDist = Infinity;
      for (const node of way.geometry) {
        const d = haversineMeters(cam.lat, cam.lon, node.lat, node.lon);
        if (d < minDist) minDist = d;
      }
      
      if (minDist <= SEARCH_RADIUS) {
        const hwType = way.tags?.highway || 'other';
        const priority = ROAD_PRIORITY[hwType] || 10;
        candidates.push({ maxspeed, dist: minDist, priority, hwType, name: way.tags?.name });
      }
    }
    
    if (candidates.length > 0) {
      candidates.sort((a, b) => a.priority - b.priority || a.dist - b.dist);
      data.cameras[cam.idx].speed_limit = candidates[0].maxspeed;
      resolved++;
    }
  }
  
  console.log(`\n=== Results ===`);
  console.log(`Resolved: ${resolved} / ${unknowns.length}`);
  console.log(`Still unknown: ${unknowns.length - resolved}`);
  
  // Speed limit distribution
  const speedDist = {};
  data.cameras.forEach(c => {
    const key = c.speed_limit;
    speedDist[key] = (speedDist[key] || 0) + 1;
  });
  console.log('\nSpeed limit distribution:');
  Object.entries(speedDist).sort((a,b) => b[1] - a[1]).forEach(([k, v]) => {
    console.log(`  ${k}: ${v}`);
  });
  
  // Write back
  const camerasJson = JSON.stringify({ cameras: data.cameras, segments: data.segments });
  const output = `/* All UAE speed cameras - combined dataset */\nwindow.DibbaRadar = window.DibbaRadar || {};\nwindow.DibbaRadar._allCameras = ${camerasJson};\n`;
  fs.writeFileSync(DATA_FILE, output);
  console.log(`\nWritten updated ${DATA_FILE}`);
  
  const remaining = data.cameras.filter(c => c.speed_limit === '?').length;
  console.log(`Remaining unknown: ${remaining}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
