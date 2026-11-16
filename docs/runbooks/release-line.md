# Какая ветка — рабочая (release line)

**Актуальность:** 2026-11-16. Этот документ заменяет устаревшее описание от 2026-11-11.

## Текущая release line

Рабочая ветка проекта — **main**. На момент сверки HEAD:
e667feb0e97aad72f7af25911ae2e99d02956dc4.

| Ветка / объект | Состояние при сверке | Решение |
|---|---|---|
| main | актуальная release line; содержит backend/frontend, миграции 001 + 010–148 и текущие проверки | продолжать разработку здесь |
| feat/persisted-boards-api | вершина b2f695a9bc1b74330864b04a88ea05b3aec6b541, старый снимок feature work | не использовать как deployment/release source |
| PR #90 | Draft/open: Windows self-hosted verification workflow; нет подтверждения доступного matching runner | не merge до отдельной проверки и review |

**Не выполняй** команды из старой версии этого документа: git reset --hard feat/persisted-boards-api, git push --force-with-lease origin main или любой другой history rewrite. Они могут отбросить текущий продукт и накопленные изменения.

## Что проверено

- На main находится канонический migration baseline 001_baseline.sql и непрерывная активная последовательность 010–148 (139 файлов); migration 009 архивирована.
- scripts/verify.sh и scripts/verify.ps1 проверяют migration chain на disposable DB. Отдельный scripts/verify-integration.ps1 выполняет upgrade fixture и 46 SQL integration tests на выделенной локальной PostgreSQL.
- Последние GitHub Actions runs, доступные на момент сверки, завершались до первого шага: job без назначенного runner (runner_id=0, steps=[]). Это не PASS и не доказательство дефекта приложения.
- Vercel status на HEAD e667feb сообщал Deployment rate limited — retry in 24 hours; deployment/build не подтверждён.
- PR #90 остаётся draft/open; сам по себе он не является выполненной проверкой.

## Release gates (не обходить)

1. Закрыть UA-004: выполнить SQL integration runner на выделенном Windows PostgreSQL 18.6 и проверить успешный cleanup.
2. Только после SQL PASS подготовить отдельную disposable DB и выполнить девять Bash concurrency tests по инструкции, которую будет подготовлено отдельно (UA-005).
3. Затем выполнить backend Node suite и frontend lint/typecheck/tests/build в порядке docs/PROJECT_STATE.md.
4. Проверить актуальные deployment statuses, конфигурацию и миграционный state.
5. Выполнить staging smoke / restore rehearsal, review открытых PR и только после этого отдельно согласовать production rollout.

До прохождения gates не объявлять продукт production-ready и не применять миграции к production. Все статусы и результаты фиксировать в docs/PROJECT_STATE.md.
