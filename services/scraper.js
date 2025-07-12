
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const cron = require('node-cron');
const Match = require('../models/Match');
const { pubsub } = require('../resolvers');
const fs = require('fs');
const path = require('path');

// ✅ Sleep utility to slow down scraping
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Define absolute paths for file saving
const projectDir = path.resolve(__dirname, '..');
const screenshotsDir = path.join(projectDir, 'screenshots');
const htmlDir = path.join(projectDir, 'html');

// Ensure directories exist
if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir);
if (!fs.existsSync(htmlDir)) fs.mkdirSync(htmlDir);

async function scrapeSport(page, sport, url) {
  try {
    console.log(`Navigating to ${sport} at ${url}...`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 0 });

    // ✅ Log failed requests
    page.on('requestfailed', request => {
      console.warn('Request failed:', request.url(), request.failure());
    });

    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err));

    // Block unnecessary resources
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (['image', 'stylesheet', 'font', 'script'].includes(request.resourceType()) &&
        (request.url().includes('googleapis.com') || 
         request.url().includes('googletagmanager.com') || 
         request.url().includes('ads') || 
         request.url().includes('facebook.net'))) {
      request.abort();
    } else {
      request.continue();
    }
  });

    // Wait for match elements
    console.log(`Waiting for .table-f elements for ${sport}...`);
    try {
      await page.waitForSelector('.table-f', { timeout: 15000 });
      console.log(`✅ .table-f found for ${sport}`);
    } catch {
      console.warn(`❌ .table-f NOT found for ${sport}`);
    }

    // Scroll to trigger dynamic content
    await page.evaluate(() => window.scrollBy(0, document.body.scrollHeight));
    await sleep(3000);  // ✅ Short delay to ensure content loads

    // Save screenshot and HTML
    const screenshotPath = path.join(screenshotsDir, `screenshot-${sport}.png`);
    const htmlPath = path.join(htmlDir, `page-${sport}.html`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Screenshot saved to ${screenshotPath}`);
    const content = await page.content();
    fs.writeFileSync(htmlPath, content);
    console.log(`Page content saved to ${htmlPath}`);

    return await page.evaluate(sport => {
      const matchElements = document.querySelectorAll('.table-f');
      return Array.from(matchElements).map(match => {
        const homeTeam = match.querySelector('.sports-table__home')?.innerText.trim() || '';
        const awayTeam = match.querySelector('.sports-table__away')?.innerText.trim() || '';
        const teams = [homeTeam, awayTeam].filter(team => team);
        const time = match.querySelector('.sports-table__time time')?.innerText.trim() || '';

        // Score extraction
        let score = '0-0';
        if (sport === 'soccer') {
          const scoreHome = match.querySelector('.sports-table__score-home')?.innerText.trim() || '0';
          const scoreAway = match.querySelector('.sports-table__score-away')?.innerText.trim() || '0';
          score = `${scoreHome}-${scoreAway}`;
        } else {
          const scoreHome = match.querySelector('.sports-table__pts .sports-table__score-home')?.innerText.trim() || '0';
          const scoreAway = match.querySelector('.sports-table__pts .sports-table__score-away')?.innerText.trim() || '0';
          score = `${scoreHome}-${scoreAway}`;
        }

        // Odds extraction
        const odds = { home: 0, draw: 0, away: 0 };
        if (sport === 'soccer' || sport === 'handball') {
          odds.home = parseFloat(match.querySelector('.sports-table__odds-item[id$="_sign-1"] .odd-container')?.innerText || 0);
          odds.draw = parseFloat(match.querySelector('.sports-table__odds-item[id$="_sign-X"] .odd-container')?.innerText || 0);
          odds.away = parseFloat(match.querySelector('.sports-table__odds-item[id$="_sign-2"] .odd-container')?.innerText || 0);
        } else {
          odds.home = parseFloat(match.querySelector('.sports-table__odds-item[id*="_sign-1"], .sports-table__odds-item[id*="_sign-1HH"]')?.querySelector('.odd-container')?.innerText || 0);
          odds.away = parseFloat(match.querySelector('.sports-table__odds-item[id*="_sign-2"], .sports-table__odds-item[id*="_sign-2HH"]')?.querySelector('.odd-container')?.innerText || 0);
        }

        return { teams, score, odds, time, sport };
      }).filter(match => match.teams.length === 2);
    }, sport);
  } catch (err) {
    console.error(`Error scraping ${sport}:`, err.message);
    return [];
  }
}

async function scrapeBet9ja() {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      ignoreHTTPSErrors: true,
      args: ['--ignore-certificate-errors', '--disable-web-security', '--no-http2'],
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(120000);  // ✅ Increased timeout
    await page.setViewport({ width: 1280, height: 800 });
    // await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)...');
     await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
     await page.setExtraHTTPHeaders({
     'Accept-Language': 'en-US,en;q=0.9',
     'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
     });
    const sports = [
      { name: 'soccer', url: 'https://sports.bet9ja.com/liveCompetitions/3000001' },
      { name: 'tennis', url: 'https://sports.bet9ja.com/liveCompetitions/3000005' },
      { name: 'basketball', url: 'https://sports.bet9ja.com/liveCompetitions/3000002' },
      { name: 'volleyball', url: 'https://sports.bet9ja.com/liveCompetitions/3000023' },
      { name: 'handball', url: 'https://sports.bet9ja.com/liveCompetitions/3000006' },
      { name: 'snooker', url: 'https://sports.bet9ja.com/liveCompetitions/3000019' },
      { name: 'table-tennis', url: 'https://sports.bet9ja.com/liveCompetitions/3000020' },
    ];

    let allMatches = [];
    for (const { name, url } of sports) {
      const matches = await scrapeSport(page, name, url);
      allMatches = allMatches.concat(matches);
      await sleep(5000);  // ✅ Slow down requests
    }

    const seen = new Set();
    const uniqueMatches = allMatches.filter(match => {
      const key = `${match.teams.join('|')}|${match.time}|${match.sport}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    console.log('Scraped matches:', uniqueMatches);

    for (const matchData of uniqueMatches) {
      const match = await Match.findOne({ teams: matchData.teams, sport: matchData.sport });
      if (match) {
        match.score = matchData.score;
        match.odds = matchData.odds;
        match.time = matchData.time;
        match.updatedAt = new Date();
        await match.save();
        pubsub.publish('MATCH_UPDATED', { matchUpdated: match });
      } else {
        const newMatch = new Match(matchData);
        await newMatch.save();
        pubsub.publish('MATCH_UPDATED', { matchUpdated: newMatch });
      }
    }
  } catch (err) {
    console.error('Scraping error:', err.message);
  } finally {
    if (browser) await browser.close();
  }
}

function startScraper() {
  cron.schedule('*/5 * * * *', () => {
    console.log('Scraping Bet9ja...');
    scrapeBet9ja();
  });
}

module.exports = { startScraper };




// const puppeteer = require('puppeteer-extra');
// const StealthPlugin = require('puppeteer-extra-plugin-stealth');
// puppeteer.use(StealthPlugin());

// const cron = require('node-cron');
// const Match = require('../models/Match');
// const { pubsub } = require('../resolvers');
// const fs = require('fs');
// const path = require('path');

// // ✅ Sleep utility to slow down scraping
// function sleep(ms) {
//   return new Promise(resolve => setTimeout(resolve, ms));
// }

// // Define absolute paths for file saving
// const projectDir = path.resolve(__dirname, '..');
// const screenshotsDir = path.join(projectDir, 'screenshots');
// const htmlDir = path.join(projectDir, 'html');

// // Ensure directories exist
// if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir);
// if (!fs.existsSync(htmlDir)) fs.mkdirSync(htmlDir);

// async function scrapeSport(page, sport, url) {
//   try {
//     console.log(`Navigating to ${sport} at ${url}...`);
//     let attempts = 0;
//     const maxAttempts = 3;
//     while (attempts < maxAttempts) {
//       try {
//         await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
//         break; // Success, exit retry loop
//       } catch (navError) {
//         attempts++;
//         console.warn(`Navigation attempt ${attempts} failed for ${sport}:`, navError.message);
//         if (attempts === maxAttempts) throw navError;
//         await sleep(5000); // Wait before retrying
//       }
//     }

//     // ✅ Log failed requests
//     page.on('requestfailed', request => {
//       console.warn('Request failed:', request.url(), request.failure());
//     });

//     // Wait for match elements
//     console.log(`Waiting for .table-f elements for ${sport}...`);
//     try {
//       await page.waitForSelector('.table-f', { timeout: 30000 });
//       console.log(`✅ .table-f found for ${sport}`);
//     } catch {
//       console.warn(`❌ .table-f NOT found for ${sport}`);
//       // Log alternative selectors for debugging
//       const selectors = await page.evaluate(() => {
//         const classes = Array.from(document.querySelectorAll('*')).map(el => el.className).filter(c => c.includes('table') || c.includes('sport'));
//         return [...new Set(classes)];
//       });
//       console.log(`Possible alternative selectors for ${sport}:`, selectors);
//     }

//     // Scroll to trigger dynamic content
//     await page.evaluate(() => window.scrollBy(0, document.body.scrollHeight));
//     await sleep(5000); // Increased to 5 seconds for more reliable loading

//     // Save screenshot and HTML
//     const screenshotPath = path.join(screenshotsDir, `screenshot-${sport}.png`);
//     const htmlPath = path.join(htmlDir, `page-${sport}.html`);
//     await page.screenshot({ path: screenshotPath, fullPage: true });
//     console.log(`Screenshot saved to ${screenshotPath}`);
//     const content = await page.content();
//     fs.writeFileSync(htmlPath, content);
//     console.log(`Page content saved to ${htmlPath}`);

//     return await page.evaluate(sport => {
//       let matchElements = document.querySelectorAll('.table-f');
//       if (matchElements.length === 0) {
//         console.warn(`No .table-f elements found for ${sport}, trying fallback selector`);
//         matchElements = document.querySelectorAll('.sports-table, .live-table, .match-table'); // Fallback selectors
//       }
//       if (matchElements.length === 0) {
//         console.warn(`No fallback elements found for ${sport}`);
//         return [];
//       }
//       return Array.from(matchElements).map(match => {
//         const homeTeam = match.querySelector('.sports-table__home')?.innerText.trim() || '';
//         const awayTeam = match.querySelector('.sports-table__away')?.innerText.trim() || '';
//         const teams = [homeTeam, awayTeam].filter(team => team);
//         const time = match.querySelector('.sports-table__time time')?.innerText.trim() || '';

//         // Score extraction
//         let score = '0-0';
//         if (sport === 'soccer') {
//           const scoreHome = match.querySelector('.sports-table__score-home')?.innerText.trim() || '0';
//           const scoreAway = match.querySelector('.sports-table__score-away')?.innerText.trim() || '0';
//           score = `${scoreHome}-${scoreAway}`;
//         } else {
//           const scoreHome = match.querySelector('.sports-table__pts .sports-table__score-home')?.innerText.trim() || '0';
//           const scoreAway = match.querySelector('.sports-table__pts .sports-table__score-away')?.innerText.trim() || '0';
//           score = `${scoreHome}-${scoreAway}`;
//         }

//         // Odds extraction
//         const odds = { home: 0, draw: 0, away: 0 };
//         if (sport === 'soccer' || sport === 'handball') {
//           odds.home = parseFloat(match.querySelector('.sports-table__odds-item[id$="_sign-1"] .odd-container')?.innerText || 0);
//           odds.draw = parseFloat(match.querySelector('.sports-table__odds-item[id$="_sign-X"] .odd-container')?.innerText || 0);
//           odds.away = parseFloat(match.querySelector('.sports-table__odds-item[id$="_sign-2"] .odd-container')?.innerText || 0);
//         } else {
//           odds.home = parseFloat(match.querySelector('.sports-table__odds-item[id*="_sign-1"], .sports-table__odds-item[id*="_sign-1HH"]')?.querySelector('.odd-container')?.innerText || 0);
//           odds.away = parseFloat(match.querySelector('.sports-table__odds-item[id*="_sign-2"], .sports-table__odds-item[id*="_sign-2HH"]')?.querySelector('.odd-container')?.innerText || 0);
//         }

//         return { teams, score, odds, time, sport };
//       }).filter(match => match.teams.length === 2);
//     }, sport);
//   } catch (err) {
//     console.error(`Error scraping ${sport}:`, err.message);
//     return [];
//   }
// }

// async function scrapeBet9ja() {
//   let browser;
//   try {
//     browser = await puppeteer.launch({
//       headless: true,
//       ignoreHTTPSErrors: true,
//       args: ['--ignore-certificate-errors', '--disable-web-security', '--no-http2'],
//     });

//     const page = await browser.newPage();
//     page.setDefaultNavigationTimeout(120000);
//     await page.setViewport({ width: 1280, height: 800 });

//     // Block non-essential resources
//     await page.setRequestInterception(true);
//     page.on('request', (req) => {
//       if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
//         req.abort();
//       } else {
//         req.continue();
//       }
//     });

//     // Randomize user agent for each run
//     const userAgents = [
//       'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
//       'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
//       'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0',
//     ];
//     const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
//     await page.setUserAgent(randomUserAgent);

//     await page.setExtraHTTPHeaders({
//       'Accept-Language': 'en-US,en;q=0.9',
//       'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
//     });

//     const sports = [
//       { name: 'soccer', url: 'https://sports.bet9ja.com/liveCompetitions/3000001' },
//       { name: 'tennis', url: 'https://sports.bet9ja.com/liveCompetitions/3000005' },
//       { name: 'basketball', url: 'https://sports.bet9ja.com/liveCompetitions/3000002' },
//       { name: 'volleyball', url: 'https://sports.bet9ja.com/liveCompetitions/3000023' },
//       { name: 'handball', url: 'https://sports.bet9ja.com/liveCompetitions/3000006' },
//       { name: 'snooker', url: 'https://sports.bet9ja.com/liveCompetitions/3000019' },
//       { name: 'table-tennis', url: 'https://sports.bet9ja.com/liveCompetitions/3000020' },
//     ];

//     let allMatches = [];
//     for (const { name, url } of sports) {
//       const matches = await scrapeSport(page, name, url);
//       allMatches = allMatches.concat(matches);
//       await sleep(10000); // Increased delay to 10 seconds
//     }

//     const seen = new Set();
//     const uniqueMatches = allMatches.filter(match => {
//       const key = `${match.teams.join('|')}|${match.time}|${match.sport}`;
//       if (seen.has(key)) return false;
//       seen.add(key);
//       return true;
//     });

//     console.log('Scraped matches:', uniqueMatches);

//     for (const matchData of uniqueMatches) {
//       const match = await Match.findOne({ teams: matchData.teams, sport: matchData.sport });
//       if (match) {
//         match.score = matchData.score;
//         match.odds = matchData.odds;
//         match.time = matchData.time;
//         match.updatedAt = new Date();
//         await match.save();
//         pubsub.publish('MATCH_UPDATED', { matchUpdated: match });
//       } else {
//         const newMatch = new Match(matchData);
//         await newMatch.save();
//         pubsub.publish('MATCH_UPDATED', { matchUpdated: newMatch });
//       }
//     }
//   } catch (err) {
//     console.error('Scraping error:', err.message);
//   } finally {
//     if (browser) await browser.close();
//   }
// }

// function startScraper() {
//   cron.schedule('*/5 * * * *', () => {
//     console.log('Scraping Bet9ja...');
//     scrapeBet9ja();
//   });
// }

// module.exports = { startScraper };

