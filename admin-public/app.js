const $ = (selector) => document.querySelector(selector);

const tr = (key, fallback = "") => window.EcommerceCanvasI18n?.t(key, fallback) || fallback || key;

const els = {
  loginOverlay: $("#loginOverlay"),
  loginForm: $("#loginForm"),
  username: $("#username"),
  password: $("#password"),
  confirmPassword: $("#confirmPassword"),
  confirmPasswordWrap: $("#confirmPasswordWrap"),
  loginError: $("#loginError"),
  loginTitle: $("#loginTitle"),
  loginKicker: $("#loginKicker"),
  loginSubmit: $("#loginSubmit"),
  logoutBtn: $("#logoutBtn"),
  refreshBtn: $("#refreshBtn"),
  overview: $("#overview"),
  adminStatus: $("#adminStatus"),
  adminName: $("#adminName"),
  adminRole: $("#adminRole"),
  summaryLine: $("#summaryLine"),
  employeeLink: $("#employeeLink"),
  toast: $("#toast")
};

const ADMIN_MODULES = [
  { id: "overview", titleKey: "moduleOverviewTitle", kickerKey: "moduleOverviewKicker", descriptionKey: "moduleOverviewDescription" },
  { id: "accounts", titleKey: "moduleAccountsTitle", kickerKey: "moduleAccountsKicker", descriptionKey: "moduleAccountsDescription" },
  { id: "usage", titleKey: "moduleUsageTitle", kickerKey: "moduleUsageKicker", descriptionKey: "moduleUsageDescription" },
  { id: "feedback", titleKey: "moduleFeedbackTitle", kickerKey: "moduleFeedbackKicker", descriptionKey: "moduleFeedbackDescription" },
  { id: "ai", titleKey: "moduleAiTitle", kickerKey: "moduleAiKicker", descriptionKey: "moduleAiDescription" },
  { id: "diagnostics", titleKey: "moduleDiagnosticsTitle", kickerKey: "moduleDiagnosticsKicker", descriptionKey: "moduleDiagnosticsDescription" },
  { id: "system", titleKey: "moduleSystemTitle", kickerKey: "moduleSystemKicker", descriptionKey: "moduleSystemDescription" }
];
const ADMIN_ROLE_OPTIONS = [
  { id: "super_admin", label: "超级管理员" },
  { id: "account_admin", label: "账户运营" },
  { id: "usage_viewer", label: "用量查看" },
  { id: "ai_template_admin", label: "AI 管理员" },
  { id: "tech_admin", label: "技术维护" }
];
const CONFIGURED_KEY_PLACEHOLDER = "__configured__";

const state = {
  user: null,
  overview: null,
  loading: false,
  editingUserId: "",
  updatePollTimer: null,
  setupRequired: false,
  usageDashboardPeriod: localStorage.getItem("usage_dashboard_period") || "total",
  openPanels: new Set(JSON.parse(localStorage.getItem("admin_open_panels") || "[]")),
  activeAdminModule: localStorage.getItem("admin_active_module") || "overview",
  activeAiConfigSection: localStorage.getItem("admin_ai_config_section") || "image",
  selectedSkillId: localStorage.getItem("admin_selected_skill_id") || "",
  gallery: {
    offset: 0,
    limit: 12,
    account: "",
    expanded: localStorage.getItem("admin_gallery_expanded") === "true"
  }
};

function init() {
  clearAdminSecrets();
  bindEvents();
  window.EcommerceCanvasI18n?.apply(document);
  window.addEventListener("ai-canvas-locale-change", () => {
    renderLoginMode();
    renderAccount();
    renderOverview();
  });
  renderAccount();
  checkSession();
}

function clearAdminSecrets() {
  if (els.password) {
    els.password.value = "";
    els.password.setAttribute("autocomplete", "new-password");
  }
  if (els.confirmPassword) {
    els.confirmPassword.value = "";
  }
}

function bindEvents() {
  els.loginForm?.addEventListener("submit", handleLogin);
  els.logoutBtn?.addEventListener("click", handleLogout);
  els.refreshBtn?.addEventListener("click", loadOverview);
  bindAdminModuleButtons();
}

function bindAdminModuleButtons(root = document) {
  root.querySelectorAll("[data-admin-module]").forEach((button) => {
    if (button.dataset.adminModuleBound) return;
    button.dataset.adminModuleBound = "1";
    button.addEventListener("click", () => switchAdminModule(button.dataset.adminModule));
  });
}

function switchAdminModule(moduleId) {
  const visible = visibleAdminModules();
  const next = visible.some((item) => item.id === moduleId) ? moduleId : visible[0]?.id || "overview";
  state.activeAdminModule = next;
  localStorage.setItem("admin_active_module", next);
  renderOverview();
}

function currentPermissions() {
  return new Set(state.overview?.permissions || state.user?.permissions || []);
}

function userCan(permission) {
  return currentPermissions().has(permission);
}

function visibleAdminModules(data = state.overview) {
  const ids = data?.visibleModules || state.user?.visibleModules || ADMIN_MODULES.map((item) => item.id);
  const allowed = new Set(ids);
  return ADMIN_MODULES
    .filter((item) => allowed.has(item.id))
    .map((item) => ({
      ...item,
      title: tr(item.titleKey, item.id),
      kicker: tr(item.kickerKey, ""),
      description: tr(item.descriptionKey, "")
    }));
}

function isAdminModuleVisible(moduleId, data = state.overview) {
  return visibleAdminModules(data).some((item) => item.id === moduleId);
}

async function checkSession() {
  try {
    const response = await fetch("/api/admin/me", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error || "未登录");
      error.setupRequired = Boolean(data.setupRequired);
      throw error;
    }
    state.setupRequired = false;
    state.user = data.user;
    hideLogin();
    renderAccount();
    await loadOverview();
  } catch (error) {
    state.user = null;
    state.setupRequired = Boolean(error?.setupRequired);
    showLogin();
    renderAccount();
  }
}

async function handleLogin(event) {
  event.preventDefault();
  els.loginError.textContent = "";
  const previousText = els.loginSubmit?.textContent || "登录";
  if (els.loginSubmit) {
    els.loginSubmit.disabled = true;
    els.loginSubmit.textContent = state.setupRequired
      ? (window.EcommerceCanvasI18n?.t("adminSetupProgress") || "初始化中...")
      : (window.EcommerceCanvasI18n?.t("adminLoginProgress") || "登录中...");
  }
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 12000);
  try {
    const endpoint = state.setupRequired ? "/api/admin/setup" : "/api/admin/login";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        username: els.username.value.trim(),
        password: els.password.value,
        confirmPassword: els.confirmPassword?.value || ""
      })
    });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error || "登录失败");
      error.setupRequired = Boolean(data.setupRequired);
      throw error;
    }
    state.setupRequired = false;
    state.user = data.user;
    els.password.value = "";
    if (els.confirmPassword) els.confirmPassword.value = "";
    hideLogin();
    renderAccount();
    await loadOverview();
    toast(window.EcommerceCanvasI18n?.t("loginSuccess") || "登录成功。");
  } catch (error) {
    state.setupRequired = state.setupRequired || Boolean(error?.setupRequired);
    renderLoginMode();
    els.loginError.textContent = error.name === "AbortError"
      ? "请求超时，请确认管理后台服务已启动后刷新页面。"
      : (error.message || "登录失败");
  } finally {
    window.clearTimeout(timer);
    if (els.loginSubmit) {
      els.loginSubmit.disabled = false;
      els.loginSubmit.textContent = previousText;
    }
  }
}

async function handleLogout() {
  await fetch("/api/admin/logout", { method: "POST" }).catch(() => {});
  state.user = null;
  state.overview = null;
  renderAccount();
  renderOverview();
  showLogin();
}

function renderAccount() {
  const user = state.user;
  els.adminStatus.textContent = user ? (window.EcommerceCanvasI18n?.t("ready") || "Ready") : (window.EcommerceCanvasI18n?.t("notLoggedIn") || "未登录");
  els.adminStatus.className = user ? "ready" : "";
  els.adminName.textContent = user ? (user.displayName || user.username) : (window.EcommerceCanvasI18n?.t("login") || "请登录");
  els.adminRole.textContent = user ? `${user.adminRoleLabel || user.role || "admin"} · ${user.plan || tr("localAdministrator", "Local administrator")}` : "Admin Console";
  els.logoutBtn.style.display = user ? "inline-flex" : "none";
}

function showLogin() {
  document.body.classList.add("admin-login-locked");
  els.loginOverlay.classList.remove("hidden");
  renderLoginMode();
}

function hideLogin() {
  document.body.classList.remove("admin-login-locked");
  els.loginOverlay.classList.add("hidden");
  els.loginError.textContent = "";
}

function renderLoginMode() {
  const isSetup = state.setupRequired;
  if (els.loginKicker) els.loginKicker.textContent = isSetup
    ? tr("adminSetupKicker", "ADMIN SETUP")
    : tr("adminLoginKicker", "ADMIN SIGN IN");
  if (els.loginTitle) els.loginTitle.textContent = isSetup
    ? (window.EcommerceCanvasI18n?.t("adminSetup") || "初始化中控台管理员")
    : (window.EcommerceCanvasI18n?.t("adminLogin") || "登录管理员中控");
  if (els.loginSubmit) els.loginSubmit.textContent = isSetup
    ? (window.EcommerceCanvasI18n?.t("adminSetup") || "初始化管理员")
    : (window.EcommerceCanvasI18n?.t("login") || "登录");
  if (els.confirmPasswordWrap) els.confirmPasswordWrap.classList.toggle("hidden", !isSetup);
  if (els.password) els.password.autocomplete = "new-password";
}

async function loadOverview() {
  if (!state.user) {
    showLogin();
    return;
  }
  state.loading = true;
  renderOverview();
  try {
    const response = await fetch("/api/admin/overview", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "读取失败");
    if (data.currentAdmin) state.user = data.currentAdmin;
    state.overview = data;
    state.gallery = {
      offset: Number(data.aiGallery?.offset || 0),
      limit: Number(data.aiGallery?.limit || state.gallery.limit || 12),
      account: String(data.aiGallery?.account || ""),
      expanded: state.gallery.expanded
    };
    updateEmployeeLink(data);
  } catch (error) {
    state.overview = { error: error.message || "读取失败" };
  } finally {
    state.loading = false;
    renderOverview();
    if (state.gallery.expanded && !state.overview?.error) {
      await loadGalleryPage({ offset: state.gallery.offset || 0, limit: state.gallery.limit || 12, expanded: true, silent: true });
    }
  }
}

function updateEmployeeLink(data) {
  const employeeUrl = (data.server?.urls || []).find((item) => item.type === "employee" && item.url.includes("localhost"))?.url
    || `http://localhost:${data.server?.employeePort || 5173}`;
  els.employeeLink.href = employeeUrl;
}

function renderOverview() {
  if (state.loading) {
    els.overview.className = "overview empty-state";
    els.overview.textContent = window.EcommerceCanvasI18n?.t("loading") || "正在读取内网中控数据";
    syncAdminModuleNav();
    return;
  }
  const data = state.overview;
  if (!data) {
    els.overview.className = "overview empty-state";
    els.overview.textContent = window.EcommerceCanvasI18n?.t("loginRequired") || "管理员登录后显示中控数据";
    els.summaryLine.textContent = window.EcommerceCanvasI18n?.t("adminSummary") || "登录后查看内网运行状态。";
    syncAdminModuleNav();
    return;
  }
  if (data.error) {
    els.overview.className = "overview empty-state error-state";
    els.overview.textContent = data.error;
    syncAdminModuleNav();
    return;
  }

  const usage = data.accounts?.totalUsage || {};
  const users = data.accounts?.users || [];
  const urls = data.server?.urls || [];
  const modules = data.modules || [];
  const config = data.config || {};
  const autostart = data.autostart || {};
  const diagnostics = data.diagnostics || {};
  const aiGallery = data.aiGallery || {};
  const activeModule = getActiveAdminModule();
  els.summaryLine.textContent = formatAdminSummary(data.accounts?.total || 0, data.server?.employeePort || 5173, data.server?.adminPort || 5188);

  const operations = data.operations || null;
  const context = { usage, users, urls, modules, config, autostart, diagnostics, aiGallery, operations };
  const renderers = {
    overview: () => renderOverviewModule(data, context),
    accounts: () => renderAccountsModule(data, context),
    usage: () => usageDashboardSection(data.accounts?.usageDashboard, users),
    feedback: () => renderFeedbackModule(data.feedback),
    ai: () => renderAiConfigModule(config),
    diagnostics: () => renderDiagnosticsModule(diagnostics),
    system: () => renderSystemModule(data, context)
  };

  els.overview.className = `overview admin-module-view module-${activeModule.id}`;
  els.overview.innerHTML = renderModuleShell(activeModule, renderers[activeModule.id]?.() || renderers.overview());
  syncAdminModuleNav(data);
  bindDynamicActions();
  window.EcommerceCanvasI18n?.apply(document);
}

function getActiveAdminModule() {
  const visible = visibleAdminModules();
  const active = visible.find((item) => item.id === state.activeAdminModule) || visible[0] || ADMIN_MODULES[0];
  state.activeAdminModule = active.id;
  return active;
}

function syncAdminModuleNav(data = state.overview) {
  const active = getActiveAdminModule();
  const visibleIds = new Set(visibleAdminModules(data).map((item) => item.id));
  document.querySelectorAll("[data-admin-module]").forEach((button) => {
    const isVisible = visibleIds.has(button.dataset.adminModule);
    button.hidden = !isVisible;
    const isActive = button.dataset.adminModule === active.id;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-current", isActive ? "page" : "false");
  });
  if (!data || data.error) return;
  const labels = {
    overview: tr("operations", "Operations"),
    accounts: `${data.accounts?.total || 0}`,
    usage: formatCompactNumber(data.accounts?.usageDashboard?.summary?.total || data.accounts?.totalUsage?.aiImages || 0),
    feedback: `${data.feedback?.summary?.down || 0}`,
    ai: `${normalizeAdminAiSkills(data.config?.ai?.aiImageSkills).length}`,
    diagnostics: diagnosticSummary(data.diagnostics),
    system: `v${data.server?.version || "0.0.0"}`
  };
  Object.entries(labels).forEach(([id, label]) => {
    const small = document.querySelector(`[data-admin-module="${cssEscape(id)}"] small`);
    if (small) small.textContent = label;
  });
}

function formatAdminSummary(accountCount, employeePort, adminPort) {
  const locale = window.EcommerceCanvasI18n?.currentLocale?.() || "en";
  const values = { accountCount, employeePort, adminPort };
  const templates = {
    en: "{accountCount} accounts · Employee {employeePort} · Admin {adminPort}",
    "zh-CN": "{accountCount} 个账户 · 员工端 {employeePort} · 管理端 {adminPort}",
    ja: "{accountCount} アカウント · 従業員 {employeePort} · 管理 {adminPort}",
    ko: "계정 {accountCount}개 · 직원 {employeePort} · 관리자 {adminPort}",
    es: "{accountCount} cuentas · Empleados {employeePort} · Admin {adminPort}",
    "pt-BR": "{accountCount} contas · Funcionários {employeePort} · Admin {adminPort}",
    fr: "{accountCount} comptes · Employés {employeePort} · Admin {adminPort}",
    de: "{accountCount} Konten · Mitarbeiter {employeePort} · Admin {adminPort}",
    ru: "{accountCount} аккаунтов · Сотрудники {employeePort} · Админ {adminPort}",
    ar: "{accountCount} حسابات · الموظفون {employeePort} · الإدارة {adminPort}"
  };
  return (templates[locale] || templates.en).replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ""));
}

function renderModuleShell(meta, body) {
  return `
    <header class="module-hero">
      <div>
        <span class="kicker">${escapeHtml(meta.kicker)}</span>
        <h2>${escapeHtml(meta.title)}</h2>
        <p>${escapeHtml(meta.description)}</p>
      </div>
    </header>
    <div class="module-body">
      ${body}
    </div>
  `;
}

function renderOverviewModule(data, context) {
  const { users, urls, modules, diagnostics, config, autostart, aiGallery, operations } = context;
  const commandCards = [
    renderOperationsCard(data, context),
    operations && isAdminModuleVisible("diagnostics") ? renderOperationsMonitorCard(operations) : "",
    isAdminModuleVisible("diagnostics") ? renderHealthCard(diagnostics) : "",
    isAdminModuleVisible("system") ? renderVersionCard(data.update, config.updates || {}, autostart) : "",
    renderModuleShortcutGrid(data, users)
  ].filter(Boolean).join("");
  const secondaryCards = [
    isAdminModuleVisible("system") ? renderDeploymentCard(data, urls) : "",
    modules.length ? renderModuleStatusCard(modules) : ""
  ].filter(Boolean).join("");
  return `
    <div class="kpi-grid">
      ${kpi("账户", data.accounts?.total || 0, `${data.accounts?.active || 0} 个启用`)}
      ${kpi("AI 生图", data.jobs?.aiImages?.count || aiGallery.totalGenerated || 0, `${data.jobs?.aiImages?.stored || aiGallery.stored || 0} 张可预览`)}
      ${kpi("会话", data.accounts?.sessions || 0, "管理端登录")}
    </div>

    <div class="overview-command-grid">
      ${commandCards}
    </div>

    ${secondaryCards ? `<div class="two-column">${secondaryCards}</div>` : ""}
  `;
}

function renderOperationsCard(data, context) {
  const usage = context.usage || {};
  const dashboard = data.accounts?.usageDashboard || fallbackUsageDashboard(context.users);
  const summary = dashboard.summary || {};
  const quickActions = [
    ["accounts", "账户授权"],
    ["usage", "用量明细"],
    ["system", "内网配置"]
  ].filter(([id]) => isAdminModuleVisible(id));
  return `
    <section class="card command-card">
      <div class="card-head">
        <div>
          <b>运营盘面</b>
          <span>今天先看有没有异常、谁在用、资源够不够</span>
        </div>
      </div>
      <div class="ops-grid">
        <div><span>今日任务</span><b>${escapeHtml(formatCompactNumber(summary.today || 0))}</b></div>
        <div><span>本周任务</span><b>${escapeHtml(formatCompactNumber(summary.week || 0))}</b></div>
        <div><span>活跃员工</span><b>${escapeHtml(summary.activeUsersWeek || 0)}</b></div>
        <div><span>累计消耗</span><b>${escapeHtml(formatCompactNumber((usage.aiImages || 0) + (usage.copywriting || 0)))}</b></div>
      </div>
      <div class="quick-actions">
        ${quickActions.map(([id, label]) => `<button class="secondary small-action" type="button" data-admin-module="${escapeHtml(id)}">${escapeHtml(label)}</button>`).join("") || `<span class="muted">当前角色暂无快捷操作</span>`}
      </div>
    </section>
  `;
}

function renderOperationsMonitorCard(operations) {
  const ai = operations?.aiImage || {};
  const aiMetrics = ai.metrics || {};
  const providers = Array.isArray(aiMetrics.providers) ? aiMetrics.providers.slice(0, 4) : [];
  const backup = operations?.backup || {};
  const backupOk = backup.lastStatus === "ok";
  return `
    <section class="card command-card operations-monitor-card">
      <div class="card-head">
        <div>
          <b>运维监控</b>
          <span>${operations?.employeeOnline ? "员工端在线" : "员工端未在线"} · 今日成本 ${escapeHtml(formatMoneyCny(operations?.todayCostCny || 0))}</span>
        </div>
      </div>
      <div class="ops-grid monitor-grid">
        <div><span>AI 队列</span><b>${escapeHtml(Number(ai.active || 0))}/${escapeHtml(Number(ai.maxActiveJobs || 0))}</b><small>${escapeHtml(Number(ai.running || 0))} 跑 / ${escapeHtml(Number(ai.queued || 0))} 排</small></div>
        <div><span>AI 平均耗时</span><b>${escapeHtml(formatDurationMs(aiMetrics.averageDurationMs || 0))}</b><small>成功率 ${escapeHtml(aiMetrics.successRate || 0)}%</small></div>
        <div><span>本地任务</span><b>${escapeHtml(Number(operations?.localPython?.queued || 0))}</b><small>${operations?.localPython?.running ? "运行中" : "空闲"}</small></div>
      </div>
      <div class="monitor-provider-list">
        ${providers.length ? providers.map((item) => `
          <span><b>${escapeHtml(providerLabel(item.provider))}</b><small>${escapeHtml(item.completed || 0)}/${escapeHtml(item.accepted || 0)} · ${escapeHtml(item.successRate || 0)}%</small></span>
        `).join("") : `<span><b>服务商</b><small>今日暂无生图记录</small></span>`}
      </div>
      <div class="monitor-backup-line ${backupOk ? "ok" : "warn"}">
        <b>${backupOk ? "备份正常" : "备份待检查"}</b>
        <span>${escapeHtml(backup.lastBackupAt ? formatDateTime(backup.lastBackupAt) : (backup.lastError || "还没有自动备份记录"))}</span>
      </div>
    </section>
  `;
}

function providerLabel(provider) {
  const id = String(provider || "").toLowerCase();
  if (id.includes("secondary")) return "服务 B";
  if (id.includes("imageservice")) return "服务 A";
  if (id.includes("primaryimage")) return "图片服务";
  return provider || "unknown";
}

function renderHealthCard(diagnostics) {
  const status = diagnostics?.status || "warn";
  return `
    <section class="card health-card">
      <div class="card-head">
        <div>
          <b>无人值守体检</b>
          <span>${escapeHtml(diagnosticSummary(diagnostics))}</span>
        </div>
        <button class="secondary small-action" type="button" data-admin-module="diagnostics">查看</button>
      </div>
      <div class="health-meter ${escapeHtml(status)}">
        <b>${status === "ok" ? "正常" : status === "warn" ? "提醒" : "异常"}</b>
        <span>${escapeHtml(diagnostics?.checkedAt ? formatDateTime(diagnostics.checkedAt) : "等待体检数据")}</span>
      </div>
    </section>
  `;
}

function renderVersionCard(update, updates, autostart) {
  const status = update?.status || "idle";
  const statusText = {
    idle: "待机",
    starting: "启动中",
    running: "更新中",
    downloading: "下载中",
    extracting: "解压中",
    "backing-up": "备份中",
    applying: "应用中",
    "post-update": "收尾中",
    restarting: "重启中",
    complete: "已完成",
    failed: "失败"
  }[status] || status;
  return `
    <section class="card version-card">
      <div class="card-head">
        <div>
          <b>版本与守护</b>
          <span>当前 ${escapeHtml(updates.currentVersion || "0.1.0-preview.22")} · 最新 ${escapeHtml(updates.latestVersion || "未填写")}</span>
        </div>
        <button class="secondary small-action" type="button" data-admin-module="system">维护</button>
      </div>
      <div class="version-stack">
        <span class="update-status ${escapeHtml(status)}">${escapeHtml(statusText)}</span>
        <span>守护：${autostart.guardian?.enabled ? "已启用" : "未启用"}</span>
      </div>
    </section>
  `;
}

function renderModuleShortcutGrid(data, users) {
  const shortcuts = [
    ["accounts", "账户授权", `${users.length} 个员工`],
    ["ai", "AI 配置", aiConfigSummary(data.config || {})],
    ["diagnostics", "体检状态", diagnosticSummary(data.diagnostics)]
  ].filter(([id]) => isAdminModuleVisible(id));
  return `
    <section class="card shortcut-card">
      <div class="card-head">
        <div>
          <b>常用入口</b>
          <span>按后台任务重新分区，不再混在一页里</span>
        </div>
      </div>
      <div class="shortcut-grid">
        ${shortcuts.map(([id, title, detail]) => `<button type="button" data-admin-module="${escapeHtml(id)}"><b>${escapeHtml(title)}</b><span>${escapeHtml(detail)}</span></button>`).join("") || `<div class="empty-state compact">当前角色没有额外入口。</div>`}
      </div>
    </section>
  `;
}

function renderDeploymentCard(data, urls) {
  return `
    <section class="card deployment-card">
      <div class="card-head">
        <div>
          <b>内网部署</b>
          <span>v${escapeHtml(data.server?.version || "0.0.0")}</span>
        </div>
      </div>
      <div class="info-grid">
        <div><span>公司</span><b>${escapeHtml(data.server?.companyName || "未填写")}</b></div>
        <div><span>主机名</span><b>${escapeHtml(data.server?.hostName || "-")}</b></div>
        <div><span>员工端口</span><b>${escapeHtml(data.server?.employeePort || "-")}</b></div>
        <div><span>管理端口</span><b>${escapeHtml(data.server?.adminPort || "-")}</b></div>
        <div><span>运行时长</span><b>${escapeHtml(formatDuration(data.server?.uptimeSeconds || 0))}</b></div>
        <div><span>项目目录</span><b>${escapeHtml(data.server?.appRoot || "-")}</b></div>
      </div>
      <div class="url-list">
        ${urls.map((item) => `<a class="${escapeHtml(item.type || "")}" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.label)} · ${escapeHtml(item.url)}</a>`).join("")}
      </div>
    </section>
  `;
}

function renderModuleStatusCard(modules) {
  return `
    <section class="card">
      <div class="card-head">
        <div>
          <b>模块状态</b>
          <span>中控能力接入情况</span>
        </div>
      </div>
      <div class="module-grid">
        ${modules.map((item) => `
          <div class="module ${item.status === "ready" ? "ready" : "planned"}">
            <b>${escapeHtml(item.name)}</b>
            <span>${item.status === "ready" ? "已接入" : "待接入"}</span>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderAccountsModule(data, context) {
  const { usage, users } = context;
  const groupKeys = configuredAdminGroupKeys();
  const groupedUsers = users.filter((user) => user.groupId || user.groupName || user.department);
  const unmatchedGroups = groupedUsers.filter((user) => !findAdminGroupKeyForUser(user));
  const personalKeyUsers = users.filter((user) => adminUserKeyProviderSummary(user).length);
  return `
    <section class="card accounts-card">
      <div class="card-head">
        <div>
          <b>员工账户</b>
          <span>AI 图 ${escapeHtml(usage.aiImages || 0)} · 文案 ${escapeHtml(usage.copywriting || 0)} · 个人 Key ${escapeHtml(personalKeyUsers.length)} · 小组 Key ${escapeHtml(groupKeys.length)} · 未匹配 ${escapeHtml(unmatchedGroups.length)}</span>
        </div>
        <button id="addUserBtn" class="primary small-action" type="button">新增员工账户</button>
      </div>
      <div class="foldout-inline ${isPanelOpen("user-form") ? "open" : ""}">
        <button class="foldout-inline-toggle" type="button" data-toggle-panel="user-form">
          <span>${isPanelOpen("user-form") ? "收起账户表单" : "展开账户表单"}</span>
          <b>${state.editingUserId ? "正在编辑" : "新增/编辑员工账户"}</b>
        </button>
        <div class="foldout-inline-body" ${isPanelOpen("user-form") ? "" : "hidden"}>
          ${userForm()}
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>账户</th>
              <th>小组</th>
              <th>角色</th>
              <th>状态</th>
              <th>套餐</th>
              <th>设备</th>
              <th>AI 生图</th>
              <th>AI 文案</th>
              <th>AI 成本</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>${users.length ? users.map((user) => userRow(user)).join("") : `<tr><td colspan="10"><div class="empty-state compact">还没有员工账户。</div></td></tr>`}</tbody>
        </table>
      </div>
    </section>
  `;
}

function renderFeedbackReferenceThumbs(item = {}) {
  const refs = Array.isArray(item.references) ? item.references : [];
  const fallback = item.imageUrl
    ? [{ name: item.imageName || "关联图片", imageUrl: item.imageUrl, url: item.imageUrl }]
    : [];
  const list = (refs.length ? refs : fallback).slice(0, 6);
  if (!list.length) return `<span class="muted">无参考图</span>`;
  return `
    <div class="feedback-ref-grid">
      ${list.map((ref) => {
        const imageUrl = String(ref.imageUrl || ref.url || "").trim();
        const name = ref.name || ref.fileName || `参考图${ref.index || ""}`;
        const meta = [ref.role, ref.bytes ? formatFileSize(ref.bytes) : "", ref.error].filter(Boolean).join(" · ");
        return `
          <a class="feedback-ref-thumb" href="${escapeHtml(imageUrl || "#")}" target="_blank" rel="noreferrer" title="${escapeHtml([name, meta].filter(Boolean).join(" · "))}">
            ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(name)}" loading="lazy" />` : `<em>无图</em>`}
            <span>${escapeHtml(name)}</span>
          </a>
        `;
      }).join("")}
    </div>
  `;
}

function renderFeedbackPrompt(item = {}) {
  const original = String(item.originalPrompt || "").trim();
  const planned = String(item.plannedPrompt || "").trim();
  if (planned && planned !== original) {
    return `
      <div class="feedback-prompt-block">
        ${original ? `<b>原始</b><p>${escapeHtml(original)}</p>` : ""}
        <b>最终</b><p>${escapeHtml(planned)}</p>
      </div>
    `;
  }
  return `<div class="feedback-prompt-block"><p>${escapeHtml(item.prompt || original || "-")}</p></div>`;
}

function renderFeedbackModule(feedback) {
  if (!feedback) return `<div class="empty-state">当前账号没有查看反馈的权限。</div>`;
  const summary = feedback.summary || {};
  const trend = Array.isArray(feedback.trend) ? feedback.trend : [];
  const issues = Array.isArray(feedback.issues) ? feedback.issues : [];
  const users = Array.isArray(feedback.users) ? feedback.users : [];
  const recent = Array.isArray(feedback.recent) ? feedback.recent : [];
  const maxDayTotal = Math.max(1, ...trend.map((item) => Number(item.total || 0)));
  return `
    <div class="kpi-grid">
      ${kpi("一周反馈/失败", summary.total || 0, `${feedback.windowDays || 7} 天内全部记录`)}
      ${kpi("点赞", summary.up || 0, "生成结果被认可")}
      ${kpi("问题记录", summary.down || 0, "失败和吐槽都在这里")}
      ${kpi("问题占比", `${summary.downRate || 0}%`, "问题 / 全部记录")}
    </div>

    <section class="card feedback-card">
      <div class="card-head">
        <div>
          <b>一周问题趋势</b>
          <span>每周复盘时优先看失败/踩的波动和高频问题</span>
        </div>
        <button id="refreshFeedbackBtn" class="secondary small-action" type="button">刷新反馈</button>
      </div>
      <div class="feedback-trend">
        ${trend.map((item) => {
          const downWidth = Math.max(3, Math.round((Number(item.down || 0) / maxDayTotal) * 100));
          const upWidth = Math.max(0, Math.round((Number(item.up || 0) / maxDayTotal) * 100));
          return `
            <div class="feedback-day">
              <span>${escapeHtml(item.date?.slice(5) || "-")}</span>
              <i><em class="down" style="width:${downWidth}%"></em><em class="up" style="width:${upWidth}%"></em></i>
              <b>${escapeHtml(item.down || 0)} 问题</b>
            </div>
          `;
        }).join("") || `<div class="empty-state compact">暂无反馈趋势</div>`}
      </div>
    </section>

    <div class="two-column">
      <section class="card feedback-card">
        <div class="card-head">
          <div>
            <b>高频原因</b>
            <span>同类失败原因会自动合并计数</span>
          </div>
        </div>
        <div class="feedback-issue-list">
          ${issues.length ? issues.map((item) => `
            <article class="feedback-issue">
              <b>${escapeHtml(item.issue)}</b>
              <span>${escapeHtml(item.count || 0)} 次 · 最近 ${escapeHtml(formatDateTime(item.latestAt))}</span>
              <small>${escapeHtml((item.users || []).join("、") || "未知用户")}</small>
            </article>
          `).join("") : `<div class="empty-state compact">最近一周还没有失败或吐槽。</div>`}
        </div>
      </section>

      <section class="card feedback-card">
        <div class="card-head">
          <div>
            <b>反馈用户</b>
            <span>按问题数量排序</span>
          </div>
        </div>
        <div class="feedback-user-list">
          ${users.length ? users.map((item) => `
            <div class="feedback-user-row">
              <span><b>${escapeHtml(item.displayName || item.username || "未知用户")}</b><small>${escapeHtml(item.groupName || item.username || "-")}</small></span>
              <em>${escapeHtml(item.down || 0)} 问题 / ${escapeHtml(item.up || 0)} 赞</em>
            </div>
          `).join("") : `<div class="empty-state compact">暂无用户反馈。</div>`}
        </div>
      </section>
    </div>

    <section class="card feedback-card">
      <div class="card-head">
        <div>
          <b>最近失败/吐槽明细</b>
          <span>自动保留失败原因、提示词、参考图、用户和供应商</span>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>用户</th>
              <th>供应商/任务</th>
              <th>参考图</th>
              <th>失败原因</th>
              <th>提示词</th>
            </tr>
          </thead>
          <tbody>
            ${recent.length ? recent.map((item) => `
              <tr>
                <td>${escapeHtml(formatDateTime(item.updatedAt || item.createdAt))}</td>
                <td><b>${escapeHtml(item.displayName || item.username || "未知用户")}</b><span>${escapeHtml(item.groupName || item.username || "-")}</span></td>
                <td><b>${escapeHtml(item.aiLabel || item.provider || item.workflow || "-")}</b><span>${escapeHtml([item.model, item.jobId ? `任务 ${item.jobId}` : ""].filter(Boolean).join(" · ") || item.workflow || "-")}</span></td>
                <td>${renderFeedbackReferenceThumbs(item)}</td>
                <td class="feedback-problem">${escapeHtml(item.issue || "未填写问题")}</td>
                <td class="feedback-prompt">${renderFeedbackPrompt(item)}</td>
              </tr>
            `).join("") : `<tr><td colspan="6"><div class="empty-state compact">最近一周还没有失败或吐槽。</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderAiConfigModule(config) {
  return `
    <section class="card config-card">
      <div class="card-head">
        <div>
          <b>AI 模型配置</b>
          <span>${escapeHtml(aiConfigSummary(config))}</span>
        </div>
      </div>
      ${aiSettingsForm(config)}
    </section>
  `;
}


function renderDiagnosticsModule(diagnostics) {
  return `
    <section class="card diagnostics-card">
      <div class="card-head">
        <div>
          <b>无人值守体检</b>
          <span>${escapeHtml(diagnosticSummary(diagnostics))}</span>
        </div>
        <button id="refreshDiagnosticsBtn" class="secondary small-action" type="button">重新体检</button>
      </div>
      ${diagnosticsPanel(diagnostics)}
    </section>
  `;
}

function renderSystemModule(data, context) {
  const { urls, modules, config, autostart } = context;
  return `
    <div class="two-column">
      ${renderDeploymentCard(data, urls)}
      ${renderModuleStatusCard(modules)}
    </div>
    <section class="card config-card">
      <div class="card-head">
        <div>
          <b>内网配置与版本更新</b>
          <span>版本、更新 · ${autostart.guardian?.enabled ? "守护已启用" : "守护未启用"}</span>
        </div>
      </div>
      ${settingsForm(config, autostart, data.update)}
    </section>
    ${userCan("uninstall.write") ? fullUninstallPanel(data.uninstall) : ""}
  `;
}


function isPanelOpen(id) {
  return state.openPanels instanceof Set && state.openPanels.has(id);
}

function persistOpenPanels() {
  localStorage.setItem("admin_open_panels", JSON.stringify([...state.openPanels]));
}

function togglePanel(id, open) {
  if (!id) return;
  if (open === undefined) {
    if (state.openPanels.has(id)) state.openPanels.delete(id);
    else state.openPanels.add(id);
  } else if (open) {
    state.openPanels.add(id);
  } else {
    state.openPanels.delete(id);
  }
  persistOpenPanels();
  const isOpen = state.openPanels.has(id);
  const selector = `[data-toggle-panel="${cssEscape(id)}"]`;
  const buttons = document.querySelectorAll(selector);
  if (!buttons.length) {
    renderOverview();
    return;
  }
  buttons.forEach((button) => {
    const container = button.closest(".admin-foldout, .foldout-inline");
    const body = container?.querySelector(":scope > .foldout-body, :scope > .foldout-inline-body");
    container?.classList.toggle("open", isOpen);
    if (body) body.hidden = !isOpen;
    button.setAttribute("aria-expanded", isOpen ? "true" : "false");
    const action = button.querySelector("span");
    if (action) action.textContent = isOpen ? "收起" : "展开";
  });
}

function aiConfigSummary(config) {
  const ai = config.ai || {};
  const keyCount = [ai.primaryImageApiKey, ai.secondaryImageApiKey, ai.textServiceBApiKey, ai.textServiceCApiKey].filter(Boolean).length;
  const groupKeyCount = normalizeAdminAiGroupKeys(ai.groupKeys).length;
  const skillCount = normalizeAdminAiSkills(ai.aiImageSkills).length;
  return `${keyCount} 个全局 Key · ${groupKeyCount} 个小组 Key · ${skillCount} 个 Skills · 服务 A/B ${ai.imageEditModel || ai.imageService2Model || "image-model"}`;
}

function defaultTokenPricingConfig() {
  return {
    usdToCnyRate: 0,
    saleMultiplier: 1,
    models: []
  };
}

function defaultImagePricingConfig() {
  return {
    balanceCny: 0,
    saleMultiplier: 1,
    native: {
      "1K": { usdPerImage: 0 },
      "2K": { usdPerImage: 0 },
      "4K": { usdPerImage: 0 }
    }
  };
}

function normalizeAdminTokenPricing(value = {}) {
  const defaults = defaultTokenPricingConfig();
  const configuredRows = Array.isArray(value?.models) ? value.models : [];
  const rows = configuredRows.length ? [...defaults.models, ...configuredRows] : defaults.models;
  const modelMap = new Map();
  rows.map((row) => ({
    provider: String(row?.provider || "").trim(),
    model: String(row?.model || "").trim(),
    currency: String(row?.currency || (row?.inputCnyPer1M !== undefined || row?.outputCnyPer1M !== undefined ? "CNY" : "USD")).trim().toUpperCase() === "CNY" ? "CNY" : "USD",
    inputUsdPer1M: Math.max(0, Number(row?.inputUsdPer1M || 0)),
    cachedInputUsdPer1M: Math.max(0, Number(row?.cachedInputUsdPer1M || 0)),
    outputUsdPer1M: Math.max(0, Number(row?.outputUsdPer1M || 0)),
    inputCnyPer1M: Math.max(0, Number(row?.inputCnyPer1M || 0)),
    cachedInputCnyPer1M: Math.max(0, Number(row?.cachedInputCnyPer1M ?? row?.inputCnyPer1M ?? 0)),
    outputCnyPer1M: Math.max(0, Number(row?.outputCnyPer1M || 0))
  })).filter((row) => row.model).forEach((row) => {
    modelMap.set(`${row.provider}:${String(row.model || "").toLowerCase()}`, row);
  });
  const models = [...modelMap.values()];
  return {
    usdToCnyRate: Math.max(0, Number(value?.usdToCnyRate || defaults.usdToCnyRate)),
    saleMultiplier: Math.max(0, Number(value?.saleMultiplier || defaults.saleMultiplier)),
    models: models.length ? models : defaults.models
  };
}

function normalizeAdminImagePricing(value = {}) {
  const defaults = defaultImagePricingConfig();
  const native = value?.native || {};
  return {
    balanceCny: Math.max(0, Number(value?.balanceCny || defaults.balanceCny)),
    saleMultiplier: Math.max(0, Number(value?.saleMultiplier || defaults.saleMultiplier)),
    native: {
      "1K": { usdPerImage: Math.max(0, Number(native["1K"]?.usdPerImage ?? defaults.native["1K"].usdPerImage)) },
      "2K": { usdPerImage: Math.max(0, Number(native["2K"]?.usdPerImage ?? defaults.native["2K"].usdPerImage)) },
      "4K": { usdPerImage: Math.max(0, Number(native["4K"]?.usdPerImage ?? defaults.native["4K"].usdPerImage)) }
    }
  };
}

function currentAdminIsSuper() {
  return state.user?.adminRole === "super_admin" || (state.user?.permissions || []).includes("admin.roles.manage");
}

function tokenPriceRow(row, index) {
  const currency = String(row.currency || "USD").toUpperCase() === "CNY" ? "CNY" : "USD";
  const price = currency === "CNY"
    ? {
        input: row.inputCnyPer1M || 0,
        cached: row.cachedInputCnyPer1M || 0,
        output: row.outputCnyPer1M || 0
      }
    : {
        input: row.inputUsdPer1M || 0,
        cached: row.cachedInputUsdPer1M || 0,
        output: row.outputUsdPer1M || 0
      };
  return `
    <div class="token-price-row" data-token-price-row>
      <input data-token-price-field="provider" value="${escapeHtml(row.provider || "")}" placeholder="服务商" />
      <input data-token-price-field="model" value="${escapeHtml(row.model || "")}" placeholder="模型名" />
      <select data-token-price-field="currency">
        <option value="CNY" ${currency === "CNY" ? "selected" : ""}>￥</option>
        <option value="USD" ${currency === "USD" ? "selected" : ""}>$</option>
      </select>
      <input data-token-price-field="inputPer1M" type="number" min="0" step="0.001" value="${escapeHtml(price.input || 0)}" />
      <input data-token-price-field="cachedInputPer1M" type="number" min="0" step="0.001" value="${escapeHtml(price.cached || 0)}" />
      <input data-token-price-field="outputPer1M" type="number" min="0" step="0.001" value="${escapeHtml(price.output || 0)}" />
      <button class="secondary danger" type="button" data-delete-token-price="${escapeHtml(index)}">删除</button>
    </div>
  `;
}

function billingReadOnlyPanel(imagePricing, tokenUsage = null) {
  const pricing = normalizeAdminImagePricing(imagePricing);
  const billing = tokenUsage?.billing || {};
  const balance = Number(billing.balanceCny ?? pricing.balanceCny ?? 0);
  const consumed = Number(billing.consumedCny || 0);
  const remaining = Number(billing.remainingCny ?? (balance - consumed));
  return `
    <div class="token-pricing-panel">
      <div class="token-billing-kpis">
        ${moneyKpi("可用余额", balance)}
        ${moneyKpi("累计成本", consumed)}
        ${moneyKpi("预计剩余", remaining)}
      </div>
    </div>
  `;
}

function tokenPricingEditor(tokenPricing, imagePricing) {
  const pricing = normalizeAdminTokenPricing(tokenPricing);
  const images = normalizeAdminImagePricing(imagePricing);
  return `
    <div class="token-pricing-panel">
      <input id="tokenSaleMultiplier" type="hidden" value="${escapeHtml(pricing.saleMultiplier || images.saleMultiplier || 1)}" />
      <div class="settings-grid">
        <label><span>美元兑人民币汇率</span><input id="tokenUsdToCnyRate" type="number" min="0" step="0.01" value="${escapeHtml(pricing.usdToCnyRate || 0)}" /></label>
        <label><span>客户余额金额（人民币）</span><input id="billingBalanceCny" type="number" min="0" step="0.01" value="${escapeHtml(images.balanceCny || 0)}" /></label>
      </div>
      <div class="settings-grid">
        <label><span>原生 1K / 张（美元）</span><input id="native1kUsdPerImage" type="number" min="0" step="0.001" value="${escapeHtml(images.native["1K"].usdPerImage)}" /></label>
        <label><span>原生 2K / 张（美元）</span><input id="native2kUsdPerImage" type="number" min="0" step="0.001" value="${escapeHtml(images.native["2K"].usdPerImage)}" /></label>
        <label><span>原生 4K / 张（美元）</span><input id="native4kUsdPerImage" type="number" min="0" step="0.001" value="${escapeHtml(images.native["4K"].usdPerImage)}" /></label>
      </div>
      <div class="token-price-head">
        <span>服务商</span>
        <span>模型名</span>
        <span>币种</span>
        <span>输入 / 1M</span>
        <span>缓存输入 / 1M</span>
        <span>输出 / 1M</span>
        <span></span>
      </div>
      <div id="tokenPricingRows" class="token-price-list">
        ${pricing.models.map((row, index) => tokenPriceRow(row, index)).join("")}
      </div>
      <div class="actions settings-actions">
        <button id="addTokenPriceRowBtn" class="secondary small-action" type="button">新增模型单价</button>
      </div>
      <div class="empty-state compact">开源预览版不附带商业计费参数。请根据实际服务商价格自行配置汇率、模型单价和余额。</div>
    </div>
  `;
}

function usageDashboardSection(dashboard, users) {
  const data = dashboard || fallbackUsageDashboard(users);
  const summary = data.summary || {};
  const modules = data.modules || usageModules();
  const period = ["today", "week", "month", "total"].includes(state.usageDashboardPeriod) ? state.usageDashboardPeriod : "total";
  const periodLabels = { today: "今日", week: "本周", month: "本月", total: "累计" };
  const periodRanking = data.periodRankings?.[period] || data.compositeRanking || [];
  const periodModuleRankings = data.periodModuleRankings?.[period] || data.moduleRankings || {};
  const periodModuleShare = data.periodModuleShare?.[period] || data.moduleShare || [];
  const trendMax = Math.max(1, ...(data.trend || []).map((item) => Number(item.total || 0)));
  return `
    <section class="card usage-dashboard-card">
      <div class="card-head">
        <div>
          <b>用量驾驶舱</b>
          <span>老板视角看总量、活跃员工、模块占比和团队 Top</span>
        </div>
        <div class="usage-period-tabs">
          ${Object.entries(periodLabels).map(([key, label]) => `
            <button type="button" class="${key === period ? "active" : ""}" data-usage-period="${escapeHtml(key)}">${escapeHtml(label)}</button>
          `).join("")}
        </div>
      </div>
      <div class="usage-dashboard-kpis">
        ${usageKpi("今日用量", summary.today || 0, "今天新增任务")}
        ${usageKpi("本周用量", summary.week || 0, "最近 7 天")}
        ${usageKpi("本月用量", summary.month || 0, "最近 30 天")}
        ${usageKpi("活跃员工", summary.activeUsersWeek || 0, "本周有使用")}
      </div>
      ${tokenUsageCostPanel(data.tokenUsage, period, periodLabels[period])}
      <div class="usage-dashboard-layout">
        ${usageLeaderBoard(periodRanking, periodLabels[period])}
        ${usageSharePanel(periodModuleShare, modules, periodLabels[period])}
      </div>
      <div class="usage-module-grid">
        ${modules.map((meta) => usageModuleRankCard(meta, periodModuleRankings?.[meta.key] || [])).join("")}
      </div>
      <div class="usage-trend-panel">
        <div class="usage-panel-head">
          <b>最近 7 天趋势</b>
          <span>从本次上线后开始累计每日净用量</span>
        </div>
        <div class="usage-trend-bars">
          ${(data.trend || []).map((item) => `
            <div class="usage-trend-day">
              <span>${escapeHtml(shortDate(item.date))}</span>
              <i style="height:${Math.max(6, Math.round((Number(item.total || 0) / trendMax) * 100))}%"></i>
              <b>${escapeHtml(item.total || 0)}</b>
            </div>
          `).join("")}
        </div>
      </div>
    </section>
  `;
}

function usageModules() {
  return [
    { key: "aiImages", label: "AI 生图", unit: "张" },
    { key: "copywriting", label: "AI 文案", unit: "次" }
  ];
}

function fallbackUsageDashboard(users) {
  const modules = usageModules();
  const list = Array.isArray(users) ? users : [];
  const moduleTotals = Object.fromEntries(modules.map((meta) => [meta.key, list.reduce((sum, user) => sum + Number(user.usage?.[meta.key] || 0), 0)]));
  const total = Object.values(moduleTotals).reduce((sum, value) => sum + Number(value || 0), 0);
  const compositeRanking = list.map((user) => {
    const usage = Object.fromEntries(modules.map((meta) => [meta.key, Number(user.usage?.[meta.key] || 0)]));
    return {
      userId: user.id,
      username: user.username,
      displayName: user.displayName || user.username,
      usage,
      total: Object.values(usage).reduce((sum, value) => sum + value, 0)
    };
  }).sort((a, b) => b.total - a.total);
  const moduleRankings = Object.fromEntries(modules.map((meta) => [meta.key, list.map((user) => ({
    userId: user.id,
    username: user.username,
    displayName: user.displayName || user.username,
    value: Number(user.usage?.[meta.key] || 0)
  })).sort((a, b) => b.value - a.value).slice(0, 5)]));
  const moduleShare = modules.map((meta) => ({ ...meta, value: moduleTotals[meta.key], percent: total ? Math.round((moduleTotals[meta.key] / total) * 1000) / 10 : 0 }));
  return {
    modules,
    summary: { today: 0, week: 0, month: 0, total, activeUsersWeek: 0 },
    compositeRanking,
    moduleRankings,
    moduleShare,
    periodRankings: { today: [], week: [], month: [], total: compositeRanking },
    periodModuleRankings: { today: {}, week: {}, month: {}, total: moduleRankings },
    periodModuleShare: { today: [], week: [], month: [], total: moduleShare },
    tokenUsage: emptyTokenDashboard(),
    trend: []
  };
}

function emptyTokenTotals() {
  return { calls: 0, pricedCalls: 0, unpricedCalls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, totalTokens: 0, imageCount: 0, estimatedCostUsd: 0, estimatedCostCny: 0, models: [] };
}

function emptyTokenDashboard() {
  const empty = emptyTokenTotals();
  return {
    summary: { today: empty, week: empty, month: empty, total: empty },
    periodUsers: { today: [], week: [], month: [], total: [] },
    periodModels: { today: [], week: [], month: [], total: [] }
  };
}

function tokenUsageCostPanel(tokenUsage, period, periodLabel) {
  const dashboard = tokenUsage || emptyTokenDashboard();
  const summary = dashboard.summary?.[period] || emptyTokenTotals();
  const users = dashboard.periodUsers?.[period] || [];
  const models = dashboard.periodModels?.[period] || summary.models || [];
  const billing = dashboard.billing || {};
  return `
    <div class="token-cost-panel">
      <div class="usage-panel-head">
        <div>
          <b>AI 成本与余额</b>
          <span>${escapeHtml(periodLabel)}</span>
        </div>
        <span>${summary.unpricedCalls ? `${escapeHtml(summary.unpricedCalls)} 次未配置单价` : ""}</span>
      </div>
      <div class="token-billing-kpis">
        ${moneyKpi("后台余额", billing.balanceCny || 0)}
        ${moneyKpi("累计成本", billing.consumedCny || 0)}
        ${moneyKpi("预计剩余", billing.remainingCny || 0)}
      </div>
      <div class="token-cost-kpis">
        ${usageKpi("Token 总量", formatCompactNumber(summary.totalTokens || 0))}
        ${usageKpi("估算美元", formatMoneyUsd(summary.estimatedCostUsd || 0))}
        ${usageKpi("估算人民币", formatMoneyCny(summary.estimatedCostCny || 0))}
      </div>
      <div class="token-cost-grid">
        <article class="usage-leader-card">
          <div class="usage-panel-head"><b>员工成本 Top</b><span>${escapeHtml(periodLabel)}</span></div>
          ${users.length ? `<div class="usage-leader-list">
            ${users.slice(0, 6).map((item, index) => `
              <div class="usage-leader-row top-${index + 1}">
                <span class="rank-medal">${index + 1}</span>
                <span class="rank-main">
                  <strong>${escapeHtml(item.displayName || item.username || "-")}</strong>
                  <small>${escapeHtml(costUsageDetail(item))}</small>
                </span>
                <span class="rank-value">${escapeHtml(formatMoneyCny(item.estimatedCostCny || 0))}</span>
              </div>
            `).join("")}
          </div>` : `<div class="empty-state compact">暂无 Token 记录</div>`}
        </article>
        <article class="usage-share-card">
          <div class="usage-panel-head"><b>模型成本</b><span>Top 8</span></div>
          ${models.length ? `<div class="token-model-list">
            ${models.map((item) => `
              <div>
                <span><b>${escapeHtml(item.model || "unknown")}</b><small>${escapeHtml(item.provider || "provider")}</small></span>
                <em>${escapeHtml(costUsageDetail(item))}</em>
                <strong>${escapeHtml(formatMoneyCny(item.estimatedCostCny || 0))}</strong>
              </div>
            `).join("")}
          </div>` : `<div class="empty-state compact">暂无模型用量</div>`}
        </article>
      </div>
    </div>
  `;
}

function costUsageDetail(item = {}) {
  if (Number(item.imageCount || 0) > 0) return `${formatCompactNumber(item.imageCount)} 张`;
  return `${formatCompactNumber(item.totalTokens || 0)} tokens`;
}

function usageKpi(label, value, subtext) {
  return `
    <article class="usage-kpi-card">
      <span>${escapeHtml(label)}</span>
      <b>${escapeHtml(formatCompactNumber(value))}</b>
      ${subtext ? `<small>${escapeHtml(subtext)}</small>` : ""}
    </article>
  `;
}

function moneyKpi(label, value, subtext) {
  return `
    <article class="usage-kpi-card">
      <span>${escapeHtml(label)}</span>
      <b>${escapeHtml(formatMoneyCny(value))}</b>
      ${subtext ? `<small>${escapeHtml(subtext)}</small>` : ""}
    </article>
  `;
}

function usageLeaderBoard(rows, periodLabel = "累计") {
  const ranked = (rows || []).slice(0, 8);
  return `
    <article class="usage-leader-card">
      <div class="usage-panel-head">
        <b>综合员工 Top</b>
        <span>${escapeHtml(periodLabel)} · 四类任务相加</span>
      </div>
      ${ranked.length ? `<div class="usage-leader-list">
        ${ranked.map((item, index) => `
          <div class="usage-leader-row top-${index + 1}">
            <span class="rank-medal">${index + 1}</span>
            <span class="rank-main">
              <strong>${escapeHtml(item.displayName || item.username || "-")}</strong>
              <small>${escapeHtml(item.username || "")}</small>
            </span>
            <span class="rank-value">${escapeHtml(formatCompactNumber(item.total || 0))}</span>
          </div>
        `).join("")}
      </div>` : `<div class="empty-state compact">暂无用量</div>`}
    </article>
  `;
}

function usageSharePanel(share, modules, periodLabel = "累计") {
  const rows = modules.map((meta) => share.find((item) => item.key === meta.key) || { ...meta, value: 0, percent: 0 });
  return `
    <article class="usage-share-card">
      <div class="usage-panel-head">
        <b>模块占比</b>
        <span>${escapeHtml(periodLabel)} · 看主要消耗在哪</span>
      </div>
      <div class="usage-share-strip">
        ${rows.map((item) => `<i class="usage-color-${escapeHtml(item.key)}" style="width:${Math.max(2, Number(item.percent || 0))}%"></i>`).join("")}
      </div>
      <div class="usage-share-list">
        ${rows.map((item) => `
          <div>
            <span><i class="usage-dot usage-color-${escapeHtml(item.key)}"></i>${escapeHtml(item.label)}</span>
            <b>${escapeHtml(formatCompactNumber(item.value || 0))} ${escapeHtml(item.unit || "")}</b>
            <small>${escapeHtml(item.percent || 0)}%</small>
          </div>
        `).join("")}
      </div>
    </article>
  `;
}

function usageModuleRankCard(meta, rows) {
  const ranked = (rows || []).slice(0, 5);
  const max = Math.max(1, ...ranked.map((item) => Number(item.value || 0)));
  return `
    <article class="usage-module-card usage-module-${escapeHtml(meta.key)}">
      <div class="usage-panel-head">
        <b>${escapeHtml(meta.label)}</b>
        <span>Top 5</span>
      </div>
      ${ranked.length ? ranked.map((item) => `
        <div class="usage-bar-row">
          <span>${escapeHtml(item.displayName || item.username || "-")}</span>
          <b>${escapeHtml(item.value || 0)}${escapeHtml(meta.unit || "")}</b>
          <i><em style="width:${Math.round((Number(item.value || 0) / max) * 100)}%"></em></i>
        </div>
      `).join("") : `<div class="empty-state compact">暂无用量</div>`}
    </article>
  `;
}

function formatCompactNumber(value) {
  if (typeof value === "string" && value.trim() && !Number.isFinite(Number(value))) return value;
  const number = Number(value || 0);
  if (number >= 10000) return `${(number / 10000).toFixed(1)}万`;
  return String(number);
}

function formatMoneyUsd(value) {
  const number = Number(value || 0);
  if (number >= 1) return `$${number.toFixed(2)}`;
  if (number > 0) return `$${number.toFixed(4)}`;
  return "$0.00";
}

function formatMoneyCny(value) {
  const number = Number(value || 0);
  if (number >= 1) return `￥${number.toFixed(2)}`;
  if (number > 0) return `￥${number.toFixed(4)}`;
  return "￥0.00";
}

function shortDate(value) {
  const text = String(value || "");
  return text.length >= 10 ? text.slice(5) : text;
}

function aiGallerySection(gallery, users) {
  const items = Array.isArray(gallery?.recent) ? gallery.recent : [];
  const total = Number(gallery?.total ?? gallery?.stored ?? 0);
  const totalGenerated = Number(gallery?.totalGenerated || 0);
  const offset = Number(gallery?.offset ?? state.gallery.offset ?? 0);
  const limit = Number(gallery?.limit ?? state.gallery.limit ?? 12);
  const selectedAccount = String(gallery?.account ?? state.gallery.account ?? "");
  const expanded = Boolean(state.gallery.expanded);
  const start = expanded && total ? offset + 1 : 0;
  const end = expanded && total ? Math.min(offset + items.length, total) : 0;
  const accountOptions = galleryAccountOptions(gallery, users, selectedAccount);
  return `
    <section class="card">
      <div class="card-head">
        <div>
          <b>AI 生图留档</b>
          <span>累计 ${escapeHtml(totalGenerated)} 张，当前筛选 ${escapeHtml(total)} 张${expanded ? `，显示 ${escapeHtml(start)}-${escapeHtml(end)}` : "，预览已收起"}</span>
        </div>
        <button id="refreshGalleryBtn" class="secondary small-action" type="button">刷新</button>
      </div>
      <div class="gallery-notice">图片预览默认收起，点击展开后才会加载缩略图；“打开文件夹”会在实操机屏幕上打开本地目录。</div>
      <div class="gallery-toolbar">
        <label>
          <span>按员工筛选</span>
          <select id="galleryAccountFilter">
            <option value="">全部员工</option>
            ${accountOptions.map((item) => `<option value="${escapeHtml(item.value)}" ${item.value === selectedAccount ? "selected" : ""}>${escapeHtml(item.label)}</option>`).join("")}
          </select>
        </label>
        <div class="gallery-actions">
          <button id="toggleGalleryPreviewBtn" class="secondary small-action" type="button">${expanded ? "收起预览" : "展开预览"}</button>
          <button id="openGalleryFolderBtn" class="secondary small-action" type="button">打开实操机图片文件夹</button>
          <button id="galleryPrevBtn" class="secondary small-action" type="button" ${expanded && offset > 0 ? "" : "disabled"}>上一页</button>
          <button id="galleryNextBtn" class="secondary small-action" type="button" ${expanded && gallery?.hasMore ? "" : "disabled"}>下一页</button>
          <button id="downloadGalleryBtn" class="primary small-action" type="button" ${total ? "" : "disabled"}>下载当前筛选</button>
        </div>
      </div>
      ${expanded ? aiGalleryPanel(gallery) : `<div class="empty-state compact">预览已收起。需要看图时再展开，后台会更快。</div>`}
    </section>
  `;
}

function galleryAccountOptions(gallery, users, selectedAccount = "") {
  const map = new Map();
  const add = (value, label, count = 0) => {
    const key = String(value || "").trim();
    if (!key || map.has(key)) return;
    map.set(key, { value: key, label: `${label || key}${count ? ` · ${count} 张` : ""}` });
  };
  (gallery?.accounts || []).forEach((item) => {
    add(item.id || item.username || item.displayName, item.displayName || item.username || item.id, Number(item.count || 0));
  });
  (users || []).forEach((user) => {
    add(user.id || user.username, user.displayName || user.username, Number(user.usage?.aiImages || 0));
  });
  if (selectedAccount && !map.has(selectedAccount)) {
    add(selectedAccount, selectedAccount);
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, "zh-Hans-CN"));
}

function aiGalleryPanel(gallery) {
  const items = Array.isArray(gallery?.recent) ? gallery.recent : [];
  if (!items.length) {
    return `<div class="empty-state compact">还没有 AI 生图留档。员工端生图成功后会自动保存到实操机。</div>`;
  }
  return `
    <div class="ai-gallery-grid">
      ${items.map((item) => `
        <a class="ai-gallery-card" href="${escapeHtml(item.imageUrl || "#")}" target="_blank" rel="noreferrer" title="打开大图预览">
          <img src="${escapeHtml(item.imageUrl || "")}" alt="${escapeHtml(item.fileName || "AI 生图")}" loading="lazy" />
          <b>${escapeHtml(item.provider || "AI")}</b>
          <span>${escapeHtml(item.account?.displayName || item.account?.username || "未知账户")} · ${escapeHtml(formatDateTime(item.createdAt))}</span>
          <small>${escapeHtml(item.model || "-")} · ${escapeHtml(formatFileSize(item.bytes || 0))}</small>
        </a>
      `).join("")}
    </div>
  `;
}

function normalizeAdminMaintenance(value = {}) {
  const allowlist = Array.isArray(value.allowlist)
    ? value.allowlist
    : String(value.allowlist || "").split(/[\n\r,，;；]+/);
  return {
    enabled: value.enabled === true,
    active: value.active === true,
    title: String(value.title || "系统维护中").trim() || "系统维护中",
    message: String(value.message || "电商 AI 画布系统正在维护升级，预计维护结束后恢复使用。").trim(),
    detail: String(value.detail || "维护期间暂无法登录使用，请稍后再试。").trim(),
    endsAt: String(value.endsAt || "").trim(),
    allowlist: allowlist.map((item) => String(item || "").trim()).filter(Boolean),
    updatedAt: String(value.updatedAt || "").trim()
  };
}

function normalizeAdminPrivacy(value = {}) {
  const retention = value.retention && typeof value.retention === "object"
    ? value.retention
    : {};
  const days = (field, fallback) => {
    const parsed = Number(retention[field]);
    return Number.isFinite(parsed) ? Math.max(1, Math.min(3650, Math.round(parsed))) : fallback;
  };
  return {
    operatorContact: String(value.operatorContact || "").trim(),
    retention: {
      enabled: retention.enabled !== false,
      automaticFailureDays: days("automaticFailureDays", 30),
      feedbackDays: days("feedbackDays", 180),
      conversationsDays: days("conversationsDays", 365),
      canvasProjectsDays: days("canvasProjectsDays", 365),
      generatedImagesDays: days("generatedImagesDays", 90),
      cleanupIntervalHours: Math.max(1, Math.min(168, Math.round(Number(retention.cleanupIntervalHours || 24))))
    }
  };
}

function maintenanceDateInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function dateTimeLocalToIso(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text.slice(0, 80) : date.toISOString();
}

function settingsForm(config, autostart, update) {
  const updates = config.updates || {};
  const appliance = config.appliance || {};
  const maintenance = normalizeAdminMaintenance(config.maintenance || {});
  const privacy = normalizeAdminPrivacy(config.privacy || {});
  const maintenanceSummary = maintenance.enabled
    ? `${maintenance.active ? "生效中" : "已开启但已过期"} · 白名单 ${maintenance.allowlist.length} 个`
    : `未开启 · 白名单 ${maintenance.allowlist.length} 个`;
  const retentionSummary = privacy.retention.enabled
    ? tr("retentionEnabledSummary", "Automatic cleanup is enabled")
    : tr("retentionDisabledSummary", "Automatic cleanup is disabled");
  return `
    <div class="settings-section-stack">
      ${settingsSectionCard("应用基础信息", `${appliance.companyName || "未填写公司"} · ${appliance.name || "AI 创作画布"}`, `
        <div class="settings-grid">
          <label><span>客户/公司名称</span><input id="companyName" value="${escapeHtml(appliance.companyName || "")}" placeholder="例如：某某电商公司" /></label>
          <label><span>应用名称</span><input id="applianceName" value="${escapeHtml(appliance.name || "AI 创作画布")}" /></label>
        </div>
      `)}
      ${settingsSectionCard("员工端维护模式", maintenanceSummary, `
        <div class="settings-grid">
          <label class="toggle-line"><input id="maintenanceEnabled" type="checkbox" ${maintenance.enabled ? "checked" : ""} />开启维护模式</label>
          <label><span>维护标题</span><input id="maintenanceTitle" value="${escapeHtml(maintenance.title)}" placeholder="系统维护中" /></label>
          <label><span>预计恢复时间</span><input id="maintenanceEndsAt" type="datetime-local" value="${escapeHtml(maintenanceDateInputValue(maintenance.endsAt))}" /></label>
          <label class="span-2"><span>维护提示</span><textarea id="maintenanceMessage" rows="3">${escapeHtml(maintenance.message)}</textarea></label>
          <label class="span-2"><span>补充说明</span><textarea id="maintenanceDetail" rows="2">${escapeHtml(maintenance.detail)}</textarea></label>
          <label class="span-2"><span>白名单账号 / 显示名</span><textarea id="maintenanceAllowlist" rows="3" placeholder="每行一个，例如：员工姓名">${escapeHtml(maintenance.allowlist.join("\n"))}</textarea></label>
        </div>
        <div class="maintenance-config-note">
          <b>${maintenance.enabled ? "开关已开启" : "当前未开启"}</b>
          <span>开启后，除白名单账号或显示名外，员工端登录和功能接口都会显示维护提示；管理后台不受影响。</span>
        </div>
      `)}
      ${settingsSectionCard(tr("privacyAndRetention", "Privacy and retention"), retentionSummary, `
        <div class="settings-grid">
          <label class="span-2">
            <span>${escapeHtml(tr("operatorContact", "Operator contact"))}</span>
            <input id="privacyOperatorContact" value="${escapeHtml(privacy.operatorContact)}" placeholder="${escapeHtml(tr("operatorContactPlaceholder", "Email or support channel"))}" />
          </label>
          <label class="toggle-line span-2">
            <input id="retentionEnabled" type="checkbox" ${privacy.retention.enabled ? "checked" : ""} />
            ${escapeHtml(tr("enableAutomaticCleanup", "Enable automatic cleanup"))}
          </label>
          <label><span>${escapeHtml(tr("automaticFailureDays", "Automatic failure logs (days)"))}</span><input id="automaticFailureDays" type="number" min="1" max="3650" value="${privacy.retention.automaticFailureDays}" /></label>
          <label><span>${escapeHtml(tr("feedbackDays", "Employee feedback (days)"))}</span><input id="feedbackDays" type="number" min="1" max="3650" value="${privacy.retention.feedbackDays}" /></label>
          <label><span>${escapeHtml(tr("conversationsDays", "Conversations (days)"))}</span><input id="conversationsDays" type="number" min="1" max="3650" value="${privacy.retention.conversationsDays}" /></label>
          <label><span>${escapeHtml(tr("canvasProjectsDays", "Canvas projects and unused assets (days)"))}</span><input id="canvasProjectsDays" type="number" min="1" max="3650" value="${privacy.retention.canvasProjectsDays}" /></label>
          <label><span>${escapeHtml(tr("generatedImagesDays", "Generated-image archive (days)"))}</span><input id="generatedImagesDays" type="number" min="1" max="3650" value="${privacy.retention.generatedImagesDays}" /></label>
          <label><span>${escapeHtml(tr("cleanupIntervalHours", "Cleanup interval (hours)"))}</span><input id="cleanupIntervalHours" type="number" min="1" max="168" value="${privacy.retention.cleanupIntervalHours}" /></label>
        </div>
        <div class="maintenance-config-note">
          <b>${escapeHtml(tr("failureLoggingNoticeTitle", "Failure logging is enabled"))}</b>
          <span>${escapeHtml(tr("failureLoggingNoticeBody", "The employee notice explains that failed AI tasks may retain prompts, references, account details, provider, and model for troubleshooting."))}</span>
        </div>
      `)}
      ${settingsSectionCard("版本更新配置", `当前 ${updates.currentVersion || "0.1.0-preview.22"} · 最新 ${updates.latestVersion || "未填写"}`, `
        <div class="settings-grid">
          <label><span>当前版本</span><input id="currentVersion" value="${escapeHtml(updates.currentVersion || "0.1.0-preview.22")}" /></label>
          <label><span>最新版本</span><input id="latestVersion" value="${escapeHtml(updates.latestVersion || "")}" /></label>
          <label><span>更新包地址</span><input id="packageUrl" value="${escapeHtml(updates.packageUrl || "")}" placeholder="内网 ZIP / EXE 下载地址" /></label>
          <label class="span-2"><span>更新说明</span><textarea id="releaseNote" rows="3">${escapeHtml(updates.releaseNote || "")}</textarea></label>
        </div>
        ${updatePanel(update, updates)}
      `)}
    </div>
    <div class="actions settings-actions">
      <button id="saveConfigBtn" class="primary" type="button">保存中控配置</button>
      <button class="secondary" data-autostart-target="guardian" data-autostart-enabled="true" type="button">启用无人值守守护</button>
      <button class="secondary" data-autostart-target="guardian" data-autostart-enabled="false" type="button">关闭无人值守守护</button>
      <span class="muted">守护：${autostart.guardian?.enabled ? "已启用" : "未启用"}</span>
    </div>
  `;
}

function settingsSectionCard(title, summary, body) {
  return `
    <section class="settings-section-card">
      <div class="settings-section-head">
        <b>${escapeHtml(title)}</b>
        <span>${escapeHtml(summary || "")}</span>
      </div>
      ${body}
    </section>
  `;
}

function fullUninstallPanel(uninstall = {}) {
  const status = String(uninstall?.status || "idle");
  const pending = status === "awaiting-local-confirmation";
  const statusText = {
    idle: "未发起",
    unavailable: "维护 Agent 未在线",
    "awaiting-local-confirmation": "等待实操机本地确认",
    expired: "确认已过期",
    cancelled: "已取消",
    starting: "正在彻底卸载"
  }[status] || status;
  const expires = pending && uninstall?.expiresAt
    ? `，${formatDateTime(uninstall.expiresAt)} 前有效`
    : "";
  return `
    <section class="card full-uninstall-panel" data-uninstall-status="${escapeHtml(status)}">
      <div class="full-uninstall-head">
        <div>
          <small>DESTRUCTIVE ACTION</small>
          <b>彻底卸载电商 AI 画布</b>
          <span>远程只能发起申请，实操机必须由本地 Windows 管理员二次确认。</span>
        </div>
        <em>${escapeHtml(statusText)}</em>
      </div>
      <div class="full-uninstall-scope">
        <b>确认后不保留电商 AI 画布管理目录中的本机副本</b>
        <span>删除电商 AI 画布代码、数据库、图片、素材、配置、API 密钥、日志、缓存、本地备份、导出包、服务、自启动项和维护 Agent。</span>
        <span>删除范围固定为电商 AI 画布安装目录及其专用更新目录，网页不能传入其他路径。</span>
        <span>手动复制到电商 AI 画布目录以外的文件不会自动扫描或删除。</span>
      </div>
      ${pending ? `
        <div class="full-uninstall-pending">
          <b>等待本机确认${escapeHtml(expires)}</b>
          <span>请在实操机上以管理员身份运行 <code>Confirm-Full-Uninstall-Admin.bat</code>，重新输入本机显示的 6 位确认码和“彻底卸载电商 AI 画布”。</span>
        </div>
      ` : ""}
      <div class="full-uninstall-actions">
        <button id="requestFullUninstallBtn" class="primary destructive" type="button" ${pending || status === "starting" ? "disabled" : ""}>发起彻底卸载</button>
        ${pending ? `<button id="cancelFullUninstallBtn" class="secondary" type="button">取消申请</button>` : ""}
        <span>${escapeHtml(uninstall?.message || "发起后不会立即删除，15 分钟内未完成本机确认会自动失效。")}</span>
      </div>
    </section>
  `;
}

function aiSettingsForm(config) {
  const ai = config.ai || {};
  const providerImageDefault = "image-model";
  const normalizeProviderImageModel = (model) => {
    const value = String(model || "").trim();
    return value || providerImageDefault;
  };
  const imageTextModel = normalizeProviderImageModel(ai.imageTextModel || ai.imageService1Model);
  const imageEditModel = normalizeProviderImageModel(ai.imageEditModel || ai.imageService2Model);
  const remoteImageBed = ai.remoteImageBed || {};
  const objectStorage = ai.objectStorage || {};
  const cloudSync = ai.cloudSync || {};
  const objectStorageSummary = objectStorage.enabled && objectStorage.endpoint && objectStorage.bucket
    ? `${objectStorage.bucket} · ${objectStorage.region || "auto"}${cloudSync.enabled ? " · 云端副本" : ""}`
    : "未启用";
  const remoteImageBedSummary = remoteImageBed.enabled && remoteImageBed.namespace && remoteImageBed.project
    ? `${remoteImageBed.namespace}/${remoteImageBed.project} · ${remoteImageBed.revision || remoteImageBed.branch || "main"}`
    : "未启用";
  const imagePricing = normalizeAdminImagePricing(ai.imagePricing || {});
  const tokenPricing = normalizeAdminTokenPricing(ai.tokenPricing || {});
  const canManageBilling = currentAdminIsSuper();
  const skills = normalizeAdminAiSkills(ai.aiImageSkills);
  const selectedSkillId = skills.some((skill) => skill.id === state.selectedSkillId) ? state.selectedSkillId : (skills[0]?.id || "none");
  state.selectedSkillId = selectedSkillId;
  const groupKeys = normalizeAdminAiGroupKeys(ai.groupKeys);
  const configuredKeys = [
    ["图片服务 A", ai.primaryImageApiKey],
    ["图片服务 B", ai.secondaryImageApiKey],
    ["文本服务 A", ai.textServiceBApiKey],
    ["文本服务 B", ai.textServiceCApiKey]
  ].filter((item) => item[1]).map((item) => item[0]).join("、") || "未配置 Key";
  const sections = [
    {
      id: "keys",
      title: "API Key 配置",
      summary: configuredKeys,
      body: `
        <div class="settings-grid">
          <label><span>图片服务 A Key</span><input id="primaryImageApiKey" type="password" autocomplete="new-password" value="${escapeHtml(ai.primaryImageApiKey || "")}" placeholder="填写图片服务 A 的密钥" /></label>
          <label><span>图片服务 B Key</span><input id="secondaryImageApiKey" type="password" autocomplete="new-password" value="${escapeHtml(ai.secondaryImageApiKey || "")}" placeholder="备用图片服务密钥" /></label>
          <label><span>图片服务 B Base URL</span><input id="secondaryImageBaseUrl" value="${escapeHtml(ai.secondaryImageBaseUrl || "")}" placeholder="填写服务 B 的兼容接口地址" /></label>
          <label><span>文本服务 A API Key</span><input id="textServiceBApiKey" type="password" autocomplete="new-password" value="${escapeHtml(ai.textServiceBApiKey || "")}" placeholder="填写文本服务 A 的密钥" /></label>
          <label><span>文本服务 B API Key</span><input id="textServiceCApiKey" type="password" autocomplete="new-password" value="${escapeHtml(ai.textServiceCApiKey || "")}" placeholder="填写文本服务 B 的密钥" /></label>
        </div>
      `
    },
    {
      id: "group-keys",
      title: "小组 Key 配置",
      summary: `${groupKeys.length} 个小组 Key · 只覆盖 Key`,
      body: aiGroupKeysEditor(groupKeys)
    },
    {
      id: "object-storage",
      title: "对象存储签名 URL",
      summary: objectStorageSummary,
      body: `
        <div class="settings-grid">
          <label class="toggle-line"><input id="objectStorageEnabled" type="checkbox" ${objectStorage.enabled ? "checked" : ""} />启用对象存储</label>
          <label><span>Endpoint</span><input id="objectStorageEndpoint" value="${escapeHtml(objectStorage.endpoint || "")}" placeholder="https://storage.example.invalid" /></label>
          <label><span>Region</span><input id="objectStorageRegion" value="${escapeHtml(objectStorage.region || "auto")}" placeholder="auto" /></label>
          <label><span>Bucket</span><input id="objectStorageBucket" value="${escapeHtml(objectStorage.bucket || "")}" placeholder="私有桶名称" /></label>
          <label><span>Access Key ID</span><input id="objectStorageAccessKeyId" value="${escapeHtml(objectStorage.accessKeyId || "")}" autocomplete="new-password" /></label>
          <label><span>Secret Access Key</span><input id="objectStorageSecretAccessKey" type="password" value="${escapeHtml(objectStorage.secretAccessKey || "")}" autocomplete="new-password" /></label>
          <label><span>Path Prefix</span><input id="objectStoragePathPrefix" value="${escapeHtml(objectStorage.pathPrefix || "images")}" placeholder="images" /></label>
          <label><span>签名有效期（秒）</span><input id="objectStorageExpiresSeconds" type="number" min="60" max="604800" step="60" value="${escapeHtml(objectStorage.expiresSeconds || 3600)}" /></label>
          <label class="toggle-line"><input id="objectStorageForcePathStyle" type="checkbox" ${objectStorage.forcePathStyle !== false ? "checked" : ""} />使用 Path-Style 地址</label>
        </div>
        <div class="settings-subsection">
          <b>本机/内网保存 + 可选云端副本</b>
          <span>本机仍是主存储；启用后使用上面的同一对象存储桶，异步保存对话和画布项目副本。云端暂不参与员工端读取。</span>
          <div class="settings-grid">
            <label class="toggle-line"><input id="cloudSyncEnabled" type="checkbox" ${cloudSync.enabled ? "checked" : ""} />启用云端副本</label>
            <label><span>云端路径前缀</span><input id="cloudSyncPathPrefix" value="${escapeHtml(cloudSync.pathPrefix || "backups")}" placeholder="backups" /></label>
            <label class="toggle-line"><input id="cloudSyncIncludeProjects" type="checkbox" ${cloudSync.includeProjects !== false ? "checked" : ""} />同步画布项目</label>
            <label class="toggle-line"><input id="cloudSyncIncludeConversations" type="checkbox" ${cloudSync.includeConversations !== false ? "checked" : ""} />同步 AI 对话</label>
            <label class="toggle-line"><input id="cloudSyncIncludeAssets" type="checkbox" ${cloudSync.includeAssets !== false ? "checked" : ""} />同步关联图片素材</label>
            <label><span>上传超时（秒）</span><input id="cloudSyncTimeoutSeconds" type="number" min="5" max="120" step="5" value="${escapeHtml(cloudSync.timeoutSeconds || 45)}" /></label>
          </div>
        </div>
      `
    },
    {
      id: "image-bed",
      title: "远程图片存储配置",
      summary: remoteImageBedSummary,
      body: `
        <div class="settings-grid">
          <label class="toggle-line"><input id="remoteImageBedEnabled" type="checkbox" ${remoteImageBed.enabled ? "checked" : ""} />启用远程图片存储</label>
          <label><span>服务接口地址</span><input id="remoteImageBedApiBaseUrl" value="${escapeHtml(remoteImageBed.apiBaseUrl || "")}" placeholder="由你选择的服务提供" /></label>
          <label><span>访问地址前缀</span><input id="remoteImageBedRawBaseUrl" value="${escapeHtml(remoteImageBed.rawBaseUrl || "")}" placeholder="可选，用于读取公开图片" /></label>
          <label><span>命名空间</span><input id="remoteImageBedNamespace" value="${escapeHtml(remoteImageBed.namespace || remoteImageBed.owner || "")}" placeholder="服务命名空间" /></label>
          <label><span>项目</span><input id="remoteImageBedProject" value="${escapeHtml(remoteImageBed.project || remoteImageBed.repo || "")}" placeholder="服务项目名" /></label>
          <label><span>版本</span><input id="remoteImageBedRevision" value="${escapeHtml(remoteImageBed.revision || remoteImageBed.branch || "main")}" placeholder="main 或默认版本" /></label>
          <label><span>路径前缀</span><input id="remoteImageBedPathPrefix" value="${escapeHtml(remoteImageBed.pathPrefix || remoteImageBed.basePath || "images")}" placeholder="images" /></label>
          <label><span>远程服务令牌</span><input id="remoteImageBedToken" type="password" autocomplete="new-password" value="${escapeHtml(remoteImageBed.token || "")}" placeholder="远程存储写入权限" /></label>
        </div>
      `
    },
    {
      id: "image",
      title: "生图模型配置",
      summary: `图片服务 A/B · 文生图 ${imageTextModel} · 图生图 ${imageEditModel}`,
      body: `
        <div class="settings-grid">
          <label><span>图片服务文生图模型</span><input id="imageTextModel" value="${escapeHtml(imageTextModel)}" placeholder="${escapeHtml(providerImageDefault)}" /></label>
          <label><span>图片服务图生图模型</span><input id="imageEditModel" value="${escapeHtml(imageEditModel)}" placeholder="${escapeHtml(providerImageDefault)}" /></label>
        </div>
      `
    },
    {
      id: "thinking",
      title: "思考模型配置",
      summary: `标准 ${ai.standardReasoningModel || "reasoning-model"} · 深度 ${ai.deepReasoningModel || "deep-reasoning-model"}`,
      body: `
        <div class="settings-grid">
          <label><span>标准思考模型</span><input id="standardReasoningModel" value="${escapeHtml(ai.standardReasoningModel || "reasoning-model")}" placeholder="填写思考服务模型名" /></label>
          <label><span>深度思考模型</span><input id="deepReasoningModel" value="${escapeHtml(ai.deepReasoningModel || "deep-reasoning-model")}" placeholder="填写思考服务模型名" /></label>
        </div>
      `
    },
    {
      id: "copy",
      title: "文案模型配置",
      summary: `文本服务 A ${ai.primaryTextModel || "未填"} · 文本服务 B ${ai.textServiceBModel || "未填"} · 文本服务 C ${ai.textServiceCModel || "未填"}`,
      body: `
        <div class="settings-grid">
          <label><span>文本服务 A 文案模型</span><input id="primaryTextModel" value="${escapeHtml(ai.primaryTextModel || "")}" /></label>
          <label><span>文本服务 B 文案模型</span><input id="textServiceBModel" value="${escapeHtml(ai.textServiceBModel || "")}" /></label>
          <label><span>文本服务 C 文案模型</span><input id="textServiceCModel" value="${escapeHtml(ai.textServiceCModel || "")}" /></label>
        </div>
      `
    },
    {
      id: "cost",
      title: "AI 成本与余额",
      summary: canManageBilling
        ? `余额 ${formatMoneyCny(imagePricing.balanceCny)} · ${tokenPricing.models.length} 个模型单价`
        : `余额 ${formatMoneyCny(imagePricing.balanceCny)}`,
      body: canManageBilling
        ? tokenPricingEditor(ai.tokenPricing, ai.imagePricing)
        : billingReadOnlyPanel(ai.imagePricing, state.overview?.accounts?.usageDashboard?.tokenUsage)
    },
    {
      id: "skills",
      title: "AI 生图 Skills 配置",
      summary: `${skills.length} 个 Skills · 员工端下拉使用`,
      body: `
        <div class="skills-config-panel">
          <div class="skills-config-head">
            <div>
              <b>选择一个 Skill 编辑</b>
              <span>只展示当前选中的 Skill，避免全部卡片铺满后台。</span>
            </div>
            <button id="addAiSkillBtn" class="secondary small-action" type="button">新增 Skill</button>
          </div>
          <label class="skill-select-line">
            <span>当前 Skill</span>
            <select id="adminSkillSelect">
              ${skills.map((skill) => `<option value="${escapeHtml(skill.id)}" ${skill.id === selectedSkillId ? "selected" : ""}>${escapeHtml(skill.name || skill.id)} · ${escapeHtml(skill.type || "通用")}</option>`).join("")}
            </select>
          </label>
          <div id="aiSkillsEditor" class="skills-editor">
            ${skills.map((skill, index) => aiSkillEditorCard(skill, index, selectedSkillId)).join("")}
          </div>
        </div>
      `
    }
  ];
  const activeSection = sections.some((section) => section.id === state.activeAiConfigSection) ? state.activeAiConfigSection : "image";
  state.activeAiConfigSection = activeSection;
  return `
    <div class="config-switcher">
      <div class="config-tab-list" role="tablist" aria-label="AI 配置项目">
        ${sections.map((section) => `
          <button class="${section.id === activeSection ? "active" : ""}" type="button" role="tab" aria-selected="${section.id === activeSection ? "true" : "false"}" data-ai-config-tab="${escapeHtml(section.id)}">
            <b>${escapeHtml(section.title)}</b>
            <span>${escapeHtml(section.summary || "")}</span>
          </button>
        `).join("")}
      </div>
      <div class="config-switcher-body">
        ${sections.map((section) => `
          <section class="config-switch-section" data-ai-config-section="${escapeHtml(section.id)}" ${section.id === activeSection ? "" : "hidden"}>
            <div class="config-switch-section-head">
              <b>${escapeHtml(section.title)}</b>
              <span>${escapeHtml(section.summary || "")}</span>
            </div>
            ${section.body}
          </section>
        `).join("")}
      </div>
    </div>
    <div class="actions settings-actions">
      <button id="saveAiConfigBtn" class="primary" type="button">保存 AI 模型配置</button>
    </div>
  `;
}

function normalizeAdminAiSkills(value) {
  const defaults = [
    { id: "none", name: "未选择", type: "通用", description: "不追加品牌或行业约束，只按当前对话需求生成。", prompt: "", enabled: true },
    { id: "white-bg-product", name: "白底商品图规范", type: "图片用途", description: "商品主体完整，白底或浅灰棚拍，方便后续构图和抠图。", prompt: "遵循白底商品图规范：商品主体完整、边缘清晰、白底或浅灰棚拍、方便后续构图，不要裁切主体，不要生成文字。", enabled: true }
  ];
  const source = Array.isArray(value) && value.length ? value : defaults;
  return source.map((skill, index) => ({
    id: String(skill?.id || `skill-${index + 1}`).trim(),
    name: String(skill?.name || "").trim(),
    type: String(skill?.type || "通用").trim(),
    description: String(skill?.description || "").trim(),
    prompt: String(skill?.prompt || "").trim(),
    enabled: skill?.enabled !== false
  }));
}

function normalizeAdminGroupId(value, fallback = "") {
  const normalized = String(value || "")
    .trim()
    .replace(/[^a-z0-9_.-]/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return normalized || fallback;
}

function normalizeAdminAiGroupKeys(value) {
  const rows = Array.isArray(value) ? value : [];
  return rows.map((row, index) => {
    const name = String(row?.name || row?.groupName || "").trim();
    const department = String(row?.department || "").trim();
    const id = normalizeAdminGroupId(row?.id || row?.groupId || name || department, `group-${index + 1}`);
    return {
      id,
      name: name || id,
      department,
      enabled: row?.enabled !== false,
      primaryImageApiKey: String(row?.primaryImageApiKey || row?.primaryApiKey || "").trim(),
      secondaryImageApiKey: String(row?.secondaryImageApiKey || "").trim(),
      textServiceBApiKey: String(row?.textServiceBApiKey || "").trim(),
      textServiceCApiKey: String(row?.textServiceCApiKey || "").trim()
    };
  });
}

function normalizeAdminAiUserKeys(value = {}) {
  const row = value && typeof value === "object" ? value : {};
  return {
    primaryImageApiKey: String(row.primaryImageApiKey || row.primaryApiKey || "").trim(),
    secondaryImageApiKey: String(row.secondaryImageApiKey || "").trim(),
    textServiceBApiKey: String(row.textServiceBApiKey || "").trim(),
    textServiceCApiKey: String(row.textServiceCApiKey || "").trim()
  };
}

function configuredAdminGroupKeys() {
  const configRows = state.overview?.config?.ai?.groupKeys;
  const accountRows = state.overview?.accounts?.groupKeys;
  const rows = Array.isArray(configRows) ? configRows : (accountRows || []);
  return normalizeAdminAiGroupKeys(rows)
    .filter((row) => row.enabled !== false);
}

function adminGroupKeyLabel(row = {}) {
  return [row.name || row.id || "未命名小组", row.department, row.id].filter(Boolean).join(" · ");
}

function adminGroupKeyProviderSummary(row = {}) {
  const providers = [
    row.primaryImageApiKey ? "图片服务 A" : "",
    row.secondaryImageApiKey ? "图片服务 B" : "",
    row.textServiceBApiKey ? "文本服务 A" : "",
    row.textServiceCApiKey ? "文本服务 B" : ""
  ].filter(Boolean);
  return providers.join(" / ");
}

function adminUserKeyProviderSummary(user = {}) {
  const keys = normalizeAdminAiUserKeys(user.aiKeys || {});
  return [
    keys.primaryImageApiKey ? "图片服务 A" : "",
    keys.secondaryImageApiKey ? "图片服务 B" : "",
    keys.textServiceBApiKey ? "文本服务 A" : "",
    keys.textServiceCApiKey ? "文本服务 B" : ""
  ].filter(Boolean).join(" / ");
}

function userPersonalKeyStatusHtml(user = {}) {
  const providerText = adminUserKeyProviderSummary(user);
  return providerText
    ? `<small class="group-key-status ready">个人 Key · ${escapeHtml(providerText)}</small>`
    : "";
}

function findAdminGroupKeyForUser(user = {}) {
  const groups = configuredAdminGroupKeys();
  const groupId = String(user.groupId || "").trim();
  const groupName = String(user.groupName || "").trim();
  const department = String(user.department || "").trim();
  if (!groupId && !groupName && !department) return null;
  return groups.find((row) => groupId && row.id === groupId)
    || groups.find((row) => groupName && row.name === groupName && (!department || !row.department || row.department === department))
    || groups.find((row) => groupName && row.name === groupName)
    || groups.find((row) => department && row.department === department)
    || null;
}

function userGroupKeyStatusHtml(user = {}) {
  const matched = findAdminGroupKeyForUser(user);
  if (matched) {
    const providerText = adminGroupKeyProviderSummary(matched) || "已配置";
    return `<small class="group-key-status ready">小组 Key · ${escapeHtml(providerText)}</small>`;
  }
  if (user.groupId || user.groupName || user.department) {
    return `<small class="group-key-status warning">未匹配小组 Key</small>`;
  }
  return `<small class="group-key-status muted">使用全局 Key</small>`;
}

function userGroupPresetSelectHtml() {
  const groups = configuredAdminGroupKeys();
  if (!groups.length) {
    return `
      <label class="span-2">
        <span>小组 Key</span>
        <div class="group-preset-empty">还没有配置小组 Key；该账户将使用全局 Key。</div>
      </label>
    `;
  }
  return `
    <label class="span-2">
      <span>小组 Key</span>
      <select id="userGroupPreset">
        <option value="">手动填写 / 使用全局 Key</option>
        ${groups.map((row) => `<option value="${escapeHtml(row.id)}">${escapeHtml(adminGroupKeyLabel(row))}</option>`).join("")}
      </select>
      <small class="field-note">选择后自动填入部门、小组 ID 和小组名称；员工会优先使用该小组 Key。</small>
    </label>
  `;
}

function aiGroupKeyEditorCard(row, index) {
  return `
    <article class="skill-editor-card" data-ai-group-key-row="${escapeHtml(index)}">
      <div class="skill-editor-head">
        <div>
          <b>${escapeHtml(row.name || row.id || "未命名小组")}</b>
          <span>${escapeHtml([row.department, row.id].filter(Boolean).join(" · ") || "小组 Key 覆盖全局 Key")}</span>
        </div>
        <div class="skill-editor-actions">
          <label class="toggle-line"><input type="checkbox" data-group-key-field="enabled" ${row.enabled ? "checked" : ""} />启用</label>
          <button class="secondary danger" type="button" data-delete-ai-group-key="${escapeHtml(index)}">删除</button>
        </div>
      </div>
      <div class="skill-editor-grid">
        <label><span>小组 ID</span><input data-group-key-field="id" value="${escapeHtml(row.id || "")}" placeholder="ec-team-a" /></label>
        <label><span>小组名称</span><input data-group-key-field="name" value="${escapeHtml(row.name || "")}" placeholder="电商 A 组" /></label>
        <label><span>部门</span><input data-group-key-field="department" value="${escapeHtml(row.department || "")}" placeholder="电商一部" /></label>
        <label><span>图片服务 A Key</span><input data-group-key-field="primaryImageApiKey" type="password" autocomplete="new-password" value="${escapeHtml(row.primaryImageApiKey || "")}" placeholder="图片服务 A Key" /></label>
        <label><span>图片服务 B Key</span><input data-group-key-field="secondaryImageApiKey" type="password" autocomplete="new-password" value="${escapeHtml(row.secondaryImageApiKey || "")}" placeholder="图片服务 B Key" /></label>
        <label><span>文本服务 A Key</span><input data-group-key-field="textServiceBApiKey" type="password" autocomplete="new-password" value="${escapeHtml(row.textServiceBApiKey || "")}" /></label>
        <label><span>文本服务 B Key</span><input data-group-key-field="textServiceCApiKey" type="password" autocomplete="new-password" value="${escapeHtml(row.textServiceCApiKey || "")}" /></label>
      </div>
    </article>
  `;
}

function aiGroupKeysEditor(groupKeys) {
  const rows = normalizeAdminAiGroupKeys(groupKeys);
  return `
    <div class="skills-config-panel">
      <div class="skills-config-head">
        <div>
          <b>小组 Key 覆盖</b>
          <span>模型配置仍使用全局设置；这里只按小组替换 API Key。</span>
        </div>
        <button id="addAiGroupKeyBtn" class="secondary small-action" type="button">新增小组 Key</button>
      </div>
      <div id="aiGroupKeyRows" class="skills-editor">
        ${rows.length ? rows.map((row, index) => aiGroupKeyEditorCard(row, index)).join("") : `<div class="empty-state compact">还没有小组 Key，当前所有员工使用全局 Key。</div>`}
      </div>
    </div>
  `;
}

function aiSkillEditorCard(skill, index, selectedSkillId = "") {
  const locked = skill.id === "none";
  return `
    <article class="skill-editor-card" data-ai-skill-row="${escapeHtml(index)}" data-ai-skill-id="${escapeHtml(skill.id)}" ${selectedSkillId && skill.id !== selectedSkillId ? "hidden" : ""}>
      <div class="skill-editor-head">
        <div>
          <b>${escapeHtml(skill.name || "未命名 Skill")}</b>
          <span>${escapeHtml(skill.type || "通用")} · 员工端显示顺序 ${escapeHtml(index + 1)}</span>
        </div>
        <div class="skill-editor-actions">
          <label class="toggle-line"><input type="checkbox" data-skill-field="enabled" ${skill.enabled ? "checked" : ""} />启用</label>
          <button class="secondary danger" type="button" data-delete-ai-skill ${locked ? "disabled" : ""}>删除</button>
        </div>
      </div>
      <div class="skill-editor-grid">
        <label><span>前端 ID</span><input data-skill-field="id" value="${escapeHtml(skill.id)}" ${locked ? "readonly" : ""} /></label>
        <label><span>Skills 名称</span><input data-skill-field="name" value="${escapeHtml(skill.name)}" placeholder="例如：通用品牌套件" /></label>
        <label><span>分类/类型</span><input data-skill-field="type" value="${escapeHtml(skill.type)}" placeholder="品牌套件 / 平台规范 / 图片用途" /></label>
        <label class="span-2"><span>员工端说明</span><input data-skill-field="description" value="${escapeHtml(skill.description)}" placeholder="显示在员工端 Skills 下拉里的说明" /></label>
        <label class="span-3"><span>AI 生图规则</span><textarea data-skill-field="prompt" rows="4" placeholder="选择这个 Skill 后，会拼接到 AI 生图需求理解里">${escapeHtml(skill.prompt)}</textarea></label>
      </div>
    </article>
  `;
}

function updatePanel(update, updates) {
  const status = update?.status || "idle";
  const statusText = {
    idle: "待机",
    starting: "启动中",
    running: "更新中",
    downloading: "下载中",
    extracting: "解压中",
    "backing-up": "备份中",
    applying: "应用中",
    "post-update": "收尾中",
    restarting: "重启中",
    complete: "已完成",
    failed: "失败"
  }[status] || status;
  const defaultUrl = update?.packageUrl || updates.packageUrl || "";
  const uploadedPath = update?.packagePath || "";
  const packageSha256 = update?.packageSha256 || "";
  return `
    <div class="update-panel">
      <div class="update-head">
        <div>
          <b>实操机一键更新</b>
          <span>下载更新包、自动备份、替换程序、重启员工端和管理端</span>
        </div>
        <span class="update-status ${escapeHtml(status)}">${escapeHtml(statusText)}</span>
      </div>
      <label class="update-url"><span>更新包 URL</span><input id="runUpdatePackageUrl" value="${escapeHtml(defaultUrl)}" placeholder="https://可信发布地址/更新包.zip（默认关闭）" /></label>
      <label class="update-url"><span>更新包 SHA-256</span><input id="runUpdatePackageSha256" value="${escapeHtml(packageSha256)}" placeholder="从可信发布页单独核对的 64 位 SHA-256" autocomplete="off" spellcheck="false" /></label>
      <div class="update-upload-grid">
        <label class="update-file"><span>上传更新包 ZIP</span><input id="uploadUpdatePackageFile" type="file" accept=".zip,application/zip,application/x-zip-compressed" /></label>
        <button id="uploadUpdatePackageBtn" class="secondary" type="button">上传更新包</button>
      </div>
      <label class="update-url"><span>已上传本机包</span><input id="runUpdatePackagePath" value="${escapeHtml(uploadedPath)}" readonly placeholder="上传 ZIP 后自动填入，可直接一键更新" /></label>
      <div class="actions settings-actions">
        <button id="runUpdateBtn" class="primary" type="button">一键更新实操机</button>
        <button id="refreshUpdateStatusBtn" class="secondary" type="button">刷新更新状态</button>
        <button id="exportCurrentAppBtn" class="secondary" type="button">导出现网版本 ZIP</button>
        <span id="updateMessage" class="muted">${escapeHtml(update?.message || "暂无更新任务")}</span>
      </div>
      ${update?.startedAt ? `<div class="update-meta">开始：${escapeHtml(formatDateTime(update.startedAt))}${update.finishedAt ? ` · 完成：${escapeHtml(formatDateTime(update.finishedAt))}` : ""}</div>` : ""}
      <pre id="updateLogTail" class="log-tail update-log">${escapeHtml(update?.logTail || "")}</pre>
    </div>
  `;
}

function diagnosticSummary(data) {
  if (!data || !Array.isArray(data.checks)) return "等待体检";
  if (data.status === "ok") return "全部正常";
  if (data.status === "warn") return `${data.warnings || 0} 项提醒`;
  return `${data.failed || 0} 项异常，${data.warnings || 0} 项提醒`;
}

function diagnosticsPanel(data) {
  const checks = Array.isArray(data?.checks) ? data.checks : [];
  if (!checks.length) return `<div class="empty-state compact">暂无体检数据</div>`;
  return `
    <div class="diag-grid">
      ${checks.map((item) => `
        <article class="diag ${escapeHtml(item.status || "warn")}">
          <b>${escapeHtml(item.name || "-")}</b>
          <span>${escapeHtml(item.detail || "")}</span>
        </article>
      `).join("")}
    </div>
    ${data.watchdogTail ? `<pre class="log-tail">${escapeHtml(data.watchdogTail)}</pre>` : ""}
  `;
}

function userForm() {
  const canManageAdmins = userCan("admin.roles.manage");
  return `
    <form id="userForm" class="user-form">
      <input id="userId" type="hidden" />
      <div class="account-form-head"><div><b id="userFormTitle">新增员工账户</b><span>账户名和密码给员工登录内网员工端使用。</span></div></div>
      <div class="settings-grid">
        <label><span>账户名</span><input id="userUsername" placeholder="user001" /></label>
        <label><span>显示名</span><input id="userDisplayName" placeholder="设计师姓名" /></label>
        <label><span>新密码</span><input id="userPassword" type="password" placeholder="新建必填，编辑可留空" /></label>
        ${userGroupPresetSelectHtml()}
        <label><span>部门</span><input id="userDepartment" placeholder="例如：电商一部" /></label>
        <label><span>小组 ID</span><input id="userGroupId" placeholder="例如：ec-team-a" /></label>
        <label><span>小组名称</span><input id="userGroupName" placeholder="例如：电商 A 组" /></label>
        <div class="span-3 personal-key-panel">
          <div class="personal-key-head">
            <b>个人 Key 覆盖</b>
            <span>留空则使用小组/全局 Key；已有 Key 会显示 ${CONFIGURED_KEY_PLACEHOLDER}，保持不动即保留，清空后保存即删除。</span>
          </div>
          <div class="personal-key-grid">
            <label><span>个人图片服务 A Key</span><input id="userPrimaryImageApiKey" type="password" autocomplete="new-password" placeholder="覆盖图片服务 A Key" /></label>
            <label><span>个人图片服务 B Key</span><input id="userSecondaryApiKey" type="password" autocomplete="new-password" placeholder="覆盖图片服务 B Key" /></label>
            <label><span>个人文本服务 A Key</span><input id="userTextServiceBApiKey" type="password" autocomplete="new-password" placeholder="覆盖文本服务 A Key" /></label>
            <label><span>个人文本服务 B Key</span><input id="userTextServiceCApiKey" type="password" autocomplete="new-password" placeholder="覆盖文本服务 B Key" /></label>
          </div>
        </div>
        <label><span>角色</span><select id="userRole">${option("user", "员工", "user")}${canManageAdmins ? option("admin", "管理员", "user") : ""}</select></label>
        <label id="userAdminRoleWrap" ${canManageAdmins ? "" : "hidden"}><span>管理类型</span><select id="userAdminRole">${ADMIN_ROLE_OPTIONS.map((item) => option(item.id, item.label, "account_admin")).join("")}</select></label>
        <label><span>状态</span><select id="userStatus">${option("active", "启用", "active")}${option("paused", "停用", "active")}</select></label>
        <label><span>套餐</span><input id="userPlan" value="基础版" /></label>
        <label><span>设备数</span><input id="userDeviceLimit" type="number" min="1" max="99" value="20" /></label>
        <label><span>AI 生图额度（-1 不限）</span><input id="quotaAiImages" type="number" value="-1" /></label>
        <label><span>AI 文案额度（-1 不限）</span><input id="quotaCopywriting" type="number" value="-1" /></label>
      </div>
      <div class="actions settings-actions">
        <button class="primary" type="submit">保存员工账户</button>
        <button id="clearUserFormBtn" class="secondary" type="button">新建空白账户</button>
      </div>
    </form>
  `;
}

function userRow(user) {
  const canManageAdminUser = (user.role || "user") !== "admin" || userCan("admin.roles.manage");
  const roleText = (user.role || "user") === "admin"
    ? `管理员 · ${user.adminRoleLabel || adminRoleLabel(user.adminRole)}`
    : "员工";
  return `
    <tr>
      <td><b>${escapeHtml(user.displayName || user.username)}</b><span>${escapeHtml(user.username)}</span></td>
      <td><b>${escapeHtml(user.groupName || user.groupId || "-")}</b><span>${escapeHtml([user.department, user.groupId].filter(Boolean).join(" · ") || "未分组")}</span>${userPersonalKeyStatusHtml(user)}${userGroupKeyStatusHtml(user)}</td>
      <td>${escapeHtml(roleText)}</td>
      <td>${statusBadge(user.status)}</td>
      <td>${escapeHtml(user.plan || "-")}</td>
      <td>${escapeHtml(user.deviceCount || 0)}/${escapeHtml(user.deviceLimit || 0)}</td>
      <td>${escapeHtml(formatUsage(user, "aiImages"))}</td>
      <td>${escapeHtml(formatUsage(user, "copywriting"))}</td>
      <td>${escapeHtml(formatMoneyCny(user.tokenUsage?.estimatedCostCny || 0))}</td>
      <td class="row-actions">
        ${canManageAdminUser ? `<button class="secondary" data-edit-user="${escapeHtml(user.id)}" type="button">编辑</button>` : ""}
        ${canManageAdminUser ? `<button class="secondary" data-reset-user="${escapeHtml(user.id)}" type="button">清用量</button>` : ""}
        ${canManageAdminUser ? `<button class="secondary danger" data-delete-user="${escapeHtml(user.id)}" type="button">删除</button>` : ""}
      </td>
    </tr>
  `;
}

function bindDynamicActions() {
  bindAdminModuleButtons(els.overview);
  $("#addUserBtn")?.addEventListener("click", startNewUser);
  $("#saveConfigBtn")?.addEventListener("click", saveConfig);
  $("#saveAiConfigBtn")?.addEventListener("click", saveConfig);
  $("#aiConfigSectionSelect")?.addEventListener("change", (event) => switchAiConfigSection(event.target.value));
  document.querySelectorAll("[data-ai-config-tab]").forEach((button) => {
    button.addEventListener("click", () => switchAiConfigSection(button.dataset.aiConfigTab));
  });
  $("#addAiSkillBtn")?.addEventListener("click", addAiSkillCard);
  $("#addAiGroupKeyBtn")?.addEventListener("click", addAiGroupKeyRow);
  $("#adminSkillSelect")?.addEventListener("change", (event) => selectAiSkillCard(event.target.value));
  $("#refreshDiagnosticsBtn")?.addEventListener("click", loadOverview);
  $("#refreshFeedbackBtn")?.addEventListener("click", loadOverview);
  $("#refreshGalleryBtn")?.addEventListener("click", () => loadGalleryPage());
  $("#galleryAccountFilter")?.addEventListener("change", (event) => loadGalleryPage({ account: event.target.value, offset: 0 }));
  $("#galleryPrevBtn")?.addEventListener("click", () => loadGalleryPage({ offset: Math.max(0, state.gallery.offset - state.gallery.limit) }));
  $("#galleryNextBtn")?.addEventListener("click", () => loadGalleryPage({ offset: state.gallery.offset + state.gallery.limit }));
  $("#toggleGalleryPreviewBtn")?.addEventListener("click", toggleGalleryPreview);
  $("#openGalleryFolderBtn")?.addEventListener("click", openGalleryFolder);
  $("#downloadGalleryBtn")?.addEventListener("click", downloadGalleryArchive);
  document.querySelectorAll("[data-toggle-panel]").forEach((button) => {
    button.addEventListener("click", () => togglePanel(button.dataset.togglePanel));
  });
  document.querySelectorAll("[data-usage-period]").forEach((button) => {
    button.addEventListener("click", () => {
      state.usageDashboardPeriod = button.dataset.usagePeriod || "total";
      localStorage.setItem("usage_dashboard_period", state.usageDashboardPeriod);
      renderOverview();
    });
  });
  $("#runUpdateBtn")?.addEventListener("click", runAdminUpdate);
  $("#uploadUpdatePackageBtn")?.addEventListener("click", uploadUpdatePackage);
  $("#refreshUpdateStatusBtn")?.addEventListener("click", refreshUpdateStatus);
  $("#requestFullUninstallBtn")?.addEventListener("click", requestFullUninstall);
  $("#cancelFullUninstallBtn")?.addEventListener("click", cancelFullUninstall);
  $("#exportCurrentAppBtn")?.addEventListener("click", exportCurrentApp);
  $("#userForm")?.addEventListener("submit", saveUser);
  $("#userGroupPreset")?.addEventListener("change", applyUserGroupPreset);
  $("#userRole")?.addEventListener("change", syncUserAdminRoleField);
  $("#clearUserFormBtn")?.addEventListener("click", clearUserForm);
  document.querySelectorAll("[data-autostart-target]").forEach((button) => {
    button.addEventListener("click", () => setAutostart(button.dataset.autostartTarget, button.dataset.autostartEnabled === "true"));
  });
  document.querySelectorAll("[data-edit-user]").forEach((button) => button.addEventListener("click", () => fillUserForm(button.dataset.editUser)));
  document.querySelectorAll("[data-reset-user]").forEach((button) => button.addEventListener("click", () => resetUserUsage(button.dataset.resetUser)));
  document.querySelectorAll("[data-delete-user]").forEach((button) => button.addEventListener("click", () => deleteUser(button.dataset.deleteUser)));
  document.querySelectorAll("[data-delete-ai-skill]").forEach((button) => button.addEventListener("click", () => deleteAiSkillCard(button.closest("[data-ai-skill-row]"))));
  document.querySelectorAll("[data-delete-ai-group-key]").forEach((button) => button.addEventListener("click", () => deleteAiGroupKeyRow(button.closest("[data-ai-group-key-row]"))));
  $("#addTokenPriceRowBtn")?.addEventListener("click", addTokenPriceRow);
  document.querySelectorAll("[data-delete-token-price]").forEach((button) => button.addEventListener("click", () => button.closest("[data-token-price-row]")?.remove()));
  syncUserAdminRoleField();
}

function switchAiConfigSection(sectionId) {
  const nextId = String(sectionId || "image");
  state.activeAiConfigSection = nextId;
  localStorage.setItem("admin_ai_config_section", nextId);
  document.querySelectorAll("[data-ai-config-tab]").forEach((button) => {
    const active = button.dataset.aiConfigTab === nextId;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
  const select = $("#aiConfigSectionSelect");
  if (select) select.value = nextId;
  document.querySelectorAll("[data-ai-config-section]").forEach((section) => {
    section.hidden = section.dataset.aiConfigSection !== nextId;
  });
}

function syncImageServiceProviderDefaults() {
  const nextModel = "image-model";
  const replaceable = new Set(["", "image-model"]);
  const textModel = $("#imageTextModel");
  const editModel = $("#imageEditModel");
  if (textModel && replaceable.has(String(textModel.value || "").trim())) {
    textModel.value = nextModel;
    textModel.placeholder = nextModel;
  }
  if (editModel && replaceable.has(String(editModel.value || "").trim())) {
    editModel.value = nextModel;
    editModel.placeholder = nextModel;
  }
}

function addAiGroupKeyRow() {
  const list = $("#aiGroupKeyRows");
  if (!list) return;
  list.querySelector(".empty-state")?.remove();
  const index = list.querySelectorAll("[data-ai-group-key-row]").length;
  const row = {
    id: `group-${Date.now().toString(36)}`,
    name: "新小组",
    department: "",
    enabled: true,
    primaryImageApiKey: "",
    secondaryImageApiKey: "",
    textServiceBApiKey: "",
    textServiceCApiKey: ""
  };
  list.insertAdjacentHTML("beforeend", aiGroupKeyEditorCard(row, index));
  const card = list.lastElementChild;
  card?.querySelector("[data-delete-ai-group-key]")?.addEventListener("click", () => deleteAiGroupKeyRow(card));
  card?.querySelector('[data-group-key-field="id"]')?.focus();
}

function deleteAiGroupKeyRow(card) {
  const list = $("#aiGroupKeyRows");
  card?.remove();
  if (list && !list.querySelector("[data-ai-group-key-row]")) {
    list.innerHTML = `<div class="empty-state compact">还没有小组 Key，当前所有员工使用全局 Key。</div>`;
  }
}

function applyUserGroupPreset() {
  const select = $("#userGroupPreset");
  const id = String(select?.value || "").trim();
  const group = configuredAdminGroupKeys().find((row) => row.id === id);
  if (!group) return;
  if ($("#userDepartment")) $("#userDepartment").value = group.department || "";
  if ($("#userGroupId")) $("#userGroupId").value = group.id || "";
  if ($("#userGroupName")) $("#userGroupName").value = group.name || group.id || "";
}

function syncUserGroupPresetFromFields(user = {}) {
  const select = $("#userGroupPreset");
  if (!select) return;
  const matched = findAdminGroupKeyForUser(user);
  select.value = matched?.id || "";
}

function addAiSkillCard() {
  const editor = $("#aiSkillsEditor");
  if (!editor) return;
  const index = editor.querySelectorAll("[data-ai-skill-row]").length;
  const id = `custom-skill-${Date.now().toString(36)}`;
  const skill = {
    id,
    name: "新 Skill",
    type: "自定义",
    description: "",
    prompt: "",
    enabled: true
  };
  state.selectedSkillId = id;
  localStorage.setItem("admin_selected_skill_id", id);
  editor.insertAdjacentHTML("beforeend", aiSkillEditorCard(skill, index, id));
  const select = $("#adminSkillSelect");
  if (select) {
    select.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(id)}" selected>${escapeHtml(skill.name)} · ${escapeHtml(skill.type)}</option>`);
    select.value = id;
  }
  syncSelectedSkillCard(id);
  bindSkillEditorActions(editor.lastElementChild);
  editor.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function selectAiSkillCard(id) {
  state.selectedSkillId = String(id || "");
  localStorage.setItem("admin_selected_skill_id", state.selectedSkillId);
  syncSelectedSkillCard(state.selectedSkillId);
}

function syncSelectedSkillCard(id) {
  const cards = $("#aiSkillsEditor")?.querySelectorAll("[data-ai-skill-row]") || [];
  cards.forEach((card) => {
    card.hidden = Boolean(id) && card.dataset.aiSkillId !== id;
  });
}

function bindSkillEditorActions(root) {
  root?.querySelectorAll?.("[data-delete-ai-skill]").forEach((button) => {
    if (!button.dataset.bound) {
      button.dataset.bound = "1";
      button.addEventListener("click", () => deleteAiSkillCard(button.closest("[data-ai-skill-row]")));
    }
  });
}

function deleteAiSkillCard(card) {
  if (!card) return;
  const id = card.querySelector('[data-skill-field="id"]')?.value || "";
  if (id === "none") {
    toast("默认“未选择”不能删除。");
    return;
  }
  card.remove();
  const option = $(`#adminSkillSelect option[value="${cssEscape(id)}"]`);
  option?.remove();
  const nextId = $("#adminSkillSelect")?.value || $("#aiSkillsEditor [data-ai-skill-row]")?.dataset.aiSkillId || "none";
  selectAiSkillCard(nextId);
  refreshSkillEditorOrder();
}

function refreshSkillEditorOrder() {
  $("#aiSkillsEditor")?.querySelectorAll("[data-ai-skill-row]").forEach((card, index) => {
    card.dataset.aiSkillRow = String(index);
    const order = card.querySelector(".skill-editor-head span");
    const type = card.querySelector('[data-skill-field="type"]')?.value || "通用";
    if (order) order.textContent = `${type} · 员工端显示顺序 ${index + 1}`;
  });
}

function addTokenPriceRow() {
  const list = $("#tokenPricingRows");
  if (!list) return;
  const index = list.querySelectorAll("[data-token-price-row]").length;
  list.insertAdjacentHTML("beforeend", tokenPriceRow({ provider: "", model: "", currency: "CNY", inputCnyPer1M: 0, cachedInputCnyPer1M: 0, outputCnyPer1M: 0 }, index));
  const row = list.lastElementChild;
  row?.querySelector("[data-delete-token-price]")?.addEventListener("click", () => row.remove());
  row?.querySelector('[data-token-price-field="model"]')?.focus();
}

async function loadGalleryPage(options = {}) {
  state.gallery = {
    offset: Number(options.offset ?? state.gallery.offset ?? 0),
    limit: Number(options.limit ?? state.gallery.limit ?? 12),
    account: String(options.account ?? state.gallery.account ?? ""),
    expanded: Boolean(options.expanded ?? state.gallery.expanded)
  };
  const params = new URLSearchParams({
    offset: String(state.gallery.offset),
    limit: String(state.gallery.limit)
  });
  if (state.gallery.account) params.set("account", state.gallery.account);
  try {
    const response = await fetch(`/api/admin/ai-gallery/list?${params.toString()}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "读取 AI 留档失败");
    state.gallery.offset = Number(data.offset || 0);
    state.gallery.limit = Number(data.limit || state.gallery.limit || 12);
    state.gallery.account = String(data.account || "");
    state.overview = { ...(state.overview || {}), aiGallery: data };
    renderOverview();
    if (!options.silent) toast("AI 留档已刷新。");
  } catch (error) {
    toast(error.message || "读取 AI 留档失败");
  }
}

async function toggleGalleryPreview() {
  state.gallery.expanded = !state.gallery.expanded;
  localStorage.setItem("admin_gallery_expanded", String(state.gallery.expanded));
  if (state.gallery.expanded) {
    await loadGalleryPage({ offset: 0, limit: 12, expanded: true });
  } else {
    renderOverview();
  }
}

async function openGalleryFolder() {
  const button = $("#openGalleryFolderBtn");
  const previousText = button?.textContent || "打开实操机图片文件夹";
  if (button) {
    button.disabled = true;
    button.textContent = "正在打开...";
  }
  try {
    const response = await fetch("/api/admin/ai-gallery/open-folder", { method: "POST" });
    const data = await response.json();
    if (!response.ok) {
      toast(`${data.error || "打开文件夹失败"}${data.path ? ` 路径：${data.path}` : ""}`);
      return;
    }
    toast(data.message || `已在实操机打开：${data.path || "AI 生图留档目录"}`);
  } catch (error) {
    toast(error.message || "打开实操机图片文件夹失败");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = previousText;
    }
  }
}

function downloadGalleryArchive() {
  const params = new URLSearchParams();
  if (state.gallery.account) params.set("account", state.gallery.account);
  window.location.href = `/api/admin/ai-gallery/download${params.toString() ? `?${params.toString()}` : ""}`;
}

async function saveConfig() {
  const payload = {};
  const hasAiFields = Boolean($("#primaryImageApiKey") || $("#textServiceBApiKey") || $("#aiSkillsEditor") || $("#aiGroupKeyRows"));
  if (hasAiFields) {
    const aiImageSkills = collectAiImageSkills();
    if (aiImageSkills === null) return;
    const groupKeys = collectAiGroupKeys();
    if (groupKeys === null) return;
    payload.ai = {
      primaryImageApiKey: $("#primaryImageApiKey")?.value || "",
      secondaryImageApiKey: $("#secondaryImageApiKey")?.value || "",
      secondaryImageBaseUrl: $("#secondaryImageBaseUrl")?.value || "",
      imageApiProvider: "primary",
      textServiceBApiKey: $("#textServiceBApiKey")?.value || "",
      textServiceCApiKey: $("#textServiceCApiKey")?.value || "",
      primaryTextModel: $("#primaryTextModel")?.value || "",
      imageTextModel: $("#imageTextModel")?.value || "",
      imageEditModel: $("#imageEditModel")?.value || "",
      standardReasoningModel: $("#standardReasoningModel")?.value || "",
      deepReasoningModel: $("#deepReasoningModel")?.value || "",
      remoteImageBed: {
        enabled: $("#remoteImageBedEnabled")?.checked === true,
        namespace: $("#remoteImageBedNamespace")?.value || "",
        project: $("#remoteImageBedProject")?.value || "",
        apiBaseUrl: $("#remoteImageBedApiBaseUrl")?.value || "",
        rawBaseUrl: $("#remoteImageBedRawBaseUrl")?.value || "",

        revision: $("#remoteImageBedRevision")?.value || "main",
        pathPrefix: $("#remoteImageBedPathPrefix")?.value || "images",
        token: $("#remoteImageBedToken")?.value || ""
      },
      objectStorage: {
        enabled: $("#objectStorageEnabled")?.checked === true,
        endpoint: $("#objectStorageEndpoint")?.value || "",
        region: $("#objectStorageRegion")?.value || "auto",
        bucket: $("#objectStorageBucket")?.value || "",
        accessKeyId: $("#objectStorageAccessKeyId")?.value || "",
        secretAccessKey: $("#objectStorageSecretAccessKey")?.value || "",
        pathPrefix: $("#objectStoragePathPrefix")?.value || "images",
        expiresSeconds: Number($("#objectStorageExpiresSeconds")?.value || 3600),
        forcePathStyle: $("#objectStorageForcePathStyle")?.checked !== false
      },
      cloudSync: {
        enabled: $("#cloudSyncEnabled")?.checked === true,
        includeProjects: $("#cloudSyncIncludeProjects")?.checked !== false,
        includeConversations: $("#cloudSyncIncludeConversations")?.checked !== false,
        includeAssets: $("#cloudSyncIncludeAssets")?.checked !== false,
        pathPrefix: $("#cloudSyncPathPrefix")?.value || "backups",
        timeoutSeconds: Number($("#cloudSyncTimeoutSeconds")?.value || 45)
      },
      textServiceBModel: $("#textServiceBModel")?.value || "",
      textServiceCModel: $("#textServiceCModel")?.value || "",
      aiImageSkills,
      groupKeys,
      tokenPricing: collectTokenPricing(),
      imagePricing: collectImagePricing()
    };
  }
  const hasSystemFields = Boolean($("#companyName") || $("#currentVersion") || $("#maintenanceEnabled") || $("#retentionEnabled"));
  if (hasSystemFields) {
    payload.appliance = { companyName: $("#companyName")?.value || "", name: $("#applianceName")?.value || "" };
    payload.updates = {
      currentVersion: $("#currentVersion")?.value || "",
      latestVersion: $("#latestVersion")?.value || "",
      packageUrl: $("#packageUrl")?.value || "",
      releaseNote: $("#releaseNote")?.value || ""
    };
    payload.maintenance = {
      enabled: $("#maintenanceEnabled")?.checked === true,
      title: $("#maintenanceTitle")?.value || "系统维护中",
      message: $("#maintenanceMessage")?.value || "",
      detail: $("#maintenanceDetail")?.value || "",
      endsAt: dateTimeLocalToIso($("#maintenanceEndsAt")?.value || ""),
      allowlist: ($("#maintenanceAllowlist")?.value || "")
        .split(/[\n\r,，;；]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    };
    payload.privacy = {
      operatorContact: $("#privacyOperatorContact")?.value || "",
      retention: {
        enabled: $("#retentionEnabled")?.checked !== false,
        automaticFailureDays: Number($("#automaticFailureDays")?.value || 30),
        feedbackDays: Number($("#feedbackDays")?.value || 180),
        conversationsDays: Number($("#conversationsDays")?.value || 365),
        canvasProjectsDays: Number($("#canvasProjectsDays")?.value || 365),
        generatedImagesDays: Number($("#generatedImagesDays")?.value || 90),
        cleanupIntervalHours: Number($("#cleanupIntervalHours")?.value || 24)
      }
    };
  }
  if (!Object.keys(payload).length) return toast("当前页面没有可保存的配置。");
  const response = await fetch("/api/admin/config", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const data = await response.json();
  if (!response.ok) return toast(data.error || "保存配置失败");
  toast("配置已保存。");
  await loadOverview();
}

function collectTokenPricing() {
  const pricing = {
    usdToCnyRate: Math.max(0, Number($("#tokenUsdToCnyRate")?.value || 7.2)),
    saleMultiplier: Math.max(0, Number($("#tokenSaleMultiplier")?.value || 1)),
    models: []
  };
  const rows = document.querySelectorAll("[data-token-price-row]");
  rows.forEach((row) => {
    const read = (field) => row.querySelector(`[data-token-price-field="${field}"]`)?.value?.trim() || "";
    const model = read("model");
    if (!model) return;
    const currency = read("currency") === "CNY" ? "CNY" : "USD";
    const item = {
      provider: read("provider"),
      model,
      currency
    };
    const input = Math.max(0, Number(read("inputPer1M") || 0));
    const cached = Math.max(0, Number(read("cachedInputPer1M") || input || 0));
    const output = Math.max(0, Number(read("outputPer1M") || 0));
    if (currency === "CNY") {
      item.inputCnyPer1M = input;
      item.cachedInputCnyPer1M = cached;
      item.outputCnyPer1M = output;
    } else {
      item.inputUsdPer1M = input;
      item.cachedInputUsdPer1M = cached;
      item.outputUsdPer1M = output;
    }
    pricing.models.push(item);
  });
  if (!pricing.models.length) pricing.models = defaultTokenPricingConfig().models;
  return pricing;
}

function collectImagePricing() {
  const saleMultiplier = Math.max(0, Number($("#tokenSaleMultiplier")?.value || 1));
  return {
    balanceCny: Math.max(0, Number($("#billingBalanceCny")?.value || 0)),
    saleMultiplier,
    native: {
      "1K": { usdPerImage: Math.max(0, Number($("#native1kUsdPerImage")?.value || 0)) },
      "2K": { usdPerImage: Math.max(0, Number($("#native2kUsdPerImage")?.value || 0)) },
      "4K": { usdPerImage: Math.max(0, Number($("#native4kUsdPerImage")?.value || 0)) }
    }
  };
}

function collectAiGroupKeys() {
  const rows = document.querySelectorAll("[data-ai-group-key-row]");
  const seen = new Set();
  const groupKeys = [];
  for (const row of rows) {
    const read = (field) => row.querySelector(`[data-group-key-field="${field}"]`)?.value?.trim() || "";
    const enabled = row.querySelector('[data-group-key-field="enabled"]')?.checked !== false;
    const id = normalizeAdminGroupId(read("id"), "");
    const name = read("name");
    const department = read("department");
    const keyRow = {
      id,
      name,
      department,
      enabled,
      primaryImageApiKey: read("primaryImageApiKey"),
      secondaryImageApiKey: read("secondaryImageApiKey"),
      textServiceBApiKey: read("textServiceBApiKey"),
      textServiceCApiKey: read("textServiceCApiKey")
    };
    const hasIdentity = Boolean(id || name || department);
    const hasKey = Boolean(keyRow.primaryImageApiKey || keyRow.secondaryImageApiKey || keyRow.textServiceBApiKey || keyRow.textServiceCApiKey);
    if (!hasIdentity && !hasKey) continue;
    if (!id) {
      toast("每个小组 Key 都必须填写小组 ID。");
      return null;
    }
    if (seen.has(id)) {
      toast(`小组 ID 重复：${id}`);
      return null;
    }
    seen.add(id);
    groupKeys.push({
      ...keyRow,
      name: name || id
    });
  }
  return groupKeys;
}

function collectAiImageSkills() {
  const editor = $("#aiSkillsEditor");
  if (!editor) return [];
  const seen = new Set();
  const skills = [];
  for (const card of editor.querySelectorAll("[data-ai-skill-row]")) {
    const read = (field) => card.querySelector(`[data-skill-field="${field}"]`)?.value?.trim() || "";
    const id = read("id");
    const name = read("name");
    if (!id || !name) {
      toast("每个 Skill 都必须填写前端 ID 和名称。");
      return null;
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(id)) {
      toast(`Skill ID 只能包含字母、数字、点、下划线和横线：${id}`);
      return null;
    }
    if (seen.has(id)) {
      toast(`Skill ID 重复：${id}`);
      return null;
    }
    seen.add(id);
    skills.push({
      id,
      name,
      type: read("type") || "通用",
      description: read("description"),
      prompt: read("prompt"),
      enabled: card.querySelector('[data-skill-field="enabled"]')?.checked !== false
    });
  }
  if (!skills.some((skill) => skill.id === "none")) {
    skills.unshift({ id: "none", name: "未选择", type: "通用", description: "不追加品牌或行业约束，只按当前对话需求生成。", prompt: "", enabled: true });
  }
  return skills;
}

async function setAutostart(target, enabled) {
  const response = await fetch("/api/admin/autostart", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ target, enabled }) });
  const data = await response.json();
  if (!response.ok) return toast(data.error || "自启动设置失败");
  toast(enabled ? "已启用开机自启动。" : "已关闭开机自启动。");
  await loadOverview();
}

async function requestFullUninstall() {
  const credentials = await requestUninstallCredentials();
  if (!credentials) return;
  const button = $("#requestFullUninstallBtn");
  if (button) {
    button.disabled = true;
    button.textContent = "正在发起...";
  }
  try {
    const response = await fetch("/api/admin/uninstall?action=request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(credentials)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "发起彻底卸载失败");
    toast("卸载申请已发出，请在实操机本地完成管理员确认。");
    await loadOverview();
  } catch (error) {
    toast(error.message || "发起彻底卸载失败");
    if (button) {
      button.disabled = false;
      button.textContent = "发起彻底卸载";
    }
  }
}

async function cancelFullUninstall() {
  const confirmed = await confirmAdminDialog("确认取消当前彻底卸载申请？实操机上的本地确认码会立即失效。", {
    title: "取消卸载申请",
    confirmText: "确认取消",
    type: "danger"
  });
  if (!confirmed) return;
  try {
    const response = await fetch("/api/admin/uninstall?action=cancel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}"
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "取消卸载申请失败");
    toast("彻底卸载申请已取消。");
    await loadOverview();
  } catch (error) {
    toast(error.message || "取消卸载申请失败");
  }
}

async function runAdminUpdate() {
  const packageUrl = ($("#runUpdatePackageUrl")?.value || $("#packageUrl")?.value || "").trim();
  const packagePath = ($("#runUpdatePackagePath")?.value || "").trim();
  const packageSha256 = ($("#runUpdatePackageSha256")?.value || "").trim().toLowerCase();
  if (!packagePath && !packageUrl) {
    toast("请先上传更新包，或填写更新包 URL。");
    return;
  }
  if (!/^[a-f0-9]{64}$/.test(packageSha256)) {
    toast("请填写并核对更新包的 64 位 SHA-256。");
    return;
  }
  const sourceText = packagePath ? "已上传的本机更新包" : "更新包 URL";
  const confirmed = await confirmAdminDialog(`确认现在使用${sourceText}更新实操机？更新期间员工端和管理端会短暂断开。`, {
    title: "更新实操机",
    confirmText: "开始更新",
    type: "danger"
  });
  if (!confirmed) {
    return;
  }
  const button = $("#runUpdateBtn");
  if (button) {
    button.disabled = true;
    button.textContent = "正在提交...";
  }
  try {
    const response = await fetch("/api/admin/update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(packagePath ? { packagePath, packageSha256 } : { packageUrl, packageSha256 })
    });
    const data = await response.json();
    if (!response.ok) {
      toast(data.error || "启动更新失败");
      return;
    }
    toast(data.message || "更新任务已启动。");
    startUpdatePolling();
  } catch (error) {
    toast(error.message || "启动更新失败");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "一键更新实操机";
    }
  }
}

async function uploadUpdatePackage() {
  const input = $("#uploadUpdatePackageFile");
  const file = input?.files?.[0];
  if (!file) {
    toast("请先选择 ZIP 更新包。");
    return;
  }
  if (!/\.zip$/i.test(file.name)) {
    toast("只能上传 ZIP 更新包。");
    return;
  }
  if (file.size > 600 * 1024 * 1024) {
    toast("更新包超过 600MB，暂不支持网页上传。");
    return;
  }
  const button = $("#uploadUpdatePackageBtn");
  const message = $("#updateMessage");
  const previousText = button?.textContent || "上传更新包";
  if (button) {
    button.disabled = true;
    button.textContent = "正在上传...";
  }
  if (message) message.textContent = `正在上传：${file.name}`;
  try {
    const dataUrl = await fileToDataUrl(file);
    const response = await fetch("/api/admin/update/upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileName: file.name, dataUrl })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "上传更新包失败");
    const pathInput = $("#runUpdatePackagePath");
    if (pathInput) pathInput.value = data.packagePath || "";
    const shaInput = $("#runUpdatePackageSha256");
    if (shaInput) shaInput.value = data.packageSha256 || "";
    if (message) message.textContent = data.message || "更新包已上传。";
    toast(data.message || "更新包已上传。");
    refreshUpdateStatus();
  } catch (error) {
    if (message) message.textContent = error.message || "上传更新包失败";
    toast(error.message || "上传更新包失败");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = previousText;
    }
  }
}

async function exportCurrentApp() {
  const button = $("#exportCurrentAppBtn");
  const previousText = button?.textContent || "导出现网版本 ZIP";
  if (button) {
    button.disabled = true;
    button.textContent = "正在打包...";
  }
  try {
    const response = await fetch("/api/admin/export-current-app", { method: "POST" });
    const data = await response.json();
    if (!response.ok) {
      toast(data.error || "导出现网版本失败");
      return;
    }
    toast(`已生成：${data.fileName || "现网版本 ZIP"}`);
    if (data.downloadUrl) {
      window.location.href = data.downloadUrl;
    }
  } catch (error) {
    toast(error.message || "导出现网版本失败");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = previousText;
    }
  }
}


function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

function startUpdatePolling() {
  if (state.updatePollTimer) clearInterval(state.updatePollTimer);
  state.updatePollTimer = setInterval(refreshUpdateStatus, 5000);
  setTimeout(loadOverview, 18000);
}

async function refreshUpdateStatus() {
  try {
    const response = await fetch("/api/admin/update", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) {
      toast(data.error || "读取更新状态失败");
      return;
    }
    const update = data.update || {};
    const message = $("#updateMessage");
    const log = $("#updateLogTail");
    if (message) message.textContent = update.message || "暂无更新任务";
    if (log) log.textContent = update.logTail || "";
    if (["complete", "failed", "idle"].includes(update.status) && state.updatePollTimer) {
      clearInterval(state.updatePollTimer);
      state.updatePollTimer = null;
      await loadOverview();
    }
  } catch {
  }
}

function syncUserAdminRoleField() {
  const role = $("#userRole")?.value || "user";
  const wrap = $("#userAdminRoleWrap");
  if (wrap) wrap.hidden = role !== "admin" || !userCan("admin.roles.manage");
}

function fillUserForm(id) {
  const user = (state.overview?.accounts?.users || []).find((item) => item.id === id);
  if (!user) return;
  state.openPanels.add("user-form");
  persistOpenPanels();
  renderOverview();
  state.editingUserId = user.id;
  $("#userId").value = user.id;
  $("#userUsername").value = user.username || "";
  $("#userDisplayName").value = user.displayName || "";
  $("#userPassword").value = "";
  $("#userDepartment").value = user.department || "";
  $("#userGroupId").value = user.groupId || "";
  $("#userGroupName").value = user.groupName || "";
  const keys = normalizeAdminAiUserKeys(user.aiKeys || {});
  $("#userPrimaryImageApiKey").value = keys.primaryImageApiKey || "";
  $("#userSecondaryApiKey").value = keys.secondaryImageApiKey || "";
  $("#userTextServiceBApiKey").value = keys.textServiceBApiKey || "";
  $("#userTextServiceCApiKey").value = keys.textServiceCApiKey || "";
  syncUserGroupPresetFromFields(user);
  $("#userRole").value = user.role || "user";
  if ($("#userAdminRole")) $("#userAdminRole").value = user.adminRole || "account_admin";
  $("#userStatus").value = user.status || "active";
  $("#userPlan").value = user.plan || "基础版";
  $("#userDeviceLimit").value = user.deviceLimit || 20;
  $("#quotaAiImages").value = user.quota?.aiImages ?? 0;
  $("#quotaCopywriting").value = user.quota?.copywriting ?? 0;
  if ($("#userFormTitle")) $("#userFormTitle").textContent = `编辑账户：${user.username}`;
  syncUserAdminRoleField();
  $("#userForm")?.scrollIntoView({ behavior: "smooth", block: "center" });
  toast(`正在编辑：${user.username}`);
}

function clearUserForm() {
  state.editingUserId = "";
  $("#userForm")?.reset();
  $("#userId").value = "";
  $("#userPlan").value = "基础版";
  $("#userDeviceLimit").value = 20;
  $("#userRole").value = "user";
  $("#userDepartment").value = "";
  $("#userGroupId").value = "";
  $("#userGroupName").value = "";
  $("#userPrimaryImageApiKey").value = "";
  $("#userSecondaryApiKey").value = "";
  $("#userTextServiceBApiKey").value = "";
  $("#userTextServiceCApiKey").value = "";
  if ($("#userGroupPreset")) $("#userGroupPreset").value = "";
  if ($("#userAdminRole")) $("#userAdminRole").value = "account_admin";
  $("#userStatus").value = "active";
  $("#quotaAiImages").value = -1;
  $("#quotaCopywriting").value = -1;
  if ($("#userFormTitle")) $("#userFormTitle").textContent = "新增员工账户";
  syncUserAdminRoleField();
}

function startNewUser() {
  state.openPanels.add("user-form");
  persistOpenPanels();
  renderOverview();
  clearUserForm();
  $("#userForm")?.scrollIntoView({ behavior: "smooth", block: "center" });
  $("#userUsername")?.focus();
}

async function saveUser(event) {
  event.preventDefault();
  const payload = {
    id: $("#userId")?.value || "",
    username: $("#userUsername")?.value || "",
    displayName: $("#userDisplayName")?.value || "",
    password: $("#userPassword")?.value || "",
    department: $("#userDepartment")?.value || "",
    groupId: $("#userGroupId")?.value || "",
    groupName: $("#userGroupName")?.value || "",
    aiKeys: {
      primaryImageApiKey: $("#userPrimaryImageApiKey")?.value || "",
      secondaryImageApiKey: $("#userSecondaryApiKey")?.value || "",
      textServiceBApiKey: $("#userTextServiceBApiKey")?.value || "",
      textServiceCApiKey: $("#userTextServiceCApiKey")?.value || ""
    },
    role: $("#userRole")?.value || "user",
    adminRole: $("#userAdminRole")?.value || "account_admin",
    status: $("#userStatus")?.value || "active",
    plan: $("#userPlan")?.value || "基础版",
    deviceLimit: Number($("#userDeviceLimit")?.value || 20),
    quota: {
      aiImages: Number($("#quotaAiImages")?.value || 0),
      copywriting: Number($("#quotaCopywriting")?.value || 0)
    }
  };
  const response = await fetch("/api/admin/users/upsert", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const data = await response.json();
  if (!response.ok) return toast(data.error || "保存账户失败");
  toast("账户已保存。");
  clearUserForm();
  await loadOverview();
}

async function resetUserUsage(id) {
  const response = await fetch("/api/admin/users/reset-usage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
  const data = await response.json();
  if (!response.ok) return toast(data.error || "清空用量失败");
  toast("用量已清空。");
  await loadOverview();
}

async function deleteUser(id) {
  const user = (state.overview?.accounts?.users || []).find((item) => item.id === id);
  if (!user) return;
  const confirmed = await confirmAdminDialog(
    `${tr("deleteAccountConfirmPrefix", "Delete account")} ${user.username}?\n\n${tr("deleteAccountCleanupWarning", "The account will be disabled first. Local data will be removed, and configured cloud copies will be queued for deletion. Failed cleanup is retried automatically.")}`,
    {
    title: tr("deleteAccount", "Delete account"),
    confirmText: tr("delete", "Delete"),
    type: "danger"
  });
  if (!confirmed) return;
  const response = await fetch("/api/admin/users/delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
  const data = await response.json();
  if (!response.ok) return toast(data.error || tr("deleteAccountFailed", "Account deletion failed"));
  toast(data.deletionPending
    ? tr("deleteAccountPending", "The account is disabled. Data cleanup has been queued and will retry automatically.")
    : tr("deleteAccountCompleted", "The account was removed. Cloud cleanup is queued."));
  await loadOverview();
}

function option(value, label, selected) {
  return `<option value="${escapeHtml(value)}" ${String(selected) === String(value) ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function adminRoleLabel(role) {
  return ADMIN_ROLE_OPTIONS.find((item) => item.id === role)?.label || "管理员";
}

function kpi(label, value, subtext) {
  return `<article class="kpi-card"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b><small>${escapeHtml(subtext)}</small></article>`;
}

function statusBadge(status) {
  if (status === "deletion_pending") {
    return `<span class="status blocked">${escapeHtml(tr("deletionPending", "Pending deletion"))}</span>`;
  }
  const ready = status === "active";
  return `<span class="status ${ready ? "ready" : "blocked"}">${escapeHtml(ready ? tr("enabled", "Enabled") : tr("disabled", "Disabled"))}</span>`;
}

function formatUsage(user, key) {
  const used = Number(user.usage?.[key] || 0);
  const quota = Number(user.quota?.[key] ?? 0);
  return quota < 0 ? `${used}/不限` : `${used}/${quota}`;
}

function formatDuration(seconds) {
  const total = Math.max(0, Number(seconds || 0));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days) return `${days} 天 ${hours} 小时`;
  if (hours) return `${hours} 小时 ${minutes} 分钟`;
  return `${minutes} 分钟`;
}

function formatDurationMs(ms) {
  const total = Math.max(0, Number(ms || 0));
  if (!total) return "0 秒";
  const seconds = Math.round(total / 1000);
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const remain = seconds % 60;
  if (minutes < 60) return remain ? `${minutes}分${remain}秒` : `${minutes}分钟`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes ? `${hours}小时${restMinutes}分` : `${hours}小时`;
}

function formatFileSize(bytes) {
  const size = Number(bytes || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function cssEscape(value) {
  if (window.CSS?.escape) return window.CSS.escape(String(value));
  return String(value).replace(/["\\]/g, "\\$&");
}

function ensureAdminDialog() {
  let dialog = $("#adminConfirmDialog");
  if (dialog) return dialog;
  dialog = document.createElement("div");
  dialog.id = "adminConfirmDialog";
  dialog.className = "admin-confirm-dialog";
  dialog.hidden = true;
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.innerHTML = `
    <section class="admin-confirm-card">
      <div class="admin-confirm-mark" aria-hidden="true">?</div>
      <div class="admin-confirm-content">
        <p>电商 AI 画布后台</p>
        <h2></h2>
        <div class="admin-confirm-message"></div>
      </div>
      <div class="admin-confirm-actions">
        <button class="secondary" type="button" data-admin-confirm-cancel>取消</button>
        <button class="primary" type="button" data-admin-confirm-ok>确认</button>
      </div>
    </section>
  `;
  document.body.appendChild(dialog);
  return dialog;
}

function confirmAdminDialog(message, options = {}) {
  const dialog = ensureAdminDialog();
  const card = dialog.querySelector(".admin-confirm-card");
  const title = dialog.querySelector("h2");
  const body = dialog.querySelector(".admin-confirm-message");
  const okBtn = dialog.querySelector("[data-admin-confirm-ok]");
  const cancelBtn = dialog.querySelector("[data-admin-confirm-cancel]");
  card?.setAttribute("data-dialog-type", options.type || "question");
  if (title) title.textContent = options.title || "请确认";
  if (body) body.textContent = message || "";
  if (okBtn) okBtn.textContent = options.confirmText || "确认";
  if (cancelBtn) cancelBtn.textContent = options.cancelText || "取消";
  dialog.hidden = false;
  return new Promise((resolve) => {
    const close = (value) => {
      dialog.hidden = true;
      okBtn?.removeEventListener("click", onOk);
      cancelBtn?.removeEventListener("click", onCancel);
      dialog.removeEventListener("keydown", onKeydown);
      resolve(value);
    };
    const onOk = () => close(true);
    const onCancel = () => close(false);
    const onKeydown = (event) => {
      if (event.key === "Escape") onCancel();
      if (event.key === "Enter") onOk();
    };
    okBtn?.addEventListener("click", onOk);
    cancelBtn?.addEventListener("click", onCancel);
    dialog.addEventListener("keydown", onKeydown);
    requestAnimationFrame(() => okBtn?.focus({ preventScroll: true }));
  });
}

function ensureUninstallRequestDialog() {
  let dialog = $("#uninstallRequestDialog");
  if (dialog) return dialog;
  dialog = document.createElement("div");
  dialog.id = "uninstallRequestDialog";
  dialog.className = "admin-confirm-dialog";
  dialog.hidden = true;
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "uninstallRequestTitle");
  dialog.innerHTML = `
    <form class="admin-confirm-card uninstall-request-card" data-dialog-type="danger">
      <div class="admin-confirm-mark" aria-hidden="true">!</div>
      <div class="admin-confirm-content">
        <p>不可恢复操作</p>
        <h2 id="uninstallRequestTitle">发起彻底卸载</h2>
        <div class="admin-confirm-message">远程申请不会立即删除。实操机本地管理员仍需在 15 分钟内完成二次确认。</div>
        <label>
          <span>重新输入当前管理员密码</span>
          <input data-uninstall-password type="password" autocomplete="current-password" />
        </label>
        <label>
          <span>输入确认文字：彻底卸载电商 AI 画布</span>
          <input data-uninstall-phrase autocomplete="off" />
        </label>
      </div>
      <div class="admin-confirm-actions">
        <button class="secondary" type="button" data-uninstall-cancel>取消</button>
        <button class="primary destructive" type="submit" data-uninstall-submit disabled>发起申请</button>
      </div>
    </form>
  `;
  document.body.appendChild(dialog);
  return dialog;
}

function requestUninstallCredentials() {
  const dialog = ensureUninstallRequestDialog();
  const form = dialog.querySelector("form");
  const password = dialog.querySelector("[data-uninstall-password]");
  const phrase = dialog.querySelector("[data-uninstall-phrase]");
  const submit = dialog.querySelector("[data-uninstall-submit]");
  const cancel = dialog.querySelector("[data-uninstall-cancel]");
  password.value = "";
  phrase.value = "";
  submit.disabled = true;
  dialog.hidden = false;
  return new Promise((resolve) => {
    const sync = () => {
      submit.disabled = !password.value || phrase.value.trim() !== "彻底卸载电商 AI 画布";
    };
    const close = (value) => {
      dialog.hidden = true;
      password.value = "";
      phrase.value = "";
      form.removeEventListener("submit", onSubmit);
      cancel.removeEventListener("click", onCancel);
      password.removeEventListener("input", sync);
      phrase.removeEventListener("input", sync);
      dialog.removeEventListener("keydown", onKeydown);
      resolve(value);
    };
    const onSubmit = (event) => {
      event.preventDefault();
      sync();
      if (submit.disabled) return;
      close({ password: password.value, phrase: phrase.value.trim() });
    };
    const onCancel = () => close(null);
    const onKeydown = (event) => {
      if (event.key === "Escape") onCancel();
    };
    form.addEventListener("submit", onSubmit);
    cancel.addEventListener("click", onCancel);
    password.addEventListener("input", sync);
    phrase.addEventListener("input", sync);
    dialog.addEventListener("keydown", onKeydown);
    requestAnimationFrame(() => password.focus({ preventScroll: true }));
  });
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toast.timer);
  clearTimeout(toast.clearTimer);
  toast.timer = setTimeout(() => {
    els.toast.classList.remove("show");
    toast.clearTimer = setTimeout(() => {
      if (!els.toast.classList.contains("show")) els.toast.textContent = "";
    }, 220);
  }, 2600);
}

init();
