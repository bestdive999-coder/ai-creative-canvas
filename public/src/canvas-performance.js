(function () {
  const app = window.EcommerceCanvasApp = window.EcommerceCanvasApp || {};

  app.createCanvasPerformanceController = function createCanvasPerformanceController(deps) {
    const {
      els,
      state,
      escapeHtml
    } = deps;

    const maxRenderSamples = 90;
    let renderStartAt = 0;
    let renderFrame = 0;
    let panelTimer = 0;
    let viewportRestoreTimer = 0;
    const viewportCulledObjects = new Map();

    function isCulledVisibleObject(object) {
      return viewportCulledObjects.has(object) && viewportCulledObjects.get(object) !== false;
    }

    function markCanvasSpatialIndexDirty(reason = "") {
      state.canvasBeta.spatialIndexDirty = true;
      state.canvasBeta.spatialIndexReason = reason || "changed";
    }

    function canvasObjectBounds(object) {
      if (!object) return null;
      try {
        object.setCoords?.();
        const rect = object.getBoundingRect(true, true);
        const left = Number(rect.left || 0);
        const top = Number(rect.top || 0);
        const width = Math.max(0, Number(rect.width || 0));
        const height = Math.max(0, Number(rect.height || 0));
        return {
          left,
          top,
          right: left + width,
          bottom: top + height,
          width,
          height
        };
      } catch {
        return null;
      }
    }

    function canvasObjectPerformanceEntry(object, index) {
      const bounds = canvasObjectBounds(object);
      if (!bounds) return null;
      const isImage = object.objectType === "image" || object.isType?.("image");
      const naturalWidth = Number(object.naturalWidth || object.width || 0);
      const naturalHeight = Number(object.naturalHeight || object.height || 0);
      const pixelCount = isImage ? Math.max(0, naturalWidth * naturalHeight) : 0;
      return {
        id: object.id || `object-${index}`,
        index,
        object,
        bounds,
        type: object.objectType || object.type || "object",
        isImage,
        pixelCount,
        visible: object.visible !== false || isCulledVisibleObject(object)
      };
    }

    function rebuildCanvasSpatialIndex() {
      const canvas = state.canvasBeta.canvas;
      if (!canvas) return null;
      const cellSize = Math.max(360, Number(state.canvasBeta.spatialCellSize || 1200));
      const cells = new Map();
      const globalEntries = [];
      const entries = [];
      let imageCount = 0;
      let hugeImageCount = 0;
      let totalImagePixels = 0;

      canvas.getObjects()
        .filter((object) => object && (object.visible !== false || isCulledVisibleObject(object)))
        .forEach((object, index) => {
          const entry = canvasObjectPerformanceEntry(object, index);
          if (!entry) return;
          entries.push(entry);
          if (entry.isImage) {
            imageCount += 1;
            totalImagePixels += entry.pixelCount;
            if (entry.pixelCount >= 4096 * 4096) hugeImageCount += 1;
          }
          const minX = Math.floor(entry.bounds.left / cellSize);
          const maxX = Math.floor(entry.bounds.right / cellSize);
          const minY = Math.floor(entry.bounds.top / cellSize);
          const maxY = Math.floor(entry.bounds.bottom / cellSize);
          const span = Math.max(1, (maxX - minX + 1) * (maxY - minY + 1));
          if (span > 80) {
            globalEntries.push(entry);
            return;
          }
          for (let x = minX; x <= maxX; x += 1) {
            for (let y = minY; y <= maxY; y += 1) {
              const key = `${x}:${y}`;
              if (!cells.has(key)) cells.set(key, []);
              cells.get(key).push(entry);
            }
          }
        });

      const index = {
        cellSize,
        cells,
        globalEntries,
        entries,
        objectCount: entries.length,
        imageCount,
        hugeImageCount,
        totalImagePixels,
        cellCount: cells.size,
        builtAt: Date.now()
      };
      state.canvasBeta.spatialIndex = index;
      state.canvasBeta.spatialIndexDirty = false;
      return index;
    }

    function viewportAlwaysVisibleObjects() {
      const canvas = state.canvasBeta.canvas;
      const keep = new Set();
      if (!canvas) return keep;
      const active = canvas.getActiveObject?.();
      if (active) {
        keep.add(active);
        if (Array.isArray(active._objects)) active._objects.forEach((object) => keep.add(object));
      }
      canvas.getObjects().forEach((object) => {
        if (!object) return;
        if (object.objectType === "frame" || object.objectType === "generation-placeholder") keep.add(object);
      });
      return keep;
    }

    function restoreCanvasViewportRenderWindow(options = {}) {
      const canvas = state.canvasBeta.canvas;
      if (viewportRestoreTimer) {
        clearTimeout(viewportRestoreTimer);
        viewportRestoreTimer = 0;
      }
      if (!viewportCulledObjects.size) {
        state.canvasBeta.viewportRenderWindow = null;
        return;
      }
      viewportCulledObjects.forEach((visible, object) => {
        if (!object) return;
        object.visible = visible !== false;
        delete object.__ecommerceCanvasViewportCulled;
      });
      viewportCulledObjects.clear();
      state.canvasBeta.viewportRenderWindow = null;
      if (options.render !== false) canvas?.requestRenderAll?.();
    }

    function applyCanvasViewportRenderWindow(options = {}) {
      const canvas = state.canvasBeta.canvas;
      if (!canvas) return null;
      const index = ensureCanvasSpatialIndex();
      const objectCount = Number(index?.objectCount || 0);
      const threshold = Math.max(24, Number(state.canvasBeta.viewportCullThreshold || 48));
      if (!index || objectCount < threshold) {
        restoreCanvasViewportRenderWindow({ render: false });
        return null;
      }
      const padding = Math.max(240, Number(options.padding || state.canvasBeta.viewportCullPadding || 900));
      const visibleEntries = canvasVisibleObjectEntries(padding);
      const visibleObjects = new Set(visibleEntries.map((entry) => entry.object).filter(Boolean));
      const keepObjects = viewportAlwaysVisibleObjects();
      let hiddenCount = 0;
      let restoredCount = 0;

      index.entries.forEach((entry) => {
        const object = entry.object;
        if (!object) return;
        const shouldShow = visibleObjects.has(object) || keepObjects.has(object);
        if (!shouldShow) {
          if (!viewportCulledObjects.has(object)) viewportCulledObjects.set(object, object.visible !== false);
          object.visible = false;
          object.__ecommerceCanvasViewportCulled = true;
          hiddenCount += 1;
          return;
        }
        if (viewportCulledObjects.has(object)) {
          object.visible = viewportCulledObjects.get(object) !== false;
          delete object.__ecommerceCanvasViewportCulled;
          viewportCulledObjects.delete(object);
          restoredCount += 1;
        }
      });

      state.canvasBeta.viewportRenderWindow = {
        active: hiddenCount > 0 || viewportCulledObjects.size > 0,
        objectCount,
        visibleCount: visibleEntries.length,
        hiddenCount: viewportCulledObjects.size,
        restoredCount,
        updatedAt: Date.now()
      };
      return state.canvasBeta.viewportRenderWindow;
    }

    function scheduleCanvasViewportRenderWindowRestore(delay = 180) {
      if (viewportRestoreTimer) clearTimeout(viewportRestoreTimer);
      viewportRestoreTimer = window.setTimeout(() => {
        viewportRestoreTimer = 0;
        restoreCanvasViewportRenderWindow({ render: true });
      }, Math.max(60, Number(delay || 180)));
    }

    function ensureCanvasSpatialIndex() {
      const index = state.canvasBeta.spatialIndex;
      if (!index || state.canvasBeta.spatialIndexDirty) return rebuildCanvasSpatialIndex();
      return index;
    }

    function canvasViewportWorldRect(padding = 0) {
      const canvas = state.canvasBeta.canvas;
      const wrap = els.canvasStageWrap;
      if (!canvas || !wrap) return null;
      const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
      const zoom = Math.max(0.01, Number(canvas.getZoom?.() || state.canvasBeta.zoom || 1));
      return {
        left: (0 - Number(vpt[4] || 0)) / zoom - padding,
        top: (0 - Number(vpt[5] || 0)) / zoom - padding,
        right: (wrap.clientWidth - Number(vpt[4] || 0)) / zoom + padding,
        bottom: (wrap.clientHeight - Number(vpt[5] || 0)) / zoom + padding,
        width: wrap.clientWidth / zoom + padding * 2,
        height: wrap.clientHeight / zoom + padding * 2
      };
    }

    function boundsIntersect(a, b) {
      return Boolean(a && b && a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top);
    }

    function canvasVisibleObjectEntries(padding = 640) {
      const index = ensureCanvasSpatialIndex();
      const rect = canvasViewportWorldRect(padding);
      if (!index || !rect) return [];
      const minX = Math.floor(rect.left / index.cellSize);
      const maxX = Math.floor(rect.right / index.cellSize);
      const minY = Math.floor(rect.top / index.cellSize);
      const maxY = Math.floor(rect.bottom / index.cellSize);
      const found = new Map();
      for (let x = minX; x <= maxX; x += 1) {
        for (let y = minY; y <= maxY; y += 1) {
          const list = index.cells.get(`${x}:${y}`) || [];
          list.forEach((entry) => found.set(entry.id, entry));
        }
      }
      index.globalEntries.forEach((entry) => found.set(entry.id, entry));
      return Array.from(found.values()).filter((entry) => boundsIntersect(entry.bounds, rect));
    }

    function beginCanvasRenderSample() {
      renderStartAt = performance.now();
    }

    function endCanvasRenderSample() {
      if (!renderStartAt) return;
      const duration = Math.max(0, performance.now() - renderStartAt);
      renderStartAt = 0;
      const perf = state.canvasBeta.performance || {};
      const samples = Array.isArray(perf.renderSamples) ? perf.renderSamples : [];
      samples.push(duration);
      if (samples.length > maxRenderSamples) samples.splice(0, samples.length - maxRenderSamples);
      const avg = samples.reduce((sum, value) => sum + value, 0) / Math.max(1, samples.length);
      state.canvasBeta.performance = {
        ...perf,
        renderSamples: samples,
        lastRenderMs: duration,
        avgRenderMs: avg
      };
      scheduleCanvasPerformancePanelRender();
    }

    function updateCanvasPerformanceSnapshot() {
      const canvas = state.canvasBeta.canvas;
      const wrap = els.canvasStageWrap;
      const index = ensureCanvasSpatialIndex();
      const visibleEntries = canvasVisibleObjectEntries(640);
      const perf = state.canvasBeta.performance || {};
      const zoom = Number(canvas?.getZoom?.() || state.canvasBeta.zoom || 1);
      const snapshot = {
        objectCount: index?.objectCount || 0,
        imageCount: index?.imageCount || 0,
        hugeImageCount: index?.hugeImageCount || 0,
        visibleCount: visibleEntries.length,
        cellCount: index?.cellCount || 0,
        totalImagePixels: index?.totalImagePixels || 0,
        renderMs: Number(perf.lastRenderMs || 0),
        avgRenderMs: Number(perf.avgRenderMs || 0),
        zoom,
        cameraX: Number(state.canvasBeta.cameraX || 0),
        cameraY: Number(state.canvasBeta.cameraY || 0),
        viewportWidth: Number(wrap?.clientWidth || 0),
        viewportHeight: Number(wrap?.clientHeight || 0),
        culledCount: Number(state.canvasBeta.viewportRenderWindow?.hiddenCount || 0),
        updatedAt: Date.now()
      };
      state.canvasBeta.performance = {
        ...perf,
        snapshot
      };
      return snapshot;
    }

    function formatPixels(value) {
      const num = Number(value || 0);
      if (num >= 100000000) return `${(num / 100000000).toFixed(1)} 亿`;
      if (num >= 10000) return `${(num / 10000).toFixed(1)} 万`;
      return String(Math.round(num));
    }

    function renderCanvasPerformancePanel() {
      const panel = els.canvasPerformancePanel;
      if (!panel || panel.hidden) return;
      const snapshot = updateCanvasPerformanceSnapshot();
      panel.innerHTML = `
        <header>
          <div>
            <b>画布性能</b>
            <span>只读监控</span>
          </div>
          <button type="button" data-canvas-performance-close aria-label="关闭">×</button>
        </header>
        <dl>
          <div><dt>对象</dt><dd>${snapshot.objectCount}</dd></div>
          <div><dt>视野附近</dt><dd>${snapshot.visibleCount}</dd></div>
          <div><dt>图片</dt><dd>${snapshot.imageCount}</dd></div>
          <div><dt>大图</dt><dd>${snapshot.hugeImageCount}</dd></div>
          <div><dt>临时隐藏</dt><dd>${snapshot.culledCount}</dd></div>
          <div><dt>网格</dt><dd>${snapshot.cellCount}</dd></div>
          <div><dt>缩放</dt><dd>${Math.round(snapshot.zoom * 100)}%</dd></div>
          <div><dt>渲染</dt><dd>${snapshot.renderMs.toFixed(1)}ms</dd></div>
          <div><dt>均值</dt><dd>${snapshot.avgRenderMs.toFixed(1)}ms</dd></div>
        </dl>
        <p>相机 ${Math.round(snapshot.cameraX)}, ${Math.round(snapshot.cameraY)} · 视口 ${snapshot.viewportWidth}×${snapshot.viewportHeight}</p>
        <p>图片像素约 ${escapeHtml(formatPixels(snapshot.totalImagePixels))}</p>
      `;
      panel.querySelector("[data-canvas-performance-close]")?.addEventListener("click", () => toggleCanvasPerformancePanel(false));
    }

    function scheduleCanvasPerformancePanelRender() {
      if (!state.canvasBeta.performance?.panelOpen || panelTimer) return;
      panelTimer = window.requestAnimationFrame(() => {
        panelTimer = 0;
        renderCanvasPerformancePanel();
      });
    }

    function toggleCanvasPerformancePanel(force) {
      const panel = els.canvasPerformancePanel;
      if (!panel) return;
      const next = typeof force === "boolean" ? force : panel.hidden;
      panel.hidden = !next;
      state.canvasBeta.performance = {
        ...(state.canvasBeta.performance || {}),
        panelOpen: next
      };
      els.canvasPerformanceToggleBtn?.classList.toggle("active", next);
      els.canvasPerformanceToggleBtn?.setAttribute("aria-pressed", String(next));
      if (next) renderCanvasPerformancePanel();
    }

    function bindCanvasPerformancePanel() {
      if (els.canvasPerformanceToggleBtn && els.canvasPerformanceToggleBtn.dataset.performanceReady !== "1") {
        els.canvasPerformanceToggleBtn.dataset.performanceReady = "1";
        els.canvasPerformanceToggleBtn.addEventListener("click", () => toggleCanvasPerformancePanel());
      }
      window.setInterval(() => {
        if (state.canvasBeta.performance?.panelOpen) renderCanvasPerformancePanel();
      }, 1200);
    }

    return {
      markCanvasSpatialIndexDirty,
      rebuildCanvasSpatialIndex,
      canvasVisibleObjectEntries,
      applyCanvasViewportRenderWindow,
      scheduleCanvasViewportRenderWindowRestore,
      restoreCanvasViewportRenderWindow,
      beginCanvasRenderSample,
      endCanvasRenderSample,
      updateCanvasPerformanceSnapshot,
      renderCanvasPerformancePanel,
      toggleCanvasPerformancePanel,
      bindCanvasPerformancePanel
    };
  };
})();
