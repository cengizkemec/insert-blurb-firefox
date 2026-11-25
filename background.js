"use strict";

/*
 * Insert Blurb (Firefox)
 * Sağ tık menüsünden metin kutularına kayıtlı metin ekler.
 */

const STORAGE_KEY = "blurbs";
const ROOT_ID = "ib:root";
const MANAGE_ID = "ib:manage";
const EMPTY_ID = "ib:empty";
const SEPARATOR_ID = "ib:separator";
const ITEM_PREFIX = "ib:item:";
const DOCUMENT_PATTERNS = ["http://*/*", "https://*/*", "file:///*"];

let menuQueue = Promise.resolve();

/* ------------------------------------------------------------------ */
/* Yerelleştirme                                                       */
/* ------------------------------------------------------------------ */

function t(key, substitutions) {
  const message = browser.i18n.getMessage(key, substitutions);
  return message || key;
}

/* ------------------------------------------------------------------ */
/* Depolama                                                            */
/* ------------------------------------------------------------------ */

async function loadBlurbs() {
  try {
    const data = await browser.storage.local.get({ [STORAGE_KEY]: [] });
    const list = Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
    return list.filter(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof item.text === "string" &&
        item.text.trim().length > 0
    );
  } catch (error) {
    console.warn("Insert Blurb: blurblar okunamadı", error);
    return [];
  }
}

function menuLabel(blurb) {
  const base = (blurb.label || blurb.text || "Blurb").replace(/\s+/g, " ").trim();
  return base.length > 60 ? `${base.slice(0, 59)}…` : base;
}

/* ------------------------------------------------------------------ */
/* Menüler                                                             */
/* ------------------------------------------------------------------ */

async function createMenuItem(properties) {
  try {
    await browser.menus.create({
      ...properties,
      contexts: ["editable"],
      documentUrlPatterns: DOCUMENT_PATTERNS
    });
  } catch (error) {
    console.warn("Insert Blurb: menü öğesi oluşturulamadı", error);
  }
}

async function rebuildMenus() {
  const blurbs = await loadBlurbs();

  try {
    await browser.menus.removeAll();
  } catch (error) {
    /* Menüler zaten temiz olabilir. */
  }

  await createMenuItem({
    id: ROOT_ID,
    title: t("menuRoot")
  });

  if (blurbs.length === 0) {
    await createMenuItem({
      id: EMPTY_ID,
      parentId: ROOT_ID,
      title: t("menuEmpty"),
      enabled: false
    });
  } else {
    for (const blurb of blurbs) {
      if (!blurb.id) continue;
      await createMenuItem({
        id: `${ITEM_PREFIX}${blurb.id}`,
        parentId: ROOT_ID,
        title: menuLabel(blurb)
      });
    }
  }

  await createMenuItem({
    id: SEPARATOR_ID,
    parentId: ROOT_ID,
    type: "separator"
  });

  await createMenuItem({
    id: MANAGE_ID,
    parentId: ROOT_ID,
    title: t("menuManage")
  });
}

function queueRebuild() {
  menuQueue = menuQueue
    .then(rebuildMenus, rebuildMenus)
    .catch((error) => {
      console.warn("Insert Blurb: menüler oluşturulamadı", error);
    });
  return menuQueue;
}

/* ------------------------------------------------------------------ */
/* Ekleme                                                              */
/* ------------------------------------------------------------------ */

async function notifyError(message) {
  try {
    await browser.notifications.create({
      type: "basic",
      iconUrl: browser.runtime.getURL("icons/icon-128.png"),
      title: t("notifyTitle"),
      message
    });
  } catch (error) {
    console.warn("Insert Blurb: bildirim gösterilemedi", error);
  }
}

async function sendInsert(tabId, frameId, text) {
  const message = { type: "ib:insert", text };

  try {
    const pong = await browser.tabs.sendMessage(
      tabId,
      { type: "ib:ping" },
      { frameId }
    );

    if (pong && pong.ok === true) {
      return await browser.tabs.sendMessage(tabId, message, { frameId });
    }
  } catch (firstError) {
    /* Eklenti yeni kurulduysa eski sekmelerde content script olmayabilir. */
  }

  await browser.tabs.executeScript(tabId, {
    file: "content.js",
    frameId
  });

  return browser.tabs.sendMessage(tabId, message, { frameId });
}

function failureMessage(result) {
  if (result && result.reason === "no-target") {
    return t("errorNoTarget");
  }
  if (result && result.reason === "maxlength") {
    return t("errorMaxLength");
  }
  return t("errorFailed");
}

async function handleInsert(blurbId, info, tab) {
  const tabId = tab && Number.isInteger(tab.id) ? tab.id : null;
  if (tabId === null) return;

  const blurbs = await loadBlurbs();
  const blurb = blurbs.find((item) => item.id === blurbId);

  if (!blurb) {
    await queueRebuild();
    return;
  }

  const frameId = Number.isInteger(info && info.frameId) ? info.frameId : 0;

  try {
    const result = await sendInsert(tabId, frameId, blurb.text);
    if (!result || result.ok !== true) {
      await notifyError(failureMessage(result));
    }
  } catch (error) {
    console.warn("Insert Blurb: metin eklenemedi", error);
    await notifyError(t("errorFailed"));
  }
}

/* ------------------------------------------------------------------ */
/* Olaylar                                                             */
/* ------------------------------------------------------------------ */

browser.menus.onClicked.addListener((info, tab) => {
  const menuId = String(info.menuItemId);

  if (menuId === MANAGE_ID || menuId === EMPTY_ID) {
    void browser.runtime.openOptionsPage();
    return;
  }

  if (!menuId.startsWith(ITEM_PREFIX)) return;

  const blurbId = menuId.slice(ITEM_PREFIX.length);
  void handleInsert(blurbId, info, tab);
});

browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[STORAGE_KEY]) {
    void queueRebuild();
  }
});

browser.runtime.onInstalled.addListener((details) => {
  void queueRebuild();
  if (details.reason === "install") {
    void browser.runtime.openOptionsPage();
  }
});

browser.runtime.onStartup.addListener(() => {
  void queueRebuild();
});

void queueRebuild();
