import { PlaywrightCrawler, Dataset } from '@crawlee/playwright';
import { Actor, log } from 'apify';
import type { Page } from 'playwright';

// ── Types ──────────────────────────────────────────────────────────────

interface Input {
    companyUrls: string[];
    maxReviewsPerCompany?: number;
    sortBy?: 'helpful' | 'latest';
    filterByStars?: 'all' | '1' | '2' | '3' | '4' | '5';
    includeCompanyInfo?: boolean;
    proxyConfig?: object;
}

interface ReviewResult {
    type: 'review';
    companyName: string;
    companySlug: string;
    companyUrl: string;
    rating: number;
    reviewTitle: string;
    reviewText: string;
    authorName: string;
    authorLocation: string;
    publishedDate: string;
    reviewUrl: string;
    isVerified: boolean;
    helpfulCount: number;
    pros: string;
    cons: string;
    monetaryLoss: string;
    preferredSolution: string;
    userRecommendation: string;
}

interface CompanyResult {
    type: 'companyInfo';
    companyName: string;
    companySlug: string;
    companyUrl: string;
    totalReviews: number;
    averageRating: number;
    starDistribution: Record<string, number>;
}

interface UserData {
    label: 'REVIEW_PAGE';
    companySlug: string;
    companyBaseUrl: string;
    reviewCount: number;
    companyInfoEmitted: boolean;
    currentPage: number;
}

// ── Init ───────────────────────────────────────────────────────────────

await Actor.init();

const {
    companyUrls = [],
    maxReviewsPerCompany = 100,
    sortBy = 'latest',
    filterByStars = 'all',
    includeCompanyInfo = true,
    proxyConfig,
} = (await Actor.getInput<Input>()) ?? ({} as Input);

if (companyUrls.length === 0) {
    log.error('No company URLs provided. Exiting.');
    await Actor.exit({ exitCode: 1 });
}

const proxyConfiguration = await Actor.createProxyConfiguration(proxyConfig);

// ── URL helpers ────────────────────────────────────────────────────────

function extractSlug(input: string): string {
    // Handle subdomain URLs: https://amazon.pissedconsumer.com/review.html
    let match = input.match(/^https?:\/\/([^.]+)\.pissedconsumer\.com/);
    if (match && match[1] !== 'www') return match[1];

    // Handle /company/ path: https://www.pissedconsumer.com/company/amazon.html
    match = input.match(/pissedconsumer\.com\/company\/([^/.]+)/);
    if (match) return match[1];

    // Handle old path-based URLs: https://www.pissedconsumer.com/{slug}/RT-F.html
    match = input.match(/pissedconsumer\.com\/([^/]+)\/(?:RT-[A-Z]|review|reviews|complaints)/i);
    if (match) return match[1].replace(/-\d{6,}$/, ''); // strip numeric DB IDs like -201712110

    // Handle path without subpage: https://www.pissedconsumer.com/{slug}.html
    match = input.match(/pissedconsumer\.com\/([^/.]+)\.html/);
    if (match) return match[1];

    // Bare slug
    return input.trim().replace(/\.html$/, '').replace(/\//g, '');
}

function buildReviewPageUrl(slug: string, page: number): string {
    let url: string;
    if (page === 1) {
        url = `https://${slug}.pissedconsumer.com/review.html`;
    } else if (page === 2) {
        url = `https://${slug}.pissedconsumer.com/complaints/RT-P.html`;
    } else if (page === 3) {
        url = `https://${slug}.pissedconsumer.com/reviews/RT-P.html`;
    } else {
        url = `https://${slug}.pissedconsumer.com/${page}/RT-P.html`;
    }

    const params = new URLSearchParams();
    if (sortBy === 'latest') params.set('sort', 'latest');
    if (filterByStars !== 'all') params.set('starRating', filterByStars);
    const qs = params.toString();
    return qs ? `${url}?${qs}` : url;
}

// ── Extraction (runs inside browser context) ────────────────────────────

async function extractCompanyInfo(page: Page, slug: string): Promise<CompanyResult | null> {
    return page.evaluate((slug) => {
        const aggregateRating = document.querySelector('[itemprop="aggregateRating"]');

        // Try JSON-LD first
        const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (const script of jsonLdScripts) {
            try {
                const data = JSON.parse(script.textContent || '{}');
                const items = Array.isArray(data) ? data : data['@graph'] || [data];
                for (const item of items) {
                    if (item.aggregateRating || item['@type'] === 'AggregateRating') {
                        const agg = item.aggregateRating || item;
                        return {
                            type: 'companyInfo' as const,
                            companyName: item.name || slug,
                            companySlug: slug,
                            companyUrl: `https://${slug}.pissedconsumer.com/review.html`,
                            totalReviews: parseInt(agg.reviewCount) || 0,
                            averageRating: parseFloat(agg.ratingValue) || 0,
                            starDistribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
                        };
                    }
                }
            } catch { /* skip */ }
        }

        // Fallback: microdata
        if (!aggregateRating) return null;

        const ratingEl = aggregateRating.querySelector('[itemprop="ratingValue"]');
        const countEl = aggregateRating.querySelector('meta[itemprop="reviewCount"]') ||
                        aggregateRating.querySelector('[itemprop="reviewCount"]');
        const ratingValue = parseFloat(ratingEl?.textContent?.trim() || '0') || 0;
        const reviewCount = parseInt(
            countEl?.getAttribute('content') || countEl?.textContent?.trim() || '0'
        ) || 0;

        const nameEl = document.querySelector('meta[itemprop="name"]') ||
                       document.querySelector('[itemprop="itemReviewed"] [itemprop="name"]');
        const companyName = nameEl?.getAttribute('content') || nameEl?.textContent?.trim() || slug;

        // Star distribution from filter sidebar
        const starDistribution: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
        document.querySelectorAll('ol.star_rating_filter li').forEach((el) => {
            const input = el.querySelector('input[name="starRating"]');
            const counter = el.querySelector('.counter');
            if (input && counter) {
                const starValue = input.getAttribute('value');
                if (starValue) {
                    starDistribution[starValue] = parseInt(counter.textContent?.trim().replace(/,/g, '') || '0') || 0;
                }
            }
        });

        return {
            type: 'companyInfo' as const,
            companyName,
            companySlug: slug,
            companyUrl: `https://${slug}.pissedconsumer.com/review.html`,
            totalReviews: reviewCount,
            averageRating: ratingValue,
            starDistribution,
        };
    }, slug);
}

async function extractReviews(page: Page, slug: string, companyName: string): Promise<ReviewResult[]> {
    const rawReviews = await page.evaluate((slug) => {
        const results: any[] = [];

        // Try JSON-LD first
        const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (const script of jsonLdScripts) {
            try {
                const data = JSON.parse(script.textContent || '{}');
                const items = Array.isArray(data) ? data : data['@graph'] || [data];
                for (const item of items) {
                    if (item['@type'] === 'Review') {
                        results.push({
                            rating: parseFloat(item.reviewRating?.ratingValue) || 0,
                            reviewTitle: item.headline || item.name || '',
                            reviewText: item.reviewBody || item.description || '',
                            authorName: item.author?.name || '',
                            authorLocation: '',
                            publishedDate: item.datePublished || '',
                            reviewUrl: item.url || '',
                            isVerified: false,
                            helpfulCount: 0,
                            pros: '',
                            cons: '',
                            monetaryLoss: '',
                            preferredSolution: '',
                            userRecommendation: '',
                        });
                    }
                }
            } catch { /* skip */ }
        }

        if (results.length > 0) return results;

        // Fallback: microdata selectors
        const reviewEls = document.querySelectorAll(
            'div[itemscope][itemprop="review"][itemtype*="schema.org/Review"], ' +
            '[itemscope][itemtype*="schema.org/Review"]'
        );

        for (const el of reviewEls) {
            const title = (el.querySelector('h2[itemprop="headline"], .review-item-title') as HTMLElement)?.textContent?.trim() || '';
            const reviewBody = (el.querySelector('[itemprop="reviewBody"]') as HTMLElement)?.textContent?.trim() || '';
            const ratingText = (el.querySelector('[itemprop="ratingValue"]') as HTMLElement)?.textContent?.trim()
                || (el.querySelector('.stars-wrap') as HTMLElement)?.getAttribute('data-active-count') || '0';
            const rating = parseFloat(ratingText) || 0;

            const dateEl = el.querySelector('meta[itemprop="datePublished"]') || el.querySelector('time[datetime]');
            const publishedDate = dateEl?.getAttribute('content') || dateEl?.getAttribute('datetime') || '';

            const authorName = (el.querySelector('[itemprop="author"] [itemprop="name"]') as HTMLElement)?.textContent?.trim()
                || (el.querySelector('[itemprop="author"]') as HTMLElement)?.textContent?.trim() || '';

            const locationParts: string[] = [];
            el.querySelectorAll('.location-line span').forEach((locEl) => {
                const loc = locEl.textContent?.trim().replace(/,\s*$/, '');
                if (loc) locationParts.push(loc);
            });

            const isVerified = el.querySelector('.verified-reviewer, .verified') !== null;
            const helpfulText = (el.querySelector('.vote-yes .count') as HTMLElement)?.textContent?.trim() || '0';

            const reviewId = el.getAttribute('data-id') || '';
            const reviewUrl = reviewId ? `https://${slug}.pissedconsumer.com/review-${reviewId}.html` : '';

            let pros = '', cons = '', monetaryLoss = '', preferredSolution = '', userRecommendation = '';
            el.querySelectorAll('.f-component-info-row, .review-info-row').forEach((rowEl) => {
                const rowText = rowEl.textContent || '';
                if (/pros:/i.test(rowText)) pros = rowText.replace(/.*pros:\s*/i, '').trim();
                else if (/cons:/i.test(rowText)) cons = rowText.replace(/.*cons:\s*/i, '').trim();
                else if (/loss:/i.test(rowText)) monetaryLoss = rowText.replace(/.*loss:\s*/i, '').trim();
            });
            el.querySelectorAll('strong').forEach((strongEl) => {
                const text = strongEl.textContent || '';
                if (/preferred solution/i.test(text)) {
                    preferredSolution = (strongEl.parentElement?.textContent || '').replace(/.*preferred solution:\s*/i, '').trim();
                } else if (/user.*recommendation/i.test(text)) {
                    userRecommendation = (strongEl.parentElement?.textContent || '').replace(/.*recommendation:\s*/i, '').trim();
                }
            });

            results.push({
                rating,
                reviewTitle: title,
                reviewText: reviewBody,
                authorName,
                authorLocation: locationParts.join(', '),
                publishedDate,
                reviewUrl,
                isVerified,
                helpfulCount: parseInt(helpfulText) || 0,
                pros,
                cons,
                monetaryLoss,
                preferredSolution,
                userRecommendation,
            });
        }

        // Final fallback: look for common review card patterns
        if (results.length === 0) {
            const cards = document.querySelectorAll('[class*="review-card"], [class*="review-item"], [class*="complaint-item"]');
            for (const card of cards) {
                const title = (card.querySelector('h2, h3, [class*="title"]') as HTMLElement)?.textContent?.trim() || '';
                const body = (card.querySelector('[class*="body"], [class*="text"], [class*="content"] p') as HTMLElement)?.textContent?.trim() || '';
                if (!title && !body) continue;

                const starEls = card.querySelectorAll('[class*="star"][class*="active"], [class*="star"][class*="filled"]');
                const rating = starEls.length > 0 && starEls.length <= 5 ? starEls.length : 0;

                const dateEl = card.querySelector('time, [class*="date"]');
                const publishedDate = dateEl?.getAttribute('datetime') || dateEl?.textContent?.trim() || '';

                const authorEl = card.querySelector('[class*="author"], [class*="user"]');
                const authorName = (authorEl as HTMLElement)?.textContent?.trim() || '';

                results.push({
                    rating,
                    reviewTitle: title,
                    reviewText: body,
                    authorName,
                    authorLocation: '',
                    publishedDate,
                    reviewUrl: '',
                    isVerified: false,
                    helpfulCount: 0,
                    pros: '',
                    cons: '',
                    monetaryLoss: '',
                    preferredSolution: '',
                    userRecommendation: '',
                });
            }
        }

        return results;
    }, slug);

    return rawReviews.map((r) => ({
        type: 'review' as const,
        companyName,
        companySlug: slug,
        companyUrl: `https://${slug}.pissedconsumer.com/review.html`,
        ...r,
    }));
}

async function detectTotalPages(page: Page): Promise<number> {
    return page.evaluate(() => {
        let maxPage = 1;

        // Pagination links with /N/RT-P.html pattern
        document.querySelectorAll('a[href*="/RT-P.html"], a[href*="review.html"]').forEach((el) => {
            const href = el.getAttribute('href') || '';
            const match = href.match(/\/(\d+)\/RT-P\.html/);
            if (match) {
                const pageNum = parseInt(match[1]);
                if (pageNum > maxPage) maxPage = pageNum;
            }
        });

        // Text of pagination links
        document.querySelectorAll('a.page-link, .pagination a, nav a').forEach((el) => {
            const text = el.textContent?.trim() || '';
            const num = parseInt(text);
            if (!isNaN(num) && num > maxPage) maxPage = num;
        });

        return maxPage;
    });
}

// ── Crawler ────────────────────────────────────────────────────────────

const crawler = new PlaywrightCrawler({
    proxyConfiguration,
    maxRequestsPerCrawl: 5000,
    maxConcurrency: 3,
    requestHandlerTimeoutSecs: 120,
    navigationTimeoutSecs: 60,
    headless: true,
    launchContext: {
        launchOptions: {
            args: ['--disable-blink-features=AutomationControlled'],
        },
    },
    preNavigationHooks: [
        async ({ page }) => {
            await page.addInitScript(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => false });
            });
        },
    ],
    requestHandler: async ({ request, page, crawler: c }) => {
        const userData = request.userData as UserData;
        const { companySlug, companyBaseUrl, currentPage } = userData;
        let { reviewCount, companyInfoEmitted } = userData;

        // Wait for page content to render
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(3000);

        log.info(`Processing page ${currentPage} for ${companySlug} (${reviewCount} reviews so far)`);

        // Extract company info on first page
        let companyName = companySlug;
        if (includeCompanyInfo && !companyInfoEmitted) {
            const info = await extractCompanyInfo(page, companySlug);
            if (info) {
                await Dataset.pushData(info);
                companyInfoEmitted = true;
                companyName = info.companyName;
                log.info(`Emitted company info for ${companyName}: ${info.averageRating}★, ${info.totalReviews} reviews`);
            }
        } else {
            // Try to get company name
            const nameFromPage = await page.evaluate(() => {
                const el = document.querySelector('meta[itemprop="name"]');
                return el?.getAttribute('content') || '';
            });
            if (nameFromPage) companyName = nameFromPage;
        }

        // Extract reviews
        let reviews = await extractReviews(page, companySlug, companyName);

        if (reviews.length === 0) {
            log.info(`No reviews found on page ${currentPage} for ${companySlug}. Stopping.`);
            return;
        }

        // Trim to max limit
        if (maxReviewsPerCompany > 0) {
            const remaining = maxReviewsPerCompany - reviewCount;
            if (remaining <= 0) return;
            reviews = reviews.slice(0, remaining);
        }

        await Dataset.pushData(reviews);
        reviewCount += reviews.length;
        log.info(`Pushed ${reviews.length} reviews (total: ${reviewCount}) for ${companySlug}`);

        // Check if we should continue
        if (maxReviewsPerCompany > 0 && reviewCount >= maxReviewsPerCompany) {
            log.info(`Reached max reviews (${maxReviewsPerCompany}) for ${companySlug}`);
            return;
        }

        // Detect pagination and enqueue next page
        const totalPages = await detectTotalPages(page);
        const nextPage = currentPage + 1;

        if (nextPage <= totalPages || (totalPages <= 1 && reviews.length >= 10)) {
            const nextUrl = buildReviewPageUrl(companySlug, nextPage);
            await c.addRequests([{
                url: nextUrl,
                userData: {
                    label: 'REVIEW_PAGE' as const,
                    companySlug,
                    companyBaseUrl,
                    reviewCount,
                    companyInfoEmitted,
                    currentPage: nextPage,
                },
            }]);
            log.info(`Enqueued page ${nextPage} for ${companySlug} (totalPages: ${totalPages})`);
        } else {
            log.info(`Finished all pages for ${companySlug} (${reviewCount} reviews total)`);
        }
    },

    failedRequestHandler: async ({ request }, error) => {
        log.error(`Request failed: ${request.url} — ${error.message}`);
    },
});

// ── Build start URLs ───────────────────────────────────────────────────

const startUrls = companyUrls.map((input) => {
    const slug = extractSlug(input);
    const url = buildReviewPageUrl(slug, 1);
    return {
        url,
        userData: {
            label: 'REVIEW_PAGE' as const,
            companySlug: slug,
            companyBaseUrl: url,
            reviewCount: 0,
            companyInfoEmitted: false,
            currentPage: 1,
        },
    };
});

log.info(`Starting scraper for ${startUrls.length} companies: ${startUrls.map(u => u.userData.companySlug).join(', ')}`);

await crawler.run(startUrls);

const datasetInfo = await Dataset.open().then(d => d.getInfo());
log.info(`Done. Total items in dataset: ${datasetInfo?.itemCount ?? 0}`);

await Actor.exit();
