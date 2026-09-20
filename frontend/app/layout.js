import "./globals.css";

export const metadata = {
  title: "PinSprig",
  description: "AI-ассистент для анализа и роста Pinterest-аккаунта",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var theme = localStorage.getItem("theme") || "light-rose";
                  document.documentElement.setAttribute("data-theme", theme);
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
