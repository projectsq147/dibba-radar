# Dibba Radar Cloudflare Workers Backend

This directory contains the Cloudflare Workers backend for Dibba Radar, providing:

1. **Waze Proxy API** - Proxies requests to Waze Live Map API with CORS and rate limiting
2. **Community Pins API** - Manages user-submitted speed camera locations

## Setup

### Prerequisites
- Cloudflare account with Workers enabled
- Wrangler CLI installed: `npm install -g wrangler`
- D1 database access (part of Workers paid plan)

### 1. Authentication
```bash
wrangler login
```

### 2. Create D1 Database
```bash
# Create production database
wrangler d1 create dibba-radar-pins

# Create development database  
wrangler d1 create dibba-radar-pins-dev
```

Note the database IDs returned and update `wrangler.toml`.

### 3. Initialize Database Schema
```bash
# Development
wrangler d1 execute dibba-radar-pins-dev --file=schema.sql

# Production
wrangler d1 execute dibba-radar-pins --file=schema.sql
```

### 4. Update Configuration
Edit `wrangler.toml` and replace:
- `YOUR_CLOUDFLARE_ACCOUNT_ID` with your account ID
- `YOUR_D1_DATABASE_ID` with the production database ID  
- `YOUR_DEV_D1_DATABASE_ID` with the development database ID
- `YOUR_SUBDOMAIN` with your Workers subdomain

### 5. Deploy Workers

#### Development
```bash
# Deploy to development environment
wrangler deploy --env development waze-proxy.js
wrangler deploy --env development pins-api.js
```

#### Production
```bash
# Deploy to production
wrangler deploy --env production waze-proxy.js  
wrangler deploy --env production pins-api.js
```

## API Endpoints

### Waze Proxy API
- **URL**: `https://api.dibba-radar.app/waze`
- **Method**: GET
- **Parameters**: 
  - `bbox`: Bounding box as "south,west,north,east"
- **Example**: `/waze?bbox=25.1,55.1,25.3,55.3`

### Community Pins API

#### Get Pins
- **URL**: `https://api.dibba-radar.app/pins`
- **Method**: GET
- **Parameters**:
  - `route`: Route ID (e.g., "dubai-dibba")
- **Example**: `/pins?route=dubai-dibba`

#### Submit Pin
- **URL**: `https://api.dibba-radar.app/pins`
- **Method**: POST
- **Body**:
```json
{
  "lat": 25.2086,
  "lon": 55.5549,
  "speed_limit": 120,
  "route": "dubai-dibba",
  "deviceId": "uuid-device-id"
}
```

#### Confirm Pin
- **URL**: `https://api.dibba-radar.app/pins/{pin-id}/confirm`
- **Method**: POST
- **Body**:
```json
{
  "deviceId": "uuid-device-id"
}
```

## Database Management

### View Data
```bash
# List all pins
wrangler d1 execute dibba-radar-pins --command="SELECT * FROM pins;"

# View confirmations
wrangler d1 execute dibba-radar-pins --command="SELECT * FROM pin_confirmations;"
```

### Maintenance
```bash
# Clean up expired pins manually
wrangler d1 execute dibba-radar-pins --command="DELETE FROM pins WHERE confirmed_count = 0 AND created_at < datetime('now', '-90 days');"
```

## Monitoring

Use Cloudflare dashboard to monitor:
- Worker invocations and errors
- D1 database usage
- Rate limiting effectiveness

## Security Notes

1. **Rate Limiting**: Currently simplified - implement proper rate limiting using KV or Durable Objects for production
2. **Device IDs**: Generate UUIDs on client side and store in localStorage
3. **Validation**: Input validation is basic - enhance for production use
4. **CORS**: Currently allows all origins (*) - restrict for production

## Cost Optimization

- Workers: 100,000 requests/day on free plan
- D1: 5GB storage, 25 million row reads/month on paid plan
- Consider caching strategies for frequently accessed data