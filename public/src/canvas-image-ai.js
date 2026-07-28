(function () {
  const app = window.EcommerceCanvasApp = window.EcommerceCanvasApp || {};

  app.createCanvasImageAiController = function createCanvasImageAiController(deps) {
    const {
      els,
      state,
      createClientId,
      fileToDataUrl,
      escapeHtml,
      compactFileName,
      toast,
      setBusy,
      requireLoggedIn,
      handleAuthFailure,
      closestAspectRatioFromSize,
      loadImageDimensions,
      imageHasTransparentPixels,
      ensureActiveAiConversation,
      saveAiConversationNow,
      renderAiGeneratedList,
      renderAiChatList,
      refreshAccount,
      requestAiImageGeneration,
      pollAiImageGeneration,
      extractAiGeneratedImages,
      enrichAiGeneratedImageDimensions,
      resizeAiGeneratedImagesToExactSize,
      currentUserImageModel,
      addAiImageToCanvasAssets,
      createCanvasGenerationPlaceholder,
      replaceCanvasGenerationPlaceholder,
      markCanvasGenerationPlaceholderError,
      updateCanvasGenerationPlaceholderProgress,
      createCanvasAssetBatchLayout,
      focusCanvasObjectList,
      showAiFailureDialog,
      formatApiError,
      formatAiVisibleError,
      formatEmptyAiImageError,
      selectedCanvasImageObject,
      selectedCanvasObject,
      ensureCanvasObjectId,
      canvasObjectToolbarPosition,
      clampCanvasImageAiEditorPosition,
      endCanvasImageAiDrag,
      imageUrlToDataUrl,
      canvasBetaStatus,
      keepCanvasFramesBehind,
      updateCanvasPropsPanel,
      updateCanvasObjectToolbar,
      renderCanvasLayers
    } = deps;

    const canvasAspectRatioCandidates = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "4:5", "5:4", "21:9"];
    const maxCanvasImageAiTotalReferences = 10;
    const maxCanvasImageAiExtraReferences = maxCanvasImageAiTotalReferences - 1;
    function canvasImageAiDisplayBox(width, height, options = {}) {
      const naturalWidth = Math.max(1, Number(width || 1024));
      const naturalHeight = Math.max(1, Number(height || 1024));
      const maxWidth = Math.max(1, Number(options.initialMaxWidth || 1440));
      const maxHeight = Math.max(1, Number(options.initialMaxHeight || 980));
      const scale = Math.min(1, maxWidth / naturalWidth, maxHeight / naturalHeight);
      return {
        width: Math.max(1, naturalWidth * scale),
        height: Math.max(1, naturalHeight * scale)
      };
    }

    const canvasImageAiModelPresets = {
      "imageservice:auto": { provider: "imageservice", thinking: "standard" },
      "imageservice:low": { provider: "imageservice", thinking: "off" },
      "imageservice:medium": { provider: "imageservice", thinking: "standard" },
      "imageservice:medium-deep": { provider: "imageservice", thinking: "deep" }
    };
    const canvasImageAiProviderLabels = {
      imageservice: "图片服务",
      responsesimage: "Responses 出图"
    };

    function canvasImageAiProvider() {
      const provider = String(state.canvasBeta.imageAiEditorProvider || "imageservice").trim();
      return ["imageservice", "responsesimage"].includes(provider) ? provider : "imageservice";
    }

    function canvasImageAiService() {
      state.canvasBeta.imageAiEditorImageApiProvider = "primary";
      return "primary";
    }

    function canvasImageAiServiceLabel() {
      return "自动线路";
    }

    function persistCanvasImageAiPrefs() {
      localStorage.setItem("canvas_image_ai_provider", canvasImageAiProvider());
      localStorage.removeItem("canvas_image_ai_image_api_provider");
    }

    function closeCanvasImageAiPopovers(except = "") {
      if (except !== "model" && els.canvasImageAiModelPanel) els.canvasImageAiModelPanel.hidden = true;
      if (except !== "settings" && els.canvasImageAiSettingsPanel) els.canvasImageAiSettingsPanel.hidden = true;
      if (except !== "model" && els.canvasImageAiModelPrefsBtn) {
        els.canvasImageAiModelPrefsBtn.classList.remove("active");
        els.canvasImageAiModelPrefsBtn.setAttribute("aria-expanded", "false");
      }
      if (except !== "settings" && els.canvasImageAiSettingsBtn) {
        els.canvasImageAiSettingsBtn.classList.remove("active");
        els.canvasImageAiSettingsBtn.setAttribute("aria-expanded", "false");
      }
    }

    function canvasAspectRatioValue(ratioText) {
      const match = String(ratioText || "").match(/(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/);
      if (!match) return 0;
      const width = Number(match[1]);
      const height = Number(match[2]);
      return width > 0 && height > 0 ? width / height : 0;
    }

    function closestCanvasAspectRatioFromSize(width, height) {
      const w = Number(width || 0);
      const h = Number(height || 0);
      if (!w || !h) return "";
      const target = w / h;
      let best = "";
      let bestScore = Infinity;
      canvasAspectRatioCandidates.forEach((ratio) => {
        const value = canvasAspectRatioValue(ratio);
        if (!value) return;
        const score = Math.abs(Math.log(target / value));
        if (score < bestScore) {
          best = ratio;
          bestScore = score;
        }
      });
      return best || closestAspectRatioFromSize?.(w, h) || "1:1";
    }

    function canvasImageAiConfig() {
      const provider = canvasImageAiProvider();
      const central = state.clientConfig?.ai?.providers?.[provider] || {};
      return {
        provider,
        label: canvasImageAiProviderLabels[provider] || "图片服务",
        providerLabel: provider === "imageservice"
          ? `${canvasImageAiProviderLabels[provider] || "图片服务"} · ${canvasImageAiServiceLabel()}`
          : (canvasImageAiProviderLabels[provider] || provider),
        configured: Boolean(central.configured),
        model: currentUserImageModel?.(provider) || central.textModel || "",
        imageModel: currentUserImageModel?.(provider) || "",
        imageApiProvider: canvasImageAiService(),
        imageApiProviderLabel: canvasImageAiServiceLabel(),
        imageApiProviderConfigured: Boolean(central.configured)
      };
    }

    function canvasImageAiThinkingMode() {
      const mode = String(state.canvasBeta.imageAiEditorThinkingMode || "standard").trim().toLowerCase();
      return ["off", "standard", "deep"].includes(mode) ? mode : "standard";
    }

    function canvasImageAiImageSize(object) {
      const mode = String(state.canvasBeta.imageAiEditorImageSize || "auto").trim().toUpperCase();
      if (["1K", "2K", "4K"].includes(mode)) return mode;
      const maxSide = Math.max(
        Number(object?.naturalWidth || 0),
        Number(object?.naturalHeight || 0),
        Number(object?.width || 0),
        Number(object?.height || 0),
        Number(object?.getScaledWidth?.() || 0),
        Number(object?.getScaledHeight?.() || 0)
      );
      return maxSide > 1600 ? "2K" : "1K";
    }

    function canvasImageAiOutputSizeLock(object, reference = {}) {
      const mode = state.canvasBeta.imageAiEditorOutputSizeMode || "auto";
      if (mode === "custom") {
        const width = Math.round(Number(state.canvasBeta.imageAiEditorCustomOutputWidth || els.canvasImageAiWidthInput?.value || 0));
        const height = Math.round(Number(state.canvasBeta.imageAiEditorCustomOutputHeight || els.canvasImageAiHeightInput?.value || 0));
        if (!isValidCanvasExactSize(width, height)) return null;
        return {
          width,
          height,
          aspectRatio: closestCanvasAspectRatioFromSize(width, height),
          sourceName: "画布续改自定义尺寸",
          mode: "canvas-image-ai-custom"
        };
      }
      if (mode !== "auto") return null;
      return canvasImageAiExactOutputSize(object, reference);
    }

    function canvasImageAiAspectRatio(object, reference = {}) {
      const exact = canvasImageAiOutputSizeLock(object, reference);
      if (exact?.aspectRatio) return exact.aspectRatio;
      if (state.canvasBeta.imageAiEditorOutputSizeMode === "preset" && state.canvasBeta.imageAiEditorAspectRatio) {
        return state.canvasBeta.imageAiEditorAspectRatio;
      }
      return reference.aspectRatio || closestCanvasAspectRatioFromSize(
        object?.naturalWidth || reference.width || object?.width || object?.getScaledWidth?.() || 0,
        object?.naturalHeight || reference.height || object?.height || object?.getScaledHeight?.() || 0
      ) || "1:1";
    }

    function isValidCanvasExactSize(width, height) {
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

    function safeCanvasImageAiExactSize(width, height) {
      const w = Math.round(Number(width || 0));
      const h = Math.round(Number(height || 0));
      if (!isValidCanvasExactSize(w, h)) return null;
      const maxSide = 2048;
      const maxPixels = 4200000;
      const scale = Math.min(1, maxSide / w, maxSide / h, Math.sqrt(maxPixels / Math.max(1, w * h)));
      return {
        width: Math.max(16, Math.round(w * scale)),
        height: Math.max(16, Math.round(h * scale))
      };
    }

    function canvasImageAiExactOutputSize(object, reference = {}) {
      const width = Math.round(Number(object?.naturalWidth || reference.width || object?.width || object?.getScaledWidth?.() || 0));
      const height = Math.round(Number(object?.naturalHeight || reference.height || object?.height || object?.getScaledHeight?.() || 0));
      const safeSize = safeCanvasImageAiExactSize(width, height);
      if (!safeSize) return null;
      return {
        width: safeSize.width,
        height: safeSize.height,
        aspectRatio: closestCanvasAspectRatioFromSize(width, height),
        sourceName: object?.name || reference.name || "画布图片",
        mode: "canvas-image-ai"
      };
    }

    function setCanvasImageAiMode(_replaceOriginal, options = {}) {
      if (options.focus !== false) els.canvasImageAiPrompt?.focus();
    }

    async function saveCanvasImageAiConversationTurn(options = {}) {
      if (typeof saveAiConversationNow !== "function") return;
      const prompt = String(options.prompt || "").trim();
      const images = Array.isArray(options.generatedImages) ? options.generatedImages.filter(Boolean) : [];
      if (!prompt || !images.length) return;
      const conversationId = typeof ensureActiveAiConversation === "function"
        ? ensureActiveAiConversation()
        : (state.aiDirect.activeConversationId || createClientId());
      state.aiDirect.activeConversationId = conversationId;
      const now = new Date().toISOString();
      const ai = options.ai || {};
      const imagePayload = options.imagePayload || {};
      const metadata = {
        ...(imagePayload.metadata || imagePayload.meta || imagePayload.data?.metadata || {}),
        workflow: "canvas_image_edit",
        source: "canvas"
      };
      images.forEach((image) => {
        if (image && typeof image === "object") image.prompt = prompt;
      });
      const userMessage = {
        id: createClientId(),
        role: "user",
        text: `画布图片续改：${prompt}`,
        createdAt: now
      };
      const assistantMessage = {
        id: createClientId(),
        role: "assistant",
        text: `${ai.providerLabel || ai.label || "AI"} 画布续改已生成 ${images.length} 张图`,
        images: images.map((image) => ({ ...image })),
        provider: ai.provider || "",
        metadata,
        createdAt: now
      };
      state.aiDirect.chatMessages = [
        ...(Array.isArray(state.aiDirect.chatMessages) ? state.aiDirect.chatMessages : []),
        userMessage,
        assistantMessage
      ];
      state.aiDirect.generatedImages = images.map((image) => ({ ...image }));
      state.aiDirect.references = [];
      state.aiDirect.selectedEditImageKey = "";
      state.aiDirect.useSelectedImageAsBase = false;
      state.aiDirect.canvasFocusTarget = null;
      renderAiGeneratedList?.();
      renderAiChatList?.();
      await saveAiConversationNow({
        snapshot: {
          id: conversationId,
          prompt: "",
          turns: [],
          references: [],
          chatMessages: state.aiDirect.chatMessages,
          generatedImages: state.aiDirect.generatedImages,
          selectedEditImageKey: "",
          useSelectedImageAsBase: false,
          settings: {
            provider: ai.provider || "imageservice",
            imageApiProvider: ai.imageApiProvider || canvasImageAiService(),
            thinkingMode: canvasImageAiThinkingMode(),
            aspectRatio: state.canvasBeta.imageAiEditorAspectRatio || "auto",
            imageSize: state.canvasBeta.imageAiEditorImageSize || "auto",
            imageCount: Number(state.canvasBeta.imageAiEditorImageCount || images.length || 1)
          }
        },
        applyToActive: true
      });
    }

    function logCanvasImageAiFailure(options = {}) {
      const issue = String(options.errorMessage || options.error || "").trim();
      const prompt = String(options.prompt || "").trim();
      if (!issue && !prompt) return;
      const ai = options.ai || {};
      const object = options.object || {};
      fetch("/api/ai/failure-log", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          issue: issue || "画布图片续改失败",
          prompt,
          workflow: "canvas_image_edit",
          aiLabel: `${ai.providerLabel || ai.label || "AI"} 画布续改失败`,
          imageName: object.name || "画布选中图",
          conversationId: state.aiDirect.activeConversationId || ""
        })
      }).catch((error) => console.warn("Canvas image AI failure log failed", error));
    }

    function createCanvasAiApiError(data, fallback = "AI 修改请求失败", status = 0) {
      const error = new Error(formatApiError ? formatApiError(data, fallback) : (data?.error || fallback));
      error.status = Number(status || data?.statusCode || data?.status_code || data?.error?.status || 0);
      error.aiData = data && typeof data === "object" ? data : {};
      error.promptRewriteAvailable = Boolean(error.aiData.promptRewriteAvailable);
      error.errorType = String(error.aiData.errorType || "");
      error.providerAttempts = Array.isArray(error.aiData.providerAttempts) ? error.aiData.providerAttempts : [];
      return error;
    }

    function isCanvasPromptRewriteFailure(error, message = "") {
      const data = error?.aiData && typeof error.aiData === "object" ? error.aiData : {};
      if (data.promptRewriteAvailable || error?.promptRewriteAvailable) return true;
      if (data.errorType === "safety" || error?.errorType === "safety") return true;
      return /内容安全|安全拦截|safety|content policy|policy violation|unsafe|sensitive/i.test(`${message || ""}\n${error?.message || ""}`);
    }

    function parseCanvasPromptRewriteResponse(data, fallbackPrompt = "") {
      if (data && typeof data === "object" && String(data.prompt || "").trim()) {
        return {
          prompt: String(data.prompt || "").trim(),
          reason: String(data.reason || "").trim(),
          changes: Array.isArray(data.changes) ? data.changes.map((item) => String(item || "").trim()).filter(Boolean) : []
        };
      }
      const content = String(data?.content || data?.message || data?.raw || "").trim();
      return { prompt: content || String(fallbackPrompt || "").trim(), reason: "", changes: [] };
    }

    function showCanvasPromptRewriteFailureDialog(errorMessage, options = {}) {
      if (!showAiFailureDialog || !isCanvasPromptRewriteFailure(options.error, errorMessage)) return false;
      const dialogMessage = [
        errorMessage,
        "",
        "可以先让思考模型分析失败原因并自动修改提示词，修改后会放回续改输入框，你确认后再提交。"
      ].join("\n");
      void showAiFailureDialog(dialogMessage, {
        title: "图片续改被安全拦截",
        kicker: "内容安全拦截",
        confirmText: "一键修改提示词",
        cancelText: "取消",
        showCancel: true
      }).then((confirmed) => {
        if (!confirmed) return;
        void rewriteCanvasPromptAfterSafetyFailure(errorMessage, options);
      });
      return true;
    }

    async function rewriteCanvasPromptAfterSafetyFailure(errorMessage, options = {}) {
      const originalPrompt = String(options.prompt || "").trim();
      if (!originalPrompt) {
        toast("缺少原始续改提示词，无法自动修改。");
        return;
      }
      setBusy(true);
      try {
        toast("正在用思考模型分析失败原因...");
        const references = Array.isArray(options.references) ? options.references.slice(0, maxCanvasImageAiTotalReferences) : [];
        const response = await fetch("/api/ai/image-prompt", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mode: "safety_rewrite",
            prompt: originalPrompt,
            final_prompt: options.requestPrompt || "",
            failure_message: errorMessage,
            aspect_ratio: options.context?.aspectRatio || "",
            image_size: options.context?.imageSize || "",
            referenceCount: references.length,
            providerAttempts: options.error?.providerAttempts || options.error?.aiData?.providerAttempts || [],
            references: references.map((image) => ({
              name: image.name || "",
              role: image.role || "",
              width: image.width || 0,
              height: image.height || 0
            }))
          })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw createCanvasAiApiError(data, "提示词自动修改失败", response.status);
        const revised = parseCanvasPromptRewriteResponse(data, originalPrompt);
        const nextPrompt = String(revised.prompt || "").trim();
        if (!nextPrompt) throw new Error("思考模型没有返回可用提示词。");
        if (els.canvasImageAiPrompt) {
          els.canvasImageAiPrompt.value = nextPrompt;
          els.canvasImageAiPrompt.focus();
        }
        const detail = [
          "提示词已修改，请确认后再次提交续改。",
          revised.reason ? `可能原因：${revised.reason}` : "",
          revised.changes?.length ? `修改点：${revised.changes.slice(0, 2).join("；")}` : ""
        ].filter(Boolean).join("\n");
        toast(detail);
      } catch (rewriteError) {
        console.error(rewriteError);
        handleAuthFailure(rewriteError);
        const visible = formatAiVisibleError ? formatAiVisibleError(rewriteError.message, "提示词自动修改失败") : (rewriteError.message || "提示词自动修改失败");
        toast(visible);
        showAiFailureDialog?.(visible, { title: "提示词修改失败" });
      } finally {
        setBusy(false);
      }
    }

    function renderCanvasImageAiControls() {
      if (els.canvasImageAiModelPrefsBtn) {
        els.canvasImageAiModelPrefsBtn.hidden = false;
        els.canvasImageAiModelPrefsBtn.disabled = false;
      }
      if (els.canvasImageAiSettingsBtn) {
        els.canvasImageAiSettingsBtn.hidden = false;
        els.canvasImageAiSettingsBtn.disabled = false;
      }
      const searchDisabled = canvasImageAiThinkingMode() === "off";
      if (searchDisabled) state.canvasBeta.imageAiEditorWebSearchEnabled = false;
      const searchEnabled = Boolean(state.canvasBeta.imageAiEditorWebSearchEnabled);
      if (els.canvasImageAiWebSearchBtn) {
        els.canvasImageAiWebSearchBtn.disabled = searchDisabled;
        els.canvasImageAiWebSearchBtn.classList.toggle("active", searchEnabled);
        els.canvasImageAiWebSearchBtn.classList.toggle("disabled", searchDisabled);
        els.canvasImageAiWebSearchBtn.setAttribute("aria-pressed", searchEnabled ? "true" : "false");
        els.canvasImageAiWebSearchBtn.setAttribute("aria-disabled", searchDisabled ? "true" : "false");
        els.canvasImageAiWebSearchBtn.title = searchDisabled ? "关闭思考时不能联网搜索" : searchEnabled ? "本轮图片续改已开启联网搜索" : "联网搜索";
      }
      renderCanvasImageAiSettingsPanel();
      renderCanvasImageAiModelPanel();
    }
    
    function toggleCanvasImageAiWebSearch(event) {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      if (canvasImageAiThinkingMode() === "off") {
        state.canvasBeta.imageAiEditorWebSearchEnabled = false;
        renderCanvasImageAiControls();
        toast("关闭思考时不能开启联网搜索。");
        return;
      }
      state.canvasBeta.imageAiEditorWebSearchEnabled = !state.canvasBeta.imageAiEditorWebSearchEnabled;
      renderCanvasImageAiControls();
      toast(state.canvasBeta.imageAiEditorWebSearchEnabled ? "本轮图片续改已开启联网搜索。" : "本轮图片续改已关闭联网搜索。");
    }

    function syncCanvasImageAiSizeInputs(object = selectedCanvasImageObject()) {
      if (!els.canvasImageAiWidthInput || !els.canvasImageAiHeightInput) return;
      const exact = canvasImageAiOutputSizeLock(object);
      const fallback = canvasImageAiExactOutputSize(object) || { width: 1024, height: 1024 };
      els.canvasImageAiWidthInput.value = String(Math.round(exact?.width || fallback.width || 1024));
      els.canvasImageAiHeightInput.value = String(Math.round(exact?.height || fallback.height || 1024));
    }

    function renderCanvasImageAiSettingsPanel() {
      const panel = els.canvasImageAiSettingsPanel;
      if (!panel) return;
      panel.querySelectorAll("[data-canvas-image-ai-quality]").forEach((button) => {
        button.classList.toggle("active", button.dataset.canvasImageAiQuality === (state.canvasBeta.imageAiEditorQuality || "auto"));
      });
      panel.querySelectorAll("[data-canvas-image-ai-ratio]").forEach((button) => {
        const ratio = button.dataset.canvasImageAiRatio || "";
        const isAuto = ratio === "auto";
        const active = isAuto
          ? (state.canvasBeta.imageAiEditorOutputSizeMode || "auto") === "auto"
          : state.canvasBeta.imageAiEditorOutputSizeMode === "preset"
            && state.canvasBeta.imageAiEditorAspectRatio === ratio;
        button.classList.toggle("active", active);
      });
      panel.querySelectorAll("[data-canvas-image-ai-count]").forEach((button) => {
        button.classList.toggle("active", Number(button.dataset.canvasImageAiCount || 1) === Number(state.canvasBeta.imageAiEditorImageCount || 1));
      });
      syncCanvasImageAiSizeInputs();
    }

    function renderCanvasImageAiModelPanel() {
      const panel = els.canvasImageAiModelPanel;
      if (!panel) return;
      const provider = canvasImageAiProvider();
      const thinking = canvasImageAiThinkingMode();
      let activePreset = "imageservice:auto";
      if (provider === "imageservice" && thinking === "deep") activePreset = "imageservice:medium-deep";
      else if (provider === "imageservice" && thinking === "off") activePreset = "imageservice:low";
      panel.querySelectorAll("[data-canvas-image-ai-model-preset]").forEach((button) => {
        button.classList.toggle("active", button.dataset.canvasImageAiModelPreset === activePreset);
      });
      if (els.canvasImageAiAutoModeToggle) {
        els.canvasImageAiAutoModeToggle.checked = canvasImageAiThinkingMode() !== "off";
      }
    }

    function handleCanvasImageAiSettingsClick(event) {
      const closeButton = event.target?.closest?.("[data-canvas-image-ai-close]");
      if (closeButton) {
        closeCanvasImageAiPopovers();
        return;
      }
      const qualityButton = event.target?.closest?.("[data-canvas-image-ai-quality]");
      if (qualityButton) {
        const quality = qualityButton.dataset.canvasImageAiQuality || "auto";
        const currentThinking = canvasImageAiThinkingMode();
        state.canvasBeta.imageAiEditorQuality = quality;
        const map = {
          auto: { size: "auto", thinking: "standard" },
          high: { size: "4K", thinking: "standard" },
          medium: { size: "2K", thinking: "standard" },
          low: { size: "1K", thinking: "off" }
        };
        state.canvasBeta.imageAiEditorImageSize = map[quality]?.size || "auto";
        state.canvasBeta.imageAiEditorThinkingMode = quality === "low" ? "off" : currentThinking === "deep" ? "deep" : map[quality]?.thinking || "standard";
        if (state.canvasBeta.imageAiEditorThinkingMode === "off") state.canvasBeta.imageAiEditorWebSearchEnabled = false;
        renderCanvasImageAiControls();
        updateCanvasImageAiMeta(selectedCanvasImageObject());
        return;
      }
      const ratioButton = event.target?.closest?.("[data-canvas-image-ai-ratio]");
      if (ratioButton) {
        const ratio = ratioButton.dataset.canvasImageAiRatio || "auto";
        if (ratio === "auto") {
          state.canvasBeta.imageAiEditorOutputSizeMode = "auto";
          state.canvasBeta.imageAiEditorAspectRatio = "";
        } else {
          state.canvasBeta.imageAiEditorOutputSizeMode = "preset";
          state.canvasBeta.imageAiEditorAspectRatio = ratio;
        }
        if (ratioButton.dataset.canvasImageAiSize) {
          state.canvasBeta.imageAiEditorImageSize = ratioButton.dataset.canvasImageAiSize;
        }
        renderCanvasImageAiControls();
        updateCanvasImageAiMeta(selectedCanvasImageObject());
        return;
      }
      const countButton = event.target?.closest?.("[data-canvas-image-ai-count]");
      if (countButton) {
        state.canvasBeta.imageAiEditorImageCount = Math.max(1, Math.min(10, Number(countButton.dataset.canvasImageAiCount || 1)));
        renderCanvasImageAiControls();
        updateCanvasImageAiMeta(selectedCanvasImageObject());
      }
    }

    function handleCanvasImageAiSizeInput() {
      const width = Math.round(Number(els.canvasImageAiWidthInput?.value || 0));
      const height = Math.round(Number(els.canvasImageAiHeightInput?.value || 0));
      if (isValidCanvasExactSize(width, height)) {
        state.canvasBeta.imageAiEditorOutputSizeMode = "custom";
        state.canvasBeta.imageAiEditorCustomOutputWidth = width;
        state.canvasBeta.imageAiEditorCustomOutputHeight = height;
        state.canvasBeta.imageAiEditorAspectRatio = closestCanvasAspectRatioFromSize(width, height);
      }
      renderCanvasImageAiSettingsPanel();
      updateCanvasImageAiMeta(selectedCanvasImageObject());
    }

    function handleCanvasImageAiModelClick(event) {
      const closeButton = event.target?.closest?.("[data-canvas-image-ai-close]");
      if (closeButton) {
        closeCanvasImageAiPopovers();
        return;
      }
      const tabButton = event.target?.closest?.("[data-canvas-image-ai-model-tab]");
      if (tabButton) {
        const tab = tabButton.dataset.canvasImageAiModelTab || "image";
        els.canvasImageAiModelPanel?.querySelectorAll("[data-canvas-image-ai-model-tab]").forEach((button) => {
          button.classList.toggle("active", button === tabButton);
        });
        els.canvasImageAiModelPanel?.querySelectorAll("[data-canvas-image-ai-model-list]").forEach((list) => {
          list.hidden = list.dataset.canvasImageAiModelList !== tab;
        });
        return;
      }
      const presetButton = event.target?.closest?.("[data-canvas-image-ai-model-preset]");
      if (presetButton && !presetButton.disabled) {
        const preset = canvasImageAiModelPresets[presetButton.dataset.canvasImageAiModelPreset];
        if (!preset) return;
        state.canvasBeta.imageAiEditorProvider = preset.provider;
        if (preset.quality) state.canvasBeta.imageAiEditorQuality = preset.quality;
        if (preset.size) state.canvasBeta.imageAiEditorImageSize = preset.size;
        state.canvasBeta.imageAiEditorThinkingMode = preset.thinking;
        if (state.canvasBeta.imageAiEditorThinkingMode === "off") state.canvasBeta.imageAiEditorWebSearchEnabled = false;
        persistCanvasImageAiPrefs();
        renderCanvasImageAiControls();
        updateCanvasImageAiMeta(selectedCanvasImageObject());
      }
    }

    function handleCanvasImageAiAutoModeToggle() {
      state.canvasBeta.imageAiEditorThinkingMode = els.canvasImageAiAutoModeToggle?.checked ? "standard" : "off";
      if (state.canvasBeta.imageAiEditorThinkingMode === "off") state.canvasBeta.imageAiEditorWebSearchEnabled = false;
      renderCanvasImageAiControls();
      updateCanvasImageAiMeta(selectedCanvasImageObject());
    }
    
    function openCanvasImageAiModelPrefs(event) {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      const willOpen = Boolean(els.canvasImageAiModelPanel?.hidden);
      closeCanvasImageAiPopovers(willOpen ? "model" : "");
      if (!willOpen || !els.canvasImageAiModelPanel) return;
      els.canvasImageAiModelPanel.hidden = false;
      els.canvasImageAiModelPrefsBtn?.classList.add("active");
      els.canvasImageAiModelPrefsBtn?.setAttribute("aria-expanded", "true");
      renderCanvasImageAiControls();
    }
    
    function openCanvasImageAiSettings(event) {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      const willOpen = Boolean(els.canvasImageAiSettingsPanel?.hidden);
      closeCanvasImageAiPopovers(willOpen ? "settings" : "");
      if (!willOpen || !els.canvasImageAiSettingsPanel) return;
      els.canvasImageAiSettingsPanel.hidden = false;
      els.canvasImageAiSettingsBtn?.classList.add("active");
      els.canvasImageAiSettingsBtn?.setAttribute("aria-expanded", "true");
      renderCanvasImageAiControls();
    }
    
    function updateCanvasImageAiMeta(object) {
      if (!els.canvasImageAiMeta) return;
      const width = Math.round(object?.naturalWidth || object?.width || object?.getScaledWidth?.() || 0);
      const height = Math.round(object?.naturalHeight || object?.height || object?.getScaledHeight?.() || 0);
      const ratio = canvasImageAiAspectRatio(object, { width, height });
      const exact = canvasImageAiOutputSizeLock(object, { width, height });
      const size = exact ? `${exact.width}×${exact.height}` : canvasImageAiImageSize(object);
      const refCount = state.canvasBeta.imageAiEditorReferences.length;
      const ai = canvasImageAiConfig();
      const count = Math.max(1, Math.min(10, Number(state.canvasBeta.imageAiEditorImageCount || 1)));
      const thinking = canvasImageAiThinkingMode();
      const thinkingText = thinking === "deep" ? " · Deep" : thinking === "off" ? " · Direct" : "";
      els.canvasImageAiMeta.textContent = `${ai.providerLabel || ai.label}${thinkingText} · ${ratio} · ${count}张 · ${refCount + 1}图 · ${size}`;
      renderCanvasImageAiControls();
    }
    
    function resetCanvasImageAiReferencesForObject(objectId) {
      if (state.canvasBeta.imageAiEditorReferenceObjectId === objectId) return;
      state.canvasBeta.imageAiEditorReferences = [];
      state.canvasBeta.imageAiEditorReferenceObjectId = objectId || "";
      if (els.canvasImageAiReferenceInput) els.canvasImageAiReferenceInput.value = "";
      renderCanvasImageAiReferences();
    }

    function setCanvasImageAiGenerating(isGenerating) {
      if (els.canvasImageAiEditor) els.canvasImageAiEditor.classList.toggle("is-generating", Boolean(isGenerating));
      if (els.canvasImageAiSendBtn) {
        els.canvasImageAiSendBtn.disabled = Boolean(isGenerating);
        els.canvasImageAiSendBtn.setAttribute("aria-busy", isGenerating ? "true" : "false");
      }
      if (els.canvasImageAiPrompt) els.canvasImageAiPrompt.readOnly = Boolean(isGenerating);
    }

    function renderCanvasImageAiReferences() {
      const list = els.canvasImageAiReferenceList;
      if (!list) return;
      const references = state.canvasBeta.imageAiEditorReferences || [];
      if (!references.length) {
        list.hidden = true;
        list.innerHTML = "";
        return;
      }
      list.hidden = false;
      list.innerHTML = references.map((image, index) => `
        <figure>
          <img src="${image.url}" alt="${escapeHtml(image.name || "参考图")}" loading="lazy" decoding="async">
          <figcaption>
            <span>图${index + 2}</span>
            <b title="${escapeHtml(image.name || "参考图")}">${escapeHtml(compactFileName(image.name || "参考图"))}</b>
          </figcaption>
          <button type="button" data-remove-canvas-image-ai-reference="${escapeHtml(image.id)}" aria-label="移除参考图">×</button>
        </figure>
      `).join("");
      list.querySelectorAll("[data-remove-canvas-image-ai-reference]").forEach((button) => {
        button.addEventListener("click", () => {
          state.canvasBeta.imageAiEditorReferences = state.canvasBeta.imageAiEditorReferences.filter((image) => image.id !== button.dataset.removeCanvasImageAiReference);
          renderCanvasImageAiReferences();
          updateCanvasImageAiMeta(selectedCanvasImageObject());
        });
      });
    }

    function canvasImageAiObjectViewportPoints(object, canvas) {
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

    function canvasImageAiEditorAutoPosition(object, editor) {
      const canvas = state.canvasBeta.canvas;
      const wrap = els.canvasStageWrap;
      const canvasElement = canvas?.upperCanvasEl || canvas?.lowerCanvasEl;
      if (!canvas || !wrap || !canvasElement || !object) return null;
      object.setCoords?.();
      const points = canvasImageAiObjectViewportPoints(object, canvas);
      if (!points.length) return null;
      const canvasRect = canvasElement.getBoundingClientRect();
      const wrapRect = wrap.getBoundingClientRect();
      const useCamera = state.canvasBeta.cameraMode !== false;
      const scrollLeft = useCamera ? 0 : wrap.scrollLeft;
      const scrollTop = useCamera ? 0 : wrap.scrollTop;
      const offsetLeft = canvasRect.left - wrapRect.left + scrollLeft;
      const offsetTop = canvasRect.top - wrapRect.top + scrollTop;
      const minX = offsetLeft + Math.min(...points.map((point) => point.x));
      const maxX = offsetLeft + Math.max(...points.map((point) => point.x));
      const minY = offsetTop + Math.min(...points.map((point) => point.y));
      const maxY = offsetTop + Math.max(...points.map((point) => point.y));
      const visibleLeft = scrollLeft + 18;
      const visibleRight = scrollLeft + wrap.clientWidth - 18;
      const visibleTop = scrollTop + 18;
      const visibleBottom = scrollTop + wrap.clientHeight - 18;
      const width = Math.max(320, editor.offsetWidth || 0);
      const height = Math.max(150, editor.offsetHeight || 0);
      const gap = 16;
      const clampLeft = (value) => Math.max(visibleLeft + width / 2, Math.min(visibleRight - width / 2, value));
      const clampTop = (value) => Math.max(visibleTop, Math.min(visibleBottom - height, value));
      let left = clampLeft((minX + maxX) / 2);
      let top = maxY + gap;
      let placement = "below";
      if (top + height <= visibleBottom) return { left, top, placement };

      const aboveTop = minY - height - gap;
      if (aboveTop >= visibleTop) return { left, top: aboveTop, placement: "above" };

      const sideTop = clampTop((minY + maxY) / 2 - height / 2);
      const rightCenter = maxX + gap + width / 2;
      if (rightCenter + width / 2 <= visibleRight) return { left: rightCenter, top: sideTop, placement: "right" };

      const leftCenter = minX - gap - width / 2;
      if (leftCenter - width / 2 >= visibleLeft) return { left: leftCenter, top: sideTop, placement: "left" };

      return { left, top: clampTop(top), placement: "float" };
    }
    
    function openCanvasImageAiReferencePicker(event) {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      const object = selectedCanvasImageObject();
      if (!object) {
        toast("请先选中画布上的图片。");
        return;
      }
      closeCanvasImageAiPopovers();
      if (!els.canvasImageAiReferenceInput) {
        toast("画布续改上传入口没有准备好。");
        return;
      }
      try {
        els.canvasImageAiReferenceInput.value = "";
        els.canvasImageAiReferenceInput.focus?.({ preventScroll: true });
        els.canvasImageAiReferenceInput.click();
        canvasBetaStatus("画布续改：请选择参考图。");
      } catch (error) {
        console.error(error);
        toast("画布续改上传入口打开失败，请拖拽或粘贴参考图。");
      }
    }

    async function handleCanvasImageAiReferenceInput(event) {
      const object = selectedCanvasImageObject();
      if (!object) {
        toast("请先选中画布上的图片。");
        if (event.target) event.target.value = "";
        return;
      }
      const selectedFiles = Array.from(event.target?.files || []);
      if (!selectedFiles.length) return;
      const allowedTypes = new Set(["image/png", "image/jpeg"]);
      const files = selectedFiles.filter((file) => allowedTypes.has(file.type));
      if (!files.length) {
        toast("参考图只支持 JPG / PNG。");
        if (event.target) event.target.value = "";
        return;
      }
      const objectId = ensureCanvasObjectId(object);
      resetCanvasImageAiReferencesForObject(objectId);
      const currentCount = state.canvasBeta.imageAiEditorReferences.length;
      const availableCount = Math.max(0, maxCanvasImageAiExtraReferences - currentCount);
      if (availableCount <= 0) {
        toast(`画布续改最多支持 ${maxCanvasImageAiExtraReferences} 张补充参考图，请先删除多余图片。`);
        if (event.target) event.target.value = "";
        return;
      }
      const acceptedFiles = files.slice(0, availableCount);
      if (acceptedFiles.length < files.length) {
        toast(`当前选中图会作为图1，补充参考图最多 ${maxCanvasImageAiExtraReferences} 张，本次只加入前 ${acceptedFiles.length} 张。`);
      }
      setBusy(true);
      try {
        const images = await Promise.all(acceptedFiles.map(async (file) => {
          const url = await fileToDataUrl(file);
          const dimensions = await loadImageDimensions(url).catch(() => null);
          const width = Number(dimensions?.width || 0);
          const height = Number(dimensions?.height || 0);
          const isPng = /^image\/png/i.test(file.type || "") || /\.png$/i.test(file.name || "");
          const hasAlpha = isPng && await imageHasTransparentPixels(url).catch(() => false);
          return {
            id: createClientId(),
            name: file.name,
            size: file.size,
            type: file.type,
            url,
            width,
            height,
            hasAlpha,
            aspectRatio: closestCanvasAspectRatioFromSize(width, height),
            role: "reference"
          };
        }));
        state.canvasBeta.imageAiEditorReferences.push(...images);
        renderCanvasImageAiReferences();
        updateCanvasImageAiMeta(object);
        toast(`已加入 ${images.length} 张参考图，可在小框里说图2。`);
      } catch (error) {
        console.error(error);
        toast(error.message || "参考图读取失败。");
      } finally {
        setBusy(false);
        if (event.target) event.target.value = "";
      }
    }

    function canvasImageAiEventImageFiles(event) {
      const transfer = event?.dataTransfer || event?.clipboardData;
      return Array.from(transfer?.files || []).filter((file) => /^image\/(png|jpeg)$/i.test(file.type || ""));
    }

    function handleCanvasImageAiReferencePaste(event) {
      const files = canvasImageAiEventImageFiles(event);
      if (!files.length) return;
      event.preventDefault();
      event.stopPropagation();
      handleCanvasImageAiReferenceInput({ target: { files, value: "" } });
    }

    function handleCanvasImageAiReferenceDragOver(event) {
      const hasImage = Array.from(event?.dataTransfer?.items || []).some((item) => /^image\/(png|jpeg)$/i.test(item.type || ""));
      if (!hasImage) return;
      event.preventDefault();
      event.stopPropagation();
      els.canvasImageAiEditor?.classList.add("is-drag-over");
    }

    function handleCanvasImageAiReferenceDragLeave(event) {
      if (event?.currentTarget?.contains?.(event.relatedTarget)) return;
      els.canvasImageAiEditor?.classList.remove("is-drag-over");
    }

    function handleCanvasImageAiReferenceDrop(event) {
      const files = canvasImageAiEventImageFiles(event);
      if (!files.length) return;
      event.preventDefault();
      event.stopPropagation();
      els.canvasImageAiEditor?.classList.remove("is-drag-over");
      handleCanvasImageAiReferenceInput({ target: { files, value: "" } });
    }
    
    function updateCanvasImageAiEditor() {
      const editor = els.canvasImageAiEditor;
      const object = selectedCanvasImageObject();
      const canvas = state.canvasBeta.canvas;
      if (!editor || !canvas || !object) {
        if (editor) editor.hidden = true;
        return;
      }
      const id = ensureCanvasObjectId(object);
      resetCanvasImageAiReferencesForObject(id);
      if (state.canvasBeta.imageAiEditorCollapsedForId === id) {
        editor.hidden = true;
        return;
      }
      const placement = canvasImageAiEditorAutoPosition(object, editor) || canvasObjectToolbarPosition(object, editor);
      if (!placement) {
        editor.hidden = true;
        return;
      }
      editor.hidden = false;
      const manual = state.canvasBeta.imageAiEditorManualPosition;
      const next = manual?.objectId === id
        ? clampCanvasImageAiEditorPosition(manual.left, manual.top)
        : clampCanvasImageAiEditorPosition(placement.left, placement.top);
      editor.style.left = `${Math.round(next.left)}px`;
      editor.style.top = `${Math.round(next.top)}px`;
      editor.dataset.placement = manual?.objectId === id ? "manual" : placement.placement || "below";
      editor.dataset.objectId = id;
      updateCanvasImageAiMeta(object);
      setCanvasImageAiMode(false, { focus: false });
    }
    
    function hideCanvasImageAiEditor(options = {}) {
      const object = selectedCanvasImageObject();
      if (options.collapse && object) state.canvasBeta.imageAiEditorCollapsedForId = ensureCanvasObjectId(object);
      endCanvasImageAiDrag();
      if (els.canvasImageAiEditor) els.canvasImageAiEditor.hidden = true;
    }
    
    function resetCanvasImageAiEditorCollapse(object = selectedCanvasObject()) {
      const objectId = object ? ensureCanvasObjectId(object) : "";
      if (!objectId || objectId !== state.canvasBeta.imageAiEditorCollapsedForId) {
        state.canvasBeta.imageAiEditorCollapsedForId = "";
      }
      if (!objectId || state.canvasBeta.imageAiEditorManualPosition?.objectId !== objectId) {
        state.canvasBeta.imageAiEditorManualPosition = null;
      }
    }
    
    async function canvasImageObjectReference(object) {
      const source = object?.srcUrl || object?.getSrc?.();
      if (!source) throw new Error("当前图片没有可用地址。");
      const imageFile = String(source).startsWith("data:") ? source : await imageUrlToDataUrl(source);
      const dimensions = await loadImageDimensions(imageFile).catch(() => null);
      const width = Math.round(object.naturalWidth || dimensions?.width || object.width || object.getScaledWidth?.() || 0);
      const height = Math.round(object.naturalHeight || dimensions?.height || object.height || object.getScaledHeight?.() || 0);
      return {
        id: `canvas-image-${ensureCanvasObjectId(object)}`,
        name: object.name || "画布图片",
        image_file: imageFile,
        width,
        height,
        aspectRatio: closestCanvasAspectRatioFromSize(width, height),
        role: "uploaded_base"
      };
    }
    
    async function submitCanvasImageAiEdit(options = {}) {
      if (!requireLoggedIn()) return;
      const object = selectedCanvasImageObject();
      if (!object) {
        toast("请先选中画布上的图片。");
        return;
      }
      const prompt = String(els.canvasImageAiPrompt?.value || "").trim();
      if (!prompt) {
        toast("请先描述怎么修改这张图。");
        els.canvasImageAiPrompt?.focus();
        return;
      }
      const ai = canvasImageAiConfig();
      if (!ai.configured) {
        toast(`中控未配置 ${ai.providerLabel || ai.label} API Key，画布续改暂不可用。`);
        return;
      }
      setCanvasImageAiGenerating(true);
      setBusy(true);
      let canvasPlaceholderId = "";
      let rewriteFailureContext = null;
      try {
        const reference = await canvasImageObjectReference(object);
        const extraReferences = (state.canvasBeta.imageAiEditorReferences || []).slice(0, maxCanvasImageAiExtraReferences).map((image, index) => ({
          id: image.id || createClientId(),
          name: image.name || `\u53c2\u8003\u56fe ${index + 2}`,
          image_file: image.url,
          width: image.width || 0,
          height: image.height || 0,
          aspect_ratio: image.aspectRatio || "",
          role: "uploaded_reference"
        })).filter((image) => image.image_file);
        const finalPrompt = [
          "\u7528\u6237\u6b63\u5728\u7f16\u8f91\u753b\u5e03\u4e2d\u9009\u4e2d\u7684\u8fd9\u5f20\u56fe\u7247\u3002\u8fd9\u662f\u660e\u786e\u7684\u56fe\u751f\u56fe\u4fee\u6539\u4efb\u52a1\uff1b\u56fe1 \u662f\u753b\u5e03\u5f53\u524d\u9009\u4e2d\u56fe\u3002",
          extraReferences.length ? `\u7528\u6237\u8fd8\u4e0a\u4f20\u4e86 ${extraReferences.length} \u5f20\u53c2\u8003\u56fe\uff0c\u4ece\u56fe2\u5f00\u59cb\u7f16\u53f7\u3002` : "",
          "\u8bf7\u53ea\u56f4\u7ed5\u672c\u8f6e\u8981\u6c42\u4fee\u6539\uff0c\u5c3d\u91cf\u4fdd\u7559\u672a\u63d0\u5230\u7684\u4e3b\u4f53\u3001\u7248\u5f0f\u3001\u6587\u5b57\u548c\u6bd4\u4f8b\u3002",
          "\u672c\u8f6e\u8f93\u51fa\u662f\u4e00\u5f20\u65b0\u7684\u7eed\u6539\u7ed3\u679c\u56fe\uff0c\u4e0d\u8981\u628a\u5b83\u7406\u89e3\u4e3a\u8986\u76d6\u539f\u56fe\u3002",
          `\u7528\u6237\u9700\u6c42\uff1a${prompt}`
        ].filter(Boolean).join("\n");
        const requestPrompt = finalPrompt;
        canvasBetaStatus("\u6b63\u5728 AI \u4fee\u6539\u9009\u4e2d\u56fe\u7247...");
        const outputSizeLock = canvasImageAiOutputSizeLock(object, reference);
        const requestedCount = Math.max(1, Math.min(10, Number(state.canvasBeta.imageAiEditorImageCount || 1)));
        const context = {
          references: [],
          explicitReferences: [reference, ...extraReferences],
          canvasFocusTarget: null,
          selectedEditImageKey: "",
          useSelectedImageAsBase: false,
          webSearchEnabled: Boolean(state.canvasBeta.imageAiEditorWebSearchEnabled),
          thinkingMode: canvasImageAiThinkingMode(),
          imageCount: requestedCount,
          imageSize: canvasImageAiImageSize(object),
          aspectRatio: canvasImageAiAspectRatio(object, reference),
          exactOutputSize: outputSizeLock,
          workflow: "canvas_image_edit"
        };
        rewriteFailureContext = {
          prompt,
          requestPrompt,
          references: [reference, ...extraReferences],
          context
        };
        canvasPlaceholderId = await createCanvasGenerationPlaceholder({
          prompt,
          provider: ai.providerLabel || ai.provider || "AI",
          count: requestedCount,
          aspectRatio: outputSizeLock?.aspectRatio || context.aspectRatio,
          besideObject: object,
          subtitle: "图片续改生成中"
        });
        const response = await requestAiImageGeneration(ai, requestPrompt, context);
        let data = await response.json();
        if (!response.ok) {
          console.warn("Canvas image AI request failed", data);
          throw createCanvasAiApiError(data, "\u0041\u0049 \u4fee\u6539\u8bf7\u6c42\u5931\u8d25", response.status);
        }
        if (response.status === 202 && data.statusUrl) {
          data = await pollAiImageGeneration(data.statusUrl, "canvas-image-ai-edit", {
            renderStatus: false,
            onProgress: (progress) => updateCanvasGenerationPlaceholderProgress(progress, canvasPlaceholderId)
          });
        }
        const imagePayload = data.data || data;
        const imageMetadata = imagePayload?.metadata || {};
        const partialFailureMessage = Number(imageMetadata.failedCount ?? imageMetadata.failed_count ?? 0) > 0
          && Array.isArray(imageMetadata.errors)
          ? imageMetadata.errors.slice(0, 2).join("；")
          : "";
        const generatedImages = extractAiGeneratedImages(imagePayload, requestedCount);
        if (!generatedImages.length) throw new Error(formatEmptyAiImageError(imagePayload));
        await resizeAiGeneratedImagesToExactSize(generatedImages, outputSizeLock);
        const finalImages = generatedImages;
        await enrichAiGeneratedImageDimensions(finalImages);
        saveCanvasImageAiConversationTurn({
          prompt,
          generatedImages: finalImages,
          ai,
          imagePayload
        }).catch((error) => console.warn("Canvas image AI history save failed", error));
        let insertedObject = null;
        const insertedObjects = [];
        const remainingImages = canvasPlaceholderId
          ? await replaceCanvasGenerationPlaceholder(canvasPlaceholderId, finalImages)
          : finalImages;
        const placeholderResult = state.canvasBeta.canvas?.getActiveObject?.();
        if (canvasPlaceholderId && placeholderResult && placeholderResult !== object && placeholderResult.objectType === "image") {
          insertedObject = placeholderResult;
          insertedObjects.push(placeholderResult);
        }
        const resultLayout = remainingImages.length && typeof createCanvasAssetBatchLayout === "function"
          ? createCanvasAssetBatchLayout({ anchorObject: insertedObject || object, maxColumns: 2, layoutGap: 72, continueFromAnchor: true })
          : null;
        for (let index = 0; index < remainingImages.length; index += 1) {
          const imageWidth = Number(remainingImages[index]?.width || object.getScaledWidth?.() || object.width || 1024);
          const imageHeight = Number(remainingImages[index]?.height || object.getScaledHeight?.() || object.height || 1024);
          const displaySize = canvasImageAiDisplayBox(imageWidth, imageHeight, {
            initialMaxWidth: 1440,
            initialMaxHeight: 980
          });
          const result = await addAiImageToCanvasAssets(remainingImages[index], {
          silent: true,
          status: "正在把 AI 修改结果放入画布...",
          fitFrame: false,
          point: resultLayout ? resultLayout.next(displaySize) : undefined,
          staggerIndex: index,
          focusOnCanvas: false,
          initialMaxWidth: 1440,
          initialMaxHeight: 980,
          name: `${object.name || "图片"} AI 续改`
        });
          if (result?.object) {
            insertedObject = result.object;
            insertedObjects.push(result.object);
          }
        }
        if (insertedObjects.length && typeof focusCanvasObjectList === "function") {
          focusCanvasObjectList(insertedObjects, { padding: 180, behavior: "smooth" });
        }
        const canvas = state.canvasBeta.canvas;
        if (insertedObject && canvas) {
          canvas.setActiveObject(insertedObject);
          state.canvasBeta.imageAiEditorCollapsedForId = "";
          state.canvasBeta.imageAiEditorManualPosition = null;
          keepCanvasFramesBehind();
          canvas.requestRenderAll();
        }
        if (els.canvasImageAiPrompt) els.canvasImageAiPrompt.value = "";
        if (insertedObject) setCanvasImageAiGenerating(false);
        updateCanvasPropsPanel();
        updateCanvasObjectToolbar();
        renderCanvasLayers();
        refreshAccount?.();
        canvasBetaStatus("AI 续改结果已放在当前图旁边，可继续在小框里修改新图。");
        toast(partialFailureMessage ? `部分图片生成失败：${partialFailureMessage}` : "已基于当前图生成新图。");
      } catch (error) {
        console.error(error);
        handleAuthFailure(error);
        const errorMessage = formatAiVisibleError ? formatAiVisibleError(error.message, "AI 修改图片失败") : (error.message || "请检查后台模型配置后重试");
        if (canvasPlaceholderId) markCanvasGenerationPlaceholderError(canvasPlaceholderId, errorMessage);
        if (!String(error?.aiData?.jobId || "").trim()) {
          logCanvasImageAiFailure({ prompt, errorMessage, ai, object });
        }
        canvasBetaStatus("AI 修改图片失败。");
        toast(errorMessage);
        if (!showCanvasPromptRewriteFailureDialog(errorMessage, {
          ...rewriteFailureContext,
          error
        })) {
          showAiFailureDialog?.(errorMessage, { title: "图片续改失败" });
        }
      } finally {
        setCanvasImageAiGenerating(false);
        setBusy(false);
      }
    }

    return {
      setCanvasImageAiMode,
      renderCanvasImageAiControls,
      toggleCanvasImageAiWebSearch,
      openCanvasImageAiModelPrefs,
      openCanvasImageAiSettings,
      openCanvasImageAiReferencePicker,
      handleCanvasImageAiSettingsClick,
      handleCanvasImageAiSizeInput,
      handleCanvasImageAiModelClick,
      handleCanvasImageAiAutoModeToggle,
      updateCanvasImageAiMeta,
      resetCanvasImageAiReferencesForObject,
      renderCanvasImageAiReferences,
      handleCanvasImageAiReferenceInput,
      handleCanvasImageAiReferencePaste,
      handleCanvasImageAiReferenceDragOver,
      handleCanvasImageAiReferenceDragLeave,
      handleCanvasImageAiReferenceDrop,
      updateCanvasImageAiEditor,
      hideCanvasImageAiEditor,
      resetCanvasImageAiEditorCollapse,
      canvasImageObjectReference,
      submitCanvasImageAiEdit
    };
  };
})();
