import { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  User, TrendingDown, Target, Settings, Lock,
  DollarSign, Star, Home, AlertCircle,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export const metadata: Metadata = {
  title: "My Profile",
  description: "Savings analytics, preferences, and household settings.",
};

// Demo analytics data
const DEMO_STATS = {
  totalEstimatedSavings: 342.17,
  plansCreated: 8,
  couponsClipped: 23,
  rebatesTracked: 7,
  avgSavingsPercent: 28,
  topStore: "Kroger",
  favoriteCategories: ["Dairy", "Meat", "Personal Care"],
};

export default function ProfilePage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <User className="h-6 w-6 text-primary" />
          My Profile
        </h1>
        <p className="text-muted-foreground mt-1">Savings analytics, household settings, and preferences.</p>
        <Badge variant="demo" className="mt-2">Demo Mode — Preferences not persisted in MVP</Badge>
      </div>

      {/* Savings Stats */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Estimated Savings", value: formatCurrency(DEMO_STATS.totalEstimatedSavings), icon: DollarSign, color: "text-savings" },
          { label: "Plans Created", value: DEMO_STATS.plansCreated.toString(), icon: Target, color: "text-primary" },
          { label: "Avg. Savings", value: `${DEMO_STATS.avgSavingsPercent}%`, icon: TrendingDown, color: "text-primary" },
          { label: "Rebates Tracked", value: DEMO_STATS.rebatesTracked.toString(), icon: Star, color: "text-amber-500" },
        ].map(stat => (
          <Card key={stat.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <div>
                <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 gap-6">
        {/* Household Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Home className="h-4 w-4 text-primary" />
              Household Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { label: "Household Size", value: "2 people", editable: true },
              { label: "ZIP Code", value: "Not set", editable: true },
              { label: "Weekly Budget", value: "Not set", editable: true },
              { label: "Max Stores Per Trip", value: "2 stores", editable: true },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{item.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{item.value}</span>
                  {item.editable && (
                    <Button variant="ghost" size="sm" disabled className="h-6 text-xs gap-1">
                      <Settings className="h-3 w-3" />Edit
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Shopping Preferences */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Settings className="h-4 w-4 text-primary" />
              Shopping Preferences
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { label: "Default Optimization", value: "Best Price (Cheapest)" },
              { label: "Allow Substitutions", value: "Yes" },
              { label: "Prefer Organic", value: "No" },
              { label: "Prefer Name Brand", value: "No" },
              { label: "Loyalty Cards", value: "Kroger Plus, Target Circle" },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{item.label}</span>
                <span className="text-sm font-medium">{item.value}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Dietary Restrictions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-primary" />
              Dietary & Restrictions
            </CardTitle>
            <CardDescription className="text-xs">Used to filter substitution recommendations.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {["None set"].map(tag => (
                <Badge key={tag} variant="outline">{tag}</Badge>
              ))}
            </div>
            <Button variant="outline" size="sm" disabled className="mt-3 gap-1.5">
              <Lock className="h-3.5 w-3.5" />
              Set Restrictions (Coming Soon)
            </Button>
          </CardContent>
        </Card>

        {/* Privacy */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="h-4 w-4 text-primary" />
              Privacy & Data
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              CartWise AI does not sell your data. Shopping history is used only to improve your personalized recommendations.
            </p>
            <div className="space-y-2">
              <Button variant="outline" size="sm" disabled className="gap-1.5 text-xs">
                Download My Data
              </Button>
              <Button variant="outline" size="sm" disabled className="gap-1.5 text-xs text-destructive border-destructive/30">
                Delete My Account
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Separator className="my-6" />

      {/* Coming Soon features */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Coming in Future Versions</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          {[
            { label: "Savings History Chart", phase: "V1" },
            { label: "Coupon Redemption Tracking", phase: "V1" },
            { label: "Rebate Success Rate", phase: "V1" },
            { label: "Budget Tracking & Alerts", phase: "V2" },
            { label: "Household Member Profiles", phase: "V2" },
            { label: "Annual Savings Report", phase: "V2" },
          ].map(f => (
            <div key={f.label} className="flex items-center justify-between p-3 rounded-lg border border-dashed bg-muted/20">
              <span className="text-sm">{f.label}</span>
              <Badge variant="outline" className="text-[10px]">{f.phase}</Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
