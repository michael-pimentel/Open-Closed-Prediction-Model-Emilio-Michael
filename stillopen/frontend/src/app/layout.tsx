import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "StillOpen | Open or Closed Prediction",
  description: "Open or Closed prediction model powered by open source data.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 flex flex-col min-h-screen`}>
        <Navbar />
        <main className="flex-1 flex flex-col items-center">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
