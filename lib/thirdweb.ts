// Thirdweb integration - OPTIONAL (skipped if not installed)
// On-chain recording will be disabled but app works fine without it

export async function recordOnChain(
  goalId: string,
  weekNumber: number,
  passed: boolean,
  proofValue: string
): Promise<{ txHash: string; blockNumber: number } | null> {
  // Thirdweb not installed - skip on-chain recording
  console.log('On-chain recording skipped - thirdweb not configured');
  console.log('Would record:', { goalId, weekNumber, passed, proofValue });
  return null;
}

export function getBaseScanUrl(txHash: string): string {
  return `https://sepolia.basescan.org/tx/${txHash}`;
}
