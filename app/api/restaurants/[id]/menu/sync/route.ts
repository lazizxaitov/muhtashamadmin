import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { isAuthorized } from "@/lib/api-auth";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type PosterCategory = {
  id?: number | string;
  category_id?: number | string;
  category_name?: string;
  name?: string;
  sort_order?: number | string;
  photo?: unknown;
  image?: unknown;
  picture?: unknown;
  photos?: unknown;
  photo_original?: unknown;
  photo_origin?: unknown;
  photo_url?: unknown;
};

type PosterProduct = {
  id?: number | string;
  product_id?: number | string;
  product_name?: string;
  name?: string;
  category_id?: number | string;
  menu_category_id?: number | string;
  category_name?: string;
  menu_category_name?: string;
  category?: { id?: number | string; category_id?: number | string; name?: string };
  sort_order?: number | string;
  price?: number | string;
  product_price?: number | string;
  prices?: unknown;
  price_by_spot?: unknown;
  spots?: unknown;
  photo?: unknown;
  image?: unknown;
  picture?: unknown;
  photos?: unknown;
  photo_original?: unknown;
  photo_origin?: unknown;
  photo_url?: unknown;
};

const toNumber = (value: unknown) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const normalizePosterPrice = (value: unknown) => {
  const num = toNumber(value);
  if (num === null) return null;
  return num / 100;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const extractArray = (data: unknown, fallbackKey: string): unknown[] => {
  if (Array.isArray(data)) return data;
  if (!isRecord(data)) return [];

  const response = data.response;
  if (Array.isArray(response)) return response;

  if (isRecord(response)) {
    const fallback = response[fallbackKey];
    if (Array.isArray(fallback)) {
      return fallback;
    }
  }

  const fallback = data[fallbackKey];
  if (Array.isArray(fallback)) {
    return fallback;
  }

  return [];
};

const normalizePosterImage = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  if (trimmed.startsWith("/")) {
    return `https://joinposter.com${trimmed}`;
  }
  if (trimmed.startsWith("upload/") || trimmed.includes("/upload/")) {
    return `https://joinposter.com/${trimmed.replace(/^\/+/, "")}`;
  }
  return trimmed;
};

const pickImageUrl = (value: unknown): string => {
  if (!value) return "";
  if (typeof value === "string") return normalizePosterImage(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const url = pickImageUrl(item);
      if (url) return url;
    }
    return "";
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = [
      "url",
      "original",
      "origin",
      "large",
      "big",
      "medium",
      "small",
      "thumbnail",
      "thumb",
    ];
    for (const key of keys) {
      const url = pickImageUrl(record[key]);
      if (url) return url;
    }
  }
  return "";
};

const getProductImage = (product: PosterProduct) =>
  pickImageUrl(
    product.photo ??
      product.photo_original ??
      product.photo_origin ??
      product.photo_url ??
      product.image ??
      product.picture ??
      product.photos
  );

const getCategoryImage = (category: PosterCategory) =>
  pickImageUrl(
    category.photo ??
      category.photo_original ??
      category.photo_origin ??
      category.photo_url ??
      category.image ??
      category.picture ??
      category.photos
  );

const getProductPrice = (product: PosterProduct, spotId: string) => {
  const price =
    normalizePosterPrice(product.price) ??
    normalizePosterPrice(product.product_price);
  if (price !== null) return price;
  const spotKey = String(spotId || "");
  const candidates = [product.price_by_spot, product.prices, product.price];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (typeof candidate === "object" && candidate !== null) {
      const record = candidate as Record<string, unknown>;
      const spotPrice = normalizePosterPrice(record[spotKey]);
      if (spotPrice !== null) return spotPrice;
    }
    if (Array.isArray(candidate)) {
      for (const entry of candidate) {
        if (!entry || typeof entry !== "object") continue;
        const record = entry as Record<string, unknown>;
        const entrySpot =
          String(record.spot_id ?? record.spotId ?? record.id ?? "");
        if (spotKey && entrySpot !== spotKey) continue;
        const entryPrice = normalizePosterPrice(
          record.price ?? record.product_price
        );
        if (entryPrice !== null) return entryPrice;
      }
    }
  }
  if (Array.isArray(product.spots)) {
    for (const entry of product.spots) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      const entrySpot = String(record.spot_id ?? record.spotId ?? "");
      if (spotKey && entrySpot !== spotKey) continue;
      const entryPrice = normalizePosterPrice(
        record.price ?? record.product_price
      );
      if (entryPrice !== null) return entryPrice;
    }
  }
  return 0;
};

export async function POST(request: NextRequest, context: RouteContext) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const { id } = await context.params;
  const restaurantId = Number(id);
  if (!Number.isFinite(restaurantId)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const restaurant = await db.get<{
    id: number;
    token_poster: string | null;
    spot_id: string | null;
    integration_type: string | null;
  }>("SELECT id, token_poster, spot_id, integration_type FROM restaurants WHERE id = ?", [restaurantId]);

  if (!restaurant) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  if ((restaurant.integration_type ?? "poster") !== "poster") {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const token = (restaurant.token_poster ?? "").trim();
  if (!token) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const spotId = (restaurant.spot_id ?? "").trim();

  const body = (await request.json().catch(() => ({}))) as {
    scope?: "all" | "categories" | "items";
    overwriteNames?: boolean;
  };
  const scope = body?.scope ?? "all";
  const overwriteNames = body?.overwriteNames === true;

  const loadPoster = async (endpoint: string, key: string) => {
    try {
      const url = new URL(`https://joinposter.com/api/${endpoint}`);
      url.searchParams.set("token", token);
      if (spotId) {
        url.searchParams.set("spot_id", spotId);
      }
      const response = await fetch(
        url.toString()
      );
      const data = await response.json();
      const error =
        data?.error ||
        data?.error_code ||
        data?.error_message ||
        data?.message ||
        "";
      const items = extractArray(data, key);
      return { items, error: String(error || "") };
    } catch {
      return { items: [], error: "Poster request failed." };
    }
  };

  const categoryResult =
    scope === "all" || scope === "categories"
      ? await loadPoster("menu.getCategories", "categories")
      : { items: [], error: "" };

  const productResult =
    scope === "all" || scope === "items"
      ? await loadPoster("menu.getProducts", "products")
      : { items: [], error: "" };

  if (categoryResult.error) {
    return NextResponse.json(
      { ok: false, error: `Poster categories error: ${categoryResult.error}` },
      { status: 400 }
    );
  }

  if (productResult.error) {
    return NextResponse.json(
      { ok: false, error: `Poster products error: ${productResult.error}` },
      { status: 400 }
    );
  }

  if (
    (scope === "all" || scope === "categories") &&
    categoryResult.items.length === 0
  ) {
    return NextResponse.json(
      { ok: false, error: "Poster returned no categories." },
      { status: 400 }
    );
  }

  if ((scope === "all" || scope === "items") && productResult.items.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Poster returned no products." },
      { status: 400 }
    );
  }

  const posterCategories = categoryResult.items as PosterCategory[];
  const posterProducts = productResult.items as PosterProduct[];

  const result = await db.transaction(async (client) => {
    const categoryIdBySource = new Map<string, number>();
    const categoryIdByName = new Map<string, number>();
    let categoryCount = 0;
    let productCount = 0;

    for (const [index, category] of posterCategories.entries()) {
      const sourceId = String(category.category_id ?? category.id ?? "");
      if (!sourceId) continue;
      const name = (category.category_name ?? category.name ?? "").trim();
      if (!name) continue;
      const order = toNumber(category.sort_order) ?? index + 1;
      const image = getCategoryImage(category);

      const existing = await db.get<{
        id: number;
        hidden: number;
        name_ru: string | null;
        name_uz: string | null;
      }>(
        "SELECT id, hidden, name_ru, name_uz FROM menu_categories WHERE restaurant_id = ? AND source = 'poster' AND source_id = ?",
        [restaurantId, sourceId],
        client
      );

      if (existing) {
        const nextNameRu =
          overwriteNames || !existing.name_ru?.trim()
            ? name
            : existing.name_ru;
        const nextNameUz =
          overwriteNames || !existing.name_uz?.trim()
            ? name
            : existing.name_uz;
        if (image) {
          await db.run(
            "UPDATE menu_categories SET name_ru = ?, name_uz = ?, sort_order = ?, image = ? WHERE id = ?",
            [nextNameRu, nextNameUz, order, image, existing.id],
            client
          );
        } else {
          await db.run(
            "UPDATE menu_categories SET name_ru = ?, name_uz = ?, sort_order = ? WHERE id = ?",
            [nextNameRu, nextNameUz, order, existing.id],
            client
          );
        }
        categoryIdBySource.set(sourceId, existing.id);
        categoryIdByName.set(name.toLowerCase(), existing.id);
      } else {
        const insert = await db.get<{ id: number }>(
          "INSERT INTO menu_categories (restaurant_id, name_ru, name_uz, image, hidden, sort_order, source, source_id) VALUES (?, ?, ?, ?, ?, ?, 'poster', ?) RETURNING id",
          [restaurantId, name, name, image, 0, order, sourceId],
          client
        );
        if (insert?.id) {
          categoryIdBySource.set(sourceId, insert.id);
          categoryIdByName.set(name.toLowerCase(), insert.id);
        }
      }
      categoryCount += 1;
    }

    if (posterCategories.length === 0) {
      const existingCategories = await db.all<{ id: number; source_id: string }>(
        "SELECT id, source_id FROM menu_categories WHERE restaurant_id = ? AND source = 'poster'",
        [restaurantId],
        client
      );
      for (const category of existingCategories) {
        categoryIdBySource.set(category.source_id, category.id);
      }
    }

    for (const [index, product] of posterProducts.entries()) {
      const sourceId = String(product.product_id ?? product.id ?? "");
      const categorySourceId = String(
        product.category_id ??
          product.menu_category_id ??
          product.category?.category_id ??
          product.category?.id ??
          ""
      );
      const categoryName = String(
        product.category_name ??
          product.menu_category_name ??
          product.category?.name ??
          ""
      ).trim();
      if (!sourceId) continue;
      const categoryId =
        categoryIdBySource.get(categorySourceId) ||
        (categoryName
          ? categoryIdByName.get(categoryName.toLowerCase())
          : undefined);
      if (!categoryId) continue;
      const name = (product.product_name ?? product.name ?? "").trim();
      if (!name) continue;
      const order = toNumber(product.sort_order) ?? index + 1;
      const price = getProductPrice(product, spotId);
      const image = getProductImage(product);

      const existing = await db.get<{
        id: number;
        hidden: number;
        name_ru: string | null;
        name_uz: string | null;
      }>(
        "SELECT id, hidden, name_ru, name_uz FROM menu_items WHERE category_id = ? AND source = 'poster' AND source_id = ?",
        [categoryId, sourceId],
        client
      );

      if (existing) {
        const nextNameRu =
          overwriteNames || !existing.name_ru?.trim()
            ? name
            : existing.name_ru;
        const nextNameUz =
          overwriteNames || !existing.name_uz?.trim()
            ? name
            : existing.name_uz;
        if (image) {
          await db.run(
            "UPDATE menu_items SET name_ru = ?, name_uz = ?, price = ?, sort_order = ?, image = ? WHERE id = ?",
            [nextNameRu, nextNameUz, price, order, image, existing.id],
            client
          );
        } else {
          await db.run(
            "UPDATE menu_items SET name_ru = ?, name_uz = ?, price = ?, sort_order = ? WHERE id = ?",
            [nextNameRu, nextNameUz, price, order, existing.id],
            client
          );
        }
      } else {
        await db.run(
          "INSERT INTO menu_items (category_id, name_ru, name_uz, description_ru, description_uz, price, image, hidden, sort_order, source, source_id) VALUES (?, ?, ?, '', '', ?, ?, ?, ?, 'poster', ?)",
          [categoryId, name, name, price, image, 0, order, sourceId],
          client
        );
      }
      productCount += 1;
    }

    return { categoryCount, productCount };
  });

  return NextResponse.json({ ok: true, ...result });
}
