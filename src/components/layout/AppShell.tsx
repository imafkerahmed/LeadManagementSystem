"use client";

import Image from "next/image";
import React from "react";

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
  return (
    <div className="min-h-screen bg-[#fafbfc] text-[#1e293b] antialiased">
      <div className="flex h-screen overflow-hidden">
        {sidebar ? (
          <aside className="w-68 bg-white border-r border-slate-200/80 flex flex-col text-slate-700 shadow-[4px_0_24px_rgba(15,23,42,0.03)] relative z-20">
            {sidebar}
          </aside>
        ) : null}

        <div className="flex-1 flex flex-col overflow-hidden">
          {!hideHeader && (
            <header className="border-b border-slate-100 bg-white/70 backdrop-blur-md px-4 py-3 sm:px-8 sm:py-5 flex items-center justify-between shadow-sm relative z-10">
              <div className="mx-auto w-full max-w-7xl flex items-center justify-between gap-2 sm:gap-3">
                <div className="flex items-center gap-2.5 sm:gap-4">
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

          <main className="flex-1 overflow-y-auto px-8 py-8 bg-[#fafbfc]">
            <div className="mx-auto transition-all duration-300 max-w-7xl">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
