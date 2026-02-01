import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getGoal, createProgressUpdate, getProgressUpdates } from '@/lib/supabase';

const progressSchema = z.object({
  userId: z.string().min(1),
  weekNumber: z.number().int().positive(),
  photoUrls: z.array(z.string()).optional(),
  locationLat: z.number().optional(),
  locationLng: z.number().optional(),
  notes: z.string().max(1000).optional(),
  exifTimestamp: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const body = await request.json();
    const validation = progressSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const goalId = params.id;
    const data = validation.data;

    const goal = await getGoal(goalId);
    if (!goal) {
      return NextResponse.json(
        { success: false, error: 'Goal not found' },
        { status: 404 }
      );
    }

    if (goal.status !== 'active') {
      return NextResponse.json(
        { success: false, error: 'Goal is not active' },
        { status: 400 }
      );
    }

    if (data.userId !== goal.user_id) {
      return NextResponse.json(
        { success: false, error: 'Only the goal owner can submit progress updates' },
        { status: 403 }
      );
    }

    const update = await createProgressUpdate(goalId, data);

    return NextResponse.json({ success: true, progressUpdate: update }, { status: 201 });
  } catch (error) {
    console.error('API Error (POST /api/goals/[id]/progress):', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const goal = await getGoal(params.id);
    if (!goal) {
      return NextResponse.json(
        { success: false, error: 'Goal not found' },
        { status: 404 }
      );
    }

    const updates = await getProgressUpdates(params.id);

    return NextResponse.json({ success: true, progressUpdates: updates });
  } catch (error) {
    console.error('API Error (GET /api/goals/[id]/progress):', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
