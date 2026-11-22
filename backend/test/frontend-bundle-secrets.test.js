"use strict";

require("./helpers/env");

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Дни 10–11 плана: `service_role` не должен попадать в бандл фронтенда.
 *
 * Vite подставляет в бандл любое значение, начинающееся с `VITE_`, поэтому список таких
 * переменных — это и есть список всего, что уедет в браузер. Проверка идёт по исходникам,
 * а не по собранному dist: сборка на машине разработки не запускается, а исходники
 * содержат ту же информацию о том, что запрошено у сборщика.
 */
const FRONTEND_SRC = path.join(__dirname, "..", "..", "frontend", "src");

// Разрешено ровно одно: адрес API. Он не секрет и всё равно виден в сети.
const ALLOWED_VITE_VARS = new Set(["VITE_API_URL"]);
const FORBIDDEN = [/service_role/i, /SUPABASE_SERVICE_ROLE_KEY/, /SUPABASE_DB_PASSWORD/];

// Тест-файлы исключены только из проверок 3–4: проверка отсутствия обязана называть строку,
// которую запрещает (`assert.doesNotMatch(..., /service_role/)`), иначе она ничего не проверяет.
// В бандл тесты не попадают, потому что ни один входной файл их не импортирует.
const isTestFile = (file) => /\.test\.(ts|tsx)$/.test(file);

function sourceFiles(dir = FRONTEND_SRC, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      sourceFiles(full, acc);
    } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

test("the scan looks at the real frontend sources", () => {
  const files = sourceFiles();
  assert.ok(files.length > 100, `expected the frontend sources, found ${files.length} files`);
});

test("only the API address may be compiled into the bundle", () => {
  const found = new Map();
  for (const file of sourceFiles()) {
    const text = fs.readFileSync(file, "utf8");
    for (const match of text.matchAll(/VITE_[A-Z0-9_]+/g)) {
      const name = match[0];
      if (!found.has(name)) found.set(name, path.relative(FRONTEND_SRC, file));
    }
  }
  // Политика, а не только совпадение: в бандл уходит ровно один адрес API.
  assert.deepEqual([...ALLOWED_VITE_VARS], ["VITE_API_URL"], "the allowlist itself must stay at one API address");
  const unexpected = [...found.keys()].filter((name) => !ALLOWED_VITE_VARS.has(name));
  assert.deepEqual(
    unexpected,
    [],
    `these variables would be baked into the public bundle: ${unexpected.map((name) => `${name} (${found.get(name)})`).join(", ")}`
  );
});

test("no server-only secret name appears in the frontend", () => {
  const hits = [];
  for (const file of sourceFiles().filter((file) => !isTestFile(file))) {
    const text = fs.readFileSync(file, "utf8");
    for (const pattern of FORBIDDEN) {
      const match = pattern.exec(text);
      if (match) hits.push(`${path.relative(FRONTEND_SRC, file)}: ${match[0]}`);
    }
  }
  // Тест-файлы тоже проверяются: исключение для них стало бы дырой для будущего кода.
  assert.deepEqual(hits, [], `server-only secrets referenced in the frontend: ${hits.join(", ")}`);
});

test("environment access is explicit, not looked up by key", () => {
  const dynamic = [];
  for (const file of sourceFiles().filter((file) => !isTestFile(file))) {
    const text = fs.readFileSync(file, "utf8");
    // `import.meta.env[someKey]` вытащил бы в бандл любую переменную, включая секреты.
    // Код пишет `(import.meta as any).env?.VITE_API_URL`, поэтому приведение типа между
    // `import.meta` и `.env` допускается: иначе проверка не видит реальную форму записи.
    if (/import\.meta[^;]{0,32}\.env\s*\[/.test(text) || /process\.env\s*\[/.test(text)) {
      dynamic.push(path.relative(FRONTEND_SRC, file));
    }
  }
  assert.deepEqual(dynamic, [], `environment must be read by name: ${dynamic.join(", ")}`);
});

const DIST = path.join(__dirname, "..", "..", "frontend", "dist");

test("a built bundle carries no server secrets", (t) => {
  // Проверка исходников не видит того, что подставил сборщик. Если каталог сборки есть,
  // он проверяется целиком: на сервере это делается после каждого `vite build`.
  if (!fs.existsSync(DIST)) {
    t.skip("frontend/dist is absent; run `npm run build` in frontend/ to check a real bundle");
    return;
  }
  const hits = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.(js|css|html|map)$/.test(entry.name)) {
        const text = fs.readFileSync(full, "utf8");
        for (const pattern of FORBIDDEN) {
          if (pattern.test(text)) hits.push(`${path.relative(DIST, full)}: ${pattern}`);
        }
        if (/postgres(ql)?:\/\//.test(text)) hits.push(`${path.relative(DIST, full)}: database url`);
      }
    }
  };
  walk(DIST);
  assert.deepEqual(hits, [], `secrets inside the built bundle: ${hits.join(", ")}`);
});
