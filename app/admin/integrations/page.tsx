"use client";

import { useEffect, useMemo, useState } from "react";
import { useAdminLang } from "../use-admin-lang";

type RestaurantListItem = { id: number; name: string };

type TelegramRestaurantConfig = {
  restaurantId: number;
  chatId: string;
  enabled: boolean;
};

type TelegramConfigResponse = {
  ok?: boolean;
  token?: string;
  hasToken?: boolean;
  restaurants?: TelegramRestaurantConfig[];
};

type PlumConfigResponse = {
  ok?: boolean;
  baseUrl?: string;
  login?: string;
  password?: string;
};

export default function IntegrationsPage() {
  const { t } = useAdminLang();

  const [plumBaseUrl, setPlumBaseUrl] = useState("");
  const [plumLogin, setPlumLogin] = useState("");
  const [plumPassword, setPlumPassword] = useState("");
  const [plumStatus, setPlumStatus] = useState<"idle" | "saving" | "saved">(
    "idle"
  );

  const [telegramTokenPreview, setTelegramTokenPreview] = useState("");
  const [telegramTokenInput, setTelegramTokenInput] = useState("");
  const [telegramStatus, setTelegramStatus] = useState<
    "idle" | "saving" | "saved"
  >("idle");

  const [restaurants, setRestaurants] = useState<RestaurantListItem[]>([]);
  const [telegramByRestaurantId, setTelegramByRestaurantId] = useState<
    Record<number, { chatId: string; enabled: boolean }>
  >({});
  const [rowStatus, setRowStatus] = useState<
    Record<number, "idle" | "saving" | "saved" | "error">
  >({});

  const restaurantIds = useMemo(() => restaurants.map((r) => r.id), [restaurants]);

  const loadAll = async () => {
    const [plumResponse, telegramResponse, restaurantsResponse] =
      await Promise.all([
        fetch("/api/integrations/plum"),
        fetch("/api/integrations/telegram"),
        fetch("/api/restaurants"),
      ]);

    if (plumResponse.ok) {
      const data = (await plumResponse.json()) as PlumConfigResponse;
      setPlumBaseUrl(data.baseUrl ?? "");
      setPlumLogin(data.login ?? "");
      setPlumPassword(data.password ?? "");
    }

    if (telegramResponse.ok) {
      const data = (await telegramResponse.json()) as TelegramConfigResponse;
      setTelegramTokenPreview(data.token ?? "");
      const next: Record<number, { chatId: string; enabled: boolean }> = {};
      for (const row of data.restaurants ?? []) {
        next[row.restaurantId] = {
          chatId: row.chatId ?? "",
          enabled: Boolean(row.enabled),
        };
      }
      setTelegramByRestaurantId(next);
    }

    if (restaurantsResponse.ok) {
      const data = (await restaurantsResponse.json()) as Array<{
        id: number;
        name?: string;
      }>;
      setRestaurants(
        (Array.isArray(data) ? data : []).map((row) => ({
          id: Number(row.id),
          name: String(row.name ?? ""),
        }))
      );
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    setTelegramByRestaurantId((prev) => {
      const next = { ...prev };
      for (const restaurantId of restaurantIds) {
        if (!next[restaurantId]) next[restaurantId] = { chatId: "", enabled: false };
      }
      return next;
    });
  }, [restaurantIds]);

  const savePlum = async () => {
    setPlumStatus("saving");
    const response = await fetch("/api/integrations/plum", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseUrl: plumBaseUrl,
        login: plumLogin,
        password: plumPassword,
      }),
    });
    if (response.ok) {
      setPlumStatus("saved");
      setTimeout(() => setPlumStatus("idle"), 1200);
      return;
    }
    setPlumStatus("idle");
  };

  const saveTelegramToken = async () => {
    setTelegramStatus("saving");
    const response = await fetch("/api/integrations/telegram", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: telegramTokenInput }),
    });
    if (response.ok) {
      setTelegramStatus("saved");
      setTelegramTokenInput("");
      await loadAll();
      setTimeout(() => setTelegramStatus("idle"), 1200);
      return;
    }
    setTelegramStatus("idle");
  };

  const updateTelegramRow = (
    restaurantId: number,
    patch: Partial<{ chatId: string; enabled: boolean }>
  ) => {
    setTelegramByRestaurantId((prev) => {
      const next = { ...prev };
      const current = next[restaurantId] ?? { chatId: "", enabled: false };
      next[restaurantId] = { ...current, ...patch };
      return next;
    });
  };

  const saveTelegramRestaurant = async (restaurantId: number) => {
    const row = telegramByRestaurantId[restaurantId] ?? { chatId: "", enabled: false };
    setRowStatus((prev) => ({ ...prev, [restaurantId]: "saving" }));
    const response = await fetch("/api/integrations/telegram", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurantId,
        chatId: row.chatId,
        enabled: row.enabled,
      }),
    });
    if (response.ok) {
      setRowStatus((prev) => ({ ...prev, [restaurantId]: "saved" }));
      await loadAll();
      setTimeout(
        () => setRowStatus((prev) => ({ ...prev, [restaurantId]: "idle" })),
        1200
      );
      return;
    }
    setRowStatus((prev) => ({ ...prev, [restaurantId]: "error" }));
    setTimeout(
      () => setRowStatus((prev) => ({ ...prev, [restaurantId]: "idle" })),
      1500
    );
  };

  const sendTelegramTest = async (restaurantId: number) => {
    setRowStatus((prev) => ({ ...prev, [restaurantId]: "saving" }));
    const response = await fetch("/api/integrations/telegram/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId }),
    });
    if (response.ok) {
      setRowStatus((prev) => ({ ...prev, [restaurantId]: "saved" }));
      setTimeout(
        () => setRowStatus((prev) => ({ ...prev, [restaurantId]: "idle" })),
        1200
      );
      return;
    }
    setRowStatus((prev) => ({ ...prev, [restaurantId]: "error" }));
    setTimeout(
      () => setRowStatus((prev) => ({ ...prev, [restaurantId]: "idle" })),
      1500
    );
  };

  return (
    <section className="mt-10 px-6 pb-12 text-white">
      <div className="mb-6 text-xs uppercase tracking-[0.2em] text-white/70">
        {t("Интеграции", "Integratsiyalar")}
      </div>

      <div className="max-w-4xl rounded-3xl border border-white/30 bg-white/10 p-6 shadow-[0_20px_50px_rgba(0,0,0,0.35)] backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-lg font-semibold">PLUM</div>
            <div className="mt-1 text-sm text-white/60">
              {t(
                "Платёжный шлюз для оплаты картой.",
                "Karta orqali to'lov uchun shlyuz."
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={savePlum}
            className="rounded-full border border-white/30 bg-white/10 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/80 transition hover:border-white/60"
          >
            {plumStatus === "saving"
              ? t("Сохранение...", "Saqlanmoqda...")
              : plumStatus === "saved"
              ? t("Сохранено", "Saqlandi")
              : t("Сохранить", "Saqlash")}
          </button>
        </div>

        <div className="mt-5 grid gap-4 text-sm">
          <label className="grid gap-2 text-xs uppercase tracking-[0.2em] text-white/70">
            Base URL
            <input
              type="text"
              value={plumBaseUrl}
              onChange={(event) => setPlumBaseUrl(event.target.value)}
              className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-sm text-white outline-none"
              placeholder="https://example.com"
            />
          </label>
          <label className="grid gap-2 text-xs uppercase tracking-[0.2em] text-white/70">
            {t("Логин", "Login")}
            <input
              type="text"
              value={plumLogin}
              onChange={(event) => setPlumLogin(event.target.value)}
              className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-sm text-white outline-none"
            />
          </label>
          <label className="grid gap-2 text-xs uppercase tracking-[0.2em] text-white/70">
            {t("Пароль", "Parol")}
            <input
              type="password"
              value={plumPassword}
              onChange={(event) => setPlumPassword(event.target.value)}
              className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-sm text-white outline-none"
            />
          </label>
        </div>
      </div>

      <div className="mt-8 max-w-4xl rounded-3xl border border-white/30 bg-white/10 p-6 shadow-[0_20px_50px_rgba(0,0,0,0.35)] backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-lg font-semibold">Telegram</div>
            <div className="mt-1 text-sm text-white/60">
              {t(
                "Отправка новых заказов в группу Telegram по заведению.",
                "Yangi buyurtmalarni muassasa bo'yicha Telegram guruhiga yuborish."
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={saveTelegramToken}
            className="rounded-full border border-white/30 bg-white/10 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/80 transition hover:border-white/60"
          >
            {telegramStatus === "saving"
              ? t("Сохранение...", "Saqlanmoqda...")
              : telegramStatus === "saved"
              ? t("Сохранено", "Saqlandi")
              : t("Сохранить токен", "Tokenni saqlash")}
          </button>
        </div>

        <div className="mt-5 grid gap-4 text-sm">
          <label className="grid gap-2 text-xs uppercase tracking-[0.2em] text-white/70">
            {t("Токен бота", "Bot tokeni")}
            <input
              type="password"
              value={telegramTokenInput}
              onChange={(event) => setTelegramTokenInput(event.target.value)}
              className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-sm text-white outline-none"
              placeholder={
                telegramTokenPreview
                  ? t(
                      `Сейчас: ${telegramTokenPreview}`,
                      `Hozir: ${telegramTokenPreview}`
                    )
                  : t("Токен не задан", "Token berilmagan")
              }
            />
            <div className="text-xs normal-case tracking-normal text-white/55">
              {t(
                "Токен хранится только на сервере и не возвращается в API для мобильного приложения.",
                "Token faqat serverda saqlanadi va mobil API javoblarida qaytarilmaydi."
              )}
            </div>
          </label>
        </div>

        <div className="mt-6">
          <div className="text-xs uppercase tracking-[0.2em] text-white/70">
            {t("Группы по заведениям", "Muassasalar bo'yicha guruhlar")}
          </div>
          <div className="mt-3 max-h-[360px] overflow-auto rounded-2xl border border-white/20 bg-white/5 p-3">
            <div className="grid gap-3">
              {restaurants.map((restaurant) => {
                const row = telegramByRestaurantId[restaurant.id] ?? {
                  chatId: "",
                  enabled: false,
                };
                const st = rowStatus[restaurant.id] ?? "idle";
                const canEnable = Boolean(row.chatId.trim());
                const enabled = row.enabled && canEnable;

                return (
                  <div
                    key={restaurant.id}
                    className="flex flex-col gap-3 rounded-2xl border border-white/20 bg-white/10 p-4 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="font-semibold">
                        {restaurant.name || `#${restaurant.id}`}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => sendTelegramTest(restaurant.id)}
                          className="rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-xs text-white/85 transition hover:border-white/50 disabled:opacity-50"
                          disabled={!enabled}
                          title={
                            enabled
                              ? t("Отправить тест", "Test yuborish")
                              : t(
                                  "Сначала укажите chat_id и включите",
                                  "Avval chat_id kiriting va yoqing"
                                )
                          }
                        >
                          {t("Тест", "Test")}
                        </button>
                        <button
                          type="button"
                          onClick={() => saveTelegramRestaurant(restaurant.id)}
                          className="rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-xs text-white/85 transition hover:border-white/50"
                        >
                          {st === "saving"
                            ? t("Сохранение...", "Saqlanmoqda...")
                            : st === "saved"
                            ? t("Сохранено", "Saqlandi")
                            : st === "error"
                            ? t("Ошибка", "Xato")
                            : t("Сохранить", "Saqlash")}
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                      <label className="grid gap-2 text-xs uppercase tracking-[0.2em] text-white/70">
                        {t("Chat ID / ссылка группы", "Chat ID / guruh havolasi")}
                        <input
                          type="text"
                          value={row.chatId}
                          onChange={(event) =>
                            updateTelegramRow(restaurant.id, {
                              chatId: event.target.value,
                            })
                          }
                          className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-sm text-white outline-none"
                          placeholder={t(
                            "-1001234567890 или @groupname или https://t.me/groupname",
                            "-1001234567890 yoki @groupname yoki https://t.me/groupname"
                          )}
                        />
                      </label>

                      <label className="flex items-center gap-3 rounded-2xl border border-white/20 bg-white/5 px-4 py-3 text-xs uppercase tracking-[0.2em] text-white/70">
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={(event) =>
                            updateTelegramRow(restaurant.id, {
                              enabled: event.target.checked,
                            })
                          }
                          disabled={!canEnable}
                        />
                        {t("Включено", "Yoqilgan")}
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-2 text-xs text-white/55">
            {t(
              "Для приватных групп Telegram обычно нужен числовой chat_id (например -100...).",
              "Yopiq guruhlar uchun odatda raqamli chat_id kerak bo'ladi (masalan -100...)."
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

