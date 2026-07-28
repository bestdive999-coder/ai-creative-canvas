(function () {
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
    adminConsole: "Admin console",
    adminSummary: "Sign in to view workspace status.",
    notLoggedIn: "Not signed in",
    login: "Sign in",
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
    status: "Status",
    ready: "Ready",
    loading: "Loading workspace data...",
    loginRequired: "Sign in to view admin data",
    loginSuccess: "Signed in",
    system: "System",
    intranet: "Private network",
    adminLogin: "Admin sign in",
    username: "Username",
    password: "Password",
    confirmPassword: "Confirm password",
    adminSetup: "Set up administrator",
    adminLoginProgress: "Signing in...",
    adminSetupProgress: "Setting up...",
    adminLoginKicker: "ADMIN SIGN IN",
    adminSetupKicker: "ADMIN SETUP",
    localAdministrator: "Local administrator",
    moduleOverviewTitle: "Operations overview",
    moduleOverviewKicker: "Start with today’s operating picture",
    moduleOverviewDescription: "Accounts, tasks, and system health in one place for a quick first check.",
    moduleAccountsTitle: "Account authorization",
    moduleAccountsKicker: "Employee access and quotas",
    moduleAccountsDescription: "Manage employee accounts, device limits, plans, and AI quotas.",
    moduleUsageTitle: "Usage analytics",
    moduleUsageKicker: "Consumption from an owner’s view",
    moduleUsageDescription: "Review image and copy usage by time, employee, and module.",
    moduleFeedbackTitle: "Feedback and failures",
    moduleFeedbackKicker: "Keep image-generation issues traceable",
    moduleFeedbackDescription: "Review employee feedback and generation failures with reasons, prompts, and references.",
    moduleAiTitle: "AI configuration",
    moduleAiKicker: "Models and Skills",
    moduleAiDescription: "Manage API keys, image models, reasoning models, copy models, and employee Skills.",
    moduleDiagnosticsTitle: "Unattended diagnostics",
    moduleDiagnosticsKicker: "Runtime health",
    moduleDiagnosticsDescription: "Check the maintenance guardian, logs, and critical directories.",
    moduleSystemTitle: "Network and updates",
    moduleSystemKicker: "Deployment and version",
    moduleSystemDescription: "Manage organization details, updates, and startup behavior."
  };

  const dictionaries = {
    en,
    "zh-CN": {
      ...en,
      language: "语言", adminConsole: "管理员中控", adminSummary: "登录后查看运行状态。", notLoggedIn: "未登录",
      login: "登录", employee: "员工端", refresh: "刷新", logout: "退出", overview: "总览", operations: "运营",
      accounts: "账户", authorization: "授权", usage: "用量", statistics: "统计", feedback: "反馈", issues: "问题",
      models: "模型", health: "体检", status: "状态", ready: "已登录", loading: "正在读取中控数据...",
      loginRequired: "管理员登录后显示中控数据", loginSuccess: "登录成功", system: "系统", intranet: "本地网络",
      adminLogin: "登录管理员中控", username: "账号", password: "密码", confirmPassword: "确认密码",
      adminSetup: "初始化中控台管理员", adminLoginProgress: "登录中...", adminSetupProgress: "初始化中...",
      adminLoginKicker: "管理员登录", adminSetupKicker: "管理员初始化", localAdministrator: "本地管理员",
      moduleOverviewTitle: "运营总览", moduleOverviewKicker: "今天先看运行盘面",
      moduleOverviewDescription: "账户、任务和系统健康集中在这里，适合打开后台后先扫一眼。",
      moduleAccountsTitle: "账户授权", moduleAccountsKicker: "员工权限和额度",
      moduleAccountsDescription: "管理员工账号、设备数、套餐和 AI 功能额度。",
      moduleUsageTitle: "用量统计", moduleUsageKicker: "管理视角的消耗结构",
      moduleUsageDescription: "按时间、员工和模块查看 AI 生图与文案用量。",
      moduleFeedbackTitle: "反馈与失败", moduleFeedbackKicker: "出图问题留痕",
      moduleFeedbackDescription: "集中查看员工反馈和自动记录的生图失败，包含原因、提示词和参考图。",
      moduleAiTitle: "AI 配置", moduleAiKicker: "模型与 Skills",
      moduleAiDescription: "集中维护 API Key、生图模型、思考模型、文案模型和员工端 Skills。",
      moduleDiagnosticsTitle: "无人值守体检", moduleDiagnosticsKicker: "运行环境健康",
      moduleDiagnosticsDescription: "检查维护守护、日志和关键目录是否处在可用状态。",
      moduleSystemTitle: "网络与更新", moduleSystemKicker: "部署与版本",
      moduleSystemDescription: "维护公司信息、版本更新和开机自启动。"
    },
    ja: {
      ...en,
      language: "言語", adminConsole: "管理コンソール", adminSummary: "ログインして稼働状況を確認します。", notLoggedIn: "未ログイン",
      login: "ログイン", employee: "従業員画面", refresh: "更新", logout: "ログアウト", overview: "概要", operations: "運用",
      accounts: "アカウント", authorization: "権限", usage: "使用量", statistics: "統計", feedback: "フィードバック", issues: "問題",
      models: "モデル", health: "診断", status: "状態", ready: "ログイン済み", loading: "管理データを読み込み中...",
      loginRequired: "管理者としてログインしてください", loginSuccess: "ログインしました", system: "システム", intranet: "ローカルネットワーク",
      adminLogin: "管理者ログイン", username: "ユーザー名", password: "パスワード", confirmPassword: "パスワード確認",
      adminSetup: "管理者を設定", adminLoginProgress: "ログイン中...", adminSetupProgress: "設定中...",
      adminLoginKicker: "管理者ログイン", adminSetupKicker: "管理者設定", localAdministrator: "ローカル管理者",
      moduleOverviewTitle: "運用概要", moduleOverviewKicker: "まず今日の稼働状況を確認",
      moduleOverviewDescription: "アカウント、タスク、システム状態を一か所で確認できます。",
      moduleAccountsTitle: "アカウント権限", moduleAccountsKicker: "従業員の権限と上限",
      moduleAccountsDescription: "従業員アカウント、端末数、プラン、AI 利用上限を管理します。",
      moduleUsageTitle: "使用量分析", moduleUsageKicker: "管理者視点の消費内訳",
      moduleUsageDescription: "時間、従業員、モジュール別に画像生成と文章作成の使用量を確認します。",
      moduleFeedbackTitle: "フィードバックと失敗", moduleFeedbackKicker: "画像生成の問題を追跡",
      moduleFeedbackDescription: "理由、プロンプト、参照画像を含むフィードバックと生成失敗を確認します。",
      moduleAiTitle: "AI 設定", moduleAiKicker: "モデルと Skills",
      moduleAiDescription: "API キー、画像・推論・文章モデル、従業員向け Skills を管理します。",
      moduleDiagnosticsTitle: "無人診断", moduleDiagnosticsKicker: "実行環境の状態",
      moduleDiagnosticsDescription: "保守ガーディアン、ログ、重要ディレクトリを確認します。",
      moduleSystemTitle: "ネットワークと更新", moduleSystemKicker: "配備とバージョン",
      moduleSystemDescription: "組織情報、更新、自動起動を管理します。"
    },
    ko: {
      ...en,
      language: "언어", adminConsole: "관리자 콘솔", adminSummary: "로그인하여 실행 상태를 확인하세요.", notLoggedIn: "로그인되지 않음",
      login: "로그인", employee: "직원 화면", refresh: "새로 고침", logout: "로그아웃", overview: "개요", operations: "운영",
      accounts: "계정", authorization: "권한", usage: "사용량", statistics: "통계", feedback: "피드백", issues: "문제",
      models: "모델", health: "진단", status: "상태", ready: "로그인됨", loading: "관리 데이터를 불러오는 중...",
      loginRequired: "관리자로 로그인하세요", loginSuccess: "로그인됨", system: "시스템", intranet: "로컬 네트워크",
      adminLogin: "관리자 로그인", username: "사용자 이름", password: "비밀번호", confirmPassword: "비밀번호 확인",
      adminSetup: "관리자 설정", adminLoginProgress: "로그인 중...", adminSetupProgress: "설정 중...",
      adminLoginKicker: "관리자 로그인", adminSetupKicker: "관리자 설정", localAdministrator: "로컬 관리자",
      moduleOverviewTitle: "운영 개요", moduleOverviewKicker: "오늘의 운영 현황부터 확인",
      moduleOverviewDescription: "계정, 작업, 시스템 상태를 한곳에서 빠르게 확인합니다.",
      moduleAccountsTitle: "계정 권한", moduleAccountsKicker: "직원 권한과 할당량",
      moduleAccountsDescription: "직원 계정, 기기 수, 요금제와 AI 할당량을 관리합니다.",
      moduleUsageTitle: "사용량 분석", moduleUsageKicker: "관리 관점의 소비 구조",
      moduleUsageDescription: "시간, 직원, 모듈별 이미지 및 문구 사용량을 확인합니다.",
      moduleFeedbackTitle: "피드백 및 실패", moduleFeedbackKicker: "이미지 생성 문제 추적",
      moduleFeedbackDescription: "원인, 프롬프트, 참조 자료가 포함된 피드백과 생성 실패를 확인합니다.",
      moduleAiTitle: "AI 구성", moduleAiKicker: "모델과 Skills",
      moduleAiDescription: "API 키, 이미지·추론·문구 모델과 직원용 Skills를 관리합니다.",
      moduleDiagnosticsTitle: "무인 진단", moduleDiagnosticsKicker: "실행 환경 상태",
      moduleDiagnosticsDescription: "유지관리 가디언, 로그, 중요 디렉터리를 점검합니다.",
      moduleSystemTitle: "네트워크 및 업데이트", moduleSystemKicker: "배포와 버전",
      moduleSystemDescription: "조직 정보, 업데이트, 자동 시작을 관리합니다."
    },
    es: {
      ...en,
      language: "Idioma", adminConsole: "Consola de administración", adminSummary: "Inicia sesión para ver el estado.", notLoggedIn: "Sin iniciar sesión",
      login: "Iniciar sesión", employee: "Espacio de empleados", refresh: "Actualizar", logout: "Cerrar sesión", overview: "Resumen", operations: "Operaciones",
      accounts: "Cuentas", authorization: "Permisos", usage: "Uso", statistics: "Estadísticas", feedback: "Comentarios", issues: "Problemas",
      models: "Modelos", health: "Diagnóstico", status: "Estado", ready: "Sesión iniciada", loading: "Cargando datos de administración...",
      loginRequired: "Inicia sesión como administrador", loginSuccess: "Sesión iniciada", system: "Sistema", intranet: "Red local",
      adminLogin: "Acceso de administrador", username: "Usuario", password: "Contraseña", confirmPassword: "Confirmar contraseña",
      adminSetup: "Configurar administrador", adminLoginProgress: "Iniciando sesión...", adminSetupProgress: "Configurando...",
      adminLoginKicker: "ACCESO DE ADMINISTRADOR", adminSetupKicker: "CONFIGURAR ADMINISTRADOR", localAdministrator: "Administrador local",
      moduleOverviewTitle: "Resumen de operaciones", moduleOverviewKicker: "Empieza por la actividad de hoy",
      moduleOverviewDescription: "Cuentas, tareas y estado del sistema reunidos para una revisión rápida.",
      moduleAccountsTitle: "Permisos de cuentas", moduleAccountsKicker: "Acceso y cuotas de empleados",
      moduleAccountsDescription: "Gestiona cuentas, límites de dispositivos, planes y cuotas de IA.",
      moduleUsageTitle: "Análisis de uso", moduleUsageKicker: "Estructura de consumo para administración",
      moduleUsageDescription: "Revisa el uso de imágenes y textos por fecha, empleado y módulo.",
      moduleFeedbackTitle: "Comentarios y fallos", moduleFeedbackKicker: "Seguimiento de problemas de generación",
      moduleFeedbackDescription: "Revisa comentarios y fallos con motivos, instrucciones y referencias.",
      moduleAiTitle: "Configuración de IA", moduleAiKicker: "Modelos y Skills",
      moduleAiDescription: "Gestiona claves API, modelos de imagen, razonamiento, texto y Skills.",
      moduleDiagnosticsTitle: "Diagnóstico desatendido", moduleDiagnosticsKicker: "Estado del entorno",
      moduleDiagnosticsDescription: "Comprueba el supervisor de mantenimiento, registros y carpetas críticas.",
      moduleSystemTitle: "Red y actualizaciones", moduleSystemKicker: "Despliegue y versión",
      moduleSystemDescription: "Gestiona la organización, las actualizaciones y el inicio automático."
    },
    "pt-BR": {
      ...en,
      language: "Idioma", adminConsole: "Console administrativo", adminSummary: "Entre para ver o status.", notLoggedIn: "Não conectado",
      login: "Entrar", employee: "Área do funcionário", refresh: "Atualizar", logout: "Sair", overview: "Visão geral", operations: "Operações",
      accounts: "Contas", authorization: "Permissões", usage: "Uso", statistics: "Estatísticas", feedback: "Feedback", issues: "Problemas",
      models: "Modelos", health: "Diagnóstico", status: "Status", ready: "Conectado", loading: "Carregando dados administrativos...",
      loginRequired: "Entre como administrador", loginSuccess: "Login realizado", system: "Sistema", intranet: "Rede local",
      adminLogin: "Login do administrador", username: "Usuário", password: "Senha", confirmPassword: "Confirmar senha",
      adminSetup: "Configurar administrador", adminLoginProgress: "Entrando...", adminSetupProgress: "Configurando...",
      adminLoginKicker: "LOGIN DO ADMINISTRADOR", adminSetupKicker: "CONFIGURAR ADMINISTRADOR", localAdministrator: "Administrador local",
      moduleOverviewTitle: "Visão geral das operações", moduleOverviewKicker: "Comece pelo panorama de hoje",
      moduleOverviewDescription: "Contas, tarefas e integridade do sistema reunidas para uma verificação rápida.",
      moduleAccountsTitle: "Permissões de contas", moduleAccountsKicker: "Acesso e cotas dos funcionários",
      moduleAccountsDescription: "Gerencie contas, limites de dispositivos, planos e cotas de IA.",
      moduleUsageTitle: "Análise de uso", moduleUsageKicker: "Estrutura de consumo para gestão",
      moduleUsageDescription: "Veja o uso de imagens e textos por período, funcionário e módulo.",
      moduleFeedbackTitle: "Feedback e falhas", moduleFeedbackKicker: "Rastreie problemas de geração",
      moduleFeedbackDescription: "Revise feedback e falhas com motivos, prompts e referências.",
      moduleAiTitle: "Configuração de IA", moduleAiKicker: "Modelos e Skills",
      moduleAiDescription: "Gerencie chaves API, modelos de imagem, raciocínio, texto e Skills.",
      moduleDiagnosticsTitle: "Diagnóstico autônomo", moduleDiagnosticsKicker: "Saúde do ambiente",
      moduleDiagnosticsDescription: "Verifique o agente de manutenção, logs e diretórios críticos.",
      moduleSystemTitle: "Rede e atualizações", moduleSystemKicker: "Implantação e versão",
      moduleSystemDescription: "Gerencie a organização, atualizações e inicialização automática."
    },
    fr: {
      ...en,
      language: "Langue", adminConsole: "Console d’administration", adminSummary: "Connectez-vous pour voir l’état.", notLoggedIn: "Non connecté",
      login: "Se connecter", employee: "Espace employé", refresh: "Actualiser", logout: "Se déconnecter", overview: "Vue d’ensemble", operations: "Opérations",
      accounts: "Comptes", authorization: "Autorisations", usage: "Utilisation", statistics: "Statistiques", feedback: "Retours", issues: "Problèmes",
      models: "Modèles", health: "Diagnostic", status: "État", ready: "Connecté", loading: "Chargement des données d’administration...",
      loginRequired: "Connectez-vous en tant qu’administrateur", loginSuccess: "Connexion réussie", system: "Système", intranet: "Réseau local",
      adminLogin: "Connexion administrateur", username: "Nom d’utilisateur", password: "Mot de passe", confirmPassword: "Confirmer le mot de passe",
      adminSetup: "Configurer l’administrateur", adminLoginProgress: "Connexion...", adminSetupProgress: "Configuration...",
      adminLoginKicker: "CONNEXION ADMINISTRATEUR", adminSetupKicker: "CONFIGURATION ADMINISTRATEUR", localAdministrator: "Administrateur local",
      moduleOverviewTitle: "Vue d’ensemble des opérations", moduleOverviewKicker: "Commencez par l’activité du jour",
      moduleOverviewDescription: "Comptes, tâches et état du système réunis pour un contrôle rapide.",
      moduleAccountsTitle: "Autorisations des comptes", moduleAccountsKicker: "Accès et quotas des employés",
      moduleAccountsDescription: "Gérez les comptes, limites d’appareils, offres et quotas d’IA.",
      moduleUsageTitle: "Analyse de l’utilisation", moduleUsageKicker: "Structure de consommation pour la gestion",
      moduleUsageDescription: "Consultez l’usage des images et textes par période, employé et module.",
      moduleFeedbackTitle: "Retours et échecs", moduleFeedbackKicker: "Suivi des problèmes de génération",
      moduleFeedbackDescription: "Consultez les retours et échecs avec motifs, instructions et références.",
      moduleAiTitle: "Configuration de l’IA", moduleAiKicker: "Modèles et Skills",
      moduleAiDescription: "Gérez les clés API, modèles d’image, de raisonnement, de texte et les Skills.",
      moduleDiagnosticsTitle: "Diagnostic sans surveillance", moduleDiagnosticsKicker: "État de l’environnement",
      moduleDiagnosticsDescription: "Vérifiez le gardien de maintenance, les journaux et les dossiers critiques.",
      moduleSystemTitle: "Réseau et mises à jour", moduleSystemKicker: "Déploiement et version",
      moduleSystemDescription: "Gérez l’organisation, les mises à jour et le démarrage automatique."
    },
    de: {
      ...en,
      language: "Sprache", adminConsole: "Administrationskonsole", adminSummary: "Anmelden, um den Status zu sehen.", notLoggedIn: "Nicht angemeldet",
      login: "Anmelden", employee: "Mitarbeiterbereich", refresh: "Aktualisieren", logout: "Abmelden", overview: "Übersicht", operations: "Betrieb",
      accounts: "Konten", authorization: "Berechtigungen", usage: "Nutzung", statistics: "Statistik", feedback: "Feedback", issues: "Probleme",
      models: "Modelle", health: "Diagnose", status: "Status", ready: "Angemeldet", loading: "Verwaltungsdaten werden geladen...",
      loginRequired: "Als Administrator anmelden", loginSuccess: "Angemeldet", system: "System", intranet: "Lokales Netzwerk",
      adminLogin: "Administrator-Anmeldung", username: "Benutzername", password: "Passwort", confirmPassword: "Passwort bestätigen",
      adminSetup: "Administrator einrichten", adminLoginProgress: "Anmeldung läuft...", adminSetupProgress: "Einrichtung läuft...",
      adminLoginKicker: "ADMINISTRATOR-ANMELDUNG", adminSetupKicker: "ADMINISTRATOR EINRICHTEN", localAdministrator: "Lokaler Administrator",
      moduleOverviewTitle: "Betriebsübersicht", moduleOverviewKicker: "Beginnen Sie mit dem heutigen Betrieb",
      moduleOverviewDescription: "Konten, Aufgaben und Systemzustand für eine schnelle Prüfung an einem Ort.",
      moduleAccountsTitle: "Kontoberechtigungen", moduleAccountsKicker: "Zugriff und Kontingente der Mitarbeiter",
      moduleAccountsDescription: "Verwalten Sie Konten, Gerätelimits, Tarife und KI-Kontingente.",
      moduleUsageTitle: "Nutzungsanalyse", moduleUsageKicker: "Verbrauchsstruktur für die Verwaltung",
      moduleUsageDescription: "Prüfen Sie Bild- und Textnutzung nach Zeitraum, Mitarbeiter und Modul.",
      moduleFeedbackTitle: "Feedback und Fehler", moduleFeedbackKicker: "Probleme bei der Generierung verfolgen",
      moduleFeedbackDescription: "Prüfen Sie Feedback und Fehler mit Gründen, Prompts und Referenzen.",
      moduleAiTitle: "KI-Konfiguration", moduleAiKicker: "Modelle und Skills",
      moduleAiDescription: "Verwalten Sie API-Schlüssel, Bild-, Denk- und Textmodelle sowie Skills.",
      moduleDiagnosticsTitle: "Unbeaufsichtigte Diagnose", moduleDiagnosticsKicker: "Zustand der Laufzeit",
      moduleDiagnosticsDescription: "Prüfen Sie Wartungswächter, Protokolle und kritische Verzeichnisse.",
      moduleSystemTitle: "Netzwerk und Updates", moduleSystemKicker: "Bereitstellung und Version",
      moduleSystemDescription: "Verwalten Sie Organisation, Updates und automatischen Start."
    },
    ru: {
      ...en,
      language: "Язык", adminConsole: "Панель администратора", adminSummary: "Войдите, чтобы увидеть состояние.", notLoggedIn: "Вход не выполнен",
      login: "Войти", employee: "Рабочее место сотрудника", refresh: "Обновить", logout: "Выйти", overview: "Обзор", operations: "Операции",
      accounts: "Аккаунты", authorization: "Доступ", usage: "Использование", statistics: "Статистика", feedback: "Отзывы", issues: "Проблемы",
      models: "Модели", health: "Диагностика", status: "Состояние", ready: "Вход выполнен", loading: "Загрузка данных администрирования...",
      loginRequired: "Войдите как администратор", loginSuccess: "Вход выполнен", system: "Система", intranet: "Локальная сеть",
      adminLogin: "Вход администратора", username: "Имя пользователя", password: "Пароль", confirmPassword: "Подтвердите пароль",
      adminSetup: "Настроить администратора", adminLoginProgress: "Выполняется вход...", adminSetupProgress: "Настройка...",
      adminLoginKicker: "ВХОД АДМИНИСТРАТОРА", adminSetupKicker: "НАСТРОЙКА АДМИНИСТРАТОРА", localAdministrator: "Локальный администратор",
      moduleOverviewTitle: "Обзор операций", moduleOverviewKicker: "Начните с картины за сегодня",
      moduleOverviewDescription: "Аккаунты, задачи и состояние системы собраны для быстрой проверки.",
      moduleAccountsTitle: "Доступ к аккаунтам", moduleAccountsKicker: "Права и квоты сотрудников",
      moduleAccountsDescription: "Управляйте аккаунтами, лимитами устройств, тарифами и квотами ИИ.",
      moduleUsageTitle: "Аналитика использования", moduleUsageKicker: "Структура расхода для управления",
      moduleUsageDescription: "Просматривайте использование изображений и текста по времени, сотруднику и модулю.",
      moduleFeedbackTitle: "Отзывы и ошибки", moduleFeedbackKicker: "Отслеживание проблем генерации",
      moduleFeedbackDescription: "Просматривайте отзывы и ошибки с причинами, запросами и референсами.",
      moduleAiTitle: "Настройка ИИ", moduleAiKicker: "Модели и Skills",
      moduleAiDescription: "Управляйте API-ключами, моделями изображений, рассуждений, текста и Skills.",
      moduleDiagnosticsTitle: "Автономная диагностика", moduleDiagnosticsKicker: "Состояние среды",
      moduleDiagnosticsDescription: "Проверяйте службу обслуживания, журналы и важные каталоги.",
      moduleSystemTitle: "Сеть и обновления", moduleSystemKicker: "Развертывание и версия",
      moduleSystemDescription: "Управляйте организацией, обновлениями и автозапуском."
    },
    ar: {
      ...en,
      language: "اللغة", adminConsole: "لوحة الإدارة", adminSummary: "سجّل الدخول لعرض الحالة.", notLoggedIn: "لم يتم تسجيل الدخول",
      login: "تسجيل الدخول", employee: "مساحة الموظف", refresh: "تحديث", logout: "تسجيل الخروج", overview: "نظرة عامة", operations: "العمليات",
      accounts: "الحسابات", authorization: "الصلاحيات", usage: "الاستخدام", statistics: "الإحصاءات", feedback: "الملاحظات", issues: "المشكلات",
      models: "النماذج", health: "التشخيص", status: "الحالة", ready: "تم تسجيل الدخول", loading: "جارٍ تحميل بيانات الإدارة...",
      loginRequired: "سجّل الدخول كمسؤول", loginSuccess: "تم تسجيل الدخول", system: "النظام", intranet: "الشبكة المحلية",
      adminLogin: "تسجيل دخول المسؤول", username: "اسم المستخدم", password: "كلمة المرور", confirmPassword: "تأكيد كلمة المرور",
      adminSetup: "إعداد المسؤول", adminLoginProgress: "جارٍ تسجيل الدخول...", adminSetupProgress: "جارٍ الإعداد...",
      adminLoginKicker: "تسجيل دخول المسؤول", adminSetupKicker: "إعداد المسؤول", localAdministrator: "مسؤول محلي",
      moduleOverviewTitle: "نظرة عامة على العمليات", moduleOverviewKicker: "ابدأ بصورة تشغيل اليوم",
      moduleOverviewDescription: "الحسابات والمهام وحالة النظام في مكان واحد لمراجعة سريعة.",
      moduleAccountsTitle: "صلاحيات الحسابات", moduleAccountsKicker: "وصول الموظفين وحصصهم",
      moduleAccountsDescription: "إدارة الحسابات وحدود الأجهزة والخطط وحصص الذكاء الاصطناعي.",
      moduleUsageTitle: "تحليل الاستخدام", moduleUsageKicker: "هيكل الاستهلاك للإدارة",
      moduleUsageDescription: "مراجعة استخدام الصور والنصوص حسب الوقت والموظف والوحدة.",
      moduleFeedbackTitle: "الملاحظات والإخفاقات", moduleFeedbackKicker: "تتبّع مشكلات التوليد",
      moduleFeedbackDescription: "مراجعة الملاحظات والإخفاقات مع الأسباب والمطالبات والمراجع.",
      moduleAiTitle: "إعداد الذكاء الاصطناعي", moduleAiKicker: "النماذج والمهارات",
      moduleAiDescription: "إدارة مفاتيح API ونماذج الصور والاستدلال والنص والمهارات.",
      moduleDiagnosticsTitle: "تشخيص دون مراقبة", moduleDiagnosticsKicker: "سلامة بيئة التشغيل",
      moduleDiagnosticsDescription: "فحص حارس الصيانة والسجلات والمجلدات المهمة.",
      moduleSystemTitle: "الشبكة والتحديثات", moduleSystemKicker: "النشر والإصدار",
      moduleSystemDescription: "إدارة معلومات المؤسسة والتحديثات والتشغيل التلقائي."
    }
  };

  const privacySupplements = {
    en: {
      privacyAndRetention: "Privacy and retention", retentionEnabledSummary: "Automatic cleanup is enabled",
      retentionDisabledSummary: "Automatic cleanup is disabled", operatorContact: "Operator contact",
      operatorContactPlaceholder: "Email or support channel", enableAutomaticCleanup: "Enable automatic cleanup",
      automaticFailureDays: "Automatic failure logs (days)", feedbackDays: "Employee feedback (days)",
      conversationsDays: "Conversations (days)", canvasProjectsDays: "Canvas projects and unused assets (days)",
      generatedImagesDays: "Generated-image archive (days)", cleanupIntervalHours: "Cleanup interval (hours)",
      failureLoggingNoticeTitle: "Failure logging is enabled",
      failureLoggingNoticeBody: "The employee notice explains that failed AI tasks may retain prompts, references, account details, provider, and model for troubleshooting.",
      deleteAccountConfirmPrefix: "Delete account", deleteAccountCleanupWarning: "The account will be disabled first. Local data will be removed, and configured cloud copies will be queued for deletion. Failed cleanup is retried automatically.",
      deleteAccount: "Delete account", delete: "Delete", deleteAccountFailed: "Account deletion failed",
      deleteAccountPending: "The account is disabled. Data cleanup has been queued and will retry automatically.",
      deleteAccountCompleted: "The account was removed. Cloud cleanup is queued.", deletionPending: "Pending deletion",
      enabled: "Enabled", disabled: "Disabled"
    },
    "zh-CN": {
      privacyAndRetention: "隐私与数据保留", retentionEnabledSummary: "已开启自动清理",
      retentionDisabledSummary: "未开启自动清理", operatorContact: "运营方联系方式",
      operatorContactPlaceholder: "邮箱或支持渠道", enableAutomaticCleanup: "开启自动清理",
      automaticFailureDays: "自动失败日志（天）", feedbackDays: "员工反馈（天）",
      conversationsDays: "对话记录（天）", canvasProjectsDays: "画布项目和未使用素材（天）",
      generatedImagesDays: "生成图片留档（天）", cleanupIntervalHours: "清理间隔（小时）",
      failureLoggingNoticeTitle: "失败日志已启用",
      failureLoggingNoticeBody: "员工端会明确说明：失败的 AI 任务可能保留提示词、参考图、账号信息、服务和模型，用于问题排查。",
      deleteAccountConfirmPrefix: "确定删除账户", deleteAccountCleanupWarning: "系统会先停用账号，再删除本地数据，并把已配置的云端副本加入删除队列；清理失败会自动重试。",
      deleteAccount: "删除账户", delete: "删除", deleteAccountFailed: "删除账户失败",
      deleteAccountPending: "账户已停用，数据清理任务已保存并会自动重试。",
      deleteAccountCompleted: "账户已移除，云端清理任务已排队。", deletionPending: "待删除",
      enabled: "启用", disabled: "停用"
    },
    ja: {
      privacyAndRetention: "プライバシーと保存期間", retentionEnabledSummary: "自動削除は有効です",
      retentionDisabledSummary: "自動削除は無効です", operatorContact: "運営者の連絡先",
      operatorContactPlaceholder: "メールまたはサポート窓口", enableAutomaticCleanup: "自動削除を有効にする",
      automaticFailureDays: "自動失敗ログ（日）", feedbackDays: "従業員フィードバック（日）",
      conversationsDays: "会話履歴（日）", canvasProjectsDays: "キャンバスプロジェクトと未使用素材（日）",
      generatedImagesDays: "生成画像アーカイブ（日）", cleanupIntervalHours: "削除間隔（時間）",
      failureLoggingNoticeTitle: "失敗ログは有効です",
      failureLoggingNoticeBody: "失敗した AI タスクでは、調査のためにプロンプト、参照、アカウント情報、サービス、モデルが保存される場合があります。",
      deleteAccountConfirmPrefix: "アカウントを削除", deleteAccountCleanupWarning: "まずアカウントを無効化し、ローカルデータを削除して、設定済みのクラウドコピーを削除キューに入れます。失敗時は自動再試行します。",
      deleteAccount: "アカウントを削除", delete: "削除", deleteAccountFailed: "アカウントの削除に失敗しました",
      deleteAccountPending: "アカウントを無効化し、データ削除をキューに保存しました。",
      deleteAccountCompleted: "アカウントを削除し、クラウド削除をキューに入れました。", deletionPending: "削除待ち",
      enabled: "有効", disabled: "無効"
    },
    ko: {
      privacyAndRetention: "개인정보 및 보존 기간", retentionEnabledSummary: "자동 정리가 켜져 있습니다",
      retentionDisabledSummary: "자동 정리가 꺼져 있습니다", operatorContact: "운영자 연락처",
      operatorContactPlaceholder: "이메일 또는 지원 채널", enableAutomaticCleanup: "자동 정리 사용",
      automaticFailureDays: "자동 실패 로그(일)", feedbackDays: "직원 피드백(일)",
      conversationsDays: "대화 기록(일)", canvasProjectsDays: "캔버스 프로젝트 및 미사용 자산(일)",
      generatedImagesDays: "생성 이미지 보관(일)", cleanupIntervalHours: "정리 간격(시간)",
      failureLoggingNoticeTitle: "실패 로그가 켜져 있습니다",
      failureLoggingNoticeBody: "실패한 AI 작업은 문제 해결을 위해 프롬프트, 참조, 계정 정보, 서비스와 모델을 보관할 수 있습니다.",
      deleteAccountConfirmPrefix: "계정 삭제", deleteAccountCleanupWarning: "계정을 먼저 비활성화한 뒤 로컬 데이터를 삭제하고 설정된 클라우드 사본을 삭제 대기열에 넣습니다. 실패하면 자동 재시도합니다.",
      deleteAccount: "계정 삭제", delete: "삭제", deleteAccountFailed: "계정 삭제 실패",
      deleteAccountPending: "계정이 비활성화되었고 데이터 정리가 대기열에 저장되었습니다.",
      deleteAccountCompleted: "계정이 삭제되었고 클라우드 정리가 대기열에 추가되었습니다.", deletionPending: "삭제 대기",
      enabled: "활성", disabled: "비활성"
    },
    es: {
      privacyAndRetention: "Privacidad y conservación", retentionEnabledSummary: "La limpieza automática está activada",
      retentionDisabledSummary: "La limpieza automática está desactivada", operatorContact: "Contacto del operador",
      operatorContactPlaceholder: "Correo o canal de soporte", enableAutomaticCleanup: "Activar limpieza automática",
      automaticFailureDays: "Registros automáticos de fallos (días)", feedbackDays: "Comentarios de empleados (días)",
      conversationsDays: "Conversaciones (días)", canvasProjectsDays: "Proyectos y recursos sin usar (días)",
      generatedImagesDays: "Archivo de imágenes generadas (días)", cleanupIntervalHours: "Intervalo de limpieza (horas)",
      failureLoggingNoticeTitle: "El registro de fallos está activo",
      failureLoggingNoticeBody: "Las tareas de IA fallidas pueden conservar instrucciones, referencias, datos de cuenta, servicio y modelo para resolver problemas.",
      deleteAccountConfirmPrefix: "Eliminar cuenta", deleteAccountCleanupWarning: "Primero se desactivará la cuenta, luego se borrarán los datos locales y las copias de nube configuradas pasarán a la cola de eliminación. Los fallos se reintentan.",
      deleteAccount: "Eliminar cuenta", delete: "Eliminar", deleteAccountFailed: "No se pudo eliminar la cuenta",
      deleteAccountPending: "La cuenta está desactivada y la limpieza se guardó para reintento.",
      deleteAccountCompleted: "La cuenta se eliminó y la limpieza de nube está en cola.", deletionPending: "Eliminación pendiente",
      enabled: "Activado", disabled: "Desactivado"
    },
    "pt-BR": {
      privacyAndRetention: "Privacidade e retenção", retentionEnabledSummary: "A limpeza automática está ativada",
      retentionDisabledSummary: "A limpeza automática está desativada", operatorContact: "Contato do operador",
      operatorContactPlaceholder: "E-mail ou canal de suporte", enableAutomaticCleanup: "Ativar limpeza automática",
      automaticFailureDays: "Logs automáticos de falha (dias)", feedbackDays: "Feedback de funcionários (dias)",
      conversationsDays: "Conversas (dias)", canvasProjectsDays: "Projetos e ativos não usados (dias)",
      generatedImagesDays: "Arquivo de imagens geradas (dias)", cleanupIntervalHours: "Intervalo de limpeza (horas)",
      failureLoggingNoticeTitle: "O registro de falhas está ativado",
      failureLoggingNoticeBody: "Tarefas de IA com falha podem reter prompts, referências, dados da conta, serviço e modelo para diagnóstico.",
      deleteAccountConfirmPrefix: "Excluir conta", deleteAccountCleanupWarning: "A conta será desativada primeiro; os dados locais serão removidos e as cópias em nuvem configuradas entrarão na fila. Falhas serão tentadas novamente.",
      deleteAccount: "Excluir conta", delete: "Excluir", deleteAccountFailed: "Falha ao excluir a conta",
      deleteAccountPending: "A conta foi desativada e a limpeza foi salva para nova tentativa.",
      deleteAccountCompleted: "A conta foi removida e a limpeza da nuvem está na fila.", deletionPending: "Exclusão pendente",
      enabled: "Ativado", disabled: "Desativado"
    },
    fr: {
      privacyAndRetention: "Confidentialité et conservation", retentionEnabledSummary: "Le nettoyage automatique est activé",
      retentionDisabledSummary: "Le nettoyage automatique est désactivé", operatorContact: "Contact de l’exploitant",
      operatorContactPlaceholder: "E-mail ou canal d’assistance", enableAutomaticCleanup: "Activer le nettoyage automatique",
      automaticFailureDays: "Journaux automatiques d’échec (jours)", feedbackDays: "Retours des employés (jours)",
      conversationsDays: "Conversations (jours)", canvasProjectsDays: "Projets et ressources inutilisées (jours)",
      generatedImagesDays: "Archive des images générées (jours)", cleanupIntervalHours: "Intervalle de nettoyage (heures)",
      failureLoggingNoticeTitle: "La journalisation des échecs est active",
      failureLoggingNoticeBody: "Les tâches d’IA échouées peuvent conserver les instructions, références, données de compte, service et modèle pour le diagnostic.",
      deleteAccountConfirmPrefix: "Supprimer le compte", deleteAccountCleanupWarning: "Le compte sera d’abord désactivé, puis les données locales seront supprimées et les copies cloud configurées mises en file d’attente. Les échecs seront réessayés.",
      deleteAccount: "Supprimer le compte", delete: "Supprimer", deleteAccountFailed: "Échec de la suppression du compte",
      deleteAccountPending: "Le compte est désactivé et le nettoyage est enregistré pour réessai.",
      deleteAccountCompleted: "Le compte est supprimé et le nettoyage cloud est en attente.", deletionPending: "Suppression en attente",
      enabled: "Activé", disabled: "Désactivé"
    },
    de: {
      privacyAndRetention: "Datenschutz und Aufbewahrung", retentionEnabledSummary: "Automatische Bereinigung ist aktiviert",
      retentionDisabledSummary: "Automatische Bereinigung ist deaktiviert", operatorContact: "Kontakt des Betreibers",
      operatorContactPlaceholder: "E-Mail oder Supportkanal", enableAutomaticCleanup: "Automatische Bereinigung aktivieren",
      automaticFailureDays: "Automatische Fehlerprotokolle (Tage)", feedbackDays: "Mitarbeiterfeedback (Tage)",
      conversationsDays: "Unterhaltungen (Tage)", canvasProjectsDays: "Canvas-Projekte und ungenutzte Assets (Tage)",
      generatedImagesDays: "Archiv generierter Bilder (Tage)", cleanupIntervalHours: "Bereinigungsintervall (Stunden)",
      failureLoggingNoticeTitle: "Fehlerprotokollierung ist aktiv",
      failureLoggingNoticeBody: "Fehlgeschlagene KI-Aufgaben können Prompts, Referenzen, Kontodaten, Dienst und Modell zur Fehlersuche speichern.",
      deleteAccountConfirmPrefix: "Konto löschen", deleteAccountCleanupWarning: "Das Konto wird zuerst deaktiviert. Lokale Daten werden gelöscht und konfigurierte Cloud-Kopien zur Löschung eingeplant. Fehler werden automatisch wiederholt.",
      deleteAccount: "Konto löschen", delete: "Löschen", deleteAccountFailed: "Konto konnte nicht gelöscht werden",
      deleteAccountPending: "Das Konto ist deaktiviert; die Datenbereinigung wird automatisch wiederholt.",
      deleteAccountCompleted: "Das Konto wurde entfernt; die Cloud-Bereinigung ist eingeplant.", deletionPending: "Löschung ausstehend",
      enabled: "Aktiviert", disabled: "Deaktiviert"
    },
    ru: {
      privacyAndRetention: "Конфиденциальность и хранение", retentionEnabledSummary: "Автоочистка включена",
      retentionDisabledSummary: "Автоочистка выключена", operatorContact: "Контакт оператора",
      operatorContactPlaceholder: "Эл. почта или канал поддержки", enableAutomaticCleanup: "Включить автоочистку",
      automaticFailureDays: "Автоматические журналы ошибок (дни)", feedbackDays: "Отзывы сотрудников (дни)",
      conversationsDays: "Диалоги (дни)", canvasProjectsDays: "Проекты и неиспользуемые материалы (дни)",
      generatedImagesDays: "Архив созданных изображений (дни)", cleanupIntervalHours: "Интервал очистки (часы)",
      failureLoggingNoticeTitle: "Журналирование ошибок включено",
      failureLoggingNoticeBody: "Неудачные задачи ИИ могут хранить запросы, референсы, данные аккаунта, сервис и модель для диагностики.",
      deleteAccountConfirmPrefix: "Удалить аккаунт", deleteAccountCleanupWarning: "Сначала аккаунт будет отключён, затем локальные данные удалены, а настроенные облачные копии поставлены в очередь. Ошибки повторяются автоматически.",
      deleteAccount: "Удалить аккаунт", delete: "Удалить", deleteAccountFailed: "Не удалось удалить аккаунт",
      deleteAccountPending: "Аккаунт отключён, задача очистки сохранена для повторной попытки.",
      deleteAccountCompleted: "Аккаунт удалён, очистка облака поставлена в очередь.", deletionPending: "Ожидает удаления",
      enabled: "Включено", disabled: "Отключено"
    },
    ar: {
      privacyAndRetention: "الخصوصية وفترة الاحتفاظ", retentionEnabledSummary: "التنظيف التلقائي مفعّل",
      retentionDisabledSummary: "التنظيف التلقائي متوقف", operatorContact: "جهة اتصال المشغّل",
      operatorContactPlaceholder: "البريد أو قناة الدعم", enableAutomaticCleanup: "تفعيل التنظيف التلقائي",
      automaticFailureDays: "سجلات الفشل التلقائية (أيام)", feedbackDays: "ملاحظات الموظفين (أيام)",
      conversationsDays: "المحادثات (أيام)", canvasProjectsDays: "مشاريع اللوحة والأصول غير المستخدمة (أيام)",
      generatedImagesDays: "أرشيف الصور المنشأة (أيام)", cleanupIntervalHours: "فاصل التنظيف (ساعات)",
      failureLoggingNoticeTitle: "تسجيل حالات الفشل مفعّل",
      failureLoggingNoticeBody: "قد تحتفظ مهام الذكاء الاصطناعي الفاشلة بالمطالبات والمراجع وبيانات الحساب والخدمة والنموذج لأغراض التشخيص.",
      deleteAccountConfirmPrefix: "حذف الحساب", deleteAccountCleanupWarning: "سيتم تعطيل الحساب أولاً ثم حذف البيانات المحلية ووضع النسخ السحابية المهيأة في قائمة الحذف. ستتم إعادة المحاولة تلقائياً عند الفشل.",
      deleteAccount: "حذف الحساب", delete: "حذف", deleteAccountFailed: "فشل حذف الحساب",
      deleteAccountPending: "تم تعطيل الحساب وحفظ مهمة التنظيف لإعادة المحاولة.",
      deleteAccountCompleted: "تمت إزالة الحساب ووضع تنظيف السحابة في قائمة الانتظار.", deletionPending: "بانتظار الحذف",
      enabled: "مفعّل", disabled: "معطّل"
    }
  };
  Object.entries(privacySupplements).forEach(([locale, values]) => Object.assign(dictionaries[locale], values));

  function normalize(value) {
    const raw = String(value || "").trim();
    if (dictionaries[raw]) return raw;
    const base = raw.split("-")[0].toLowerCase();
    return locales.find(([id]) => id.toLowerCase() === base)?.[0] || "zh-CN";
  }

  function currentLocale() {
    return normalize(localStorage.getItem("ai_canvas_locale") || document.documentElement.lang || navigator.language);
  }

  function t(key, fallback = "") {
    const dict = dictionaries[currentLocale()] || en;
    return dict[key] || en[key] || fallback || key;
  }

  function setLocale(value) {
    localStorage.setItem("ai_canvas_locale", normalize(value));
    apply(document);
    window.dispatchEvent(new CustomEvent("ai-canvas-locale-change", { detail: { locale: currentLocale() } }));
  }

  function bindLocaleSelector(selector, locale) {
    if (!selector) return;
    selector.innerHTML = locales.map(([id, label]) => `<option value="${id}">${label}</option>`).join("");
    selector.value = locale;
    selector.onchange = () => setLocale(selector.value);
  }

  function apply(root = document) {
    const locale = currentLocale();
    const dict = dictionaries[locale] || en;
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    root.querySelectorAll?.("[data-i18n]").forEach((element) => {
      const value = dict[element.dataset.i18n];
      if (value) element.textContent = value;
    });
    root.querySelectorAll?.("[data-i18n-placeholder]").forEach((element) => {
      const value = dict[element.dataset.i18nPlaceholder];
      if (value) element.placeholder = value;
    });
    root.querySelectorAll?.("[data-i18n-title]").forEach((element) => {
      const value = dict[element.dataset.i18nTitle];
      if (value) element.title = value;
    });
    root.querySelectorAll?.("[data-i18n-aria-label]").forEach((element) => {
      const value = dict[element.dataset.i18nAriaLabel];
      if (value) element.setAttribute("aria-label", value);
    });
    bindLocaleSelector(document.querySelector("#appLanguageSelect"), locale);
    bindLocaleSelector(document.querySelector("#loginLanguageSelect"), locale);
    document.title = dict.adminConsole;
    window.EcommerceCanvasAdminText?.apply(root, locale);
  }

  window.EcommerceCanvasAdminI18n = { locales, dictionaries, normalizeLocale: normalize, currentLocale, t, apply, setLocale };
  window.EcommerceCanvasI18n = window.EcommerceCanvasAdminI18n;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => apply(document), { once: true });
  } else {
    apply(document);
  }
})();
