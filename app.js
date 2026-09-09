// ── Loganathan V2 app logic ───────────────────────────────────
import {
auth, googleProvider, db, storage, functions,
signInWithPopup, fbSignOut, onAuthStateChanged,
collection, doc, addDoc, setDoc, updateDoc, deleteDoc, getDoc, getDocs,
query, where, orderBy, limit, onSnapshot, serverTimestamp,
ref, uploadBytes, getDownloadURL, deleteObject, getBytes,
httpsCallable,
} from "./firebase-init.js";
import { MAX_IMAGE_MB, MAX_FILE_MB, CONTEXT_RECENT_MESSAGES } from "./config.js";
import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.mjs";

// marked + DOMPurify for safe markdown rendering (loaded as ESM from CDN)
import { marked } from "https://cdn.jsdelivr.net/npm/marked@12.0.2/lib/marked.esm.js";
import DOMPurify from "https://cdn.jsdelivr.net/npm/dompurify@3.1.5/dist/purify.es.mjs";

// ===== DOM refs =====
const $ = (id) => document.getElementById(id);
const loginScreen = $("loginScreen"), appScreen = $("appScreen");
const sidebar = $("sidebar"), conversationList = $("conversationList");
const messagesEl = $("messages"), emptyState = $("emptyState"), emptyGreeting = $("emptyGreeting");
const chatForm = $("chatForm"), chatInput = $("chatInput"), sendBtn = $("sendBtn"), stopBtn = $("stopBtn");
const attachBtn = $("attachBtn"), fileInput = $("fileInput"), attachmentPreviews = $("attachmentPreviews");
const workspaceSelect = $("workspaceSelect"), workspaceHint = $("workspaceHint"), privateBanner = $("privateBanner");
const searchInput = $("searchInput");
const offlineBanner = $("offlineBanner");

// ===== state =====
let currentUser = null;
let currentWorkspace = "personal";
let currentConversationId = null;
let currentMessagesCache = [];
let conversationsCache = [];
let convUnsub = null, msgUnsub = null;
let pendingAttachments = [];
let isSending = false;
let ignoreNextResponse = false;
let searchQuery = "";
let prefs = { enterToSend: true, memoryEnabled: true };

// ===== helpers =====
function friendlyError(err) {
const code = err?.code || "";
if (code.includes("unauthenticated")) return "Your session has expired. Please sign in again.";
if (code.includes("resource-exhausted")) return "AI usage is temporarily limited. Please try again later.";
if (code.includes("deadline-exceeded")) return "That took too long to respond. Please try again.";
if (!navigator.onLine) return "Unable to connect right now. Please check your connection.";
return "Something went wrong. Please try again.";
}

function localTitle(text) {
const clean = (text || "").trim().replace(/\s+/g, " ");
if (!clean) return "New conversation";
const words = clean.split(" ").slice(0, 6).join(" ");
return words.length > 42 ? words.slice(0, 42) + "…" : words;
}

function timeGreeting() {
const h = new Date().getHours();
if (h < 12) return "Good morning";
if (h < 18) return "Good afternoon";
return "Good evening";
}

function startOfDay(d) {
const x = new Date(d);
x.setHours(0, 0, 0, 0);
return x;
}

function escapeHtml(s) {
return String(s ?? "").replace(/[&<>"']/g, (c) => ({
"&": "&amp;",
"<": "&lt;",
">": "&gt;",
'"': "&quot;",
"'": "&#39;"
}[c]));
}

function closeAllModals() {
document.querySelectorAll(".modal-backdrop").forEach((m) => m.classList.add("hidden"));
}

// ===== AUTH =====
$("googleSignInBtn").addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (e) {
    console.error("Google sign-in failed:", e);
    alert("Sign-in failed. Please try again.");
  }
});

function bindSignOut(btnId) {
  $(btnId).addEventListener("click", async () => {
    if (convUnsub) convUnsub();
    if (msgUnsub) msgUnsub();

    await fbSignOut(auth);
  });
}

bindSignOut("signOutBtn");
bindSignOut("settingsSignOutBtn");

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;

    // Show the app immediately after authentication.
    showApp(user);

    // Finish user setup and preferences in the background.
    try {
      await ensureUserSetup(user);
      await loadPreferences();
    } catch (e) {
      console.error("Background user setup failed:", e);
    }
  } else {
    currentUser = null;
    loginScreen.classList.remove("hidden");
    appScreen.classList.add("hidden");
  }
});
async function ensureUserSetup(user) {
  const userRef = doc(
    db,
    "users",
    user.uid
  );

  const snap = await getDoc(userRef);

  if (!snap.exists()) {
    await setDoc(userRef, {
      displayName: user.displayName || "",
      email: user.email || "",
      photoURL: user.photoURL || "",
      createdAt: serverTimestamp(),
      preferences: {
        theme: "dark",
        enterToSend: true,
        memoryEnabled: true
      }
    });
  }

  // Fixed-id workspace docs so lookups never require a query
  for (const [id, def] of Object.entries({
    personal: {
      name: "Personal",
      type: "personal"
    },
    private: {
      name: "Private",
      type: "private"
    }
  })) {
    const wsRef = doc(
      db,
      "users",
      user.uid,
      "workspaces",
      id
    );

    const wsSnap = await getDoc(wsRef);

    if (!wsSnap.exists()) {
      await setDoc(wsRef, {
        ...def,
        createdAt: serverTimestamp()
      });
    }
  }
}

async function loadPreferences() {
  const snap = await getDoc(
    doc(
      db,
      "users",
      currentUser.uid
    )
  );

  const p =
    snap.data()?.preferences || {};

  prefs.enterToSend =
    p.enterToSend !== false;

  prefs.memoryEnabled =
    p.memoryEnabled !== false;

  $("enterToSendToggle").checked =
    prefs.enterToSend;

  $("memoryEnabledToggle").checked =
    prefs.memoryEnabled;
}

function showApp(user) {
  loginScreen.classList.add("hidden");
  appScreen.classList.remove("hidden");

  const firstName =
    (user.displayName || "there")
      .split(" ")[0];

  $("profileName").textContent =
    firstName;

  $("profileAvatar").src =
    user.photoURL || "";

  $("profileMenuName").textContent =
    user.displayName || "";

  $("profileMenuEmail").textContent =
    user.email || "";

  $("settingsAvatar").src =
    user.photoURL || "";

  $("settingsName").textContent =
    user.displayName || "";

  $("settingsEmail").textContent =
    user.email || "";

  emptyGreeting.textContent =
    `${timeGreeting()}, ${firstName}.`;

  subscribeConversations();
}
// ===== WORKSPACES =====
workspaceSelect.addEventListener("change", () => {
currentWorkspace = workspaceSelect.value;
currentConversationId = null;
updateWorkspaceHint();
subscribeConversations();
showEmptyState();
});

function updateWorkspaceHint() {
workspaceHint.textContent = currentWorkspace === "private"
? "Private chats aren't added to long-term memory."
: "Saved to your persistent history and memory.";
}

updateWorkspaceHint();

// ===== CONVERSATIONS =====
function subscribeConversations() {
if (convUnsub) convUnsub();

const q = query(
collection(db, "users", currentUser.uid, "conversations"),
where("workspaceId", "==", currentWorkspace),
where("archived", "==", false),
limit(50)
);

convUnsub = onSnapshot(
q,
(snap) => {
conversationsCache = snap.docs
.map((d) => ({
id: d.id,
...d.data(),
}))
.sort((a, b) => {
const aTime = a.updatedAt?.toMillis
? a.updatedAt.toMillis()
: a.updatedAt?.seconds
? a.updatedAt.seconds * 1000
: 0;

const bTime = b.updatedAt?.toMillis
? b.updatedAt.toMillis()
: b.updatedAt?.seconds
? b.updatedAt.seconds * 1000
: 0;

return bTime - aTime;
});

renderConversationList();
},
(err) => {
console.error("conversation listener error", err);
conversationsCache = [];
renderConversationList();
}
);
}

function renderConversationList() {
const filtered = searchQuery
? conversationsCache.filter((c) =>
(c.title || "").toLowerCase().includes(searchQuery)
)
: conversationsCache;

const pinned = filtered.filter((c) => c.pinned);
const rest = filtered.filter((c) => !c.pinned);

const now = new Date();
const today = [], yesterday = [], older = [];

rest.forEach((c) => {
const t = c.updatedAt?.toDate ? c.updatedAt.toDate() : new Date();

if (startOfDay(t).getTime() === startOfDay(now).getTime()) {
today.push(c);
} else if (
startOfDay(t).getTime() === startOfDay(now).getTime() - 86400000
) {
yesterday.push(c);
} else {
older.push(c);
}
});

conversationList.innerHTML = "";

const group = (label, items) => {
if (!items.length) return;

const wrap = document.createElement("div");
const lbl = document.createElement("p");

lbl.className = "conv-group-label";
lbl.textContent = label;

wrap.appendChild(lbl);

items.forEach((c) => wrap.appendChild(renderConvItem(c)));

conversationList.appendChild(wrap);
};

group("Pinned", pinned);
group("Today", today);
group("Yesterday", yesterday);
group("Older", older);

if (!filtered.length) {
const p = document.createElement("p");
p.className = "workspace-hint";
p.textContent = searchQuery
? "No matching conversations."
: "No conversations yet.";
conversationList.appendChild(p);
}
}

function renderConvItem(c) {
const item = document.createElement("div");

item.className =
"conv-item" + (c.id === currentConversationId ? " active" : "");

item.innerHTML = `
    <span class="conv-title">${escapeHtml(c.title || "New conversation")}</span>
    <span class="conv-actions">
      <button class="conv-action-btn" data-act="pin" title="${c.pinned ? "Unpin" : "Pin"}">${c.pinned ? "📌" : "📍"}</button>
      <button class="conv-action-btn" data-act="rename" title="Rename">✎</button>
      <button class="conv-action-btn" data-act="archive" title="Archive">🗄</button>
      <button class="conv-action-btn" data-act="delete" title="Delete">🗑</button>
    </span>`;

item.addEventListener("click", (e) => {
const actBtn = e.target.closest(".conv-action-btn");

if (!actBtn) {
openConversation(c.id);
return;
}

e.stopPropagation();

const act = actBtn.dataset.act;

if (act === "pin") togglePin(c);
if (act === "archive") toggleArchive(c);
if (act === "delete") deleteConversation(c.id);
if (act === "rename") openRenameModal(c);
});

return item;
}

function convRef(id) {
return doc(
db,
"users",
currentUser.uid,
"conversations",
id
);
}

async function togglePin(c) {
await updateDoc(convRef(c.id), {
pinned: !c.pinned
});
}

async function toggleArchive(c) {
await updateDoc(convRef(c.id), {
archived: !c.archived
});

if (c.id === currentConversationId) {
currentConversationId = null;
showEmptyState();
}
}

async function deleteConversation(id) {
if (!confirm("Delete this conversation? This can't be undone.")) return;

await deleteConversationDeep(id);

if (id === currentConversationId) {
currentConversationId = null;
showEmptyState();
}
}

async function deleteConversationDeep(id) {
const msgsSnap = await getDocs(
collection(
db,
"users",
currentUser.uid,
"conversations",
id,
"messages"
)
);

await Promise.all(
msgsSnap.docs.map((d) => deleteDoc(d.ref))
);

await deleteDoc(convRef(id));
}

let renamingId = null;

function openRenameModal(c) {
renamingId = c.id;
$("renameInput").value = c.title || "";
$("renameModal").classList.remove("hidden");
$("renameInput").focus();
}

$("confirmRenameBtn").addEventListener("click", async () => {
const val = $("renameInput").value.trim();

if (val && renamingId) {
await updateDoc(convRef(renamingId), {
title: val
});
}

closeAllModals();
});

function showEmptyState() {
messagesEl.classList.add("hidden");
emptyState.classList.remove("hidden");

privateBanner.classList.toggle(
"hidden",
currentWorkspace !== "private"
);

messagesEl.innerHTML = "";
currentMessagesCache = [];

renderConversationList();
}

function openConversation(id) {
currentConversationId = id;

emptyState.classList.add("hidden");
messagesEl.classList.remove("hidden");

const conv = conversationsCache.find((c) => c.id === id);

privateBanner.classList.toggle(
"hidden",
conv?.workspaceId !== "private"
);

renderConversationList();
closeDrawer();

if (msgUnsub) msgUnsub();

const q = query(
collection(
db,
"users",
currentUser.uid,
"conversations",
id,
"messages"
),
orderBy("createdAt", "asc"),
limit(200)
);

msgUnsub = onSnapshot(q, (snap) => {
currentMessagesCache = snap.docs.map((d) => ({
id: d.id,
...d.data()
}));

renderMessages();
});
}

// ===== NEW CHAT =====
function newChat() {
currentConversationId = null;
showEmptyState();
closeDrawer();
}

$("newChatBtn").addEventListener("click", newChat);
$("mobileNewChat").addEventListener("click", newChat);

// ===== search =====
let searchDebounce;

searchInput.addEventListener("input", () => {
clearTimeout(searchDebounce);

searchDebounce = setTimeout(() => {
searchQuery = searchInput.value.trim().toLowerCase();
renderConversationList();
}, 200);
});

// ===== suggestion cards =====
document.querySelectorAll(".suggestion-card").forEach((btn) => {
btn.addEventListener("click", () => {
chatInput.value = btn.dataset.prompt;
chatInput.focus();
autoResize();
});
});

// ===== MESSAGE RENDERING =====
function renderMessages() {
messagesEl.innerHTML = "";

currentMessagesCache.forEach((m, idx) => {
messagesEl.appendChild(
renderMessageRow(m, idx)
);
});

messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderMessageRow(m, idx) {
const row = document.createElement("div");

row.className = `msg-row ${m.role}`;

const bubble = document.createElement("div");
bubble.className = "msg";

if (m.role === "assistant") {
const html = DOMPurify.sanitize(
marked.parse(m.content || "")
);

bubble.innerHTML = html;

bubble.querySelectorAll("pre").forEach((pre) => {
const btn = document.createElement("button");

btn.className = "code-copy-btn";
btn.textContent = "Copy";

btn.addEventListener("click", () => {
navigator.clipboard.writeText(pre.innerText);
btn.textContent = "Copied!";

setTimeout(
() => (btn.textContent = "Copy"),
1500
);
});

pre.appendChild(btn);
});
} else {
bubble.textContent = m.content || "";
}

row.appendChild(bubble);

if (m.attachments?.length) {
const wrap = document.createElement("div");

wrap.className = "msg-attachments";

m.attachments.forEach((a) => {
if (a.kind === "image" && a.url) {
const img = document.createElement("img");

img.className = "msg-attachment-img";
img.src = a.url;
img.alt = a.name;

wrap.appendChild(img);
} else {
const chip = document.createElement("div");

chip.className = "msg-attachment-file";
chip.textContent = `📄 ${a.name}`;

wrap.appendChild(chip);
}
});

row.appendChild(wrap);
}

const actions = document.createElement("div");
actions.className = "msg-actions";

if (m.role === "assistant") {
actions.innerHTML = `
      <button class="msg-action-btn" data-act="copy">Copy</button>
      <button class="msg-action-btn" data-act="regen">Regenerate</button>
      <button class="msg-action-btn" data-act="up">👍</button>
      <button class="msg-action-btn" data-act="down">👎</button>`;
} else {
actions.innerHTML =
`<button class="msg-action-btn" data-act="edit">Edit</button>`;
}

actions.addEventListener("click", (e) => {
const b = e.target.closest(".msg-action-btn");

if (!b) return;

handleMessageAction(
b.dataset.act,
m,
idx
);
});

row.appendChild(actions);

if (m.error) {
const err = document.createElement("div");

err.className = "msg error-msg";
err.textContent = m.error;

const retry = document.createElement("button");

retry.className = "retry-btn";
retry.textContent = "Retry";

retry.addEventListener(
"click",
() => retryFromMessage(idx)
);

row.appendChild(err);
row.appendChild(retry);
}

return row;
}

async function handleMessageAction(act, m, idx) {
if (act === "copy") {
navigator.clipboard.writeText(m.content || "");
}

if (act === "up" || act === "down") {
await updateDoc(
doc(
db,
"users",
currentUser.uid,
"conversations",
currentConversationId,
"messages",
m.id
),
{ feedback: act }
);
}

if (act === "regen") {
await deleteDoc(
doc(
db,
"users",
currentUser.uid,
"conversations",
currentConversationId,
"messages",
m.id
)
);

const priorUser = [...currentMessagesCache]
.slice(0, idx)
.reverse()
.find((x) => x.role === "user");

if (priorUser) {
const parts =
await buildOutgoingPartsFromStoredMessage(
priorUser
);

await runAssistantTurn(parts);
}
}

if (act === "edit") {
chatInput.value = m.content || "";
autoResize();
chatInput.focus();

const toDelete =
currentMessagesCache.slice(idx);

await Promise.all(
toDelete.map((d) =>
deleteDoc(
doc(
db,
"users",
currentUser.uid,
"conversations",
currentConversationId,
"messages",
d.id
)
)
)
);
}
}

async function retryFromMessage(idx) {
const failedMsg = currentMessagesCache[idx];

await deleteDoc(
doc(
db,
"users",
currentUser.uid,
"conversations",
currentConversationId,
"messages",
failedMsg.id
)
);

const priorUser = [...currentMessagesCache]
.slice(0, idx)
.reverse()
.find((x) => x.role === "user");

if (priorUser) {
const parts =
await buildOutgoingPartsFromStoredMessage(
priorUser
);

await runAssistantTurn(parts);
}
}

async function bytesToBase64(bytes) {
let binary = "";
const chunkSize = 0x8000;

for (
let i = 0;
i < bytes.length;
i += chunkSize
) {
binary += String.fromCharCode(
...bytes.subarray(
i,
Math.min(i + chunkSize, bytes.length)
)
);
}

return btoa(binary);
}

async function buildOutgoingPartsFromStoredMessage(message) {
const parts = [];

if (message?.content) {
parts.push({
type: "text",
text: message.content
});
}

for (const attachment of (message?.attachments || [])) {
if (
attachment.kind === "image" &&
attachment.storagePath
) {
try {
const bytes = await getBytes(
ref(storage, attachment.storagePath),
MAX_IMAGE_MB * 1024 * 1024
);

parts.push({
type: "image",
mediaType:
attachment.mediaType || "image/jpeg",
data: await bytesToBase64(bytes),
});
} catch (e) {
console.warn(
"Could not reload image attachment for retry",
e
);
}
} else if (attachment.analysisText) {
parts.push({
type: "text",
text:
`[Attached file: ${attachment.name}]\n${attachment.analysisText}`,
});
} else {
parts.push({
type: "text",
text:
`[Attached file: ${attachment.name} — its stored content is not available for automatic re-analysis.]`,
});
}
}

return parts;
}

// ===== COMPOSER: attachments =====
attachBtn.addEventListener(
"click",
() => fileInput.click()
);

fileInput.addEventListener(
"change",
() => {
handleFiles(fileInput.files);
fileInput.value = "";
}
);

chatForm.addEventListener(
"dragover",
(e) => e.preventDefault()
);

chatForm.addEventListener(
"drop",
(e) => {
e.preventDefault();
handleFiles(e.dataTransfer.files);
}
);

chatInput.addEventListener(
"paste",
(e) => {
const items =
Array.from(e.clipboardData?.items || []);

const imageItem = items.find(
(i) => i.type.startsWith("image/")
);

if (imageItem) {
handleFiles([
imageItem.getAsFile()
]);
}
}
);

const IMAGE_TYPES = [
"image/png",
"image/jpeg",
"image/webp"
];

const TEXT_EXTS = [
".txt",
".md",
".json",
".csv",
".js",
".ts",
".py",
".html",
".css"
];

function handleFiles(fileList) {
Array.from(fileList).forEach((file) => {
const isImage =
IMAGE_TYPES.includes(file.type);

const sizeMb =
file.size / (1024 * 1024);

if (
isImage &&
sizeMb > MAX_IMAGE_MB
) {
renderSystemNote(
`"${file.name}" is too large. Please choose an image under ${MAX_IMAGE_MB}MB.`
);
return;
}

if (
!isImage &&
sizeMb > MAX_FILE_MB
) {
renderSystemNote(
`"${file.name}" is too large. Please choose a file under ${MAX_FILE_MB}MB.`
);
return;
}

const att = {
id: crypto.randomUUID(),
file,
name: file.name,
size: file.size,
kind: isImage ? "image" : "document",
status: "processing",
previewUrl: isImage
? URL.createObjectURL(file)
: null,
base64: null,
textExcerpt: null,
};

pendingAttachments.push(att);
renderAttachmentPreviews();

att.processingPromise =
processAttachment(att);
});
}

async function processAttachment(att) {
try {
if (att.kind === "image") {
att.base64 =
await compressImageToBase64(
att.file
);
} else {
const ext =
"." +
att.name
.split(".")
.pop()
.toLowerCase();

if (TEXT_EXTS.includes(ext)) {
const text =
await att.file.text();

att.textExcerpt =
text.slice(0, 12000);
} else if (ext === ".pdf") {
att.textExcerpt =
await extractPdfText(
att.file
);
} else {
att.textExcerpt = null;
}
}

att.status = "ready";
} catch (e) {
console.error(
"attachment processing failed",
e
);

att.status = "error";
}

renderAttachmentPreviews();
}

function compressImageToBase64(file) {
return new Promise((resolve, reject) => {
const img = new Image();

img.onload = () => {
const maxDim = 1568;

let { width, height } =
img;

if (
width > maxDim ||
height > maxDim
) {
const scale =
maxDim /
Math.max(width, height);

width *= scale;
height *= scale;
}

const canvas =
document.createElement("canvas");

canvas.width = width;
canvas.height = height;

canvas
.getContext("2d")
.drawImage(
img,
0,
0,
width,
height
);

resolve(
canvas
.toDataURL(
"image/jpeg",
0.82
)
.split(",")[1]
);
};

img.onerror = reject;

img.src =
URL.createObjectURL(file);
});
}

async function extractPdfText(file) {
if (!pdfjsLib?.getDocument)
return null;

const buf =
await file.arrayBuffer();

const pdf =
await pdfjsLib.getDocument({
data: buf
}).promise;

let text = "";

const pageCount =
Math.min(pdf.numPages, 15);

for (
let i = 1;
i <= pageCount;
i++
) {
const page =
await pdf.getPage(i);

const content =
await page.getTextContent();

text +=
content.items
.map((it) => it.str)
.join(" ") +
"\n";

if (text.length > 12000)
break;
}

return text.slice(
0,
12000
);
}
function renderAttachmentPreviews() {
  attachmentPreviews.classList.toggle(
    "hidden",
    pendingAttachments.length === 0
  );

  attachmentPreviews.innerHTML = "";

  pendingAttachments.forEach((att) => {
    const chip = document.createElement("div");
    chip.className = "attachment-chip";

    const statusText =
      att.status === "processing"
        ? "Processing…"
        : att.status === "error"
          ? "Couldn't process"
          : "Ready";

    chip.innerHTML = `
      ${
        att.kind === "image"
          ? `<img src="${att.previewUrl}" alt="">`
          : "📄"
      }
      <span>
        ${escapeHtml(att.name)}<br>
        <span class="attachment-status">
          ${statusText} · ${(att.size / 1024).toFixed(0)}KB
        </span>
      </span>
      <button
        class="attachment-remove"
        aria-label="Remove attachment"
      >✕</button>
    `;

    chip
      .querySelector(".attachment-remove")
      .addEventListener("click", () => {
        if (att.previewUrl) {
          URL.revokeObjectURL(att.previewUrl);
        }

        pendingAttachments =
          pendingAttachments.filter(
            (a) => a.id !== att.id
          );

        renderAttachmentPreviews();
      });

    attachmentPreviews.appendChild(chip);
  });
}

// ===== COMPOSER: textarea behavior =====
function autoResize() {
  chatInput.style.height = "auto";
  chatInput.style.height =
    Math.min(chatInput.scrollHeight, 160) + "px";
}

chatInput.addEventListener(
  "input",
  autoResize
);

chatInput.addEventListener(
  "keydown",
  (e) => {
    if (
      e.key === "Enter" &&
      !e.shiftKey &&
      prefs.enterToSend
    ) {
      e.preventDefault();
      chatForm.requestSubmit();
    }
  }
);

// ===== SEND FLOW =====
chatForm.addEventListener(
  "submit",
  async (e) => {
    e.preventDefault();

    if (isSending) return;

    const text =
      chatInput.value.trim();

    if (
      !text &&
      pendingAttachments.length === 0
    ) {
      return;
    }

    if (!navigator.onLine) {
      renderSystemNote(
        "You're offline. Please reconnect and try again."
      );
      return;
    }

    // Local, free "remember / forget" commands.
    // Personal workspace only.
    if (
      currentWorkspace === "personal" &&
      prefs.memoryEnabled
    ) {
      const rememberMatch =
        text.match(
          /^remember\s+(that\s+)?(.+)/i
        );

      const forgetMatch =
        text.match(
          /^forget\s+(that\s+)?(.+)/i
        );

      if (rememberMatch) {
        await handleRememberCommand(
          text,
          rememberMatch[2]
        );
        return;
      }

      if (forgetMatch) {
        await handleForgetCommand(
          text,
          forgetMatch[2]
        );
        return;
      }
    }

    await sendNormalMessage(text);
  }
);

async function ensureConversation(seedText) {
  if (currentConversationId) {
    return currentConversationId;
  }

  const conversationRef =
    await addDoc(
      collection(
        db,
        "users",
        currentUser.uid,
        "conversations"
      ),
      {
        title: localTitle(seedText),
        workspaceId: currentWorkspace,
        pinned: false,
        archived: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastMessagePreview:
          seedText.slice(0, 80),
      }
    );

  currentConversationId =
    conversationRef.id;

  openConversation(
    conversationRef.id
  );

  return conversationRef.id;
}

async function handleRememberCommand(
  fullText,
  content
) {
  const convId =
    await ensureConversation(
      fullText
    );

  await addDoc(
    collection(
      db,
      "users",
      currentUser.uid,
      "conversations",
      convId,
      "messages"
    ),
    {
      role: "user",
      content: fullText,
      attachments: [],
      createdAt: serverTimestamp(),
    }
  );

  await addDoc(
    collection(
      db,
      "users",
      currentUser.uid,
      "memories"
    ),
    {
      content: content.trim(),
      category: "other",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
  );

  await addDoc(
    collection(
      db,
      "users",
      currentUser.uid,
      "conversations",
      convId,
      "messages"
    ),
    {
      role: "assistant",
      content:
        "Got it — I'll remember that.",
      attachments: [],
      createdAt: serverTimestamp(),
    }
  );

  await updateDoc(
    convRef(convId),
    {
      updatedAt: serverTimestamp(),
      lastMessagePreview:
        "Got it — I'll remember that.",
    }
  );

  chatInput.value = "";
  autoResize();
}

async function handleForgetCommand(
  fullText,
  needle
) {
  const convId =
    await ensureConversation(
      fullText
    );

  await addDoc(
    collection(
      db,
      "users",
      currentUser.uid,
      "conversations",
      convId,
      "messages"
    ),
    {
      role: "user",
      content: fullText,
      attachments: [],
      createdAt: serverTimestamp(),
    }
  );

  const snap =
    await getDocs(
      collection(
        db,
        "users",
        currentUser.uid,
        "memories"
      )
    );

  const matches =
    snap.docs.filter((d) =>
      (d.data().content || "")
        .toLowerCase()
        .includes(
          needle.toLowerCase().trim()
        )
    );

  await Promise.all(
    matches.map((d) =>
      deleteDoc(d.ref)
    )
  );

  const reply =
    matches.length
      ? "Done. I've removed that from memory."
      : "I couldn't find that in memory.";

  await addDoc(
    collection(
      db,
      "users",
      currentUser.uid,
      "conversations",
      convId,
      "messages"
    ),
    {
      role: "assistant",
      content: reply,
      attachments: [],
      createdAt: serverTimestamp(),
    }
  );

  await updateDoc(
    convRef(convId),
    {
      updatedAt: serverTimestamp(),
      lastMessagePreview: reply,
    }
  );

  chatInput.value = "";
  autoResize();
}

async function sendNormalMessage(text) {
  isSending = true;
  ignoreNextResponse = false;

  sendBtn.disabled = true;
  stopBtn.classList.remove("hidden");

  const convId =
    await ensureConversation(
      text ||
      pendingAttachments[0]?.name ||
      "Attachment"
    );

  // Wait for client-side attachment processing.
  await Promise.all(
    pendingAttachments
      .map(
        (att) =>
          att.processingPromise
      )
      .filter(Boolean)
  );

  const failedAttachment =
    pendingAttachments.find(
      (att) =>
        att.status !== "ready"
    );

  if (failedAttachment) {
    renderSystemNote(
      `"${failedAttachment.name}" could not be processed. Please remove it and try again.`
    );

    isSending = false;
    sendBtn.disabled = false;
    stopBtn.classList.add(
      "hidden"
    );

    return;
  }

  // Upload attachments to Storage
  // and build message metadata.
  const attachmentsMeta = [];

  for (
    const att of pendingAttachments
  ) {
    try {
      const path =
        `users/${currentUser.uid}/files/${att.id}-${att.name}`;

      const sref =
        ref(storage, path);

      await uploadBytes(
        sref,
        att.file
      );

      const url =
        await getDownloadURL(
          sref
        );

      attachmentsMeta.push({
        name: att.name,
        kind: att.kind,
        size: att.size,
        mediaType:
          att.file.type ||
          "image/jpeg",
        url:
          att.kind === "image"
            ? url
            : null,
        storagePath: path,
        analysisText:
          att.kind === "document" &&
          att.textExcerpt
            ? att.textExcerpt
            : null,
      });

      await addDoc(
        collection(
          db,
          "users",
          currentUser.uid,
          "files"
        ),
        {
          name: att.name,
          type:
            att.file.type ||
            "unknown",
          size: att.size,
          storagePath: path,
          conversationId: convId,
          createdAt:
            serverTimestamp(),
        }
      );
    } catch (e) {
      console.error(
        "upload failed",
        e
      );
    }
  }

  const outgoingContentParts = [];

  if (text) {
    outgoingContentParts.push({
      type: "text",
      text,
    });
  }

  pendingAttachments.forEach(
    (att) => {
      if (
        att.kind === "image" &&
        att.base64
      ) {
        outgoingContentParts.push({
          type: "image",
          mediaType:
            att.file.type,
          data: att.base64,
        });
      } else if (
        att.textExcerpt
      ) {
        outgoingContentParts.push({
          type: "text",
          text:
            `[Attached file: ${att.name}]\n${att.textExcerpt}`,
        });
      } else {
        outgoingContentParts.push({
          type: "text",
          text:
            `[Attached file: ${att.name} — this file type couldn't be read automatically. I only know its name.]`,
        });
      }
    }
  );

  await addDoc(
    collection(
      db,
      "users",
      currentUser.uid,
      "conversations",
      convId,
      "messages"
    ),
    {
      role: "user",
      content: text,
      attachments:
        attachmentsMeta,
      createdAt:
        serverTimestamp(),
    }
  );

  await updateDoc(
    convRef(convId),
    {
      updatedAt:
        serverTimestamp(),
      lastMessagePreview:
        (
          text ||
          attachmentsMeta[0]?.name ||
          ""
        ).slice(0, 80),
    }
  );

  pendingAttachments.forEach(
    (a) => {
      if (a.previewUrl) {
        URL.revokeObjectURL(
          a.previewUrl
        );
      }
    }
  );

  pendingAttachments = [];

  renderAttachmentPreviews();

  chatInput.value = "";
  autoResize();

  await runAssistantTurn(
    outgoingContentParts
  );
}

let typingRow = null;

async function runAssistantTurn(
  freshOutgoingParts
) {
  typingRow =
    document.createElement(
      "div"
    );

  typingRow.className =
    "typing-row";

  typingRow.textContent =
    "Loganathan is thinking…";

  messagesEl.appendChild(
    typingRow
  );

  messagesEl.scrollTop =
    messagesEl.scrollHeight;

  try {
    const recent =
      currentMessagesCache.slice(
        -CONTEXT_RECENT_MESSAGES
      );

    const olderCount =
      currentMessagesCache.length -
      recent.length;

    const contextSummary =
      olderCount > 0
        ? `(${olderCount} earlier message${olderCount === 1 ? "" : "s"} not shown in full. Earliest topic hint: "${(currentMessagesCache[0]?.content || "").slice(0, 150)}")`
        : "";

    const historyForApi =
      recent.map((m, i) => {
        const isLast =
          i === recent.length - 1 &&
          m.role === "user";

        return {
          role: m.role,
          content:
            isLast &&
            freshOutgoingParts
              ? freshOutgoingParts
              : m.content || "",
        };
      });

    let memoryBullets = "";

    if (
      currentWorkspace ===
        "personal" &&
      prefs.memoryEnabled
    ) {
      const memSnap =
        await getDocs(
          query(
            collection(
              db,
              "users",
              currentUser.uid,
              "memories"
            ),
            orderBy(
              "updatedAt",
              "desc"
            ),
            limit(30)
          )
        );

      const items =
        memSnap.docs.map(
          (d) =>
            "- " +
            d.data().content
        );

      if (items.length) {
        memoryBullets =
          "Known facts about this person, remembered from earlier:\n" +
          items.join("\n");
      }
    }

    const firstName =
      (
        currentUser.displayName ||
        "there"
      ).split(" ")[0];

    const systemPrompt = [
      `You are Loganathan, a warm, direct personal AI assistant. The person's name is ${firstName}.`,
      "Address them by name naturally sometimes, not every message. Be concise unless asked for depth.",
      currentWorkspace === "private"
        ? "This is a private, temporary conversation — do not reference any long-term memory."
        : "",
      memoryBullets,
      contextSummary,
    ]
      .filter(Boolean)
      .join("\n\n");

    const callChat =
      httpsCallable(
        functions,
        "chatWithLoganathan"
      );

    const result =
      await callChat({
        systemPrompt,
        messages:
          historyForApi,
      });

    if (ignoreNextResponse) {
      ignoreNextResponse = false;
      return;
    }

    const replyText =
      result.data?.reply ||
      "(no reply)";

    await addDoc(
      collection(
        db,
        "users",
        currentUser.uid,
        "conversations",
        currentConversationId,
        "messages"
      ),
      {
        role: "assistant",
        content: replyText,
        attachments: [],
        createdAt:
          serverTimestamp(),
      }
    );

    await updateDoc(
      convRef(
        currentConversationId
      ),
      {
        updatedAt:
          serverTimestamp(),
        lastMessagePreview:
          replyText.slice(0, 80),
      }
    );
  } catch (err) {
    console.error(err);

    if (!ignoreNextResponse) {
      await addDoc(
        collection(
          db,
          "users",
          currentUser.uid,
          "conversations",
          currentConversationId,
          "messages"
        ),
        {
          role: "assistant",
          content: "",
          error:
            friendlyError(err),
          attachments: [],
          createdAt:
            serverTimestamp(),
        }
      );
    }

    ignoreNextResponse = false;
  } finally {
    if (typingRow) {
      typingRow.remove();
      typingRow = null;
    }

    isSending = false;
    sendBtn.disabled = false;
    stopBtn.classList.add(
      "hidden"
    );
  }
}

stopBtn.addEventListener(
  "click",
  () => {
    ignoreNextResponse = true;

    isSending = false;
    sendBtn.disabled = false;
    stopBtn.classList.add(
      "hidden"
    );

    if (typingRow) {
      typingRow.remove();
      typingRow = null;
    }

    renderSystemNote(
      "Stopped. (Note: the request may still finish in the background, but its answer will be discarded.)"
    );
  }
);

function renderSystemNote(text) {
  const div =
    document.createElement(
      "div"
    );

  div.className =
    "msg system";

  div.textContent = text;

  messagesEl.classList.remove(
    "hidden"
  );

  emptyState.classList.add(
    "hidden"
  );

  messagesEl.appendChild(div);

  messagesEl.scrollTop =
    messagesEl.scrollHeight;
}

// ===== MEMORY CENTER =====
$("memoryNavBtn").addEventListener(
  "click",
  openMemoryModal
);

$("openMemoryFromSettings").addEventListener(
  "click",
  openMemoryModal
);

async function openMemoryModal() {
  closeAllModals();

  $("memoryModal").classList.remove(
    "hidden"
  );

  await renderMemoryList();
}

async function renderMemoryList() {
  const snap =
    await getDocs(
      query(
        collection(
          db,
          "users",
          currentUser.uid,
          "memories"
        ),
        orderBy(
          "updatedAt",
          "desc"
        ),
        limit(100)
      )
    );

  const list =
    $("memoryList");

  list.innerHTML = "";

  if (snap.empty) {
    list.innerHTML =
      `<p class="workspace-hint">Nothing remembered yet.</p>`;
    return;
  }

  snap.forEach((d) => {
    const m = d.data();

    const row =
      document.createElement(
        "div"
      );

    row.className =
      "memory-item";

    row.innerHTML = `
      <span>
        <span class="memory-item-category">
          ${escapeHtml(m.category || "other")}
        </span>
        ${escapeHtml(m.content)}
      </span>
      <span>
        <button
          class="conv-action-btn"
          data-act="edit"
        >✎</button>
        <button
          class="conv-action-btn"
          data-act="delete"
        >🗑</button>
      </span>
    `;

    row
      .querySelector(
        '[data-act="delete"]'
      )
      .addEventListener(
        "click",
        async () => {
          await deleteDoc(d.ref);
          renderMemoryList();
        }
      );

    row
      .querySelector(
        '[data-act="edit"]'
      )
      .addEventListener(
        "click",
        async () => {
          const val =
            prompt(
              "Edit memory:",
              m.content
            );

          if (
            val &&
            val.trim()
          ) {
            await updateDoc(
              d.ref,
              {
                content:
                  val.trim(),
                updatedAt:
                  serverTimestamp(),
              }
            );

            renderMemoryList();
          }
        }
      );

    list.appendChild(row);
  });
}

$("addMemoryBtn").addEventListener(
  "click",
  async () => {
    const val =
      $("newMemoryInput")
        .value
        .trim();

    if (!val) return;

    await addDoc(
      collection(
        db,
        "users",
        currentUser.uid,
        "memories"
      ),
      {
        content: val,
        category: "other",
        createdAt:
          serverTimestamp(),
        updatedAt:
          serverTimestamp(),
      }
    );

    $("newMemoryInput").value =
      "";

    renderMemoryList();
  }
);

$("clearAllMemoryBtn").addEventListener(
  "click",
  async () => {
    if (
      !confirm(
        "Clear all remembered information? This can't be undone."
      )
    ) {
      return;
    }

    const snap =
      await getDocs(
        collection(
          db,
          "users",
          currentUser.uid,
          "memories"
        )
      );

    await Promise.all(
      snap.docs.map((d) =>
        deleteDoc(d.ref)
      )
    );

    renderMemoryList();
  }
);
// ===== FILE LIBRARY =====
$("filesNavBtn").addEventListener(
  "click",
  openFilesModal
);

async function openFilesModal() {
  closeAllModals();

  $("filesModal").classList.remove(
    "hidden"
  );

  const snap =
    await getDocs(
      query(
        collection(
          db,
          "users",
          currentUser.uid,
          "files"
        ),
        orderBy(
          "createdAt",
          "desc"
        ),
        limit(100)
      )
    );

  const list =
    $("fileLibraryList");

  list.innerHTML = "";

  if (snap.empty) {
    list.innerHTML =
      `<p class="workspace-hint">No files uploaded yet.</p>`;
    return;
  }

  snap.forEach((d) => {
    const f = d.data();

    const date =
      f.createdAt?.toDate
        ? f.createdAt
            .toDate()
            .toLocaleDateString()
        : "";

    const row =
      document.createElement(
        "div"
      );

    row.className =
      "file-item";

    row.innerHTML = `
      <span>
        📄 ${escapeHtml(f.name)}
        · ${(f.size / 1024).toFixed(0)}KB
        · ${date}
      </span>
      <button
        class="conv-action-btn"
        data-act="delete"
      >🗑</button>
    `;

    row
      .querySelector(
        '[data-act="delete"]'
      )
      .addEventListener(
        "click",
        async () => {
          try {
            await deleteObject(
              ref(
                storage,
                f.storagePath
              )
            );
          } catch (e) {
            console.warn(e);
          }

          await deleteDoc(d.ref);
          openFilesModal();
        }
      );

    list.appendChild(row);
  });
}

// ===== SETTINGS =====
$("settingsNavBtn").addEventListener(
  "click",
  async () => {
    closeAllModals();

    $("settingsModal").classList.remove(
      "hidden"
    );

    await renderArchivedList();
  }
);

$("enterToSendToggle").addEventListener(
  "change",
  async (e) => {
    prefs.enterToSend =
      e.target.checked;

    await updateDoc(
      doc(
        db,
        "users",
        currentUser.uid
      ),
      {
        "preferences.enterToSend":
          prefs.enterToSend
      }
    );
  }
);

$("memoryEnabledToggle").addEventListener(
  "change",
  async (e) => {
    prefs.memoryEnabled =
      e.target.checked;

    await updateDoc(
      doc(
        db,
        "users",
        currentUser.uid
      ),
      {
        "preferences.memoryEnabled":
          prefs.memoryEnabled
      }
    );
  }
);

async function renderArchivedList() {
  const snap =
    await getDocs(
      query(
        collection(
          db,
          "users",
          currentUser.uid,
          "conversations"
        ),
        where(
          "archived",
          "==",
          true
        ),
        limit(50)
      )
    );

  const list =
    $("archivedList");

  list.innerHTML = "";

  if (snap.empty) {
    list.innerHTML =
      `<p class="workspace-hint">No archived chats.</p>`;
    return;
  }

  snap.forEach((d) => {
    const c = d.data();

    const row =
      document.createElement(
        "div"
      );

    row.className =
      "archived-item";

    row.innerHTML = `
      <span>
        ${escapeHtml(
          c.title || "Untitled"
        )}
      </span>
      <span>
        <button
          class="conv-action-btn"
          data-act="restore"
        >↩ Restore</button>
        <button
          class="conv-action-btn"
          data-act="delete"
        >🗑 Delete</button>
      </span>
    `;

    row
      .querySelector(
        '[data-act="restore"]'
      )
      .addEventListener(
        "click",
        async () => {
          await updateDoc(
            d.ref,
            {
              archived: false
            }
          );

          renderArchivedList();
        }
      );

    row
      .querySelector(
        '[data-act="delete"]'
      )
      .addEventListener(
        "click",
        async () => {
          if (
            confirm(
              "Permanently delete this conversation?"
            )
          ) {
            await deleteConversationDeep(
              d.id
            );

            renderArchivedList();
          }
        }
      );

    list.appendChild(row);
  });
}

// ===== modal close plumbing =====
document
  .querySelectorAll(".close-modal")
  .forEach((btn) =>
    btn.addEventListener(
      "click",
      closeAllModals
    )
  );

document
  .querySelectorAll(".modal-backdrop")
  .forEach((backdrop) => {
    backdrop.addEventListener(
      "click",
      (e) => {
        if (
          e.target === backdrop
        ) {
          closeAllModals();
        }
      }
    );
  });

// ===== profile menu =====
$("profileBtn").addEventListener(
  "click",
  (e) => {
    e.stopPropagation();

    $("profileMenu").classList.toggle(
      "hidden"
    );
  }
);

document.addEventListener(
  "click",
  (e) => {
    if (
      !e.target.closest(
        ".profile-wrap"
      )
    ) {
      $("profileMenu").classList.add(
        "hidden"
      );
    }
  }
);

// ===== sidebar collapse (desktop) =====
$("collapseBtn").addEventListener(
  "click",
  () => {
    sidebar.classList.toggle(
      "collapsed"
    );

    localStorage.setItem(
      "loganathan_sidebar_collapsed",
      sidebar.classList.contains(
        "collapsed"
      )
    );
  }
);

if (
  localStorage.getItem(
    "loganathan_sidebar_collapsed"
  ) === "true"
) {
  sidebar.classList.add(
    "collapsed"
  );
}

// ===== mobile drawer =====
function closeDrawer() {
  sidebar.classList.remove(
    "drawer-open"
  );

  $("drawerBackdrop").classList.add(
    "hidden"
  );
}

$("drawerToggle").addEventListener(
  "click",
  () => {
    sidebar.classList.add(
      "drawer-open"
    );

    $("drawerBackdrop").classList.remove(
      "hidden"
    );
  }
);

$("drawerBackdrop").addEventListener(
  "click",
  closeDrawer
);

// ===== keyboard shortcuts =====
document.addEventListener(
  "keydown",
  (e) => {
    const mod =
      e.metaKey || e.ctrlKey;

    if (
      mod &&
      e.key.toLowerCase() === "k"
    ) {
      e.preventDefault();
      searchInput.focus();
    }

    if (
      mod &&
      e.shiftKey &&
      e.key.toLowerCase() === "o"
    ) {
      e.preventDefault();
      newChat();
    }

    if (e.key === "Escape") {
      closeAllModals();
      closeDrawer();
      $("profileMenu").classList.add(
        "hidden"
      );
    }
  }
);

// ===== offline awareness =====
function updateOfflineBanner() {
  offlineBanner.classList.toggle(
    "hidden",
    navigator.onLine
  );
}

window.addEventListener(
  "online",
  updateOfflineBanner
);

window.addEventListener(
  "offline",
  updateOfflineBanner
);

updateOfflineBanner();