import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Rate } from 'k6/metrics';

const errors = new Rate('errors');
const BASE_URL = __ENV.BASE_URL || 'https://stcloud.learnplay.co.za';

// Represents Pillar 3: Heavy read/write load on the course builder architecture.
export const options = {
  insecureSkipTLSVerify: true,
  scenarios: {
    // Read-Heavy Scenario: Students flooding the lesson viewer
    lesson_reads: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 500 }, // Ramping up to 500 concurrent students reading
        { duration: '1m', target: 1000 },
        { duration: '20s', target: 0 },
      ],
      gracefulRampDown: '30s',
      exec: 'readLessons',
    },
    // Write-Heavy Scenario: Students submitting quizzes concurrently
    quiz_submissions: {
      executor: 'constant-arrival-rate',
      rate: 50, // 50 submissions per second
      timeUnit: '1s',
      duration: '1m',
      preAllocatedVUs: 100,
      maxVUs: 500,
      exec: 'submitQuizzes',
    }
  },
  thresholds: {
    'http_req_duration{scenario:lesson_reads}': ['p(95)<1500'], // 95% reads under 1.5s
    'http_req_duration{scenario:quiz_submissions}': ['p(95)<2500'], // Writes take slightly longer
    'errors': ['rate<0.02'], // Max 2% error rate tolerance
  },
};

// Dummy auth bypass or pre-fetched token required for real endpoints
const headers = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer DUMMY_LOAD_TOKEN', // Requires active seed token in environment
};

export function readLessons() {
  // Simulate fetching a lesson and its translations
  const res = http.get(`${BASE_URL}/api/courses/1/lessons/10`, { headers });
  
  const ok = check(res, {
    'lesson read status is 2xx': (r) => r.status >= 200 && r.status < 300,
  });
  errors.add(!ok);

  sleep(Math.random() * 2 + 1); // User read time
}

export function submitQuizzes() {
  const payload = JSON.stringify({
    lessonId: 10,
    answers: { "q1": "A", "q2": "B", "q3": "C" }
  });

  const res = http.post(`${BASE_URL}/api/quiz/submit`, payload, { headers });
  
  const ok = check(res, {
    'quiz submit status is 200 or 201': (r) => r.status === 200 || r.status === 201,
  });
  errors.add(!ok);

  sleep(1);
}
