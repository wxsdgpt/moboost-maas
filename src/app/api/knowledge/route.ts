/**
 * GET /api/knowledge — Query industry_knowledge entries
 *
 * Query params:
 *   tags     — comma-separated tags to match (uses overlap/contains)
 *   search   — text search in title (case-insensitive like)
 *   category — filter by category
 *   limit    — max results (default 10)
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService } from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const tags = searchParams.get('tags')?.split(',').filter(Boolean) || []
  const search = searchParams.get('search') || ''
  const category = searchParams.get('category') || ''
  const limit = parseInt(searchParams.get('limit') || '10', 10)

  const db = supabaseService()
  let query = db
    .from('industry_knowledge')
    .select('*')
    .eq('status', 'active')
    .order('relevance', { ascending: false })
    .limit(limit)

  if (tags.length > 0) {
    query = query.overlaps('tags', tags)
  }

  if (search) {
    query = query.ilike('title', `%${search}%`)
  }

  if (category) {
    query = query.eq('category', category)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    entries: (data || []).map((row: Record<string, unknown>) => ({
      id: row.id,
      title: row.title,
      category: row.category,
      vertical: row.vertical,
      tags: row.tags,
      summary: row.summary,
      structured: row.structured,
      confidence: row.confidence,
      relevance: row.relevance,
      collectedAt: row.collected_at,
    })),
    total: data?.length || 0,
  })
}
