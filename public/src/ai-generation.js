(function () {
  const app = window.EcommerceCanvasApp = window.EcommerceCanvasApp || {};

  app.createAiGenerationController = function createAiGenerationController(deps) {
    const {
      els,
      state,
      createClientId,
      escapeHtml,
      formatFileSize,
      toast,
      setBusy,
      sleep,
      loadImage,
      maxAiReferenceImages,
      requireLoggedIn,
      handleAuthFailure,
      refreshAccount,
      imageUrlToDataUrl,
      selectedAiConfig,
      selectedAiSkill,
      currentThinkingMode,
      ensureActiveAiConversation,
      cloneAiConversationSnapshot,
      currentAiConversationSnapshot,
      saveAiConversationNow,
      saveAiConversationDebounced,
      syncAspectRatioFromCanvasFrame,
      syncAspectRatioForAiRequest,
      currentUiExactOutputSize,
      aiExactOutputSizeForRequest,
      resizeAiGeneratedImagesToExactSize,
      loadImageDimensions,
      closestAspectRatioFromSize,
      clearCanvasFocusTarget,
      renderCanvasFocusTargetChip,
      addAiImageToCanvasAssets,
      autoInsertGeneratedImagesToCanvas,
      createCanvasGenerationPlaceholder,
      replaceCanvasGenerationPlaceholder,
      markCanvasGenerationPlaceholderError,
      removeCanvasGenerationPlaceholder,
      updateCanvasGenerationPlaceholderProgress,
      showAiFailureDialog,
      normalizeAiReferenceRole,
      imageIndexLabel,
      compactFileName,
      referenceVisibleSummary,
      inferReferenceRoleOverrides,
      updateSummary,
      updateCanvasObjectToolbar,
      renderAiWebSearchToggle,
      renderAiSkillSelector,
      renderAiGeneratedList,
      renderAiChatList,
      renderAiGeneratedStatus,
      renderAiGeneratedError,
      renderAiConversationList,
      openImagePreview,
      findGeneratedImage
    } = deps;

    function clearAiConversation() {
      const activeConversationId = state.aiDirect.activeConversationId;
      const hasActiveGeneration = Object.values(state.aiDirect.generationTasks || {}).some((task) => (
        task?.conversationId === activeConversationId && ["preparing", "queued", "running"].includes(String(task?.status || ""))
      ));
      if (hasActiveGeneration) {
        toast("当前对话还有图片在生成，完成后再清空。");
        return;
      }
      state.aiDirect.chatMessages = [];
      state.aiDirect.turns = [];
      state.aiDirect.generatedImages = [];
      state.aiDirect.references = [];
      state.aiDirect.detailPlanningMaterials = [];
      state.aiDirect.selectedEditImageKey = "";
      state.aiDirect.useSelectedImageAsBase = false;
      state.aiDirect.canvasFocusTarget = null;
      state.canvasBeta.pendingFocusTarget = null;
      state.aiDirect.pendingStatus = null;
      state.aiDirect.prompt = "";
      state.aiDirect.selectedSkillId = "none";
      localStorage.removeItem("ai_selected_skill");
      state.aiDirect.visibleMessageLimit = 12;
      if (els.directPromptInput) els.directPromptInput.value = "";
      if (els.useSelectedImageInput) els.useSelectedImageInput.checked = false;
      renderSelectedEditImageState();
      renderCanvasFocusTargetChip();
      renderReferencePreviewList();
      renderAiChatList();
      renderRelayPreview();
      renderAiSkillSelector?.();
      saveAiConversationNow({ mergeMode: "replace", allowEmpty: true });
    }

    function aiReferenceLimit() {
      const limit = Number(maxAiReferenceImages);
      return Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 10;
    }

    function selectedAiSkillId() {
      return selectedAiSkill()?.id || "none";
    }

    const designPlanAgentIds = new Set(["main-image-matrix-agent", "detail-page-planner-agent"]);
    const activeGenerationStatuses = new Set(["preparing", "queued", "running"]);
    const ordinaryGenerationUnitLimit = 8;

    function generationTask(taskId = "") {
      return taskId ? state.aiDirect.generationTasks?.[taskId] || null : null;
    }

    function activeOrdinaryGenerationUnits() {
      return Object.values(state.aiDirect.generationTasks || {}).reduce((sum, task) => {
        if (!task || task.detailPage || !activeGenerationStatuses.has(String(task.status || ""))) return sum;
        return sum + Math.max(1, Number(task.requestedCount || 1));
      }, 0);
    }

    function registerGenerationTask(task = {}) {
      const id = String(task.id || createClientId());
      if (!state.aiDirect.generationTasks || typeof state.aiDirect.generationTasks !== "object") {
        state.aiDirect.generationTasks = {};
      }
      state.aiDirect.generationTasks[id] = {
        ...task,
        id,
        status: task.status || "preparing",
        progress: task.progress || { status: "preparing", percent: 2, message: "正在准备生图任务" },
        createdAt: task.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      renderAiConversationList?.();
      renderAiChatList?.();
      return state.aiDirect.generationTasks[id];
    }

    function updateGenerationTask(taskId, patch = {}) {
      const task = generationTask(taskId);
      if (!task) return null;
      Object.assign(task, patch, { updatedAt: new Date().toISOString() });
      renderAiConversationList?.();
      return task;
    }

    function mergeChatMessagesById(current = [], incoming = []) {
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

    function isDesignPlanAgentSelected() {
      return designPlanAgentIds.has(selectedAiSkillId());
    }

    function isDetailPageAgentRun() {
      return selectedAiSkillId() === "detail-page-planner-agent";
    }

    function isSingleDesignRequest(promptText = "") {
      return /单张|一张|1张|只做|首图|首屏|单屏|一屏/.test(String(promptText || ""));
    }

    function requestedDesignPlanCount(promptText = "", context = {}) {
      const text = String(promptText || "");
      const agentId = String(context.selectedSkillId || context.skillId || selectedAiSkillId());
      const isDetail = agentId === "detail-page-planner-agent";
      const maxCount = isDetail ? 32 : 5;
      const explicit = text.replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 0xff10))
        .match(/(?:^|[^\d])(?:生成|做|输出|要)?\s*(\d{1,2}|[一二两三四五六七八九十]{1,3})\s*(?:张|屏|页|个模块|个方向)/);
      if (explicit) return Math.max(1, Math.min(maxCount, designImageIndexToNumber(explicit[1]) || 1));
      if (isSingleDesignRequest(text)) return 1;
      if (isDetail) return 0;
      return 5;
    }

    function detailPageAgentRequestedCount(promptText = "", context = {}) {
      const agentId = String(context.selectedSkillId || context.skillId || selectedAiSkillId());
      if (agentId !== "detail-page-planner-agent") return Number(context.imageCount || els.imageCount?.value || 1);
      const text = String(promptText || "");
      if (/只(?:做|生成)?(?:一张|1张|单张|单屏|首屏|某一屏)|单独(?:做|生成)|只要(?:首屏|一屏)/.test(text)) return 1;
      const explicit = text.replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 0xff10))
        .match(/(?:^|[^\d])(?:生成|做|输出)?\s*(\d{1,2}|[一二两三四五六七八九十]{1,3})\s*(?:张|屏|页|个模块)/);
      if (explicit) return Math.max(1, Math.min(32, designImageIndexToNumber(explicit[1]) || 1));
      return 0;
    }

    function designPlanList(value) {
      if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
      return String(value || "").split(/[；;、\n]+/).map((item) => item.trim()).filter(Boolean);
    }

    function normalizeDesignPlanForClient(plan = {}) {
      const moduleLimit = plan.mode === "detail_page" || plan.agentId === "detail-page-planner-agent"
        ? 32
        : 5;
      const modules = (Array.isArray(plan.modules) ? plan.modules : []).slice(0, moduleLimit).map((module, index) => ({
        index: index + 1,
        title: String(module.title || `第 ${index + 1} 张`).trim(),
        purpose: String(module.purpose || "").trim(),
        visualPrompt: String(module.visualPrompt || module.visual_prompt || module.prompt || "").trim(),
        copy: designPlanList(module.copy),
        layoutInstructions: designPlanList(module.layoutInstructions || module.layout_instructions || module.compositionInstructions || module.composition_instructions || []).slice(0, 12),
        layoutId: String(module.layoutId || module.layout_id || module.layout || "").trim(),
        visualFocus: String(module.visualFocus || module.visual_focus || "center").trim(),
        referenceUse: String(module.referenceUse || module.reference_use || "").trim(),
        avoid: designPlanList(module.avoid)
      }));
      const styleLock = plan.styleLock || plan.style_lock || {};
      return {
        ...plan,
        strategy: String(plan.strategy || "").trim(),
        styleLock: {
          palette: String(styleLock.palette || "").trim(),
          background: String(styleLock.background || "").trim(),
          typography: String(styleLock.typography || "").trim(),
          productVisual: String(styleLock.productVisual || styleLock.product_visual || "").trim(),
          layoutSystem: String(styleLock.layoutSystem || styleLock.layout_system || "").trim(),
          forbidden: designPlanList(styleLock.forbidden)
        },
        modules
      };
    }

    async function buildMergedDetailPageImages(images = []) {
      const sourceImages = (Array.isArray(images) ? images : []).filter((image) => image?.url || image?.image_file);
      if (sourceImages.length < 2) return [];
      try {
        const dimensions = await Promise.all(sourceImages.map(async (image) => {
          const width = Number(image.width || 0);
          const height = Number(image.height || 0);
          if (width > 0 && height > 0) return { image, width, height };
          const measured = await loadImageDimensions(image.url || image.image_file).catch(() => null);
          return {
            image,
            width: Math.max(1, Number(measured?.width || 1)),
            height: Math.max(1, Number(measured?.height || 1))
          };
        }));
        const width = Math.min(...dimensions.map((item) => item.width));
        const maxSegmentHeight = 24000;
        const maxSegmentPixels = 40000000;
        const pixelLimitedHeight = Math.max(1, Math.floor(maxSegmentPixels / Math.max(1, width)));
        const segmentHeightLimit = Math.max(1, Math.min(maxSegmentHeight, pixelLimitedHeight));
        const prepared = dimensions.map((item) => ({
          ...item,
          drawHeight: Math.max(1, Math.round(item.height * width / item.width))
        }));
        if (prepared.some((item) => item.drawHeight > segmentHeightLimit)) {
          throw new Error("单屏尺寸超过浏览器安全合成长图上限，已保留单屏原图。");
        }
        const groups = [];
        let group = [];
        let groupHeight = 0;
        prepared.forEach((item) => {
          if (group.length && groupHeight + item.drawHeight > segmentHeightLimit) {
            groups.push(group);
            group = [];
            groupHeight = 0;
          }
          group.push(item);
          groupHeight += item.drawHeight;
        });
        if (group.length) groups.push(group);

        const timestamp = Date.now();
        const merged = [];
        for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
          const segment = groups[groupIndex];
          const height = segment.reduce((sum, item) => sum + item.drawHeight, 0);
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("浏览器无法创建长图画布。");
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, width, height);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          let top = 0;
          for (const item of segment) {
            const source = String(item.image.url || item.image.image_file || "");
            const dataUrl = source.startsWith("data:") ? source : await imageUrlToDataUrl(source);
            const loadedImage = await loadImage(dataUrl);
            ctx.drawImage(loadedImage, 0, top, width, item.drawHeight);
            top += item.drawHeight;
          }
          const dataUrl = canvas.toDataURL("image/png");
          if (!dataUrl || dataUrl === "data:," || dataUrl.length < 100) throw new Error("浏览器导出高清长图失败。");
          const partLabel = groups.length > 1
            ? `-part-${String(groupIndex + 1).padStart(2, "0")}-of-${String(groups.length).padStart(2, "0")}`
            : "";
          merged.push({
            id: createClientId(),
            name: `detail-page-merged${partLabel}-${timestamp}.png`,
            url: dataUrl,
            image_file: dataUrl,
            width,
            height,
            aspectRatio: closestAspectRatioFromSize(width, height),
            prompt: sourceImages[0]?.prompt || "",
            mergedDetailPage: true,
            mergedDetailPagePart: groupIndex + 1,
            mergedDetailPagePartCount: groups.length,
            sourceCount: segment.length
          });
          canvas.width = 1;
          canvas.height = 1;
          await sleep(0);
        }
        return merged;
      } catch (error) {
        console.warn("详情页长图合成失败", error);
        return [];
      }
    }

    function buildAiCurrentTurnPrompt(basePrompt, context = state.aiDirect) {
      const current = String(basePrompt || "").trim();
      const skill = context?.selectedSkill || selectedAiSkill();
      const skillText = skill?.prompt ? `当前选中的 Skills：${skill.name}\n${skill.prompt}` : "";
      return [skillText, current].filter(Boolean).join("\n\n");
    }

    function detailPlanningEmbeddedReferences(materials = []) {
      const seen = new Set();
      return (Array.isArray(materials) ? materials : []).flatMap((material) => (
        Array.isArray(material?.embeddedImages) ? material.embeddedImages : []
      )).filter((image) => {
        const key = String(image?.url || image?.name || "");
        if (!image?.url || !key || seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 64).map((image) => ({
        ...image,
        id: image.id || createClientId(),
        role: "style_reference",
        source: "detail_planning_workbook",
        plannedRole: "style_reference",
        plannedScope: "composition",
        plannedStrength: "flexible",
        plannedExplicit: true,
        plannedInstruction: "只参考该图在 Excel 线框中的位置、比例和模块结构；不复制其旧产品、旧品牌、颜色、参数、认证或文案"
      }));
    }

    function explicitDetailProductIdentityIndex(promptText = "", references = []) {
      const refs = Array.isArray(references) ? references : [];
      if (!refs.length) return -1;
      const text = String(promptText || "").replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 0xff10));
      const numbered = text.match(/(?:图|图片)\s*([1-9]\d*)[^。；;\n]{0,48}(?:产品|商品|包装|主体)/)
        || text.match(/(?:产品|商品|包装|主体)[^。；;\n]{0,48}(?:在|用|按照|根据|来自)?\s*(?:图|图片)\s*([1-9]\d*)/);
      if (numbered) {
        const index = Number(numbered[1]) - 1;
        if (index >= 0 && index < refs.length) return index;
      }
      const explicitlyLayoutOnly = /(?:这张|上传的)长详情页|(?:图1|第一张(?:图|图片)?|这张(?:图|图片)|上传的(?:图|图片))[^。；;\n]{0,40}(?:详情页案例|案例图|线框|版式模板|版式参考|布局模板|布局参考|结构参考|风格参考)|(?:详情页案例|案例图|线框|版式模板|版式参考|布局模板|布局参考|结构参考|风格参考)[^。；;\n]{0,40}(?:图1|第一张(?:图|图片)?|这张(?:图|图片)|上传的(?:图|图片))/i.test(text);
      return explicitlyLayoutOnly ? -1 : 0;
    }

    function detailBrandProfileInstruction() {
      return "";
    }

    function detailBrandLayoutFamily(module = {}) {
      const text = `${module?.title || ""} ${module?.purpose || ""}`;
      if (/首屏|KV|利益点|定位/.test(text)) return "hero";
      if (/痛点|问题|不适|对比/.test(text)) return "pain-grid";
      if (/认证|资质|检测|背书|标准|证明/.test(text)) return "proof";
      if (/结构|工艺|材质|支撑|性能|卖点/.test(text)) return "structure";
      if (/场景|人群|使用环境/.test(text)) return "scene";
      if (/细节|指尖|纹理|贴合|设计/.test(text)) return "detail";
      if (/尺码|尺寸|规格/.test(text)) return "size";
      if (/信息|说明|使用方法|注意|参数|收口/.test(text)) return "info-usage";
      return "structure";
    }

    function detailBrandLayoutReference() {
      return null;
    }

    function detailModuleGenerationReferences(context = {}, module = {}) {
      const references = Array.isArray(context.references) ? context.references : [];
      const productReferences = references.filter((item) => (
        item?.source !== "brand_layout_reference"
        && item?.source !== "detail_planning_workbook"
        && item?.role === "product_identity"
      ));
      const ordinaryReferences = references.filter((item) => (
        item?.source !== "brand_layout_reference"
        && item?.source !== "detail_planning_workbook"
        && item?.role !== "product_identity"
      ));
      const workbookReferences = references.filter((item) => item?.source === "detail_planning_workbook");
      const moduleText = `${module?.title || ""} ${module?.purpose || ""}`.replace(/\s+/g, "");
      const moduleIndex = Math.max(1, Number(module?.index || 1));
      const exactWorkbookReferences = workbookReferences.filter((item) => {
        const templateModule = String(item?.templateModule || "").replace(/\s+/g, "");
        return (templateModule && (moduleText.includes(templateModule) || templateModule.includes(String(module?.title || "").replace(/\s+/g, ""))))
          || Number(item?.templateScreen || 0) === moduleIndex;
      });
      const fallbackWorkbookReference = workbookReferences[Math.min(moduleIndex - 1, Math.max(0, workbookReferences.length - 1))];
      const selectedWorkbookReferences = (exactWorkbookReferences.length
        ? exactWorkbookReferences
        : fallbackWorkbookReference ? [fallbackWorkbookReference] : [])
        .slice(0, 2)
        .map((item) => ({
          ...item,
          role: "style_reference",
          plannedRole: "style_reference",
          plannedScope: "composition_only",
          plannedStrength: "flexible",
          plannedExplicit: true,
          plannedInstruction: "仅参考当前屏的网格、留白、图文比例和信息位置；它绝不是产品身份图，严禁继承其中的产品、品牌、Logo、颜色、文字、参数或认证"
        }));
      const brandReference = detailBrandLayoutReference(context.detailBrandProfile, module);
      const layoutReferences = [brandReference, ...selectedWorkbookReferences].filter(Boolean);
      return [...productReferences, ...layoutReferences, ...ordinaryReferences].slice(0, aiReferenceLimit());
    }

    async function requestDesignAgentPlan(userPrompt, context = {}) {
      const agentId = String(context.selectedSkillId || context.skillId || selectedAiSkillId());
      const brandInstruction = agentId === "detail-page-planner-agent"
        ? detailBrandProfileInstruction(context.detailBrandProfile)
        : "";
      const planningPrompt = [userPrompt, brandInstruction].filter(Boolean).join("\n\n");
      const references = aiRequestReferences(userPrompt, context);
      const planningMaterials = agentId === "detail-page-planner-agent" && Array.isArray(context.detailPlanningMaterials)
        ? context.detailPlanningMaterials.slice(0, 3)
        : [];
      const response = await fetch("/api/ai/design-agent-plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agent_id: agentId,
          prompt: planningPrompt,
          user_prompt: String(userPrompt || "").trim(),
          brand_profile: context.detailBrandProfile || "",
          count: requestedDesignPlanCount(userPrompt, context),
          aspect_ratio: context.aspectRatio || els.aspectRatio?.value || "1:1",
          image_size: context.imageSize || els.imageSize?.value || "1K",
          thinking_mode: String(context.thinkingMode || currentThinkingMode()) === "deep" ? "deep" : "standard",
          web_search: Boolean(context.webSearchEnabled),
          enable_web_search: Boolean(context.webSearchEnabled),
          planning_materials: planningMaterials.map((material) => ({
            name: material.name,
            kind: material.kind || "spreadsheet",
            sheet_names: material.sheetNames || [],
            selected_sheet_name: material.selectedSheetName || "",
            module_count: Number(material.wireframeModuleCount || 0),
            embedded_image_count: Number(material.embeddedImages?.length || 0),
            row_count: Number(material.rowCount || 0),
            content: String(material.content || "")
          })),
          references: references.map((image) => ({
            id: image.id,
            name: image.name,
            role: image.role,
            image_file: image.image_file || image.url,
            width: image.width || 0,
            height: image.height || 0,
            aspect_ratio: image.aspect_ratio || image.aspectRatio || "",
            focus_target: image.focus_target || null,
            source: image.source || "",
            plannedRole: image.plannedRole || "",
            plannedScope: image.plannedScope || "",
            plannedStrength: image.plannedStrength || "",
            plannedExplicit: Boolean(image.plannedExplicit),
            plannedInstruction: image.plannedInstruction || ""
          }))
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(formatApiError(data, "设计编排失败"));
      return data.plan || data;
    }

    function designStyleLockPrompt(style = {}) {
      return [
        "【统一风格锁】",
        `色彩：${style.palette || "整套保持同一配色"}`,
        `背景：${style.background || "整套保持同一背景语言和光影"}`,
        `字体：${style.typography || "整套保持同一字体气质和标题层级"}`,
        `产品视觉：${style.productVisual || "产品身份、比例、材质保持一致"}`,
        `版式系统：${style.layoutSystem || "卡片、标签、图标、分割线保持同一系统"}`,
        style.forbidden?.length ? `禁止项：${style.forbidden.join("；")}` : ""
      ].filter(Boolean).join("\n");
    }

    function designImageIndexToNumber(token = "") {
      const text = String(token || "").trim();
      if (/^[1-9]\d*$/.test(text)) return Number(text);
      const map = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
      if (Object.prototype.hasOwnProperty.call(map, text)) return map[text];
      if (text === "十") return 10;
      const teen = text.match(/^十([一二两三四五六七八九])$/);
      if (teen) return 10 + map[teen[1]];
      const tens = text.match(/^([一二两三四五六七八九])十([一二两三四五六七八九])?$/);
      if (tens) return map[tens[1]] * 10 + (tens[2] ? map[tens[2]] : 0);
      return 0;
    }

    function sanitizeDesignModuleImageRefs(value = "", availableCount = 0) {
      const available = Math.max(0, Math.floor(Number(availableCount || 0)));
      const replacement = available > 0 ? "已上传参考图" : "参考素材";
      const token = "([1-9]\\d*|[一二两三四五六七八九十]{1,3})";
      return String(value || "")
        .replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 0xff10))
        .replace(new RegExp(`第\\s*${token}\\s*张\\s*(?:参考图|图片)`, "g"), (full, index) => designImageIndexToNumber(index) > available ? replacement : full)
        .replace(new RegExp(`(?:参考图|图片|图)\\s*${token}`, "g"), (full, index) => designImageIndexToNumber(index) > available ? replacement : full)
        .replace(/\s+/g, " ")
        .trim();
    }

    function designModuleReferenceCount(context = {}) {
      const refs = Array.isArray(context?.references) ? context.references : [];
      const explicit = Array.isArray(context?.explicitReferences) ? context.explicitReferences : [];
      return [...explicit, ...refs].filter((image) => normalizeAiReferenceRole(image?.role) !== "ignore").length;
    }

    function buildDesignModulePrompt(userPrompt, plan, module, context = {}) {
      const isDetail = plan?.agentId === "detail-page-planner-agent" || plan?.mode === "detail_page";
      const references = Array.isArray(context?.references) ? context.references : [];
      const hasLayoutReference = isDetail && references.some((image) => (
        image?.source === "detail_planning_workbook" || image?.source === "brand_layout_reference"
      ));
      const productIdentityIndexes = references
        .map((image, index) => (
          image?.source !== "detail_planning_workbook"
          && image?.source !== "brand_layout_reference"
          && image?.role === "product_identity"
            ? index + 1
            : 0
        ))
        .filter(Boolean);
      const productIdentityLabel = productIdentityIndexes.map((index) => `图${index}`).join("、");
      const availableReferenceCount = designModuleReferenceCount(context);
      const visualPrompt = sanitizeDesignModuleImageRefs(module.visualPrompt || "", availableReferenceCount);
      const referenceUse = sanitizeDesignModuleImageRefs(module.referenceUse || "", availableReferenceCount);
      const safeCopy = designPlanList(module.copy)
        .map((item) => sanitizeDesignModuleImageRefs(item, availableReferenceCount))
        .filter(Boolean);
      const safeAvoid = designPlanList(module.avoid)
        .map((item) => sanitizeDesignModuleImageRefs(item, availableReferenceCount))
        .filter(Boolean);
      return [
        userPrompt,
        isDetail ? detailBrandProfileInstruction(context.detailBrandProfile) : "",
        `本轮启用${plan?.agentName || "设计 Agent"}，已完成设计编排。`,
        designStyleLockPrompt(plan?.styleLock || {}),
        plan?.strategy ? `整套策略：${plan.strategy}` : "",
        `当前模块：第 ${Math.max(1, Number(module?.index || 1))} 张`,
        `标题方向：${module.title || ""}`,
        `本张职责：${module.purpose || ""}`,
        `画面方向：${visualPrompt}`,
        safeCopy.length ? `可用短文案：${safeCopy.join("；")}` : "",
        referenceUse ? `参考图用法：${referenceUse}` : "",
        safeAvoid.length ? `本张禁止：${safeAvoid.join("；")}` : "",
        isDetail
          ? "这是连续长详情页中的一个内容模块，不是独立海报。保持上下边界连续，固定 3:4 竖版高分辨率输出。"
          : "这是主图套组中的一张。保持同一产品身份和视觉系统，但构图与信息重点要服务当前职责。",
        productIdentityLabel
          ? `产品身份锁：${productIdentityLabel}是唯一真实产品身份来源，必须保持外形、比例、颜色、材质、包装结构和标签位置一致。`
          : "不要照抄参考图中的品牌、Logo、原文案、价格、平台水印或版式细节。",
        hasLayoutReference
          ? "布局参考只控制网格、留白、图文比例和信息位置，不得复制其中的旧产品、品牌、参数、认证或文案。"
          : ""
      ].filter(Boolean).join("\n");
    }

    function publicDesignPlanMetadata(metadata = {}, plan = null) {
      if (!plan || plan?.mode !== "detail_page") return metadata || {};
      const { designPlan, modulePayloads, ...rest } = metadata || {};
      return {
        ...rest,
        detailPageWorkflow: true,
        detailPageScreenCount: Array.isArray(plan.modules) ? plan.modules.length : 0,
        detailPageGroupSize: 8,
        detailPageGroupCount: Math.max(1, Math.ceil((Array.isArray(plan.modules) ? plan.modules.length : 0) / 8)),
        detailPageModules: (Array.isArray(plan.modules) ? plan.modules : []).map((module, index) => ({
          index: Number(module.index || index + 1),
          title: module.title || `第 ${index + 1} 屏`,
          purpose: module.purpose || ""
        }))
      };
    }

    async function requestOneAiImageAndExtract(ai, prompt, context, conversationId, options = {}) {
      const oneContext = {
        ...context,
        imageCount: 1,
        thinkingMode: "off"
      };
      const response = await requestAiImageGeneration(ai, prompt, oneContext);
      let data = null;
      try {
        data = await response.json();
      } catch {
        const error = new Error(`AI 生图服务返回了无法解析的响应（HTTP ${response.status || "未知"}）。`);
        error.status = Number(response.status >= 400 ? response.status : 502);
        throw error;
      }
      if (!response.ok) {
        const error = new Error(formatApiError(data, "AI 生图请求失败"));
        error.status = Number(response.status || data?.statusCode || data?.status_code || 0);
        throw error;
      }
      if (response.status === 202 && data.statusUrl) {
        data = await pollAiImageGeneration(data.statusUrl, conversationId, {
          ...options,
          taskId: options.taskId || context.generationTaskId || ""
        });
      }
      const imagePayload = data.data || data;
      const images = extractAiGeneratedImages(imagePayload, 1);
      if (!images.length) throw new Error(formatEmptyAiImageError(imagePayload));
      images.forEach((image) => {
        if (image && typeof image === "object") image.prompt = prompt;
      });
      return { images, payload: imagePayload };
    }

    function isRetryableDetailModuleError(error) {
      const status = Number(error?.status || error?.statusCode || 0);
      if (status === 429 || status >= 500) return true;
      const text = String(error?.message || error || "").toLowerCase();
      if (!text) return error instanceof TypeError;
      return /(?:network|failed to fetch|fetch failed|timeout|timed out|econnreset|econnrefused|socket|tls|handshake|connection|429|too many requests|rate limit|5\d\d|网关|网络|连接|超时|限流|请求过多|服务暂时|服务繁忙|上游异常)/i.test(text);
    }

    async function runConfirmedDesignPlan(ai, userPrompt, context, plan, conversationId, onProgress, onCheckpoint) {
      const isDetail = plan?.mode === "detail_page" || plan?.agentId === "detail-page-planner-agent";
      const modules = Array.isArray(plan?.modules) ? plan.modules : [];
      if (!modules.length) throw new Error("设计编排没有返回可执行模块。");

      const groupSize = isDetail ? 8 : modules.length;
      const groups = [];
      for (let index = 0; index < modules.length; index += groupSize) {
        groups.push(modules.slice(index, index + groupSize));
      }

      const images = [];
      const payloads = [];
      const errors = [];
      const failedModules = [];
      let completed = 0;

      for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
        const groupModules = groups[groupIndex];
        onProgress?.({
          status: "running",
          percent: Math.max(8, Math.round(8 + (groupIndex / Math.max(1, groups.length)) * 84)),
          message: isDetail
            ? `详情页第 ${groupIndex + 1}/${groups.length} 组正在生成`
            : "正在生成设计图",
          totalCount: modules.length,
          completedCount: completed,
          failedCount: failedModules.length
        });

        let cursor = 0;
        const worker = async () => {
          for (;;) {
            const localIndex = cursor;
            cursor += 1;
            if (localIndex >= groupModules.length) return;
            const module = groupModules[localIndex];
            const absoluteIndex = groupIndex * groupSize + localIndex;
            const moduleContext = {
              ...context,
              imageCount: 1,
              references: isDetail ? detailModuleGenerationReferences(context, module) : context.references
            };
            try {
              const prompt = buildDesignModulePrompt(userPrompt, plan, module, moduleContext);
              const maxAttempts = isDetail ? 3 : 1;
              let result = null;
              for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
                try {
                  result = await requestOneAiImageAndExtract(ai, prompt, moduleContext, conversationId, {
                    taskId: context.generationTaskId || ""
                  });
                  break;
                } catch (error) {
                  if (attempt >= maxAttempts || !isRetryableDetailModuleError(error)) throw error;
                  await sleep(500 * attempt);
                }
              }
              payloads[absoluteIndex] = result.payload;
              result.images.forEach((image) => {
                image.designPlanModule = {
                  ...module,
                  index: Number(module.index || absoluteIndex + 1)
                };
                images.push(image);
              });
            } catch (error) {
              const message = formatAiVisibleError(error?.message, `第 ${absoluteIndex + 1} 张生成失败`);
              errors.push(message);
              failedModules.push({
                index: Number(module.index || absoluteIndex + 1),
                title: module.title || `第 ${absoluteIndex + 1} 张`,
                error: message
              });
            } finally {
              completed += 1;
              onProgress?.({
                status: "running",
                percent: Math.max(10, Math.min(96, Math.round(10 + completed / modules.length * 86))),
                message: `已完成 ${completed}/${modules.length}`,
                totalCount: modules.length,
                completedCount: images.length,
                failedCount: failedModules.length
              });
            }
          }
        };

        await Promise.all(Array.from({ length: Math.min(4, groupModules.length) }, () => worker()));
        if (isDetail && images.length && typeof onCheckpoint === "function") {
          const checkpointImages = [...images]
            .sort((a, b) => Number(a.designPlanModule?.index || 0) - Number(b.designPlanModule?.index || 0))
            .map((image) => ({ ...image }));
          await onCheckpoint({
            images: checkpointImages,
            completedCount: checkpointImages.length,
            failedCount: failedModules.length,
            failedModules: failedModules.map((item) => ({ ...item })),
            completedGroupCount: groupIndex + 1,
            totalGroupCount: groups.length,
            requestedCount: modules.length
          });
        }
      }

      if (!images.length) throw new Error(`设计编排生成全部失败：${errors.join("；") || "没有图片"}`);
      images.sort((a, b) => Number(a.designPlanModule?.index || 0) - Number(b.designPlanModule?.index || 0));
      return {
        images,
        payload: {
          metadata: {
            requestedCount: modules.length,
            imageCount: images.length,
            successCount: images.length,
            failedCount: failedModules.length,
            errors,
            failedModules,
            missingModuleIndexes: failedModules.map((item) => item.index),
            detailPageIncomplete: Boolean(isDetail && failedModules.length),
            designPlanConfirmed: true,
            detailPageGroupSize: isDetail ? groupSize : undefined,
            detailPageGroupCount: isDetail ? groups.length : undefined,
            designPlan: plan,
            modulePayloads: payloads
          }
        }
      };
    }

    function composerReferenceForNewImage(image) {
      if (!image || typeof image !== "object") return null;
      return {
        ...image,
        role: normalizeAiReferenceRole(image.role) === "ignore" ? "ignore" : "reference"
      };
    }
    
    function newImageComposerContext(conversation = {}) {
      return {
        ...conversation,
        chatMessages: [],
        generatedImages: [],
        pendingStatus: null,
        references: (Array.isArray(conversation.references) ? conversation.references : [])
          .map(composerReferenceForNewImage)
          .filter(Boolean),
        canvasFocusTarget: null,
        selectedEditImageKey: "",
        useSelectedImageAsBase: false
      };
    }
    
    function isAiRegenerateRequest(promptText = "") {
      return /重新|重做|重新做|重新生成|换方向|换一个方向|全新|另做|新图|不要沿用|不沿用|不要参考上一张|不要基于上一张|平台主图|电商主图|推广图|海报|主视觉/.test(String(promptText || ""));
    }
    
    function isAiLocalEditRequest(promptText = "") {
      return /继续改|继续修改|改这张|修改这张|基于这张|沿用这张|保留主体|保留人物|保留产品|只换|只改|换背景|背景换|改成|修改成|替换|去掉|删除|移除|擦除|修一下|优化这张|选中区域|这个区域|局部/.test(String(promptText || ""));
    }
    
    function isAiReferenceMaterialRequest(promptText = "") {
      const text = String(promptText || "");
      if (isAiLocalEditRequest(text)) return false;
      return /参考|根据|按照|仿照|借鉴|生成一个|生成一张|做一个|做一张|素材|背景图|模特图|产品图|商品图|不要文字|不要任何文字|无文字|单独/.test(text);
    }
    
    function inferCanvasFocusUsage(promptText = "") {
      const text = String(promptText || "");
      if (/不要使用画布|不用画布|取消点选|忽略点选|不要基于画布|不要基于这张点选|不要用选区/.test(text)) return "ignore";
      if (isAiLocalEditRequest(text)) return "edit";
      if (isAiReferenceMaterialRequest(text) || isAiRegenerateRequest(text)) return "reference";
      return "reference";
    }
    
    function selectedEditImage(context = state.aiDirect) {
      return context?.selectedEditImageKey
        ? findGeneratedImage(context.selectedEditImageKey, context)
        : null;
    }
    
    function setSelectedEditImage(key, options = {}) {
      const image = findGeneratedImage(key);
      if (!image) {
        toast("没有找到这张图片。");
        return false;
      }
      state.aiDirect.selectedEditImageKey = String(key);
      state.aiDirect.useSelectedImageAsBase = options.useAsBase !== false;
      if (els.useSelectedImageInput) els.useSelectedImageInput.checked = Boolean(state.aiDirect.useSelectedImageAsBase);
      renderSelectedEditImageState();
      renderRelayPreview();
      renderAiChatList();
      saveAiConversationDebounced();
      if (options.focus !== false && els.directPromptInput) els.directPromptInput.focus();
      return true;
    }
    
    function renderSelectedEditImageState() {
      let image = selectedEditImage();
      if (!image && state.aiDirect.selectedEditImageKey) {
        state.aiDirect.selectedEditImageKey = "";
        state.aiDirect.useSelectedImageAsBase = false;
        image = null;
      }
      if (els.useSelectedImageInput) {
        els.useSelectedImageInput.checked = Boolean(image && state.aiDirect.useSelectedImageAsBase);
        els.useSelectedImageInput.disabled = !image;
      }
      if (!els.selectedEditImageText) return;
      if (!image) {
        els.selectedEditImageText.textContent = "未选中图片";
        return;
      }
      els.selectedEditImageText.textContent = state.aiDirect.useSelectedImageAsBase
        ? `已选：${image.name || "AI 生图"}`
        : `已选：${image.name || "AI 生图"}，本次不沿用`;
    }
    
    function aiRequestReferences(promptText = "", context = state.aiDirect) {
      const references = context?.references || [];
      const roleOverrides = inferReferenceRoleOverrides(promptText, references);
      const explicitReferences = Array.isArray(context?.explicitReferences)
        ? context.explicitReferences.map((image) => ({
          id: image.id || createClientId(),
          name: image.name || "画布图片",
          image_file: image.image_file || image.url,
          width: image.width || 0,
          height: image.height || 0,
          aspect_ratio: image.aspect_ratio || image.aspectRatio || "",
          role: image.role || "uploaded_base",
          focus_target: image.focus_target || null,
          source: image.source || ""
        })).filter((image) => image.image_file)
        : [];
      const focusTarget = context?.canvasFocusTarget;
      const focusUsage = focusTarget?.imageFile ? (focusTarget.mode || inferCanvasFocusUsage(promptText)) : "";
      const focusReference = focusTarget?.imageFile && focusUsage !== "ignore" ? [focusUsage === "edit" ? {
        id: `canvas-focus-${focusTarget.id || createClientId()}`,
        name: focusTarget.name || "画布选中区域",
        image_file: focusTarget.imageFile,
        width: focusTarget.naturalWidth || focusTarget.width || 0,
        height: focusTarget.naturalHeight || focusTarget.height || 0,
        aspect_ratio: focusTarget.aspectRatio || "",
        role: "canvas_focus_region",
        focus_target: { ...focusTarget, mode: "edit" }
      } : {
        id: `canvas-reference-${focusTarget.id || createClientId()}`,
        name: focusTarget.name || "画布选中区域参考",
        image_file: focusTarget.imageFile,
        width: focusTarget.naturalWidth || focusTarget.width || 0,
        height: focusTarget.naturalHeight || focusTarget.height || 0,
        aspect_ratio: focusTarget.aspectRatio || "",
        role: "uploaded_reference",
        source: "canvas_focus_reference"
      }] : [];
      const image = selectedEditImage(context);
      const shouldUseSelectedBase = Boolean(image && context.useSelectedImageAsBase && !focusReference.length);
      const selectedBase = shouldUseSelectedBase ? [{
        id: `${context.useSelectedImageAsBase ? "selected-base" : "selected-context"}-${context.selectedEditImageKey}`,
        name: image.name || "选中续写图.png",
        image_file: image.url,
        width: image.width || 0,
        height: image.height || 0,
        aspect_ratio: image.aspectRatio || "",
        role: "previous_result_base"
      }] : [];
      const leadingReferenceCount = explicitReferences.length + focusReference.length + selectedBase.length;
      const uploaded = references
        .map((image, index) => {
          const roleOverride = normalizeAiReferenceRole(roleOverrides.get(image.id) || "");
          if (roleOverride === "ignore") return null;
          return {
            id: image.id,
            name: `${imageIndexLabel(index + leadingReferenceCount)} ${image.name}`,
            image_file: image.url,
            width: image.width || 0,
            height: image.height || 0,
            aspect_ratio: image.aspectRatio || "",
            role: image.role === "product_identity"
              ? "uploaded_base"
              : image.source === "detail_planning_workbook" || image.source === "brand_layout_reference"
              ? "style_reference"
              : "uploaded_reference",
            source: image.source || "",
            plannedRole: image.role === "product_identity" ? "base" : (image.plannedRole || ""),
            plannedScope: image.role === "product_identity" ? "product_identity" : (image.plannedScope || ""),
            plannedStrength: image.role === "product_identity" ? "required" : (image.plannedStrength || ""),
            plannedExplicit: image.role === "product_identity" ? true : Boolean(image.plannedExplicit),
            plannedInstruction: image.role === "product_identity"
              ? "整套详情页固定产品身份，保持真实产品外形、比例、颜色、包装结构和识别特征一致"
              : (image.plannedInstruction || "")
          };
        })
        .filter(Boolean);
      const merged = [...explicitReferences, ...focusReference, ...selectedBase, ...uploaded];
      const limit = aiReferenceLimit();
      if (merged.length > limit) {
        toast(`本轮最多提交 ${limit} 张参考图，已按优先级只使用前 ${limit} 张。`);
      }
      return merged.slice(0, limit);
    }
    
    function snapshotComposerReferences() {
      return state.aiDirect.references.map((image, index) => ({
        id: image.id,
        name: image.name,
        size: image.size,
        type: image.type,
        url: image.url,
        width: image.width || 0,
        height: image.height || 0,
        aspectRatio: image.aspectRatio || "",
        role: image.role || "",
        label: imageIndexLabel(index)
      }));
    }
    
    function renderReferencePreviewList() {
      if (!els.referencePreviewList) return;
      const references = Array.isArray(state.aiDirect.references) ? state.aiDirect.references : [];
      const planningMaterials = Array.isArray(state.aiDirect.detailPlanningMaterials) ? state.aiDirect.detailPlanningMaterials : [];
      if (!references.length && !planningMaterials.length) {
        els.referencePreviewList.hidden = true;
        els.referencePreviewList.className = "reference-preview-list";
        els.referencePreviewList.innerHTML = "";
        updateSummary();
        return;
      }
    
      els.referencePreviewList.hidden = false;
      els.referencePreviewList.className = "reference-preview-list composer-attachments";
      const imageCards = references.map((image, index) => `
        <article class="reference-card">
          <button class="reference-thumb-wrap" type="button" data-preview-reference="${escapeHtml(image.id)}" title="预览图片">
            <img src="${image.url}" alt="${escapeHtml(image.name)}">
            <span>${imageIndexLabel(index)}</span>
          </button>
          <div class="reference-card-meta" title="${escapeHtml(image.name || "附件图片")}">
            <b>${escapeHtml(compactFileName(image.name))}</b>
            <small>${formatFileSize(image.size)}</small>
          </div>
          <div class="reference-card-actions">
            <button class="mini-btn remove" type="button" data-remove-reference="${image.id}" title="删除">删</button>
          </div>
        </article>
      `).join("");
      const materialCards = planningMaterials.map((material) => `
        <article class="reference-card detail-planning-material">
          <div class="reference-thumb-wrap detail-planning-thumb" title="详情页策划资料">
            <strong>XLS</strong>
            <span>表格</span>
          </div>
          <div class="reference-card-meta" title="${escapeHtml(material.name || "详情页资料表")}">
            <b>${escapeHtml(compactFileName(material.name || "详情页资料表"))}</b>
            <small>${Number(material.wireframeModuleCount || 0) || Number(material.rowCount || 0)} ${material.wireframeModuleCount ? "屏" : "行"} · ${Number(material.embeddedImages?.length || 0)} 张模板图</small>
          </div>
          <div class="reference-card-actions">
            <button class="mini-btn remove" type="button" data-remove-detail-material="${escapeHtml(material.id)}" title="删除">删</button>
          </div>
        </article>
      `).join("");
      els.referencePreviewList.innerHTML = imageCards + materialCards;
    
      els.referencePreviewList.querySelectorAll("[data-remove-reference]").forEach((button) => {
        button.addEventListener("click", () => {
          state.aiDirect.references = state.aiDirect.references.filter((image) => image.id !== button.dataset.removeReference);
          renderReferencePreviewList();
          renderRelayPreview();
          saveAiConversationDebounced();
        });
      });
      els.referencePreviewList.querySelectorAll("[data-preview-reference]").forEach((button) => {
        button.addEventListener("click", () => {
          const image = state.aiDirect.references.find((item) => item.id === button.dataset.previewReference);
          if (!image?.url) return;
          openImagePreview?.({ url: image.url, name: image.name || "附件图片" });
        });
      });
      els.referencePreviewList.querySelectorAll("[data-remove-detail-material]").forEach((button) => {
        button.addEventListener("click", () => {
          state.aiDirect.detailPlanningMaterials = planningMaterials.filter((material) => material.id !== button.dataset.removeDetailMaterial);
          renderReferencePreviewList();
          renderRelayPreview();
          saveAiConversationDebounced();
        });
      });
      updateSummary();
    }
    
    function renderRelayPreview() {
      renderSelectedEditImageState();
      if (els.relayStatusText) {
        if (state.aiDirect.references.length) {
          els.relayStatusText.textContent = referenceVisibleSummary();
        } else if (state.aiDirect.detailPlanningMaterials?.length) {
          els.relayStatusText.textContent = `${state.aiDirect.detailPlanningMaterials.length} 个表格已用于详情页导演编排`;
        } else {
          els.relayStatusText.textContent = "右侧只生成新素材；修改画布图片请直接选中图片";
        }
      }
    }
    
    async function generateAiImages() {
      if (!requireLoggedIn()) return;
      const selectedSkillAtSubmit = selectedAiSkill();
      const selectedSkillIdAtSubmit = selectedSkillAtSubmit?.id || "none";
      const selectedSkillNameAtSubmit = selectedSkillAtSubmit?.name || "";
      const detailPageAgentRun = selectedSkillIdAtSubmit === "detail-page-planner-agent";
      const designPlanAgentEnabledAtSubmit = designPlanAgentIds.has(selectedSkillIdAtSubmit);
      const ai = selectedAiConfig();
      if (!ai.configured) {
        toast(`中控未配置 ${ai.label} API Key。`);
        return;
      }
    
      let userPrompt = String(els.directPromptInput?.value || state.aiDirect.prompt || "").trim();
      if (!userPrompt && detailPageAgentRun && state.aiDirect.detailPlanningMaterials?.length) {
        userPrompt = "请根据上传的商品资料表自动策划完整详情页。";
      }
      if (!userPrompt) {
        toast("请先在对话框里输入生图或修改需求。");
        return;
      }
      const requestedCountAtSubmit = Math.max(1, Number(designPlanAgentEnabledAtSubmit
        ? requestedDesignPlanCount(userPrompt, {
          selectedSkillId: selectedSkillIdAtSubmit,
          imageCount: Number(els.imageCount?.value || 1)
        }) || 1
        : els.imageCount?.value || 1));
      const aspectRatioAtSubmit = String(els.aspectRatio?.value || "1:1");
      const imageSizeAtSubmit = String(els.imageSize?.value || "1K");
      const thinkingModeAtSubmit = String(currentThinkingMode() || "standard");
      const webSearchAtSubmit = Boolean(state.aiDirect.webSearchEnabled);
      if (!detailPageAgentRun) {
        const activeUnits = activeOrdinaryGenerationUnits();
        if (activeUnits + requestedCountAtSubmit > ordinaryGenerationUnitLimit) {
          toast(`当前已有 ${activeUnits} 张在生成或排队，本次 ${requestedCountAtSubmit} 张超过最多 ${ordinaryGenerationUnitLimit} 张限制。`);
          return;
        }
      }
      const outgoingReferences = snapshotComposerReferences();
      const conversationId = ensureActiveAiConversation();
      const generationTaskId = createClientId();
      const userMessageId = createClientId();
      const outgoingPlanningMaterials = (Array.isArray(state.aiDirect.detailPlanningMaterials)
        ? state.aiDirect.detailPlanningMaterials
        : []).map((material) => ({ ...material }));
      state.aiDirect.chatMessages.push({
        id: userMessageId,
        role: "user",
        text: userPrompt,
        references: outgoingReferences,
        taskId: generationTaskId,
        createdAt: new Date().toISOString()
      });
      state.aiDirect.prompt = "";
      if (els.directPromptInput) els.directPromptInput.value = "";
      const requestConversation = cloneAiConversationSnapshot(currentAiConversationSnapshot());
      requestConversation.canvasFocusTarget = null;
      requestConversation.selectedEditImageKey = "";
      requestConversation.useSelectedImageAsBase = false;
      let generationConversation = newImageComposerContext(requestConversation);
      generationConversation.selectedSkillId = selectedSkillIdAtSubmit;
      generationConversation.selectedSkill = selectedSkillAtSubmit ? {
        id: selectedSkillIdAtSubmit,
        name: selectedSkillNameAtSubmit,
        prompt: selectedSkillAtSubmit.prompt || ""
      } : null;
      generationConversation.generationTaskId = generationTaskId;
      generationConversation.imageCount = requestedCountAtSubmit;
      generationConversation.aspectRatio = aspectRatioAtSubmit;
      generationConversation.imageSize = imageSizeAtSubmit;
      generationConversation.thinkingMode = thinkingModeAtSubmit;
      generationConversation.webSearchEnabled = webSearchAtSubmit;
      generationConversation.outputSizeMode = state.aiDirect.outputSizeMode || "auto";
      generationConversation.customOutputWidth = Number(state.aiDirect.customOutputWidth || 0);
      generationConversation.customOutputHeight = Number(state.aiDirect.customOutputHeight || 0);
      if (detailPageAgentRun) {
        generationConversation.detailPlanningMaterials = outgoingPlanningMaterials;
        generationConversation.detailBrandProfile = "";
        const productIdentityIndex = explicitDetailProductIdentityIndex(userPrompt, generationConversation.references);
        generationConversation.references = (Array.isArray(generationConversation.references)
          ? generationConversation.references
          : []).map((image, index) => ({
            ...image,
            role: index === productIdentityIndex ? "product_identity" : image.role,
            source: image.source || "user_upload"
          }));
        const brandLayoutReference = detailBrandLayoutReference(generationConversation.detailBrandProfile);
        if (brandLayoutReference) generationConversation.references.push(brandLayoutReference);
        const embeddedReferences = detailPlanningEmbeddedReferences(outgoingPlanningMaterials);
        generationConversation.references = [
          ...(Array.isArray(generationConversation.references) ? generationConversation.references : []),
          ...embeddedReferences
        ];
        generationConversation.imageCount = detailPageAgentRequestedCount(userPrompt, generationConversation);
        generationConversation.aspectRatio = "3:4";
        generationConversation.imageSize = "4K";
        generationConversation.exactOutputSize = null;
        generationConversation.outputSizeMode = "preset";
      }
      registerGenerationTask({
        id: generationTaskId,
        conversationId,
        userMessageId,
        prompt: userPrompt,
        skillId: selectedSkillIdAtSubmit,
        skillName: selectedSkillNameAtSubmit,
        detailPage: detailPageAgentRun,
        requestedCount: requestedCountAtSubmit,
        status: "preparing",
        progress: {
          status: "preparing",
          percent: 2,
          message: "正在准备生图任务",
          totalCount: requestedCountAtSubmit,
          completedCount: 0,
          failedCount: 0
        }
      });
      const requestPrompt = buildAiCurrentTurnPrompt([
          "本轮是右侧主对话框的新图生成任务。只使用本轮文字和本轮上传图片作为参考，不沿用历史结果，不基于画布选中图续改。",
          userPrompt
        ].filter(Boolean).join("\n"), generationConversation);
      requestConversation.references = [];
      requestConversation.selectedEditImageKey = "";
      requestConversation.useSelectedImageAsBase = false;
      requestConversation.canvasFocusTarget = null;
      if (state.aiDirect.activeConversationId === conversationId) {
        state.aiDirect.references = [];
        if (detailPageAgentRun) state.aiDirect.detailPlanningMaterials = [];
        state.aiDirect.selectedEditImageKey = "";
        state.aiDirect.useSelectedImageAsBase = false;
        clearCanvasFocusTarget({ silent: true });
        if (els.useSelectedImageInput) els.useSelectedImageInput.checked = false;
        renderReferencePreviewList();
        renderRelayPreview();
        renderSelectedEditImageState();
      }
      let confirmedDesignPlan = null;
      let requestedImageCount = Math.max(1, Number(generationConversation.imageCount || els.imageCount?.value || 1));
      const detailCheckpointMessageId = `detail-checkpoint-${createClientId()}`;
      const isOriginalConversationActive = () => state.aiDirect.activeConversationId === conversationId;
      saveAiConversationNow({ snapshot: requestConversation, applyToActive: false, mergeMode: "task" });
      let resolvedAspectRatio = aspectRatioAtSubmit;
      let outputSizeLock = null;
      let canvasPlaceholderId = "";
      try {
        resolvedAspectRatio = await syncAspectRatioForAiRequest(requestPrompt, generationConversation, { silent: true, applyToUi: false });
        if (detailPageAgentRun) {
          generationConversation.exactOutputSize = null;
        } else {
          generationConversation.exactOutputSize = currentUiExactOutputSize(generationConversation, { includeCanvasSelection: false });
          outputSizeLock = await aiExactOutputSizeForRequest(userPrompt, generationConversation);
        }
        canvasPlaceholderId = await createCanvasGenerationPlaceholder({
          prompt: userPrompt,
          provider: ai.providerLabel || ai.provider || "AI",
          count: requestedImageCount,
          aspectRatio: detailPageAgentRun ? "3:4" : outputSizeLock?.aspectRatio || resolvedAspectRatio || aspectRatioAtSubmit,
          subtitle: designPlanAgentEnabledAtSubmit
            ? detailPageAgentRun ? "详情页 Agent 正在自动编排" : "设计 Agent 正在自动编排"
            : undefined
        });
        updateGenerationTask(generationTaskId, { placeholderId: canvasPlaceholderId });
      } catch (error) {
        console.error(error);
        const errorMessage = formatAiVisibleError(error.message, "生图任务准备失败");
        requestConversation.chatMessages = [...(requestConversation.chatMessages || []), {
          id: `generation-error-${generationTaskId}`,
          role: "assistant",
          text: errorMessage,
          error: true,
          taskId: generationTaskId,
          metadata: { generationTaskId },
          createdAt: new Date().toISOString()
        }];
        if (isOriginalConversationActive()) {
          state.aiDirect.chatMessages = mergeChatMessagesById(state.aiDirect.chatMessages, requestConversation.chatMessages);
          renderAiGeneratedError(errorMessage, generationTaskId);
        }
        updateGenerationTask(generationTaskId, { status: "failed" });
        await saveAiConversationNow({ snapshot: requestConversation, applyToActive: isOriginalConversationActive(), mergeMode: "task" });
        toast(errorMessage);
        return;
      }
      let imagePayload = null;
      let generationMetadata = {};
      let generatedImages = [];
      let detailPageScreenImages = [];
      let generationResultCommitted = false;

      const commitGeneratedImages = async (options = {}) => {
        generationMetadata.generationTaskId = generationTaskId;
        if (!imagePayload || typeof imagePayload !== "object") imagePayload = {};
        imagePayload.metadata = generationMetadata;
        const promptRecord = userPrompt;
        generatedImages.forEach((image) => {
          if (image && typeof image === "object" && !image.prompt) image.prompt = promptRecord;
        });
        const canvasImages = detailPageAgentRun
          ? (detailPageScreenImages.length ? detailPageScreenImages : generatedImages)
          : generatedImages;
        const remainingCanvasImages = canvasPlaceholderId
          ? await replaceCanvasGenerationPlaceholder(canvasPlaceholderId, canvasImages)
          : canvasImages;
        const completionText = options.completionText || formatAiGenerationCompleteMessage(ai, imagePayload, generatedImages.length);
        const assistantMessage = {
          id: `generation-result-${generationTaskId}`,
          role: "assistant",
          text: completionText,
          images: generatedImages.map((image) => ({ ...image })),
          prompt: promptRecord,
          provider: ai.provider,
          skill: selectedSkillNameAtSubmit,
          skillId: selectedSkillIdAtSubmit,
          taskId: generationTaskId,
          metadata: { ...generationMetadata, generationTaskId },
          createdAt: new Date().toISOString()
        };
        requestConversation.generatedImages = generatedImages;
        requestConversation.chatMessages = [
          ...(requestConversation.chatMessages || []).filter((message) => message.id !== detailCheckpointMessageId),
          assistantMessage
        ];
        requestConversation.references = [];
        requestConversation.selectedEditImageKey = "";
        requestConversation.useSelectedImageAsBase = false;
        requestConversation.canvasFocusTarget = null;
        if (isOriginalConversationActive()) {
          state.aiDirect.generatedImages = generatedImages;
          state.aiDirect.chatMessages = mergeChatMessagesById(state.aiDirect.chatMessages, requestConversation.chatMessages);
          state.aiDirect.references = [];
          state.aiDirect.selectedEditImageKey = "";
          state.aiDirect.useSelectedImageAsBase = false;
          clearCanvasFocusTarget({ silent: true });
          state.aiDirect.webSearchEnabled = false;
          if (els.useSelectedImageInput) els.useSelectedImageInput.checked = false;
          state.aiDirect.pendingStatus = null;
          renderReferencePreviewList();
          renderAiWebSearchToggle();
          renderSelectedEditImageState();
          renderAiGeneratedList();
        }
        autoInsertGeneratedImagesToCanvas(remainingCanvasImages, {
          layoutMode: detailPageAgentRun ? "vertical" : "grid"
        });
        updateGenerationTask(generationTaskId, {
          status: "complete",
          progress: {
            status: "complete",
            percent: 100,
            message: completionText,
            totalCount: requestedImageCount,
            completedCount: generatedImages.length,
            failedCount: Number(generationMetadata.failedCount || 0)
          }
        });
        await saveAiConversationNow({
          snapshot: requestConversation,
          applyToActive: isOriginalConversationActive(),
          mergeMode: "task"
        });
        generationResultCommitted = true;
        renderAiChatList();
        return completionText;
      };
    
      try {
        if (isOriginalConversationActive()) {
          state.aiDirect.pendingStatus = null;
        }
        renderAiGeneratedStatus({ status: "preparing", percent: 6, message: "正在整理提示词和图片" }, generationTaskId);
        if (designPlanAgentEnabledAtSubmit) {
          const planningProgress = {
            status: "preparing",
            percent: 8,
            message: detailPageAgentRun
              ? "详情页 Agent 正在自动编排屏幕"
              : "设计 Agent 正在自动编排"
          };
          renderAiGeneratedStatus(planningProgress, generationTaskId);
          if (canvasPlaceholderId) updateCanvasGenerationPlaceholderProgress(planningProgress, canvasPlaceholderId);
          generationConversation.imageCount = requestedDesignPlanCount(userPrompt, generationConversation);
          const draftPlan = await requestDesignAgentPlan(userPrompt, generationConversation);
          confirmedDesignPlan = normalizeDesignPlanForClient(draftPlan);
          generationConversation.imageCount = confirmedDesignPlan.modules.length;
          requestedImageCount = Math.max(1, confirmedDesignPlan.modules.length);
          if (!detailPageAgentRun) {
            const otherActiveUnits = Math.max(0, activeOrdinaryGenerationUnits() - Number(generationTask(generationTaskId)?.requestedCount || 1));
            if (otherActiveUnits + requestedImageCount > ordinaryGenerationUnitLimit) {
              throw new Error(`当前其他任务已占用 ${otherActiveUnits} 张，Agent 编排后本任务需要 ${requestedImageCount} 张，超过最多 ${ordinaryGenerationUnitLimit} 张限制。`);
            }
          }
          updateGenerationTask(generationTaskId, { requestedCount: requestedImageCount });
          const planReadyProgress = {
            status: "preparing",
            percent: 12,
            message: detailPageAgentRun
              ? `详情页 Agent 已编排 ${requestedImageCount} 屏，开始生成`
              : `设计 Agent 已编排 ${requestedImageCount} 张，开始生成`,
            totalCount: requestedImageCount,
            completedCount: 0,
            failedCount: 0
          };
          renderAiGeneratedStatus(planReadyProgress, generationTaskId);
          if (canvasPlaceholderId) updateCanvasGenerationPlaceholderProgress(planReadyProgress, canvasPlaceholderId);
        }
        toast(confirmedDesignPlan
          ? "正在按 Agent 编排生成..."
          : "正在提交 AI 生图...");
        if (confirmedDesignPlan) {
          const plannedResult = await runConfirmedDesignPlan(ai, userPrompt, generationConversation, confirmedDesignPlan, conversationId, (progress) => {
            renderAiGeneratedStatus(progress, generationTaskId);
            if (canvasPlaceholderId) updateCanvasGenerationPlaceholderProgress(progress, canvasPlaceholderId);
          }, detailPageAgentRun ? async (checkpoint) => {
            const checkpointMessage = {
              id: detailCheckpointMessageId,
              role: "assistant",
              text: `详情页生成中，已保存 ${checkpoint.completedCount}/${checkpoint.requestedCount} 屏；已完成的单屏可从对话记录恢复。`,
              images: checkpoint.images,
              prompt: userPrompt,
              provider: ai.provider,
              skill: selectedSkillNameAtSubmit,
              skillId: selectedSkillIdAtSubmit,
              taskId: generationTaskId,
              metadata: {
                generationTaskId,
                detailPageWorkflow: true,
                detailPageCheckpoint: true,
                detailPageScreenCount: checkpoint.requestedCount,
                successCount: checkpoint.completedCount,
                failedCount: checkpoint.failedCount,
                failedModules: checkpoint.failedModules,
                completedGroupCount: checkpoint.completedGroupCount,
                detailPageGroupCount: checkpoint.totalGroupCount
              },
              createdAt: new Date().toISOString()
            };
            requestConversation.generatedImages = checkpoint.images;
            requestConversation.chatMessages = [
              ...(requestConversation.chatMessages || []).filter((message) => message.id !== detailCheckpointMessageId),
              checkpointMessage
            ];
            const checkpointSave = await saveAiConversationNow({ snapshot: requestConversation, applyToActive: false, mergeMode: "task" });
            if (checkpointSave?.conversation) {
              requestConversation.references = checkpointSave.conversation.references || requestConversation.references;
              requestConversation.detailPlanningMaterials = checkpointSave.conversation.detailPlanningMaterials || requestConversation.detailPlanningMaterials;
              requestConversation.generatedImages = checkpointSave.conversation.generatedImages || requestConversation.generatedImages;
              requestConversation.chatMessages = checkpointSave.conversation.chatMessages || requestConversation.chatMessages;
            }
          } : null);
          imagePayload = plannedResult.payload || {};
          generationMetadata = imagePayload.metadata || {};
          generatedImages = plannedResult.images || [];
          generationMetadata = publicDesignPlanMetadata(generationMetadata, confirmedDesignPlan);
        } else {
          const response = await requestAiImageGeneration(ai, requestPrompt, generationConversation);
      
          let data = await response.json();
          if (!response.ok) {
            console.warn("AI image request failed", data);
            throw createAiApiError(data, "AI 生图请求失败", response.status);
          }
          if (response.status === 202 && data.statusUrl) {
            renderAiGeneratedStatus(data, generationTaskId);
            data = await pollAiImageGeneration(data.statusUrl, conversationId, {
              taskId: generationTaskId,
              placeholderId: canvasPlaceholderId
            });
          }
      
          imagePayload = data.data || data;
          generationMetadata = imagePayload.metadata || imagePayload.meta || imagePayload.data?.metadata || {};
          generatedImages = extractAiGeneratedImages(imagePayload, requestedImageCount);
        }
        if (!generatedImages.length) {
          throw new Error(formatEmptyAiImageError(imagePayload));
        }
        if (detailPageAgentRun) {
          await enrichAiGeneratedImageDimensions(generatedImages);
          const invalidRatioImages = generatedImages.filter((image) => {
            const width = Number(image?.width || 0);
            const height = Number(image?.height || 0);
            return !width || !height || Math.abs(width / height - 3 / 4) > 0.002;
          });
          generationMetadata.detailPageRatioMismatch = invalidRatioImages.length > 0;
          generationMetadata.detailPageRatioMismatchScreens = invalidRatioImages.map((image) => Number(image?.designPlanModule?.index || 0)).filter((value) => value > 0);
          generationMetadata.detailPageScreenAspectRatio = invalidRatioImages.length ? "供应商原始比例（含非3:4屏）" : "3:4";
          const screenSizes = [...new Set(generatedImages.map((image) => `${Number(image.width || 0)}x${Number(image.height || 0)}`))];
          generationMetadata.detailPageScreenSize = screenSizes.length === 1 ? screenSizes[0] : "保留各屏原始高清尺寸";
          generationMetadata.detailPageScreenSizes = screenSizes;
          generationMetadata.detailPageRatioCorrectionMode = "original-no-raster-rewrite";
        } else {
          await resizeAiGeneratedImagesToExactSize(generatedImages, outputSizeLock);
          await enrichAiGeneratedImageDimensions(generatedImages);
        }
        detailPageScreenImages = detailPageAgentRun ? generatedImages.map((image) => ({ ...image })) : generatedImages;
        if (detailPageAgentRun) {
          const expectedScreenCount = Math.max(1, Number(generationMetadata.requestedCount || confirmedDesignPlan?.modules?.length || generatedImages.length));
          const missingModuleIndexes = Array.isArray(generationMetadata.missingModuleIndexes)
            ? generationMetadata.missingModuleIndexes.map(Number).filter((value) => value > 0)
            : [];
          const detailPageComplete = Number(generationMetadata.failedCount || 0) === 0
            && generatedImages.length === expectedScreenCount
            && missingModuleIndexes.length === 0;
          generationMetadata.detailPageIncomplete = !detailPageComplete;
          generationMetadata.detailPageSourceCount = generatedImages.length;
          if (!detailPageComplete || generationMetadata.detailPageRatioMismatch) {
            generationMetadata.detailPageMergeSkipped = true;
            generationMetadata.detailPageMergeSkippedReason = missingModuleIndexes.length
              ? `缺少第 ${missingModuleIndexes.join("、")} 屏，已禁止合成长图。`
              : generationMetadata.detailPageRatioMismatch
              ? `第 ${generationMetadata.detailPageRatioMismatchScreens.join("、") || "未知"} 屏不是 3:4，已保留供应商原图并停止合成长图。`
              : `计划 ${expectedScreenCount} 屏，实际完成 ${generatedImages.length} 屏，已禁止合成长图。`;
          } else if (generatedImages.length > 1) {
            const mergedDetailImages = await buildMergedDetailPageImages(generatedImages);
            if (mergedDetailImages.length) {
              generationMetadata.detailPageMerged = true;
              generationMetadata.detailPageMergedPartCount = mergedDetailImages.length;
              generatedImages.unshift(...mergedDetailImages);
              await enrichAiGeneratedImageDimensions(mergedDetailImages);
            } else {
              generationMetadata.detailPageMergeFailed = true;
              generationMetadata.detailPageMergeSkippedReason = "单屏均已生成，但浏览器合成长图失败，请分别下载单屏。";
            }
          }
        }
        const completionText = await commitGeneratedImages();
        refreshAccount();
        toast(completionText);
      } catch (error) {
        console.error(error);
        handleAuthFailure(error);
        const errorMessage = formatAiVisibleError(error.message, "AI 生图失败");
        if (detailPageAgentRun && generatedImages.length && !generationResultCommitted) {
          generationMetadata.detailPageWorkflow = true;
          generationMetadata.detailPageRecoveredAfterError = true;
          generationMetadata.detailPageIncomplete = true;
          generationMetadata.detailPageSourceCount = generatedImages.length;
          generationMetadata.detailPageMergeSkipped = true;
          generationMetadata.detailPageMergeSkippedReason = generationMetadata.detailPageMergeSkippedReason || `生成后处理失败，已保留 ${generatedImages.length} 张单屏：${errorMessage}`;
          if (!Array.isArray(generationMetadata.errors)) generationMetadata.errors = [];
          generationMetadata.errors.unshift(errorMessage);
          try {
            const completionText = await commitGeneratedImages({
              completionText: formatAiGenerationCompleteMessage(ai, { metadata: generationMetadata }, generatedImages.length)
            });
            refreshAccount();
            toast(completionText);
            return;
          } catch (commitError) {
            console.error("详情页成功单屏兜底保存失败", commitError);
          }
        }
        requestConversation.chatMessages = [...(requestConversation.chatMessages || []), {
          id: `generation-error-${generationTaskId}`,
          role: "assistant",
          text: errorMessage,
          error: true,
          taskId: generationTaskId,
          metadata: { generationTaskId },
          createdAt: new Date().toISOString()
        }];
        requestConversation.canvasFocusTarget = null;
        if (isOriginalConversationActive()) {
          state.aiDirect.pendingStatus = null;
          state.aiDirect.chatMessages = mergeChatMessagesById(state.aiDirect.chatMessages, requestConversation.chatMessages);
          renderAiGeneratedError(errorMessage, generationTaskId);
          if (!showAiPromptRewriteFailureDialog(errorMessage, {
            error,
            userPrompt,
            requestPrompt,
            ai,
            context: generationConversation,
            references: outgoingReferences,
            aspectRatio: detailPageAgentRun ? "3:4" : outputSizeLock?.aspectRatio || resolvedAspectRatio || aspectRatioAtSubmit,
            imageSize: generationConversation.imageSize || imageSizeAtSubmit,
            requestedImageCount
          })) {
            showAiFailureDialog?.(errorMessage, { title: "生成失败" });
          }
        }
        markCanvasGenerationPlaceholderError(canvasPlaceholderId, errorMessage);
        updateGenerationTask(generationTaskId, {
          status: "failed",
          progress: {
            status: "failed",
            percent: 100,
            message: errorMessage,
            totalCount: requestedImageCount,
            completedCount: 0,
            failedCount: requestedImageCount
          }
        });
        await saveAiConversationNow({
          snapshot: requestConversation,
          applyToActive: isOriginalConversationActive(),
          mergeMode: "task"
        });
        toast(isOriginalConversationActive() ? errorMessage : `原对话生成失败：${errorMessage}`);
      } finally {
        renderAiConversationList?.();
      }
    }
    
    async function pollAiImageGeneration(statusUrl, conversationId = state.aiDirect.activeConversationId, options = {}) {
      let notFoundRetries = 0;
      const renderStatus = options.renderStatus !== false;
      const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;
      const taskId = String(options.taskId || "");
      const placeholderId = String(options.placeholderId || "");
      for (;;) {
        await sleep(1000);
        const response = await fetch(statusUrl, { cache: "no-store" });
        let data = null;
        try {
          data = await response.json();
        } catch {
          if (response.status === 404 && notFoundRetries < 3) {
            notFoundRetries += 1;
            await sleep(900);
            continue;
          }
          const error = new Error(`AI 生图进度服务返回了无法解析的响应（HTTP ${response.status || "未知"}）。`);
          error.status = Number(response.status >= 400 ? response.status : 502);
          throw error;
        }
        if (!response.ok) {
          if (response.status === 404 && notFoundRetries < 3) {
            notFoundRetries += 1;
            await sleep(900);
            continue;
          }
          console.warn("AI image generation progress failed", data);
          throw createAiApiError(data, "AI 生图进度读取失败", Number(response.status || data?.statusCode || data?.status_code || 0));
        }
        onProgress?.(data);
        if (renderStatus) {
          renderAiGeneratedStatus(data, taskId);
          if (placeholderId) updateCanvasGenerationPlaceholderProgress(data, placeholderId);
        }
        if (data.status === "complete") return data;
        if (data.status === "failed") {
          console.warn("AI image generation job failed", data);
          throw createAiApiError(data, "AI 生图失败", Number(data?.statusCode || data?.status_code || data?.error?.status || 0));
        }
      }
    }
    
    function requestAiImageGeneration(ai, finalPrompt, context = state.aiDirect) {
      const count = Number(context.imageCount || els.imageCount?.value || 1);
      const references = aiRequestReferences(finalPrompt, context);
      const webSearch = Boolean(context.webSearchEnabled);
      const thinkingMode = String(context.thinkingMode || currentThinkingMode()).trim().toLowerCase() || "standard";
      const aspectRatio = context.aspectRatio || els.aspectRatio?.value || "1:1";
      const imageSize = context.imageSize || els.imageSize?.value || "1K";
      const selectedBaseRoles = new Set(["previous_result_base", "canvas_focus_region", "uploaded_base"]);
      const useSelectedBase = references.some((image) => selectedBaseRoles.has(image.role));
      if (ai.provider === "imageservice") {
        return fetch("/api/image-service/image-generation", {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            api_provider: "primary",
            model: ai.imageModel || ai.model || "",
            prompt: finalPrompt,
            aspect_ratio: aspectRatio,
            image_size: imageSize,
            n: count,
            thinking_mode: thinkingMode,
            web_search: webSearch,
            enable_web_search: webSearch,
            workflow: context.workflow || "",
            conversationId: context.conversationId || context.conversation_id || state.aiDirect.activeConversationId || context.id || "",
            force_selected_base: Boolean(context.forceSelectedBase),
            use_selected_image: useSelectedBase,
            has_selected_image: useSelectedBase,
            has_selected_base: useSelectedBase,
            references: references.map((image) => ({
              id: image.id,
              name: image.name,
              role: image.role,
              image_file: image.image_file || image.url,
              width: image.width || 0,
              height: image.height || 0,
              aspect_ratio: image.aspect_ratio || "",
              focus_target: image.focus_target || null,
              source: image.source || "",
              plannedRole: image.plannedRole || "",
              plannedScope: image.plannedScope || "",
              plannedStrength: image.plannedStrength || "",
              plannedExplicit: Boolean(image.plannedExplicit),
              plannedInstruction: image.plannedInstruction || ""
            }))
          })
        });
      }
    
      if (ai.provider === "responsesimage") {
        return fetch("/api/responses-image/image-generation", {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            model: ai.imageModel || ai.model || "reasoning-model",
            prompt: finalPrompt,
            aspect_ratio: aspectRatio,
            image_size: imageSize,
            n: 1,
            thinking_mode: thinkingMode,
            web_search: webSearch,
            enable_web_search: webSearch,
            workflow: context.workflow || "",
            conversationId: context.conversationId || context.conversation_id || state.aiDirect.activeConversationId || context.id || "",
            force_selected_base: Boolean(context.forceSelectedBase),
            use_selected_image: useSelectedBase,
            has_selected_image: useSelectedBase,
            has_selected_base: useSelectedBase,
            references: references.map((image) => ({
              id: image.id,
              name: image.name,
              role: image.role,
              image_file: image.image_file || image.url,
              width: image.width || 0,
              height: image.height || 0,
              aspect_ratio: image.aspect_ratio || "",
              focus_target: image.focus_target || null,
              source: image.source || "",
              plannedRole: image.plannedRole || "",
              plannedScope: image.plannedScope || "",
              plannedStrength: image.plannedStrength || "",
              plannedExplicit: Boolean(image.plannedExplicit),
              plannedInstruction: image.plannedInstruction || ""
            }))
          })
        });
      }
    
      throw new Error("当前生图接口还未接入所选服务商。");
    }
    
    function extractAiGeneratedImages(data, requestedLimit = 0) {
      const result = [];
      const seen = new Set();
      const limit = Math.max(0, Number(requestedLimit || data?.metadata?.requestedCount || data?.metadata?.requested_count || data?.data?.metadata?.requestedCount || data?.data?.metadata?.requested_count || 0));
      const pushImage = (name, url) => {
        const value = String(url || "").trim();
        if (!value) return;
        if (limit && result.length >= limit) return;
        const key = value.length > 240
          ? `${value.length}:${value.slice(0, 120)}:${value.slice(-120)}`
          : value;
        if (seen.has(key)) return;
        seen.add(key);
        result.push({ name, url: value });
      };
      const addBase64 = (base64, index, mimeType = "image/jpeg") => {
        const value = String(base64 || "").trim();
        if (!value) return;
        const normalizedMime = String(mimeType || "image/jpeg").toLowerCase();
        const ext = normalizedMime.includes("png") ? "png" : "jpeg";
        const url = value.startsWith("data:") ? value : `${normalizedMime.startsWith("image/") ? `data:${normalizedMime};base64,` : "data:image/jpeg;base64,"}${value}`;
        pushImage(`ai-direct-${result.length + 1}.${ext}`, url);
      };
      const addUrl = (url) => {
        const value = String(url || "").trim();
        if (!value) return;
        pushImage(`ai-direct-url-${result.length + 1}.jpeg`, value);
      };
      const collectArrayOrString = (value, handler) => {
        if (Array.isArray(value)) value.forEach(handler);
        else if (typeof value === "string") handler(value, 0);
      };
    
      collectArrayOrString(data?.data?.image_base64, addBase64);
      collectArrayOrString(data?.image_base64, addBase64);
      collectArrayOrString(data?.data?.image_urls, addUrl);
      collectArrayOrString(data?.image_urls, addUrl);
    
      const imageObjects = data?.data?.images || data?.images || [];
      if (Array.isArray(imageObjects)) {
        imageObjects.forEach((item, index) => {
          if (typeof item === "string") {
            item.startsWith("http") ? addUrl(item) : addBase64(item, index);
            return;
          }
          addUrl(item?.url || item?.image_url || item?.image_file);
          addBase64(item?.data || item?.base64 || item?.image_base64 || item?.b64_json, index, item?.mimeType || item?.mime_type || "image/png");
        });
      }
    
      const candidates = data?.candidates || data?.data?.candidates || [];
      if (Array.isArray(candidates)) {
        candidates.forEach((candidate, candidateIndex) => {
          const parts = candidate?.content?.parts || candidate?.parts || [];
          if (!Array.isArray(parts)) return;
          parts.forEach((part, partIndex) => {
            const inlineData = part?.inlineData || part?.inline_data;
            if (inlineData) {
              addBase64(inlineData.data, partIndex || candidateIndex, inlineData.mimeType || inlineData.mime_type || "image/png");
            }
          });
        });
      }
      return result;
    }
    
    async function enrichAiGeneratedImageDimensions(images = []) {
      const list = Array.isArray(images) ? images : [];
      await Promise.all(list.map(async (image) => {
        if (!image || (image.width && image.height)) return;
        const source = image.url || image.image_file || "";
        const dimensions = await loadImageDimensions(source).catch(() => null);
        const width = Number(dimensions?.width || 0);
        const height = Number(dimensions?.height || 0);
        if (!width || !height) return;
        image.width = width;
        image.height = height;
        image.aspectRatio = closestAspectRatioFromSize(width, height);
      }));
      return list;
    }

    function createAiApiError(data, fallback = "AI 生图失败", status = 0) {
      const error = new Error(formatApiError(data, fallback));
      error.status = Number(status || data?.statusCode || data?.status_code || data?.error?.status || 0);
      error.aiData = data && typeof data === "object" ? data : {};
      error.promptRewriteAvailable = Boolean(error.aiData.promptRewriteAvailable);
      error.errorType = String(error.aiData.errorType || "");
      error.providerAttempts = Array.isArray(error.aiData.providerAttempts) ? error.aiData.providerAttempts : [];
      return error;
    }

    function isAiPromptRewriteFailure(error, message = "") {
      const data = error?.aiData && typeof error.aiData === "object" ? error.aiData : {};
      if (data.promptRewriteAvailable || error?.promptRewriteAvailable) return true;
      const attempts = Array.isArray(data.providerAttempts)
        ? data.providerAttempts
        : Array.isArray(error?.providerAttempts) ? error.providerAttempts : [];
      const azSafety = attempts.some((attempt) => (
        attempt?.provider === "imageservice"
        && attempt?.result === "failed"
        && attempt?.reasonType === "safety"
      ));
      const nativeFailed = attempts.some((attempt) => attempt?.provider === "secondaryimage" && attempt?.result === "failed");
      if (azSafety && nativeFailed) return true;
      const text = `${message || ""}\n${error?.message || ""}`;
      return /图片服务.*内容安全拦截.*备用图片服务仍失败|已自动切换备用图片服务.*仍失败/.test(text);
    }

    function parsePromptRewriteResponse(data, fallbackPrompt = "") {
      if (data && typeof data === "object" && String(data.prompt || "").trim()) {
        return {
          prompt: String(data.prompt || "").trim(),
          reason: String(data.reason || "").trim(),
          changes: Array.isArray(data.changes) ? data.changes.map((item) => String(item || "").trim()).filter(Boolean) : []
        };
      }
      const content = String(data?.content || data?.message || data?.raw || "").trim();
      const parsed = tryParseApiErrorJson(content);
      if (parsed && typeof parsed === "object") return parsePromptRewriteResponse(parsed, fallbackPrompt);
      return {
        prompt: content || String(fallbackPrompt || "").trim(),
        reason: "",
        changes: []
      };
    }

    function showAiPromptRewriteFailureDialog(errorMessage, options = {}) {
      if (!showAiFailureDialog || !isAiPromptRewriteFailure(options.error, errorMessage)) return false;
      const dialogMessage = [
        errorMessage,
        "",
        "可以先让思考模型分析失败原因并自动修改提示词，修改后会放回输入框，你确认后再发送。"
      ].join("\n");
      void showAiFailureDialog(dialogMessage, {
        title: "生成被安全拦截",
        kicker: "内容安全拦截",
        confirmText: "一键修改提示词",
        cancelText: "取消",
        showCancel: true
      }).then((confirmed) => {
        if (!confirmed) return;
        void rewriteAiPromptAfterSafetyFailure(errorMessage, options);
      });
      return true;
    }

    async function rewriteAiPromptAfterSafetyFailure(errorMessage, options = {}) {
      const originalPrompt = String(options.userPrompt || state.aiDirect.prompt || "").trim();
      if (!originalPrompt) {
        toast("缺少原始提示词，无法自动修改。");
        return;
      }
      setBusy(true);
      try {
        toast("正在用思考模型分析失败原因...");
        const references = (Array.isArray(options.references) && options.references.length
          ? options.references
          : Array.isArray(options.context?.references) ? options.context.references : []).slice(0, aiReferenceLimit());
        const response = await fetch("/api/ai/image-prompt", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mode: "safety_rewrite",
            prompt: originalPrompt,
            final_prompt: options.requestPrompt || "",
            failure_message: errorMessage,
            aspect_ratio: options.aspectRatio || options.context?.aspectRatio || els.aspectRatio?.value || "1:1",
            image_size: options.imageSize || options.context?.imageSize || els.imageSize?.value || "1K",
            referenceCount: references.length,
            providerAttempts: options.error?.providerAttempts || options.error?.aiData?.providerAttempts || [],
            references: references.map((image) => ({
              name: image.name || "",
              role: image.role || image.plannedRole || "",
              source: image.source || "",
              width: image.width || 0,
              height: image.height || 0
            }))
          })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw createAiApiError(data, "提示词自动修改失败", response.status);
        const revised = parsePromptRewriteResponse(data, originalPrompt);
        const nextPrompt = String(revised.prompt || "").trim();
        if (!nextPrompt) throw new Error("思考模型没有返回可用提示词。");
        state.aiDirect.prompt = nextPrompt;
        if (els.directPromptInput) {
          els.directPromptInput.value = nextPrompt;
          els.directPromptInput.focus();
          els.directPromptInput.dispatchEvent(new Event("input", { bubbles: true }));
        }
        const note = [
          "已根据安全拦截修改提示词，已放回输入框，请确认后再次发送。",
          revised.reason ? `可能原因：${revised.reason}` : "",
          revised.changes?.length ? `修改点：${revised.changes.slice(0, 3).join("；")}` : ""
        ].filter(Boolean).join("\n");
        state.aiDirect.chatMessages.push({
          id: createClientId(),
          role: "assistant",
          text: note,
          metadata: {
            promptSafetyRewrite: true,
            sourceError: errorMessage
          },
          createdAt: new Date().toISOString()
        });
        renderAiChatList();
        saveAiConversationDebounced();
        toast("提示词已修改，确认后点发送重新生成。");
      } catch (rewriteError) {
        console.error(rewriteError);
        handleAuthFailure(rewriteError);
        const visible = formatAiVisibleError(rewriteError.message, "提示词自动修改失败");
        toast(visible);
        showAiFailureDialog?.(visible, { title: "提示词修改失败" });
      } finally {
        setBusy(false);
      }
    }
    
    function tryParseApiErrorJson(text) {
      const raw = String(text || "").trim();
      if (!raw) return null;
      const starts = [0, raw.indexOf("{"), raw.indexOf("[")].filter((index) => index >= 0);
      for (const start of starts) {
        const candidate = raw.slice(start).trim();
        if (!candidate) continue;
        try {
          return JSON.parse(candidate);
        } catch {
        }
      }
      return null;
    }

    function extractApiErrorMessage(value, depth = 0) {
      if (depth > 4 || value === undefined || value === null) return "";
      if (typeof value === "string") {
        const parsed = tryParseApiErrorJson(value);
        if (parsed) {
          const nested = extractApiErrorMessage(parsed, depth + 1);
          if (nested) return nested;
        }
        return value.trim();
      }
      if (typeof value !== "object") return String(value || "").trim();
      const candidates = [
        value.base_resp?.status_msg,
        value.error?.message,
        value.error?.detail,
        value.error,
        value.message,
        value.detail,
        value.status_msg,
        value.raw
      ];
      for (const candidate of candidates) {
        const message = extractApiErrorMessage(candidate, depth + 1);
        if (message) return message;
      }
      return "";
    }

    function formatAiVisibleError(message, fallback = "AI 生图失败") {
      const text = String(message || fallback || "").trim();
      const lower = text.toLowerCase();
      if (text.includes("已自动切换原生供应商")) return text;
      if (
        lower.includes("safety system")
        || lower.includes("risk_api_error")
        || lower.includes("content policy")
        || lower.includes("policy violation")
        || lower.includes("unsafe")
        || lower.includes("sensitive")
        || lower.includes("rejected by safety")
      ) {
        return "内容安全拦截：请调整提示词或参考图后重试。";
      }
      if (text.length > 220) return `${text.slice(0, 220)}...`;
      return text || fallback;
    }

    function formatApiError(data, fallback) {
      return formatAiVisibleError(extractApiErrorMessage(data) || fallback, fallback);
    }
    
    function formatEmptyAiImageError(data) {
      const metadata = data?.metadata || data?.data?.metadata || {};
      const failed = metadata.failedCount ?? metadata.failed_count ?? data?.failedCount ?? data?.failed_count;
      const success = metadata.successCount ?? metadata.success_count ?? data?.successCount ?? data?.success_count;
      const status = data?.base_resp?.status_msg || "";
      const parts = ["AI 返回成功但没有图片"];
      if (success !== undefined || failed !== undefined) parts.push(`success=${success ?? 0}, failed=${failed ?? 0}`);
      if (Array.isArray(metadata.errors) && metadata.errors.length) parts.push(metadata.errors.slice(0, 2).join("；"));
      if (status) parts.push(status);
      parts.push("请换一个提示词再试；本地 JPG/PNG 图片会按本轮需求提交。");
      return parts.join("；");
    }
    
    function formatAiGenerationCompleteMessage(ai, data, generatedCount) {
      const metadata = data?.metadata || data?.data?.metadata || {};
      if (metadata.detailPageWorkflow) {
        const screenCount = Number(metadata.successCount || metadata.imageCount || metadata.detailPageSourceCount || generatedCount);
        const requested = Number(metadata.requestedCount || metadata.detailPageScreenCount || screenCount);
        const failed = Number(metadata.failedCount ?? metadata.failed_count ?? 0);
        const errors = Array.isArray(metadata.errors) ? metadata.errors.slice(0, 2).join("；") : "";
        if (metadata.detailPageIncomplete || failed > 0 || screenCount < requested) {
          const missing = Array.isArray(metadata.missingModuleIndexes) && metadata.missingModuleIndexes.length
            ? `，缺少第 ${metadata.missingModuleIndexes.join("、")} 屏`
            : "";
          return `${ai.label} · 详情页仅完成 ${screenCount}/${requested} 屏${missing}，未合成长图${errors ? `：${errors}` : ""}`;
        }
        if (metadata.detailPageRatioMismatch) {
          const mismatchScreens = Array.isArray(metadata.detailPageRatioMismatchScreens) && metadata.detailPageRatioMismatchScreens.length
            ? `第 ${metadata.detailPageRatioMismatchScreens.join("、")} 屏`
            : "部分屏幕";
          return `${ai.label} · 详情页已生成 ${screenCount} 屏；${mismatchScreens}不是 3:4，已保留供应商原图并停止合成长图。`;
        }
        if (metadata.detailPageMergeFailed) {
          return `${ai.label} · 详情页已生成 ${screenCount} 屏，但浏览器合成长图失败，请下载单屏。`;
        }
        if (metadata.detailPageMerged) {
          const partCount = Number(metadata.detailPageMergedPartCount || 1);
          return `${ai.label} · 详情页已生成 ${screenCount} 屏，已自动合成${partCount > 1 ? ` ${partCount} 段高清长图` : "高清长图"}`;
        }
        return `${ai.label} · 详情页已生成 ${screenCount} 屏`;
      }
      const failed = Number(metadata.failedCount ?? metadata.failed_count ?? 0);
      const requested = Number(metadata.requestedCount ?? metadata.requested_count ?? generatedCount);
      const success = Number(metadata.successCount ?? metadata.success_count ?? generatedCount);
      const countText = requested > generatedCount
        ? `${success || generatedCount}/${requested} 张`
        : `${generatedCount} 张`;
      const assetTypeMap = {
        commerce_main_image: "电商主图",
        poster_or_kv: "商业海报",
        detail_page_module: "详情页模块",
        white_bg_product: "白底商品图",
        product_scene: "商品场景图",
        image_edit: "图片续改",
      };
      const assetType = String(metadata.assetType || metadata.asset_type || "");
      const assetText = assetTypeMap[assetType] ? ` · ${assetTypeMap[assetType]}` : "";
      if (failed > 0) {
        const errors = Array.isArray(metadata.errors) ? metadata.errors.slice(0, 2).join("；") : "";
        return `${ai.label}${assetText} 已生成 ${countText}，失败 ${failed} 张${errors ? `：${errors}` : ""}`;
      }
      return `${ai.label}${assetText} 已生成 ${generatedCount} 张图`;
    }
    

    return {
      clearAiConversation,
      buildAiCurrentTurnPrompt,
      detailPlanningEmbeddedReferences,
      composerReferenceForNewImage,
      newImageComposerContext,
      isAiRegenerateRequest,
      isAiLocalEditRequest,
      isAiReferenceMaterialRequest,
      inferCanvasFocusUsage,
      selectedEditImage,
      setSelectedEditImage,
      renderSelectedEditImageState,
      aiRequestReferences,
      snapshotComposerReferences,
      renderReferencePreviewList,
      renderRelayPreview,
      generateAiImages,
      pollAiImageGeneration,
      requestAiImageGeneration,
      extractAiGeneratedImages,
      enrichAiGeneratedImageDimensions,
      formatApiError,
      formatAiVisibleError,
      formatEmptyAiImageError,
      formatAiGenerationCompleteMessage,
    };
  };
})();
