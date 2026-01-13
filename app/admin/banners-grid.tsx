"use client";

import Cropper, { Area } from "react-easy-crop";
import { useEffect, useMemo, useState } from "react";
import { useAdminLang } from "./use-admin-lang";

type Banner = {
  id: number;
  title: string;
  image: string;
  status: string;
  open: boolean;
  addedAt: string;
  sortOrder?: number;
};

type Newsletter = {
  id: number;
  title: string;
  message: string;
  image?: string;
  channel: string;
  status: string;
  createdAt: string;
  deliveredAt?: string;
  error?: string;
};

export default function BannersGrid() {
  const { t } = useAdminLang();
  const formatStatus = (status: string) => {
    if (status === "Активен") return t("Активен", "Faol");
    if (status === "Неактивен") return t("Неактивен", "Nofaol");
    return status;
  };
  const bannerAspect = 328 / 140;
  const [banners, setBanners] = useState<Banner[]>([]);
  const [newsletters, setNewsletters] = useState<Newsletter[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [addImage, setAddImage] = useState("/logo_green.png");
  const [dragId, setDragId] = useState<number | null>(null);
  const [previewBanner, setPreviewBanner] = useState<Banner | null>(null);
  const [newsletterOpen, setNewsletterOpen] = useState(false);
  const [newsletterTitle, setNewsletterTitle] = useState("");
  const [newsletterMessage, setNewsletterMessage] = useState("");
  const [newsletterImage, setNewsletterImage] = useState("");
  const [newsletterChannel, setNewsletterChannel] = useState("splash");
  const [cropOpen, setCropOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState("");
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [cropAreaPixels, setCropAreaPixels] = useState<Area | null>(null);

  const fetchBanners = async () => {
    const response = await fetch("/api/banners");
    if (!response.ok) return;
    const data = (await response.json()) as Banner[];
    setBanners(data);
  };

  const fetchNewsletters = async () => {
    const response = await fetch("/api/newsletters");
    if (!response.ok) return;
    const data = (await response.json()) as Newsletter[];
    setNewsletters(data);
  };

  useEffect(() => {
    let cancelled = false;
    const loadInitialData = async () => {
      const bannersResponse = await fetch("/api/banners");
      if (cancelled) return;
      if (bannersResponse.ok) {
        const data = (await bannersResponse.json()) as Banner[];
        if (!cancelled) {
          setBanners(data);
        }
      }

      const newslettersResponse = await fetch("/api/newsletters");
      if (cancelled) return;
      if (newslettersResponse.ok) {
        const data = (await newslettersResponse.json()) as Newsletter[];
        if (!cancelled) {
          setNewsletters(data);
        }
      }
    };
    void loadInitialData();
    return () => {
      cancelled = true;
    };
  }, []);

  const items = useMemo(() => banners, [banners]);

  const handleReorder = async (next: Banner[]) => {
    setBanners(next);
    await fetch("/api/banners/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: next.map((item) => item.id) }),
    });
  };

  const uploadImage = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch("/api/uploads", {
      method: "POST",
      body: formData,
    });
    if (!response.ok) return "";
    const data = (await response.json()) as { url: string };
    return data.url;
  };

  const createImage = (url: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      if (typeof window === "undefined") {
        reject(new Error("window is undefined"));
        return;
      }
      const image = new window.Image();
      image.addEventListener("load", () => resolve(image));
      image.addEventListener("error", (error) => reject(error));
      image.src = url;
    });

  const getCroppedBlob = async (imageSrc: string, cropArea: Area) => {
    const image = await createImage(imageSrc);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    canvas.width = cropArea.width;
    canvas.height = cropArea.height;
    ctx.drawImage(
      image,
      cropArea.x,
      cropArea.y,
      cropArea.width,
      cropArea.height,
      0,
      0,
      cropArea.width,
      cropArea.height
    );
    return new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.92);
    });
  };

  return (
    <section className="mt-12">
      <div className="grid gap-6 lg:grid-cols-2">
        <article className="overflow-hidden rounded-3xl border border-white/40 bg-white/15 shadow-[0_20px_40px_rgba(0,0,0,0.2)] backdrop-blur">
          <div className="flex items-center justify-between border-b border-white/20 px-6 py-4 text-white">
            <h3 className="text-lg font-semibold">
              {t("Баннеры", "Bannerlar")}
            </h3>
            <div className="flex items-center gap-3">
              <span className="text-xs text-white/70">
                {items.length} {t("шт.", "dona")}
              </span>
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs text-white transition hover:bg-white/20"
              >
                {t("Добавить", "Qo'shish")}
              </button>
            </div>
          </div>
          <div className="custom-scroll grid max-h-[220px] gap-4 overflow-y-auto px-6 py-5 pr-4">
            {items.map((banner) => (
              <div
                key={banner.id}
                className={`relative flex items-center gap-4 rounded-2xl border border-white/20 bg-white/10 p-3 transition-transform duration-200 ${
                  banner.open ? "" : "opacity-70"
                } ${dragId === banner.id ? "opacity-60 scale-[0.98]" : ""}`}
                draggable
                onDragStart={() => setDragId(banner.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (dragId === null || dragId === banner.id) return;
                  const next = [...items];
                  const fromIndex = next.findIndex((item) => item.id === dragId);
                  const toIndex = next.findIndex((item) => item.id === banner.id);
                  const [moved] = next.splice(fromIndex, 1);
                  next.splice(toIndex, 0, moved);
                  setDragId(null);
                  handleReorder(next);
                }}
                onDragEnd={() => setDragId(null)}
                onClick={() => setPreviewBanner(banner)}
              >
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="cursor-grab rounded-full border border-white/30 bg-white/10 p-2 text-white/70"
                    title={t("Изменить порядок", "Tartibni o'zgartirish")}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      className="h-3.5 w-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M4 7h16" />
                      <path d="M4 12h16" />
                      <path d="M4 17h16" />
                    </svg>
                  </button>
                  <div className="relative h-16 w-24 overflow-hidden rounded-xl bg-white/80">
                    <img
                      src={banner.image}
                      alt={banner.title}
                      width={160}
                      height={90}
                      className="h-full w-full object-cover"
                    />
                  </div>
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">
                    {banner.title}
                  </div>
                  <div className="text-xs text-white/70">
                    {banner.addedAt}
                  </div>
                </div>
                <span
                  className={`absolute right-3 top-3 inline-flex rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.2em] ${
                    banner.open
                      ? "border-white bg-[#1e7d32]/20 text-[#dff6e6]"
                      : "border-[#f0b3b3] bg-[#f0b3b3]/20 text-[#ffe9e9]"
                  }`}
                >
                  {formatStatus(banner.status)}
                </span>
                <button
                  type="button"
                  onClick={async (event) => {
                    event.stopPropagation();
                    await fetch(`/api/banners/${banner.id}`, {
                      method: "DELETE",
                    });
                    fetchBanners();
                  }}
                  className="absolute right-3 bottom-3 inline-flex rounded-full border border-red-200/40 bg-red-500/20 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-red-100 transition hover:bg-red-500/30"
                >
                  {t("Удалить баннер", "Banner o'chirish")}
                </button>
              </div>
            ))}
            {items.length === 0 && (
              <div className="rounded-2xl border border-dashed border-white/30 bg-white/5 px-4 py-6 text-center text-xs text-white/60">
                {t("Баннеры еще не добавлены.", "Bannerlar hali qo'shilmagan.")}
              </div>
            )}
          </div>
        </article>
        <article className="overflow-hidden rounded-3xl border border-white/40 bg-white/15 shadow-[0_20px_40px_rgba(0,0,0,0.2)] backdrop-blur">
          <div className="flex items-center justify-between border-b border-white/20 px-6 py-4 text-white">
            <h3 className="text-lg font-semibold">
              {t("Рассылка", "Xabarnoma")}
            </h3>
            <button
              type="button"
              onClick={() => setNewsletterOpen(true)}
              className="rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs text-white transition hover:bg-white/20"
            >
              {t("Отправить рассылку", "Xabarnomani yuborish")}
            </button>
          </div>
          <div className="custom-scroll max-h-[220px] overflow-y-auto px-6 py-5 pr-4 text-sm text-white/70">
            <p>
              {t(
                "Подготовьте рассылку для гостей ресторана: добавьте фото, заголовок и сообщение перед отправкой.",
                "Restoran mehmonlari uchun xabarnoma tayyorlang: foto, sarlavha va xabar kiriting."
              )}
            </p>
            <div className="mt-4 grid gap-3">
              {newsletters.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-xs text-white/80"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">
                      {item.title}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-white/30 bg-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.2em]">
                        {item.channel === "push" ? "PUSH" : "SPLASH"}
                      </span>
                      <span className="rounded-full border border-white/30 bg-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.2em]">
                        {formatStatus(item.status)}
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          const ok = window.confirm(
                            t(
                              "Удалить рассылку? Она исчезнет из приложения.",
                              "Xabarnomani o'chirilsinmi? U ilovadan yo'qoladi."
                            )
                          );
                          if (!ok) return;
                          await fetch(`/api/newsletters/${item.id}`, {
                            method: "DELETE",
                          });
                          fetchNewsletters();
                        }}
                        className="rounded-full border border-red-200/40 bg-red-500/20 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-red-100 transition hover:bg-red-500/30"
                      >
                        {t("Удалить", "O'chirish")}
                      </button>
                    </div>
                  </div>
                  <div className="mt-1 text-[11px] text-white/60">
                    {item.createdAt.slice(0, 10)}
                  </div>
                  {item.deliveredAt && (
                    <div className="mt-1 text-[11px] text-white/60">
                      {t("Доставлено", "Yetkazildi")}:{" "}
                      {item.deliveredAt.slice(0, 10)}
                    </div>
                  )}
                  {item.error && (
                    <div className="mt-1 text-[11px] text-red-100/80">
                      {t("Ошибка", "Xatolik")}: {item.error}
                    </div>
                  )}
                  <div className="mt-2 text-[11px] text-white/70">
                    {item.message}
                  </div>
                </div>
              ))}
              {newsletters.length === 0 && (
                <div className="rounded-2xl border border-dashed border-white/30 bg-white/5 px-4 py-6 text-center text-xs text-white/60">
                  {t(
                    "История рассылок пока пуста.",
                    "Xabarnomalar tarixi hozircha bo'sh."
                  )}
                </div>
              )}
            </div>
          </div>
        </article>
        {addOpen && (
          <div
            className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 px-4"
            onClick={() => setAddOpen(false)}
          >
            <div
              className="w-full max-w-sm rounded-3xl border border-white/30 bg-white/10 p-6 text-white shadow-[0_20px_50px_rgba(0,0,0,0.35)] backdrop-blur-md"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-semibold">
                  {t("Добавить баннер", "Banner qo'shish")}
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
                  {t("Название", "Nomi")}
                  <input
                    type="text"
                    value={addTitle}
                    onChange={(event) => setAddTitle(event.target.value)}
                    className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 focus:outline-none"
                  />
                </label>
                <label className="grid gap-2">
                  {t("Фотография", "Rasm")}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        const result = reader.result;
                        if (typeof result === "string") {
                          setCropImageSrc(result);
                          setCrop({ x: 0, y: 0 });
                          setZoom(1);
                          setCropAreaPixels(null);
                          setCropOpen(true);
                        }
                      };
                      reader.readAsDataURL(file);
                    }}
                    className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-white file:mr-3 file:rounded-full file:border-0 file:bg-white/80 file:px-3 file:py-1 file:text-xs file:text-[#1c2b22]"
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
                  onClick={async () => {
                    if (!addTitle.trim()) return;
                    await fetch("/api/banners", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        title: addTitle,
                        image: addImage,
                        status: "Активен",
                        addedAt: new Date().toISOString().slice(0, 10),
                      }),
                    });
                    setAddTitle("");
                    setAddImage("/logo_green.png");
                    setAddOpen(false);
                    fetchBanners();
                  }}
                  className="rounded-2xl bg-white/80 px-4 py-2 text-[#1c2b22] transition hover:bg-white"
                >
                  {t("Добавить", "Qo'shish")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {previewBanner && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setPreviewBanner(null)}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-3xl border border-white/30 bg-white/10 text-white shadow-[0_20px_50px_rgba(0,0,0,0.35)] backdrop-blur-md"
            onClick={(event) => event.stopPropagation()}
          >
              <div className="relative h-72 w-full overflow-hidden bg-white/80">
              <button
                type="button"
                onClick={() => setPreviewBanner(null)}
                className="absolute right-3 top-3 rounded-full border border-white/60 bg-white/70 px-2 py-1 text-xs text-[#1c2b22] transition hover:bg-white"
              >
                X
              </button>
              <img
                src={previewBanner.image}
                alt={previewBanner.title}
                width={640}
                height={360}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="px-6 py-4">
              <div className="text-sm font-semibold">{previewBanner.title}</div>
            </div>
          </div>
        </div>
      )}
      {cropOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4"
          onClick={() => setCropOpen(false)}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-3xl border border-white/30 bg-white/10 text-white shadow-[0_20px_50px_rgba(0,0,0,0.35)] backdrop-blur-md"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/20 px-6 py-4">
              <div>
                <div className="text-sm font-semibold">
                  {t("Обрезка баннера", "Banner kesish")}
                </div>
                <div className="text-xs text-white/70">
                  {t(
                    "Рамка соответствует размеру баннера в приложении.",
                    "Ramka ilovadagi banner o'lchamiga mos."
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCropOpen(false)}
                className="rounded-full border border-white/60 bg-white/70 px-2 py-1 text-xs text-[#1c2b22] transition hover:bg-white"
              >
                X
              </button>
            </div>
            <div className="relative h-80 bg-black/40">
              <Cropper
                image={cropImageSrc}
                crop={crop}
                zoom={zoom}
                aspect={bannerAspect}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, area) => setCropAreaPixels(area)}
              />
            </div>
            <div className="flex items-center justify-between px-6 py-4 text-sm">
              <div className="flex items-center gap-3">
                <span className="text-xs text-white/70">
                  {t("Зум", "Masshtab")}
                </span>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.1}
                  value={zoom}
                  onChange={(event) => setZoom(Number(event.target.value))}
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setCropOpen(false)}
                  className="rounded-2xl border border-white/30 bg-white/10 px-4 py-2 transition hover:bg-white/20"
                >
                  {t("Отмена", "Bekor qilish")}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!cropAreaPixels || !cropImageSrc) return;
                    const blob = await getCroppedBlob(
                      cropImageSrc,
                      cropAreaPixels
                    );
                    if (!blob) return;
                    const file = new File([blob], "banner.jpg", {
                      type: "image/jpeg",
                    });
                    const url = await uploadImage(file);
                    if (url) {
                      setAddImage(url);
                      setCropOpen(false);
                    }
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
      {newsletterOpen && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setNewsletterOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-white/30 bg-white/10 p-6 text-white shadow-[0_20px_50px_rgba(0,0,0,0.35)] backdrop-blur-md"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-semibold">
                {t("Новая рассылка", "Yangi xabarnoma")}
              </h4>
              <button
                type="button"
                onClick={() => setNewsletterOpen(false)}
                className="rounded-full border border-white/60 bg-white/70 px-2 py-1 text-xs text-[#1c2b22] transition hover:bg-white"
              >
                X
              </button>
            </div>
            <div className="mt-6 grid gap-4 text-sm">
              <label className="grid gap-2">
                {t("Фото", "Rasm")}
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    const url = await uploadImage(file);
                    if (url) setNewsletterImage(url);
                  }}
                  className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-white file:mr-3 file:rounded-full file:border-0 file:bg-white/80 file:px-3 file:py-1 file:text-xs file:text-[#1c2b22]"
                />
              </label>
              <div className="grid gap-2">
                {t("Тип рассылки", "Xabarnoma turi")}
                <div className="flex items-center gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => setNewsletterChannel("splash")}
                    className={`rounded-full border px-3 py-1 transition ${
                      newsletterChannel === "splash"
                        ? "border-white bg-white/80 text-[#1c2b22]"
                        : "border-white/30 bg-white/10 text-white/70 hover:bg-white/20"
                    }`}
                  >
                    Splash
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewsletterChannel("push")}
                    className={`rounded-full border px-3 py-1 transition ${
                      newsletterChannel === "push"
                        ? "border-white bg-white/80 text-[#1c2b22]"
                        : "border-white/30 bg-white/10 text-white/70 hover:bg-white/20"
                    }`}
                  >
                    Push
                  </button>
                </div>
              </div>
              <label className="grid gap-2">
                {t("Заголовок", "Sarlavha")}
                <input
                  type="text"
                  value={newsletterTitle}
                  onChange={(event) => setNewsletterTitle(event.target.value)}
                  className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 focus:outline-none"
                />
              </label>
              <label className="grid gap-2">
                {t("Сообщение", "Xabar")}
                <textarea
                  value={newsletterMessage}
                  onChange={(event) => setNewsletterMessage(event.target.value)}
                  rows={4}
                  className="resize-none rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 focus:outline-none"
                />
              </label>
              {newsletterImage && (
                <div className="rounded-2xl border border-white/20 bg-white/5 p-3 text-xs text-white/70">
                  {t("Фото загружено", "Rasm yuklandi")}: {newsletterImage}
                </div>
              )}
            </div>
            <div className="mt-6 flex items-center justify-end gap-3 text-sm">
              <button
                type="button"
                onClick={() => setNewsletterOpen(false)}
                className="rounded-2xl border border-white/30 bg-white/10 px-4 py-2 transition hover:bg-white/20"
              >
                {t("Отмена", "Bekor qilish")}
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!newsletterTitle.trim() || !newsletterMessage.trim()) return;
                  await fetch("/api/newsletters", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      title: newsletterTitle,
                      message: newsletterMessage,
                      image: newsletterImage,
                      channel: newsletterChannel,
                    }),
                  });
                  setNewsletterTitle("");
                  setNewsletterMessage("");
                  setNewsletterImage("");
                  setNewsletterChannel("splash");
                  setNewsletterOpen(false);
                  fetchNewsletters();
                }}
                className="rounded-2xl bg-white/80 px-4 py-2 text-[#1c2b22] transition hover:bg-white"
              >
                {t("Отправить", "Yuborish")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
