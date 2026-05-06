"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createPocketBaseClient } from "@/lib/pocketbase";

type LoginFormState = {
  email: string;
  password: string;
};

export default function Home() {
  const router = useRouter();
  const [form, setForm] = useState<LoginFormState>({ email: "", password: "" });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const pb = createPocketBaseClient();
    const authUser = pb.authStore.model as { role?: string } | null;

    if (!pb.authStore.isValid || !authUser?.role) {
      return;
    }

    if (authUser.role === "admin") {
      router.replace("/admin");
      return;
    }

    if (authUser.role === "student-counsellor") {
      router.replace("/counselor");
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const pb = createPocketBaseClient();
      await pb
        .collection("users")
        .authWithPassword(form.email.trim(), form.password);

      const authUser = pb.authStore.model as { role?: string } | null;

      if (!authUser?.role) {
        pb.authStore.clear();
        setError(
          "Unable to determine your role. Please contact an administrator.",
        );
        return;
      }

      if (authUser.role === "admin") {
        router.replace("/admin");
        return;
      }

      if (authUser.role === "student-counsellor") {
        router.replace("/counselor");
        return;
      }

      pb.authStore.clear();
      setError("This account role is not allowed to access the system.");
    } catch {
      setError("Invalid email or password.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-slate-900 sm:px-6 sm:py-10">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center justify-center">
        <div className="w-full rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-6 space-y-2 text-center">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Amazon College Lead Management
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">Login</h1>
            <p className="text-sm text-slate-600">
              Enter your PocketBase email and password.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(e) =>
                  setForm((current) => ({
                    ...current,
                    email: e.target.value,
                  }))
                }
                placeholder="name@college.com"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">
                Password
              </label>
              <input
                type="password"
                autoComplete="current-password"
                value={form.password}
                onChange={(e) =>
                  setForm((current) => ({
                    ...current,
                    password: e.target.value,
                  }))
                }
                placeholder="Your password"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              />
            </div>

            {error && (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
