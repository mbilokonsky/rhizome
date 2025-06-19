// Set up environment variables for tests
process.env.DEBUG = 'rz:*';

// Extend the global Jest namespace
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeWithinRange(a: number, b: number): R;
    }
  }
}

// Add any global test setup here

// This is a placeholder test to satisfy Jest's requirement for at least one test
describe('Test Setup', () => {
  it('should pass', () => {
    expect(true).toBe(true);
  });
});

export {}; // This file needs to be a module
