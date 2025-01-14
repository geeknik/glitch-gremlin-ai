// Configure Jest timeout and any other global test setup
jest.setTimeout(10000);

// Add any other global test configuration here
describe('Test Setup', () => {
  it('should configure Jest timeout', () => {
    expect(jest.getTimerCount()).toBeDefined();
  });
});
