"use strict";

(() => {
  if (globalThis.__insertBlurbLoaded === true) return;
  globalThis.__insertBlurbLoaded = true;

  const TEXT_INPUT_TYPES = new Set([
    "text",
    "search",
    "url",
    "tel",
    "email",
    "password",
    "number"
  ]);

  let target = null;
  /* input/textarea için { start, end }; contenteditable için Range */
  let savedSelection = null;

  /* ---------------------------------------------------------------- */
  /* Yardımcılar                                                      */
  /* ---------------------------------------------------------------- */

  function isEditable(node) {
    if (!node || node.nodeType !== 1) return false;

    if (node.isContentEditable) return true;

    if (node.tagName === "TEXTAREA") {
      return !node.disabled && !node.readOnly;
    }

    if (node.tagName === "INPUT") {
      const type = String(node.type || "text").toLowerCase();
      return TEXT_INPUT_TYPES.has(type) && !node.disabled && !node.readOnly;
    }

    return false;
  }

  function getEditingHost(node) {
    if (!node || !node.isContentEditable) return null;
    let host = node;
    while (host.parentElement && host.parentElement.isContentEditable) {
      host = host.parentElement;
    }
    return host;
  }

  function normalizeTarget(node) {
    return getEditingHost(node) || node;
  }

  function eventPath(event) {
    return typeof event.composedPath === "function" ? event.composedPath() : [event.target];
  }

  function findEditableFromEvent(event) {
    for (const node of eventPath(event)) {
      if (isEditable(node)) return normalizeTarget(node);
    }
    return null;
  }

  function deepActiveElement() {
    let element = document.activeElement;
    while (element && element.shadowRoot && element.shadowRoot.activeElement) {
      element = element.shadowRoot.activeElement;
    }
    return element;
  }

  function findActiveEditable() {
    const active = deepActiveElement();
    return isEditable(active) ? normalizeTarget(active) : null;
  }

  function remember(node) {
    if (!node) return;
    target = node;

    const host = getEditingHost(node);
    if (host) {
      target = host;
      savedSelection = null;

      const selection = window.getSelection();
      if (
        selection &&
        selection.rangeCount > 0 &&
        host.contains(selection.anchorNode)
      ) {
        savedSelection = selection.getRangeAt(0).cloneRange();
      }
      return;
    }

    if (node.tagName === "INPUT" || node.tagName === "TEXTAREA") {
      try {
        savedSelection = {
          start: node.selectionStart,
          end: node.selectionEnd
        };
      } catch (error) {
        savedSelection = null;
      }
    }
  }

  function setNativeValue(element, value) {
    const prototype =
      element.tagName === "TEXTAREA"
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");

    if (descriptor && typeof descriptor.set === "function") {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }
  }

  function dispatchInput(element, text) {
    let event;
    try {
      event = new InputEvent("input", {
        bubbles: true,
        composed: true,
        inputType: "insertText",
        data: text
      });
    } catch (error) {
      event = new Event("input", { bubbles: true, composed: true });
    }
    element.dispatchEvent(event);
  }

  /* ---------------------------------------------------------------- */
  /* Metin ekleme                                                     */
  /* ---------------------------------------------------------------- */

  function insertIntoInput(element, text) {
    try {
      element.focus({ preventScroll: true });
    } catch (error) {
      element.focus();
    }

    const value = element.value || "";
    let start = value.length;
    let end = value.length;

    if (
      savedSelection &&
      typeof savedSelection.start === "number" &&
      typeof savedSelection.end === "number"
    ) {
      start = Math.max(0, Math.min(savedSelection.start, value.length));
      end = Math.max(start, Math.min(savedSelection.end, value.length));
    }

    let insertedText = text;
    const maxLength = typeof element.maxLength === "number" ? element.maxLength : -1;

    if (maxLength >= 0) {
      const available = maxLength - (value.length - (end - start));
      if (available <= 0) return { ok: false, reason: "maxlength" };
      if (insertedText.length > available) {
        insertedText = insertedText.slice(0, available);
      }
    }

    try {
      element.setSelectionRange(start, end);
    } catch (error) {
      /* Bazı input türleri seçim API'sini desteklemez. */
    }

    let inserted = false;
    try {
      inserted = document.execCommand("insertText", false, insertedText);
    } catch (error) {
      inserted = false;
    }

    if (!inserted || element.value === value) {
      const nextValue =
        value.slice(0, start) + insertedText + value.slice(end);

      setNativeValue(element, nextValue);

      try {
        element.setSelectionRange(
          start + insertedText.length,
          start + insertedText.length
        );
      } catch (error) {
        /* Seçim API'si desteklenmiyor. */
      }

      dispatchInput(element, insertedText);
      inserted = element.value !== value;
    }

    if (!inserted) return { ok: false, reason: "failed" };

    savedSelection = {
      start: start + insertedText.length,
      end: start + insertedText.length
    };

    return { ok: true };
  }

  function placeCaretAtEnd(host) {
    const selection = window.getSelection();
    if (!selection) return null;

    const range = document.createRange();
    range.selectNodeContents(host);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    return range;
  }

  function insertIntoEditable(host, text) {
    try {
      host.focus({ preventScroll: true });
    } catch (error) {
      host.focus();
    }

    const selection = window.getSelection();
    if (!selection) return { ok: false, reason: "failed" };

    let range = null;

    if (
      savedSelection &&
      typeof savedSelection.cloneRange === "function" &&
      host.contains(savedSelection.commonAncestorContainer)
    ) {
      range = savedSelection.cloneRange();
    } else if (
      selection.rangeCount > 0 &&
      host.contains(selection.anchorNode)
    ) {
      range = selection.getRangeAt(0).cloneRange();
    }

    if (range) {
      try {
        selection.removeAllRanges();
        selection.addRange(range);
      } catch (error) {
        range = null;
      }
    }

    if (!range) {
      range = placeCaretAtEnd(host);
    }

    if (!range) return { ok: false, reason: "failed" };

    let inserted = false;
    try {
      inserted = document.execCommand("insertText", false, text);
    } catch (error) {
      inserted = false;
    }

    if (!inserted) {
      try {
        const currentRange =
          selection.rangeCount > 0 ? selection.getRangeAt(0) : range;
        currentRange.deleteContents();

        const textNode = document.createTextNode(text);
        currentRange.insertNode(textNode);
        currentRange.setStartAfter(textNode);
        currentRange.collapse(true);

        selection.removeAllRanges();
        selection.addRange(currentRange);
        dispatchInput(host, text);
        inserted = true;
      } catch (error) {
        inserted = false;
      }
    }

    if (!inserted) return { ok: false, reason: "failed" };

    savedSelection =
      selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;
    target = host;

    return { ok: true };
  }

  function insertText(text) {
    if (typeof text !== "string" || text.length === 0) {
      return { ok: false, reason: "empty" };
    }

    let element = target;
    if (!element || !element.isConnected || !isEditable(element)) {
      element = findActiveEditable();
    }

    if (!element) return { ok: false, reason: "no-target" };

    const host = getEditingHost(element);
    if (host) return insertIntoEditable(host, text);

    if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
      return insertIntoInput(element, text);
    }

    return { ok: false, reason: "no-target" };
  }

  /* ---------------------------------------------------------------- */
  /* Olaylar                                                          */
  /* ---------------------------------------------------------------- */

  document.addEventListener(
    "focusin",
    (event) => {
      const editable = findEditableFromEvent(event);
      if (editable) remember(editable);
    },
    true
  );

  document.addEventListener(
    "contextmenu",
    (event) => {
      const editable = findEditableFromEvent(event);
      if (editable) remember(editable);
    },
    true
  );

  document.addEventListener("selectionchange", () => {
    if (!target) return;

    const host = getEditingHost(target);
    if (!host) return;

    const selection = window.getSelection();
    if (
      selection &&
      selection.rangeCount > 0 &&
      host.contains(selection.anchorNode)
    ) {
      savedSelection = selection.getRangeAt(0).cloneRange();
    }
  });

  browser.runtime.onMessage.addListener((message) => {
    if (!message || typeof message.type !== "string") return undefined;

    if (message.type === "ib:ping") {
      return Promise.resolve({ ok: true });
    }

    if (message.type === "ib:insert") {
      return Promise.resolve(insertText(message.text));
    }

    return undefined;
  });
})();
