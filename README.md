# PissedConsumer Review Scraper

Extract consumer complaints, reviews, ratings, and company data from [PissedConsumer.com](https://www.pissedconsumer.com/) — one of the largest consumer complaint platforms in the US with millions of reviews.

This Actor collects structured review data at scale, including star ratings, complaint text, pros/cons, monetary loss amounts, and preferred resolutions. Perfect for reputation monitoring, competitive intelligence, and consumer sentiment analysis.

## What data can you extract from PissedConsumer?

| Field | Example |
|-------|---------|
| Star rating | 1-5 |
| Review title | "Package never arrived" |
| Full review text | Complete complaint text |
| Author name | "John D." |
| Author location | "Houston, TX" |
| Published date | "2026-03-10" |
| Verified status | true/false |
| Helpful votes | 5 |
| Pros | "Good product quality" |
| Cons | "Poor delivery service" |
| Monetary loss | "$150" |
| Preferred solution | "Full refund" |
| User recommendation | "Do not use this company" |
| Company rating | 2.7 |
| Total reviews | 38,742 |
| Star distribution | Per-star breakdown |
| Company website | Official URL |

## How to scrape PissedConsumer reviews

1. Click **Try for free** to open the Actor in Apify Console
2. Enter one or more company names or URLs (e.g., `amazon` or `https://amazon.pissedconsumer.com/review.html`)
3. Set the maximum number of reviews you want per company
4. Optionally filter by star rating or change the sort order
5. Click **Start** and wait for the run to finish
6. Download your data as JSON, CSV, or Excel — or access it via the Apify API

You can also schedule runs to collect reviews automatically on a daily, weekly, or monthly basis using Apify's built-in scheduling. Connect to Google Sheets, Slack, Zapier, or any webhook to get notified when new data is available.

## Input

| Field | Type | Description | Default |
|-------|------|-------------|---------|
| `companyUrls` | string[] | Company URLs or slugs (e.g., `amazon`, `https://amazon.pissedconsumer.com/review.html`) | required |
| `maxReviewsPerCompany` | number | Maximum reviews to collect per company. Set to 0 for unlimited. | 100 |
| `sortBy` | string | `helpful` (most helpful first) or `latest` (newest first) | `latest` |
| `filterByStars` | string | `all`, `1`, `2`, `3`, `4`, or `5` | `all` |
| `includeCompanyInfo` | boolean | Include company profile summary with aggregate stats | true |
| `proxyConfig` | object | Proxy configuration | Apify Proxy (datacenter) |

### Example input

```json
{
    "companyUrls": ["amazon", "walmart"],
    "maxReviewsPerCompany": 50,
    "sortBy": "latest",
    "filterByStars": "all",
    "includeCompanyInfo": true
}
```

## Output

### Company profile

```json
{
    "type": "companyInfo",
    "companyName": "Amazon",
    "companySlug": "amazon",
    "companyUrl": "https://amazon.pissedconsumer.com/review.html",
    "totalReviews": 38742,
    "averageRating": 2.7,
    "starDistribution": {
        "1": 22869,
        "2": 5765,
        "3": 6543,
        "4": 7778,
        "5": 15816
    },
    "website": "https://www.amazon.com/"
}
```

### Review

```json
{
    "type": "review",
    "companyName": "Amazon",
    "companySlug": "amazon",
    "companyUrl": "https://amazon.pissedconsumer.com/review.html",
    "rating": 1,
    "reviewTitle": "Package never arrived",
    "reviewText": "Ordered a product two weeks ago...",
    "authorName": "John D.",
    "authorLocation": "Houston, TX",
    "publishedDate": "2026-03-10",
    "reviewUrl": "https://amazon.pissedconsumer.com/package-never-arrived-20260310123456.html",
    "isVerified": true,
    "helpfulCount": 5,
    "pros": "",
    "cons": "Poor delivery service",
    "monetaryLoss": "$150",
    "preferredSolution": "Full refund",
    "userRecommendation": "Do not use this company"
}
```

## How much does it cost to scrape PissedConsumer?

This Actor uses PlaywrightCrawler (headless browser) to handle PissedConsumer's JavaScript-rendered content:

- **~$1.50 per 1,000 reviews** with datacenter proxy
- **~$3.00 per 1,000 reviews** with residential proxy (if needed)

For example, scraping 10,000 reviews from multiple companies would cost approximately $15-30 depending on proxy type.

The Apify Free plan includes $5/month of platform credits, enough to scrape thousands of reviews at no cost.

## Use cases

- **Reputation monitoring** — Track customer complaints and satisfaction trends for your brand or competitors. Schedule daily runs to catch new complaints early.
- **Competitive intelligence** — Compare complaint volumes, types, and resolution patterns across companies in your industry.
- **Customer service analysis** — Identify recurring issues, common monetary loss amounts, and what resolutions customers actually want.
- **Market research** — Understand consumer pain points and sentiment in specific industries before entering a market.
- **Sentiment analysis** — Feed structured review data into NLP pipelines. Each review includes ratings, text, and structured complaint fields for easy processing.
- **Risk assessment** — Monitor complaint trends for potential partners, vendors, or investment targets.

## Is it legal to scrape PissedConsumer?

Web scraping of publicly available data is generally legal. PissedConsumer reviews are publicly accessible without requiring login. This Actor only collects data that is visible to any visitor of the website.

For more context on web scraping legality, see [Is web scraping legal?](https://blog.apify.com/is-web-scraping-legal/) on the Apify blog.

Always review and comply with the terms of service of the target website and applicable data protection regulations (GDPR, CCPA) for your specific use case.

## Tips

- **Start small**: Test with `maxReviewsPerCompany: 10` to verify the output format before running large scrapes.
- **Use company slugs**: You can pass just the company name (e.g., `amazon`) instead of full URLs.
- **Filter by stars**: Use `filterByStars` to focus on negative reviews (1-2 stars) for complaint analysis, or positive reviews (4-5 stars) for competitive benchmarking.
- **Schedule regular runs**: Set up weekly or monthly scrapes to track reputation trends over time.

## Why this scraper?

- **The only PissedConsumer scraper on Apify** — zero competition. We built it because nobody else did.
- **Handles JavaScript rendering** — PissedConsumer is a JavaScript SPA. This Actor uses PlaywrightCrawler (headless browser) to render pages, which is why simpler HTTP scrapers can't extract this data.
- **Rich complaint data** — extracts monetary loss, preferred resolution, pros/cons, and verified status — fields unique to PissedConsumer that no other review platform provides.

## API access

Call this Actor programmatically from any language:

```bash
curl "https://api.apify.com/v2/acts/quasi_grass~pissedconsumer-review-scraper/run-sync-get-dataset-items?token=YOUR_TOKEN" \
  -d '{"companyUrls": ["amazon"], "maxReviewsPerCompany": 50}'
```

Or use the [Apify client](https://docs.apify.com/api/client/js/) for Node.js, Python, or any language. Works with Google Sheets, Zapier, Make, Slack, and 100+ integrations.

## Related scrapers

Check out our other review platform scrapers for cross-platform reputation analysis:

- [Trustpilot Reviews Scraper](https://apify.com/quasi_grass/trustpilot-review-scraper)
- [SiteJabber Reviews Scraper](https://apify.com/quasi_grass/sitejabber-review-scraper)
- [ConsumerAffairs Reviews Scraper](https://apify.com/quasi_grass/consumeraffairs-review-scraper)
