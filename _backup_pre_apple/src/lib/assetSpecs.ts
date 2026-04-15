/**
 * Asset Specs Registry
 * ---------------------------------------------------------------------------
 * Canonical catalog of creative asset specifications across advertising and
 * content platforms.
 *
 * Purpose:
 *   1. Stage 1 intake — power the asset-type picker so users can pre-lock
 *      dimensions, platform, and duration BEFORE writing their brief.
 *   2. Stage 4 pipeline routing — AI "Auto" mode uses spec.mediaType +
 *      duration constraints to choose T2I / I2I / T2V / I2V / V2V.
 *   3. Post-generation validation — every produced asset is checked against
 *      its target spec (dimensions, duration, file size, format).
 *   4. Analytics dimension — effectiveness metrics (CTR, CVR) aggregated per
 *      spec to drive future recommendation.
 *
 * Conventions:
 *   - All dimensions in pixels at 1x (render-time upscaling handled elsewhere)
 *   - Durations in seconds
 *   - File sizes in megabytes
 *   - nameZh is the user-facing Chinese label
 *   - priority: 'core' = shown by default in pickers, 'standard' = behind a
 *     "more" toggle, 'niche' = only via search
 *
 * Sources (verified 2026-04 — re-verify each quarter, see latest.md):
 *   Instagram Reels   — postfa.st/sizes/instagram/reels (1080x1920, 180s max,
 *                       256 MB cap since Jan 2025)
 *   Instagram Stories — help.instagram.com/1038071743007909
 *   TikTok In-Feed    — tikadsuite.com/blog/tiktok-ad-specs (10 min cap since
 *                       July 2025 doc update; 500 MB; 9:16 1080x1920)
 *   YouTube Shorts    — vidiq.com/blog/post/youtube-shorts-vertical-video
 *                       (180s cap since Oct 15 2024; 1080x1920 9:16)
 *   IAB Display       — iab.com/guidelines/iab-new-ad-portfolio
 *                       (300x250, 728x90, 160x600, 300x600, 320x50 are the
 *                        five most-trafficked units in 2026)
 *   Hootsuite / Sprout / Metricool 2026 guides for cross-platform sanity
 *   checks (egress proxy blocked direct fetch — values triangulated via
 *   search snippets).
 * ---------------------------------------------------------------------------
 */

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type AssetMediaType = 'image' | 'video'

export type Platform =
  | 'meta'            // Facebook + Instagram
  | 'tiktok'
  | 'youtube'
  | 'x'               // Twitter / X
  | 'linkedin'
  | 'pinterest'
  | 'snapchat'
  | 'google-display'  // IAB standard via Google Ads
  | 'programmatic'    // Generic VAST / OpenRTB
  | 'ctv'             // Connected TV / OTT
  | 'web'             // Own-property landing pages
  | 'email'
  | 'app-store-ios'
  | 'app-store-android'
  | 'universal'       // Platform-agnostic reference

export type AssetCategory =
  | 'social-post'       // Feed post (square/portrait/landscape)
  | 'social-story'      // Ephemeral vertical story
  | 'social-reel'       // Short vertical video
  | 'social-cover'      // Profile/channel header
  | 'display-banner'    // IAB display
  | 'video-ad'          // Pre-roll / mid-roll / bumper
  | 'landing-hero'      // Web page hero banner
  | 'product-card'      // E-com product tile
  | 'email-header'
  | 'app-icon'
  | 'app-screenshot'
  | 'app-feature'       // Store feature graphic
  | 'thumbnail'

export interface SafeZone {
  /** Percentage of total height/width reserved for platform UI overlays */
  top?: number
  bottom?: number
  left?: number
  right?: number
}

export interface AssetSpec {
  /** Unique slug — stable identifier used in Brief.targetSpec */
  id: string
  mediaType: AssetMediaType
  category: AssetCategory
  platform: Platform
  /** English display name */
  name: string
  /** Chinese display name (used in MAAS UI) */
  nameZh: string
  width: number
  height: number
  /** Canonical aspect ratio label (e.g. "1:1", "9:16", "16:9") */
  aspectRatio: string
  /** Video only — minimum allowed duration in seconds */
  minDurationSec?: number
  /** Video only — maximum allowed duration in seconds */
  maxDurationSec?: number
  /** Video only — accepted frame rate or range */
  fps?: number | [number, number]
  /** Max allowed file size in MB */
  maxFileSizeMB?: number
  /** Accepted file formats (lowercase, no dot) */
  acceptedFormats?: string[]
  /** Safe zone for UI overlays (stories/reels where bottom has CTA etc.) */
  safeZone?: SafeZone
  /** Human-readable notes / gotchas */
  notes?: string
  /** Picker priority — 'core' = always visible */
  priority: 'core' | 'standard' | 'niche'
  /** Flagged as frequently used in iGaming vertical (informational only) */
  iGamingRelevant?: boolean
  /**
   * Where the spec came from.
   *   - 'builtin' : curated in this file, available to all tenants
   *   - 'custom'  : tenant-defined via the customSpecs store
   * Defaults to 'builtin' when absent.
   */
  source?: 'builtin' | 'custom'
  /** Owning tenant / customer id — only populated for source === 'custom' */
  customerId?: string
  /** Unix ms — only populated for source === 'custom' */
  createdAt?: number
  /** Unix ms — only populated for source === 'custom' */
  updatedAt?: number
}

// ────────────────────────────────────────────────────────────────────────────
// Spec Catalog
// ────────────────────────────────────────────────────────────────────────────

export const ASSET_SPECS: AssetSpec[] = [
  // ── Meta (Facebook + Instagram) — Images ─────────────────────────────────
  { id: 'ig-feed-square',      mediaType: 'image', category: 'social-post',  platform: 'meta', name: 'Instagram Feed (Square)',    nameZh: 'IG 方图帖子',         width: 1080, height: 1080, aspectRatio: '1:1',   maxFileSizeMB: 30, acceptedFormats: ['jpg','png'], priority: 'core',     iGamingRelevant: true },
  { id: 'ig-feed-portrait',    mediaType: 'image', category: 'social-post',  platform: 'meta', name: 'Instagram Feed (Portrait)',  nameZh: 'IG 竖图帖子 4:5',      width: 1080, height: 1350, aspectRatio: '4:5',   maxFileSizeMB: 30, acceptedFormats: ['jpg','png'], priority: 'core',     iGamingRelevant: true },
  { id: 'ig-feed-landscape',   mediaType: 'image', category: 'social-post',  platform: 'meta', name: 'Instagram Feed (Landscape)', nameZh: 'IG 横图帖子',         width: 1080, height: 566,  aspectRatio: '1.91:1', maxFileSizeMB: 30, acceptedFormats: ['jpg','png'], priority: 'standard' },
  { id: 'ig-story-image',      mediaType: 'image', category: 'social-story', platform: 'meta', name: 'Instagram Story',            nameZh: 'IG Story 图',         width: 1080, height: 1920, aspectRatio: '9:16',  maxFileSizeMB: 30, acceptedFormats: ['jpg','png'], safeZone: { top: 14, bottom: 20 }, notes: '顶部/底部留安全区避开 avatar 和 CTA', priority: 'core', iGamingRelevant: true },
  { id: 'fb-feed-link',        mediaType: 'image', category: 'social-post',  platform: 'meta', name: 'Facebook Link Post',         nameZh: 'FB 链接卡片',         width: 1200, height: 628,  aspectRatio: '1.91:1', maxFileSizeMB: 8,  acceptedFormats: ['jpg','png'], priority: 'core' },
  { id: 'fb-feed-square',      mediaType: 'image', category: 'social-post',  platform: 'meta', name: 'Facebook Feed (Square)',     nameZh: 'FB 方图帖子',         width: 1080, height: 1080, aspectRatio: '1:1',   maxFileSizeMB: 8,  acceptedFormats: ['jpg','png'], priority: 'core' },
  { id: 'fb-cover',            mediaType: 'image', category: 'social-cover', platform: 'meta', name: 'Facebook Page Cover',        nameZh: 'FB 主页封面',         width: 820,  height: 312,  aspectRatio: '2.63:1', acceptedFormats: ['jpg','png'], notes: '移动端实际显示 640x360, 需要双尺寸兼顾', priority: 'niche' },

  // ── Meta — Videos ────────────────────────────────────────────────────────
  { id: 'ig-reel',             mediaType: 'video', category: 'social-reel',  platform: 'meta', name: 'Instagram Reel',             nameZh: 'IG Reels',            width: 1080, height: 1920, aspectRatio: '9:16', minDurationSec: 3, maxDurationSec: 180, fps: [24, 60], maxFileSizeMB: 256, acceptedFormats: ['mp4','mov'], safeZone: { top: 14, bottom: 20 }, notes: '3 分钟上限自 2025-01 生效；推荐 30 fps + H.264/AAC', priority: 'core', iGamingRelevant: true },
  { id: 'ig-story-video',      mediaType: 'video', category: 'social-story', platform: 'meta', name: 'Instagram Story Video',      nameZh: 'IG Story 视频',       width: 1080, height: 1920, aspectRatio: '9:16', minDurationSec: 1, maxDurationSec: 60, fps: [24, 60], maxFileSizeMB: 250, acceptedFormats: ['mp4','mov'], safeZone: { top: 14, bottom: 20 }, priority: 'core',  iGamingRelevant: true },
  { id: 'ig-feed-video-square',mediaType: 'video', category: 'social-post',  platform: 'meta', name: 'Instagram Feed Video (Square)', nameZh: 'IG 方图视频',      width: 1080, height: 1080, aspectRatio: '1:1',  minDurationSec: 3, maxDurationSec: 60, fps: [24, 60], maxFileSizeMB: 250, acceptedFormats: ['mp4','mov'], priority: 'standard' },
  { id: 'fb-feed-video',       mediaType: 'video', category: 'social-post',  platform: 'meta', name: 'Facebook Feed Video',        nameZh: 'FB 信息流视频',        width: 1280, height: 720,  aspectRatio: '16:9', minDurationSec: 1, maxDurationSec: 240, fps: [24, 30], maxFileSizeMB: 4000, acceptedFormats: ['mp4','mov'], priority: 'standard' },

  // ── TikTok ───────────────────────────────────────────────────────────────
  { id: 'tiktok-video',        mediaType: 'video', category: 'social-reel',  platform: 'tiktok', name: 'TikTok In-Feed Video',     nameZh: 'TikTok 信息流视频',    width: 1080, height: 1920, aspectRatio: '9:16', minDurationSec: 1,  maxDurationSec: 600, fps: [23, 60], maxFileSizeMB: 500, acceptedFormats: ['mp4','mov'], safeZone: { top: 6, bottom: 22, right: 9 }, notes: '10 分钟上限自 2025-07 起开放；最佳表现 9-15s；右下 CTA 覆盖 ~180px', priority: 'core', iGamingRelevant: true },
  { id: 'tiktok-topview',      mediaType: 'video', category: 'video-ad',     platform: 'tiktok', name: 'TikTok TopView',           nameZh: 'TikTok 开屏广告',      width: 1080, height: 1920, aspectRatio: '9:16', minDurationSec: 5,  maxDurationSec: 60,  fps: [23, 60], maxFileSizeMB: 500, acceptedFormats: ['mp4'],        priority: 'niche',    iGamingRelevant: true },
  { id: 'tiktok-spark',        mediaType: 'video', category: 'video-ad',     platform: 'tiktok', name: 'TikTok Spark Ads',         nameZh: 'TikTok Spark Ads',    width: 1080, height: 1920, aspectRatio: '9:16', minDurationSec: 1,  maxDurationSec: 180, fps: [23, 60], maxFileSizeMB: 500, acceptedFormats: ['mp4'],        priority: 'standard' },

  // ── YouTube ──────────────────────────────────────────────────────────────
  { id: 'youtube-standard',    mediaType: 'video', category: 'video-ad',     platform: 'youtube', name: 'YouTube Video (Standard)',   nameZh: 'YouTube 标准视频',     width: 1920, height: 1080, aspectRatio: '16:9', minDurationSec: 1,  maxDurationSec: 43200, fps: [24, 60], acceptedFormats: ['mp4','mov'], priority: 'core' },
  { id: 'youtube-shorts',      mediaType: 'video', category: 'social-reel',  platform: 'youtube', name: 'YouTube Shorts',             nameZh: 'YouTube Shorts',      width: 1080, height: 1920, aspectRatio: '9:16', minDurationSec: 1,  maxDurationSec: 180,   fps: [24, 60], acceptedFormats: ['mp4','mov'], notes: '3 分钟上限自 2024-10-15 起开放；表现最佳 20-45s', priority: 'core',   iGamingRelevant: true },
  { id: 'youtube-bumper',      mediaType: 'video', category: 'video-ad',     platform: 'youtube', name: 'YouTube Bumper Ad',          nameZh: 'YouTube 贴片广告 6s', width: 1920, height: 1080, aspectRatio: '16:9', minDurationSec: 1,  maxDurationSec: 6,     fps: [24, 30], acceptedFormats: ['mp4'],       notes: '非跳过', priority: 'standard' },
  { id: 'youtube-trueview',    mediaType: 'video', category: 'video-ad',     platform: 'youtube', name: 'YouTube TrueView (Skippable)', nameZh: 'YouTube 可跳过贴片',  width: 1920, height: 1080, aspectRatio: '16:9', minDurationSec: 12, maxDurationSec: 180,   fps: [24, 30], acceptedFormats: ['mp4'],       notes: '5s 后可跳过', priority: 'standard' },
  { id: 'youtube-thumbnail',   mediaType: 'image', category: 'thumbnail',    platform: 'youtube', name: 'YouTube Thumbnail',          nameZh: 'YouTube 视频缩略图',   width: 1280, height: 720,  aspectRatio: '16:9', maxFileSizeMB: 2,   acceptedFormats: ['jpg','png'], priority: 'core' },
  { id: 'youtube-channel-banner', mediaType: 'image', category: 'social-cover', platform: 'youtube', name: 'YouTube Channel Banner', nameZh: 'YouTube 频道封面',     width: 2560, height: 1440, aspectRatio: '16:9', maxFileSizeMB: 6,   acceptedFormats: ['jpg','png'], notes: '安全区 1546x423（TV 裁切最安全）', priority: 'niche' },

  // ── X / Twitter ──────────────────────────────────────────────────────────
  { id: 'x-post-landscape',    mediaType: 'image', category: 'social-post',  platform: 'x', name: 'X Post Image (Landscape)',   nameZh: 'X 横图帖子',           width: 1600, height: 900,  aspectRatio: '16:9', maxFileSizeMB: 5,   acceptedFormats: ['jpg','png'], priority: 'core' },
  { id: 'x-post-square',       mediaType: 'image', category: 'social-post',  platform: 'x', name: 'X Post Image (Square)',      nameZh: 'X 方图帖子',           width: 1080, height: 1080, aspectRatio: '1:1',  maxFileSizeMB: 5,   acceptedFormats: ['jpg','png'], priority: 'standard' },
  { id: 'x-post-video',        mediaType: 'video', category: 'social-post',  platform: 'x', name: 'X Post Video',               nameZh: 'X 帖子视频',           width: 1280, height: 720,  aspectRatio: '16:9', minDurationSec: 1, maxDurationSec: 140, fps: [24, 60], maxFileSizeMB: 512, acceptedFormats: ['mp4','mov'], priority: 'standard' },
  { id: 'x-header',            mediaType: 'image', category: 'social-cover', platform: 'x', name: 'X Profile Header',           nameZh: 'X 个人页头图',          width: 1500, height: 500,  aspectRatio: '3:1',  maxFileSizeMB: 5,   acceptedFormats: ['jpg','png'], priority: 'niche' },

  // ── LinkedIn ─────────────────────────────────────────────────────────────
  { id: 'linkedin-feed-image', mediaType: 'image', category: 'social-post',  platform: 'linkedin', name: 'LinkedIn Feed Image',   nameZh: 'LinkedIn 信息流图',    width: 1200, height: 627,  aspectRatio: '1.91:1', maxFileSizeMB: 5,  acceptedFormats: ['jpg','png'], priority: 'core' },
  { id: 'linkedin-feed-square',mediaType: 'image', category: 'social-post',  platform: 'linkedin', name: 'LinkedIn Feed (Square)',nameZh: 'LinkedIn 方图',       width: 1200, height: 1200, aspectRatio: '1:1',    maxFileSizeMB: 5,  acceptedFormats: ['jpg','png'], priority: 'standard' },
  { id: 'linkedin-video',      mediaType: 'video', category: 'social-post',  platform: 'linkedin', name: 'LinkedIn Feed Video',   nameZh: 'LinkedIn 信息流视频',  width: 1920, height: 1080, aspectRatio: '16:9',  minDurationSec: 3, maxDurationSec: 600, fps: [10, 60], maxFileSizeMB: 5000, acceptedFormats: ['mp4'], priority: 'standard' },
  { id: 'linkedin-banner',     mediaType: 'image', category: 'social-cover', platform: 'linkedin', name: 'LinkedIn Company Banner', nameZh: 'LinkedIn 公司主页',  width: 1128, height: 191,  aspectRatio: '5.9:1',  maxFileSizeMB: 4,  acceptedFormats: ['jpg','png'], priority: 'niche' },

  // ── Pinterest ────────────────────────────────────────────────────────────
  { id: 'pinterest-standard',  mediaType: 'image', category: 'social-post',  platform: 'pinterest', name: 'Pinterest Standard Pin', nameZh: 'Pinterest 标准图钉', width: 1000, height: 1500, aspectRatio: '2:3',  maxFileSizeMB: 20, acceptedFormats: ['jpg','png'], priority: 'standard' },
  { id: 'pinterest-idea',      mediaType: 'image', category: 'social-story', platform: 'pinterest', name: 'Pinterest Idea Pin',     nameZh: 'Pinterest Idea Pin', width: 1080, height: 1920, aspectRatio: '9:16', maxFileSizeMB: 20, acceptedFormats: ['jpg','png'], priority: 'niche' },
  { id: 'pinterest-video',     mediaType: 'video', category: 'social-post',  platform: 'pinterest', name: 'Pinterest Video Pin',    nameZh: 'Pinterest 视频图钉', width: 1000, height: 1500, aspectRatio: '2:3',  minDurationSec: 4, maxDurationSec: 900, maxFileSizeMB: 2000, acceptedFormats: ['mp4','mov'], priority: 'niche' },

  // ── Snapchat ─────────────────────────────────────────────────────────────
  { id: 'snap-story-video',    mediaType: 'video', category: 'social-story', platform: 'snapchat', name: 'Snapchat Story Video',   nameZh: 'Snapchat Story 视频', width: 1080, height: 1920, aspectRatio: '9:16', minDurationSec: 3, maxDurationSec: 180, fps: [24, 60], maxFileSizeMB: 1000, acceptedFormats: ['mp4','mov'], priority: 'niche', iGamingRelevant: true },

  // ── Google Display (IAB Standard Sizes) ──────────────────────────────────
  { id: 'iab-medium-rectangle',  mediaType: 'image', category: 'display-banner', platform: 'google-display', name: 'Medium Rectangle',     nameZh: '中矩形 (MPU)',   width: 300,  height: 250,  aspectRatio: '6:5',    maxFileSizeMB: 0.15, acceptedFormats: ['jpg','png','gif','html5'], priority: 'core', iGamingRelevant: true, notes: '全球最常用的展示广告尺寸' },
  { id: 'iab-large-rectangle',   mediaType: 'image', category: 'display-banner', platform: 'google-display', name: 'Large Rectangle',      nameZh: '大矩形',          width: 336,  height: 280,  aspectRatio: '6:5',    maxFileSizeMB: 0.15, acceptedFormats: ['jpg','png','gif','html5'], priority: 'standard' },
  { id: 'iab-leaderboard',       mediaType: 'image', category: 'display-banner', platform: 'google-display', name: 'Leaderboard',          nameZh: '排行榜横条',      width: 728,  height: 90,   aspectRatio: '8:1',    maxFileSizeMB: 0.15, acceptedFormats: ['jpg','png','gif','html5'], priority: 'core',    iGamingRelevant: true },
  { id: 'iab-large-leaderboard', mediaType: 'image', category: 'display-banner', platform: 'google-display', name: 'Large Leaderboard',    nameZh: '大排行榜',        width: 970,  height: 90,   aspectRatio: '10.8:1', maxFileSizeMB: 0.15, acceptedFormats: ['jpg','png','gif','html5'], priority: 'standard' },
  { id: 'iab-billboard',         mediaType: 'image', category: 'display-banner', platform: 'google-display', name: 'Billboard',            nameZh: '广告牌',          width: 970,  height: 250,  aspectRatio: '3.88:1', maxFileSizeMB: 0.15, acceptedFormats: ['jpg','png','gif','html5'], priority: 'standard' },
  { id: 'iab-half-page',         mediaType: 'image', category: 'display-banner', platform: 'google-display', name: 'Half Page',            nameZh: '半页',            width: 300,  height: 600,  aspectRatio: '1:2',    maxFileSizeMB: 0.15, acceptedFormats: ['jpg','png','gif','html5'], priority: 'standard', iGamingRelevant: true },
  { id: 'iab-wide-skyscraper',   mediaType: 'image', category: 'display-banner', platform: 'google-display', name: 'Wide Skyscraper',      nameZh: '宽摩天大楼',      width: 160,  height: 600,  aspectRatio: '4:15',   maxFileSizeMB: 0.15, acceptedFormats: ['jpg','png','gif','html5'], notes: 'IAB 2026 五大常用尺寸之一', priority: 'standard' },
  { id: 'iab-mobile-banner',     mediaType: 'image', category: 'display-banner', platform: 'google-display', name: 'Mobile Banner',        nameZh: '移动端横幅',      width: 320,  height: 50,   aspectRatio: '32:5',   maxFileSizeMB: 0.15, acceptedFormats: ['jpg','png','gif'],          priority: 'core',    iGamingRelevant: true },
  { id: 'iab-large-mobile-banner', mediaType: 'image', category: 'display-banner', platform: 'google-display', name: 'Large Mobile Banner',nameZh: '移动大横幅',     width: 320,  height: 100,  aspectRatio: '16:5',   maxFileSizeMB: 0.15, acceptedFormats: ['jpg','png','gif'],          priority: 'standard' },
  { id: 'iab-small-square',      mediaType: 'image', category: 'display-banner', platform: 'google-display', name: 'Small Square',         nameZh: '小方块',          width: 200,  height: 200,  aspectRatio: '1:1',    maxFileSizeMB: 0.15, acceptedFormats: ['jpg','png','gif'],          priority: 'niche' },
  { id: 'iab-square',            mediaType: 'image', category: 'display-banner', platform: 'google-display', name: 'Square',               nameZh: '方形',            width: 250,  height: 250,  aspectRatio: '1:1',    maxFileSizeMB: 0.15, acceptedFormats: ['jpg','png','gif'],          priority: 'niche' },

  // ── Programmatic / CTV Video ─────────────────────────────────────────────
  { id: 'vast-preroll-15',       mediaType: 'video', category: 'video-ad',   platform: 'programmatic', name: 'VAST Pre-roll 15s',  nameZh: 'VAST 前贴 15s',   width: 1920, height: 1080, aspectRatio: '16:9', minDurationSec: 15, maxDurationSec: 15, fps: 30, maxFileSizeMB: 200, acceptedFormats: ['mp4'], priority: 'standard' },
  { id: 'vast-preroll-30',       mediaType: 'video', category: 'video-ad',   platform: 'programmatic', name: 'VAST Pre-roll 30s',  nameZh: 'VAST 前贴 30s',   width: 1920, height: 1080, aspectRatio: '16:9', minDurationSec: 30, maxDurationSec: 30, fps: 30, maxFileSizeMB: 200, acceptedFormats: ['mp4'], priority: 'standard' },
  { id: 'vast-bumper-6',         mediaType: 'video', category: 'video-ad',   platform: 'programmatic', name: 'VAST Bumper 6s',     nameZh: 'VAST 6 秒贴片',   width: 1920, height: 1080, aspectRatio: '16:9', minDurationSec: 6,  maxDurationSec: 6,  fps: 30, maxFileSizeMB: 100, acceptedFormats: ['mp4'], priority: 'niche' },
  { id: 'ctv-16x9-hd',           mediaType: 'video', category: 'video-ad',   platform: 'ctv',          name: 'CTV 1080p 16:9',      nameZh: 'CTV 高清横屏',    width: 1920, height: 1080, aspectRatio: '16:9', minDurationSec: 15, maxDurationSec: 60, fps: [24, 30], maxFileSizeMB: 500, acceptedFormats: ['mp4','mov'], priority: 'niche' },
  { id: 'ctv-4k',                mediaType: 'video', category: 'video-ad',   platform: 'ctv',          name: 'CTV 4K',              nameZh: 'CTV 4K 横屏',     width: 3840, height: 2160, aspectRatio: '16:9', minDurationSec: 15, maxDurationSec: 60, fps: [24, 30], maxFileSizeMB: 2000, acceptedFormats: ['mp4'],      priority: 'niche' },

  // ── Web / Landing Pages ──────────────────────────────────────────────────
  { id: 'web-hero-desktop',      mediaType: 'image', category: 'landing-hero', platform: 'web', name: 'Desktop Hero Banner',    nameZh: '桌面端 Hero 主视觉', width: 1920, height: 1080, aspectRatio: '16:9',    maxFileSizeMB: 5,   acceptedFormats: ['jpg','png','webp'], priority: 'core',     iGamingRelevant: true },
  { id: 'web-hero-cinematic',    mediaType: 'image', category: 'landing-hero', platform: 'web', name: 'Cinematic Hero (21:9)',  nameZh: '电影宽屏 Hero 21:9',  width: 2560, height: 1080, aspectRatio: '21:9',    maxFileSizeMB: 6,   acceptedFormats: ['jpg','png','webp'], priority: 'standard' },
  { id: 'web-hero-mobile',       mediaType: 'image', category: 'landing-hero', platform: 'web', name: 'Mobile Hero',            nameZh: '移动端 Hero',          width: 1125, height: 2436, aspectRatio: '9:19.5',  maxFileSizeMB: 4,   acceptedFormats: ['jpg','png','webp'], priority: 'core',     iGamingRelevant: true },
  { id: 'web-hero-video',        mediaType: 'video', category: 'landing-hero', platform: 'web', name: 'Web Hero Video Loop',    nameZh: '落地页 Hero 视频环播', width: 1920, height: 1080, aspectRatio: '16:9',    minDurationSec: 4, maxDurationSec: 20, fps: [24, 30], maxFileSizeMB: 8,  acceptedFormats: ['mp4','webm'], notes: '通常静音自动循环，首屏 <3MB 最佳', priority: 'standard' },
  { id: 'web-product-card',      mediaType: 'image', category: 'product-card', platform: 'web', name: 'Product Card',           nameZh: '商品卡片图',           width: 800,  height: 800,  aspectRatio: '1:1',     maxFileSizeMB: 1,   acceptedFormats: ['jpg','png','webp'], priority: 'core' },
  { id: 'web-product-gallery',   mediaType: 'image', category: 'product-card', platform: 'web', name: 'Product Gallery',        nameZh: '商品详情图',           width: 1500, height: 1500, aspectRatio: '1:1',     maxFileSizeMB: 2,   acceptedFormats: ['jpg','png','webp'], priority: 'standard' },
  { id: 'web-blog-cover',        mediaType: 'image', category: 'thumbnail',    platform: 'web', name: 'Blog Featured Image',    nameZh: '博客封面图',           width: 1200, height: 630,  aspectRatio: '1.91:1',  maxFileSizeMB: 2,   acceptedFormats: ['jpg','png','webp'], notes: 'Open Graph 默认规格', priority: 'core' },

  // ── Email ────────────────────────────────────────────────────────────────
  { id: 'email-header',          mediaType: 'image', category: 'email-header', platform: 'email', name: 'Email Header',         nameZh: 'EDM 头图',           width: 600,  height: 200,  aspectRatio: '3:1',    maxFileSizeMB: 1,   acceptedFormats: ['jpg','png','gif'], notes: 'EDM 宽度普遍按 600px 设计', priority: 'core', iGamingRelevant: true },
  { id: 'email-hero',            mediaType: 'image', category: 'email-header', platform: 'email', name: 'Email Hero Block',     nameZh: 'EDM 主视觉区',       width: 600,  height: 400,  aspectRatio: '3:2',    maxFileSizeMB: 1,   acceptedFormats: ['jpg','png','gif'], priority: 'standard' },

  // ── App Store — iOS ──────────────────────────────────────────────────────
  { id: 'ios-app-icon',          mediaType: 'image', category: 'app-icon',       platform: 'app-store-ios', name: 'iOS App Icon',         nameZh: 'iOS 应用图标',        width: 1024, height: 1024, aspectRatio: '1:1',   acceptedFormats: ['png'], notes: '不能带 alpha 通道', priority: 'niche' },
  { id: 'ios-screenshot-67',     mediaType: 'image', category: 'app-screenshot', platform: 'app-store-ios', name: 'iPhone 6.7" Screenshot',nameZh: 'iPhone 6.7" 截图',  width: 1290, height: 2796, aspectRatio: '9:19.5', acceptedFormats: ['jpg','png'], priority: 'niche' },
  { id: 'ios-screenshot-65',     mediaType: 'image', category: 'app-screenshot', platform: 'app-store-ios', name: 'iPhone 6.5" Screenshot',nameZh: 'iPhone 6.5" 截图',  width: 1242, height: 2688, aspectRatio: '9:19.5', acceptedFormats: ['jpg','png'], priority: 'niche' },

  // ── App Store — Android (Google Play) ────────────────────────────────────
  { id: 'android-icon',          mediaType: 'image', category: 'app-icon',       platform: 'app-store-android', name: 'Play Store App Icon',   nameZh: 'Play 应用图标',       width: 512,  height: 512,  aspectRatio: '1:1',  acceptedFormats: ['png'], priority: 'niche' },
  { id: 'android-feature',       mediaType: 'image', category: 'app-feature',    platform: 'app-store-android', name: 'Play Feature Graphic',  nameZh: 'Play 特色图',         width: 1024, height: 500,  aspectRatio: '2.05:1', acceptedFormats: ['jpg','png'], priority: 'niche' },
  { id: 'android-screenshot',    mediaType: 'image', category: 'app-screenshot', platform: 'app-store-android', name: 'Android Phone Screenshot', nameZh: 'Android 手机截图', width: 1080, height: 1920, aspectRatio: '9:16', acceptedFormats: ['jpg','png'], priority: 'niche' },

  // ── Universal / Reference ────────────────────────────────────────────────
  { id: 'universal-square',      mediaType: 'image', category: 'social-post',  platform: 'universal', name: 'Universal Square',     nameZh: '通用方图',         width: 2048, height: 2048, aspectRatio: '1:1',  acceptedFormats: ['jpg','png','webp'], notes: '跨平台通用高分辨率', priority: 'standard' },
  { id: 'universal-vertical',    mediaType: 'image', category: 'social-story', platform: 'universal', name: 'Universal Vertical',   nameZh: '通用竖图',         width: 1080, height: 1920, aspectRatio: '9:16', acceptedFormats: ['jpg','png','webp'], priority: 'standard' },
  { id: 'universal-landscape',   mediaType: 'image', category: 'social-post',  platform: 'universal', name: 'Universal Landscape',  nameZh: '通用横图',         width: 1920, height: 1080, aspectRatio: '16:9', acceptedFormats: ['jpg','png','webp'], priority: 'standard' },
]

// ────────────────────────────────────────────────────────────────────────────
// Indexes & Helpers
// ────────────────────────────────────────────────────────────────────────────

/** Look up a spec by id (O(1) via map). Returns undefined if missing. */
const _specIndex = new Map(ASSET_SPECS.map(s => [s.id, s]))
export function findSpecById(id: string): AssetSpec | undefined {
  return _specIndex.get(id)
}

/** All specs of a given media type */
export function getSpecsByMediaType(mediaType: AssetMediaType): AssetSpec[] {
  return ASSET_SPECS.filter(s => s.mediaType === mediaType)
}

/** All specs for a platform */
export function getSpecsByPlatform(platform: Platform): AssetSpec[] {
  return ASSET_SPECS.filter(s => s.platform === platform)
}

/** All specs within a category */
export function getSpecsByCategory(category: AssetCategory): AssetSpec[] {
  return ASSET_SPECS.filter(s => s.category === category)
}

/** Default picker entries: high-priority, deduped by visual "shape" */
export const CORE_SPECS: AssetSpec[] = ASSET_SPECS.filter(s => s.priority === 'core')

/** iGaming-flagged specs (for vertical-specific picker) */
export const IGAMING_SPECS: AssetSpec[] = ASSET_SPECS.filter(s => s.iGamingRelevant)

/** Group specs by platform for navigation UIs */
export function groupSpecsByPlatform(): Record<Platform, AssetSpec[]> {
  const groups = {} as Record<Platform, AssetSpec[]>
  for (const spec of ASSET_SPECS) {
    if (!groups[spec.platform]) groups[spec.platform] = []
    groups[spec.platform].push(spec)
  }
  return groups
}

/**
 * Validate a produced asset against its target spec.
 * Returns { ok: true } or { ok: false, errors: [...] }
 */
export interface AssetValidationResult {
  ok: boolean
  errors: string[]
  warnings: string[]
}

/**
 * @deprecated Use `validateAssetAgainstSpec` from `@/lib/specValidator`.
 *
 * This wrapper exists only to keep older callers compiling. It downgrades the
 * rich `ValidationReport` (severity, codes, fix suggestions, score) into the
 * legacy {ok, errors, warnings} shape. New code MUST import the validator
 * directly to get the full report.
 *
 * ADL: stability > novelty — we did NOT delete the old function. Any existing
 * import path keeps working; only the implementation rerouted.
 */
export function validateAsset(
  produced: {
    width: number
    height: number
    durationSec?: number
    fileSizeMB?: number
    format?: string
  },
  spec: AssetSpec,
): AssetValidationResult {
  // Lazy import to break the import cycle (specValidator imports AssetSpec
  // from this file). At runtime this resolves cleanly because Node caches
  // both modules after first load.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { validateAssetAgainstSpec } = require('./specValidator') as typeof import('./specValidator')
  const report = validateAssetAgainstSpec(
    {
      width: produced.width,
      height: produced.height,
      durationSec: produced.durationSec,
      fileSizeMB: produced.fileSizeMB,
      format: produced.format,
      mediaType: spec.mediaType,
    },
    spec,
  )
  const errors: string[] = []
  const warnings: string[] = []
  for (const v of report.violations) {
    const line = `${v.field}: ${v.message}${v.fix ? ` — ${v.fix}` : ''}`
    if (v.severity === 'blocker') errors.push(line)
    else if (v.severity === 'warning') warnings.push(line)
  }
  return { ok: report.ok, errors, warnings }
}
