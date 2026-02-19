import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "../components/Navbar";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "StillOpen | Operational Status Prediction",
  description: "AI-powered business status prediction using metadata intelligence.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased bg-gray-50 text-gray-900 flex flex-col min-h-screen`}>
        <Navbar />
        <main className="flex-1 flex flex-col items-center">
          {children}
        </main>
      </body>
    </html>
  );
}
