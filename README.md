# Loganathan V2 — your personal AI workspace

A professional AI chat app with Google sign-in, persistent conversations,
long-term memory, image/document understanding, and a secure backend —
frontend on GitHub Pages, backend on Firebase.

```
Browser (GitHub Pages)
  ├─ Firebase Auth (Google Sign-In)
  ├─ Firestore (conversations, messages, memories, workspaces, files metadata)
  ├─ Firebase Storage (uploaded images/files)
  └─ Cloud Function "chatWithLoganathan" → holds your Anthropic key → Anthropic API
```

## Files in this project

| File | What it does |
|---|---|
| `index.html` | Page structure: login, sidebar, chat, composer, all modals |
| `style.css` | Visual design |
| `config.js` | Your Firebase project's public config (safe to be public) |
| `firebase-init.js` | Initializes Firebase Auth/Firestore/Storage/Functions |
| `app.js` | All app logic — auth, conversations, memory, attachments, chat |
| `firestore.rules` | Security rules — a user can only touch their own data |
| `storage.rules` | Security rules for uploaded files |
| `firestore.indexes.json` | Composite indexes the conversation queries need |
| `firebase.json` | Tells the Firebase CLI where everything lives |
| `functions/index.js` | The Cloud Function — the only place your AI key lives |
| `functions/package.json` | Its dependencies |

---

## A. Firebase Console setup

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project**.
2. **Authentication** → Sign-in method → enable **Google**.
3. **Firestore Database** → Create database → start in **production mode** (the rules file below handles security).
4. **Storage** → Get started → production mode.
5. **Project settings → General → Your apps → Add app → Web (`</>`)**. Copy the config object it gives you into `config.js` (the `FIREBASE_CONFIG` object).
6. Back in **Authentication → Settings → Authorized domains**, add `yourusername.github.io` (add this *after* you know your Pages URL — step F below).

## B. Install the Firebase CLI (one time, on your computer)

```bash
npm install -g firebase-tools
firebase login
```

## C. Install dependencies and verify the project

From the project root, install the Cloud Function dependencies before deploying:

```bash
cd functions
npm install
cd ..
```

Then review `config.js` and replace only the `YOUR_*` Firebase placeholders with the public Web app config from Firebase Console.

## D. Deploy Firestore & Storage rules

From this project's root folder:

```bash
firebase use --add        # pick the project you created in step A
firebase deploy --only firestore:rules,firestore:indexes,storage:rules
```

## E. Get an Anthropic API key & configure the secret

1. Get a key at [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys).
2. Set it as a Cloud Functions secret (this is what keeps it out of your public repo entirely):
   ```bash
   firebase functions:secrets:set ANTHROPIC_API_KEY
   ```
   Paste the key when prompted. It's stored encrypted in Google Secret Manager — never in a file.

## F. Deploy the Cloud Function

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

This is on Firebase's **free Blaze (pay-as-you-go) plan** — Cloud Functions has a generous free tier
(2M invocations/month) that a personal project won't come close to. Blaze requires a billing card
on file, but you will not be charged unless you far exceed free-tier limits.

## G. Deploy the frontend to GitHub Pages

```bash
git init
git add .
git commit -m "Launch Loganathan V2"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

Repo → **Settings → Pages → Deploy from a branch → main → / (root)**.
Your site: `https://YOUR_USERNAME.github.io/YOUR_REPO/`.

Go back to **Firebase Console → Authentication → Settings → Authorized domains** and add that exact
domain, or Google Sign-In will fail with an unauthorized-domain error.

## H. Test locally before deploying (optional but recommended)

```bash
npx serve .
```
Open the printed `localhost` URL. Add `localhost` to Firebase's authorized domains too if you do this.

---

## Testing checklist

- [ ] Google sign-in / sign-out
- [ ] New chat creates a conversation only after the first message is sent
- [ ] Conversation title is generated locally (no AI call)
- [ ] Switching Personal ↔ Private shows separate conversation lists
- [ ] Rename, pin, archive, delete a conversation
- [ ] Restore an archived conversation from Settings
- [ ] Search filters the sidebar list
- [ ] Send a text message and get a reply
- [ ] Attach an image, ask a question about it
- [ ] Attach a PDF/TXT file, ask it to summarize
- [ ] Say "Remember that I'm building X" → confirmed instantly, no AI call
- [ ] Say "Forget my X" → removed from Memory Center
- [ ] Private workspace conversation does NOT show up in Memory Center
- [ ] Regenerate a response; edit a sent message; retry a failed one
- [ ] Copy button on a code block
- [ ] Mobile width: sidebar becomes a drawer, composer stays usable
- [ ] Turn off wifi → offline banner appears, send is blocked
- [ ] Sign in as a second Google account → confirm you cannot see the first account's chats

---

## Limitations (real, not hidden)

- **DOC/DOCX text isn't extracted.** The file uploads and attaches fine, but Loganathan only
  sees the filename, not its contents — reliable client-side Word parsing needs a much heavier
  library than fits a static site. Convert to PDF or paste the text directly for real analysis.
- **"Stop generation" can't truly cancel an in-flight request.** Firebase's callable functions
  don't support streaming/abort the way a raw `fetch` does. Clicking Stop discards the answer
  the moment it arrives, but the function call itself finishes server-side.
- **Search is title-only**, not full message-content search — full-text search across every
  message would need a dedicated search service (e.g. Algolia) which is real added cost/complexity
  for a personal project.
- **Attachments are stored as private Firebase Storage objects.** The message stores the Storage path
  as the durable reference; image download URLs are used only for display. Document analysis excerpts
  are stored with the user's message attachment metadata to make retry/regenerate useful without
  storing large base64 image payloads in Firestore.
- **Old-message summarization is a lightweight local heuristic** (a short hint about what got
  trimmed), not an AI-generated summary — this was an intentional cost trade-off per your
  "don't use AI for things that don't need it" instruction. It's easy to upgrade later if you
  want richer long-conversation memory.
- **Vision support depends on the Anthropic model** configured in `functions/index.js`
  (`claude-sonnet-4-6`), which does support image understanding — if you ever swap models,
  double check the new one supports vision before relying on image analysis.

## Security notes

- Every Firestore and Storage rule keys off `request.auth.uid` — never a value the browser sends —
  so a user can never read or write another user's data even if they tried to guess an ID.
- The Anthropic key lives only as a Cloud Functions secret; it's never in any file in this repo.
- The Cloud Function rejects any request without a valid Firebase auth token before it does anything else.
