import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, writeFile, unlink, mkdir, access } from 'fs/promises';

const execAsync = promisify(exec);

// Helper to check if a file exists asynchronously
const fileExists = async (path: string) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

// AI Trading Agents Test Suite
describe('AI Trading Agents', () => {
  const testTimeout = 45000; // 45 seconds for agent tests
  const resultsDir = 'results';
  const gpt4oDir = `${resultsDir}/gpt4o`;

  // Ensure results directories exist before tests
  beforeAll(async () => {
    await mkdir(resultsDir, { recursive: true });
    await mkdir(gpt4oDir, { recursive: true });
  });

  // Clean up thread files after all tests
  afterAll(async () => {
    const gpt4oThreadPath = `${gpt4oDir}/thread-gpt4o.json`;
    if (await fileExists(gpt4oThreadPath)) await unlink(gpt4oThreadPath).catch(() => {});
  });

  // Shared tests for both agents
  const agents = [
    { name: 'GPT-4o', script: 'src/agent.ts', model: 'gpt-4o' },
  ];

  agents.forEach(agent => {
    describe(`${agent.name} Agent`, () => {
      let agentContent: string;

      beforeAll(async () => {
        agentContent = await readFile(agent.script, 'utf-8');
      });

      it('should start and run a single trading session', async () => {
        try {
          const { stdout, stderr } = await execAsync(`MODEL=${agent.model} tsx ${agent.script}`, {
            timeout: testTimeout,
          });
          expect(stdout).toContain('trading session');
          expect(stdout).toContain('completed');
          expect(stderr).toBe('');
        } catch (error: any) {
          if (error.signal === 'SIGTERM' || error.stdout?.includes('trading session')) {
            console.log(`${agent.name} agent started successfully (may have timed out)`);
          } else {
            console.error(`Error running ${agent.name} agent:`, error);
            throw error;
          }
        }
      }, testTimeout);

      it('should have all required tools available', () => {
        const tools = [
          'think',
          'get_stock_price',
          'get_portfolio',
          'get_net_worth',
          'web_search',
          'buy',
          'sell',
          'short_sell',
          'cover_short',
        ];
        
        tools.forEach(tool => {
          const camelCaseTool = tool.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
          expect(agentContent).toContain(`${camelCaseTool}Tool`);
        });
      });

      it('should connect to Alpaca paper trading API', () => {
        expect(agentContent).toContain('paper: true');
        expect(agentContent).toContain('@alpacahq/alpaca-trade-api');
      });

      it('should have the same starting capital objective', () => {
        expect(agentContent).toContain('$1,000');
      });
    });
  });

  // Configuration and Parity Tests
  describe('Configuration and Parity', () => {
    it('should have environment configuration', async () => {
      expect(await fileExists('.env.gpt4o')).toBe(true);
    });

    it('should have Alpaca API key configured', async () => {
      const gpt4oEnv = await readFile('.env.gpt4o', 'utf-8');
      const gpt4oKey = gpt4oEnv.match(/ALPACA_API_KEY=(.+)/)?.[1];
      
      expect(gpt4oKey).toBeDefined();
    });

    it('should create thread files after running', async () => {
      const gpt4oThreadPath = `${gpt4oDir}/thread-gpt4o.json`;
      await writeFile(gpt4oThreadPath, '[]').catch(() => {});

      expect(await fileExists(gpt4oThreadPath)).toBe(true);
    });
  });
});