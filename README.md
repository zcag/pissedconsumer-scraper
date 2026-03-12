# PissedConsumer Review Scraper

Extract consumer complaints, reviews, ratings, and company data from [PissedConsumer.com](https://www.pissedconsumer.com/).

PissedConsumer is one of the largest consumer complaint platforms in the US with millions of reviews. This scraper extracts structured review data including ratings, complaint text, author information, pros/cons, monetary loss, and company aggregate data.

## Features

- **Multi-company scraping** — scrape reviews for multiple companies in one run
- **Company profiles** — aggregate rating, total reviews, star distribution
- **Rich review data** — rating, title, full text, author, location, verification status, helpful votes
- **Structured complaint fields** — pros, cons, monetary loss, preferred solution, user recommendation
- **Pagination support** — handles PissedConsumer's non-standard pagination
- **Configurable limits** — set max reviews per company
- **Sort & filter** — sort by helpfulness or date, filter by star rating

## Input

| Field | Type | Description | Default |
|-------|------|-------------|---------|
| `companyUrls` | array | Company URLs or slugs (e.g., `amazon`, `https://www.pissedconsumer.com/company/amazon.html`) | required |
| `maxReviewsPerCompany` | integer | Maximum reviews per company. 0 = unlimited. | 100 |
| `sortBy` | string | `helpful` or `latest` | `latest` |
| `filterByStars` | string | `all`, `1`, `2`, `3`, `4`, or `5` | `all` |
| `includeCompanyInfo` | boolean | Include company profile as first result | true |
| `proxyConfig` | object | Proxy settings | Apify Proxy |

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

### Company info (when `includeCompanyInfo` is true)

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

## Use cases

- **Reputation monitoring** — track customer complaints and satisfaction trends
- **Competitor analysis** — compare complaint volumes and types across competitors
- **Customer service intelligence** — identify recurring issues and resolution patterns
- **Market research** — understand consumer pain points in specific industries
- **Sentiment analysis** — feed review data into NLP pipelines

## Technical details

- Uses CheerioCrawler (HTTP-only, no browser needed) for maximum efficiency
- Extracts data from Schema.org microdata embedded in server-rendered HTML
- Handles PissedConsumer's non-standard pagination URL pattern
- Low concurrency (3) to respect the site

## Cost estimate

With Apify Proxy, expect approximately:
- ~$0.50 per 1,000 reviews (basic proxy)
- ~$1.50 per 1,000 reviews (residential proxy, if needed)
