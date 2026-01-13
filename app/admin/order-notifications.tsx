"use client";

import { useEffect, useRef, useState } from "react";
import { useAdminLang } from "./use-admin-lang";

type OrderItem = {
  id: number;
  name: string;
  qty: number;
  price: number;
};

type Order = {
  id: number;
  restaurantName: string;
  clientName: string;
  clientPhone: string;
  items: OrderItem[];
  comment: string;
  status: string;
  createdAt: string;
};

const STORAGE_KEY = "admin_last_seen_order_id";
const SOUND_KEY = "admin_orders_sound_enabled";
const DESKTOP_KEY = "admin_orders_desktop_enabled";

const formatTime = (value: string) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getItemCount = (items: OrderItem[]) =>
  items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);

const playBeep = () => {
  if (typeof window === "undefined") return;
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.value = 0.08;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.18);
    oscillator.onended = () => context.close();
  } catch {}
};

export default function OrderNotifications({ lang }: { lang?: "ru" | "uz" }) {
  const { t } = useAdminLang(lang ?? "ru");
  const [orders, setOrders] = useState<Order[]>([]);
  const [newCount, setNewCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [desktopEnabled, setDesktopEnabled] = useState(false);
  const prevCountRef = useRef(0);

  const refresh = async () => {
    const stored = Number(localStorage.getItem(STORAGE_KEY) ?? 0);
    const response = await fetch(
      `/api/admin/orders?limit=6&since=${stored}`
    );
    if (!response.ok) return;
    const data = (await response.json()) as {
      orders: Order[];
      latestId: number;
      unseenCount: number | null;
    };
    setOrders(data.orders);
    const latestId = data.latestId ?? 0;
    if (!stored && latestId) {
      localStorage.setItem(STORAGE_KEY, String(latestId));
      setNewCount(0);
      return;
    }
    const unseen = data.unseenCount ?? 0;
    setNewCount(unseen);
  };

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 15000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const storedSound = localStorage.getItem(SOUND_KEY) === "1";
    const storedDesktop = localStorage.getItem(DESKTOP_KEY) === "1";
    setSoundEnabled(storedSound);
    setDesktopEnabled(storedDesktop);
  }, []);

  useEffect(() => {
    if (newCount <= prevCountRef.current) {
      prevCountRef.current = newCount;
      return;
    }
    prevCountRef.current = newCount;
    if (soundEnabled) {
      playBeep();
    }
    if (
      desktopEnabled &&
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      const latest = orders[0];
      const title = t("Новый заказ", "Yangi buyurtma");
      const body = latest
        ? `${latest.clientName || latest.clientPhone || t("Клиент", "Mijoz")} • ${
            latest.restaurantName
          }`
        : t("Проверьте список заказов.", "Buyurtmalar ro'yxatini tekshiring.");
      try {
        new Notification(title, { body });
      } catch {}
    }
  }, [newCount, soundEnabled, desktopEnabled, orders, t]);

  const handleToggle = () => {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen) {
      const latestId = orders[0]?.id ?? 0;
      if (latestId) {
        localStorage.setItem(STORAGE_KEY, String(latestId));
      }
      setNewCount(0);
    }
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem(SOUND_KEY, next ? "1" : "0");
  };

  const toggleDesktop = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return;
    }
    if (Notification.permission !== "granted") {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setDesktopEnabled(false);
        localStorage.setItem(DESKTOP_KEY, "0");
        return;
      }
    }
    const next = !desktopEnabled;
    setDesktopEnabled(next);
    localStorage.setItem(DESKTOP_KEY, next ? "1" : "0");
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleToggle}
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-white/10 text-white transition hover:bg-white/20"
        aria-label={t("Заказы", "Buyurtmalar")}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 7 3 7H3s3 0 3-7" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {newCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#f7c948] px-1 text-xs font-semibold text-[#4c2a05]">
            {newCount > 9 ? "9+" : newCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-3 w-80 overflow-hidden rounded-2xl border border-white/20 bg-[#0b7a1f] shadow-[0_20px_40px_rgba(0,0,0,0.25)]">
          <div className="border-b border-white/20 px-4 py-3 text-sm font-semibold">
            {t("Новые заказы", "Yangi buyurtmalar")}
          </div>
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2 text-xs text-white/80">
            <button
              type="button"
              onClick={toggleSound}
              className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em] transition ${
                soundEnabled
                  ? "border-white bg-white/15 text-white"
                  : "border-white/30 text-white/70 hover:border-white/60"
              }`}
            >
              {t("Звук", "Ovoz")}
            </button>
            <button
              type="button"
              onClick={toggleDesktop}
              className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em] transition ${
                desktopEnabled
                  ? "border-white bg-white/15 text-white"
                  : "border-white/30 text-white/70 hover:border-white/60"
              }`}
            >
              {t("Уведомления", "Bildirishnoma")}
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {orders.length === 0 && (
              <div className="px-4 py-6 text-sm text-white/80">
                {t("Пока нет заказов.", "Hozircha buyurtmalar yo'q.")}
              </div>
            )}
            {orders.map((order) => {
              const itemsCount = getItemCount(order.items);
              const firstItem = order.items[0]?.name ?? "";
              return (
                <div
                  key={order.id}
                  className="border-b border-white/10 px-4 py-3 text-sm last:border-b-0"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold text-white">
                      {order.clientName || order.clientPhone || t("Клиент", "Mijoz")}
                    </div>
                    <div className="text-xs text-white/70">
                      {formatTime(order.createdAt)}
                    </div>
                  </div>
                  <div className="text-xs text-white/70">
                    {order.restaurantName}
                  </div>
                  <div className="mt-1 text-white/90">
                    {firstItem
                      ? `${firstItem}${itemsCount > 1 ? ` +${itemsCount - 1}` : ""}`
                      : t("Без товаров", "Mahsulotlarsiz")}
                  </div>
                  {order.comment && (
                    <div className="mt-1 text-xs text-white/70">
                      {order.comment}
                    </div>
                  )}
                  <div className="mt-1 text-xs text-white/70">
                    {order.status === "sent"
                      ? t("Отправлен в Poster", "Posterga yuborildi")
                      : order.status === "failed"
                      ? t("Ошибка Poster", "Poster xatosi")
                      : t("В обработке", "Yuborilmoqda")}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="border-t border-white/10 px-4 py-2 text-right text-xs">
            <a className="text-white/80 hover:text-white" href="/admin/orders">
              {t("Все заказы", "Barcha buyurtmalar")}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
