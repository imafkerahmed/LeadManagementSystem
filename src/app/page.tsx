import { checkPocketBaseHealth, pocketBaseUrl } from "@/lib/pocketbase";

export default async function Home() {
  const pocketBase = await checkPocketBaseHealth();

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.18),_transparent_34%),linear-gradient(135deg,_#09121f_0%,_#0f1b2d_48%,_#111827_100%)] text-slate-100">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-6 py-16 sm:px-10 lg:px-12">
        <div className="grid w-full gap-8 lg:grid-cols-[1.35fr_0.9fr] lg:gap-10">
          <div className="space-y-8">
            <div className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm font-medium text-emerald-200">
              PocketBase connected to the app layer
            </div>

            <div className="max-w-2xl space-y-5">
              <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
                Lead management, now wired to your PocketBase backend.
              </h1>
              <p className="max-w-xl text-base leading-7 text-slate-300 sm:text-lg">
                This Next.js app is configured to talk to your PocketBase
                instance at{" "}
                <span className="font-medium text-white">{pocketBaseUrl}</span>.
                You can now start building auth, leads, notes, and activity
                screens on top of the backend.
              </p>
            </div>

            <div className="flex flex-wrap gap-3 text-sm">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
                <div className="text-slate-400">Backend URL</div>
                <div className="mt-1 font-medium text-white">
                  {pocketBaseUrl}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
                <div className="text-slate-400">Health check</div>
                <div className="mt-1 font-medium text-white">/api/health</div>
              </div>
            </div>
          </div>

          <aside className="rounded-[2rem] border border-white/10 bg-slate-950/55 p-6 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-slate-400">
                  Connection status
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  PocketBase endpoint
                </h2>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${
                  pocketBase.ok
                    ? "bg-emerald-400/15 text-emerald-300"
                    : "bg-amber-400/15 text-amber-200"
                }`}
              >
                {pocketBase.ok ? "Healthy" : "Check needed"}
              </span>
            </div>

            <div className="mt-8 space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm text-slate-400">Request URL</div>
                <div className="mt-2 break-all font-mono text-sm text-slate-100">
                  {pocketBase.healthUrl}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm text-slate-400">Response</div>
                <div className="mt-2 text-sm leading-6 text-slate-200">
                  {pocketBase.ok
                    ? `PocketBase responded with HTTP ${pocketBase.status}.`
                    : `PocketBase could not be reached. ${pocketBase.body}`}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                <div className="text-sm text-slate-400">Next step</div>
                <div className="mt-2 text-sm leading-6 text-slate-200">
                  Add collections for leads, contacts, activities, and notes,
                  then read and write them through the PocketBase client.
                </div>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
