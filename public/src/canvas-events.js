(function () {
  const app = window.EcommerceCanvasApp = window.EcommerceCanvasApp || {};

  app.createCanvasEventsController = function createCanvasEventsController(deps) {
    const {
      els,
      state,
      createClientId,
      escapeHtml,
      clampUnit,
      closestAspectRatioFromSize,
      toast,
      canvasBetaStatus,
      updateCanvasZoomLabel,
      updateCanvasObjectToolbar,
      updateCanvasPropsPanel,
      renderCanvasLayers,
      renderCanvasFrameLabels,
      ensureCanvasHeightForObjects,
      ensureCanvasBoundsForViewport,
      isCanvasCameraMode = () => false,
      markCanvasSpatialIndexDirty = () => {},
      applyCanvasViewportRenderWindow = () => null,
      scheduleCanvasViewportRenderWindowRestore = () => {},
      restoreCanvasViewportRenderWindow = () => {},
      beginCanvasRenderSample = () => {},
      endCanvasRenderSample = () => {},
      selectedCanvasObject,
      resetCanvasImageAiEditorCollapse,
      handleCanvasErasePointer
    } = deps;

    function bindFabricCanvasEvents(canvas) {
      let isDragging = false;
      let lastPosX = 0;
      let lastPosY = 0;
      let lastPointerClientX = 0;
      let lastPointerClientY = 0;
      let moveUiFrame = 0;
      let frameLabelFrame = 0;
      let structuralUiFrame = 0;
      let structuralNeedsBounds = false;
      let viewportUiFrame = 0;
      let viewportUiZoom = null;
      let viewportUiStatus = "";
      let viewportUiNeedsToolbar = false;
      let viewportUiNeedsLabels = false;
      let lastViewportInteractionAt = 0;
      let wheelZoomFrame = 0;
      let pendingWheelZoom = null;
      let wheelPanFrame = 0;
      let pendingWheelPanX = 0;
      let pendingWheelPanY = 0;
      const bindCanvasWheelDefaultGuard = () => {
        const wrap = els.canvasStageWrap;
        if (!wrap || wrap.__ecommerceCanvasWheelDefaultGuardBound) return;
        wrap.__ecommerceCanvasWheelDefaultGuardBound = true;
        wrap.addEventListener("wheel", (event) => {
          if (!wrap.contains(event.target)) return;
          if (event.ctrlKey || event.metaKey || event.altKey || isCanvasCameraMode?.()) {
            event.preventDefault();
          }
        }, { capture: true, passive: false });
      };
      const restoreCanvasPointerState = () => {
        isDragging = false;
        const keepPanning = Boolean(state.canvasBeta.panMode || state.canvasBeta.spacePanMode);
        canvas.selection = !keepPanning;
        canvas.skipTargetFind = keepPanning;
        canvas.defaultCursor = keepPanning ? "grab" : "default";
        canvas.hoverCursor = keepPanning ? "grab" : "move";
        scheduleCanvasViewportRenderWindowRestore(80);
        updateCanvasObjectToolbar();
      };
      const cancelCanvasPointerInteraction = (event) => {
        const hadTransform = Boolean(canvas._currentTransform);
        if (!hadTransform && !isDragging) return;

        if (hadTransform && typeof MouseEvent === "function") {
          try {
            document.dispatchEvent(new MouseEvent("mouseup", {
              bubbles: true,
              cancelable: true,
              clientX: Number.isFinite(lastPointerClientX) ? lastPointerClientX : 0,
              clientY: Number.isFinite(lastPointerClientY) ? lastPointerClientY : 0,
              button: 0,
              buttons: 0
            }));
          } catch {
          }
        }
        if (canvas._currentTransform) {
          try {
            canvas._finalizeCurrentTransform?.(event || {});
          } catch {
          }
          canvas._currentTransform = null;
        }
        restoreCanvasPointerState();
        canvas.requestRenderAll();
      };
      const markViewportInteraction = () => {
        lastViewportInteractionAt = performance.now();
      };
      const scheduleFrameLabelRender = () => {
        if (frameLabelFrame) return;
        frameLabelFrame = requestAnimationFrame(() => {
          frameLabelFrame = 0;
          renderCanvasFrameLabels();
        });
      };
      const scheduleViewportUiUpdate = (options = {}) => {
        if (Number.isFinite(Number(options.zoom))) viewportUiZoom = Number(options.zoom);
        if (options.status) viewportUiStatus = String(options.status);
        viewportUiNeedsToolbar = viewportUiNeedsToolbar || options.toolbar !== false;
        viewportUiNeedsLabels = viewportUiNeedsLabels || options.labels !== false;
        if (viewportUiFrame) return;
        viewportUiFrame = requestAnimationFrame(() => {
          const nextZoom = viewportUiZoom;
          const nextStatus = viewportUiStatus;
          const shouldUpdateToolbar = viewportUiNeedsToolbar;
          const shouldRenderLabels = viewportUiNeedsLabels;
          viewportUiFrame = 0;
          viewportUiZoom = null;
          viewportUiStatus = "";
          viewportUiNeedsToolbar = false;
          viewportUiNeedsLabels = false;
          if (Number.isFinite(Number(nextZoom))) updateCanvasZoomLabel(nextZoom);
          if (nextStatus) canvasBetaStatus(nextStatus);
          if (shouldUpdateToolbar) updateCanvasObjectToolbar();
          if (shouldRenderLabels) renderCanvasFrameLabels();
        });
      };
      const scheduleStructuralUiUpdate = (options = {}) => {
        structuralNeedsBounds = structuralNeedsBounds || Boolean(options.ensureBounds);
        if (structuralUiFrame) return;
        structuralUiFrame = requestAnimationFrame(() => {
          const shouldEnsureBounds = structuralNeedsBounds;
          structuralUiFrame = 0;
          structuralNeedsBounds = false;
          if (shouldEnsureBounds) ensureCanvasHeightForObjects();
          updateCanvasPropsPanel();
          updateCanvasObjectToolbar();
          renderCanvasLayers();
          renderCanvasFrameLabels();
        });
      };
      const scheduleMoveUiUpdate = () => {
        if (moveUiFrame) return;
        moveUiFrame = requestAnimationFrame(() => {
          moveUiFrame = 0;
          updateCanvasObjectToolbar();
          scheduleFrameLabelRender();
        });
      };
      const syncCameraFromViewport = () => {
        if (!isCanvasCameraMode?.()) return;
        const wrap = els.canvasStageWrap;
        const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
        const zoom = Math.max(0.01, Number(canvas.getZoom?.() || state.canvasBeta.zoom || 1));
        if (!wrap) return;
        state.canvasBeta.cameraX = (wrap.clientWidth / 2 - Number(vpt[4] || 0)) / zoom;
        state.canvasBeta.cameraY = (wrap.clientHeight / 2 - Number(vpt[5] || 0)) / zoom;
      };
      const canvasWheelViewportPoint = (event) => {
        const offsetX = Number(event?.offsetX);
        const offsetY = Number(event?.offsetY);
        if (Number.isFinite(offsetX) && Number.isFinite(offsetY)) {
          return { x: offsetX, y: offsetY };
        }
        const canvasElement = canvas.upperCanvasEl || canvas.lowerCanvasEl || els.designCanvas;
        const rect = canvasElement?.getBoundingClientRect?.();
        const clientX = Number(event?.clientX);
        const clientY = Number(event?.clientY);
        if (rect && Number.isFinite(clientX) && Number.isFinite(clientY)) {
          return {
            x: clientX - rect.left,
            y: clientY - rect.top
          };
        }
        const wrap = els.canvasStageWrap;
        return {
          x: Math.max(1, Number(wrap?.clientWidth || canvas.getWidth?.() || 1)) / 2,
          y: Math.max(1, Number(wrap?.clientHeight || canvas.getHeight?.() || 1)) / 2
        };
      };
      const scheduleWheelPan = (deltaX = 0, deltaY = 0) => {
        pendingWheelPanX += Number(deltaX || 0);
        pendingWheelPanY += Number(deltaY || 0);
        if (wheelPanFrame) return;
        wheelPanFrame = requestAnimationFrame(() => {
          const moveX = pendingWheelPanX;
          const moveY = pendingWheelPanY;
          pendingWheelPanX = 0;
          pendingWheelPanY = 0;
          wheelPanFrame = 0;
          const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
          vpt[4] = Number(vpt[4] || 0) - moveX;
          vpt[5] = Number(vpt[5] || 0) - moveY;
          canvas.setViewportTransform(vpt);
          syncCameraFromViewport();
          state.canvasBeta.imageAiEditorManualPosition = null;
          markViewportInteraction();
          applyCanvasViewportRenderWindow({ padding: 900 });
          canvas.requestRenderAll();
          scheduleCanvasViewportRenderWindowRestore(180);
          scheduleViewportUiUpdate({ toolbar: true, labels: true });
        });
      };
      const scheduleWheelZoom = (point, deltaY = 0) => {
        const rawBaseZoom = Number(pendingWheelZoom?.zoom || canvas.getZoom?.() || state.canvasBeta.zoom || 1);
        const baseZoom = Number.isFinite(rawBaseZoom) && rawBaseZoom > 0 ? rawBaseZoom : 1;
        let zoom = baseZoom * (0.999 ** Number(deltaY || 0));
        zoom = Math.min(4, Math.max(0.12, zoom));
        pendingWheelZoom = {
          point,
          zoom
        };
        if (wheelZoomFrame) return;
        wheelZoomFrame = requestAnimationFrame(() => {
          const pending = pendingWheelZoom;
          pendingWheelZoom = null;
          wheelZoomFrame = 0;
          if (!pending) return;
          canvas.zoomToPoint(pending.point, pending.zoom);
          state.canvasBeta.zoom = pending.zoom;
          syncCameraFromViewport();
          state.canvasBeta.imageAiEditorManualPosition = null;
          markViewportInteraction();
          applyCanvasViewportRenderWindow({ padding: 900 });
          canvas.requestRenderAll();
          scheduleCanvasViewportRenderWindowRestore(180);
          scheduleViewportUiUpdate({
            zoom: pending.zoom,
            status: `缩放 ${Math.round(pending.zoom * 100)}%`,
            toolbar: true,
            labels: true
          });
        });
      };
      bindCanvasWheelDefaultGuard();
      window.addEventListener("blur", cancelCanvasPointerInteraction);
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) cancelCanvasPointerInteraction();
      });
      document.addEventListener("pointercancel", cancelCanvasPointerInteraction, true);
      canvas.on("before:render", beginCanvasRenderSample);
      canvas.on("after:render", () => {
        endCanvasRenderSample();
        if (viewportUiFrame || performance.now() - lastViewportInteractionAt < 120) return;
        scheduleFrameLabelRender();
      });
      canvas.on("mouse:wheel", (opt) => {
        if (!opt.e.ctrlKey && !opt.e.metaKey && !opt.e.altKey) {
          if (isCanvasCameraMode?.()) {
            opt.e.preventDefault();
            opt.e.stopPropagation();
            scheduleWheelPan(opt.e.deltaX || 0, opt.e.deltaY || 0);
            return;
          }
          state.canvasBeta.canvas?.calcOffset();
          return;
        }
        opt.e.preventDefault();
        opt.e.stopPropagation();
        scheduleWheelZoom(canvasWheelViewportPoint(opt.e), opt.e.deltaY);
      });
      canvas.on("mouse:down", (opt) => {
        lastPointerClientX = Number(opt.e?.clientX || 0);
        lastPointerClientY = Number(opt.e?.clientY || 0);
        if (handleCanvasErasePointer("down", opt)) return;
        if ((opt.e.ctrlKey || opt.e.metaKey) && captureCanvasFocusTarget(opt)) {
          opt.e.preventDefault();
          opt.e.stopPropagation();
          return;
        }
        const shouldPan = ((state.canvasBeta.panMode || state.canvasBeta.spacePanMode) && opt.e.button === 0) || opt.e.altKey || opt.e.button === 1;
        if (shouldPan) {
          isDragging = true;
          canvas.selection = false;
          canvas.skipTargetFind = true;
          lastPosX = opt.e.clientX;
          lastPosY = opt.e.clientY;
          canvas.defaultCursor = "grabbing";
          opt.e.preventDefault();
          opt.e.stopPropagation();
        }
      });
      canvas.on("mouse:move", (opt) => {
        lastPointerClientX = Number(opt.e?.clientX || lastPointerClientX || 0);
        lastPointerClientY = Number(opt.e?.clientY || lastPointerClientY || 0);
        if (handleCanvasErasePointer("move", opt)) return;
        if (!isDragging) return;
        const deltaX = opt.e.clientX - lastPosX;
        const deltaY = opt.e.clientY - lastPosY;
        const wrap = els.canvasStageWrap;
        if (isCanvasCameraMode?.()) {
          const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
          vpt[4] = Number(vpt[4] || 0) + deltaX;
          vpt[5] = Number(vpt[5] || 0) + deltaY;
          canvas.setViewportTransform(vpt);
          syncCameraFromViewport();
        } else if (wrap) {
          wrap.scrollLeft -= deltaX;
          wrap.scrollTop -= deltaY;
          ensureCanvasBoundsForViewport?.();
          canvas.calcOffset();
        } else {
          const vpt = canvas.viewportTransform;
          vpt[4] += deltaX;
          vpt[5] += deltaY;
        }
        applyCanvasViewportRenderWindow({ padding: 900 });
        canvas.requestRenderAll();
        scheduleCanvasViewportRenderWindowRestore(180);
        lastPosX = opt.e.clientX;
        lastPosY = opt.e.clientY;
        scheduleMoveUiUpdate();
      });
      canvas.on("mouse:up", (opt) => {
        if (handleCanvasErasePointer("up", opt)) return;
        restoreCanvasPointerState();
      });
      ["selection:created", "selection:updated", "selection:cleared", "object:modified", "object:added", "object:removed"].forEach((eventName) => {
        canvas.on(eventName, () => {
          if (eventName === "selection:created" || eventName === "selection:updated" || eventName === "selection:cleared") {
            resetCanvasImageAiEditorCollapse(selectedCanvasObject());
          }
          syncCanvasFocusTargetWithSelection(eventName);
          if (eventName === "object:modified" || eventName === "object:added" || eventName === "object:removed") {
            restoreCanvasViewportRenderWindow({ render: false });
            markCanvasSpatialIndexDirty(eventName);
          }
          scheduleStructuralUiUpdate({
            ensureBounds: eventName === "object:modified" || eventName === "object:added" || eventName === "object:removed"
          });
        });
      });
      ["object:moving", "object:scaling", "object:rotating"].forEach((eventName) => {
        canvas.on(eventName, () => {
          scheduleMoveUiUpdate();
        });
      });
      canvas.on("path:created", (event) => {
        const path = event.path;
        if (!path) return;
        path.set({
          id: path.id || createClientId(),
          name: path.name || "钢笔路径",
          objectType: "path",
          semanticRole: path.semanticRole || "decoration",
          fill: null,
          stroke: path.stroke || "#0f766e",
          strokeWidth: path.strokeWidth || 2.4
        });
        canvas.setActiveObject(path);
        canvas.requestRenderAll();
        updateCanvasPropsPanel();
        renderCanvasLayers();
      });
    }
    
    function captureCanvasFocusTarget(opt) {
      const canvas = state.canvasBeta.canvas;
      const target = opt?.target;
      if (!canvas || !target || target.objectType === "frame") {
        canvasBetaStatus("请 Ctrl 点选画布中的图片或元素。");
        return false;
      }
      let imageFile = target.srcUrl || target.getSrc?.() || "";
      if (!imageFile || /^blob:/i.test(String(imageFile))) {
        try {
          if (typeof target.toDataURL === "function") {
            imageFile = target.toDataURL({ format: "png", multiplier: 1 });
          }
        } catch (error) {
          console.warn("Canvas focus target export failed", error);
        }
      }
      if (!imageFile) {
        canvasBetaStatus("已选中元素，但它不是可用于改图的图片。");
        return false;
      }
      const pointer = canvas.getPointer(opt.e);
      const bounds = target.getBoundingRect(true, true);
      const normalizedX = clampUnit((pointer.x - bounds.left) / Math.max(1, bounds.width));
      const normalizedY = clampUnit((pointer.y - bounds.top) / Math.max(1, bounds.height));
      const naturalWidth = Number(target.width || bounds.width || 1);
      const naturalHeight = Number(target.height || bounds.height || 1);
      const focusTarget = {
        id: createClientId(),
        objectId: target.id || "",
        objectType: target.objectType || target.type || "image",
        name: target.name || "画布图片",
        label: `${target.name || "画布图片"} 局部`,
        imageFile,
        naturalWidth,
        naturalHeight,
        width: naturalWidth,
        height: naturalHeight,
        aspectRatio: closestAspectRatioFromSize(naturalWidth, naturalHeight),
        normalizedX: Number(normalizedX.toFixed(4)),
        normalizedY: Number(normalizedY.toFixed(4)),
        pixelX: Math.round(normalizedX * Math.max(1, naturalWidth)),
        pixelY: Math.round(normalizedY * Math.max(1, naturalHeight)),
        canvasX: Math.round(pointer.x),
        canvasY: Math.round(pointer.y),
        createdAt: new Date().toISOString()
      };
      state.aiDirect.canvasFocusTarget = focusTarget;
      state.canvasBeta.pendingFocusTarget = focusTarget;
      state.canvasBeta.isCapturingFocusTarget = true;
      canvas.setActiveObject(target);
      canvas.requestRenderAll();
      window.setTimeout(() => {
        state.canvasBeta.isCapturingFocusTarget = false;
      }, 0);
      renderCanvasFocusTargetChip();
      switchStudioPanel("ai");
      canvasBetaStatus(`已选中局部区域：${focusTarget.label}。右侧对话框不会自动使用它；局部 AI 编辑将在画布小框中处理。`);
      toast("已临时选中画布局部。");
      return true;
    }
    
    function syncCanvasFocusTargetWithSelection(reason = "") {
      const focusTarget = state.aiDirect.canvasFocusTarget;
      if (!focusTarget || state.canvasBeta.isCapturingFocusTarget) return;
      const canvas = state.canvasBeta.canvas;
      if (!canvas) return;
      if (reason === "selection:cleared") {
        clearCanvasFocusTarget({ silent: true });
        return;
      }
      const objectId = focusTarget.objectId || "";
      const objectExists = objectId
        ? canvas.getObjects().some((object) => object.id === objectId)
        : true;
      const activeObject = canvas.getActiveObject();
      if (!objectExists || (activeObject?.id && objectId && activeObject.id !== objectId)) {
        clearCanvasFocusTarget({ silent: true });
      }
    }
    
    function renderCanvasFocusTargetChip() {
      if (!els.canvasFocusTargetChip) return;
      const target = state.aiDirect.canvasFocusTarget;
      if (!target) {
        els.canvasFocusTargetChip.hidden = true;
        els.canvasFocusTargetChip.innerHTML = "";
        return;
      }
      els.canvasFocusTargetChip.hidden = false;
      els.canvasFocusTargetChip.innerHTML = `
        <img src="${escapeHtml(target.imageFile)}" alt="">
        <span>已选中</span>
        <b>${escapeHtml(target.label || target.name || "画布局部")}</b>
        <small>x ${target.normalizedX}, y ${target.normalizedY}</small>
        <button type="button" data-clear-canvas-focus title="取消选区">×</button>
      `;
    }
    
    function clearCanvasFocusTarget(options = {}) {
      state.aiDirect.canvasFocusTarget = null;
      state.canvasBeta.pendingFocusTarget = null;
      renderCanvasFocusTargetChip();
      if (!options.silent) {
        canvasBetaStatus("已取消画布临时选区。");
        toast("已取消选区。");
      }
    }

    return {
      bindFabricCanvasEvents,
      captureCanvasFocusTarget,
      syncCanvasFocusTargetWithSelection,
      renderCanvasFocusTargetChip,
      clearCanvasFocusTarget
    };
  };
})();
