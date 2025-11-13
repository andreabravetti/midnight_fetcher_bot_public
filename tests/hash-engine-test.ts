/**
 * Hash Engine Integration Tests
 * Run these tests before and after optimizations to ensure correctness
 */

import { HashClient } from '../lib/hash/client';
import axios from 'axios';

const HASH_SERVICE_URL = 'http://127.0.0.1:9001';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration?: number;
}

class HashEngineTests {
  private client: HashClient;
  private results: TestResult[] = [];

  constructor() {
    this.client = new HashClient(HASH_SERVICE_URL);
  }

  async runAll(): Promise<void> {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('Hash Engine Integration Tests');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Test 1: Health Check (basic connectivity)
    await this.test('Health Check', async () => {
      try {
        const response = await axios.get(`${HASH_SERVICE_URL}/health`);
        if (response.status !== 200) {
          throw new Error(`Health endpoint returned ${response.status}`);
        }
      } catch (error: any) {
        throw new Error(`Cannot connect to hash service: ${error.message}`);
      }
    });

    // Test 2: ROM Initialization
    await this.test('ROM Initialization', async () => {
      const noPreMine = '0'.repeat(128); // 64 bytes in hex
      await this.client.init(noPreMine);

      const ready = await this.client.isRomReady();
      if (!ready) throw new Error('ROM not initialized');
    });

    // Test 3: Single Hash Computation
    await this.test('Single Hash Computation', async () => {
      const preimage = 'test_preimage_12345';
      const hash = await this.client.hash(preimage);

      if (!hash || hash.length !== 128) {
        throw new Error(`Invalid hash length: ${hash?.length}`);
      }

      // Verify deterministic - same input should give same output
      const hash2 = await this.client.hash(preimage);
      if (hash !== hash2) {
        throw new Error('Hash is not deterministic');
      }
    });

    // Test 4: Batch Hashing
    await this.test('Batch Hashing (100 preimages)', async () => {
      const preimages = Array.from({ length: 100 }, (_, i) =>
        `test_preimage_batch_${i}`
      );

      const hashes = await this.client.hashBatch(preimages);

      if (hashes.length !== preimages.length) {
        throw new Error(`Expected ${preimages.length} hashes, got ${hashes.length}`);
      }

      // Verify all hashes are valid
      for (const hash of hashes) {
        if (!hash || hash.length !== 128) {
          throw new Error(`Invalid hash in batch: ${hash}`);
        }
      }

      // Verify deterministic
      const hashes2 = await this.client.hashBatch(preimages);
      for (let i = 0; i < hashes.length; i++) {
        if (hashes[i] !== hashes2[i]) {
          throw new Error(`Batch hashing not deterministic at index ${i}`);
        }
      }
    });

    // Test 5: CPU Mode Switching
    await this.test('CPU Mode - Normal', async () => {
      const response = await this.client.setCpuMode('normal');
      if (response.mode !== 'normal') {
        throw new Error(`Expected mode 'normal', got '${response.mode}'`);
      }
      if (response.thread_count < 1) {
        throw new Error(`Invalid thread count: ${response.thread_count}`);
      }
    });

    await this.test('CPU Mode - Max', async () => {
      const response = await this.client.setCpuMode('max');
      if (response.mode !== 'max') {
        throw new Error(`Expected mode 'max', got '${response.mode}'`);
      }
      if (response.thread_count < 1) {
        throw new Error(`Invalid thread count: ${response.thread_count}`);
      }
    });

    // Test 6: Stats Endpoint
    await this.test('Statistics Retrieval', async () => {
      const stats = await this.client.getStats();

      if (typeof stats.total_hashes !== 'number') {
        throw new Error('Invalid total_hashes');
      }
      if (typeof stats.hash_rate !== 'number') {
        throw new Error('Invalid hash_rate');
      }
      if (typeof stats.cpu_mode !== 'string') {
        throw new Error('Invalid cpu_mode');
      }
    });

    // Test 7: Parallel Batch Performance
    await this.test('Parallel Batch Processing (500 hashes)', async () => {
      const preimages = Array.from({ length: 500 }, (_, i) =>
        `performance_test_${i}`
      );

      const startTime = Date.now();
      const hashes = await this.client.hashBatch(preimages);
      const duration = Date.now() - startTime;

      if (hashes.length !== preimages.length) {
        throw new Error(`Expected ${preimages.length} hashes, got ${hashes.length}`);
      }

      const hashRate = Math.floor((preimages.length / duration) * 1000);
      console.log(`      Hash rate: ${hashRate} H/s`);
      console.log(`      Duration: ${duration}ms`);
    });

    // Test 8: Mining Endpoint (small batch)
    await this.test('Mining Endpoint (small batch)', async () => {
      const mineRequest = {
        worker_id: 999,
        address: 'addr_test1qz123456789abcdef',
        challenge: {
          challenge_id: 'test_challenge',
          difficulty: '00FFFFFF' + 'FF'.repeat(28), // Easy difficulty (2 bytes)
          no_pre_mine: '0'.repeat(128),
          latest_submission: '0'.repeat(128),
          no_pre_mine_hour: '0'.repeat(128),
        },
        batch_size: 1000, // Small batch for testing
        nonce_start: '0',
      };

      const response = await this.client.mineBatch(mineRequest);

      if (typeof response.hashes_computed !== 'number') {
        throw new Error('Invalid hashes_computed');
      }
      if (!Array.isArray(response.solutions)) {
        throw new Error('Invalid solutions array');
      }

      // With easy difficulty, we should find at least one solution in 1000 hashes
      console.log(`      Solutions found: ${response.solutions.length}`);
      console.log(`      Hashes computed: ${response.hashes_computed}`);
    });

    // Test 9: Hash Consistency Across Multiple Calls
    await this.test('Hash Consistency (1000 iterations)', async () => {
      const testPreimage = 'consistency_test_preimage';
      const referenceHash = await this.client.hash(testPreimage);

      // Test 1000 times
      for (let i = 0; i < 1000; i++) {
        const hash = await this.client.hash(testPreimage);
        if (hash !== referenceHash) {
          throw new Error(`Hash mismatch at iteration ${i}`);
        }
      }
    });

    // Test 10: Large Batch Stress Test
    await this.test('Large Batch Stress Test (5000 hashes)', async () => {
      const preimages = Array.from({ length: 5000 }, (_, i) =>
        `stress_test_${i}_${Math.random()}`
      );

      const startTime = Date.now();
      const hashes = await this.client.hashBatch(preimages);
      const duration = Date.now() - startTime;

      if (hashes.length !== preimages.length) {
        throw new Error(`Expected ${preimages.length} hashes, got ${hashes.length}`);
      }

      // Verify all unique
      const uniqueHashes = new Set(hashes);
      if (uniqueHashes.size !== hashes.length) {
        throw new Error('Duplicate hashes found');
      }

      const hashRate = Math.floor((preimages.length / duration) * 1000);
      console.log(`      Hash rate: ${hashRate} H/s`);
      console.log(`      Duration: ${duration}ms`);
    });

    // Print Summary
    this.printSummary();
  }

  private async test(name: string, testFn: () => Promise<void>): Promise<void> {
    process.stdout.write(`Testing: ${name}... `);

    const startTime = Date.now();
    try {
      await testFn();
      const duration = Date.now() - startTime;
      console.log(`✅ PASSED (${duration}ms)`);
      this.results.push({ name, passed: true, duration });
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.log(`❌ FAILED (${duration}ms)`);
      console.log(`   Error: ${error.message}`);
      this.results.push({ name, passed: false, error: error.message, duration });
    }
  }

  private printSummary(): void {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('Test Summary');
    console.log('═══════════════════════════════════════════════════════════');

    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    const totalDuration = this.results.reduce((sum, r) => sum + (r.duration || 0), 0);

    console.log(`Total Tests: ${this.results.length}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Total Duration: ${totalDuration}ms`);
    console.log('═══════════════════════════════════════════════════════════\n');

    if (failed > 0) {
      console.log('Failed Tests:');
      this.results.filter(r => !r.passed).forEach(r => {
        console.log(`  ❌ ${r.name}: ${r.error}`);
      });
      console.log();
      process.exit(1);
    } else {
      console.log('✅ All tests passed!');
      process.exit(0);
    }
  }
}

// Run tests
const tests = new HashEngineTests();
tests.runAll().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});
