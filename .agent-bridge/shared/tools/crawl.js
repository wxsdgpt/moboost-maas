#!/usr/bin/env node
/**
 * crawl.js — Playwright 深度爬取工具
 * ====================================
 * 用法: node crawl.js <url> [--screenshot] [--full-page] [--wait <ms>]
 * 
 * 输出: JSON { title, url, text, html, screenshot?, links[] }
 * 
 * 最强爬取层：完整 JS 渲染、SPA 支持、截图、链接提取
 * 适合：竞品官网、Facebook 广告库、动态加载页面
 */

const { chromium } = require('playwright');

async function crawl(url, options = {}) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      viewport: { width: 1440, height: 900 },
      locale: 'en-US',
    });

    const page = await context.newPage();
    
    // 拦截不必要的资源加速加载
    if (!options.screenshot) {
      await page.route('**/*.{png,jpg,jpeg,gif,svg,mp4,webm,woff,woff2,ttf}', route => route.abort());
    }

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // 等待额外渲染时间
    if (options.wait) {
      await page.waitForTimeout(options.wait);
    } else {
      await page.waitForTimeout(2000);
    }

    // 自动滚动以触发懒加载
    await autoScroll(page);

    // 提取数据
    const data = await page.evaluate(() => {
      // 移除脚本和样式
      document.querySelectorAll('script, style, noscript, svg, iframe').forEach(el => el.remove());
      
      // 提取正文
      const text = document.body.innerText
        .replace(/\n{3,}/g, '\n\n')
        .substring(0, 50000);
      
      // 提取所有链接
      const links = Array.from(document.querySelectorAll('a[href]'))
        .map(a => ({ text: a.innerText.trim().substring(0, 100), href: a.href }))
        .filter(l => l.href.startsWith('http') && l.text.length > 0)
        .slice(0, 100);

      // 提取 meta 信息
      const meta = {};
      document.querySelectorAll('meta[name], meta[property]').forEach(m => {
        const key = m.getAttribute('name') || m.getAttribute('property');
        if (key) meta[key] = m.getAttribute('content');
      });

      return {
        title: document.title,
        url: window.location.href,
        text,
        meta,
        links,
        html: document.documentElement.outerHTML.substring(0, 100000)
      };
    });

    // 截图
    if (options.screenshot) {
      const screenshotPath = options.screenshotPath || '/tmp/crawl-screenshot.png';
      await page.screenshot({
        path: screenshotPath,
        fullPage: !!options.fullPage
      });
      data.screenshot = screenshotPath;
    }

    return data;
  } finally {
    await browser.close();
  }
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 500;
      const maxScrolls = 10;
      let scrolls = 0;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;
        scrolls++;
        if (totalHeight >= document.body.scrollHeight || scrolls >= maxScrolls) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, 200);
    });
  });
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node crawl.js <url> [--screenshot [path]] [--full-page] [--wait <ms>]');
    process.exit(1);
  }

  const url = args[0];
  const options = {
    screenshot: args.includes('--screenshot'),
    fullPage: args.includes('--full-page'),
    wait: args.includes('--wait') ? parseInt(args[args.indexOf('--wait') + 1]) : null,
    screenshotPath: null,
  };
  
  if (options.screenshot) {
    const idx = args.indexOf('--screenshot');
    if (args[idx + 1] && !args[idx + 1].startsWith('--')) {
      options.screenshotPath = args[idx + 1];
    }
  }

  try {
    const result = await crawl(url, options);
    // 输出 JSON（不含 html 以减少体积）
    const output = { ...result };
    delete output.html;
    console.log(JSON.stringify(output, null, 2));
  } catch (err) {
    console.error(JSON.stringify({ error: err.message, url }));
    process.exit(1);
  }
}

main();

module.exports = { crawl };
