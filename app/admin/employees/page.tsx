"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAdminLang } from "../use-admin-lang";

type Permissions = {
  canEditRestaurants: boolean;
  canChangeRestaurantStatus: boolean;
  canManageEmployees: boolean;
  canAddRestaurants: boolean;
};

type Employee = {
  id: number;
  name: string;
  phone: string;
  role: string;
  login: string;
  permissions: Permissions;
  createdAt: string;
};

type SortKey = "name" | "date" | "role";

const emptyPermissions = {
  canEditRestaurants: false,
  canChangeRestaurantStatus: false,
  canManageEmployees: false,
  canAddRestaurants: false,
};

export default function EmployeesPage() {
  const { lang, t } = useAdminLang();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [canManageEmployees, setCanManageEmployees] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [menuOpen, setMenuOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [addDraft, setAddDraft] = useState({
    name: "",
    phone: "",
    role: "",
    login: "",
    password: "",
    permissions: { ...emptyPermissions },
  });
  const [editDraft, setEditDraft] = useState({
    id: 0,
    name: "",
    phone: "",
    role: "",
    login: "",
    password: "",
    permissions: { ...emptyPermissions },
  });
  const [addError, setAddError] = useState("");
  const [editError, setEditError] = useState("");
  const menuRef = useRef<HTMLDivElement | null>(null);

  const fetchEmployeesData = async () => {
    const response = await fetch("/api/employees");
    if (!response.ok) return null;
    return (await response.json()) as Employee[];
  };

  const fetchEmployees = async () => {
    const data = await fetchEmployeesData();
    if (data) {
      setEmployees(data);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const loadEmployees = async () => {
      const data = await fetchEmployeesData();
      if (!cancelled && data) {
        setEmployees(data);
      }
    };
    void loadEmployees();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const loadPermissions = async () => {
      const response = await fetch("/api/me");
      if (!response.ok) return;
      const data = (await response.json()) as {
        permissions?: { canManageEmployees?: boolean };
      };
      setCanManageEmployees(Boolean(data.permissions?.canManageEmployees));
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

  const sortedEmployees = useMemo(() => {
    const list = [...employees];
    if (sortKey === "name") {
      return list.sort((a, b) => a.name.localeCompare(b.name, lang));
    }
    if (sortKey === "role") {
      return list.sort((a, b) => a.role.localeCompare(b.role, lang));
    }
    return list.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [employees, lang, sortKey]);

  const formatDate = (value: string) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString(lang === "uz" ? "uz-UZ" : "ru-RU");
  };

  const handleAddEmployee = async () => {
    if (!canManageEmployees) {
      setAddError(t("Нет прав.", "Ruxsat yo'q."));
      return;
    }
    if (
      !addDraft.name.trim() ||
      !addDraft.phone.trim() ||
      !addDraft.login.trim() ||
      !addDraft.password.trim()
    ) {
      setAddError(
        t(
          "Заполните имя, телефон, логин и пароль.",
          "Ism, telefon, login va parolni kiriting."
        )
      );
      return;
    }
    setAddError("");
    const response = await fetch("/api/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(addDraft),
    });
    if (!response.ok) {
      setAddError(
        t("Не удалось добавить сотрудника.", "Xodimni qo'shib bo'lmadi.")
      );
      return;
    }
    setAddOpen(false);
    setAddDraft({
      name: "",
      phone: "",
      role: "",
      login: "",
      password: "",
      permissions: { ...emptyPermissions },
    });
    fetchEmployees();
  };

  const handleOpenEdit = (employee: Employee) => {
    if (!canManageEmployees) return;
    setEditDraft({
      id: employee.id,
      name: employee.name,
      phone: employee.phone,
      role: employee.role,
      login: employee.login,
      password: "",
      permissions: { ...employee.permissions },
    });
    setEditError("");
    setEditOpen(true);
  };

  const handleEditEmployee = async () => {
    if (!canManageEmployees) {
      setEditError(t("Нет прав.", "Ruxsat yo'q."));
      return;
    }
    if (!editDraft.name.trim() || !editDraft.phone.trim() || !editDraft.login.trim()) {
      setEditError(
        t("Заполните имя, телефон и логин.", "Ism, telefon va logini kiriting.")
      );
      return;
    }
    setEditError("");
    const response = await fetch(`/api/employees/${editDraft.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editDraft.name,
        phone: editDraft.phone,
        role: editDraft.role,
        login: editDraft.login,
        password: editDraft.password,
        permissions: editDraft.permissions,
      }),
    });
    if (!response.ok) {
      setEditError(
        t(
          "Не удалось сохранить изменения.",
          "O'zgarishlarni saqlab bo'lmadi."
        )
      );
      return;
    }
    setEditOpen(false);
    fetchEmployees();
  };

  const handleDeleteEmployee = async () => {
    if (!canManageEmployees) {
      setEditError(t("Нет прав.", "Ruxsat yo'q."));
      return;
    }
    const response = await fetch(`/api/employees/${editDraft.id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      setEditError(
        t("Не удалось удалить сотрудника.", "Xodimni o'chirib bo'lmadi.")
      );
      return;
    }
    setDeleteOpen(false);
    setEditOpen(false);
    fetchEmployees();
  };

  const renderPermissions = (
    permissions: Permissions,
    onChange: (next: Permissions) => void
  ) => (
    <div className="grid gap-3 text-sm">
      <label className="flex items-center justify-between gap-3 rounded-2xl border border-white/20 bg-white/10 px-4 py-3">
        <span>
          {t(
            "Редактирование данных заведений",
            "Muassasa ma'lumotlarini tahrirlash"
          )}
        </span>
        <input
          type="checkbox"
          className="h-4 w-4 accent-[#2f7d3c]"
          checked={permissions.canEditRestaurants}
          onChange={(event) =>
            onChange({
              ...permissions,
              canEditRestaurants: event.target.checked,
            })
          }
        />
      </label>
      <label className="flex items-center justify-between gap-3 rounded-2xl border border-white/20 bg-white/10 px-4 py-3">
        <span>
          {t(
            "Изменение статуса заведений",
            "Muassasa statusini o'zgartirish"
          )}
        </span>
        <input
          type="checkbox"
          className="h-4 w-4 accent-[#2f7d3c]"
          checked={permissions.canChangeRestaurantStatus}
          onChange={(event) =>
            onChange({
              ...permissions,
              canChangeRestaurantStatus: event.target.checked,
            })
          }
        />
      </label>
      <label className="flex items-center justify-between gap-3 rounded-2xl border border-white/20 bg-white/10 px-4 py-3">
        <span>{t("Добавление заведений", "Muassasalar qo'shish")}</span>
        <input
          type="checkbox"
          className="h-4 w-4 accent-[#2f7d3c]"
          checked={permissions.canAddRestaurants}
          onChange={(event) =>
            onChange({
              ...permissions,
              canAddRestaurants: event.target.checked,
            })
          }
        />
      </label>
      <label className="flex items-center justify-between gap-3 rounded-2xl border border-white/20 bg-white/10 px-4 py-3">
        <span>
          {t(
            "Добавление и редактирование сотрудников",
            "Xodimlarni qo'shish va tahrirlash"
          )}
        </span>
        <input
          type="checkbox"
          className="h-4 w-4 accent-[#2f7d3c]"
          checked={permissions.canManageEmployees}
          onChange={(event) =>
            onChange({
              ...permissions,
              canManageEmployees: event.target.checked,
            })
          }
        />
      </label>
    </div>
  );

  return (
    <section className="mt-10">
      <div className="mb-6 flex items-center justify-between px-2">
        <div className="ml-10 text-xs uppercase tracking-[0.2em] text-white/70">
          {t("Сотрудники", "Xodimlar")}
        </div>
        <div className="mr-4 flex items-center gap-3 text-xs text-white/70">
          <button
            type="button"
            onClick={() => {
              if (!canManageEmployees) return;
              setAddOpen(true);
              setAddError("");
            }}
            className={`inline-flex min-w-[220px] items-center justify-between gap-3 rounded-lg border px-4 py-2 text-xs shadow-[0_8px_20px_rgba(0,0,0,0.18)] ${
              canManageEmployees
                ? "border-white/30 bg-white/90 text-[#1c2b22]"
                : "cursor-not-allowed border-white/20 bg-white/40 text-[#1c2b22]/60"
            }`}
            title={canManageEmployees ? "" : t("Нет прав", "Ruxsat yo'q")}
            disabled={!canManageEmployees}
          >
            {t("Добавить сотрудника", "Xodim qo'shish")}
          </button>
          <div className="flex items-center gap-2">
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
                  {sortKey === "role" && t("Должность", "Lavozim")}
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
                    { value: "role", label: t("Должность", "Lavozim") },
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
      </div>
      <div className="rounded-3xl border border-white/30 bg-white/10 p-6 text-white shadow-[0_20px_50px_rgba(0,0,0,0.35)] backdrop-blur-md">
        <div className="text-xs uppercase tracking-[0.2em] text-white/70">
          {t("Список сотрудников", "Xodimlar ro'yxati")}
        </div>
        <div className="mt-4 grid gap-3">
          {sortedEmployees.map((employee) => (
            <div
              key={employee.id}
              className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm transition ${
                canManageEmployees
                  ? "cursor-pointer hover:border-white/50 hover:bg-white/15"
                  : "cursor-default opacity-80"
              }`}
              title={canManageEmployees ? "" : t("Нет прав", "Ruxsat yo'q")}
              onClick={() => handleOpenEdit(employee)}
            >
              <div>
                <div className="font-semibold">{employee.name}</div>
                <div className="text-xs text-white/70">{employee.phone}</div>
              </div>
              <div className="flex items-center gap-6 text-xs text-white/70">
                <span>{employee.role || t("Без роли", "Rolsiz")}</span>
                <span>{formatDate(employee.createdAt)}</span>
              </div>
            </div>
          ))}
          {sortedEmployees.length === 0 && (
            <div className="rounded-2xl border border-dashed border-white/30 bg-white/5 px-4 py-6 text-center text-xs text-white/60">
              {t(
                "Сотрудники пока не добавлены.",
                "Xodimlar hali qo'shilmagan."
              )}
            </div>
          )}
        </div>
      </div>
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
                {t("Добавить сотрудника", "Xodim qo'shish")}
              </h4>
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                className="rounded-full border border-white/60 bg-white/70 px-2 py-1 text-xs text-[#1c2b22] transition hover:bg-white"
              >
                X
              </button>
            </div>
            <div className="mt-5 grid gap-3 text-sm">
              <label className="grid gap-2">
                {t("Имя", "Ism")}
                <input
                  type="text"
                  value={addDraft.name}
                  onChange={(event) =>
                    setAddDraft({ ...addDraft, name: event.target.value })
                  }
                  className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 focus:outline-none"
                />
              </label>
              <label className="grid gap-2">
                {t("Номер телефона", "Telefon raqami")}
                <input
                  type="text"
                  value={addDraft.phone}
                  onChange={(event) =>
                    setAddDraft({ ...addDraft, phone: event.target.value })
                  }
                  className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 focus:outline-none"
                />
              </label>
              <label className="grid gap-2">
                {t("Должность", "Lavozim")}
                <input
                  type="text"
                  value={addDraft.role}
                  onChange={(event) =>
                    setAddDraft({ ...addDraft, role: event.target.value })
                  }
                  className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 focus:outline-none"
                />
              </label>
              <label className="grid gap-2">
                {t("Логин", "Login")}
                <input
                  type="text"
                  value={addDraft.login}
                  onChange={(event) =>
                    setAddDraft({ ...addDraft, login: event.target.value })
                  }
                  className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 focus:outline-none"
                />
              </label>
              <label className="grid gap-2">
                {t("Пароль", "Parol")}
                <input
                  type="password"
                  value={addDraft.password}
                  onChange={(event) =>
                    setAddDraft({ ...addDraft, password: event.target.value })
                  }
                  className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 focus:outline-none"
                />
              </label>
              <div className="mt-2 text-xs uppercase tracking-[0.2em] text-white/60">
                {t("Доступ", "Ruxsatlar")}
              </div>
              {renderPermissions(addDraft.permissions, (next) =>
                setAddDraft({ ...addDraft, permissions: next })
              )}
              {addError && (
                <div className="rounded-2xl border border-red-200/40 bg-red-500/20 px-4 py-3 text-xs uppercase tracking-[0.2em] text-red-100">
                  {addError}
                </div>
              )}
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
                onClick={handleAddEmployee}
                className="rounded-2xl bg-white/80 px-4 py-2 text-[#1c2b22] transition hover:bg-white"
              >
                {t("Добавить", "Qo'shish")}
              </button>
            </div>
          </div>
        </div>
      )}
      {editOpen && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setEditOpen(false)}
        >
          <div
            className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-3xl border border-white/30 bg-white/10 p-6 text-white shadow-[0_20px_50px_rgba(0,0,0,0.35)] backdrop-blur-md"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-semibold">
                {t("Редактировать сотрудника", "Xodimni tahrirlash")}
              </h4>
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="rounded-full border border-white/60 bg-white/70 px-2 py-1 text-xs text-[#1c2b22] transition hover:bg-white"
              >
                X
              </button>
            </div>
            <div className="mt-5 grid gap-3 text-sm">
              <label className="grid gap-2">
                {t("Имя", "Ism")}
                <input
                  type="text"
                  value={editDraft.name}
                  onChange={(event) =>
                    setEditDraft({ ...editDraft, name: event.target.value })
                  }
                  className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 focus:outline-none"
                />
              </label>
              <label className="grid gap-2">
                {t("Номер телефона", "Telefon raqami")}
                <input
                  type="text"
                  value={editDraft.phone}
                  onChange={(event) =>
                    setEditDraft({ ...editDraft, phone: event.target.value })
                  }
                  className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 focus:outline-none"
                />
              </label>
              <label className="grid gap-2">
                {t("Должность", "Lavozim")}
                <input
                  type="text"
                  value={editDraft.role}
                  onChange={(event) =>
                    setEditDraft({ ...editDraft, role: event.target.value })
                  }
                  className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 focus:outline-none"
                />
              </label>
              <label className="grid gap-2">
                {t("Логин", "Login")}
                <input
                  type="text"
                  value={editDraft.login}
                  onChange={(event) =>
                    setEditDraft({ ...editDraft, login: event.target.value })
                  }
                  className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 focus:outline-none"
                />
              </label>
              <label className="grid gap-2">
                {t("Новый пароль", "Yangi parol")}
                <input
                  type="password"
                  value={editDraft.password}
                  onChange={(event) =>
                    setEditDraft({ ...editDraft, password: event.target.value })
                  }
                  className="rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-white placeholder:text-white/60 focus:outline-none"
                />
              </label>
              <div className="mt-2 text-xs uppercase tracking-[0.2em] text-white/60">
                {t("Доступ", "Ruxsatlar")}
              </div>
              {renderPermissions(editDraft.permissions, (next) =>
                setEditDraft({ ...editDraft, permissions: next })
              )}
              {editError && (
                <div className="rounded-2xl border border-red-200/40 bg-red-500/20 px-4 py-3 text-xs uppercase tracking-[0.2em] text-red-100">
                  {editError}
                </div>
              )}
            </div>
            <div className="mt-6 flex items-center justify-end gap-3 text-sm">
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="rounded-2xl border border-white/30 bg-white/10 px-4 py-2 transition hover:bg-white/20"
              >
                {t("Отмена", "Bekor qilish")}
              </button>
              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                className="rounded-2xl border border-red-200/40 bg-red-500/30 px-4 py-2 text-red-100 transition hover:bg-red-500/40"
              >
                {t("Удалить", "O'chirish")}
              </button>
              <button
                type="button"
                onClick={handleEditEmployee}
                className="rounded-2xl bg-white/80 px-4 py-2 text-[#1c2b22] transition hover:bg-white"
              >
                {t("Сохранить", "Saqlash")}
              </button>
            </div>
          </div>
        </div>
      )}
      {deleteOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setDeleteOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-white/30 bg-white/10 p-6 text-white shadow-[0_20px_50px_rgba(0,0,0,0.35)] backdrop-blur-md"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-semibold">
                {t("Удалить сотрудника", "Xodimni o'chirish")}
              </h4>
              <button
                type="button"
                onClick={() => setDeleteOpen(false)}
                className="rounded-full border border-white/60 bg-white/70 px-2 py-1 text-xs text-[#1c2b22] transition hover:bg-white"
              >
                X
              </button>
            </div>
            <p className="mt-3 text-sm text-white/70">
              {t("Вы действительно хотите удалить сотрудника", "Haqiqatan ham xodimni o'chirmoqchimisiz")} {" "}
              <span className="font-semibold text-white">{editDraft.name}</span>?
            </p>
            <div className="mt-5 flex items-center justify-end gap-3 text-sm">
              <button
                type="button"
                onClick={() => setDeleteOpen(false)}
                className="rounded-2xl border border-white/30 bg-white/10 px-4 py-2 transition hover:bg-white/20"
              >
                {t("Отмена", "Bekor qilish")}
              </button>
              <button
                type="button"
                onClick={handleDeleteEmployee}
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
