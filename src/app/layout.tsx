import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Amazon College | Lead Management",
  description: "Lead Management System for Amazon College",
  icons: {
    icon: "/images/amazon-logo.jpeg",
    shortcut: "/images/amazon-logo.jpeg",
    apple: "/images/amazon-logo.jpeg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster
          richColors
          position="top-right"
          toastOptions={{ classNames: { toast: "z-[9999]" } }}
        />
      </body>
    </html>
  );
}
