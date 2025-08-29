#!/usr/bin/env tsx
import 'dotenv/config';
import axios from 'axios';

type SearchResponse = {
  total_products: number;
  total_pages: number;
  products: Array<{
    jenni_parent_id: string;
    title: string;
    brand: string;
    variants: Array<{
      gtin: string;
      price: number;
      zipcode_inventory?: Record<string, string>;
    }>;
  }>;
};

async function main() {
  const zip = process.argv[2];
  if (!zip) {
    console.error('Usage: tsx scripts/list-zip.ts <ZIP> [page_size=100]');
    process.exit(1);
  }
  const pageSize = Number(process.argv[3] ?? 100);
  if (![10, 20, 50, 100].includes(pageSize)) {
    console.error('page_size must be one of 10, 20, 50, 100');
    process.exit(1);
  }

  const { JENNI_CLIENT_ID, JENNI_CLIENT_SECRET, JENNI_API_HOST } = process.env;
  if (!JENNI_CLIENT_ID || !JENNI_CLIENT_SECRET || !JENNI_API_HOST) {
    console.error('Missing env: JENNI_CLIENT_ID, JENNI_CLIENT_SECRET, JENNI_API_HOST');
    process.exit(1);
  }

  // Auth
  const authRes = await axios.post(
    `${JENNI_API_HOST}/api/sku-graph/product-availability-service/auth/token`,
    { client_id: JENNI_CLIENT_ID, client_secret: JENNI_CLIENT_SECRET },
    { timeout: 15000 }
  );
  const token = authRes.data.access_token as string;

  let page = 1;
  let totalPages = 1;
  let totalMatches = 0;
  console.error(`Listing available products for ZIP ${zip} (page_size=${pageSize})...`);

  while (page <= totalPages) {
    const { data } = await axios.post<SearchResponse>(
      `${JENNI_API_HOST}/api/sku-graph/product-availability-service/searchProducts/`,
      { zip, page, page_size: pageSize },
      { headers: { Authorization: `Bearer ${token}` }, timeout: 30000 }
    );
    totalPages = data.total_pages ?? 1;

    for (const p of data.products ?? []) {
      for (const v of p.variants ?? []) {
        const inv = v.zipcode_inventory?.[zip];
        const qty = inv ? parseInt(inv, 10) : 0;
        if (qty > 0) {
          totalMatches++;
          console.log(
            JSON.stringify({
              parent_id: p.jenni_parent_id,
              title: p.title,
              brand: p.brand,
              gtin: v.gtin,
              price: v.price,
              zip,
              inventory: qty,
            })
          );
        }
      }
    }

    console.error(`Page ${page}/${totalPages} processed...`);
    page++;
    if (page > 2000) {
      console.error('Safety stop at 2000 pages');
      break;
    }
  }

  console.error(`Done. Matches: ${totalMatches}.`);
}

main().catch((e) => {
  console.error('Failed:', e.response?.status, e.response?.data || e.message);
  process.exit(1);
});

