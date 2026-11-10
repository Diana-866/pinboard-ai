import test from "node:test";
import assert from "node:assert/strict";
import { clearAuthToken, readAuthToken, readLocalStorageValue, writeAuthToken } from "./authStorage";

function withWindow(value: unknown, run: () => void) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value });
  try { run(); } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
}

test("reads, writes and clears an auth token", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  withWindow({ localStorage: storage }, () => {
    assert.equal(writeAuthToken("valid-token"), true);
    assert.equal(readAuthToken(), "valid-token");
    clearAuthToken();
    assert.equal(readAuthToken(), null);
  });
});

test("fails closed without throwing when localStorage access itself is blocked", () => {
  withWindow({ get localStorage() { throw new Error("SecurityError"); } }, () => {
    assert.equal(readAuthToken(), null);
    assert.equal(readLocalStorageValue("pinposy_lang"), null);
    assert.equal(writeAuthToken("valid-token"), false);
    assert.doesNotThrow(clearAuthToken);
  });
});

test("fails closed when localStorage methods throw", () => {
  const storage = {
    getItem: () => { throw new Error("SecurityError"); },
    setItem: () => { throw new Error("SecurityError"); },
    removeItem: () => { throw new Error("SecurityError"); },
  };
  withWindow({ localStorage: storage }, () => {
    assert.equal(readAuthToken(), null);
    assert.equal(writeAuthToken("valid-token"), false);
    assert.doesNotThrow(clearAuthToken);
  });
});

test("rejects empty or non-string tokens", () => {
  const storage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  withWindow({ localStorage: storage }, () => {
    assert.equal(writeAuthToken(" "), false);
    assert.equal(writeAuthToken(null), false);
    assert.equal(readAuthToken(), null);
  });
});
