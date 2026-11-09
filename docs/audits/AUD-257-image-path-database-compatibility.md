# AUD-257 — согласование image path между backend и PostgreSQL

Дата: 2026-11-09  
Ветка: `feat/persisted-boards-api`

## Найденная проблема

AUD-256 изменил имена обычных изображений с короткого случайного суффикса на 128-битный криптографический суффикс:

`pins/<timestamp>-<32 hex>.<ext>`

Но SQL-контракт жизненного цикла изображений отставал:
- `managed_pin_image_object_path` из миграции 070 принимал только `{1,16}`;
- `begin_pin_image_upload` из миграции 090 принимал только `{1,16}`;
- `claim_pin_image_deletion` из миграции 083 принимал только `{1,16}`.

Это означало, что новая загрузка не могла пройти резервирование в БД. Более того, URL с новым путём не распознавался бы SQL reference guards как управляемое изображение.

## Исправление

Добавлена миграция `098_pin_image_paths_support_128_bit_random_ids.sql`:
- SQL parser теперь распознаёт до 32 hex-символов;
- upload reservation принимает новые имена;
- deletion claim принимает новые имена;
- короткие legacy-имена продолжают поддерживаться;
- права RPC сохранены: вызов доступен только `service_role`.

Исторические миграции 070/083/090 не изменялись — исправление оформлено отдельной миграцией, чтобы уже развернутые базы могли применить её последовательно.

## Регрессионная проверка

В `backend/test/pin-image-deletion-claims.integration.sql` добавлен сценарий для 32-hex пути:
1. SQL parser распознаёт URL.
2. Upload reservation выдаёт token.
3. Upload finalization подтверждает reservation.
4. Deletion claim выдаёт token.
5. Deletion finalization закрывает lifecycle.

CI применяет миграцию 098 и запускает существующий SQL integration test. В Node lifecycle test исправлена разметка тестового блока и оба сгенерированных имени проверяются на 32 hex-символа.

## Статус проверки

Файлы записаны и подлежат статическому read-back. Локальные Node/PostgreSQL тесты не запускались; CI для нового HEAD должен подтвердить выполнение. Миграция не применялась к production Supabase, реальные Storage-операции не выполнялись, deployment и merge не производились.

## Фактический статус CI на момент read-back

На HEAD `58c8f2d160c93b36e678a7a54e0a1a80844e918a` GitHub показал `Prodamus webhook tests` как `failure`, а `Persisted boards integration checks` как `queued` после повторного запуска failed jobs. Для завершившегося failure GitHub Jobs API вернул `steps=null` и `logs_url=null`, поэтому причина не установлена. Нельзя считать SQL или Node тесты успешно выполненными. Vercel status остаётся `build-rate-limit`.
