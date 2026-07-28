(function () {
  const app = window.EcommerceCanvasApp = window.EcommerceCanvasApp || {};

  app.createAiSizeController = function createAiSizeController(deps) {
    const {
      els,
      state,
      imageDimensionCache,
      studioQualitySizeMap,
      studioModelPresets,
      selectedCanvasImageObject,
      currentAiProvider,
      aspectRatioOptionsForProvider,
      saveAiConversationDebounced,
      toast,
      loadImage
    } = deps;
    const aiRequestReferences = deps.aiRequestReferences || (() => []);
    const isAiLocalEditRequest = deps.isAiLocalEditRequest || (() => false);
    const selectedAiSkill = deps.selectedAiSkill || (() => null);
    const loadAiProviderSettings = deps.loadAiProviderSettings || (() => {});
    const refreshCustomSelect = deps.refreshCustomSelect || (() => {});
    const syncImageApiProviderControls = deps.syncImageApiProviderControls || (() => {});
    const handleImageApiProviderChange = deps.handleImageApiProviderChange || (() => {});
    const closeAiSettingsDrawer = deps.closeAiSettingsDrawer || (() => {});
    const closeAiModelPrefsPanel = deps.closeAiModelPrefsPanel || (() => {});
    const currentImageApiProvider = deps.currentImageApiProvider || (() => "primary");
    const currentUserImageModel = deps.currentUserImageModel || (() => "");
    const imageApiProviderLabel = deps.imageApiProviderLabel || ((provider) => provider === "secondary" ? "服务 B" : "服务 A");
    const tr = (key, fallback = "") => window.EcommerceCanvasI18n?.t(key, fallback) || fallback || key;
    const tf = (key, values = {}, fallback = "") => window.EcommerceCanvasI18n?.format(key, values, fallback) || fallback || key;

    function isDetailPageAgentSelected() {
      return selectedAiSkill?.()?.id === "detail-page-planner-agent";
    }

    function isMainImageAgentSelected() {
      return selectedAiSkill?.()?.id === "main-image-matrix-agent";
    }

    function syncMainImageFixedCount() {
      if (!isMainImageAgentSelected()) return false;
      if (els.imageCount) els.imageCount.value = "5";
      return true;
    }

    function syncDetailPageFixedOutputSettings() {
      if (!isDetailPageAgentSelected()) return false;
      state.aiDirect.outputSizeMode = "preset";
      if (els.aiProvider) {
        els.aiProvider.value = "imageservice";
      }
      if (els.aspectRatio) {
        els.aspectRatio.value = "3:4";
        refreshCustomSelect(els.aspectRatio);
      }
      if (els.imageSize) {
        els.imageSize.value = "4K";
        refreshCustomSelect(els.imageSize);
      }
      if (els.thinkingMode && els.thinkingMode.value === "off") {
        els.thinkingMode.value = "standard";
        refreshCustomSelect(els.thinkingMode);
      }
      return true;
    }

    const normalizeAiReferenceRole = deps.normalizeAiReferenceRole || ((role) => {
      if (role === "base") return "base";
      if (role === "ignore") return "ignore";
      return "reference";
    });

    function sizeForAspectRatio(ratio, base = 1024) {
      const value = aspectRatioValue(ratio);
      if (!value) return { width: base, height: base };
      if (value >= 1) {
        return { width: base, height: Math.max(128, Math.round(base / value)) };
      }
      return { width: Math.max(128, Math.round(base * value)), height: base };
    }
    
    function canvasImageObjectOriginalSize(object = selectedCanvasImageObject()) {
      if (!object) return null;
      const width = Math.round(Number(object.naturalWidth || object.width || object.getScaledWidth?.() || 0));
      const height = Math.round(Number(object.naturalHeight || object.height || object.getScaledHeight?.() || 0));
      return isValidExactOutputSize(width, height)
        ? { width, height, sourceName: object.name || "画布图1", source: "canvas-selection" }
        : null;
    }
    
    function aiReferenceOriginalSizeSource(context = state.aiDirect) {
      const references = Array.isArray(context?.references) ? context.references : [];
      const base = references.find((image) => normalizeAiReferenceRole(image.role) === "base")
        || references[0]
        || null;
      if (!base) return null;
      const width = Math.round(Number(base.width || base.naturalWidth || 0));
      const height = Math.round(Number(base.height || base.naturalHeight || 0));
      return isValidExactOutputSize(width, height)
        ? { width, height, sourceName: base.name || "图1", source: "composer-reference" }
        : null;
    }
    
    function currentAutoOutputSizeSource(context = state.aiDirect, options = {}) {
      const includeCanvasSelection = options.includeCanvasSelection !== false;
      const smallEditorActive = includeCanvasSelection && els.canvasImageAiEditor && !els.canvasImageAiEditor.hidden;
      return (smallEditorActive ? canvasImageObjectOriginalSize() : null)
        || aiReferenceOriginalSizeSource(context)
        || null;
    }
    
    function currentUiExactOutputSize(context = state.aiDirect, options = {}) {
      const mode = context?.outputSizeMode || state.aiDirect.outputSizeMode || "auto";
      if (mode === "custom") {
        const width = Math.round(Number(context?.customOutputWidth || state.aiDirect.customOutputWidth || els.aiWidthInput?.value || 0));
        const height = Math.round(Number(context?.customOutputHeight || state.aiDirect.customOutputHeight || els.aiHeightInput?.value || 0));
        return isValidExactOutputSize(width, height)
          ? { width, height, sourceName: "自定义尺寸", source: "custom" }
          : null;
      }
      if (mode === "auto") return currentAutoOutputSizeSource(context, options);
      return null;
    }
    
    function persistAiOutputSizeMode() {
      localStorage.setItem("ai_output_size_mode", state.aiDirect.outputSizeMode || "auto");
      if (state.aiDirect.customOutputWidth) localStorage.setItem("ai_custom_output_width", String(state.aiDirect.customOutputWidth));
      else localStorage.removeItem("ai_custom_output_width");
      if (state.aiDirect.customOutputHeight) localStorage.setItem("ai_custom_output_height", String(state.aiDirect.customOutputHeight));
      else localStorage.removeItem("ai_custom_output_height");
    }
    
    function updateStudioSizeInputs() {
      if (!els.aiWidthInput || !els.aiHeightInput) return;
      const exact = currentUiExactOutputSize();
      const sizeTier = els.imageSize?.value || "1K";
      const base = sizeTier === "4K" ? 3840 : sizeTier === "2K" ? 2048 : 1024;
      const dimensions = exact || sizeForAspectRatio(els.aspectRatio?.value || "1:1", base);
      els.aiWidthInput.value = String(dimensions.width);
      els.aiHeightInput.value = String(dimensions.height);
    }
    
    function activeStudioQuality() {
      const size = els.imageSize?.value || "1K";
      const provider = currentAiProvider();
      const thinking = String(els.thinkingMode?.value || "standard").trim().toLowerCase();
      if (provider === "imageservice" && thinking !== "off" && size === "1K") return "auto";
      if (size === "4K") return "high";
      if (size === "2K") return "medium";
      return "low";
    }
    
    function setStudioQuality(quality) {
      const normalized = studioQualitySizeMap[quality] ? quality : "auto";
      const currentThinking = String(els.thinkingMode?.value || "standard").trim().toLowerCase();
      if (els.imageSize) {
        els.imageSize.value = studioQualitySizeMap[normalized];
        els.imageSize.dispatchEvent(new Event("change", { bubbles: true }));
      }
      if (els.thinkingMode) {
        els.thinkingMode.value = normalized === "low" ? "off" : currentThinking === "deep" ? "deep" : "standard";
        els.thinkingMode.dispatchEvent(new Event("change", { bubbles: true }));
      }
      syncStudioComposerControls();
    }
    
    function setStudioRatio(ratio, size = "") {
      if (!els.aspectRatio) return;
      const options = aspectRatioOptionsForProvider(currentAiProvider());
      if (ratio === "auto") {
        state.aiDirect.outputSizeMode = "auto";
        persistAiOutputSizeMode();
        const exact = currentUiExactOutputSize();
        const nextRatio = exact?.aspectRatio || closestAspectRatioFromSize(exact?.width, exact?.height) || els.aspectRatio.value || options[0] || "1:1";
        if (nextRatio && options.includes(nextRatio)) {
          els.aspectRatio.value = nextRatio;
          els.aspectRatio.dispatchEvent(new Event("change", { bubbles: true }));
        }
        syncStudioComposerControls();
        updateComposerModelSummary();
        saveAiConversationDebounced();
        toast(exact ? `自动尺寸：按图1原尺寸 ${exact.width}×${exact.height} 输出。` : "自动尺寸：无图时按当前默认比例输出。");
        return;
      }
      state.aiDirect.outputSizeMode = "preset";
      persistAiOutputSizeMode();
      const nextRatio = ratio;
      if (nextRatio && options.includes(nextRatio)) {
        els.aspectRatio.value = nextRatio;
        els.aspectRatio.dispatchEvent(new Event("change", { bubbles: true }));
      }
      if (size && els.imageSize && !els.imageSize.disabled) {
        els.imageSize.value = size;
        els.imageSize.dispatchEvent(new Event("change", { bubbles: true }));
      }
      syncStudioComposerControls();
    }
    
    function setStudioImageCount(count) {
      if (isDetailPageAgentSelected()) {
        syncStudioComposerControls();
        updateComposerModelSummary();
        return;
      }
      if (!els.imageCount) return;
      const maxCount = Number(els.imageCount.max || 1);
      const nextCount = clampNumber(Number(count || 1), 1, maxCount);
      els.imageCount.value = String(nextCount);
      els.imageCount.dispatchEvent(new Event("input", { bubbles: true }));
      syncStudioComposerControls();
    }
    
    function handleAiCanvasSizeInput() {
      const width = Math.round(Number(els.aiWidthInput?.value || 0));
      const height = Math.round(Number(els.aiHeightInput?.value || 0));
      if (isValidExactOutputSize(width, height)) {
        state.aiDirect.outputSizeMode = "custom";
        state.aiDirect.customOutputWidth = width;
        state.aiDirect.customOutputHeight = height;
        persistAiOutputSizeMode();
      }
      const ratio = closestAspectRatioFromSize(width, height);
      if (ratio) setStudioRatio(ratio);
      state.aiDirect.outputSizeMode = "custom";
      state.aiDirect.customOutputWidth = width;
      state.aiDirect.customOutputHeight = height;
      persistAiOutputSizeMode();
      syncStudioComposerControls();
      updateComposerModelSummary();
    }
    
    function handleStudioSettingsClick(event) {
      const closeButton = event.target?.closest?.("[data-ai-popover-close='settings']");
      if (closeButton) {
        closeAiSettingsDrawer();
        return;
      }
      const qualityButton = event.target?.closest?.("[data-ai-quality]");
      if (qualityButton) {
        setStudioQuality(qualityButton.dataset.aiQuality);
        return;
      }
      const ratioButton = event.target?.closest?.("[data-ai-ratio]");
      if (ratioButton && !ratioButton.disabled) {
        setStudioRatio(ratioButton.dataset.aiRatio, ratioButton.dataset.aiSize || "");
        return;
      }
      const countButton = event.target?.closest?.("[data-ai-count]");
      if (countButton && !countButton.disabled) {
        setStudioImageCount(countButton.dataset.aiCount);
      }
    }
    
    function syncStudioSettingsPanel() {
      const detailPageLocked = syncDetailPageFixedOutputSettings();
      const quality = activeStudioQuality();
      document.querySelectorAll("[data-ai-quality]").forEach((button) => {
        button.disabled = detailPageLocked;
        button.classList.toggle("active", button.dataset.aiQuality === quality);
      });
      const supportedRatios = aspectRatioOptionsForProvider(currentAiProvider());
      const currentRatio = els.aspectRatio?.value || "1:1";
      document.querySelectorAll("[data-ai-ratio]").forEach((button) => {
        const ratio = button.dataset.aiRatio || "";
        const isAuto = ratio === "auto";
        const isSupported = isAuto || supportedRatios.includes(ratio);
        const isDetailFixedRatio = ratio === "3:4";
        button.disabled = detailPageLocked || !isSupported;
        button.classList.toggle("active", detailPageLocked ? isDetailFixedRatio : isAuto ? state.aiDirect.outputSizeMode === "auto" : state.aiDirect.outputSizeMode !== "auto" && ratio === currentRatio);
      });
      const currentCount = Number(els.imageCount?.value || 1);
      const maxCount = Number(els.imageCount?.max || 1);
      const designAutoCount = isDetailPageAgentSelected() || syncMainImageFixedCount();
      const countGrid = document.querySelector(".studio-count-grid[aria-label='生成张数']");
      const countGroup = countGrid?.closest?.(".studio-setting-group");
      if (countGroup) countGroup.hidden = designAutoCount;
      document.querySelectorAll("[data-ai-count]").forEach((button) => {
        const count = Number(button.dataset.aiCount || 1);
        button.disabled = designAutoCount || count > maxCount;
        button.classList.toggle("active", !designAutoCount && count === currentCount);
      });
      if (els.aiWidthInput) els.aiWidthInput.disabled = detailPageLocked;
      if (els.aiHeightInput) els.aiHeightInput.disabled = detailPageLocked;
      updateStudioSizeInputs();
    }
    
    function modelPresetForCurrentSelection() {
      const provider = currentAiProvider();
      const thinking = els.thinkingMode?.value || "standard";
      if (provider === "imageservice" && thinking === "deep") return "imageservice:medium-deep";
      if (provider === "imageservice" && thinking === "off") return "imageservice:low";
      if (provider === "imageservice") return "imageservice:auto";
      return "";
    }
    
    function syncStudioModelPanel() {
      const activePreset = modelPresetForCurrentSelection();
      document.querySelectorAll("[data-ai-model-preset]").forEach((button) => {
        button.disabled = false;
        button.classList.toggle("active", button.dataset.aiModelPreset === activePreset);
      });
      document.querySelectorAll("[data-ai-model-tab]").forEach((button) => {
        button.disabled = false;
      });
      if (els.aiAutoModeToggle) {
        els.aiAutoModeToggle.checked = !currentUserImageModel(currentAiProvider());
        els.aiAutoModeToggle.disabled = false;
      }
      syncImageApiProviderControls();
    }
    
    function syncStudioComposerControls() {
      syncStudioSettingsPanel();
      syncStudioModelPanel();
    }
    
    function handleAiAutoModeToggle() {
      const select = els.userImageModelSelect;
      if (!select || !els.aiAutoModeToggle) return;
      if (els.aiAutoModeToggle.checked) {
        select.value = "";
        select.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }
      const firstUserModel = Array.from(select.options || []).find((option) => option.value);
      if (!firstUserModel) {
        els.aiAutoModeToggle.checked = true;
        toast(tr("selectModelFirst", "Add and save at least one model before switching to manual selection."));
        els.userImageModelList?.focus();
        return;
      }
      select.value = firstUserModel.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    
    function handleAiModelPrefsClick(event) {
      const closeButton = event.target?.closest?.("[data-ai-popover-close='model']");
      if (closeButton) {
        closeAiModelPrefsPanel();
        return;
      }
      const tabButton = event.target?.closest?.("[data-ai-model-tab]");
      if (tabButton && !tabButton.disabled) {
        const tab = tabButton.dataset.aiModelTab || "image";
        document.querySelectorAll("[data-ai-model-tab]").forEach((button) => {
          button.classList.toggle("active", button === tabButton);
        });
        document.querySelectorAll("[data-ai-model-list]").forEach((list) => {
          list.hidden = list.dataset.aiModelList !== tab;
        });
        return;
      }
      const presetButton = event.target?.closest?.("[data-ai-model-preset]");
      if (!presetButton || presetButton.disabled) return;
      const preset = studioModelPresets[presetButton.dataset.aiModelPreset];
      if (!preset) return;
      if (els.aiProvider) {
        els.aiProvider.value = preset.provider;
        localStorage.setItem("ai_provider", preset.provider);
        loadAiProviderSettings();
      }
      if (preset.size && els.imageSize) {
        els.imageSize.value = preset.size;
        els.imageSize.dispatchEvent(new Event("change", { bubbles: true }));
      }
      if (els.thinkingMode) {
        els.thinkingMode.value = preset.thinking;
        els.thinkingMode.dispatchEvent(new Event("change", { bubbles: true }));
      }
      syncStudioComposerControls();
      saveAiConversationDebounced();
    }
    
    function updateComposerModelSummary() {
      if (!els.composerModelSummary) return;
      syncDetailPageFixedOutputSettings();
      const providerLabel = currentAiProvider() === "imageservice"
        ? tr("imageService", "Image service")
        : els.aiProvider?.selectedOptions?.[0]?.textContent?.trim() || "Image service";
      const serviceLabel = currentAiProvider() === "imageservice" ? ` · ${imageApiProviderLabel(currentImageApiProvider())}` : "";
      const exact = currentUiExactOutputSize();
      const ratio = state.aiDirect.outputSizeMode === "auto" && exact ? "auto" : els.aspectRatio?.value || "1:1";
      const countText = isDetailPageAgentSelected() || isMainImageAgentSelected()
        ? tr("autoLayout", "Auto layout")
        : (window.EcommerceCanvasI18n?.formatImageCount?.(Number(els.imageCount?.value || 1))
          || tf("imageCountFormat", { count: Number(els.imageCount?.value || 1) }, `${Number(els.imageCount?.value || 1)} images`));
      const size = exact ? `${exact.width}×${exact.height}` : els.imageSize?.value || "1K";
      const skill = selectedAiSkill?.()?.id && selectedAiSkill().id !== "none" ? ` · ${selectedAiSkill().name}` : "";
      const thinking = String(els.thinkingMode?.value || "standard").trim().toLowerCase();
      const thinkingLabel = thinking === "deep"
        ? ` · ${tr("deep", "Deep")}`
        : thinking === "off" ? ` · ${tr("directMode", "Direct")}` : "";
      const userModel = currentUserImageModel(currentAiProvider()) || "";
      els.composerModelSummary.textContent = `${providerLabel}${serviceLabel}${userModel ? ` · ${userModel}` : ""}${thinkingLabel} · ${ratio} · ${countText} · ${size}${skill}`;
      syncStudioComposerControls();
    }
    
    function aspectRatioValue(ratioText) {
      const match = String(ratioText || "").match(/(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/);
      if (!match) return 0;
      const width = Number(match[1]);
      const height = Number(match[2]);
      return width > 0 && height > 0 ? width / height : 0;
    }
    
    function aspectRatioCandidatesForCurrentProvider() {
      const provider = currentAiProvider();
      return aspectRatioOptionsForProvider(provider).filter((ratio) => aspectRatioValue(ratio));
    }
    
    function closestAspectRatioFromSize(width, height, options = {}) {
      const w = Number(width || 0);
      const h = Number(height || 0);
      if (!w || !h) return "";
      const target = w / h;
      const candidates = options.candidates || aspectRatioCandidatesForCurrentProvider();
      let best = "";
      let bestScore = Infinity;
      candidates.forEach((ratio) => {
        const value = aspectRatioValue(ratio);
        if (!value) return;
        const score = Math.abs(Math.log(target / value));
        if (score < bestScore) {
          best = ratio;
          bestScore = score;
        }
      });
      return best;
    }
    
    function setAspectRatioValue(ratio, options = {}) {
      if (!els.aspectRatio || !ratio) return "";
      const optionValues = Array.from(els.aspectRatio.options || []).map((option) => option.value || option.textContent);
      if (!optionValues.includes(ratio)) return "";
      if (els.aspectRatio.value !== ratio) {
        els.aspectRatio.value = ratio;
        refreshCustomSelect(els.aspectRatio);
        updateComposerModelSummary();
        if (!options.silent) canvasBetaStatus(`已同步生图比例：${ratio}`);
      }
      return ratio;
    }
    
    function ratioFromCanvasFrame(frame) {
      const width = Number(frame?.frameSize?.width || frame?.width || 0);
      const height = Number(frame?.frameSize?.height || frame?.height || 0);
      return closestAspectRatioFromSize(width, height);
    }
    
    function syncAspectRatioFromCanvasFrame(options = {}) {
      if (!els.aspectRatio || !state.canvasBeta?.canvas || typeof selectedCanvasFrame !== "function") return "";
      const frame = selectedCanvasFrame();
      const ratio = ratioFromCanvasFrame(frame);
      return setAspectRatioValue(ratio, {
        silent: options.silent,
        message: ratio ? `已按当前画板同步生图比例：${ratio}` : ""
      });
    }
    
    function imageCacheKey(source) {
      const text = String(source || "");
      return text.length > 260 ? `${text.length}:${text.slice(0, 120)}:${text.slice(-120)}` : text;
    }
    
    async function loadImageDimensions(source) {
      const key = imageCacheKey(source);
      if (!key) return null;
      if (imageDimensionCache.has(key)) return imageDimensionCache.get(key);
      const load = (url) => new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve({ width: image.naturalWidth || image.width || 0, height: image.naturalHeight || image.height || 0 });
        image.onerror = reject;
        if (!String(url).startsWith("data:")) image.crossOrigin = "anonymous";
        image.src = url;
      });
      try {
        const dimensions = await load(source);
        if (dimensions?.width && dimensions?.height) imageDimensionCache.set(key, dimensions);
        return dimensions;
      } catch (error) {
        if (String(source || "").startsWith("data:")) return null;
        try {
          const dataUrl = await imageUrlToDataUrl(source);
          const dimensions = await load(dataUrl);
          if (dimensions?.width && dimensions?.height) imageDimensionCache.set(key, dimensions);
          return dimensions;
        } catch {
          return null;
        }
      }
    }
    
    async function imageHasTransparentPixels(source) {
      if (!String(source || "").startsWith("data:image/png")) return false;
      try {
        const image = await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = source;
        });
        const width = image.naturalWidth || image.width || 0;
        const height = image.naturalHeight || image.height || 0;
        if (!width || !height) return false;
        const maxSide = 512;
        const scale = Math.min(1, maxSide / Math.max(width, height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 3; i < pixels.length; i += 4) {
          if (pixels[i] < 250) return true;
        }
      } catch (error) {
        console.warn("PNG alpha 检测失败", error);
      }
      return false;
    }
    
    function isLightNeutralTransparentPreviewPixel(r, g, b, a) {
      if (a <= 8) return true;
      if (a <= 20) return false;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      return min >= 208 && max - min <= 18;
    }
    
    async function normalizeCheckerboardPreviewToTransparent(source, options = {}) {
      const input = String(source || "");
      if (!input) return { dataUrl: input, changed: false };
      const image = await loadImage(input);
      const width = image.naturalWidth || image.width || 0;
      const height = image.naturalHeight || image.height || 0;
      if (!width || !height) return { dataUrl: input, changed: false };
    
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0, width, height);
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      const total = width * height;
    
      let sampleCount = 0;
      let lightNeutralCount = 0;
      let whiteBucket = 0;
      let grayBucket = 0;
      const sampleStep = Math.max(1, Math.floor(total / 70000));
      for (let pixel = 0; pixel < total; pixel += sampleStep) {
        const i = pixel * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];
        sampleCount += 1;
        if (!isLightNeutralTransparentPreviewPixel(r, g, b, a)) continue;
        lightNeutralCount += 1;
        const avg = (r + g + b) / 3;
        if (avg >= 246) whiteBucket += 1;
        else if (avg >= 214) grayBucket += 1;
      }
    
      let borderSamples = 0;
      let borderLightNeutral = 0;
      const sampleBorder = (x, y) => {
        const i = (y * width + x) * 4;
        borderSamples += 1;
        if (isLightNeutralTransparentPreviewPixel(data[i], data[i + 1], data[i + 2], data[i + 3])) {
          borderLightNeutral += 1;
        }
      };
      const edgeStep = Math.max(1, Math.floor(Math.max(width, height) / 400));
      for (let x = 0; x < width; x += edgeStep) {
        sampleBorder(x, 0);
        sampleBorder(x, height - 1);
      }
      for (let y = 0; y < height; y += edgeStep) {
        sampleBorder(0, y);
        sampleBorder(width - 1, y);
      }
    
      const lightRatio = sampleCount ? lightNeutralCount / sampleCount : 0;
      const borderRatio = borderSamples ? borderLightNeutral / borderSamples : 0;
      const hasTwoCheckerColors = whiteBucket > sampleCount * 0.015 && grayBucket > sampleCount * 0.015;
      const looksLikeCheckerboard = hasTwoCheckerColors && lightRatio > 0.08 && borderRatio > 0.42;
      if (!looksLikeCheckerboard) return { dataUrl: input, changed: false };
    
      const candidateMask = new Uint8Array(total);
      const preserveMask = new Uint8Array(total);
      for (let pixel = 0, i = 0; pixel < total; pixel += 1, i += 4) {
        const candidate = isLightNeutralTransparentPreviewPixel(data[i], data[i + 1], data[i + 2], data[i + 3]);
        candidateMask[pixel] = candidate ? 1 : 0;
        if (!candidate && data[i + 3] > 20) preserveMask[pixel] = 1;
      }
    
      for (let pass = 0; pass < 3; pass += 1) {
        const next = preserveMask.slice();
        for (let pixel = 0; pixel < total; pixel += 1) {
          if (!preserveMask[pixel]) continue;
          const x = pixel % width;
          const y = Math.floor(pixel / width);
          if (x > 0) next[pixel - 1] = 1;
          if (x < width - 1) next[pixel + 1] = 1;
          if (y > 0) next[pixel - width] = 1;
          if (y < height - 1) next[pixel + width] = 1;
        }
        preserveMask.set(next);
      }
    
      const queue = new Int32Array(total);
      const removeMask = new Uint8Array(total);
      let head = 0;
      let tail = 0;
      const enqueue = (pixel) => {
        if (pixel < 0 || pixel >= total || removeMask[pixel] || !candidateMask[pixel] || preserveMask[pixel]) return;
        removeMask[pixel] = 1;
        queue[tail++] = pixel;
      };
      for (let x = 0; x < width; x += 1) {
        enqueue(x);
        enqueue((height - 1) * width + x);
      }
      for (let y = 0; y < height; y += 1) {
        enqueue(y * width);
        enqueue(y * width + width - 1);
      }
      while (head < tail) {
        const current = queue[head++];
        const x = current % width;
        const y = Math.floor(current / width);
        if (x > 0) enqueue(current - 1);
        if (x < width - 1) enqueue(current + 1);
        if (y > 0) enqueue(current - width);
        if (y < height - 1) enqueue(current + width);
      }
    
      if (tail < Math.max(2000, total * 0.025)) return { dataUrl: input, changed: false };
      for (let pixel = 0; pixel < total; pixel += 1) {
        if (!removeMask[pixel]) continue;
        data[pixel * 4 + 3] = 0;
      }
      ctx.putImageData(imageData, 0, 0);
      return {
        dataUrl: canvas.toDataURL("image/png"),
        changed: true,
        reason: "checkerboard-preview",
        removedPixels: tail,
        name: options.name || ""
      };
    }
    
    async function syncAspectRatioForAiRequest(promptText = "", context = state.aiDirect, options = {}) {
      const references = aiRequestReferences(promptText, context);
      const preferred = references.find((item) => ["canvas_focus_region", "uploaded_base", "previous_result_base"].includes(item.role))
        || null;
      if (preferred) {
        let width = Number(preferred.width || preferred.naturalWidth || preferred.focus_target?.naturalWidth || 0);
        let height = Number(preferred.height || preferred.naturalHeight || preferred.focus_target?.naturalHeight || 0);
        if (!width || !height) {
          const dimensions = await loadImageDimensions(preferred.image_file || preferred.url);
          width = Number(dimensions?.width || 0);
          height = Number(dimensions?.height || 0);
        }
        const ratio = closestAspectRatioFromSize(width, height);
        if (ratio) return options.applyToUi === false ? ratio : setAspectRatioValue(ratio, { silent: options.silent });
      }
      return context?.aspectRatio || context?.settings?.aspectRatio || els.aspectRatio?.value || "1:1";
    }
    
    function isAiOutputSizeChangingRequest(promptText = "") {
      return /扩图|outpaint|延展|扩展画面|扩大画布|向(?:上|下|左|右|四周|周围).*扩展|增加留白|补足留白|更多留白|长图|详情页/.test(String(promptText || ""));
    }
    
    function isAiExactEditOutputRequest(promptText = "") {
      const text = String(promptText || "");
      if (isAiOutputSizeChangingRequest(text)) return false;
      if (isAiLocalEditRequest(text)) return true;
      return /截图|界面图|UI图|原图尺寸|保持尺寸|尺寸不变|同尺寸|原尺寸|不要改尺寸|不要改变尺寸|像素不变|改图|修图|编辑|修改|改一下|优化|美化|调整|替换|去掉|去除|删除|换背景/.test(text);
    }
    
    function isValidExactOutputSize(width, height) {
      const w = Math.round(Number(width || 0));
      const h = Math.round(Number(height || 0));
      return Number.isFinite(w)
        && Number.isFinite(h)
        && w >= 16
        && h >= 16
        && w <= 12000
        && h <= 12000
        && w * h <= 80000000;
    }
    
    async function aiExactOutputSizeForRequest(promptText = "", context = state.aiDirect, options = {}) {
      if (isAiOutputSizeChangingRequest(promptText)) return null;
      const explicit = context?.exactOutputSize || null;
      if (isValidExactOutputSize(explicit?.width, explicit?.height)) {
        return {
          width: Math.round(Number(explicit.width)),
          height: Math.round(Number(explicit.height)),
          aspectRatio: closestAspectRatioFromSize(explicit.width, explicit.height),
          sourceName: explicit.sourceName || "图1",
          mode: explicit.source || "ui-exact"
        };
      }
      const references = aiRequestReferences(promptText, context);
      const preferred = references.find((item) => ["canvas_focus_region", "uploaded_base", "previous_result_base"].includes(item.role))
        || null;
      if (!preferred) return null;
      if (!options.force && !isAiExactEditOutputRequest(promptText)) return null;
      let width = Math.round(Number(preferred.width || preferred.naturalWidth || preferred.focus_target?.naturalWidth || 0));
      let height = Math.round(Number(preferred.height || preferred.naturalHeight || preferred.focus_target?.naturalHeight || 0));
      if (!width || !height) {
        const dimensions = await loadImageDimensions(preferred.image_file || preferred.url).catch(() => null);
        width = Math.round(Number(dimensions?.width || 0));
        height = Math.round(Number(dimensions?.height || 0));
      }
      if (!isValidExactOutputSize(width, height)) return null;
      return {
        width,
        height,
        aspectRatio: closestAspectRatioFromSize(width, height),
        sourceName: preferred.name || "图1",
        mode: options.force ? "forced-base" : "edit-base"
      };
    }
    
    async function resizeGeneratedImageToExactSize(image, target = null) {
      const width = Math.round(Number(target?.width || 0));
      const height = Math.round(Number(target?.height || 0));
      if (!image || !isValidExactOutputSize(width, height)) return false;
      let source = image.url || image.image_file || "";
      if (!source) return false;
      if (!String(source).startsWith("data:")) {
        source = await imageUrlToDataUrl(source);
      }
      const loaded = await loadImage(source);
      const sourceWidth = Math.round(Number(loaded.naturalWidth || loaded.width || 0));
      const sourceHeight = Math.round(Number(loaded.naturalHeight || loaded.height || 0));
      if (!sourceWidth || !sourceHeight) return false;
      image.width = width;
      image.height = height;
      image.aspectRatio = closestAspectRatioFromSize(width, height);
      image.exactOutputSize = { width, height, sourceName: target.sourceName || "图1" };
      if (sourceWidth === width && sourceHeight === height) return false;
    
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, width, height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      const containExpand = target?.fit === "contain-expand";
      const scale = containExpand
        ? Math.min(width / sourceWidth, height / sourceHeight)
        : Math.max(width / sourceWidth, height / sourceHeight);
      const drawWidth = sourceWidth * scale;
      const drawHeight = sourceHeight * scale;
      const left = (width - drawWidth) / 2;
      const top = (height - drawHeight) / 2;
      if (containExpand) {
        const right = left + drawWidth;
        const bottom = top + drawHeight;
        if (left > 0) ctx.drawImage(loaded, 0, 0, 1, sourceHeight, 0, top, left, drawHeight);
        if (right < width) ctx.drawImage(loaded, Math.max(0, sourceWidth - 1), 0, 1, sourceHeight, right, top, width - right, drawHeight);
        if (top > 0) ctx.drawImage(loaded, 0, 0, sourceWidth, 1, left, 0, drawWidth, top);
        if (bottom < height) ctx.drawImage(loaded, 0, Math.max(0, sourceHeight - 1), sourceWidth, 1, left, bottom, drawWidth, height - bottom);
        if (left > 0 && top > 0) ctx.drawImage(loaded, 0, 0, 1, 1, 0, 0, left, top);
        if (right < width && top > 0) ctx.drawImage(loaded, Math.max(0, sourceWidth - 1), 0, 1, 1, right, 0, width - right, top);
        if (left > 0 && bottom < height) ctx.drawImage(loaded, 0, Math.max(0, sourceHeight - 1), 1, 1, 0, bottom, left, height - bottom);
        if (right < width && bottom < height) ctx.drawImage(loaded, Math.max(0, sourceWidth - 1), Math.max(0, sourceHeight - 1), 1, 1, right, bottom, width - right, height - bottom);
      }
      ctx.drawImage(loaded, left, top, drawWidth, drawHeight);
      const dataUrl = canvas.toDataURL("image/png");
      const baseName = safeName(String(image.name || "ai-image").replace(/\.[a-z0-9]+$/i, ""));
      image.url = dataUrl;
      image.image_file = dataUrl;
      image.name = `${baseName}.png`;
      image.type = "image/png";
      image.preserveLocal = true;
      image.sizeLocked = true;
      if (target?.detailPageRatio) image.detailPageRatioCorrected = true;
      return true;
    }
    
    async function resizeAiGeneratedImagesToExactSize(images = [], target = null) {
      const list = Array.isArray(images) ? images.filter(Boolean) : [];
      if (!target || !list.length) return list;
      const resizeOne = (image) => resizeGeneratedImageToExactSize(image, target).catch((error) => {
        console.warn("AI 输出尺寸锁定失败", error);
        return false;
      });
      if (target?.sequential) {
        for (const image of list) await resizeOne(image);
      } else {
        await Promise.all(list.map((image) => resizeOne(image)));
      }
      return list;
    }

    return {
      sizeForAspectRatio,
      canvasImageObjectOriginalSize,
      aiReferenceOriginalSizeSource,
      currentAutoOutputSizeSource,
      currentUiExactOutputSize,
      persistAiOutputSizeMode,
      updateStudioSizeInputs,
      activeStudioQuality,
      setStudioQuality,
      setStudioRatio,
      setStudioImageCount,
      handleAiCanvasSizeInput,
      handleStudioSettingsClick,
      syncStudioSettingsPanel,
      modelPresetForCurrentSelection,
      syncStudioModelPanel,
      syncStudioComposerControls,
      handleAiAutoModeToggle,
      handleAiModelPrefsClick,
      updateComposerModelSummary,
      aspectRatioValue,
      aspectRatioCandidatesForCurrentProvider,
      closestAspectRatioFromSize,
      setAspectRatioValue,
      ratioFromCanvasFrame,
      syncAspectRatioFromCanvasFrame,
      imageCacheKey,
      loadImageDimensions,
      imageHasTransparentPixels,
      isLightNeutralTransparentPreviewPixel,
      normalizeCheckerboardPreviewToTransparent,
      syncAspectRatioForAiRequest,
      isAiOutputSizeChangingRequest,
      isAiExactEditOutputRequest,
      isValidExactOutputSize,
      aiExactOutputSizeForRequest,
      resizeGeneratedImageToExactSize,
      resizeAiGeneratedImagesToExactSize
    };
  };
})();
