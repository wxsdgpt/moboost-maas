/**
 * Translation dictionary.
 *
 * English is the source of truth — every key is required there. Chinese
 * (zh) is the alternate locale; missing keys fall back to English at the
 * `t()` call site (see LocaleProvider).
 *
 * Adding a key:
 *   1. Add it to `en` with the canonical English string.
 *   2. Add the Chinese rendering to `zh`.
 *   3. Use it via `const { t } = useLocale(); t('key.path')`.
 *
 * Naming: dot-separated namespaces — `nav.home`, `auth.signIn.title`,
 * `report.section.detailed`. Keep keys descriptive so unused ones are
 * easy to grep.
 */

export type Locale = 'en' | 'zh'

export const LOCALES: Locale[] = ['en', 'zh']

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  zh: '中文',
}

export const DEFAULT_LOCALE: Locale = 'en'

type Dict = Record<string, string>

export const en: Dict = {
  // Settings panel
  'settings.title': 'Settings',
  'settings.language': 'Language',
  'settings.close': 'Close',
  'settings.openButton': 'Open settings',
  'settings.account': 'Account',
  'settings.signOut': 'Sign out',

  // Navigation (sidebar)
  'nav.home': 'Home',
  'nav.inspire': 'Inspire',
  'nav.project': 'Project',
  'nav.reports': 'Reports',
  'nav.landing': 'Landing Pages',
  'nav.evolution': 'Agent Evolution',
  'nav.tools': 'Tools',
  'nav.signIn': 'Sign in',
  'nav.signUp': 'Sign up — 50 credits free',
  'nav.signedInAs': 'Signed in',
  'nav.account': 'Account',

  // Auth
  'auth.signIn.title': 'Sign in to Moboost AI',
  'auth.signIn.subtitle': 'Welcome back. Continue where you left off.',
  'auth.signUp.title': 'Create your Moboost AI account',
  'auth.signUp.subtitle': '50 credits free. No card required.',
  'auth.redirecting': 'Redirecting…',
  'auth.signedIn.checking': 'Signing you in…',
  'auth.tagline': 'Marketing-as-a-Service Platform',
  'auth.haveAccount': 'Already have an account?',
  'auth.noAccount': "Don't have an account?",
  'auth.signInLink': 'Sign in',
  'auth.signUpLink': 'Sign up',
  'auth.copyright': '© 2026 Moboost AI',
  'auth.signUp.headline': 'Create your account',
  'auth.signUp.tagline': 'Start with 50 free credits — no card required',
  'auth.signUp.settingUp': 'Setting up your account…',

  // Home / hero
  'home.tagline': 'Ad creatives, landing pages, and competitive intelligence for iGaming',

  // Welcome banner
  'welcome.title': 'Welcome to Moboost',
  'welcome.title.withProduct': 'Welcome to Moboost — let\u2019s grow',
  'welcome.body.before': 'You have',
  'welcome.body.credits': '50 free credits',
  'welcome.body.after': '. Spin up your first lite report to see how it works.',
  'welcome.cta.generate': 'Generate first report',
  'welcome.cta.generating': 'Generating…',
  'welcome.error.noProduct': 'No product found. Complete onboarding first.',
  'welcome.error.failed': 'Report generation failed',

  // Unified collector
  'collector.action.pipeline': 'One-click pipeline',
  'collector.action.asset': 'Generate assets',
  'collector.action.intel': 'Market intel',
  'collector.action.landing': 'Generate landing page',
  'collector.placeholder.default': 'Describe what you need, or pick a quick action below…',
  'collector.placeholder.intel': 'Enter a product URL or describe a competitor…',
  'collector.placeholder.asset': 'Describe the asset you want to generate…',
  'collector.placeholder.landing': 'Describe what the landing page should do…',

  // Common
  'common.loading': 'Loading…',
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.regenerate': 'Regenerate',
  'common.open': 'Open',
  'common.close': 'Close',
  'common.error': 'Error',
  'common.retry': 'Retry',
  'common.newest': 'Newest first',

  // Report artifacts
  'artifacts.title': 'Generated Artifacts',
  'artifacts.subtitle':
    'Everything produced for this report. Newest first. Regenerate any with a custom prompt — history is preserved.',
  'artifacts.tab.landings': 'Landing Pages',
  'artifacts.tab.creatives': 'Creatives',
  'artifacts.empty.landings': 'No landing pages generated for this report yet.',
  'artifacts.empty.creatives': 'No creatives generated for this report yet.',
  'artifacts.regenerate.landingPlaceholder':
    'Describe what to change (tone, headline focus, audience emphasis, layout). Leave blank to regenerate with the same brief.',
  'artifacts.regenerate.imagePlaceholder': 'Describe the new image…',
  'artifacts.regenerate.videoPlaceholder': 'Describe the new video…',
  'artifacts.regenerate.button.landing': 'Regenerate Landing Page',
  'artifacts.regenerate.button.image': 'Regenerate image',
  'artifacts.regenerate.button.video': 'Regenerate video',
  'artifacts.generating': 'Generating…',
  'artifacts.loading': 'Loading artifacts…',
  'artifacts.promptRequired': 'Prompt is required',
}

export const zh: Dict = {
  // Settings
  'settings.title': '设置',
  'settings.language': '语言',
  'settings.close': '关闭',
  'settings.openButton': '打开设置',
  'settings.account': '账户',
  'settings.signOut': '退出登录',

  // Navigation
  'nav.home': '首页',
  'nav.inspire': '灵感库',
  'nav.project': '项目',
  'nav.reports': '报告',
  'nav.landing': '落地页',
  'nav.evolution': '智能体演化',
  'nav.tools': '工具',
  'nav.signIn': '登录',
  'nav.signUp': '注册 — 免费获得 50 积分',
  'nav.signedInAs': '已登录',
  'nav.account': '账户',

  // Auth
  'auth.signIn.title': '登录 Moboost AI',
  'auth.signIn.subtitle': '欢迎回来，继续您之前的工作。',
  'auth.signUp.title': '创建 Moboost AI 账户',
  'auth.signUp.subtitle': '免费 50 积分，无需信用卡。',
  'auth.redirecting': '正在跳转…',
  'auth.signedIn.checking': '正在登录…',
  'auth.tagline': '营销即服务平台',
  'auth.haveAccount': '已有账户？',
  'auth.noAccount': '还没有账户？',
  'auth.signInLink': '登录',
  'auth.signUpLink': '注册',
  'auth.copyright': '© 2026 Moboost AI',
  'auth.signUp.headline': '创建账户',
  'auth.signUp.tagline': '免费获得 50 积分 — 无需信用卡',
  'auth.signUp.settingUp': '正在设置账户…',

  // Home / hero
  'home.tagline': '为 iGaming 提供广告创意、落地页与竞品情报',

  // Welcome banner
  'welcome.title': '欢迎使用 Moboost',
  'welcome.title.withProduct': '欢迎使用 Moboost — 一起成长',
  'welcome.body.before': '您拥有',
  'welcome.body.credits': '50 个免费积分',
  'welcome.body.after': '。生成第一份精简版报告，体验一下吧。',
  'welcome.cta.generate': '生成首份报告',
  'welcome.cta.generating': '生成中…',
  'welcome.error.noProduct': '未找到产品，请先完成引导。',
  'welcome.error.failed': '报告生成失败',

  // Unified collector
  'collector.action.pipeline': '一键联动',
  'collector.action.asset': '生成素材',
  'collector.action.intel': '信息采集',
  'collector.action.landing': '生成落地页',
  'collector.placeholder.default': '描述你的需求，或选择下方快捷操作…',
  'collector.placeholder.intel': '输入产品 URL 或描述竞品…',
  'collector.placeholder.asset': '描述你想要生成的素材…',
  'collector.placeholder.landing': '描述落地页需求…',

  // Common
  'common.loading': '加载中…',
  'common.cancel': '取消',
  'common.save': '保存',
  'common.regenerate': '重新生成',
  'common.open': '打开',
  'common.close': '关闭',
  'common.error': '错误',
  'common.retry': '重试',
  'common.newest': '最新优先',

  // Report artifacts
  'artifacts.title': '生成的资产',
  'artifacts.subtitle':
    '此报告下生成的所有内容，最新的排在最前。可使用自定义 prompt 重新生成 — 历史记录会被保留。',
  'artifacts.tab.landings': '落地页',
  'artifacts.tab.creatives': '创意素材',
  'artifacts.empty.landings': '此报告暂未生成落地页。',
  'artifacts.empty.creatives': '此报告暂未生成创意素材。',
  'artifacts.regenerate.landingPlaceholder':
    '描述需要修改的内容（语调、标题重点、受众侧重、布局）。留空则按原 brief 重新生成。',
  'artifacts.regenerate.imagePlaceholder': '描述新图像…',
  'artifacts.regenerate.videoPlaceholder': '描述新视频…',
  'artifacts.regenerate.button.landing': '重新生成落地页',
  'artifacts.regenerate.button.image': '重新生成图像',
  'artifacts.regenerate.button.video': '重新生成视频',
  'artifacts.generating': '生成中…',
  'artifacts.loading': '加载资产中…',
  'artifacts.promptRequired': '请填写 prompt',
}

export const dictionaries: Record<Locale, Dict> = { en, zh }
