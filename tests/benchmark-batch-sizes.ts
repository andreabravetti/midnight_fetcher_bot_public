/**
 * Batch Size Benchmark
 * Tests different BATCH_SIZE values to find optimal performance
 */

import axios from 'axios';

const HASH_SERVICE_URL = 'http://127.0.0.1:9001';

interface BenchmarkResult {
  batchSize: number;
  totalHashes: number;
  duration: number;
  hashRate: number;
  solutionsFound: number;
}

class BatchSizeBenchmark {
  private results: BenchmarkResult[] = [];

  async runAll(): Promise<void> {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('Batch Size Performance Benchmark');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Initialize ROM first
    console.log('Initializing ROM...');
    await this.initROM();
    console.log('✓ ROM initialized\n');

    // Test different batch sizes
    const batchSizes = [1000, 5000, 10000, 25000, 50000, 100000];

    for (const batchSize of batchSizes) {
      await this.benchmark(batchSize);
      // Small delay between tests
      await this.sleep(2000);
    }

    // Print summary
    this.printSummary();
  }

  private async initROM(): Promise<void> {
    const noPreMine = '0'.repeat(128);
    await axios.post(`${HASH_SERVICE_URL}/init`, {
      no_pre_mine: noPreMine,
      ashConfig: {
        nbLoops: 8,
        nbInstrs: 256,
        pre_size: 16777216,
        rom_size: 1073741824,
        mixing_numbers: 4
      }
    }, { timeout: 120000 });
  }

  private async benchmark(batchSize: number): Promise<void> {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Testing Batch Size: ${batchSize.toLocaleString()}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    const startTime = Date.now();

    try {
      // Use the /mine endpoint with specified batch size
      const response = await axios.post(`${HASH_SERVICE_URL}/mine`, {
        worker_id: 999,
        address: 'addr_test1qz123456789abcdef',
        challenge: {
          challenge_id: 'benchmark_test',
          difficulty: '00FFFFFF' + 'FF'.repeat(28), // Easy difficulty
          no_pre_mine: '0'.repeat(128),
          latest_submission: '0'.repeat(128),
          no_pre_mine_hour: '0'.repeat(128),
        },
        batch_size: batchSize,
        nonce_start: '0',
      }, {
        timeout: 300000 // 5 minute timeout for large batches
      });

      const duration = Date.now() - startTime;
      const hashRate = Math.floor((batchSize / duration) * 1000);

      const result: BenchmarkResult = {
        batchSize,
        totalHashes: response.data.hashes_computed,
        duration,
        hashRate,
        solutionsFound: response.data.solutions?.length || 0,
      };

      this.results.push(result);

      console.log(`Duration:        ${duration}ms`);
      console.log(`Hash Rate:       ${hashRate.toLocaleString()} H/s`);
      console.log(`Hashes Computed: ${result.totalHashes.toLocaleString()}`);
      console.log(`Solutions Found: ${result.solutionsFound}`);
      console.log(`Throughput:      ${(batchSize / (duration / 1000)).toFixed(2)} hashes/sec`);
      console.log();

    } catch (error: any) {
      console.error(`❌ Failed: ${error.message}`);
      console.log();
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private printSummary(): void {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('Benchmark Summary');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Sort by hash rate (highest first)
    const sorted = [...this.results].sort((a, b) => b.hashRate - a.hashRate);

    console.log('Batch Size    | Hash Rate      | Duration  | Efficiency');
    console.log('──────────────┼────────────────┼───────────┼──────────────');

    sorted.forEach((result, index) => {
      const batchStr = result.batchSize.toLocaleString().padEnd(12);
      const rateStr = `${result.hashRate.toLocaleString()} H/s`.padEnd(14);
      const durationStr = `${result.duration}ms`.padEnd(9);
      const marker = index === 0 ? '🏆 FASTEST' : '';

      console.log(`${batchStr} | ${rateStr} | ${durationStr} | ${marker}`);
    });

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('Recommendations');
    console.log('═══════════════════════════════════════════════════════════\n');

    const fastest = sorted[0];
    const current = this.results.find(r => r.batchSize === 10000);

    console.log(`🏆 Fastest Batch Size: ${fastest.batchSize.toLocaleString()}`);
    console.log(`   Hash Rate: ${fastest.hashRate.toLocaleString()} H/s`);

    if (current && fastest.batchSize !== 10000) {
      const improvement = ((fastest.hashRate - current.hashRate) / current.hashRate * 100).toFixed(1);
      console.log(`\n📈 Improvement over current (10,000):`);
      console.log(`   ${improvement}% faster (${current.hashRate.toLocaleString()} → ${fastest.hashRate.toLocaleString()} H/s)`);
    }

    // Memory considerations
    console.log(`\n💾 Memory Usage Estimate:`);
    sorted.forEach(result => {
      // Each preimage is roughly 300-400 bytes in memory
      const memoryMB = (result.batchSize * 400 / 1024 / 1024).toFixed(2);
      console.log(`   ${result.batchSize.toLocaleString().padEnd(10)} → ~${memoryMB} MB RAM per batch`);
    });

    console.log(`\n✅ Recommended: Use batch size ${fastest.batchSize.toLocaleString()}`);
    console.log(`   Update hashengine/src/bin/server.rs line 462:`);
    console.log(`   const BATCH_SIZE: usize = ${fastest.batchSize};\n`);
  }
}

// Run benchmark
const benchmark = new BatchSizeBenchmark();
benchmark.runAll().catch(error => {
  console.error('Benchmark failed:', error);
  process.exit(1);
});
