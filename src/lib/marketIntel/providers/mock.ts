/**
 * Mock MarketIntelProvider — deterministic fixtures.
 *
 * Purpose: unblock downstream generation (marketing recommendations)
 * before the Insightrackr contract lands.  Everything here is PLAUSIBLE
 * but FAKE — don't mix it into any user-facing claim without the
 * `mock` source tag.
 *
 * The data is hand-picked to reflect what the iGaming verticals
 * actually look like in the wild (top brands, common creative hooks,
 * typical CTA patterns), not random nonsense — this makes end-to-end
 * testing of the recommendation pipeline meaningful.
 */
import type {
  CreativePattern,
  GeoHotspot,
  MarketIntelProvider,
  TopAdvertiser,
  Vertical,
  VerticalIntel,
} from '../types'

type Fixture = {
  topAdvertisers: TopAdvertiser[]
  creativePatterns: CreativePattern[]
  trendingFeatures: string[]
  ctaPatterns: string[]
  geoHotspots: GeoHotspot[]
}

const FIXTURES: Record<Vertical, Fixture> = {
  'Sports Betting': {
    topAdvertisers: [
      {
        name: 'Bet365',
        topChannels: ['Meta', 'YouTube', 'Google Search'],
        shareOfVoice: 24,
        topGeos: ['GB', 'DE', 'BR', 'AU'],
      },
      {
        name: 'DraftKings',
        topChannels: ['Meta', 'TikTok', 'ESPN Network'],
        shareOfVoice: 18,
        topGeos: ['US', 'CA'],
      },
      {
        name: 'FanDuel',
        topChannels: ['Meta', 'YouTube', 'Twitter/X'],
        shareOfVoice: 17,
        topGeos: ['US'],
      },
      {
        name: 'Bwin',
        topChannels: ['Meta', 'Google Display'],
        shareOfVoice: 9,
        topGeos: ['DE', 'AT', 'IT', 'ES'],
      },
    ],
    creativePatterns: [
      {
        label: 'Live odds countdown hook',
        format: 'video',
        frequency: 38,
        hookPattern:
          'Opens on fast-cut sports footage, odds tile slams in with a ticking countdown, voiceover promises "live in 30 seconds"',
        ctas: ['Bet Now', 'See Live Odds'],
      },
      {
        label: 'Welcome bonus stacker',
        format: 'static',
        frequency: 27,
        hookPattern:
          'Large "Up to $1,000" headline with stacked chip/coin imagery, logo tight in corner, legal disclaimer bottom bar',
        ctas: ['Claim Bonus', 'Sign Up'],
      },
      {
        label: 'Same-game parlay builder demo',
        format: 'video',
        frequency: 15,
        hookPattern:
          'Screencap of parlay builder UI with 3 picks clicked in sequence, odds update on each click, ends on potential payout',
        ctas: ['Build Your Parlay', 'Try It Free'],
      },
    ],
    trendingFeatures: [
      'Same-game parlays',
      'Early cash out',
      'Live streaming built-in',
      'Boosted odds of the day',
      'Micro-betting (next play / next pitch)',
    ],
    ctaPatterns: ['Bet Now', 'Claim Your Bonus', 'Sign Up & Get $X', 'See Live Odds'],
    geoHotspots: [
      { country: 'US', reason: 'State-by-state legalization wave', weight: 95 },
      { country: 'BR', reason: 'Newly regulated market 2025', weight: 82 },
      { country: 'CA', reason: 'Ontario iGaming expansion', weight: 61 },
    ],
  },
  Casino: {
    topAdvertisers: [
      {
        name: 'LeoVegas',
        topChannels: ['Meta', 'Google Display'],
        shareOfVoice: 14,
        topGeos: ['SE', 'DE', 'IT', 'CA'],
      },
      {
        name: 'Casumo',
        topChannels: ['Meta', 'YouTube'],
        shareOfVoice: 11,
        topGeos: ['GB', 'DE', 'FI'],
      },
      {
        name: '888 Casino',
        topChannels: ['Google Search', 'Meta'],
        shareOfVoice: 10,
        topGeos: ['GB', 'ES', 'IT'],
      },
    ],
    creativePatterns: [
      {
        label: 'Big-win reel montage',
        format: 'video',
        frequency: 41,
        hookPattern:
          'Rapid cut between slot reels hitting, coin shower, player reaction shot, ends with branded logo + bonus stack',
        ctas: ['Play Now', 'Spin & Win'],
      },
      {
        label: 'Deposit match headline',
        format: 'static',
        frequency: 29,
        hookPattern:
          '"100% up to €500" center text on dark gradient background, subtle game icons floating behind',
        ctas: ['Claim 100% Match', 'Get Bonus'],
      },
    ],
    trendingFeatures: [
      'Cashback on losses',
      'Loyalty tiers with physical rewards',
      'Pragmatic Play live casino integration',
      'Crypto deposits',
    ],
    ctaPatterns: ['Play Now', 'Claim Bonus', 'Spin for Real', 'Join the Club'],
    geoHotspots: [
      { country: 'DE', reason: 'Post-GlüStV market normalization', weight: 71 },
      { country: 'BR', reason: 'Newly regulated market 2025', weight: 68 },
    ],
  },
  Slots: {
    topAdvertisers: [
      {
        name: 'Jackpot.com',
        topChannels: ['Meta', 'TikTok'],
        shareOfVoice: 13,
        topGeos: ['GB', 'US'],
      },
      {
        name: 'Slotomania',
        topChannels: ['Meta', 'App Store Search Ads'],
        shareOfVoice: 22,
        topGeos: ['US', 'GB', 'DE'],
      },
    ],
    creativePatterns: [
      {
        label: 'Near-miss jackpot tease',
        format: 'video',
        frequency: 44,
        hookPattern:
          'Reel stops 1 symbol short of jackpot, voice "SO CLOSE!", cut to branded slot game, ends on "3M free coins"',
        ctas: ['Play Free', 'Install Now'],
      },
    ],
    trendingFeatures: ['Daily free spins', 'Tournament leaderboards', 'Megaways mechanics'],
    ctaPatterns: ['Play Free', 'Install Now', 'Claim Free Coins'],
    geoHotspots: [
      { country: 'US', reason: 'Social casino dominant vertical', weight: 90 },
    ],
  },
  Poker: {
    topAdvertisers: [
      {
        name: 'PokerStars',
        topChannels: ['YouTube', 'Twitch', 'Meta'],
        shareOfVoice: 38,
        topGeos: ['GB', 'DE', 'BR', 'ES'],
      },
      {
        name: 'GGPoker',
        topChannels: ['Twitch', 'YouTube'],
        shareOfVoice: 24,
        topGeos: ['GB', 'DE', 'BR'],
      },
    ],
    creativePatterns: [
      {
        label: 'Pro player POV hand',
        format: 'video',
        frequency: 33,
        hookPattern:
          'Over-the-shoulder pro player holding pocket aces, tension music, reveal on river, branded hand history overlay',
        ctas: ['Play Poker', 'Join a Table'],
      },
    ],
    trendingFeatures: [
      'Daily freeroll tournaments',
      'Spin & Go lottery-style SNGs',
      'Hand replay / HUD tools',
    ],
    ctaPatterns: ['Play Poker', 'Join a Table', 'Download Now'],
    geoHotspots: [
      { country: 'BR', reason: 'Fastest-growing poker market 2025', weight: 78 },
    ],
  },
  Lottery: {
    topAdvertisers: [
      {
        name: 'Lottoland',
        topChannels: ['Meta', 'Google Display'],
        shareOfVoice: 31,
        topGeos: ['GB', 'DE', 'AU'],
      },
    ],
    creativePatterns: [
      {
        label: 'Jackpot size shock',
        format: 'static',
        frequency: 52,
        hookPattern:
          'Massive "$412,000,000" headline on dark background, ticket graphic, "Draws tonight" timer',
        ctas: ['Buy Ticket', 'Play Now'],
      },
    ],
    trendingFeatures: ['Syndicate play', 'Auto-play subscriptions', 'Instant win scratchcards'],
    ctaPatterns: ['Buy Ticket', 'Play Now', 'Join Syndicate'],
    geoHotspots: [
      { country: 'DE', reason: 'Eurojackpot expansion', weight: 64 },
    ],
  },
  Esports: {
    topAdvertisers: [
      {
        name: 'Rivalry',
        topChannels: ['Twitch', 'Twitter/X', 'Discord'],
        shareOfVoice: 19,
        topGeos: ['CA', 'DE', 'BR'],
      },
      {
        name: 'Thunderpick',
        topChannels: ['Twitch', 'Reddit'],
        shareOfVoice: 14,
        topGeos: ['DE', 'NL', 'BR'],
      },
    ],
    creativePatterns: [
      {
        label: 'Match odds with hero/agent art',
        format: 'static',
        frequency: 47,
        hookPattern:
          'Team logos left/right, official hero art behind, live odds bar center, "Bet now" chip bottom',
        ctas: ['Bet the Match', 'See Odds'],
      },
    ],
    trendingFeatures: ['In-match live betting', 'CS2 round-by-round markets', 'Crypto-native deposits'],
    ctaPatterns: ['Bet the Match', 'See Live Odds', 'Sign Up'],
    geoHotspots: [
      { country: 'BR', reason: 'Huge CS2 viewership base', weight: 82 },
    ],
  },
  'Fantasy Sports': {
    topAdvertisers: [
      {
        name: 'DraftKings DFS',
        topChannels: ['Meta', 'YouTube'],
        shareOfVoice: 41,
        topGeos: ['US', 'CA'],
      },
      {
        name: 'Underdog Fantasy',
        topChannels: ['Meta', 'TikTok', 'Reddit'],
        shareOfVoice: 22,
        topGeos: ['US'],
      },
    ],
    creativePatterns: [
      {
        label: 'Lineup builder speedrun',
        format: 'video',
        frequency: 36,
        hookPattern:
          'Phone screen recording: user drafts 6 players in under 15 seconds, confetti on submit',
        ctas: ['Draft Your Team', 'Play For Free'],
      },
    ],
    trendingFeatures: ['Pick\'em contests (vs survivor pools)', 'Same-game pick bundles', 'Instant payouts'],
    ctaPatterns: ['Draft Now', 'Play Free Contest', 'Enter Lineup'],
    geoHotspots: [
      { country: 'US', reason: 'Pick\'em legal workaround rollout', weight: 88 },
    ],
  },
  Bingo: {
    topAdvertisers: [
      {
        name: 'Tombola',
        topChannels: ['TV', 'Meta', 'YouTube'],
        shareOfVoice: 36,
        topGeos: ['GB', 'IT', 'ES'],
      },
    ],
    creativePatterns: [
      {
        label: 'Community chat highlight',
        format: 'video',
        frequency: 29,
        hookPattern:
          'Players chatting in-app while numbers are called, warm lo-fi music, ends on "Come join us tonight"',
        ctas: ['Play Bingo', 'Join the Room'],
      },
    ],
    trendingFeatures: ['Themed bingo rooms', 'Chat host hosts', '90-ball + 75-ball hybrid rooms'],
    ctaPatterns: ['Play Bingo', 'Join the Room', 'Claim Free Tickets'],
    geoHotspots: [
      { country: 'GB', reason: 'Core bingo audience', weight: 90 },
    ],
  },
  'Live Dealer': {
    topAdvertisers: [
      {
        name: 'Evolution Gaming (operators)',
        topChannels: ['Meta', 'YouTube'],
        shareOfVoice: 28,
        topGeos: ['GB', 'DE', 'CA'],
      },
    ],
    creativePatterns: [
      {
        label: 'Dealer ASMR intro',
        format: 'video',
        frequency: 31,
        hookPattern:
          'Close-up of dealer shuffling cards, warm lighting, invites viewer directly to camera, card flip on CTA',
        ctas: ['Play Live', 'Take a Seat'],
      },
    ],
    trendingFeatures: ['Crazy Time game show', 'Lightning Roulette multipliers', 'Dual-camera tables'],
    ctaPatterns: ['Play Live', 'Take a Seat', 'Join the Table'],
    geoHotspots: [
      { country: 'DE', reason: 'Live dealer remains legal under new framework', weight: 66 },
    ],
  },
  'Crash Games': {
    topAdvertisers: [
      {
        name: 'Stake',
        topChannels: ['Twitch', 'YouTube', 'Twitter/X'],
        shareOfVoice: 44,
        topGeos: ['BR', 'CA', 'DE'],
      },
      {
        name: 'Roobet',
        topChannels: ['Twitch', 'Kick'],
        shareOfVoice: 21,
        topGeos: ['CA', 'BR'],
      },
    ],
    creativePatterns: [
      {
        label: 'Multiplier climb screenshot',
        format: 'static',
        frequency: 49,
        hookPattern:
          'Game UI at 127.45x multiplier, "cashed out" tag, side panel showing +$12,745, bright colors',
        ctas: ['Play Crash', 'Sign Up & Play'],
      },
    ],
    trendingFeatures: ['Auto cashout rules', 'Bankroll streaming on Twitch', 'Multi-bet strategies'],
    ctaPatterns: ['Play Crash', 'Join the Game', 'Sign Up & Play'],
    geoHotspots: [
      { country: 'BR', reason: 'Crash is the top Brazilian iGaming category', weight: 93 },
    ],
  },
}

export class MockMarketIntelProvider implements MarketIntelProvider {
  readonly name = 'mock'

  async fetchVerticalIntel(vertical: Vertical): Promise<VerticalIntel> {
    const f = FIXTURES[vertical]
    return {
      vertical,
      source: this.name,
      generatedAt: new Date().toISOString(),
      topAdvertisers: f.topAdvertisers,
      creativePatterns: f.creativePatterns,
      trendingFeatures: f.trendingFeatures,
      ctaPatterns: f.ctaPatterns,
      geoHotspots: f.geoHotspots,
      coverageNote:
        'deterministic fixture — do not quote as ground truth in user-facing output',
    }
  }
}
