(function () {
  const app = window.EcommerceCanvasApp = window.EcommerceCanvasApp || {};

  app.createCanvasObjectsController = function createCanvasObjectsController(deps) {
    const {
      els,
      state,
      createClientId,
      toast,
      initCanvasBeta,
      canvasInsertPoint,
      syncAspectRatioFromCanvasFrame,
      renderCanvasLayers,
      canvasBetaStatus,
      updateCanvasImageAiEditor,
      ensureCanvasObjectId,
      updateCanvasZoomLabel,
      downloadDataUrl,
      safeName,
      startCanvasImageEraseMode,
      prepareCanvasImageExpansion,
      removeNearWhiteCanvasImageBackground
    } = deps;

    function addCanvasText() {
      initCanvasBeta();
      const canvas = state.canvasBeta.canvas;
      if (!canvas) return;
      const point = canvasInsertPoint({ stagger: true, width: 260, height: 90 });
      const text = new fabric.Textbox("双击编辑文字", {
        left: point.left,
        top: point.top,
        width: 260,
        fontFamily: app.canvasSystemFontFamily || "system-ui, sans-serif",
        fontSize: 44,
        fontWeight: "700",
        fill: "#111827",
        name: "文字",
        objectType: "text",
        id: createClientId()
      });
      canvas.add(text);
      canvas.setActiveObject(text);
      canvas.requestRenderAll();
      updateCanvasPropsPanel();
      renderCanvasLayers();
      canvasBetaStatus(window.EcommerceCanvasI18n?.t(
        "canvasTextAdded",
        "Text was added to the canvas. Double-click to edit."
      ));
    }
    
    function addCanvasShape(shape = "rect") {
      initCanvasBeta();
      const canvas = state.canvasBeta.canvas;
      if (!canvas) return;
      const point = canvasInsertPoint({ stagger: true });
      let object;
      const common = {
        left: point.left,
        top: point.top,
        fill: "rgba(17, 24, 39, 0.06)",
        stroke: "#111827",
        strokeWidth: 2,
        objectType: "shape",
        id: createClientId()
      };
      if (shape === "circle") {
        object = new fabric.Circle({ ...common, radius: 64, name: "圆形" });
      } else if (shape === "triangle") {
        object = new fabric.Triangle({ ...common, width: 130, height: 120, name: "三角形" });
      } else if (shape === "star") {
        const points = [];
        const outer = 70;
        const inner = 30;
        for (let index = 0; index < 10; index += 1) {
          const radius = index % 2 === 0 ? outer : inner;
          const angle = (Math.PI / 5) * index - Math.PI / 2;
          points.push({ x: Math.cos(angle) * radius + outer, y: Math.sin(angle) * radius + outer });
        }
        object = new fabric.Polygon(points, { ...common, name: "星形" });
      } else if (shape === "pill") {
        object = new fabric.Rect({ ...common, width: 220, height: 64, rx: 32, ry: 32, name: "胶囊标签" });
      } else if (shape === "badge" || shape === "bubble") {
        object = new fabric.Rect({ ...common, width: 190, height: 92, rx: 18, ry: 18, name: shape === "bubble" ? "气泡标签" : "标签框" });
      } else {
        object = new fabric.Rect({ ...common, width: 150, height: 110, rx: 8, ry: 8, name: "矩形" });
      }
      canvas.add(object);
      canvas.setActiveObject(object);
      canvas.requestRenderAll();
      updateCanvasPropsPanel();
      updateCanvasObjectToolbar();
      renderCanvasLayers();
      const shapeLabel = window.EcommerceCanvasI18n?.t("shape", "Shape") || "Shape";
      canvasBetaStatus(window.EcommerceCanvasI18n?.format(
        "canvasObjectAdded",
        { label: shapeLabel },
        `${shapeLabel} was added to the canvas.`
      ));
    }
    
    function selectedCanvasObject() {
      return state.canvasBeta.canvas?.getActiveObject() || null;
    }
    
    function isCanvasImageObject(object) {
      return Boolean(object && (object.objectType === "image" || object.isType?.("image")));
    }
    
    function selectedCanvasImageObject() {
      const object = selectedCanvasObject();
      return isCanvasImageObject(object) ? object : null;
    }
    
    function selectedCanvasFrame() {
      const canvas = state.canvasBeta.canvas;
      if (!canvas) return null;
      const active = selectedCanvasObject();
      if (active?.objectType === "frame") return active;
      return canvas.getObjects().find((item) => item.objectType === "frame" && item.id === state.canvasBeta.activeFrameId)
        || canvas.getObjects().find((item) => item.objectType === "frame")
        || null;
    }
    
    function updateCanvasPropsPanel() {
      const object = selectedCanvasObject();
      if (object?.objectType === "frame") {
        state.canvasBeta.activeFrameId = object.id || "";
        syncAspectRatioFromCanvasFrame({ silent: true });
      }
      updateCanvasObjectToolbar();
    }
    
    function updateCanvasObjectToolbar() {
      const toolbar = els.canvasObjectToolbar;
      const canvas = state.canvasBeta.canvas;
      const object = selectedCanvasObject();
      if (!toolbar || !canvas || !object) {
        if (toolbar) toolbar.hidden = true;
        updateCanvasImageAiEditor();
        return;
      }
      if (object.objectType === "frame" || object.objectType === "generation-placeholder") {
        toolbar.hidden = true;
        updateCanvasImageAiEditor();
        return;
      }
      toolbar.hidden = false;
      syncCanvasObjectToolbarButtons(object);
      const placement = canvasObjectToolbarPosition(object, toolbar);
      if (!placement) {
        toolbar.hidden = true;
        return;
      }
      toolbar.style.left = `${Math.round(placement.left)}px`;
      toolbar.style.top = `${Math.round(placement.top)}px`;
      toolbar.dataset.placement = placement.placement;
      toolbar.dataset.objectType = object.objectType || object.type || "";
      updateCanvasImageAiEditor();
    }
    
    function clampCanvasImageAiEditorPosition(left, top) {
      const editor = els.canvasImageAiEditor;
      const wrap = els.canvasStageWrap;
      if (!editor || !wrap) return { left, top };
      const width = Math.max(320, editor.offsetWidth || 0);
      const height = Math.max(120, editor.offsetHeight || 0);
      const useCamera = state.canvasBeta.cameraMode !== false;
      const scrollLeft = useCamera ? 0 : wrap.scrollLeft;
      const scrollTop = useCamera ? 0 : wrap.scrollTop;
      const minLeft = scrollLeft + 18 + width / 2;
      const maxLeft = scrollLeft + wrap.clientWidth - 18 - width / 2;
      const minTop = scrollTop + 18;
      const maxTop = scrollTop + wrap.clientHeight - 18 - height;
      return {
        left: Math.max(minLeft, Math.min(Math.max(minLeft, maxLeft), left)),
        top: Math.max(minTop, Math.min(Math.max(minTop, maxTop), top))
      };
    }
    
    function startCanvasImageAiDrag(event) {
      if (event.button !== 0 || event.target?.closest?.("button")) return;
      const editor = els.canvasImageAiEditor;
      const object = selectedCanvasImageObject();
      if (!editor || editor.hidden || !object) return;
      event.preventDefault();
      event.stopPropagation();
      const objectId = ensureCanvasObjectId(object);
      const left = Number.parseFloat(editor.style.left) || 0;
      const top = Number.parseFloat(editor.style.top) || 0;
      state.canvasBeta.imageAiEditorDrag = {
        objectId,
        startX: event.clientX,
        startY: event.clientY,
        startLeft: left,
        startTop: top
      };
      editor.classList.add("is-dragging");
      document.addEventListener("pointermove", moveCanvasImageAiDrag);
      document.addEventListener("pointerup", endCanvasImageAiDrag);
      document.addEventListener("pointercancel", endCanvasImageAiDrag);
      window.addEventListener("blur", endCanvasImageAiDrag);
      document.addEventListener("visibilitychange", cancelHiddenCanvasImageAiDrag);
    }
    
    function moveCanvasImageAiDrag(event) {
      const drag = state.canvasBeta.imageAiEditorDrag;
      const editor = els.canvasImageAiEditor;
      if (!drag || !editor) return;
      event.preventDefault();
      const next = clampCanvasImageAiEditorPosition(
        drag.startLeft + event.clientX - drag.startX,
        drag.startTop + event.clientY - drag.startY
      );
      editor.style.left = `${Math.round(next.left)}px`;
      editor.style.top = `${Math.round(next.top)}px`;
      editor.dataset.placement = "manual";
      state.canvasBeta.imageAiEditorManualPosition = {
        objectId: drag.objectId,
        left: next.left,
        top: next.top
      };
    }
    
    function endCanvasImageAiDrag() {
      state.canvasBeta.imageAiEditorDrag = null;
      els.canvasImageAiEditor?.classList.remove("is-dragging");
      document.removeEventListener("pointermove", moveCanvasImageAiDrag);
      document.removeEventListener("pointerup", endCanvasImageAiDrag);
      document.removeEventListener("pointercancel", endCanvasImageAiDrag);
      window.removeEventListener("blur", endCanvasImageAiDrag);
      document.removeEventListener("visibilitychange", cancelHiddenCanvasImageAiDrag);
    }

    function cancelHiddenCanvasImageAiDrag() {
      if (document.hidden) endCanvasImageAiDrag();
    }
    
    function syncCanvasObjectToolbarButtons(object) {
      const toolbar = els.canvasObjectToolbar;
      if (!toolbar) return;
      const isImage = object?.objectType === "image" || object?.isType?.("image");
      const visibleByAction = {
        "remove-bg": isImage,
        "remove-bg-fine": isImage,
        erase: isImage,
        expand: isImage,
        download: isImage
      };
      toolbar.querySelectorAll("[data-canvas-object-action]").forEach((button) => {
        const action = button.dataset.canvasObjectAction || "";
        const visible = visibleByAction[action] !== false;
        button.hidden = !visible;
        button.disabled = !visible;
      });
    }

    function canvasObjectViewportPoints(object, canvas) {
      const coords = object?.getCoords?.() || [];
      if (!coords.length) return [];
      const rawPoints = coords.map((point) => ({
        x: Number(point.x || 0),
        y: Number(point.y || 0)
      }));
      const rawWidth = Math.max(...rawPoints.map((point) => point.x)) - Math.min(...rawPoints.map((point) => point.x));
      const rawHeight = Math.max(...rawPoints.map((point) => point.y)) - Math.min(...rawPoints.map((point) => point.y));
      const zoom = Math.max(0.01, Number(canvas?.getZoom?.() || state.canvasBeta.zoom || 1));
      const expectedWidth = Math.max(1, Number(object.getScaledWidth?.() || object.width || 1) * zoom);
      const expectedHeight = Math.max(1, Number(object.getScaledHeight?.() || object.height || 1) * zoom);
      const widthRatio = rawWidth > 0 ? rawWidth / expectedWidth : 1;
      const heightRatio = rawHeight > 0 ? rawHeight / expectedHeight : 1;
      const alreadyViewport = widthRatio > 0.5 && widthRatio < 2 && heightRatio > 0.5 && heightRatio < 2;
      if (alreadyViewport || !window.fabric?.util?.transformPoint) return rawPoints;
      const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
      return rawPoints.map((point) => fabric.util.transformPoint(point, vpt));
    }
    
    function canvasObjectToolbarPosition(object, toolbar) {
      const canvas = state.canvasBeta.canvas;
      const wrap = els.canvasStageWrap;
      const canvasElement = canvas?.upperCanvasEl || canvas?.lowerCanvasEl;
      if (!canvas || !wrap || !canvasElement || !object) return null;
      object.setCoords?.();
      const points = canvasObjectViewportPoints(object, canvas);
      if (!points.length) return null;
      const canvasRect = canvasElement.getBoundingClientRect();
      const wrapRect = wrap.getBoundingClientRect();
      const useCamera = state.canvasBeta.cameraMode !== false;
      const scrollLeft = useCamera ? 0 : wrap.scrollLeft;
      const scrollTop = useCamera ? 0 : wrap.scrollTop;
      const offsetLeft = canvasRect.left - wrapRect.left + scrollLeft;
      const offsetTop = canvasRect.top - wrapRect.top + scrollTop;
      const minX = Math.min(...points.map((point) => point.x));
      const maxX = Math.max(...points.map((point) => point.x));
      const minY = Math.min(...points.map((point) => point.y));
      const maxY = Math.max(...points.map((point) => point.y));
      const visibleLeft = scrollLeft + 18;
      const visibleRight = scrollLeft + wrap.clientWidth - 18;
      const visibleTop = scrollTop + 18;
      const visibleBottom = scrollTop + wrap.clientHeight - 18;
      const toolbarWidth = Math.max(220, toolbar.offsetWidth || 0);
      const toolbarHeight = Math.max(42, toolbar.offsetHeight || 0);
      let left = offsetLeft + (minX + maxX) / 2;
      left = Math.max(visibleLeft + toolbarWidth / 2, Math.min(visibleRight - toolbarWidth / 2, left));
      let top = offsetTop + minY - 10;
      let placement = "above";
      if (top - toolbarHeight < visibleTop) {
        top = offsetTop + maxY + 10;
        placement = "below";
      }
      if (placement === "below" && top + toolbarHeight > visibleBottom) {
        top = Math.max(visibleTop + toolbarHeight, visibleBottom - toolbarHeight);
      }
      if (placement === "above" && top - toolbarHeight < visibleTop) {
        top = visibleTop + toolbarHeight;
      }
      return { left, top, placement };
    }
    
    function handleCanvasObjectAction(action) {
      const canvas = state.canvasBeta.canvas;
      const object = selectedCanvasObject();
      if (!canvas || !object) return;
      if (action === "remove-bg") {
        removeNearWhiteCanvasImageBackground(object, { model: "u2net" }).catch((error) => {
          console.error(error);
          toast(error.message || "移除背景失败。");
        });
        return;
      }
      if (action === "remove-bg-fine") {
        removeNearWhiteCanvasImageBackground(object, { model: "isnet-general-use" }).catch((error) => {
          console.error(error);
          toast(error.message || "精细抠图失败。");
        });
        return;
      }
      if (action === "download") {
        const src = object.srcUrl || object.getSrc?.();
        if (src) {
          downloadDataUrl(src, `${safeName(object.name || "canvas-image")}.png`);
          return;
        }
        toast("当前元素不是独立图片，无法单独下载。");
        return;
      }
      if (action === "erase") {
        startCanvasImageEraseMode(object).catch((error) => {
          console.error(error);
          toast(error.message || "擦除工具启动失败。");
        });
        return;
      }
      if (action === "expand") {
        prepareCanvasImageExpansion(object);
        return;
      }
      const labels = {
        "remove-bg": "移除背景",
        "remove-bg-fine": "精细抠图",
        erase: "擦除",
        expand: "扩展",
        crop: "裁剪"
      };
      toast(`${labels[action] || "该能力"}不适用于当前对象。`);
    }
    
    return {
      addCanvasText,
      addCanvasShape,
      selectedCanvasObject,
      isCanvasImageObject,
      selectedCanvasImageObject,
      selectedCanvasFrame,
      updateCanvasPropsPanel,
      updateCanvasObjectToolbar,
      clampCanvasImageAiEditorPosition,
      startCanvasImageAiDrag,
      moveCanvasImageAiDrag,
      endCanvasImageAiDrag,
      syncCanvasObjectToolbarButtons,
      canvasObjectToolbarPosition,
      handleCanvasObjectAction
    };
  };
})();
