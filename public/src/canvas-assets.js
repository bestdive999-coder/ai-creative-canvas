(function () {
  const app = window.EcommerceCanvasApp = window.EcommerceCanvasApp || {};

  app.createCanvasAssetsController = function createCanvasAssetsController(deps) {
    const {
      $,
      $$,
      els,
      state,
      createClientId,
      fileToDataUrl,
      loadImage,
      escapeHtml,
      toast,
      confirmWorkspaceDialog,
      initCanvasBeta,
      loadImageDimensions,
      imageHasTransparentPixels,
      closestAspectRatioFromSize,
      aspectRatioValue,
      canvasBetaStatus,
      selectedCanvasFrame,
      selectedCanvasObject,
      updateCanvasPropsPanel,
      stopCanvasImageEraseMode,
      ensureCanvasHeightForObjects,
      focusCanvasBounds,
      canvasObjectById,
      keepCanvasFramesBehind,
      renderCanvasLayers,
      generationLoadingSpriteUrl,
      generationLoadingSpriteUrls,
      generationLoadingSpriteFrameCount
    } = deps;

    const canvasImagePreviewMaxSide = 1800;
    const canvasImageThumbnailMaxSide = 220;
    const canvasImagePreviewQuality = 0.86;
    const canvasImageThumbnailQuality = 0.78;
    const tr = (key, fallback = "") => window.EcommerceCanvasI18n?.t(key, fallback) || fallback || key;

    function fabricImageFromUrl(url, callback) {
      const ImageClass = window.fabric?.FabricImage || window.fabric?.Image;
      if (!ImageClass?.fromURL) {
        callback(null);
        return;
      }
      const major = Number.parseInt(String(window.fabric?.version || "5").split(".")[0], 10);
      if (Number.isFinite(major) && major >= 6) {
        ImageClass.fromURL(url).then(callback).catch(() => callback(null));
        return;
      }
      ImageClass.fromURL(url, callback);
    }

    function canvasImageVariantMime(source, hasAlpha) {
      if (hasAlpha) return "image/png";
      const text = String(source || "").slice(0, 80).toLowerCase();
      if (text.includes("image/png") && hasAlpha) return "image/png";
      return "image/jpeg";
    }

    async function createCanvasImageVariant(source, options = {}) {
      const maxSide = Math.max(1, Number(options.maxSide || canvasImagePreviewMaxSide));
      const image = await loadImage(source);
      const naturalWidth = Math.max(1, Number(image.naturalWidth || image.width || 1));
      const naturalHeight = Math.max(1, Number(image.naturalHeight || image.height || 1));
      const largestSide = Math.max(naturalWidth, naturalHeight);
      const scale = Math.min(1, maxSide / largestSide);
      if (!options.force && scale >= 0.999) {
        return {
          url: source,
          width: naturalWidth,
          height: naturalHeight
        };
      }
      const targetWidth = Math.max(1, Math.round(naturalWidth * scale));
      const targetHeight = Math.max(1, Math.round(naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext("2d", { alpha: Boolean(options.hasAlpha) });
      if (!options.hasAlpha) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, targetWidth, targetHeight);
      } else {
        ctx.clearRect(0, 0, targetWidth, targetHeight);
      }
      ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
      return {
        url: canvas.toDataURL(canvasImageVariantMime(source, options.hasAlpha), Number(options.quality || canvasImagePreviewQuality)),
        width: targetWidth,
        height: targetHeight
      };
    }

    async function buildCanvasAssetVariants(source, asset = {}) {
      const variants = {
        originalUrl: source,
        previewUrl: source,
        thumbnailUrl: source,
        previewWidth: Number(asset.width || 0),
        previewHeight: Number(asset.height || 0)
      };
      if (!source) return variants;
      try {
        const preview = await createCanvasImageVariant(source, {
          maxSide: canvasImagePreviewMaxSide,
          hasAlpha: Boolean(asset.hasAlpha),
          quality: canvasImagePreviewQuality
        });
        variants.previewUrl = preview.url || source;
        variants.previewWidth = preview.width || variants.previewWidth;
        variants.previewHeight = preview.height || variants.previewHeight;
      } catch (error) {
        console.warn("Canvas preview generation failed", error);
      }
      try {
        const thumbnail = await createCanvasImageVariant(source, {
          maxSide: canvasImageThumbnailMaxSide,
          hasAlpha: Boolean(asset.hasAlpha),
          quality: canvasImageThumbnailQuality,
          force: true
        });
        variants.thumbnailUrl = thumbnail.url || variants.previewUrl || source;
      } catch (error) {
        console.warn("Canvas thumbnail generation failed", error);
        variants.thumbnailUrl = variants.previewUrl || source;
      }
      return variants;
    }

    function canvasAssetPreviewSource(asset) {
      return asset?.thumbnailUrl || asset?.previewUrl || asset?.url || "";
    }

    async function handleCanvasAssetInput(event) {
      const input = event.target;
      try {
        await initCanvasBeta();
        const files = Array.from(input?.files || []);
        const canvas = state.canvasBeta.canvas;
        const hasPlacedContent = Boolean(canvas?.getObjects?.().some((object) => (
          object?.objectType !== "frame" && object?.visible !== false
        )));
        const uploadOptions = {
          autoInsert: true,
          focusOnCanvas: true,
          focusBehavior: "auto"
        };
        if (!hasPlacedContent) uploadOptions.centerPoint = canvasViewportCenterPoint();
        await importCanvasAssetFiles(files, uploadOptions);
      } finally {
        if (input) input.value = "";
      }
    }
    
    async function importCanvasAssetFiles(files, options = {}) {
      const fileList = Array.from(files || []);
      const imageFileCount = fileList.length;
      const batchLayout = imageFileCount > 1
        ? createCanvasAssetBatchLayout({
            ...options,
            startPoint: options.startPoint || options.point || null,
            maxColumns: options.maxColumns || 2,
            layoutGap: options.layoutGap || 72
          })
        : null;
      const insertedObjects = [];
      let imageIndex = 0;
      const failedFiles = [];
      for (const [index, file] of fileList.entries()) {
        try {
          const dataUrl = await fileToDataUrl(file);
          const dimensions = await loadImageDimensions(dataUrl).catch(() => null);
          const isPng = /^image\/png/i.test(file.type || "") || /\.png$/i.test(file.name || "");
          const hasAlpha = isPng && await imageHasTransparentPixels(dataUrl).catch(() => false);
          const asset = await addCanvasAsset({
            name: file.name,
            dataUrl,
            type: file.type || "",
            width: dimensions?.width || 0,
            height: dimensions?.height || 0,
            aspectRatio: closestAspectRatioFromSize(dimensions?.width, dimensions?.height),
            hasAlpha,
            preserveLocal: hasAlpha
          });
          if (options.autoInsert !== false) {
            const displaySize = initialAssetDisplaySize(asset.width, asset.height, {
              initialMaxWidth: options.initialMaxWidth || 1440,
              initialMaxHeight: options.initialMaxHeight || 980
            });
            const centerPoint = options.centerPoint
              ? { x: Number(options.centerPoint.x ?? options.centerPoint.left), y: Number(options.centerPoint.y ?? options.centerPoint.top) }
              : null;
            const point = batchLayout
              ? batchLayout.next(displaySize)
              : centerPoint && Number.isFinite(centerPoint.x) && Number.isFinite(centerPoint.y)
                ? { x: centerPoint.x - displaySize.width / 2, y: centerPoint.y - displaySize.height / 2 }
                : options.point
                ? { x: Number(options.point.x ?? options.point.left), y: Number(options.point.y ?? options.point.top) }
                : undefined;
            const insertedObject = await insertCanvasAsset(asset, {
              point,
              stagger: true,
              staggerIndex: imageIndex,
              autoArrange: !point,
              focusOnCanvas: false,
              initialMaxWidth: options.initialMaxWidth || 1440,
              initialMaxHeight: options.initialMaxHeight || 980
            });
            insertedObjects.push(insertedObject);
          }
        } catch (error) {
          console.error(error);
          failedFiles.push(file?.name || `第 ${index + 1} 张图片`);
          toast(`${file?.name || `第 ${index + 1} 张图片`} 上传失败：${error?.message || "请换一张图片重试"}`);
        } finally {
          imageIndex += 1;
        }
      }
      if (failedFiles.length) {
        canvasBetaStatus(`有 ${failedFiles.length} 个文件上传失败，其余文件已继续处理。`);
      }
      if (options.focusOnCanvas === true && insertedObjects.length) {
        focusCanvasObjectList(insertedObjects, {
          padding: Number(options.focusPadding || 180),
          behavior: options.focusBehavior || "smooth"
        });
      }
    }

    async function addCanvasAsset(input, options = {}) {
      const sourceUrl = input.originalUrl || input.originalSrcUrl || input.dataUrl || input.url || "";
      const localAsset = {
        id: createClientId(),
        name: input.name || "素材",
        url: sourceUrl,
        originalUrl: sourceUrl,
        type: input.type || "",
        width: Number(input.width || 0),
        height: Number(input.height || 0),
        aspectRatio: input.aspectRatio || closestAspectRatioFromSize(input.width, input.height),
        hasAlpha: Boolean(input.hasAlpha),
        sourceWorkflow: input.sourceWorkflow || "",
        createdAt: new Date().toISOString()
      };
      Object.assign(localAsset, await buildCanvasAssetVariants(sourceUrl, localAsset));
      if (input.preserveLocal || options.preserveLocal || localAsset.hasAlpha) {
        state.canvasBeta.assets.unshift(localAsset);
        resetCanvasAssetPages();
        renderCanvasAssets();
        if (options.status !== false) {
          canvasBetaStatus(localAsset.hasAlpha
            ? "PNG 已按原始文件加入素材栏，检测到透明通道，透明区域会保留。"
            : "PNG 已按原始文件加入素材栏，但未检测到透明像素。");
        }
        return localAsset;
      }
      try {
        const response = await fetch("/api/canvas/assets/upload", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(localAsset)
        });
        const data = await response.json();
        if (response.ok && data.asset) {
          state.canvasBeta.assets.unshift({
            ...localAsset,
            ...data.asset,
            url: data.asset.url || localAsset.url,
            originalUrl: data.asset.url || localAsset.originalUrl || localAsset.url,
            width: localAsset.width,
            height: localAsset.height,
            aspectRatio: localAsset.aspectRatio,
            hasAlpha: localAsset.hasAlpha,
            sourceWorkflow: localAsset.sourceWorkflow,
            previewUrl: localAsset.previewUrl,
            thumbnailUrl: localAsset.thumbnailUrl,
            previewWidth: localAsset.previewWidth,
            previewHeight: localAsset.previewHeight
          });
        } else {
          state.canvasBeta.assets.unshift(localAsset);
        }
      } catch {
        state.canvasBeta.assets.unshift(localAsset);
      }
      resetCanvasAssetPages();
      renderCanvasAssets();
      if (options.status !== false) {
        canvasBetaStatus("素材已加入素材栏，可点击或拖入画布。");
      }
      return state.canvasBeta.assets[0];
    }
    
    function setCanvasToolModeUi(mode = "select") {
      const normalized = ["select", "pan", "pencil", "pen"].includes(mode) ? mode : "select";
      state.canvasBeta.toolMode = normalized;
      state.canvasBeta.panMode = normalized === "pan";
      const activeMainButton = ["pencil", "pen"].includes(normalized) ? els.canvasDrawToolBtn : els.canvasSelectBtn;
      $$(".studio-left-toolbar .studio-tool").forEach((button) => {
        button.classList.toggle("active", button === activeMainButton);
      });
      $$("[data-tool-mode]").forEach((button) => {
        button.classList.toggle("active", button.dataset.toolMode === normalized);
      });
      const labelMap = {
        select: "选择",
        pan: "平移",
        pencil: "铅笔",
        pen: "钢笔"
      };
      if (els.canvasSelectBtn && ["select", "pan"].includes(normalized)) {
        const label = labelMap[normalized] || labelMap.select;
        els.canvasSelectBtn.title = label;
        els.canvasSelectBtn.dataset.tooltip = label;
      }
    }

    async function activateCanvasSelectTool() {
      await initCanvasBeta();
      const canvas = state.canvasBeta.canvas;
      if (!canvas) return;
      await stopCanvasImageEraseMode({ commit: true, silent: true });
      setCanvasToolModeUi("select");
      canvas.isDrawingMode = false;
      canvas.selection = true;
      canvas.skipTargetFind = false;
      canvas.defaultCursor = "default";
      canvas.hoverCursor = "move";
      canvasBetaStatus("选择工具已开启，可移动、缩放和旋转画布元素。");
    }
    
    async function activateCanvasToolMode(mode) {
      await initCanvasBeta();
      const canvas = state.canvasBeta.canvas;
      if (!canvas) return;
      if (mode === "select") {
        activateCanvasSelectTool();
        return;
      }
      if (mode === "pan") {
        await stopCanvasImageEraseMode({ commit: true, silent: true });
        setCanvasToolModeUi("pan");
        canvas.isDrawingMode = false;
        canvas.selection = false;
        canvas.skipTargetFind = true;
        canvas.defaultCursor = "grab";
        canvas.hoverCursor = "grab";
        window.setTimeout(() => canvasBetaStatus("平移画布已开启：按住左键拖动空白处即可移动视图。"), 0);
        canvasBetaStatus("平移画布：按住 Alt 或鼠标中键拖动画布。");
        return;
      }
      if (mode === "pencil") {
        await stopCanvasImageEraseMode({ commit: true, silent: true });
        setCanvasToolModeUi("pencil");
        canvas.isDrawingMode = true;
        canvas.skipTargetFind = false;
        canvas.freeDrawingBrush.width = 4;
        canvas.freeDrawingBrush.color = "#111827";
        canvasBetaStatus("铅笔工具已开启，可在画布上自由绘制。");
        return;
      }
      if (mode === "pen") {
        await stopCanvasImageEraseMode({ commit: true, silent: true });
        setCanvasToolModeUi("pen");
        canvas.isDrawingMode = true;
        canvas.skipTargetFind = false;
        canvas.freeDrawingBrush.width = 2.4;
        canvas.freeDrawingBrush.color = "#0f766e";
        canvas.freeDrawingBrush.decimate = 2;
        canvasBetaStatus("钢笔路径已开启：绘制后会生成可移动、缩放和改名的矢量路径。");
        return;
      }
    }
    
    async function imageUrlToDataUrl(url) {
      const source = String(url || "").trim();
      if (source.startsWith("data:")) return source;
      if (!source) throw new Error("图片素材地址为空，无法加入画布。");
      const response = await fetch(source, { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error("图片素材读取失败，无法加入画布。");
      const blob = await response.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }
    
    function autoInsertGeneratedImagesToCanvas(images, options = {}) {
      const list = Array.isArray(images) ? images.filter(Boolean) : [];
      if (!list.length) return;
      (async () => {
        await initCanvasBeta();
        const verticalLayout = options.layoutMode === "vertical";
        canvasBetaStatus(verticalLayout ? "详情页单屏正在按顺序放入画布..." : "AI 结果正在自动放入画布...");
        let inserted = 0;
        const layout = createCanvasAssetBatchLayout({
          anchorObject: canvasObjectById(state.canvasBeta.lastAiInsertedObjectId) || null,
          maxColumns: verticalLayout ? 1 : 2,
          layoutGap: 72,
          continueFromAnchor: true
        });
        const insertedObjects = [];
        for (let index = 0; index < list.length; index += 1) {
          try {
            const displaySize = initialAssetDisplaySize(list[index].width, list[index].height, {
              initialMaxWidth: 1440,
              initialMaxHeight: 980
            });
            const result = await addAiImageToCanvasAssets(list[index], {
              silent: true,
              status: false,
              point: layout.next(displaySize),
              staggerIndex: index,
              fitFrame: false,
              focusOnCanvas: false,
              initialMaxWidth: 1440,
              initialMaxHeight: 980
            });
            if (result?.object) insertedObjects.push(result.object);
            inserted += 1;
          } catch (error) {
            console.error(error);
          }
        }
        if (insertedObjects.length) {
          focusCanvasObjectList(insertedObjects, { padding: 180, behavior: "smooth" });
        }
        canvasBetaStatus(inserted
          ? verticalLayout
            ? `已自动把 ${inserted} 张详情页单屏按顺序放入画布。`
            : `已自动把 ${inserted} 张 AI 结果放入画布。`
          : "AI 结果自动加入画布失败，可在对话结果里手动加入。");
      })().catch((error) => {
        console.error(error);
        canvasBetaStatus("AI 结果自动加入画布失败，可在对话结果里手动加入。");
      });
    }

    function rememberAiInsertedObject(object) {
      if (!object) return;
      if (!object.id) object.id = createClientId();
      object.isAiGenerated = true;
      state.canvasBeta.lastAiInsertedObjectId = object.id;
    }

    function rememberCanvasInsertedObject(object) {
      if (!object) return;
      if (!object.id) object.id = createClientId();
      state.canvasBeta.lastCanvasInsertedObjectId = object.id;
    }

    function canvasInsertPlacementAnchor(options = {}) {
      if (
        options.point ||
        options.fitFrame ||
        options.besideObject ||
        options.matchObject ||
        options.placeAfterObject ||
        options.autoArrange === false
      ) return null;
      const canvas = state.canvasBeta.canvas;
      if (!canvas) return null;
      const explicit = options.placementAnchor || null;
      if (explicit && canvas.getObjects().includes(explicit)) return explicit;
      const last = canvasObjectById(state.canvasBeta.lastCanvasInsertedObjectId);
      if (last && last.visible !== false && canvas.getObjects().includes(last)) return last;
      const selected = selectedCanvasObject?.();
      if (selected && selected.objectType !== "frame" && selected.visible !== false && canvas.getObjects().includes(selected)) return selected;
      return [...canvas.getObjects()].reverse().find((object) => object?.objectType !== "frame" && object?.visible !== false) || null;
    }

    function aiInsertPlacementAnchor(options = {}) {
      if (options.point || options.fitFrame || options.besideObject || options.matchObject || options.autoArrange === false) return null;
      const canvas = state.canvasBeta.canvas;
      if (!canvas) return null;
      const explicit = options.placementAnchor || options.placeAfterObject || null;
      if (explicit && canvas.getObjects().includes(explicit)) return explicit;
      const last = canvasObjectById(state.canvasBeta.lastAiInsertedObjectId);
      if (!last || last.visible === false || !canvas.getObjects().includes(last)) return null;
      return last;
    }

    function restoreGenerationInsertionTail(excludedId = "") {
      const canvas = state.canvasBeta.canvas;
      const next = (canvas?.getObjects?.() || [])
        .filter((object) => object?.id !== excludedId && Number(object?.generationInsertionSequence || 0) > 0)
        .sort((a, b) => Number(b.generationInsertionSequence || 0) - Number(a.generationInsertionSequence || 0))[0] || null;
      const fallback = next || canvasObjectById(state.canvasBeta.lastAiInsertedObjectId);
      state.canvasBeta.generationInsertionTailId = fallback?.id || "";
      return fallback;
    }

    function generationPlaceholderPlacementAnchor(options = {}) {
      const canvas = state.canvasBeta.canvas;
      if (!canvas) return null;
      const tail = canvasObjectById(state.canvasBeta.generationInsertionTailId);
      if (tail && tail.visible !== false && canvas.getObjects().includes(tail)) return tail;
      return restoreGenerationInsertionTail() || aiInsertPlacementAnchor(options);
    }
    
    async function createCanvasGenerationPlaceholder(options = {}) {
      if (!window.fabric || !els.designCanvas) return "";
      await initCanvasBeta();
      const canvas = state.canvasBeta.canvas;
      if (!canvas) return "";
      const id = createClientId();
      const ratio = aspectRatioValue(options.aspectRatio || els.aspectRatio?.value || "1:1") || 1;
      const maxSide = 360;
      const minSide = 210;
      const explicitWidth = Math.round(Number(options.width || 0));
      const explicitHeight = Math.round(Number(options.height || 0));
      const width = explicitWidth > 0 ? explicitWidth : (ratio >= 1 ? maxSide : Math.max(minSide, Math.round(maxSide * ratio)));
      const height = explicitHeight > 0 ? explicitHeight : (ratio >= 1 ? Math.max(minSide, Math.round(maxSide / ratio)) : maxSide);
      const card = new fabric.Rect({
        left: 0,
        top: 0,
        width,
        height,
        rx: 0,
        ry: 0,
        fill: "rgba(255,255,255,0)",
        stroke: "rgba(255,255,255,0)",
        strokeWidth: 0,
        generationCard: true
      });
      const centerX = width / 2;
      const waveWidth = width;
      const waveHeight = height;
      const waveLeft = 0;
      const waveTop = 0;
      const wash = new fabric.Rect({
        left: 0,
        top: 0,
        width,
        height,
        rx: 0,
        ry: 0,
        fill: "rgba(240,249,255,0.72)",
        stroke: "rgba(255,255,255,0)",
        strokeWidth: 0,
        generationWash: true
      });
      const horizon = new fabric.Rect({
        left: 0,
        top: Math.round(height * 0.54),
        width,
        height: Math.max(1, height - Math.round(height * 0.54)),
        fill: "rgba(56,189,248,0.10)",
        selectable: false,
        evented: false
      });
      const makeWave = (offsetY, fill, opacity, phase) => {
        const baseY = Math.round(height * offsetY);
        const path = `M 0 ${baseY} C ${Math.round(width * 0.18)} ${baseY - 24}, ${Math.round(width * 0.34)} ${baseY + 20}, ${Math.round(width * 0.52)} ${baseY} S ${Math.round(width * 0.82)} ${baseY - 22}, ${width} ${baseY + 5} L ${width} ${height} L 0 ${height} Z`;
        const wave = new fabric.Path(path, {
          left: 0,
          top: 0,
          fill,
          opacity,
          selectable: false,
          evented: false
        });
        wave.generationLoading = phase;
        wave.waveBaseLeft = 0;
        wave.waveBaseOpacity = opacity;
        return wave;
      };
      const waveBack = makeWave(0.68, "#bae6fd", 0.78, 0);
      const waveMid = makeWave(0.58, "#67e8f9", 0.66, 1);
      const waveFront = makeWave(0.48, "#38bdf8", 0.58, 2);
      const glint = new fabric.Circle({
        left: Math.round(width * 0.68),
        top: Math.round(height * 0.62),
        radius: Math.max(8, Math.min(18, Math.round(Math.min(width, height) * 0.045))),
        fill: "rgba(255,255,255,0.58)",
        stroke: "rgba(255,255,255,0.38)",
        strokeWidth: 1,
        generationLoading: 3,
        waveBaseLeft: Math.round(width * 0.68),
        waveBaseOpacity: 0.58
      });
      const waveSprite = await createGenerationLoadingSprite({
        left: waveLeft,
        top: waveTop,
        width: waveWidth,
        height: waveHeight
      });
      const waveVisuals = waveSprite
        ? [wash, waveSprite]
        : [wash, horizon, waveBack, waveMid, waveFront, glint];
      const explicitPoint = options.point && Number.isFinite(Number(options.point.x ?? options.point.left)) && Number.isFinite(Number(options.point.y ?? options.point.top))
        ? { left: Number(options.point.x ?? options.point.left), top: Number(options.point.y ?? options.point.top) }
        : null;
      const anchorObject = explicitPoint ? null : (options.besideObject || options.anchorObject || generationPlaceholderPlacementAnchor(options));
      const point = explicitPoint || (anchorObject
        ? canvasPointBesideObject(anchorObject, { width, height, gap: Number(options.gap || 72) })
        : canvasInsertPoint({ stagger: true, width, height }));
      const generationInsertionSequence = Math.max(0, Number(state.canvasBeta.generationInsertionSequence || 0)) + 1;
      state.canvasBeta.generationInsertionSequence = generationInsertionSequence;
      const overlayHeight = Math.max(34, Math.min(52, Math.round(height * 0.16)));
      const overlayTop = height - overlayHeight;
      const statusWash = new fabric.Rect({
        left: 0,
        top: overlayTop,
        width,
        height: overlayHeight,
        fill: "rgba(255,255,255,0.62)",
        selectable: false,
        evented: false
      });
      const subtitle = new fabric.Textbox(options.subtitle || `${options.provider || "AI"} ${Number(options.count || 1) > 1 ? `正在生成 ${options.count} 张` : "正在生成"}`, {
        left: 14,
        top: overlayTop + 8,
        width: width - 28,
        fill: "#172033",
        fontSize: 11,
        fontWeight: "850",
        textAlign: "center",
        fontFamily: app.canvasSystemFontFamily || "system-ui, sans-serif",
        generationText: true
      });
      const progressWidth = Math.max(72, width - 52);
      const progressLeft = Math.round((width - progressWidth) / 2);
      const progressTop = overlayTop + overlayHeight - 12;
      const progressTrack = new fabric.Rect({
        left: progressLeft,
        top: progressTop,
        width: progressWidth,
        height: 3,
        rx: 1.5,
        ry: 1.5,
        fill: "rgba(148,163,184,0.28)",
        selectable: false,
        evented: false
      });
      const progressFill = new fabric.Rect({
        left: progressLeft,
        top: progressTop,
        width: Math.max(24, Math.round(progressWidth * 0.22)),
        height: 3,
        rx: 1.5,
        ry: 1.5,
        fill: "rgba(14,165,233,0.72)",
        selectable: false,
        evented: false,
        generationProgressFill: true,
        progressBaseLeft: progressLeft,
        progressBaseWidth: progressWidth
      });
      const dotY = Math.max(14, Math.min(34, Math.round(height * 0.09)));
      const dotA = new fabric.Circle({ left: centerX - 15, top: dotY, radius: 2.4, fill: "#0ea5e9", opacity: 0.45, generationDot: 0 });
      const dotB = new fabric.Circle({ left: centerX - 2, top: dotY, radius: 2.4, fill: "#38bdf8", opacity: 0.45, generationDot: 1 });
      const dotC = new fabric.Circle({ left: centerX + 11, top: dotY, radius: 2.4, fill: "#7dd3fc", opacity: 0.45, generationDot: 2 });
      const group = new fabric.Group([card, ...waveVisuals, statusWash, subtitle, progressTrack, progressFill, dotA, dotB, dotC], {
        left: point.left,
        top: point.top,
        id,
        name: "AI 正在生成",
        objectType: "generation-placeholder",
        selectable: false,
        evented: false,
        placeholderWidth: width,
        placeholderHeight: height,
        generationInsertionSequence
      });
      canvas.add(group);
      state.canvasBeta.generationInsertionTailId = id;
      canvas.discardActiveObject();
      canvas.requestRenderAll();
      ensureCanvasHeightForObjects();
      focusInsertedCanvasObject(group, {
        focusOnCanvas: options.focusOnCanvas !== false,
        focusPadding: Number(options.focusPadding || 180),
        focusBehavior: options.focusBehavior || "auto"
      });
      state.canvasBeta.activeGenerationPlaceholderId = id;
      startCanvasGenerationPlaceholderTimer(id);
      updateCanvasPropsPanel();
      renderCanvasLayers();
      return id;
    }
    
    async function createGenerationLoadingSprite(bounds) {
      if (!window.fabric) return null;
      const targetWidth = Math.max(1, Number(bounds.width || 1));
      const targetHeight = Math.max(1, Number(bounds.height || 1));
      const targetRatio = targetWidth / targetHeight;
      const ratioEntries = Object.entries(generationLoadingSpriteUrls || {});
      const matchedRatio = ratioEntries.reduce((best, entry) => {
        const [width, height] = entry[0].split(":").map(Number);
        const distance = Math.abs(width / height - targetRatio);
        return !best || distance < best.distance ? { url: entry[1], distance } : best;
      }, null);
      const spriteUrl = matchedRatio?.url || generationLoadingSpriteUrl;
      return await new Promise((resolve) => {
        fabricImageFromUrl(spriteUrl, (image) => {
          if (!image) {
            resolve(null);
            return;
          }
          const sourceWidth = Number(image.width || 0);
          const sourceHeight = Number(image.height || 0);
          const frameWidth = sourceWidth / generationLoadingSpriteFrameCount;
          if (!sourceWidth || !sourceHeight || !Number.isFinite(frameWidth) || frameWidth <= 0) {
            resolve(null);
            return;
          }
          image.set({
            left: Number(bounds.left || 0),
            top: Number(bounds.top || 0),
            cropX: 0,
            cropY: 0,
            width: frameWidth,
            height: sourceHeight,
            scaleX: targetWidth / frameWidth,
            scaleY: targetHeight / sourceHeight,
            selectable: false,
            evented: false,
            objectCaching: false,
            generationSprite: true,
            generationSpriteFrames: generationLoadingSpriteFrameCount,
            generationSpriteFrameWidth: frameWidth
          });
          resolve(image);
        }, { crossOrigin: "anonymous" });
      }).catch(() => null);
    }
    
    function startCanvasGenerationPlaceholderTimer(id) {
      clearCanvasGenerationPlaceholderTimer(id);
      let step = 0;
      state.canvasBeta.generationPlaceholderTimers[id] = window.setInterval(() => {
        const group = canvasObjectById(id);
        const canvas = state.canvasBeta.canvas;
        if (!group || !canvas) {
          clearCanvasGenerationPlaceholderTimer(id);
          return;
        }
        group.getObjects?.()
          .filter((object) => object.generationSprite)
          .forEach((sprite) => {
            const frames = Math.max(1, Number(sprite.generationSpriteFrames || generationLoadingSpriteFrameCount));
            const frameWidth = Number(sprite.generationSpriteFrameWidth || 0);
            if (frameWidth > 0) sprite.set("cropX", (step % frames) * frameWidth);
          });
        group.getObjects?.()
          .filter((object) => Number.isFinite(object.generationDot))
          .forEach((dot) => {
            dot.set("opacity", dot.generationDot === step % 3 ? 1 : 0.35);
          });
        group.getObjects?.()
          .filter((object) => Number.isFinite(object.generationLoading))
          .forEach((wave) => {
            const phase = (step + wave.generationLoading * 3) / 3.4;
            const baseLeft = Number(wave.waveBaseLeft || 0);
            wave.set({
              left: baseLeft + Math.sin(phase) * 18,
              opacity: Math.max(0.24, Math.min(0.8, Number(wave.waveBaseOpacity || wave.opacity || 0.4) + Math.cos(phase) * 0.04))
            });
          });
        group.getObjects?.()
          .filter((object) => object.generationProgressFill && !Number(object.generationProgressPercent || 0))
          .forEach((bar) => {
            const baseLeft = Number(bar.progressBaseLeft || bar.left || 0);
            const baseWidth = Math.max(1, Number(bar.progressBaseWidth || bar.width || 1));
            const fillWidth = Math.max(26, Math.round(baseWidth * 0.22));
            const phase = (step % 18) / 18;
            bar.set({
              left: baseLeft + Math.max(0, baseWidth - fillWidth) * phase,
              width: fillWidth,
              opacity: 0.34 + Math.sin(phase * Math.PI) * 0.28
            });
          });
        step += 1;
        canvas.requestRenderAll();
      }, 360);
    }
    
    function clearCanvasGenerationPlaceholderTimer(id) {
      const timers = state.canvasBeta.generationPlaceholderTimers || {};
      if (id && timers[id]) {
        window.clearInterval(timers[id]);
        delete timers[id];
      }
    }

    function restoreActiveCanvasGenerationPlaceholder(excludedId = "") {
      const canvas = state.canvasBeta.canvas;
      const next = [...(canvas?.getObjects?.() || [])].reverse().find((object) => (
        object?.objectType === "generation-placeholder" && object?.id !== excludedId
      ));
      state.canvasBeta.activeGenerationPlaceholderId = next?.id || "";
    }
    
    function updateCanvasGenerationPlaceholderProgress(progress = {}, placeholderId = "") {
      const id = String(placeholderId || state.canvasBeta.activeGenerationPlaceholderId || "");
      const group = canvasObjectById(id);
      const canvas = state.canvasBeta.canvas;
      if (!group || !canvas) return;
      const text = group.getObjects?.().find((object) => object.generationText);
      const progressFill = group.getObjects?.().find((object) => object.generationProgressFill);
      const percent = Math.max(0, Math.min(100, Math.round(Number(progress.percent || 0))));
      const message = progress.message || (progress.status === "queued" ? "排队中" : "正在生成画面");
      if (text) text.set("text", percent ? `${message} · ${percent}%` : message);
      if (progressFill) {
        const baseLeft = Number(progressFill.progressBaseLeft || progressFill.left || 0);
        const baseWidth = Math.max(1, Number(progressFill.progressBaseWidth || progressFill.width || 1));
        progressFill.generationProgressPercent = percent;
        if (percent) {
          progressFill.set({
            left: baseLeft,
            width: Math.max(8, Math.round(baseWidth * percent / 100)),
            opacity: 0.82
          });
        }
      }
      canvas.requestRenderAll();
    }
    
    async function replaceCanvasGenerationPlaceholder(placeholderId, images = []) {
      const list = Array.isArray(images) ? images.filter(Boolean) : [];
      if (!placeholderId || !list.length) return list;
      const canvas = state.canvasBeta.canvas;
      const placeholder = canvasObjectById(placeholderId);
      if (!canvas || !placeholder) return list;
      const generationInsertionSequence = Number(placeholder.generationInsertionSequence || 0);
      const first = list[0];
      const imageUrl = first.url || first.image_file || "";
      if (!imageUrl) return list;
      try {
        let dataUrl = imageUrl;
        if (!String(dataUrl).startsWith("data:")) dataUrl = await imageUrlToDataUrl(dataUrl);
        const originalUrl = String(imageUrl).startsWith("data:") ? dataUrl : imageUrl;
        const hasAlpha = Boolean(first.hasAlpha) || await imageHasTransparentPixels(dataUrl).catch(() => false);
        const variants = await buildCanvasAssetVariants(dataUrl, {
          width: first.width,
          height: first.height,
          hasAlpha
        });
        const displayUrl = variants.previewUrl || dataUrl;
        await new Promise((resolve, reject) => {
          fabricImageFromUrl(displayUrl, (image) => {
            if (!image) {
              reject(new Error("生成图加载失败"));
              return;
            }
            const bounds = placeholder.getBoundingRect(true, true);
            clearCanvasGenerationPlaceholderTimer(placeholderId);
            canvas.remove(placeholder);
            const replacesInsertionTail = state.canvasBeta.generationInsertionTailId === placeholderId;
            image.set({
              left: bounds.left,
              top: bounds.top,
              name: first.name || "AI 生图",
              objectType: "image",
              srcUrl: originalUrl,
              originalSrcUrl: originalUrl,
              previewUrl: displayUrl,
              thumbnailUrl: variants.thumbnailUrl || displayUrl,
              previewWidth: Number(variants.previewWidth || image.width || 0),
              previewHeight: Number(variants.previewHeight || image.height || 0),
              id: createClientId(),
              hasAlpha,
              naturalWidth: Number(first.width || image.width || 0),
              naturalHeight: Number(first.height || image.height || 0),
              aspectRatio: first.aspectRatio || closestAspectRatioFromSize(first.width || image.width, first.height || image.height),
              generationInsertionSequence
            });
            fitCanvasImageForInitialInsert(image, {
              initialMaxWidth: 1440,
              initialMaxHeight: 980,
              naturalWidth: Number(first.width || image.width || 1),
              naturalHeight: Number(first.height || image.height || 1)
            });
            canvas.add(image);
            rememberAiInsertedObject(image);
            rememberCanvasInsertedObject(image);
            if (replacesInsertionTail) state.canvasBeta.generationInsertionTailId = image.id;
            canvas.setActiveObject(image);
            keepCanvasFramesBehind();
            canvas.requestRenderAll();
            ensureCanvasHeightForObjects();
            focusInsertedCanvasObject(image, { focusOnCanvas: true, focusBehavior: "smooth" });
            updateCanvasPropsPanel();
            renderCanvasLayers();
            resolve();
          }, { crossOrigin: "anonymous" });
        });
        if (state.canvasBeta.activeGenerationPlaceholderId === placeholderId) {
          restoreActiveCanvasGenerationPlaceholder(placeholderId);
        }
        canvasBetaStatus("AI 图片已生成，并自动放入画布。");
        return list.slice(1);
      } catch (error) {
        console.error(error);
        removeCanvasGenerationPlaceholder(placeholderId, { status: "生成图加载失败，占位已清理。" });
        return list;
      }
    }
    
    function removeCanvasGenerationPlaceholder(placeholderId, options = {}) {
      const group = canvasObjectById(placeholderId);
      const canvas = state.canvasBeta.canvas;
      if (!group || !canvas) return false;
      clearCanvasGenerationPlaceholderTimer(placeholderId);
      if (canvas.getActiveObject?.() === group) canvas.discardActiveObject();
      const removesInsertionTail = state.canvasBeta.generationInsertionTailId === placeholderId;
      canvas.remove(group);
      if (removesInsertionTail) restoreGenerationInsertionTail(placeholderId);
      if (state.canvasBeta.activeGenerationPlaceholderId === placeholderId) {
        restoreActiveCanvasGenerationPlaceholder(placeholderId);
      }
      canvas.requestRenderAll();
      updateCanvasPropsPanel();
      renderCanvasLayers();
      if (options.status !== false) canvasBetaStatus(options.status || "生成失败，占位已清理。");
      return true;
    }

    function markCanvasGenerationPlaceholderError(placeholderId, message = "生成失败") {
      removeCanvasGenerationPlaceholder(placeholderId, {
        status: message ? "生成失败，占位已清理。" : false
      });
    }
    
    async function addAiImageToCanvasAssets(image, options = {}) {
      await initCanvasBeta();
      try {
        if (options.status !== false) {
          canvasBetaStatus(options.status || "正在把 AI 生图转成画布素材...");
        }
        const imageUrl = image.url || image.image_file || "";
        if (!imageUrl) throw new Error("这张 AI 图没有可用图片地址。");
        let dataUrl = imageUrl;
        if (!String(imageUrl).startsWith("data:")) {
          dataUrl = await imageUrlToDataUrl(imageUrl);
        }
        const dimensions = image.width && image.height
          ? { width: image.width, height: image.height }
          : await loadImageDimensions(dataUrl).catch(() => null);
        const width = Number(image.width || dimensions?.width || 0);
        const height = Number(image.height || dimensions?.height || 0);
        const hasAlpha = Boolean(image.hasAlpha) || await imageHasTransparentPixels(dataUrl).catch(() => false);
        const asset = await addCanvasAsset({
          name: image.name || "AI 生图素材",
          dataUrl,
          type: "image/png",
          width,
          height,
          aspectRatio: image.aspectRatio || closestAspectRatioFromSize(width, height),
          hasAlpha,
          sourceWorkflow: options.sourceWorkflow || image.sourceWorkflow || "",
          preserveLocal: hasAlpha
        });
        const sequenceAnchor = options.besideObject && Number(options.staggerIndex || 0) > 0
          ? canvasObjectById(state.canvasBeta.lastAiInsertedObjectId)
          : null;
        const placementAnchor = sequenceAnchor || aiInsertPlacementAnchor(options);
        const insertedObject = await insertCanvasAsset(asset, {
          stagger: !placementAnchor,
          staggerIndex: Number(options.staggerIndex || 0),
          point: options.point,
          fitFrame: options.fitFrame === true,
          placeAfterObject: placementAnchor,
          besideObject: placementAnchor ? null : options.besideObject || null,
          matchObject: options.matchObject || null,
          focusOnCanvas: options.focusOnCanvas !== false,
          focusPadding: options.focusPadding,
          focusBehavior: options.focusBehavior,
          focusZoom: options.focusZoom,
          initialMaxWidth: options.initialMaxWidth || 1440,
          initialMaxHeight: options.initialMaxHeight || 980,
          sourceWorkflow: options.sourceWorkflow || image.sourceWorkflow || "",
          name: options.name || asset.name || "AI 生图素材"
        });
        rememberAiInsertedObject(insertedObject);
        if (!options.silent) toast("AI 生图已加入画布。");
        return { asset, object: insertedObject };
      } catch (error) {
        console.error(error);
        canvasBetaStatus("AI 生图加入画布失败。");
        if (!options.silent) toast(error.message || "AI 生图加入画布失败。");
        throw error;
      }
    }
    
    function renderCanvasAssets() {
      const assets = state.canvasBeta.assets || [];
      renderCanvasAssetTarget(els.canvasAssetList, assets, {
        emptyText: tr("importAssetsHint", "Imported assets will appear here"),
        listClass: "canvas-asset-list",
        cardClass: "canvas-asset-card",
        pageKey: "panel",
        pageSize: 8
      });
      renderCanvasAssetTarget(els.canvasFloatingAssetList, assets, {
        emptyText: tr("noAssets", "None"),
        listClass: "canvas-floating-asset-list",
        cardClass: "canvas-floating-asset-card",
        pageKey: "floating",
        pageSize: 3
      });
    }

    function canvasAssetPages() {
      state.canvasBeta.assetPages = state.canvasBeta.assetPages || { panel: 0, floating: 0 };
      return state.canvasBeta.assetPages;
    }

    function resetCanvasAssetPages() {
      state.canvasBeta.assetPages = { panel: 0, floating: 0 };
    }

    function clampCanvasAssetPage(pageKey, pageCount) {
      const pages = canvasAssetPages();
      const nextPage = Math.max(0, Math.min(Math.max(0, pageCount - 1), Number(pages[pageKey] || 0)));
      pages[pageKey] = nextPage;
      return nextPage;
    }

    async function removeCanvasAsset(assetId) {
      const id = String(assetId || "");
      if (!id) return;
      const assets = state.canvasBeta.assets || [];
      const asset = assets.find((item) => String(item.id || "") === id);
      if (!asset) return;
      const canvas = state.canvasBeta.canvas;
      const usedOnCanvas = Boolean(canvas?.getObjects?.().some((object) => String(object.assetId || "") === id));
      const message = usedOnCanvas
        ? `删除素材库里的“${asset.name || "素材"}”？画布上已经放入的元素会保留。`
        : `删除素材“${asset.name || "素材"}”？`;
      const confirmed = await confirmWorkspaceDialog?.(message, {
        title: "删除素材",
        kicker: "素材栏",
        confirmText: "删除",
        cancelText: "取消",
        type: "danger"
      });
      if (!confirmed) return;
      state.canvasBeta.assets = assets.filter((item) => String(item.id || "") !== id);
      clampCanvasAssetPage("panel", Math.max(1, Math.ceil(state.canvasBeta.assets.length / 8)));
      clampCanvasAssetPage("floating", Math.max(1, Math.ceil(state.canvasBeta.assets.length / 3)));
      renderCanvasAssets();
      canvasBetaStatus("素材已从素材栏删除。");
    }
    
    function renderCanvasAssetTarget(target, assets, options = {}) {
      if (!target) return;
      const listClass = options.listClass || "canvas-asset-list";
      const cardClass = options.cardClass || "canvas-asset-card";
      const pageKey = options.pageKey || listClass;
      const pageSize = Math.max(1, Number(options.pageSize || assets.length || 1));
      const pageCount = Math.max(1, Math.ceil(assets.length / pageSize));
      if (!assets.length) {
        target.className = `${listClass} empty-state`;
        target.textContent = options.emptyText || tr("noAssets", "None");
        return;
      }
      const page = clampCanvasAssetPage(pageKey, pageCount);
      const visibleAssets = assets.slice(page * pageSize, page * pageSize + pageSize);
      target.className = listClass;
      target.innerHTML = `
        <div class="canvas-asset-page-items">
          ${visibleAssets.map((asset) => `
        <article class="${cardClass}" draggable="true" title="${escapeHtml(asset.name || tr("assets", "Asset"))}" data-canvas-asset="${escapeHtml(asset.id)}">
          <button class="canvas-asset-main" type="button" data-insert-canvas-asset="${escapeHtml(asset.id)}">
            <img src="${escapeHtml(canvasAssetPreviewSource(asset))}" alt="${escapeHtml(asset.name || tr("assets", "Asset"))}" loading="lazy" decoding="async">
            <b>${escapeHtml(asset.name || tr("assets", "Asset"))}</b>
          </button>
          <button class="canvas-asset-delete" type="button" title="${escapeHtml(tr("deleteAsset", "Delete asset"))}" aria-label="${escapeHtml(tr("deleteAsset", "Delete asset"))}" data-delete-canvas-asset="${escapeHtml(asset.id)}">&times;</button>
        </article>
          `).join("")}
        </div>
        ${pageCount > 1 ? `
          <div class="canvas-asset-pager">
            <button class="canvas-asset-page-btn" type="button" data-canvas-asset-page="${escapeHtml(pageKey)}" data-canvas-asset-page-dir="prev" ${page <= 0 ? "disabled" : ""} title="${escapeHtml(tr("previousPage", "Previous"))}">‹</button>
            <span>${page + 1} / ${pageCount}</span>
            <button class="canvas-asset-page-btn" type="button" data-canvas-asset-page="${escapeHtml(pageKey)}" data-canvas-asset-page-dir="next" ${page >= pageCount - 1 ? "disabled" : ""} title="${escapeHtml(tr("nextPage", "Next"))}">›</button>
          </div>
        ` : ""}
      `;
      target.querySelectorAll("[data-insert-canvas-asset]").forEach((button) => {
        button.addEventListener("click", () => {
          const asset = assets.find((item) => item.id === button.dataset.insertCanvasAsset);
          if (asset) {
            insertCanvasAsset(asset, {
              autoArrange: true,
              focusOnCanvas: true,
              initialMaxWidth: 1440,
              initialMaxHeight: 980
            }).catch((error) => toast(error.message || "素材插入画布失败。"));
            return;
          }
          if (asset) insertCanvasAsset(asset).catch((error) => toast(error.message || "素材插入画布失败。"));
        });
      });
      target.querySelectorAll("[data-delete-canvas-asset]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          removeCanvasAsset(button.dataset.deleteCanvasAsset).catch((error) => toast(error.message || "素材删除失败。"));
        });
      });
      target.querySelectorAll("[data-canvas-asset]").forEach((button) => {
        button.addEventListener("dragstart", (event) => {
          event.dataTransfer?.setData("text/canvas-asset", button.dataset.canvasAsset || "");
          event.dataTransfer.effectAllowed = "copy";
        });
      });
      target.querySelectorAll("[data-canvas-asset-page]").forEach((button) => {
        button.addEventListener("click", () => {
          const nextPageKey = button.dataset.canvasAssetPage || pageKey;
          const direction = button.dataset.canvasAssetPageDir === "next" ? 1 : -1;
          const pages = canvasAssetPages();
          pages[nextPageKey] = Math.max(0, Math.min(pageCount - 1, Number(pages[nextPageKey] || 0) + direction));
          renderCanvasAssets();
        });
      });
    }
    
    function canvasInsertPoint(options = {}) {
      const pointX = options.point ? Number(options.point.x ?? options.point.left) : NaN;
      const pointY = options.point ? Number(options.point.y ?? options.point.top) : NaN;
      if (Number.isFinite(pointX) && Number.isFinite(pointY)) {
        return { left: pointX, top: pointY };
      }
      const canvas = state.canvasBeta.canvas;
      const frame = selectedCanvasFrame() || state.canvasBeta.canvas?.getObjects().find((item) => item.objectType === "frame");
      const offset = options.placeAfterObject
        ? 0
        : Number(options.staggerIndex ?? (options.stagger ? (state.canvasBeta.canvas?.getObjects().length || 0) % 6 : 0));
      const boxWidth = Math.max(1, Number(options.width || 260));
      const boxHeight = Math.max(1, Number(options.height || 220));
      if (options.placeAfterObject) {
        const point = canvasPointBesideObject(options.placeAfterObject, {
          width: boxWidth,
          height: boxHeight,
          gap: Number(options.layoutGap || 72)
        });
        return {
          left: point.left + offset * 18,
          top: point.top + offset * 18
        };
      }
      if (frame) {
        return {
          left: Number(frame.left || 0) + Math.max(24, Number(frame.width || 800) * 0.5 - boxWidth * 0.5) + offset * 18,
          top: Number(frame.top || 0) + Math.max(24, Number(frame.height || 800) * 0.5 - boxHeight * 0.5) + offset * 18
        };
      }
      const center = canvasViewportCenterPoint();
      return {
        left: Math.max(24, center.x - boxWidth / 2 + offset * 24),
        top: Math.max(24, center.y - boxHeight / 2 + offset * 24)
      };
    }

    function canvasViewportCenterPoint() {
      const canvas = state.canvasBeta.canvas;
      const wrap = els.canvasStageWrap;
      const canvasElement = canvas?.upperCanvasEl || canvas?.lowerCanvasEl;
      if (!canvas || !wrap || !canvasElement) {
        return {
          x: Math.max(420, Number(state.canvasBeta.virtualWidth || 2400) / 2),
          y: Math.max(140, Number(state.canvasBeta.virtualHeight || 3600) / 3)
        };
      }
      const canvasRect = canvasElement.getBoundingClientRect();
      const wrapRect = wrap.getBoundingClientRect();
      const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
      const zoom = Math.max(0.01, canvas.getZoom ? canvas.getZoom() : Number(state.canvasBeta.zoom || 1));
      if (state.canvasBeta.cameraMode !== false) {
        const x = (wrap.clientWidth / 2 - Number(vpt[4] || 0)) / zoom;
        const y = (wrap.clientHeight / 2 - Number(vpt[5] || 0)) / zoom;
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
    
    function canvasObjectCanvasBounds(object) {
      if (!object) return null;
      object.setCoords?.();
      const bounds = object.getBoundingRect(true, true);
      return {
        left: Number(bounds.left || 0),
        top: Number(bounds.top || 0),
        width: Math.max(1, Number(bounds.width || 0)),
        height: Math.max(1, Number(bounds.height || 0))
      };
    }

    function focusInsertedCanvasObject(object, options = {}) {
      if (!object || options.focusOnCanvas !== true || typeof focusCanvasBounds !== "function") return;
      if (typeof ensureCanvasHeightForObjects === "function") {
        ensureCanvasHeightForObjects(Number(options.focusPadding || 180) + 420);
      }
      const bounds = canvasObjectCanvasBounds(object);
      if (!bounds) return;
      const focusOptions = {
        padding: Number(options.focusPadding || 180),
        behavior: options.focusBehavior || "auto"
      };
      if (Number.isFinite(Number(options.focusZoom))) focusOptions.zoom = Number(options.focusZoom);
      const runFocus = (behavior = "auto") => {
        const nextBounds = canvasObjectCanvasBounds(object) || bounds;
        focusCanvasBounds(nextBounds, { ...focusOptions, behavior });
      };
      window.requestAnimationFrame(() => {
        runFocus(focusOptions.behavior);
        window.requestAnimationFrame(() => runFocus("auto"));
        window.setTimeout(() => runFocus("auto"), 120);
      });
    }

    function focusCanvasObjectList(objects = [], options = {}) {
      if (typeof focusCanvasBounds !== "function") return;
      if (typeof ensureCanvasHeightForObjects === "function") {
        ensureCanvasHeightForObjects(Number(options.padding || 180) + 420);
      }
      const boundsList = objects
        .map((object) => canvasObjectCanvasBounds(object))
        .filter(Boolean);
      if (!boundsList.length) return;
      const runFocus = (behavior = "auto") => {
        const refreshedBoundsList = objects
          .map((object) => canvasObjectCanvasBounds(object))
          .filter(Boolean);
        const targetBoundsList = refreshedBoundsList.length ? refreshedBoundsList : boundsList;
        const refreshedUnion = targetBoundsList.reduce((next, bounds) => ({
          left: Math.min(next.left, bounds.left),
          top: Math.min(next.top, bounds.top),
          right: Math.max(next.right, bounds.left + bounds.width),
          bottom: Math.max(next.bottom, bounds.top + bounds.height)
        }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
        const focusOptions = {
          padding: Number(options.padding || 180),
          behavior
        };
        if (Number.isFinite(Number(options.zoom))) focusOptions.zoom = Number(options.zoom);
        focusCanvasBounds({
          left: refreshedUnion.left,
          top: refreshedUnion.top,
          width: Math.max(1, refreshedUnion.right - refreshedUnion.left),
          height: Math.max(1, refreshedUnion.bottom - refreshedUnion.top)
        }, focusOptions);
      };
      window.requestAnimationFrame(() => {
        runFocus(options.behavior || "auto");
        window.requestAnimationFrame(() => runFocus("auto"));
        window.setTimeout(() => runFocus("auto"), 120);
      });
    }

    function initialAssetDisplaySize(width, height, options = {}) {
      const naturalWidth = Math.max(1, Number(width || 260));
      const naturalHeight = Math.max(1, Number(height || 220));
      const maxWidth = Math.max(1, Number(options.initialMaxWidth || 0));
      const maxHeight = Math.max(1, Number(options.initialMaxHeight || 0));
      const shouldLimit = maxWidth > 1 || maxHeight > 1;
      const scale = shouldLimit
        ? Math.min(1, maxWidth / naturalWidth, maxHeight / naturalHeight)
        : 1;
      return {
        width: Math.max(1, naturalWidth * scale),
        height: Math.max(1, naturalHeight * scale),
        scale
      };
    }

    function createCanvasAssetBatchLayout(options = {}) {
      const gap = Math.max(40, Number(options.layoutGap || 72));
      const maxColumns = Math.max(1, Math.min(4, Number(options.maxColumns || 2)));
      let started = false;
      let startLeft = 24;
      let cursorLeft = 24;
      let cursorTop = 24;
      let rowHeight = 0;
      let column = 0;
      function ensureStart(box = {}) {
        if (started) return;
        const width = Math.max(1, Number(box.width || 260));
        const height = Math.max(1, Number(box.height || 220));
        const anchor = options.anchorObject || canvasInsertPlacementAnchor({ autoArrange: true });
        if (!options.startPoint && anchor && options.continueFromAnchor === true) {
          const bounds = canvasObjectCanvasBounds(anchor);
          if (bounds) {
            startLeft = Number(bounds.left || 0);
            cursorLeft = startLeft + Math.max(1, Number(bounds.width || width)) + gap;
            cursorTop = Number(bounds.top || 0);
            rowHeight = Math.max(1, Number(bounds.height || height));
            column = Math.min(maxColumns, 1);
            started = true;
            return;
          }
        }
        const firstPoint = options.startPoint
          ? {
              left: Number((options.startPoint.x ?? options.startPoint.left) || 0),
              top: Number((options.startPoint.y ?? options.startPoint.top) || 0)
            }
          : options.centerPoint && Number.isFinite(Number(options.centerPoint.x ?? options.centerPoint.left)) && Number.isFinite(Number(options.centerPoint.y ?? options.centerPoint.top))
            ? {
                left: Number(options.centerPoint.x ?? options.centerPoint.left) - width / 2,
                top: Number(options.centerPoint.y ?? options.centerPoint.top) - height / 2
              }
          : anchor
            ? canvasPointBesideObject(anchor, { width, height, gap, maxRowWidth: Number(options.maxRowWidth || 2600) })
            : canvasInsertPoint({ width, height, stagger: true, autoArrange: false });
        startLeft = Number(firstPoint.left || 0);
        cursorLeft = startLeft;
        cursorTop = Number(firstPoint.top || 0);
        started = true;
      }
      return {
        next(box = {}) {
          ensureStart(box);
          const width = Math.max(1, Number(box.width || 260));
          const height = Math.max(1, Number(box.height || 220));
          if (column >= maxColumns) {
            cursorLeft = startLeft;
            cursorTop += rowHeight + gap;
            rowHeight = 0;
            column = 0;
          }
          const point = { x: cursorLeft, y: cursorTop };
          cursorLeft += width + gap;
          rowHeight = Math.max(rowHeight, height);
          column += 1;
          return point;
        }
      };
    }
    
    function canvasPointBesideObject(object, box = {}) {
      const canvas = state.canvasBeta.canvas;
      const bounds = canvasObjectCanvasBounds(object);
      if (!canvas || !bounds) return canvasInsertPoint({ stagger: true });
      const width = Math.max(1, Number(box.width || bounds.width || 260));
      const height = Math.max(1, Number(box.height || bounds.height || 260));
      const gap = Math.max(20, Number(box.gap || 46));
      let left = bounds.left + bounds.width + gap;
      let top = bounds.top;
      const maxRowWidth = Math.max(width + gap, Number(box.maxRowWidth || 2600));
      const canvasRight = bounds.left + maxRowWidth;
      if (left + width > canvasRight) {
        left = bounds.left;
        top = bounds.top + bounds.height + gap;
      }
      return { left, top };
    }
    
    function fitCanvasImageIntoBox(image, box, options = {}) {
      const width = Math.max(1, Number(box?.width || 0));
      const height = Math.max(1, Number(box?.height || 0));
      const padding = Math.max(0, Number(options.padding || 0));
      const targetWidth = Math.max(1, width - padding * 2);
      const targetHeight = Math.max(1, height - padding * 2);
      const scale = Math.min(targetWidth / Math.max(1, image.width || 1), targetHeight / Math.max(1, image.height || 1));
      image.scale(scale);
      image.set({
        left: Number(box.left || 0) + width / 2 - (image.width || 1) * scale / 2,
        top: Number(box.top || 0) + height / 2 - (image.height || 1) * scale / 2
      });
    }
    
    function fitCanvasImageForInitialInsert(image, options = {}) {
      if (!image) return;
      const naturalWidth = Math.max(1, Number(options.naturalWidth || image.naturalWidth || image.width || 1));
      const naturalHeight = Math.max(1, Number(options.naturalHeight || image.naturalHeight || image.height || 1));
      const size = initialAssetDisplaySize(naturalWidth, naturalHeight, options);
      image.set({
        scaleX: size.width / Math.max(1, Number(image.width || 1)),
        scaleY: size.height / Math.max(1, Number(image.height || 1)),
        naturalWidth,
        naturalHeight
      });
    }
    
    async function insertCanvasAsset(asset, options = {}) {
      const canvas = state.canvasBeta.canvas;
      if (!canvas || !asset?.url) throw new Error("画布或素材地址不可用。");
      canvasBetaStatus(`正在插入素材：${asset.name || "图片素材"}`);
      const sourceUrl = asset.url;
      const displayUrl = asset.previewUrl || asset.url;
      return new Promise((resolve, reject) => {
        fabricImageFromUrl(displayUrl, (image) => {
          if (!image) {
            canvasBetaStatus("素材加载失败，请确认图片格式。");
            reject(new Error("素材加载失败，请确认图片格式。"));
            return;
          }
          const placementOptions = { ...options };
          if (!placementOptions.placeAfterObject) {
            const anchorObject = canvasInsertPlacementAnchor(placementOptions);
            if (anchorObject) placementOptions.placeAfterObject = anchorObject;
          }
          const displaySize = initialAssetDisplaySize(
            Number(asset.width || image.width || 260),
            Number(asset.height || image.height || 220),
            placementOptions
          );
          const shouldUseNaturalPointBox = placementOptions.matchObject || placementOptions.fitFrame || placementOptions.besideObject;
          const point = canvasInsertPoint({
            ...placementOptions,
            width: shouldUseNaturalPointBox ? Number(image.width || asset.width || 260) : displaySize.width,
            height: shouldUseNaturalPointBox ? Number(image.height || asset.height || 220) : displaySize.height
          });
          image.set({
            left: point.left,
            top: point.top,
            name: asset.name || "图片素材",
            objectType: "image",
            assetId: asset.id,
            srcUrl: sourceUrl,
            originalSrcUrl: asset.originalUrl || sourceUrl,
            previewUrl: displayUrl,
            thumbnailUrl: asset.thumbnailUrl || displayUrl,
            previewWidth: Number(asset.previewWidth || image.width || 0),
            previewHeight: Number(asset.previewHeight || image.height || 0),
            naturalWidth: Number(asset.width || image.width || 0),
            naturalHeight: Number(asset.height || image.height || 0),
            hasAlpha: Boolean(asset.hasAlpha),
            opacity: Number.isFinite(Number(asset.opacity))
              ? Math.max(0, Math.min(1, Number(asset.opacity) / 100))
              : 1,
            source: asset.source || "",
            sourceKind: asset.sourceKind || "",
            sourceBounds: asset.sourceBounds || null,
            sourceLayerBounds: asset.sourceLayerBounds || null,
            sourceWorkflow: placementOptions.sourceWorkflow || asset.sourceWorkflow || "",
            visible: placementOptions.visible !== false,
            selectable: placementOptions.selectable !== false,
            evented: placementOptions.evented !== false,
            ...(placementOptions.locked ? {
              lockMovementX: true,
              lockMovementY: true,
              lockScalingX: true,
              lockScalingY: true,
              lockRotation: true,
              hasControls: false,
              hoverCursor: "default"
            } : {}),
            objectCaching: true,
            noScaleCache: false,
            perPixelTargetFind: false
          });
          const frame = selectedCanvasFrame() || canvas.getObjects().find((item) => item.objectType === "frame");
          if (placementOptions.matchObject) {
            const sourceObject = placementOptions.matchObject;
            const targetWidth = Math.max(1, sourceObject.getScaledWidth ? sourceObject.getScaledWidth() : Number(sourceObject.width || image.width || 1));
            const targetHeight = Math.max(1, sourceObject.getScaledHeight ? sourceObject.getScaledHeight() : Number(sourceObject.height || image.height || 1));
            image.set({
              left: Number(sourceObject.left || point.left),
              top: Number(sourceObject.top || point.top),
              scaleX: targetWidth / Math.max(1, Number(image.width || 1)),
              scaleY: targetHeight / Math.max(1, Number(image.height || 1)),
              angle: Number(sourceObject.angle || 0),
              flipX: Boolean(sourceObject.flipX),
              flipY: Boolean(sourceObject.flipY),
              name: options.name || asset.name || "抠图透明层"
            });
          } else if (placementOptions.besideObject) {
            const sourceObject = placementOptions.besideObject;
            const targetWidth = Math.max(1, sourceObject.getScaledWidth ? sourceObject.getScaledWidth() : Number(sourceObject.width || image.width || 1));
            const targetHeight = Math.max(1, sourceObject.getScaledHeight ? sourceObject.getScaledHeight() : Number(sourceObject.height || image.height || 1));
            const scale = Math.min(
              targetWidth / Math.max(1, Number(image.width || 1)),
              targetHeight / Math.max(1, Number(image.height || 1))
            );
            image.scale(scale);
            const besidePoint = canvasPointBesideObject(sourceObject, {
              width: Math.max(1, Number(image.width || 1) * scale),
              height: Math.max(1, Number(image.height || 1) * scale),
              gap: 48
            });
            image.set({
              left: besidePoint.left,
              top: besidePoint.top,
              name: options.name || asset.name || "抠图透明层"
            });
          } else if (placementOptions.fitFrame && frame) {
            fitCanvasImageIntoBox(image, {
              left: Number(frame.left || 0),
              top: Number(frame.top || 0),
              width: Number(frame.width || 800),
              height: Number(frame.height || 800)
            }, { padding: 0 });
          } else {
            fitCanvasImageForInitialInsert(image, {
              ...placementOptions,
              naturalWidth: Number(asset.width || image.width || 1),
              naturalHeight: Number(asset.height || image.height || 1)
            });
          }
          canvas.add(image);
          if (placementOptions.sendToBack === true) canvas.sendToBack(image);
          if (placementOptions.activate !== false && image.visible !== false) canvas.setActiveObject(image);
          image.setCoords?.();
          keepCanvasFramesBehind();
          canvas.requestRenderAll();
          ensureCanvasHeightForObjects();
          if (placementOptions.rememberInsert !== false) rememberCanvasInsertedObject(image);
          focusInsertedCanvasObject(image, {
            focusOnCanvas: placementOptions.focusOnCanvas === true,
            focusPadding: placementOptions.focusPadding,
            focusBehavior: placementOptions.focusBehavior,
            focusZoom: placementOptions.focusZoom
          });
          updateCanvasPropsPanel();
          renderCanvasLayers();
          canvasBetaStatus("素材已放入画布，可直接拖拽缩放。");
          resolve(image);
        }, { crossOrigin: "anonymous" });
      });
    }

    return {
      handleCanvasAssetInput,
      importCanvasAssetFiles,
      addCanvasAsset,
      activateCanvasSelectTool,
      activateCanvasToolMode,
      imageUrlToDataUrl,
      autoInsertGeneratedImagesToCanvas,
      createCanvasGenerationPlaceholder,
      createGenerationLoadingSprite,
      startCanvasGenerationPlaceholderTimer,
      clearCanvasGenerationPlaceholderTimer,
      updateCanvasGenerationPlaceholderProgress,
      replaceCanvasGenerationPlaceholder,
      markCanvasGenerationPlaceholderError,
      removeCanvasGenerationPlaceholder,
      addAiImageToCanvasAssets,
      renderCanvasAssets,
      renderCanvasAssetTarget,
      canvasInsertPoint,
      canvasObjectCanvasBounds,
      focusCanvasObjectList,
      canvasPointBesideObject,
      createCanvasAssetBatchLayout,
      fitCanvasImageIntoBox,
      fitCanvasImageForInitialInsert,
      insertCanvasAsset
    };
  };
})();
