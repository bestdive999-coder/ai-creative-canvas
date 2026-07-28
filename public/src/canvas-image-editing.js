(function () {
  const app = window.EcommerceCanvasApp = window.EcommerceCanvasApp || {};

  app.createCanvasImageEditingController = function createCanvasImageEditingController(deps) {
    const {
      els,
      state,
      toast,
      createClientId,
      clampNumber,
      canvasObjectById,
      closestAspectRatioFromSize,
      setAspectRatioValue,
      ensureCanvasObjectId,
      resetCanvasImageAiReferencesForObject,
      updateCanvasObjectToolbar,
      updateCanvasPropsPanel,
      renderCanvasLayers,
      canvasBetaStatus,
      imageUrlToDataUrl,
      insertCanvasAsset,
      createCanvasGenerationPlaceholder,
      replaceCanvasGenerationPlaceholder,
      markCanvasGenerationPlaceholderError,
      removeCanvasGenerationPlaceholder,
      showAiFailureDialog,
      renderCanvasAssets
    } = deps;

    async function startCanvasImageEraseMode(object) {
      const canvas = state.canvasBeta.canvas;
      if (!canvas || !object || object.objectType !== "image") {
        throw new Error("请先选中一张图片。");
      }
      const source = object.srcUrl || object.getSrc?.();
      if (!source) throw new Error("当前图片没有可擦除的源文件。");
      await stopCanvasImageEraseMode({ commit: true, silent: true });
      canvasBetaStatus("正在准备橡皮擦...");
      let dataUrl = source;
      if (!String(dataUrl).startsWith("data:")) {
        dataUrl = await imageUrlToDataUrl(dataUrl).catch(() => source);
      }
      const image = await loadCanvasEditableImage(dataUrl);
      const workCanvas = document.createElement("canvas");
      workCanvas.width = Math.max(1, image.naturalWidth || image.width || Math.round(object.width || 1));
      workCanvas.height = Math.max(1, image.naturalHeight || image.height || Math.round(object.height || 1));
      const ctx = workCanvas.getContext("2d", { willReadFrequently: true });
      ctx.clearRect(0, 0, workCanvas.width, workCanvas.height);
      ctx.drawImage(image, 0, 0, workCanvas.width, workCanvas.height);
      state.canvasBeta.eraseSession = {
        objectId: object.id || (object.id = createClientId()),
        originalSrc: source,
        originalSelectable: object.selectable,
        originalEvented: object.evented,
        workCanvas,
        ctx,
        brushSize: 42,
        drawing: false,
        dirty: false,
        lastPoint: null,
        lastPreviewAt: 0,
        previewQueued: false
      };
      canvas.isDrawingMode = false;
      canvas.selection = false;
      object.set({ selectable: false, evented: true });
      canvas.setActiveObject(object);
      canvas.defaultCursor = "crosshair";
      canvas.requestRenderAll();
      updateCanvasPropsPanel();
      canvasBetaStatus("擦除模式：在图片上拖动擦除。Enter 完成，Esc 取消。");
      toast("擦除模式已开启。");
    }
    
    function loadCanvasEditableImage(source) {
      return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("图片读取失败，无法进入擦除模式。"));
        if (!String(source || "").startsWith("data:")) image.crossOrigin = "anonymous";
        image.src = source;
      });
    }
    
    function canvasErasePointerToPixel(session, pointer) {
      const object = canvasObjectById(session?.objectId);
      if (!object || !pointer || !session?.workCanvas) return null;
      let local = null;
      const point = new fabric.Point(pointer.x, pointer.y);
      if (typeof object.toLocalPoint === "function") {
        local = object.toLocalPoint(point, "left", "top");
      } else if (window.fabric?.util?.invertTransform && typeof object.calcTransformMatrix === "function") {
        local = fabric.util.transformPoint(point, fabric.util.invertTransform(object.calcTransformMatrix()));
      }
      if (!local) return null;
      const objectWidth = Math.max(1, Number(object.width || session.workCanvas.width || 1));
      const objectHeight = Math.max(1, Number(object.height || session.workCanvas.height || 1));
      if (local.x < 0 || local.y < 0 || local.x > objectWidth || local.y > objectHeight) return null;
      const x = clampNumber(local.x / objectWidth * session.workCanvas.width, 0, session.workCanvas.width);
      const y = clampNumber(local.y / objectHeight * session.workCanvas.height, 0, session.workCanvas.height);
      const scaledWidth = Math.max(1, object.getScaledWidth ? object.getScaledWidth() : objectWidth);
      const radius = clampNumber(session.brushSize * session.workCanvas.width / scaledWidth, 3, Math.max(session.workCanvas.width, session.workCanvas.height) * 0.18);
      return { x, y, radius };
    }
    
    function drawCanvasEraseStroke(session, point) {
      if (!session?.ctx || !point) return;
      const ctx = session.ctx;
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = point.radius * 2;
      ctx.beginPath();
      if (session.lastPoint) {
        ctx.moveTo(session.lastPoint.x, session.lastPoint.y);
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
      } else {
        ctx.arc(point.x, point.y, point.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      session.lastPoint = point;
      session.dirty = true;
    }
    
    function queueCanvasErasePreview(session, force = false) {
      if (!session || !session.dirty) return;
      const now = performance.now();
      if (!force && now - Number(session.lastPreviewAt || 0) < 120) return;
      if (session.previewQueued) return;
      session.previewQueued = true;
      window.requestAnimationFrame(async () => {
        session.previewQueued = false;
        session.lastPreviewAt = performance.now();
        const object = canvasObjectById(session.objectId);
        if (!object || state.canvasBeta.eraseSession !== session) return;
        const dataUrl = session.workCanvas.toDataURL("image/png");
        await setFabricImageSource(object, dataUrl).catch((error) => console.warn("擦除预览更新失败", error));
      });
    }
    
    function handleCanvasErasePointer(phase, opt) {
      const session = state.canvasBeta.eraseSession;
      const canvas = state.canvasBeta.canvas;
      if (!session || !canvas) return false;
      opt?.e?.preventDefault?.();
      opt?.e?.stopPropagation?.();
      const pointer = opt?.e ? canvas.getPointer(opt.e) : null;
      if (phase === "down") {
        const point = canvasErasePointerToPixel(session, pointer);
        session.drawing = Boolean(point);
        session.lastPoint = null;
        if (point) {
          drawCanvasEraseStroke(session, point);
          queueCanvasErasePreview(session, true);
        }
        return true;
      }
      if (phase === "move") {
        if (!session.drawing) return true;
        const point = canvasErasePointerToPixel(session, pointer);
        if (point) {
          drawCanvasEraseStroke(session, point);
          queueCanvasErasePreview(session);
        }
        return true;
      }
      if (phase === "up") {
        session.drawing = false;
        session.lastPoint = null;
        queueCanvasErasePreview(session, true);
        return true;
      }
      return true;
    }
    
    function setFabricImageSource(object, source) {
      const canvas = state.canvasBeta.canvas;
      return new Promise((resolve, reject) => {
        if (!object || typeof object.setSrc !== "function") {
          reject(new Error("当前对象不能更新图片源。"));
          return;
        }
        object.setSrc(source, () => {
          object.set({ srcUrl: source, hasAlpha: true });
          object.setCoords?.();
          canvas?.requestRenderAll();
          updateCanvasObjectToolbar();
          renderCanvasLayers();
          resolve(object);
        }, { crossOrigin: "anonymous" });
      });
    }
    
    async function stopCanvasImageEraseMode(options = {}) {
      const session = state.canvasBeta.eraseSession;
      if (!session) return;
      const canvas = state.canvasBeta.canvas;
      const object = canvasObjectById(session.objectId);
      state.canvasBeta.eraseSession = null;
      if (object) {
        object.set({
          selectable: session.originalSelectable !== false,
          evented: session.originalEvented !== false
        });
        if (options.commit && session.dirty) {
          const dataUrl = session.workCanvas.toDataURL("image/png");
          await setFabricImageSource(object, dataUrl).catch(() => {});
          object.set({
            name: object.name || "擦除后图片",
            srcUrl: dataUrl,
            hasAlpha: true
          });
          state.canvasBeta.assets.unshift({
            id: createClientId(),
            name: `${object.name || "图片"}-擦除透明层`,
            url: dataUrl,
            type: "image/png",
            width: session.workCanvas.width,
            height: session.workCanvas.height,
            aspectRatio: closestAspectRatioFromSize(session.workCanvas.width, session.workCanvas.height),
            hasAlpha: true,
            createdAt: new Date().toISOString()
          });
          state.canvasBeta.assetPages = { panel: 0, floating: 0 };
          renderCanvasAssets();
          if (!options.silent) toast("擦除已完成，透明 PNG 已加入素材栏。");
        } else if (!options.commit && object && session.originalSrc) {
          await setFabricImageSource(object, session.originalSrc).catch(() => {});
          if (!options.silent) toast("已取消擦除。");
        }
        canvas?.setActiveObject(object);
      }
      if (canvas) {
        canvas.selection = true;
        canvas.defaultCursor = "default";
        canvas.requestRenderAll();
      }
      updateCanvasPropsPanel();
      if (!options.silent) canvasBetaStatus(options.commit ? "擦除已完成。" : "已取消擦除。");
    }
    
    function prepareCanvasImageExpansion(object) {
      const source = object?.srcUrl || object?.getSrc?.();
      if (!object || object.objectType !== "image" || !source) {
        toast("请先选中一张图片再扩展。");
        return;
      }
      const width = Math.round(object.naturalWidth || object.width || object.getScaledWidth?.() || 0);
      const height = Math.round(object.naturalHeight || object.height || object.getScaledHeight?.() || 0);
      const prompt = `基于图1做扩图/outpaint：保留原主体、产品和风格不变，向画面四周自然扩展背景，补足可用于电商设计排版的留白，不要改变主体比例。`;
      const ratio = closestAspectRatioFromSize(width, height);
      if (ratio) setAspectRatioValue(ratio, { silent: true });
      state.canvasBeta.canvas?.setActiveObject(object);
      state.canvasBeta.imageAiEditorCollapsedForId = "";
      state.canvasBeta.imageAiEditorManualPosition = null;
      resetCanvasImageAiReferencesForObject(ensureCanvasObjectId(object));
      if (els.canvasImageAiPrompt) els.canvasImageAiPrompt.value = prompt;
      updateCanvasObjectToolbar();
      requestAnimationFrame(() => els.canvasImageAiPrompt?.focus());
      canvasBetaStatus("已在图片续改小框中准备扩图提示词。");
      toast("扩图提示已放入图片小框。");
    }
    
    async function removeNearWhiteCanvasImageBackground(object, options = {}) {
      const canvas = state.canvasBeta.canvas;
      if (!canvas || !object || object.objectType !== "image") {
        throw new Error("请先选中一张图片。");
      }
      const source = object.srcUrl || object.getSrc?.();
      if (!source) throw new Error("当前图片没有可处理的源文件。");
      const model = options.model === "isnet-general-use" ? "isnet-general-use" : "u2net";
      const isFine = model === "isnet-general-use";
      const sourceWidth = Math.max(160, Math.round(object.getScaledWidth ? object.getScaledWidth() : Number(object.width || 240)));
      const sourceHeight = Math.max(160, Math.round(object.getScaledHeight ? object.getScaledHeight() : Number(object.height || 240)));
      const placeholderId = await createCanvasGenerationPlaceholder({
        provider: isFine ? "精细抠图" : "移除背景",
        count: 1,
        aspectRatio: closestAspectRatioFromSize(sourceWidth, sourceHeight),
        besideObject: object,
        width: sourceWidth,
        height: sourceHeight,
        title: isFine ? "精细抠图中" : "移除背景中",
        subtitle: "正在生成透明图层"
      });
      const finishTransparentLayer = async (asset, statusText) => {
        state.canvasBeta.assets.unshift(asset);
        state.canvasBeta.assetPages = { panel: 0, floating: 0 };
        renderCanvasAssets();
        if (placeholderId) {
          await replaceCanvasGenerationPlaceholder(placeholderId, [asset]);
        } else {
          await insertCanvasAsset(asset, {
            besideObject: object,
            name: asset.name,
            fitFrame: false
          });
        }
        canvasBetaStatus(statusText);
        toast(statusText);
      };
      const checkerboard = !isFine
        ? await normalizeCheckerboardPreviewToTransparent(source, { name: object.name || "图片" }).catch(() => null)
        : null;
      if (checkerboard?.changed) {
        canvasBetaStatus("正在把棋盘格透明预览转成真正透明...");
        const asset = {
          id: createClientId(),
          name: `${object.name || "图片"}-透明层`,
          url: checkerboard.dataUrl,
          hasAlpha: true,
          type: "image/png"
        };
        await finishTransparentLayer(asset, "已在原图右侧生成透明图层。");
        return;
      }
      try {
        canvasBetaStatus(isFine ? "正在精细抠图并优化边缘..." : "正在用 rembg 移除背景...");
        const response = await fetch("/api/canvas/remove-background", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            url: source,
            name: object.name || "图片",
            id: createClientId(),
            model
          })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.asset) {
          throw new Error(data.error || data.detail || "rembg 抠图失败。");
        }
        const asset = {
          ...data.asset,
          hasAlpha: true,
          type: "image/png"
        };
        asset.name = `${object.name || "图片"}-${isFine ? "精细透明层" : "透明层"}`;
        await finishTransparentLayer(asset, "已在原图右侧生成透明抠图图层。");
        return;
      } catch (error) {
        console.warn("rembg 抠图失败，降级到简单白底清理", error);
        if (isFine) {
          markCanvasGenerationPlaceholderError(placeholderId, error.message || "精细抠图失败");
          canvasBetaStatus("精细抠图失败。");
          toast(error.message || "精细抠图失败。");
          showAiFailureDialog?.(error.message || "精细抠图失败。", { title: "精细抠图失败" });
          return;
        }
        toast(`${error.message || "rembg 抠图失败"}，已尝试简单白底清理。`);
      }
      canvasBetaStatus("正在把大块白底转成透明...");
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("图片读取失败。"));
        if (!String(source).startsWith("data:")) img.crossOrigin = "anonymous";
        img.src = source;
      });
      const width = image.naturalWidth || image.width || 0;
      const height = image.naturalHeight || image.height || 0;
      if (!width || !height) throw new Error("图片尺寸读取失败。");
    
      const workCanvas = document.createElement("canvas");
      workCanvas.width = width;
      workCanvas.height = height;
      const ctx = workCanvas.getContext("2d", { willReadFrequently: true });
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0, width, height);
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      const total = width * height;
      const whiteMask = new Uint8Array(total);
      const visited = new Uint8Array(total);
    
      for (let i = 0, pixel = 0; pixel < total; pixel += 1, i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        if (a > 20 && r >= 238 && g >= 238 && b >= 238 && max - min <= 18) {
          whiteMask[pixel] = 1;
        }
      }
    
      const queue = new Int32Array(total);
      const removeMask = new Uint8Array(total);
      const minArea = Math.max(2600, Math.round(total * 0.004));
      const largeArea = Math.max(12000, Math.round(total * 0.025));
      let removed = 0;
    
      for (let start = 0; start < total; start += 1) {
        if (!whiteMask[start] || visited[start]) continue;
        let head = 0;
        let tail = 0;
        let area = 0;
        let minX = width;
        let maxX = 0;
        let minY = height;
        let maxY = 0;
        queue[tail++] = start;
        visited[start] = 1;
        while (head < tail) {
          const current = queue[head++];
          const x = current % width;
          const y = Math.floor(current / width);
          area += 1;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          const left = current - 1;
          const right = current + 1;
          const up = current - width;
          const down = current + width;
          if (x > 0 && whiteMask[left] && !visited[left]) { visited[left] = 1; queue[tail++] = left; }
          if (x < width - 1 && whiteMask[right] && !visited[right]) { visited[right] = 1; queue[tail++] = right; }
          if (y > 0 && whiteMask[up] && !visited[up]) { visited[up] = 1; queue[tail++] = up; }
          if (y < height - 1 && whiteMask[down] && !visited[down]) { visited[down] = 1; queue[tail++] = down; }
        }
    
        const boxW = maxX - minX + 1;
        const boxH = maxY - minY + 1;
        const isBackgroundBlock = area >= largeArea
          || (area >= minArea && boxW >= width * 0.18 && boxH >= height * 0.12);
        if (!isBackgroundBlock) continue;
        for (let i = 0; i < tail; i += 1) {
          removeMask[queue[i]] = 1;
          removed += 1;
        }
      }
    
      if (!removed) {
        markCanvasGenerationPlaceholderError(placeholderId, "未识别到可去除背景");
        canvasBetaStatus("未找到可安全去除的大块白底。");
        toast("这张图没有识别到大块白底，可能本身就不是透明模板。");
        showAiFailureDialog?.("这张图没有识别到大块白底，可能本身就不是透明模板。", { title: "移除背景失败" });
        return;
      }
    
      for (let pixel = 0, i = 0; pixel < total; pixel += 1, i += 4) {
        if (!removeMask[pixel]) continue;
        data[i + 3] = 0;
      }
      ctx.putImageData(imageData, 0, 0);
      const transparentUrl = workCanvas.toDataURL("image/png");
      const asset = {
        id: createClientId(),
        name: `${object.name || "图片"}-简单透明层`,
        url: transparentUrl,
        hasAlpha: true,
        type: "image/png"
      };
      await finishTransparentLayer(asset, "已在原图右侧生成简单透明图层。");
    }

    return {
      startCanvasImageEraseMode,
      loadCanvasEditableImage,
      canvasErasePointerToPixel,
      drawCanvasEraseStroke,
      queueCanvasErasePreview,
      handleCanvasErasePointer,
      setFabricImageSource,
      stopCanvasImageEraseMode,
      prepareCanvasImageExpansion,
      removeNearWhiteCanvasImageBackground
    };
  };
})();
