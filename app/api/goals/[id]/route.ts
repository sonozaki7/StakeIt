import { NextRequest, NextResponse } from 'next/server';
import { getGoalWithDetails } from '@/lib/supabase';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const goal = await getGoalWithDetails(params.id);

    if (!goal) {
      return NextResponse.json(
        { success: false, error: 'Goal not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, goal });
  } catch (error) {
    console.error('API Error (GET /api/goals/[id]):', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
