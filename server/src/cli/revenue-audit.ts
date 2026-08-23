// Revenue Audit CLI — diagnose retroactive revenue changes from price_milliunits backfill
// Run: npm run revenue:audit (add to package.json) or tsx src/cli/revenue-audit.ts

import { pool } from '../db/pool.ts';

const PRICE_TRY: Record<string, number> = {
  'com.crossover.diamonds.100': 29.99,
  'com.crossover.diamonds.500': 79.99,
  'com.crossover.diamonds.1200': 149.99,
  'com.crossover.diamonds.5000': 449.99,
  'com.crossover.diamonds.15000': 999.99,
  'com.crossover.diamonds.50000': 2499.99,
  'com.crossover.socialpack.weekly': 24.99,
  'com.crossover.socialpack.monthly': 89.99,
  'com.crossover.copass': 350,
};

function priceOf(pid: string): number {
  return PRICE_TRY[pid] ?? 0;
}

function revenueTryOf(productId: string, sales: number, pricedSales: number, milliunits: string | number | null | undefined, currency: string | null | undefined): number {
  const fallback = priceOf(productId);
  const count = Number(sales) || 0;
  const priced = Math.max(0, Math.min(count, Number(pricedSales) || 0));
  const missing = Math.max(0, count - priced);
  const n = Number(milliunits);
  if (currency === 'TRY' && Number.isFinite(n) && n > 0) return +(n / 1000 + missing * fallback).toFixed(2);
  return +(count * fallback).toFixed(2);
}

async function main() {
  console.log('=== Crossover Revenue Audit ===\n');

  // 1. Check transactions with NULL price_milliunits (using fallback)
  const nullPrice = await pool.query(`
    SELECT 
      pt.transaction_id,
      pt.product_id,
      pt.price_milliunits,
      pt.currency,
      pt.purchase_date,
      pt.created_at,
      pt.environment,
      u.display_name,
      u.id as user_id
    FROM processed_transactions pt
    LEFT JOIN users u ON u.id = pt.user_id
    WHERE pt.price_milliunits IS NULL
      AND pt.environment = 'Production'
      AND COALESCE(pt.purchase_date, pt.created_at) >= '2026-08-04 00:00+03'
    ORDER BY pt.created_at DESC
  `);

  console.log(`1. Transactions with NULL price_milliunits (using fallback): ${nullPrice.rows.length}`);
  if (nullPrice.rows.length > 0) {
    console.table(nullPrice.rows.map(r => ({
      transaction_id: r.transaction_id.slice(0, 20) + '...',
      product_id: r.product_id,
      fallback_price: priceOf(r.product_id),
      currency: r.currency,
      purchase_date: r.purchase_date,
      created_at: r.created_at,
      environment: r.environment,
      user: r.display_name,
    })));
  }

  // 2. Check transactions where price_milliunits was updated (created_at != updated metadata)
  // We can't directly see updates, but we can check for transactions where
  // price_milliunits exists but created_at is old (before migration)
  const withPrice = await pool.query(`
    SELECT 
      pt.transaction_id,
      pt.product_id,
      pt.price_milliunits,
      pt.currency,
      pt.purchase_date,
      pt.created_at,
      pt.environment,
      u.display_name
    FROM processed_transactions pt
    LEFT JOIN users u ON u.id = pt.user_id
    WHERE pt.price_milliunits IS NOT NULL
      AND pt.environment = 'Production'
      AND COALESCE(pt.purchase_date, pt.created_at) >= '2026-08-04 00:00+03'
    ORDER BY pt.created_at DESC
  `);

  console.log(`\n2. Transactions WITH price_milliunits: ${withPrice.rows.length}`);

  // 3. Calculate revenue per product using fallback vs actual
  const byProduct = await pool.query(`
    SELECT 
      pt.product_id,
      pt.currency,
      count(*)::int AS sales,
      count(pt.price_milliunits)::int AS priced_sales,
      sum(pt.price_milliunits)::bigint AS price_milliunits_sum,
      sum(pt.diamonds)::bigint AS diamonds
    FROM processed_transactions pt
    LEFT JOIN users u ON u.id = pt.user_id
    WHERE COALESCE(pt.purchase_date, pt.created_at) >= '2026-08-04 00:00+03'
      AND pt.environment = 'Production'
    GROUP BY pt.product_id, pt.currency
    ORDER BY sales DESC
  `);

  console.log('\n3. Revenue per product (fallback vs actual):');
  let totalFallback = 0;
  let totalActual = 0;
  
  for (const r of byProduct.rows) {
    const fallbackRev = +(r.sales * priceOf(r.product_id)).toFixed(2);
    const actualRev = revenueTryOf(r.product_id, r.sales, r.priced_sales, r.price_milliunits_sum, r.currency);
    const diff = +(actualRev - fallbackRev).toFixed(2);
    
    totalFallback += fallbackRev;
    totalActual += actualRev;
    
    console.log(`  ${r.product_id} (${r.currency}): sales=${r.sales}, priced=${r.priced_sales}, fallback=₺${fallbackRev}, actual=₺${actualRev}, diff=₺${diff}`);
  }
  
  console.log(`\n  TOTAL: fallback=₺${totalFallback.toFixed(2)}, actual=₺${totalActual.toFixed(2)}, diff=₺${(totalActual - totalFallback).toFixed(2)}`);

  // 4. Daily revenue series - check for anomalies
  const daily = await pool.query(`
    SELECT 
      to_char(date_trunc('day', COALESCE(pt.purchase_date, pt.created_at) AT TIME ZONE 'Europe/Istanbul'), 'YYYY-MM-DD') AS day,
      pt.product_id,
      pt.currency,
      count(*)::int AS sales,
      count(pt.price_milliunits)::int AS priced_sales,
      sum(pt.price_milliunits)::bigint AS price_milliunits_sum
    FROM processed_transactions pt
    WHERE COALESCE(pt.purchase_date, pt.created_at) >= '2026-08-04 00:00+03'
      AND pt.environment = 'Production'
    GROUP BY 1, 2, 3
    ORDER BY 1, 2
  `);

  console.log('\n4. Daily revenue series:');
  interface DayStat { day: string; sales: number; fallbackRev: number; actualRev: number; }
  const dayMap = new Map<string, DayStat>();
  
  for (const r of daily.rows) {
    const fallbackRev = +(r.sales * priceOf(r.product_id)).toFixed(2);
    const actualRev = revenueTryOf(r.product_id, r.sales, r.priced_sales, r.price_milliunits_sum, r.currency);
    
    const cur = dayMap.get(r.day) ?? { day: r.day, sales: 0, fallbackRev: 0, actualRev: 0 };
    cur.sales += r.sales;
    cur.fallbackRev += fallbackRev;
    cur.actualRev += actualRev;
    dayMap.set(r.day, cur);
  }

  const sortedDays = [...dayMap.values()].sort((a, b) => a.day.localeCompare(b.day));
  let runningFallback = 0;
  let runningActual = 0;
  
  for (const d of sortedDays) {
    runningFallback += d.fallbackRev;
    runningActual += d.actualRev;
    const diff = +(runningActual - runningFallback).toFixed(2);
    console.log(`  ${d.day}: sales=${d.sales}, fallback=₺${runningFallback.toFixed(2)}, actual=₺${runningActual.toFixed(2)}, diff=₺${diff}`);
  }

  // 5. Check for transactions that might have been updated (created_at before migration but have price)
  // Migration 0003 was added around July 2026 based on git history
  const oldWithPrice = await pool.query(`
    SELECT 
      pt.transaction_id,
      pt.product_id,
      pt.price_milliunits,
      pt.currency,
      pt.purchase_date,
      pt.created_at,
      u.display_name
    FROM processed_transactions pt
    LEFT JOIN users u ON u.id = pt.user_id
    WHERE pt.price_milliunits IS NOT NULL
      AND pt.environment = 'Production'
      AND pt.created_at < '2026-07-01'
    ORDER BY pt.created_at
  `);

  console.log(`\n5. Old transactions (created before 2026-07-01) WITH price_milliunits: ${oldWithPrice.rows.length}`);
  if (oldWithPrice.rows.length > 0) {
    console.log('  These were likely backfilled via updateTransactionMetadata');
    console.table(oldWithPrice.rows.map(r => ({
      transaction_id: r.transaction_id.slice(0, 20) + '...',
      product_id: r.product_id,
      price_try: +(Number(r.price_milliunits) / 1000).toFixed(2),
      fallback_price: priceOf(r.product_id),
      currency: r.currency,
      purchase_date: r.purchase_date,
      created_at: r.created_at,
      user: r.display_name,
    })));
  }

  // 6. Individual purchase list with revenue breakdown
  const purchases = await pool.query(`
    SELECT 
      pt.transaction_id,
      pt.product_id,
      pt.price_milliunits,
      pt.currency,
      pt.purchase_date,
      pt.created_at,
      pt.environment,
      u.display_name,
      u.id as user_id
    FROM processed_transactions pt
    LEFT JOIN users u ON u.id = pt.user_id
    WHERE pt.environment = 'Production'
      AND COALESCE(pt.purchase_date, pt.created_at) >= '2026-08-04 00:00+03'
    ORDER BY COALESCE(pt.purchase_date, pt.created_at) DESC
  `);

  console.log('\n6. All Production purchases (latest first):');
  console.table(purchases.rows.map(r => ({
    transaction_id: r.transaction_id.slice(0, 20) + '...',
    product: r.product_id,
    price_milliunits: r.price_milliunits ? +(Number(r.price_milliunits) / 1000).toFixed(2) : 'NULL (fallback)',
    fallback: priceOf(r.product_id),
    currency: r.currency,
    purchase_date: r.purchase_date,
    created_at: r.created_at,
    user: r.display_name || 'guest',
  })));

  await pool.end();
}

main().catch(e => {
  console.error('Audit failed:', e);
  process.exit(1);
});