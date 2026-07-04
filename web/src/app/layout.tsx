import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

// IoT Home uses a single family everywhere (display / body / label).
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Điểm Tin AI — Hỏi-đáp tin tức",
  description: "Chatbot RAG hỏi-đáp tin tức tiếng Việt, trả lời kèm trích dẫn nguồn.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={`${manrope.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
