(function () {
  const app = window.EcommerceCanvasApp = window.EcommerceCanvasApp || {};
  app.canvasSystemFontFamily = [
    "ui-sans-serif",
    "system-ui",
    "-apple-system",
    "BlinkMacSystemFont",
    "\"Segoe UI\"",
    "\"Noto Sans\"",
    "\"Noto Sans CJK SC\"",
    "sans-serif"
  ].join(", ");

  app.createAppState = function createAppState(deps) {
    const { $, $$, createClientId } = deps;

    const els = {
      activeWorkflowName: $("#activeWorkflowName"),
      aiProvider: $("#aiProvider"),
      imageApiProvider: $("#imageApiProvider"),
      aiSkillMenuBtn: $("#aiSkillMenuBtn"),
      aiSkillMenu: $("#aiSkillMenu"),
      selectedSkillName: $("#selectedSkillName"),
      aiConfigSummaryBtn: $("#aiConfigSummaryBtn"),
      aiConfigDrawer: $("#aiConfigDrawer"),
      aiConfigDrawerCloseBtn: $("#aiConfigDrawerCloseBtn"),
      aiConfigTabs: $$("[data-ai-config-tab]"),
      aiConfigSections: $$("[data-ai-config-section]"),
      aiConfigAgentMount: $("#aiConfigAgentMount"),
      aiSettingsToggleBtn: $("#aiSettingsToggleBtn"),
      aiSettingsDrawer: $("#aiSettingsDrawer"),
      aiModelPrefsBtn: $("#aiModelPrefsBtn"),
      aiModelPrefsPanel: $("#aiModelPrefsPanel"),
      aiAutoModeToggle: $("#aiAutoModeToggle"),
      userImageModelSelect: $("#userImageModelSelect"),
      userImageModelList: $("#userImageModelList"),
      userImageModelSaveBtn: $("#userImageModelSaveBtn"),
      userImageModelResetBtn: $("#userImageModelResetBtn"),
      userImageModelStatus: $("#userImageModelStatus"),
      aiWidthInput: $("#aiWidthInput"),
      aiHeightInput: $("#aiHeightInput"),
      composerModelSummary: $("#composerModelSummary"),
      thinkingMode: $("#thinkingMode"),
      thinkingModeHint: $("#thinkingModeHint"),
      textModel: $("#textModel"),
      accountStatus: $("#accountStatus"),
      accountName: $("#accountName"),
      accountPlan: $("#accountPlan"),
      usageAiImages: $("#usageAiImages"),
      usageCopywriting: $("#usageCopywriting"),
      logoutBtn: $("#logoutBtn"),
      changePasswordBtn: $("#changePasswordBtn"),
      loginOverlay: $("#loginOverlay"),
      loginForm: $("#loginForm"),
      loginUsername: $("#loginUsername"),
      loginPassword: $("#loginPassword"),
      loginRemember: $("#loginRemember"),
      loginBtn: $("#loginBtn"),
      loginError: $("#loginError"),
      forgotPasswordBtn: $("#forgotPasswordBtn"),
      releaseNoticeDialog: $("#releaseNoticeDialog"),
      releaseNoticeAckBtn: $("#releaseNoticeAckBtn"),
      privacyNoticeBtn: $("#privacyNoticeBtn"),
      privacyNoticeDialog: $("#privacyNoticeDialog"),
      privacyNoticeAckBtn: $("#privacyNoticeAckBtn"),
      privacyRetentionSummary: $("#privacyRetentionSummary"),
      privacyOperatorContact: $("#privacyOperatorContact"),
      passwordDialog: $("#passwordDialog"),
      passwordForm: $("#passwordForm"),
      passwordUsername: $("#passwordUsername"),
      currentPassword: $("#currentPassword"),
      newPassword: $("#newPassword"),
      confirmPassword: $("#confirmPassword"),
      passwordCancelBtn: $("#passwordCancelBtn"),
      passwordSubmitBtn: $("#passwordSubmitBtn"),
      passwordError: $("#passwordError"),
      aspectRatio: $("#aspectRatio"),
      imageSize: $("#imageSize"),
      imageCount: $("#imageCount"),
      referenceImageInput: $("#referenceImageInput"),
      referencePreviewList: $("#referencePreviewList"),
      canvasFocusTargetChip: $("#canvasFocusTargetChip"),
      webSearchToggle: $("#webSearchToggle"),
      directWorkflow: $("#directWorkflow"),
      aiConversationList: $("#aiConversationList"),
      newAiConversationBtn: $("#newAiConversationBtn"),
      directPromptInput: $("#directPromptInput"),
      aiChatList: $("#aiChatList"),
      useSelectedImageInput: $("#useSelectedImageInput"),
      selectedEditImageText: $("#selectedEditImageText"),
      clearFollowupBtn: $("#clearFollowupBtn"),
      relayStatusText: $("#relayStatusText"),
      workspaceModelStatus: $("#workspaceModelStatus"),
      workflowTabs: $$(".tab-btn"),
      workflowSections: $$(".workflow-section"),
      generateImagesBtn: $("#generateImagesBtn"),
      exportAiZipBtn: $("#exportAiZipBtn"),
      imagePreviewDialog: $("#imagePreviewDialog"),
      imagePreviewLarge: $("#imagePreviewLarge"),
      imagePreviewCaption: $("#imagePreviewCaption"),
      aiFailureDialog: $("#aiFailureDialog"),
      aiFailureTitle: $("#aiFailureTitle"),
      aiFailureMessage: $("#aiFailureMessage"),
      aiFailureAckBtn: $("#aiFailureAckBtn"),
      summaryLine: $("#summaryLine"),
      designCanvas: $("#designCanvas"),
      canvasStageWrap: $("#canvasStageWrap"),
      canvasProjectName: $("#canvasProjectName"),
      canvasNewProjectBtn: $("#canvasNewProjectBtn"),
      canvasSaveProjectBtn: $("#canvasSaveProjectBtn"),
      canvasAssetInput: $("#canvasAssetInput"),
      canvasAssetList: $("#canvasAssetList"),
      canvasFloatingAssetList: $("#canvasFloatingAssetList"),
      canvasSelectBtn: $("#canvasSelectBtn"),
      canvasNewToolBtn: $("#canvasNewToolBtn"),
      canvasShapeToolBtn: $("#canvasShapeToolBtn"),
      canvasDrawToolBtn: $("#canvasDrawToolBtn"),
      canvasUploadAssetToolBtn: $("#canvasUploadAssetToolBtn"),
      canvasUploadAssetMenuBtn: $("#canvasUploadAssetMenuBtn"),
      canvasAddTextBtn: $("#canvasAddTextBtn"),
      canvasDuplicateBtn: $("#canvasDuplicateBtn"),
      canvasDeleteBtn: $("#canvasDeleteBtn"),
      canvasZoomInBtn: $("#canvasZoomInBtn"),
      canvasZoomOutBtn: $("#canvasZoomOutBtn"),
      canvasFitBtn: $("#canvasFitBtn"),
      canvasObjectToolbar: $("#canvasObjectToolbar"),
      canvasImageAiEditor: $("#canvasImageAiEditor"),
      canvasImageAiMeta: $("#canvasImageAiMeta"),
      canvasImageAiAddRefBtn: $("#canvasImageAiAddRefBtn"),
      canvasImageAiReferenceInput: $("#canvasImageAiReferenceInput"),
      canvasImageAiReferenceList: $("#canvasImageAiReferenceList"),
      canvasImageAiPrompt: $("#canvasImageAiPrompt"),
      canvasImageAiWebSearchBtn: $("#canvasImageAiWebSearchBtn"),
      canvasImageAiModelPrefsBtn: $("#canvasImageAiModelPrefsBtn"),
      canvasImageAiModelPanel: $("#canvasImageAiModelPanel"),
      canvasImageAiAutoModeToggle: $("#canvasImageAiAutoModeToggle"),
      canvasImageAiSettingsBtn: $("#canvasImageAiSettingsBtn"),
      canvasImageAiSettingsPanel: $("#canvasImageAiSettingsPanel"),
      canvasImageAiWidthInput: $("#canvasImageAiWidthInput"),
      canvasImageAiHeightInput: $("#canvasImageAiHeightInput"),
      canvasImageAiSendBtn: $("#canvasImageAiSendBtn"),
      canvasImageAiCloseBtn: $("#canvasImageAiCloseBtn"),
      canvasContextMenu: $("#canvasContextMenu"),
      canvasStatus: $("#canvasStatus"),
      canvasPerformanceToggleBtn: $("#canvasPerformanceToggleBtn"),
      canvasPerformancePanel: $("#canvasPerformancePanel"),
      canvasLayerPanel: $("#canvasLayerPanel"),
      canvasLayerPanelCloseBtn: $("#canvasLayerPanelCloseBtn"),
      canvasLayerPanelToggleBtn: $("#canvasLayerPanelToggleBtn"),
      canvasLayerHistoryToggleBtn: $("#canvasLayerHistoryToggleBtn"),
      canvasLayerHistoryBody: $("#canvasLayerHistoryBody"),
      canvasSidebarLayerList: $("#canvasSidebarLayerList"),
      canvasFrameLabels: $("#canvasFrameLabels"),
      studioPanelButtons: $$("[data-studio-panel]"),
      studioPanelViews: $$("[data-studio-panel-view]"),
      studioAiPanel: $("#studioAiPanel"),
      studioTaskBadge: $("#studioTaskBadge"),
      studioAssetBadge: $("#studioAssetBadge"),
      studioPanelScroll: $(".studio-panel-scroll"),
      studioSuggestionCards: $$(".studio-suggestion-card"),
      toast: $("#toast")
    };
    els.sidebarWorkflowPanels = $$("[data-sidebar-workflow]");

    const state = {
      clientConfig: null,
      aiDirect: {
        prompt: "",
        references: [],
        detailPlanningMaterials: [],
        turns: [],
        chatMessages: [],
        conversations: [],
        activeConversationId: "",
        conversationPage: 0,
        taskFilter: "all",
      selectedSkillId: "none",
      skillCategory: localStorage.getItem("ai_skill_category") || "ecommerce",
        outputSizeMode: localStorage.getItem("ai_output_size_mode") || "auto",
        customOutputWidth: Number(localStorage.getItem("ai_custom_output_width") || 0),
        customOutputHeight: Number(localStorage.getItem("ai_custom_output_height") || 0),
        saveTimer: null,
        loadingConversation: false,
        selectedEditImageKey: "",
        useSelectedImageAsBase: false,
        canvasFocusTarget: null,
        webSearchEnabled: false,
        pendingStatus: null,
        generationTasks: {},
        generatedImages: [],
        visibleMessageLimit: 12
      },
      account: {
        user: null,
        deviceId: "",
        ready: false
      },
      canvasBeta: {
        initialized: false,
        projectId: "",
        assets: [],
        assetPages: {
          panel: 0,
          floating: 0
        },
        activeFrameId: "",
        layerPanelOpen: false,
        layerHistoryOpen: false,
        layerListExpanded: false,
        layerRenderLimit: 160,
        spatialIndex: null,
        spatialIndexDirty: true,
        spatialCellSize: 1200,
        performance: {
          panelOpen: false,
          renderSamples: [],
          lastRenderMs: 0,
          avgRenderMs: 0,
          snapshot: null
        },
        cameraMode: true,
        cameraX: 0,
        cameraY: 0,
        zoom: 1,
        virtualWidth: 4800,
        virtualHeight: 3600,
        workspaceHome: null,
        isExtendingWorkspace: false,
        clipboardObject: null,
        pendingFocusTarget: null,
        isCapturingFocusTarget: false,
        contextMenuObjectId: "",
        imageAiEditorCollapsedForId: "",
        imageAiEditorWebSearchEnabled: false,
        imageAiEditorProvider: localStorage.getItem("canvas_image_ai_provider") || "imageservice",
        imageAiEditorImageApiProvider: "primary",
        imageAiEditorThinkingMode: "standard",
        imageAiEditorImageSize: "auto",
        imageAiEditorQuality: "auto",
        imageAiEditorOutputSizeMode: "auto",
        imageAiEditorAspectRatio: "",
        imageAiEditorImageCount: 1,
        imageAiEditorCustomOutputWidth: 0,
        imageAiEditorCustomOutputHeight: 0,
        imageAiEditorManualPosition: null,
        imageAiEditorDrag: null,
        imageAiEditorReferences: [],
        imageAiEditorReferenceObjectId: "",
        lastCanvasInsertedObjectId: "",
        lastAiInsertedObjectId: "",
        generationInsertionTailId: "",
        generationInsertionSequence: 0,
        eraseSession: null,
        activeGenerationPlaceholderId: "",
        generationPlaceholderTimers: {}
      },
      activeWorkflow: "direct",
      busy: false
    };

    window.EcommerceCanvasApp.els = els;
    window.EcommerceCanvasApp.state = state;

    const maxAiReferenceImages = 10;
    const fullAspectRatioOptions = ["1:1", "1:4", "1:8", "2:3", "3:2", "4:3", "3:4", "4:1", "4:5", "5:4", "8:1", "16:9", "9:16", "21:9"];
    const providerAspectRatioOptions = {
      imageservice: ["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16"],
      responsesimage: ["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16"]
    };
    const studioQualitySizeMap = {
      auto: "1K",
      low: "1K",
      medium: "2K",
      high: "4K"
    };
    const studioSkillCategories = [
      { id: "video", label: "Video" },
      { id: "social", label: "Social Media" },
      { id: "ecommerce", label: "E-Commerce" },
      { id: "branding", label: "Branding" }
    ];
    const studioModelPresets = {
      "imageservice:auto": { provider: "imageservice", thinking: "standard" },
      "imageservice:low": { provider: "imageservice", thinking: "off" },
      "imageservice:medium": { provider: "imageservice", thinking: "standard" },
      "imageservice:medium-deep": { provider: "imageservice", thinking: "deep" }
    };
    const generationLoadingSpriteUrl = "./assets/generation-loading-strip.svg?v=open-source-preview-1";
    const generationLoadingSpriteUrls = {
      "1:1": "./assets/generation-loading-strip.svg?v=open-source-preview-1",
      "3:2": "./assets/generation-loading-strip.svg?v=open-source-preview-1",
      "2:3": "./assets/generation-loading-strip.svg?v=open-source-preview-1",
      "4:3": "./assets/generation-loading-strip.svg?v=open-source-preview-1",
      "3:4": "./assets/generation-loading-strip.svg?v=open-source-preview-1",
      "16:9": "./assets/generation-loading-strip.svg?v=open-source-preview-1",
      "9:16": "./assets/generation-loading-strip.svg?v=open-source-preview-1"
    };
    const generationLoadingSpriteFrameCount = 8;
    const imageDimensionCache = new Map();
    const canvasWorkWidth = 2400;
    const canvasInitialWorkHeight = 3600;
    const canvasDefaultZoom = 0.35;
    const canvasExtendStep = 2400;
    const canvasExtendThreshold = 700;
    const canvasLayerSerializableProps = [
      "id",
      "name",
      "objectType",
      "frameSize",
      "frameLabel",
      "assetId",
      "srcUrl",
      "originalSrcUrl",
      "previewUrl",
      "thumbnailUrl",
      "previewWidth",
      "previewHeight",
      "naturalWidth",
      "naturalHeight",
      "aspectRatio",
      "semanticRole",
      "roleNote",
      "isProtectedLayer",
      "visible",
      "opacity",
      "lockMovementX",
      "lockMovementY",
      "lockScalingX",
      "lockScalingY",
      "lockRotation",
      "hasControls",
      "selectable",
      "evented",
      "sourceWorkflow"
    ];

    const fallbackAiSkillDefinitions = [
      {
        id: "none",
        name: "未选择",
        type: "通用",
        description: "不追加品牌或行业约束，只按当前对话需求生成。",
        prompt: ""
      },
      {
        id: "ecommerce-design-agent",
        name: "电商设计 Agent",
        type: "AI Agent",
        description: "点选后才启用电商主图规划、卖点版式和设计复盘。",
        prompt: "启用电商设计 Agent：仅当本 Agent 被选择时，才为电商主图、商品推广图、平台主图生成高转化规划、卖点区、版式建议和设计复盘。不要把汇报页、表格页或普通截图美化自动归为电商主图。"
      },
      {
        id: "hot-style-rebuild-agent",
        name: "爆款视觉重构 Agent",
        type: "AI Agent",
        description: "参考成熟图片做主图套组或详情页套组，提取方法但不照搬。",
        prompt: [
          "启用爆款视觉重构 Agent：把用户上传的成熟图片当作商业视觉参考，不要照抄品牌、Logo、原文案、价格、平台水印或版式细节。",
          "先判断每张图用途：哪些是竞品/成熟参考，哪些是用户产品、素材、背景或风格参考；必须按用户图号关系使用。",
          "提取参考图的构图逻辑、卖点层级、色彩节奏、产品展示方式、场景氛围和转化结构，再重新生成属于用户产品的新画面。",
          "如果用户要求主图整套，输出多张方向互补的主图：首图、卖点图、场景图、对比图、活动图等。",
          "如果用户要求详情页，按分屏详情页思路生成：首屏利益点、痛点、卖点、场景、参数、对比、背书、转化收口。",
          "最终画面要像专业电商设计成品，干净、有层级、有商业转化感，不能像简单拼贴或模板套壳。"
        ].join("\n")
      },
      {
        id: "main-image-matrix-agent",
        name: "主图设计 Agent",
        type: "AI Agent",
        description: "一次生成一套电商主图，覆盖首图、卖点、场景、对比和活动方向。",
        allowCanvasImageEdit: false,
        prompt: [
          "启用主图矩阵 Agent：本任务不是单张随意生图，而是按电商主图套组思路生成。",
          "根据用户产品和卖点，把结果规划成互补的主图方向：首图负责第一眼点击，卖点图负责解释价值，场景图负责使用代入，对比图负责建立理由，活动图负责促销转化。",
          "每张图都要保持同一产品身份、同一品牌气质和统一视觉系统，但构图与信息重点要有差异。",
          "优先保证产品主体清晰、完整、不变形；卖点表达要短、准、适合平台主图。",
          "如果用户上传多张图，必须先识别产品图、参考风格图、场景图和素材图的角色，再生成。"
        ].join("\n")
      },
      {
        id: "detail-page-planner-agent",
        name: "详情页策划 Agent",
        type: "AI Agent",
        description: "先规划详情页结构，再生成多屏详情页图片并合成长图。",
        allowCanvasImageEdit: false,
        prompt: [
          "启用详情页策划 Agent：按电商详情页设计流程工作，默认生成多张分屏详情页，而不是一张随意长图。",
          "先把用户产品和卖点拆成详情页结构：首屏利益点、痛点引入、核心卖点、材质/工艺、使用场景、参数说明、对比证明、信任背书、购买理由。",
          "每张输出图只负责一个清晰模块，保持统一视觉系统、统一色彩、统一字体气质和统一产品身份。",
          "如果用户没有指定屏数，先根据商品信息和卖点自动决定 4-32 屏；最多 32 屏，每 8 屏一组排队生成，不能让用户手动选屏数。",
          "如果用户明确说只做首屏、单屏或某一屏，则只生成对应模块。",
          "文字要短、清晰、可读，不要生成密密麻麻的小字；图表和参数要简洁，避免乱码。",
          "用户上传的 Excel/CSV 只作为商品参数、卖点和详情页结构资料；线框图用于结构编排，案例图用于风格和方法参考，不照抄原文案与品牌。",
          "最终应该适合自动纵向合成长图，同时保留每一屏单图方便单独修改。"
        ].join("\n")
      },
      {
        id: "scene-seeding-agent",
        name: "场景种草 Agent",
        type: "AI Agent",
        description: "把产品放进模特、生活方式、空间和平台电商场景。",
        prompt: [
          "启用场景种草 Agent：根据产品属性生成模特、空间、生活方式或电商场景图。",
          "必须保持产品主体外观、比例、材质和关键结构稳定，不要把产品改成另一个商品。",
          "场景可以自由发挥，但要服务用户卖点：专业产品强调可信，服饰/护具强调穿戴效果，日用品强调生活代入，电商产品强调点击和购买欲。",
          "画面要自然、有真实光影和商业质感，不要像廉价棚拍拼贴；如有模特，姿势和产品使用关系要合理。"
        ].join("\n")
      },
      {
        id: "campaign-poster-agent",
        name: "活动海报 Agent",
        type: "AI Agent",
        description: "生成促销、上新、直播、节日、清仓等活动视觉。",
        prompt: [
          "启用活动海报 Agent：围绕促销、节日、直播、上新、清仓、福利等活动生成商业海报或平台活动图。",
          "优先建立清晰层级：活动主标题、核心利益点、产品展示区、辅助卖点、氛围背景和行动暗示。",
          "风格可以更有冲击力，但不能杂乱；文字数量要可控，促销信息要醒目且不要凭空编造价格或权益。",
          "如果用户提供产品图，产品必须清晰完整，不能被背景或装饰抢走主体。"
        ].join("\n")
      },
      {
        id: "content-cover-agent",
        name: "内容平台封面 Agent",
        type: "社媒 Agent",
        description: "生成大字封面、测评封面、种草封面和干货封面。",
        prompt: [
          "启用内容平台封面 Agent：生成适合内容平台的大字封面、测评封面、种草封面、干货封面或避坑封面。",
          "封面要第一眼明确主题，有强标题、有情绪点、有对比感；标题短而大，不要堆小字。",
          "可以根据产品或内容主题生成真实使用场景、局部特写、对比画面或人物情绪，但不能虚假夸大功效。",
          "如果用户上传参考封面，只学习标题层级、信息密度、色彩氛围和构图，不复制原品牌、原文案或水印。"
        ].join("\n")
      },
      {
        id: "brand-style-extension-agent",
        name: "品牌风格延展 Agent",
        type: "品牌 Agent",
        description: "从已有品牌图提取视觉气质，继续生成同风格新图。",
        prompt: [
          "启用品牌风格延展 Agent：从用户上传的品牌图中提取色彩、留白、字体气质、版式节奏、图标语言、产品拍摄方式和整体高级感。",
          "不要固定死模板，也不要照搬原图文字；要把品牌气质延展到新的画面需求里。",
          "如果有多张参考图，优先统一为同一套视觉系统，避免每张图风格漂移。",
          "适合品牌海报、主图系列、详情页分屏、活动图和内容封面。"
        ].join("\n")
      },
      {
        id: "white-bg-product",
        name: "白底商品图规范",
        type: "图片用途",
        description: "商品主体完整，干净白底或浅灰棚拍，方便后续构图和抠图。",
        prompt: "遵循白底商品图规范：商品主体完整、边缘清晰、白底或浅灰棚拍、方便后续构图，不要裁切主体，不要生成文字。"
      }
    ];

    const aiProviders = {
      primaryimage: {
        label: "图片服务 A",
        defaultTextModel: ""
      },
      imageservice: {
        label: "图片服务",
        defaultTextModel: "后台统一配置"
      },
      responsesimage: {
        label: "Responses 出图 Beta",
        defaultTextModel: ""
      }
    };

    const thinkingModeHints = [
      {
        id: "standard",
        label: "标准思考：",
        text: "先理解需求和图片关系，再整理成更自然的生图提示词。适合日常主图、场景图和多轮修改。"
      },
      {
        id: "deep",
        label: "深度思考：",
        text: "调用深度思考模型；普通多参考图会同时整理用户明确说明的图片关系，未明确的图片继续作为普通参考。Agent 和图片续改保持各自链路。"
      },
      {
        id: "off",
        label: "关闭思考：",
        text: "直接把你的原话交给图片服务，速度最快，也最接近服务默认能力。"
      }
    ];

    return {
      els,
      state,
      maxAiReferenceImages,
      fullAspectRatioOptions,
      providerAspectRatioOptions,
      studioQualitySizeMap,
      studioSkillCategories,
      studioModelPresets,
      generationLoadingSpriteUrl,
      generationLoadingSpriteUrls,
      generationLoadingSpriteFrameCount,
      imageDimensionCache,
      canvasWorkWidth,
      canvasInitialWorkHeight,
      canvasDefaultZoom,
      canvasExtendStep,
      canvasExtendThreshold,
      canvasLayerSerializableProps,
      fallbackAiSkillDefinitions,
      aiProviders,
      thinkingModeHints
    };
  };
})();
