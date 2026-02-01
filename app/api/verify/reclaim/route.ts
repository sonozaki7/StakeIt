import { NextRequest, NextResponse } from 'next/server';
import { createVerificationRequest, findProviderForGoal } from '@/lib/reclaim';
import { getGoal, createZkVerification } from '@/lib/supabase';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { goalId, weekNumber } = await request.json();

    if (!goalId || !weekNumber) {
      return NextResponse.json(
        { success: false, error: 'Missing goalId or weekNumber' },
        { status: 400 }
      );
    }

    const goal = await getGoal(goalId);
    if (!goal) {
      return NextResponse.json(
        { success: false, error: 'Goal not found' },
        { status: 404 }
      );
    }

    let providerId = goal.reclaim_provider_id;
    let providerName = goal.reclaim_provider_name;

    if (!providerId) {
      const provider = findProviderForGoal(goal.goal_name);
      if (!provider) {
        return NextResponse.json(
          { success: false, error: 'No ZKTLS provider available for this goal type' },
          { status: 400 }
        );
      }
      providerId = provider.id;
      providerName = provider.name;
    }

    const { requestUrl, sessionId } = await createVerificationRequest(
      goalId,
      weekNumber,
      providerId
    );

    await createZkVerification({
      goalId,
      weekNumber,
      providerId,
      providerName: providerName || 'Unknown Provider',
      status: 'pending',
    });

    return NextResponse.json({
      success: true,
      requestUrl,
      sessionId,
      message: 'Open the URL to generate your proof',
    });
  } catch (error) {
    console.error('Reclaim verification request error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create verification request' },
      { status: 500 }
    );
  }
}
