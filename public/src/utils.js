(function () {
  const app = window.EcommerceCanvasApp = window.EcommerceCanvasApp || {};

  function $(selector) {
    return document.querySelector(selector);
  }

  function $$(selector) {
    return Array.from(document.querySelectorAll(selector));
  }

  function createClientId() {
    if (globalThis.crypto?.randomUUID) {
      try {
        return globalThis.crypto.randomUUID();
      } catch {
      }
    }
    const randomPart = () => Math.random().toString(36).slice(2, 10);
    return `id-${Date.now().toString(36)}-${randomPart()}-${randomPart()}`;
  }

  function clampNumber(value, min, max) {
    if (!Number.isFinite(value)) return min;
    return Math.max(min, Math.min(max, value));
  }

  function clampUnit(value) {
    return clampNumber(Number(value), 0, 1);
  }

  function normalizeHexColor(value) {
    const color = String(value || "").trim();
    return /^#[0-9a-f]{6}$/i.test(color) ? color : "#222222";
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("图片加载失败，远程 URL 可能不允许跨域处理。"));
      img.src = src;
    });
  }

  function downloadDataUrl(url, filename) {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    downloadDataUrl(url, filename);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function normalizeOpacity(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 1;
    return numeric > 1 ? numeric / 255 : numeric;
  }

  function safeName(value) {
    return String(value || "product")
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, "-")
      .slice(0, 80) || "product";
  }

  function formatFileSize(bytes) {
    const size = Number(bytes || 0);
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }

  function formatTemplateSize(bytes) {
    const size = Number(bytes || 0);
    if (!size) return "0 MB";
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function ensureWorkspaceDialog() {
    let dialog = $("#ecommerce-canvasDialog");
    if (dialog) return dialog;
    dialog = document.createElement("div");
    dialog.id = "ecommerce-canvasDialog";
    dialog.className = "ecommerce-canvas-dialog";
    dialog.hidden = true;
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.innerHTML = `
      <section class="ecommerce-canvas-dialog-card">
        <div class="ecommerce-canvas-dialog-mark" aria-hidden="true">!</div>
        <div class="ecommerce-canvas-dialog-content">
          <p class="ecommerce-canvas-dialog-kicker"></p>
          <h2></h2>
          <p class="ecommerce-canvas-dialog-message"></p>
          <textarea class="ecommerce-canvas-dialog-input" rows="4" hidden></textarea>
        </div>
        <div class="ecommerce-canvas-dialog-actions">
          <button class="secondary" type="button" data-ecommerce-canvas-dialog-cancel>取消</button>
          <button class="primary" type="button" data-ecommerce-canvas-dialog-confirm>确认</button>
        </div>
      </section>
    `;
    document.body.appendChild(dialog);
    return dialog;
  }

  function showWorkspaceDialog(options = {}) {
    const dialog = ensureWorkspaceDialog();
    const card = dialog.querySelector(".ecommerce-canvas-dialog-card");
    const mark = dialog.querySelector(".ecommerce-canvas-dialog-mark");
    const kicker = dialog.querySelector(".ecommerce-canvas-dialog-kicker");
    const title = dialog.querySelector("h2");
    const message = dialog.querySelector(".ecommerce-canvas-dialog-message");
    const input = dialog.querySelector(".ecommerce-canvas-dialog-input");
    const cancelBtn = dialog.querySelector("[data-ecommerce-canvas-dialog-cancel]");
    const confirmBtn = dialog.querySelector("[data-ecommerce-canvas-dialog-confirm]");
    const type = options.type || "info";
    card?.setAttribute("data-dialog-type", type);
    if (mark) mark.textContent = type === "danger" ? "!" : type === "question" ? "?" : "i";
    if (kicker) kicker.textContent = options.kicker || (type === "danger" ? "任务失败" : "电商 AI 画布提示");
    if (title) title.textContent = options.title || "提示";
    if (message) message.textContent = options.message || "";
    if (cancelBtn) {
      cancelBtn.textContent = options.cancelText || "取消";
      cancelBtn.hidden = options.showCancel === false;
    }
    if (confirmBtn) confirmBtn.textContent = options.confirmText || "确认";
    if (input) {
      input.hidden = !options.input;
      input.value = options.defaultValue || "";
      input.placeholder = options.placeholder || "";
    }
    dialog.hidden = false;
    return new Promise((resolve) => {
      const close = (value) => {
        dialog.hidden = true;
        confirmBtn?.removeEventListener("click", onConfirm);
        cancelBtn?.removeEventListener("click", onCancel);
        dialog.removeEventListener("keydown", onKeydown);
        resolve(value);
      };
      const onConfirm = () => {
        if (options.input) {
          const value = String(input?.value || "").trim();
          if (options.required && !value) {
            input?.focus();
            return;
          }
          close(value);
          return;
        }
        close(true);
      };
      const onCancel = () => close(options.input ? null : false);
      const onKeydown = (event) => {
        if (event.key === "Escape" && options.showCancel !== false) onCancel();
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) onConfirm();
      };
      confirmBtn?.addEventListener("click", onConfirm);
      cancelBtn?.addEventListener("click", onCancel);
      dialog.addEventListener("keydown", onKeydown);
      requestAnimationFrame(() => (options.input ? input : confirmBtn)?.focus({ preventScroll: true }));
    });
  }

  function confirmWorkspaceDialog(message, options = {}) {
    return showWorkspaceDialog({
      ...options,
      message,
      type: options.type || "question",
      showCancel: true
    });
  }

  function promptWorkspaceDialog(message, options = {}) {
    return showWorkspaceDialog({
      ...options,
      message,
      input: true,
      required: options.required !== false,
      showCancel: true
    });
  }

  function showAiFailureDialog(message, options = {}) {
    return showWorkspaceDialog({
      title: options.title || "生成失败",
      message: String(message || options.fallback || "任务失败，请稍后重试。").trim() || "任务失败，请稍后重试。",
      kicker: options.kicker || "任务失败",
      type: "danger",
      showCancel: options.showCancel === undefined ? false : Boolean(options.showCancel),
      cancelText: options.cancelText || "取消",
      confirmText: options.confirmText || "确认"
    });
  }

  app.utils = {
    $,
    $$,
    createClientId,
    clampNumber,
    clampUnit,
    normalizeHexColor,
    fileToDataUrl,
    loadImage,
    downloadDataUrl,
    downloadBlob,
    normalizeOpacity,
    safeName,
    formatFileSize,
    formatTemplateSize,
    escapeHtml,
    showWorkspaceDialog,
    confirmWorkspaceDialog,
    promptWorkspaceDialog,
    showAiFailureDialog
  };
})();
