"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createPocketBaseClient } from "@/lib/pocketbase";
import React from "react";

type Props = {
  counselorName?: string;
};

export default function CounselorHeader({ counselorName }: Props) {
  const router = useRouter();

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="relative h-12 w-12 rounded-xl overflow-hidden shadow-sm border border-slate-100 flex-shrink-0 bg-white">
            <Image
              src="/images/amazon-logo.jpeg"
              alt="Amazon College Logo"
              fill
              className="object-cover"
            />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight sm:text-xl text-slate-900 leading-tight">
              Amazon College
            </h1>
            <p
              className="text-[13px] font-medium text-slate-500"
              suppressHydrationWarning
            >
              {counselorName}
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            const pb = createPocketBaseClient();
            pb.authStore.clear();
            router.replace("/");
          }}
          className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>
    </header>
  );
}
