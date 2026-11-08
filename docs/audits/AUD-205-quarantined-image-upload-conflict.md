# AUD-205 — Report quarantined image uploads as conflicts

## Finding

The image lifecycle can permanently quarantine an object path when an earlier Storage request has an ambiguous outcome and may still complete later. This is an intentional safety fence: the same deterministic path must not be reused while a late write could overwrite an object. The upload layer returned an internal-server-error response for the `path_quarantined` reservation refusal, which incorrectly presented a permanent lifecycle conflict as a generic server failure.

## Change

- `uploadPinImage` now maps the explicit `path_quarantined` lifecycle result to HTTP 409 Conflict.
- The response explains that saving was stopped to protect against duplicate/late writes and that a safe retry is required.
- Added a regression test proving that this condition is surfaced as 409 rather than 500.

## User impact

If an old upload path has been quarantined for safety, PinPosy no longer tells the user that an ordinary internal server error occurred. The response makes clear that this particular save was blocked by the image-safety mechanism. It does not silently reopen or overwrite the quarantined object.

## Verification

- Reviewed the updated storage handler and regression test on the feature branch.
- Node tests were not executed in this environment; there is no local checkout with installed dependencies.
- No production database, Storage bucket, provider account, payment flow, or deployment was changed.

## Дополнительное исправление: не путать сбой Storage со сбоем провайдера

### Finding

В `rehostImage` загрузка изображения от AI-провайдера и запись в постоянный Storage находились в одном блоке обработки ошибок. Если скачивание проходило успешно, но загрузка в Storage или фиксация lifecycle-журнала завершалась ошибкой, backend мог вернуть HTTP 502 с сообщением о проблеме получения изображения у провайдера. Это скрывало реальное место сбоя и мешало понять, что нужно повторить восстановление сохранения.

### Change

- Разделил скачивание provider result и запись в Storage на отдельные error boundaries.
- Ошибки скачивания по-прежнему возвращают 502.
- Ошибки Storage/lifecycle теперь сохраняют собственный HTTP-статус и сообщение, включая 409/503.
- Добавлен regression test: после успешного mock-скачивания ошибка Storage 503 должна выйти наружу как 503, а не как 502.

### User impact

Если картинка уже получена от провайдера, но постоянное сохранение временно не удалось, PinPosy больше не сообщает, будто провайдер не отдал изображение. Это точнее показывает проблему и не маскирует защитные статусы восстановления.

### Verification update

- Проверены актуальные исходники и regression test на feature branch.
- Node-тесты по-прежнему не запускались: нет локального checkout с установленными зависимостями.
- Production и рабочая база не затрагивались.
