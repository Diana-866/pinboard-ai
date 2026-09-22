"use client";
import { useEffect, useState } from "react";
import { apiRequest } from "../../../lib/api";

export default function CreditsPage() {
  const [balance, setBalance] = useState(null);
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    apiRequest("/credits").then((data) => {
      setBalance(data.balance);
      setTransactions(data.transactions);
    });
  }, []);

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Кредиты</h1>

      <div className="mt-6 rounded-2xl border border-border bg-surface p-6">
        <p className="text-sm text-ink-soft">Текущий баланс</p>
        <p className="mt-1 text-3xl font-semibold text-ink">{balance === null ? "..." : balance}</p>
      </div>

      <div className="mt-8">
        <p className="mb-3 text-sm font-medium text-ink">История операций</p>
        {transactions.length === 0 ? (
          <p className="text-sm text-ink-soft">Пока пусто.</p>
        ) : (
          <div className="space-y-2">
            {transactions.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-xl border border-border bg-surface p-4">
                <div>
                  <p className="text-sm text-ink">{t.description}</p>
                  <p className="text-xs text-ink-soft">{new Date(t.created_at).toLocaleString("ru-RU")}</p>
                </div>
                <p className={`text-sm font-medium ${t.amount > 0 ? "text-green-600" : "text-ink"}`}>
                  {t.amount > 0 ? "+" : ""}
                  {t.amount}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}