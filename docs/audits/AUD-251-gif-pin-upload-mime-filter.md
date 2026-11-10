# AUD-251 — GIF блокировался при загрузке собственного изображения пина

**Дата:** 2026-11-09

## Найденная проблема

Система постоянного хранения уже поддерживала GIF:
- `backend/imageValidation.js` распознаёт сигнатуры GIF87a/GIF89a;
- `backend/pinImageLifecycle.js` включает `image/gif` в допустимые MIME bucket;
- Storage bucket создаётся с allowlist PNG/JPEG/WebP/GIF.

Но Multer-фильтр маршрута `POST /pins/:id/image` разрешал только PNG, JPEG и WebP. Поэтому GIF-файл отклонялся ещё до проверки сигнатуры и сохранения.

## Исправление

- Вынесен единый allowlist в `backend/imageUploadValidation.js`.
- Маршрут загрузки использует `isAllowedPinImageUploadMime`.
- Добавлен GIF наряду с PNG/JPEG/WebP.
- MIME нормализуется: регистр, пробелы и необязательные параметры после `;`.
- SVG, BMP и не-image MIME остаются запрещёнными.
- Добавлен `backend/test/image-upload-validation.test.js`; тест подключён к atomic-payment GitHub Actions workflow.

## Пользовательский эффект

Пользователь сможет загрузить GIF как собственное изображение пина, вместо ошибочного отказа. Проверка реальной сигнатуры изображения остаётся обязательной — подмена расширения или MIME не позволяет загрузить SVG/HTML под видом GIF.

## Проверка и ограничения

- Статически сверены MIME allowlist, Multer route, signature validator и bucket configuration.
- Новый Node-тест добавлен в CI, но локально не запускался.
- Результат CI для нового HEAD ещё не подтверждён.
- Production, Supabase Storage и рабочая БД не затрагивались.
