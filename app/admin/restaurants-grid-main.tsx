
"use client";

import Image from "next/image";
import Cropper, { Area } from "react-easy-crop";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAdminLang } from "./use-admin-lang";

type Restaurant = {
  id: number;
  name: string;
  address: string;
  description: string;
  status: string;
  image: string;
  logo?: string;
  color: string;
  open: boolean;
  addedAt: string;
  workStart?: string;
  workEnd?: string;
  autoSchedule?: boolean;
  tokenPoster?: string;
  spotId?: string;
  integrationType?: "poster" | "1c";
  onecBaseUrl?: string;
  onecAuthMethod?: "login" | "token";
  onecLogin?: string;
  onecPassword?: string;
  onecToken?: string;
};

type RestaurantsGridProps = {
  initialRestaurants: Restaurant[];
};

export default function RestaurantsGrid({
  initialRestaurants,
}: RestaurantsGridProps) {
  const { t } = useAdminLang();
  const restaurantAspect = 16 / 7;
  const hexToRgba = (hex: string, alpha: number) => {
    const normalized = hex.replace("#", "");
    if (normalized.length !== 6) return "rgba(255,255,255,0.15)";
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  };

  const [sortBy, setSortBy] = useState<"name" | "status" | "date">("name");
  const [canEditRestaurants, setCanEditRestaurants] = useState(true);
  const [canChangeRestaurantStatus, setCanChangeRestaurantStatus] =
    useState(true);
  const [canAddRestaurants, setCanAddRestaurants] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [restaurants, setRestaurants] =
    useState<Restaurant[]>(initialRestaurants);
  const [activeRestaurant, setActiveRestaurant] =
    useState<Restaurant | null>(null);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editDraft, setEditDraft] = useState<Restaurant | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState("");
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [cropAreaPixels, setCropAreaPixels] = useState<Area | null>(null);
  const [cropTarget, setCropTarget] = useState<"add" | "edit" | null>(null);
  const [addDraft, setAddDraft] = useState<Omit<Restaurant, "id">>({
    name: "",
    address: "",
    description: "",
    status: "Открыто",
    image: "/logo_green.png",
    logo: "",
    color: "#1a6b3a",
    open: true,
    addedAt: new Date().toISOString().slice(0, 10),
    workStart: "09:00",
    workEnd: "23:00",
    autoSchedule: true,
    tokenPoster: "",
    spotId: "",
    integrationType: "poster",
    onecBaseUrl: "",
    onecAuthMethod: "login",
    onecLogin: "",
    onecPassword: "",
    onecToken: "",
  });
  const menuRef = useRef<HTMLDivElement | null>(null);

  const fetchRestaurants = async () => {
    const response = await fetch("/api/restaurants");
    if (!response.ok) return;
    const data = (await response.json()) as Restaurant[];
    setRestaurants(data);
  };

  useEffect(() => {
    fetchRestaurants();
  }, []);

  useEffect(() => {
    const loadPermissions = async () => {
      const response = await fetch("/api/me");
      if (!response.ok) return;
      const data = (await response.json()) as {
        permissions?: {
          canEditRestaurants?: boolean;
          canChangeRestaurantStatus?: boolean;
          canAddRestaurants?: boolean;
        };
      };
      setCanEditRestaurants(Boolean(data.permissions?.canEditRestaurants));
      setCanChangeRestaurantStatus(
        Boolean(data.permissions?.canChangeRestaurantStatus)
      );
      setCanAddRestaurants(Boolean(data.permissions?.canAddRestaurants));
    };
    loadPermissions();
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

  useEffect(() => {
    if (!activeRestaurant) {
      setStatusMenuOpen(false);
      setEditOpen(false);
      setEditDraft(null);
      setDetailsOpen(false);
      setDeleteConfirmOpen(false);
    }
  }, [activeRestaurant]);

  const items = useMemo(() => {
    const list = [...restaurants];
    if (sortBy === "status") {
      return list.sort((a, b) => Number(b.open) - Number(a.open));
    }
    if (sortBy === "date") {
      return list.sort(
        (a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()
      );
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [restaurants, sortBy]);

  const statusOptions = [
    { value: "Открыто", open: true, labelRu: "Открыто", labelUz: "Ochiq" },
    { value: "Закрыто", open: false, labelRu: "Закрыто", labelUz: "Yopiq" },
  ];

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

  const updateRestaurant = async (id: number, payload: Partial<Restaurant>) => {
    await fetch(`/api/restaurants/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    fetchRestaurants();
  };

  const createImage = (url: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      if (typeof window === "undefined") {
        reject(new Error("Window is not available"));
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

  const openCropper = (file: File, target: "add" | "edit") => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        setCropImageSrc(result);
        setCrop({ x: 0, y: 0 });
        setZoom(1);
        setCropAreaPixels(null);
        setCropTarget(target);
        setCropOpen(true);
      }
    };
    reader.readAsDataURL(file);
  };

  const renderIntegrationFields = (
    draft: Restaurant | Omit<Restaurant, "id">,
    setDraft: (value: Restaurant | Omit<Restaurant, "id">) => void
  ) => {
    const integration = draft.integrationType ?? "poster";
    return (
      <>
        <div className="grid gap-2">
          {t("Интеграция меню", "Menyu integratsiyasi")}
          <div className="flex items-center gap-3 text-xs">
            <button
              type="button"
              onClick={() => setDraft({ ...draft, integrationType: "poster" })}
              className={`rounded-full border px-3 py-1 transition ${
                integration === "poster"
                  ? "border-white bg-white/80 text-[#1c2b22]"
                  : "border-white/30 bg-white/10 text-white/70 hover:bg-white/20"
              }`}
            >
              Poster
            </button>
            <button
              type="button"
              onClick={() => setDraft({ ...draft, integrationType: "1c" })}
              className={`rounded-full border px-3 py-1 transition ${
                integration === "1c"
                  ? "border-white bg-white/80 text-[#1c2b22]"
                  : "border-white/30 bg-white/10 text-white/70 hover:bg-white/20"
              }`}
            >
              1C
            </button>
          </div>
        </div>
        {integration === "poster" && (
          <>
            <label className="grid gap-2">
              Token Poster
              <input
                type="text"
                value={draft.tokenPoster ?? ""}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    tokenPoster: event.target.value,
                  })
                }
                className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 focus:outline-none"
              />
            </label>
            <label className="grid gap-2">
              Spot ID
              <input
                type="text"
                value={draft.spotId ?? ""}
                onChange={(event) =>
                  setDraft({ ...draft, spotId: event.target.value })
                }
                className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 focus:outline-none"
              />
            </label>
          </>
        )}
        {integration === "1c" && (
          <>
            <label className="grid gap-2">
              Base URL
              <input
                type="text"
                value={draft.onecBaseUrl ?? ""}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    onecBaseUrl: event.target.value,
                  })
                }
                className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 focus:outline-none"
              />
            </label>
            <div className="grid gap-2">
              Auth method
              <div className="flex items-center gap-3 text-xs">
                <button
                  type="button"
                  onClick={() =>
                    setDraft({ ...draft, onecAuthMethod: "login" })
                  }
                  className={`rounded-full border px-3 py-1 transition ${
                    (draft.onecAuthMethod ?? "login") === "login"
                      ? "border-white bg-white/80 text-[#1c2b22]"
                      : "border-white/30 bg-white/10 text-white/70 hover:bg-white/20"
                  }`}
                >
                  {t("Логин/пароль", "Login/parol")}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setDraft({ ...draft, onecAuthMethod: "token" })
                  }
                  className={`rounded-full border px-3 py-1 transition ${
                    (draft.onecAuthMethod ?? "login") === "token"
                      ? "border-white bg-white/80 text-[#1c2b22]"
                      : "border-white/30 bg-white/10 text-white/70 hover:bg-white/20"
                  }`}
                >
                  {t("Токен", "Token")}
                </button>
              </div>
            </div>
            {(draft.onecAuthMethod ?? "login") === "login" && (
              <>
                <label className="grid gap-2">
                  {t("Логин", "Login")}
                  <input
                    type="text"
                    value={draft.onecLogin ?? ""}
                    onChange={(event) =>
                      setDraft({ ...draft, onecLogin: event.target.value })
                    }
                    className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 focus:outline-none"
                  />
                </label>
                <label className="grid gap-2">
                  {t("Пароль", "Parol")}
                  <input
                    type="password"
                    value={draft.onecPassword ?? ""}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        onecPassword: event.target.value,
                      })
                    }
                    className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 focus:outline-none"
                  />
                </label>
              </>
            )}
            {(draft.onecAuthMethod ?? "login") === "token" && (
              <label className="grid gap-2">
                {t("Токен", "Token")}
                <input
                  type="text"
                  value={draft.onecToken ?? ""}
                  onChange={(event) =>
                    setDraft({ ...draft, onecToken: event.target.value })
                  }
                  className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 focus:outline-none"
                />
              </label>
            )}
          </>
        )}
      </>
    );
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between px-2">
        <h2 className="ml-10 text-sm uppercase tracking-[0.2em] text-white/70">
          {t("Заведения", "Muassasalar")}
        </h2>
        <div className="mr-4 flex items-center gap-2 text-xs text-white/70">
          <button
            type="button"
            onClick={() => {
              if (!canAddRestaurants) return;
              setAddOpen(true);
            }}
            className={`inline-flex min-w-[220px] items-center justify-between gap-3 rounded-lg border px-4 py-2 text-xs shadow-[0_8px_20px_rgba(0,0,0,0.18)] ${
              canAddRestaurants
                ? "border-white/30 bg-white/90 text-[#1c2b22]"
                : "cursor-not-allowed border-white/20 bg-white/40 text-[#1c2b22]/60"
            }`}
            title={canAddRestaurants ? "" : t("Нет прав", "Ruxsat yo'q")}
            disabled={!canAddRestaurants}
          >
            {t("Добавить заведение", "Muassasa qo'shish")}
          </button>
          <div className="flex items-center gap-1.5 text-xs text-white/70">
            {t("Сортировка", "Saralash")}
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                className="inline-flex min-w-[220px] items-center justify-between gap-3 rounded-lg border border-white/30 bg-white/90 px-4 py-2 text-xs text-[#1c2b22] shadow-[0_8px_20px_rgba(0,0,0,0.18)]"
              >
                <span>
                  {sortBy === "name" && t("По названию", "Nom bo'yicha")}
                  {sortBy === "status" && t("По статусу", "Status bo'yicha")}
                  {sortBy === "date" &&
                    t("По дате добавления", "Qo'shilgan sana bo'yicha")}
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
                <div className="absolute right-0 z-10 mt-2 w-48 rounded-xl border border-white/40 bg-white/95 p-2 text-xs text-[#1c2b22] shadow-[0_14px_30px_rgba(0,0,0,0.2)]">
                  {[
                    { value: "name", label: t("По названию", "Nom bo'yicha") },
                    { value: "status", label: t("По статусу", "Status bo'yicha") },
                    {
                      value: "date",
                      label: t("По дате добавления", "Qo'shilgan sana bo'yicha"),
                    },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setSortBy(option.value as "name" | "status" | "date");
                        setMenuOpen(false);
                      }}
                      className={`w-full rounded-lg px-3 py-2 text-left transition ${
                        sortBy === option.value
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
      </div>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {items.map((restaurant) => (
          <article
            key={restaurant.id}
            className={`cursor-pointer overflow-hidden rounded-3xl border border-white/40 bg-white/15 shadow-[0_20px_40px_rgba(0,0,0,0.2)] backdrop-blur transition hover:border-white/70 ${
              restaurant.open ? "" : "opacity-70"
            }`}
            onClick={() => setActiveRestaurant(restaurant)}
            style={{ backgroundColor: hexToRgba(restaurant.color, 0.2) }}
          >
            <div className="relative h-40 w-full overflow-hidden bg-white/80">
              <span
                className={`absolute right-3 top-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${
                  restaurant.open
                    ? "border-white bg-[#1e7d32]/20 text-[#dff6e6]"
                    : "border-[#f0b3b3] bg-[#f0b3b3]/20 text-[#ffe9e9]"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    restaurant.open ? "bg-[#2ad46a]" : "bg-[#ff6b6b]"
                  }`}
                />
                {restaurant.status}
              </span>
              <Image
                src={restaurant.image}
                alt={restaurant.name}
                width={320}
                height={180}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="px-6 py-5 text-white">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">{restaurant.name}</h2>
              </div>
              <p className="mt-1 text-xs text-white/70">ID: {restaurant.id}</p>
              <p className="mt-2 text-sm text-white/80">
                {restaurant.address}
              </p>
              <p className="mt-3 text-sm text-white/70">
                {restaurant.description}
              </p>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setActiveRestaurant(restaurant);
                    setDetailsOpen(true);
                  }}
                  className="rounded-full border border-white/40 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-white transition hover:bg-white/20"
                >
                  {t("Подробнее", "Batafsil")}
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {activeRestaurant && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setActiveRestaurant(null)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-3xl border border-white/30 bg-white/10 text-white shadow-[0_20px_50px_rgba(0,0,0,0.35)] backdrop-blur-md"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="relative h-40 w-full overflow-hidden bg-white/80">
              <button
                type="button"
                onClick={() => setActiveRestaurant(null)}
                className="absolute right-3 top-3 rounded-full border border-white/60 bg-white/70 px-2 py-1 text-xs text-[#1c2b22] transition hover:bg-white"
              >
                X
              </button>
              <Image
                src={activeRestaurant.image}
                alt={activeRestaurant.name}
                width={320}
                height={180}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="p-6">
              <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-xl font-semibold">
                      {activeRestaurant.name}
                    </h3>
                    <p className="mt-1 text-sm text-white/70">
                      {activeRestaurant.address}
                    </p>
                    <p className="mt-1 text-xs text-white/60">
                      ID: {activeRestaurant.id}
                    </p>
                  </div>
              </div>
              <div className="mt-6 flex flex-col gap-3 text-sm">
                <button
                  type="button"
                  onClick={() => {
                    if (!(canChangeRestaurantStatus || canEditRestaurants))
                      return;
                    setStatusMenuOpen(true);
                  }}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                    canChangeRestaurantStatus || canEditRestaurants
                      ? "border-white/30 bg-white/10 hover:bg-white/20"
                      : "cursor-not-allowed border-white/20 bg-white/5 text-white/40"
                  }`}
                  title={
                    canChangeRestaurantStatus || canEditRestaurants
                      ? ""
                      : t("Нет прав", "Ruxsat yo'q")
                  }
                  disabled={!(canChangeRestaurantStatus || canEditRestaurants)}
                >
                  {t("Изменить статус", "Statusni o'zgartirish")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!activeRestaurant || !canEditRestaurants) return;
                    setEditDraft({ ...activeRestaurant });
                    setEditOpen(true);
                  }}
                  className={`rounded-2xl border px-4 py-3 text-left transition ${
                    canEditRestaurants
                      ? "border-white/30 bg-white/10 hover:bg-white/20"
                      : "cursor-not-allowed border-white/20 bg-white/5 text-white/40"
                  }`}
                  title={canEditRestaurants ? "" : t("Нет прав", "Ruxsat yo'q")}
                  disabled={!canEditRestaurants}
                >
                  {t("Редактировать", "Tahrirlash")}
                </button>
                <button
                  type="button"
                  onClick={() => setDetailsOpen(true)}
                  className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-left transition hover:bg-white/20"
                >
                  {t("Подробнее", "Batafsil")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!canEditRestaurants) return;
                    setDeleteConfirmOpen(true);
                  }}
                  className={`rounded-2xl border px-4 py-3 text-left transition ${
                    canEditRestaurants
                      ? "border-red-200/40 bg-red-500/20 text-red-100 hover:bg-red-500/30"
                      : "cursor-not-allowed border-white/20 bg-white/5 text-white/40"
                  }`}
                  title={canEditRestaurants ? "" : t("Нет прав", "Ruxsat yo'q")}
                  disabled={!canEditRestaurants}
                >
                  {t("Удалить", "O'chirish")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {statusMenuOpen && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setStatusMenuOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-white/30 bg-white/10 p-5 text-white shadow-[0_20px_50px_rgba(0,0,0,0.35)] backdrop-blur-md"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-semibold">
                {t("Изменить статус", "Statusni o'zgartirish")}:{" "}
                {activeRestaurant?.open
                  ? t("Открыто", "Ochiq")
                  : t("Закрыто", "Yopiq")}
              </h4>
              <button
                type="button"
                onClick={() => setStatusMenuOpen(false)}
                className="rounded-full border border-white/60 bg-white/70 px-2 py-1 text-xs text-[#1c2b22] transition hover:bg-white"
              >
                X
              </button>
            </div>
            <div className="mt-4 flex flex-col gap-3 text-sm">
              {statusOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    if (!activeRestaurant) return;
                    setRestaurants((prev) =>
                      prev.map((restaurant) =>
                        restaurant.id === activeRestaurant.id
                          ? {
                              ...restaurant,
                              status: option.value,
                              open: option.open,
                            }
                          : restaurant
                      )
                    );
                    updateRestaurant(activeRestaurant.id, {
                      status: option.value,
                      open: option.open,
                    });
                    setActiveRestaurant((prev) =>
                      prev
                        ? {
                            ...prev,
                            status: option.value,
                            open: option.open,
                          }
                        : prev
                    );
                    setStatusMenuOpen(false);
                  }}
                  className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-left transition hover:bg-white/20"
                >
                  {t(option.labelRu, option.labelUz)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {detailsOpen && activeRestaurant && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setDetailsOpen(false)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-3xl border border-white/30 bg-white/10 text-white shadow-[0_20px_50px_rgba(0,0,0,0.35)] backdrop-blur-md"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="relative flex h-40 items-center justify-center bg-white/80">
              <button
                type="button"
                onClick={() => setDetailsOpen(false)}
                className="absolute right-3 top-3 rounded-full border border-white/60 bg-white/70 px-2 py-1 text-xs text-[#1c2b22] transition hover:bg-white"
              >
                X
              </button>
              <Image
                src={activeRestaurant.image}
                alt={activeRestaurant.name}
                width={320}
                height={180}
                className="h-16 w-auto"
              />
            </div>
            <div className="p-6 text-sm">
              <h3 className="text-xl font-semibold">
                {activeRestaurant.name}
              </h3>
              <p className="mt-2 text-white/70">{activeRestaurant.address}</p>
              <p className="mt-1 text-xs text-white/60">
                ID: {activeRestaurant.id}
              </p>
              <p className="mt-3 text-white/70">
                {activeRestaurant.description}
              </p>
              <div className="mt-4 grid gap-2">
                <div>
                  <span className="text-white/60">{t("Статус", "Status")}:</span>{" "}
                  <span>
                    {activeRestaurant.open
                      ? t("Открыто", "Ochiq")
                      : t("Закрыто", "Yopiq")}
                  </span>
                </div>
                <div>
                  <span className="text-white/60">
                    {t("Интеграция", "Integratsiya")}:
                  </span>{" "}
                  <span>
                    {activeRestaurant.integrationType === "1c" ? "1C" : "Poster"}
                  </span>
                </div>
                {activeRestaurant.integrationType !== "1c" && (
                  <>
                    <div>
                      <span className="text-white/60">Token Poster:</span>{" "}
                      <span>{activeRestaurant.tokenPoster || "тАФ"}</span>
                    </div>
                    <div>
                      <span className="text-white/60">Spot ID:</span>{" "}
                      <span>{activeRestaurant.spotId || "тАФ"}</span>
                    </div>
                  </>
                )}
                {activeRestaurant.integrationType === "1c" && (
                  <>
                    <div>
                      <span className="text-white/60">Base URL:</span>{" "}
                      <span>{activeRestaurant.onecBaseUrl || "тАФ"}</span>
                    </div>
                    <div>
                      <span className="text-white/60">Auth method:</span>{" "}
                      <span>
                        {activeRestaurant.onecAuthMethod === "token"
                          ? t("Токен", "Token")
                          : t("Логин/пароль", "Login/parol")}
                      </span>
                    </div>
                    {activeRestaurant.onecAuthMethod === "login" && (
                      <>
                        <div>
                          <span className="text-white/60">
                            {t("Логин", "Login")}:
                          </span>{" "}
                          <span>{activeRestaurant.onecLogin || "тАФ"}</span>
                        </div>
                        <div>
                          <span className="text-white/60">
                            {t("Пароль", "Parol")}:
                          </span>{" "}
                          <span>
                            {activeRestaurant.onecPassword ? "тАвтАвтАвтАвтАвтАв" : "тАФ"}
                          </span>
                        </div>
                      </>
                    )}
                    {activeRestaurant.onecAuthMethod === "token" && (
                      <div>
                        <span className="text-white/60">
                          {t("Токен", "Token")}:
                        </span>{" "}
                        <span>{activeRestaurant.onecToken || "тАФ"}</span>
                      </div>
                    )}
                  </>
                )}
                <div>
                  <span className="text-white/60">
                    {t("Цвет", "Rang")}:
                  </span>{" "}
                  <span>{activeRestaurant.color}</span>
                </div>
                <div>
                  <span className="text-white/60">
                    {t("Дата добавления", "Qo'shilgan sana")}:
                  </span>{" "}
                  <span>{activeRestaurant.addedAt}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {deleteConfirmOpen && activeRestaurant && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setDeleteConfirmOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-white/30 bg-white/10 p-6 text-white shadow-[0_20px_50px_rgba(0,0,0,0.35)] backdrop-blur-md"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-semibold">
                {t("Удалить заведение", "Muassasani o'chirish")}
              </h4>
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
                className="rounded-full border border-white/60 bg-white/70 px-2 py-1 text-xs text-[#1c2b22] transition hover:bg-white"
              >
                X
              </button>
            </div>
            <p className="mt-3 text-sm text-white/70">
              {t(
                "Вы действительно хотите удалить заведение",
                "Muassasani o'chirmoqchimisiz"
              )}{" "}
              <span className="font-semibold text-white">
                {activeRestaurant.name}
              </span>
              ?
            </p>
            <div className="mt-5 flex items-center justify-end gap-3 text-sm">
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
                className="rounded-2xl border border-white/30 bg-white/10 px-4 py-2 transition hover:bg-white/20"
              >
                {t("Отмена", "Bekor qilish")}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await fetch(`/api/restaurants/${activeRestaurant.id}`, {
                    method: "DELETE",
                  });
                  setDeleteConfirmOpen(false);
                  setActiveRestaurant(null);
                  fetchRestaurants();
                }}
                className="rounded-2xl border border-red-200/40 bg-red-500/30 px-4 py-2 text-red-100 transition hover:bg-red-500/40"
              >
                {t("Удалить", "O'chirish")}
              </button>
            </div>
          </div>
        </div>
      )}
      {addOpen && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setAddOpen(false)}
        >
          <div
            className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-3xl border border-white/30 bg-white/10 p-6 text-white shadow-[0_20px_50px_rgba(0,0,0,0.35)] backdrop-blur-md"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-semibold">
                {t("Добавить заведение", "Muassasa qo'shish")}
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
              <div className="grid gap-2">
                <span className="text-xs uppercase tracking-[0.2em] text-white/60">
                  ID
                </span>
                <div className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-sm text-white/80">
                  {editDraft?.id ?? ""}
                </div>
              </div>
              <label className="grid gap-2">
                {t("Название", "Nomi")}
                <input
                  type="text"
                  value={addDraft.name}
                  onChange={(event) =>
                    setAddDraft({ ...addDraft, name: event.target.value })
                  }
                  className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 focus:outline-none"
                />
              </label>
              {renderIntegrationFields(addDraft, setAddDraft)}
              <label className="grid gap-2">
                {t("Адрес", "Manzil")}
                <input
                  type="text"
                  value={addDraft.address}
                  onChange={(event) =>
                    setAddDraft({ ...addDraft, address: event.target.value })
                  }
                  className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 focus:outline-none"
                />
              </label>
              <label className="grid gap-2">
                {t("Описание", "Tavsif")}
                <textarea
                  value={addDraft.description}
                  onChange={(event) =>
                    setAddDraft({
                      ...addDraft,
                      description: event.target.value,
                    })
                  }
                  rows={3}
                  className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 focus:outline-none"
                />
              </label>
              <div className="grid gap-3 rounded-2xl border border-white/20 bg-white/10 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.2em] text-white/60">
                  {t("Рабочее время", "Ish vaqti")}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-2 text-xs uppercase tracking-[0.2em] text-white/70">
                    {t("Открытие", "Ochilish")}
                    <input
                      type="time"
                      value={addDraft.workStart ?? ""}
                      onChange={(event) =>
                        setAddDraft({
                          ...addDraft,
                          workStart: event.target.value,
                        })
                      }
                      className="rounded-2xl border border-white/30 bg-white/10 px-4 py-2 text-sm text-white outline-none"
                    />
                  </label>
                  <label className="grid gap-2 text-xs uppercase tracking-[0.2em] text-white/70">
                    {t("Закрытие", "Yopilish")}
                    <input
                      type="time"
                      value={addDraft.workEnd ?? ""}
                      onChange={(event) =>
                        setAddDraft({
                          ...addDraft,
                          workEnd: event.target.value,
                        })
                      }
                      className="rounded-2xl border border-white/30 bg-white/10 px-4 py-2 text-sm text-white outline-none"
                    />
                  </label>
                </div>
                <label className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-white/70">
                  <input
                    type="checkbox"
                    checked={Boolean(addDraft.autoSchedule)}
                    onChange={(event) =>
                      setAddDraft({
                        ...addDraft,
                        autoSchedule: event.target.checked,
                      })
                    }
                    className="h-4 w-4 rounded border-white/40 bg-transparent"
                  />
                  {t("Авто‑расписание", "Avto jadval")}
                </label>
              </div>
              <label className="grid gap-2">
                {t("Цвет фона", "Fon rangi")}
                <input
                  type="color"
                  value={addDraft.color}
                  onChange={(event) =>
                    setAddDraft({ ...addDraft, color: event.target.value })
                  }
                  className="h-12 w-full rounded-2xl border border-white/30 bg-white/10 px-3 py-2"
                />
              </label>
              <label className="grid gap-2">
                {t("Логотип заведения", "Muassasa logotipi")}
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    const url = await uploadImage(file);
                    if (url) setAddDraft({ ...addDraft, logo: url });
                  }}
                  className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-white file:mr-3 file:rounded-full file:border-0 file:bg-white/80 file:px-3 file:py-1 file:text-xs file:text-[#1c2b22]"
                />
              </label>
              <label className="grid gap-2">
                {t("Обложка заведения", "Muassasa muqovasi")}
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    openCropper(file, "add");
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
                  if (!addDraft.name.trim()) return;
                  await fetch("/api/restaurants", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(addDraft),
                  });
                  setAddOpen(false);
                  setAddDraft({
                    name: "",
                    address: "",
                    description: "",
                    status: "Открыто",
                    image: "/logo_green.png",
                    logo: "",
                    color: "#1a6b3a",
                    open: true,
                    addedAt: new Date().toISOString().slice(0, 10),
                    workStart: "09:00",
                    workEnd: "23:00",
                    autoSchedule: true,
                    tokenPoster: "",
                    spotId: "",
                    integrationType: "poster",
                    onecBaseUrl: "",
                    onecAuthMethod: "login",
                    onecLogin: "",
                    onecPassword: "",
                    onecToken: "",
                  });
                  fetchRestaurants();
                }}
                className="rounded-2xl bg-white/80 px-4 py-2 text-[#1c2b22] transition hover:bg-white"
              >
                {t("Добавить", "Qo'shish")}
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
            className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-3xl border border-white/30 bg-white/10 p-6 text-white shadow-[0_20px_50px_rgba(0,0,0,0.35)] backdrop-blur-md"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-semibold">
                {t("Редактировать заведение", "Muassasani tahrirlash")}
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
                {t("Название", "Nomi")}
                <input
                  type="text"
                  value={editDraft.name}
                  onChange={(event) =>
                    setEditDraft({ ...editDraft, name: event.target.value })
                  }
                  className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 focus:outline-none"
                />
              </label>
              {renderIntegrationFields(editDraft, (value) => setEditDraft(value as Restaurant))}
              <label className="grid gap-2">
                {t("Адрес", "Manzil")}
                <input
                  type="text"
                  value={editDraft.address}
                  onChange={(event) =>
                    setEditDraft({ ...editDraft, address: event.target.value })
                  }
                  className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 focus:outline-none"
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
                  className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 focus:outline-none"
                />
              </label>
              <div className="grid gap-3 rounded-2xl border border-white/20 bg-white/10 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.2em] text-white/60">
                  {t("Рабочее время", "Ish vaqti")}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-2 text-xs uppercase tracking-[0.2em] text-white/70">
                    {t("Открытие", "Ochilish")}
                    <input
                      type="time"
                      value={editDraft.workStart ?? ""}
                      onChange={(event) =>
                        setEditDraft({
                          ...editDraft,
                          workStart: event.target.value,
                        })
                      }
                      className="rounded-2xl border border-white/30 bg-white/10 px-4 py-2 text-sm text-white outline-none"
                    />
                  </label>
                  <label className="grid gap-2 text-xs uppercase tracking-[0.2em] text-white/70">
                    {t("Закрытие", "Yopilish")}
                    <input
                      type="time"
                      value={editDraft.workEnd ?? ""}
                      onChange={(event) =>
                        setEditDraft({
                          ...editDraft,
                          workEnd: event.target.value,
                        })
                      }
                      className="rounded-2xl border border-white/30 bg-white/10 px-4 py-2 text-sm text-white outline-none"
                    />
                  </label>
                </div>
                <label className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-white/70">
                  <input
                    type="checkbox"
                    checked={Boolean(editDraft.autoSchedule)}
                    onChange={(event) =>
                      setEditDraft({
                        ...editDraft,
                        autoSchedule: event.target.checked,
                      })
                    }
                    className="h-4 w-4 rounded border-white/40 bg-transparent"
                  />
                  {t("Авто‑расписание", "Avto jadval")}
                </label>
              </div>
              <label className="grid gap-2">
                {t("Цвет фона", "Fon rangi")}
                <input
                  type="color"
                  value={editDraft.color}
                  onChange={(event) =>
                    setEditDraft({ ...editDraft, color: event.target.value })
                  }
                  className="h-12 w-full rounded-2xl border border-white/30 bg-white/10 px-3 py-2"
                />
              </label>
              <label className="grid gap-2">
                {t("Логотип заведения", "Muassasa logotipi")}
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    const url = await uploadImage(file);
                    if (url) setEditDraft({ ...editDraft, logo: url });
                  }}
                  className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-white file:mr-3 file:rounded-full file:border-0 file:bg-white/80 file:px-3 file:py-1 file:text-xs file:text-[#1c2b22]"
                />
              </label>
              <label className="grid gap-2">
                {t("Обложка заведения", "Muassasa muqovasi")}
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    openCropper(file, "edit");
                  }}
                  className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-white file:mr-3 file:rounded-full file:border-0 file:bg-white/80 file:px-3 file:py-1 file:text-xs file:text-[#1c2b22]"
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
                onClick={() => {
                  if (!editDraft) return;
                  updateRestaurant(editDraft.id, editDraft);
                  setActiveRestaurant((prev) =>
                    prev ? { ...prev, ...editDraft } : prev
                  );
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
                  {t("Обрезка фото заведения", "Muassasa suratini kesish")}
                </div>
                <div className="text-xs text-white/70">
                  {t(
                    "Рамка соответствует соотношению 16:7.",
                    "Ramka 16:7 nisbatiga mos."
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
                aspect={restaurantAspect}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, area) => setCropAreaPixels(area)}
              />
            </div>
            <div className="flex items-center justify-between px-6 py-4 text-sm">
              <div className="flex items-center gap-3">
                <span className="text-xs text-white/70">
                  {t("Масштаб", "Masshtab")}
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
                    if (!cropAreaPixels || !cropImageSrc || !cropTarget) return;
                    const blob = await getCroppedBlob(
                      cropImageSrc,
                      cropAreaPixels
                    );
                    if (!blob) return;
                    const file = new File([blob], "restaurant.jpg", {
                      type: "image/jpeg",
                    });
                    const url = await uploadImage(file);
                    if (!url) return;
                    if (cropTarget === "add") {
                      setAddDraft((prev) => ({ ...prev, image: url }));
                    } else if (cropTarget === "edit" && editDraft) {
                      setEditDraft({ ...editDraft, image: url });
                    }
                    setCropOpen(false);
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
    </div>
  );
}
