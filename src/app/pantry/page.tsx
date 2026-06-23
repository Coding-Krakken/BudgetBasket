import { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Archive, AlertTriangle, CheckCircle2, Camera, Barcode, Lock, TrendingDown } from "lucide-react";

export const metadata: Metadata = {
  title: "Pantry Intelligence",
  description: "Track your household inventory and get restocking alerts.",
};

// Demo pantry data (static for MVP)
const DEMO_PANTRY = [
  { name: "Whole Milk", category: "Dairy", quantity: 0.5, unit: "gallon", daysLeft: 3, status: "low" as const, avgConsumption: "1 gal/week" },
  { name: "Eggs", category: "Dairy", quantity: 6, unit: "count", daysLeft: 7, status: "ok" as const, avgConsumption: "1 dozen/week" },
  { name: "Chicken Breast", category: "Meat", quantity: 0.8, unit: "lb", daysLeft: 2, status: "critical" as const, avgConsumption: "2 lb/week" },
  { name: "Cheerios", category: "Cereal", quantity: 1, unit: "box", daysLeft: 10, status: "ok" as const, avgConsumption: "1 box/2 weeks" },
  { name: "Bananas", category: "Produce", quantity: 3, unit: "count", daysLeft: 3, status: "low" as const, avgConsumption: "1 bunch/week" },
  { name: "Laundry Detergent", category: "Cleaning", quantity: 0.3, unit: "bottle", daysLeft: 8, status: "low" as const, avgConsumption: "1 bottle/month" },
  { name: "Paper Towels", category: "Paper Goods", quantity: 2, unit: "rolls", daysLeft: 14, status: "ok" as const, avgConsumption: "4 rolls/month" },
  { name: "Toothpaste", category: "Personal Care", quantity: 0.7, unit: "tube", daysLeft: 21, status: "ok" as const, avgConsumption: "1 tube/month" },
  { name: "Olive Oil", category: "Pantry", quantity: 0.15, unit: "bottle", daysLeft: 5, status: "critical" as const, avgConsumption: "1 bottle/month" },
  { name: "Canned Tomatoes", category: "Pantry", quantity: 4, unit: "cans", daysLeft: 365, status: "ok" as const, avgConsumption: "2 cans/week" },
];

const statusConfig = {
  critical: { label: "Critically Low", color: "text-destructive", bgColor: "bg-destructive/10", icon: AlertTriangle, progressColor: "bg-destructive", progressValue: 10 },
  low: { label: "Running Low", color: "text-amber-600", bgColor: "bg-amber-50", icon: AlertTriangle, progressColor: "bg-amber-500", progressValue: 35 },
  ok: { label: "In Stock", color: "text-emerald-600", bgColor: "bg-emerald-50/50", icon: CheckCircle2, progressColor: "bg-emerald-500", progressValue: 75 },
};

export default function PantryPage() {
  const criticalItems = DEMO_PANTRY.filter(i => i.status === "critical");
  const lowItems = DEMO_PANTRY.filter(i => i.status === "low");
  const okItems = DEMO_PANTRY.filter(i => i.status === "ok");

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Archive className="h-6 w-6 text-primary" />
            Pantry Intelligence
          </h1>
          <p className="text-muted-foreground mt-1">
            Track household inventory and get smart restocking alerts.
          </p>
          <Badge variant="demo" className="mt-2">Demo Data — Feature in Development</Badge>
        </div>
        <Button disabled variant="outline" className="gap-2">
          <Camera className="h-4 w-4" />
          Scan Receipt
          <Lock className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <Card className="border-destructive/20 bg-destructive/5">
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-destructive">{criticalItems.length}</p>
            <p className="text-sm text-muted-foreground">Critically Low</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-amber-600">{lowItems.length}</p>
            <p className="text-sm text-muted-foreground">Running Low</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-emerald-600">{okItems.length}</p>
            <p className="text-sm text-muted-foreground">Well Stocked</p>
          </CardContent>
        </Card>
      </div>

      {/* Pantry items */}
      <div className="space-y-3 mb-8">
        <h2 className="text-lg font-semibold">Inventory</h2>
        <div className="space-y-2">
          {DEMO_PANTRY.sort((a, b) => {
            const order = { critical: 0, low: 1, ok: 2 };
            return order[a.status] - order[b.status];
          }).map((item) => {
            const config = statusConfig[item.status];
            const Icon = config.icon;
            return (
              <div key={item.name} className={`flex items-center gap-4 p-4 rounded-lg border ${item.status !== "ok" ? config.bgColor : "bg-card"}`}>
                <Icon className={`h-5 w-5 shrink-0 ${config.color}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="font-medium text-sm">{item.name}</p>
                    <Badge variant={item.status === "ok" ? "outline" : item.status === "low" ? "warning-muted" : "destructive"} className="text-[10px] shrink-0">
                      {config.label}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{item.quantity} {item.unit} remaining</span>
                    <span>·</span>
                    <span>{item.daysLeft} days left</span>
                    <span>·</span>
                    <span>{item.category}</span>
                  </div>
                  <Progress
                    value={config.progressValue}
                    className={`h-1.5 mt-2 [&>div]:${config.progressColor}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Future Features */}
      <div className="grid sm:grid-cols-2 gap-4">
        {[
          {
            icon: Camera,
            title: "Receipt Scanner",
            desc: "Upload receipts to automatically update your pantry inventory. Coming in V2.",
            label: "V2 Feature",
          },
          {
            icon: Barcode,
            title: "Barcode Scanner",
            desc: "Scan product barcodes to instantly add items to your pantry. Mobile app feature.",
            label: "Mobile Feature",
          },
          {
            icon: TrendingDown,
            title: "Buy Now or Wait?",
            desc: "AI-powered price timing recommendations based on historical pricing patterns.",
            label: "V3 Feature",
          },
          {
            icon: CheckCircle2,
            title: "Meal Planning",
            desc: "Generate meal plans that use what you have and incorporate current deal items.",
            label: "V3 Feature",
          },
        ].map((feature) => (
          <Card key={feature.title} className="border-dashed opacity-70">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <feature.icon className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-sm">{feature.title}</CardTitle>
                </div>
                <Badge variant="demo" className="text-[10px]">{feature.label}</Badge>
              </div>
              <CardDescription className="text-xs">{feature.desc}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="sm" disabled className="gap-1.5">
                <Lock className="h-3.5 w-3.5" />
                Coming Soon
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
