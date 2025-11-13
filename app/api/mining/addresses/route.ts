import { NextResponse } from 'next/server';
import { miningOrchestrator } from '@/lib/mining/orchestrator-simple';
import { receiptsLogger } from '@/lib/storage/receipts-logger';
import { WalletManager } from '@/lib/wallet/manager';
import * as fs from 'fs';
import * as path from 'path';

export async function GET() {
  try {
    // Get all receipts first to build address list
    const receipts = receiptsLogger.readReceipts();

    // Count solutions per address and collect addresses from receipts (excluding dev fee)
    const solutionsByAddress = new Map<string, number>();
    const addressesByIndex = new Map<number, { bech32: string; solutions: number }>();

    receipts.forEach(receipt => {
      if (!receipt.isDevFee && receipt.addressIndex !== undefined) {
        const count = solutionsByAddress.get(receipt.address) || 0;
        solutionsByAddress.set(receipt.address, count + 1);

        // Track address info by index
        addressesByIndex.set(receipt.addressIndex, {
          bech32: receipt.address,
          solutions: count + 1
        });
      }
    });

    // Try to get additional data from orchestrator if mining is running
    const addressData = miningOrchestrator.getAddressesData();
    const currentChallengeId = addressData?.currentChallengeId || null;

    // Build address list from receipts
    const enrichedAddresses = Array.from(addressesByIndex.entries())
      .map(([index, data]) => {
        // Check if we have orchestrator data for additional info
        let registered = false;
        let solvedCurrentChallenge = false;

        if (addressData) {
          const orchestratorAddr = addressData.addresses.find((a: any) => a.index === index);
          if (orchestratorAddr) {
            registered = orchestratorAddr.registered || false;
            solvedCurrentChallenge = currentChallengeId
              ? addressData.solvedAddressChallenges.get(data.bech32)?.has(currentChallengeId) || false
              : false;
          }
        }

        return {
          index,
          bech32: data.bech32,
          registered,
          solvedCurrentChallenge,
          totalSolutions: solutionsByAddress.get(data.bech32) || 0,
        };
      })
      .sort((a, b) => a.index - b.index); // Sort by index

    // Calculate summary stats
    const summary = {
      totalAddresses: enrichedAddresses.length,
      registeredAddresses: enrichedAddresses.filter(a => a.registered).length,
      solvedCurrentChallenge: enrichedAddresses.filter(a => a.solvedCurrentChallenge).length,
    };

    return NextResponse.json({
      success: true,
      currentChallenge: currentChallengeId,
      addresses: enrichedAddresses,
      summary,
    });
  } catch (error: any) {
    console.error('[API] Addresses error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch address data' },
      { status: 500 }
    );
  }
}
