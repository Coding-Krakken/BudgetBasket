import { PrismaClient, OpportunityType, ConfidenceLevel, StackabilityRule } from "@prisma/client";

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

  // ─── Price Observations ────────────────────────────────────────────────────
  const priceObs = [
    // Walmart prices (generally lowest)
    { productSlug: "whole-milk-gallon", storeSlug: "walmart", price: 3.96, salePrice: null },
    { productSlug: "2-percent-milk-gallon", storeSlug: "walmart", price: 3.76, salePrice: null },
    { productSlug: "eggs-large-dozen", storeSlug: "walmart", price: 2.97, salePrice: null },
    { productSlug: "chicken-breast-boneless", storeSlug: "walmart", price: 3.98, salePrice: 3.48 },
    { productSlug: "bananas", storeSlug: "walmart", price: 0.49, salePrice: null },
    { productSlug: "cheerios-18oz", storeSlug: "walmart", price: 4.74, salePrice: null },
    { productSlug: "tide-pods-32ct", storeSlug: "walmart", price: 14.97, salePrice: null },
    { productSlug: "toothpaste-crest-65oz", storeSlug: "walmart", price: 4.12, salePrice: null },
    { productSlug: "paper-towels-bounty-8pk", storeSlug: "walmart", price: 13.97, salePrice: null },
    { productSlug: "toilet-paper-charmin-12pk", storeSlug: "walmart", price: 18.97, salePrice: null },
    // Target prices
    { productSlug: "whole-milk-gallon", storeSlug: "target", price: 4.19, salePrice: null },
    { productSlug: "eggs-large-dozen", storeSlug: "target", price: 3.49, salePrice: 2.99 },
    { productSlug: "chicken-breast-boneless", storeSlug: "target", price: 5.49, salePrice: 4.49 },
    { productSlug: "bananas", storeSlug: "target", price: 0.59, salePrice: null },
    { productSlug: "cheerios-18oz", storeSlug: "target", price: 5.49, salePrice: 3.99 },
    { productSlug: "toothpaste-crest-65oz", storeSlug: "target", price: 4.99, salePrice: 3.49 },
    { productSlug: "tide-pods-32ct", storeSlug: "target", price: 16.99, salePrice: 12.99 },
    // Kroger prices (with loyalty card)
    { productSlug: "whole-milk-gallon", storeSlug: "kroger", price: 4.49, salePrice: 2.99 },
    { productSlug: "eggs-large-dozen", storeSlug: "kroger", price: 3.49, salePrice: 1.99 },
    { productSlug: "chicken-breast-boneless", storeSlug: "kroger", price: 4.99, salePrice: 3.99 },
    { productSlug: "ground-beef-80-20", storeSlug: "kroger", price: 5.49, salePrice: 4.49 },
    { productSlug: "laundry-detergent-liquid-64oz", storeSlug: "kroger", price: 11.99, salePrice: 8.99 },
    // Aldi prices (consistently low, no coupons)
    { productSlug: "whole-milk-gallon", storeSlug: "aldi", price: 3.49, salePrice: null },
    { productSlug: "2-percent-milk-gallon", storeSlug: "aldi", price: 3.29, salePrice: null },
    { productSlug: "eggs-large-dozen", storeSlug: "aldi", price: 2.49, salePrice: null },
    { productSlug: "bananas", storeSlug: "aldi", price: 0.39, salePrice: null },
    { productSlug: "chicken-breast-boneless", storeSlug: "aldi", price: 3.49, salePrice: null },
    { productSlug: "ground-beef-80-20", storeSlug: "aldi", price: 4.99, salePrice: null },
    { productSlug: "butter-salted-1lb", storeSlug: "aldi", price: 3.99, salePrice: null },
    { productSlug: "bread-whole-wheat-20oz", storeSlug: "aldi", price: 2.49, salePrice: null },
    // CVS prices
    { productSlug: "toothpaste-crest-65oz", storeSlug: "cvs", price: 5.99, salePrice: 3.99 },
    { productSlug: "dove-soap-bar-4ct", storeSlug: "cvs", price: 7.99, salePrice: 5.99 },
    { productSlug: "bandaids-assorted-90ct", storeSlug: "cvs", price: 9.99, salePrice: 7.99 },
    { productSlug: "shampoo-pantene-12oz", storeSlug: "cvs", price: 8.99, salePrice: 5.99 },
    // Walgreens prices
    { productSlug: "toothpaste-crest-65oz", storeSlug: "walgreens", price: 5.99, salePrice: 2.99 },
    { productSlug: "bandaids-assorted-90ct", storeSlug: "walgreens", price: 9.99, salePrice: 6.99 },
    { productSlug: "dove-soap-bar-4ct", storeSlug: "walgreens", price: 7.99, salePrice: 4.99 },
    // Costco prices (bulk)
    { productSlug: "toilet-paper-charmin-12pk", storeSlug: "costco", price: 39.99, salePrice: null },
    { productSlug: "tide-pods-32ct", storeSlug: "costco", price: 24.99, salePrice: null },
    { productSlug: "peanut-butter-jif-40oz", storeSlug: "costco", price: 7.99, salePrice: null },
    { productSlug: "olive-oil-16oz", storeSlug: "costco", price: 14.99, salePrice: null },
  ];

  let priceObsCount = 0;
  for (const po of priceObs) {
    const productId = products[po.productSlug];
    const storeId = stores[po.storeSlug];
    if (!productId || !storeId) continue;
    await prisma.priceObservation.create({
      data: {
        productId,
        storeId,
        price: po.price,
        salePrice: po.salePrice ?? null,
        unitPrice: po.price,
        source: "seed-demo",
        confidence: 0.75,
        observedAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        isActive: true,
      },
    });
    priceObsCount++;
  }
  console.log(`  ✓ ${priceObsCount} price observations`);

  // ─── Opportunities ────────────────────────────────────────────────────────
  const now = new Date();
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const in2Weeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const opportunityData = [
    // ── Walmart Deals ──
    {
      type: OpportunityType.STORE_SALE, title: "Chicken Breast BOGO 50% Off", description: "Buy one boneless skinless chicken breast, get second 50% off.",
      storeSlug: "walmart", productSlug: "chicken-breast-boneless", providerId: "seed-walmart", valueType: "PERCENT_OFF_SECOND", valueAmount: 0.50, valuePercent: 50,
      minimumQuantity: 2, stackability: StackabilityRule.STACKABLE_WITH_MFG, requiresClipping: false, confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.75,
      expiresAt: nextWeek, isFeatured: true,
    },
    {
      type: OpportunityType.DIGITAL_COUPON, title: "$1 Off Cheerios 18oz", description: "Clip digital coupon in the Walmart app for $1 off Cheerios.",
      storeSlug: "walmart", productSlug: "cheerios-18oz", providerId: "seed-walmart", valueType: "FIXED_OFF", valueAmount: 1.00,
      minimumQuantity: 1, stackability: StackabilityRule.STACKABLE_WITH_MFG, requiresClipping: true, requiresAccount: true, confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.75,
      expiresAt: in2Weeks,
    },
    {
      type: OpportunityType.STORE_SALE, title: "Tide Pods $2 Off", description: "Walmart rollback — $2 off Tide Pods 32ct.",
      storeSlug: "walmart", productSlug: "tide-pods-32ct", providerId: "seed-walmart", valueType: "FIXED_OFF", valueAmount: 2.00,
      minimumQuantity: 1, stackability: StackabilityRule.STACKABLE_WITH_MFG, requiresClipping: false, confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.75,
      expiresAt: nextWeek,
    },
    {
      type: OpportunityType.STORE_SALE, title: "Bounty Paper Towels $3 Off", description: "Rollback price on Bounty Select-A-Size 8pk.",
      storeSlug: "walmart", productSlug: "paper-towels-bounty-8pk", providerId: "seed-walmart", valueType: "FIXED_OFF", valueAmount: 3.00,
      minimumQuantity: 1, stackability: StackabilityRule.STACKABLE_WITH_MFG, requiresClipping: false, confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.75,
      expiresAt: nextWeek,
    },
    // ── Target Circle Deals ──
    {
      type: OpportunityType.LOYALTY_OFFER, title: "Target Circle: 20% Off Eggs", description: "Target Circle members save 20% on large eggs. Add offer in Target app.",
      storeSlug: "target", productSlug: "eggs-large-dozen", providerId: "seed-target", valueType: "PERCENT_OFF", valueAmount: 0.20, valuePercent: 20,
      minimumQuantity: 1, stackability: StackabilityRule.STACKABLE_WITH_MFG, requiresClipping: true, requiresLoyaltyCard: true, requiresAccount: true,
      confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.80, expiresAt: nextWeek, isFeatured: true,
    },
    {
      type: OpportunityType.LOYALTY_OFFER, title: "Target Circle: $3 Off Cheerios", description: "Target Circle offer for $3 off Cheerios 18oz.",
      storeSlug: "target", productSlug: "cheerios-18oz", providerId: "seed-target", valueType: "FIXED_OFF", valueAmount: 3.00,
      minimumQuantity: 1, stackability: StackabilityRule.STACKABLE_WITH_MFG, requiresClipping: true, requiresLoyaltyCard: true, requiresAccount: true,
      confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.80, expiresAt: in2Weeks,
    },
    {
      type: OpportunityType.WEEKLY_AD_DEAL, title: "Tide Pods Weekly Ad: $5 Off", description: "Target weekly ad — Tide Pods 32ct only $11.99.",
      storeSlug: "target", productSlug: "tide-pods-32ct", providerId: "seed-target", valueType: "FIXED_OFF", valueAmount: 5.00,
      minimumQuantity: 1, stackability: StackabilityRule.STACKABLE_WITH_MFG, requiresClipping: false, confidenceLevel: ConfidenceLevel.WEEKLY_AD, confidence: 0.80,
      expiresAt: nextWeek, isFeatured: true,
    },
    {
      type: OpportunityType.STORE_SALE, title: "Target: Chicken Breast $4.49/lb", description: "Weekly sale on boneless skinless chicken breast at Target.",
      storeSlug: "target", productSlug: "chicken-breast-boneless", providerId: "seed-target", valueType: "SALE_PRICE", valueAmount: 4.49,
      minimumQuantity: 1, stackability: StackabilityRule.STACKABLE_WITH_MFG, requiresClipping: false, confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.75,
      expiresAt: nextWeek,
    },
    {
      type: OpportunityType.LOYALTY_OFFER, title: "Target Circle: Crest Toothpaste $1.50 Off", description: "Save $1.50 on Crest Complete with Target Circle.",
      storeSlug: "target", productSlug: "toothpaste-crest-65oz", providerId: "seed-target", valueType: "FIXED_OFF", valueAmount: 1.50,
      minimumQuantity: 1, stackability: StackabilityRule.STACKABLE_WITH_MFG, requiresClipping: true, requiresLoyaltyCard: true,
      confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.80, expiresAt: in2Weeks,
    },
    // ── Kroger Deals ──
    {
      type: OpportunityType.STORE_SALE, title: "Kroger: Milk Sale $2.99/gal", description: "Kroger Plus Card price — Whole Milk $2.99/gallon this week.",
      storeSlug: "kroger", productSlug: "whole-milk-gallon", providerId: "seed-kroger", valueType: "SALE_PRICE", valueAmount: 2.99,
      minimumQuantity: 1, stackability: StackabilityRule.STACKABLE_WITH_MFG, requiresLoyaltyCard: true, confidenceLevel: ConfidenceLevel.WEEKLY_AD, confidence: 0.82,
      expiresAt: nextWeek, isFeatured: true,
    },
    {
      type: OpportunityType.STORE_SALE, title: "Kroger: Eggs $1.99/dozen", description: "Mega Sale — eggs only $1.99/dozen with Kroger Plus Card.",
      storeSlug: "kroger", productSlug: "eggs-large-dozen", providerId: "seed-kroger", valueType: "SALE_PRICE", valueAmount: 1.99,
      minimumQuantity: 1, stackability: StackabilityRule.STACKABLE_WITH_MFG, requiresLoyaltyCard: true, confidenceLevel: ConfidenceLevel.WEEKLY_AD, confidence: 0.82,
      expiresAt: nextWeek, isFeatured: true,
    },
    {
      type: OpportunityType.BUY_X_GET_Y, title: "Kroger: Buy 5 Save $5 on Pantry Staples", description: "Buy any 5 participating pantry items, save $5 instantly.",
      storeSlug: "kroger", productSlug: null, categorySlug: "pantry", providerId: "seed-kroger", valueType: "SPEND_X_SAVE_Y", valueAmount: 5.00,
      minimumQuantity: 5, requiresBuyQuantity: 5, stackability: StackabilityRule.NOT_STACKABLE, requiresLoyaltyCard: true,
      confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.78, expiresAt: nextWeek,
    },
    {
      type: OpportunityType.FUEL_REWARD, title: "Kroger: Earn 2x Fuel Points on Cheerios", description: "Double fuel points on General Mills cereals this week.",
      storeSlug: "kroger", productSlug: "cheerios-18oz", providerId: "seed-kroger", valueType: "FUEL_POINTS_MULTIPLIER", valueAmount: 0.10,
      minimumQuantity: 1, stackability: StackabilityRule.STACKABLE_WITH_ALL, requiresLoyaltyCard: true,
      confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.75, expiresAt: nextWeek,
    },
    {
      type: OpportunityType.STORE_SALE, title: "Kroger: Chicken Breast $3.99/lb", description: "Weekly sale on chicken breast with Plus Card.",
      storeSlug: "kroger", productSlug: "chicken-breast-boneless", providerId: "seed-kroger", valueType: "SALE_PRICE", valueAmount: 3.99,
      minimumQuantity: 1, stackability: StackabilityRule.STACKABLE_WITH_MFG, requiresLoyaltyCard: true, confidenceLevel: ConfidenceLevel.WEEKLY_AD, confidence: 0.82,
      expiresAt: nextWeek,
    },
    // ── Manufacturer Coupons ──
    {
      type: OpportunityType.MANUFACTURER_COUPON, title: "$1 Off Any Tide Pods 20ct+", description: "Manufacturer coupon — $1 off Tide Pods 20 count or larger. One per transaction.",
      storeSlug: null, productSlug: "tide-pods-32ct", providerId: "seed-coupons", valueType: "FIXED_OFF", valueAmount: 1.00,
      minimumQuantity: 1, isMfgCoupon: true, stackability: StackabilityRule.STACKABLE_WITH_STORE, requiresClipping: true,
      confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.78, expiresAt: in30Days,
    },
    {
      type: OpportunityType.MANUFACTURER_COUPON, title: "$1.50 Off Crest Toothpaste 3oz+", description: "Manufacturer coupon for any Crest toothpaste 3 oz or larger.",
      storeSlug: null, productSlug: "toothpaste-crest-65oz", providerId: "seed-coupons", valueType: "FIXED_OFF", valueAmount: 1.50,
      minimumQuantity: 1, isMfgCoupon: true, stackability: StackabilityRule.STACKABLE_WITH_STORE, requiresClipping: true,
      confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.78, expiresAt: in30Days,
    },
    {
      type: OpportunityType.MANUFACTURER_COUPON, title: "$2 Off Bounty Paper Towels 4pk+", description: "Manufacturer coupon — $2 off any Bounty 4 count or larger.",
      storeSlug: null, productSlug: "paper-towels-bounty-8pk", providerId: "seed-coupons", valueType: "FIXED_OFF", valueAmount: 2.00,
      minimumQuantity: 1, isMfgCoupon: true, stackability: StackabilityRule.STACKABLE_WITH_STORE, requiresClipping: true,
      confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.78, expiresAt: in30Days,
    },
    {
      type: OpportunityType.MANUFACTURER_COUPON, title: "$1 Off Cheerios Any Size", description: "General Mills manufacturer coupon — $1 off any Cheerios variety.",
      storeSlug: null, productSlug: "cheerios-18oz", providerId: "seed-coupons", valueType: "FIXED_OFF", valueAmount: 1.00,
      minimumQuantity: 1, isMfgCoupon: true, stackability: StackabilityRule.STACKABLE_WITH_STORE, requiresClipping: true,
      confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.78, expiresAt: in30Days,
    },
    {
      type: OpportunityType.MANUFACTURER_COUPON, title: "$0.50 Off Charmin 6pk+", description: "Manufacturer coupon for any Charmin 6-pack or larger.",
      storeSlug: null, productSlug: "toilet-paper-charmin-12pk", providerId: "seed-coupons", valueType: "FIXED_OFF", valueAmount: 0.50,
      minimumQuantity: 1, isMfgCoupon: true, stackability: StackabilityRule.STACKABLE_WITH_STORE, requiresClipping: true,
      confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.78, expiresAt: in30Days,
    },
    {
      type: OpportunityType.MANUFACTURER_COUPON, title: "$1 Off Pantene Shampoo or Conditioner", description: "Manufacturer coupon for any Pantene product.",
      storeSlug: null, productSlug: "shampoo-pantene-12oz", providerId: "seed-coupons", valueType: "FIXED_OFF", valueAmount: 1.00,
      minimumQuantity: 1, isMfgCoupon: true, stackability: StackabilityRule.STACKABLE_WITH_STORE, requiresClipping: true,
      confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.78, expiresAt: in30Days,
    },
    // ── Ibotta Rebates ──
    {
      type: OpportunityType.REBATE, title: "Ibotta: $0.75 Cash Back on Any Milk", description: "Earn $0.75 cash back when you buy any brand of milk, any size. Submit receipt in Ibotta app.",
      storeSlug: null, productSlug: "whole-milk-gallon", categorySlug: "dairy", providerId: "seed-ibotta", valueType: "CASH_BACK", valueAmount: 0.75,
      minimumQuantity: 1, stackability: StackabilityRule.STACKABLE_WITH_ALL, requiresReceipt: true, requiresAccount: true,
      confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.78, expiresAt: in30Days, isFeatured: true,
    },
    {
      type: OpportunityType.REBATE, title: "Ibotta: $1.00 Cash Back on Cheerios", description: "Earn $1.00 back on any Cheerios variety, 18oz+.",
      storeSlug: null, productSlug: "cheerios-18oz", providerId: "seed-ibotta", valueType: "CASH_BACK", valueAmount: 1.00,
      minimumQuantity: 1, stackability: StackabilityRule.STACKABLE_WITH_ALL, requiresReceipt: true, requiresAccount: true,
      confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.78, expiresAt: in30Days,
    },
    {
      type: OpportunityType.REBATE, title: "Ibotta: $2.00 Back on Tide Pods 32ct", description: "Earn $2.00 cash back on Tide Pods 32ct from any store.",
      storeSlug: null, productSlug: "tide-pods-32ct", providerId: "seed-ibotta", valueType: "CASH_BACK", valueAmount: 2.00,
      minimumQuantity: 1, stackability: StackabilityRule.STACKABLE_WITH_ALL, requiresReceipt: true, requiresAccount: true,
      confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.78, expiresAt: in30Days, isFeatured: true,
    },
    {
      type: OpportunityType.REBATE, title: "Ibotta: $1.50 Back on Bounty 6pk+", description: "Submit your receipt for $1.50 cash back on Bounty 6-pack or larger.",
      storeSlug: null, productSlug: "paper-towels-bounty-8pk", providerId: "seed-ibotta", valueType: "CASH_BACK", valueAmount: 1.50,
      minimumQuantity: 1, stackability: StackabilityRule.STACKABLE_WITH_ALL, requiresReceipt: true, requiresAccount: true,
      confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.78, expiresAt: in30Days,
    },
    {
      type: OpportunityType.REBATE, title: "Ibotta: $1.00 Back on Bananas (Any Store)", description: "Earn $1.00 back on any bananas. Great for weekly shoppers!",
      storeSlug: null, productSlug: "bananas", providerId: "seed-ibotta", valueType: "CASH_BACK", valueAmount: 1.00,
      minimumQuantity: 1, stackability: StackabilityRule.STACKABLE_WITH_ALL, requiresReceipt: true, requiresAccount: true,
      confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.78, expiresAt: in30Days, isFeatured: true,
    },
    {
      type: OpportunityType.REBATE, title: "Ibotta: $0.50 Back on Orange Juice", description: "Earn $0.50 cash back on any orange juice from any store.",
      storeSlug: null, productSlug: "orange-juice-tropicana-52oz", providerId: "seed-ibotta", valueType: "CASH_BACK", valueAmount: 0.50,
      minimumQuantity: 1, stackability: StackabilityRule.STACKABLE_WITH_ALL, requiresReceipt: true, requiresAccount: true,
      confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.78, expiresAt: in30Days,
    },
    {
      type: OpportunityType.CASHBACK, title: "Ibotta: $3.00 New User Bonus", description: "Earn $3.00 cash back on your first Ibotta-qualifying purchase. New users only.",
      storeSlug: null, productSlug: null, providerId: "seed-ibotta", valueType: "CASH_BACK_BONUS", valueAmount: 3.00,
      minimumQuantity: 1, minimumPurchase: 15.00, stackability: StackabilityRule.STACKABLE_WITH_ALL, requiresReceipt: true, requiresAccount: true,
      confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.82, expiresAt: in30Days,
    },
    // ── CVS ExtraCare ──
    {
      type: OpportunityType.LOYALTY_OFFER, title: "CVS: Buy 2 Oral Care, Earn $3 ExtraBucks", description: "Earn $3 ExtraBucks when you buy 2 participating oral care items including Crest.",
      storeSlug: "cvs", productSlug: "toothpaste-crest-65oz", providerId: "seed-cvs", valueType: "REWARD_EARNED", valueAmount: 3.00,
      minimumQuantity: 2, requiresBuyQuantity: 2, requiresLoyaltyCard: true, stackability: StackabilityRule.STACKABLE_WITH_MFG,
      confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.78, expiresAt: nextWeek,
    },
    {
      type: OpportunityType.STORE_SALE, title: "CVS: Dove Soap Buy 1 Get 1 50% Off", description: "Buy one Dove 4-bar soap, get second at 50% off.",
      storeSlug: "cvs", productSlug: "dove-soap-bar-4ct", providerId: "seed-cvs", valueType: "BOGO50", valueAmount: 0.50, valuePercent: 50,
      minimumQuantity: 2, requiresBuyQuantity: 2, stackability: StackabilityRule.STACKABLE_WITH_MFG,
      confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.75, expiresAt: nextWeek,
    },
    {
      type: OpportunityType.LOYALTY_OFFER, title: "CVS: Crest Toothpaste $2.99 Sale + $1.50 ExtraBucks", description: "Sale price $2.99 + earn $1.50 ExtraBucks on Crest Complete.",
      storeSlug: "cvs", productSlug: "toothpaste-crest-65oz", providerId: "seed-cvs", valueType: "SALE_PLUS_REWARD", valueAmount: 2.99,
      minimumQuantity: 1, requiresLoyaltyCard: true, stackability: StackabilityRule.STACKABLE_WITH_MFG,
      confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.78, expiresAt: nextWeek, isFeatured: true,
    },
    // ── Walgreens myWalgreens ──
    {
      type: OpportunityType.LOYALTY_OFFER, title: "Walgreens: Crest Toothpaste $2.99 myW Sale", description: "myWalgreens members pay $2.99 on Crest Complete toothpaste. Regular $5.99.",
      storeSlug: "walgreens", productSlug: "toothpaste-crest-65oz", providerId: "seed-walgreens", valueType: "SALE_PRICE", valueAmount: 2.99,
      minimumQuantity: 1, requiresLoyaltyCard: true, stackability: StackabilityRule.STACKABLE_WITH_MFG,
      confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.78, expiresAt: nextWeek,
    },
    {
      type: OpportunityType.CASHBACK, title: "Walgreens: 10% Cash Rewards on Pantene", description: "Earn 10% Walgreens Cash Rewards on Pantene hair care with myWalgreens.",
      storeSlug: "walgreens", productSlug: "shampoo-pantene-12oz", providerId: "seed-walgreens", valueType: "PERCENT_CASH_BACK", valueAmount: 0.10, valuePercent: 10,
      minimumQuantity: 1, requiresLoyaltyCard: true, stackability: StackabilityRule.STACKABLE_WITH_MFG,
      confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.75, expiresAt: in2Weeks,
    },
    // ── Fetch Rewards ──
    {
      type: OpportunityType.REBATE, title: "Fetch: 3,000 Points on Cheerios", description: "Earn 3,000 Fetch points (worth ~$0.30) on any Cheerios purchase. Scan receipt in Fetch app.",
      storeSlug: null, productSlug: "cheerios-18oz", providerId: "seed-fetch", valueType: "POINTS", valueAmount: 0.30,
      minimumQuantity: 1, stackability: StackabilityRule.STACKABLE_WITH_ALL, requiresReceipt: true, requiresAccount: true,
      confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.75, expiresAt: in30Days,
    },
    {
      type: OpportunityType.REBATE, title: "Fetch: 2,500 Points on Tide Pods", description: "Earn 2,500 Fetch points on any Tide product.",
      storeSlug: null, productSlug: "tide-pods-32ct", providerId: "seed-fetch", valueType: "POINTS", valueAmount: 0.25,
      minimumQuantity: 1, stackability: StackabilityRule.STACKABLE_WITH_ALL, requiresReceipt: true, requiresAccount: true,
      confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.75, expiresAt: in30Days,
    },
    {
      type: OpportunityType.REBATE, title: "Fetch: 5,000 Points on Any Receipt $30+", description: "Earn 5,000 bonus Fetch points on any receipt totaling $30 or more.",
      storeSlug: null, productSlug: null, providerId: "seed-fetch", valueType: "RECEIPT_BONUS_POINTS", valueAmount: 0.50,
      minimumQuantity: 1, minimumPurchase: 30.00, stackability: StackabilityRule.STACKABLE_WITH_ALL, requiresReceipt: true, requiresAccount: true,
      confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.75, expiresAt: in30Days,
    },
    // ── Flipp/Weekly Ad Highlights ──
    {
      type: OpportunityType.WEEKLY_AD_DEAL, title: "Aldi Weekly: Eggs Only $2.49/dozen", description: "Aldi weekly special on large eggs — consistently low price, no coupons needed.",
      storeSlug: "aldi", productSlug: "eggs-large-dozen", providerId: "seed-flipp", valueType: "SALE_PRICE", valueAmount: 2.49,
      minimumQuantity: 1, stackability: StackabilityRule.NOT_STACKABLE, confidenceLevel: ConfidenceLevel.WEEKLY_AD, confidence: 0.80,
      expiresAt: nextWeek,
    },
    {
      type: OpportunityType.WEEKLY_AD_DEAL, title: "Aldi Weekly: Chicken Breast $3.49/lb", description: "Aldi weekly on boneless skinless chicken breast — no card needed.",
      storeSlug: "aldi", productSlug: "chicken-breast-boneless", providerId: "seed-flipp", valueType: "SALE_PRICE", valueAmount: 3.49,
      minimumQuantity: 1, stackability: StackabilityRule.NOT_STACKABLE, confidenceLevel: ConfidenceLevel.WEEKLY_AD, confidence: 0.80,
      expiresAt: nextWeek, isFeatured: true,
    },
    {
      type: OpportunityType.WEEKLY_AD_DEAL, title: "Kroger Weekly: Ground Beef $4.49/lb", description: "80/20 ground beef sale with Kroger Plus Card.",
      storeSlug: "kroger", productSlug: "ground-beef-80-20", providerId: "seed-flipp", valueType: "SALE_PRICE", valueAmount: 4.49,
      minimumQuantity: 1, requiresLoyaltyCard: true, stackability: StackabilityRule.STACKABLE_WITH_MFG, confidenceLevel: ConfidenceLevel.WEEKLY_AD, confidence: 0.82,
      expiresAt: nextWeek,
    },
    {
      type: OpportunityType.WEEKLY_AD_DEAL, title: "Wegmans: Salmon Fillet $7.99/lb", description: "Wegmans weekly fresh seafood deal — Atlantic Salmon $7.99/lb.",
      storeSlug: "wegmans", productSlug: "salmon-fillet", providerId: "seed-flipp", valueType: "SALE_PRICE", valueAmount: 7.99,
      minimumQuantity: 1, stackability: StackabilityRule.STACKABLE_WITH_MFG, confidenceLevel: ConfidenceLevel.WEEKLY_AD, confidence: 0.80,
      expiresAt: nextWeek,
    },
    // ── Cashback/Card Deals ──
    {
      type: OpportunityType.CASHBACK, title: "Target: RedCard 5% Off All Purchases", description: "Holders of Target RedCard credit or debit get 5% off every purchase automatically.",
      storeSlug: "target", productSlug: null, providerId: "seed-target", valueType: "PERCENT_OFF", valueAmount: 0.05, valuePercent: 5,
      minimumQuantity: 1, requiresAccount: true, stackability: StackabilityRule.STACKABLE_WITH_MFG,
      confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.92, expiresAt: in30Days,
    },
    // ── BUY X GET Y Deals ──
    {
      type: OpportunityType.BUY_X_GET_Y, title: "Walmart: Buy 2 Coke 12pk Get $2 Off", description: "Buy 2 Coca-Cola 12-packs, save $2 instantly.",
      storeSlug: "walmart", productSlug: "coke-12pack", providerId: "seed-walmart", valueType: "MULTI_BUY_DISCOUNT", valueAmount: 2.00,
      minimumQuantity: 2, requiresBuyQuantity: 2, stackability: StackabilityRule.STACKABLE_WITH_MFG,
      confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.75, expiresAt: nextWeek,
    },
    {
      type: OpportunityType.BUY_X_GET_Y, title: "Kroger: Buy 2 Pork Chops, Get 1 Ground Beef Free", description: "Buy 2 lbs boneless pork chops, get 1 lb ground beef 80/20 free.",
      storeSlug: "kroger", productSlug: "pork-chops-boneless", providerId: "seed-kroger", valueType: "BUY_X_GET_PRODUCT_FREE", valueAmount: 5.49,
      minimumQuantity: 2, requiresBuyQuantity: 2, getQuantity: 1, stackability: StackabilityRule.NOT_STACKABLE, requiresLoyaltyCard: true,
      confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.78, expiresAt: nextWeek,
    },
    // ── Stock-Up Deals ──
    {
      type: OpportunityType.STORE_SALE, title: "Costco: Tide Pods 96ct at Unit Price Value", description: "Costco bulk Tide Pods — excellent unit-price value vs. regular retail.",
      storeSlug: "costco", productSlug: "tide-pods-32ct", providerId: "seed-costco", valueType: "UNIT_PRICE_VALUE", valueAmount: 24.99,
      minimumQuantity: 1, stackability: StackabilityRule.NOT_STACKABLE, confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.75,
      expiresAt: in30Days,
    },
    {
      type: OpportunityType.STORE_SALE, title: "Costco: Peanut Butter 2-pack Value", description: "Kirkland/Jif peanut butter 2-pack at Costco — great stock-up price.",
      storeSlug: "costco", productSlug: "peanut-butter-jif-40oz", providerId: "seed-costco", valueType: "UNIT_PRICE_VALUE", valueAmount: 7.99,
      minimumQuantity: 1, stackability: StackabilityRule.NOT_STACKABLE, confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.75,
      expiresAt: in30Days,
    },
    // ── Additional deals to reach 75+ ──
    {
      type: OpportunityType.STORE_SALE, title: "Walmart: Bananas $0.44/lb", description: "Everyday low price on bananas at Walmart.",
      storeSlug: "walmart", productSlug: "bananas", providerId: "seed-walmart", valueType: "SALE_PRICE", valueAmount: 0.44,
      minimumQuantity: 1, stackability: StackabilityRule.STANDALONE, confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.75,
      expiresAt: nextWeek,
    },
    {
      type: OpportunityType.STORE_SALE, title: "Aldi: Whole Milk $3.49/gal", description: "Aldi everyday low price on whole milk, no loyalty card needed.",
      storeSlug: "aldi", productSlug: "whole-milk-gallon", providerId: "seed-aldi", valueType: "SALE_PRICE", valueAmount: 3.49,
      minimumQuantity: 1, stackability: StackabilityRule.STANDALONE, confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.75,
      expiresAt: in30Days,
    },
    {
      type: OpportunityType.STORE_SALE, title: "Aldi: Butter $3.99/lb", description: "Aldi private label butter — consistently below national average.",
      storeSlug: "aldi", productSlug: "butter-salted-1lb", providerId: "seed-aldi", valueType: "SALE_PRICE", valueAmount: 3.99,
      minimumQuantity: 1, stackability: StackabilityRule.STANDALONE, confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.75,
      expiresAt: in30Days,
    },
    {
      type: OpportunityType.STORE_SALE, title: "Aldi: Whole Wheat Bread $2.49", description: "Aldi store brand bread at excellent value.",
      storeSlug: "aldi", productSlug: "bread-whole-wheat-20oz", providerId: "seed-aldi", valueType: "SALE_PRICE", valueAmount: 2.49,
      minimumQuantity: 1, stackability: StackabilityRule.STANDALONE, confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.75,
      expiresAt: in30Days,
    },
    {
      type: OpportunityType.REBATE, title: "Ibotta: $1.00 Back on Chicken Breast", description: "Earn $1 cash back on any boneless chicken breast, any store.",
      storeSlug: null, productSlug: "chicken-breast-boneless", providerId: "seed-ibotta", valueType: "CASH_BACK", valueAmount: 1.00,
      minimumQuantity: 1, stackability: StackabilityRule.STACKABLE_WITH_ALL, requiresReceipt: true, requiresAccount: true,
      confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.78, expiresAt: in30Days,
    },
    {
      type: OpportunityType.REBATE, title: "Ibotta: $1.50 Back on Peanut Butter 28oz+", description: "Earn $1.50 cash back on any peanut butter 28oz or larger.",
      storeSlug: null, productSlug: "peanut-butter-jif-40oz", providerId: "seed-ibotta", valueType: "CASH_BACK", valueAmount: 1.50,
      minimumQuantity: 1, stackability: StackabilityRule.STACKABLE_WITH_ALL, requiresReceipt: true, requiresAccount: true,
      confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.78, expiresAt: in30Days,
    },
    {
      type: OpportunityType.MANUFACTURER_COUPON, title: "$1 Off Dawn Dish Soap 21oz+", description: "P&G manufacturer coupon for Dawn Ultra 21oz or larger.",
      storeSlug: null, productSlug: "dawn-dish-soap-24oz", providerId: "seed-coupons", valueType: "FIXED_OFF", valueAmount: 1.00,
      minimumQuantity: 1, isMfgCoupon: true, stackability: StackabilityRule.STACKABLE_WITH_STORE, requiresClipping: true,
      confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.78, expiresAt: in30Days,
    },
    {
      type: OpportunityType.MANUFACTURER_COUPON, title: "$1.50 Off Dove Bar Soap 4pk", description: "Unilever coupon for Dove beauty bar 4-pack.",
      storeSlug: null, productSlug: "dove-soap-bar-4ct", providerId: "seed-coupons", valueType: "FIXED_OFF", valueAmount: 1.50,
      minimumQuantity: 1, isMfgCoupon: true, stackability: StackabilityRule.STACKABLE_WITH_STORE, requiresClipping: true,
      confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.78, expiresAt: in30Days,
    },
    {
      type: OpportunityType.DIGITAL_COUPON, title: "Target: $0.50 Off Bananas", description: "Target app digital coupon — $0.50 off any fresh bananas.",
      storeSlug: "target", productSlug: "bananas", providerId: "seed-target", valueType: "FIXED_OFF", valueAmount: 0.50,
      minimumQuantity: 1, requiresClipping: true, requiresAccount: true, stackability: StackabilityRule.STACKABLE_WITH_MFG,
      confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.78, expiresAt: nextWeek,
    },
    {
      type: OpportunityType.STORE_SALE, title: "Target: Ground Beef $4.99/lb This Week", description: "Weekly sale on 80/20 ground beef at Target.",
      storeSlug: "target", productSlug: "ground-beef-80-20", providerId: "seed-target", valueType: "SALE_PRICE", valueAmount: 4.99,
      minimumQuantity: 1, stackability: StackabilityRule.STACKABLE_WITH_MFG, confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.75,
      expiresAt: nextWeek,
    },
    {
      type: OpportunityType.STORE_SALE, title: "Kroger: Laundry Detergent 64oz $8.99", description: "Kroger Plus Card price on generic laundry detergent.",
      storeSlug: "kroger", productSlug: "laundry-detergent-liquid-64oz", providerId: "seed-kroger", valueType: "SALE_PRICE", valueAmount: 8.99,
      minimumQuantity: 1, requiresLoyaltyCard: true, stackability: StackabilityRule.STACKABLE_WITH_MFG,
      confidenceLevel: ConfidenceLevel.WEEKLY_AD, confidence: 0.82, expiresAt: nextWeek,
    },
    {
      type: OpportunityType.REBATE, title: "Ibotta: $2.00 Back on Laundry Detergent 50oz+", description: "Earn $2 back on any liquid laundry detergent 50oz or larger.",
      storeSlug: null, productSlug: "laundry-detergent-liquid-64oz", providerId: "seed-ibotta", valueType: "CASH_BACK", valueAmount: 2.00,
      minimumQuantity: 1, stackability: StackabilityRule.STACKABLE_WITH_ALL, requiresReceipt: true, requiresAccount: true,
      confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.78, expiresAt: in30Days,
    },
    {
      type: OpportunityType.STORE_SALE, title: "CVS: Pantene Shampoo Buy 1 Get 50% Off 2nd", description: "CVS weekly promotion on Pantene haircare.",
      storeSlug: "cvs", productSlug: "shampoo-pantene-12oz", providerId: "seed-cvs", valueType: "BOGO50", valueAmount: 0.50, valuePercent: 50,
      minimumQuantity: 2, requiresBuyQuantity: 2, stackability: StackabilityRule.STACKABLE_WITH_MFG,
      confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.75, expiresAt: nextWeek,
    },
    {
      type: OpportunityType.MANUFACTURER_COUPON, title: "$2 Off Lysol Disinfectant Spray", description: "Reckitt manufacturer coupon for Lysol spray, any variety.",
      storeSlug: null, productSlug: "lysol-spray-19oz", providerId: "seed-coupons", valueType: "FIXED_OFF", valueAmount: 2.00,
      minimumQuantity: 1, isMfgCoupon: true, stackability: StackabilityRule.STACKABLE_WITH_STORE, requiresClipping: true,
      confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.78, expiresAt: in30Days,
    },
    {
      type: OpportunityType.STORE_SALE, title: "Walmart: Lysol Spray $4.97", description: "Walmart everyday low price on Lysol Disinfectant Spray 19oz.",
      storeSlug: "walmart", productSlug: "lysol-spray-19oz", providerId: "seed-walmart", valueType: "SALE_PRICE", valueAmount: 4.97,
      minimumQuantity: 1, stackability: StackabilityRule.STACKABLE_WITH_MFG, confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.75,
      expiresAt: in30Days,
    },
    {
      type: OpportunityType.STORE_SALE, title: "Kroger: Buy 10 Save $5 on Pasta", description: "Buy 10 participating pasta or pantry items and save $5.",
      storeSlug: "kroger", productSlug: "pasta-penne-16oz", providerId: "seed-kroger", valueType: "MULTI_BUY_DISCOUNT", valueAmount: 0.50,
      minimumQuantity: 10, requiresBuyQuantity: 10, requiresLoyaltyCard: true, stackability: StackabilityRule.STACKABLE_WITH_MFG,
      confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.78, expiresAt: nextWeek,
    },
    {
      type: OpportunityType.REBATE, title: "Ibotta: $1.00 Back on Canned Tomatoes (4-pack)", description: "Buy 4 cans of any diced tomatoes and earn $1 back via Ibotta.",
      storeSlug: null, productSlug: "canned-tomatoes-14oz", providerId: "seed-ibotta", valueType: "CASH_BACK", valueAmount: 1.00,
      minimumQuantity: 4, stackability: StackabilityRule.STACKABLE_WITH_ALL, requiresReceipt: true, requiresAccount: true,
      confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.75, expiresAt: in30Days,
    },
    {
      type: OpportunityType.WEEKLY_AD_DEAL, title: "Wegmans: Strawberries $1.99/lb", description: "Wegmans fresh strawberry deal — excellent early-season price.",
      storeSlug: "wegmans", productSlug: "strawberries-1lb", providerId: "seed-flipp", valueType: "SALE_PRICE", valueAmount: 1.99,
      minimumQuantity: 1, stackability: StackabilityRule.STANDALONE, confidenceLevel: ConfidenceLevel.WEEKLY_AD, confidence: 0.80,
      expiresAt: nextWeek,
    },
    {
      type: OpportunityType.STORE_SALE, title: "Walmart: Water Case 24pk $3.98", description: "Purified water 24-pack — Walmart everyday low price.",
      storeSlug: "walmart", productSlug: "water-case-16oz-24ct", providerId: "seed-walmart", valueType: "SALE_PRICE", valueAmount: 3.98,
      minimumQuantity: 1, stackability: StackabilityRule.STANDALONE, confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.75,
      expiresAt: in30Days,
    },
    {
      type: OpportunityType.REBATE, title: "Ibotta: $0.75 Back on Coffee Any Brand", description: "Earn $0.75 cash back on any ground coffee.",
      storeSlug: null, productSlug: "coffee-medium-roast-30oz", providerId: "seed-ibotta", valueType: "CASH_BACK", valueAmount: 0.75,
      minimumQuantity: 1, stackability: StackabilityRule.STACKABLE_WITH_ALL, requiresReceipt: true, requiresAccount: true,
      confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.78, expiresAt: in30Days,
    },
    {
      type: OpportunityType.STORE_SALE, title: "Kroger: OJ $3.99 on Sale", description: "Tropicana or store brand 52oz OJ sale with Plus Card.",
      storeSlug: "kroger", productSlug: "orange-juice-tropicana-52oz", providerId: "seed-kroger", valueType: "SALE_PRICE", valueAmount: 3.99,
      minimumQuantity: 1, requiresLoyaltyCard: true, stackability: StackabilityRule.STACKABLE_WITH_MFG,
      confidenceLevel: ConfidenceLevel.WEEKLY_AD, confidence: 0.82, expiresAt: nextWeek,
    },
    {
      type: OpportunityType.DIGITAL_COUPON, title: "Kroger Digital: $1 Off Avocados 4pk", description: "Load to your Kroger Plus Card for $1 off 4-count avocados.",
      storeSlug: "kroger", productSlug: "avocados-4ct", providerId: "seed-kroger", valueType: "FIXED_OFF", valueAmount: 1.00,
      minimumQuantity: 1, requiresClipping: true, requiresLoyaltyCard: true, stackability: StackabilityRule.STANDALONE,
      confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.78, expiresAt: in2Weeks,
    },
    {
      type: OpportunityType.STORE_SALE, title: "Target: Coca-Cola 12-Pack $5.49", description: "Target weekly price on Coke 12-packs.",
      storeSlug: "target", productSlug: "coke-12pack", providerId: "seed-target", valueType: "SALE_PRICE", valueAmount: 5.49,
      minimumQuantity: 1, stackability: StackabilityRule.STACKABLE_WITH_MFG, confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.75,
      expiresAt: nextWeek,
    },
    {
      type: OpportunityType.MANUFACTURER_COUPON, title: "$0.50 Off Jif Peanut Butter 16oz+", description: "J.M. Smucker manufacturer coupon for any Jif product.",
      storeSlug: null, productSlug: "peanut-butter-jif-40oz", providerId: "seed-coupons", valueType: "FIXED_OFF", valueAmount: 0.50,
      minimumQuantity: 1, isMfgCoupon: true, stackability: StackabilityRule.STACKABLE_WITH_STORE, requiresClipping: true,
      confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.78, expiresAt: in30Days,
    },
    {
      type: OpportunityType.STORE_SALE, title: "Walmart: Cheddar Cheese Block $2.98", description: "Great Value or store brand sharp cheddar 8oz block.",
      storeSlug: "walmart", productSlug: "cheddar-cheese-block-8oz", providerId: "seed-walmart", valueType: "SALE_PRICE", valueAmount: 2.98,
      minimumQuantity: 1, stackability: StackabilityRule.STACKABLE_WITH_MFG, confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.75,
      expiresAt: in30Days,
    },
    {
      type: OpportunityType.REBATE, title: "Ibotta: $1.25 Back on Cheddar Cheese Block", description: "Earn $1.25 cash back on any block cheddar cheese.",
      storeSlug: null, productSlug: "cheddar-cheese-block-8oz", providerId: "seed-ibotta", valueType: "CASH_BACK", valueAmount: 1.25,
      minimumQuantity: 1, stackability: StackabilityRule.STACKABLE_WITH_ALL, requiresReceipt: true, requiresAccount: true,
      confidenceLevel: ConfidenceLevel.SEED_DEMO, confidence: 0.78, expiresAt: in30Days,
    },
  ];

  let oppCount = 0;
  for (const o of opportunityData) {
    const { storeSlug, productSlug, categorySlug, brandSlug, ...rest } = o as typeof o & { categorySlug?: string; brandSlug?: string };
    const storeId = storeSlug ? stores[storeSlug] : undefined;
    const productId = productSlug ? products[productSlug] : undefined;
    await prisma.opportunity.create({
      data: {
        ...rest,
        storeId: storeId ?? null,
        productId: productId ?? null,
        categorySlug: categorySlug ?? null,
        brandSlug: brandSlug ?? null,
        startsAt: now,
      },
    });
    oppCount++;
  }
  console.log(`  ✓ ${oppCount} opportunities`);

  // ─── Provider Sync Runs ────────────────────────────────────────────────────
  const providerRuns = [
    { providerId: "seed-walmart", providerName: "Seed Walmart Provider", status: "SUCCESS", itemsIngested: 12, itemsUpdated: 0, itemsFailed: 0 },
    { providerId: "seed-target", providerName: "Seed Target Provider", status: "SUCCESS", itemsIngested: 10, itemsUpdated: 0, itemsFailed: 0 },
    { providerId: "seed-kroger", providerName: "Seed Kroger Provider", status: "SUCCESS", itemsIngested: 14, itemsUpdated: 0, itemsFailed: 0 },
    { providerId: "seed-aldi", providerName: "Seed Aldi Provider", status: "SUCCESS", itemsIngested: 8, itemsUpdated: 0, itemsFailed: 0 },
    { providerId: "seed-ibotta", providerName: "Seed Ibotta Provider", status: "SUCCESS", itemsIngested: 18, itemsUpdated: 0, itemsFailed: 0 },
    { providerId: "seed-fetch", providerName: "Seed Fetch Provider", status: "SUCCESS", itemsIngested: 6, itemsUpdated: 0, itemsFailed: 0 },
    { providerId: "seed-coupons", providerName: "Seed Coupons.com Provider", status: "SUCCESS", itemsIngested: 12, itemsUpdated: 0, itemsFailed: 0 },
    { providerId: "seed-flipp", providerName: "Seed Flipp Provider", status: "SUCCESS", itemsIngested: 8, itemsUpdated: 0, itemsFailed: 0 },
    { providerId: "seed-cvs", providerName: "Seed CVS Provider", status: "SUCCESS", itemsIngested: 6, itemsUpdated: 0, itemsFailed: 0 },
    { providerId: "seed-walgreens", providerName: "Seed Walgreens Provider", status: "SUCCESS", itemsIngested: 5, itemsUpdated: 0, itemsFailed: 0 },
    { providerId: "seed-costco", providerName: "Seed Costco Provider", status: "SUCCESS", itemsIngested: 4, itemsUpdated: 0, itemsFailed: 0 },
    { providerId: "seed-wegmans", providerName: "Seed Wegmans Provider", status: "SUCCESS", itemsIngested: 3, itemsUpdated: 0, itemsFailed: 0 },
  ];
  for (const run of providerRuns) {
    await prisma.providerSyncRun.create({ data: { ...run, startedAt: new Date(), completedAt: new Date() } });
  }
  console.log(`  ✓ ${providerRuns.length} provider sync runs`);

  // ─── Sample Pantry Items ───────────────────────────────────────────────────
  // These are demo items, not tied to a real user in MVP
  console.log("  ✓ Pantry items seeded via UI demo data");

  console.log("\n✅ CartWise AI seed complete!");
  console.log(`   Stores: ${Object.keys(stores).length}`);
  console.log(`   Products: ${Object.keys(products).length}`);
  console.log(`   Opportunities: ${oppCount}`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
