(function () {
  const app = window.EcommerceCanvasApp = window.EcommerceCanvasApp || {};

  app.createAppShellController = function createAppShellController(deps) {
    const {
      $$,
      els,
      state,
      aiProviders,
      clearLoginSecrets,
      loadAiProviderSettings,
      renderThinkingModeHint,
      renderAiSkillSelector,
      renderUserImageModelControls,
      updateComposerModelSummary,
      loadClientConfig,
      initAccount,
      renderAccountState,
      renderAiGeneratedList,
      renderAiConversationList,
      renderCanvasAssets,
      renderReferencePreviewList,
      renderAiWebSearchToggle,
      updateAiProviderUi,
      enhanceCustomSelects,
      renderRelayPreview,
      initCanvasBeta,
      toast,
      canvasBetaStatus,
      addCanvasFrame,
      addCanvasShape,
      activateCanvasToolMode,
      createCanvasProject,
      saveCanvasProject,
      handleCanvasAssetInput,
      activateCanvasSelectTool,
      addCanvasText,
      duplicateCanvasSelection,
      deleteCanvasSelection,
      setCanvasLayerPanelOpen,
      toggleCanvasLayerHistory,
      zoomCanvasBy,
      fitCanvasView,
      hideCanvasImageAiEditor,
      toggleCanvasImageAiWebSearch,
      openCanvasImageAiModelPrefs,
      openCanvasImageAiSettings,
      openCanvasImageAiReferencePicker,
      handleCanvasImageAiSettingsClick,
      handleCanvasImageAiSizeInput,
      handleCanvasImageAiModelClick,
      handleCanvasImageAiAutoModeToggle,
      submitCanvasImageAiEdit,
      handleCanvasImageAiReferenceInput,
      handleCanvasImageAiReferencePaste,
      handleCanvasImageAiReferenceDragOver,
      handleCanvasImageAiReferenceDragLeave,
      handleCanvasImageAiReferenceDrop,
      startCanvasImageAiDrag,
      handleCanvasObjectAction,
      handleCanvasContextAction,
      handleAiProviderChange,
      handleImageApiProviderChange,
      handleUserImageModelSave,
      handleUserImageModelSelect,
      handleUserImageModelReset,
      handleThinkingModeChange,
      toggleAiSettingsDrawer,
      toggleAiModelPrefsPanel,
      handleStudioSettingsClick,
      handleAiModelPrefsClick,
      handleAiAutoModeToggle,
      handleAiCanvasSizeInput,
      toggleAiSkillMenu,
      handleAiSkillMenuClick,
      persistAiSettings,
      handleReferenceImageInput,
      clearCanvasFocusTarget,
      toggleAiWebSearch,
      saveAiConversationNow,
      createNewAiConversation,
      handleDirectPromptInput,
      handleUseSelectedImageToggle,
      clearAiConversation,
      saveAiConversationDebounced,
      generateAiImages,
      handleAiPaste,
      closeAiSkillMenuOnOutsideClick,
      closeStudioComposerPopoversOnOutsideClick,
      closeCustomSelectsOnOutsideClick,
      handleAiDragOver,
      handleAiDragLeave,
      handleAiDrop,
      closeImagePreview,
      closeAiSettingsDrawer,
      closeAiModelPrefsPanel,
      closeAiSkillMenu,
      switchStudioPanel
    } = deps;

    function init() {
      window.EcommerceCanvasI18n?.apply(document);
      window.addEventListener("ai-canvas-locale-change", () => {
        window.EcommerceCanvasI18n?.apply(document);
        renderThinkingModeHint();
        renderAiSkillSelector();
        renderUserImageModelControls();
        updateComposerModelSummary();
        updateAiProviderUi();
        renderAccountState();
        renderAiGeneratedList();
        renderAiConversationList();
        renderCanvasAssets();
        renderReferencePreviewList();
        renderAiWebSearchToggle();
        renderRelayPreview();
        enhanceCustomSelects();
      });
      clearLoginSecrets();
      if (els.aiConfigAgentMount && els.aiSkillMenu && els.aiSkillMenu.parentElement !== els.aiConfigAgentMount) {
        els.aiConfigAgentMount.append(els.aiSkillMenu);
      }
      if (els.aiProvider) {
        const savedProvider = localStorage.getItem("ai_provider");
        els.aiProvider.value = aiProviders[savedProvider] ? savedProvider : "imageservice";
      }
      if (els.imageApiProvider) {
        els.imageApiProvider.value = "primary";
        localStorage.removeItem("image_api_provider");
      }
      localStorage.removeItem("canvas_image_ai_image_api_provider");
      if (els.thinkingMode) {
        els.thinkingMode.value = localStorage.getItem("ai_thinking_mode") || "standard";
      }
      loadAiProviderSettings();
      renderThinkingModeHint();
      renderAiSkillSelector();
      updateComposerModelSummary();
      loadClientConfig();

      bindEvents();
      initWorkspaceHoverHints();
      initAccount();
      switchWorkflow("direct");
      renderAiGeneratedList();
      renderAiConversationList();
      renderReferencePreviewList();
      renderAiWebSearchToggle();
      enhanceCustomSelects();
      renderRelayPreview();
    }
    
    function openCanvasFilePicker(input, label) {
      initCanvasBeta();
      if (!input) {
        toast(`${label}入口没有找到。`);
        return;
      }
      try {
        input.value = "";
        input.focus?.({ preventScroll: true });
        input.click();
        canvasBetaStatus(`${label}：请选择文件。`);
      } catch (error) {
        console.error(error);
        toast(`${label}入口打开失败，请拖拽或粘贴文件到画布。`);
      }
    }

    function bindEvents() {
      const on = (element, event, handler) => {
        if (element) element.addEventListener(event, handler);
      };
      const bindUploadSurface = (element, handlers = {}) => {
        if (!element) return;
        if (!/^(INPUT|TEXTAREA|BUTTON|A)$/i.test(element.tagName || "") && !element.hasAttribute("tabindex")) {
          element.tabIndex = 0;
        }
        if (handlers.paste) element.addEventListener("paste", handlers.paste);
        if (handlers.dragover) element.addEventListener("dragover", handlers.dragover);
        if (handlers.dragleave) element.addEventListener("dragleave", handlers.dragleave);
        if (handlers.drop) element.addEventListener("drop", handlers.drop);
      };
      els.workflowTabs.forEach((button) => {
        button.addEventListener("click", () => switchWorkflow(button.dataset.workflow));
      });
      $$("[data-canvas-frame]").forEach((button) => {
        button.addEventListener("click", () => addCanvasFrame(button.dataset.canvasFrame));
      });
      $$("[data-canvas-shape]").forEach((button) => {
        button.addEventListener("click", () => addCanvasShape(button.dataset.canvasShape));
      });
      $$("[data-tool-mode]").forEach((button) => {
        button.addEventListener("click", () => activateCanvasToolMode(button.dataset.toolMode));
      });
      on(els.canvasNewProjectBtn, "click", createCanvasProject);
      on(els.canvasSaveProjectBtn, "click", saveCanvasProject);
      on(els.canvasAssetInput, "change", handleCanvasAssetInput);
      on(els.canvasSelectBtn, "click", activateCanvasSelectTool);
      on(els.canvasNewToolBtn, "click", () => canvasBetaStatus("新增：可上传图片，或新建智能画板/详情长图。"));
      on(els.canvasShapeToolBtn, "click", () => canvasBetaStatus("形状：选择一个图形后会加入当前画布。"));
      on(els.canvasDrawToolBtn, "click", () => canvasBetaStatus("画笔：选择铅笔或钢笔后即可在画布上绘制。"));
      on(els.canvasUploadAssetToolBtn, "click", () => openCanvasFilePicker(els.canvasAssetInput, "上传图片"));
      on(els.canvasUploadAssetMenuBtn, "click", () => openCanvasFilePicker(els.canvasAssetInput, "上传图片"));
      on(els.canvasAddTextBtn, "click", addCanvasText);
      on(els.canvasDuplicateBtn, "click", duplicateCanvasSelection);
      on(els.canvasDeleteBtn, "click", deleteCanvasSelection);
      on(els.canvasLayerPanelCloseBtn, "click", () => setCanvasLayerPanelOpen(false));
      on(els.canvasLayerPanelToggleBtn, "click", () => setCanvasLayerPanelOpen(!state.canvasBeta.layerPanelOpen));
      on(els.canvasLayerHistoryToggleBtn, "click", toggleCanvasLayerHistory);
      on(els.canvasZoomInBtn, "click", () => zoomCanvasBy(1.18));
      on(els.canvasZoomOutBtn, "click", () => zoomCanvasBy(0.84));
      on(els.canvasFitBtn, "click", fitCanvasView);
      on(els.canvasImageAiCloseBtn, "click", () => hideCanvasImageAiEditor({ collapse: true }));
      on(els.canvasImageAiWebSearchBtn, "click", toggleCanvasImageAiWebSearch);
      on(els.canvasImageAiModelPrefsBtn, "click", openCanvasImageAiModelPrefs);
      on(els.canvasImageAiSettingsBtn, "click", openCanvasImageAiSettings);
      on(els.canvasImageAiAddRefBtn, "click", openCanvasImageAiReferencePicker);
      on(els.canvasImageAiSettingsPanel, "click", handleCanvasImageAiSettingsClick);
      on(els.canvasImageAiWidthInput, "input", handleCanvasImageAiSizeInput);
      on(els.canvasImageAiHeightInput, "input", handleCanvasImageAiSizeInput);
      on(els.canvasImageAiModelPanel, "click", handleCanvasImageAiModelClick);
      on(els.canvasImageAiAutoModeToggle, "change", handleCanvasImageAiAutoModeToggle);
      on(els.canvasImageAiSendBtn, "click", () => submitCanvasImageAiEdit());
      on(els.canvasImageAiReferenceInput, "change", handleCanvasImageAiReferenceInput);
      [els.canvasImageAiEditor, els.canvasImageAiReferenceList, els.canvasImageAiPrompt].forEach((element) => {
        bindUploadSurface(element, {
          paste: handleCanvasImageAiReferencePaste,
          dragover: handleCanvasImageAiReferenceDragOver,
          dragleave: handleCanvasImageAiReferenceDragLeave,
          drop: handleCanvasImageAiReferenceDrop
        });
      });
      els.canvasImageAiEditor?.querySelector(".canvas-image-ai-head")?.addEventListener("pointerdown", startCanvasImageAiDrag);
      on(els.canvasImageAiPrompt, "keydown", (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
          event.preventDefault();
          submitCanvasImageAiEdit();
        }
      });
      els.canvasObjectToolbar?.querySelectorAll("[data-canvas-object-action]").forEach((button) => {
        button.addEventListener("click", () => handleCanvasObjectAction(button.dataset.canvasObjectAction));
      });
      els.canvasContextMenu?.querySelectorAll("[data-canvas-context-action]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          handleCanvasContextAction(button.dataset.canvasContextAction);
        });
      });
      els.studioPanelButtons.forEach((button) => {
        button.addEventListener("click", () => switchStudioPanel(button.dataset.studioPanel));
      });
      els.studioSuggestionCards.forEach((button) => {
        button.addEventListener("click", () => {
          const prompt = button.dataset.prompt || "";
          if (!prompt || !els.directPromptInput) return;
          els.directPromptInput.value = prompt;
          state.aiDirect.prompt = prompt;
          els.directPromptInput.focus();
        });
      });
      on(els.aiProvider, "change", handleAiProviderChange);
      on(els.imageApiProvider, "change", handleImageApiProviderChange);
      on(els.thinkingMode, "change", handleThinkingModeChange);
      on(els.aiSettingsToggleBtn, "click", toggleAiSettingsDrawer);
      on(els.aiModelPrefsBtn, "click", toggleAiModelPrefsPanel);
      on(els.aiConfigSummaryBtn, "click", toggleAiSettingsDrawer);
      on(els.aiConfigDrawerCloseBtn, "click", closeAiSettingsDrawer);
      els.aiConfigTabs?.forEach((button) => {
        button.addEventListener("click", (event) => {
          const tab = button.dataset.aiConfigTab || "output";
          if (!els.aiConfigDrawer?.hidden && els.aiConfigDrawer?.dataset.activeTab === tab) return;
          if (tab === "agent") toggleAiSkillMenu(event);
          else if (tab === "model") toggleAiModelPrefsPanel(event);
          else toggleAiSettingsDrawer(event);
        });
      });
      on(els.aiSettingsDrawer, "click", handleStudioSettingsClick);
      on(els.aiModelPrefsPanel, "click", handleAiModelPrefsClick);
      on(els.aiAutoModeToggle, "change", handleAiAutoModeToggle);
      on(els.userImageModelSaveBtn, "click", handleUserImageModelSave);
      on(els.userImageModelSelect, "change", handleUserImageModelSelect);
      on(els.userImageModelResetBtn, "click", handleUserImageModelReset);
      [els.aiWidthInput, els.aiHeightInput].forEach((input) => on(input, "change", handleAiCanvasSizeInput));
      on(els.aiSkillMenuBtn, "click", toggleAiSkillMenu);
      on(els.aiSkillMenu, "click", handleAiSkillMenuClick);
      on(els.textModel, "input", () => {
        persistAiSettings();
        updateComposerModelSummary();
      });
      on(els.referenceImageInput, "change", handleReferenceImageInput);
      on(els.canvasFocusTargetChip, "click", (event) => {
        if (event.target?.closest?.("[data-clear-canvas-focus]")) clearCanvasFocusTarget();
      });
      on(els.webSearchToggle, "click", toggleAiWebSearch);
      on(els.newAiConversationBtn, "click", async () => {
        saveAiConversationNow({ applyToActive: false });
        createNewAiConversation({ save: true });
        switchStudioPanel("ai");
      });
      on(els.directPromptInput, "input", handleDirectPromptInput);
      on(els.useSelectedImageInput, "change", handleUseSelectedImageToggle);
      on(els.clearFollowupBtn, "click", clearAiConversation);
      on(els.aspectRatio, "change", () => {
        updateComposerModelSummary();
        saveAiConversationDebounced();
      });
      on(els.imageSize, "change", () => {
        updateComposerModelSummary();
        saveAiConversationDebounced();
      });
      on(els.imageCount, "input", () => {
        updateComposerModelSummary();
        saveAiConversationDebounced();
      });
      on(els.generateImagesBtn, "click", generateAiImages);
      const referenceUploadSurface = document.querySelector("label[for='referenceImageInput']");
      [referenceUploadSurface, els.referencePreviewList, els.directPromptInput].forEach((element) => {
        bindUploadSurface(element, {
          paste: handleAiPaste,
          dragover: handleAiDragOver,
          dragleave: handleAiDragLeave,
          drop: handleAiDrop
        });
      });
      document.addEventListener("click", closeAiSkillMenuOnOutsideClick);
      document.addEventListener("click", closeStudioComposerPopoversOnOutsideClick);
      document.addEventListener("click", closeCustomSelectsOnOutsideClick);
      $$("[data-close-preview]").forEach((element) => element.addEventListener("click", closeImagePreview));
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeImagePreview();
      });
    }
    
    function initWorkspaceHoverHints() {
      $$(".studio-tool-group").forEach((group) => {
        const trigger = group.querySelector(".studio-tool");
        group.addEventListener("mouseenter", () => group.classList.add("open"));
        group.addEventListener("mouseleave", () => group.classList.remove("open"));
        trigger?.addEventListener("click", (event) => {
          event.stopPropagation();
          const wasOpen = group.classList.contains("open");
          $$(".studio-tool-group.open").forEach((item) => {
            if (item !== group) item.classList.remove("open");
          });
          group.classList.toggle("open", !wasOpen);
          const label = trigger.dataset.tooltip || trigger.title || "工具";
          if (label && !wasOpen) canvasBetaStatus(`${label.replace(/\s+/g, " ")}：已打开工具菜单。`);
        });
        group.querySelectorAll(".studio-flyout [data-tool-mode], .studio-flyout [data-canvas-shape], .studio-flyout [data-canvas-upload], .studio-flyout label").forEach((item) => {
          item.addEventListener("click", () => {
            window.setTimeout(() => group.classList.remove("open"), 120);
          });
        });
      });
      document.addEventListener("click", (event) => {
        if (event.target?.closest?.(".studio-tool-group")) return;
        $$(".studio-tool-group.open").forEach((group) => group.classList.remove("open"));
      });
    }
    
    function switchWorkflow(workflow) {
      state.activeWorkflow = "direct";
      if (els.activeWorkflowName) {
        els.activeWorkflowName.textContent = window.EcommerceCanvasI18n?.t("productName", "AI Creative Canvas") || "AI Creative Canvas";
      }
      els.workflowTabs.forEach((button) => {
        button.classList.toggle("active", button.dataset.workflow === "direct");
      });
      els.workflowSections.forEach((section) => {
        section.classList.toggle("active", section.dataset.workflowPanel === "direct");
      });
      renderAiGeneratedList();
      initCanvasBeta();
      enhanceCustomSelects();
    }

    return {
      init,
      openCanvasFilePicker,
      bindEvents,
      initWorkspaceHoverHints,
      switchWorkflow
    };
  };
})();
