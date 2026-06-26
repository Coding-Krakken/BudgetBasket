"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Milk,
  Egg,
  Beef,
  Carrot,
  Wheat,
  Cookie,
  Sparkles,
  SprayCan,
  Scroll,
  CupSoda,
  Package,
  Snowflake,
  Croissant,
  Soup,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORY_ICON: Record<string, LucideIcon> = {
  dairy: Milk,
  eggs: Egg,
  meat: Beef,
  produce: Carrot,
  cereal: Wheat,
  snacks: Cookie,
  "personal-care": Sparkles,
  cleaning: SprayCan,
  "paper-goods": Scroll,
  beverages: CupSoda,
  pantry: Package,
  frozen: Snowflake,
  bakery: Croissant,
  condiments: Soup,
};

interface ProductImageProps {
  imageUrl?: string | null;
  name: string;
  categorySlug?: string | null;
  size?: number;
  className?: string;
}

export function ProductImage({ imageUrl, name, categorySlug, size = 48, className }: ProductImageProps) {
  const [failed, setFailed] = useState(false);
  const Icon = (categorySlug && CATEGORY_ICON[categorySlug]) || Package;

  if (!imageUrl || failed) {
    return (
      <div
        className={cn("flex items-center justify-center rounded-md bg-muted text-muted-foreground", className)}
        style={{ width: size, height: size }}
        aria-label={name}
      >
        <Icon className="h-1/2 w-1/2" />
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden rounded-md bg-muted", className)} style={{ width: size, height: size }}>
      <Image
        src={imageUrl}
        alt={name}
        fill
        sizes={`${size}px`}
        className="object-contain"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
