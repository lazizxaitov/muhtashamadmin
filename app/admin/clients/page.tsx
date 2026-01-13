"use client";

import { useEffect, useRef, useState } from "react";
import { useAdminLang } from "../use-admin-lang";

type Client = {
  id: number;
  name: string;
  phone: string;
  ordersCount: number;
  lastOrderAt: string;
  createdAt: string;
};

type Address = {
  id: number;
  title: string;
  address: string;
  createdAt: string;
};

type Restaurant = {
  id: number;
  name: string;
  integrationType?: string;
};

type SortKey = "name" | "date" | "orders";

export default function ClientsPage() {
  const { lang, t } = useAdminLang();
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<
    number | null
  >(null);
  const [bonusBalance, setBonusBalance] = useState<number | null>(null);
  const [bonusDelta, setBonusDelta] = useState("");
  const [bonusStatus, setBonusStatus] = useState<
    "idle" | "loading" | "ok" | "error"
  >("idle");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "details" | "addresses" | "password"
  >("details");
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressesLoading, setAddressesLoading] = useState(false);
  const [passwordValue, setPasswordValue] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<
    "idle" | "saving" | "ok" | "error"
  >("idle");
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const loadClients = async () => {
      const response = await fetch("/api/clients");
      if (!response.ok) return;
      const data = (await response.json()) as Client[];
      setClients(data);
    };
    loadClients();
  }, []);

  useEffect(() => {
    const loadRestaurants = async () => {
      const response = await fetch("/api/restaurants");
      if (!response.ok) return;
      const data = (await response.json()) as Restaurant[];
      setRestaurants(data);
      const firstPoster =
        data.find((restaurant) => restaurant.integrationType !== "1c") ?? null;
      if (firstPoster) {
        setSelectedRestaurantId(firstPoster.id);
      }
    };
    loadRestaurants();
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const loadAddresses = async (clientId: number) => {
    setAddressesLoading(true);
    const response = await fetch(`/api/clients/${clientId}/addresses`);
    if (response.ok) {
      const data = (await response.json()) as Address[];
      setAddresses(data);
    }
    setAddressesLoading(false);
  };

  const loadBonus = async (clientId: number, restaurantId: number) => {
    setBonusStatus("loading");
    const response = await fetch(
      `/api/admin/clients/${clientId}/bonus?restaurantId=${restaurantId}`
    );
    if (!response.ok) {
      setBonusStatus("error");
      return;
    }
    const data = (await response.json()) as { ok: boolean; bonus?: number };
    if (data.ok) {
      setBonusBalance(typeof data.bonus === "number" ? data.bonus : 0);
      setBonusStatus("ok");
    } else {
      setBonusStatus("error");
    }
  };

  const handleApplyBonus = async () => {
    if (!selectedClient || !selectedRestaurantId) return;
    const delta = Number(bonusDelta);
    if (!Number.isFinite(delta) || delta === 0) {
      setBonusStatus("error");
      return;
    }
    setBonusStatus("loading");
    const response = await fetch(
      `/api/admin/clients/${selectedClient.id}/bonus`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantId: selectedRestaurantId,
          count: delta,
        }),
      }
    );
    if (!response.ok) {
      setBonusStatus("error");
      return;
    }
    const data = (await response.json()) as { ok: boolean; bonus?: number };
    if (data.ok) {
      setBonusBalance(typeof data.bonus === "number" ? data.bonus : 0);
      setBonusDelta("");
      setBonusStatus("ok");
    } else {
      setBonusStatus("error");
    }
  };

  const handleOpenClient = (client: Client) => {
    setSelectedClient(client);
    setActiveTab("details");
    setAddresses([]);
    setPasswordValue("");
    setPasswordStatus("idle");
    setBonusBalance(null);
    setBonusDelta("");
    setBonusStatus("idle");
  };

  const handleClose = () => {
    setSelectedClient(null);
    setActiveTab("details");
    setAddresses([]);
    setPasswordValue("");
    setPasswordStatus("idle");
  };

  const handleShowAddresses = () => {
    if (!selectedClient) return;
    setActiveTab("addresses");
    if (addresses.length === 0) {
      loadAddresses(selectedClient.id);
    }
  };

  const handleChangePassword = async () => {
    if (!selectedClient) return;
    if (!passwordValue.trim()) {
      setPasswordStatus("error");
      return;
    }
    setPasswordStatus("saving");
    const response = await fetch(`/api/clients/${selectedClient.id}/password`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: passwordValue }),
    });
    if (!response.ok) {
      setPasswordStatus("error");
      return;
    }
    setPasswordStatus("ok");
    setPasswordValue("");
  };

  const formatDate = (value: string) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString(lang === "uz" ? "uz-UZ" : "ru-RU");
  };

  const formatNumber = (value: number) =>
    Number.isFinite(value) ? value.toLocaleString(lang === "uz" ? "uz-UZ" : "ru-RU") : "0";

  const sortedClients = [...clients].sort((a, b) => {
    if (sortKey === "name") {
      return a.name.localeCompare(b.name, lang === "uz" ? "uz" : "ru");
    }
    if (sortKey === "orders") {
      return b.ordersCount - a.ordersCount;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <section className="mt-10">
      <div className="mb-6 flex items-center justify-between px-2">
        <div className="ml-10 text-xs uppercase tracking-[0.2em] text-white/70">
          {t("Клиенты", "Mijozlar")}
        </div>
        <div className="mr-4 flex items-center gap-2 text-xs text-white/70">
          <span>{t("Сортировка", "Saralash")}</span>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              className="inline-flex min-w-[220px] items-center justify-between gap-3 rounded-lg border border-white/30 bg-white/90 px-4 py-2 text-xs text-[#1c2b22] shadow-[0_8px_20px_rgba(0,0,0,0.18)]"
            >
              <span>
                {sortKey === "name" && t("Имя", "Ism")}
                {sortKey === "date" &&
                  t("Дата регистрации", "Ro'yxatdan o'tgan sana")}
                {sortKey === "orders" && t("Кол. заказов", "Buyurtmalar soni")}
              </span>
              <span className="text-[#1c2b22]/70">
                <svg
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                  className="h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 8l5 5 5-5" />
                </svg>
              </span>
            </button>
            {menuOpen && (
              <div className="absolute right-0 z-10 mt-2 w-56 rounded-xl border border-white/40 bg-white/95 p-2 text-xs text-[#1c2b22] shadow-[0_14px_30px_rgba(0,0,0,0.2)]">
                {[
                  { value: "name", label: t("Имя", "Ism") },
                  {
                    value: "date",
                    label: t("Дата регистрации", "Ro'yxatdan o'tgan sana"),
                  },
                  {
                    value: "orders",
                    label: t("Кол. заказов", "Buyurtmalar soni"),
                  },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setSortKey(option.value as SortKey);
                      setMenuOpen(false);
                    }}
                    className={`w-full rounded-lg px-3 py-2 text-left transition ${
                      sortKey === option.value
                        ? "bg-[#1c2b22]/10 text-[#1c2b22]"
                        : "hover:bg-[#1c2b22]/5"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="rounded-3xl border border-white/30 bg-white/10 p-6 text-white shadow-[0_20px_50px_rgba(0,0,0,0.35)] backdrop-blur-md">
        <div className="text-xs uppercase tracking-[0.2em] text-white/70">
          {t("Список клиентов", "Mijozlar ro'yxati")}
        </div>
        <div className="mt-4 grid gap-3">
          {sortedClients.map((client) => (
            <div
              key={client.id}
              className="flex cursor-pointer flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm transition hover:border-white/50 hover:bg-white/15"
              onClick={() => handleOpenClient(client)}
            >
              <div>
                <div className="font-semibold">{client.name}</div>
                <div className="text-xs text-white/70">{client.phone}</div>
              </div>
              <div className="flex items-center gap-6 text-xs text-white/70">
                <span>
                  {t("Заказы", "Buyurtmalar")}: {client.ordersCount}
                </span>
                <span>
                  {t("Последний заказ", "Oxirgi buyurtma")}: {" "}
                  {client.lastOrderAt || "—"}
                </span>
              </div>
            </div>
          ))}
          {clients.length === 0 && (
            <div className="rounded-2xl border border-dashed border-white/30 bg-white/5 px-4 py-6 text-center text-xs text-white/60">
              {t(
                "Клиенты пока не зарегистрированы.",
                "Mijozlar hali ro'yxatdan o'tmagan."
              )}
            </div>
          )}
        </div>
      </div>
      {selectedClient && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 px-4"
          onClick={handleClose}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-3xl border border-white/30 bg-white/10 text-white shadow-[0_20px_50px_rgba(0,0,0,0.35)] backdrop-blur-md"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div>
                <div className="text-lg font-semibold">{selectedClient.name}</div>
                <div className="text-xs text-white/70">
                  {selectedClient.phone}
                </div>
              </div>
              <button
                type="button"
                className="rounded-full border border-white/40 px-3 py-1 text-xs uppercase tracking-[0.18em] text-white/80 transition hover:border-white/70 hover:text-white"
                onClick={handleClose}
              >
                {t("Закрыть", "Yopish")}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-6 py-3 text-xs uppercase tracking-[0.2em] text-white/60">
              <button
                type="button"
                className={`rounded-full border px-4 py-2 transition ${
                  activeTab === "details"
                    ? "border-white bg-white/20 text-white"
                    : "border-white/30 text-white/60 hover:border-white/60 hover:text-white"
                }`}
                onClick={() => setActiveTab("details")}
              >
                {t("Подробнее", "Batafsil")}
              </button>
              <button
                type="button"
                className={`rounded-full border px-4 py-2 transition ${
                  activeTab === "addresses"
                    ? "border-white bg-white/20 text-white"
                    : "border-white/30 text-white/60 hover:border-white/60 hover:text-white"
                }`}
                onClick={handleShowAddresses}
              >
                {t("Адреса", "Manzillar")}
              </button>
              <button
                type="button"
                className={`rounded-full border px-4 py-2 transition ${
                  activeTab === "password"
                    ? "border-white bg-white/20 text-white"
                    : "border-white/30 text-white/60 hover:border-white/60 hover:text-white"
                }`}
                onClick={() => setActiveTab("password")}
              >
                {t("Изменить пароль", "Parolni o'zgartirish")}
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto px-6 py-5 text-sm">
              {activeTab === "details" && (
                <div className="grid gap-3 text-sm">
                  <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.2em] text-white/60">
                      {t("Имя", "Ism")}
                    </div>
                    <div className="mt-1 text-base font-semibold">
                      {selectedClient.name}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.2em] text-white/60">
                      {t("Номер телефона", "Telefon raqami")}
                    </div>
                    <div className="mt-1 text-base font-semibold">
                      {selectedClient.phone}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.2em] text-white/60">
                      {t("Дата регистрации", "Ro'yxatdan o'tgan sana")}
                    </div>
                    <div className="mt-1 text-base font-semibold">
                      {formatDate(selectedClient.createdAt)}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.2em] text-white/60">
                      {t("Количество заказов", "Buyurtmalar soni")}
                    </div>
                    <div className="mt-1 text-base font-semibold">
                      {selectedClient.ordersCount}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.2em] text-white/60">
                      {t("Бонусы", "Bonuslar")}
                    </div>
                    <div className="mt-3 grid gap-3">
                      <label className="grid gap-2 text-xs uppercase tracking-[0.2em] text-white/70">
                        {t("Заведение", "Muassasa")}
                        <select
                          className="rounded-2xl border border-white/30 bg-white/10 px-3 py-2 text-sm text-white outline-none"
                          value={selectedRestaurantId ?? ""}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            setSelectedRestaurantId(
                              Number.isFinite(value) ? value : null
                            );
                          }}
                        >
                          <option value="">
                            {t("Выберите", "Tanlang")}
                          </option>
                          {restaurants.map((restaurant) => (
                            <option key={restaurant.id} value={restaurant.id}>
                              {restaurant.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="rounded-2xl border border-white/30 bg-white/15 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white transition hover:border-white/60"
                          onClick={() => {
                            if (!selectedRestaurantId) return;
                            loadBonus(selectedClient.id, selectedRestaurantId);
                          }}
                          disabled={!selectedRestaurantId || bonusStatus === "loading"}
                        >
                          {bonusStatus === "loading"
                            ? t("Загрузка...", "Yuklanmoqda...")
                            : t("Обновить", "Yangilash")}
                        </button>
                        <div className="text-sm text-white/80">
                          {bonusBalance === null
                            ? t("Нет данных", "Ma'lumot yo'q")
                            : formatNumber(bonusBalance)}
                        </div>
                      </div>
                      <div className="grid gap-2 text-xs uppercase tracking-[0.2em] text-white/70">
                        {t("Изменить бонусы", "Bonusni o'zgartirish")}
                        <div className="flex flex-wrap gap-2">
                          <input
                            type="number"
                            className="w-40 rounded-2xl border border-white/30 bg-white/10 px-4 py-2 text-sm text-white outline-none"
                            value={bonusDelta}
                            onChange={(event) => {
                              setBonusDelta(event.target.value);
                              setBonusStatus("idle");
                            }}
                            placeholder={t("+10 или -10", "+10 yoki -10")}
                          />
                          <button
                            type="button"
                            className="rounded-2xl border border-white/30 bg-white/15 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white transition hover:border-white/60"
                            onClick={handleApplyBonus}
                            disabled={!selectedRestaurantId || bonusStatus === "loading"}
                          >
                            {bonusStatus === "loading"
                              ? t("Сохранение...", "Saqlanmoqda...")
                              : t("Применить", "Qo'llash")}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {activeTab === "addresses" && (
                <div className="grid gap-3 text-sm">
                  {addressesLoading && (
                    <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-4 text-center text-xs text-white/70">
                      {t("Загрузка...", "Yuklanmoqda...")}
                    </div>
                  )}
                  {!addressesLoading && addresses.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-white/30 bg-white/5 px-4 py-6 text-center text-xs text-white/60">
                      {t(
                        "Адреса пока не добавлены.",
                        "Manzillar hali qo'shilmagan."
                      )}
                    </div>
                  )}
                  {!addressesLoading &&
                    addresses.map((address) => (
                      <div
                        key={address.id}
                        className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3"
                      >
                        <div className="text-xs uppercase tracking-[0.2em] text-white/60">
                          {address.title || t("Адрес", "Manzil")}
                        </div>
                        <div className="mt-1 text-sm">{address.address}</div>
                        <div className="mt-2 text-xs text-white/50">
                          {formatDate(address.createdAt)}
                        </div>
                      </div>
                    ))}
                </div>
              )}
              {activeTab === "password" && (
                <div className="grid gap-3 text-sm">
                  <label className="grid gap-2 text-xs uppercase tracking-[0.2em] text-white/70">
                    {t("Новый пароль", "Yangi parol")}
                    <input
                      type="password"
                      className="w-full rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-sm text-white outline-none transition focus:border-white/70"
                      value={passwordValue}
                      onChange={(event) => {
                        setPasswordValue(event.target.value);
                        setPasswordStatus("idle");
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="rounded-2xl border border-white/30 bg-white/15 px-4 py-3 text-xs uppercase tracking-[0.2em] text-white transition hover:border-white/60"
                    onClick={handleChangePassword}
                    disabled={passwordStatus === "saving"}
                  >
                    {passwordStatus === "saving"
                      ? t("Сохранение...", "Saqlanmoqda...")
                      : t("Сохранить пароль", "Parolni saqlash")}
                  </button>
                  {passwordStatus === "ok" && (
                    <div className="rounded-2xl border border-emerald-200/40 bg-emerald-400/10 px-4 py-3 text-xs uppercase tracking-[0.2em] text-emerald-100">
                      {t("Пароль обновлен", "Parol yangilandi")}
                    </div>
                  )}
                  {passwordStatus === "error" && (
                    <div className="rounded-2xl border border-red-200/40 bg-red-400/10 px-4 py-3 text-xs uppercase tracking-[0.2em] text-red-100">
                      {t(
                        "Не удалось сохранить пароль",
                        "Parolni saqlab bo'lmadi"
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
