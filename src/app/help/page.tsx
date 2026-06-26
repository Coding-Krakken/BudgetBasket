import { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  HelpCircle,
  Sparkles,
  ListChecks,
  BookOpen,
  ShoppingCart,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Help & FAQ",
  description: "How CartWise AI works: confidence scores, rebates, optimization modes, and a walkthrough of your first optimization.",
};

const FAQ_ITEMS: Array<{ q: string; a: string }> = [
  {
    q: "What do confidence scores mean?",
    a: "Every price and deal CartWise shows has a confidence score from 0–100%, reflecting how sure we are the price is accurate right now. Scores combine the source of the price (cart-verified, official retailer API, weekly ad, or public listing) with how recently it was observed. Higher confidence means less risk of a price changing between your plan and checkout.",
  },
  {
    q: "What does the \"Cart Verified\" badge mean?",
    a: "A Cart Verified badge means CartWise actually added the item to a real retailer cart and confirmed the final price, including any coupons or loyalty discounts — the highest confidence level we offer (≈98%+).",
  },
  {
    q: "How do rebates work?",
    a: "Rebates (and cash back) are savings you receive after your purchase, usually by uploading a receipt to an app like Ibotta or a retailer's rewards program — they're not applied at checkout. CartWise tracks rebates separately from immediate savings and shows them as \"+$X later\" on a line item so you know to expect money back rather than a lower register total.",
  },
  {
    q: "What's the difference between immediate savings and future value?",
    a: "Immediate savings (coupons, sale prices, instant discounts) reduce what you pay at checkout today. Future value (rebates, cash back, points) is money or rewards you get back afterward. Your plan total shows both, but only immediate savings affects what you'll actually be charged at the register.",
  },
  {
    q: "What do the optimization modes do?",
    a: "Best Price finds the lowest total cost even if it means visiting multiple stores. One Store finds the best deal achievable at a single retailer. Fewest Stops minimizes the number of store visits, accepting slightly higher prices. Most Verified prioritizes cart-verified and high-confidence prices over theoretical savings. Stock Up highlights items currently near their historical low price, worth buying in bulk.",
  },
  {
    q: "Why didn't an item match a product in my list?",
    a: "CartWise matches your typed grocery list against a catalog of 500+ real products by name and keywords. If an item doesn't match closely enough (for example, an unusual brand or a typo), it's shown as unmatched so you know to double check it yourself rather than risk an inaccurate price.",
  },
  {
    q: "What are price alerts and the watchlist?",
    a: "From a product page you can add a price alert (below a target price, on sale, or at its historic low). Watched products appear on your Watchlist page, and CartWise checks for matches periodically — you'll see a notification when one of your alerts is triggered.",
  },
  {
    q: "How do shared plan links work?",
    a: "Any saved plan can be shared via a unique link from the plan page. Shared links are read-only, expire after 30 days, and don't require the recipient to have an account.",
  },
  {
    q: "Can I scan a barcode instead of typing an item?",
    a: "Yes — product barcodes (UPCs) can be looked up directly to find matching deals without typing the product name.",
  },
  {
    q: "How fresh are the prices and deals?",
    a: "Prices and offers are pulled live from retailer APIs, weekly ad feeds, and coupon networks. Each item shows when its price was last observed — always do a final price check at checkout, since retailer prices can change between visits.",
  },
];

const GLOSSARY: Array<{ term: string; definition: string }> = [
  { term: "Confidence Score", definition: "A 0–100% estimate of how likely a shown price is to match what you'll actually pay, based on the price's source and age." },
  { term: "Cart Verified", definition: "The highest confidence level — the price was confirmed by adding the item to a real retailer cart." },
  { term: "Immediate Savings", definition: "Discounts applied at checkout today: coupons, sale prices, instant markdowns." },
  { term: "Future Value / Rebate", definition: "Money or rewards received after purchase, typically via receipt upload to a rebate app — not reflected in the register total." },
  { term: "Optimization Mode", definition: "The strategy CartWise uses to build your plan: Best Price, One Store, Fewest Stops, Most Verified, or Stock Up." },
  { term: "Opportunity", definition: "Any individual deal CartWise can apply to an item: a coupon, rebate, sale price, loyalty offer, or cash-back offer." },
  { term: "Historical Low", definition: "The lowest price CartWise has observed for a product over time — used to flag good times to stock up." },
  { term: "Hassle Cost", definition: "A small dollar penalty CartWise adds per extra store visit when comparing plans, so it doesn't recommend driving across town to save a few cents." },
  { term: "Unmatched Item", definition: "An item from your list that didn't confidently match any product in the catalog — shown as-is so you can verify it manually." },
];

export default function HelpPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl gradient-savings">
          <HelpCircle className="h-6 w-6 text-white" />
        </div>
        <h1 className="text-2xl font-bold">Help &amp; FAQ</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Everything you need to know to get the most out of CartWise AI.
        </p>
      </div>

      {/* Tutorial */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-primary" />
            Your First Optimization
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm">
            <li className="flex gap-3">
              <Badge variant="secondary" className="h-5 w-5 rounded-full justify-center shrink-0">1</Badge>
              <span>
                Go to <Link href="/plan" className="font-medium text-primary underline">Plan</Link> and type or paste your
                grocery list — one item per line or comma-separated (e.g. &quot;milk, eggs, bread, chicken breast&quot;).
              </span>
            </li>
            <li className="flex gap-3">
              <Badge variant="secondary" className="h-5 w-5 rounded-full justify-center shrink-0">2</Badge>
              <span>
                Pick an optimization mode. If you&apos;re not sure, start with <span className="font-medium">Best Price</span> —
                you can always re-run with a different mode afterward.
              </span>
            </li>
            <li className="flex gap-3">
              <Badge variant="secondary" className="h-5 w-5 rounded-full justify-center shrink-0">3</Badge>
              <span>
                Review the plan: each item shows its matched product, store, price, and applied savings. Tap an item to
                see exactly which coupons or offers were applied and what (if anything) you need to do to claim them.
              </span>
            </li>
            <li className="flex gap-3">
              <Badge variant="secondary" className="h-5 w-5 rounded-full justify-center shrink-0">4</Badge>
              <span>
                Check the confidence badge on each item. High-confidence and Cart Verified items are safe to trust as-is;
                lower-confidence items are worth a quick price check in-store or in the retailer&apos;s app.
              </span>
            </li>
            <li className="flex gap-3">
              <Badge variant="secondary" className="h-5 w-5 rounded-full justify-center shrink-0">5</Badge>
              <span>
                Save the plan to revisit later, or share it with a link. You can also add items you want to track to your{" "}
                <Link href="/watchlist" className="font-medium text-primary underline">Watchlist</Link> for price-drop alerts.
              </span>
            </li>
          </ol>
          <div className="mt-4">
            <Link href="/plan">
              <Badge className="gap-1.5 px-3 py-1.5 text-xs cursor-pointer">
                <ShoppingCart className="h-3 w-3" />
                Start your first plan
              </Badge>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* FAQ */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Frequently Asked Questions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {FAQ_ITEMS.map((item, i) => (
            <details key={i} className="group border-b last:border-b-0 py-3">
              <summary className="cursor-pointer list-none text-sm font-medium flex items-center justify-between gap-2">
                {item.q}
                <span className="text-muted-foreground group-open:rotate-180 transition-transform shrink-0">⌄</span>
              </summary>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{item.a}</p>
            </details>
          ))}
        </CardContent>
      </Card>

      {/* Glossary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            Glossary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-3">
            {GLOSSARY.map((g) => (
              <div key={g.term}>
                <dt className="text-sm font-semibold">{g.term}</dt>
                <dd className="text-sm text-muted-foreground mt-0.5">{g.definition}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Separator className="my-8" />

      <p className="text-center text-xs text-muted-foreground">
        Still have a question? This page covers the most common ones — more documentation lives in the project&apos;s{" "}
        <span className="font-mono">docs/</span> folder for technical details.
      </p>
    </div>
  );
}
