import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { isAuthorized } from "@/lib/api-auth";
import { isRateLimited } from "@/lib/rate-limit";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const normalizePosterImageUrl = (value: string) => {
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

export async function GET(request: NextRequest, context: RouteContext) {
  const isAdmin = isAuthorized(request);
  if (!isAdmin && isRateLimited(request, { limit: 120, windowMs: 60_000 })) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  const { id } = await context.params;
  const restaurantId = Number(id);
  if (!Number.isFinite(restaurantId)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const url = new URL(request.url);
  const includeHidden = isAdmin && url.searchParams.get("includeHidden") === "1";
  const lang = url.searchParams.get("lang") ?? "";

  const categories = await db.all<{
    id: number;
    name_ru: string;
    name_uz: string;
    image: string | null;
    hidden: number;
    sort_order: number;
  }>(`SELECT id, name_ru, name_uz, image, hidden, sort_order
       FROM menu_categories
       WHERE restaurant_id = ?
       ${includeHidden ? "" : "AND hidden = 0"}
       ORDER BY sort_order, id`, [restaurantId]);

  const categoryIds = categories.map((category) => category.id);
  const items =
    categoryIds.length === 0
      ? []
      : await db.all<{
          id: number;
          category_id: number;
          name_ru: string;
          name_uz: string;
          description_ru: string | null;
          description_uz: string | null;
          price: number | null;
          image: string | null;
          hidden: number;
          sort_order: number;
        }>(`SELECT id, category_id, name_ru, name_uz, description_ru, description_uz, price, image, hidden, sort_order
       FROM menu_items
       WHERE category_id IN (${categoryIds.map(() => "?").join(", ")})
       ${includeHidden ? "" : "AND hidden = 0"}
       ORDER BY sort_order, id`, categoryIds);

  const itemsByCategory = new Map<number, typeof items>();
  for (const item of items) {
    const list = itemsByCategory.get(item.category_id) ?? [];
    list.push(item);
    itemsByCategory.set(item.category_id, list);
  }

  const payload = categories.map((category) => {
    const categoryNameRu = category.name_ru;
    const categoryNameUz = category.name_uz;
    const categoryName = lang === "uz" ? categoryNameUz : categoryNameRu;
    const categoryImage = category.image ?? "";
    const items = (itemsByCategory.get(category.id) ?? []).map((item) => {
      const itemNameRu = item.name_ru;
      const itemNameUz = item.name_uz;
      const itemDescRu = item.description_ru ?? "";
      const itemDescUz = item.description_uz ?? "";
      const image =
        typeof item.image === "string"
          ? normalizePosterImageUrl(item.image)
          : item.image ?? "";
      return {
        id: item.id,
        nameRu: itemNameRu,
        nameUz: itemNameUz,
        name: lang === "uz" ? itemNameUz : itemNameRu,
        descriptionRu: itemDescRu,
        descriptionUz: itemDescUz,
        description: lang === "uz" ? itemDescUz : itemDescRu,
        price: item.price ?? 0,
        image,
        hidden: Boolean(item.hidden),
      };
    });
    const fallbackImage =
      items.find((item) => item.image)?.image ?? "";
    return {
      id: category.id,
      nameRu: categoryNameRu,
      nameUz: categoryNameUz,
      name: categoryName,
      hidden: Boolean(category.hidden),
      image: normalizePosterImageUrl(categoryImage) || fallbackImage,
      items,
    };
  });

  if (lang === "ru" || lang === "uz") {
    const minimal = payload.map((category) => ({
      id: category.id,
      name: category.name,
      hidden: category.hidden,
      image: category.image,
      items: category.items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        price: item.price,
        image: item.image,
        hidden: item.hidden,
      })),
    }));
    return NextResponse.json(minimal);
  }

  return NextResponse.json(payload);
}
