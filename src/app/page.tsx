"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import AppShell from "@/components/layout/AppShell";
import { Eye, EyeOff } from "lucide-react";
import { createPocketBaseClient } from "@/lib/pocketbase";

type LoginFormState = {
  email: string;
  password: string;
};

export default function Home() {
  const router = useRouter();
  const [form, setForm] = useState<LoginFormState>({ email: "", password: "" });
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const disabledAccountMessage =
    "This account is disabled. Contact an administrator.";

  useEffect(() => {
    const pb = createPocketBaseClient();
    const authUser = pb.authStore.model as {
      role?: string;
      accountStatus?: string;
    } | null;

    if (!pb.authStore.isValid || !authUser?.role) {
      return;
    }

    if ((authUser.accountStatus || "").toLowerCase() === "disabled") {
      pb.authStore.clear();
      const timer = window.setTimeout(
        () => setError(disabledAccountMessage),
        0,
      );
      return () => window.clearTimeout(timer);
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

      const authUser = pb.authStore.model as {
        role?: string;
        accountStatus?: string;
      } | null;

      // Block login immediately if the account is disabled
      if ((authUser?.accountStatus || "").toLowerCase() === "disabled") {
        pb.authStore.clear();
        setError(disabledAccountMessage);
        return;
      }

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
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.toLowerCase().includes("disabled")) {
        setError(disabledAccountMessage);
        return;
      }

      setError("Invalid email or password.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AppShell title="Amazon College" headerRight={<></>} hideHeader>
      <div className="min-h-screen bg-[#fafbfc] px-4 py-8 text-[#1e293b] antialiased sm:px-6 sm:py-10">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center justify-center">
          <div className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="mb-6 flex flex-col items-center justify-center space-y-2 text-center">
              <div className="relative h-28 w-28 mb-2 rounded-2xl overflow-hidden shadow-sm border border-slate-100 flex-shrink-0 bg-white">
                <Image
                  src="/images/amazon-logo.jpeg"
                  alt="Amazon College Logo"
                  fill
                  className="object-cover"
                />
              </div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Amazon College Lead Management
              </p>
              <h1 className="text-2xl font-semibold tracking-tight">Login</h1>
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
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={form.password}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        password: e.target.value,
                      }))
                    }
                    placeholder="Your password"
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 pr-10 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition focus:outline-none"
                    tabIndex={-1}
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold tracking-wide text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 shadow-sm"
              >
                {isLoading ? "Signing in..." : "Sign In"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
