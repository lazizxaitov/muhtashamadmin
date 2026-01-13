# Muhtasham Admin — Mobile App Integration (API Guide)

This document is meant for the mobile app (Flutter) and for Codex in the mobile repo.
It explains what the app should call, what data it gets, and how the admin panel affects the app.

## Architecture (important)

- The mobile app NEVER calls Poster directly.
- Poster tokens and any integration credentials are stored ONLY on the server.
- Flow:
  - Admin panel (web) syncs data from Poster/1C into this backend.
  - Mobile app reads public data (restaurants, menu, banners, fees) from this backend.
  - Mobile app sends orders to this backend.
  - Backend creates the order in Poster (server-to-server) using the restaurant’s Poster token.

Base URL examples:
- Local: `http://localhost:3000`
- Production: `https://<your-domain>`

## Access levels (Public / Client / Admin)

### Public API (no auth)
Read-only endpoints used by the mobile app to render the UI.
These endpoints are rate-limited (best-effort, in-memory per server instance).

### Client API (JWT)
Personal client data (addresses) and placing orders.
Auth header:
- `Authorization: Bearer <accessToken>`

### Admin API (cookie session)
Only for the admin panel (web) with an HttpOnly cookie session.
The mobile app must NOT call admin endpoints.

## Data rules the mobile app must follow

### Hidden flags
- If `hidden: true` on a category or item, the mobile app must NOT show it.

### Images
- Some image fields are absolute URLs (e.g. Poster images).
- Some image fields are relative paths like `/uploads/xxx.png` or `/logo.png`.
- Mobile app rule:
  - if `image` starts with `/`, build `fullUrl = BASE_URL + image`
  - otherwise use the value as-is

### Fees (extra charges) and totals
- The mobile app builds the final receipt like:
  - `sum(items)` + `deliveryFee` + `packageFee` + `other fees`
- Fees come from this backend per restaurant.
- If a fee `price` is `0`, it means the fee is **free** (not “0 cost displayed as a number”).
- Each restaurant always has 2 required fees created automatically by the backend:
  - Delivery fee
  - Package fee
- Admin can edit the price of default fees, but cannot delete them.

### Banners order
- If multiple banners are active, the mobile app rotates them on a timer.
- The order is defined by admin panel (stored as `sortOrder`).

## DTOs (what the app receives)

### PublicRestaurantDTO (mobile)
Returned by `GET /api/restaurants` when the request is NOT an admin session.
```json
{
  "id": 1,
  "name": "Muhtasham",
  "address": "Some address",
  "description": "Some description",
  "status": "Open",
  "image": "/uploads/restaurant.jpg",
  "logo": "/uploads/logo.png",
  "color": "#1a6b3a",
  "open": true,
  "addedAt": "2025-12-24"
}
```
Notes:
- Integration fields are never included here.

### AdminRestaurantDTO (admin only)
`GET /api/restaurants` returns extra fields ONLY when you have an admin cookie session.
The mobile app must never rely on this.
Sensitive fields MUST NOT be exposed to the mobile app:
- `tokenPoster`, `onecLogin`, `onecPassword`, `onecToken`

## 1) Public API (no auth)

### List restaurants
`GET /api/restaurants`

- Response: `PublicRestaurantDTO[]`
- Rate limit: ~120 requests/minute per IP (best-effort).

### Restaurant menu (categories + items)
`GET /api/restaurants/{id}/menu`

Query:
- `lang=ru|uz` (optional)

Behavior:
- By default, hidden categories/items are excluded.
- If `lang` is `ru` or `uz`, the response is “minimal” (only the selected language fields).

Full response example (when `lang` is omitted):
```json
[
  {
    "id": 1,
    "nameRu": "Hot meals",
    "nameUz": "Issiq taomlar",
    "name": "Hot meals",
    "hidden": false,
    "image": "https://joinposter.com/upload/...",
    "items": [
      {
        "id": 10,
        "nameRu": "Plov",
        "nameUz": "Osh",
        "name": "Plov",
        "descriptionRu": "",
        "descriptionUz": "",
        "description": "",
        "price": 25000,
        "image": "https://joinposter.com/upload/...",
        "hidden": false
      }
    ]
  }
]
```
Notes:
- `price` is returned in sums (Poster prices are normalized by the backend).
- Items use this backend's internal IDs (`id`) as `productId` for orders.

## Для Codex приложения: как получить категории и товары из админки

Важно: приложение НЕ ходит в админские эндпоинты. Админка только синхронизирует
меню с Poster/1C в эту БД, а приложение читает публичный API.

### Шаги
1) В админке выполнить синхронизацию меню:
   - `POST /api/restaurants/{id}/menu/sync` (требуется админ-сессия)
2) В приложении загрузить меню:
   - `GET /api/restaurants/{id}/menu`
   - Опционально: `?lang=ru` или `?lang=uz`

### Что важно учитывать
- Публичный ответ НЕ содержит скрытые категории/товары (`hidden = true`).
- Админка видит всё, потому что запрашивает `includeHidden=1` с cookie-сессией.
- Если приложение не видит товары, проверь:
  - правильный `restaurantId`;
  - `hidden` у категории/товаров;
  - что синхронизация меню реально завершилась.

### Пример ответа (публичный)
```json
[
  {
    "id": 1,
    "name": "Горячее",
    "hidden": false,
    "image": "/uploads/category.jpg",
    "items": [
      {
        "id": 10,
        "name": "Плов",
        "description": "",
        "price": 25000,
        "image": "https://joinposter.com/upload/...",
        "hidden": false
      }
    ]
  }
]
```

### Правило для картинок в приложении
Если `image` начинается с `/`, то полный URL:
`BASE_URL + image`.
Иначе использовать как есть.

### Banners
`GET /api/banners`

Query:
- `active=1` (optional, returns only active banners)

Response example:
```json
[
  {
    "id": 1,
    "title": "New year",
    "image": "/uploads/banner.png",
    "status": "Active",
    "open": true,
    "addedAt": "2025-12-24",
    "sortOrder": 1
  }
]
```
Notes:
- Sort/rotation order = `sortOrder` ASC.

### Fees (extra charges)
`GET /api/restaurants/{id}/fees`

Response example:
```json
[
  {
    "id": 1,
    "title": "Delivery",
    "description": "Standard delivery fee",
    "price": 15000,
    "isDefault": true
  }
]
```
Notes:
- Use `isDefault` to identify required fees.

## 2) Client API (JWT)

### Register
`POST /api/clients/register`

Body:
```json
{ "name": "Full Name", "phone": "+998...", "password": "..." }
```

Success response:
```json
{
  "ok": true,
  "accessToken": "<jwt>",
  "client": { "id": 1, "phone": "+998...", "name": "Full Name" }
}
```

### Login
`POST /api/clients/login`

Body:
```json
{ "phone": "+998...", "password": "..." }
```

Success response:
```json
{
  "ok": true,
  "accessToken": "<jwt>",
  "client": { "id": 1, "phone": "+998...", "name": "Full Name" }
}
```

### Client addresses (ONLY via /me)
Auth required:
- `Authorization: Bearer <accessToken>`

Endpoints:
- `GET /api/clients/me/addresses`
- `POST /api/clients/me/addresses`

POST body:
```json
{ "title": "Home", "address": "Street, house, apt" }
```

### Create an order (Poster)
`POST /api/orders`

Auth required:
- `Authorization: Bearer <accessToken>`

Body:
```json
{
  "restaurantId": 1,
  "spotId": 1,
  "items": [
    { "productId": 10, "qty": 2 }
  ],
  "comment": "Order from app"
}
```
Notes:
- `productId` must be the menu item `id` from `GET /api/restaurants/{id}/menu`.
- Backend maps internal menu item → Poster `product_id` (stored as `source_id`) and calls:
  - `https://joinposter.com/api/incomingOrders.create?token=...`
- Poster token never leaves the server.
- Backend requires a positive price; normally it uses the synced menu price.

## 3) Admin API (web admin only)

These endpoints require an admin session cookie (HttpOnly).
The mobile app must not use them.

### Admin session
- `POST /api/login` (sets cookie session)
- `POST /api/logout`
- `GET /api/me` (session info + permissions)

### Restaurants
- `POST /api/restaurants` (auto-creates required fees for the new restaurant)
- `PATCH /api/restaurants/{id}`
- `DELETE /api/restaurants/{id}`

### Menu sync (Poster → backend DB)
- `POST /api/restaurants/{id}/menu/sync`

### Hide categories/items (affects mobile visibility)
- `PATCH /api/menu/categories/{id}` with `{ "hidden": true|false }`
- `PATCH /api/menu/items/{id}` with `{ "hidden": true|false }`

### Banners
- `POST /api/banners`
- `DELETE /api/banners/{id}`
- `POST /api/banners/reorder`

### Fees (per restaurant)
- `GET /api/restaurants/{id}/fees`
- `POST /api/restaurants/{id}/fees` (custom fees)
- `PATCH /api/fees/{id}` (price edit)
- `DELETE /api/fees/{id}` (only non-default fees)

### Clients (admin tools)
- `GET /api/clients`
- `GET /api/clients/{id}/addresses`
- `PATCH /api/clients/{id}/password`

### Employees
- `GET /api/employees`
- `POST /api/employees`
- `PATCH /api/employees/{id}`
- `DELETE /api/employees/{id}`

### Uploads (admin only)
- `POST /api/uploads` (multipart/form-data with `file`)

Important note for production:
- On serverless platforms, filesystem uploads may not persist.
- Use object storage (e.g. S3-compatible) if you need permanent uploads.

## Secrets (never returned to the mobile app)

Server-only fields (MUST NOT be returned by public/client endpoints):
- `tokenPoster`
- `onecLogin`
- `onecPassword`
- `onecToken`
- any database passwords
