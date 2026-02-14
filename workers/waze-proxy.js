/**
 * Cloudflare Worker for proxying Waze Live Map API requests
 * Provides CORS headers and rate limiting
 */

const WAZE_BASE_URL = 'https://www.waze.com/live-map/api/georss';
const RATE_LIMIT_WINDOW = 10000; // 10 seconds
const MAX_REQUESTS_PER_IP = 1;

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Only allow GET requests
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      // Extract parameters from URL
      const url = new URL(request.url);
      const bbox = url.searchParams.get('bbox'); // expected: "south,west,north,east"
      
      if (!bbox) {
        return new Response('Missing bbox parameter', { status: 400 });
      }

      // Validate bbox format
      const coords = bbox.split(',').map(parseFloat);
      if (coords.length !== 4 || coords.some(isNaN)) {
        return new Response('Invalid bbox format. Expected: south,west,north,east', { status: 400 });
      }

      const [south, west, north, east] = coords;
      
      // Basic bounds validation for UAE
      if (south < 22 || north > 27 || west < 51 || east > 58) {
        return new Response('Bbox outside UAE region', { status: 400 });
      }

      // Rate limiting using CF's edge cache
      const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
      const rateLimitKey = `waze-rate-limit:${clientIP}`;
      
      // Check rate limit (simplified - in production you'd use KV or Durable Objects)
      const rateLimit = await checkRateLimit(rateLimitKey, env);
      if (!rateLimit.allowed) {
        return new Response('Rate limit exceeded', { 
          status: 429,
          headers: {
            'Retry-After': '10',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      // Construct Waze API URL
      // Note: Waze's actual georss endpoint may require different parameters
      // This is a simplified example - you may need to adjust based on actual API
      const wazeUrl = `${WAZE_BASE_URL}?bbox=${bbox}&format=json`;

      // Fetch from Waze
      const wazeResponse = await fetch(wazeUrl, {
        headers: {
          'User-Agent': 'DibbaRadar/1.0 (+https://dibba-radar.app)',
          'Accept': 'application/json',
        },
        timeout: 10000,
      });

      if (!wazeResponse.ok) {
        console.error(`Waze API error: ${wazeResponse.status}`);
        return new Response('Waze API unavailable', { 
          status: 502,
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      }

      const wazeData = await wazeResponse.json();
      
      // Clean and filter the response
      const cleanedData = cleanWazeResponse(wazeData);

      return new Response(JSON.stringify(cleanedData), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Cache-Control': 'public, max-age=60', // Cache for 1 minute
        },
      });

    } catch (error) {
      console.error('Waze proxy error:', error);
      return new Response('Internal server error', { 
        status: 500,
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }
  },
};

/**
 * Basic rate limiting check
 * In production, use KV storage or Durable Objects for persistent rate limiting
 */
async function checkRateLimit(key, env) {
  // Simplified rate limiting - in production use KV or DO
  // For now, always allow (would need proper storage for real rate limiting)
  return { allowed: true, remaining: MAX_REQUESTS_PER_IP - 1 };
}

/**
 * Clean and filter Waze response data
 */
function cleanWazeResponse(wazeData) {
  // Extract relevant alert/incident data
  const cleanedAlerts = [];
  
  if (wazeData.alerts) {
    for (const alert of wazeData.alerts) {
      // Only include relevant alert types
      if (['POLICE', 'SPEED_CAMERA', 'ACCIDENT', 'HAZARD'].includes(alert.type)) {
        cleanedAlerts.push({
          id: alert.id || alert.uuid,
          type: alert.type,
          lat: alert.location?.y,
          lon: alert.location?.x,
          speed: alert.speed,
          description: alert.description,
          confidence: alert.confidence,
          timestamp: alert.pubMillis,
          reports: alert.nThumbsUp || 0
        });
      }
    }
  }

  return {
    alerts: cleanedAlerts,
    timestamp: Date.now(),
    source: 'waze'
  };
}