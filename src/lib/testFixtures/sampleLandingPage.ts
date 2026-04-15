/**
 * Test fixture: a realistic landing page HTML sample.
 *
 * Shape & complexity mirror what /api/landing/generate produces:
 *   - Full <!DOCTYPE>..</html> document
 *   - Inline <style> (no external CSS)
 *   - Hero, CTA, feature grid, comparison table, footer
 *   - Uses external font from a CDN and a placeholder image (https)
 *
 * Used by /test/preview and /test/video to verify the preview pipeline
 * without needing a live report / brief-execute run.
 */

export const SAMPLE_LANDING_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BetMaster Pro — For Serious Sports Bettors</title>
<style>
  :root {
    --black: #0b0b0c;
    --accent-dark: #1a1a1a;
    --brand: #00d26a;
    --brand-dim: #00a354;
    --white: #ffffff;
    --gray-soft: #f5f5f7;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", Inter, Arial, sans-serif;
    color: var(--white);
    background: var(--black);
    line-height: 1.5;
  }
  .hero {
    padding: 64px 24px 48px;
    text-align: center;
    background: linear-gradient(180deg, #0b0b0c 0%, #1a1a1a 100%);
  }
  .eyebrow {
    color: var(--brand);
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1.2px;
    margin-bottom: 12px;
  }
  h1 {
    font-size: 40px;
    font-weight: 700;
    line-height: 1.1;
    margin-bottom: 16px;
    letter-spacing: -0.5px;
  }
  .sub {
    font-size: 17px;
    color: rgba(255,255,255,0.68);
    max-width: 560px;
    margin: 0 auto 28px;
  }
  .cta {
    display: inline-block;
    background: var(--brand);
    color: var(--black);
    padding: 14px 36px;
    font-size: 16px;
    font-weight: 600;
    text-decoration: none;
    border-radius: 980px;
    transition: background 0.2s;
  }
  .cta:hover { background: var(--brand-dim); }

  .features {
    padding: 48px 24px;
    background: var(--accent-dark);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 20px;
    max-width: 960px;
    margin: 0 auto;
  }
  .card {
    background: rgba(255,255,255,0.04);
    padding: 24px;
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,0.08);
  }
  .card-icon {
    width: 32px; height: 32px;
    background: var(--brand);
    border-radius: 8px;
    margin-bottom: 12px;
  }
  .card h3 { font-size: 16px; margin-bottom: 6px; }
  .card p { font-size: 14px; color: rgba(255,255,255,0.6); }

  .comp-table { width: 100%; border-collapse: collapse; max-width: 720px; margin: 32px auto; }
  .comp-table th, .comp-table td {
    padding: 14px 16px;
    text-align: left;
    border-bottom: 1px solid rgba(255,255,255,0.08);
    font-size: 14px;
  }
  .comp-table thead tr {
    background: var(--black);
    color: var(--white);
    border-radius: 12px;
  }

  footer {
    padding: 32px 24px;
    text-align: center;
    color: rgba(255,255,255,0.35);
    font-size: 12px;
    border-top: 1px solid rgba(255,255,255,0.06);
  }

  @media (max-width: 640px) {
    h1 { font-size: 30px; }
    .hero { padding: 48px 20px 36px; }
  }
</style>
</head>
<body>
  <section class="hero">
    <div class="eyebrow">For 28–40 Year-Old Pros</div>
    <h1>Bet Smarter. Win Bigger.</h1>
    <p class="sub">
      The only sportsbook built for analytical bettors. Advanced stats,
      faster payouts, deeper markets.
    </p>
    <a href="#signup" class="cta">Claim $500 Welcome Bonus →</a>
  </section>

  <section class="features">
    <div class="grid">
      <div class="card">
        <div class="card-icon"></div>
        <h3>Live Odds API</h3>
        <p>Real-time line movement across 40+ sportsbooks, refreshed every 200ms.</p>
      </div>
      <div class="card">
        <div class="card-icon"></div>
        <h3>AI Prop Research</h3>
        <p>Player-prop insights powered by 10 years of historical play-by-play data.</p>
      </div>
      <div class="card">
        <div class="card-icon"></div>
        <h3>24h Payouts</h3>
        <p>Withdrawals hit your bank or crypto wallet within 24 hours, guaranteed.</p>
      </div>
      <div class="card">
        <div class="card-icon"></div>
        <h3>Licensed in NJ, PA, CO</h3>
        <p>Fully regulated in priority states. Bet with confidence.</p>
      </div>
    </div>

    <table class="comp-table">
      <thead>
        <tr>
          <th>Feature</th>
          <th>BetMaster Pro</th>
          <th>Legacy Books</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>Avg payout time</td><td>&lt; 24h</td><td>3–7 days</td></tr>
        <tr><td>Markets per game</td><td>300+</td><td>80</td></tr>
        <tr><td>Sign-up bonus</td><td>Up to $500</td><td>$50</td></tr>
        <tr><td>Mobile app rating</td><td>4.8 ★</td><td>3.4 ★</td></tr>
      </tbody>
    </table>
  </section>

  <footer>
    © 2026 BetMaster Pro · 21+ · Please gamble responsibly · 1-800-GAMBLER
  </footer>

  <script>
    // Prove scripts run inside the iframe sandbox.
    document.addEventListener('click', (e) => {
      const target = e.target;
      if (target && target.classList && target.classList.contains('cta')) {
        e.preventDefault();
        target.textContent = 'Thanks! ✓ (clicked inside preview)';
      }
    });
  </script>
</body>
</html>`
