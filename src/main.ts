import { CheerioCrawler, Dataset, type CheerioAPI } from '@crawlee/cheerio';
import { Actor, log } from 'apify';

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
    // Handle full URLs: https://www.pissedconsumer.com/company/amazon.html
    let match = input.match(/pissedconsumer\.com\/company\/([^/.]+)/);
    if (match) return match[1];

    // Handle subdomain URLs: https://amazon.pissedconsumer.com/review.html
    match = input.match(/^https?:\/\/([^.]+)\.pissedconsumer\.com/);
    if (match) return match[1];

    // Bare slug
    return input.replace(/\.html$/, '').replace(/\//g, '');
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

    // Add query params
    const params = new URLSearchParams();
    if (sortBy === 'latest') params.set('sort', 'latest');
    if (filterByStars !== 'all') params.set('starRating', filterByStars);
    const qs = params.toString();
    return qs ? `${url}?${qs}` : url;
}

// ── Extraction ─────────────────────────────────────────────────────────

function extractCompanyInfo($: CheerioAPI, slug: string): CompanyResult | null {
    const aggregateRating = $('[itemprop="aggregateRating"]');
    if (aggregateRating.length === 0) return null;

    const ratingValue = parseFloat(aggregateRating.find('[itemprop="ratingValue"]').text().trim()) || 0;
    const reviewCount = parseInt(aggregateRating.find('meta[itemprop="reviewCount"]').attr('content') || '0') || 0;

    const companyName = $('meta[itemprop="name"]').first().attr('content')
        || $('[itemprop="itemReviewed"] [itemprop="name"]').first().text().trim()
        || slug;

    // Star distribution from the filter sidebar
    const starDistribution: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
    $('ol.star_rating_filter li').each((_, el) => {
        const $el = $(el);
        const starValue = $el.find('input[name="starRating"]').attr('value');
        const countText = $el.find('.counter').text().trim();
        if (starValue && countText) {
            starDistribution[starValue] = parseInt(countText.replace(/,/g, '')) || 0;
        }
    });

    return {
        type: 'companyInfo',
        companyName,
        companySlug: slug,
        companyUrl: `https://${slug}.pissedconsumer.com/review.html`,
        totalReviews: reviewCount,
        averageRating: ratingValue,
        starDistribution,
    };
}

function extractReviews($: CheerioAPI, slug: string, companyName: string): ReviewResult[] {
    const reviews: ReviewResult[] = [];

    $('div[itemscope][itemprop="review"][itemtype*="schema.org/Review"]').each((_, el) => {
        const $review = $(el);

        const title = $review.find('h2[itemprop="headline"], .review-item-title').first().text().trim();
        const reviewBody = $review.find('[itemprop="reviewBody"]').first().text().trim();
        const ratingText = $review.find('[itemprop="ratingValue"]').first().text().trim()
            || $review.find('.stars-wrap').attr('data-active-count') || '0';
        const rating = parseFloat(ratingText) || 0;

        const dateEl = $review.find('meta[itemprop="datePublished"]');
        const publishedDate = dateEl.attr('content')
            || $review.find('time[datetime]').attr('datetime')
            || '';

        const authorName = $review.find('[itemprop="author"] [itemprop="name"]').first().text().trim()
            || $review.find('[itemprop="author"]').first().text().trim();

        const locationParts: string[] = [];
        $review.find('.location-line span').each((_, locEl) => {
            const loc = $(locEl).text().trim().replace(/,\s*$/, '');
            if (loc) locationParts.push(loc);
        });
        const authorLocation = locationParts.join(', ');

        const isVerified = $review.find('.verified-reviewer, .verified').length > 0;

        const helpfulText = $review.find('.vote-yes .count').first().text().trim();
        const helpfulCount = parseInt(helpfulText) || 0;

        // Build review URL from review ID
        const reviewId = $review.attr('data-id') || '';
        const reviewUrl = reviewId
            ? `https://${slug}.pissedconsumer.com/review-${reviewId}.html`
            : '';

        // Extract structured fields (pros, cons, loss, etc.)
        let pros = '';
        let cons = '';
        let monetaryLoss = '';
        let preferredSolution = '';
        let userRecommendation = '';

        $review.find('.f-component-info-row, .review-info-row').each((_, rowEl) => {
            const rowText = $(rowEl).text();
            if (/pros:/i.test(rowText)) {
                pros = rowText.replace(/.*pros:\s*/i, '').trim();
            } else if (/cons:/i.test(rowText)) {
                cons = rowText.replace(/.*cons:\s*/i, '').trim();
            } else if (/loss:/i.test(rowText)) {
                monetaryLoss = rowText.replace(/.*loss:\s*/i, '').trim();
            }
        });

        $review.find('strong').each((_, strongEl) => {
            const text = $(strongEl).text();
            if (/preferred solution/i.test(text)) {
                preferredSolution = $(strongEl).parent().text().replace(/.*preferred solution:\s*/i, '').trim();
            } else if (/user.*recommendation/i.test(text)) {
                userRecommendation = $(strongEl).parent().text().replace(/.*recommendation:\s*/i, '').trim();
            }
        });

        reviews.push({
            type: 'review',
            companyName,
            companySlug: slug,
            companyUrl: `https://${slug}.pissedconsumer.com/review.html`,
            rating,
            reviewTitle: title,
            reviewText: reviewBody,
            authorName,
            authorLocation,
            publishedDate,
            reviewUrl,
            isVerified,
            helpfulCount,
            pros,
            cons,
            monetaryLoss,
            preferredSolution,
            userRecommendation,
        });
    });

    return reviews;
}

function detectTotalPages($: CheerioAPI): number {
    let maxPage = 1;

    // Look for pagination links
    $('a[href*="/RT-P.html"], a[href*="review.html"]').each((_, el) => {
        const href = $(el).attr('href') || '';
        // Pattern: /{N}/RT-P.html
        const match = href.match(/\/(\d+)\/RT-P\.html/);
        if (match) {
            const pageNum = parseInt(match[1]);
            if (pageNum > maxPage) maxPage = pageNum;
        }
    });

    // Also check text of pagination links
    $('a.page-link, .pagination a, nav a').each((_, el) => {
        const text = $(el).text().trim();
        const num = parseInt(text);
        if (!isNaN(num) && num > maxPage) maxPage = num;
    });

    return maxPage;
}

// ── Crawler ────────────────────────────────────────────────────────────

const crawler = new CheerioCrawler({
    proxyConfiguration,
    maxRequestsPerCrawl: 5000,
    maxConcurrency: 3,
    requestHandlerTimeoutSecs: 60,
    requestHandler: async ({ request, $, crawler: c }) => {
        const userData = request.userData as UserData;
        const { companySlug, companyBaseUrl, currentPage } = userData;
        let { reviewCount, companyInfoEmitted } = userData;

        log.info(`Processing page ${currentPage} for ${companySlug} (${reviewCount} reviews so far)`);

        // Extract company info on first page
        let companyName = companySlug;
        if (includeCompanyInfo && !companyInfoEmitted) {
            const info = extractCompanyInfo($, companySlug);
            if (info) {
                await Dataset.pushData(info);
                companyInfoEmitted = true;
                companyName = info.companyName;
                log.info(`Emitted company info for ${companyName}: ${info.averageRating}★, ${info.totalReviews} reviews`);
            }
        } else {
            // Try to get company name even if we don't emit info
            const nameEl = $('meta[itemprop="name"]').first().attr('content');
            if (nameEl) companyName = nameEl;
        }

        // Extract reviews
        let reviews = extractReviews($, companySlug, companyName);

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
        const totalPages = detectTotalPages($);
        const nextPage = currentPage + 1;

        if (nextPage <= totalPages || (totalPages <= 1 && reviews.length >= 10)) {
            // Either we know there are more pages, or we got a full page and should try next
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
