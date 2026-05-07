# PocketBase Collection Setup Guide

## Option 1: Web UI (Easiest) ✅

1. Start the development server:

   ```bash
   npm run dev
   ```

2. Visit: `http://localhost:3000/setup`

3. Click the **"✨ Initialize Collections"** button

4. Wait for the confirmation message

5. Go back to home page and start using the system!

---

## Option 2: Node.js Script

Run the setup script directly:

```bash
node scripts/setup-pocketbase.js
```

**Requirements:**

- Environment variables must be set in `.env.local`
- PocketBase admin credentials

---

## Option 3: Manual Setup (PocketBase Admin UI)

1. Open: `https://amazoncrm-db.codix.site/_/`

2. Sign in with admin credentials

3. Create collections manually:

### Collection 1: `users`

**Fields:**

- `email` (Email, Required)
- `name` (Text, Required)
- `role` (Select: admin, student-counsellor | Required)
- `accountStatus` (Select: active, disabled | Required)

### Collection 2: `leads`

**Fields:**

- `leadId` (Text, Required)
- `studentName` (Text, Required)
- `mobile` (Text, Required)
- `email` (Email)
- `course` (Text, Required)
- `leadSource` (Text, Required)
- `status` (Select: New, Contacted, Follow-up, Registered, Lost | Required)
- `assignedTo` (Text, Required)
- `comments` (Text)
- `commentLog` (JSON)
- `lastModified` (Date)

### Collection 3: `leadHistory`

**Fields:**

- `leadId` (Text, Required)
- `studentName` (Text, Required)
- `eventType` (Text, Required)
- `changedBy` (Text, Required)
- `oldValue` (Text)
- `newValue` (Text)
- `comment` (Text)

---

## Verification

After setup, you should see these collections in PocketBase Admin:

- ✅ users
- ✅ leads
- ✅ leadHistory

---

## Troubleshooting

**Error: "Authentication failed"**

- Check `.env.local` credentials
- Ensure PocketBase is running
- Verify credentials in PocketBase Admin

**Error: "Collection already exists"**

- Collections were already created - this is OK!
- You can continue using the system

**Collections not showing up:**

- Refresh the PocketBase Admin page
- Check PocketBase logs at: `https://amazoncrm-db.codix.site/_/`

---

## Next Steps

After setup is complete:

1. ✅ Collections are created
2. 🎓 Go to home page: `http://localhost:3000`
3. 📋 Choose your role (Admin or Counselor)
4. 🚀 Start using the system!

---

For issues, check:

- PocketBase health: `https://amazoncrm-db.codix.site/api/health`
- App logs: Check terminal/browser console
- Backend logs: PocketBase Admin dashboard
