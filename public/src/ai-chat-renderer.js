(function () {
  const app = window.EcommerceCanvasApp = window.EcommerceCanvasApp || {};

  app.createAiChatRendererController = function createAiChatRendererController(deps) {
    const {
      els,
      state,
      escapeHtml,
      compactFileName,
      downloadDataUrl,
      addAiImageToCanvasAssets,
      toast,
      promptWorkspaceDialog,
      updateCanvasObjectToolbar,
      aiRequestReferences,
      updateCanvasGenerationPlaceholderProgress,
      updateSummary,
      saveAiConversationNow,
      handleAuthFailure
    } = deps;
    const tr = (key, fallback = "") => window.EcommerceCanvasI18n?.t(key, fallback) || fallback || key;

    function renderAiGeneratedList() {
      renderAiChatList();
      updateSummary();
    }

    function hasAiPanelContent() {
      return Boolean(els.aiChatList?.querySelector?.(
        ".ai-chat-message, .ai-result-desk, .ai-generation-status-row"
      ));
    }

    function scrollAiPanelToLatest() {
      const scroll = () => {
        const panelScroll = els.studioPanelScroll || els.aiChatList?.closest?.(".studio-panel-scroll");
        if (!hasAiPanelContent()) {
          if (els.aiChatList) els.aiChatList.scrollTop = 0;
          if (panelScroll) panelScroll.scrollTop = 0;
          return;
        }
        if (els.aiChatList) els.aiChatList.scrollTop = els.aiChatList.scrollHeight;
        els.aiChatList?.lastElementChild?.scrollIntoView?.({ block: "end", inline: "nearest" });
        if (panelScroll) panelScroll.scrollTop = panelScroll.scrollHeight;
      };
      requestAnimationFrame(() => {
        scroll();
        window.setTimeout(scroll, 80);
        window.setTimeout(scroll, 350);
        window.setTimeout(scroll, 900);
        window.setTimeout(scroll, 1600);
        window.setTimeout(scroll, 2200);
      });
    }

    function formatAiImageMeta(image = {}) {
      const width = Number(image.width || image.naturalWidth || 0);
      const height = Number(image.height || image.naturalHeight || 0);
      const size = width && height ? `${Math.round(width)}×${Math.round(height)}` : "";
      const type = String(image.type || image.mime || "").replace(/^image\//i, "").toUpperCase();
      return [size, type].filter(Boolean).join(" · ") || "结果图";
    }

    function firstTextValue(...values) {
      for (const value of values) {
        const text = String(value || "").trim();
        if (text) return text;
      }
      return "";
    }

    async function copyTextToClipboard(value) {
      const text = String(value || "").trim();
      if (!text) throw new Error("没有可复制的提示词");
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none";
      document.body.append(textarea);
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
      const copied = document.execCommand("copy");
      textarea.remove();
      if (copied) return;
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
      }
      throw new Error("复制失败，请手动选择提示词");
    }

    function promptForGeneratedImage(message = {}, image = {}, allMessages = []) {
      const direct = firstTextValue(
        image.prompt,
        image.originalPrompt,
        image.original_prompt,
        message.prompt,
        message.originalPrompt,
        message.original_prompt,
        message.metadata?.originalPrompt,
        message.metadata?.original_prompt,
        message.metadata?.prompt,
        message.metadata?.imagePrompt,
        message.metadata?.image_prompt
      );
      if (direct) return direct;
      const messageIndex = allMessages.indexOf(message);
      for (let index = messageIndex - 1; index >= 0; index -= 1) {
        const candidate = allMessages[index];
        if (candidate?.role === "user" && candidate.text) return String(candidate.text || "").trim();
      }
      return "";
    }

    function renderImageFeedbackControls(message = {}, image = {}, key = "", index = 0, allMessages = []) {
      const feedback = image.feedback || {};
      const rating = feedback.rating || "";
      const issue = String(feedback.issue || "").trim();
      const issueText = rating === "down" && issue ? `<span title="${escapeHtml(issue)}">${escapeHtml(issue)}</span>` : "";
      return `
        <div class="ai-image-feedback" data-ai-feedback-card="${escapeHtml(key)}">
          <button class="${rating === "up" ? "active" : ""}" type="button" data-ai-feedback-up="${escapeHtml(key)}" title="这张图效果不错">点赞</button>
          <button class="${rating === "down" ? "active danger" : ""}" type="button" data-ai-feedback-down="${escapeHtml(key)}" title="这张图有问题，填写吐槽">鄙视</button>
          ${issueText}
        </div>
      `;
    }

    async function submitImageFeedback(key, rating) {
      const image = findGeneratedImage(key);
      if (!image) return;
      const value = String(key || "");
      const [messageId, rawIndex] = value.split(":");
      const parsedImageIndex = Math.floor(Number(rawIndex || 0));
      const imageIndex = Number.isFinite(parsedImageIndex) && parsedImageIndex >= 0 ? parsedImageIndex : 0;
      const message = (state.aiDirect.chatMessages || []).find((item) => item.id === messageId) || {};
      let issue = "";
      if (rating === "down") {
        issue = await promptWorkspaceDialog?.("这张图哪里不好？写一句问题，后台会每周汇总。", {
          title: "填写吐槽原因",
          kicker: "出图反馈",
          defaultValue: image.feedback?.issue || "",
          placeholder: "例如：主体没按图1、文字变形、风格不对...",
          confirmText: "提交"
        }) || "";
        issue = issue.trim();
        if (!issue) return;
      }
      try {
        const response = await fetch("/api/ai/feedback", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            rating,
            issue,
            conversationId: state.aiDirect.activeConversationId,
            messageId,
            imageIndex,
            prompt: promptForGeneratedImage(message, image, state.aiDirect.chatMessages || []),
            imageName: image.name || "",
            imageUrl: image.url || "",
            aiLabel: message.skill || image.provider || image.model || "",
            workflow: message.metadata?.workflow || image.workflow || ""
          })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (response.status === 401) handleAuthFailure?.(data);
          throw new Error(data.error || "反馈提交失败");
        }
        image.feedback = {
          rating,
          issue,
          updatedAt: new Date().toISOString()
        };
        renderAiChatList();
        toast(rating === "up" ? "已记录点赞。" : "已记录吐槽，后台会进入一周汇总。");
        saveAiConversationNow?.({ applyToActive: false }).catch((error) => console.warn("AI feedback conversation save failed", error));
      } catch (error) {
        toast(error?.message || "反馈提交失败，请稍后再试。");
      }
    }

    function renderAiErrorCard(message = "") {
      return `
        <div class="ai-error-card" role="alert">
          <span>生成失败</span>
          <b>${escapeHtml(message || "这次没有拿到可用结果")}</b>
          <small>检查提示词、图片尺寸或后台模型配置后再试。</small>
        </div>
      `;
    }

    function aiResultCardHtml(message, image, imageIndex, allMessages, versionLabel, options = {}) {
      const key = `${message.id}:${imageIndex}`;
      const imageName = image.name || `AI 生图 ${imageIndex + 1}`;
      const metaText = formatAiImageMeta(image);
      const moduleIndex = Number(image.designPlanModule?.index || imageIndex + 1);
      const moduleTitle = image.designPlanModule?.title || imageName;
      if (options.compact) {
        return `
          <article class="ai-chat-image-card ai-batch-card">
            <button class="ai-preview-trigger" type="button" data-ai-preview="${escapeHtml(key)}" title="预览第 ${moduleIndex} 屏">
              <img src="${image.url}" alt="${escapeHtml(moduleTitle)}" loading="lazy" decoding="async">
            </button>
            <div class="ai-image-card-meta">
              <div>
                <span>${options.detail ? `第 ${moduleIndex} 屏` : `#${moduleIndex}`}</span>
                <b title="${escapeHtml(moduleTitle)}">${escapeHtml(moduleTitle)}</b>
              </div>
              <small>${escapeHtml(metaText)}</small>
            </div>
            <div class="card-actions ai-batch-card-actions">
              <button class="secondary strong" type="button" data-ai-add-canvas="${escapeHtml(key)}">放画布</button>
              <button class="secondary" type="button" data-ai-download="${escapeHtml(key)}">下载</button>
            </div>
          </article>
        `;
      }
      const promptText = promptForGeneratedImage(message, image, allMessages);
      const feedbackHtml = renderImageFeedbackControls(message, image, key, imageIndex, allMessages);
      const downloadLabel = image.mergedDetailPage ? "下载合成长图" : "下载";
      const mergedPartCount = Math.max(1, Number(image.mergedDetailPagePartCount || 1));
      const mergedPartIndex = Math.max(1, Number(image.mergedDetailPagePart || 1));
      const downloadText = image.mergedDetailPage && mergedPartCount > 1
        ? `${downloadLabel} ${mergedPartIndex}/${mergedPartCount}`
        : downloadLabel;
      const promptHtml = promptText ? `
        <p class="ai-image-prompt-record">
          <span class="ai-image-prompt-head">
            <b>提示词</b>
            <button class="ai-copy-prompt-button" type="button" data-ai-copy-prompt title="复制提示词" aria-label="复制提示词">
              <span class="workspace-icon ri-copy" aria-hidden="true"></span>
            </button>
          </span>
          <span class="ai-image-prompt-text">${escapeHtml(promptText)}</span>
        </p>
      ` : "";
      return `
        <article class="ai-chat-image-card">
          <button class="ai-preview-trigger" type="button" data-ai-preview="${escapeHtml(key)}" title="预览结果">
            <img src="${image.url}" alt="${escapeHtml(imageName)}" loading="lazy" decoding="async">
          </button>
          <div class="ai-image-card-meta">
            <div>
              <span>${escapeHtml(versionLabel || `#${imageIndex + 1}`)}</span>
              <b title="${escapeHtml(imageName)}">${escapeHtml(imageName)}</b>
            </div>
            <small>${escapeHtml(metaText)}</small>
          </div>
          ${feedbackHtml}
          ${promptHtml}
          <div class="card-actions ai-card-result-actions">
            <button class="secondary strong" type="button" data-ai-add-canvas="${escapeHtml(key)}">放到画布</button>
            <button class="secondary" type="button" data-ai-edit-canvas="${escapeHtml(key)}">续改</button>
            <button class="secondary" type="button" data-ai-download="${escapeHtml(key)}" title="${downloadText}">${downloadText}</button>
            <button class="secondary" type="button" data-ai-preview="${escapeHtml(key)}">更多</button>
          </div>
        </article>
      `;
    }

    function renderAiMessageImages(message, images, allMessages, versionLabel) {
      const indexedImages = images.map((image, index) => ({ image, index }));
      const mergedImages = indexedImages.filter((entry) => entry.image.mergedDetailPage);
      const screenImages = indexedImages.filter((entry) => !entry.image.mergedDetailPage);
      const metadata = message.metadata || {};
      const isDetail = Boolean(metadata.detailPageWorkflow || screenImages.some((entry) => entry.image.designPlanModule));
      const isBatch = screenImages.length > 1;
      if (!isBatch) {
        return `<div class="ai-chat-images">${indexedImages.map(({ image, index }) => aiResultCardHtml(message, image, index, allMessages, versionLabel)).join("")}</div>`;
      }
      const failedModules = Array.isArray(metadata.failedModules) ? metadata.failedModules : [];
      const failedCount = Math.max(Number(metadata.failedCount || 0), failedModules.length);
      const successCount = Math.max(Number(metadata.successCount || 0), screenImages.length);
      const requestedCount = Math.max(Number(metadata.requestedCount || metadata.detailPageScreenCount || 0), successCount + failedCount);
      const unit = isDetail ? "屏" : "张";
      const completionClass = failedCount > 0 || successCount < requestedCount ? "partial" : "complete";
      return `
        <section class="ai-result-desk ${isDetail ? "detail-result" : "batch-result"}" data-ai-result-message="${escapeHtml(message.id)}">
          <div class="ai-result-desk-head">
            <div>
              <small>${isDetail ? "DETAIL PAGE" : "BATCH RESULT"}</small>
              <b>${successCount}/${requestedCount || successCount} ${unit}完成</b>
              <span class="${completionClass}">${failedCount > 0 ? `${failedCount} ${unit}失败，成功结果已保留` : "全部生成完成"}</span>
            </div>
            <div class="ai-result-desk-actions">
              <button class="secondary strong" type="button" data-ai-add-batch="${escapeHtml(message.id)}">全部放画布</button>
              <button class="secondary" type="button" data-ai-download-batch="${escapeHtml(message.id)}">下载单图 ZIP</button>
              ${mergedImages.map(({ index }, mergedIndex) => `
                <button class="primary" type="button" data-ai-download="${escapeHtml(`${message.id}:${index}`)}">下载长图${mergedImages.length > 1 ? ` ${mergedIndex + 1}` : ""}</button>
              `).join("")}
            </div>
          </div>
          <div class="ai-chat-images ai-batch-grid">
            ${screenImages.map(({ image, index }) => aiResultCardHtml(message, image, index, allMessages, versionLabel, { compact: true, detail: isDetail })).join("")}
            ${failedModules.map((item) => `
              <article class="ai-batch-card ai-batch-card-failed">
                <span>第 ${Number(item.index || 0) || "-"} ${unit}</span>
                <b>${escapeHtml(item.title || "生成失败")}</b>
                <small>${escapeHtml(item.reason || "本屏没有拿到图片")}</small>
              </article>
            `).join("")}
          </div>
        </section>
      `;
    }

    async function downloadAiImageBatch(messageId) {
      const message = (state.aiDirect.chatMessages || []).find((item) => item.id === messageId);
      const images = (message?.images || []).filter((image) => image?.url && !image.mergedDetailPage);
      if (!images.length) return;
      if (!window.JSZip || images.length === 1) {
        images.forEach((image) => downloadDataUrl(image.url, image.name));
        return;
      }
      try {
        const zip = new window.JSZip();
        for (let index = 0; index < images.length; index += 1) {
          const image = images[index];
          const url = String(image.url || "");
          const extension = /image\/jpe?g/i.test(image.type || "") || /^data:image\/jpe?g/i.test(url) ? "jpg" : "png";
          const baseName = String(image.name || `result-${index + 1}`).replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, "-");
          if (url.startsWith("data:")) {
            const base64 = url.split(",")[1] || "";
            zip.file(`${String(index + 1).padStart(2, "0")}-${baseName}.${extension}`, base64, { base64: true });
          } else {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`第 ${index + 1} 张图片读取失败`);
            zip.file(`${String(index + 1).padStart(2, "0")}-${baseName}.${extension}`, await response.blob());
          }
        }
        const blob = await zip.generateAsync({ type: "blob" });
        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = `${message?.metadata?.detailPageWorkflow ? "detail-page" : "ai-results"}-${Date.now()}.zip`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      } catch (error) {
        toast(error?.message || "批量下载失败，请改为逐张下载。");
      }
    }

    async function addAiImageBatchToCanvas(messageId) {
      const message = (state.aiDirect.chatMessages || []).find((item) => item.id === messageId);
      const images = (message?.images || []).filter((image) => image?.url && !image.mergedDetailPage);
      for (let index = 0; index < images.length; index += 1) {
        await addAiImageToCanvasAssets(images[index], {
          status: false,
          staggerIndex: index,
          focusOnCanvas: index === images.length - 1,
          sourceWorkflow: message?.metadata?.detailPageWorkflow ? "detail-page" : "ai-batch"
        });
      }
      if (images.length) toast(`已把 ${images.length} 张结果放到画布。`);
    }

    function activeGenerationTasksForConversation(conversationId = state.aiDirect.activeConversationId) {
      const activeStatuses = new Set(["preparing", "queued", "running"]);
      return Object.values(state.aiDirect.generationTasks || {})
        .filter((task) => task?.conversationId === conversationId && activeStatuses.has(String(task?.status || "")))
        .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
    }

    function activeGenerationUnits(detailPage = false) {
      const activeStatuses = new Set(["preparing", "queued", "running"]);
      return Object.values(state.aiDirect.generationTasks || {}).reduce((sum, task) => {
        if (!task || Boolean(task.detailPage) !== Boolean(detailPage) || !activeStatuses.has(String(task.status || ""))) return sum;
        return sum + Math.max(1, Number(task.requestedCount || 1));
      }, 0);
    }

    function renderAiChatList() {
      if (!els.aiChatList) return;
      const messages = state.aiDirect.chatMessages || [];
      const taskPending = activeGenerationTasksForConversation();
      const legacyPending = taskPending.length ? [] : (state.aiDirect.pendingStatus ? [state.aiDirect.pendingStatus] : []);
      const ordinaryActiveUnits = activeGenerationUnits(false);
      const detailActiveUnits = activeGenerationUnits(true);
      const pendingItems = taskPending.map((task) => {
        const progress = task.progress || {};
        const localActiveUnits = task.detailPage ? detailActiveUnits : ordinaryActiveUnits;
        const upstreamActiveUnits = Number(progress.accountActiveUnits);
        return {
          ...progress,
          status: task.status || progress.status || "preparing",
          totalCount: Number(task.requestedCount || progress.totalCount || 1),
          accountActiveUnits: Number.isFinite(upstreamActiveUnits)
            ? Math.max(localActiveUnits, upstreamActiveUnits)
            : localActiveUnits,
          accountActiveLimit: Math.max(1, Number(progress.accountActiveLimit || (task.detailPage ? 32 : 8))),
          prompt: task.prompt || "",
          taskId: task.id
        };
      }).concat(legacyPending);
      if (!messages.length && !pendingItems.length) {
        els.aiChatList.className = "ai-chat-list studio-ai-stream empty-state is-empty-collapsed";
        els.aiChatList.innerHTML = `
          <div class="workspace-output-empty">
            <div class="workspace-output-loading" aria-hidden="true">
              <span class="ai-loading-sprite"></span>
            </div>
            <div>
              <b>${escapeHtml(tr("waitingGeneration", "Ready to generate"))}</b>
              <small>${escapeHtml(tr("resultsAppear", "Results will appear here"))}</small>
            </div>
          </div>
        `;
        updateSummary();
        return;
      }

      els.aiChatList.className = "ai-chat-list studio-ai-stream";
      const visibleLimit = Math.max(8, Number(state.aiDirect.visibleMessageLimit || 12));
      const hiddenCount = Math.max(0, messages.length - visibleLimit);
      const visibleMessages = messages.slice(hiddenCount);
      const versionMap = new Map();
      let totalVersionIndex = 0;
      messages.forEach((message) => {
        if (message.role !== "user" && Array.isArray(message.images) && message.images.length) {
          totalVersionIndex += 1;
          versionMap.set(message.id, `V${totalVersionIndex}`);
        }
      });
      const loadEarlierHtml = hiddenCount ? `
        <div class="ai-load-earlier-wrap">
          <button class="secondary compact-action" type="button" data-ai-load-earlier>
            显示更早 ${Math.min(12, hiddenCount)} 条 / 共 ${hiddenCount} 条
          </button>
        </div>
      ` : "";
      const messageHtml = visibleMessages.map((message) => {
        const isUser = message.role === "user";
        const images = Array.isArray(message.images) ? message.images : [];
        const references = Array.isArray(message.references) ? message.references : [];
        const versionLabel = !isUser && images.length ? (versionMap.get(message.id) || "") : "";
        const referenceHtml = isUser && references.length
          ? `<div class="ai-message-attachments">${references.map((image, index) => `
            <figure>
              <img src="${image.url || image.image_file}" alt="${escapeHtml(image.name || "附件图片")}" loading="lazy" decoding="async">
              <figcaption>
                <span>${escapeHtml(image.label || `图${index + 1}`)}</span>
                <b title="${escapeHtml(image.name || "附件图片")}">${escapeHtml(compactFileName(image.name))}</b>
              </figcaption>
            </figure>
          `).join("")}</div>`
          : "";
        const imageHtml = images.length ? renderAiMessageImages(message, images, messages, versionLabel) : "";
        return `
          <article class="ai-chat-message ${isUser ? "user" : "assistant"} ${message.error ? "error" : ""}">
            <div class="ai-chat-avatar">${isUser ? "我" : "AI"}</div>
            <div class="ai-chat-bubble">
              ${versionLabel ? `<div class="ai-message-version"><span>${escapeHtml(versionLabel)}</span>${message.skill ? `<small>${escapeHtml(message.skill)}</small>` : ""}</div>` : ""}
              ${message.error ? renderAiErrorCard(message.text) : message.text ? `<p>${escapeHtml(message.text)}</p>` : ""}
              ${referenceHtml}
              ${imageHtml}
            </div>
          </article>
        `;
      }).join("");

      els.aiChatList.innerHTML = `${loadEarlierHtml}${messageHtml}${pendingItems.map(renderAiPendingMessage).join("")}`;
      els.aiChatList.querySelectorAll("[data-ai-load-earlier]").forEach((button) => {
        button.addEventListener("click", () => {
          state.aiDirect.visibleMessageLimit = Math.min(messages.length, visibleLimit + 12);
          const oldScrollHeight = els.aiChatList.scrollHeight;
          renderAiChatList();
          requestAnimationFrame(() => {
            els.aiChatList.scrollTop = Math.max(0, els.aiChatList.scrollHeight - oldScrollHeight);
          });
        });
      });
      els.aiChatList.querySelectorAll("button[data-ai-preview]").forEach((button) => {
        button.addEventListener("click", () => openImagePreview(button.dataset.aiPreview));
      });
      els.aiChatList.querySelectorAll("button[data-ai-feedback-up]").forEach((button) => {
        button.addEventListener("click", () => submitImageFeedback(button.dataset.aiFeedbackUp, "up"));
      });
      els.aiChatList.querySelectorAll("button[data-ai-feedback-down]").forEach((button) => {
        button.addEventListener("click", () => submitImageFeedback(button.dataset.aiFeedbackDown, "down"));
      });
      els.aiChatList.querySelectorAll("button[data-ai-copy-prompt]").forEach((button) => {
        button.addEventListener("click", async () => {
          const prompt = button.closest(".ai-image-prompt-record")?.querySelector(".ai-image-prompt-text")?.textContent || "";
          try {
            await copyTextToClipboard(prompt);
            toast("提示词已复制。");
          } catch (error) {
            toast(error?.message || "复制失败，请手动选择提示词。");
          }
        });
      });
      els.aiChatList.querySelectorAll("button[data-ai-download]").forEach((button) => {
        button.addEventListener("click", () => {
          const image = findGeneratedImage(button.dataset.aiDownload);
          if (image) downloadDataUrl(image.url, image.name);
        });
      });
      els.aiChatList.querySelectorAll("button[data-ai-download-batch]").forEach((button) => {
        button.addEventListener("click", () => downloadAiImageBatch(button.dataset.aiDownloadBatch));
      });
      els.aiChatList.querySelectorAll("button[data-ai-add-batch]").forEach((button) => {
        button.addEventListener("click", () => {
          addAiImageBatchToCanvas(button.dataset.aiAddBatch).catch((error) => {
            toast(error?.message || "批量放入画布失败，请重试。");
          });
        });
      });
      els.aiChatList.querySelectorAll("button[data-ai-add-canvas]").forEach((button) => {
        button.addEventListener("click", () => {
          const image = findGeneratedImage(button.dataset.aiAddCanvas);
          if (image) addAiImageToCanvasAssets(image).catch((error) => {
            toast(error?.message || "加入画布失败，请刷新后重试。");
          });
        });
      });
      els.aiChatList.querySelectorAll("button[data-ai-edit-canvas]").forEach((button) => {
        button.addEventListener("click", async () => {
          const image = findGeneratedImage(button.dataset.aiEditCanvas);
          if (!image) return;
          try {
            const result = await addAiImageToCanvasAssets(image, {
              status: "正在放入画布，准备 AI 修改...",
              fitFrame: false
            });
            if (result?.object) {
              state.canvasBeta.imageAiEditorCollapsedForId = "";
              state.canvasBeta.canvas?.setActiveObject(result.object);
              updateCanvasObjectToolbar();
              els.canvasImageAiPrompt?.focus();
            }
          } catch (error) {
            toast(error?.message || "放到画布失败，请刷新后重试。");
          }
        });
      });
      els.aiChatList.querySelectorAll("button[data-ai-regenerate]").forEach((button) => {
        button.addEventListener("click", () => {
          if (els.directPromptInput) {
            els.directPromptInput.value = "重新生成一版，换一个更好的方向。";
            state.aiDirect.prompt = els.directPromptInput.value;
            els.directPromptInput.focus();
          }
          toast("已放入重新生成需求。");
        });
      });
      if (!state.aiDirect.loadingConversation) scrollAiPanelToLatest();
    }

    function renderAiPendingMessage(progress = {}) {
      const status = String(progress.status || "queued");
      const percent = Math.max(0, Math.min(100, Math.round(Number(progress.percent || 0))));
      const waitingAhead = Number(progress.waitingAhead || 0);
      const accountActiveUnits = Math.max(0, Number(progress.accountActiveUnits || 0));
      const accountActiveLimit = Math.max(1, Number(progress.accountActiveLimit || 8));
      const totalCount = Number(progress.totalCount || 0);
      const completedCount = Number(progress.completedCount || 0);
      const failedCount = Number(progress.failedCount || 0);
      const isPreparing = status === "preparing";
      const stageLabel = status === "queued" ? "排队" : isPreparing ? "准备" : "生成";
      const message = progress.message || (status === "queued" ? "AI 生图排队中" : isPreparing ? "正在准备生图任务" : "AI 正在生图");
      const statusTitle = status === "queued" ? "任务等待中" : isPreparing ? "正在准备画面" : "正在生成图片";
      const prompt = String(progress.prompt || "").trim();
      const queueLine = status === "queued"
        ? (waitingAhead > 0 ? `前方还有 ${waitingAhead} 张在处理` : "即将开始")
        : totalCount > 1 ? `完成 ${completedCount}/${totalCount}，失败 ${failedCount}`
          : isPreparing ? "正在检查本轮参数" : "任务处理中";
      const taskLine = totalCount > 1 ? `本轮 ${totalCount} 张` : `本账号 ${accountActiveUnits}/${accountActiveLimit} 张`;
      return `
        <article class="ai-chat-message assistant pending ai-generation-status-message">
          <div class="ai-chat-avatar">AI</div>
          <div class="ai-chat-bubble" role="status" aria-live="polite">
              <div class="ai-generation-status-head">
                <span class="ai-generation-live-dot" aria-hidden="true"></span>
                <div>
                  <b>${escapeHtml(statusTitle)}</b>
                  <small>${escapeHtml(stageLabel)}</small>
                </div>
                <strong>${percent}%</strong>
              </div>
              <p class="ai-generation-status-copy">${escapeHtml(message)}</p>
              ${prompt ? `<small class="ai-generation-prompt">${escapeHtml(prompt.slice(0, 80))}</small>` : ""}
              <div class="ai-generation-status-bar" aria-label="AI 生图进度">
                <span style="width: ${percent}%"></span>
              </div>
              <div class="ai-generation-status-meta">
                <span>${escapeHtml(queueLine)}</span>
                <span>${escapeHtml(taskLine)}</span>
              </div>
          </div>
        </article>
      `;
    }

    function renderAiGeneratedStatus(progress = {}, taskId = "") {
      const task = taskId ? state.aiDirect.generationTasks?.[taskId] : null;
      if (task) {
        const upstreamStatus = String(progress?.status || task.status || "running");
        const normalizedProgress = upstreamStatus === "complete"
          ? { ...(progress || {}), status: "running", percent: 99, message: "图片已生成，正在整理结果" }
          : (progress || {});
        task.progress = { ...(task.progress || {}), ...normalizedProgress };
        task.status = upstreamStatus === "complete" ? "running" : upstreamStatus;
        task.updatedAt = new Date().toISOString();
        updateCanvasGenerationPlaceholderProgress(task.progress, task.placeholderId || "");
        if (task.conversationId === state.aiDirect.activeConversationId) renderAiChatList();
        return;
      }
      state.aiDirect.pendingStatus = progress || {};
      updateCanvasGenerationPlaceholderProgress(progress || {});
      if (!state.canvasBeta.activeGenerationPlaceholderId) renderAiChatList();
    }

    function renderAiGeneratedError(message, taskId = "") {
      const task = taskId ? state.aiDirect.generationTasks?.[taskId] : null;
      if (task) {
        task.status = "failed";
        task.progress = { ...(task.progress || {}), status: "failed", percent: 100, message };
        task.updatedAt = new Date().toISOString();
        updateCanvasGenerationPlaceholderProgress(task.progress, task.placeholderId || "");
      } else {
        state.aiDirect.pendingStatus = null;
        updateCanvasGenerationPlaceholderProgress({ status: "failed", percent: 100, message });
      }
      renderAiChatList();
      updateSummary();
    }

    function openImagePreview(key) {
      const image = key && typeof key === "object" ? key : findGeneratedImage(key);
      if (!image || !els.imagePreviewDialog || !els.imagePreviewLarge) return;
      els.imagePreviewLarge.src = image.url;
      els.imagePreviewLarge.alt = image.name || "AI 大图预览";
      if (els.imagePreviewCaption) {
        els.imagePreviewCaption.textContent = image.name || "AI 大图预览";
      }
      els.imagePreviewDialog.hidden = false;
      document.body.classList.add("preview-open");
    }

    function closeImagePreview() {
      if (!els.imagePreviewDialog || els.imagePreviewDialog.hidden) return;
      els.imagePreviewDialog.hidden = true;
      if (els.imagePreviewLarge) els.imagePreviewLarge.src = "";
      document.body.classList.remove("preview-open");
    }

    function findGeneratedImage(key, context = state.aiDirect) {
      const value = String(key || "");
      if (value.includes(":")) {
        const [messageId, imageIndex] = value.split(":");
        const message = (context.chatMessages || []).find((item) => item.id === messageId);
        return message?.images?.[Number(imageIndex)] || null;
      }
      return (context.generatedImages || [])[Number(key)] || null;
    }

    return {
      renderAiGeneratedList,
      renderAiChatList,
      renderAiPendingMessage,
      renderAiGeneratedStatus,
      renderAiGeneratedError,
      openImagePreview,
      closeImagePreview,
      findGeneratedImage
    };
  };
})();
