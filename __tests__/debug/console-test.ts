// Simple test to check if console output works in Jest
console.log('=== CONSOLE LOG TEST ===');
console.log('This is a test log message');
console.error('This is a test error message');
console.warn('This is a test warning message');

describe('Console Test', () => {
  it('should output to console', () => {
    console.log('Test log from inside test');
    expect(true).toBe(true);
  });
});
