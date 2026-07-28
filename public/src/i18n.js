(function () {
  const app = window.EcommerceCanvasApp = window.EcommerceCanvasApp || {};
  const locales = [
    ["en", "English"],
    ["zh-CN", "简体中文"],
    ["ja", "日本語"],
    ["ko", "한국어"],
    ["es", "Español"],
    ["pt-BR", "Português"],
    ["fr", "Français"],
    ["de", "Deutsch"],
    ["ru", "Русский"],
    ["ar", "العربية"]
  ];
  const en = {
    language: "Language",
    productName: "AI Creative Canvas",
    productTagline: "Image / Canvas / Assets",
    accountAuth: "Account",
    notLoggedIn: "Not signed in",
    login: "Sign in",
    loginAfter: "Usage is recorded after sign-in",
    aiImage: "AI images",
    aiCopy: "AI copy",
    workspace: "Workspace",
    status: "Status",
    localRun: "Local runtime",
    projectBar: "Project",
    unsavedProject: "Unsaved project",
    autoSaved: "Auto-saved",
    new: "New",
    save: "Save",
    layers: "Layers",
    close: "Close",
    history: "History",
    noHistory: "No history yet",
    noLayers: "No layers yet",
    canvasTools: "Canvas tools",
    select: "Select",
    pan: "Pan canvas",
    add: "Add",
    uploadImage: "Upload image",
    mainImageBoard: "Main image board",
    poster: "Vertical poster",
    detailLongImage: "Long detail page",
    shape: "Shape",
    shapeText: "Shape text",
    text: "Text",
    brush: "Brush",
    pencil: "Pencil",
    pen: "Pen",
    copy: "Copy",
    copySelected: "Copy selected element",
    delete: "Delete",
    removeBackground: "Remove background",
    fineCutout: "Fine cutout",
    erase: "Erase",
    expand: "Expand",
    download: "Download",
    continueImage: "Continue image",
    assets: "Assets",
    uploadAssets: "Upload assets",
    tasks: "Tasks",
    sizeQuality: "Size and quality",
    quality: "Quality",
    ratio: "Ratio",
    count: "Count",
    preferences: "Preferences",
    auto: "Auto",
    generationConfig: "Generation settings",
    creativeInstruction: "Creative instruction",
    adminConsole: "Admin console",
    adminSummary: "Sign in to view workspace status.",
    employee: "Employee workspace",
    refresh: "Refresh",
    logout: "Sign out",
    overview: "Overview",
    operations: "Operations",
    accounts: "Accounts",
    authorization: "Authorization",
    usage: "Usage",
    statistics: "Statistics",
    feedback: "Feedback",
    issues: "Issues",
    models: "Models",
    health: "Health",
    system: "System",
    intranet: "Private network",
    adminLogin: "Admin sign in",
    username: "Username",
    password: "Password",
    confirmPassword: "Confirm password",
    adminSetup: "Set up administrator",
    adminLoginProgress: "Signing in...",
    adminSetupProgress: "Setting up...",
    confirm: "Confirm", taskFailed: "Task failed", generationFailed: "Generation failed", workspaceLogin: "Sign in to workspace",
    employeeUsername: "Enter employee username", employeePassword: "Enter employee password", rememberMe: "Remember me",
    changePassword: "Change password", forgotPassword: "Forgot password", releaseNotice: "Release notice", openSourcePreview: "Open-source preview",
    acknowledge: "I have read and acknowledge", currentPassword: "Current password", newPassword: "New password", saveNewPassword: "Save new password",
    application: "Applications", currentState: "Current status", canvasZoom: "Canvas zoom", fitCanvas: "Fit current board",
    canvasPerformance: "Canvas performance", performance: "Performance", infiniteCanvas: "Infinite Canvas BETA 1.0",
    canvasQuickAssets: "Quick canvas assets", drag: "Drag", noAssets: "None", aiDesignerPanel: "AI designer panel",
    create: "Create", modelStatus: "Model status", imageGenerationModel: "Image generation model",
    imageGenerationUseCases: "Product images, detail pages, campaign posters", online: "Online", unconfigured: "Not configured",
    modelReadyTitle: "An image generation service is configured", modelMissingTitle: "Configure an image generation API key in the admin console",
    quickGenerate: "Quick generation", ecommerceMainImage: "Product image", productClear: "Clear product focus",
    detailHero: "Detail-page hero", titleSellingPoints: "Title and selling points", campaignPoster: "Campaign poster",
    brandVisual: "Brand visual", waitingGeneration: "Ready to generate", resultsAppear: "Results will appear here",
    noGenerationTasks: "No generation tasks yet", signInForTasks: "Sign in to view generation tasks",
    importAssetsHint: "Imported assets will appear here", output: "Output", model: "Model",
    closeConfiguration: "Close settings", configCategories: "Generation setting categories", imageQuality: "Image quality",
    generationRatio: "Generation ratio", generationCount: "Generation count",
    autoSizeNote: "Auto: use the source dimensions when a reference exists; otherwise use the current board ratio.",
    autoEditSizeNote: "Auto: preserve the selected image ratio and safely reduce oversized images; custom dimensions affect this edit only.",
    imageCountFormat: "{count} images", autoLayout: "Auto layout", imageService: "Image service", autoRoute: "Auto route",
    uploadAttachment: "Upload attachments or assets", webSearch: "Web search", modelPreferences: "Model preferences",
    send: "Send", promptDescription: "Describe the image or upload references", uploadReference: "Add reference image",
    generateBeside: "Generate beside the selected image", beside: "Beside", paste: "Paste", fast: "Fast",
    moreAccurate: "More accurate", aiContinue: "Continue with AI", imageOne: "Image 1", createGroup: "Create group",
    toggleVisibility: "Show / hide", toggleLock: "Lock / unlock", closeAiEdit: "Collapse AI editor",
    addReference: "Add reference image", userModels: "My models", localOnly: "Saved in this browser only",
    currentImageModel: "Current image model", backendDefaultModel: "Admin default model", modelList: "Model list",
    modelListPlaceholder: "One model name per line, for example:\nmodel-a\nmodel-b", saveMyModels: "Save my models",
    resetBackendDefault: "Use admin default", userModelDefaultStatus: "No user model configured; using the admin default.",
    userModelCurrentStatus: "Using: {model} (saved locally)", imageGenerationOnly: "Only for new image generation",
    noSelectedImage: "No image selected", newImageOnly: "The right panel only creates new assets; select a canvas image to edit it.",
    thinkingStandardLabel: "Standard thinking: ", thinkingStandardText: "Understand the request and image relationships, then prepare a natural generation prompt.",
    thinkingDeepLabel: "Deep thinking: ", thinkingDeepText: "Use the reasoning model to organize complex references and explicit image relationships.",
    thinkingOffLabel: "Thinking off: ", thinkingOffText: "Send the original request directly to the image service for the fastest path.",
    noSkill: "No executable Skill is available in this category.", currentProjectImageChain: "Image generation is currently supported.",
    currentProjectEditChain: "Image editing is currently supported.", skillTypeGeneral: "General", skillTypeAgent: "AI Agent",
    skillTypeSocial: "Social Agent", skillTypeBrand: "Brand Agent", skillTypePlatform: "Platform guideline",
    skillTypeImageUse: "Image purpose", skillNoneName: "Not selected",
    skillNoneDescription: "Use only the current request without adding brand or industry constraints.",
    skillEcommerceName: "E-commerce Design Agent", skillEcommerceDescription: "Plans product-image layouts, selling points, and a design review when selected.",
    skillRebuildName: "High-performing Visual Rebuild Agent", skillRebuildDescription: "Extracts methods from mature references without copying their brand or layout.",
    skillMainImageName: "Product Image Agent", skillMainImageDescription: "Creates a coordinated set covering hero, selling point, scene, comparison, and campaign directions.",
    skillDetailName: "Detail-page Planning Agent", skillDetailDescription: "Plans the page structure, generates multiple screens, and merges a long image.",
    skillSceneName: "Lifestyle Scene Agent", skillSceneDescription: "Places the product in people, lifestyle, space, and marketplace scenes.",
    skillCampaignName: "Campaign Poster Agent", skillCampaignDescription: "Creates promotional, launch, livestream, holiday, and clearance visuals.",
    skillContentCoverName: "Social Cover Agent", skillContentCoverDescription: "Creates review, recommendation, educational, and bold-title covers.",
    skillBrandName: "Brand Style Extension Agent", skillBrandDescription: "Extends the visual character of existing brand references into new images.",

    skillWhiteName: "White-background Product Guideline", skillWhiteDescription: "Keeps the complete product on a clean white or light-gray studio background.",
    detailPromptPlaceholder: "Upload the new product identity image and optional layout references, then describe the complete detail page.",
    planningUpload: "Upload product images, layout references, or Excel/CSV data",
    detailLayout: "Detail-page layout", currentTaskOnly: "Current task only",
    detailLayoutDescription: "Arrange grids, whitespace, and module rhythm from the current product materials and references.",
    failureHelp: "Check the prompt, image dimensions, or model configuration and try again.",
    releaseIntro: "This open-source preview includes:", releaseFeature1: "E-commerce image generation, reference understanding, and iterative editing.",
    releaseFeature2: "Infinite canvas, asset management, and basic layer inspection.",
    releaseFeature3: "Configure your own model service and account system before public deployment.",
    releaseSecurity: "Never commit keys, account databases, user assets, or generated results to a public repository.",
    currentPasswordPlaceholder: "Enter current password", passwordMinLength: "At least 6 characters", repeatNewPassword: "Enter the new password again",
    workspaceSummary: "AI Creative Canvas: {references} reference images and {images} AI assets.",
    sourceDimensions: "Source dimensions", lowQuality: "Low", standard: "Standard", deep: "Deep",
    editInstruction: "Describe the requested edit", selectOption: "Select",
    webSearchDisabled: "Web search is unavailable when thinking is off",
    webSearchEnabled: "Web search is enabled for this request", webSearchDisabledToast: "Web search is disabled for this request",
    savedUserModels: "Saved {count} user models.", clearedUserModels: "Cleared user models and restored the admin default.",
    resetUserModels: "Restored the admin default model.",
    taskFilters: "Task status filters", all: "All", running: "Running", attention: "Needs attention",
    completed: "Completed", failed: "Failed", partial: "Partially completed", draft: "Not started",
    newConversation: "New conversation", noContent: "No content", aiGeneration: "AI image generation",
    imagesShort: "{count} images", failedShort: "{count} failed", noTasksInFilter: "No tasks in this category",
    previousPage: "Previous", nextPage: "Next", deleteConversation: "Delete conversation", deleteAsset: "Delete asset",
    unnamedProject: "Untitled project", projectNameFormat: "AI Creative Canvas-{timestamp}",
    signedIn: "Signed in", unlimited: "Unlimited", systemAdministrator: "System administrator",
    adminPlan: "Admin", basicPlan: "Basic", systemNotice: "System notice", systemMaintenance: "System maintenance",
    productLogin: "Sign in to AI Creative Canvas", expires: "Expires", modelType: "Model type"
  };
  const dictionaries = {
    en,
    "zh-CN": {
      ...en,
      language: "语言", productName: "AI 创作画布", productTagline: "生图 / 画布 / 素材", accountAuth: "账户授权",
      notLoggedIn: "未登录", login: "请登录", loginAfter: "登录后记录使用次数", aiImage: "AI 生图", aiCopy: "AI 文案",
      workspace: "工作区", status: "状态", localRun: "本地运行", projectBar: "项目栏", unsavedProject: "未保存项目",
      autoSaved: "已自动保存", new: "新建", save: "保存", layers: "图层", close: "关闭", history: "历史记录",
      noHistory: "暂无历史记录", noLayers: "暂无图层", canvasTools: "画布工具", select: "选择", pan: "平移画布",
      add: "新增", uploadImage: "上传图片", mainImageBoard: "主图画板", poster: "竖版海报", detailLongImage: "详情长图",
      shape: "形状", shapeText: "形状文本", text: "文字", brush: "画笔", pencil: "铅笔", pen: "钢笔", copy: "复制",
      copySelected: "复制选中元素", delete: "删除", removeBackground: "移除背景", fineCutout: "精细抠图", erase: "擦除",
      expand: "扩展", download: "下载", continueImage: "续改图片", assets: "素材", uploadAssets: "上传素材", tasks: "生成任务", sizeQuality: "尺寸和质量", quality: "清晰度",
      ratio: "比例", count: "张数", preferences: "偏好", auto: "自动", generationConfig: "生成配置", creativeInstruction: "创作指令",
      adminConsole: "管理员中控", adminSummary: "登录后查看工作区状态。", employee: "员工端", refresh: "刷新", logout: "退出",
      overview: "总览", operations: "运营", accounts: "账户", authorization: "授权", usage: "用量", statistics: "统计",
      feedback: "反馈", issues: "问题", models: "模型", health: "体检", system: "系统", intranet: "内网", adminLogin: "登录管理员中控",
      username: "账号", password: "密码", confirmPassword: "确认密码", adminSetup: "初始化中控台管理员", adminLoginProgress: "登录中...", adminSetupProgress: "初始化中...",
      confirm: "确认", taskFailed: "任务失败", generationFailed: "生成失败", workspaceLogin: "登录工作区", employeeUsername: "请输入员工账号", employeePassword: "请输入密码",
      rememberMe: "记住登录状态", changePassword: "修改密码", forgotPassword: "忘记密码", releaseNotice: "版本更新", openSourcePreview: "开源预览版说明", acknowledge: "我已阅读并确认",
      currentPassword: "当前密码", newPassword: "新密码", saveNewPassword: "保存新密码",
      application: "应用", currentState: "当前状态", canvasZoom: "画布缩放", fitCanvas: "适配当前画板",
      canvasPerformance: "画布性能", performance: "性能", infiniteCanvas: "无限画布 BETA 1.0",
      canvasQuickAssets: "画布快捷素材", drag: "拖拽", noAssets: "暂无", aiDesignerPanel: "AI 设计师面板",
      create: "创作", modelStatus: "模型状态", imageGenerationModel: "图像生成模型",
      imageGenerationUseCases: "电商主图、详情页、活动海报", online: "在线", unconfigured: "未配置",
      modelReadyTitle: "已配置可用的图像生成服务", modelMissingTitle: "请先在管理后台配置图像生成 API Key",
      quickGenerate: "快捷生成", ecommerceMainImage: "电商主图", productClear: "产品清晰",
      detailHero: "详情首屏", titleSellingPoints: "标题卖点区", campaignPoster: "活动海报", brandVisual: "品牌视觉",
      waitingGeneration: "等待生成", resultsAppear: "结果会显示在这里", noGenerationTasks: "还没有生成任务",
      signInForTasks: "登录后显示生成任务", importAssetsHint: "导入素材后显示在这里", output: "输出", model: "模型",
      closeConfiguration: "关闭配置", configCategories: "生成配置分类", imageQuality: "图片质量",
      generationRatio: "生成比例", generationCount: "生成张数",
      autoSizeNote: "自动：有参考图按原图尺寸，无参考图按当前画板比例。",
      autoEditSizeNote: "自动：按当前选中图比例续改，超大图会安全降尺寸；自定义后只影响画布续改。",
      imageCountFormat: "{count} 张", autoLayout: "自动编排", imageService: "图片服务", autoRoute: "自动线路",
      uploadAttachment: "上传附件/素材", webSearch: "联网搜索", modelPreferences: "模型偏好", send: "发送",
      promptDescription: "描述画面，或上传参考图", uploadReference: "添加参考图", generateBeside: "生成到当前图旁边",
      beside: "到旁边", paste: "粘贴", fast: "快速", moreAccurate: "更准", aiContinue: "AI 续改",
      imageOne: "图1", createGroup: "创建编组", toggleVisibility: "显示/隐藏", toggleLock: "锁定/解锁",
      closeAiEdit: "收起 AI 修改", addReference: "添加参考图", userModels: "我的模型", localOnly: "只保存在当前浏览器",
      currentImageModel: "当前生图模型", backendDefaultModel: "后台默认模型", modelList: "模型列表",
      modelListPlaceholder: "每行一个模型名，例如：\nmodel-a\nmodel-b", saveMyModels: "保存我的模型",
      resetBackendDefault: "恢复后台默认", userModelDefaultStatus: "未配置用户模型，当前使用后台默认。",
      userModelCurrentStatus: "当前使用：{model}（仅本机保存）", imageGenerationOnly: "仅用于新图生成",
      noSelectedImage: "未选中图片", newImageOnly: "右侧只生成新素材；修改画布图片请直接选中图片",
      thinkingStandardLabel: "标准思考：", thinkingStandardText: "先理解需求和图片关系，再整理成更自然的生图提示词。",
      thinkingDeepLabel: "深度思考：", thinkingDeepText: "调用深度思考模型，整理复杂参考图和明确的图片关系。",
      thinkingOffLabel: "关闭思考：", thinkingOffText: "直接把原话交给图片服务，速度最快。",
      noSkill: "当前项目没有可执行的对应 Skill。", currentProjectImageChain: "当前项目先接图片生成链路。",
      currentProjectEditChain: "当前项目先接图片续改链路。", skillTypeGeneral: "通用", skillTypeAgent: "AI Agent",
      skillTypeSocial: "社媒 Agent", skillTypeBrand: "品牌 Agent", skillTypePlatform: "平台规范", skillTypeImageUse: "图片用途",
      skillNoneName: "未选择", skillNoneDescription: "不追加品牌或行业约束，只按当前对话需求生成。",
      skillEcommerceName: "电商设计 Agent", skillEcommerceDescription: "点选后才启用电商主图规划、卖点版式和设计复盘。",
      skillRebuildName: "爆款视觉重构 Agent", skillRebuildDescription: "参考成熟图片做主图套组或详情页套组，提取方法但不照搬。",
      skillMainImageName: "主图设计 Agent", skillMainImageDescription: "一次生成一套电商主图，覆盖首图、卖点、场景、对比和活动方向。",
      skillDetailName: "详情页策划 Agent", skillDetailDescription: "先规划详情页结构，再生成多屏详情页图片并合成长图。",
      skillSceneName: "场景种草 Agent", skillSceneDescription: "把产品放进模特、生活方式、空间和平台电商场景。",
      skillCampaignName: "活动海报 Agent", skillCampaignDescription: "生成促销、上新、直播、节日、清仓等活动视觉。",
      skillContentCoverName: "内容平台封面 Agent", skillContentCoverDescription: "生成大字封面、测评封面、种草封面和干货封面。",
      skillBrandName: "品牌风格延展 Agent", skillBrandDescription: "从已有品牌图提取视觉气质，继续生成同风格新图。",

      skillWhiteName: "白底商品图规范", skillWhiteDescription: "商品主体完整，白底或浅灰棚拍，方便后续构图和抠图。",
      detailPromptPlaceholder: "上传新产品身份图和可选版式参考，再描述完整详情页要求。",
      planningUpload: "上传产品图、线框/案例图或 Excel/CSV 资料", detailLayout: "详情页版式",
      currentTaskOnly: "仅影响本次详情页", detailLayoutDescription: "根据本轮产品图、资料和案例自主编排网格、留白与模块节奏。",
      failureHelp: "请检查提示词、图片尺寸或后台模型配置后重试。",
      releaseIntro: "此开源预览版包含以下功能：", releaseFeature1: "提供电商图片生成、参考图理解和连续修改能力。",
      releaseFeature2: "提供无限画布、素材管理和基础图层查看。", releaseFeature3: "公开发布前请自行配置模型服务与账户系统。",
      releaseSecurity: "请勿在公开仓库中提交密钥、账号数据库、用户素材或生成结果。",
      currentPasswordPlaceholder: "请输入当前密码", passwordMinLength: "至少 6 位", repeatNewPassword: "再次输入新密码",
      workspaceSummary: "AI 创作画布：{references} 张参考图，{images} 张 AI 素材。",
      sourceDimensions: "原图尺寸", lowQuality: "低清", standard: "标准", deep: "深度",
      editInstruction: "描述修改要求", selectOption: "请选择",
      webSearchDisabled: "关闭思考时不能联网搜索", webSearchEnabled: "本轮已开启联网搜索",
      webSearchDisabledToast: "本轮已关闭联网搜索", savedUserModels: "已保存 {count} 个用户模型。",
      clearedUserModels: "已清空用户模型，恢复后台默认。", resetUserModels: "已恢复后台默认模型。",
      taskFilters: "任务状态筛选", all: "全部", running: "进行中", attention: "有异常",
      completed: "已完成", failed: "失败", partial: "部分完成", draft: "待开始",
      newConversation: "新建对话", noContent: "暂无内容", aiGeneration: "AI 生图",
      imagesShort: "{count} 张图", failedShort: "{count} 失败", noTasksInFilter: "这个分类暂时没有任务",
      previousPage: "上一页", nextPage: "下一页", deleteConversation: "删除对话", deleteAsset: "删除素材",
      unnamedProject: "未命名项目", projectNameFormat: "AI 创作画布项目-{timestamp}",
      signedIn: "已登录", unlimited: "不限", systemAdministrator: "系统管理员", adminPlan: "中控管理员",
      basicPlan: "基础版", systemNotice: "系统通知", systemMaintenance: "系统维护中", productLogin: "登录 AI 创作画布",
      expires: "到期", modelType: "模型类型"
    },
    ja: { ...en, language: "言語", productName: "AI Creative Canvas", productTagline: "画像 / キャンバス / アセット", accountAuth: "アカウント", notLoggedIn: "未ログイン", login: "ログイン", workspace: "ワークスペース", status: "状態", localRun: "ローカル実行", new: "新規", save: "保存", layers: "レイヤー", close: "閉じる", history: "履歴", noHistory: "履歴はありません", noLayers: "レイヤーはありません", select: "選択", pan: "キャンバスを移動", add: "追加", uploadImage: "画像をアップロード", shape: "図形", text: "テキスト", brush: "ブラシ", copy: "コピー", delete: "削除", download: "ダウンロード", continueImage: "画像を続けて編集", sizeQuality: "サイズと品質", quality: "品質", ratio: "比率", count: "枚数", preferences: "設定", auto: "自動", generationConfig: "生成設定", creativeInstruction: "制作指示", adminConsole: "管理コンソール", adminSummary: "ログインして状態を確認", employee: "従業員画面", refresh: "更新", logout: "ログアウト", overview: "概要", accounts: "アカウント", usage: "使用量", feedback: "フィードバック", models: "モデル", health: "診断", system: "システム", adminLogin: "管理者ログイン", username: "ユーザー名", password: "パスワード", confirmPassword: "パスワード確認", adminSetup: "管理者を設定" },
    ko: { ...en, language: "언어", productName: "AI Creative Canvas", productTagline: "이미지 / 캔버스 / 에셋", accountAuth: "계정", notLoggedIn: "로그인되지 않음", login: "로그인", workspace: "작업 공간", status: "상태", localRun: "로컬 실행", new: "새로 만들기", save: "저장", layers: "레이어", close: "닫기", history: "기록", noHistory: "기록 없음", noLayers: "레이어 없음", select: "선택", pan: "캔버스 이동", add: "추가", uploadImage: "이미지 업로드", shape: "도형", text: "텍스트", brush: "브러시", copy: "복사", delete: "삭제", download: "다운로드", continueImage: "이미지 이어서 편집", sizeQuality: "크기 및 품질", quality: "품질", ratio: "비율", count: "개수", preferences: "환경설정", auto: "자동", generationConfig: "생성 설정", creativeInstruction: "제작 지시", adminConsole: "관리자 콘솔", adminSummary: "로그인하여 상태를 확인하세요.", employee: "직원 화면", refresh: "새로 고침", logout: "로그아웃", overview: "개요", accounts: "계정", usage: "사용량", feedback: "피드백", models: "모델", health: "진단", system: "시스템", adminLogin: "관리자 로그인", username: "사용자 이름", password: "비밀번호", confirmPassword: "비밀번호 확인", adminSetup: "관리자 설정" },
    es: { ...en, language: "Idioma", productName: "AI Creative Canvas", productTagline: "Imagen / Canvas / Recursos", accountAuth: "Cuenta", notLoggedIn: "Sin iniciar sesión", login: "Iniciar sesión", workspace: "Espacio de trabajo", status: "Estado", localRun: "Ejecución local", new: "Nuevo", save: "Guardar", layers: "Capas", close: "Cerrar", history: "Historial", noHistory: "Sin historial", noLayers: "Sin capas", select: "Seleccionar", pan: "Mover canvas", add: "Añadir", uploadImage: "Subir imagen", shape: "Forma", text: "Texto", brush: "Pincel", copy: "Copiar", delete: "Eliminar", download: "Descargar", continueImage: "Continuar imagen", sizeQuality: "Tamaño y calidad", quality: "Calidad", ratio: "Proporción", count: "Cantidad", preferences: "Preferencias", auto: "Automático", generationConfig: "Configuración de generación", creativeInstruction: "Instrucción creativa", adminConsole: "Consola de administración", adminSummary: "Inicia sesión para ver el estado.", employee: "Espacio de trabajo", refresh: "Actualizar", logout: "Cerrar sesión", overview: "Resumen", accounts: "Cuentas", usage: "Uso", feedback: "Comentarios", models: "Modelos", health: "Diagnóstico", system: "Sistema", adminLogin: "Acceso de administrador", username: "Usuario", password: "Contraseña", confirmPassword: "Confirmar contraseña", adminSetup: "Configurar administrador" },
    "pt-BR": { ...en, language: "Idioma", productName: "AI Creative Canvas", productTagline: "Imagem / Canvas / Ativos", accountAuth: "Conta", notLoggedIn: "Não conectado", login: "Entrar", workspace: "Área de trabalho", status: "Status", localRun: "Execução local", new: "Novo", save: "Salvar", layers: "Camadas", close: "Fechar", history: "Histórico", noHistory: "Sem histórico", noLayers: "Sem camadas", select: "Selecionar", pan: "Mover canvas", add: "Adicionar", uploadImage: "Enviar imagem", shape: "Forma", text: "Texto", brush: "Pincel", copy: "Copiar", delete: "Excluir", download: "Baixar", continueImage: "Continuar imagem", sizeQuality: "Tamanho e qualidade", quality: "Qualidade", ratio: "Proporção", count: "Quantidade", preferences: "Preferências", auto: "Automático", generationConfig: "Configuração de geração", creativeInstruction: "Instrução criativa", adminConsole: "Console administrativo", adminSummary: "Entre para ver o status.", employee: "Área do funcionário", refresh: "Atualizar", logout: "Sair", overview: "Visão geral", accounts: "Contas", usage: "Uso", feedback: "Feedback", models: "Modelos", health: "Diagnóstico", system: "Sistema", adminLogin: "Login do administrador", username: "Usuário", password: "Senha", confirmPassword: "Confirmar senha", adminSetup: "Configurar administrador" },
    fr: { ...en, language: "Langue", productName: "AI Creative Canvas", productTagline: "Image / Canevas / Actifs", accountAuth: "Compte", notLoggedIn: "Non connecté", login: "Se connecter", workspace: "Espace de travail", status: "État", localRun: "Exécution locale", new: "Nouveau", save: "Enregistrer", layers: "Calques", close: "Fermer", history: "Historique", noHistory: "Aucun historique", noLayers: "Aucun calque", select: "Sélectionner", pan: "Déplacer le canevas", add: "Ajouter", uploadImage: "Importer une image", shape: "Forme", text: "Texte", brush: "Pinceau", copy: "Copier", delete: "Supprimer", download: "Télécharger", continueImage: "Continuer l’image", sizeQuality: "Taille et qualité", quality: "Qualité", ratio: "Proportion", count: "Nombre", preferences: "Préférences", auto: "Automatique", generationConfig: "Paramètres de génération", creativeInstruction: "Instruction créative", adminConsole: "Console d’administration", adminSummary: "Connectez-vous pour voir l’état.", employee: "Espace employé", refresh: "Actualiser", logout: "Se déconnecter", overview: "Vue d’ensemble", accounts: "Comptes", usage: "Utilisation", feedback: "Retours", models: "Modèles", health: "Diagnostic", system: "Système", adminLogin: "Connexion administrateur", username: "Nom d’utilisateur", password: "Mot de passe", confirmPassword: "Confirmer le mot de passe", adminSetup: "Configurer l’administrateur" },
    de: { ...en, language: "Sprache", productName: "AI Creative Canvas", productTagline: "Bild / Canvas / Assets", accountAuth: "Konto", notLoggedIn: "Nicht angemeldet", login: "Anmelden", workspace: "Arbeitsbereich", status: "Status", localRun: "Lokaler Betrieb", new: "Neu", save: "Speichern", layers: "Ebenen", close: "Schließen", history: "Verlauf", noHistory: "Noch kein Verlauf", noLayers: "Keine Ebenen", select: "Auswählen", pan: "Canvas verschieben", add: "Hinzufügen", uploadImage: "Bild hochladen", shape: "Form", text: "Text", brush: "Pinsel", copy: "Kopieren", delete: "Löschen", download: "Herunterladen", continueImage: "Bild fortsetzen", sizeQuality: "Größe und Qualität", quality: "Qualität", ratio: "Seitenverhältnis", count: "Anzahl", preferences: "Einstellungen", auto: "Automatisch", generationConfig: "Generierungseinstellungen", creativeInstruction: "Kreative Anweisung", adminConsole: "Administrationskonsole", adminSummary: "Anmelden, um den Status zu sehen.", employee: "Arbeitsbereich", refresh: "Aktualisieren", logout: "Abmelden", overview: "Übersicht", accounts: "Konten", usage: "Nutzung", feedback: "Feedback", models: "Modelle", health: "Diagnose", system: "System", adminLogin: "Administrator-Anmeldung", username: "Benutzername", password: "Passwort", confirmPassword: "Passwort bestätigen", adminSetup: "Administrator einrichten" },
    ru: { ...en, language: "Язык", productName: "AI Creative Canvas", productTagline: "Изображения / Холст / Материалы", accountAuth: "Аккаунт", notLoggedIn: "Не выполнен вход", login: "Войти", workspace: "Рабочее пространство", status: "Статус", localRun: "Локальный режим", new: "Создать", save: "Сохранить", layers: "Слои", close: "Закрыть", history: "История", noHistory: "Истории пока нет", noLayers: "Слоёв пока нет", select: "Выбрать", pan: "Переместить холст", add: "Добавить", uploadImage: "Загрузить изображение", shape: "Фигура", text: "Текст", brush: "Кисть", copy: "Копировать", delete: "Удалить", download: "Скачать", continueImage: "Продолжить изображение", sizeQuality: "Размер и качество", quality: "Качество", ratio: "Соотношение", count: "Количество", preferences: "Параметры", auto: "Авто", generationConfig: "Параметры генерации", creativeInstruction: "Творческая инструкция", adminConsole: "Панель администратора", adminSummary: "Войдите, чтобы увидеть состояние.", employee: "Рабочее пространство", refresh: "Обновить", logout: "Выйти", overview: "Обзор", accounts: "Аккаунты", usage: "Использование", feedback: "Отзывы", models: "Модели", health: "Диагностика", system: "Система", adminLogin: "Вход администратора", username: "Имя пользователя", password: "Пароль", confirmPassword: "Подтвердите пароль", adminSetup: "Настройка администратора" },
    ar: { ...en, language: "اللغة", productName: "AI Creative Canvas", productTagline: "صور / لوحة / أصول", accountAuth: "الحساب", notLoggedIn: "لم يتم تسجيل الدخول", login: "تسجيل الدخول", workspace: "مساحة العمل", status: "الحالة", localRun: "تشغيل محلي", new: "جديد", save: "حفظ", layers: "الطبقات", close: "إغلاق", history: "السجل", noHistory: "لا يوجد سجل بعد", noLayers: "لا توجد طبقات", select: "تحديد", pan: "تحريك اللوحة", add: "إضافة", uploadImage: "رفع صورة", shape: "شكل", text: "نص", brush: "فرشاة", copy: "نسخ", delete: "حذف", download: "تنزيل", continueImage: "متابعة تعديل الصورة", sizeQuality: "الحجم والجودة", quality: "الجودة", ratio: "النسبة", count: "العدد", preferences: "التفضيلات", auto: "تلقائي", generationConfig: "إعدادات الإنشاء", creativeInstruction: "تعليمات إبداعية", adminConsole: "لوحة الإدارة", adminSummary: "سجّل الدخول لرؤية الحالة.", employee: "مساحة الموظف", refresh: "تحديث", logout: "تسجيل الخروج", overview: "نظرة عامة", accounts: "الحسابات", usage: "الاستخدام", feedback: "الملاحظات", models: "النماذج", health: "التشخيص", system: "النظام", adminLogin: "تسجيل دخول المسؤول", username: "اسم المستخدم", password: "كلمة المرور", confirmPassword: "تأكيد كلمة المرور", adminSetup: "إعداد المسؤول" }
  };
  const employeeLocaleSupplements = {
    ja: {
      create: "作成", tasks: "タスク", modelStatus: "モデル状態", imageGenerationModel: "画像生成モデル",
      imageGenerationUseCases: "商品画像・詳細ページ・キャンペーンポスター", online: "オンライン", unconfigured: "未設定",
      quickGenerate: "クイック生成", ecommerceMainImage: "商品メイン画像", productClear: "商品を明確に",
      detailHero: "詳細ページのヒーロー", titleSellingPoints: "タイトルと訴求点", campaignPoster: "キャンペーンポスター",
      brandVisual: "ブランドビジュアル", waitingGeneration: "生成待ち", resultsAppear: "結果はここに表示されます",
      noGenerationTasks: "生成タスクはまだありません", importAssetsHint: "読み込んだ素材はここに表示されます",
      output: "出力", model: "モデル", imageService: "画像サービス", autoRoute: "自動ルート",
      uploadAttachment: "添付・素材をアップロード", webSearch: "ウェブ検索", modelPreferences: "モデル設定",
      promptDescription: "画像を説明するか参照画像をアップロード", userModels: "マイモデル",
      localOnly: "このブラウザのみに保存", currentImageModel: "現在の画像モデル", backendDefaultModel: "管理者の既定モデル",
      modelList: "モデル一覧", saveMyModels: "モデルを保存", resetBackendDefault: "管理者設定に戻す",
      performance: "パフォーマンス", infiniteCanvas: "無限キャンバス BETA 1.0", drag: "ドラッグ", noAssets: "なし"
    },
    ko: {
      create: "만들기", tasks: "작업", modelStatus: "모델 상태", imageGenerationModel: "이미지 생성 모델",
      imageGenerationUseCases: "상품 이미지, 상세 페이지, 캠페인 포스터", online: "온라인", unconfigured: "미설정",
      quickGenerate: "빠른 생성", ecommerceMainImage: "상품 대표 이미지", productClear: "상품 강조",
      detailHero: "상세 페이지 히어로", titleSellingPoints: "제목 및 핵심 포인트", campaignPoster: "캠페인 포스터",
      brandVisual: "브랜드 비주얼", waitingGeneration: "생성 대기", resultsAppear: "결과가 여기에 표시됩니다",
      noGenerationTasks: "아직 생성 작업이 없습니다", importAssetsHint: "가져온 에셋이 여기에 표시됩니다",
      output: "출력", model: "모델", imageService: "이미지 서비스", autoRoute: "자동 경로",
      uploadAttachment: "첨부 파일 또는 에셋 업로드", webSearch: "웹 검색", modelPreferences: "모델 설정",
      promptDescription: "이미지를 설명하거나 참조 이미지를 업로드", userModels: "내 모델",
      localOnly: "이 브라우저에만 저장", currentImageModel: "현재 이미지 모델", backendDefaultModel: "관리자 기본 모델",
      modelList: "모델 목록", saveMyModels: "내 모델 저장", resetBackendDefault: "관리자 기본값 사용",
      performance: "성능", infiniteCanvas: "무한 캔버스 BETA 1.0", drag: "드래그", noAssets: "없음"
    },
    es: {
      create: "Crear", tasks: "Tareas", modelStatus: "Estado del modelo", imageGenerationModel: "Modelo de generación de imágenes",
      imageGenerationUseCases: "Imágenes de producto, páginas de detalle y carteles", online: "En línea", unconfigured: "Sin configurar",
      quickGenerate: "Generación rápida", ecommerceMainImage: "Imagen de producto", productClear: "Producto destacado",
      detailHero: "Portada de detalle", titleSellingPoints: "Título y ventajas", campaignPoster: "Cartel de campaña",
      brandVisual: "Visual de marca", waitingGeneration: "Listo para generar", resultsAppear: "Los resultados aparecerán aquí",
      noGenerationTasks: "Aún no hay tareas", importAssetsHint: "Los recursos importados aparecerán aquí",
      output: "Salida", model: "Modelo", imageService: "Servicio de imágenes", autoRoute: "Ruta automática",
      uploadAttachment: "Subir adjuntos o recursos", webSearch: "Búsqueda web", modelPreferences: "Preferencias del modelo",
      promptDescription: "Describe la imagen o sube referencias", userModels: "Mis modelos", localOnly: "Solo en este navegador",
      currentImageModel: "Modelo de imagen actual", backendDefaultModel: "Modelo predeterminado del administrador",
      modelList: "Lista de modelos", saveMyModels: "Guardar mis modelos", resetBackendDefault: "Usar valor del administrador",
      performance: "Rendimiento", infiniteCanvas: "Canvas infinito BETA 1.0", drag: "Arrastrar", noAssets: "Ninguno"
    },
    "pt-BR": {
      create: "Criar", tasks: "Tarefas", modelStatus: "Status do modelo", imageGenerationModel: "Modelo de geração de imagens",
      imageGenerationUseCases: "Imagens de produto, páginas de detalhes e cartazes", online: "Online", unconfigured: "Não configurado",
      quickGenerate: "Geração rápida", ecommerceMainImage: "Imagem do produto", productClear: "Produto em destaque",
      detailHero: "Capa da página de detalhes", titleSellingPoints: "Título e benefícios", campaignPoster: "Cartaz de campanha",
      brandVisual: "Visual da marca", waitingGeneration: "Pronto para gerar", resultsAppear: "Os resultados aparecerão aqui",
      noGenerationTasks: "Ainda não há tarefas", importAssetsHint: "Os ativos importados aparecerão aqui",
      output: "Saída", model: "Modelo", imageService: "Serviço de imagens", autoRoute: "Rota automática",
      uploadAttachment: "Enviar anexos ou ativos", webSearch: "Pesquisa na web", modelPreferences: "Preferências do modelo",
      promptDescription: "Descreva a imagem ou envie referências", userModels: "Meus modelos", localOnly: "Salvo apenas neste navegador",
      currentImageModel: "Modelo de imagem atual", backendDefaultModel: "Modelo padrão do administrador",
      modelList: "Lista de modelos", saveMyModels: "Salvar meus modelos", resetBackendDefault: "Usar padrão do administrador",
      performance: "Desempenho", infiniteCanvas: "Canvas infinito BETA 1.0", drag: "Arrastar", noAssets: "Nenhum"
    },
    fr: {
      create: "Créer", tasks: "Tâches", modelStatus: "État du modèle", imageGenerationModel: "Modèle de génération d’images",
      imageGenerationUseCases: "Images produit, pages détail et affiches", online: "En ligne", unconfigured: "Non configuré",
      quickGenerate: "Génération rapide", ecommerceMainImage: "Image produit", productClear: "Produit mis en avant",
      detailHero: "Héros de page détail", titleSellingPoints: "Titre et arguments", campaignPoster: "Affiche de campagne",
      brandVisual: "Visuel de marque", waitingGeneration: "Prêt à générer", resultsAppear: "Les résultats apparaîtront ici",
      noGenerationTasks: "Aucune tâche pour le moment", importAssetsHint: "Les ressources importées apparaîtront ici",
      output: "Sortie", model: "Modèle", imageService: "Service d’images", autoRoute: "Routage automatique",
      uploadAttachment: "Importer des pièces jointes", webSearch: "Recherche web", modelPreferences: "Préférences du modèle",
      promptDescription: "Décrivez l’image ou importez des références", userModels: "Mes modèles",
      localOnly: "Enregistré uniquement dans ce navigateur", currentImageModel: "Modèle d’image actuel",
      backendDefaultModel: "Modèle par défaut de l’administrateur", modelList: "Liste des modèles",
      saveMyModels: "Enregistrer mes modèles", resetBackendDefault: "Utiliser le défaut administrateur",
      performance: "Performances", infiniteCanvas: "Canevas infini BETA 1.0", drag: "Glisser", noAssets: "Aucun"
    },
    de: {
      create: "Erstellen", tasks: "Aufgaben", modelStatus: "Modellstatus", imageGenerationModel: "Bildgenerierungsmodell",
      imageGenerationUseCases: "Produktbilder, Detailseiten und Kampagnenposter", online: "Online", unconfigured: "Nicht konfiguriert",
      quickGenerate: "Schnellgenerierung", ecommerceMainImage: "Produktbild", productClear: "Produkt im Fokus",
      detailHero: "Detailseiten-Hero", titleSellingPoints: "Titel und Verkaufsargumente", campaignPoster: "Kampagnenposter",
      brandVisual: "Markenvisual", waitingGeneration: "Bereit zum Generieren", resultsAppear: "Ergebnisse erscheinen hier",
      noGenerationTasks: "Noch keine Aufgaben", importAssetsHint: "Importierte Assets erscheinen hier",
      output: "Ausgabe", model: "Modell", imageService: "Bilddienst", autoRoute: "Automatische Route",
      uploadAttachment: "Anhänge oder Assets hochladen", webSearch: "Websuche", modelPreferences: "Modelleinstellungen",
      promptDescription: "Bild beschreiben oder Referenzen hochladen", userModels: "Meine Modelle",
      localOnly: "Nur in diesem Browser gespeichert", currentImageModel: "Aktuelles Bildmodell",
      backendDefaultModel: "Admin-Standardmodell", modelList: "Modellliste", saveMyModels: "Modelle speichern",
      resetBackendDefault: "Admin-Standard verwenden", performance: "Leistung", infiniteCanvas: "Unendliche Canvas BETA 1.0",
      drag: "Ziehen", noAssets: "Keine"
    },
    ru: {
      create: "Создать", tasks: "Задачи", modelStatus: "Статус модели", imageGenerationModel: "Модель генерации изображений",
      imageGenerationUseCases: "Карточки товара, страницы и постеры", online: "В сети", unconfigured: "Не настроено",
      quickGenerate: "Быстрая генерация", ecommerceMainImage: "Изображение товара", productClear: "Акцент на товаре",
      detailHero: "Первый экран страницы", titleSellingPoints: "Заголовок и преимущества", campaignPoster: "Рекламный постер",
      brandVisual: "Визуальный стиль бренда", waitingGeneration: "Готово к генерации", resultsAppear: "Результаты появятся здесь",
      noGenerationTasks: "Задач пока нет", importAssetsHint: "Импортированные материалы появятся здесь",
      output: "Вывод", model: "Модель", imageService: "Сервис изображений", autoRoute: "Автомаршрут",
      uploadAttachment: "Загрузить вложения или материалы", webSearch: "Поиск в интернете", modelPreferences: "Настройки модели",
      promptDescription: "Опишите изображение или загрузите референсы", userModels: "Мои модели",
      localOnly: "Сохраняется только в этом браузере", currentImageModel: "Текущая модель изображений",
      backendDefaultModel: "Модель администратора", modelList: "Список моделей", saveMyModels: "Сохранить модели",
      resetBackendDefault: "Использовать модель администратора", performance: "Производительность",
      infiniteCanvas: "Бесконечный холст BETA 1.0", drag: "Перетащить", noAssets: "Нет"
    },
    ar: {
      create: "إنشاء", tasks: "المهام", modelStatus: "حالة النموذج", imageGenerationModel: "نموذج إنشاء الصور",
      imageGenerationUseCases: "صور المنتجات وصفحات التفاصيل وملصقات الحملات", online: "متصل", unconfigured: "غير مهيأ",
      quickGenerate: "إنشاء سريع", ecommerceMainImage: "صورة المنتج", productClear: "إبراز المنتج",
      detailHero: "واجهة صفحة التفاصيل", titleSellingPoints: "العنوان ونقاط البيع", campaignPoster: "ملصق الحملة",
      brandVisual: "هوية العلامة", waitingGeneration: "جاهز للإنشاء", resultsAppear: "ستظهر النتائج هنا",
      noGenerationTasks: "لا توجد مهام بعد", importAssetsHint: "ستظهر الأصول المستوردة هنا",
      output: "الإخراج", model: "النموذج", imageService: "خدمة الصور", autoRoute: "مسار تلقائي",
      uploadAttachment: "رفع مرفقات أو أصول", webSearch: "بحث الويب", modelPreferences: "تفضيلات النموذج",
      promptDescription: "صف الصورة أو ارفع مراجع", userModels: "نماذجي", localOnly: "محفوظ في هذا المتصفح فقط",
      currentImageModel: "نموذج الصور الحالي", backendDefaultModel: "نموذج المسؤول الافتراضي",
      modelList: "قائمة النماذج", saveMyModels: "حفظ نماذجي", resetBackendDefault: "استخدام افتراضي المسؤول",
      performance: "الأداء", infiniteCanvas: "لوحة لا نهائية BETA 1.0", drag: "سحب", noAssets: "لا يوجد"
    }
  };
  Object.entries(employeeLocaleSupplements).forEach(([locale, values]) => Object.assign(dictionaries[locale], values));
  const workspaceLocaleSupplements = {
    en: {
      generationKicker: "GENERATION", agent: "Agent", image: "Image", video: "Video", threeD: "3D",
      generationMode: "Generation mode", automaticModel: "Automatic · admin default",
      standardThinking: "Standard thinking", noThinking: "No thinking", deepThinking: "Deep thinking",
      selectModelFirst: "Add and save at least one model before switching to manual selection.",
      imageCountOne: "{count} image", directMode: "Direct", skills: "Skills",
      skillCategoryVideo: "Video", skillCategorySocial: "Social",
      skillCategoryEcommerce: "E-Com", skillCategoryBrand: "Brand"
    },
    "zh-CN": {
      generationKicker: "生成", agent: "智能体", image: "图片", video: "视频", threeD: "3D",
      generationMode: "生成模式", automaticModel: "自动 · 管理员默认",
      standardThinking: "标准思考", noThinking: "不思考", deepThinking: "深度思考",
      selectModelFirst: "请先添加并保存至少一个模型，再切换到手动选择。",
      imageCountOne: "{count} 张", directMode: "直出", skills: "技能",
      skillCategoryVideo: "视频", skillCategorySocial: "社媒",
      skillCategoryEcommerce: "电商", skillCategoryBrand: "品牌"
    },
    ja: {
      productName: "AI クリエイティブキャンバス", projectBar: "プロジェクト", unsavedProject: "未保存のプロジェクト",
      autoSaved: "自動保存済み", assets: "素材", uploadAssets: "素材をアップロード",
      canvasZoom: "キャンバスのズーム", canvasTools: "キャンバスツール", aiDesignerPanel: "AI デザイナーパネル",
      generationKicker: "生成", agent: "エージェント",
      image: "画像", video: "動画", threeD: "3D", generationMode: "生成モード",
      automaticModel: "自動 · 管理者の既定モデル", standardThinking: "標準思考", noThinking: "思考なし",
      deepThinking: "深い思考", closeConfiguration: "生成設定を閉じる", configCategories: "生成設定のカテゴリ",
      modelType: "モデル種別", lowQuality: "低品質", standard: "標準", deep: "高精度",
      imageQuality: "画像品質", generationRatio: "生成比率", generationCount: "生成枚数",
      autoSizeNote: "自動：参照画像がある場合は元の寸法、ない場合は現在のボード比率を使用します。",
      modelListPlaceholder: "1 行に 1 つのモデル名を入力します。例：\nmodel-a\nmodel-b",
      userModelDefaultStatus: "ユーザーモデルは未選択です。管理者の既定モデルを使用します。",
      userModelCurrentStatus: "使用中：{model}（このブラウザに保存）", savedUserModels: "{count} 件のモデルを保存しました。",
      clearedUserModels: "モデル一覧を消去し、管理者の既定モデルに戻しました。",
      resetUserModels: "管理者の既定モデルに戻しました。",
      selectModelFirst: "手動選択に切り替える前に、モデルを 1 件以上追加して保存してください。",
      imageCountOne: "{count} 枚", imageCountFormat: "{count} 枚", directMode: "直接",
      currentProjectImageChain: "現在は画像生成に対応しています。",
      skills: "スキル", skillCategoryVideo: "動画", skillCategorySocial: "ソーシャル",
      skillCategoryEcommerce: "Eコマース", skillCategoryBrand: "ブランド",
      skillTypeGeneral: "一般", skillTypeAgent: "AI エージェント", skillTypeSocial: "ソーシャルエージェント",
      skillTypeBrand: "ブランドエージェント", skillTypePlatform: "プラットフォーム指針", skillTypeImageUse: "画像用途",
      skillNoneName: "未選択", skillRebuildName: "高成果ビジュアル再構築エージェント",
      skillMainImageName: "商品画像エージェント", skillDetailName: "詳細ページ企画エージェント",
      skillSceneName: "ライフスタイルシーンエージェント", skillCampaignName: "キャンペーンポスターエージェント",
      skillEcommerceName: "Eコマースデザインエージェント", skillContentCoverName: "ソーシャルカバーエージェント",
      skillBrandName: "ブランドスタイル拡張エージェント",
      skillWhiteName: "白背景商品画像ガイドライン",
      taskFilters: "タスク状態フィルター", all: "すべて", running: "実行中",
      attention: "要確認", completed: "完了", failed: "失敗", partial: "一部完了", draft: "未開始",
      newConversation: "新しい会話", noContent: "内容なし", aiGeneration: "AI 画像生成",
      imagesShort: "{count} 枚", failedShort: "{count} 件失敗", noTasksInFilter: "このカテゴリにタスクはありません",
      previousPage: "前へ", nextPage: "次へ", deleteConversation: "会話を削除", deleteAsset: "素材を削除"
    },
    ko: {
      productName: "AI 크리에이티브 캔버스", projectBar: "프로젝트", unsavedProject: "저장되지 않은 프로젝트",
      autoSaved: "자동 저장됨", assets: "에셋", uploadAssets: "에셋 업로드",
      canvasZoom: "캔버스 확대/축소", canvasTools: "캔버스 도구", aiDesignerPanel: "AI 디자이너 패널",
      generationKicker: "생성", agent: "에이전트",
      image: "이미지", video: "비디오", threeD: "3D", generationMode: "생성 모드",
      automaticModel: "자동 · 관리자 기본 모델", standardThinking: "표준 사고", noThinking: "사고 없음",
      deepThinking: "심층 사고", closeConfiguration: "생성 설정 닫기", configCategories: "생성 설정 범주",
      modelType: "모델 유형", lowQuality: "낮음", standard: "표준", deep: "심층",
      imageQuality: "이미지 품질", generationRatio: "생성 비율", generationCount: "생성 수",
      autoSizeNote: "자동: 참조 이미지가 있으면 원본 크기를, 없으면 현재 보드 비율을 사용합니다.",
      modelListPlaceholder: "한 줄에 모델 이름 하나를 입력하세요. 예:\nmodel-a\nmodel-b",
      userModelDefaultStatus: "사용자 모델을 선택하지 않았습니다. 관리자 기본 모델을 사용합니다.",
      userModelCurrentStatus: "사용 중: {model}(이 브라우저에 저장됨)", savedUserModels: "사용자 모델 {count}개를 저장했습니다.",
      clearedUserModels: "모델 목록을 지우고 관리자 기본값으로 복원했습니다.",
      resetUserModels: "관리자 기본 모델로 복원했습니다.",
      selectModelFirst: "수동 선택으로 전환하기 전에 모델을 하나 이상 추가하고 저장하세요.",
      imageCountOne: "{count}장", imageCountFormat: "{count}장", directMode: "직접",
      currentProjectImageChain: "현재 이미지 생성을 지원합니다.",
      skills: "스킬", skillCategoryVideo: "비디오", skillCategorySocial: "소셜",
      skillCategoryEcommerce: "이커머스", skillCategoryBrand: "브랜드",
      skillTypeGeneral: "일반", skillTypeAgent: "AI 에이전트", skillTypeSocial: "소셜 에이전트",
      skillTypeBrand: "브랜드 에이전트", skillTypePlatform: "플랫폼 가이드", skillTypeImageUse: "이미지 용도",
      skillNoneName: "선택 안 함", skillRebuildName: "성과형 비주얼 재구성 에이전트",
      skillMainImageName: "상품 이미지 에이전트", skillDetailName: "상세 페이지 기획 에이전트",
      skillSceneName: "라이프스타일 장면 에이전트", skillCampaignName: "캠페인 포스터 에이전트",
      skillEcommerceName: "이커머스 디자인 에이전트", skillContentCoverName: "소셜 커버 에이전트",
      skillBrandName: "브랜드 스타일 확장 에이전트",
      skillWhiteName: "흰 배경 상품 이미지 가이드",
      taskFilters: "작업 상태 필터", all: "전체", running: "실행 중",
      attention: "확인 필요", completed: "완료", failed: "실패", partial: "일부 완료", draft: "시작 전",
      newConversation: "새 대화", noContent: "내용 없음", aiGeneration: "AI 이미지 생성",
      imagesShort: "이미지 {count}개", failedShort: "{count}개 실패", noTasksInFilter: "이 범주에 작업이 없습니다.",
      previousPage: "이전", nextPage: "다음", deleteConversation: "대화 삭제", deleteAsset: "에셋 삭제"
    },
    es: {
      productName: "Lienzo creativo de IA", projectBar: "Proyecto", unsavedProject: "Proyecto sin guardar",
      autoSaved: "Guardado automático", assets: "Recursos", uploadAssets: "Subir recursos",
      canvasZoom: "Zoom del lienzo", canvasTools: "Herramientas del lienzo", aiDesignerPanel: "Panel del diseñador de IA",
      generationKicker: "GENERACIÓN", agent: "Agente",
      image: "Imagen", video: "Vídeo", threeD: "3D", generationMode: "Modo de generación",
      automaticModel: "Automático · modelo del administrador", standardThinking: "Razonamiento estándar",
      noThinking: "Sin razonamiento", deepThinking: "Razonamiento profundo", closeConfiguration: "Cerrar ajustes",
      configCategories: "Categorías de generación", modelType: "Tipo de modelo", lowQuality: "Baja",
      standard: "Estándar", deep: "Profundo", imageQuality: "Calidad de imagen",
      generationRatio: "Proporción de generación", generationCount: "Cantidad de imágenes",
      autoSizeNote: "Automático: usa las dimensiones de la referencia o la proporción del lienzo actual.",
      modelListPlaceholder: "Un nombre de modelo por línea. Ejemplo:\nmodel-a\nmodel-b",
      userModelDefaultStatus: "No hay un modelo de usuario seleccionado; se usa el del administrador.",
      userModelCurrentStatus: "En uso: {model} (guardado en este navegador)",
      savedUserModels: "Se guardaron {count} modelos.", clearedUserModels: "Se borró la lista y se restauró el modelo del administrador.",
      resetUserModels: "Se restauró el modelo del administrador.",
      selectModelFirst: "Añade y guarda al menos un modelo antes de cambiar a la selección manual.",
      imageCountOne: "{count} imagen", imageCountFormat: "{count} imágenes", directMode: "Directo",
      currentProjectImageChain: "La generación de imágenes está disponible.",
      skills: "Habilidades", skillCategoryVideo: "Vídeo", skillCategorySocial: "Social",
      skillCategoryEcommerce: "Comercio", skillCategoryBrand: "Marca",
      skillTypeGeneral: "General", skillTypeAgent: "Agente de IA", skillTypeSocial: "Agente social",
      skillTypeBrand: "Agente de marca", skillTypePlatform: "Guía de plataforma", skillTypeImageUse: "Uso de imagen",
      skillNoneName: "Sin seleccionar", skillRebuildName: "Agente de reconstrucción visual",
      skillMainImageName: "Agente de imágenes de producto", skillDetailName: "Agente de planificación de detalle",
      skillSceneName: "Agente de escenas de estilo de vida", skillCampaignName: "Agente de carteles de campaña",
      skillEcommerceName: "Agente de diseño de comercio electrónico", skillContentCoverName: "Agente de portadas sociales",
      skillBrandName: "Agente de extensión de estilo de marca",
      skillWhiteName: "Guía de productos con fondo blanco",
      taskFilters: "Filtros de estado", all: "Todos", running: "En curso",
      attention: "Requiere atención", completed: "Completado", failed: "Fallido", partial: "Parcial",
      draft: "Sin iniciar", newConversation: "Nueva conversación", noContent: "Sin contenido",
      aiGeneration: "Generación de imágenes con IA", imagesShort: "{count} imágenes", failedShort: "{count} fallidas",
      noTasksInFilter: "No hay tareas en esta categoría", previousPage: "Anterior", nextPage: "Siguiente",
      deleteConversation: "Eliminar conversación", deleteAsset: "Eliminar recurso"
    },
    "pt-BR": {
      productName: "Canvas Criativo de IA", projectBar: "Projeto", unsavedProject: "Projeto não salvo",
      autoSaved: "Salvo automaticamente", assets: "Ativos", uploadAssets: "Enviar ativos",
      canvasZoom: "Zoom do canvas", canvasTools: "Ferramentas do canvas", aiDesignerPanel: "Painel do designer de IA",
      generationKicker: "GERAÇÃO", agent: "Agente",
      image: "Imagem", video: "Vídeo", threeD: "3D", generationMode: "Modo de geração",
      automaticModel: "Automático · padrão do administrador", standardThinking: "Raciocínio padrão",
      noThinking: "Sem raciocínio", deepThinking: "Raciocínio profundo", closeConfiguration: "Fechar configurações",
      configCategories: "Categorias de geração", modelType: "Tipo de modelo", lowQuality: "Baixa",
      standard: "Padrão", deep: "Profundo", imageQuality: "Qualidade da imagem",
      generationRatio: "Proporção de geração", generationCount: "Quantidade de imagens",
      autoSizeNote: "Automático: usa as dimensões da referência ou a proporção do quadro atual.",
      modelListPlaceholder: "Um nome de modelo por linha. Exemplo:\nmodel-a\nmodel-b",
      userModelDefaultStatus: "Nenhum modelo do usuário selecionado; usando o padrão do administrador.",
      userModelCurrentStatus: "Em uso: {model} (salvo neste navegador)",
      savedUserModels: "{count} modelos foram salvos.", clearedUserModels: "A lista foi limpa e o padrão do administrador foi restaurado.",
      resetUserModels: "O modelo padrão do administrador foi restaurado.",
      selectModelFirst: "Adicione e salve pelo menos um modelo antes de mudar para a seleção manual.",
      imageCountOne: "{count} imagem", imageCountFormat: "{count} imagens", directMode: "Direto",
      currentProjectImageChain: "A geração de imagens está disponível.",
      skills: "Habilidades", skillCategoryVideo: "Vídeo", skillCategorySocial: "Social",
      skillCategoryEcommerce: "E-commerce", skillCategoryBrand: "Marca",
      skillTypeGeneral: "Geral", skillTypeAgent: "Agente de IA", skillTypeSocial: "Agente social",
      skillTypeBrand: "Agente de marca", skillTypePlatform: "Diretriz da plataforma", skillTypeImageUse: "Uso da imagem",
      skillNoneName: "Não selecionado", skillRebuildName: "Agente de reconstrução visual",
      skillMainImageName: "Agente de imagens de produto", skillDetailName: "Agente de planejamento de página",
      skillSceneName: "Agente de cenas de estilo de vida", skillCampaignName: "Agente de cartazes de campanha",
      skillEcommerceName: "Agente de design para e-commerce", skillContentCoverName: "Agente de capas sociais",
      skillBrandName: "Agente de extensão do estilo da marca",
      skillWhiteName: "Diretriz de produto com fundo branco",
      taskFilters: "Filtros de status", all: "Todos", running: "Em execução",
      attention: "Requer atenção", completed: "Concluído", failed: "Falhou", partial: "Parcial",
      draft: "Não iniciado", newConversation: "Nova conversa", noContent: "Sem conteúdo",
      aiGeneration: "Geração de imagens por IA", imagesShort: "{count} imagens", failedShort: "{count} falhas",
      noTasksInFilter: "Não há tarefas nesta categoria", previousPage: "Anterior", nextPage: "Próxima",
      deleteConversation: "Excluir conversa", deleteAsset: "Excluir ativo"
    },
    fr: {
      productName: "Canevas créatif IA", projectBar: "Projet", unsavedProject: "Projet non enregistré",
      autoSaved: "Enregistré automatiquement", assets: "Ressources", uploadAssets: "Importer des ressources",
      canvasZoom: "Zoom du canevas", canvasTools: "Outils du canevas", aiDesignerPanel: "Panneau du concepteur IA",
      generationKicker: "GÉNÉRATION", agent: "Agent",
      image: "Image", video: "Vidéo", threeD: "3D", generationMode: "Mode de génération",
      automaticModel: "Automatique · modèle administrateur", standardThinking: "Raisonnement standard",
      noThinking: "Sans raisonnement", deepThinking: "Raisonnement approfondi", closeConfiguration: "Fermer les réglages",
      configCategories: "Catégories de génération", modelType: "Type de modèle", lowQuality: "Faible",
      standard: "Standard", deep: "Approfondi", imageQuality: "Qualité d’image",
      generationRatio: "Format de génération", generationCount: "Nombre d’images",
      autoSizeNote: "Automatique : utilise les dimensions de la référence ou le format du canevas actuel.",
      modelListPlaceholder: "Un nom de modèle par ligne. Exemple :\nmodel-a\nmodel-b",
      userModelDefaultStatus: "Aucun modèle utilisateur sélectionné ; le modèle administrateur est utilisé.",
      userModelCurrentStatus: "Utilisé : {model} (enregistré dans ce navigateur)",
      savedUserModels: "{count} modèles enregistrés.", clearedUserModels: "Liste effacée et modèle administrateur restauré.",
      resetUserModels: "Modèle administrateur restauré.",
      selectModelFirst: "Ajoutez et enregistrez au moins un modèle avant de passer à la sélection manuelle.",
      imageCountOne: "{count} image", imageCountFormat: "{count} images", directMode: "Direct",
      currentProjectImageChain: "La génération d’images est disponible.",
      skills: "Compétences", skillCategoryVideo: "Vidéo", skillCategorySocial: "Social",
      skillCategoryEcommerce: "E-commerce", skillCategoryBrand: "Marque",
      skillTypeGeneral: "Général", skillTypeAgent: "Agent IA", skillTypeSocial: "Agent social",
      skillTypeBrand: "Agent de marque", skillTypePlatform: "Guide de plateforme", skillTypeImageUse: "Usage de l’image",
      skillNoneName: "Non sélectionné", skillRebuildName: "Agent de reconstruction visuelle",
      skillMainImageName: "Agent d’images produit", skillDetailName: "Agent de planification de page détail",
      skillSceneName: "Agent de scènes de vie", skillCampaignName: "Agent d’affiches de campagne",
      skillEcommerceName: "Agent de design e-commerce", skillContentCoverName: "Agent de couvertures sociales",
      skillBrandName: "Agent d’extension du style de marque",
      skillWhiteName: "Guide de produit sur fond blanc",
      taskFilters: "Filtres d’état", all: "Tous", running: "En cours",
      attention: "À vérifier", completed: "Terminé", failed: "Échec", partial: "Partiel", draft: "Non démarré",
      newConversation: "Nouvelle conversation", noContent: "Aucun contenu", aiGeneration: "Génération d’images IA",
      imagesShort: "{count} images", failedShort: "{count} échecs", noTasksInFilter: "Aucune tâche dans cette catégorie",
      previousPage: "Précédent", nextPage: "Suivant", deleteConversation: "Supprimer la conversation",
      deleteAsset: "Supprimer la ressource"
    },
    de: {
      productName: "KI-Kreativfläche", projectBar: "Projekt", unsavedProject: "Nicht gespeichertes Projekt",
      autoSaved: "Automatisch gespeichert", assets: "Assets", uploadAssets: "Assets hochladen",
      canvasZoom: "Canvas-Zoom", canvasTools: "Canvas-Werkzeuge", aiDesignerPanel: "KI-Designerbereich",
      generationKicker: "GENERIERUNG", agent: "Agent",
      image: "Bild", video: "Video", threeD: "3D", generationMode: "Generierungsmodus",
      automaticModel: "Automatisch · Admin-Standard", standardThinking: "Standarddenken",
      noThinking: "Ohne Denken", deepThinking: "Tiefes Denken", closeConfiguration: "Einstellungen schließen",
      configCategories: "Generierungskategorien", modelType: "Modelltyp", lowQuality: "Niedrig",
      standard: "Standard", deep: "Tief", imageQuality: "Bildqualität",
      generationRatio: "Generierungsformat", generationCount: "Bildanzahl",
      autoSizeNote: "Automatisch: verwendet Referenzmaße oder das Format der aktuellen Fläche.",
      modelListPlaceholder: "Ein Modellname pro Zeile. Beispiel:\nmodel-a\nmodel-b",
      userModelDefaultStatus: "Kein Benutzermodell ausgewählt; der Admin-Standard wird verwendet.",
      userModelCurrentStatus: "Verwendet: {model} (in diesem Browser gespeichert)",
      savedUserModels: "{count} Modelle gespeichert.", clearedUserModels: "Liste gelöscht und Admin-Standard wiederhergestellt.",
      resetUserModels: "Admin-Standardmodell wiederhergestellt.",
      selectModelFirst: "Füge mindestens ein Modell hinzu und speichere es, bevor du manuell auswählst.",
      imageCountOne: "{count} Bild", imageCountFormat: "{count} Bilder", directMode: "Direkt",
      currentProjectImageChain: "Bildgenerierung ist verfügbar.",
      skills: "Skills", skillCategoryVideo: "Video", skillCategorySocial: "Social",
      skillCategoryEcommerce: "E-Commerce", skillCategoryBrand: "Marke",
      skillTypeGeneral: "Allgemein", skillTypeAgent: "KI-Agent", skillTypeSocial: "Social-Agent",
      skillTypeBrand: "Marken-Agent", skillTypePlatform: "Plattformrichtlinie", skillTypeImageUse: "Bildzweck",
      skillNoneName: "Nicht ausgewählt", skillRebuildName: "Agent für visuelle Rekonstruktion",
      skillMainImageName: "Agent für Produktbilder", skillDetailName: "Agent für Detailseitenplanung",
      skillSceneName: "Agent für Lifestyle-Szenen", skillCampaignName: "Agent für Kampagnenposter",
      skillEcommerceName: "Agent für E-Commerce-Design", skillContentCoverName: "Agent für Social-Cover",
      skillBrandName: "Agent für Markendesign-Erweiterung",
      skillWhiteName: "Richtlinie für Produktbilder auf Weiß",
      taskFilters: "Aufgabenstatusfilter", all: "Alle", running: "Läuft",
      attention: "Prüfung nötig", completed: "Abgeschlossen", failed: "Fehlgeschlagen", partial: "Teilweise",
      draft: "Nicht begonnen", newConversation: "Neue Unterhaltung", noContent: "Kein Inhalt",
      aiGeneration: "KI-Bildgenerierung", imagesShort: "{count} Bilder", failedShort: "{count} fehlgeschlagen",
      noTasksInFilter: "Keine Aufgaben in dieser Kategorie", previousPage: "Zurück", nextPage: "Weiter",
      deleteConversation: "Unterhaltung löschen", deleteAsset: "Asset löschen"
    },
    ru: {
      productName: "Творческий ИИ-холст", projectBar: "Проект", unsavedProject: "Несохранённый проект",
      autoSaved: "Сохранено автоматически", assets: "Материалы", uploadAssets: "Загрузить материалы",
      canvasZoom: "Масштаб холста", canvasTools: "Инструменты холста", aiDesignerPanel: "Панель ИИ-дизайнера",
      generationKicker: "ГЕНЕРАЦИЯ", agent: "Агент",
      image: "Изображение", video: "Видео", threeD: "3D", generationMode: "Режим генерации",
      automaticModel: "Автоматически · модель администратора", standardThinking: "Стандартное мышление",
      noThinking: "Без мышления", deepThinking: "Глубокое мышление", closeConfiguration: "Закрыть настройки",
      configCategories: "Категории генерации", modelType: "Тип модели", lowQuality: "Низкое",
      standard: "Стандарт", deep: "Глубокое", imageQuality: "Качество изображения",
      generationRatio: "Соотношение генерации", generationCount: "Количество изображений",
      autoSizeNote: "Авто: используются размеры референса или пропорции текущего холста.",
      modelListPlaceholder: "Одно имя модели в строке. Например:\nmodel-a\nmodel-b",
      userModelDefaultStatus: "Пользовательская модель не выбрана; используется модель администратора.",
      userModelCurrentStatus: "Используется: {model} (сохранено в этом браузере)",
      savedUserModels: "Сохранено моделей: {count}.", clearedUserModels: "Список очищен, восстановлена модель администратора.",
      resetUserModels: "Восстановлена модель администратора.",
      selectModelFirst: "Добавьте и сохраните хотя бы одну модель перед ручным выбором.",
      imageCountOne: "{count} изображение", imageCountFormat: "{count} изображений", directMode: "Напрямую",
      currentProjectImageChain: "Генерация изображений доступна.",
      skills: "Навыки", skillCategoryVideo: "Видео", skillCategorySocial: "Соцсети",
      skillCategoryEcommerce: "E-commerce", skillCategoryBrand: "Бренд",
      skillTypeGeneral: "Общее", skillTypeAgent: "ИИ-агент", skillTypeSocial: "Агент соцсетей",
      skillTypeBrand: "Агент бренда", skillTypePlatform: "Правила платформы", skillTypeImageUse: "Назначение изображения",
      skillNoneName: "Не выбрано", skillRebuildName: "Агент визуальной реконструкции",
      skillMainImageName: "Агент изображений товара", skillDetailName: "Агент планирования страницы",
      skillSceneName: "Агент жизненных сцен", skillCampaignName: "Агент рекламных постеров",
      skillEcommerceName: "Агент дизайна e-commerce", skillContentCoverName: "Агент обложек для соцсетей",
      skillBrandName: "Агент расширения стиля бренда",
      skillWhiteName: "Правила изображений на белом фоне",
      taskFilters: "Фильтры статуса", all: "Все", running: "Выполняется",
      attention: "Требует внимания", completed: "Завершено", failed: "Ошибка", partial: "Частично",
      draft: "Не начато", newConversation: "Новый диалог", noContent: "Нет содержимого",
      aiGeneration: "Генерация изображений ИИ", imagesShort: "{count} изображений", failedShort: "Ошибок: {count}",
      noTasksInFilter: "В этой категории нет задач", previousPage: "Назад", nextPage: "Далее",
      deleteConversation: "Удалить диалог", deleteAsset: "Удалить материал"
    },
    ar: {
      productName: "لوحة الإبداع بالذكاء الاصطناعي", projectBar: "المشروع", unsavedProject: "مشروع غير محفوظ",
      autoSaved: "تم الحفظ تلقائياً", assets: "الأصول", uploadAssets: "رفع الأصول",
      canvasZoom: "تكبير اللوحة", canvasTools: "أدوات اللوحة", aiDesignerPanel: "لوحة مصمم الذكاء الاصطناعي",
      generationKicker: "الإنشاء", agent: "الوكيل",
      image: "صورة", video: "فيديو", threeD: "ثلاثي الأبعاد", generationMode: "وضع الإنشاء",
      automaticModel: "تلقائي · نموذج المسؤول", standardThinking: "تفكير قياسي",
      noThinking: "بلا تفكير", deepThinking: "تفكير عميق", closeConfiguration: "إغلاق الإعدادات",
      configCategories: "فئات إعدادات الإنشاء", modelType: "نوع النموذج", lowQuality: "منخفض",
      standard: "قياسي", deep: "عميق", imageQuality: "جودة الصورة",
      generationRatio: "نسبة الإنشاء", generationCount: "عدد الصور",
      autoSizeNote: "تلقائي: يستخدم أبعاد الصورة المرجعية أو نسبة اللوحة الحالية.",
      modelListPlaceholder: "اسم نموذج واحد في كل سطر. مثال:\nmodel-a\nmodel-b",
      userModelDefaultStatus: "لم يتم تحديد نموذج مستخدم؛ يُستخدم نموذج المسؤول الافتراضي.",
      userModelCurrentStatus: "قيد الاستخدام: {model} (محفوظ في هذا المتصفح)",
      savedUserModels: "تم حفظ {count} من النماذج.", clearedUserModels: "تم مسح القائمة واستعادة نموذج المسؤول.",
      resetUserModels: "تمت استعادة نموذج المسؤول الافتراضي.",
      selectModelFirst: "أضف نموذجاً واحداً على الأقل واحفظه قبل الانتقال إلى التحديد اليدوي.",
      imageCountOne: "{count} صورة", imageCountFormat: "{count} صور", directMode: "مباشر",
      currentProjectImageChain: "إنشاء الصور متاح حالياً.",
      skills: "المهارات", skillCategoryVideo: "فيديو", skillCategorySocial: "اجتماعي",
      skillCategoryEcommerce: "التجارة", skillCategoryBrand: "العلامة",
      skillTypeGeneral: "عام", skillTypeAgent: "وكيل ذكاء اصطناعي", skillTypeSocial: "وكيل اجتماعي",
      skillTypeBrand: "وكيل العلامة", skillTypePlatform: "دليل المنصة", skillTypeImageUse: "استخدام الصورة",
      skillNoneName: "غير محدد", skillRebuildName: "وكيل إعادة بناء الهوية البصرية",
      skillMainImageName: "وكيل صور المنتجات", skillDetailName: "وكيل تخطيط صفحة التفاصيل",
      skillSceneName: "وكيل مشاهد أسلوب الحياة", skillCampaignName: "وكيل ملصقات الحملات",
      skillEcommerceName: "وكيل تصميم التجارة الإلكترونية", skillContentCoverName: "وكيل أغلفة التواصل",
      skillBrandName: "وكيل توسيع أسلوب العلامة",
      skillWhiteName: "دليل المنتج بخلفية بيضاء",
      taskFilters: "مرشحات حالة المهام", all: "الكل", running: "قيد التنفيذ",
      attention: "يحتاج مراجعة", completed: "مكتمل", failed: "فشل", partial: "مكتمل جزئياً",
      draft: "لم يبدأ", newConversation: "محادثة جديدة", noContent: "لا يوجد محتوى",
      aiGeneration: "إنشاء صور بالذكاء الاصطناعي", imagesShort: "{count} صور", failedShort: "{count} فشلت",
      noTasksInFilter: "لا توجد مهام في هذه الفئة", previousPage: "السابق", nextPage: "التالي",
      deleteConversation: "حذف المحادثة", deleteAsset: "حذف الأصل"
    }
  };
  Object.entries(workspaceLocaleSupplements).forEach(([locale, values]) => Object.assign(dictionaries[locale], values));
  const privacyLocaleSupplements = {
    en: {
      privacyNotice: "Data & AI notice", privacyTitle: "How your data is handled",
      privacyIntro: "Data in this application is managed by the organization operating this deployment.",
      privacyExternalAi: "Prompts, reference images, and uploaded files may be sent to external AI services configured by the administrator.",
      privacyFailureLog: "When an AI task fails, prompts, references, account details, service, and model are logged automatically for troubleshooting.",
      privacySensitive: "Do not upload unnecessary sensitive personal data, trade secrets, or materials you are not authorized to use.",
      privacyRetentionSummary: "Local retention: failures {failures} days, feedback {feedback} days, conversations {conversations} days, canvas projects and unused assets {projects} days, generated images {images} days.",
      privacyRetentionDisabled: "Automatic local cleanup is disabled by the operator.",
      privacyContact: "Operator contact", privacyContactUnavailable: "For access, export, correction, or deletion requests, contact the organization operating this deployment.",
      understood: "I understand"
    },
    "zh-CN": {
      privacyNotice: "数据与 AI 说明", privacyTitle: "使用前请了解数据如何处理",
      privacyIntro: "本应用中的数据由部署和运营它的组织负责管理。",
      privacyExternalAi: "提示词、参考图片和上传资料可能发送给管理员配置的外部 AI 服务。",
      privacyFailureLog: "AI 任务失败时，系统会自动保留提示词、参考图、账号信息、服务和模型，供管理员排查问题。",
      privacySensitive: "请勿上传与任务无关的个人敏感信息、商业秘密或无权使用的素材。",
      privacyRetentionSummary: "本地保留期：失败日志 {failures} 天、反馈 {feedback} 天、对话 {conversations} 天、画布项目及未使用素材 {projects} 天、生成图片 {images} 天。",
      privacyRetentionDisabled: "运营方已关闭本地自动清理。",
      privacyContact: "运营方联系方式", privacyContactUnavailable: "如需访问、导出、更正或删除数据，请联系当前部署的运营组织。",
      understood: "我知道了"
    },
    ja: {
      privacyNotice: "データと AI の説明", privacyTitle: "データの取り扱いについて",
      privacyIntro: "このアプリのデータは、この環境を運営する組織が管理します。",
      privacyExternalAi: "プロンプト、参照画像、アップロード資料は、管理者が設定した外部 AI サービスへ送信される場合があります。",
      privacyFailureLog: "AI タスクが失敗すると、調査のためにプロンプト、参照、アカウント情報、サービス、モデルが自動保存されます。",
      privacySensitive: "不要な機微個人情報、営業秘密、利用権のない素材をアップロードしないでください。",
      privacyRetentionSummary: "ローカル保存期間：失敗ログ {failures} 日、フィードバック {feedback} 日、会話 {conversations} 日、プロジェクトと未使用素材 {projects} 日、生成画像 {images} 日。",
      privacyRetentionDisabled: "運営者はローカル自動削除を無効にしています。",
      privacyContact: "運営者の連絡先", privacyContactUnavailable: "アクセス、エクスポート、訂正、削除は、この環境の運営組織へ連絡してください。",
      understood: "確認しました"
    },
    ko: {
      privacyNotice: "데이터 및 AI 안내", privacyTitle: "데이터 처리 방식",
      privacyIntro: "이 앱의 데이터는 해당 배포를 운영하는 조직이 관리합니다.",
      privacyExternalAi: "프롬프트, 참조 이미지와 업로드 파일은 관리자가 설정한 외부 AI 서비스로 전송될 수 있습니다.",
      privacyFailureLog: "AI 작업이 실패하면 문제 해결을 위해 프롬프트, 참조, 계정 정보, 서비스와 모델이 자동 기록됩니다.",
      privacySensitive: "불필요한 민감 개인정보, 영업 비밀 또는 사용 권한이 없는 자료를 업로드하지 마세요.",
      privacyRetentionSummary: "로컬 보존 기간: 실패 로그 {failures}일, 피드백 {feedback}일, 대화 {conversations}일, 프로젝트와 미사용 자산 {projects}일, 생성 이미지 {images}일.",
      privacyRetentionDisabled: "운영자가 로컬 자동 정리를 껐습니다.",
      privacyContact: "운영자 연락처", privacyContactUnavailable: "접근, 내보내기, 수정 또는 삭제 요청은 이 배포의 운영 조직에 문의하세요.",
      understood: "확인했습니다"
    },
    es: {
      privacyNotice: "Aviso sobre datos e IA", privacyTitle: "Cómo se tratan tus datos",
      privacyIntro: "Los datos de esta aplicación los gestiona la organización que opera esta instalación.",
      privacyExternalAi: "Las instrucciones, imágenes de referencia y archivos pueden enviarse a servicios externos de IA configurados por el administrador.",
      privacyFailureLog: "Si una tarea de IA falla, se registran instrucciones, referencias, datos de cuenta, servicio y modelo para resolver el problema.",
      privacySensitive: "No subas datos personales sensibles innecesarios, secretos comerciales ni materiales sin autorización.",
      privacyRetentionSummary: "Conservación local: fallos {failures} días, comentarios {feedback}, conversaciones {conversations}, proyectos y recursos sin usar {projects}, imágenes generadas {images}.",
      privacyRetentionDisabled: "El operador ha desactivado la limpieza local automática.",
      privacyContact: "Contacto del operador", privacyContactUnavailable: "Para acceder, exportar, corregir o eliminar datos, contacta con la organización que opera esta instalación.",
      understood: "Entendido"
    },
    "pt-BR": {
      privacyNotice: "Aviso de dados e IA", privacyTitle: "Como seus dados são tratados",
      privacyIntro: "Os dados deste aplicativo são gerenciados pela organização que opera esta instalação.",
      privacyExternalAi: "Prompts, imagens de referência e arquivos enviados podem ser encaminhados a serviços externos de IA configurados pelo administrador.",
      privacyFailureLog: "Quando uma tarefa de IA falha, prompts, referências, dados da conta, serviço e modelo são registrados para diagnóstico.",
      privacySensitive: "Não envie dados pessoais sensíveis desnecessários, segredos comerciais ou materiais sem autorização.",
      privacyRetentionSummary: "Retenção local: falhas {failures} dias, feedback {feedback}, conversas {conversations}, projetos e ativos não usados {projects}, imagens geradas {images}.",
      privacyRetentionDisabled: "O operador desativou a limpeza local automática.",
      privacyContact: "Contato do operador", privacyContactUnavailable: "Para acesso, exportação, correção ou exclusão, contate a organização que opera esta instalação.",
      understood: "Entendi"
    },
    fr: {
      privacyNotice: "Avis données et IA", privacyTitle: "Traitement de vos données",
      privacyIntro: "Les données de cette application sont gérées par l’organisation qui exploite ce déploiement.",
      privacyExternalAi: "Les instructions, images de référence et fichiers peuvent être transmis aux services d’IA externes configurés par l’administrateur.",
      privacyFailureLog: "Lorsqu’une tâche d’IA échoue, les instructions, références, données du compte, service et modèle sont journalisés pour le diagnostic.",
      privacySensitive: "Ne chargez pas de données personnelles sensibles inutiles, de secrets commerciaux ou de contenus sans autorisation.",
      privacyRetentionSummary: "Conservation locale : échecs {failures} jours, retours {feedback}, conversations {conversations}, projets et ressources inutilisées {projects}, images générées {images}.",
      privacyRetentionDisabled: "L’exploitant a désactivé le nettoyage local automatique.",
      privacyContact: "Contact de l’exploitant", privacyContactUnavailable: "Pour accéder, exporter, corriger ou supprimer des données, contactez l’organisation qui exploite ce déploiement.",
      understood: "J’ai compris"
    },
    de: {
      privacyNotice: "Daten- und KI-Hinweis", privacyTitle: "So werden Ihre Daten verarbeitet",
      privacyIntro: "Die Daten dieser Anwendung werden von der Organisation verwaltet, die diese Installation betreibt.",
      privacyExternalAi: "Prompts, Referenzbilder und Uploads können an externe KI-Dienste gesendet werden, die der Administrator konfiguriert hat.",
      privacyFailureLog: "Bei fehlgeschlagenen KI-Aufgaben werden Prompts, Referenzen, Kontodaten, Dienst und Modell zur Fehlersuche automatisch protokolliert.",
      privacySensitive: "Laden Sie keine unnötigen sensiblen Personendaten, Geschäftsgeheimnisse oder unberechtigt genutzten Materialien hoch.",
      privacyRetentionSummary: "Lokale Aufbewahrung: Fehler {failures} Tage, Feedback {feedback}, Unterhaltungen {conversations}, Projekte und ungenutzte Assets {projects}, generierte Bilder {images}.",
      privacyRetentionDisabled: "Der Betreiber hat die automatische lokale Bereinigung deaktiviert.",
      privacyContact: "Kontakt des Betreibers", privacyContactUnavailable: "Für Auskunft, Export, Berichtigung oder Löschung wenden Sie sich an die betreibende Organisation.",
      understood: "Verstanden"
    },
    ru: {
      privacyNotice: "Уведомление о данных и ИИ", privacyTitle: "Как обрабатываются ваши данные",
      privacyIntro: "Данными приложения управляет организация, которая обслуживает это развёртывание.",
      privacyExternalAi: "Запросы, референсы и загруженные файлы могут отправляться внешним сервисам ИИ, настроенным администратором.",
      privacyFailureLog: "При сбое задачи ИИ запросы, референсы, данные аккаунта, сервис и модель автоматически сохраняются для диагностики.",
      privacySensitive: "Не загружайте лишние чувствительные данные, коммерческие тайны или материалы без права использования.",
      privacyRetentionSummary: "Локальное хранение: ошибки {failures} дней, отзывы {feedback}, диалоги {conversations}, проекты и неиспользуемые материалы {projects}, изображения {images}.",
      privacyRetentionDisabled: "Оператор отключил автоматическую локальную очистку.",
      privacyContact: "Контакт оператора", privacyContactUnavailable: "Для доступа, экспорта, исправления или удаления данных обратитесь к организации, обслуживающей это развёртывание.",
      understood: "Понятно"
    },
    ar: {
      privacyNotice: "إشعار البيانات والذكاء الاصطناعي", privacyTitle: "كيفية معالجة بياناتك",
      privacyIntro: "تدير بيانات هذا التطبيق الجهة التي تشغّل هذا النشر.",
      privacyExternalAi: "قد تُرسل المطالبات والصور المرجعية والملفات المرفوعة إلى خدمات ذكاء اصطناعي خارجية يهيئها المسؤول.",
      privacyFailureLog: "عند فشل مهمة ذكاء اصطناعي، تُسجّل المطالبات والمراجع وبيانات الحساب والخدمة والنموذج تلقائياً للتشخيص.",
      privacySensitive: "لا ترفع بيانات شخصية حساسة غير ضرورية أو أسراراً تجارية أو مواد لا تملك حق استخدامها.",
      privacyRetentionSummary: "الاحتفاظ المحلي: الفشل {failures} يوماً، الملاحظات {feedback}، المحادثات {conversations}، المشاريع والأصول غير المستخدمة {projects}، الصور المنشأة {images}.",
      privacyRetentionDisabled: "عطّل المشغّل التنظيف المحلي التلقائي.",
      privacyContact: "جهة اتصال المشغّل", privacyContactUnavailable: "لطلب الوصول أو التصدير أو التصحيح أو الحذف، تواصل مع الجهة التي تشغّل هذا النشر.",
      understood: "فهمت"
    }
  };
  Object.entries(privacyLocaleSupplements).forEach(([locale, values]) => Object.assign(dictionaries[locale], values));
  const canvasStatusLocaleSupplements = {
    en: {
      shapeText: "Shape text",
      canvasToolMenuOpened: "{label}: tool menu opened.",
      canvasObjectAdded: "{label} was added to the canvas.",
      canvasTextAdded: "Text was added to the canvas. Double-click to edit."
    },
    "zh-CN": {
      shapeText: "形状文字",
      canvasToolMenuOpened: "{label}：已打开工具菜单。",
      canvasObjectAdded: "{label} 已加入画布。",
      canvasTextAdded: "文字已加入画布，双击即可编辑。"
    },
    ja: {
      shapeText: "図形テキスト",
      canvasToolMenuOpened: "{label}：ツールメニューを開きました。",
      canvasObjectAdded: "{label}をキャンバスに追加しました。",
      canvasTextAdded: "テキストをキャンバスに追加しました。ダブルクリックして編集できます。"
    },
    ko: {
      shapeText: "도형 텍스트",
      canvasToolMenuOpened: "{label}: 도구 메뉴를 열었습니다.",
      canvasObjectAdded: "{label}을(를) 캔버스에 추가했습니다.",
      canvasTextAdded: "텍스트를 캔버스에 추가했습니다. 두 번 클릭하여 편집하세요."
    },
    es: {
      shapeText: "Texto de forma",
      canvasToolMenuOpened: "{label}: menú de herramientas abierto.",
      canvasObjectAdded: "{label} se añadió al lienzo.",
      canvasTextAdded: "El texto se añadió al lienzo. Haz doble clic para editarlo."
    },
    "pt-BR": {
      shapeText: "Texto de forma",
      canvasToolMenuOpened: "{label}: menu de ferramentas aberto.",
      canvasObjectAdded: "{label} foi adicionada ao canvas.",
      canvasTextAdded: "O texto foi adicionado ao canvas. Clique duas vezes para editar."
    },
    fr: {
      shapeText: "Texte de forme",
      canvasToolMenuOpened: "{label} : menu d’outils ouvert.",
      canvasObjectAdded: "{label} a été ajoutée au canevas.",
      canvasTextAdded: "Le texte a été ajouté au canevas. Double-cliquez pour le modifier."
    },
    de: {
      shapeText: "Formtext",
      canvasToolMenuOpened: "{label}: Werkzeugmenü geöffnet.",
      canvasObjectAdded: "{label} wurde zur Zeichenfläche hinzugefügt.",
      canvasTextAdded: "Text wurde zur Zeichenfläche hinzugefügt. Doppelklicken Sie zum Bearbeiten."
    },
    ru: {
      shapeText: "Текст в фигуре",
      canvasToolMenuOpened: "{label}: меню инструментов открыто.",
      canvasObjectAdded: "{label} добавлена на холст.",
      canvasTextAdded: "Текст добавлен на холст. Дважды щёлкните, чтобы изменить его."
    },
    ar: {
      shapeText: "نص الشكل",
      canvasToolMenuOpened: "{label}: تم فتح قائمة الأدوات.",
      canvasObjectAdded: "تمت إضافة {label} إلى اللوحة.",
      canvasTextAdded: "تمت إضافة النص إلى اللوحة. انقر نقراً مزدوجاً للتحرير."
    }
  };
  Object.entries(canvasStatusLocaleSupplements).forEach(([locale, values]) => Object.assign(dictionaries[locale], values));

  function normalizeLocale(value) {
    const raw = String(value || "").trim();
    if (dictionaries[raw]) return raw;
    const base = raw.split("-")[0].toLowerCase();
    return locales.find(([id]) => id.toLowerCase() === base)?.[0] || "zh-CN";
  }

  function currentLocale() {
    return normalizeLocale(localStorage.getItem("ai_canvas_locale") || document.documentElement.lang || navigator.language);
  }

  function t(key, fallback = "") {
    const locale = currentLocale();
    return dictionaries[locale]?.[key] || en[key] || fallback || key;
  }

  function format(key, values = {}, fallback = "") {
    return String(t(key, fallback)).replace(/\{(\w+)\}/g, (match, name) => (
      Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match
    ));
  }

  function formatImageCount(count) {
    const numericCount = Number(count);
    const key = numericCount === 1 ? "imageCountOne" : "imageCountFormat";
    return format(key, { count }, `${count} ${numericCount === 1 ? "image" : "images"}`);
  }

  function localizedValues(key) {
    return Array.from(new Set(Object.values(dictionaries).map((dictionary) => dictionary?.[key]).filter(Boolean)));
  }

  function apply(root = document) {
    const locale = currentLocale();
    const dictionary = dictionaries[locale] || en;
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    root.querySelectorAll?.("[data-i18n]").forEach((element) => {
      const key = element.dataset.i18n;
      if (key && dictionary[key]) element.textContent = dictionary[key];
    });
    root.querySelectorAll?.("[data-i18n-placeholder]").forEach((element) => {
      const key = element.dataset.i18nPlaceholder;
      if (key && dictionary[key]) element.placeholder = dictionary[key];
    });
    root.querySelectorAll?.("[data-i18n-title]").forEach((element) => {
      const key = element.dataset.i18nTitle;
      if (key && dictionary[key]) element.title = dictionary[key];
    });
    root.querySelectorAll?.("[data-i18n-tooltip]").forEach((element) => {
      const key = element.dataset.i18nTooltip;
      if (key && dictionary[key]) element.setAttribute("data-tooltip", dictionary[key]);
    });
    root.querySelectorAll?.("[data-i18n-aria-label]").forEach((element) => {
      const key = element.dataset.i18nAriaLabel;
      if (key && dictionary[key]) element.setAttribute("aria-label", dictionary[key]);
    });
    root.querySelectorAll?.("[data-i18n-value]").forEach((element) => {
      const key = element.dataset.i18nValue;
      const current = String(element.value || "");
      if (key && dictionary[key] && (!current || localizedValues(key).includes(current))) element.value = dictionary[key];
    });
    root.querySelectorAll?.("[data-i18n-count]").forEach((element) => {
      element.textContent = formatImageCount(element.dataset.i18nCount);
    });
    const selector = document.querySelector("#appLanguageSelect");
    if (selector) {
      selector.innerHTML = locales.map(([id, label]) => `<option value="${id}">${label}</option>`).join("");
      selector.value = locale;
      selector.onchange = () => {
        localStorage.setItem("ai_canvas_locale", normalizeLocale(selector.value));
        apply(document);
        window.dispatchEvent(new CustomEvent("ai-canvas-locale-change", { detail: { locale: currentLocale() } }));
      };
    }
    document.title = dictionary.productName || "AI Creative Canvas";
    window.EcommerceCanvasText?.apply(root, locale);
  }

  app.i18n = { locales, dictionaries, normalizeLocale, currentLocale, t, format, formatImageCount, localizedValues, apply };
  window.EcommerceCanvasI18n = app.i18n;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => apply(document), { once: true });
  else apply(document);
})();
