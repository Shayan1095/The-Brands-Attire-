import { PGlite } from "@electric-sql/pglite";

const db = new PGlite("./.data/pglite");

const result = await db.query(`
  SELECT
    p.name AS product_name,
    pi.url,
    pi.thumb_url,
    pi.sort_order
  FROM product_images pi
  JOIN products p ON p.id = pi.product_id
  ORDER BY p.name, pi.sort_order LIMIT 20
`);

console.table(result.rows);

await db.close();
