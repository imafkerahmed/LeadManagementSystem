"use client";

import Image from "next/image";
import React from "react";

export default function AdminSidebarHeader() {
  return (
    <>
      <div className="px-5 py-8 border-b border-slate-100/80 bg-white flex flex-col items-center text-center gap-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50/80 via-transparent to-transparent pointer-events-none" />

        <div className="flex flex-col items-center gap-4 relative z-10">
          <div className="relative h-24 w-24 rounded-[1.5rem] overflow-hidden shadow-sm shadow-slate-200/50 border border-slate-100 flex-shrink-0 bg-white">
            <Image
              src="/images/amazon-logo.jpeg"
              alt="Amazon College Logo"
              fill
              className="object-cover p-1"
            />
          </div>
          <div className="flex flex-col gap-0.5 items-center">
            <h1 className="text-xl font-black tracking-tight text-slate-900 leading-tight">
              Lead Management
            </h1>
            <span className="text-lg font-extrabold bg-gradient-to-r from-blue-600 to-indigo-500 bg-clip-text text-transparent w-fit">
              System
            </span>
          </div>
        </div>

        <div className="relative z-10 mt-1">
          <div className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200/60 rounded-xl shadow-sm">
            <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            <p className="text-[11px] text-slate-600 font-bold uppercase tracking-widest">
              Amazon College
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
