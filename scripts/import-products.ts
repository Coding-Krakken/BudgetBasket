/**
 * [DATA-01] Product catalog expansion pipeline.
 *
 * Imports real-world grocery products from the Open Food Facts family of
 * open databases (Open Food Facts, Open Products Facts, Open Beauty Facts —
 * all CC-BY-SA licensed, no API key required) and upserts them into the
 * CartWise catalog, mapped onto our existing category/brand taxonomy.
 *
 * Idempotent: re-running skips products already imported (matched by UPC).
 *
 * Usage:
 *   npm run db:import-products
 *   npm run db:import-products -- --per-category=60   (override target count)
 */
import { PrismaClient } from "@prisma/client";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();

const USER_AGENT = "BudgetBasket-CartWise/1.0 (contact: davidtraversmailbox@gmail.com)";

type OffSource = "off" | "opf" | "obf";

interface CategorySource {
  categorySlug: string;
  source: OffSource;
  tags: string[]; // Open*Facts category tags to query
}

// Maps our existing 14 CartWise categories onto Open Food/Products/Beauty
// Facts category taxonomies. Food categories use Open Food Facts; household
// paper/cleaning use Open Products Facts; personal care uses Open Beauty Facts
// (OFF only models food, so non-food categories need the sibling databases).
const CATEGORY_SOURCES: CategorySource[] = [
  { categorySlug: "dairy", source: "off", tags: ["en:dairies", "en:milks", "en:cheeses", "en:yogurts"] },
  { categorySlug: "eggs", source: "off", tags: ["en:eggs"] },
  { categorySlug: "meat", source: "off", tags: ["en:meats", "en:seafood", "en:poultries"] },
  { categorySlug: "produce", source: "off", tags: ["en:fruits", "en:vegetables", "en:fresh-vegetables", "en:fresh-fruits"] },
  { categorySlug: "cereal", source: "off", tags: ["en:breakfast-cereals"] },
  { categorySlug: "snacks", source: "off", tags: ["en:snacks", "en:salty-snacks", "en:biscuits-and-cakes", "en:chocolates"] },
  { categorySlug: "personal-care", source: "obf", tags: ["en:toothpastes", "en:shampoos", "en:shower-gels", "en:deodorants"] },
  { categorySlug: "cleaning", source: "opf", tags: ["en:laundry-detergents", "en:dishwashing-products", "en:household-cleaning-products"] },
  { categorySlug: "paper-goods", source: "opf", tags: ["en:paper-towels", "en:toilet-papers", "en:tissues"] },
  { categorySlug: "beverages", source: "off", tags: ["en:beverages", "en:sodas", "en:coffees", "en:fruit-juices", "en:waters"] },
  { categorySlug: "pantry", source: "off", tags: ["en:groceries", "en:canned-foods", "en:pastas", "en:rices", "en:condiments"] },
  { categorySlug: "frozen", source: "off", tags: ["en:frozen-foods", "en:ice-creams", "en:frozen-vegetables"] },
  { categorySlug: "bakery", source: "off", tags: ["en:breads", "en:bakery-products"] },
  { categorySlug: "condiments", source: "off", tags: ["en:condiments", "en:sauces", "en:ketchups", "en:mayonnaises"] },
];

const SOURCE_HOST: Record<OffSource, string> = {
  off: "world.openfoodfacts.org",
  opf: "world.openproductsfacts.org",
  obf: "world.openbeautyfacts.org",
};

interface RawOffProduct {
  code?: string;
  product_name?: string;
  product_name_en?: string;
  brands?: string;
  image_url?: string;
  image_front_small_url?: string;
  labels_tags?: string[];
  quantity?: string;
}

interface ImportCandidate {
  upc: string;
  name: string;
  brandName: string | null;
  imageUrl: string | null;
  isOrganic: boolean;
  size: string | null;
  categorySlug: string;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

function normalize(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

/** Open Food Facts serves multiple resolutions via filename suffix; "400" keeps thumbnails small (<50KB) while staying legible. */
function toThumbnail(imageUrl: string): string {
  return imageUrl.replace(/\.(\d+)\.(jpg|png)$/i, ".200.$2");
}

async function fetchCategory(source: OffSource, tag: string, pageSize: number): Promise<RawOffProduct[]> {
  const host = SOURCE_HOST[source];
  const url =
    `https://${host}/api/v2/search?categories_tags=${encodeURIComponent(tag)}` +
    `&countries_tags=en:united-states&page_size=${pageSize}&sort_by=unique_scans_n` +
    `&fields=code,product_name,product_name_en,brands,image_url,image_front_small_url,labels_tags,quantity`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (res.status === 429 || res.status === 503) {
        await new Promise((r) => setTimeout(r, attempt * 1500));
        continue;
      }
      if (!res.ok) return [];
      const json = (await res.json()) as { products?: RawOffProduct[] };
      return json.products ?? [];
    } catch {
      await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }
  return [];
}

async function collectCandidates(perCategory: number): Promise<ImportCandidate[]> {
  const candidates: ImportCandidate[] = [];
  const seenUpcs = new Set<string>();

  for (const { categorySlug, source, tags } of CATEGORY_SOURCES) {
    let collectedForCategory = 0;
    for (const tag of tags) {
      if (collectedForCategory >= perCategory) break;
      const raw = await fetchCategory(source, tag, Math.ceil(perCategory / 2));
      for (const p of raw) {
        if (collectedForCategory >= perCategory) break;
        const upc = (p.code ?? "").replace(/\D/g, "");
        const name = p.product_name_en?.trim() || p.product_name?.trim();
        if (!upc || upc.length < 8 || !name || name.length < 2) continue;
        if (seenUpcs.has(upc)) continue;

        const imageUrl = p.image_front_small_url || p.image_url || null;
        seenUpcs.add(upc);
        candidates.push({
          upc,
          name,
          brandName: p.brands?.split(",")[0]?.trim() || null,
          imageUrl: imageUrl ? toThumbnail(imageUrl) : null,
          isOrganic: (p.labels_tags ?? []).some((t) => t.includes("organic")),
          size: p.quantity?.trim() || null,
          categorySlug,
        });
        collectedForCategory++;
      }
      // Be polite to the (free, key-less) API between requests.
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  return candidates;
}

const TEST_LIST = [
  "milk", "eggs", "bread", "butter", "cheese", "chicken breast", "ground beef",
  "bananas", "apples", "potatoes", "onions", "tomatoes", "rice", "pasta",
  "cereal", "peanut butter", "coffee", "orange juice", "yogurt", "bacon",
  "lettuce", "carrots", "olive oil", "flour", "sugar", "salt", "pepper",
  "ketchup", "mayonnaise", "mustard", "soda", "water", "chips", "cookies",
  "ice cream", "frozen pizza", "toilet paper", "paper towels", "dish soap",
  "laundry detergent", "shampoo", "toothpaste", "deodorant", "tissues",
  "canned beans", "canned tomatoes", "soup", "salsa", "tortillas", "bagels",
  "granola bars",
];

function computeMatchRate(allKeywordSets: string[][]): { matched: number; total: number; misses: string[] } {
  let matched = 0;
  const misses: string[] = [];
  for (const term of TEST_LIST) {
    const found = allKeywordSets.some((kws) => kws.some((kw) => kw.includes(term) || term.includes(kw)));
    if (found) matched++;
    else misses.push(term);
  }
  return { matched, total: TEST_LIST.length, misses };
}

async function main() {
  const perCategoryArg = process.argv.find((a) => a.startsWith("--per-category="));
  const perCategory = perCategoryArg ? parseInt(perCategoryArg.split("=")[1], 10) : 45;

  console.log(`Fetching up to ${perCategory} products per category from Open Food/Products/Beauty Facts...`);
  const candidates = await collectCandidates(perCategory);
  console.log(`Collected ${candidates.length} candidate products across ${CATEGORY_SOURCES.length} categories.`);

  const categories = await prisma.category.findMany();
  const categoryBySlug = new Map(categories.map((c) => [c.slug, c.id]));

  const brandCache = new Map<string, string>();
  async function getOrCreateBrandId(brandName: string): Promise<string> {
    const slug = slugify(brandName);
    const cached = brandCache.get(slug);
    if (cached) return cached;
    const brand = await prisma.brand.upsert({
      where: { slug },
      update: {},
      create: { slug, name: brandName, isNational: true },
    });
    brandCache.set(slug, brand.id);
    return brand.id;
  }

  let created = 0;
  let skippedExisting = 0;
  let skippedNoCategory = 0;
  const allKeywordSets: string[][] = [];
  const perCategoryCounts: Record<string, number> = {};

  for (const c of candidates) {
    const categoryId = categoryBySlug.get(c.categorySlug);
    if (!categoryId) {
      skippedNoCategory++;
      continue;
    }

    const existingUpc = await prisma.uPC.findUnique({ where: { upc: c.upc } });
    if (existingUpc) {
      skippedExisting++;
      continue;
    }

    const brandId = c.brandName ? await getOrCreateBrandId(c.brandName) : null;
    const baseSlug = slugify(`${c.brandName ?? ""} ${c.name}`.trim()) || `product-${c.upc}`;
    let slug = baseSlug;
    let suffix = 1;
    while (await prisma.product.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${suffix++}`;
    }

    const keywords = Array.from(
      new Set(
        [c.name, c.brandName ?? ""]
          .join(" ")
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 2)
      )
    );

    const product = await prisma.product.create({
      data: {
        slug,
        name: c.name,
        normalizedName: normalize(c.name),
        brandId,
        categoryId,
        imageUrl: c.imageUrl,
        size: c.size,
        isOrganic: c.isOrganic,
        keywords,
      },
    });

    await prisma.uPC.create({
      data: { productId: product.id, upc: c.upc, isDefault: true },
    });

    allKeywordSets.push([normalize(c.name), ...keywords]);
    perCategoryCounts[c.categorySlug] = (perCategoryCounts[c.categorySlug] ?? 0) + 1;
    created++;
  }

  const totalProducts = await prisma.product.count();
  const matchRate = computeMatchRate(allKeywordSets);

  const report = [
    "# Product Catalog Import Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    `- Candidates collected: ${candidates.length}`,
    `- New products created: ${created}`,
    `- Skipped (UPC already in catalog): ${skippedExisting}`,
    `- Skipped (no category mapping): ${skippedNoCategory}`,
    `- **Total products in catalog: ${totalProducts}**`,
    "",
    "## Products created per category",
    ...Object.entries(perCategoryCounts).map(([slug, n]) => `- ${slug}: ${n}`),
    "",
    "## Match-rate test (50-item common grocery list, this run's imports only)",
    `${matchRate.matched}/${matchRate.total} matched (${Math.round((matchRate.matched / matchRate.total) * 100)}%)`,
    matchRate.misses.length ? `Misses: ${matchRate.misses.join(", ")}` : "No misses.",
    "",
    "## Source",
    "Open Food Facts / Open Products Facts / Open Beauty Facts (CC-BY-SA, no API key). Re-running this script is safe — products are matched and skipped by UPC.",
  ].join("\n");

  mkdirSync(join(process.cwd(), "docs", "data"), { recursive: true });
  writeFileSync(join(process.cwd(), "docs", "data", "PRODUCT_IMPORT_REPORT.md"), report);

  console.log(report);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
