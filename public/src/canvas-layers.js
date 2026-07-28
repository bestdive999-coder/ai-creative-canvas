(function () {
  const app = window.EcommerceCanvasApp = window.EcommerceCanvasApp || {};

  app.createCanvasLayerController = function createCanvasLayerController(deps) {
    const {
      els,
      state,
      canvasDefaultZoom,
      createClientId,
      escapeHtml,
      toast,
      selectedCanvasObject,
      selectedCanvasFrame,
      canvasObjectById,
      updateCanvasObjectToolbar,
      updateCanvasPropsPanel,
      canvasBetaStatus,
      resetCanvasImageAiReferencesForObject,
      resizeCanvasToStage,
      isCanvasCameraMode = () => false,
      setCanvasViewportCenter,
      applyCanvasViewportRenderWindow = () => null,
      scheduleCanvasViewportRenderWindowRestore = () => {}
    } = deps;

    let zoomUiFrame = 0;
    let zoomUiValue = null;
    let zoomUiStatus = "";

    function scheduleCanvasZoomUiUpdate(zoom, status = "") {
      if (Number.isFinite(Number(zoom))) zoomUiValue = Number(zoom);
      if (status) zoomUiStatus = String(status);
      if (zoomUiFrame) return;
      zoomUiFrame = requestAnimationFrame(() => {
        const nextZoom = zoomUiValue;
        const nextStatus = zoomUiStatus;
        zoomUiFrame = 0;
        zoomUiValue = null;
        zoomUiStatus = "";
        if (Number.isFinite(Number(nextZoom))) updateCanvasZoomLabel(nextZoom);
        updateCanvasObjectToolbar();
        renderCanvasFrameLabels();
        if (nextStatus) canvasBetaStatus(nextStatus);
      });
    }

    function canvasObjectTypeLabel(object) {
      if (!object) return "图层";
      if (object.objectType === "frame") return "Frame";
      if (object.objectType === "image" || object.isType?.("image")) return "图片";
      if (object.objectType === "text" || object.isType?.("textbox") || object.isType?.("text")) return "文字";
      if (object.objectType === "shape") return "形状";
      if (object.objectType === "path" || object.type === "path") return "路径";
      if (object.objectType === "group" || object.type === "group") return "编组";
      if (object.objectType === "generation-placeholder") return "生成中";
      return object.objectType || object.type || "图层";
    }
    
    function isCanvasObjectLocked(object) {
      return Boolean(object?.lockMovementX || object?.lockMovementY || object?.lockScalingX || object?.lockScalingY || object?.lockRotation);
    }
    
    function setCanvasObjectLocked(object, locked) {
      if (!object) return;
      object.set({
        lockMovementX: locked,
        lockMovementY: locked,
        lockScalingX: locked,
        lockScalingY: locked,
        lockRotation: locked,
        hasControls: !locked,
        hoverCursor: locked ? "default" : "move"
      });
    }
    
    function canvasFrameObjects(canvas = state.canvasBeta.canvas) {
      if (!canvas) return [];
      return canvas.getObjects().filter((object) => object.objectType === "frame");
    }
    
    function ensureCanvasObjectId(object) {
      if (!object) return "";
      if (!object.id) object.id = createClientId();
      return object.id;
    }
    
    function canvasFrameIndexMap(canvas = state.canvasBeta.canvas) {
      const map = new Map();
      canvasFrameObjects(canvas).forEach((frame, index) => {
        map.set(ensureCanvasObjectId(frame), index + 1);
      });
      return map;
    }
    
    function canvasFrameDisplayName(frame, index = 1) {
      const stored = String(frame?.frameLabel || frame?.name || "").trim();
      if (/^Frame\s+\d+$/i.test(stored)) return stored;
      return `Frame ${index || 1}`;
    }
    
    function canvasLayerDisplayLabel(object, objects, index, frameNumbers) {
      if (object?.objectType === "frame") {
        const id = ensureCanvasObjectId(object);
        return canvasFrameDisplayName(object, frameNumbers?.get(id) || 1);
      }
      return object?.name || object?.objectType || object?.type || `图层 ${objects.length - index}`;
    }
    
    function setCanvasLayerPanelOpen(open) {
      state.canvasBeta.layerPanelOpen = Boolean(open);
      document.body.classList.toggle("canvas-layer-panel-closed", !state.canvasBeta.layerPanelOpen);
      els.canvasLayerPanelToggleBtn?.classList.toggle("active", state.canvasBeta.layerPanelOpen);
      els.canvasLayerPanelToggleBtn?.setAttribute("aria-pressed", String(state.canvasBeta.layerPanelOpen));
    }
    
    function toggleCanvasLayerHistory() {
      state.canvasBeta.layerHistoryOpen = !state.canvasBeta.layerHistoryOpen;
      renderCanvasLayerHistoryState();
    }
    
    function renderCanvasLayerHistoryState() {
      const open = state.canvasBeta.layerHistoryOpen !== false;
      if (els.canvasLayerHistoryBody) els.canvasLayerHistoryBody.hidden = !open;
      if (els.canvasLayerHistoryToggleBtn) {
        els.canvasLayerHistoryToggleBtn.setAttribute("aria-expanded", String(open));
        const icon = els.canvasLayerHistoryToggleBtn.querySelector("[aria-hidden='true']");
        if (icon) icon.textContent = open ? "⌃" : "⌄";
      }
    }
    
    function renderCanvasFrameLabels() {
      const layer = els.canvasFrameLabels;
      const canvas = state.canvasBeta.canvas;
      if (!layer || !canvas || !els.canvasStageWrap) return;
      const frames = canvasFrameObjects(canvas);
      if (!frames.length) {
        layer.innerHTML = "";
        return;
      }
      const wrapRect = els.canvasStageWrap.getBoundingClientRect();
      const canvasEl = canvas.upperCanvasEl || canvas.lowerCanvasEl || els.designCanvas;
      const canvasRect = canvasEl.getBoundingClientRect();
      const useCamera = isCanvasCameraMode?.();
      const originLeft = canvasRect.left - wrapRect.left + (useCamera ? 0 : els.canvasStageWrap.scrollLeft);
      const originTop = canvasRect.top - wrapRect.top + (useCamera ? 0 : els.canvasStageWrap.scrollTop);
      const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
      const active = selectedCanvasObject();
      const frameNumbers = canvasFrameIndexMap(canvas);
      layer.innerHTML = frames.map((frame) => {
        const id = ensureCanvasObjectId(frame);
        const left = originLeft + Number(frame.left || 0) * Number(vpt[0] || 1) + Number(vpt[4] || 0);
        const top = originTop + Number(frame.top || 0) * Number(vpt[3] || 1) + Number(vpt[5] || 0) - 24;
        const label = canvasFrameDisplayName(frame, frameNumbers.get(id));
        const size = frame.frameSize || {};
        const width = Math.round(Number(size.width || frame.width || 0));
        const height = Math.round(Number(size.height || frame.height || 0));
        const sizeLabel = width && height ? `· ${width}×${height}` : "";
        return `<span class="canvas-frame-label ${frame === active ? "active" : ""}" style="left:${Math.round(left)}px;top:${Math.round(top)}px"><b>${escapeHtml(label)}</b>${sizeLabel ? `<em>${escapeHtml(sizeLabel)}</em>` : ""}</span>`;
      }).join("");
    }
    
    function canvasLayerWindow(objects = [], active = null) {
      const total = objects.length;
      const limit = Math.max(40, Number(state.canvasBeta.layerRenderLimit || 160));
      if (state.canvasBeta.layerListExpanded || total <= limit) {
        return { objects, total, hiddenCount: 0, limited: false, limit };
      }
      const visible = objects.slice(0, limit);
      if (active && objects.includes(active) && !visible.includes(active)) {
        visible[visible.length - 1] = active;
      }
      const unique = visible.filter((object, index, list) => object && list.indexOf(object) === index);
      return {
        objects: unique,
        total,
        hiddenCount: Math.max(0, total - unique.length),
        limited: true,
        limit
      };
    }

    function bindCanvasLayerListEvents(list, canvas) {
      if (!list || !canvas) return;
      list.querySelectorAll("[data-canvas-layer-expand]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          state.canvasBeta.layerListExpanded = true;
          renderCanvasLayers();
        });
      });
      list.querySelectorAll("[data-canvas-layer-collapse]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          state.canvasBeta.layerListExpanded = false;
          renderCanvasLayers();
        });
      });
      list.querySelectorAll("[data-canvas-layer]").forEach((button) => {
        button.addEventListener("click", () => {
          const object = canvasObjectById(button.dataset.canvasLayer);
          if (!object) return;
          canvas.setActiveObject(object);
          canvas.requestRenderAll();
          updateCanvasPropsPanel();
          renderCanvasLayers();
        });
        button.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          button.click();
        });
      });
    }
    
    function renderCanvasSidebarLayers(list, canvas, objects, active, frameNumbers) {
      if (!list) return;
      if (!objects.length) {
        list.className = "canvas-sidebar-layer-list empty-state";
        list.textContent = "暂无图层";
        return;
      }
      const frames = canvasFrameObjects(canvas);
      const nonFrames = canvas.getObjects().filter((object) => object.objectType !== "frame").slice().reverse();
      const fullCompactObjects = [...frames, ...nonFrames];
      const windowed = canvasLayerWindow(fullCompactObjects, active);
      const compactObjects = windowed.objects;
      list.className = "canvas-sidebar-layer-list";
      list.innerHTML = compactObjects.map((object, index) => {
        const layerId = ensureCanvasObjectId(object);
        const isFrame = object.objectType === "frame";
        const label = canvasLayerDisplayLabel(object, compactObjects, index, frameNumbers);
        const hidden = object.visible === false;
        const indent = isFrame ? "" : " child";
        return `
          <button class="canvas-sidebar-layer-row ${object === active ? "active" : ""}${hidden ? " is-hidden" : ""}${indent}" type="button" data-canvas-layer="${escapeHtml(layerId)}">
            <span class="canvas-sidebar-caret" aria-hidden="true">${isFrame ? "›" : ""}</span>
            <span class="canvas-sidebar-icon ${isFrame ? "frame" : "layer"}" aria-hidden="true"></span>
            <span>${escapeHtml(label)}</span>
          </button>
        `;
      }).join("") + (
        windowed.limited
          ? `<button class="canvas-sidebar-layer-row more" type="button" data-canvas-layer-expand>+${windowed.hiddenCount} 个图层</button>`
          : state.canvasBeta.layerListExpanded && windowed.total > windowed.limit
            ? `<button class="canvas-sidebar-layer-row more" type="button" data-canvas-layer-collapse>收起图层</button>`
            : ""
      );
      bindCanvasLayerListEvents(list, canvas);
    }
    
    function renderCanvasLayers() {
      const canvas = state.canvasBeta.canvas;
      if (!canvas) return;
      const active = selectedCanvasObject();
      const allObjects = canvas.getObjects().slice().reverse();
      const windowed = canvasLayerWindow(allObjects, active);
      const frameNumbers = canvasFrameIndexMap(canvas);
      renderCanvasSidebarLayers(els.canvasSidebarLayerList, canvas, allObjects, active, frameNumbers);
      renderCanvasLayerHistoryState();
      renderCanvasFrameLabels();
    }
    
    function duplicateCanvasSelection() {
      const canvas = state.canvasBeta.canvas;
      const object = selectedCanvasObject();
      if (!canvas) return;
      if (!object) {
        toast("请先选择一个元素。");
        canvasBetaStatus("请先选中画布里的图片、文字或形状，再复制。");
        return;
      }
      duplicateCanvasObject(object);
    }
    
    function deleteCanvasSelection() {
      const canvas = state.canvasBeta.canvas;
      const object = selectedCanvasObject();
      if (!canvas) return;
      if (!object) {
        toast("请先选择一个元素。");
        canvasBetaStatus("请先选中要删除的元素。");
        return;
      }
      deleteCanvasObject(object);
    }
    
    function duplicateCanvasObject(object) {
      const canvas = state.canvasBeta.canvas;
      if (!canvas || !object) return;
      object.clone((clone) => {
        clone.set({
          left: (clone.left || 0) + 24,
          top: (clone.top || 0) + 24,
          id: createClientId(),
          name: `${String(object.name || canvasObjectTypeLabel(object)).replace(/\s+copy$/i, "")} copy`
        });
        canvas.add(clone);
        canvas.setActiveObject(clone);
        keepCanvasFramesBehind();
        canvas.requestRenderAll();
        renderCanvasLayers();
        updateCanvasPropsPanel();
        canvasBetaStatus("已复制选中图层。");
      }, canvasLayerSerializableProps);
    }
    
    function deleteCanvasObject(object) {
      const canvas = state.canvasBeta.canvas;
      if (!canvas || !object) return;
      canvas.remove(object);
      canvas.discardActiveObject();
      canvas.requestRenderAll();
      updateCanvasPropsPanel();
      renderCanvasLayers();
      canvasBetaStatus("已删除选中图层。");
    }
    
    function keepCanvasFramesBehind() {
      const canvas = state.canvasBeta.canvas;
      if (!canvas) return;
      canvas.getObjects()
        .filter((item) => item.objectType === "frame")
        .forEach((frame) => {
          setCanvasObjectLocked(frame, true);
          frame.set({ selectable: true, evented: true, hasRotatingPoint: false });
          canvas.sendToBack(frame);
        });
    }
    
    function copyCanvasSelection() {
      const object = selectedCanvasObject();
      if (!object) {
        toast("请先选择一个元素。");
        return;
      }
      object.clone((clone) => {
        state.canvasBeta.clipboardObject = clone;
        toast("已复制。");
      }, canvasLayerSerializableProps);
    }
    
    function pasteCanvasClipboard() {
      const canvas = state.canvasBeta.canvas;
      const clipboard = state.canvasBeta.clipboardObject;
      if (!canvas || !clipboard) {
        toast("没有可粘贴的元素。");
        return;
      }
      clipboard.clone((clone) => {
        clone.set({
          left: (clone.left || 0) + 28,
          top: (clone.top || 0) + 28,
          id: createClientId(),
          name: String(clone.name || "元素").replace(/\s+copy$/i, "") + " copy"
        });
        if (clone.type === "activeSelection") {
          clone.canvas = canvas;
          clone.forEachObject((item) => {
            item.set({ id: createClientId() });
            canvas.add(item);
          });
          clone.setCoords();
        } else {
          canvas.add(clone);
        }
        canvas.setActiveObject(clone);
        keepCanvasFramesBehind();
        canvas.requestRenderAll();
        updateCanvasPropsPanel();
        renderCanvasLayers();
      }, canvasLayerSerializableProps);
    }
    
    function sendCanvasSelectionToChat() {
      const object = selectedCanvasObject();
      const src = object?.srcUrl || object?.getSrc?.();
      if (!src) {
        toast("当前元素不是图片，暂时不能 AI 续改。");
        return;
      }
      state.canvasBeta.canvas?.setActiveObject(object);
      state.canvasBeta.imageAiEditorCollapsedForId = "";
      state.canvasBeta.imageAiEditorManualPosition = null;
      resetCanvasImageAiReferencesForObject(ensureCanvasObjectId(object));
      updateCanvasObjectToolbar();
      requestAnimationFrame(() => els.canvasImageAiPrompt?.focus());
      toast("已打开图片续改小框。");
    }
    
    function groupCanvasSelection() {
      const canvas = state.canvasBeta.canvas;
      const active = canvas?.getActiveObject();
      if (!canvas || !active) return;
      if (active.type !== "activeSelection" || !active.getObjects?.().length) {
        toast("请先框选多个元素再创建编组。");
        return;
      }
      const group = active.toGroup();
      group.set({ id: createClientId(), name: "编组", objectType: "group" });
      canvas.requestRenderAll();
      updateCanvasPropsPanel();
      renderCanvasLayers();
    }
    
    function toggleCanvasSelectionVisible() {
      const canvas = state.canvasBeta.canvas;
      const object = selectedCanvasObject();
      if (!canvas || !object) return;
      object.set("visible", object.visible === false);
      canvas.discardActiveObject();
      canvas.requestRenderAll();
      updateCanvasPropsPanel();
      renderCanvasLayers();
    }
    
    function toggleCanvasSelectionLock() {
      const canvas = state.canvasBeta.canvas;
      const object = selectedCanvasObject();
      if (!canvas || !object) return;
      const locked = isCanvasObjectLocked(object);
      setCanvasObjectLocked(object, !locked);
      canvas.requestRenderAll();
      updateCanvasPropsPanel();
      renderCanvasLayers();
      toast(locked ? "已解锁。" : "已锁定。");
    }
    
    function zoomCanvasBy(multiplier) {
      const canvas = state.canvasBeta.canvas;
      if (!canvas) return;
      const rawCurrent = Number(canvas.getZoom?.() || state.canvasBeta.zoom || 1);
      const current = Number.isFinite(rawCurrent) && rawCurrent > 0 ? rawCurrent : 1;
      const next = Math.min(4, Math.max(0.12, current * multiplier));
      canvas.zoomToPoint(canvasVisibleScreenPoint(), next);
      state.canvasBeta.zoom = next;
      syncCanvasCameraFromViewport();
      state.canvasBeta.imageAiEditorManualPosition = null;
      if (!isCanvasCameraMode?.()) canvas.calcOffset();
      applyCanvasViewportRenderWindow({ padding: 900 });
      canvas.requestRenderAll();
      scheduleCanvasViewportRenderWindowRestore(180);
      scheduleCanvasZoomUiUpdate(next, `缩放 ${Math.round(next * 100)}%`);
    }
    
    function fitCanvasView() {
      const canvas = state.canvasBeta.canvas;
      const frame = selectedCanvasFrame();
      if (!canvas) return;
      resizeCanvasToStage();
      const bounds = frame ? canvasObjectViewBounds(frame) : canvasContentViewBounds();
      state.canvasBeta.imageAiEditorManualPosition = null;
      focusCanvasViewBounds(bounds, { behavior: "smooth" });
      canvas.requestRenderAll();
      updateCanvasObjectToolbar();
      updateCanvasZoomLabel(state.canvasBeta.zoom || 1);
      canvasBetaStatus(frame ? "已适配当前 Frame 视图。" : "已适配当前画布内容。");
    }
    
    function resetCanvasView(zoom = canvasDefaultZoom) {
      const canvas = state.canvasBeta.canvas;
      if (!canvas) return;
      const nextZoom = Math.min(1, Math.max(0.35, Number(zoom) || canvasDefaultZoom));
      canvas.setViewportTransform([nextZoom, 0, 0, nextZoom, 0, 0]);
      state.canvasBeta.zoom = nextZoom;
      updateCanvasZoomLabel(nextZoom);
      state.canvasBeta.imageAiEditorManualPosition = null;
      const bounds = selectedCanvasFrame() ? canvasObjectViewBounds(selectedCanvasFrame()) : canvasContentViewBounds();
      scrollToCanvasViewBounds(bounds, nextZoom, { behavior: "auto" });
      canvas.calcOffset();
      canvas.requestRenderAll();
      updateCanvasObjectToolbar();
    }

    function canvasVisibleScreenPoint() {
      const canvas = state.canvasBeta.canvas;
      const wrap = els.canvasStageWrap;
      const canvasElement = canvas?.upperCanvasEl || canvas?.lowerCanvasEl;
      if (!canvas || !wrap || !canvasElement) return { x: canvas?.getWidth?.() / 2 || 0, y: canvas?.getHeight?.() / 2 || 0 };
      if (isCanvasCameraMode?.()) {
        return { x: wrap.clientWidth / 2, y: wrap.clientHeight / 2 };
      }
      const canvasRect = canvasElement.getBoundingClientRect();
      const wrapRect = wrap.getBoundingClientRect();
      return {
        x: wrapRect.left + wrap.clientWidth / 2 - canvasRect.left,
        y: wrapRect.top + wrap.clientHeight / 2 - canvasRect.top
      };
    }

    function canvasObjectViewBounds(object) {
      if (!object) return null;
      object.setCoords?.();
      const rect = object.getBoundingRect(true, true);
      return {
        left: Number(rect.left || 0),
        top: Number(rect.top || 0),
        width: Math.max(1, Number(rect.width || object.width || 1)),
        height: Math.max(1, Number(rect.height || object.height || 1))
      };
    }

    function canvasContentViewBounds() {
      const canvas = state.canvasBeta.canvas;
      if (!canvas) return null;
      const objects = canvas.getObjects().filter((object) => object && object.visible !== false);
      if (!objects.length) {
        return {
          left: Math.max(0, canvas.getWidth() * 0.5 - 420),
          top: Math.max(0, canvas.getHeight() * 0.38 - 260),
          width: 840,
          height: 520
        };
      }
      return objects.reduce((next, object) => {
        const rect = canvasObjectViewBounds(object);
        if (!rect) return next;
        if (!next) return { left: rect.left, top: rect.top, right: rect.left + rect.width, bottom: rect.top + rect.height };
        return {
          left: Math.min(next.left, rect.left),
          top: Math.min(next.top, rect.top),
          right: Math.max(next.right, rect.left + rect.width),
          bottom: Math.max(next.bottom, rect.top + rect.height)
        };
      }, null);
    }

    function normalizeCanvasViewBounds(bounds) {
      if (!bounds) return { left: 0, top: 0, width: 1, height: 1 };
      if (Number.isFinite(bounds.right) || Number.isFinite(bounds.bottom)) {
        return {
          left: Number(bounds.left || 0),
          top: Number(bounds.top || 0),
          width: Math.max(1, Number(bounds.width || (bounds.right - bounds.left) || 1)),
          height: Math.max(1, Number(bounds.height || (bounds.bottom - bounds.top) || 1))
        };
      }
      return {
        left: Number(bounds.left || 0),
        top: Number(bounds.top || 0),
        width: Math.max(1, Number(bounds.width || 1)),
        height: Math.max(1, Number(bounds.height || 1))
      };
    }

    function focusCanvasViewBounds(bounds, options = {}) {
      const canvas = state.canvasBeta.canvas;
      const wrap = els.canvasStageWrap;
      if (!canvas || !wrap) return;
      const normalized = normalizeCanvasViewBounds(bounds);
      const padding = Math.max(80, Number(options.padding || 140));
      const zoom = Number.isFinite(Number(options.zoom))
        ? Number(options.zoom)
        : Math.min(1.4, Math.max(0.12, Math.min(
          (wrap.clientWidth - padding) / normalized.width,
          (wrap.clientHeight - padding) / normalized.height
        )));
      canvas.setViewportTransform([zoom, 0, 0, zoom, 0, 0]);
      state.canvasBeta.zoom = zoom;
      scrollToCanvasViewBounds(normalized, zoom, options);
    }

    function scrollToCanvasViewBounds(bounds, zoom, options = {}) {
      const wrap = els.canvasStageWrap;
      if (!wrap) return;
      const normalized = normalizeCanvasViewBounds(bounds);
      const scale = Math.max(0.01, Number(zoom || state.canvasBeta.zoom || 1));
      if (isCanvasCameraMode?.()) {
        const centerX = normalized.left + normalized.width / 2;
        const centerY = normalized.top + normalized.height / 2;
        if (typeof setCanvasViewportCenter === "function") {
          setCanvasViewportCenter(centerX, centerY, scale);
        } else {
          const canvas = state.canvasBeta.canvas;
          canvas?.setViewportTransform?.([
            scale,
            0,
            0,
            scale,
            wrap.clientWidth / 2 - centerX * scale,
            wrap.clientHeight / 2 - centerY * scale
          ]);
          state.canvasBeta.zoom = scale;
          state.canvasBeta.cameraX = centerX;
          state.canvasBeta.cameraY = centerY;
        }
        return;
      }
      const left = Math.max(0, normalized.left * scale - (wrap.clientWidth - normalized.width * scale) / 2);
      const top = Math.max(0, normalized.top * scale - (wrap.clientHeight - normalized.height * scale) / 2);
      wrap.scrollTo({ left, top, behavior: options.behavior || "auto" });
    }

    function syncCanvasCameraFromViewport() {
      if (!isCanvasCameraMode?.()) return;
      const canvas = state.canvasBeta.canvas;
      const wrap = els.canvasStageWrap;
      if (!canvas || !wrap) return;
      const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
      const zoom = Math.max(0.01, Number(canvas.getZoom?.() || state.canvasBeta.zoom || 1));
      state.canvasBeta.cameraX = (wrap.clientWidth / 2 - Number(vpt[4] || 0)) / zoom;
      state.canvasBeta.cameraY = (wrap.clientHeight / 2 - Number(vpt[5] || 0)) / zoom;
    }

    return {
      canvasObjectTypeLabel,
      isCanvasObjectLocked,
      setCanvasObjectLocked,
      canvasFrameObjects,
      ensureCanvasObjectId,
      canvasFrameIndexMap,
      canvasFrameDisplayName,
      canvasLayerDisplayLabel,
      setCanvasLayerPanelOpen,
      toggleCanvasLayerHistory,
      renderCanvasLayerHistoryState,
      renderCanvasFrameLabels,
      renderCanvasLayers,
      duplicateCanvasSelection,
      deleteCanvasSelection,
      duplicateCanvasObject,
      deleteCanvasObject,
      keepCanvasFramesBehind,
      copyCanvasSelection,
      pasteCanvasClipboard,
      sendCanvasSelectionToChat,
      groupCanvasSelection,
      toggleCanvasSelectionVisible,
      toggleCanvasSelectionLock,
      zoomCanvasBy,
      fitCanvasView,
      resetCanvasView
    };
  };
})();
