(function () {
  const app = window.EcommerceCanvasApp = window.EcommerceCanvasApp || {};

  app.createAuthController = function createAuthController(deps) {
    const {
      els,
      state,
      createClientId,
      loadAiConversations,
      saveAiConversationNow,
      renderAiConversationList,
      toast
    } = deps;
    let authEventsBound = false;
    const releaseNoticeId = "open-source-preview-1";
    const privacyNoticeId = "privacy-and-ai-v1";
    const tr = (key, fallback = "") => window.EcommerceCanvasI18n?.t(key, fallback) || fallback || key;

    function localizedAccountText(value, fallbackKey, fallback) {
      const text = String(value || "").trim();
      const known = {
        "系统管理员": "systemAdministrator",
        "中控管理员": "adminPlan",
        "基础版": "basicPlan"
      };
      return known[text] ? tr(known[text], text) : (text || tr(fallbackKey, fallback));
    }

    function clearLoginSecrets() {
      if (els.loginPassword) {
        els.loginPassword.value = "";
        els.loginPassword.setAttribute("autocomplete", "new-password");
      }
    }

    function formatMaintenanceMessage(maintenance, fallback = "") {
      if (fallback) return fallback;
      if (!maintenance) return "";
      const endsAt = maintenance.endsAt
        ? `预计恢复时间：${new Date(maintenance.endsAt).toLocaleString("zh-CN", { hour12: false })}`
        : "";
      return [
        maintenance.message || "",
        maintenance.detail || "",
        endsAt
      ].filter(Boolean).join("\n");
    }

    function applyMaintenanceLoginState(maintenance) {
      const active = Boolean(maintenance?.active);
      els.loginForm?.classList.toggle("maintenance-mode", active);
      const kicker = els.loginForm?.querySelector(".login-kicker");
      const title = els.loginForm?.querySelector(".login-brand h2");
      if (kicker) kicker.textContent = active ? tr("systemNotice", "System notice") : tr("productName", "AI Creative Canvas");
      if (title) title.textContent = active ? (maintenance.title || tr("systemMaintenance", "System maintenance")) : tr("productLogin", "Sign in to AI Creative Canvas");
    }

    function releaseNoticeAccountKey(user = state.account.user) {
      return String(user?.username || user?.id || user?.displayName || els.loginUsername?.value?.trim() || "anonymous")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_\-.@\u4e00-\u9fa5]+/gi, "_");
    }

    function releaseNoticeStorageKey(user = state.account.user) {
      return `ecommerce-canvas_release_notice:${releaseNoticeId}:${releaseNoticeAccountKey(user)}`;
    }

    function isReleaseNoticeAcknowledged(user = state.account.user) {
      try {
        return localStorage.getItem(releaseNoticeStorageKey(user)) === "1";
      } catch (error) {
        return false;
      }
    }

    function showReleaseNoticeIfNeeded() {
      if (els.releaseNoticeDialog) els.releaseNoticeDialog.hidden = true;
      return;
      if (!state.account.user || !els.releaseNoticeDialog) return;
      if (isReleaseNoticeAcknowledged(state.account.user)) {
        els.releaseNoticeDialog.hidden = true;
        return;
      }
      els.releaseNoticeDialog.hidden = false;
      window.setTimeout(() => els.releaseNoticeAckBtn?.focus(), 0);
    }

    function acknowledgeReleaseNotice() {
      if (!state.account.user || !els.releaseNoticeDialog) return;
      try {
        localStorage.setItem(releaseNoticeStorageKey(state.account.user), "1");
      } catch (error) {
        console.warn("Release notice acknowledgement could not be stored.", error);
      }
      els.releaseNoticeDialog.hidden = true;
    }

    function privacyNoticeStorageKey(user = state.account.user) {
      return `ecommerce-canvas_privacy_notice:${privacyNoticeId}:${releaseNoticeAccountKey(user)}`;
    }

    function isPrivacyNoticeAcknowledged(user = state.account.user) {
      try {
        return localStorage.getItem(privacyNoticeStorageKey(user)) === "1";
      } catch {
        return false;
      }
    }

    function renderPrivacyNotice() {
      const privacy = state.clientConfig?.privacy || {};
      const retention = privacy.retention || {};
      if (els.privacyRetentionSummary) {
        els.privacyRetentionSummary.textContent = retention.enabled === false
          ? tr("privacyRetentionDisabled", "Automatic local cleanup is disabled by the operator.")
          : window.EcommerceCanvasI18n?.format(
              "privacyRetentionSummary",
              {
                failures: Number(retention.automaticFailureDays || 30),
                feedback: Number(retention.feedbackDays || 180),
                conversations: Number(retention.conversationsDays || 365),
                projects: Number(retention.canvasProjectsDays || 365),
                images: Number(retention.generatedImagesDays || 90)
              },
              "Local data is cleaned automatically according to the operator's retention settings."
            );
      }
      if (els.privacyOperatorContact) {
        const contact = String(privacy.operatorContact || "").trim();
        els.privacyOperatorContact.textContent = contact
          ? `${tr("privacyContact", "Operator contact")}: ${contact}`
          : tr("privacyContactUnavailable", "For access, export, correction, or deletion requests, contact the organization operating this deployment.");
      }
    }

    function showPrivacyNoticeIfNeeded(force = false) {
      if (!state.account.user || !els.privacyNoticeDialog) return;
      renderPrivacyNotice();
      if (!force && isPrivacyNoticeAcknowledged(state.account.user)) {
        els.privacyNoticeDialog.hidden = true;
        return;
      }
      els.privacyNoticeDialog.hidden = false;
      window.setTimeout(() => els.privacyNoticeAckBtn?.focus(), 0);
    }

    function acknowledgePrivacyNotice() {
      if (!state.account.user || !els.privacyNoticeDialog) return;
      try {
        localStorage.setItem(privacyNoticeStorageKey(state.account.user), "1");
      } catch (error) {
        console.warn("Privacy notice acknowledgement could not be stored.", error);
      }
      els.privacyNoticeDialog.hidden = true;
    }

    async function initAccount() {
      state.account.deviceId = localStorage.getItem("eps_device_id") || createClientId();
      localStorage.setItem("eps_device_id", state.account.deviceId);
      if (els.loginRemember) {
        els.loginRemember.checked = localStorage.getItem("eps_remember_login") === "true";
      }
      if (els.loginUsername) {
        els.loginUsername.value = localStorage.getItem("eps_last_username") || "";
      }
      renderAccountState();
      try {
        const response = await fetch("/api/account/me");
        const data = await response.json();
        if (!response.ok) {
          const error = new Error(data.error || "未登录");
          error.maintenance = data.maintenance || null;
          throw error;
        }
        state.account.user = data.user;
        hideLoginOverlay();
        await loadAiConversations();
        showReleaseNoticeIfNeeded();
        showPrivacyNoticeIfNeeded();
      } catch (error) {
        state.account.user = null;
        const message = error?.maintenance?.active
          ? formatMaintenanceMessage(error.maintenance, error.message)
          : "";
        showLoginOverlay(message, error?.maintenance);
      } finally {
        state.account.ready = true;
        renderAccountState();
      }
    }

    async function refreshAccount() {
      try {
        const response = await fetch("/api/account/me");
        const data = await response.json();
        if (!response.ok) {
          const error = new Error(data.error || "账户状态读取失败");
          error.maintenance = data.maintenance || null;
          throw error;
        }
        state.account.user = data.user;
        hideLoginOverlay();
        showReleaseNoticeIfNeeded();
        showPrivacyNoticeIfNeeded();
      } catch (error) {
        if (error?.maintenance?.active) {
          state.account.user = null;
          showLoginOverlay(formatMaintenanceMessage(error.maintenance, error.message), error.maintenance);
        }
        if (error.message !== "账户状态读取失败") console.error(error);
      } finally {
        renderAccountState();
      }
    }

    async function handleLoginSubmit(event) {
      event.preventDefault();
      if (els.loginError) els.loginError.textContent = "";
      const previousText = els.loginBtn?.textContent || "登录";
      if (els.loginBtn) {
        els.loginBtn.disabled = true;
        els.loginBtn.textContent = "登录中...";
      }
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch("/api/account/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            username: els.loginUsername?.value.trim(),
            password: els.loginPassword?.value || "",
            rememberLogin: Boolean(els.loginRemember?.checked),
            deviceId: state.account.deviceId,
            deviceName: `${navigator.platform || "Windows"} · ${navigator.userAgent.slice(0, 80)}`
          })
        });
        const data = await response.json();
        if (!response.ok) {
          const error = new Error(data.error || "登录失败");
          error.maintenance = data.maintenance || null;
          throw error;
        }
        state.account.user = data.user;
        localStorage.setItem("eps_remember_login", els.loginRemember?.checked ? "true" : "false");
        localStorage.setItem("eps_last_username", els.loginUsername?.value.trim() || "");
        if (els.loginPassword) els.loginPassword.value = "";
        hideLoginOverlay();
        renderAccountState();
        await loadAiConversations();
        showReleaseNoticeIfNeeded();
        showPrivacyNoticeIfNeeded();
        toast("登录成功。");
      } catch (error) {
        const message = error.name === "AbortError"
          ? "登录请求超时，请确认员工端服务已启动后刷新页面。"
          : (error.message || "登录失败，请检查账号密码。");
        showLoginOverlay(message, error.maintenance);
      } finally {
        window.clearTimeout(timer);
        if (els.loginBtn) {
          els.loginBtn.disabled = false;
          els.loginBtn.textContent = previousText;
        }
      }
    }

    function handleForgotPassword() {
      const message = "忘记密码请联系管理员，在管理端重置员工密码。";
      if (els.loginError) els.loginError.textContent = message;
      toast(message);
    }

    function openPasswordDialog() {
      if (els.passwordError) els.passwordError.textContent = "";
      if (els.passwordUsername) {
        els.passwordUsername.value = state.account.user?.username || els.loginUsername?.value.trim() || "";
      }
      if (els.currentPassword) els.currentPassword.value = "";
      if (els.newPassword) els.newPassword.value = "";
      if (els.confirmPassword) els.confirmPassword.value = "";
      if (els.passwordDialog) els.passwordDialog.hidden = false;
      window.setTimeout(() => (els.passwordUsername?.value ? els.currentPassword : els.passwordUsername)?.focus(), 0);
    }

    function closePasswordDialog() {
      if (els.passwordDialog) els.passwordDialog.hidden = true;
      if (els.passwordError) els.passwordError.textContent = "";
    }

    async function handlePasswordChangeSubmit(event) {
      event.preventDefault();
      if (els.passwordError) els.passwordError.textContent = "";
      const username = state.account.user?.username || els.passwordUsername?.value.trim() || "";
      const currentPassword = els.currentPassword?.value || "";
      const newPassword = els.newPassword?.value || "";
      const confirmPassword = els.confirmPassword?.value || "";
      if (!username || !currentPassword || !newPassword || !confirmPassword) {
        if (els.passwordError) els.passwordError.textContent = "请完整输入账号、当前密码和新密码。";
        return;
      }
      if (newPassword.length < 6) {
        if (els.passwordError) els.passwordError.textContent = "新密码至少 6 位。";
        return;
      }
      if (newPassword !== confirmPassword) {
        if (els.passwordError) els.passwordError.textContent = "两次输入的新密码不一致。";
        return;
      }

      const previousText = els.passwordSubmitBtn?.textContent || "保存新密码";
      if (els.passwordSubmitBtn) {
        els.passwordSubmitBtn.disabled = true;
        els.passwordSubmitBtn.textContent = "保存中...";
      }
      try {
        const response = await fetch("/api/account/change-password", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ username, currentPassword, newPassword, confirmPassword })
        });
        const data = await response.json();
        if (!response.ok) {
          const error = new Error(data.error || "修改密码失败");
          error.maintenance = data.maintenance || null;
          throw error;
        }
        state.account.user = data.user || state.account.user;
        renderAccountState();
        closePasswordDialog();
        if (els.loginUsername && username) els.loginUsername.value = username;
        if (els.loginPassword) els.loginPassword.value = "";
        if (els.loginError) els.loginError.textContent = "密码已修改，请使用新密码登录。";
        toast("密码已修改。");
      } catch (error) {
        if (els.passwordError) els.passwordError.textContent = error.message || "修改密码失败。";
        handleAuthFailure(error);
      } finally {
        if (els.passwordSubmitBtn) {
          els.passwordSubmitBtn.disabled = false;
          els.passwordSubmitBtn.textContent = previousText;
        }
      }
    }

    async function handleLogout() {
      await saveAiConversationNow();
      await fetch("/api/account/logout", { method: "POST" }).catch(() => {});
      state.account.user = null;
      state.aiDirect.conversations = [];
      state.aiDirect.activeConversationId = "";
      closePasswordDialog();
      if (els.releaseNoticeDialog) els.releaseNoticeDialog.hidden = true;
      if (els.privacyNoticeDialog) els.privacyNoticeDialog.hidden = true;
      renderAccountState();
      renderAiConversationList();
      showLoginOverlay();
    }

    function requireLoggedIn() {
      if (state.account.user) return true;
      showLoginOverlay("请先登录账户后再使用。");
      return false;
    }

    function showLoginOverlay(message = "", maintenance = null) {
      if (els.loginOverlay) els.loginOverlay.classList.remove("hidden");
      applyMaintenanceLoginState(maintenance);
      if (els.loginError) els.loginError.textContent = message;
    }

    function hideLoginOverlay() {
      if (els.loginOverlay) els.loginOverlay.classList.add("hidden");
      applyMaintenanceLoginState(null);
      if (els.loginError) els.loginError.textContent = "";
    }

    function renderAccountState() {
      const user = state.account.user;
      if (els.accountStatus) {
        els.accountStatus.textContent = user ? tr("signedIn", "Signed in") : tr("notLoggedIn", "Not signed in");
        els.accountStatus.classList.toggle("ready", Boolean(user));
        els.accountStatus.classList.toggle("pending", !user);
      }
      if (els.accountName) {
        els.accountName.textContent = user
          ? localizedAccountText(user.displayName || user.username, "systemAdministrator", "System administrator")
          : tr("login", "Sign in");
      }
      if (els.accountPlan) {
        const expiry = user?.expiresAt
          ? ` · ${tr("expires", "Expires")} ${new Date(user.expiresAt).toLocaleDateString(window.EcommerceCanvasI18n?.currentLocale?.() || undefined)}`
          : "";
        els.accountPlan.textContent = user
          ? `${localizedAccountText(user.plan, "basicPlan", "Basic")}${expiry}`
          : tr("loginAfter", "Usage is recorded after sign-in");
      }
      if (els.logoutBtn) els.logoutBtn.style.display = user ? "inline-flex" : "none";
      renderUsageValue(els.usageAiImages, user, "aiImages");
      renderUsageValue(els.usageCopywriting, user, "copywriting");
    }

    function renderUsageValue(element, user, key) {
      if (!element) return;
      if (!user) {
        element.textContent = "0/0";
        return;
      }
      const used = Number(user.usage?.[key] || 0);
      const quota = Number(user.quota?.[key] ?? 0);
      element.textContent = quota < 0 ? `${used}/${tr("unlimited", "Unlimited")}` : `${used}/${quota}`;
    }

    function handleAuthFailure(error) {
      const message = error?.message || "请先登录账户。";
      if (/登录|账户|授权|到期|停用|用量|维护|系统/.test(message)) showLoginOverlay(message, error?.maintenance);
    }

    function bindAuthEvents() {
      if (authEventsBound) return;
      authEventsBound = true;
      const on = (element, event, handler) => {
        if (element && typeof handler === "function") element.addEventListener(event, handler);
      };
      on(els.loginForm, "submit", handleLoginSubmit);
      on(els.logoutBtn, "click", handleLogout);
      on(els.forgotPasswordBtn, "click", handleForgotPassword);
      on(els.releaseNoticeAckBtn, "click", acknowledgeReleaseNotice);
      on(els.privacyNoticeBtn, "click", () => showPrivacyNoticeIfNeeded(true));
      on(els.privacyNoticeAckBtn, "click", acknowledgePrivacyNotice);
      on(els.changePasswordBtn, "click", openPasswordDialog);
      on(els.passwordForm, "submit", handlePasswordChangeSubmit);
      on(els.passwordCancelBtn, "click", closePasswordDialog);
      on(els.passwordDialog, "click", (event) => {
        if (event.target === els.passwordDialog) closePasswordDialog();
      });
      window.addEventListener("ai-canvas-locale-change", renderPrivacyNotice);
      window.addEventListener("ai-canvas-client-config-change", () => {
        renderPrivacyNotice();
        showPrivacyNoticeIfNeeded();
      });
    }

    return {
      clearLoginSecrets,
      bindAuthEvents,
      initAccount,
      refreshAccount,
      handleLoginSubmit,
      handleForgotPassword,
      openPasswordDialog,
      closePasswordDialog,
      handlePasswordChangeSubmit,
      handleLogout,
      requireLoggedIn,
      showLoginOverlay,
      hideLoginOverlay,
      renderAccountState,
      handleAuthFailure
    };
  };
})();
