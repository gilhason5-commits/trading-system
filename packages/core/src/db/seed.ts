import type {
  Alert,
  Analysis,
  DailyDigest,
  FxRate,
  Lead,
  PortfolioSnapshot,
  Position,
  Post,
  Recommendation,
  Run,
  Settings,
  Signal,
  Source,
  Transaction,
} from "../types.ts";

// Deterministic seed data — a small but realistic portfolio + a full day's worth
// of analyses/signals/leads/digest so every screen and the dry-run pipeline have
// something to render before any real key exists.

export interface Seed {
  transactions: Transaction[];
  positions: Position[];
  fx: FxRate;
  snapshots: PortfolioSnapshot[];
  analyses: Analysis[];
  sources: Source[];
  posts: Post[];
  signals: Signal[];
  leads: Lead[];
  recommendations: Recommendation[];
  digests: DailyDigest[];
  runs: Run[];
  alerts: Alert[];
  settings: Settings;
}

const TODAY = "2026-06-15";
const T = (d: string) => `${d}T08:00:00.000Z`;

export function buildSeed(): Seed {
  const transactions: Transaction[] = [
    { id: "tx_1", ticker: "AAPL", market: "US", side: "buy", qty: 20, price: 178.5, currency: "USD", date: "2025-11-04", created_at: T("2025-11-04") },
    { id: "tx_2", ticker: "AAPL", market: "US", side: "buy", qty: 10, price: 192.0, currency: "USD", date: "2026-02-18", created_at: T("2026-02-18") },
    { id: "tx_3", ticker: "NVDA", market: "US", side: "buy", qty: 15, price: 110.25, currency: "USD", date: "2026-01-09", created_at: T("2026-01-09") },
    { id: "tx_4", ticker: "MSFT", market: "US", side: "buy", qty: 8, price: 405.0, currency: "USD", date: "2025-12-12", created_at: T("2025-12-12") },
    { id: "tx_5", ticker: "BTC/USD", market: "crypto", side: "buy", qty: 0.35, price: 71000, currency: "USD", date: "2026-03-02", created_at: T("2026-03-02") },
    { id: "tx_6", ticker: "TEVA", market: "TASE", side: "buy", qty: 200, price: 62.4, currency: "ILS", date: "2026-04-21", created_at: T("2026-04-21") },
  ];

  // Positions derived from the above (avg cost in native currency).
  const positions: Position[] = [
    { ticker: "AAPL", market: "US", qty: 30, avg_cost: 183.0, currency: "USD", sector: "Technology" },
    { ticker: "NVDA", market: "US", qty: 15, avg_cost: 110.25, currency: "USD", sector: "Technology" },
    { ticker: "MSFT", market: "US", qty: 8, avg_cost: 405.0, currency: "USD", sector: "Technology" },
    { ticker: "BTC/USD", market: "crypto", qty: 0.35, avg_cost: 71000, currency: "USD", sector: "Crypto" },
    { ticker: "TEVA", market: "TASE", qty: 200, avg_cost: 62.4, currency: "ILS", sector: "Healthcare" },
  ];

  const fx: FxRate = { pair: "USD/ILS", rate: 3.62, as_of: T(TODAY) };

  const snapshots: PortfolioSnapshot[] = [
    { id: "snap_1", date: "2026-06-09", total_value_usd: 41250, total_value_ils: 149325, total_pl_usd: 5120 },
    { id: "snap_2", date: "2026-06-10", total_value_usd: 41880, total_value_ils: 151606, total_pl_usd: 5750 },
    { id: "snap_3", date: "2026-06-11", total_value_usd: 41510, total_value_ils: 150266, total_pl_usd: 5380 },
    { id: "snap_4", date: "2026-06-12", total_value_usd: 42730, total_value_ils: 154683, total_pl_usd: 6600 },
    { id: "snap_5", date: TODAY, total_value_usd: 43190, total_value_ils: 156348, total_pl_usd: 7060 },
  ];

  const analyses: Analysis[] = [
    {
      id: "an_1", ticker: "AAPL", date: TODAY, stance: "hold",
      technical_summary: "מעל ממוצע 50 ו-200 יום, RSI 58 — מומנטום חיובי מתון, ללא קנייתיתר.",
      fundamental_summary: "רווחיות יציבה, צמיחת שירותים דו-ספרתית, מכפיל מעט מעל הממוצע ההיסטורי.",
      key_events: ["WWDC בשבוע הבא", "דוח רבעוני בעוד 3 שבועות"],
      risk_flags: ["תלות בסין"], confidence: 0.72, created_at: T(TODAY),
    },
    {
      id: "an_2", ticker: "NVDA", date: TODAY, stance: "add",
      technical_summary: "פריצת התנגדות עם נפח גבוה, מגמת עלייה חזקה.",
      fundamental_summary: "צמיחת הכנסות חריגה מ-data center, מרווחים גבוהים, צבר הזמנות חזק.",
      key_events: ["כנס GTC", "הרחבת שותפויות ענן"],
      risk_flags: ["תמחור גבוה", "תנודתיות"], confidence: 0.81, created_at: T(TODAY),
    },
    {
      id: "an_3", ticker: "MSFT", date: TODAY, stance: "hold",
      technical_summary: "דשדוש בטווח, RSI נייטרלי 51.",
      fundamental_summary: "Azure ממשיך לצמוח, Copilot מתחיל לתרום להכנסות.",
      key_events: [], risk_flags: [], confidence: 0.68, created_at: T(TODAY),
    },
    {
      id: "an_4", ticker: "BTC/USD", date: TODAY, stance: "hold",
      technical_summary: "מעל תמיכה מרכזית, תנודתיות גבוהה, RSI 55.",
      fundamental_summary: "כניסות מתמשכות ל-ETF ספוט; סנטימנט מקרו מעורב.",
      key_events: ["החלטת ריבית פד בשבוע הבא"],
      risk_flags: ["תנודתיות גבוהה"], confidence: 0.6, created_at: T(TODAY),
    },
    {
      id: "an_5", ticker: "TEVA", date: TODAY, stance: "trim",
      technical_summary: "מתחת לממוצע 50 יום, מומנטום שלילי.",
      fundamental_summary: "חוב גבוה למרות שיפור; צבר ביוסימילרים מבטיח אך איטי.",
      key_events: ["עדכון רגולטורי צפוי"],
      risk_flags: ["מינוף גבוה"], confidence: 0.64, created_at: T(TODAY),
    },
  ];

  const sources: Source[] = [
    { id: "src_1", platform: "youtube", handle: "@MeetKevin", active: true, created_at: T("2026-05-01") },
    { id: "src_2", platform: "youtube", handle: "@FinancialEducation", active: true, created_at: T("2026-05-01") },
    { id: "src_3", platform: "tiktok", handle: "@stockmarketguy", active: true, created_at: T("2026-05-01") },
    { id: "src_4", platform: "instagram", handle: "@wallstbets", active: false, created_at: T("2026-05-01") },
    { id: "src_5", platform: "rss", handle: "https://www.cnbc.com/id/100003114/device/rss/rss.html", active: true, created_at: T("2026-05-01") },
  ];

  const posts: Post[] = [
    {
      id: "post_1", source_id: "src_1", external_id: "yt_abc123",
      url: "https://youtube.com/watch?v=abc123", title: "Why NVDA still has room to run",
      transcript: "Talking through datacenter demand and why the chip cycle...",
      published_at: T(TODAY), fetched_at: T(TODAY),
    },
    {
      id: "post_2", source_id: "src_3", external_id: "tt_xyz789",
      url: "https://tiktok.com/@stockmarketguy/video/xyz789", title: "This small cap is about to explode 🚀",
      transcript: "You guys need to look at PLTR-like names, also $SOFI...",
      published_at: T(TODAY), fetched_at: T(TODAY),
    },
    {
      id: "post_3", source_id: "src_5", external_id: "cnbc_555",
      url: "https://cnbc.com/2026/06/15/markets.html", title: "Chip stocks lead market higher",
      text: "Semiconductor names rallied on strong demand signals...",
      published_at: T(TODAY), fetched_at: T(TODAY),
    },
  ];

  const signals: Signal[] = [
    { id: "sig_1", post_id: "post_1", ticker: "NVDA", sentiment: "bullish", claim: "ביקוש דאטה-סנטר ממשיך להניע צמיחה", created_at: T(TODAY) },
    { id: "sig_2", post_id: "post_2", ticker: "SOFI", sentiment: "bullish", claim: "מומנטום קמעונאי חזק במניה", created_at: T(TODAY) },
    { id: "sig_3", post_id: "post_3", ticker: "NVDA", sentiment: "bullish", claim: "מובילה את עליות שוק השבבים", created_at: T(TODAY) },
  ];

  const leads: Lead[] = [
    { id: "lead_1", ticker: "SOFI", market: "US", status: "recommended", mention_count: 2, first_seen: T(TODAY), updated_at: T(TODAY) },
    { id: "lead_2", ticker: "RKLB", market: "US", status: "researching", mention_count: 1, first_seen: T(TODAY), updated_at: T(TODAY) },
  ];

  const recommendations: Recommendation[] = [
    {
      id: "rec_1", lead_id: "lead_1", ticker: "SOFI", date: TODAY,
      system_score: 64, social_score: 78,
      rationale: "צמיחת משתמשים חזקה ומעבר לרווחיות; איתות חברתי גבוה אך תמחור דורש זהירות.",
      manipulation_flag: false, created_at: T(TODAY),
    },
  ];

  const digests: DailyDigest[] = [
    {
      id: "dig_1", date: "2026-06-12",
      html: "<div dir=\"rtl\"><h1>סיכום יומי</h1><p>תיק עלה 1.5% היום.</p></div>",
      key_insights: ["NVDA פרצה התנגדות", "TEVA נחלשת — שקול צמצום"],
      created_at: T("2026-06-12"),
    },
  ];

  const runs: Run[] = [
    {
      id: "run_1", date: "2026-06-12", tokens_in: 184000, tokens_out: 12400,
      claude_cost: 0.94, scraping_cost: 0.12, total_cost: 1.06,
      started_at: T("2026-06-12"), finished_at: T("2026-06-12"), status: "ok",
    },
  ];

  const alerts: Alert[] = [
    { id: "alert_1", kind: "concentration", message: "סקטור הטכנולוגיה מהווה מעל 60% מהתיק", created_at: T(TODAY), read: false },
    { id: "alert_2", kind: "earnings", ticker: "AAPL", message: "דוח רבעוני של AAPL בעוד 3 שבועות", created_at: T(TODAY), read: false },
  ];

  const settings: Settings = {
    id: "settings_1",
    digest_time: "23:30",
    concentration_threshold: 0.25,
    digest_email: "gilh207@gmail.com",
  };

  return {
    transactions, positions, fx, snapshots, analyses, sources, posts,
    signals, leads, recommendations, digests, runs, alerts, settings,
  };
}
