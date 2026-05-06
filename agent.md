# Lead Management System Guide

This project is a Next.js app with TypeScript, Tailwind CSS, PocketBase, and shadcn/ui.

## First-time setup

1. Install dependencies:

```bash
npm install
```

2. Run the app:

```bash
npm run dev
```

3. Build for production:

```bash
npm run build
```

## Environment files

- `.env.local` is for your local values and should not be committed.
- `.env.example` shows the required variables for new setup.

### PocketBase variables

- `NEXT_PUBLIC_POCKETBASE_URL` is the public URL used by the app.
- `POCKETBASE_ADMIN_EMAIL` and `POCKETBASE_ADMIN_PASSWORD` are for server-side admin use only.

## PocketBase connection

- Current backend URL: `https://amazoncrm-db.codix.site`
- Health endpoint: `/api/health`
- A successful connection returns HTTP 200 and `{"message":"API is healthy."}`.

## shadcn/ui

- shadcn is initialized in this project.
- Generated config: `components.json`
- UI components live in `src/components/ui/`
- Shared helpers live in `src/lib/utils.ts`

### Add a component

```bash
npx shadcn@latest add button
```

## Repo notes

- `AGENTS.md` contains agent-specific instructions for tooling and edits.
- Keep secrets in `.env.local` only.
