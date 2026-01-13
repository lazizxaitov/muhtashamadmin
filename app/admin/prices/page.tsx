"use client";

import { useEffect, useState } from "react";
import { useAdminLang } from "../use-admin-lang";

type PriceCard = {
  id: number;
  title: string;
  description: string;
  price: number;
  isDefault?: boolean;
};

type Restaurant = {
  id: number;
  name: string;
};

export default function PricesPage() {
  const { t } = useAdminLang();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<
    number | null
  >(null);
  const [cards, setCards] = useState<PriceCard[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [draft, setDraft] = useState<PriceCard>(() => ({
    id: Date.now(),
    title: "",
    description: "",
    price: 0,
  }));
  const [editDraft, setEditDraft] = useState<PriceCard | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PriceCard | null>(null);

  const formatPrice = (price: number) =>
    price === 0 ? t("Бесплатно", "Bepul") : `${price} ${t("сум", "so'm")}`;

  useEffect(() => {
    const loadRestaurants = async () => {
      const response = await fetch("/api/restaurants");
      if (!response.ok) return;
      const data = (await response.json()) as Restaurant[];
      setRestaurants(data);
      if (data.length > 0) {
        setSelectedRestaurantId((prev) => prev ?? data[0].id);
      }
    };
    loadRestaurants();
  }, []);

  const loadFeesData = async (restaurantId: number) => {
    const response = await fetch(`/api/restaurants/${restaurantId}/fees`);
    if (!response.ok) return null;
    return (await response.json()) as PriceCard[];
  };

  const loadFees = async (restaurantId: number) => {
    const data = await loadFeesData(restaurantId);
    if (data) {
      setCards(data);
    }
  };

  useEffect(() => {
    if (!selectedRestaurantId) return;
    let cancelled = false;
    const load = async () => {
      const data = await loadFeesData(selectedRestaurantId);
      if (!cancelled && data) {
        setCards(data);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedRestaurantId]);

  return (
    <section className="mt-10">
      <div className="mb-6 flex items-center justify-between px-2">
        <div className="ml-10 text-xs uppercase tracking-[0.2em] text-white/70">
          {t("Цены", "Narxlar")}
        </div>
        <div className="mr-4 flex items-center gap-2 text-xs text-white/70">
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
        <div className="mr-4">
          <button
            type="button"
            onClick={() => {
              setDraft({
                id: Date.now(),
                title: "",
                description: "",
                price: 0,
              });
              setAddOpen(true);
            }}
            className="inline-flex min-w-[220px] items-center justify-between gap-3 rounded-lg border border-white/30 bg-white/90 px-4 py-2 text-xs text-[#1c2b22] shadow-[0_8px_20px_rgba(0,0,0,0.18)]"
          >
            {t("Добавить", "Qo'shish")}
          </button>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-4">
        {cards.map((card) => (
          <div
            key={card.id}
            role="button"
            tabIndex={0}
            onClick={() => {
              setEditDraft({ ...card });
              setEditOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setEditDraft({ ...card });
                setEditOpen(true);
              }
            }}
            className="overflow-hidden rounded-2xl border border-white/20 bg-white/10 transition hover:bg-white/20"
          >
            <div className="flex h-28 items-center justify-center bg-white/80">
              <span className="text-lg font-semibold text-[#1c2b22]">
                {formatPrice(card.price)}
              </span>
            </div>
            <div className="p-4">
              <div className="text-sm font-semibold text-white">{card.title}</div>
              <div className="mt-2 text-xs text-white/70">
                {card.description || "—"}
              </div>
              <div className="mt-3 text-xs text-white/80">
                {formatPrice(card.price)}
              </div>
            </div>
          </div>
        ))}
      </div>
      {addOpen && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setAddOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-white/30 bg-white/10 p-6 text-white shadow-[0_20px_50px_rgba(0,0,0,0.35)] backdrop-blur-md"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-semibold">
                {t("Новая цена", "Yangi narx")}
              </h4>
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                className="rounded-full border border-white/60 bg-white/70 px-2 py-1 text-xs text-[#1c2b22] transition hover:bg-white"
              >
                X
              </button>
            </div>
            <div className="mt-6 grid gap-4 text-sm">
              <label className="grid gap-2">
                {t("Заголовок", "Sarlavha")}
                <input
                  type="text"
                  value={draft.title}
                  onChange={(event) =>
                    setDraft({ ...draft, title: event.target.value })
                  }
                  className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 focus:outline-none"
                />
              </label>
              <label className="grid gap-2">
                {t("Описание", "Tavsif")}
                <textarea
                  value={draft.description}
                  onChange={(event) =>
                    setDraft({ ...draft, description: event.target.value })
                  }
                  rows={3}
                  className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 focus:outline-none"
                />
              </label>
              <label className="grid gap-2">
                {t("Цена", "Narx")}
                <input
                  type="number"
                  min={0}
                  value={draft.price}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      price: Number(event.target.value),
                    })
                  }
                  className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 focus:outline-none"
                />
              </label>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3 text-sm">
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                className="rounded-2xl border border-white/30 bg-white/10 px-4 py-2 transition hover:bg-white/20"
              >
                {t("Отмена", "Bekor qilish")}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!selectedRestaurantId) return;
                  fetch(`/api/restaurants/${selectedRestaurantId}/fees`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      title: draft.title,
                      description: draft.description,
                      price: draft.price,
                    }),
                  }).then(() => loadFees(selectedRestaurantId));
                  setAddOpen(false);
                }}
                className="rounded-2xl bg-white/80 px-4 py-2 text-[#1c2b22] transition hover:bg-white"
              >
                {t("Сохранить", "Saqlash")}
              </button>
            </div>
          </div>
        </div>
      )}
      {editOpen && editDraft && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 px-4"
          onClick={() => {
            setEditOpen(false);
            setEditDraft(null);
          }}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-white/30 bg-white/10 p-6 text-white shadow-[0_20px_50px_rgba(0,0,0,0.35)] backdrop-blur-md"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-semibold">
                {t("Изменить цену", "Narxni o'zgartirish")}
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
                {t("Заголовок", "Sarlavha")}
                <input
                  type="text"
                  value={editDraft.title}
                  onChange={(event) =>
                    setEditDraft({ ...editDraft, title: event.target.value })
                  }
                  disabled={editDraft.isDefault}
                  className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
              <label className="grid gap-2">
                {t("Описание", "Tavsif")}
                <textarea
                  value={editDraft.description}
                  onChange={(event) =>
                    setEditDraft({
                      ...editDraft,
                      description: event.target.value,
                    })
                  }
                  rows={3}
                  disabled={editDraft.isDefault}
                  className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
              <label className="grid gap-2">
                {t("Цена", "Narx")}
                <input
                  type="number"
                  min={0}
                  value={editDraft.price}
                  onChange={(event) =>
                    setEditDraft({
                      ...editDraft,
                      price: Number(event.target.value),
                    })
                  }
                  className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 focus:outline-none"
                />
              </label>
            </div>
            <div className="mt-6 flex items-center justify-between gap-3 text-sm">
              {!editDraft.isDefault && (
                <button
                  type="button"
                  onClick={() => {
                    setDeleteTarget(editDraft);
                    setDeleteConfirmOpen(true);
                  }}
                  className="rounded-2xl border border-red-200/40 bg-red-500/20 px-4 py-2 text-red-100 transition hover:bg-red-500/30"
                >
                  {t("Удалить", "O'chirish")}
                </button>
              )}
              <div className="flex items-center gap-3">
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
                  onClick={() => {
                    fetch(`/api/fees/${editDraft.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        title: editDraft.title,
                        description: editDraft.description,
                        price: editDraft.price,
                      }),
                    }).then(() => {
                      if (selectedRestaurantId) {
                        loadFees(selectedRestaurantId);
                      }
                    });
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
        </div>
      )}
      {deleteConfirmOpen && deleteTarget && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 px-4"
          onClick={() => {
            setDeleteConfirmOpen(false);
            setDeleteTarget(null);
          }}
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-white/30 bg-white/10 p-6 text-white shadow-[0_20px_50px_rgba(0,0,0,0.35)] backdrop-blur-md"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-semibold">
                {t("Удалить карточку", "Kartani o'chirish")}
              </h4>
              <button
                type="button"
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  setDeleteTarget(null);
                }}
                className="rounded-full border border-white/60 bg-white/70 px-2 py-1 text-xs text-[#1c2b22] transition hover:bg-white"
              >
                X
              </button>
            </div>
            <p className="mt-3 text-sm text-white/70">
              {t("Удалить карточку", "Kartani o'chirish")} {" "}
              <span className="font-semibold text-white">
                {deleteTarget.title || t("Без названия", "Nomsiz")}
              </span>
              ?
            </p>
            <div className="mt-5 flex items-center justify-end gap-3 text-sm">
              <button
                type="button"
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  setDeleteTarget(null);
                }}
                className="rounded-2xl border border-white/30 bg-white/10 px-4 py-2 transition hover:bg-white/20"
              >
                {t("Отмена", "Bekor qilish")}
              </button>
              <button
                type="button"
                onClick={() => {
                  fetch(`/api/fees/${deleteTarget.id}`, {
                    method: "DELETE",
                  }).then(() => {
                    if (selectedRestaurantId) {
                      loadFees(selectedRestaurantId);
                    }
                  });
                  setDeleteConfirmOpen(false);
                  setDeleteTarget(null);
                  setEditOpen(false);
                  setEditDraft(null);
                }}
                className="rounded-2xl border border-red-200/40 bg-red-500/30 px-4 py-2 text-red-100 transition hover:bg-red-500/40"
              >
                {t("Удалить", "O'chirish")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
