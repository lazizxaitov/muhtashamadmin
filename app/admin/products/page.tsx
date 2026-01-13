"use client";

import { useEffect, useMemo, useState } from "react";
import { useAdminLang } from "../use-admin-lang";

type Restaurant = {
  id: number;
  name: string;
};

type MenuItem = {
  id: number;
  nameRu: string;
  nameUz: string;
  descriptionRu: string;
  descriptionUz: string;
  price: number;
  image?: string;
  hidden: boolean;
};

type MenuCategory = {
  id: number;
  nameRu: string;
  nameUz: string;
  hidden: boolean;
  image?: string;
  items: MenuItem[];
};

export default function ProductsPage() {
  const { lang, t } = useAdminLang();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [canEditRestaurants, setCanEditRestaurants] = useState(true);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<
    number | null
  >(null);
  const [menuCategories, setMenuCategories] = useState<MenuCategory[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuSyncing, setMenuSyncing] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(
    null
  );
  const [editOpen, setEditOpen] = useState(false);
  const [editDraft, setEditDraft] = useState<MenuItem | null>(null);
  const [editCategoryOpen, setEditCategoryOpen] = useState(false);
  const [editCategoryDraft, setEditCategoryDraft] =
    useState<MenuCategory | null>(null);

  useEffect(() => {
    const loadPermissions = async () => {
      const response = await fetch("/api/me");
      if (!response.ok) return;
      const data = (await response.json()) as {
        permissions?: { canEditRestaurants?: boolean };
      };
      setCanEditRestaurants(Boolean(data.permissions?.canEditRestaurants));
    };
    loadPermissions();
  }, []);

  useEffect(() => {
    const loadRestaurants = async () => {
      const response = await fetch("/api/restaurants");
      if (!response.ok) return;
      const data = (await response.json()) as Restaurant[];
      setRestaurants(data);
      if (!selectedRestaurantId && data.length > 0) {
        setSelectedRestaurantId(data[0].id);
      }
    };
    loadRestaurants();
  }, [selectedRestaurantId]);

  const loadMenu = async (restaurantId: number) => {
    setMenuLoading(true);
    try {
      const response = await fetch(
        `/api/restaurants/${restaurantId}/menu?includeHidden=1`
      );
      if (!response.ok) return;
      const data = (await response.json()) as MenuCategory[];
      setMenuCategories(data);
      setSelectedCategoryId(null);
    } finally {
      setMenuLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedRestaurantId) return;
    loadMenu(selectedRestaurantId);
  }, [selectedRestaurantId]);

  const toggleCategoryHidden = async (categoryId: number, hidden: boolean) => {
    const response = await fetch(`/api/menu/categories/${categoryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hidden }),
    });
    if (!response.ok) return;
    setMenuCategories((prev) =>
      prev.map((category) =>
        category.id === categoryId ? { ...category, hidden } : category
      )
    );
  };

  const toggleItemHidden = async (itemId: number, hidden: boolean) => {
    const response = await fetch(`/api/menu/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hidden }),
    });
    if (!response.ok) return;
    setMenuCategories((prev) =>
      prev.map((category) => ({
        ...category,
        items: category.items.map((item) =>
          item.id === itemId ? { ...item, hidden } : item
        ),
      }))
    );
  };

  const syncMenu = async (overwriteNames = false) => {
    if (!selectedRestaurantId || !canEditRestaurants) return;
    setMenuSyncing(true);
    try {
      const response = await fetch(
        `/api/restaurants/${selectedRestaurantId}/menu/sync`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope: "all", overwriteNames }),
        }
      );
      if (!response.ok) return;
      loadMenu(selectedRestaurantId);
    } finally {
      setMenuSyncing(false);
    }
  };

  const categories = useMemo(() => menuCategories, [menuCategories]);

  return (
    <section className="mt-10">
      <div className="mb-6 flex items-center justify-between px-2">
        <div className="ml-10 text-xs uppercase tracking-[0.2em] text-white/70">
          {t("Товары", "Mahsulotlar")}
        </div>
        <div className="mr-4 flex items-center gap-2 text-xs text-white/70">
          <button
            type="button"
            onClick={() => syncMenu(false)}
            className={`inline-flex min-w-[190px] items-center justify-between gap-3 rounded-lg border px-4 py-2 text-xs shadow-[0_8px_20px_rgba(0,0,0,0.18)] ${
              canEditRestaurants
                ? "border-white/30 bg-white/90 text-[#1c2b22]"
                : "cursor-not-allowed border-white/20 bg-white/40 text-[#1c2b22]/60"
            }`}
            title={canEditRestaurants ? "" : t("Нет прав", "Ruxsat yo'q")}
            disabled={!canEditRestaurants || !selectedRestaurantId || menuSyncing}
          >
            {menuSyncing
              ? t("Синхронизация...", "Sinxronizatsiya...")
              : t("Синхронизация", "Sinxronizatsiya")}
          </button>
          <button
            type="button"
            onClick={() => syncMenu(true)}
            className={`inline-flex min-w-[220px] items-center justify-between gap-3 rounded-lg border px-4 py-2 text-xs shadow-[0_8px_20px_rgba(0,0,0,0.18)] ${
              canEditRestaurants
                ? "border-white/30 bg-white/90 text-[#1c2b22]"
                : "cursor-not-allowed border-white/20 bg-white/40 text-[#1c2b22]/60"
            }`}
            title={
              canEditRestaurants
                ? t(
                    "Перезаписать названия из Poster",
                    "Poster nomlarini qayta yozish"
                  )
                : t("Нет прав", "Ruxsat yo'q")
            }
            disabled={!canEditRestaurants || !selectedRestaurantId || menuSyncing}
          >
            {menuSyncing
              ? t("Синхронизация...", "Sinxronizatsiya...")
              : t("Синхр. с обновлением", "Sinx. yangilash bilan")}
          </button>
          {t("Фильтр по заведению", "Muassasa bo'yicha filtr")}
          <div className="custom-scroll flex items-center gap-3 overflow-x-auto pb-2 text-sm">
            {restaurants.map((restaurant) => (
              <button
                key={restaurant.id}
                type="button"
                onClick={() => setSelectedRestaurantId(restaurant.id)}
                className={`whitespace-nowrap rounded-full border px-4 py-2 transition ${
                  selectedRestaurantId === restaurant.id
                    ? "border-white bg-white/80 text-[#1c2b22]"
                    : "border-white/30 bg-white/10 text-white/70 hover:bg-white/20"
                }`}
              >
                {restaurant.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-white/30 bg-white/10 p-6 text-white shadow-[0_20px_50px_rgba(0,0,0,0.35)] backdrop-blur-md">
        <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-white/70">
          <span>
            {selectedCategoryId
              ? t("Товары", "Mahsulotlar")
              : t("Категории", "Kategoriyalar")}
          </span>
          {selectedCategoryId && (
            <button
              type="button"
              onClick={() => setSelectedCategoryId(null)}
              className="rounded-full border border-white/30 bg-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-white/70 transition hover:bg-white/20"
            >
              {t("Назад", "Orqaga")}
            </button>
          )}
        </div>
        {menuLoading ? (
          <div className="mt-4 text-sm text-white/70">
            {t("Загрузка меню...", "Menyu yuklanmoqda...")}
          </div>
        ) : (
          <div className="custom-scroll mt-4 grid max-h-[60vh] gap-4 overflow-y-auto pr-2">
            {!selectedCategoryId && (
              <div className="grid grid-cols-4 gap-4">
                {categories.map((category) => (
                  <div
                    key={category.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedCategoryId(category.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedCategoryId(category.id);
                      }
                    }}
                    className={`cursor-pointer overflow-hidden rounded-2xl border border-white/20 bg-white/10 text-left transition hover:bg-white/20 ${
                      category.hidden ? "opacity-60" : ""
                    }`}
                  >
                    <div className="relative h-32 w-full overflow-hidden bg-white/80">
                      <img
                        src={category.image || "/logo.png"}
                        alt=""
                        width={320}
                        height={180}
                        className="h-full w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleCategoryHidden(category.id, !category.hidden);
                        }}
                        className="absolute right-2 top-2 rounded-full border border-white/50 bg-white/85 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-[#1c2b22] transition hover:bg-white"
                      >
                        {category.hidden
                          ? t("Показать", "Ko'rsatish")
                          : t("Скрыть", "Yashirish")}
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditCategoryDraft(category);
                          setEditCategoryOpen(true);
                        }}
                        className="absolute left-2 top-2 rounded-full border border-white/50 bg-white/85 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-[#1c2b22] transition hover:bg-white"
                      >
                        {t("Ред.", "Tahr.")}
                      </button>
                    </div>
                    <div className="p-4">
                      <div className="text-sm font-semibold">
                        {lang === "ru" ? category.nameRu : category.nameUz}
                      </div>
                      <div className="mt-2 text-xs text-white/70">
                        {category.items.length} {t("товаров", "ta mahsulot")}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {selectedCategoryId && (
              <div className="grid grid-cols-4 gap-4">
                {(categories.find((category) => category.id === selectedCategoryId)
                  ?.items ?? []
                ).map((item) => (
                  <div
                    key={item.id}
                    className={`overflow-hidden rounded-2xl border border-white/20 bg-white/10 ${
                      item.hidden ? "opacity-60" : ""
                    }`}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setEditDraft(item);
                      setEditOpen(true);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setEditDraft(item);
                        setEditOpen(true);
                      }
                    }}
                  >
                    <div className="relative h-32 w-full overflow-hidden bg-white/80">
                      <img
                        src={item.image || "/logo.png"}
                        alt=""
                        width={320}
                        height={180}
                        className="h-full w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleItemHidden(item.id, !item.hidden);
                        }}
                        className="absolute right-2 top-2 rounded-full border border-white/50 bg-white/85 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-[#1c2b22] transition hover:bg-white"
                      >
                        {item.hidden
                          ? t("Показать", "Ko'rsatish")
                          : t("Скрыть", "Yashirish")}
                      </button>
                    </div>
                    <div className="p-4">
                      <div className="text-sm font-semibold">
                        {lang === "ru" ? item.nameRu : item.nameUz}
                      </div>
                      <div className="mt-2 text-xs text-white/70">
                        {t("Описание", "Tavsif")}: {" "}
                        {lang === "ru"
                          ? item.descriptionRu || "—"
                          : item.descriptionUz || "—"}
                      </div>
                      <div className="mt-2 text-xs text-white/70">
                        {t("Цена", "Narx")}: {" "}
                        {item.price ? `${item.price} ${t("сум", "so'm")}` : "—"}
                      </div>
                    </div>
                  </div>
                ))}
                {(categories.find((category) => category.id === selectedCategoryId)
                  ?.items ?? []
                ).length === 0 && (
                  <div className="rounded-xl border border-dashed border-white/30 bg-white/5 px-3 py-6 text-center text-xs text-white/60">
                    {t("Товары отсутствуют.", "Mahsulotlar yo'q.")}
                  </div>
                )}
              </div>
            )}
            {!selectedCategoryId && categories.length === 0 && (
              <div className="rounded-xl border border-dashed border-white/30 bg-white/5 px-3 py-6 text-center text-xs text-white/60">
                {t("Категории отсутствуют.", "Kategoriyalar yo'q.")}
              </div>
            )}
          </div>
        )}
      </div>

      {editOpen && editDraft && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 px-4"
          onClick={() => {
            setEditOpen(false);
            setEditDraft(null);
          }}
        >
          <div
            className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-3xl border border-white/30 bg-white/10 p-6 text-white shadow-[0_20px_50px_rgba(0,0,0,0.35)] backdrop-blur-md"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-semibold">
                {t("Редактировать товар", "Mahsulotni tahrirlash")}
              </h4>
              <button
                type="button"
                onClick={() => {
                  setEditOpen(false);
                  setEditDraft(null);
                }}
                className="rounded-full border border-white/60 bg-white/70 px-2 py-1 text-xs text-[#1c2b22] transition hover:bg-white"
              >
                X
              </button>
            </div>
            <div className="mt-6 grid gap-4 text-sm">
              <label className="grid gap-2">
                {t("Название", "Nomi")} (RU)
                <input
                  type="text"
                  value={editDraft.nameRu}
                  onChange={(event) =>
                    setEditDraft({ ...editDraft, nameRu: event.target.value })
                  }
                  className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 focus:outline-none"
                />
              </label>
              <label className="grid gap-2">
                {t("Название", "Nomi")} (UZ)
                <input
                  type="text"
                  value={editDraft.nameUz}
                  onChange={(event) =>
                    setEditDraft({ ...editDraft, nameUz: event.target.value })
                  }
                  className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 focus:outline-none"
                />
              </label>
              <label className="grid gap-2">
                {t("Описание", "Tavsif")} (RU)
                <textarea
                  value={editDraft.descriptionRu}
                  onChange={(event) =>
                    setEditDraft({
                      ...editDraft,
                      descriptionRu: event.target.value,
                    })
                  }
                  rows={3}
                  className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 focus:outline-none"
                />
              </label>
              <label className="grid gap-2">
                {t("Описание", "Tavsif")} (UZ)
                <textarea
                  value={editDraft.descriptionUz}
                  onChange={(event) =>
                    setEditDraft({
                      ...editDraft,
                      descriptionUz: event.target.value,
                    })
                  }
                  rows={3}
                  className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 focus:outline-none"
                />
              </label>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3 text-sm">
              <button
                type="button"
                onClick={() => {
                  setEditOpen(false);
                  setEditDraft(null);
                }}
                className="rounded-2xl border border-white/30 bg-white/10 px-4 py-2 transition hover:bg-white/20"
              >
                {t("Отмена", "Bekor qilish")}
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!editDraft) return;
                  await fetch(`/api/menu/items/${editDraft.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      nameRu: editDraft.nameRu,
                      nameUz: editDraft.nameUz,
                      descriptionRu: editDraft.descriptionRu,
                      descriptionUz: editDraft.descriptionUz,
                    }),
                  });
                  if (selectedRestaurantId) {
                    await loadMenu(selectedRestaurantId);
                  }
                  setEditOpen(false);
                  setEditDraft(null);
                }}
                className="rounded-2xl bg-white/80 px-4 py-2 text-[#1c2b22] transition hover:bg-white"
              >
                {t("Сохранить", "Saqlash")}
              </button>
            </div>
          </div>
        </div>
      )}

      {editCategoryOpen && editCategoryDraft && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 px-4"
          onClick={() => {
            setEditCategoryOpen(false);
            setEditCategoryDraft(null);
          }}
        >
          <div
            className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-3xl border border-white/30 bg-white/10 p-6 text-white shadow-[0_20px_50px_rgba(0,0,0,0.35)] backdrop-blur-md"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-semibold">
                {t("Редактировать категорию", "Kategoriyani tahrirlash")}
              </h4>
              <button
                type="button"
                onClick={() => {
                  setEditCategoryOpen(false);
                  setEditCategoryDraft(null);
                }}
                className="rounded-full border border-white/60 bg-white/70 px-2 py-1 text-xs text-[#1c2b22] transition hover:bg-white"
              >
                X
              </button>
            </div>
            <div className="mt-6 grid gap-4 text-sm">
              <label className="grid gap-2">
                {t("Название", "Nomi")} (RU)
                <input
                  type="text"
                  value={editCategoryDraft.nameRu}
                  onChange={(event) =>
                    setEditCategoryDraft({
                      ...editCategoryDraft,
                      nameRu: event.target.value,
                    })
                  }
                  className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 focus:outline-none"
                />
              </label>
              <label className="grid gap-2">
                {t("Название", "Nomi")} (UZ)
                <input
                  type="text"
                  value={editCategoryDraft.nameUz}
                  onChange={(event) =>
                    setEditCategoryDraft({
                      ...editCategoryDraft,
                      nameUz: event.target.value,
                    })
                  }
                  className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 focus:outline-none"
                />
              </label>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3 text-sm">
              <button
                type="button"
                onClick={() => {
                  setEditCategoryOpen(false);
                  setEditCategoryDraft(null);
                }}
                className="rounded-2xl border border-white/30 bg-white/10 px-4 py-2 transition hover:bg-white/20"
              >
                {t("Отмена", "Bekor qilish")}
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!editCategoryDraft) return;
                  await fetch(`/api/menu/categories/${editCategoryDraft.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      nameRu: editCategoryDraft.nameRu,
                      nameUz: editCategoryDraft.nameUz,
                    }),
                  });
                  if (selectedRestaurantId) {
                    await loadMenu(selectedRestaurantId);
                  }
                  setEditCategoryOpen(false);
                  setEditCategoryDraft(null);
                }}
                className="rounded-2xl bg-white/80 px-4 py-2 text-[#1c2b22] transition hover:bg-white"
              >
                {t("Сохранить", "Saqlash")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
