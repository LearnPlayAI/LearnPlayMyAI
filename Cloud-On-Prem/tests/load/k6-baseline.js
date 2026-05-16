import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');

// Load test configuration
export const options = {
  stages: [
    { duration: '30s', target: 10 },  // Ramp up to 10 users
    { duration: '1m', target: 50 },   // Ramp up to 50 users
    { duration: '2m', target: 100 },  // Ramp up to 100 users
    { duration: '1m', target: 100 },  // Stay at 100 users
    { duration: '30s', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests should be below 500ms
    errors: ['rate<0.1'],              // Error rate should be below 10%
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';

// Test scenarios
export default function () {
  // Test 1: Public endpoints
  testPublicEndpoints();
  sleep(1);
  
  // Test 2: Authentication flow
  testAuthFlow();
  sleep(1);
  
  // Test 3: API endpoints (requires auth)
  // Note: This is a baseline - you'll need real credentials for full testing
}

function testPublicEndpoints() {
  const endpoints = [
    '/api/server-time',
    '/api/leaderboard/10',
    '/api/credit-packages',
  ];
  
  endpoints.forEach(endpoint => {
    const res = http.get(`${BASE_URL}${endpoint}`);
    const success = check(res, {
      [`${endpoint} status is 200`]: (r) => r.status === 200,
      [`${endpoint} responds quickly`]: (r) => r.timings.duration < 200,
    });
    
    errorRate.add(!success);
  });
}

function testAuthFlow() {
  // Test login endpoint exists (will fail without credentials, but tests endpoint availability)
  const loginPayload = JSON.stringify({
    email: 'test@example.com',
    password: 'TestPassword123!',
  });
  
  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };
  
  const res = http.post(`${BASE_URL}/api/auth/login`, loginPayload, params);
  
  // We expect this to fail (invalid credentials), but should get a proper response
  check(res, {
    'login endpoint responds': (r) => r.status === 401 || r.status === 200,
    'login has proper error format': (r) => {
      if (r.status === 401) {
        const body = JSON.parse(r.body);
        return body.error !== undefined;
      }
      return true;
    },
  });
}
