(function () {
  const app = window.EcommerceCanvasApp = window.EcommerceCanvasApp || {};

  app.createConversationController = function createConversationController(deps) {
    const {
      els,
      state,
      aiProviders,
      createClientId,
      escapeHtml,
      currentAiProvider,
      currentImageApiProvider,
      currentThinkingMode,
      renderThinkingModeHint,
      loadAiProviderSettings,
      renderAiSkillSelector,
      renderReferencePreviewList,
      renderSelectedEditImageState,
      renderCanvasFocusTargetChip,
      renderAiChatList,
      renderRelayPreview,
      switchStudioPanel,
      toast
    } = deps;
    const tr = (key, fallback = "") => window.EcommerceCanvasI18n?.t(key, fallback) || fallback || key;
    const tf = (key, values = {}, fallback = "") => window.EcommerceCanvasI18n?.format(key, values, fallback) || fallback || key;

    function ensureActiveAiConversation() {
      if (state.aiDirect.activeConversationId) return state.aiDirect.activeConversationId;
      const id = createClientId();
      state.aiDirect.activeConversationId = id;
      state.aiDirect.conversationPage = 0;
      renderAiConversationList();
      return id;
    }

    function currentAiConversationSnapshot() {
      const id = ensureActiveAiConversation();
      const firstUserText = state.aiDirect.chatMessages.find((message) => message.role === "user" && message.text)?.text || state.aiDirect.prompt || "";
      return {
        id,
        title: firstUserText ? firstUserText.replace(/\s+/g, " ").slice(0, 24) : tr("newConversation", "New conversation"),
        prompt: state.aiDirect.prompt || "",
        turns: state.aiDirect.turns || [],
        references: state.aiDirect.references || [],
        detailPlanningMaterials: Array.isArray(state.aiDirect.detailPlanningMaterials)
          ? state.aiDirect.detailPlanningMaterials
          : [],
        chatMessages: state.aiDirect.chatMessages || [],
        generatedImages: state.aiDirect.generatedImages || [],
        selectedEditImageKey: state.aiDirect.selectedEditImageKey || "",
        useSelectedImageAsBase: Boolean(state.aiDirect.useSelectedImageAsBase),
        settings: {
          provider: currentAiProvider(),
          imageApiProvider: "primary",
          skillId: state.aiDirect.selectedSkillId || "none",
          thinkingMode: currentThinkingMode(),
          aspectRatio: els.aspectRatio?.value || "1:1",
          imageSize: els.imageSize?.value || "1K",
          imageCount: Number(els.imageCount?.value || 1)
        }
      };
    }

    function cloneAiConversationSnapshot(snapshot) {
      return JSON.parse(JSON.stringify(snapshot || {}));
    }

    function mergeConversationMessagesById(current = [], incoming = []) {
      const merged = [];
      const positions = new Map();
      [...(Array.isArray(current) ? current : []), ...(Array.isArray(incoming) ? incoming : [])].forEach((message) => {
        if (!message) return;
        const id = String(message.id || createClientId());
        if (positions.has(id)) {
          const index = positions.get(id);
          merged[index] = { ...merged[index], ...message, id };
          return;
        }
        positions.set(id, merged.length);
        merged.push({ ...message, id });
      });
      return merged.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
    }

    function applyAiConversation(conversation = {}) {
      state.aiDirect.loadingConversation = true;
      state.aiDirect.activeConversationId = conversation.id || createClientId();
      state.aiDirect.prompt = conversation.prompt || "";
      state.aiDirect.turns = Array.isArray(conversation.turns) ? conversation.turns : [];
      state.aiDirect.references = Array.isArray(conversation.references) ? conversation.references : [];
      state.aiDirect.detailPlanningMaterials = Array.isArray(conversation.detailPlanningMaterials)
        ? conversation.detailPlanningMaterials
        : [];
      state.aiDirect.chatMessages = Array.isArray(conversation.chatMessages) ? conversation.chatMessages : [];
      state.aiDirect.generatedImages = Array.isArray(conversation.generatedImages) ? conversation.generatedImages : [];
      state.aiDirect.selectedEditImageKey = conversation.selectedEditImageKey || "";
      state.aiDirect.canvasFocusTarget = null;
      state.canvasBeta.pendingFocusTarget = null;
      const settings = conversation.settings || {};
      if (settings.thinkingMode && els.thinkingMode) {
        els.thinkingMode.value = ["off", "standard", "deep"].includes(settings.thinkingMode) ? settings.thinkingMode : "standard";
        localStorage.setItem("ai_thinking_mode", els.thinkingMode.value);
        renderThinkingModeHint();
      }
      state.aiDirect.useSelectedImageAsBase = Boolean(conversation.useSelectedImageAsBase);
      state.aiDirect.pendingStatus = null;
      state.aiDirect.visibleMessageLimit = 12;
      if (settings.provider && els.aiProvider && aiProviders[settings.provider]) {
        els.aiProvider.value = settings.provider;
        loadAiProviderSettings();
      }
      if (els.imageApiProvider) {
        els.imageApiProvider.value = "primary";
        localStorage.removeItem("image_api_provider");
      }
      if (settings.aspectRatio && els.aspectRatio) els.aspectRatio.value = settings.aspectRatio;
      if (settings.imageSize && els.imageSize) els.imageSize.value = settings.imageSize;
      if (settings.imageCount && els.imageCount) els.imageCount.value = settings.imageCount;
      renderThinkingModeHint();
      state.aiDirect.selectedSkillId = settings.skillId || "none";
      localStorage.removeItem("ai_selected_skill");
      renderAiSkillSelector();
      if (els.directPromptInput) els.directPromptInput.value = state.aiDirect.prompt;
      if (els.useSelectedImageInput) els.useSelectedImageInput.checked = state.aiDirect.useSelectedImageAsBase;
      renderAiConversationList();
      renderReferencePreviewList();
      renderSelectedEditImageState();
      renderCanvasFocusTargetChip();
      renderAiChatList();
      renderRelayPreview();
      state.aiDirect.loadingConversation = false;
      scrollAiPanelToTaskResult();
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

    function scrollAiPanelToTaskResult() {
      const scroll = () => {
        const resultDesk = els.aiChatList?.querySelector?.(".ai-result-desk");
        if (resultDesk) resultDesk.scrollIntoView({ block: "start", inline: "nearest" });
        else scrollAiPanelToLatest();
      };
      requestAnimationFrame(() => {
        scroll();
        window.setTimeout(scroll, 100);
        window.setTimeout(scroll, 420);
        window.setTimeout(scroll, 980);
      });
    }

    async function loadAiConversations() {
      if (!state.account.user) {
        state.aiDirect.conversations = [];
        state.aiDirect.activeConversationId = "";
        renderAiConversationList();
        return;
      }
      try {
        const response = await fetch("/api/ai/conversations", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "对话记录读取失败");
        state.aiDirect.conversations = Array.isArray(data.items) ? data.items : [];
        createNewAiConversation({ save: false, includeInList: false });
      } catch (error) {
        console.error(error);
        renderAiConversationList();
      }
    }

    async function loadAiConversation(id, options = {}) {
      if (!id || state.aiDirect.activeConversationId === id && !options.force) return;
      try {
        if (!options.skipSave) await saveAiConversationNow({ applyToActive: false });
        const response = await fetch(`/api/ai/conversations/${encodeURIComponent(id)}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "对话读取失败");
        applyAiConversation(data.conversation || {});
        if (!options.silent) toast("已切换对话。");
      } catch (error) {
        console.error(error);
        toast(error.message || "对话读取失败。");
      }
    }

    async function openConversationFromHistory(id) {
      if (!id) return;
      await loadAiConversation(id);
      if (state.aiDirect.activeConversationId === id) {
        switchStudioPanel("ai");
        scrollAiPanelToTaskResult();
      }
    }

    function createNewAiConversation(options = {}) {
      const id = createClientId();
      const now = new Date().toISOString();
      if (options.includeInList === true) {
        state.aiDirect.conversations = [{
          id,
          title: "新建对话",
          createdAt: now,
          updatedAt: now,
          messageCount: 0,
          referenceCount: 0,
          imageCount: 0,
          lastText: ""
        }, ...state.aiDirect.conversations.filter((item) => item.id !== id)];
      }
      state.aiDirect.conversationPage = 0;
      applyAiConversation({
        id,
        title: "新建对话",
        createdAt: now,
        updatedAt: now,
        prompt: "",
        turns: [],
        references: [],
        detailPlanningMaterials: [],
        chatMessages: [],
        generatedImages: []
      });
      if (options.save !== false) saveAiConversationNow();
    }

    function saveAiConversationDebounced() {
      if (state.aiDirect.loadingConversation || !state.account.user) return;
      clearTimeout(state.aiDirect.saveTimer);
      state.aiDirect.saveTimer = setTimeout(() => saveAiConversationNow(), 900);
    }

    async function saveAiConversationNow(options = {}) {
      if (state.aiDirect.loadingConversation || !state.account.user || (!state.aiDirect.activeConversationId && !options.snapshot?.id)) return;
      clearTimeout(state.aiDirect.saveTimer);
      state.aiDirect.saveTimer = null;
      const snapshot = cloneAiConversationSnapshot(options.snapshot || currentAiConversationSnapshot());
      const targetConversationId = snapshot.id;
      const hasContent = snapshot.prompt
        || snapshot.references.length
        || snapshot.detailPlanningMaterials?.length
        || snapshot.chatMessages.length
        || snapshot.generatedImages.length;
      if (!hasContent && options.allowEmpty !== true) return;
      try {
        const response = await fetch("/api/ai/conversations/save", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            conversation: snapshot,
            mergeMode: String(options.mergeMode || "")
          })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "对话保存失败");
        state.aiDirect.conversations = Array.isArray(data.items) ? data.items : state.aiDirect.conversations;
        if (data.conversation && options.applyToActive !== false && state.aiDirect.activeConversationId === targetConversationId) {
          state.aiDirect.activeConversationId = data.conversation.id;
          if (String(options.mergeMode || "") === "task") {
            state.aiDirect.chatMessages = mergeConversationMessagesById(
              state.aiDirect.chatMessages,
              data.conversation.chatMessages
            );
          } else {
            state.aiDirect.references = data.conversation.references || state.aiDirect.references;
            state.aiDirect.detailPlanningMaterials = data.conversation.detailPlanningMaterials || state.aiDirect.detailPlanningMaterials;
            state.aiDirect.chatMessages = data.conversation.chatMessages || state.aiDirect.chatMessages;
            state.aiDirect.generatedImages = data.conversation.generatedImages || state.aiDirect.generatedImages;
          }
        }
        renderAiConversationList();
        return data;
      } catch (error) {
        console.error(error);
        return null;
      }
    }

    async function deleteAiConversation(id) {
      if (!id) return;
      const hasActiveGeneration = Object.values(state.aiDirect.generationTasks || {}).some((task) => (
        task?.conversationId === id && ["preparing", "queued", "running"].includes(String(task?.status || ""))
      ));
      if (hasActiveGeneration) {
        toast("这个任务还在生成，完成后再删除。");
        return;
      }
      try {
        const response = await fetch(`/api/ai/conversations/${encodeURIComponent(id)}/delete`, { method: "POST" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "删除失败");
        state.aiDirect.conversations = Array.isArray(data.items) ? data.items : state.aiDirect.conversations.filter((item) => item.id !== id);
        if (state.aiDirect.activeConversationId === id) {
          state.aiDirect.activeConversationId = "";
          if (state.aiDirect.conversations.length) await loadAiConversation(state.aiDirect.conversations[0].id, { force: true, silent: true, skipSave: true });
          else createNewAiConversation({ save: false });
        }
        renderAiConversationList();
        toast("对话已删除。");
      } catch (error) {
        console.error(error);
        toast(error.message || "删除失败。");
      }
    }

    function formatAiConversationTime(value) {
      const date = new Date(value || "");
      if (Number.isNaN(date.getTime())) return "";
      const now = new Date();
      const sameDay = date.toDateString() === now.toDateString();
      if (sameDay) {
        return date.toLocaleTimeString(window.EcommerceCanvasI18n?.currentLocale?.() || undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
      }
      const options = date.getFullYear() === now.getFullYear()
        ? { month: "2-digit", day: "2-digit" }
        : { year: "numeric", month: "2-digit", day: "2-digit" };
      return date.toLocaleDateString(window.EcommerceCanvasI18n?.currentLocale?.() || undefined, options).replace(/\//g, "-");
    }

    function aiConversationHasContent(item = {}) {
      return Boolean(
        Number(item.messageCount || 0) > 0 ||
        Number(item.imageCount || 0) > 0 ||
        (Array.isArray(item.chatMessages) && item.chatMessages.length) ||
        (Array.isArray(item.generatedImages) && item.generatedImages.length)
      );
    }

    function canvasConversationImageCount() {
      const canvas = state.canvasBeta?.canvas;
      const objects = canvas?.getObjects?.() || [];
      return objects.filter((object) => object?.objectType === "image" || object?.isType?.("image")).length;
    }

    function taskStatusGroup(item = {}) {
      const status = String(item.taskStatus || "completed");
      if (status === "running") return "running";
      if (status === "failed" || status === "partial") return "attention";
      return "completed";
    }

    function taskStatusLabel(item = {}) {
      const labels = {
        running: tr("running", "Running"),
        failed: tr("failed", "Failed"),
        partial: tr("partial", "Partially completed"),
        completed: tr("completed", "Completed"),
        draft: tr("draft", "Not started")
      };
      return labels[String(item.taskStatus || "completed")] || tr("completed", "Completed");
    }

    function renderAiConversationSections(items = []) {
      const activeFilter = ["all", "running", "attention", "completed"].includes(state.aiDirect.taskFilter)
        ? state.aiDirect.taskFilter
        : "all";
      const runningCount = items.filter((item) => taskStatusGroup(item) === "running").length;
      const attentionCount = items.filter((item) => taskStatusGroup(item) === "attention").length;
      const completedCount = items.filter((item) => taskStatusGroup(item) === "completed").length;
      return `
        <div class="ai-conversation-sections" aria-label="${escapeHtml(tr("taskFilters", "Task status filters"))}">
          <button class="${activeFilter === "all" ? "active" : ""}" type="button" data-ai-task-filter="all"><b>${escapeHtml(tr("all", "All"))}</b><em>${items.length}</em></button>
          <button class="${activeFilter === "running" ? "active" : ""}" type="button" data-ai-task-filter="running"><b>${escapeHtml(tr("running", "Running"))}</b><em>${runningCount}</em></button>
          <button class="${activeFilter === "attention" ? "active" : ""}" type="button" data-ai-task-filter="attention"><b>${escapeHtml(tr("attention", "Needs attention"))}</b><em>${attentionCount}</em></button>
          <button class="${activeFilter === "completed" ? "active" : ""}" type="button" data-ai-task-filter="completed"><b>${escapeHtml(tr("completed", "Completed"))}</b><em>${completedCount}</em></button>
        </div>
      `;
    }

    function renderAiConversationList() {
      if (!els.aiConversationList) return;
      const activeStatuses = new Set(["preparing", "queued", "running"]);
      const activeTaskGroups = new Map();
      Object.values(state.aiDirect.generationTasks || {}).forEach((task) => {
        if (!task?.conversationId || !activeStatuses.has(String(task.status || ""))) return;
        const list = activeTaskGroups.get(task.conversationId) || [];
        list.push(task);
        activeTaskGroups.set(task.conversationId, list);
      });
      const allItems = [...(state.aiDirect.conversations || [])];
      activeTaskGroups.forEach((tasks, conversationId) => {
        const requestedCount = tasks.reduce((sum, task) => sum + Math.max(1, Number(task.requestedCount || 1)), 0);
        const successCount = tasks.reduce((sum, task) => sum + Math.max(0, Number(task.progress?.completedCount || 0)), 0);
        const failedCount = tasks.reduce((sum, task) => sum + Math.max(0, Number(task.progress?.failedCount || 0)), 0);
        const latest = [...tasks].sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))[0] || {};
        const index = allItems.findIndex((item) => item.id === conversationId);
        const runningSummary = {
          ...(index >= 0 ? allItems[index] : {}),
          id: conversationId,
          title: (index >= 0 ? allItems[index]?.title : "") || latest.prompt || tr("aiGeneration", "AI image generation"),
          createdAt: (index >= 0 ? allItems[index]?.createdAt : "") || latest.createdAt || new Date().toISOString(),
          updatedAt: latest.updatedAt || latest.createdAt || new Date().toISOString(),
          messageCount: Math.max(1, Number(index >= 0 ? allItems[index]?.messageCount || 0 : 0)),
          lastText: latest.progress?.message || latest.prompt || tr("running", "Running"),
          taskStatus: "running",
          taskKind: latest.skillName || tr("aiGeneration", "AI image generation"),
          requestedCount,
          successCount,
          failedCount
        };
        if (index >= 0) allItems[index] = runningSummary;
        else allItems.unshift(runningSummary);
      });
      const items = allItems.filter(aiConversationHasContent);
      const taskCount = items.length;
      if (els.studioTaskBadge) {
        els.studioTaskBadge.textContent = taskCount > 99 ? "99+" : String(taskCount);
        els.studioTaskBadge.hidden = taskCount < 1;
      }
      const materialCount = Number(state.canvasBeta?.assets?.length || 0)
        + Number(state.aiDirect.references?.length || 0)
        + Number(state.aiDirect.detailPlanningMaterials?.length || 0);
      if (els.studioAssetBadge) {
        els.studioAssetBadge.textContent = materialCount > 99 ? "99+" : String(materialCount);
        els.studioAssetBadge.hidden = materialCount < 1;
      }
      const pageSize = 8;
      if (!state.account.user) {
        els.aiConversationList.className = "ai-conversation-list empty-state";
        els.aiConversationList.textContent = tr("signInForTasks", "Sign in to view generation tasks");
        return;
      }
      if (!items.length) {
        els.aiConversationList.className = "ai-conversation-list empty-state";
        els.aiConversationList.textContent = tr("noGenerationTasks", "No generation tasks yet");
        return;
      }
      const activeFilter = ["all", "running", "attention", "completed"].includes(state.aiDirect.taskFilter)
        ? state.aiDirect.taskFilter
        : "all";
      const filteredItems = activeFilter === "all"
        ? items
        : items.filter((item) => taskStatusGroup(item) === activeFilter);
      const pageCount = Math.max(1, Math.ceil(filteredItems.length / pageSize));
      const page = Math.max(0, Math.min(pageCount - 1, Number(state.aiDirect.conversationPage || 0)));
      state.aiDirect.conversationPage = page;
      const visibleItems = filteredItems.slice(page * pageSize, page * pageSize + pageSize);
      els.aiConversationList.className = "ai-conversation-list";
      els.aiConversationList.innerHTML = `
        ${renderAiConversationSections(items)}
        <div class="ai-conversation-page-items">
          ${visibleItems.length ? visibleItems.map((item) => {
            const title = item.title || tr("newConversation", "New conversation");
            const preview = item.lastText || tr("noContent", "No content");
            const updatedAt = formatAiConversationTime(item.updatedAt || item.createdAt);
            const imageCount = Number(item.imageCount || 0);
            const requestedCount = Number(item.requestedCount || 0) > 0 ? Number(item.requestedCount) : imageCount;
            const successCount = Number(item.successCount || 0) > 0 ? Number(item.successCount) : imageCount;
            const failedCount = Number(item.failedCount || 0);
            const progress = requestedCount > 0 ? Math.min(100, Math.round(successCount / requestedCount * 100)) : 0;
            const statusGroup = taskStatusGroup(item);
            return `
        <article class="ai-conversation-item task-${escapeHtml(statusGroup)} ${item.id === state.aiDirect.activeConversationId ? "active" : ""}" data-conversation-id="${escapeHtml(item.id)}">
          <button class="ai-conversation-open" type="button" data-open-conversation="${escapeHtml(item.id)}">
            <span class="ai-conversation-title-row">
              <b><i class="ai-task-status-dot" aria-hidden="true"></i>${escapeHtml(item.taskKind || tr("aiGeneration", "AI image generation"))} · ${escapeHtml(title)}</b>
              <small>${escapeHtml(updatedAt)}</small>
            </span>
            <span class="ai-conversation-preview">${escapeHtml(preview)}</span>
            ${requestedCount > 0 ? `<span class="ai-task-progress"><i style="width:${progress}%"></i></span>` : ""}
            <span class="ai-conversation-meta">
              <em class="ai-task-state">${escapeHtml(taskStatusLabel(item))}</em>
              <em>${requestedCount > 0 ? `${successCount}/${requestedCount}` : escapeHtml(tf("imagesShort", { count: imageCount }, `${imageCount} images`))}</em>
              ${failedCount > 0 ? `<em class="danger">${escapeHtml(tf("failedShort", { count: failedCount }, `${failedCount} failed`))}</em>` : ""}
            </span>
          </button>
          <button class="ai-conversation-remove" type="button" data-delete-conversation="${escapeHtml(item.id)}" title="${escapeHtml(tr("delete", "Delete"))}" aria-label="${escapeHtml(tr("deleteConversation", "Delete conversation"))}">&times;</button>
        </article>
            `;
          }).join("") : `<div class="ai-task-filter-empty">${escapeHtml(tr("noTasksInFilter", "No tasks in this category"))}</div>`}
        </div>
        ${pageCount > 1 ? `
          <div class="ai-conversation-pager">
            <button class="secondary compact-action" type="button" data-conversation-page="prev" ${page <= 0 ? "disabled" : ""}>${escapeHtml(tr("previousPage", "Previous"))}</button>
            <span>${page + 1} / ${pageCount}</span>
            <button class="secondary compact-action" type="button" data-conversation-page="next" ${page >= pageCount - 1 ? "disabled" : ""}>${escapeHtml(tr("nextPage", "Next"))}</button>
          </div>
        ` : ""}
      `;
      els.aiConversationList.querySelectorAll("[data-ai-task-filter]").forEach((button) => {
        button.addEventListener("click", () => {
          state.aiDirect.taskFilter = button.dataset.aiTaskFilter || "all";
          state.aiDirect.conversationPage = 0;
          renderAiConversationList();
        });
      });
      els.aiConversationList.querySelectorAll("[data-open-conversation]").forEach((button) => {
        button.addEventListener("click", () => openConversationFromHistory(button.dataset.openConversation));
      });
      els.aiConversationList.querySelectorAll("[data-delete-conversation]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          deleteAiConversation(button.dataset.deleteConversation);
        });
      });
      els.aiConversationList.querySelectorAll("[data-conversation-page]").forEach((button) => {
        button.addEventListener("click", () => {
          const direction = button.dataset.conversationPage;
          state.aiDirect.conversationPage = Math.max(0, Math.min(pageCount - 1, page + (direction === "next" ? 1 : -1)));
          renderAiConversationList();
        });
      });
    }

    return {
      ensureActiveAiConversation,
      currentAiConversationSnapshot,
      cloneAiConversationSnapshot,
      applyAiConversation,
      loadAiConversations,
      loadAiConversation,
      openConversationFromHistory,
      createNewAiConversation,
      saveAiConversationDebounced,
      saveAiConversationNow,
      deleteAiConversation,
      renderAiConversationList
    };
  };
})();
