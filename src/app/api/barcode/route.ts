import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface OpenFoodFactsProduct {
  product_name?: string;
  brands?: string;
  serving_size?: string;
  serving_quantity?: number;
  nutriments?: {
    "energy-kcal_serving"?: number;
    "energy-kcal_100g"?: number;
    "proteins_serving"?: number;
    "proteins_100g"?: number;
    "carbohydrates_serving"?: number;
    "carbohydrates_100g"?: number;
    "fat_serving"?: number;
    "fat_100g"?: number;
    "fiber_serving"?: number;
    "fiber_100g"?: number;
    "sugars_serving"?: number;
    "sugars_100g"?: number;
    "sodium_serving"?: number;
    "sodium_100g"?: number;
  };
}

export interface BarcodeResult {
  found: boolean;
  barcode: string;
  name?: string;
  brand?: string;
  servingSize?: string;
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  fiber_g?: number;
  sugars_g?: number;
  sodium_mg?: number;
}

// GET /api/barcode?upc=012345678901
// Looks up a UPC/EAN barcode in Open Food Facts and returns normalised nutrition.
export async function GET(request: NextRequest) {
  const upc = request.nextUrl.searchParams.get("upc")?.trim();
  if (!upc) {
    return NextResponse.json({ error: "Missing upc parameter" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(upc)}.json`,
      {
        headers: { "User-Agent": "NutriSense/1.0 (health tracking app)" },
        next: { revalidate: 86400 }, // cache for 24 hours
      }
    );

    if (!res.ok) {
      return NextResponse.json<BarcodeResult>({ found: false, barcode: upc });
    }

    const json = await res.json();

    if (json.status !== 1 || !json.product) {
      return NextResponse.json<BarcodeResult>({ found: false, barcode: upc });
    }

    const p: OpenFoodFactsProduct = json.product;
    const n = p.nutriments ?? {};

    // Prefer per-serving values; fall back to per-100g
    const cal     = n["energy-kcal_serving"]     ?? n["energy-kcal_100g"];
    const protein = n["proteins_serving"]         ?? n["proteins_100g"];
    const carbs   = n["carbohydrates_serving"]    ?? n["carbohydrates_100g"];
    const fat     = n["fat_serving"]              ?? n["fat_100g"];
    const fiber   = n["fiber_serving"]            ?? n["fiber_100g"];
    const sugars  = n["sugars_serving"]           ?? n["sugars_100g"];
    const sodiumG = n["sodium_serving"]           ?? n["sodium_100g"];

    const result: BarcodeResult = {
      found: true,
      barcode: upc,
      name:       p.product_name || undefined,
      brand:      p.brands       || undefined,
      servingSize: p.serving_size || undefined,
      calories:   cal     != null ? Math.round(cal)         : undefined,
      protein_g:  protein != null ? Math.round(protein * 10) / 10 : undefined,
      carbs_g:    carbs   != null ? Math.round(carbs   * 10) / 10 : undefined,
      fat_g:      fat     != null ? Math.round(fat     * 10) / 10 : undefined,
      fiber_g:    fiber   != null ? Math.round(fiber   * 10) / 10 : undefined,
      sugars_g:   sugars  != null ? Math.round(sugars  * 10) / 10 : undefined,
      sodium_mg:  sodiumG != null ? Math.round(sodiumG * 1000)    : undefined,
    };

    return NextResponse.json<BarcodeResult>(result);
  } catch {
    return NextResponse.json<BarcodeResult>({ found: false, barcode: upc });
  }
}
