"use client";

import { useEffect, useState } from "react";
import { useAdminLang } from "./use-admin-lang";

export default function SupportPhoneCard() {
  const { t } = useAdminLang();
  const [phone, setPhone] = useState("");
  const [messageRu, setMessageRu] = useState("");
  const [messageUz, setMessageUz] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  const loadPhone = async () => {
    const response = await fetch("/api/support-phone");
    if (!response.ok) return;
    const data = (await response.json()) as {
      phone?: string;
      messageRu?: string;
      messageUz?: string;
    };
    setPhone(data.phone ?? "");
    setMessageRu(data.messageRu ?? "");
    setMessageUz(data.messageUz ?? "");
  };

  useEffect(() => {
    loadPhone();
  }, []);

  const savePhone = async () => {
    setStatus("saving");
    const response = await fetch("/api/support-phone", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, messageRu, messageUz }),
    });
    if (response.ok) {
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 1200);
    } else {
      setStatus("idle");
    }
  };

  return (
    <section className="mt-6 px-6 pb-10">
      <div className="rounded-2xl border border-white/25 bg-white/10 p-4 text-white shadow-[0_12px_28px_rgba(0,0,0,0.28)] backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-white/70">
              {t("Техподдержка", "Texnik yordam")}
            </div>
            <div className="mt-2 text-sm text-white/60">
              {t(
                "Номер отображается в мобильном приложении.",
                "Raqam mobil ilovada ko'rsatiladi."
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={savePhone}
            className="rounded-full border border-white/30 bg-white/10 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-white/80 transition hover:border-white/60"
          >
            {status === "saving"
              ? t("Сохранение...", "Saqlanmoqda...")
              : status === "saved"
              ? t("Сохранено", "Saqlandi")
              : t("Сохранить", "Saqlash")}
          </button>
        </div>
        <div className="mt-3">
          <label className="grid gap-2 text-xs uppercase tracking-[0.2em] text-white/70">
            {t("Номер телефона", "Telefon raqami")}
            <input
              type="text"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="rounded-2xl border border-white/30 bg-white/10 px-3 py-2 text-sm text-white outline-none"
              placeholder="+998 90 123 45 67"
            />
          </label>
          <label className="mt-4 grid gap-2 text-xs uppercase tracking-[0.2em] text-white/70">
            {t("Имя сотрудника (RU)", "Xodim ismi (RU)")}
            <textarea
              value={messageRu}
              onChange={(event) => setMessageRu(event.target.value)}
              rows={3}
              className="rounded-2xl border border-white/30 bg-white/10 px-3 py-2 text-sm text-white outline-none"
              placeholder={t("Имя сотрудника для RU", "Xodim ismi RU")}
            />
          </label>
          <label className="mt-4 grid gap-2 text-xs uppercase tracking-[0.2em] text-white/70">
            {t("Имя сотрудника (UZ)", "Xodim ismi (UZ)")}
            <textarea
              value={messageUz}
              onChange={(event) => setMessageUz(event.target.value)}
              rows={3}
              className="rounded-2xl border border-white/30 bg-white/10 px-3 py-2 text-sm text-white outline-none"
              placeholder={t("Имя сотрудника для UZ", "Xodim ismi UZ")}
            />
          </label>
        </div>
      </div>
    </section>
  );
}
