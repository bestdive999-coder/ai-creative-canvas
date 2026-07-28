(function () {
  const app = window.EcommerceCanvasApp = window.EcommerceCanvasApp || {};

  app.createAiControlsController = function createAiControlsController(deps) {
    const {
      els,
      state,
      aiProviders,
      thinkingModeHints,
      fallbackAiSkillDefinitions,
      studioSkillCategories,
      providerAspectRatioOptions,
      fullAspectRatioOptions,
      toast,
      syncStudioModelPanel,
      syncStudioSettingsPanel,
      syncStudioComposerControls,
      updateComposerModelSummary,
      renderCanvasImageAiControls,
      loadClientConfig
    } = deps;
    let aiSkillMenuCloseTimer = 0;
    const userImageModelStorageKey = "ai_user_image_models_v1";
    const userImageModelProviders = ["imageservice", "responsesimage"];
    const tr = (key, fallback = "") => window.EcommerceCanvasI18n?.t(key, fallback) || fallback || key;
    const tf = (key, values = {}, fallback = "") => window.EcommerceCanvasI18n?.format(key, values, fallback) || fallback || key;
    const skillTranslationKeys = {
      none: ["skillNoneName", "skillNoneDescription", "skillTypeGeneral"],
      "ecommerce-design-agent": ["skillEcommerceName", "skillEcommerceDescription", "skillTypeAgent"],
      "hot-style-rebuild-agent": ["skillRebuildName", "skillRebuildDescription", "skillTypeAgent"],
      "main-image-matrix-agent": ["skillMainImageName", "skillMainImageDescription", "skillTypeAgent"],
      "detail-page-planner-agent": ["skillDetailName", "skillDetailDescription", "skillTypeAgent"],
      "scene-seeding-agent": ["skillSceneName", "skillSceneDescription", "skillTypeAgent"],
      "campaign-poster-agent": ["skillCampaignName", "skillCampaignDescription", "skillTypeAgent"],
      "content-cover-agent": ["skillContentCoverName", "skillContentCoverDescription", "skillTypeSocial"],
      "brand-style-extension-agent": ["skillBrandName", "skillBrandDescription", "skillTypeBrand"],
      "white-bg-product": ["skillWhiteName", "skillWhiteDescription", "skillTypeImageUse"]
    };

    function localizedSkill(skill = {}) {
      const [nameKey, descriptionKey, typeKey] = skillTranslationKeys[skill.id] || [];
      return {
        ...skill,
        name: nameKey ? tr(nameKey, skill.name) : skill.name,
        description: descriptionKey ? tr(descriptionKey, skill.description) : skill.description,
        type: typeKey ? tr(typeKey, skill.type) : skill.type
      };
    }

    function normalizeUserImageModelName(value) {
      const text = String(value || "").trim().replace(/[\u0000-\u001f\u007f]/g, "");
      return text.slice(0, 180);
    }

    function normalizeUserImageModelList(value) {
      const values = Array.isArray(value) ? value : String(value || "").split(/[\n,，]+/);
      const seen = new Set();
      return values
        .map(normalizeUserImageModelName)
        .filter((model) => model && !seen.has(model) && seen.add(model))
        .slice(0, 24);
    }

    function readUserImageModelProfile() {
      try {
        const parsed = JSON.parse(localStorage.getItem(userImageModelStorageKey) || "{}");
        const profile = {};
        userImageModelProviders.forEach((provider) => {
          const row = parsed?.[provider] || {};
          const models = normalizeUserImageModelList(row.models);
          const selected = normalizeUserImageModelName(row.selected);
          profile[provider] = {
            models,
            selected: models.includes(selected) ? selected : ""
          };
        });
        return profile;
      } catch {
        return {};
      }
    }

    function writeUserImageModelProfile(profile) {
      try {
        localStorage.setItem(userImageModelStorageKey, JSON.stringify(profile));
      } catch (error) {
        console.warn("用户模型配置保存失败。", error);
      }
    }

    function userImageModelDefault(provider = currentAiProvider()) {
      const central = state.clientConfig?.ai?.providers?.[provider] || {};
      return normalizeUserImageModelName(
        central.imageEditModel
        || central.textToImageModel
        || central.textModel
        || ""
      );
    }

    function currentUserImageModel(provider = currentAiProvider()) {
      const profile = readUserImageModelProfile();
      const row = profile[provider] || {};
      return normalizeUserImageModelName(row.selected && row.models?.includes(row.selected) ? row.selected : "");
    }

    function renderUserImageModelControls() {
      const select = els.userImageModelSelect;
      const list = els.userImageModelList;
      if (!select && !list) return;
      const provider = currentAiProvider();
      const profile = readUserImageModelProfile();
      const row = profile[provider] || { models: [], selected: "" };
      const models = normalizeUserImageModelList(row.models);
      const selected = models.includes(row.selected) ? row.selected : "";
      if (select) {
        select.replaceChildren(new Option(`${tr("backendDefaultModel", "Admin default model")}${userImageModelDefault(provider) ? ` · ${userImageModelDefault(provider)}` : ""}`, ""));
        models.forEach((model) => select.append(new Option(model, model)));
        select.value = selected;
        refreshCustomSelect(select);
      }
      if (list && document.activeElement !== list) list.value = models.join("\n");
      if (els.userImageModelStatus) {
        els.userImageModelStatus.textContent = selected
          ? tf("userModelCurrentStatus", { model: selected }, `Using: ${selected}`)
          : tr("userModelDefaultStatus", "No user model configured; using the admin default.");
      }
    }

    function updateSelectedUserImageModel(selected, provider = currentAiProvider()) {
      const profile = readUserImageModelProfile();
      const row = profile[provider] || { models: [], selected: "" };
      const next = normalizeUserImageModelName(selected);
      const models = normalizeUserImageModelList(row.models);
      profile[provider] = { models, selected: models.includes(next) ? next : "" };
      writeUserImageModelProfile(profile);
      renderUserImageModelControls();
      saveAiConversationDebounced();
    }

    function handleUserImageModelSelect() {
      updateSelectedUserImageModel(els.userImageModelSelect?.value || "");
      updateComposerModelSummary();
      syncStudioModelPanel();
    }

    function handleUserImageModelSave() {
      const provider = currentAiProvider();
      const profile = readUserImageModelProfile();
      const current = profile[provider] || { models: [], selected: "" };
      const models = normalizeUserImageModelList(els.userImageModelList?.value || "");
      const selected = models.includes(els.userImageModelSelect?.value || "")
        ? els.userImageModelSelect.value
        : (models.includes(current.selected) ? current.selected : (models[0] || ""));
      profile[provider] = { models, selected };
      writeUserImageModelProfile(profile);
      renderUserImageModelControls();
      updateComposerModelSummary();
      syncStudioModelPanel();
      saveAiConversationDebounced();
      toast(models.length
        ? tf("savedUserModels", { count: models.length }, `Saved ${models.length} user models.`)
        : tr("clearedUserModels", "Cleared user models and restored the admin default."));
    }

    function handleUserImageModelReset() {
      const provider = currentAiProvider();
      const profile = readUserImageModelProfile();
      const current = profile[provider] || { models: [], selected: "" };
      profile[provider] = { models: normalizeUserImageModelList(current.models), selected: "" };
      writeUserImageModelProfile(profile);
      renderUserImageModelControls();
      updateComposerModelSummary();
      syncStudioModelPanel();
      saveAiConversationDebounced();
      toast(tr("resetUserModels", "Restored the admin default model."));
    }

    function persistAiSettings() {
      const provider = currentAiProvider();
      localStorage.setItem("ai_provider", provider);
      localStorage.removeItem("image_api_provider");
      clearLocalAiKeys();
      if (els.textModel?.value.trim()) {
        localStorage.setItem(aiModelStorageKey(provider), els.textModel.value.trim());
      } else {
        localStorage.removeItem(aiModelStorageKey(provider));
      }
      updateAiProviderUi();
    }
    
    function handleAiProviderChange() {
      localStorage.setItem("ai_provider", currentAiProvider());
      loadAiProviderSettings();
      updateComposerModelSummary();
      saveAiConversationDebounced();
    }

    function handleImageApiProviderChange() {
      if (els.imageApiProvider) els.imageApiProvider.value = "primary";
      localStorage.removeItem("image_api_provider");
      syncImageApiProviderControls();
      updateComposerModelSummary();
      saveAiConversationDebounced();
    }
    
    function setAiConfigDrawerState(tab = "output", open = true) {
      const activeTab = ["agent", "output", "model"].includes(tab) ? tab : "output";
      if (els.aiConfigDrawer) {
        els.aiConfigDrawer.hidden = !open;
        els.aiConfigDrawer.dataset.activeTab = activeTab;
      }
      els.aiConfigTabs?.forEach((button) => {
        const active = button.dataset.aiConfigTab === activeTab;
        button.classList.toggle("active", active);
        button.setAttribute("aria-selected", active ? "true" : "false");
      });
      els.aiConfigSections?.forEach((section) => {
        section.hidden = !open || section.dataset.aiConfigSection !== activeTab;
      });
      if (els.aiSettingsDrawer) els.aiSettingsDrawer.hidden = !open || activeTab !== "output";
      if (els.aiModelPrefsPanel) els.aiModelPrefsPanel.hidden = !open || activeTab !== "model";
      if (els.aiSkillMenu) els.aiSkillMenu.hidden = !open || activeTab !== "agent";
      const outputOpen = open && activeTab === "output";
      const modelOpen = open && activeTab === "model";
      const agentOpen = open && activeTab === "agent";
      els.aiSettingsToggleBtn?.classList.toggle("active", outputOpen);
      els.aiSettingsToggleBtn?.setAttribute("aria-expanded", String(outputOpen));
      els.aiModelPrefsBtn?.classList.toggle("active", modelOpen);
      els.aiModelPrefsBtn?.setAttribute("aria-expanded", String(modelOpen));
      els.aiSkillMenuBtn?.classList.toggle("active", agentOpen);
      els.aiSkillMenuBtn?.setAttribute("aria-expanded", String(agentOpen));
      els.aiConfigSummaryBtn?.setAttribute("aria-expanded", String(open));
    }

    function aiConfigTabIsOpen(tab) {
      return Boolean(els.aiConfigDrawer && !els.aiConfigDrawer.hidden && els.aiConfigDrawer.dataset.activeTab === tab);
    }

    function closeAiConfigDrawer() {
      setAiConfigDrawerState(els.aiConfigDrawer?.dataset.activeTab || "output", false);
    }

    function toggleAiSettingsDrawer(event) {
      event?.stopPropagation?.();
      if (aiConfigTabIsOpen("output")) return closeAiConfigDrawer();
      setAiConfigDrawerState("output", true);
    }

    function closeAiSettingsDrawer() {
      closeAiConfigDrawer();
    }

    function toggleAiModelPrefsPanel(event) {
      event?.stopPropagation?.();
      if (aiConfigTabIsOpen("model")) return closeAiConfigDrawer();
      syncStudioComposerControls();
      setAiConfigDrawerState("model", true);
    }

    function closeAiModelPrefsPanel() {
      closeAiConfigDrawer();
    }
    
    function closeStudioComposerPopoversOnOutsideClick(event) {
      return;
    }
    
    function currentThinkingMode() {
      const mode = String(els.thinkingMode?.value || localStorage.getItem("ai_thinking_mode") || "standard").trim().toLowerCase();
      return ["off", "standard", "deep"].includes(mode) ? mode : "standard";
    }
    
    function renderThinkingModeHint() {
      if (!els.thinkingModeHint) return;
      const activeMode = currentThinkingMode();
      const translationKeys = {
        standard: ["thinkingStandardLabel", "thinkingStandardText"],
        deep: ["thinkingDeepLabel", "thinkingDeepText"],
        off: ["thinkingOffLabel", "thinkingOffText"]
      };
      els.thinkingModeHint.dataset.mode = activeMode;
      els.thinkingModeHint.innerHTML = thinkingModeHints.map((item) => {
        const [labelKey, textKey] = translationKeys[item.id] || [];
        return `
          <span class="${item.id === activeMode ? "active" : ""}">
            <b>${escapeHtml(labelKey ? tr(labelKey, item.label) : item.label)}</b>${escapeHtml(textKey ? tr(textKey, item.text) : item.text)}
          </span>
        `;
      }).join("");
    }
    
    function handleThinkingModeChange() {
      localStorage.setItem("ai_thinking_mode", currentThinkingMode());
      renderThinkingModeHint();
      renderAiWebSearchToggle();
      updateComposerModelSummary();
      saveAiConversationDebounced();
    }
    
    function renderAiWebSearchToggle() {
      if (!els.webSearchToggle) return;
      const disabled = currentThinkingMode() === "off";
      if (disabled) state.aiDirect.webSearchEnabled = false;
      const enabled = Boolean(state.aiDirect.webSearchEnabled);
      els.webSearchToggle.disabled = disabled;
      els.webSearchToggle.classList.toggle("active", enabled);
      els.webSearchToggle.classList.toggle("disabled", disabled);
      els.webSearchToggle.setAttribute("aria-pressed", enabled ? "true" : "false");
      els.webSearchToggle.setAttribute("aria-disabled", disabled ? "true" : "false");
      els.webSearchToggle.title = disabled
        ? tr("webSearchDisabled", "Web search is unavailable when thinking is off")
        : enabled
          ? tr("webSearchEnabled", "Web search is enabled for this request")
          : tr("webSearch", "Web search");
      renderCanvasImageAiControls();
    }
    
    function toggleAiWebSearch() {
      if (currentThinkingMode() === "off") {
        state.aiDirect.webSearchEnabled = false;
        renderAiWebSearchToggle();
        toast(tr("webSearchDisabled", "Web search is unavailable when thinking is off"));
        return;
      }
      state.aiDirect.webSearchEnabled = !state.aiDirect.webSearchEnabled;
      renderAiWebSearchToggle();
      toast(state.aiDirect.webSearchEnabled
        ? tr("webSearchEnabled", "Web search is enabled for this request")
        : tr("webSearchDisabledToast", "Web search is disabled for this request"));
    }
    
    function loadAiProviderSettings() {
      ensureConfiguredAiProvider();
      const provider = currentAiProvider();
      const config = aiProviders[provider] || aiProviders.imageservice;
      const centralModel = state.clientConfig?.ai?.providers?.[provider]?.textModel || "";
      if (els.textModel) {
        els.textModel.value = localStorage.getItem(aiModelStorageKey(provider)) || centralModel || config.defaultTextModel;
        els.textModel.placeholder = config.defaultTextModel || "填写当前服务商的模型名";
      }
      renderUserImageModelControls();
      updateAiProviderUi();
    }
    
    function currentAiProvider() {
      const value = els.aiProvider?.value || localStorage.getItem("ai_provider") || "imageservice";
      const hasOption = Array.from(els.aiProvider?.options || []).some((option) => option.value === value);
      return hasOption && aiProviders[value] ? value : "imageservice";
    }

    function normalizeImageApiProvider(value) {
      return "primary";
    }

    function currentImageApiProvider() {
      if (els.imageApiProvider && els.imageApiProvider.value !== "primary") els.imageApiProvider.value = "primary";
      localStorage.removeItem("image_api_provider");
      return "primary";
    }

    function imageApiProviderLabel(provider = currentImageApiProvider()) {
      return tr("autoRoute", "Auto route");
    }

    function imageApiProviderConfigured(provider = currentImageApiProvider()) {
      const providers = state.clientConfig?.ai?.providers || {};
      return Boolean(providers.imageservice?.configured);
    }

    function ensureConfiguredImageApiProvider() {
      if (!els.imageApiProvider) return;
      if (!state.clientConfig?.ai?.providers) return;
      els.imageApiProvider.value = "primary";
      localStorage.removeItem("image_api_provider");
    }

    function syncImageApiProviderControls() {
      ensureConfiguredImageApiProvider();
    }
    
    function ensureConfiguredAiProvider() {
      if (!els.aiProvider || !state.clientConfig?.ai?.providers) return;
      const providers = state.clientConfig.ai.providers;
      const current = currentAiProvider();
      if (providers[current]?.configured) return;
      const fallback = ["imageservice", "responsesimage"].find((provider) => providers[provider]?.configured);
      if (!fallback || !aiProviders[fallback]) return;
      els.aiProvider.value = fallback;
      localStorage.setItem("ai_provider", fallback);
    }
    
    function selectedAiConfig() {
      const provider = currentAiProvider();
      const config = aiProviders[provider] || aiProviders.imageservice;
      const central = state.clientConfig?.ai?.providers?.[provider] || {};
      const imageApiProvider = currentImageApiProvider();
      return {
        provider,
        label: provider === "imageservice" ? tr("imageService", config.label) : config.label,
        configured: Boolean(central.configured),
        model: currentUserImageModel(provider) || els.textModel?.value.trim() || config.defaultTextModel,
        imageModel: currentUserImageModel(provider),
        imageApiProvider,
        imageApiProviderLabel: imageApiProviderLabel(imageApiProvider),
        imageApiProviderConfigured: imageApiProviderConfigured(imageApiProvider)
      };
    }
    
    function clearLocalAiKeys() {
      Object.keys(aiProviders).forEach((provider) => localStorage.removeItem(`ai_${provider}_api_key`));
    }
    
    function aiModelStorageKey(provider) {
      return `ai_${provider}_text_model`;
    }
    
    function aiSkillDefinitions() {
      const configured = state.clientConfig?.ai?.aiImageSkills;
      const source = Array.isArray(configured) && configured.length ? configured : fallbackAiSkillDefinitions;
      const seen = new Set();
      const normalized = source
        .map((skill) => {
          const id = String(skill?.id || "").trim();
          return {
            id,
            name: String(skill?.name || "").trim(),
            type: String(skill?.type || "通用").trim(),
            description: String(skill?.description || "").trim(),
            prompt: String(skill?.prompt || "").trim(),
            enabled: skill?.enabled !== false,
            canvasOnly: Boolean(skill?.canvasOnly),
            allowMainComposer: skill?.allowMainComposer !== false,
            allowCanvasImageEdit: skill?.allowCanvasImageEdit !== false
          };
        })
        .filter((skill) => skill.id && skill.name && skill.enabled && !seen.has(skill.id) && seen.add(skill.id));
      if (!normalized.some((skill) => skill.id === "none")) {
        normalized.unshift(fallbackAiSkillDefinitions[0]);
      }
      return normalized.length ? normalized : fallbackAiSkillDefinitions;
    }
    
    function selectedAiSkill() {
      const skills = aiSkillDefinitions();
      const noneSkill = skills.find((item) => item.id === "none") || fallbackAiSkillDefinitions[0];
      if (!state.aiDirect.selectedSkillId || state.aiDirect.selectedSkillId === "none") return localizedSkill(noneSkill);
      const selected = skills.find((item) => item.id === state.aiDirect.selectedSkillId);
      if (!selected || selected.canvasOnly || selected.allowMainComposer === false) return localizedSkill(noneSkill);
      return localizedSkill(selected);
    }

    function maxMainComposerImageCount(provider = currentAiProvider()) {
      if (selectedAiSkill()?.id === "detail-page-planner-agent") return 8;
      if (selectedAiSkill()?.id === "main-image-matrix-agent") return 5;
      return provider === "responsesimage" ? 1 : 4;
    }

    function syncMainComposerImageCountLimit() {
      if (!els.imageCount) return;
      const maxCount = maxMainComposerImageCount();
      els.imageCount.max = String(maxCount);
      if (Number(els.imageCount.value || 1) > maxCount) {
        els.imageCount.value = String(maxCount);
      }
    }
    
    function studioSkillCategoryForSkill(skill) {
      const text = `${skill?.type || ""} ${skill?.name || ""}`.toLowerCase();
      if (text.includes("video") || text.includes("视频")) return "video";
      if (text.includes("social") || text.includes("社媒") || text.includes("内容平台")) return "social";
      if (text.includes("品牌") || text.includes("brand")) return "branding";
      return "ecommerce";
    }
    
    function skillsForStudioCategory(category) {
      const skills = aiSkillDefinitions().filter((skill) => !skill.canvasOnly && skill.allowMainComposer !== false);
      if (category === "ecommerce") return skills.filter((skill) => skill.id === "none" || studioSkillCategoryForSkill(skill) === "ecommerce");
      return skills.filter((skill) => studioSkillCategoryForSkill(skill) === category);
    }
    
    function renderAiSkillSelector() {
      const selected = selectedAiSkill();
      const isDetailAgent = selected.id === "detail-page-planner-agent";
      if (els.selectedSkillName) els.selectedSkillName.textContent = selected.id === "none" ? tr("skillNoneName", "Not selected") : selected.name;
      if (els.directPromptInput) els.directPromptInput.placeholder = isDetailAgent
        ? tr("detailPromptPlaceholder", "Upload the new product identity image and optional layout references, then describe the complete detail page.")
        : tr("promptDescription", "Describe the image or upload references");
      if (els.referenceImageInput) {
        const acceptsPlanningSheet = isDetailAgent;
        els.referenceImageInput.accept = acceptsPlanningSheet
          ? "image/png,image/jpeg,.xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
          : "image/png,image/jpeg";
        const uploadLabel = els.referenceImageInput.closest("label");
        if (uploadLabel) uploadLabel.title = acceptsPlanningSheet
          ? tr("planningUpload", "Upload product images, layout references, or Excel/CSV data")
          : tr("uploadAttachment", "Upload attachments or assets");
      }
      renderCanvasImageAiControls();
      syncMainComposerImageCountLimit();
      updateComposerModelSummary();
      if (!els.aiSkillMenu) return;
      const activeCategory = studioSkillCategories.some((category) => category.id === state.aiDirect.skillCategory)
        ? state.aiDirect.skillCategory
        : "ecommerce";
      const skills = skillsForStudioCategory(activeCategory);
      const compactCategoryLabels = {
        video: tr("skillCategoryVideo", "Video"),
        social: tr("skillCategorySocial", "Social"),
        ecommerce: tr("skillCategoryEcommerce", "E-Com"),
        branding: tr("skillCategoryBrand", "Brand")
      };
      const categoryTabs = studioSkillCategories.map((category) => `
        <button class="${category.id === activeCategory ? "active" : ""}" type="button" data-ai-skill-category="${escapeHtml(category.id)}">
          ${escapeHtml(compactCategoryLabels[category.id] || category.label)}
        </button>
      `).join("");
      const skillButtons = skills.length ? skills.map((skill) => {
        const visibleSkill = localizedSkill(skill);
        return `
          <button class="ai-skill-option ${skill.id === selected.id ? "active" : ""}" type="button" data-ai-skill="${escapeHtml(skill.id)}">
            <span>${escapeHtml(visibleSkill.type)}</span>
            <b>${escapeHtml(visibleSkill.name)}</b>
            <small>${escapeHtml(visibleSkill.description)}</small>
          </button>
        `;
      }).join("") : `
        <div class="ai-skill-empty">
          <b>${escapeHtml(compactCategoryLabels[activeCategory] || tr("skills", "Skills"))}</b>
          <span>${escapeHtml(tr("noSkill", "No executable Skill is available in this category."))}</span>
        </div>
      `;
      const inlineSettings = selected.id === "detail-page-planner-agent" ? `
        <section class="ai-agent-inline-settings" aria-label="${escapeHtml(tr("detailLayout", "Detail-page layout"))}">
          <div class="ai-agent-inline-head"><b>${escapeHtml(tr("detailLayout", "Detail-page layout"))}</b><small>${escapeHtml(tr("currentTaskOnly", "Current task only"))}</small></div>
          <p>${escapeHtml(tr("detailLayoutDescription", "Arrange grids, whitespace, and module rhythm from the current product materials and references."))}</p>
        </section>
      ` : "";
      els.aiSkillMenu.innerHTML = `
        <div class="composer-popover-head ai-skill-menu-head">
          <b>Agent</b>
          <button class="composer-popover-close" type="button" data-ai-popover-close="skill" aria-label="${escapeHtml(tr("close", "Close"))}">&times;</button>
        </div>
        <div class="ai-skill-tabs">${categoryTabs}</div>
        ${inlineSettings}
        <div class="ai-skill-options">${skillButtons}</div>
      `;
      requestAnimationFrame(() => {
        els.aiSkillMenu?.querySelector(".ai-skill-option.active")?.scrollIntoView({ block: "nearest" });
      });
    }
    
    async function toggleAiSkillMenu(event) {
      event?.stopPropagation?.();
      if (!els.aiSkillMenu || !els.aiSkillMenuBtn) return;
      if (aiConfigTabIsOpen("agent")) return closeAiConfigDrawer();
      setAiConfigDrawerState("agent", true);
      renderAiSkillSelector();
      await loadClientConfig({ skipTriggerCheck: true });
      renderAiSkillSelector();
    }
    
    function closeAiSkillMenu() {
      window.clearTimeout(aiSkillMenuCloseTimer);
      aiSkillMenuCloseTimer = 0;
      closeAiConfigDrawer();
    }

    function confirmAiSkillSetting(message) {
      window.clearTimeout(aiSkillMenuCloseTimer);
      toast(message);
      aiSkillMenuCloseTimer = window.setTimeout(() => {
        aiSkillMenuCloseTimer = 0;
        closeAiSkillMenu();
      }, 700);
    }
    
    function closeAiSkillMenuOnOutsideClick(event) {
      return;
    }
    
    function selectDisplayText(select) {
      const option = select?.selectedOptions?.[0];
      return option?.textContent?.trim() || select?.value || tr("selectOption", "Select");
    }
    
    function enhanceCustomSelects(root = document) {
      root.querySelectorAll("select").forEach((select) => {
        if (select.hidden) return;
        let custom = select.nextElementSibling;
        if (!custom?.classList?.contains("custom-select")) {
          custom = document.createElement("div");
          custom.className = "custom-select";
          custom.innerHTML = `
            <button class="custom-select-button" type="button" aria-expanded="false">
              <span></span>
            </button>
            <div class="custom-select-menu" hidden></div>
          `;
          select.insertAdjacentElement("afterend", custom);
          custom.querySelector(".custom-select-button").addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (select.disabled) return;
            const menu = custom.querySelector(".custom-select-menu");
            const willOpen = menu.hidden;
            closeCustomSelects(custom);
            menu.hidden = !willOpen;
            custom.classList.toggle("open", willOpen);
            custom.querySelector(".custom-select-button").setAttribute("aria-expanded", String(willOpen));
          });
          custom.querySelector(".custom-select-menu").addEventListener("click", (event) => {
            const optionButton = event.target.closest("[data-select-value]");
            if (!optionButton || optionButton.disabled) return;
            select.value = optionButton.dataset.selectValue;
            select.dispatchEvent(new Event("input", { bubbles: true }));
            select.dispatchEvent(new Event("change", { bubbles: true }));
            refreshCustomSelect(select);
            closeCustomSelects();
          });
        }
        select.classList.add("native-select-hidden");
        if (!select.dataset.customSelectBound) {
          select.addEventListener("change", () => refreshCustomSelect(select));
          select.dataset.customSelectBound = "1";
        }
        refreshCustomSelect(select);
      });
    }
    
    function refreshCustomSelect(select) {
      const custom = select?.nextElementSibling;
      if (!custom?.classList?.contains("custom-select")) return;
      const label = custom.querySelector(".custom-select-button span");
      const menu = custom.querySelector(".custom-select-menu");
      if (label) label.textContent = selectDisplayText(select);
      custom.classList.toggle("disabled", Boolean(select.disabled));
      const options = Array.from(select.options || []);
      menu.innerHTML = options.map((option) => `
        <button class="${option.selected ? "active" : ""}" type="button" data-select-value="${escapeHtml(option.value)}" ${option.disabled ? "disabled" : ""}>
          <b>${escapeHtml(option.textContent.trim())}</b>
        </button>
      `).join("");
    }

    function snapshotSettingsBeforeDetailPageAgent() {
      state.aiDirect.settingsBeforeDetailPageAgent = {
        provider: els.aiProvider?.value || "imageservice",
        aspectRatio: els.aspectRatio?.value || "1:1",
        imageSize: els.imageSize?.value || "1K",
        imageCount: els.imageCount?.value || "1",
        thinkingMode: els.thinkingMode?.value || "standard",
        outputSizeMode: state.aiDirect.outputSizeMode || "auto"
      };
    }

    function restoreSettingsAfterDetailPageAgent() {
      const saved = state.aiDirect.settingsBeforeDetailPageAgent;
      if (!saved) return;
      state.aiDirect.outputSizeMode = saved.outputSizeMode || "auto";
      localStorage.setItem("ai_output_size_mode", state.aiDirect.outputSizeMode);
      if (els.aiProvider) {
        els.aiProvider.value = saved.provider || "imageservice";
        localStorage.setItem("ai_provider", els.aiProvider.value);
        loadAiProviderSettings();
      }
      if (els.aspectRatio) {
        els.aspectRatio.value = saved.aspectRatio || "1:1";
        localStorage.setItem("ai_aspect_ratio", els.aspectRatio.value);
        refreshCustomSelect(els.aspectRatio);
      }
      if (els.imageSize) {
        els.imageSize.value = saved.imageSize || "1K";
        localStorage.setItem("ai_image_size", els.imageSize.value);
        refreshCustomSelect(els.imageSize);
      }
      if (els.imageCount) els.imageCount.value = saved.imageCount || "1";
      if (els.thinkingMode) {
        els.thinkingMode.value = saved.thinkingMode || "standard";
        localStorage.setItem("ai_thinking_mode", els.thinkingMode.value);
        refreshCustomSelect(els.thinkingMode);
      }
      delete state.aiDirect.settingsBeforeDetailPageAgent;
    }
    
    function closeCustomSelects(except = null) {
      document.querySelectorAll(".custom-select").forEach((custom) => {
        if (except && custom === except) return;
        const menu = custom.querySelector(".custom-select-menu");
        if (menu) menu.hidden = true;
        custom.classList.remove("open");
        custom.querySelector(".custom-select-button")?.setAttribute("aria-expanded", "false");
      });
    }
    
    function closeCustomSelectsOnOutsideClick(event) {
      if (event.target?.closest?.(".custom-select")) return;
      closeCustomSelects();
    }
    
    function aspectRatioOptionsForProvider(provider) {
      return providerAspectRatioOptions[provider] || fullAspectRatioOptions;
    }
    
    function syncAspectRatioOptionsForProvider(provider) {
      if (!els.aspectRatio) return;
      const options = aspectRatioOptionsForProvider(provider);
      const current = els.aspectRatio.value || "1:1";
      const nextValue = options.includes(current) ? current : options[0];
      const signature = options.join("|");
      if (els.aspectRatio.dataset.optionSignature !== signature) {
        els.aspectRatio.innerHTML = options.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
        els.aspectRatio.dataset.optionSignature = signature;
      }
      els.aspectRatio.value = nextValue;
      refreshCustomSelect(els.aspectRatio);
    }
    
    function handleAiSkillMenuClick(event) {
      event?.stopPropagation?.();
      window.clearTimeout(aiSkillMenuCloseTimer);
      aiSkillMenuCloseTimer = 0;
      const closeButton = event.target?.closest?.("[data-ai-popover-close='skill']");
      if (closeButton) {
        closeAiSkillMenu();
        return;
      }
      const categoryButton = event.target?.closest?.("[data-ai-skill-category]");
      if (categoryButton) {
        state.aiDirect.skillCategory = categoryButton.dataset.aiSkillCategory || "ecommerce";
        localStorage.setItem("ai_skill_category", state.aiDirect.skillCategory);
        renderAiSkillSelector();
        return;
      }
      const button = event.target?.closest?.("[data-ai-skill]");
      if (!button) return;
      const previousSkillId = state.aiDirect.selectedSkillId || "none";
      const nextSkillId = button.dataset.aiSkill || "none";
      if (previousSkillId !== "detail-page-planner-agent" && nextSkillId === "detail-page-planner-agent") {
        snapshotSettingsBeforeDetailPageAgent();
      } else if (previousSkillId === "detail-page-planner-agent" && nextSkillId !== "detail-page-planner-agent") {
        restoreSettingsAfterDetailPageAgent();
      }
      state.aiDirect.selectedSkillId = nextSkillId;
      localStorage.removeItem("ai_selected_skill");
      renderAiSkillSelector();
      saveAiConversationDebounced();
      if (nextSkillId !== "detail-page-planner-agent") closeAiSkillMenu();
    }
    
    function updateAiProviderUi() {
      const provider = currentAiProvider();
      ensureConfiguredImageApiProvider();
      syncAspectRatioOptionsForProvider(provider);
      if (els.generateCopyBtn) els.generateCopyBtn.textContent = "AI生文案";
      if (els.generateImagesBtn) els.generateImagesBtn.textContent = "↑";
      if (els.imageSize) {
        els.imageSize.disabled = !["imageservice", "responsesimage"].includes(provider);
      }
      if (els.textModel) {
        const isImageService = provider === "imageservice";
        els.textModel.disabled = isImageService;
        if (isImageService) els.textModel.value = "Image 2 后台统一配置";
      }
      if (els.imageCount) {
        syncMainComposerImageCountLimit();
      }
      if (els.workspaceModelStatus) {
        const providers = state.clientConfig?.ai?.providers || {};
        const configured = ["imageservice", "secondaryimage", "responsesimage"].some((id) => providers[id]?.configured);
        els.workspaceModelStatus.textContent = configured ? tr("online", "Online") : tr("unconfigured", "Not configured");
        els.workspaceModelStatus.classList.toggle("is-unconfigured", !configured);
        els.workspaceModelStatus.title = configured
          ? tr("modelReadyTitle", "An image generation service is configured")
          : tr("modelMissingTitle", "Configure an image generation API key in the admin console");
      }
      syncImageApiProviderControls();
      renderUserImageModelControls();
      updateComposerModelSummary();
      syncStudioComposerControls();
      enhanceCustomSelects();
    }

    return {
      persistAiSettings,
      handleAiProviderChange,
      handleImageApiProviderChange,
      handleUserImageModelSave,
      handleUserImageModelSelect,
      handleUserImageModelReset,
      toggleAiSettingsDrawer,
      closeAiSettingsDrawer,
      toggleAiModelPrefsPanel,
      closeAiModelPrefsPanel,
      closeStudioComposerPopoversOnOutsideClick,
      currentThinkingMode,
      renderThinkingModeHint,
      handleThinkingModeChange,
      renderAiWebSearchToggle,
      toggleAiWebSearch,
      loadAiProviderSettings,
      currentAiProvider,
      currentImageApiProvider,
      imageApiProviderLabel,
      syncImageApiProviderControls,
      ensureConfiguredAiProvider,
      selectedAiConfig,
      clearLocalAiKeys,
      aiModelStorageKey,
      currentUserImageModel,
      renderUserImageModelControls,
      aiSkillDefinitions,
      selectedAiSkill,
      studioSkillCategoryForSkill,
      skillsForStudioCategory,
      renderAiSkillSelector,
      toggleAiSkillMenu,
      closeAiSkillMenu,
      closeAiSkillMenuOnOutsideClick,
      selectDisplayText,
      enhanceCustomSelects,
      refreshCustomSelect,
      closeCustomSelects,
      closeCustomSelectsOnOutsideClick,
      aspectRatioOptionsForProvider,
      syncAspectRatioOptionsForProvider,
      handleAiSkillMenuClick,
      updateAiProviderUi
    };
  };
})();
