export const THEMES = [
  { id: "light-rose", label: "Светлая — розовый" },
  { id: "light-mono", label: "Светлая — чёрный" },
  { id: "dark-rose", label: "Тёмная — розовый" },
  { id: "dark-mono", label: "Тёмная — монохром" },
];

export function getTheme() {
  if (typeof window === "undefined") return "light-rose";
  return localStorage.getItem("theme") || "light-rose";
}

export function setTheme(theme) {
  localStorage.setItem("theme", theme);
  document.documentElement.setAttribute("data-theme", theme);
}