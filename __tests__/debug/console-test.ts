import Debug from 'debug';

// Set up debug instances for different log levels
const debug = Debug('rz:test:console');
const debugError = Debug('rz:test:console:error');
const debugWarn = Debug('rz:test:console:warn');

// Test debug output
// Note: These will only show if DEBUG=rz:* is set in the environment
debug('=== DEBUG LOG TEST ===');
debug('This is a test debug message');
debugError('This is a test error message');
debugWarn('This is a test warning message');

describe('Debug Test', () => {
  it('should output debug messages when DEBUG is enabled', () => {
    debug('Test debug message from inside test');
    expect(true).toBe(true);
  });
});
