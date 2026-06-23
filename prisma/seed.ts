import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding CartWise AI database...");

  // ─── Categories ────────────────────────────────────────────────────────────
  const categories = await prisma.$transaction([
    prisma.category.upsert({ where: { slug: "dairy" }, update: {}, create: { slug: "dairy", name: "Dairy & Eggs" } }),
    prisma.category.upsert({ where: { slug: "eggs" }, update: {}, create: { slug: "eggs", name: "Eggs", parentId: undefined } }),
    prisma.category.upsert({ where: { slug: "meat" }, update: {}, create: { slug: "meat", name: "Meat & Seafood" } }),
    prisma.category.upsert({ where: { slug: "produce" }, update: {}, create: { slug: "produce", name: "Produce" } }),
    prisma.category.upsert({ where: { slug: "cereal" }, update: {}, create: { slug: "cereal", name: "Cereal & Breakfast" } }),
    prisma.category.upsert({ where: { slug: "snacks" }, update: {}, create: { slug: "snacks", name: "Snacks & Candy" } }),
    prisma.category.upsert({ where: { slug: "personal-care" }, update: {}, create: { slug: "personal-care", name: "Personal Care" } }),
    prisma.category.upsert({ where: { slug: "cleaning" }, update: {}, create: { slug: "cleaning", name: "Cleaning & Household" } }),
    prisma.category.upsert({ where: { slug: "paper-goods" }, update: {}, create: { slug: "paper-goods", name: "Paper Goods" } }),
    prisma.category.upsert({ where: { slug: "beverages" }, update: {}, create: { slug: "beverages", name: "Beverages" } }),
    prisma.category.upsert({ where: { slug: "pantry" }, update: {}, create: { slug: "pantry", name: "Pantry Staples" } }),
    prisma.category.upsert({ where: { slug: "frozen" }, update: {}, create: { slug: "frozen", name: "Frozen Foods" } }),
    prisma.category.upsert({ where: { slug: "bakery" }, update: {}, create: { slug: "bakery", name: "Bread & Bakery" } }),
    prisma.category.upsert({ where: { slug: "condiments" }, update: {}, create: { slug: "condiments", name: "Condiments & Sauces" } }),
  ]);
  console.log(`  ✓ ${categories.length} categories`);

  // ─── Brands ────────────────────────────────────────────────────────────────
  const brands = await prisma.$transaction([
    prisma.brand.upsert({ where: { slug: "great-value" }, update: {}, create: { slug: "great-value", name: "Great Value", isNational: false } }),
    prisma.brand.upsert({ where: { slug: "good-gather" }, update: {}, create: { slug: "good-gather", name: "Good & Gather", isNational: false } }),
    prisma.brand.upsert({ where: { slug: "kirkland" }, update: {}, create: { slug: "kirkland", name: "Kirkland Signature", isNational: false } }),
    prisma.brand.upsert({ where: { slug: "general-mills" }, update: {}, create: { slug: "general-mills", name: "General Mills", isNational: true } }),
    prisma.brand.upsert({ where: { slug: "kelloggs" }, update: {}, create: { slug: "kelloggs", name: "Kellogg's", isNational: true } }),
    prisma.brand.upsert({ where: { slug: "nabisco" }, update: {}, create: { slug: "nabisco", name: "Nabisco", isNational: true } }),
    prisma.brand.upsert({ where: { slug: "procter-gamble" }, update: {}, create: { slug: "procter-gamble", name: "Procter & Gamble", isNational: true } }),
    prisma.brand.upsert({ where: { slug: "unilever" }, update: {}, create: { slug: "unilever", name: "Unilever", isNational: true } }),
    prisma.brand.upsert({ where: { slug: "coca-cola" }, update: {}, create: { slug: "coca-cola", name: "Coca-Cola", isNational: true } }),
    prisma.brand.upsert({ where: { slug: "pepsi" }, update: {}, create: { slug: "pepsi", name: "PepsiCo", isNational: true } }),
    prisma.brand.upsert({ where: { slug: "daisy" }, update: {}, create: { slug: "daisy", name: "Daisy", isNational: true } }),
    prisma.brand.upsert({ where: { slug: "horizon-organic" }, update: {}, create: { slug: "horizon-organic", name: "Horizon Organic", isNational: true } }),
    prisma.brand.upsert({ where: { slug: "tyson" }, update: {}, create: { slug: "tyson", name: "Tyson Foods", isNational: true } }),
    prisma.brand.upsert({ where: { slug: "dole" }, update: {}, create: { slug: "dole", name: "Dole", isNational: true } }),
    prisma.brand.upsert({ where: { slug: "tide" }, update: {}, create: { slug: "tide", name: "Tide", isNational: true } }),
    prisma.brand.upsert({ where: { slug: "crest" }, update: {}, create: { slug: "crest", name: "Crest", isNational: true } }),
    prisma.brand.upsert({ where: { slug: "bounty" }, update: {}, create: { slug: "bounty", name: "Bounty", isNational: true } }),
    prisma.brand.upsert({ where: { slug: "charmin" }, update: {}, create: { slug: "charmin", name: "Charmin", isNational: true } }),
  ]);
  console.log(`  ✓ ${brands.length} brands`);

  // ─── Stores ────────────────────────────────────────────────────────────────
  const storeData = [
    { slug: "walmart", name: "Walmart", chain: "Walmart", primaryColor: "#0071CE", hasLoyaltyCard: false, acceptsMfgCoupons: true, hasDigitalCoupons: true, hasWeeklyAd: true, hasFuelRewards: false },
    { slug: "target", name: "Target", chain: "Target", primaryColor: "#CC0000", hasLoyaltyCard: true, loyaltyCardName: "Target Circle", acceptsMfgCoupons: true, hasDigitalCoupons: true, hasWeeklyAd: true, hasFuelRewards: false },
    { slug: "kroger", name: "Kroger", chain: "Kroger", primaryColor: "#003DA5", hasLoyaltyCard: true, loyaltyCardName: "Kroger Plus Card", acceptsMfgCoupons: true, hasDigitalCoupons: true, hasWeeklyAd: true, hasFuelRewards: true },
    { slug: "aldi", name: "Aldi", chain: "Aldi", primaryColor: "#009B4D", hasLoyaltyCard: false, acceptsMfgCoupons: false, hasDigitalCoupons: false, hasWeeklyAd: true, hasFuelRewards: false },
    { slug: "wegmans", name: "Wegmans", chain: "Wegmans", primaryColor: "#006747", hasLoyaltyCard: true, loyaltyCardName: "Wegmans App", acceptsMfgCoupons: true, hasDigitalCoupons: true, hasWeeklyAd: true, hasFuelRewards: false },
    { slug: "cvs", name: "CVS Pharmacy", chain: "CVS", primaryColor: "#CC0000", hasLoyaltyCard: true, loyaltyCardName: "ExtraCare", acceptsMfgCoupons: true, hasDigitalCoupons: true, hasWeeklyAd: true, hasFuelRewards: false },
    { slug: "walgreens", name: "Walgreens", chain: "Walgreens", primaryColor: "#E31837", hasLoyaltyCard: true, loyaltyCardName: "myWalgreens", acceptsMfgCoupons: true, hasDigitalCoupons: true, hasWeeklyAd: true, hasFuelRewards: false },
    { slug: "costco", name: "Costco", chain: "Costco", primaryColor: "#E31837", hasLoyaltyCard: true, loyaltyCardName: "Costco Membership", acceptsMfgCoupons: false, hasDigitalCoupons: false, hasWeeklyAd: false, hasFuelRewards: false },
  ];

  const stores: Record<string, string> = {};
  for (const s of storeData) {
    const store = await prisma.store.upsert({
      where: { slug: s.slug },
      update: {},
      create: s,
    });
    stores[s.slug] = store.id;
  }
  console.log(`  ✓ ${Object.keys(stores).length} stores`);

  // ─── Store Locations (demo data — Columbus, OH metro area) ────────────────
  const locationData: Array<{
    slug: string; address: string; city: string; state: string;
    zipCode: string; lat: number; lng: number;
  }> = [
    { slug: "walmart",   address: "1234 W Broad St",     city: "Columbus",    state: "OH", zipCode: "43215", lat: 39.9612, lng: -82.9988 },
    { slug: "target",    address: "5678 Polaris Pkwy",    city: "Columbus",    state: "OH", zipCode: "43240", lat: 40.1467, lng: -82.9588 },
    { slug: "kroger",    address: "910 W Fifth Ave",      city: "Columbus",    state: "OH", zipCode: "43212", lat: 39.9702, lng: -83.0224 },
    { slug: "aldi",      address: "2345 Henderson Rd",    city: "Columbus",    state: "OH", zipCode: "43220", lat: 40.0295, lng: -83.0443 },
    { slug: "wegmans",   address: "7890 Sawmill Rd",      city: "Dublin",      state: "OH", zipCode: "43016", lat: 40.1003, lng: -83.1224 },
    { slug: "cvs",       address: "321 High St",          city: "Columbus",    state: "OH", zipCode: "43215", lat: 39.9583, lng: -82.9985 },
    { slug: "walgreens", address: "654 N High St",        city: "Columbus",    state: "OH", zipCode: "43215", lat: 39.9761, lng: -82.9987 },
    { slug: "costco",    address: "1234 Stringtown Rd",   city: "Grove City",  state: "OH", zipCode: "43123", lat: 39.8784, lng: -83.0935 },
  ];
  for (const loc of locationData) {
    await prisma.storeLocation.upsert({
      where: { id: `loc-${loc.slug}` },
      update: { lat: loc.lat, lng: loc.lng, zipCode: loc.zipCode },
      create: {
        id: `loc-${loc.slug}`,
        storeId: stores[loc.slug],
        address: loc.address,
        city: loc.city,
        state: loc.state,
        zipCode: loc.zipCode,
        lat: loc.lat,
        lng: loc.lng,
        isActive: true,
      },
    });
  }
  console.log(`  ✓ ${locationData.length} store locations`);

  // ─── Products ──────────────────────────────────────────────────────────────
  const productData = [
    // Dairy
    { slug: "whole-milk-gallon", name: "Whole Milk (1 Gallon)", normalizedName: "milk whole gallon", categorySlug: "dairy", size: "1 gallon", unit: "gallon", unitQuantity: 1, averagePrice: 4.49, historicalLow: 2.99, historicalHigh: 5.49, keywords: ["milk", "whole milk", "dairy", "gallon"] },
    { slug: "2-percent-milk-gallon", name: "2% Reduced Fat Milk (1 Gallon)", normalizedName: "milk 2 percent gallon", categorySlug: "dairy", size: "1 gallon", unit: "gallon", unitQuantity: 1, averagePrice: 4.29, historicalLow: 2.89, historicalHigh: 5.29, keywords: ["milk", "2 percent", "reduced fat", "dairy"] },
    { slug: "butter-salted-1lb", name: "Salted Butter (1 lb)", normalizedName: "butter salted", categorySlug: "dairy", size: "1 lb", unit: "lb", unitQuantity: 1, averagePrice: 5.49, historicalLow: 3.49, historicalHigh: 7.99, keywords: ["butter", "salted butter"] },
    { slug: "cheddar-cheese-block-8oz", name: "Sharp Cheddar Cheese (8 oz)", normalizedName: "cheddar cheese sharp", categorySlug: "dairy", size: "8 oz", unit: "oz", unitQuantity: 8, averagePrice: 3.99, historicalLow: 2.49, historicalHigh: 5.49, keywords: ["cheese", "cheddar", "sharp cheddar"] },
    { slug: "sour-cream-16oz", name: "Sour Cream (16 oz)", normalizedName: "sour cream", categorySlug: "dairy", size: "16 oz", unit: "oz", unitQuantity: 16, averagePrice: 2.99, historicalLow: 1.79, historicalHigh: 3.99, keywords: ["sour cream", "dairy"] },
    { slug: "greek-yogurt-vanilla-32oz", name: "Greek Yogurt Vanilla (32 oz)", normalizedName: "greek yogurt vanilla", categorySlug: "dairy", size: "32 oz", unit: "oz", unitQuantity: 32, averagePrice: 5.99, historicalLow: 3.99, historicalHigh: 7.99, keywords: ["yogurt", "greek yogurt", "vanilla yogurt"] },
    // Eggs
    { slug: "eggs-large-dozen", name: "Large Grade A Eggs (1 Dozen)", normalizedName: "eggs large dozen", categorySlug: "dairy", size: "12 ct", unit: "count", unitQuantity: 12, averagePrice: 3.49, historicalLow: 1.49, historicalHigh: 6.99, keywords: ["eggs", "large eggs", "dozen eggs"] },
    { slug: "eggs-large-18ct", name: "Large Grade A Eggs (18 Count)", normalizedName: "eggs large 18 count", categorySlug: "dairy", size: "18 ct", unit: "count", unitQuantity: 18, averagePrice: 4.99, historicalLow: 2.49, historicalHigh: 8.99, keywords: ["eggs", "large eggs", "18 count"] },
    // Meat
    { slug: "chicken-breast-boneless", name: "Boneless Skinless Chicken Breast", normalizedName: "chicken breast boneless skinless", categorySlug: "meat", size: "per lb", unit: "lb", unitQuantity: 1, averagePrice: 4.99, historicalLow: 1.99, historicalHigh: 7.99, keywords: ["chicken", "chicken breast", "boneless chicken", "skinless chicken"] },
    { slug: "ground-beef-80-20", name: "80/20 Ground Beef", normalizedName: "ground beef 80 20", categorySlug: "meat", size: "per lb", unit: "lb", unitQuantity: 1, averagePrice: 5.49, historicalLow: 3.49, historicalHigh: 8.99, keywords: ["beef", "ground beef", "hamburger"] },
    { slug: "pork-chops-boneless", name: "Boneless Pork Chops", normalizedName: "pork chops boneless", categorySlug: "meat", size: "per lb", unit: "lb", unitQuantity: 1, averagePrice: 4.29, historicalLow: 2.49, historicalHigh: 6.99, keywords: ["pork", "pork chops", "boneless pork"] },
    { slug: "salmon-fillet", name: "Atlantic Salmon Fillet", normalizedName: "salmon fillet atlantic", categorySlug: "meat", size: "per lb", unit: "lb", unitQuantity: 1, averagePrice: 9.99, historicalLow: 6.99, historicalHigh: 14.99, keywords: ["salmon", "fish", "seafood", "atlantic salmon"] },
    { slug: "bacon-1lb", name: "Thick Cut Bacon (1 lb)", normalizedName: "bacon thick cut", categorySlug: "meat", size: "1 lb", unit: "lb", unitQuantity: 1, averagePrice: 7.99, historicalLow: 4.99, historicalHigh: 11.99, keywords: ["bacon", "thick cut bacon", "pork"] },
    // Produce
    { slug: "bananas", name: "Bananas", normalizedName: "bananas fresh", categorySlug: "produce", size: "per lb", unit: "lb", unitQuantity: 1, averagePrice: 0.59, historicalLow: 0.29, historicalHigh: 0.89, keywords: ["banana", "bananas", "fruit"] },
    { slug: "apples-gala-3lb", name: "Gala Apples (3 lb bag)", normalizedName: "apples gala bag", categorySlug: "produce", size: "3 lb", unit: "lb", unitQuantity: 3, averagePrice: 4.99, historicalLow: 2.99, historicalHigh: 6.99, keywords: ["apples", "gala apples", "fruit"] },
    { slug: "strawberries-1lb", name: "Strawberries (1 lb)", normalizedName: "strawberries fresh", categorySlug: "produce", size: "1 lb", unit: "lb", unitQuantity: 1, averagePrice: 3.99, historicalLow: 1.99, historicalHigh: 5.99, keywords: ["strawberries", "berries", "fruit"] },
    { slug: "broccoli-crown", name: "Broccoli Crown", normalizedName: "broccoli crown fresh", categorySlug: "produce", size: "per lb", unit: "lb", unitQuantity: 1, averagePrice: 1.99, historicalLow: 0.99, historicalHigh: 3.49, keywords: ["broccoli", "vegetables", "produce"] },
    { slug: "baby-carrots-1lb", name: "Baby Carrots (1 lb bag)", normalizedName: "baby carrots", categorySlug: "produce", size: "1 lb", unit: "lb", unitQuantity: 1, averagePrice: 1.29, historicalLow: 0.79, historicalHigh: 2.49, keywords: ["carrots", "baby carrots", "vegetables"] },
    { slug: "russet-potatoes-5lb", name: "Russet Potatoes (5 lb bag)", normalizedName: "russet potatoes bag", categorySlug: "produce", size: "5 lb", unit: "lb", unitQuantity: 5, averagePrice: 3.99, historicalLow: 1.99, historicalHigh: 5.99, keywords: ["potatoes", "russet potatoes", "vegetables"] },
    { slug: "avocados-4ct", name: "Avocados (4 count)", normalizedName: "avocados fresh", categorySlug: "produce", size: "4 ct", unit: "count", unitQuantity: 4, averagePrice: 4.99, historicalLow: 2.99, historicalHigh: 7.99, keywords: ["avocado", "avocados", "fruit"] },
    // Cereal
    { slug: "cheerios-18oz", name: "Cheerios Original (18 oz)", normalizedName: "cheerios original", categorySlug: "cereal", brandSlug: "general-mills", size: "18 oz", unit: "oz", unitQuantity: 18, averagePrice: 5.49, historicalLow: 2.99, historicalHigh: 6.99, keywords: ["cheerios", "cereal", "oats", "breakfast"] },
    { slug: "frosted-flakes-19oz", name: "Frosted Flakes (19 oz)", normalizedName: "frosted flakes", categorySlug: "cereal", brandSlug: "kelloggs", size: "19 oz", unit: "oz", unitQuantity: 19, averagePrice: 5.29, historicalLow: 2.89, historicalHigh: 6.49, keywords: ["frosted flakes", "cereal", "kelloggs", "breakfast"] },
    { slug: "instant-oatmeal-variety", name: "Instant Oatmeal Variety Pack (10 ct)", normalizedName: "instant oatmeal variety", categorySlug: "cereal", size: "10 ct", unit: "count", unitQuantity: 10, averagePrice: 4.99, historicalLow: 2.99, historicalHigh: 6.49, keywords: ["oatmeal", "instant oatmeal", "breakfast", "cereal"] },
    { slug: "honey-bunches-of-oats-18oz", name: "Honey Bunches of Oats (18 oz)", normalizedName: "honey bunches oats", categorySlug: "cereal", size: "18 oz", unit: "oz", unitQuantity: 18, averagePrice: 4.99, historicalLow: 2.99, historicalHigh: 5.99, keywords: ["honey bunches", "cereal", "breakfast"] },
    // Snacks
    { slug: "lays-classic-chips-9oz", name: "Lay's Classic Potato Chips (9 oz)", normalizedName: "lays classic chips", categorySlug: "snacks", size: "9 oz", unit: "oz", unitQuantity: 9, averagePrice: 4.99, historicalLow: 2.99, historicalHigh: 5.99, keywords: ["lays", "chips", "potato chips", "snacks"] },
    { slug: "oreos-14oz", name: "Oreo Cookies (14 oz)", normalizedName: "oreo cookies", categorySlug: "snacks", brandSlug: "nabisco", size: "14 oz", unit: "oz", unitQuantity: 14, averagePrice: 4.49, historicalLow: 2.49, historicalHigh: 5.49, keywords: ["oreos", "cookies", "nabisco", "snacks"] },
    { slug: "goldfish-crackers-30oz", name: "Pepperidge Farm Goldfish Crackers (30 oz)", normalizedName: "goldfish crackers", categorySlug: "snacks", size: "30 oz", unit: "oz", unitQuantity: 30, averagePrice: 8.99, historicalLow: 5.99, historicalHigh: 10.99, keywords: ["goldfish", "crackers", "snacks", "pepperidge farm"] },
    // Personal Care
    { slug: "toothpaste-crest-65oz", name: "Crest Complete Toothpaste (6.5 oz)", normalizedName: "crest toothpaste complete", categorySlug: "personal-care", brandSlug: "crest", size: "6.5 oz", unit: "oz", unitQuantity: 6.5, averagePrice: 4.99, historicalLow: 1.99, historicalHigh: 6.99, keywords: ["toothpaste", "crest", "crest complete", "dental"] },
    { slug: "shampoo-pantene-12oz", name: "Pantene Pro-V Shampoo (12 oz)", normalizedName: "pantene shampoo", categorySlug: "personal-care", brandSlug: "procter-gamble", size: "12 oz", unit: "oz", unitQuantity: 12, averagePrice: 7.99, historicalLow: 4.99, historicalHigh: 9.99, keywords: ["shampoo", "pantene", "hair care"] },
    { slug: "dove-soap-bar-4ct", name: "Dove Beauty Bar Soap (4 count)", normalizedName: "dove soap bar", categorySlug: "personal-care", brandSlug: "unilever", size: "4 ct", unit: "count", unitQuantity: 4, averagePrice: 6.99, historicalLow: 3.99, historicalHigh: 8.99, keywords: ["soap", "dove", "bar soap", "body wash"] },
    { slug: "axe-deodorant-3oz", name: "Axe Deodorant Spray (3 oz)", normalizedName: "axe deodorant spray", categorySlug: "personal-care", brandSlug: "unilever", size: "3 oz", unit: "oz", unitQuantity: 3, averagePrice: 5.99, historicalLow: 2.99, historicalHigh: 7.99, keywords: ["deodorant", "axe", "body spray"] },
    { slug: "bandaids-assorted-90ct", name: "Band-Aid Assorted Bandages (90 ct)", normalizedName: "bandaid assorted", categorySlug: "personal-care", size: "90 ct", unit: "count", unitQuantity: 90, averagePrice: 8.99, historicalLow: 4.99, historicalHigh: 11.99, keywords: ["bandaids", "bandages", "first aid"] },
    // Cleaning
    { slug: "tide-pods-32ct", name: "Tide Pods Laundry Detergent (32 ct)", normalizedName: "tide pods laundry", categorySlug: "cleaning", brandSlug: "tide", size: "32 ct", unit: "count", unitQuantity: 32, averagePrice: 16.99, historicalLow: 9.99, historicalHigh: 21.99, keywords: ["tide", "tide pods", "laundry", "detergent"] },
    { slug: "laundry-detergent-liquid-64oz", name: "Liquid Laundry Detergent (64 oz)", normalizedName: "laundry detergent liquid", categorySlug: "cleaning", size: "64 oz", unit: "oz", unitQuantity: 64, averagePrice: 12.99, historicalLow: 6.99, historicalHigh: 16.99, keywords: ["laundry detergent", "laundry", "cleaning"] },
    { slug: "dawn-dish-soap-24oz", name: "Dawn Ultra Dish Soap (24 oz)", normalizedName: "dawn dish soap ultra", categorySlug: "cleaning", size: "24 oz", unit: "oz", unitQuantity: 24, averagePrice: 5.49, historicalLow: 2.99, historicalHigh: 6.99, keywords: ["dawn", "dish soap", "dishwashing soap"] },
    { slug: "windex-glass-cleaner-23oz", name: "Windex Glass Cleaner (23 oz)", normalizedName: "windex glass cleaner", categorySlug: "cleaning", size: "23 oz", unit: "oz", unitQuantity: 23, averagePrice: 4.99, historicalLow: 2.99, historicalHigh: 6.49, keywords: ["windex", "glass cleaner", "window cleaner"] },
    { slug: "lysol-spray-19oz", name: "Lysol Disinfectant Spray (19 oz)", normalizedName: "lysol disinfectant spray", categorySlug: "cleaning", size: "19 oz", unit: "oz", unitQuantity: 19, averagePrice: 6.99, historicalLow: 3.99, historicalHigh: 8.99, keywords: ["lysol", "disinfectant", "spray cleaner"] },
    // Paper Goods
    { slug: "paper-towels-bounty-8pk", name: "Bounty Select-A-Size Paper Towels (8 Regular)", normalizedName: "bounty paper towels select a size", categorySlug: "paper-goods", brandSlug: "bounty", size: "8 ct", unit: "count", unitQuantity: 8, averagePrice: 14.99, historicalLow: 8.99, historicalHigh: 18.99, keywords: ["paper towels", "bounty", "bounty select", "paper"] },
    { slug: "toilet-paper-charmin-12pk", name: "Charmin Ultra Soft Toilet Paper (12 Mega Rolls)", normalizedName: "charmin toilet paper ultra soft", categorySlug: "paper-goods", brandSlug: "charmin", size: "12 mega", unit: "count", unitQuantity: 12, averagePrice: 19.99, historicalLow: 11.99, historicalHigh: 24.99, keywords: ["toilet paper", "charmin", "charmin ultra", "tp"] },
    { slug: "kleenex-tissues-3pk", name: "Kleenex Facial Tissues (3-pack)", normalizedName: "kleenex facial tissues", categorySlug: "paper-goods", size: "3 pk", unit: "pack", unitQuantity: 3, averagePrice: 5.99, historicalLow: 3.49, historicalHigh: 7.99, keywords: ["kleenex", "tissues", "facial tissues"] },
    // Beverages
    { slug: "coke-12pack", name: "Coca-Cola (12-pack 12 oz cans)", normalizedName: "coca cola 12 pack cans", categorySlug: "beverages", brandSlug: "coca-cola", size: "12 pk 12 oz", unit: "count", unitQuantity: 12, averagePrice: 7.99, historicalLow: 3.49, historicalHigh: 9.99, keywords: ["coke", "coca cola", "soda", "cola"] },
    { slug: "pepsi-2liter", name: "Pepsi Cola (2 Liter)", normalizedName: "pepsi cola 2 liter", categorySlug: "beverages", brandSlug: "pepsi", size: "2 L", unit: "liter", unitQuantity: 2, averagePrice: 2.49, historicalLow: 0.99, historicalHigh: 3.49, keywords: ["pepsi", "pepsi cola", "soda", "2 liter"] },
    { slug: "orange-juice-tropicana-52oz", name: "Tropicana Orange Juice (52 oz)", normalizedName: "tropicana orange juice", categorySlug: "beverages", size: "52 oz", unit: "oz", unitQuantity: 52, averagePrice: 5.99, historicalLow: 3.49, historicalHigh: 7.99, keywords: ["orange juice", "tropicana", "oj", "juice"] },
    { slug: "water-case-16oz-24ct", name: "Purified Drinking Water (24-pack 16.9 oz)", normalizedName: "water bottles case 24 pack", categorySlug: "beverages", size: "24 ct 16.9 oz", unit: "count", unitQuantity: 24, averagePrice: 5.99, historicalLow: 2.99, historicalHigh: 7.99, keywords: ["water", "bottled water", "water bottles", "case of water"] },
    { slug: "coffee-medium-roast-30oz", name: "Folgers Classic Roast Coffee (30 oz)", normalizedName: "folgers coffee medium roast", categorySlug: "beverages", size: "30 oz", unit: "oz", unitQuantity: 30, averagePrice: 11.99, historicalLow: 7.99, historicalHigh: 15.99, keywords: ["coffee", "folgers", "folgers coffee", "ground coffee"] },
    // Pantry Staples
    { slug: "pasta-penne-16oz", name: "Penne Pasta (16 oz)", normalizedName: "penne pasta", categorySlug: "pantry", size: "16 oz", unit: "oz", unitQuantity: 16, averagePrice: 1.99, historicalLow: 0.79, historicalHigh: 2.99, keywords: ["pasta", "penne", "penne pasta"] },
    { slug: "white-rice-5lb", name: "Long Grain White Rice (5 lb)", normalizedName: "white rice long grain", categorySlug: "pantry", size: "5 lb", unit: "lb", unitQuantity: 5, averagePrice: 5.49, historicalLow: 2.99, historicalHigh: 7.99, keywords: ["rice", "white rice", "long grain rice"] },
    { slug: "bread-whole-wheat-20oz", name: "Whole Wheat Sandwich Bread (20 oz)", normalizedName: "whole wheat bread sandwich", categorySlug: "bakery", size: "20 oz", unit: "oz", unitQuantity: 20, averagePrice: 4.49, historicalLow: 2.49, historicalHigh: 5.99, keywords: ["bread", "whole wheat bread", "sandwich bread", "wheat bread"] },
    { slug: "olive-oil-16oz", name: "Extra Virgin Olive Oil (16 oz)", normalizedName: "olive oil extra virgin", categorySlug: "pantry", size: "16 oz", unit: "oz", unitQuantity: 16, averagePrice: 8.99, historicalLow: 5.99, historicalHigh: 12.99, keywords: ["olive oil", "extra virgin", "oil", "evoo"] },
    { slug: "canned-tomatoes-14oz", name: "Diced Tomatoes Canned (14.5 oz)", normalizedName: "diced tomatoes canned", categorySlug: "pantry", size: "14.5 oz", unit: "oz", unitQuantity: 14.5, averagePrice: 1.29, historicalLow: 0.69, historicalHigh: 1.99, keywords: ["canned tomatoes", "diced tomatoes", "tomatoes"] },
    { slug: "black-beans-canned-15oz", name: "Black Beans Canned (15 oz)", normalizedName: "black beans canned", categorySlug: "pantry", size: "15 oz", unit: "oz", unitQuantity: 15, averagePrice: 1.09, historicalLow: 0.59, historicalHigh: 1.79, keywords: ["black beans", "beans", "canned beans"] },
    { slug: "peanut-butter-jif-40oz", name: "Jif Peanut Butter Creamy (40 oz)", normalizedName: "jif peanut butter creamy", categorySlug: "pantry", size: "40 oz", unit: "oz", unitQuantity: 40, averagePrice: 9.99, historicalLow: 6.49, historicalHigh: 12.99, keywords: ["peanut butter", "jif", "jif creamy"] },
    { slug: "chicken-broth-32oz", name: "Chicken Broth (32 oz carton)", normalizedName: "chicken broth", categorySlug: "pantry", size: "32 oz", unit: "oz", unitQuantity: 32, averagePrice: 2.99, historicalLow: 1.49, historicalHigh: 4.29, keywords: ["chicken broth", "broth", "soup base"] },
  ];

  const products: Record<string, string> = {};
  for (const p of productData) {
    const { categorySlug, brandSlug, ...rest } = p;
    const cat = categories.find(c => c.slug === categorySlug);
    const brand = brands.find(b => b.slug === brandSlug);
    const product = await prisma.product.upsert({
      where: { slug: p.slug },
      update: {},
      create: {
        ...rest,
        categoryId: cat?.id,
        brandId: brand?.id,
      },
    });
    products[p.slug] = product.id;
  }
  console.log(`  ✓ ${Object.keys(products).length} products`);

  // ─── UPCs ──────────────────────────────────────────────────────────────────
  const upcData: Array<{ slug: string; upc: string }> = [
    { slug: "whole-milk-gallon",        upc: "04125011793" },
    { slug: "2-percent-milk-gallon",    upc: "04125011800" },
    { slug: "butter-salted-1lb",        upc: "07041800000" },
    { slug: "cheddar-cheese-block-8oz", upc: "02113120000" },
    { slug: "sour-cream-16oz",          upc: "07117000000" },
    { slug: "greek-yogurt-vanilla-32oz",upc: "08935800000" },
    { slug: "eggs-large-dozen",         upc: "02700000001" },
    { slug: "eggs-large-18ct",          upc: "02700000018" },
    { slug: "chicken-breast-boneless",  upc: "02200200000" },
    { slug: "ground-beef-80-20",        upc: "02300100000" },
    { slug: "pork-chops-boneless",      upc: "02310100000" },
    { slug: "salmon-fillet",            upc: "02400100000" },
    { slug: "bacon-1lb",               upc: "07272300000" },
    { slug: "bananas",                  upc: "04011000000" },
    { slug: "apples-gala-3lb",          upc: "03338300000" },
    { slug: "strawberries-1lb",         upc: "03116200000" },
    { slug: "broccoli-crown",           upc: "03227600000" },
    { slug: "baby-carrots-1lb",         upc: "07105900000" },
    { slug: "russet-potatoes-5lb",      upc: "03204900000" },
    { slug: "avocados-4ct",             upc: "03338400000" },
    { slug: "cheerios-18oz",            upc: "01600027527" },
    { slug: "frosted-flakes-19oz",      upc: "03800012929" },
    { slug: "instant-oatmeal-variety",  upc: "01600011000" },
    { slug: "honey-bunches-of-oats-18oz", upc: "08437600000" },
    { slug: "lays-classic-chips-9oz",   upc: "02840027800" },
    { slug: "oreos-14oz",               upc: "04400001222" },
    { slug: "goldfish-crackers-30oz",   upc: "01410003800" },
    { slug: "toothpaste-crest-65oz",    upc: "03700017800" },
    { slug: "shampoo-pantene-12oz",     upc: "03700094350" },
    { slug: "dove-soap-bar-4ct",        upc: "01111026000" },
    { slug: "axe-deodorant-3oz",        upc: "07934900000" },
    { slug: "bandaids-assorted-90ct",   upc: "03810002990" },
    { slug: "tide-pods-32ct",           upc: "03700080898" },
    { slug: "laundry-detergent-liquid-64oz", upc: "07817200000" },
    { slug: "dawn-dish-soap-24oz",      upc: "03700045100" },
    { slug: "windex-glass-cleaner-23oz",upc: "04675400000" },
    { slug: "lysol-spray-19oz",         upc: "01900062200" },
    { slug: "paper-towels-bounty-8pk",  upc: "03700008006" },
    { slug: "toilet-paper-charmin-12pk",upc: "03700080888" },
    { slug: "kleenex-tissues-3pk",      upc: "03600056500" },
    { slug: "coke-12pack",              upc: "04900002200" },
    { slug: "pepsi-2liter",             upc: "01220000020" },
    { slug: "orange-juice-tropicana-52oz", upc: "04850000000" },
    { slug: "water-case-16oz-24ct",     upc: "07840300000" },
    { slug: "coffee-medium-roast-30oz", upc: "02550034050" },
    { slug: "pasta-penne-16oz",         upc: "07611300000" },
    { slug: "white-rice-5lb",           upc: "07447200000" },
    { slug: "bread-whole-wheat-20oz",   upc: "07242500000" },
    { slug: "olive-oil-16oz",           upc: "00754902000" },
    { slug: "canned-tomatoes-14oz",     upc: "02400450000" },
    { slug: "black-beans-canned-15oz",  upc: "02400480000" },
    { slug: "peanut-butter-jif-40oz",   upc: "05150001040" },
    { slug: "chicken-broth-32oz",       upc: "02400006080" },
  ];
  let upcCount = 0;
  for (const u of upcData) {
    const productId = products[u.slug];
    if (!productId) continue;
    await prisma.uPC.upsert({
      where: { upc: u.upc },
      update: {},
      create: { upc: u.upc, productId, isDefault: true },
    });
    upcCount++;
  }
  console.log(`  ✓ ${upcCount} UPC codes`);

  // ─── Note on live data ────────────────────────────────────────────────────
  // Price observations and opportunities are populated by live provider syncs,
  // not by this seed script. After seeding reference data, trigger a sync:
  //   POST /api/providers/sync  (with PROVIDER_SYNC_SECRET header)
  // or run: npx tsx src/scripts/sync-providers.ts
  //
  // Public providers (Flipp, Walmart scraper, RSS blogs) activate immediately.
  // Credential-gated providers activate once env vars are set (see .env.example).

  console.log("\n✅ BudgetBasket seed complete!");
  console.log(`   Stores: ${Object.keys(stores).length}`);
  console.log(`   Products: ${Object.keys(products).length}`);
  console.log("   Run provider sync to populate live deals.");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
