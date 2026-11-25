"use strict";

const STORAGE_KEY = "blurbs";
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const UI_LOCALE = browser.i18n.getUILanguage() || "en-US";

const $ = (id) => document.getElementById(id);

function t(key, substitutions) {
  const message = browser.i18n.getMessage(key, substitutions);
  return message || key;
}

const els = {
  newForm: $("new-form"),
  newLabel: $("new-label"),
  newText: $("new-text"),
  charCount: $("char-count"),
  clearForm: $("clear-form"),
  countLabel: $("count-label"),
  list: $("blurb-list"),
  empty: $("empty-state"),
  dangerRow: $("danger-row"),
  importBtn: $("import-btn"),
  importFile: $("import-file"),
  exportJson: $("export-json"),
  exportTxt: $("export-txt"),
  clearAll: $("clear-all"),
  emptyCreate: $("empty-create"),
  loadSamples: $("load-samples"),
  toast: $("toast"),
  editDialog: $("edit-dialog"),
  editForm: $("edit-form"),
  editLabel: $("edit-label"),
  editText: $("edit-text"),
  editClose: $("edit-close"),
  editCancel: $("edit-cancel")
};

let blurbs = [];
let editingId = null;
let pendingDeleteId = null;
let pendingDeleteTimer = null;
let clearAllArmed = false;
let clearAllTimer = null;
let toastTimer = null;
let toastHideTimer = null;

/* ------------------------------------------------------------------ */
/* Yerelleştirme                                                       */
/* ------------------------------------------------------------------ */

function localizeStaticUi() {
  const language = browser.i18n.getUILanguage() || "en";
  document.documentElement.lang = language.split(/[-_]/)[0];
  document.title = t("optionsTitle");

  for (const node of document.querySelectorAll("[data-i18n]")) {
    const key = node.dataset.i18n;
    const message = t(key);
    if (message && message !== key) node.textContent = message;
  }

  for (const node of document.querySelectorAll("[data-i18n-placeholder]")) {
    const key = node.dataset.i18nPlaceholder;
    const message = t(key);
    if (message && message !== key) node.setAttribute("placeholder", message);
  }

  for (const node of document.querySelectorAll("[data-i18n-title]")) {
    const key = node.dataset.i18nTitle;
    const message = t(key);
    if (message && message !== key) node.setAttribute("title", message);
  }

  for (const node of document.querySelectorAll("[data-i18n-aria-label]")) {
    const key = node.dataset.i18nAriaLabel;
    const message = t(key);
    if (message && message !== key) node.setAttribute("aria-label", message);
  }
}

function getSampleBlurbs() {
  return [
    { label: t("sampleEmailLabel"), text: t("sampleEmailText") },
    { label: t("samplePhoneLabel"), text: t("samplePhoneText") },
    { label: t("sampleSignatureLabel"), text: t("sampleSignatureText") }
  ];
}

/* ------------------------------------------------------------------ */
/* Yardımcılar                                                         */
/* ------------------------------------------------------------------ */

function uid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatNumber(value) {
  return Number(value).toLocaleString(UI_LOCALE);
}

function displayName(blurb) {
  if (!blurb) return t("genericBlurb");
  const name = (blurb.label || blurb.text || t("genericBlurb")).replace(/\s+/g, " ").trim();
  return name.length > 42 ? `${name.slice(0, 41)}…` : name;
}

function showToast(message, isError = false) {
  window.clearTimeout(toastTimer);
  window.clearTimeout(toastHideTimer);

  els.toast.textContent = message;
  els.toast.classList.toggle("error", isError);
  els.toast.hidden = false;
  els.toast.classList.remove("show");
  void els.toast.offsetWidth;
  els.toast.classList.add("show");

  toastTimer = window.setTimeout(() => {
    els.toast.classList.remove("show");
    toastHideTimer = window.setTimeout(() => {
      if (!els.toast.classList.contains("show")) {
        els.toast.hidden = true;
      }
    }, 220);
  }, 2700);
}

function updateCharCount() {
  els.charCount.textContent = String(els.newText.value.length);
}

/* ------------------------------------------------------------------ */
/* Depolama                                                            */
/* ------------------------------------------------------------------ */

function normalizeStoredItem(item, seen) {
  if (
    !item ||
    typeof item !== "object" ||
    typeof item.text !== "string" ||
    item.text.trim().length === 0
  ) {
    return { blurb: null, changed: true };
  }

  let changed = false;
  let id = typeof item.id === "string" && item.id.length > 0 ? item.id : null;

  if (!id || seen.has(id)) {
    id = uid();
    changed = true;
  }
  seen.add(id);

  let label = item.label;
  if (typeof label !== "string") {
    label = "";
    changed = true;
  }

  let createdAt = item.createdAt;
  if (typeof createdAt !== "number" || !Number.isFinite(createdAt)) {
    createdAt = Date.now();
    changed = true;
  }

  return {
    blurb: { id, label, text: item.text, createdAt },
    changed
  };
}

async function loadBlurbs() {
  let rawList = [];
  let needsSave = false;

  try {
    const data = await browser.storage.local.get({ [STORAGE_KEY]: [] });
    if (Array.isArray(data[STORAGE_KEY])) {
      rawList = data[STORAGE_KEY];
    } else {
      needsSave = true;
    }
  } catch (error) {
    console.warn("Insert Blurb: blurblar okunamadı", error);
  }

  const seen = new Set();
  const next = [];
  let changed = needsSave;

  for (const item of rawList) {
    const result = normalizeStoredItem(item, seen);
    if (result.changed) changed = true;
    if (result.blurb) next.push(result.blurb);
    else changed = true;
  }

  blurbs = next;
  render();

  if (changed) {
    try {
      await browser.storage.local.set({ [STORAGE_KEY]: blurbs });
    } catch (error) {
      console.warn("Insert Blurb: blurblar düzeltilemedi", error);
    }
  }
}

async function persist(nextBlurbs) {
  blurbs = nextBlurbs;

  try {
    await browser.storage.local.set({ [STORAGE_KEY]: blurbs });
    render();
    return true;
  } catch (error) {
    console.error("Insert Blurb: kaydedilemedi", error);
    showToast(t("toastSaveFailed"), true);
    await loadBlurbs();
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Liste                                                               */
/* ------------------------------------------------------------------ */

function makeMiniButton(text, action, label, extraClass = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `mini${extraClass ? ` ${extraClass}` : ""}`;
  button.dataset.action = action;
  button.textContent = text;
  button.title = label;
  button.setAttribute("aria-label", label);
  return button;
}

function buildBlurbItem(blurb, index) {
  const item = document.createElement("li");
  item.className = "blurb";
  item.dataset.id = blurb.id;

  const content = document.createElement("div");
  content.className = "blurb-content";

  const top = document.createElement("div");
  top.className = "blurb-top";

  const label = document.createElement("span");
  label.className = `blurb-label${blurb.label ? "" : " placeholder"}`;
  label.textContent = blurb.label || t("unlabeled");
  label.title = blurb.label || t("noLabelTitle");

  const meta = document.createElement("span");
  meta.className = "blurb-meta";
  meta.textContent = t("characters", [formatNumber(blurb.text.length)]);

  top.append(label, meta);

  const preview = document.createElement("p");
  preview.className = "blurb-text";
  preview.textContent = blurb.text;
  preview.title = blurb.text;

  content.append(top, preview);

  const actions = document.createElement("div");
  actions.className = "blurb-actions";

  const up = makeMiniButton("↑", "up", t("moveUpTitle"));
  up.disabled = index === 0;

  const down = makeMiniButton("↓", "down", t("moveDownTitle"));
  down.disabled = index === blurbs.length - 1;

  const edit = makeMiniButton(t("editButton"), "edit", t("editButton"));
  const remove = makeMiniButton(
    pendingDeleteId === blurb.id ? t("confirmDeleteButton") : t("deleteButton"),
    "delete",
    pendingDeleteId === blurb.id ? t("confirmDeleteButton") : t("deleteButton"),
    pendingDeleteId === blurb.id ? "danger confirm" : "danger"
  );

  actions.append(up, down, edit, remove);
  item.append(content, actions);

  return item;
}

function render() {
  els.countLabel.textContent =
    blurbs.length === 1
      ? t("blurbCountOne")
      : t("blurbCountOther", [formatNumber(blurbs.length)]);

  els.empty.hidden = blurbs.length > 0;
  els.dangerRow.hidden = blurbs.length === 0;
  els.list.replaceChildren();

  for (let index = 0; index < blurbs.length; index += 1) {
    els.list.appendChild(buildBlurbItem(blurbs[index], index));
  }
}

/* ------------------------------------------------------------------ */
/* Ekleme / düzenleme / silme                                          */
/* ------------------------------------------------------------------ */

async function handleListClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const item = button.closest(".blurb");
  const id = item ? item.dataset.id : null;
  if (!id) return;

  const action = button.dataset.action;

  if (action === "edit") {
    openEditDialog(id);
    return;
  }

  if (action === "up" || action === "down") {
    const index = blurbs.findIndex((blurb) => blurb.id === id);
    const nextIndex = index + (action === "up" ? -1 : 1);
    if (index < 0 || nextIndex < 0 || nextIndex >= blurbs.length) return;

    const next = [...blurbs];
    const temporary = next[index];
    next[index] = next[nextIndex];
    next[nextIndex] = temporary;
    await persist(next);
    return;
  }

  if (action === "delete") {
    if (pendingDeleteId !== id) {
      pendingDeleteId = id;
      window.clearTimeout(pendingDeleteTimer);
      pendingDeleteTimer = window.setTimeout(() => {
        pendingDeleteId = null;
        render();
      }, 3500);
      render();
      return;
    }

    const removed = blurbs.find((blurb) => blurb.id === id);
    pendingDeleteId = null;
    window.clearTimeout(pendingDeleteTimer);

    const saved = await persist(blurbs.filter((blurb) => blurb.id !== id));
    if (saved) showToast(t("toastDeleted", [displayName(removed)]));
  }
}

function openEditDialog(id) {
  const blurb = blurbs.find((item) => item.id === id);
  if (!blurb) return;

  editingId = id;
  els.editLabel.value = blurb.label;
  els.editText.value = blurb.text;
  if (els.editDialog.open) els.editDialog.close();
  els.editDialog.showModal();

  window.setTimeout(() => {
    if (blurb.label) els.editText.focus();
    else els.editLabel.focus();
  }, 30);
}

async function saveEdit(event) {
  event.preventDefault();

  const text = els.editText.value;
  if (!text.trim()) {
    showToast(t("toastTextRequired"), true);
    els.editText.focus();
    return;
  }

  const index = blurbs.findIndex((blurb) => blurb.id === editingId);
  if (index < 0) {
    els.editDialog.close();
    return;
  }

  const next = blurbs.map((blurb) =>
    blurb.id === editingId
      ? {
          ...blurb,
          label: els.editLabel.value.trim(),
          text
        }
      : blurb
  );

  const saved = await persist(next);
  if (!saved) return;

  els.editDialog.close();
  showToast(t("toastUpdated"));
}

/* ------------------------------------------------------------------ */
/* Dışa / içe aktarma                                                  */
/* ------------------------------------------------------------------ */

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function exportJson() {
  if (blurbs.length === 0) {
    showToast(t("toastNoExport"), true);
    return;
  }

  const payload = {
    app: "insert-blurb",
    version: 1,
    exportedAt: new Date().toISOString(),
    blurbs: blurbs.map(({ label, text, createdAt }) => ({ label, text, createdAt }))
  };

  const date = new Date().toISOString().slice(0, 10);
  downloadFile(
    `insert-blurb-backup-${date}.json`,
    JSON.stringify(payload, null, 2),
    "application/json;charset=utf-8"
  );
  showToast(t("toastJsonExported"));
}

function exportTxt() {
  if (blurbs.length === 0) {
    showToast(t("toastNoExport"), true);
    return;
  }

  const content = blurbs
    .map((blurb) => blurb.text.replace(/\r?\n/g, " "))
    .join("\n");

  const date = new Date().toISOString().slice(0, 10);
  downloadFile(
    `insert-blurb-${date}.txt`,
    `${content}\n`,
    "text/plain;charset=utf-8"
  );
  showToast(t("toastTxtExported"));
}

function makeImportedBlurb(item) {
  if (typeof item === "string") {
    if (!item.trim()) return null;
    return {
      id: uid(),
      label: "",
      text: item,
      createdAt: Date.now()
    };
  }

  if (!item || typeof item !== "object" || typeof item.text !== "string" || !item.text.trim()) {
    return null;
  }

  return {
    id: uid(),
    label: typeof item.label === "string" ? item.label.trim().slice(0, 80) : "",
    text: item.text,
    createdAt: Date.now()
  };
}

function parseImport(raw) {
  const content = raw.replace(/^\uFEFF/, "").trim();
  if (!content) return [];

  if (content.startsWith("[") || content.startsWith("{")) {
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      throw new Error(t("toastJsonParseFailed"));
    }

    const list = Array.isArray(parsed)
      ? parsed
      : parsed && Array.isArray(parsed.blurbs)
        ? parsed.blurbs
        : null;

    if (!list) throw new Error(t("toastJsonNoList"));

    return list.map(makeImportedBlurb).filter(Boolean);
  }

  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(makeImportedBlurb)
    .filter(Boolean);
}

async function importFile() {
  const file = els.importFile.files && els.importFile.files[0];
  els.importFile.value = "";
  if (!file) return;

  if (file.size > MAX_IMPORT_BYTES) {
    showToast(t("toastFileTooLarge"), true);
    return;
  }

  try {
    const raw = await file.text();
    const imported = parseImport(raw);

    if (imported.length === 0) {
      showToast(t("toastNoBlurbsInFile"), true);
      return;
    }

    const existing = new Set(blurbs.map((blurb) => blurb.text));
    const fresh = [];

    for (const blurb of imported) {
      if (!existing.has(blurb.text)) {
        existing.add(blurb.text);
        fresh.push(blurb);
      }
    }

    if (fresh.length === 0) {
      showToast(t("toastAllAlreadySaved"));
      return;
    }

    const saved = await persist([...blurbs, ...fresh]);
    if (saved) {
      showToast(t("toastImported", [formatNumber(fresh.length)]));
    }
  } catch (error) {
    console.error("Insert Blurb: içe aktarma hatası", error);
    showToast(error.message || t("toastImportFailed"), true);
  }
}

/* ------------------------------------------------------------------ */
/* Örnekler / temizleme                                                */
/* ------------------------------------------------------------------ */

async function loadSamples() {
  const existing = new Set(blurbs.map((blurb) => blurb.text));
  const additions = getSampleBlurbs()
    .filter((sample) => !existing.has(sample.text))
    .map((sample) => ({
      id: uid(),
      label: sample.label,
      text: sample.text,
      createdAt: Date.now()
    }));

  if (additions.length === 0) {
    showToast(t("toastSamplesExist"));
    return;
  }

  const saved = await persist([...blurbs, ...additions]);
  if (saved) {
    showToast(t("toastSamplesAdded", [formatNumber(additions.length)]));
  }
}

async function clearAll() {
  if (!clearAllArmed) {
    clearAllArmed = true;
    els.clearAll.textContent = t("confirmClearAll");
    els.clearAll.classList.add("confirm");

    window.clearTimeout(clearAllTimer);
    clearAllTimer = window.setTimeout(() => {
      clearAllArmed = false;
      els.clearAll.textContent = t("clearAllButton");
      els.clearAll.classList.remove("confirm");
    }, 3500);
    return;
  }

  clearAllArmed = false;
  window.clearTimeout(clearAllTimer);
  els.clearAll.textContent = t("clearAllButton");
  els.clearAll.classList.remove("confirm");

  const saved = await persist([]);
  if (saved) showToast(t("toastAllDeleted"));
}

/* ------------------------------------------------------------------ */
/* Olaylar                                                             */
/* ------------------------------------------------------------------ */

function bindEvents() {
  els.newText.addEventListener("input", updateCharCount);

  els.clearForm.addEventListener("click", () => {
    els.newForm.reset();
    updateCharCount();
    els.newLabel.focus();
  });

  els.newForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const text = els.newText.value;
    if (!text.trim()) {
      showToast(t("toastTextRequired"), true);
      els.newText.focus();
      return;
    }

    const blurb = {
      id: uid(),
      label: els.newLabel.value.trim(),
      text,
      createdAt: Date.now()
    };

    const saved = await persist([...blurbs, blurb]);
    if (!saved) return;

    els.newForm.reset();
    updateCharCount();
    els.newLabel.focus();
    showToast(t("toastAdded"));
  });

  els.list.addEventListener("click", (event) => {
    void handleListClick(event);
  });

  els.editForm.addEventListener("submit", (event) => {
    void saveEdit(event);
  });

  els.editCancel.addEventListener("click", () => els.editDialog.close());
  els.editClose.addEventListener("click", () => els.editDialog.close());

  els.editDialog.addEventListener("click", (event) => {
    if (event.target === els.editDialog) els.editDialog.close();
  });

  els.editDialog.addEventListener("close", () => {
    editingId = null;
  });

  els.importBtn.addEventListener("click", () => els.importFile.click());
  els.importFile.addEventListener("change", () => {
    void importFile();
  });

  els.exportJson.addEventListener("click", exportJson);
  els.exportTxt.addEventListener("click", exportTxt);

  els.emptyCreate.addEventListener("click", () => {
    els.newLabel.focus();
    els.newLabel.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  els.loadSamples.addEventListener("click", () => {
    void loadSamples();
  });

  els.clearAll.addEventListener("click", () => {
    void clearAll();
  });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[STORAGE_KEY]) {
      void loadBlurbs();
    }
  });
}

async function init() {
  localizeStaticUi();
  bindEvents();
  updateCharCount();
  await loadBlurbs();
}

void init();
