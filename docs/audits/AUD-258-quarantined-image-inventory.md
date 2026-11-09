# AUD-258 — Инвентаризация quarantined image objects

## Проблема
После неоднозначного ответа Storage путь изображения переводится в `quarantined`, чтобы поздняя загрузка/удаление не привела к повторной записи или повреждению ссылок. Это безопасно для целостности данных, но скрывает от оператора, остался ли физический объект в Storage.

## Изменения
- Добавлена миграция `099_pin_image_quarantine_inventory.sql` с RPC `list_quarantined_pin_image_objects(limit)`.
- RPC возвращает только метаданные quarantined-записей и признак наличия ссылок в pins, schedules и generation journals. Прямой доступ к таблице не предоставляется; execute разрешён только `service_role`.
- Добавлена backend-функция `inspectQuarantinedPinImageObjects`: проверяет формат пути, сверяет точный объект через Storage listing и классифицирует его как `object_present`, `object_absent`, ошибку инвентаризации или некорректную запись.
- Добавлен защищённый admin endpoint `GET /admin/storage/quarantined-objects?limit=50` (лимит 1–100, rate limit, auth и admin gate).
- Добавлены Node unit tests и SQL integration assertions; миграция включена в atomic-payment CI.

## Гарантии безопасности
- Endpoint только читает; не вызывает Storage remove, deletion claim, finalize или unquarantine.
- Даже если объект виден и ссылок нет, автоматическое удаление не запускается: quarantined путь мог быть затронут ещё выполняющимся удалённым запросом.
- Если найдена ссылка, результат требует отдельного расследования до любых действий.
- Неизвестные или некорректные object paths не передаются в Storage listing.

## Проверка и ограничения
- Изменения записаны в ветку `feat/persisted-boards-api`; после записи необходимо перепроверить файлы и CI.
- Локальные Node/PostgreSQL тесты здесь не выполнялись.
- Миграция 099 не применялась к рабочей Supabase базе. Production Storage, deployment и merge не затрагивались.
