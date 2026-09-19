import "./globals.css";

export const metadata = {
  title: "PinBoard AI",
  description: "AI-ассистент для анализа и роста Pinterest-аккаунта",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
