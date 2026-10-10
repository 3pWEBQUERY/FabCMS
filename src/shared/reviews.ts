/** Stars for products: the average people see, and what search engines read. */

export interface Review {
  name: string;
  rating: number;
  body: string;
  verified: boolean;
  created_at: string | Date;
}

export interface ReviewSummary {
  count: number;
  /** One decimal, e.g. 4.3. */
  average: number;
  /** How many gave 5, 4, 3, 2 and 1 stars. */
  spread: [number, number, number, number, number];
}

export function summarize(reviews: Pick<Review, 'rating'>[]): ReviewSummary {
  const ok = reviews.filter((r) => Number.isInteger(r.rating) && r.rating >= 1 && r.rating <= 5);
  const spread: ReviewSummary['spread'] = [0, 0, 0, 0, 0];
  for (const r of ok) spread[5 - r.rating]++;
  const average = ok.length ? Math.round((ok.reduce((n, r) => n + r.rating, 0) / ok.length) * 10) / 10 : 0;
  return { count: ok.length, average, spread };
}

/** «★★★★☆» for a whole number of stars. */
export const starText = (n: number) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));
