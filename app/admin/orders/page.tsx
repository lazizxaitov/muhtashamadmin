"use client";

import { useEffect, useMemo, useState } from "react";
import { useAdminLang } from "../use-admin-lang";

type OrderItem = {
  id: number;
  name: string;
  qty: number;
  price: number;
};

type Order = {
  id: number;
  restaurantId: number;
  restaurantName: string;
  clientName: string;
  clientPhone: string;
  items: OrderItem[];
  comment: string;
  deliveryPrice: number;
  serviceMode: number;
  fees: Array<{ title: string; price: number }>;
  status: string;
  createdAt: string;
};

type Restaurant = {
  id: number;
  name: string;
};

const formatDate = (value: string, locale: string) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale);
};

const formatSum = (value: number) =>
  Number.isFinite(value) ? value.toLocaleString("ru-RU") : "0";

const getTotal = (items: OrderItem[]) =>
  items.reduce(
    (sum, item) => sum + (Number(item.qty) || 0) * (Number(item.price) || 0),
    0
  );

const getFeesTotal = (fees: Array<{ title: string; price: number }>) =>
  fees.reduce((sum, fee) => sum + (Number(fee.price) || 0), 0);

export default function OrdersPage() {
  const { lang, t } = useAdminLang();
  const locale = lang === "uz" ? "uz-UZ" : "ru-RU";
  const [orders, setOrders] = useState<Order[]>([]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({
    status: "all",
    restaurantId: "all",
    from: "",
    to: "",
    q: "",
  });
  const pageSize = 20;

  const loadRestaurants = async () => {
    const response = await fetch("/api/restaurants");
    if (!response.ok) return;
    const data = (await response.json()) as Restaurant[];
    setRestaurants(
      data.map((row) => ({ id: row.id, name: row.name })).filter(Boolean)
    );
  };

  const buildQuery = (override?: typeof filters, nextPage?: number) => {
    const activeFilters = override ?? filters;
    const params = new URLSearchParams();
    params.set("limit", String(pageSize));
    params.set("page", String(nextPage ?? page));
    if (activeFilters.status !== "all")
      params.set("status", activeFilters.status);
    if (activeFilters.restaurantId !== "all") {
      params.set("restaurantId", activeFilters.restaurantId);
    }
    if (activeFilters.from) params.set("from", activeFilters.from);
    if (activeFilters.to) params.set("to", activeFilters.to);
    if (activeFilters.q.trim()) params.set("q", activeFilters.q.trim());
    return params.toString();
  };

  const loadOrders = async (override?: typeof filters, nextPage?: number) => {
    setLoading(true);
    const response = await fetch(
      `/api/admin/orders?${buildQuery(override, nextPage)}`
    );
    if (response.ok) {
      const data = (await response.json()) as {
        orders: Order[];
        total?: number;
      };
      setOrders(data.orders);
      setTotal(Number(data.total ?? data.orders.length));
      setSelectedOrder((prev) => {
        if (!data.orders.length) return null;
        if (!prev) return data.orders[0];
        return data.orders.find((order) => order.id === prev.id) ?? data.orders[0];
      });
    }
    setLoading(false);
  };

  useEffect(() => {
    loadRestaurants();
    loadOrders();
  }, []);

  const statusLabel = (status: string) => {
    if (status === "sent") return t("Отправлен", "Yuborildi");
    if (status === "failed") return t("Ошибка", "Xato");
    return t("В обработке", "Jarayonda");
  };

  const statusTone = (status: string) => {
    if (status === "sent") return "border-emerald-300/40 text-emerald-100";
    if (status === "failed") return "border-red-200/40 text-red-100";
    return "border-amber-200/40 text-amber-100";
  };

  const totalSelected = useMemo(
    () =>
      selectedOrder
        ? getTotal(selectedOrder.items) +
          getFeesTotal(selectedOrder.fees) +
          (Number(selectedOrder.deliveryPrice) || 0)
        : 0,
    [selectedOrder]
  );

  const totalPages = Math.max(Math.ceil(total / pageSize), 1);

  const handleRetry = async (orderId: number) => {
    await fetch(`/api/admin/orders/${orderId}/retry`, { method: "POST" });
    await loadOrders();
  };

  return (
    <section className="mt-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 px-2">
        <div className="ml-10 text-xs uppercase tracking-[0.2em] text-white/70">
          {t("Заказы", "Buyurtmalar")}
        </div>
        <button
          type="button"
          onClick={() => loadOrders()}
          className="rounded-full border border-white/30 bg-white/10 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/80 transition hover:border-white/60"
        >
          {loading ? t("Обновление...", "Yangilanmoqda...") : t("Обновить", "Yangilash")}
        </button>
      </div>

        <div className="rounded-3xl border border-white/30 bg-white/10 p-6 text-white shadow-[0_20px_50px_rgba(0,0,0,0.35)] backdrop-blur-md">
        <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
          <div className="grid gap-3">
            <div className="text-xs uppercase tracking-[0.2em] text-white/70">
              {t("Фильтры", "Filtrlar")}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-xs uppercase tracking-[0.2em] text-white/70">
                {t("Статус", "Holat")}
                <select
                  className="rounded-2xl border border-white/30 bg-white/10 px-3 py-2 text-sm text-white outline-none"
                  value={filters.status}
                  onChange={(event) =>
                    setFilters((prev) => ({ ...prev, status: event.target.value }))
                  }
                >
                  <option value="all">{t("Все", "Barchasi")}</option>
                  <option value="pending">{t("В обработке", "Jarayonda")}</option>
                  <option value="sent">{t("Отправлен", "Yuborildi")}</option>
                  <option value="failed">{t("Ошибка", "Xato")}</option>
                </select>
              </label>
              <label className="grid gap-2 text-xs uppercase tracking-[0.2em] text-white/70">
                {t("Ресторан", "Restoran")}
                <select
                  className="rounded-2xl border border-white/30 bg-white/10 px-3 py-2 text-sm text-white outline-none"
                  value={filters.restaurantId}
                  onChange={(event) =>
                    setFilters((prev) => ({
                      ...prev,
                      restaurantId: event.target.value,
                    }))
                  }
                >
                  <option value="all">{t("Все", "Barchasi")}</option>
                  {restaurants.map((restaurant) => (
                    <option key={restaurant.id} value={String(restaurant.id)}>
                      {restaurant.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-xs uppercase tracking-[0.2em] text-white/70">
                {t("С даты", "Dan")}
                <input
                  type="date"
                  className="rounded-2xl border border-white/30 bg-white/10 px-3 py-2 text-sm text-white outline-none"
                  value={filters.from}
                  onChange={(event) =>
                    setFilters((prev) => ({ ...prev, from: event.target.value }))
                  }
                />
              </label>
              <label className="grid gap-2 text-xs uppercase tracking-[0.2em] text-white/70">
                {t("По дату", "Gacha")}
                <input
                  type="date"
                  className="rounded-2xl border border-white/30 bg-white/10 px-3 py-2 text-sm text-white outline-none"
                  value={filters.to}
                  onChange={(event) =>
                    setFilters((prev) => ({ ...prev, to: event.target.value }))
                  }
                />
              </label>
              <label className="grid gap-2 text-xs uppercase tracking-[0.2em] text-white/70 sm:col-span-2">
                {t("Поиск", "Qidiruv")}
                <input
                  type="text"
                  className="rounded-2xl border border-white/30 bg-white/10 px-3 py-2 text-sm text-white outline-none"
                  value={filters.q}
                  onChange={(event) =>
                    setFilters((prev) => ({ ...prev, q: event.target.value }))
                  }
                  placeholder={t("Имя, телефон, ресторан", "Ism, telefon, restoran")}
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setPage(1);
                  loadOrders(undefined, 1);
                }}
                className="rounded-2xl border border-white/30 bg-white/15 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white transition hover:border-white/60"
              >
                {t("Применить", "Qo'llash")}
              </button>
              <button
                type="button"
                onClick={() => {
                  const resetFilters = {
                    status: "all",
                    restaurantId: "all",
                    from: "",
                    to: "",
                    q: "",
                  };
                  setFilters(resetFilters);
                  setPage(1);
                  loadOrders(resetFilters, 1);
                }}
                className="rounded-2xl border border-white/30 bg-white/10 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/80 transition hover:border-white/60"
              >
                {t("Сбросить", "Tozalash")}
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-white/20 bg-white/5 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-white/70">
              {t("Статистика", "Statistika")}
            </div>
            <div className="mt-3 grid gap-3 text-sm">
              <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.2em] text-white/60">
                  {t("Всего", "Jami")}
                </div>
                <div className="mt-1 text-lg font-semibold">{orders.length}</div>
              </div>
              {selectedOrder && (
                <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.2em] text-white/60">
                    {t("Сумма заказа", "Buyurtma summasi")}
                  </div>
                  <div className="mt-1 text-lg font-semibold">
                    {formatSum(totalSelected)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_1.4fr]">
          <div className="grid gap-3">
            <div className="text-xs uppercase tracking-[0.2em] text-white/70">
              {t("Список заказов", "Buyurtmalar ro'yxati")}
            </div>
            <div className="max-h-[60vh] overflow-y-auto pr-2">
              {orders.map((order) => (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => setSelectedOrder(order)}
                  className={`mb-3 w-full rounded-2xl border px-4 py-3 text-left text-sm transition ${
                    selectedOrder?.id === order.id
                      ? "border-white/60 bg-white/15"
                      : "border-white/20 bg-white/10 hover:border-white/50 hover:bg-white/15"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold">
                      {order.clientName || order.clientPhone || t("Клиент", "Mijoz")}
                    </div>
                    <div
                      className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] ${statusTone(
                        order.status
                      )}`}
                    >
                      {statusLabel(order.status)}
                    </div>
                  </div>
                  <div className="text-xs text-white/70">{order.restaurantName}</div>
                  <div className="mt-1 text-xs text-white/70">
                    {formatDate(order.createdAt, locale)}
                  </div>
                </button>
              ))}
              {orders.length === 0 && !loading && (
                <div className="rounded-2xl border border-dashed border-white/30 bg-white/5 px-4 py-6 text-center text-xs text-white/60">
                  {t("Заказы не найдены.", "Buyurtmalar topilmadi.")}
                </div>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-white/70">
              <span>
                {t("Страница", "Sahifa")} {page} / {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const next = Math.max(page - 1, 1);
                    setPage(next);
                    loadOrders(undefined, next);
                  }}
                  className="rounded-full border border-white/30 bg-white/10 px-3 py-1 transition hover:border-white/60"
                  disabled={page <= 1}
                >
                  {t("Назад", "Orqaga")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = Math.min(page + 1, totalPages);
                    setPage(next);
                    loadOrders(undefined, next);
                  }}
                  className="rounded-full border border-white/30 bg-white/10 px-3 py-1 transition hover:border-white/60"
                  disabled={page >= totalPages}
                >
                  {t("Вперёд", "Oldinga")}
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/20 bg-white/5 p-5">
            <div className="text-xs uppercase tracking-[0.2em] text-white/70">
              {t("Карточка заказа", "Buyurtma kartasi")}
            </div>
            {!selectedOrder && (
              <div className="mt-6 rounded-2xl border border-dashed border-white/30 bg-white/5 px-4 py-6 text-center text-xs text-white/60">
                {t("Выберите заказ слева.", "Chapdan buyurtma tanlang.")}
              </div>
            )}
            {selectedOrder && (
              <div className="mt-4 grid gap-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold">
                      {selectedOrder.clientName || t("Клиент", "Mijoz")}
                    </div>
                    <div className="text-xs text-white/70">
                      {selectedOrder.clientPhone}
                    </div>
                  </div>
                  <div
                    className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.2em] ${statusTone(
                      selectedOrder.status
                    )}`}
                  >
                    {statusLabel(selectedOrder.status)}
                  </div>
                </div>
                {selectedOrder.status === "failed" && (
                  <button
                    type="button"
                    className="rounded-2xl border border-amber-200/40 bg-amber-300/10 px-4 py-2 text-xs uppercase tracking-[0.2em] text-amber-100 transition hover:border-amber-200/70"
                    onClick={() => handleRetry(selectedOrder.id)}
                  >
                    {t("Повторить отправку", "Qayta yuborish")}
                  </button>
                )}
                <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.2em] text-white/60">
                    {t("Ресторан", "Restoran")}
                  </div>
                  <div className="mt-1 text-base font-semibold">
                    {selectedOrder.restaurantName}
                  </div>
                  <div className="mt-1 text-xs text-white/70">
                    {formatDate(selectedOrder.createdAt, locale)}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.2em] text-white/60">
                    {t("Состав заказа", "Buyurtma tarkibi")}
                  </div>
                  <div className="mt-3 grid gap-2 text-sm">
                    {selectedOrder.items.map((item) => (
                      <div
                        key={`${selectedOrder.id}-${item.id}`}
                        className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
                      >
                        <div>
                          <div className="font-semibold">{item.name}</div>
                          <div className="text-xs text-white/60">
                            {t("Кол-во", "Soni")}: {item.qty}
                          </div>
                        </div>
                        <div className="text-right text-sm">
                          <div className="font-semibold">{formatSum(item.price)}</div>
                          <div className="text-xs text-white/60">
                            {formatSum(item.price * item.qty)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {(selectedOrder.deliveryPrice > 0 ||
                    selectedOrder.fees.length > 0) && (
                    <div className="mt-3 grid gap-2 border-t border-white/10 pt-3 text-sm">
                      {selectedOrder.deliveryPrice > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-white/70">
                            {t("Доставка", "Yetkazib berish")}
                          </span>
                          <span className="font-semibold">
                            {formatSum(selectedOrder.deliveryPrice)}
                          </span>
                        </div>
                      )}
                      {selectedOrder.fees.map((fee) => (
                        <div
                          key={`${selectedOrder.id}-${fee.title}`}
                          className="flex items-center justify-between"
                        >
                          <span className="text-white/70">{fee.title}</span>
                          <span className="font-semibold">
                            {formatSum(fee.price)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3 text-sm">
                    <span className="text-white/70">
                      {t("Итого", "Jami")}
                    </span>
                    <span className="text-lg font-semibold">
                      {formatSum(totalSelected)}
                    </span>
                  </div>
                </div>
                {selectedOrder.comment && (
                  <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.2em] text-white/60">
                      {t("Комментарий", "Izoh")}
                    </div>
                    <div className="mt-1 text-sm">{selectedOrder.comment}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
