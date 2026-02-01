import { NextRequest, NextResponse } from 'next/server';
import { getGoal, uploadProgressPhoto, createProgressUpdate } from '@/lib/supabase';
import { parseExifFromBuffer, isTimestampRecent } from '@/lib/exif';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const goalId = params.id;

    const formData = await request.formData();
    const file = formData.get('photo') as File | null;
    const userId = formData.get('userId') as string | null;
    const notes = formData.get('notes') as string | null;
    const locationLat = formData.get('locationLat') as string | null;
    const locationLng = formData.get('locationLng') as string | null;

    if (!file || !userId) {
      return NextResponse.json(
        { success: false, error: 'photo and userId are required' },
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

    if (goal.status !== 'active') {
      return NextResponse.json(
        { success: false, error: 'Goal is not active' },
        { status: 400 }
      );
    }

    if (userId !== goal.user_id) {
      return NextResponse.json(
        { success: false, error: 'Only the goal owner can submit progress' },
        { status: 403 }
      );
    }

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Parse EXIF data
    const exif = parseExifFromBuffer(buffer);
    const warnings: string[] = [];

    if (!exif.timestamp) {
      warnings.push('No EXIF timestamp found in photo');
    } else if (!isTimestampRecent(exif.timestamp)) {
      warnings.push('Photo EXIF timestamp is older than 1 hour');
    }

    // Upload to storage
    const fileName = file.name || 'photo.jpg';
    const photoUrl = await uploadProgressPhoto(goalId, userId, buffer, fileName);

    // Create progress update
    const update = await createProgressUpdate(goalId, {
      userId,
      weekNumber: goal.current_week,
      photoUrls: [photoUrl],
      locationLat: locationLat ? parseFloat(locationLat) : exif.latitude || undefined,
      locationLng: locationLng ? parseFloat(locationLng) : exif.longitude || undefined,
      notes: notes || undefined,
      exifTimestamp: exif.timestamp?.toISOString(),
    });

    return NextResponse.json({
      success: true,
      progressUpdate: update,
      warnings: warnings.length > 0 ? warnings : undefined,
    }, { status: 201 });
  } catch (error) {
    console.error('API Error (POST /api/goals/[id]/progress/upload):', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
