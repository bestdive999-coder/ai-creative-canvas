(function () {
  const app = window.EcommerceCanvasApp = window.EcommerceCanvasApp || {};

  app.createCanvasContextController = function createCanvasContextController(deps) {
    const {
      els,
      state,
      createClientId,
      toast,
      selectedCanvasObject,
      updateCanvasPropsPanel,
      renderCanvasLayers,
      copyCanvasSelection,
      pasteCanvasClipboard,
      activateCanvasSelectTool,
      addCanvasText,
      addCanvasFrame,
      activateCanvasToolMode,
      deleteCanvasSelection,
      sendCanvasSelectionToChat,
      groupCanvasSelection,
      toggleCanvasSelectionVisible,
      toggleCanvasSelectionLock,
      removeNearWhiteCanvasImageBackground,
      stopCanvasImageEraseMode
    } = deps;

    function bindCanvasContextMenu(canvas) {
      if (!canvas?.upperCanvasEl || canvas.upperCanvasEl.dataset.contextMenuReady === "1") return;
      canvas.upperCanvasEl.dataset.contextMenuReady = "1";
      canvas.upperCanvasEl.addEventListener("contextmenu", handleCanvasContextMenu);
      document.addEventListener("click", hideCanvasContextMenu);
      window.addEventListener("resize", hideCanvasContextMenu);
    }
    
    function bindCanvasKeyboardShortcuts() {
      if (document.body.dataset.canvasShortcutReady === "1") return;
      document.body.dataset.canvasShortcutReady = "1";
      const setTemporaryCanvasPan = (active) => {
        const canvas = state.canvasBeta.canvas;
        if (!canvas || !state.canvasBeta.initialized) return;
        state.canvasBeta.spacePanMode = Boolean(active);
        if (active) {
          canvas.selection = false;
          canvas.skipTargetFind = true;
          canvas.defaultCursor = "grab";
          canvas.hoverCursor = "grab";
        } else if (!state.canvasBeta.panMode) {
          canvas.selection = true;
          canvas.skipTargetFind = false;
          canvas.defaultCursor = "default";
          canvas.hoverCursor = "move";
        }
        canvas.requestRenderAll();
      };
      document.addEventListener("keydown", (event) => {
        const canvas = state.canvasBeta.canvas;
        if (!canvas || !state.canvasBeta.initialized) return;
        const target = event.target;
        const isTyping = target?.matches?.("input, textarea, select, [contenteditable='true']");
        if (isTyping) return;
        const key = String(event.key || "").toLowerCase();
        const mod = event.ctrlKey || event.metaKey;
        if (!mod && event.code === "Space") {
          event.preventDefault();
          if (!event.repeat) setTemporaryCanvasPan(true);
          return;
        }
        if (state.canvasBeta.eraseSession && (event.key === "Escape" || event.key === "Enter")) {
          event.preventDefault();
          stopCanvasImageEraseMode({ commit: event.key === "Enter" });
          return;
        }
        if (mod && key === "c") {
          event.preventDefault();
          copyCanvasSelection();
        } else if (mod && key === "v") {
          event.preventDefault();
          pasteCanvasClipboard();
        } else if (!mod && key === "v") {
          event.preventDefault();
          activateCanvasSelectTool();
        } else if (!mod && key === "h") {
          event.preventDefault();
          activateCanvasToolMode("pan");
        } else if (!mod && key === "m") {
          event.preventDefault();
          activateCanvasToolMode("mark");
        } else if (!mod && key === "t") {
          event.preventDefault();
          addCanvasText();
        } else if (!mod && key === "f") {
          event.preventDefault();
          addCanvasFrame("800x800");
        } else if (!mod && key === "p") {
          event.preventDefault();
          activateCanvasToolMode(event.shiftKey ? "pencil" : "pen");
        } else if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          deleteCanvasSelection();
        }
      });
      document.addEventListener("keyup", (event) => {
        if (event.code !== "Space") return;
        const target = event.target;
        const isTyping = target?.matches?.("input, textarea, select, [contenteditable='true']");
        if (isTyping) return;
        event.preventDefault();
        setTemporaryCanvasPan(false);
      });
      window.addEventListener("blur", () => setTemporaryCanvasPan(false));
    }
    
    function handleCanvasContextMenu(event) {
      const canvas = state.canvasBeta.canvas;
      const menu = els.canvasContextMenu;
      if (!canvas || !menu) return;
      event.preventDefault();
      event.stopPropagation();
      canvas.calcOffset();
      const target = canvas.findTarget?.(event, true);
      if (target) {
        canvas.setActiveObject(target);
        state.canvasBeta.contextMenuObjectId = target.id || (target.id = createClientId());
        target.setCoords?.();
      } else {
        state.canvasBeta.contextMenuObjectId = "";
        if (!state.canvasBeta.clipboardObject) {
          hideCanvasContextMenu();
          return;
        }
        canvas.discardActiveObject();
      }
      canvas.requestRenderAll();
      updateCanvasPropsPanel();
      renderCanvasLayers();
      positionCanvasContextMenu(event.clientX, event.clientY);
    }
    
    function positionCanvasContextMenu(clientX, clientY) {
      const menu = els.canvasContextMenu;
      if (!menu) return;
      menu.hidden = false;
      menu.style.left = "0px";
      menu.style.top = "0px";
      const rect = menu.getBoundingClientRect();
      const left = Math.max(12, Math.min(clientX, window.innerWidth - rect.width - 12));
      const top = Math.max(12, Math.min(clientY, window.innerHeight - rect.height - 12));
      menu.style.left = `${Math.round(left)}px`;
      menu.style.top = `${Math.round(top)}px`;
    }
    
    function hideCanvasContextMenu() {
      if (els.canvasContextMenu) els.canvasContextMenu.hidden = true;
    }
    
    function selectedCanvasContextObject() {
      const canvas = state.canvasBeta.canvas;
      const active = selectedCanvasObject();
      if (active) return active;
      const id = state.canvasBeta.contextMenuObjectId;
      return id && canvas ? canvas.getObjects().find((item) => item.id === id) : null;
    }
    
    function handleCanvasContextAction(action = "") {
      const canvas = state.canvasBeta.canvas;
      if (!canvas) return;
      if (action === "paste") {
        pasteCanvasClipboard();
        hideCanvasContextMenu();
        return;
      }
      const object = selectedCanvasContextObject();
      if (!object && action !== "paste") {
        hideCanvasContextMenu();
        return;
      }
      if (object && canvas.getActiveObject() !== object) canvas.setActiveObject(object);
      const handlers = {
        copy: copyCanvasSelection,
        "send-to-chat": sendCanvasSelectionToChat,
        group: groupCanvasSelection,
        "toggle-visible": toggleCanvasSelectionVisible,
        "toggle-lock": toggleCanvasSelectionLock,
        "remove-bg": () => removeNearWhiteCanvasImageBackground(object, { model: "u2net" }).catch((error) => {
          console.error(error);
          toast(error.message || "移除背景失败。");
        }),
        "remove-bg-fine": () => removeNearWhiteCanvasImageBackground(object, { model: "isnet-general-use" }).catch((error) => {
          console.error(error);
          toast(error.message || "精细抠图失败。");
        }),
        delete: deleteCanvasSelection
      };
      handlers[action]?.();
      hideCanvasContextMenu();
    }

    return {
      bindCanvasContextMenu,
      bindCanvasKeyboardShortcuts,
      handleCanvasContextMenu,
      positionCanvasContextMenu,
      hideCanvasContextMenu,
      selectedCanvasContextObject,
      handleCanvasContextAction
    };
  };
})();
