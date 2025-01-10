import { jest } from '@jest/globals';

// Set consistent timeout for all tests
jest.setTimeout(30000);

// Use fake timers but allow process.nextTick
jest.useFakeTimers({ doNotFake: ['nextTick'] });
