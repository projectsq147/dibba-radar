/**
 * Cloudflare Worker for community speed camera pins API
 * Manages user-submitted camera locations with D1 database
 */

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return corsResponse();
    }

    try {
      const url = new URL(request.url);
      const path = url.pathname;

      // Route requests
      if (path === '/pins' && request.method === 'GET') {
        return await getPins(request, env);
      }
      
      if (path === '/pins' && request.method === 'POST') {
        return await createPin(request, env);
      }
      
      if (path.startsWith('/pins/') && path.endsWith('/confirm') && request.method === 'POST') {
        const pinId = path.split('/')[2];
        return await confirmPin(pinId, request, env);
      }

      return new Response('Not found', { status: 404 });

    } catch (error) {
      console.error('API error:', error);
      return new Response(
        JSON.stringify({ error: 'Internal server error' }), 
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders() }
        }
      );
    }
  },
};

/**
 * GET /pins?route={routeId}
 * Get all confirmed pins for a route
 */
async function getPins(request, env) {
  const url = new URL(request.url);
  const routeId = url.searchParams.get('route');

  if (!routeId) {
    return new Response(
      JSON.stringify({ error: 'Missing route parameter' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
    );
  }

  try {
    // Clean up expired pins first
    await cleanupExpiredPins(env);

    // Get confirmed pins for route
    const { results } = await env.DB.prepare(`
      SELECT id, lat, lon, speed_limit, route, confirmed_count, created_at 
      FROM pins 
      WHERE route = ? AND confirmed_count >= 3 AND created_at > datetime('now', '-90 days')
      ORDER BY created_at DESC
    `).bind(routeId).all();

    return new Response(
      JSON.stringify({ pins: results }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
    );

  } catch (error) {
    console.error('Database error:', error);
    return new Response(
      JSON.stringify({ error: 'Database error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
    );
  }
}

/**
 * POST /pins
 * Create a new pin submission
 */
async function createPin(request, env) {
  try {
    const body = await request.json();
    const { lat, lon, speed_limit, route, deviceId } = body;

    // Validate required fields
    if (!lat || !lon || !route || !deviceId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: lat, lon, route, deviceId' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
      );
    }

    // Validate coordinates are in UAE region
    if (lat < 22 || lat > 27 || lon < 51 || lon > 58) {
      return new Response(
        JSON.stringify({ error: 'Location outside UAE region' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
      );
    }

    // Validate route exists (basic validation)
    const validRoutes = ['dubai-dibba', 'e311-mbz', 'e611-emirates', 'e11-coastal', 'e44-hatta', 'e66-kalba', 'e66-alain'];
    if (!validRoutes.includes(route)) {
      return new Response(
        JSON.stringify({ error: 'Invalid route' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
      );
    }

    // Check for duplicate submissions from same device (within 24h and 100m)
    const { results: duplicates } = await env.DB.prepare(`
      SELECT id FROM pins 
      WHERE device_id = ? 
      AND route = ?
      AND created_at > datetime('now', '-24 hours')
      AND ABS(lat - ?) < 0.001 AND ABS(lon - ?) < 0.001
    `).bind(deviceId, route, lat, lon).all();

    if (duplicates.length > 0) {
      return new Response(
        JSON.stringify({ error: 'Duplicate submission detected' }),
        { status: 409, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
      );
    }

    // Insert new pin
    const pinId = generateId();
    await env.DB.prepare(`
      INSERT INTO pins (id, lat, lon, speed_limit, route, device_id, confirmed_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))
    `).bind(pinId, lat, lon, speed_limit || null, route, deviceId).run();

    return new Response(
      JSON.stringify({ 
        success: true, 
        pin: { id: pinId, lat, lon, speed_limit, route, confirmed_count: 1 }
      }),
      { 
        status: 201,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() } 
      }
    );

  } catch (error) {
    console.error('Create pin error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to create pin' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
    );
  }
}

/**
 * POST /pins/{id}/confirm
 * Confirm an existing pin
 */
async function confirmPin(pinId, request, env) {
  try {
    const body = await request.json();
    const { deviceId } = body;

    if (!deviceId) {
      return new Response(
        JSON.stringify({ error: 'Missing deviceId' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
      );
    }

    // Check if pin exists
    const { results: pins } = await env.DB.prepare(`
      SELECT id, confirmed_count FROM pins WHERE id = ?
    `).bind(pinId).all();

    if (pins.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Pin not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
      );
    }

    // Check if device already confirmed this pin
    const { results: confirmations } = await env.DB.prepare(`
      SELECT id FROM pin_confirmations WHERE pin_id = ? AND device_id = ?
    `).bind(pinId, deviceId).all();

    if (confirmations.length > 0) {
      return new Response(
        JSON.stringify({ error: 'Pin already confirmed by this device' }),
        { status: 409, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
      );
    }

    // Record confirmation
    await env.DB.prepare(`
      INSERT INTO pin_confirmations (id, pin_id, device_id, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `).bind(generateId(), pinId, deviceId).run();

    // Increment confirmation count
    const newCount = pins[0].confirmed_count + 1;
    await env.DB.prepare(`
      UPDATE pins SET confirmed_count = ? WHERE id = ?
    `).bind(newCount, pinId).run();

    return new Response(
      JSON.stringify({ 
        success: true, 
        confirmed_count: newCount
      }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
    );

  } catch (error) {
    console.error('Confirm pin error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to confirm pin' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
    );
  }
}

/**
 * Clean up expired pins (0 confirmations older than 90 days)
 */
async function cleanupExpiredPins(env) {
  try {
    await env.DB.prepare(`
      DELETE FROM pins 
      WHERE confirmed_count = 0 AND created_at < datetime('now', '-90 days')
    `).run();
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}

/**
 * Generate a random ID
 */
function generateId() {
  return crypto.randomUUID();
}

/**
 * CORS headers
 */
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

/**
 * CORS preflight response
 */
function corsResponse() {
  return new Response(null, {
    headers: {
      ...corsHeaders(),
      'Access-Control-Max-Age': '86400',
    },
  });
}