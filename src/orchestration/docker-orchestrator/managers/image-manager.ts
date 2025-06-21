import Docker, { DockerOptions } from 'dockerode';
import * as path from 'path';
import { promises as fs } from 'fs';
import * as tar from 'tar-fs';
import { Headers } from 'tar-fs';
import { IImageManager } from './interfaces';
import Debug from 'debug';

const debug = Debug('rz:docker:image-manager');

// Global promise to track test image build
let testImageBuildPromise: Promise<void> | null = null;

export class ImageManager implements IImageManager {
  private docker: Docker;

  constructor() {
    this.docker = new Docker();
  }

  /**
   * Build a test Docker image if it doesn't exist
   */
  async buildTestImage(imageName: string = 'rhizome-node-test'): Promise<void> {
    if (testImageBuildPromise) {
      debug('Test image build in progress, reusing existing build promise...');
      return testImageBuildPromise;
    }

    debug('Building test Docker image...');
    const dockerfilePath = path.join(process.cwd(), 'Dockerfile.test');
    
    // Verify Dockerfile exists
    try {
      await fs.access(dockerfilePath);
      debug(`Found Dockerfile at: %s`, dockerfilePath);
    } catch (err) {
      throw new Error(`Dockerfile not found at ${dockerfilePath}: ${err}`);
    }
    
    // Create a tar archive of the build context
    const tarStream = tar.pack(process.cwd(), {
      entries: [
        'Dockerfile.test', 
        'package.json',
        'package-lock.json',
        'tsconfig.json',
        'src/',
        'markdown/',
        'util',
        'examples/',
        'README.md',
      ],
      map: (header: Headers) => {
        // Ensure Dockerfile is named 'Dockerfile' in the build context
        if (header.name === 'Dockerfile.test') {
          header.name = 'Dockerfile';
        }
        return header;
      }
    });
    
    debug('Created build context tar stream');
    
    testImageBuildPromise = new Promise<void>((resolve, reject) => {
      const log = (...args: any[]) => {
        const message = args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ');
        debug(message);
      };
      
      this.docker.buildImage(tarStream, { t: imageName }, (err, stream) => {
        if (err) {
          const errorMsg = `❌ Error starting Docker build: ${err.message}`;
          log(errorMsg);
          return reject(new Error(errorMsg));
        }
        
        if (!stream) {
          const error = new Error('No build stream returned from Docker');
          log(`❌ ${error.message}`);
          return reject(error);
        }
        
        log('✅ Docker build started, streaming output...');
        
        // Handle build output
        let output = '';
        stream.on('data', (chunk: Buffer) => {
          const chunkStr = chunk.toString();
          output += chunkStr;
          
          try {
            // Try to parse as JSON (Docker build output is typically JSONL)
            const lines = chunkStr.split('\n').filter(Boolean);
            for (const line of lines) {
              try {
                if (!line.trim()) continue;
                
                const json = JSON.parse(line);
                if (json.stream) {
                  const message = `[Docker Build] ${json.stream}`.trim();
                  log(message);
                } else if (json.error) {
                  const errorMsg = json.error.trim() || 'Unknown error during Docker build';
                  log(`❌ ${errorMsg}`);
                  reject(new Error(errorMsg));
                  return;
                } else if (Object.keys(json).length > 0) {
                  // Log any other non-empty JSON objects
                  log(`[Docker Build] ${JSON.stringify(json)}`);
                }
              } catch (e) {
                // If not JSON, log as plain text if not empty
                if (line.trim()) {
                  log(`[Docker Build] ${line}`);
                }
              }
            }
          } catch (e) {
            const errorMsg = `Error processing build output: ${e}\nRaw output: ${chunkStr}`;
            log(`❌ ${errorMsg}`);
            debug('Docker build error: %s', errorMsg);
          }
        });
        
        stream.on('end', () => {
          log('✅ Docker build completed successfully');
          resolve();
        });
        
        stream.on('error', (err: Error) => {
          const errorMsg = `❌ Docker build failed: ${err.message}\nBuild output so far: ${output}`;
          log(errorMsg);
          reject(new Error(errorMsg));
        });
      });
    });
  }
}
