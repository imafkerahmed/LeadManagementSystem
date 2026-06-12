"use client";

import Image from "next/image";
import React, { useState } from "react";
import { Menu, X } from "lucide-react";

type Props = {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  sidebar?: React.ReactNode;
  headerRight?: React.ReactNode;
  hideHeader?: boolean;
  children?: React.ReactNode;
};

export default function AppShell({
  title,
  subtitle,
  sidebar,
  headerRight,
  hideHeader,
  children,
}: Props) {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#fafbfc] text-[#1e293b] antialiased">
      <div className="flex h-screen overflow-hidden">
        {sidebar ? (
          <>
            {/* Desktop Sidebar (always visible on lg screens, hidden on mobile/tablet) */}
            <aside className="hidden lg:flex w-68 bg-white border-r border-slate-200/80 flex flex-col text-slate-700 shadow-[4px_0_24px_rgba(15,23,42,0.03)] relative z-20 shrink-0">
              {sidebar}
            </aside>

            {/* Mobile Sidebar Overlay (visible on mobile when open) */}
            {isMobileSidebarOpen && (
              <div className="fixed inset-0 z-50 lg:hidden">
                {/* Backdrop */}
                <div 
                  className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 animate-fade-in"
                  onClick={() => setIsMobileSidebarOpen(false)}
                />
                
                {/* Drawer content */}
                <aside className="fixed inset-y-0 left-0 w-68 bg-white flex flex-col text-slate-700 shadow-2xl z-50 animate-slide-right">
                  {/* Close button inside mobile drawer */}
                  <div className="flex justify-end p-4 border-b border-slate-100 shrink-0">
                    <button 
                      onClick={() => setIsMobileSidebarOpen(false)}
                      className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
                      title="Close Menu"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto" onClick={() => setIsMobileSidebarOpen(false)}>
                    {sidebar}
                  </div>
                </aside>
              </div>
            )}
          </>
        ) : null}

        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Main App Header (shown on large screens, or mobile when not hideHeader) */}
          {!hideHeader && (
            <header className="border-b border-slate-100 bg-white/70 backdrop-blur-md px-4 py-3 sm:px-8 sm:py-5 flex items-center justify-between shadow-sm relative z-10 shrink-0">
              <div className="mx-auto w-full max-w-7xl flex items-center justify-between gap-2 sm:gap-3">
                <div className="flex items-center gap-2.5 sm:gap-4">
                  {sidebar && (
                    <button
                      onClick={() => setIsMobileSidebarOpen(true)}
                      className="lg:hidden p-2 -ml-2 rounded-xl text-slate-600 hover:bg-slate-50 border border-slate-200/50 bg-white shadow-sm flex items-center justify-center cursor-pointer"
                      title="Open Menu"
                    >
                      <Menu className="h-5 w-5" />
                    </button>
                  )}
                  <div className="relative h-10 w-10 sm:h-12 sm:w-12 rounded-xl overflow-hidden shadow-sm border border-slate-100 flex-shrink-0 bg-white">
                    <Image
                      src="/images/amazon-logo.jpeg"
                      alt="Amazon College Logo"
                      fill
                      className="object-cover"
                    />
                  </div>
                  <div>
                    <h1 className="text-sm font-extrabold tracking-tight sm:text-xl text-slate-900 leading-tight">
                      {title}
                    </h1>
                    {subtitle ? (
                      <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 font-medium">
                        {subtitle}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div>{headerRight}</div>
              </div>
            </header>
          )}

          {/* Mobile-only header when hideHeader is true but sidebar is present (Admin Panel) */}
          {hideHeader && sidebar && (
            <header className="lg:hidden border-b border-slate-100 bg-white/70 backdrop-blur-md px-4 py-3 flex items-center justify-between shadow-sm relative z-10 shrink-0">
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => setIsMobileSidebarOpen(true)}
                  className="p-2 -ml-2 rounded-xl text-slate-600 hover:bg-slate-50 border border-slate-200/50 bg-white shadow-sm flex items-center justify-center cursor-pointer"
                  title="Open Menu"
                >
                  <Menu className="h-5 w-5" />
                </button>
                <div className="relative h-8 w-8 rounded-lg overflow-hidden shadow-sm border border-slate-100 flex-shrink-0 bg-white">
                  <Image
                    src="/images/amazon-logo.jpeg"
                    alt="Amazon College Logo"
                    fill
                    className="object-cover"
                  />
                </div>
                <h1 className="text-sm font-extrabold tracking-tight text-slate-900 leading-tight">
                  Lead Management
                </h1>
              </div>
            </header>
          )}

          <main className="flex-1 overflow-y-auto px-4 py-4 sm:px-8 sm:py-8 bg-[#fafbfc]">
            <div className="mx-auto transition-all duration-300 max-w-7xl">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
