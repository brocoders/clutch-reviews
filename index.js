import { CookieJar } from 'tough-cookie';
import { convertCookieToTough } from './utils.js';
import { Browser } from './Browser.js';
import jsdom from 'jsdom';

const { JSDOM } = jsdom;

let userAgent;
const jar = new CookieJar();

async function getUserAgent() {
  let browser;
  try {
    browser = await Browser.create();
    return await browser.getUserAgent();
  } finally {
    if (browser) {
      browser.close();
    }
  }
}

function normalizeContent(s) {
  return s.trim().replaceAll(/ +/g, " ").replaceAll(/^\s+/g, "").replaceAll(/(\n )+/g, "\n").replaceAll(/\n+/g, "\n");
}

function isCloudflareJSChallenge(content) {
  return content.includes('_cf_chl_opt');
}

function getReviews(document, page) {
    return Array.from(document.querySelectorAll("#reviews .views-row")).map((e, i) => {
      const title = "Review #" + (i + page * 10 + 1);
      const date = "Date: " + e.querySelector(".h5_title.date").textContent.trim();
      const projectCategory = "Project Category: " + normalizeContent(e.querySelector(".field-name-project-type").textContent);
      const projectSize = "Project Budget: "  + e.querySelector(".field-name-cost").textContent.trim();
      const location = "Location: " + e.querySelector(".field-name-location").textContent.trim();
      const clientSize = "Client size: " + e.querySelector(".field-name-company-size").textContent.trim();
      const rating = "Rating. General: " + e.querySelector(".group-feedback").textContent.trim().replaceAll(/\s+/g, " ").replaceAll(/( [A-Z])/g, ", $1");
      const projectSummary =  e.querySelector(".field-name-proj-description").textContent.trim().replace(/\n\s+/, "\n");
      const theReview = "The review: " + e.querySelector(".field-name-client-quote").textContent.trim();
      const feedbackSummary = e.querySelector(".field-name-comments").textContent.trim().replace(/\n\s+/, "\n");
      const reviewContent = "Detailed review.\n" + normalizeContent(e.querySelector(".full-review .review-content")?.textContent);

      return [title, date, projectCategory, projectSize, location, clientSize,
              rating, projectSummary, theReview, feedbackSummary, reviewContent].join("\r\n");
    })
}

async function go(url, maxDepth) {
  let browser;
  try {
    browser = await Browser.create();
    await browser.navigate(url);

    const timeoutInMs = 16000;

    let count = 1;
    let content = '';
    while (content == '' || isCloudflareJSChallenge(content)) {
      await browser.waitUntil('networkAlmostIdle', timeoutInMs);
      content = await browser.getPageHtml();
      if (count++ > 10) {
        throw new Error('stuck');
      }
    }

    const cookies = await browser.getCookies();
    for (let cookie of cookies) {
      jar.setCookie(convertCookieToTough(cookie), url.toString());
    }

    const dom = new JSDOM(content);
    let reviews = getReviews(dom.window.document, 0);

    const pagination = dom.window.document.querySelector(".pagination li:last-child a");
    if (pagination) {
      const pagesNum = parseInt(pagination.href.match(/page=(\d+)/)[1]) + 1;

      for (let i = 1; (i < pagesNum) && (i < maxDepth); i++) {
        let start = Date.now();
        console.log("Staring to navigate " + url + "?page=" + i);
        await browser.navigate(url + "?page=" + i);
        console.log("Navigation completed in " + (Date.now() - start));
        await browser.waitUntil('networkAlmostIdle', timeoutInMs);
        console.log("networkAlmostIdle finished in " + (Date.now() - start));
        const c = await browser.getPageHtml();
        const dom = new JSDOM(c);

        reviews = reviews.concat(getReviews(dom.window.document, i));
      }
    }
    console.log(reviews.join("\n\n"));

  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

(async () => {
  await go("https://clutch.co/profile/brocoders", 3);
})()
