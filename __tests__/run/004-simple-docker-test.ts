import Docker from 'dockerode';
import { describe, it, beforeAll, afterAll, expect } from '@jest/globals';
import Debug from 'debug';

const debug = Debug('rz:test:docker-smoke');

// Simple test to verify Docker is working
describe('Docker Smoke Test', () => {
  let docker: Docker;
  let container: any;

  
});
