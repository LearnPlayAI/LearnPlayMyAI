/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^@shared/(.*)$': '<rootDir>/shared/$1',
    '^@/(.*)$': '<rootDir>/client/src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'ESNext',
          moduleResolution: 'node',
          esModuleInterop: true,
          strict: true,
          skipLibCheck: true,
          allowJs: true,
          baseUrl: '.',
          paths: {
            '@shared/*': ['./shared/*'],
          },
        },
      },
    ],
  },
  setupFiles: [
    '<rootDir>/tests/jest.env.setup.ts',
  ],
  testMatch: [
    '**/server/tests/**/*.test.ts',
    '**/tests/**/*.test.ts',
    '**/client/src/tests/**/*.test.ts',
    '**/client/src/tests/**/*.test.tsx',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/dist-cloud/',
    '/dist-onprem/',
  ],
  modulePathIgnorePatterns: [
    '<rootDir>/dist/',
    '<rootDir>/dist-cloud/',
    '<rootDir>/dist-onprem/',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  verbose: true,
  forceExit: true,
  detectOpenHandles: true,
  testTimeout: 30000,
};
