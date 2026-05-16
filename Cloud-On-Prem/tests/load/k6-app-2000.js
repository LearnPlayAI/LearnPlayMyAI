import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Rate } from 'k6/metrics';

const errors = new Rate('errors');
const BASE_URL = __ENV.BASE_URL || 'https://stcloud.learnplay.co.za';
const VARIANT = (__ENV.VARIANT || 'cloud').toLowerCase();
const USER_CSV = resolveUserCsvPath(__ENV.USER_CSV, VARIANT);
const LOAD_PROFILE = (__ENV.LOAD_PROFILE || 'default').toLowerCase();
const ONPREM_SYSTEM_TYPE = (__ENV.ONPREM_SYSTEM_TYPE || 'production').toLowerCase();
const K6_INSECURE_TLS = (__ENV.K6_INSECURE_TLS || 'false').toLowerCase() === 'true';

function resolveUserCsvPath(envPath, variant) {
  const fallback = `data/users-${variant}.csv`;
  if (!envPath) {
    return fallback;
  }
  if (envPath.startsWith('tests/load/')) {
    return envPath.slice('tests/load/'.length);
  }
  return envPath;
}

const users = new SharedArray('users', function () {
  const raw = open(USER_CSV).trim().split('\n');
  const rows = raw.slice(1);
  return rows.map((line) => {
    const [email, password, role] = line.split(',');
    return { email, password, role };
  });
});

const rolePaths = {
  student: [
    '/api/auth/user',
    '/api/user-status',
    '/api/my-courses',
    '/api/my-assigned-courses',
    '/api/courses',
    '/api/quiz/assigned',
    '/api/quiz/my-progress',
    '/api/gamification/dashboard',
    '/api/gamification/challenges',
    '/api/notifications/unread-count',
  ],
  teacher: [
    '/api/auth/user',
    '/api/user-status',
    '/api/my-courses',
    '/api/courses',
    '/api/organization/units',
    '/api/organization/unit-subjects',
    '/api/quiz/assigned',
    '/api/quiz/my-progress',
    '/api/gamification/dashboard',
  ],
  org_admin: [
    '/api/auth/user',
    '/api/user-status',
    '/api/my-courses',
    '/api/courses',
    '/api/organization/units',
    '/api/organization/unit-subjects',
    '/api/notifications',
    '/api/notifications/unread-count',
  ],
};

const defaultStages = [
  { duration: '3m', target: 200 },
  { duration: '3m', target: 500 },
  { duration: '4m', target: 1000 },
  { duration: '4m', target: 1500 },
  { duration: '6m', target: 2000 },
  { duration: '45m', target: 2000 },
  { duration: '10m', target: 0 },
];

const shortStages = [
  { duration: '20s', target: 100 },
  { duration: '20s', target: 250 },
  { duration: '30s', target: 500 },
  { duration: '40s', target: 500 },
  { duration: '20s', target: 0 },
];

const stages = LOAD_PROFILE === 'short' ? shortStages : defaultStages;
const profileTag = LOAD_PROFILE === 'short' ? 'short' : 'default';
const thresholds =
  LOAD_PROFILE === 'short'
    ? {
        // Short profile is for rapid functional/concurrency regression checks in dev waves.
        errors: ['rate<0.05'],
        http_req_failed: ['rate<0.05'],
        http_req_duration: ['p(95)<30000'],
      }
    : {
        errors: ['rate<0.01'],
        http_req_failed: ['rate<0.02'],
        http_req_duration: ['p(95)<1500'],
      };

export const options = {
  insecureSkipTLSVerify: K6_INSECURE_TLS,
  scenarios: {
    app_mix: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages,
      gracefulRampDown: '1m',
      tags: {
        load_profile: profileTag,
      },
    },
  },
  thresholds,
};

function isOnpremLearnerLoginExpectedToBeBlocked(userRole) {
  return VARIANT === 'onprem' && ONPREM_SYSTEM_TYPE !== 'production' && userRole === 'student';
}

function login(email, password, userRole) {
  const responseCallback = isOnpremLearnerLoginExpectedToBeBlocked(userRole)
    ? http.expectedStatuses(403)
    : http.expectedStatuses(200);
  const res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email, password }),
    {
      headers: { 'Content-Type': 'application/json' },
      responseCallback,
    },
  );

  return res;
}

function isExpectedOnpremStudentBlock(user, loginResponse) {
  return (
    VARIANT === 'onprem' &&
    ONPREM_SYSTEM_TYPE !== 'production' &&
    user.role === 'student' &&
    loginResponse.status === 403
  );
}

function hasSessionCookie(cookies) {
  if (!cookies) {
    return false;
  }
  return Object.keys(cookies).some((name) => name === 'connect.sid' || name.endsWith('.sid'));
}

function loginWithRetry(user, maxAttempts = 2) {
  let lastResponse = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = login(user.email, user.password, user.role);
    lastResponse = response;

    if (isExpectedOnpremStudentBlock(user, response)) {
      return response;
    }

    if (response.status === 200 && hasSessionCookie(response.cookies)) {
      return response;
    }
  }
  return lastResponse;
}

function pickPath(role) {
  const list = rolePaths[role] || rolePaths.student;
  return list[Math.floor(Math.random() * list.length)];
}

function withVariantPath(basePath) {
  if (VARIANT === 'onprem' && Math.random() < 0.02) {
    return '/api/onprem/license/status';
  }
  if (VARIANT === 'cloud' && Math.random() < 0.02) {
    return '/api/organizations/current';
  }
  return basePath;
}

export default function () {
  const user = users[__VU % users.length];
  const loginResponse = loginWithRetry(user);

  if (isExpectedOnpremStudentBlock(user, loginResponse)) {
    check(loginResponse, {
      'login policy block handled': (r) => r.status === 403,
    });
    errors.add(0);
    sleep(Math.random() * 2 + 1);
    return;
  }

  check(loginResponse, {
    'login status 200': (r) => r.status === 200,
  });

  if (loginResponse.status !== 200 || !hasSessionCookie(loginResponse.cookies)) {
    errors.add(1);
    sleep(Math.random() * 2 + 1);
    return;
  }

  const path = withVariantPath(pickPath(user.role));
  const res = http.get(`${BASE_URL}${path}`, {
    cookies: loginResponse.cookies,
    headers: { Accept: 'application/json' },
    responseCallback: http.expectedStatuses({ min: 200, max: 499 }),
  });

  const ok = check(res, {
    'request success': (r) => r.status >= 200 && r.status < 500,
    'not 5xx': (r) => r.status < 500,
  });
  errors.add(!ok);

  sleep(Math.random() * 3 + 2);
}
