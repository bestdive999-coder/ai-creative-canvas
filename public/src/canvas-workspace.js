(function () {
  const app = window.EcommerceCanvasApp = window.EcommerceCanvasApp || {};

  app.createCanvasWorkspaceController = function createCanvasWorkspaceController(deps) {
    const {
      els,
      state,
      toast,
      canvasWorkWidth,
      canvasInitialWorkHeight,
      canvasExtendThreshold,
      canvasExtendStep,
      bindFabricCanvasEvents,
      bindCanvasContextMenu,
      bindCanvasKeyboardShortcuts,
      ensureDefaultCanvasFrame,
      renderCanvasAssets,
      renderCanvasLayers,
      setCanvasLayerPanelOpen,
      updateCanvasPropsPanel,
      resetCanvasView,
      updateCanvasObjectToolbar,
      renderCanvasFrameLabels,
      insertCanvasAsset,
      importCanvasAssetFiles
    } = deps;

    function canvasBetaStatus(message) {
      if (els.canvasStatus) els.canvasStatus.textContent = message || "";
    }

    function updateCanvasZoomLabel(zoom) {
      if (!els.canvasFitBtn) return;
      const value = Number.isFinite(Number(zoom)) ? Number(zoom) : state.canvasBeta.zoom || 1;
      els.canvasFitBtn.textContent = `${Math.round(value * 100)}%`;
      els.canvasFitBtn.title = "适配当前画板";
    }

    function isCanvasCameraMode() {
      return state.canvasBeta.cameraMode !== false;
    }

    function syncCanvasCameraClass() {
      els.canvasStageWrap?.classList.toggle("is-camera-canvas", isCanvasCameraMode());
    }

    function canvasStageViewportSize() {
      const wrap = els.canvasStageWrap;
      return {
        width: Math.max(320, Math.floor(wrap?.clientWidth || canvasWorkWidth || 1280)),
        height: Math.max(240, Math.floor(wrap?.clientHeight || canvasInitialWorkHeight || 720))
      };
    }

    function updateCanvasVirtualBounds(bounds = getCanvasContentBounds()) {
      const minLeft = Math.min(0, Number(bounds.left || 0));
      const minTop = Math.min(0, Number(bounds.top || 0));
      const right = Math.max(canvasWorkWidth, Number(bounds.right || 0));
      const bottom = Math.max(canvasInitialWorkHeight, Number(bounds.bottom || 0));
      state.canvasBeta.virtualWidth = Math.max(canvasWorkWidth, Math.ceil(right - minLeft + canvasExtendStep));
      state.canvasBeta.virtualHeight = Math.max(canvasInitialWorkHeight, Math.ceil(bottom - minTop + canvasExtendStep));
    }

    function setCanvasViewportCenter(centerX, centerY, zoom = state.canvasBeta.zoom || 1, options = {}) {
      const canvas = state.canvasBeta.canvas;
      const wrap = els.canvasStageWrap;
      if (!canvas || !wrap) return;
      const scale = Math.max(0.01, Number(zoom || 1));
      const viewport = canvasStageViewportSize();
      const nextX = Number.isFinite(Number(centerX)) ? Number(centerX) : 0;
      const nextY = Number.isFinite(Number(centerY)) ? Number(centerY) : 0;
      canvas.setViewportTransform([
        scale,
        0,
        0,
        scale,
        viewport.width / 2 - nextX * scale,
        viewport.height / 2 - nextY * scale
      ]);
      state.canvasBeta.zoom = scale;
      state.canvasBeta.cameraX = nextX;
      state.canvasBeta.cameraY = nextY;
      if (options.updateLabel !== false) updateCanvasZoomLabel(scale);
      canvas.calcOffset();
      if (options.render !== false) canvas.requestRenderAll();
    }

    function switchStudioPanel(panelName = "ai") {
      const target = panelName || "ai";
      if (els.studioAiPanel) els.studioAiPanel.dataset.activePanel = target;
      const taskCount = (state.aiDirect.conversations || []).filter((item) => Number(item.messageCount || 0) > 0 || Number(item.imageCount || 0) > 0).length;
      if (els.studioTaskBadge) {
        els.studioTaskBadge.textContent = taskCount > 99 ? "99+" : String(taskCount);
        els.studioTaskBadge.hidden = taskCount < 1;
      }
      const assetCount = Number(state.canvasBeta.assets?.length || 0)
        + Number(state.aiDirect.references?.length || 0)
        + Number(state.aiDirect.detailPlanningMaterials?.length || 0);
      if (els.studioAssetBadge) {
        els.studioAssetBadge.textContent = assetCount > 99 ? "99+" : String(assetCount);
        els.studioAssetBadge.hidden = assetCount < 1;
      }
      els.studioPanelButtons.forEach((button) => {
        button.classList.toggle("active", button.dataset.studioPanel === target);
      });
      els.studioPanelViews.forEach((view) => {
        view.classList.toggle("active", view.dataset.studioPanelView === target);
      });
      const panelScroll = els.studioPanelScroll || els.studioPanelViews[0]?.closest?.(".studio-panel-scroll");
      if (panelScroll) {
        requestAnimationFrame(() => {
          const hasAiResults = Boolean(els.aiChatList?.querySelector?.(
            ".ai-chat-message, .ai-result-desk, .ai-generation-status-row"
          ));
          panelScroll.scrollTop = target === "ai" && hasAiResults ? panelScroll.scrollHeight : 0;
        });
      }
    }

    async function initCanvasBeta() {
      if (!els.designCanvas) return;
      if (!window.fabric) {
        canvasBetaStatus("Fabric.js 未加载，无法启用画布。");
        return;
      }
      if (state.canvasBeta.initializingPromise) {
        await state.canvasBeta.initializingPromise;
        return;
      }
      if (state.canvasBeta.initialized && state.canvasBeta.canvas) {
        resizeCanvasToStage();
        state.canvasBeta.canvas.calcOffset();
        return;
      }
      const initializingPromise = (async () => {
        const canvas = new fabric.Canvas(els.designCanvas, {
          preserveObjectStacking: true,
          selection: true,
          backgroundColor: "#f5f6f7",
          renderOnAddRemove: false,
          skipOffscreen: true,
          perPixelTargetFind: false,
          targetFindTolerance: 8
        });
        canvas.renderOnAddRemove = false;
        canvas.skipOffscreen = true;
        canvas.perPixelTargetFind = false;
        canvas.targetFindTolerance = 8;
        state.canvasBeta.canvas = canvas;
        state.canvasBeta.initialized = true;
        bindFabricCanvasEvents(canvas);
        bindCanvasContextMenu(canvas);
        bindCanvasKeyboardShortcuts();
        bindCanvasStageDrop();
        bindCanvasStagePaste();
        bindCanvasStageResize();
        resizeCanvasToStage();
        ensureDefaultCanvasFrame();
        renderCanvasAssets();
        renderCanvasLayers();
        setCanvasLayerPanelOpen(false);
        updateCanvasPropsPanel();
        resetCanvasView();
        canvas.discardActiveObject();
        canvas.requestRenderAll();
        switchStudioPanel("ai");
        scrollCanvasToHome({ behavior: "auto" });
        canvasBetaStatus(window.EcommerceCanvasI18n?.t("infiniteCanvas", "Infinite Canvas BETA 1.0") || "Infinite Canvas BETA 1.0");
      })();
      state.canvasBeta.initializingPromise = initializingPromise;
      try {
        await initializingPromise;
      } finally {
        if (state.canvasBeta.initializingPromise === initializingPromise) {
          state.canvasBeta.initializingPromise = null;
        }
      }
    }

    function resizeCanvasToStage() {
      const canvas = state.canvasBeta.canvas;
      const wrap = els.canvasStageWrap;
      if (!canvas || !wrap) return;
      syncCanvasCameraClass();
      const contentBounds = getCanvasContentBounds();
      if (isCanvasCameraMode()) {
        const viewport = canvasStageViewportSize();
        updateCanvasVirtualBounds(contentBounds);
        if (canvas.getWidth() !== viewport.width || canvas.getHeight() !== viewport.height) {
          const center = canvasViewportCenterPoint();
          const zoom = Math.max(0.01, Number(canvas.getZoom?.() || state.canvasBeta.zoom || 1));
          canvas.setDimensions(viewport);
          canvas.setViewportTransform([
            zoom,
            0,
            0,
            zoom,
            viewport.width / 2 - Number(center.x || 0) * zoom,
            viewport.height / 2 - Number(center.y || 0) * zoom
          ]);
          state.canvasBeta.cameraX = Number(center.x || 0);
          state.canvasBeta.cameraY = Number(center.y || 0);
        }
        canvas.calcOffset();
        canvas.requestRenderAll();
        return;
      }
      const minWidth = Math.max(canvasWorkWidth * 2, Math.floor(wrap.clientWidth || 0) + canvasExtendStep * 2);
      const minHeight = Math.max(canvasInitialWorkHeight + canvasExtendStep, Math.floor(wrap.clientHeight || 0) + canvasExtendStep * 2);
      const width = Math.max(
        minWidth,
        Math.ceil(contentBounds.right + canvasExtendStep),
        Math.floor(state.canvasBeta.virtualWidth || 0)
      );
      const height = Math.max(
        minHeight,
        Math.ceil(contentBounds.bottom + canvasExtendStep),
        Math.floor(state.canvasBeta.virtualHeight || 0)
      );
      state.canvasBeta.virtualWidth = width;
      state.canvasBeta.virtualHeight = height;
      if (canvas.getWidth() === width && canvas.getHeight() === height) {
        canvas.calcOffset();
        return;
      }
      canvas.setDimensions({ width, height });
      canvas.calcOffset();
      canvas.requestRenderAll();
    }

    function bindCanvasStageResize() {
      if (!els.canvasStageWrap || els.canvasStageWrap.dataset.canvasResizeReady === "1") return;
      els.canvasStageWrap.dataset.canvasResizeReady = "1";
      const extendIfNeeded = () => {
        const wrap = els.canvasStageWrap;
        if (!wrap) return;
        if (!state.canvasBeta.imageAiEditorDrag) state.canvasBeta.imageAiEditorManualPosition = null;
        state.canvasBeta.canvas?.calcOffset();
        updateCanvasObjectToolbar();
        renderCanvasFrameLabels();
        ensureCanvasBoundsForViewport();
      };
      const resize = () => {
        resizeCanvasToStage();
        state.canvasBeta.canvas?.calcOffset();
        updateCanvasObjectToolbar();
        renderCanvasFrameLabels();
      };
      if (window.ResizeObserver) {
        const observer = new ResizeObserver(resize);
        observer.observe(els.canvasStageWrap);
        state.canvasBeta.resizeObserver = observer;
      }
      window.addEventListener("resize", resize);
      els.canvasStageWrap.addEventListener("scroll", extendIfNeeded, { passive: true });
    }

    function getCanvasContentBounds() {
      const canvas = state.canvasBeta.canvas;
      if (!canvas) return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, hasObjects: false };
      const objects = canvas.getObjects().filter((object) => object && object.visible !== false);
      if (!objects.length) return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, hasObjects: false };
      const bounds = objects.reduce((next, object) => {
        object.setCoords?.();
        const rect = object.getBoundingRect(true, true);
        const left = Number(rect.left || 0);
        const top = Number(rect.top || 0);
        const right = left + Math.max(0, Number(rect.width || 0));
        const bottom = top + Math.max(0, Number(rect.height || 0));
        return {
          left: Math.min(next.left, left),
          top: Math.min(next.top, top),
          right: Math.max(next.right, right),
          bottom: Math.max(next.bottom, bottom)
        };
      }, { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
      return {
        ...bounds,
        width: Math.max(1, bounds.right - bounds.left),
        height: Math.max(1, bounds.bottom - bounds.top),
        hasObjects: true
      };
    }

    function getCanvasContentBottom() {
      return getCanvasContentBounds().bottom || 0;
    }

    function shiftCanvasObjects(deltaX = 0, deltaY = 0) {
      const canvas = state.canvasBeta.canvas;
      if (!canvas || (!deltaX && !deltaY)) return;
      canvas.getObjects().forEach((object) => {
        object.set({
          left: Number(object.left || 0) + deltaX,
          top: Number(object.top || 0) + deltaY
        });
        object.setCoords?.();
      });
    }

    function extendCanvasSide(side, amount = canvasExtendStep, options = {}) {
      const canvas = state.canvasBeta.canvas;
      const wrap = els.canvasStageWrap;
      if (!canvas || !wrap || state.canvasBeta.isExtendingWorkspace) return;
      const value = Math.max(320, Number(amount || canvasExtendStep));
      if (isCanvasCameraMode()) {
        updateCanvasVirtualBounds();
        canvas.calcOffset();
        canvas.requestRenderAll();
        return;
      }
      state.canvasBeta.isExtendingWorkspace = true;
      try {
        const zoom = Math.max(0.01, canvas.getZoom ? canvas.getZoom() : Number(state.canvasBeta.zoom || 1));
        let width = canvas.getWidth();
        let height = canvas.getHeight();
        if (side === "left") {
          width += value;
          state.canvasBeta.virtualWidth = width;
          shiftCanvasObjects(value, 0);
          canvas.setDimensions({ width, height });
          wrap.scrollLeft += value * zoom;
        } else if (side === "right") {
          width += value;
          state.canvasBeta.virtualWidth = width;
          canvas.setDimensions({ width, height });
        } else if (side === "top") {
          height += value;
          state.canvasBeta.virtualHeight = height;
          shiftCanvasObjects(0, value);
          canvas.setDimensions({ width, height });
          wrap.scrollTop += value * zoom;
        } else if (side === "bottom") {
          height += value;
          state.canvasBeta.virtualHeight = height;
          canvas.setDimensions({ width, height });
        }
        canvas.calcOffset();
        canvas.requestRenderAll();
        if (!options.silent) canvasBetaStatus("工作画布已扩展，可继续向四周摆放内容。");
      } finally {
        state.canvasBeta.isExtendingWorkspace = false;
      }
    }

    function extendCanvasDown(amount = canvasExtendStep) {
      extendCanvasSide("bottom", amount);
    }

    function ensureCanvasBoundsForObjects(extra = 900) {
      const canvas = state.canvasBeta.canvas;
      if (!canvas) return;
      const bounds = getCanvasContentBounds();
      if (!bounds.hasObjects) return;
      if (isCanvasCameraMode()) {
        updateCanvasVirtualBounds(bounds);
        return;
      }
      const margin = Math.max(canvasExtendThreshold, Number(extra || 0));
      if (bounds.left < margin) extendCanvasSide("left", Math.max(canvasExtendStep, margin - bounds.left + canvasExtendThreshold), { silent: true });
      if (bounds.top < margin) extendCanvasSide("top", Math.max(canvasExtendStep, margin - bounds.top + canvasExtendThreshold), { silent: true });
      const canvasWidth = canvas.getWidth();
      const canvasHeight = canvas.getHeight();
      if (bounds.right > canvasWidth - margin) extendCanvasSide("right", Math.max(canvasExtendStep, bounds.right - canvasWidth + margin + canvasExtendThreshold), { silent: true });
      if (bounds.bottom > canvasHeight - margin) extendCanvasSide("bottom", Math.max(canvasExtendStep, bounds.bottom - canvasHeight + margin + canvasExtendThreshold), { silent: true });
    }

    function ensureCanvasBoundsForViewport() {
      const wrap = els.canvasStageWrap;
      const canvas = state.canvasBeta.canvas;
      if (!wrap || !canvas || state.canvasBeta.isExtendingWorkspace) return;
      if (isCanvasCameraMode()) {
        updateCanvasVirtualBounds();
        return;
      }
      const zoom = Math.max(0.2, Math.min(1, Number(canvas.getZoom?.() || 1)));
      const threshold = Math.max(90, canvasExtendThreshold * zoom);
      if (wrap.scrollLeft <= threshold) extendCanvasSide("left", canvasExtendStep, { silent: true });
      if (wrap.scrollTop <= threshold) extendCanvasSide("top", canvasExtendStep, { silent: true });
      if (wrap.scrollLeft + wrap.clientWidth >= wrap.scrollWidth - threshold) extendCanvasSide("right", canvasExtendStep, { silent: true });
      if (wrap.scrollTop + wrap.clientHeight >= wrap.scrollHeight - threshold) extendCanvasSide("bottom", canvasExtendStep, { silent: true });
    }

    function ensureCanvasHeightForObjects(extra = 900) {
      ensureCanvasBoundsForObjects(extra);
    }

    function canvasViewportCenterPoint() {
      const canvas = state.canvasBeta.canvas;
      const wrap = els.canvasStageWrap;
      const canvasElement = canvas?.upperCanvasEl || canvas?.lowerCanvasEl;
      if (!canvas || !wrap || !canvasElement) {
        return {
          x: Math.max(420, Number(state.canvasBeta.virtualWidth || canvasWorkWidth) / 2),
          y: Math.max(140, Number(state.canvasBeta.virtualHeight || canvasInitialWorkHeight) / 3)
        };
      }
      const canvasRect = canvasElement.getBoundingClientRect();
      const wrapRect = wrap.getBoundingClientRect();
      const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
      const zoom = Math.max(0.01, canvas.getZoom ? canvas.getZoom() : Number(state.canvasBeta.zoom || 1));
      if (isCanvasCameraMode()) {
        const viewport = canvasStageViewportSize();
        const x = (viewport.width / 2 - Number(vpt[4] || 0)) / zoom;
        const y = (viewport.height / 2 - Number(vpt[5] || 0)) / zoom;
        state.canvasBeta.cameraX = x;
        state.canvasBeta.cameraY = y;
        return { x, y };
      }
      const screenX = wrapRect.left + wrap.clientWidth / 2 - canvasRect.left;
      const screenY = wrapRect.top + wrap.clientHeight / 2 - canvasRect.top;
      return {
        x: (screenX - Number(vpt[4] || 0)) / zoom,
        y: (screenY - Number(vpt[5] || 0)) / zoom
      };
    }

    function focusCanvasBounds(bounds = {}, options = {}) {
      const canvas = state.canvasBeta.canvas;
      const wrap = els.canvasStageWrap;
      if (!canvas || !wrap) return;
      resizeCanvasToStage();
      const width = Math.max(1, Number(bounds.width || 0));
      const height = Math.max(1, Number(bounds.height || 0));
      const padding = Math.max(40, Number(options.padding || 120));
      const zoom = Number.isFinite(Number(options.zoom))
        ? Number(options.zoom)
        : Math.min(1.4, Math.max(0.12, Math.min(
          (wrap.clientWidth - padding * 2) / Math.max(1, width),
          (wrap.clientHeight - padding * 2) / Math.max(1, height)
        )));
      if (isCanvasCameraMode()) {
        setCanvasViewportCenter(
          Number(bounds.left || 0) + width / 2,
          Number(bounds.top || 0) + height / 2,
          zoom
        );
        state.canvasBeta.imageAiEditorManualPosition = null;
        updateCanvasObjectToolbar();
        renderCanvasFrameLabels();
        return;
      }
      canvas.setViewportTransform([zoom, 0, 0, zoom, 0, 0]);
      state.canvasBeta.zoom = zoom;
      updateCanvasZoomLabel(zoom);
      canvas.calcOffset();
      const centerLeft = (Number(bounds.left || 0) + width / 2) * zoom;
      const centerTop = (Number(bounds.top || 0) + height / 2) * zoom;
      const maxLeft = Math.max(0, wrap.scrollWidth - wrap.clientWidth);
      const maxTop = Math.max(0, wrap.scrollHeight - wrap.clientHeight);
      const left = Math.max(0, Math.min(maxLeft, centerLeft - wrap.clientWidth / 2));
      const top = Math.max(0, Math.min(maxTop, centerTop - wrap.clientHeight / 2));
      wrap.scrollTo({
        left,
        top,
        behavior: options.behavior || "smooth"
      });
      canvas.requestRenderAll();
    }

    function scrollCanvasToHome(options = {}) {
      const canvas = state.canvasBeta.canvas;
      const wrap = els.canvasStageWrap;
      if (!canvas || !wrap) return;
      const content = getCanvasContentBounds();
      if (content.hasObjects) {
        focusCanvasBounds(content, {
          zoom: Number(options.zoom || state.canvasBeta.zoom || 0.35),
          padding: 180,
          behavior: options.behavior || "auto"
        });
        return;
      }
      const zoom = Math.max(0.12, Math.min(1, Number(options.zoom || state.canvasBeta.zoom || 0.35)));
      if (isCanvasCameraMode()) {
        setCanvasViewportCenter(
          Math.max(420, Number(state.canvasBeta.virtualWidth || canvasWorkWidth) / 2),
          Math.max(140, Number(state.canvasBeta.virtualHeight || canvasInitialWorkHeight) / 3),
          zoom
        );
        canvas.calcOffset();
        canvas.requestRenderAll();
        return;
      }
      canvas.setViewportTransform([zoom, 0, 0, zoom, 0, 0]);
      state.canvasBeta.zoom = zoom;
      updateCanvasZoomLabel(zoom);
      const left = Math.max(0, (canvas.getWidth() * zoom - wrap.clientWidth) / 2);
      const top = Math.max(0, (canvas.getHeight() * zoom - wrap.clientHeight) / 3);
      state.canvasBeta.workspaceHome = { left, top };
      wrap.scrollTo({ left, top, behavior: options.behavior || "auto" });
      canvas.calcOffset();
      canvas.requestRenderAll();
    }

    function bindCanvasStageDrop() {
      if (!els.canvasStageWrap || els.canvasStageWrap.dataset.canvasDropReady === "1") return;
      els.canvasStageWrap.dataset.canvasDropReady = "1";
      ["dragenter", "dragover"].forEach((eventName) => {
        els.canvasStageWrap.addEventListener(eventName, (event) => {
          event.preventDefault();
          event.stopPropagation();
          els.canvasStageWrap.classList.add("is-dragging");
        });
      });
      ["dragleave", "drop"].forEach((eventName) => {
        els.canvasStageWrap.addEventListener(eventName, (event) => {
          event.stopPropagation();
          els.canvasStageWrap.classList.remove("is-dragging");
        });
      });
      els.canvasStageWrap.addEventListener("drop", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const assetId = event.dataTransfer?.getData("text/canvas-asset") || "";
        const pointer = stageDropPoint(event);
        if (assetId) {
          const asset = (state.canvasBeta.assets || []).find((item) => item.id === assetId);
          if (asset) insertCanvasAsset(asset, { point: pointer }).catch((error) => toast(error.message || "素材插入画布失败。"));
          return;
        }
        const files = Array.from(event.dataTransfer?.files || []);
        if (files.length) await importCanvasAssetFiles(files, { autoInsert: true, point: pointer });
      });
    }

    function bindCanvasStagePaste() {
      const wrap = els.canvasStageWrap;
      if (!wrap || wrap.dataset.canvasPasteReady === "1") return;
      wrap.dataset.canvasPasteReady = "1";
      if (!wrap.hasAttribute("tabindex")) wrap.tabIndex = -1;
      wrap.addEventListener("pointerdown", () => {
        try {
          wrap.focus({ preventScroll: true });
        } catch {
          wrap.focus();
        }
      });
      wrap.addEventListener("paste", async (event) => {
        const files = canvasPasteImageFiles(event.clipboardData);
        if (!files.length) return;
        event.preventDefault();
        event.stopPropagation();
        const canvas = state.canvasBeta.canvas;
        const hasContent = Boolean(canvas?.getObjects?.().some((object) => object?.objectType !== "frame" && object?.visible !== false));
        const pasteOptions = {
          autoInsert: true,
          focusOnCanvas: true
        };
        if (!hasContent) pasteOptions.centerPoint = canvasViewportCenterPoint();
        await importCanvasAssetFiles(files, pasteOptions);
        canvasBetaStatus(`已粘贴 ${files.length} 张图片到画布。`);
      });
    }

    function canvasPasteImageFiles(clipboardData) {
      const files = Array.from(clipboardData?.files || []).filter((file) => /^image\//i.test(file.type || ""));
      if (files.length) return files;
      const pasted = [];
      Array.from(clipboardData?.items || []).forEach((item) => {
        if (item.kind !== "file" || !/^image\//i.test(item.type || "")) return;
        const file = item.getAsFile?.();
        if (file) pasted.push(file);
      });
      return pasted;
    }

    function stageDropPoint(event) {
      const canvas = state.canvasBeta.canvas;
      if (!canvas) return null;
      canvas.calcOffset();
      return canvas.getPointer(event);
    }

    return {
      canvasBetaStatus,
      updateCanvasZoomLabel,
      isCanvasCameraMode,
      setCanvasViewportCenter,
      switchStudioPanel,
      initCanvasBeta,
      resizeCanvasToStage,
      bindCanvasStageResize,
      getCanvasContentBounds,
      getCanvasContentBottom,
      extendCanvasSide,
      extendCanvasDown,
      ensureCanvasBoundsForObjects,
      ensureCanvasBoundsForViewport,
      ensureCanvasHeightForObjects,
      canvasViewportCenterPoint,
      focusCanvasBounds,
      scrollCanvasToHome,
      bindCanvasStageDrop,
      stageDropPoint
    };
  };
})();
