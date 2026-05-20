import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    {
      status: 'not_implemented',
      pipeline: {
        description: 'Video Understanding Pipeline',
        stages: [
          {
            stage: 1,
            name: 'upload',
            description: 'Receive and validate video file (mp4/mov/webm, max 500MB)',
          },
          {
            stage: 2,
            name: 'keyframe_extraction',
            description: 'Extract keyframes using scene-change detection and uniform sampling',
          },
          {
            stage: 3,
            name: 'global_understanding',
            description: 'Send video to Gemini for holistic content understanding and summary',
          },
          {
            stage: 4,
            name: 'per_frame_analysis',
            description: 'Analyze each keyframe for OCR, object detection, and semantic annotation',
          },
          {
            stage: 5,
            name: 'assembly',
            description: 'Assemble structured results: timeline, keyframe gallery, and per-frame markdown',
          },
        ],
        models: ['gemini-2.5-pro', 'gemini-2.5-flash'],
        supported_formats: ['video/mp4', 'video/quicktime', 'video/webm'],
        max_file_size_mb: 500,
      },
      message: 'Video understanding pipeline is not yet implemented. This endpoint describes the planned architecture.',
    },
    { status: 501 }
  )
}

export async function GET() {
  return NextResponse.json({
    tool: 'video-understanding',
    status: 'not_implemented',
    description: 'AI-powered video analysis — extract operation timelines, keyframes, UI text, and semantic clips',
    endpoints: {
      'POST /api/video-understanding': 'Submit a video for analysis (not yet implemented)',
    },
  })
}
