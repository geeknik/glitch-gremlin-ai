import { jest, beforeEach } from '@jest/globals';

// Set consistent timeout for all tests
jest.setTimeout(30000);

// Use fake timers but allow process.nextTick
jest.useFakeTimers({ doNotFake: ['nextTick'] });

// Reset request count and clear mocks before each test
beforeEach(() => {
    // @ts-expect-error - accessing global mock
    if (global.mockRequestCount) {
        // @ts-expect-error - accessing global mock
        global.mockRequestCount.value = 0;
    }
    jest.clearAllMocks();
});
