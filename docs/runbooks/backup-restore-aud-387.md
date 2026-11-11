# PinPosy — согласованная резервная копия PostgreSQL + Storage + secrets (AUD-387)

> Runbook для staging/изолированного восстановления. Не является разрешением менять production или получать секреты.

## 1. Перед созданием backup

- Определить независимый backup provider/account и доступы минимум двух уполномоченных операторов.
- Зафиксировать commit SHA, диапазон миграций, источник/регион и временное окно.
- Выбрать consistency strategy: короткая согласованная пауза записей и Storage cleanup либо versioned object copy с последующей сверкой.
- Проверить, что PostgreSQL backup и объектная копия шифруются и имеют независимые retention/immutable controls.

## 2. Создать единый backup-set manifest

- DB snapshot/export ID, timestamp, format, checksum, table/row counts, schema/migration revision.
- Storage bucket/object inventory timestamp, exact object paths, object count, bytes, content types and checksums.
- Commit SHA и миграции.
- Имена секретов и версии/ссылки в secret vault, без самих значений. Особо сохранить применимые active и previous Pinterest token encryption keys.
- Retention expiry, access owners, backup provider/account, verification result.

Не отмечать набор успешным, пока не подтверждены и база, и байты Storage. Публичный URL не является резервной копией файла.

## 3. Восстановление в изоляции

1. Создать отдельные recovery DB и Storage bucket/project; исходные ресурсы не перезаписывать.
2. Восстановить PostgreSQL из реального backup и сверить schema, migration history, functions, triggers, grants, row counts, sequences, FK и финансовые итоги.
3. Восстановить Storage с теми же object paths; сравнить количество объектов, суммарные байты и checksums.
4. Подключить backend к изолированным ресурсам; получить credentials и active/previous encryption keys только из secret vault.
5. Проверить тестовую расшифровку Pinterest token; не публиковать реальные пины.
6. Сверить credits/ledger, subscriptions/Prodamus receipts, generation journals, email outbox, Pinterest schedules/attempts/publication ledger и изображения.
7. Держать реальные платежи, generation, email dispatch, Pinterest worker/cron и production traffic выключенными.
8. Зафиксировать фактический RPO и RTO, расхождения, оператора, manifest ID и commit SHA.

## 4. Критерий успешности

Restore drill считается успешным только если DB integrity, финансовые сверки, Storage checksums и тест расшифровки проходят на изолированном окружении. Схема, собранная из миграций на пустой БД, не считается restore drill.

## Текущий статус

По состоянию на 2026-11-11 независимый backup pipeline, Storage backup и restore drill в репозитории не подтверждены. Настройки провайдера не проверялись. RPO/RTO неизвестны. Production не изменялся.