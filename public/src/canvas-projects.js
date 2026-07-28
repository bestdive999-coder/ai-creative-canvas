(function () {
  const app = window.EcommerceCanvasApp = window.EcommerceCanvasApp || {};

  app.createCanvasProjectsController = function createCanvasProjectsController(deps) {
    const {
      els,
      state,
      canvasInitialWorkHeight,
      canvasLayerSerializableProps,
      createClientId,
      toast,
      initCanvasBeta,
      syncAspectRatioFromCanvasFrame,
      updateCanvasPropsPanel,
      renderCanvasLayers,
      resizeCanvasToStage,
      renderCanvasAssets,
      resetCanvasView,
      canvasInsertPoint
    } = deps;
    const tr = (key, fallback = "") => window.EcommerceCanvasI18n?.t(key, fallback) || fallback || key;
    const tf = (key, values = {}, fallback = "") => window.EcommerceCanvasI18n?.format(key, values, fallback) || fallback || key;

    function addCanvasFrame(sizeValue, options = {}) {
      const canvas = state.canvasBeta.canvas;
      if (!canvas || !sizeValue) return;
      const [width, height] = String(sizeValue).split("x").map((value) => Number(value));
      if (!width || !height) return;
      const existing = canvas.getObjects().filter((item) => item.objectType === "frame");
      const frameLabel = `Frame ${existing.length + 1}`;
      const point = canvasInsertPoint
        ? canvasInsertPoint({ stagger: true, staggerIndex: existing.length, width, height })
        : { left: existing.length ? 220 + existing.length * 70 : 280, top: existing.length ? 90 + existing.length * 60 : 80 };
      const left = point.left;
      const top = point.top;
      const frame = new fabric.Rect({
        left,
        top,
        width,
        height,
        fill: "#ffffff",
        stroke: "#aeb8c5",
        strokeWidth: 1.5,
        strokeDashArray: [8, 6],
        objectCaching: false,
        name: frameLabel,
        objectType: "frame",
        frameLabel,
        frameSize: { width, height },
        id: createClientId(),
        selectable: true,
        lockMovementX: true,
        lockMovementY: true,
        lockScalingX: true,
        lockScalingY: true,
        lockRotation: true,
        hasControls: false,
        hoverCursor: "default",
        hasRotatingPoint: false
      });
      canvas.add(frame);
      canvas.sendToBack(frame);
      if (options.select === false) canvas.discardActiveObject();
      else canvas.setActiveObject(frame);
      state.canvasBeta.activeFrameId = frame.id;
      syncAspectRatioFromCanvasFrame({ silent: true });
      canvas.requestRenderAll();
      updateCanvasPropsPanel();
      renderCanvasLayers();
      if (!options.silent) toast(`已创建 ${width}x${height} Frame。`);
    }
    
    function ensureDefaultCanvasFrame() {
      return null;
    }
    
    function createCanvasProject() {
      initCanvasBeta();
      const canvas = state.canvasBeta.canvas;
      if (!canvas) return;
      canvas.clear();
      canvas.setBackgroundColor("#f5f6f7", canvas.renderAll.bind(canvas));
      state.canvasBeta.projectId = "";
      state.canvasBeta.assets = [];
      state.canvasBeta.activeFrameId = "";
      state.canvasBeta.virtualWidth = 0;
      state.canvasBeta.virtualHeight = canvasInitialWorkHeight;
      state.canvasBeta.workspaceHome = null;
      state.canvasBeta.layerListExpanded = false;
      state.canvasBeta.spatialIndex = null;
      state.canvasBeta.spatialIndexDirty = true;
      state.canvasBeta.lastCanvasInsertedObjectId = "";
      state.canvasBeta.lastAiInsertedObjectId = "";
      state.canvasBeta.generationInsertionTailId = "";
      state.canvasBeta.generationInsertionSequence = 0;
      resizeCanvasToStage();
      ensureDefaultCanvasFrame();
      if (els.canvasProjectName) els.canvasProjectName.value = tr("unsavedProject", "Unsaved project");
      resetCanvasView();
      canvas.discardActiveObject();
      canvas.requestRenderAll();
      renderCanvasAssets();
      renderCanvasLayers();
      toast("已新建无限画布项目。");
    }
    
    async function saveCanvasProject() {
      await initCanvasBeta();
      const canvas = state.canvasBeta.canvas;
      if (!canvas) return;
      const id = state.canvasBeta.projectId || createClientId();
      const rawName = (els.canvasProjectName?.value || "").trim();
      const timestamp = new Date().toLocaleString(window.EcommerceCanvasI18n?.currentLocale?.() || undefined, { hour12: false }).replace(/[/:]/g, "-").replace(/\s+/g, "-");
      const generatedName = tf("projectNameFormat", { timestamp }, `AI Creative Canvas-${timestamp}`);
      const localizedUnsavedNames = window.EcommerceCanvasI18n?.localizedValues?.("unsavedProject") || [tr("unsavedProject", "Unsaved project")];
      const isNewDefaultProject = !state.canvasBeta.projectId && (!rawName || localizedUnsavedNames.includes(rawName));
      const name = isNewDefaultProject ? generatedName : (rawName || tr("unnamedProject", "Untitled project"));
      const payload = {
        id,
        name,
        assets: state.canvasBeta.assets,
        activeFrameId: state.canvasBeta.activeFrameId,
        workspace: {
          virtualWidth: state.canvasBeta.virtualWidth || 0,
          virtualHeight: state.canvasBeta.virtualHeight || 0,
          workspaceHome: state.canvasBeta.workspaceHome || null
        },
        canvas: canvas.toDatalessJSON(canvasLayerSerializableProps)
      };
      try {
        const response = await fetch("/api/canvas/projects/save", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "画布项目保存失败");
        state.canvasBeta.projectId = data.project?.id || id;
        if (els.canvasProjectName) els.canvasProjectName.value = data.project?.name || name;
        toast("画布项目已保存。");
      } catch (error) {
        console.error(error);
        toast(error.message || "画布项目保存失败。");
      }
    }
    
    return {
      addCanvasFrame,
      ensureDefaultCanvasFrame,
      createCanvasProject,
      saveCanvasProject
    };
  };
})();
