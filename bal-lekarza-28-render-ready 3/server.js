import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_FILE = path.join(__dirname, "data", "app-data.json");
const BACKUP_DIR = path.join(__dirname, "backups");
const PORT = Number(process.env.PORT || 4173);
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const APP_ROUTES = new Set(["/", "/bal-lekarza-28", "/bal-lekarza-28/", "/bal-lekarza-2028", "/bal-lekarza-2028/"]);
const SUPABASE_REST_URL = normalizeSupabaseRestUrl(process.env.SUPABASE_URL || process.env.SUPABASE_REST_URL || "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";
const SUPABASE_STATE_TABLE = process.env.SUPABASE_STATE_TABLE || "app_state";
const SUPABASE_STATE_ID = process.env.SUPABASE_STATE_ID || "main";
const SUPABASE_ENABLED = Boolean(SUPABASE_REST_URL && SUPABASE_SERVICE_ROLE_KEY);
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const INITIAL_ADMIN_EMAIL = process.env.INITIAL_ADMIN_EMAIL || "admin@bal.local";
const INITIAL_ADMIN_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD || (IS_PRODUCTION ? "" : "admin123!");
const SEED_DEMO_USER = process.env.SEED_DEMO_USER === "true" || (!IS_PRODUCTION && process.env.SEED_DEMO_USER !== "false");
const DEMO_STUDENT_EMAIL = process.env.DEMO_STUDENT_EMAIL || "student@bal.local";
const DEMO_STUDENT_PASSWORD = process.env.DEMO_STUDENT_PASSWORD || "student123!";
const sessions = new Map();
let supabaseSaveTimer = null;
let supabaseSaveInFlight = false;
let supabasePendingSnapshot = "";
const DEFAULT_SETTINGS = {
  appName: "Bal Lekarza",
  eventName: "Bal Lekarza 2028",
  subtitle: "Konto absolwenta, miejsca, płatności i infopak",
  authEyebrow: "Bal Lekarza 2028",
  logoText: "BL",
  logoSubtext: "Herb balu",
  logoImageData: "",
  logoImageName: "",
  heroImageData: "",
  heroImageName: "",
  heroTagline: "Modern English estate evening",
  heroCopy: "Bal Lekarza 2028 w stylu nowoczesnej angielskiej arystokracji: elegancja, porządek, herb, złoto, zieleń i pełna kontrola dla organizatorów.",
  eventDate: "2028-07-01",
  venueName: "Biały Dom",
  venueAddress: "ul. Karola Darwina 50, 44-177 Paniówki",
  mapUrl: "https://maps.google.com/?q=Bia%C5%82y%20Dom%20Karola%20Darwina%2050%20Pani%C3%B3wki",
  organizedTransportInfo: "Transport zorganizowany: odjazdy z balu w kierunku Medyków planowane są o 3:15, 4:00 i 4:45. Dokładny kurs pojawi się przy Twoim koncie po potwierdzeniu listy.",
  ownTransportInfo: "Transport własny: przy obiekcie dostępny jest parking. Liczba miejsc jest ograniczona, dlatego warto przyjechać wcześniej albo umówić wspólny dojazd.",
  siteMode: "open",
  comingSoonTitle: "Zapisy wkrótce",
  comingSoonMessage: "Strona jest prawie gotowa. Administratorzy mogą się zalogować, a zapisy dla absolwentów ruszą po otwarciu.",
  maintenanceTitle: "Przerwa techniczna",
  maintenanceMessage: "Na chwilę porządkujemy aplikację. Wróć za moment albo poczekaj na komunikat organizatorów.",
  limitGuardEnabled: true,
  limitDailyRequestLimit: 100000,
  limitDailyWriteLimit: 20000,
  limitReadOnlyAtPercent: 80,
  limitForceReadOnly: false,
  limitGuardMessage: "Aplikacja działa teraz w trybie podglądu, żeby nie przekroczyć limitów serwera. Możesz sprawdzać informacje, ale dodawanie i zapisy są chwilowo wyłączone.",
  seatingVisible: false,
  seatingLockedMessage: "Plan stołów jest jeszcze w przygotowaniu. Miejsce pojawi się w aplikacji po zatwierdzeniu układu przez organizatorów.",
  companionSignupDeadline: "2028-05-31T23:59",
  logoCropX: 50,
  logoCropY: 50,
  logoZoom: 100,
  heroCropX: 50,
  heroCropY: 50,
  heroZoom: 100,
  adminWelcomeMessage: "Dobry wieczór. Panel gospodarza jest gotowy, a reszta wieczoru może już iść elegancko.",
  rodoText: "Administratorem danych jest komitet organizacyjny balu. Dane służą do obsługi zapisów, płatności, usadzenia, diet i komunikacji organizacyjnej.",
  termsText: "Potwierdzam, że dane są prawdziwe i zgadzam się na kontakt organizacyjny w sprawach balu.",
  interfaceTexts: {},
  statusTexts: {},
  nightMode: "auto",
  nightStart: "20",
  nightEnd: "6",
  theme: {
    primary: "#173d35",
    background: "#f8f2e7",
    gold: "#c8a85c",
    coral: "#b76d61",
    sage: "#9bb7a4",
    cream: "#f8f2e7",
    paper: "#fffdf8",
    mist: "#e7ece6",
    ink: "#1c2522",
    muted: "#68736f",
  },
};
const DEFAULT_INFOPACK = {
  intro: "Infopak Bal Lekarza 2028 w klimacie nowoczesnej angielskiej arystokracji: elegancka zieleń, kość słoniowa, szampańskie złoto, herb i uporządkowane informacje dla absolwentów i gości. Wszystkie treści możesz później zmienić w panelu administratora.",
  schedule: [
    { time: "19:00", title: "Rozpoczęcie części oficjalnej" },
    { time: "19:35", title: "Kieliszek szampana" },
    { time: "19:45", title: "Danie główne" },
    { time: "20:45", title: "Zdjęcia grup 1-3" },
    { time: "21:00", title: "Zdjęcia grup 4-6" },
    { time: "21:15", title: "Zdjęcia grup 7-9" },
    { time: "21:30", title: "Zdjęcia grup 10-12" },
    { time: "21:45", title: "Zdjęcia grup 13-15" },
    { time: "22:00", title: "Zdjęcia grup 16-18" },
    { time: "22:30", title: "Kolacja I" },
    { time: "00:00", title: "Kolacja II" },
    { time: "04:00", title: "Zakończenie" },
  ],
  sections: [
    { title: "Miejsce", body: "Biały Dom, ul. Karola Darwina 50, 44-177 Paniówki. Link do mapy znajduje się w zakładce Dojazd." },
    { title: "Dress code", body: "Inspiracja z infopaku: Black Tie i elegancki wieczorowy charakter. W nowej wersji motyw zostaje świeższy: złoto, biel i lekkie letnie kolory." },
    { title: "Usadzenie", body: "Miejsca są widoczne w zakładce Stoły. Absolwent albo gość widzi swoje miejsce, a administrator może aktualizować salę, stół i numer miejsca z poziomu listy." },
    { title: "Diety", body: "Przy absolwentach i gościach można oznaczyć dietę standardową, bezglutenową albo wegańską. Kolory na mapie stołów pomagają szybko je odróżnić." },
    { title: "Menu", body: "W infopaku półmetkowym pojawiały się m.in. krem z pora, danie główne mięsne lub warzywne risotto, barszcz z pasztecikiem i przekąski zimne oraz słodkie." },
    { title: "Napoje i drink bar", body: "Napoje bezalkoholowe, kawa, herbata, piwo lane, wino oraz drinki. Zamówienia drinków: 20:00-2:00, jednorazowo maksymalnie 2 drinki." },
    { title: "Transport", body: "Transport zorganizowany ma osobną listę. Absolwent może wybrać transport zorganizowany, własny albo brak transportu." },
    { title: "Pozostałe kwestie", body: "Na terenie obiektu obowiązuje zakaz palenia poza wyznaczonymi miejscami. Dostępny jest parking, ale liczba miejsc jest ograniczona." },
  ],
};

fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
fs.mkdirSync(BACKUP_DIR, { recursive: true });

let data = await loadData();
ensureContentDefaults();
ensurePaymentFields();
ensureTransportFields();
ensureRelationshipFields();
ensureSeedUsers();

const server = http.createServer(async (req, res) => {
  try {
    await route(req, res);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "Wystapil blad serwera." });
  }
});

server.listen(PORT, () => {
  console.log(`Bal app running at http://localhost:${PORT}`);
  if (!IS_PRODUCTION && INITIAL_ADMIN_PASSWORD === "admin123!") {
    console.log("Admin demo: admin@bal.local / admin123!");
  } else {
    console.log(`Admin account: ${INITIAL_ADMIN_EMAIL}`);
  }
  if (SEED_DEMO_USER && !IS_PRODUCTION) {
    console.log(`Student demo: ${DEMO_STUDENT_EMAIL} / ${DEMO_STUDENT_PASSWORD}`);
  } else if (SEED_DEMO_USER) {
    console.log(`Student demo enabled: ${DEMO_STUDENT_EMAIL}`);
  }
  if (SUPABASE_ENABLED) console.log(`Supabase state sync enabled: ${SUPABASE_STATE_TABLE}/${SUPABASE_STATE_ID}`);
});

async function loadData() {
  if (SUPABASE_ENABLED) {
    const remote = await loadDataFromSupabase().catch((error) => {
      console.error(`Supabase load failed, using local data: ${error.message}`);
      return null;
    });
    if (remote) return remote;
  }
  return loadLocalData();
}

function loadLocalData() {
  if (!fs.existsSync(DATA_FILE)) {
    return defaultData();
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function defaultData() {
  return {
    version: 1,
    settings: {},
    infopack: { schedule: [], sections: [] },
    layouts: {},
    participants: [],
    registrations: [],
    assets: [],
    notifications: [],
    scheduledNotifications: [],
    paymentImports: [],
    users: [],
  };
}

function saveData() {
  data.updatedAt = new Date().toISOString();
  if (localDataWritesEnabled()) {
    const tmp = `${DATA_FILE}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
    fs.renameSync(tmp, DATA_FILE);
  }
  if (SUPABASE_ENABLED) queueSupabaseSave();
}

function localDataWritesEnabled() {
  if (process.env.LOCAL_DATA_WRITES === "true") return true;
  if (process.env.LOCAL_DATA_WRITES === "false") return false;
  return !process.env.VERCEL;
}

async function loadDataFromSupabase() {
  const response = await supabaseRequest(`${supabaseTablePath()}?id=eq.${encodeURIComponent(SUPABASE_STATE_ID)}&select=data`, {
    method: "GET",
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const rows = await response.json();
  const record = Array.isArray(rows) ? rows[0] : null;
  return record?.data || null;
}

function queueSupabaseSave() {
  supabasePendingSnapshot = JSON.stringify(data);
  if (supabaseSaveTimer) clearTimeout(supabaseSaveTimer);
  supabaseSaveTimer = setTimeout(() => {
    flushSupabaseSave().catch((error) => console.error(`Supabase save failed: ${error.message}`));
  }, 250);
}

async function flushSupabaseSave() {
  if (supabaseSaveInFlight || !supabasePendingSnapshot) return;
  const snapshot = supabasePendingSnapshot;
  supabasePendingSnapshot = "";
  supabaseSaveInFlight = true;
  try {
    await saveDataToSupabase(snapshot);
  } finally {
    supabaseSaveInFlight = false;
    if (supabasePendingSnapshot) {
      await flushSupabaseSave();
    }
  }
}

async function saveDataToSupabase(snapshot) {
  const payload = {
    id: SUPABASE_STATE_ID,
    data: JSON.parse(snapshot),
    updated_at: new Date().toISOString(),
  };
  const response = await supabaseRequest(supabaseTablePath(), {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
}

function supabaseTablePath() {
  return `/${encodeURIComponent(SUPABASE_STATE_TABLE)}`;
}

function supabaseRequest(pathname, options = {}) {
  return fetch(`${SUPABASE_REST_URL}${pathname}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
}

function ensureSeedUsers() {
  let changed = false;
  data.users ||= [];
  if (!data.users.some((user) => user.role === "admin")) {
    if (!INITIAL_ADMIN_PASSWORD) {
      throw new Error("Brak pierwszego hasla admina. Ustaw INITIAL_ADMIN_PASSWORD w zmiennych srodowiskowych hostingu.");
    }
    data.users.push({
      id: "u-admin",
      email: INITIAL_ADMIN_EMAIL,
      displayName: "Administrator",
      role: "admin",
      passwordHash: hashPassword(INITIAL_ADMIN_PASSWORD),
      createdAt: new Date().toISOString(),
    });
    changed = true;
  }

  if (SEED_DEMO_USER && !data.users.some((user) => user.email === DEMO_STUDENT_EMAIL)) {
    let participant = data.participants.find((item) => !item.emptySeat);
    if (!participant) {
      participant = demoParticipant();
      data.participants.push(participant);
      changed = true;
    }
    if (participant) {
      participant.email = DEMO_STUDENT_EMAIL;
      data.users.push({
        id: "u-student-demo",
        email: DEMO_STUDENT_EMAIL,
        displayName: participant.name,
        role: "student",
        participantId: participant.id,
        passwordHash: hashPassword(DEMO_STUDENT_PASSWORD),
        createdAt: new Date().toISOString(),
      });
      changed = true;
    }
  }

  if (changed) saveData();
}

function demoParticipant() {
  const now = new Date().toISOString();
  return {
    id: "p-demo-student-2028",
    name: "Absolwent demo 2028",
    email: DEMO_STUDENT_EMAIL,
    phone: "",
    roomId: "oczekujace",
    roomName: "Lista zapisów",
    tableId: "Bez miejsca",
    seatNo: "",
    side: "",
    diet: "standard",
    registrationType: "student",
    albumNumber: "DEMO2028",
    deanGroup: "Demo",
    linkedParticipantId: "",
    linkedStudentName: "",
    linkedStudentEmail: "",
    pairId: "",
    seatingPreference: "Konto testowe do sprawdzania widoku absolwenta.",
    isCompanion: false,
    emptySeat: false,
    paidDeposit: false,
    paidInstallment1: false,
    paidInstallment2: false,
    paidBall: false,
    paidTransport: false,
    manualVerified: false,
    transportMode: "none",
    transport: false,
    transportInfo: "",
    registrationStatus: "demo",
    adminNote: "Konto techniczne demo. Usuń albo nadpisz po imporcie właściwego rocznika.",
    updatedAt: now,
  };
}

function ensurePaymentFields() {
  let changed = false;
  for (const participant of data.participants || []) {
    const legacyPaid = Boolean(participant.paidBall);
    if (!("paidDeposit" in participant)) {
      participant.paidDeposit = legacyPaid;
      changed = true;
    }
    if (!("paidInstallment1" in participant)) {
      participant.paidInstallment1 = legacyPaid;
      changed = true;
    }
    if (!("paidInstallment2" in participant)) {
      participant.paidInstallment2 = legacyPaid;
      changed = true;
    }
    const computedPaidBall = paymentComplete(participant);
    if (participant.paidBall !== computedPaidBall) {
      participant.paidBall = computedPaidBall;
      changed = true;
    }
  }
  if (changed) saveData();
}

function ensureContentDefaults() {
  let changed = false;
  data.settings ||= {};
  data.settings.theme ||= {};
  data.infopack ||= { schedule: [], sections: [] };
  data.layouts ||= {};
  data.participants ||= [];
  data.registrations ||= [];
  data.assets ||= [];
  data.notifications ||= [];
  data.scheduledNotifications ||= [];
  data.paymentImports ||= [];
  data.users ||= [];
  data.traffic ||= { date: trafficDate(), requests: 0, writes: 0, readOnlyActivations: 0, updatedAt: new Date().toISOString() };

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (key === "theme") continue;
    if (data.settings[key] === undefined || data.settings[key] === null || data.settings[key] === "") {
      data.settings[key] = value;
      changed = true;
    }
  }
  if (data.settings.subtitle === "Konto uczestnika, miejsca, platnosci i infopak" || data.settings.subtitle === "Konto uczestnika, miejsca, płatności i infopak") {
    data.settings.subtitle = DEFAULT_SETTINGS.subtitle;
    changed = true;
  }
  if (data.settings.eventName === "Bal Lekarza 2026") {
    data.settings.eventName = DEFAULT_SETTINGS.eventName;
    changed = true;
  }
  if (data.settings.authEyebrow === "Bal Lekarza 2026") {
    data.settings.authEyebrow = DEFAULT_SETTINGS.authEyebrow;
    changed = true;
  }
  if (data.settings.eventDate === "2026-11-08") {
    data.settings.eventDate = DEFAULT_SETTINGS.eventDate;
    changed = true;
  }
  if (!data.style2028Applied) {
    data.settings.theme = { ...DEFAULT_SETTINGS.theme };
    data.settings.heroTagline = DEFAULT_SETTINGS.heroTagline;
    data.settings.heroCopy = DEFAULT_SETTINGS.heroCopy;
    data.settings.logoSubtext = DEFAULT_SETTINGS.logoSubtext;
    data.style2028Applied = true;
    changed = true;
  }
  if (data.settings.venueName === "Bialy Dom") {
    data.settings.venueName = DEFAULT_SETTINGS.venueName;
    changed = true;
  }
  if (String(data.settings.venueAddress || "").includes("Paniowki")) {
    data.settings.venueAddress = DEFAULT_SETTINGS.venueAddress;
    changed = true;
  }
  if (String(data.settings.organizedTransportInfo || "").startsWith("Autokary: zbiorka")) {
    data.settings.organizedTransportInfo = DEFAULT_SETTINGS.organizedTransportInfo;
    changed = true;
  }

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS.theme)) {
    if (!data.settings.theme[key]) {
      data.settings.theme[key] = value;
      changed = true;
    }
  }

  if (!data.infopack.intro) {
    data.infopack.intro = DEFAULT_INFOPACK.intro;
    changed = true;
  }
  if (!Array.isArray(data.infopack.schedule) || !data.infopack.schedule.length) {
    data.infopack.schedule = DEFAULT_INFOPACK.schedule;
    changed = true;
  }
  if (!data.contentDefaultsApplied && (!Array.isArray(data.infopack.sections) || data.infopack.sections.length < 6)) {
    data.infopack.sections = DEFAULT_INFOPACK.sections;
    data.contentDefaultsApplied = true;
    changed = true;
  }

  if (changed) saveData();
}

function ensureTransportFields() {
  let changed = false;
  for (const participant of data.participants || []) {
    const mode = normalizeTransportMode(participant.transportMode, participant.transport);
    if (participant.transportMode !== mode) {
      participant.transportMode = mode;
      changed = true;
    }
    const legacyTransport = mode === "organized";
    if (participant.transport !== legacyTransport) {
      participant.transport = legacyTransport;
      changed = true;
    }
  }
  for (const registration of data.registrations || []) {
    const mode = normalizeTransportMode(registration.transportMode, registration.transport);
    if (registration.transportMode !== mode) {
      registration.transportMode = mode;
      changed = true;
    }
    const legacyTransport = mode === "organized";
    if (registration.transport !== legacyTransport) {
      registration.transport = legacyTransport;
      changed = true;
    }
  }
  if (changed) saveData();
}

function ensureRelationshipFields() {
  let changed = false;
  const participants = data.participants || [];
  for (const participant of participants) {
    const inferredCompanion = Boolean(participant.isCompanion) || /^ot[\s_-]/i.test(String(participant.name || ""));
    const type = normalizeRegistrationType(participant.registrationType, inferredCompanion);
    if (participant.registrationType !== type) {
      participant.registrationType = type;
      changed = true;
    }
    if (participant.isCompanion !== (type === "companion")) {
      participant.isCompanion = type === "companion";
      changed = true;
    }
    if (!("deanGroup" in participant)) {
      participant.deanGroup = "";
      changed = true;
    }
    if (!("albumNumber" in participant)) {
      participant.albumNumber = "";
      changed = true;
    } else {
      const normalizedAlbum = normalizeAlbumNumber(participant.albumNumber);
      if (participant.albumNumber !== normalizedAlbum) {
        participant.albumNumber = normalizedAlbum;
        changed = true;
      }
    }
    if (!("manualVerified" in participant)) {
      participant.manualVerified = false;
      changed = true;
    }
    if (!("linkedParticipantId" in participant)) {
      participant.linkedParticipantId = "";
      changed = true;
    }
    if (!("pairId" in participant)) {
      participant.pairId = "";
      changed = true;
    }
    if (!("linkedStudentName" in participant)) {
      participant.linkedStudentName = "";
      changed = true;
    }
    if (!("linkedStudentEmail" in participant)) {
      participant.linkedStudentEmail = "";
      changed = true;
    }
    if (!("seatingPreference" in participant)) {
      participant.seatingPreference = "";
      changed = true;
    }
  }

  for (const companion of participants.filter((item) => item.registrationType === "companion" && !item.linkedParticipantId && item.roomId && item.tableId && item.seatNo)) {
    const possiblePartner = participants.find((candidate) =>
      candidate.id !== companion.id &&
      candidate.registrationType !== "companion" &&
      candidate.roomId === companion.roomId &&
      candidate.tableId === companion.tableId &&
      Math.abs(Number(candidate.seatNo) - Number(companion.seatNo)) === 1
    );
    if (possiblePartner) {
      const pairId = possiblePartner.pairId || companion.pairId || `pair-${crypto.randomBytes(6).toString("hex")}`;
      companion.linkedParticipantId = possiblePartner.id;
      companion.pairId = pairId;
      possiblePartner.linkedParticipantId = companion.id;
      possiblePartner.pairId = pairId;
      changed = true;
    }
  }

  for (const registration of data.registrations || []) {
    const type = normalizeRegistrationType(registration.registrationType, registration.transport === "companion");
    if (!registration.registrationType) {
      registration.registrationType = type;
      changed = true;
    }
    if (!("deanGroup" in registration)) {
      registration.deanGroup = "";
      changed = true;
    }
    if (!("albumNumber" in registration)) {
      registration.albumNumber = "";
      changed = true;
    } else {
      const normalizedAlbum = normalizeAlbumNumber(registration.albumNumber);
      if (registration.albumNumber !== normalizedAlbum) {
        registration.albumNumber = normalizedAlbum;
        changed = true;
      }
    }
    if (!("linkedParticipantId" in registration)) {
      registration.linkedParticipantId = "";
      changed = true;
    }
  }

  if (changed) saveData();
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = decodeURIComponent(url.pathname);
  if (pathname.startsWith("/api/")) trackTraffic(req, pathname);

  if (req.method === "POST" && pathname === "/api/auth/login") {
    return handleLogin(req, res);
  }
  if (req.method === "POST" && pathname === "/api/auth/register") {
    return handleRegister(req, res);
  }

  if (pathname === "/api/public-settings" && req.method === "GET") {
    releaseDueNotifications();
    return sendJson(res, 200, { settings: data.settings, infopack: data.infopack, limits: limitStatusForUser(false) });
  }

  if (pathname === "/api/app" && req.method === "GET") {
    const auth = requireAuth(req, res);
    if (!auth) return;
    return sendJson(res, 200, buildAppPayload(auth.user));
  }

  if (pathname === "/api/me" && req.method === "PATCH") {
    const auth = requireAuth(req, res);
    if (!auth) return;
    return handleMeUpdate(req, res, auth.user);
  }

  if (pathname === "/api/admin/participants" && req.method === "GET") {
    const auth = requireAdmin(req, res);
    if (!auth) return;
    return sendJson(res, 200, { participants: data.participants, registrations: data.registrations, users: publicUsers() });
  }

  if (pathname.startsWith("/api/admin/participants/") && req.method === "PATCH") {
    const auth = requireAdmin(req, res);
    if (!auth) return;
    return handleParticipantUpdate(req, res, pathname.split("/").pop());
  }

  if (pathname === "/api/admin/create-account" && req.method === "POST") {
    const auth = requireAdmin(req, res);
    if (!auth) return;
    return handleCreateAccount(req, res);
  }

  if (pathname === "/api/admin/create-admin" && req.method === "POST") {
    const auth = requireAdmin(req, res);
    if (!auth) return;
    return handleCreateAdmin(req, res);
  }

  if (pathname === "/api/admin/auto-seat" && req.method === "POST") {
    const auth = requireAdmin(req, res);
    if (!auth) return;
    return handleAutoSeat(req, res);
  }

  if (pathname === "/api/admin/settings" && req.method === "PATCH") {
    const auth = requireAdmin(req, res);
    if (!auth) return;
    return handleSettingsUpdate(req, res);
  }

  if (pathname === "/api/admin/tables" && req.method === "POST") {
    const auth = requireAdmin(req, res);
    if (!auth) return;
    return handleTableCreate(req, res);
  }

  if (pathname.startsWith("/api/admin/tables/") && req.method === "PATCH") {
    const auth = requireAdmin(req, res);
    if (!auth) return;
    const parts = pathname.split("/");
    return handleTableUpdate(req, res, parts[4], parts.slice(5).join("/"));
  }

  if (pathname === "/api/admin/assets" && req.method === "POST") {
    const auth = requireAdmin(req, res);
    if (!auth) return;
    return handleAssetCreate(req, res, auth.user);
  }

  if (pathname.startsWith("/api/admin/assets/") && req.method === "DELETE") {
    const auth = requireAdmin(req, res);
    if (!auth) return;
    return handleAssetDelete(req, res, pathname.split("/").pop());
  }

  if (pathname === "/api/admin/message" && req.method === "POST") {
    const auth = requireAdmin(req, res);
    if (!auth) return;
    return handleMessage(req, res, auth.user);
  }

  if (pathname === "/api/admin/import-csv" && req.method === "POST") {
    const auth = requireAdmin(req, res);
    if (!auth) return;
    return handleCsvImport(req, res);
  }

  if (pathname === "/api/admin/import-bank-csv" && req.method === "POST") {
    const auth = requireAdmin(req, res);
    if (!auth) return;
    return handleBankCsvImport(req, res, auth.user);
  }

  if (pathname === "/api/admin/export.xlsx" && req.method === "GET") {
    const auth = requireAdmin(req, res);
    if (!auth) return;
    return sendWorkbook(res, createWorkbookBuffer(data), `bal-backup-${dateStamp()}.xlsx`);
  }

  if (pathname === "/api/admin/seating.csv" && req.method === "GET") {
    const auth = requireAdmin(req, res);
    if (!auth) return;
    return sendTextFile(res, createSeatingCsv(data), `uklad-siedzen-${dateStamp()}.csv`, "text/csv; charset=utf-8");
  }

  if (pathname === "/api/admin/backup" && req.method === "POST") {
    const auth = requireAdmin(req, res);
    if (!auth) return;
    const filename = `bal-backup-${dateStamp()}.xlsx`;
    fs.writeFileSync(path.join(BACKUP_DIR, filename), createWorkbookBuffer(data));
    return sendJson(res, 200, { filename });
  }

  if (pathname === "/api/admin/backups" && req.method === "GET") {
    const auth = requireAdmin(req, res);
    if (!auth) return;
    const backups = fs.readdirSync(BACKUP_DIR).filter((file) => file.endsWith(".xlsx")).sort().reverse();
    return sendJson(res, 200, { backups });
  }

  if (pathname.startsWith("/api/admin/backups/") && req.method === "GET") {
    const auth = requireAdmin(req, res);
    if (!auth) return;
    const filename = path.basename(pathname.split("/").pop() || "");
    if (!filename.endsWith(".xlsx")) return sendJson(res, 400, { error: "Nieprawidlowa nazwa pliku." });
    const file = path.join(BACKUP_DIR, filename);
    if (!fs.existsSync(file)) return sendJson(res, 404, { error: "Nie znaleziono kopii." });
    return sendWorkbook(res, fs.readFileSync(file), filename);
  }

  if (pathname === "/health") {
    return sendJson(res, 200, { ok: true });
  }

  return serveStatic(req, res, pathname);
}

async function handleLogin(req, res) {
  const body = await readJson(req);
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const user = data.users.find((item) => item.email.toLowerCase() === email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return sendJson(res, 401, { error: "Nieprawidlowy email lub haslo." });
  }
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { userId: user.id, expiresAt: Date.now() + SESSION_TTL_MS });
  return sendJson(res, 200, { token, ...buildAppPayload(user) });
}

async function handleRegister(req, res) {
  const body = await readJson(req, 3_000_000);
  if ((data.settings?.siteMode || "open") !== "open") {
    return sendJson(res, 403, { error: "Zapisy sa teraz wstrzymane przez organizatora." });
  }
  if (limitReadOnlyActive()) return sendJson(res, 429, readOnlyLimitResponse());
  const name = clean(body.name, 120);
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const registrationType = normalizeRegistrationType(body.registrationType, false);
  const albumNumber = normalizeAlbumNumber(body.albumNumber);
  const deanGroup = clean(body.deanGroup, 80);
  const passwordError = validatePasswordPolicy(password);
  if (registrationType === "companion") {
    return sendJson(res, 400, { error: "Goscia absolwenta dopisuje absolwent zapraszajacy w swoim formularzu." });
  }
  if (!termsAccepted(body)) {
    return sendJson(res, 400, { error: "Zaakceptuj regulamin i informacje RODO, zeby utworzyc konto." });
  }
  if (!name || !email || passwordError) {
    return sendJson(res, 400, { error: passwordError || "Podaj imie i nazwisko oraz email." });
  }
  if (!albumNumber) {
    return sendJson(res, 400, { error: "Podaj numer albumu. Bez niego nie da się bezpiecznie zablokować podwójnego zapisu." });
  }
  if (data.users.some((user) => user.email.toLowerCase() === email)) {
    return sendJson(res, 409, { error: "Konto z tym adresem email juz istnieje." });
  }
  const duplicateAlbum = albumOwner(albumNumber);
  if (duplicateAlbum) {
    return sendJson(res, 409, { error: albumDuplicateMessage(duplicateAlbum) });
  }

  const participantId = `p-new-${crypto.randomBytes(6).toString("hex")}`;
  const registrationId = `r-${crypto.randomBytes(8).toString("hex")}`;
  const now = new Date().toISOString();
  const transportMode = normalizeTransportMode(body.transportMode, body.transport);
  const companionName = clean(body.companionName, 120);
  const companionEmail = String(body.companionEmail || "").trim().toLowerCase();
  const companionDiet = clean(body.companionDiet, 40) || "standard";
  if (companionName && !companionSignupOpen()) {
    return sendJson(res, 403, { error: "Zapisy gosci absolwentow sa juz zamkniete." });
  }
  const pairId = companionName ? `pair-${crypto.randomBytes(6).toString("hex")}` : "";
  const participant = {
    id: participantId,
    name,
    email,
    phone: clean(body.phone, 40),
    roomId: "oczekujace",
    roomName: "Lista zapisow",
    tableId: "Bez miejsca",
    seatNo: "",
    side: "",
    diet: clean(body.diet, 40) || "standard",
    registrationType,
    albumNumber,
    deanGroup,
    linkedParticipantId: "",
    linkedStudentName: "",
    linkedStudentEmail: "",
    pairId,
    seatingPreference: clean(body.seatingPreference, 400),
    isCompanion: false,
    emptySeat: false,
    paidDeposit: false,
    paidInstallment1: false,
    paidInstallment2: false,
    paidBall: false,
    paidTransport: false,
    manualVerified: false,
    transportMode,
    transport: transportMode === "organized",
    transportInfo: "",
    registrationStatus: "pending",
    adminNote: clean(body.note, 500),
    termsAcceptedAt: now,
    rodoAcceptedAt: now,
    updatedAt: now,
  };
  data.participants.push(participant);

  let companionParticipant = null;
  if (companionName) {
    companionParticipant = {
      id: `p-new-${crypto.randomBytes(6).toString("hex")}`,
      name: companionName,
      email: companionEmail,
      phone: "",
      roomId: "oczekujace",
      roomName: "Lista zapisow",
      tableId: "Bez miejsca",
      seatNo: "",
      side: "",
      diet: companionDiet,
      registrationType: "companion",
      albumNumber: "",
      deanGroup,
      linkedParticipantId: participant.id,
      linkedStudentName: participant.name,
      linkedStudentEmail: participant.email,
      pairId,
      seatingPreference: clean(body.seatingPreference, 400),
      isCompanion: true,
      emptySeat: false,
      paidDeposit: false,
      paidInstallment1: false,
      paidInstallment2: false,
      paidBall: false,
      paidTransport: false,
      manualVerified: false,
      transportMode: "none",
      transport: false,
      transportInfo: "",
      registrationStatus: "pending",
      adminNote: clean(body.companionNote, 500),
      invitedByParticipantId: participant.id,
      updatedAt: now,
    };
    participant.linkedParticipantId = companionParticipant.id;
    participant.pairId = pairId;
    data.participants.push(companionParticipant);
  }

  data.registrations.push({
    id: registrationId,
    participantId,
    name,
    email,
    phone: participant.phone,
    registrationType,
    albumNumber,
    deanGroup,
    companionName,
    companionEmail,
    companionParticipantId: companionParticipant?.id || "",
    linkedParticipantId: participant.linkedParticipantId,
    linkedStudentName: "",
    linkedStudentEmail: "",
    diet: participant.diet,
    transport: participant.transport,
    transportMode: participant.transportMode,
    note: participant.adminNote,
    termsAcceptedAt: now,
    rodoAcceptedAt: now,
    status: "nowy zapis",
    createdAt: now,
  });
  data.users.push({
    id: `u-${crypto.randomBytes(8).toString("hex")}`,
    email,
    displayName: name,
    role: "student",
    participantId,
    passwordHash: hashPassword(password),
    createdAt: now,
  });
  saveData();
  return sendJson(res, 201, {
    ok: true,
    message: companionParticipant
      ? "Konto zostalo utworzone, a gosc absolwenta dopisany i spiety z Twoim zapisem."
      : "Konto zostalo utworzone. Organizator zobaczy zapis w panelu admina.",
  });
}

async function handleMeUpdate(req, res, user) {
  if (participantWriteBlocked(user)) return sendJson(res, 429, readOnlyLimitResponse());
  const body = await readJson(req);
  const participant = data.participants.find((item) => item.id === user.participantId);
  if (!participant) return sendJson(res, 404, { error: "Nie znaleziono profilu osoby." });
  participant.phone = clean(body.phone, 40);
  participant.diet = clean(body.diet, 40) || participant.diet;
  if ("albumNumber" in body) {
    const albumNumber = normalizeAlbumNumber(body.albumNumber);
    const duplicateAlbum = albumNumber ? albumOwner(albumNumber, participant.id) : null;
    if (duplicateAlbum) return sendJson(res, 409, { error: albumDuplicateMessage(duplicateAlbum) });
    participant.albumNumber = albumNumber;
    syncRegistrationAlbum(participant);
  }
  if ("deanGroup" in body) participant.deanGroup = clean(body.deanGroup, 80);
  if ("seatingPreference" in body) participant.seatingPreference = clean(body.seatingPreference, 400);
  participant.transportMode = normalizeTransportMode(body.transportMode, body.transport);
  participant.transport = participant.transportMode === "organized";
  participant.adminNote = participant.adminNote || "";
  participant.updatedAt = new Date().toISOString();
  saveData();
  return sendJson(res, 200, { participant: participantForClient(participant, true) });
}

async function handleParticipantUpdate(req, res, participantId) {
  const body = await readJson(req);
  const participant = data.participants.find((item) => item.id === participantId);
  if (!participant) return sendJson(res, 404, { error: "Nie znaleziono osoby." });
  const before = { ...participant };
  const stringFields = ["name", "email", "phone", "roomId", "roomName", "tableId", "side", "diet", "transportInfo", "registrationStatus", "adminNote", "deanGroup", "linkedStudentName", "linkedStudentEmail", "seatingPreference"];
  const boolFields = ["paidDeposit", "paidInstallment1", "paidInstallment2", "paidTransport", "manualVerified", "isCompanion", "emptySeat"];
  for (const field of stringFields) {
    if (field in body) participant[field] = clean(body[field], field === "adminNote" ? 800 : 160);
  }
  for (const field of boolFields) {
    if (field in body) participant[field] = Boolean(body[field]);
  }
  if ("albumNumber" in body) {
    const albumNumber = normalizeAlbumNumber(body.albumNumber);
    const duplicateAlbum = albumNumber ? albumOwner(albumNumber, participant.id) : null;
    if (duplicateAlbum) {
      Object.assign(participant, before);
      return sendJson(res, 409, { error: albumDuplicateMessage(duplicateAlbum) });
    }
    participant.albumNumber = albumNumber;
    syncRegistrationAlbum(participant);
  }
  if ("paidBall" in body) {
    const paid = Boolean(body.paidBall);
    participant.paidDeposit = paid;
    participant.paidInstallment1 = paid;
    participant.paidInstallment2 = paid;
  }
  if ("registrationType" in body) {
    participant.registrationType = normalizeRegistrationType(body.registrationType, participant.isCompanion);
    participant.isCompanion = participant.registrationType === "companion";
  }
  if ("linkedParticipantId" in body) {
    const linkedId = clean(body.linkedParticipantId, 80);
    if (linkedId) {
      const linked = data.participants.find((item) => item.id === linkedId && item.id !== participant.id);
      if (linked) linkParticipants(participant, linked);
    } else {
      unlinkParticipant(participant);
    }
  }
  if ("transportMode" in body) {
    participant.transportMode = normalizeTransportMode(body.transportMode, participant.transport);
    participant.transport = participant.transportMode === "organized";
  } else if ("transport" in body) {
    participant.transportMode = normalizeTransportMode(body.transport, false);
    participant.transport = participant.transportMode === "organized";
  }
  participant.paidBall = paymentComplete(participant);
  if ("seatNo" in body) participant.seatNo = body.seatNo === "" ? "" : Number(body.seatNo);
  if ("roomId" in body && !("roomName" in body)) participant.roomName = roomLabelServer(participant.roomId);
  syncSeatSide(participant);
  const collision = seatCollision(participant);
  if (collision) {
    const seatAction = clean(body.seatAction, 40);
    const hasPreviousSeat = before.roomId && before.tableId && before.seatNo && before.roomId !== "oczekujace";
    if (seatAction === "swap" && hasPreviousSeat) {
      collision.roomId = before.roomId;
      collision.roomName = before.roomName || roomLabelServer(before.roomId);
      collision.tableId = before.tableId;
      collision.seatNo = before.seatNo;
      collision.side = before.side;
      syncSeatSide(collision);
      const now = new Date().toISOString();
      collision.updatedAt = now;
      participant.updatedAt = now;
      saveData();
      return sendJson(res, 200, { participant, swappedParticipant: collision });
    }
    Object.assign(participant, before);
    const hint = seatAction === "swap" ? " Ta osoba nie ma jeszcze starego miejsca, więc nie ma czego zamienić." : " Wybierz tryb Zamień, jeśli chcesz zamienić te dwie osoby miejscami.";
    return sendJson(res, 409, { error: `To miejsce jest juz zajete przez: ${collision.name}.${hint}` });
  }
  participant.updatedAt = new Date().toISOString();
  saveData();
  return sendJson(res, 200, { participant });
}

async function handleCreateAccount(req, res) {
  const body = await readJson(req);
  const participant = data.participants.find((item) => item.id === body.participantId);
  const email = String(body.email || participant?.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const passwordError = validatePasswordPolicy(password);
  if (!participant || !email || passwordError) {
    return sendJson(res, 400, { error: passwordError || "Wybierz osobe i email." });
  }
  let user = data.users.find((item) => item.participantId === participant.id || item.email.toLowerCase() === email);
  if (!user) {
    user = {
      id: `u-${crypto.randomBytes(8).toString("hex")}`,
      email,
      displayName: participant.name,
      role: "student",
      participantId: participant.id,
      createdAt: new Date().toISOString(),
    };
    data.users.push(user);
  }
  user.email = email;
  user.displayName = participant.name;
  user.participantId = participant.id;
  user.role = "student";
  user.passwordHash = hashPassword(password);
  participant.email = email;
  participant.updatedAt = new Date().toISOString();
  saveData();
  return sendJson(res, 200, { user: publicUser(user), participant });
}

async function handleCreateAdmin(req, res) {
  const body = await readJson(req);
  const displayName = clean(body.displayName || body.name, 120);
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const passwordError = validatePasswordPolicy(password);
  if (!displayName || !email || passwordError) {
    return sendJson(res, 400, { error: passwordError || "Podaj nazwe admina i email." });
  }
  let user = data.users.find((item) => item.email.toLowerCase() === email);
  if (!user) {
    user = {
      id: `u-${crypto.randomBytes(8).toString("hex")}`,
      email,
      displayName,
      role: "admin",
      createdAt: new Date().toISOString(),
    };
    data.users.push(user);
  }
  user.email = email;
  user.displayName = displayName;
  user.role = "admin";
  user.participantId = "";
  user.passwordHash = hashPassword(password);
  saveData();
  return sendJson(res, 200, { user: publicUser(user), users: publicUsers() });
}

async function handleSettingsUpdate(req, res) {
  const body = await readJson(req, 7_000_000);
  const settings = body.settings || {};
  const cleanSettings = {};
  const textFields = [
    "appName",
    "eventName",
    "subtitle",
    "eventDate",
    "venueName",
    "venueAddress",
    "mapUrl",
    "organizedTransportInfo",
    "ownTransportInfo",
    "siteMode",
    "comingSoonTitle",
    "comingSoonMessage",
    "maintenanceTitle",
    "maintenanceMessage",
    "limitGuardMessage",
    "logoText",
    "logoSubtext",
    "logoImageName",
    "heroImageName",
    "authEyebrow",
    "heroTagline",
    "heroCopy",
    "seatingLockedMessage",
    "companionSignupDeadline",
    "adminWelcomeMessage",
    "rodoText",
    "termsText",
    "nightMode",
    "nightStart",
    "nightEnd",
  ];
  for (const field of textFields) {
    if (field in settings) {
      const limit = ["organizedTransportInfo", "ownTransportInfo", "heroCopy", "seatingLockedMessage", "rodoText", "termsText", "adminWelcomeMessage", "comingSoonMessage", "maintenanceMessage", "limitGuardMessage"].includes(field) ? 1200 : 500;
      cleanSettings[field] = clean(settings[field], limit);
    }
  }
  if (cleanSettings.logoText) cleanSettings.logoText = cleanSettings.logoText.slice(0, 6);
  if (cleanSettings.siteMode && !["open", "comingSoon", "maintenance"].includes(cleanSettings.siteMode)) cleanSettings.siteMode = "open";
  if (cleanSettings.nightMode && !["auto", "on", "off"].includes(cleanSettings.nightMode)) cleanSettings.nightMode = "auto";
  if ("seatingVisible" in settings) cleanSettings.seatingVisible = settings.seatingVisible === true || settings.seatingVisible === "true" || settings.seatingVisible === "on";
  if ("limitGuardEnabled" in settings) cleanSettings.limitGuardEnabled = settings.limitGuardEnabled === true || settings.limitGuardEnabled === "true" || settings.limitGuardEnabled === "on";
  if ("limitForceReadOnly" in settings) cleanSettings.limitForceReadOnly = settings.limitForceReadOnly === true || settings.limitForceReadOnly === "true" || settings.limitForceReadOnly === "on";
  if ("limitDailyRequestLimit" in settings) cleanSettings.limitDailyRequestLimit = clampInt(settings.limitDailyRequestLimit, 100, 5_000_000, DEFAULT_SETTINGS.limitDailyRequestLimit);
  if ("limitDailyWriteLimit" in settings) cleanSettings.limitDailyWriteLimit = clampInt(settings.limitDailyWriteLimit, 10, 1_000_000, DEFAULT_SETTINGS.limitDailyWriteLimit);
  if ("limitReadOnlyAtPercent" in settings) cleanSettings.limitReadOnlyAtPercent = clampInt(settings.limitReadOnlyAtPercent, 1, 100, DEFAULT_SETTINGS.limitReadOnlyAtPercent);
  const cropFields = {
    logoCropX: [0, 100, 50],
    logoCropY: [0, 100, 50],
    logoZoom: [100, 240, 100],
    heroCropX: [0, 100, 50],
    heroCropY: [0, 100, 50],
    heroZoom: [100, 220, 100],
  };
  for (const [field, range] of Object.entries(cropFields)) {
    if (field in settings) cleanSettings[field] = clampInt(settings[field], range[0], range[1], range[2]);
  }
  if ("logoImageData" in settings) cleanSettings.logoImageData = safeDataUrl(settings.logoImageData, 1_800_000, ["image/png", "image/jpeg", "image/webp"]);
  if ("heroImageData" in settings) cleanSettings.heroImageData = safeDataUrl(settings.heroImageData, 3_400_000, ["image/png", "image/jpeg", "image/webp"]);
  data.settings = {
    ...data.settings,
    ...cleanSettings,
    theme: {
      ...(data.settings.theme || {}),
      ...cleanTheme(settings.theme || {}),
    },
  };
  if (settings.interfaceTexts && typeof settings.interfaceTexts === "object") {
    data.settings.interfaceTexts = Object.fromEntries(
      Object.entries(settings.interfaceTexts)
        .slice(0, 120)
        .map(([key, value]) => [clean(key, 80), clean(value, 400)])
        .filter(([key]) => key)
    );
  }
  if (settings.statusTexts && typeof settings.statusTexts === "object") {
    data.settings.statusTexts = Object.fromEntries(
      Object.entries(settings.statusTexts)
        .slice(0, 160)
        .map(([key, value]) => [clean(key, 80), clean(value, 500)])
        .filter(([key]) => key)
    );
  }
  if (body.infopack) {
    data.infopack.intro = clean(body.infopack.intro, 1200);
    data.infopack.schedule = Array.isArray(body.infopack.schedule)
      ? body.infopack.schedule.slice(0, 30).map((item) => ({ time: clean(item.time, 20), title: clean(item.title, 120) }))
      : data.infopack.schedule;
    data.infopack.sections = Array.isArray(body.infopack.sections)
      ? body.infopack.sections.slice(0, 20).map((item) => ({ title: clean(item.title, 80), body: clean(item.body, 1200) }))
      : data.infopack.sections;
  }
  saveData();
  return sendJson(res, 200, { settings: data.settings, infopack: data.infopack, limits: limitStatusForUser(true) });
}

async function handleTableCreate(req, res) {
  const body = await readJson(req);
  const roomId = clean(body.roomId, 80) || "sala-dolna";
  const roomName = clean(body.roomName, 120) || roomLabelServer(roomId);
  const left = clampInt(body.left, 1, 60, 12);
  const right = clampInt(body.right, 0, 60, 12);
  const columnIndex = clampInt(body.columnIndex, 0, 50, 0);

  data.layouts ||= {};
  data.layouts[roomId] ||= [[]];
  while (data.layouts[roomId].length <= columnIndex) data.layouts[roomId].push([]);

  const existingIds = new Set(data.layouts[roomId].flat().map((table) => table.id));
  let tableId = clean(body.tableId, 80);
  if (!tableId) tableId = nextTableId(roomId);
  if (existingIds.has(tableId)) {
    return sendJson(res, 409, { error: "Stół o tej nazwie już istnieje w tej sali." });
  }

  const table = {
    id: tableId,
    left,
    right,
    label: clean(body.label, 120) || `${tableId} (${left + right} os.)`,
  };
  data.layouts[roomId][columnIndex].push(table);
  data.layouts[roomId][columnIndex].sort((a, b) => naturalTableNumber(a.id) - naturalTableNumber(b.id) || a.id.localeCompare(b.id, "pl"));
  saveData();
  return sendJson(res, 201, { roomId, roomName, table, layouts: data.layouts });
}

async function handleTableUpdate(req, res, roomIdRaw, tableIdRaw) {
  const body = await readJson(req);
  const roomId = clean(roomIdRaw, 80);
  const tableId = clean(tableIdRaw, 80);
  const columns = data.layouts?.[roomId];
  const table = columns?.flat().find((item) => item.id === tableId);
  if (!table) return sendJson(res, 404, { error: "Nie znaleziono stołu w tej sali." });

  const previousTotal = Number(table.left || 0) + Number(table.right || 0);
  const left = clampInt(body.left, 1, 80, Number(table.left || 12));
  const right = clampInt(body.right, 0, 80, Number(table.right || 0));
  const total = left + right;
  const occupied = (data.participants || []).filter((participant) => participant.roomId === roomId && participant.tableId === tableId && participant.seatNo);
  const highestSeat = occupied.reduce((max, participant) => Math.max(max, Number(participant.seatNo) || 0), 0);
  if (highestSeat > total) {
    const occupant = occupied.find((participant) => Number(participant.seatNo) === highestSeat);
    return sendJson(res, 409, { error: `Nie można zmniejszyć stołu do ${total} miejsc, bo ${occupant?.name || "uczestnik"} ma miejsce ${highestSeat}.` });
  }

  const rawLabel = clean(body.label, 120);
  const oldAutoLabel = `${table.id} (${previousTotal} os.)`;
  table.left = left;
  table.right = right;
  table.label = rawLabel && rawLabel !== oldAutoLabel ? rawLabel : `${table.id} (${total} os.)`;

  for (const participant of occupied) {
    syncSeatSide(participant);
    participant.updatedAt = new Date().toISOString();
  }
  saveData();
  return sendJson(res, 200, { roomId, table, layouts: data.layouts, updatedParticipants: occupied.length });
}

async function handleAutoSeat(req, res) {
  const body = await readJson(req);
  const mode = clean(body.mode, 40) || "empty";
  const people = (data.participants || []).filter((participant) => {
    if (participant.emptySeat) return false;
    if (mode === "all") return true;
    return !participant.seatNo || !participant.tableId || participant.roomId === "oczekujace";
  });
  const clusters = seatingClusters(people);
  const freeSeats = availableSeats(mode === "all" ? new Set(people.map((item) => item.id)) : new Set());
  let assigned = 0;
  const skipped = [];

  for (const cluster of clusters) {
    const seats = takeSeatsForCluster(freeSeats, cluster.length);
    if (!seats.length || seats.length < cluster.length) {
      skipped.push(cluster.map((item) => item.name).join(" + "));
      continue;
    }
    cluster.forEach((participant, index) => {
      const seat = seats[index];
      participant.roomId = seat.roomId;
      participant.roomName = roomLabelServer(seat.roomId);
      participant.tableId = seat.tableId;
      participant.seatNo = seat.seatNo;
      participant.side = seat.side;
      participant.updatedAt = new Date().toISOString();
      assigned += 1;
    });
  }

  saveData();
  return sendJson(res, 200, { assigned, skipped, participants: data.participants });
}

async function handleAssetCreate(req, res, user) {
  const body = await readJson(req, 4_800_000);
  const category = clean(body.category, 40) || "material";
  const name = clean(body.name, 160) || "Materiał";
  const dataUrl = safeDataUrl(body.dataUrl, 4_200_000, ["image/png", "image/jpeg", "image/webp", "application/pdf"]);
  if (!dataUrl) return sendJson(res, 400, { error: "Dodaj plik PNG, JPG, WebP albo PDF do 3 MB." });
  const asset = {
    id: `asset-${crypto.randomBytes(8).toString("hex")}`,
    category,
    name,
    mimeType: dataUrlMime(dataUrl),
    dataUrl,
    size: Number(body.size) || dataUrl.length,
    createdBy: user.displayName || user.email,
    createdAt: new Date().toISOString(),
  };
  data.assets ||= [];
  data.assets.unshift(asset);
  data.assets = data.assets.slice(0, 80);
  saveData();
  return sendJson(res, 201, { asset, assets: data.assets });
}

async function handleAssetDelete(req, res, assetId) {
  const before = data.assets?.length || 0;
  data.assets = (data.assets || []).filter((asset) => asset.id !== assetId);
  if (data.assets.length === before) return sendJson(res, 404, { error: "Nie znaleziono materiału." });
  saveData();
  return sendJson(res, 200, { ok: true, assets: data.assets });
}

async function handleMessage(req, res, user) {
  const body = await readJson(req);
  const title = clean(body.title, 120);
  const message = clean(body.message, 1000);
  const target = clean(body.target, 40) || "all";
  if (!title || !message) return sendJson(res, 400, { error: "Wpisz tytul i tresc wiadomosci." });

  const scheduledAt = clean(body.scheduledAt, 60);
  const scheduledTime = scheduledAt ? new Date(scheduledAt).getTime() : NaN;
  if (Number.isFinite(scheduledTime) && scheduledTime > Date.now() + 30_000) {
    const item = {
      id: `sn-${crypto.randomBytes(8).toString("hex")}`,
      title,
      message,
      target,
      participantIds: Array.isArray(body.participantIds) ? body.participantIds.map((id) => clean(id, 80)) : [],
      scheduledAt: new Date(scheduledTime).toISOString(),
      createdBy: user.displayName || user.email,
      createdAt: new Date().toISOString(),
      status: "scheduled",
    };
    data.scheduledNotifications ||= [];
    data.scheduledNotifications.unshift(item);
    saveData();
    return sendJson(res, 201, { count: 0, scheduled: true, item, scheduledNotifications: data.scheduledNotifications });
  }

  const notifications = createNotifications({ title, message, target, participantIds: body.participantIds, createdBy: user.displayName || user.email });
  saveData();
  return sendJson(res, 201, { count: notifications.length, notifications, scheduled: false });
}

function createNotifications({ title, message, target = "all", participantIds = [], createdBy = "Administrator" }) {
  const selected = new Set(Array.isArray(participantIds) ? participantIds : []);
  const recipients = data.participants.filter((participant) => {
    if (participant.emptySeat) return false;
    if (target === "all") return true;
    if (target === "unpaid") return !paymentComplete(participant);
    if (target === "transport") return isOrganizedTransport(participant);
    if (target === "selected") return selected.has(participant.id);
    return false;
  });
  const now = new Date().toISOString();
  const notifications = recipients.map((participant) => {
    const recipientUser = data.users.find((item) => item.participantId === participant.id || (participant.email && item.email.toLowerCase() === participant.email.toLowerCase()));
    return {
      id: `n-${crypto.randomBytes(8).toString("hex")}`,
      title,
      message,
      target,
      recipientParticipantId: participant.id,
      recipientUserId: recipientUser?.id || "",
      createdBy,
      createdAt: now,
      read: false,
    };
  });
  data.notifications ||= [];
  data.notifications.unshift(...notifications);
  return notifications;
}

function releaseDueNotifications() {
  const scheduled = data.scheduledNotifications || [];
  if (!scheduled.length) return 0;
  const now = Date.now();
  let released = 0;
  const remaining = [];
  for (const item of scheduled) {
    const time = new Date(item.scheduledAt).getTime();
    if (Number.isFinite(time) && time <= now && item.status !== "sent") {
      createNotifications({
        title: item.title,
        message: item.message,
        target: item.target,
        participantIds: item.participantIds,
        createdBy: item.createdBy,
      });
      item.status = "sent";
      item.sentAt = new Date().toISOString();
      released += 1;
    } else {
      remaining.push(item);
    }
  }
  data.scheduledNotifications = remaining;
  if (released) saveData();
  return released;
}

async function handleCsvImport(req, res) {
  const body = await readText(req, 4_000_000);
  const rows = parseCsv(body);
  if (rows.length < 2) return sendJson(res, 400, { error: "Plik CSV jest pusty." });
  const headers = rows[0].map((item) => normalizeHeader(item));
  let updated = 0;
  for (const row of rows.slice(1)) {
    const record = Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]));
    const participant = findParticipantFromImport(record);
    if (!participant) continue;
    applyImportedRecord(participant, record);
    updated += 1;
  }
  saveData();
  return sendJson(res, 200, { updated });
}

function findParticipantFromImport(record) {
  if (record.id) {
    const byId = data.participants.find((item) => item.id === record.id);
    if (byId) return byId;
  }
  const albumNumber = albumNumberFromRecord(record);
  if (albumNumber) {
    const byAlbum = data.participants.find((item) => normalizeAlbumNumber(item.albumNumber) === albumNumber);
    if (byAlbum) return byAlbum;
  }
  if (record.email) {
    const email = record.email.toLowerCase();
    const byEmail = data.participants.find((item) => item.email?.toLowerCase() === email);
    if (byEmail) return byEmail;
  }
  if (record.name) {
    const name = record.name.toLowerCase();
    return data.participants.find((item) => item.name?.toLowerCase() === name);
  }
  return null;
}

function applyImportedRecord(participant, record) {
  const map = {
    name: "name",
    email: "email",
    phone: "phone",
    room: "roomName",
    roomid: "roomId",
    table: "tableId",
    seat: "seatNo",
    side: "side",
    diet: "diet",
    album: "albumNumber",
    albumnumber: "albumNumber",
    numeralbumu: "albumNumber",
    nralbumu: "albumNumber",
    indeks: "albumNumber",
    index: "albumNumber",
    nrindeksu: "albumNumber",
    typ: "registrationType",
    type: "registrationType",
    registrationtype: "registrationType",
    grupa: "deanGroup",
    grupadziekanska: "deanGroup",
    deangroup: "deanGroup",
    para: "linkedStudentName",
    linkedstudent: "linkedStudentName",
    linkedstudentname: "linkedStudentName",
    linkedstudentemail: "linkedStudentEmail",
    preferencje: "seatingPreference",
    seatingpreference: "seatingPreference",
    verified: "manualVerified",
    manualverified: "manualVerified",
    zweryfikowano: "manualVerified",
    zweryfikowanorecznie: "manualVerified",
    weryfikacja: "manualVerified",
    status: "registrationStatus",
    note: "adminNote",
  };
  for (const [key, field] of Object.entries(map)) {
    if (record[key] !== undefined && record[key] !== "") {
      if (field === "seatNo") participant[field] = Number(record[key]) || "";
      else if (field === "albumNumber") {
        const albumNumber = normalizeAlbumNumber(record[key]);
        if (albumNumber && !albumOwner(albumNumber, participant.id)) {
          participant.albumNumber = albumNumber;
          syncRegistrationAlbum(participant);
        }
      } else if (field === "manualVerified") {
        participant.manualVerified = truthy(record[key]);
      } else {
        participant[field] = clean(record[key], 300);
      }
    }
  }
  if (participant.registrationType) {
    participant.registrationType = normalizeRegistrationType(participant.registrationType, participant.isCompanion);
    participant.isCompanion = participant.registrationType === "companion";
  }
  if (record.linkedparticipantid !== undefined && record.linkedparticipantid !== "") {
    const linked = data.participants.find((item) => item.id === record.linkedparticipantid && item.id !== participant.id);
    if (linked) linkParticipants(participant, linked);
  } else if ((record.linkedstudentemail || record.linkedstudent || record.para) && !participant.linkedParticipantId) {
    const linked = findLinkedParticipant(record.linkedstudent || record.para || "", record.linkedstudentemail || "");
    if (linked && linked.id !== participant.id) linkParticipants(participant, linked);
  }
  if (record.paiddeposit !== undefined && record.paiddeposit !== "") participant.paidDeposit = truthy(record.paiddeposit);
  if (record.deposit !== undefined && record.deposit !== "") participant.paidDeposit = truthy(record.deposit);
  if (record.zaliczka !== undefined && record.zaliczka !== "") participant.paidDeposit = truthy(record.zaliczka);
  if (record.paidinstallment1 !== undefined && record.paidinstallment1 !== "") participant.paidInstallment1 = truthy(record.paidinstallment1);
  if (record.installment1 !== undefined && record.installment1 !== "") participant.paidInstallment1 = truthy(record.installment1);
  if (record.wplata1 !== undefined && record.wplata1 !== "") participant.paidInstallment1 = truthy(record.wplata1);
  if (record.wpata1 !== undefined && record.wpata1 !== "") participant.paidInstallment1 = truthy(record.wpata1);
  if (record.paidinstallment2 !== undefined && record.paidinstallment2 !== "") participant.paidInstallment2 = truthy(record.paidinstallment2);
  if (record.installment2 !== undefined && record.installment2 !== "") participant.paidInstallment2 = truthy(record.installment2);
  if (record.wplata2 !== undefined && record.wplata2 !== "") participant.paidInstallment2 = truthy(record.wplata2);
  if (record.wpata2 !== undefined && record.wpata2 !== "") participant.paidInstallment2 = truthy(record.wpata2);
  if (record.paidball !== undefined && record.paidball !== "") {
    const paid = truthy(record.paidball);
    participant.paidDeposit = paid;
    participant.paidInstallment1 = paid;
    participant.paidInstallment2 = paid;
  }
  participant.paidBall = paymentComplete(participant);
  if (record.paidtransport !== undefined && record.paidtransport !== "") participant.paidTransport = truthy(record.paidtransport);
  if (record.transportmode !== undefined && record.transportmode !== "") {
    participant.transportMode = normalizeTransportMode(record.transportmode, participant.transport);
  } else if (record.transporttyp !== undefined && record.transporttyp !== "") {
    participant.transportMode = normalizeTransportMode(record.transporttyp, participant.transport);
  } else if (record.transporttype !== undefined && record.transporttype !== "") {
    participant.transportMode = normalizeTransportMode(record.transporttype, participant.transport);
  } else if (record.transportwlasny !== undefined && record.transportwlasny !== "" && truthy(record.transportwlasny)) {
    participant.transportMode = "own";
  } else if (record.transport !== undefined && record.transport !== "") {
    participant.transportMode = normalizeTransportMode(record.transport, false);
  }
  participant.transport = isOrganizedTransport(participant);
  participant.updatedAt = new Date().toISOString();
}

async function handleBankCsvImport(req, res, user) {
  const body = await readJson(req, 4_500_000);
  const csv = String(body.csv || "");
  const rows = parseCsv(csv);
  if (rows.length < 2) return sendJson(res, 400, { error: "Wklej CSV z banku z nagłówkami i co najmniej jedną transakcją." });

  const headers = rows[0].map((item) => normalizeHeader(item));
  const expectedAmounts = {
    paidDeposit: parseMoney(body.depositAmount),
    paidInstallment1: parseMoney(body.installment1Amount),
    paidInstallment2: parseMoney(body.installment2Amount),
    paidTransport: parseMoney(body.transportAmount),
  };
  const applied = [];
  const unmatched = [];
  const ambiguous = [];
  let changedFields = 0;

  for (const row of rows.slice(1)) {
    const record = Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]));
    const transaction = bankTransaction(record);
    if (!Number.isFinite(transaction.amount) || transaction.amount <= 0) continue;

    const participant = findParticipantFromBankRecord(record, transaction.searchText);
    if (!participant) {
      unmatched.push(bankImportPreview(transaction));
      continue;
    }

    const fields = paymentFieldsFromBankTransaction(transaction.searchText, transaction.amount, expectedAmounts);
    if (!fields.length) {
      ambiguous.push({ ...bankImportPreview(transaction), participant: participant.name });
      continue;
    }

    const labels = [];
    for (const field of fields) {
      if (!participant[field]) changedFields += 1;
      participant[field] = true;
      labels.push(paymentFieldLabel(field));
    }
    participant.paidBall = paymentComplete(participant);
    participant.updatedAt = new Date().toISOString();
    applied.push({
      participantId: participant.id,
      name: participant.name,
      albumNumber: participant.albumNumber || "",
      amount: transaction.amount,
      fields: labels,
      title: transaction.title,
    });
  }

  data.paymentImports ||= [];
  data.paymentImports.unshift({
    id: `payimp-${crypto.randomBytes(8).toString("hex")}`,
    createdAt: new Date().toISOString(),
    createdBy: user.displayName || user.email,
    transactions: rows.length - 1,
    matched: applied.length,
    changedFields,
    unmatched: unmatched.length,
    ambiguous: ambiguous.length,
  });
  data.paymentImports = data.paymentImports.slice(0, 20);
  saveData();
  return sendJson(res, 200, {
    matched: applied.length,
    changedFields,
    unmatched: unmatched.slice(0, 20),
    ambiguous: ambiguous.slice(0, 20),
    applied: applied.slice(0, 40),
    participants: data.participants,
    paymentImports: data.paymentImports,
  });
}

function buildAppPayload(user) {
  releaseDueNotifications();
  const isAdmin = user.role === "admin";
  const ownParticipant = data.participants.find((item) => item.id === user.participantId);
  return {
    user: publicUser(user),
    participant: ownParticipant ? participantForClient(ownParticipant, true) : null,
    settings: data.settings,
    infopack: data.infopack,
    layouts: data.layouts,
    participants: data.participants.map((participant) => participantForClient(participant, isAdmin, ownParticipant?.id)),
    assets: isAdmin ? data.assets || [] : [],
    notifications: notificationsFor(user, ownParticipant),
    limits: limitStatusForUser(isAdmin),
    admin: isAdmin ? { registrations: data.registrations, users: publicUsers(), scheduledNotifications: data.scheduledNotifications || [] } : null,
  };
}

function participantForClient(participant, admin = false, ownId = "") {
  const base = {
    id: participant.id,
    name: participant.name,
    roomId: participant.roomId,
    roomName: participant.roomName,
    tableId: participant.tableId,
    seatNo: participant.seatNo,
    side: participant.side,
    diet: participant.diet,
    isCompanion: participant.isCompanion,
    emptySeat: participant.emptySeat,
  };
  if (admin || participant.id === ownId) {
    return {
      ...participant,
      paidDeposit: Boolean(participant.paidDeposit),
      paidInstallment1: Boolean(participant.paidInstallment1),
      paidInstallment2: Boolean(participant.paidInstallment2),
      paidBall: Boolean(participant.paidBall),
      paidTransport: Boolean(participant.paidTransport),
      transportMode: normalizeTransportMode(participant.transportMode, participant.transport),
      transport: isOrganizedTransport(participant),
    };
  }
  return base;
}

function notificationsFor(user, participant) {
  if (user.role === "admin") return data.notifications.slice(0, 200);
  return data.notifications
    .filter((item) => item.recipientUserId === user.id || item.recipientParticipantId === participant?.id)
    .slice(0, 50);
}

function trafficDate() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeTrafficState() {
  data.traffic ||= { date: trafficDate(), requests: 0, writes: 0, readOnlyActivations: 0, updatedAt: new Date().toISOString() };
  const today = trafficDate();
  if (data.traffic.date !== today) {
    data.traffic = { date: today, requests: 0, writes: 0, readOnlyActivations: data.traffic.readOnlyActivations || 0, updatedAt: new Date().toISOString() };
    saveData();
  }
  return data.traffic;
}

function trackTraffic(req, pathname) {
  const traffic = normalizeTrafficState();
  traffic.requests += 1;
  if (requestWrites(req, pathname)) traffic.writes += 1;
  traffic.updatedAt = new Date().toISOString();
  if (requestWrites(req, pathname) || traffic.requests % 25 === 0) saveData();
}

function requestWrites(req, pathname) {
  if (req.method === "GET" || pathname === "/api/auth/login") return false;
  return pathname.startsWith("/api/");
}

function limitStatus() {
  const traffic = normalizeTrafficState();
  const requestLimit = clampInt(data.settings?.limitDailyRequestLimit, 100, 5_000_000, DEFAULT_SETTINGS.limitDailyRequestLimit);
  const writeLimit = clampInt(data.settings?.limitDailyWriteLimit, 10, 1_000_000, DEFAULT_SETTINGS.limitDailyWriteLimit);
  const readOnlyAt = clampInt(data.settings?.limitReadOnlyAtPercent, 1, 100, DEFAULT_SETTINGS.limitReadOnlyAtPercent);
  const requestPercent = Math.min(999, Math.round((traffic.requests / requestLimit) * 100));
  const writePercent = Math.min(999, Math.round((traffic.writes / writeLimit) * 100));
  const guardEnabled = data.settings?.limitGuardEnabled !== false && data.settings?.limitGuardEnabled !== "false";
  const forceReadOnly = data.settings?.limitForceReadOnly === true || data.settings?.limitForceReadOnly === "true" || data.settings?.limitForceReadOnly === "on";
  const readOnly = guardEnabled && (forceReadOnly || requestPercent >= readOnlyAt || writePercent >= readOnlyAt);
  const reason = forceReadOnly
    ? "Tryb podglądu wymuszony ręcznie."
    : requestPercent >= readOnlyAt
      ? "Zbliżamy się do dziennego limitu odczytów/API."
      : writePercent >= readOnlyAt
        ? "Zbliżamy się do dziennego limitu zapisów."
        : "";
  return {
    date: traffic.date,
    guardEnabled,
    readOnly,
    forceReadOnly,
    reason,
    message: data.settings?.limitGuardMessage || DEFAULT_SETTINGS.limitGuardMessage,
    requestsToday: traffic.requests,
    writesToday: traffic.writes,
    dailyRequestLimit: requestLimit,
    dailyWriteLimit: writeLimit,
    readOnlyAtPercent: readOnlyAt,
    requestPercent,
    writePercent,
    resetAt: `${traffic.date}T23:59:59.999Z`,
  };
}

function limitReadOnlyActive() {
  return limitStatus().readOnly;
}

function participantWriteBlocked(user) {
  return user?.role !== "admin" && limitReadOnlyActive();
}

function readOnlyLimitResponse() {
  const status = limitStatus();
  return { error: status.message, readOnly: true, limits: limitStatusForUser(false) };
}

function limitStatusForUser(admin = false) {
  const status = limitStatus();
  if (admin) return status;
  return {
    guardEnabled: status.guardEnabled,
    readOnly: status.readOnly,
    reason: status.reason,
    message: status.message,
    requestPercent: status.requestPercent,
    writePercent: status.writePercent,
  };
}

function paymentComplete(participant) {
  return Boolean(participant.paidDeposit && participant.paidInstallment1 && participant.paidInstallment2);
}

function publicUsers() {
  return data.users.map(publicUser);
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    participantId: user.participantId || "",
    createdAt: user.createdAt,
  };
}

function requireAuth(req, res) {
  const token = getToken(req);
  const session = token ? sessions.get(token) : null;
  if (!session || session.expiresAt < Date.now()) {
    if (token) sessions.delete(token);
    sendJson(res, 401, { error: "Sesja wygasla. Zaloguj sie ponownie." });
    return null;
  }
  const user = data.users.find((item) => item.id === session.userId);
  if (!user) {
    sendJson(res, 401, { error: "Konto nie istnieje." });
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return { user, token };
}

function requireAdmin(req, res) {
  const auth = requireAuth(req, res);
  if (!auth) return null;
  if (auth.user.role !== "admin") {
    sendJson(res, 403, { error: "Tylko administrator ma dostep do tej opcji." });
    return null;
  }
  return auth;
}

function getToken(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7);
  return "";
}

async function readJson(req, limit = 1_000_000) {
  const text = await readText(req, limit);
  if (!text) return {};
  return JSON.parse(text);
}

function readText(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > limit) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  const json = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(json);
}

function sendWorkbook(res, buffer, filename) {
  res.writeHead(200, {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Content-Length": buffer.length,
    "Cache-Control": "no-store",
  });
  res.end(buffer);
}

function sendTextFile(res, text, filename, contentType) {
  const buffer = Buffer.from(text, "utf8");
  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Content-Length": buffer.length,
    "Cache-Control": "no-store",
  });
  res.end(buffer);
}

function serveStatic(req, res, pathname) {
  const requestPath = APP_ROUTES.has(pathname) ? "/index.html" : pathname;
  const safePath = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);
  if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Nie znaleziono strony.");
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const type = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
  }[ext] || "application/octet-stream";
  const isRuntimeShell = ext === ".html" || path.basename(filePath) === "sw.js";
  const cache = isRuntimeShell
    ? "no-store, must-revalidate"
    : [".png", ".jpg", ".jpeg", ".webp", ".svg"].includes(ext)
      ? "public, max-age=86400"
      : "no-cache, must-revalidate";
  res.writeHead(200, { "Content-Type": type, "Cache-Control": cache });
  fs.createReadStream(filePath).pipe(res);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const iterations = 120_000;
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("hex");
  return `pbkdf2$${iterations}$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  const [type, iterationsRaw, salt, expected] = String(stored || "").split("$");
  if (type !== "pbkdf2" || !salt || !expected) return false;
  const hash = crypto.pbkdf2Sync(password, salt, Number(iterationsRaw), 32, "sha256").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(expected, "hex"));
}

function normalizeSupabaseRestUrl(value) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  if (raw.endsWith("/rest/v1")) return raw;
  return `${raw}/rest/v1`;
}

function clean(value, max = 200) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeAlbumNumber(value) {
  return String(value ?? "").trim().toUpperCase().replace(/[\s_-]+/g, "").slice(0, 40);
}

function albumNumberFromRecord(record) {
  return normalizeAlbumNumber(
    record.albumNumber
    || record.albumnumber
    || record.album
    || record.numeralbumu
    || record.nralbumu
    || record.indeks
    || record.index
    || record.nrindeksu
  );
}

function albumOwner(albumNumber, ignoredParticipantId = "") {
  const normalized = normalizeAlbumNumber(albumNumber);
  if (!normalized) return null;
  const participant = (data.participants || []).find((item) => item.id !== ignoredParticipantId && normalizeAlbumNumber(item.albumNumber) === normalized);
  if (participant) return participant;
  return (data.registrations || []).find((item) => item.participantId !== ignoredParticipantId && normalizeAlbumNumber(item.albumNumber) === normalized) || null;
}

function albumDuplicateMessage(owner) {
  const label = owner?.name || owner?.email || "innej osoby";
  return `Ten numer albumu jest już przypisany do: ${label}. Sprawdź, czy ta osoba nie ma już konta.`;
}

function syncRegistrationAlbum(participant) {
  for (const registration of data.registrations || []) {
    if (registration.participantId === participant.id) registration.albumNumber = participant.albumNumber || "";
  }
}

function pickClean(object, keys) {
  return Object.fromEntries(keys.filter((key) => key in object).map((key) => [key, clean(object[key], 500)]));
}

function cleanTheme(theme) {
  const allowed = ["primary", "background", "gold", "coral", "sage", "cream", "paper", "mist", "ink", "muted"];
  const result = {};
  for (const key of allowed) {
    if (theme?.[key]) result[key] = clean(theme[key], 32);
  }
  return result;
}

function validatePasswordPolicy(password) {
  const text = String(password || "");
  if (text.length < 10) return "Haslo musi miec minimum 10 znakow.";
  if (!/[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]/.test(text) || !/\d/.test(text)) return "Haslo musi zawierac litere i cyfre.";
  return "";
}

function termsAccepted(body) {
  return body.termsAccepted === true || body.termsAccepted === "true" || body.termsAccepted === "on";
}

function companionSignupOpen() {
  const deadline = data.settings?.companionSignupDeadline;
  if (!deadline) return true;
  const timestamp = new Date(deadline).getTime();
  if (!Number.isFinite(timestamp)) return true;
  return Date.now() <= timestamp;
}

function normalizeRegistrationType(value, fallbackCompanion = false) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (["companion", "osobatowarzyszaca", "towarzyszaca", "towarzyszacy", "ot", "guest", "gosc", "goscabsolwenta"].includes(normalized)) return "companion";
  if (["student", "uczestnik", "uczestnikrocznika", "rocznik", "regular", "zwykla", "zwykly", "uczestnikzwykly", "uczestniczkazwykla", "absolwent", "absolwentka"].includes(normalized)) return "student";
  return fallbackCompanion ? "companion" : "student";
}

function findLinkedParticipant(name, email) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (cleanEmail) {
    const byEmail = data.participants.find((item) => item.email?.toLowerCase() === cleanEmail);
    if (byEmail) return byEmail;
  }
  const cleanName = clean(name, 120).toLowerCase();
  if (!cleanName) return null;
  return data.participants.find((item) => item.name?.toLowerCase() === cleanName) || null;
}

function bankTransaction(record) {
  const title = clean(
    record.tytul
    || record.tytuloperacji
    || record.tytulprzelewu
    || record.opistransakcji
    || record.opis
    || record.description
    || record.title
    || record.nazwa
    || "",
    500
  );
  const amountRaw = record.kwota || record.kwotaoperacji || record.kwotatransakcji || record.kwotaprzelewu || record.amount || record.wartosc || record.value || record.obciazenieuznanie || record.uznanie || record.przychod || "";
  const searchText = Object.values(record).join(" ");
  return {
    title: title || clean(searchText, 500),
    amount: parseMoney(amountRaw),
    searchText,
  };
}

function findParticipantFromBankRecord(record, searchText) {
  const normalizedText = normalizeSearchText(searchText);
  const explicitAlbum = albumNumberFromRecord(record);
  if (explicitAlbum) {
    const byAlbum = data.participants.find((item) => normalizeAlbumNumber(item.albumNumber) === explicitAlbum);
    if (byAlbum) return byAlbum;
  }
  for (const participant of data.participants || []) {
    const album = normalizeAlbumNumber(participant.albumNumber);
    if (album && normalizedText.includes(normalizeSearchText(album))) return participant;
  }
  for (const participant of data.participants || []) {
    const email = String(participant.email || "").toLowerCase();
    if (email && normalizedText.includes(normalizeSearchText(email))) return participant;
  }
  for (const participant of data.participants || []) {
    const tokens = normalizeSearchText(participant.name).split(" ").filter((token) => token.length >= 3);
    if (tokens.length >= 2 && tokens.every((token) => normalizedText.includes(token))) return participant;
  }
  return null;
}

function paymentFieldsFromBankTransaction(searchText, amount, expectedAmounts) {
  const normalized = normalizeSearchText(searchText);
  const fields = new Set();
  if (/(transport|autokar|autokary|bus|dojazd)/.test(normalized)) fields.add("paidTransport");
  if (/(zaliczka|zadatek|depozyt|deposit)/.test(normalized)) fields.add("paidDeposit");
  if (/((wplata|rata|platnosc|czesc)\s*1|pierwsza|first)/.test(normalized)) fields.add("paidInstallment1");
  if (/((wplata|rata|platnosc|czesc)\s*2|druga|second)/.test(normalized)) fields.add("paidInstallment2");
  if (!fields.size && Number.isFinite(amount)) {
    for (const [field, expected] of Object.entries(expectedAmounts || {})) {
      if (Number.isFinite(expected) && expected > 0 && Math.abs(amount - expected) < 0.01) fields.add(field);
    }
  }
  return [...fields];
}

function bankImportPreview(transaction) {
  return {
    amount: transaction.amount,
    title: clean(transaction.title || transaction.searchText, 180),
  };
}

function paymentFieldLabel(field) {
  return {
    paidDeposit: "zaliczka",
    paidInstallment1: "wpłata 1",
    paidInstallment2: "wpłata 2",
    paidTransport: "transport",
  }[field] || field;
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9@.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseMoney(value) {
  let text = String(value ?? "").trim();
  if (!text) return NaN;
  text = text.replace(/\s/g, "").replace(/[A-Za-złŁ]/g, "");
  if (text.includes(",") && text.includes(".")) {
    text = text.lastIndexOf(",") > text.lastIndexOf(".")
      ? text.replace(/\./g, "").replace(",", ".")
      : text.replace(/,/g, "");
  } else if (text.includes(",")) {
    text = text.replace(",", ".");
  }
  const number = Number(text.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) ? number : NaN;
}

function linkParticipants(first, second) {
  if (!first || !second || first.id === second.id) return "";
  const pairId = first.pairId || second.pairId || `pair-${crypto.randomBytes(6).toString("hex")}`;
  first.linkedParticipantId = second.id;
  second.linkedParticipantId = first.id;
  first.pairId = pairId;
  second.pairId = pairId;
  if (first.registrationType === "companion") {
    first.linkedStudentName = second.name || "";
    first.linkedStudentEmail = second.email || "";
    if (!first.deanGroup && second.deanGroup) first.deanGroup = second.deanGroup;
  }
  if (second.registrationType === "companion") {
    second.linkedStudentName = first.name || "";
    second.linkedStudentEmail = first.email || "";
    if (!second.deanGroup && first.deanGroup) second.deanGroup = first.deanGroup;
  }
  return pairId;
}

function unlinkParticipant(participant) {
  if (!participant) return;
  const linked = data.participants.find((item) => item.id === participant.linkedParticipantId);
  if (linked && linked.linkedParticipantId === participant.id) {
    linked.linkedParticipantId = "";
    linked.pairId = "";
  }
  participant.linkedParticipantId = "";
  participant.pairId = "";
}

function safeDataUrl(value, maxLength, allowedTypes) {
  const text = String(value || "");
  if (!text) return "";
  if (text.length > maxLength) return "";
  const match = text.match(/^data:([^;,]+);base64,[a-zA-Z0-9+/=\s]+$/);
  if (!match) return "";
  if (!allowedTypes.includes(match[1])) return "";
  return text.replace(/\s/g, "");
}

function dataUrlMime(value) {
  return String(value || "").match(/^data:([^;,]+);base64,/)?.[1] || "";
}

function normalizeTransportMode(value, fallbackTransport = false) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!normalized) return fallbackTransport ? "organized" : "none";
  if (["organized", "zorganizowany", "autokar", "autokary", "bus", "busy", "tak", "yes", "true", "1", "x"].includes(normalized)) return "organized";
  if (["own", "wlasny", "wlasna", "samochod", "samochodem", "auto", "parking"].includes(normalized)) return "own";
  if (["none", "brak", "nie", "no", "false", "0"].includes(normalized)) return "none";
  return fallbackTransport ? "organized" : "none";
}

function isOrganizedTransport(participant) {
  return normalizeTransportMode(participant?.transportMode, participant?.transport) === "organized";
}

function clampInt(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function seatingClusters(people) {
  const byId = new Map(people.map((participant) => [participant.id, participant]));
  const seen = new Set();
  const clusters = [];
  for (const participant of people.slice().sort(seatingSort)) {
    if (seen.has(participant.id)) continue;
    const cluster = [participant];
    seen.add(participant.id);
    const linked = byId.get(participant.linkedParticipantId);
    if (linked && !seen.has(linked.id)) {
      cluster.push(linked);
      seen.add(linked.id);
    }
    clusters.push(cluster.sort((a, b) => Number(a.registrationType === "companion") - Number(b.registrationType === "companion")));
  }
  return clusters.sort((a, b) => seatingSort(a[0], b[0]) || b.length - a.length);
}

function seatingSort(a, b) {
  const groupA = clean(a.deanGroup || "zzzz", 80);
  const groupB = clean(b.deanGroup || "zzzz", 80);
  return groupA.localeCompare(groupB, "pl", { numeric: true }) || a.name.localeCompare(b.name, "pl");
}

function layoutTable(roomId, tableId) {
  return (data.layouts?.[roomId] || []).flat().find((table) => table.id === tableId) || null;
}

function syncSeatSide(participant) {
  if (!participant.roomId || !participant.tableId || participant.roomId === "oczekujace") {
    participant.side = "";
    return;
  }
  const table = layoutTable(participant.roomId, participant.tableId);
  const seatNo = Number(participant.seatNo);
  if (!table || !Number.isFinite(seatNo) || seatNo < 1) {
    participant.seatNo = "";
    participant.side = "";
    return;
  }
  const left = Number(table.left || 0);
  const total = left + Number(table.right || 0);
  if (seatNo > total) {
    participant.seatNo = "";
    participant.side = "";
    return;
  }
  participant.side = seatNo <= left ? "L" : "P";
}

function seatCollision(participant) {
  if (!participant.roomId || !participant.tableId || !participant.seatNo || participant.roomId === "oczekujace") return null;
  return (data.participants || []).find((item) => (
    item.id !== participant.id
    && item.roomId === participant.roomId
    && item.tableId === participant.tableId
    && Number(item.seatNo) === Number(participant.seatNo)
  )) || null;
}

function availableSeats(ignoredParticipantIds = new Set()) {
  const occupied = new Set(
    (data.participants || [])
      .filter((participant) => !ignoredParticipantIds.has(participant.id) && participant.roomId && participant.tableId && participant.seatNo)
      .map((participant) => `${participant.roomId}|${participant.tableId}|${participant.seatNo}`)
  );
  const seats = [];
  for (const [roomId, columns] of Object.entries(data.layouts || {})) {
    for (const table of columns.flat()) {
      const left = Number(table.left || 0);
      const total = left + Number(table.right || 0);
      for (let seatNo = 1; seatNo <= total; seatNo += 1) {
        const key = `${roomId}|${table.id}|${seatNo}`;
        if (!occupied.has(key)) {
          seats.push({
            roomId,
            tableId: table.id,
            seatNo,
            side: seatNo <= left ? "L" : "P",
          });
        }
      }
    }
  }
  return seats;
}

function takeSeatsForCluster(freeSeats, count) {
  const byTable = new Map();
  for (const seat of freeSeats) {
    const key = `${seat.roomId}|${seat.tableId}`;
    byTable.set(key, [...(byTable.get(key) || []), seat]);
  }
  for (const seats of byTable.values()) {
    seats.sort((a, b) => a.seatNo - b.seatNo);
    for (let index = 0; index <= seats.length - count; index += 1) {
      const slice = seats.slice(index, index + count);
      const contiguous = slice.every((seat, offset) => offset === 0 || seat.seatNo === slice[offset - 1].seatNo + 1);
      if (contiguous) {
        removeTakenSeats(freeSeats, slice);
        return slice;
      }
    }
  }
  for (const seats of byTable.values()) {
    if (seats.length >= count) {
      const slice = seats.slice(0, count);
      removeTakenSeats(freeSeats, slice);
      return slice;
    }
  }
  return [];
}

function removeTakenSeats(freeSeats, taken) {
  const keys = new Set(taken.map((seat) => `${seat.roomId}|${seat.tableId}|${seat.seatNo}`));
  for (let index = freeSeats.length - 1; index >= 0; index -= 1) {
    const seat = freeSeats[index];
    if (keys.has(`${seat.roomId}|${seat.tableId}|${seat.seatNo}`)) freeSeats.splice(index, 1);
  }
}

function nextTableId(roomId) {
  const numbers = (data.layouts?.[roomId] || [])
    .flat()
    .map((table) => naturalTableNumber(table.id))
    .filter((number) => Number.isFinite(number));
  const next = numbers.length ? Math.max(...numbers) + 1 : 1;
  return `Stół ${next}`;
}

function naturalTableNumber(value) {
  const match = String(value || "").match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

function roomLabelServer(roomId) {
  return {
    "sala-dolna": "Sala dolna",
    "sala-gorna": "Sala górna",
    namiot: "Namiot",
    oczekujace: "Lista zapisów",
  }[roomId] || roomId;
}

function truthy(value) {
  return ["1", "true", "tak", "yes", "y", "x"].includes(String(value).trim().toLowerCase());
}

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function parseCsv(text) {
  const delimiter = detectDelimiter(text);
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((items) => items.some((item) => item.trim()));
}

function detectDelimiter(text) {
  const firstLine = String(text || "").split(/\r?\n/).find((line) => line.trim()) || "";
  const candidates = [",", ";", "\t"];
  return candidates
    .map((delimiter) => ({ delimiter, count: firstLine.split(delimiter).length - 1 }))
    .sort((a, b) => b.count - a.count)[0]?.delimiter || ",";
}

function dateStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function createSeatingCsv(source) {
  const participants = [...(source.participants || [])].sort((a, b) => {
    const room = (a.roomName || a.roomId || "zzz").localeCompare(b.roomName || b.roomId || "zzz", "pl", { numeric: true });
    if (room) return room;
    const table = String(a.tableId || "zzz").localeCompare(String(b.tableId || "zzz"), "pl", { numeric: true });
    if (table) return table;
    return (Number(a.seatNo) || 9999) - (Number(b.seatNo) || 9999) || a.name.localeCompare(b.name, "pl");
  });
  const rows = [
    ["Sala", "Stół", "Miejsce", "Strona", "Imię i nazwisko", "Numer albumu", "Typ", "Grupa dziekańska", "Para", "Dieta", "Transport", "Płatności", "Zweryfikowano ręcznie", "Status", "Preferencje"],
    ...participants.map((participant) => [
      participant.roomName || roomLabelServer(participant.roomId),
      participant.tableId || "Bez stołu",
      participant.seatNo || "",
      participant.side || "",
      participant.name,
      participant.albumNumber || "",
      registrationTypeLabel(participant),
      participant.deanGroup || "",
      linkedName(participant, source.participants),
      dietLabel(participant.diet),
      transportModeLabel(participant),
      paymentComplete(participant) ? "Komplet" : "Do uzupełnienia",
      yesNo(participant.manualVerified),
      participant.registrationStatus || "",
      participant.seatingPreference || "",
    ]),
  ];
  return `\ufeff${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}\r\n`;
}

function csvCell(value) {
  const text = String(value ?? "").replace(/\r?\n/g, " ").trim();
  if (/[;"]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function createWorkbookBuffer(source) {
  const sheets = [
    {
      name: "Uczestnicy",
      rows: [
        ["ID", "Imie i nazwisko", "Email", "Telefon", "Numer albumu", "Typ", "Grupa dziekanska", "Para", "Sala", "Stol", "Miejsce", "Strona", "Dieta", "Gosc absolwenta", "Zaliczka", "Wplata 1", "Wplata 2", "Bal komplet", "Transport typ", "Transport oplacony", "Zweryfikowano recznie", "Status", "Preferencje", "Uwagi"],
        ...source.participants.map((p) => [
          p.id,
          p.name,
          p.email,
          p.phone,
          p.albumNumber,
          registrationTypeLabel(p),
          p.deanGroup,
          linkedName(p, source.participants),
          p.roomName || p.roomId,
          p.tableId,
          p.seatNo,
          p.side,
          dietLabel(p.diet),
          yesNo(p.isCompanion),
          yesNo(p.paidDeposit),
          yesNo(p.paidInstallment1),
          yesNo(p.paidInstallment2),
          yesNo(paymentComplete(p)),
          transportModeLabel(p),
          yesNo(p.paidTransport),
          yesNo(p.manualVerified),
          p.registrationStatus,
          p.seatingPreference,
          p.adminNote,
        ]),
      ],
    },
    {
      name: "Zapisy",
      rows: [
        ["ID", "Osoba", "Email", "Telefon", "Numer albumu", "Typ", "Grupa dziekanska", "Gosc absolwenta", "Powiazany absolwent", "Dieta", "Transport", "Status", "Notatka", "Data"],
        ...(source.registrations || []).map((r) => [r.id, r.name, r.email, r.phone, r.albumNumber, registrationTypeLabel(r), r.deanGroup, r.companionName, r.linkedStudentName, dietLabel(r.diet), transportModeLabel(r), r.status, r.note, r.createdAt]),
      ],
    },
    {
      name: "Importy bankowe",
      rows: [
        ["ID", "Data", "Admin", "Transakcje", "Dopasowane", "Zmienione pola", "Niedopasowane", "Do sprawdzenia"],
        ...(source.paymentImports || []).map((item) => [item.id, item.createdAt, item.createdBy, item.transactions, item.matched, item.changedFields, item.unmatched, item.ambiguous]),
      ],
    },
    {
      name: "Powiadomienia",
      rows: [
        ["ID", "Tytul", "Tresc", "Odbiorca", "Autor", "Data"],
        ...(source.notifications || []).map((n) => [n.id, n.title, n.message, n.recipientParticipantId, n.createdBy, n.createdAt]),
      ],
    },
    {
      name: "Ustawienia",
      rows: [
        ["Pole", "Wartosc"],
        ["Nazwa", source.settings?.appName],
        ["Wydarzenie", source.settings?.eventName],
        ["Data", source.settings?.eventDate],
        ["Miejsce", source.settings?.venueName],
        ["Adres", source.settings?.venueAddress],
        ["Mapa", source.settings?.mapUrl],
        ["Logo", source.settings?.logoText],
        ["Plan stolow widoczny", yesNo(source.settings?.seatingVisible)],
        ["Komunikat blokady stolow", source.settings?.seatingLockedMessage],
        ["Tryb nocny", source.settings?.nightMode],
        ["Transport zorganizowany", source.settings?.organizedTransportInfo],
        ["Transport wlasny", source.settings?.ownTransportInfo],
      ],
    },
  ];
  return zipFiles(workbookFiles(sheets));
}

function workbookFiles(sheets) {
  const workbookSheets = sheets
    .map((sheet, index) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
    .join("");
  const rels = sheets
    .map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`)
    .join("");
  const overrides = sheets
    .map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
    .join("");
  const files = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${overrides}</Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${workbookSheets}</sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    "xl/styles.xml": `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Aptos"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`,
  };
  sheets.forEach((sheet, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = sheetXml(sheet.rows);
  });
  return files;
}

function sheetXml(rows) {
  const cols = rows[0]
    .map((_, index) => `<col min="${index + 1}" max="${index + 1}" width="${index === 1 ? 28 : 18}" customWidth="1"/>`)
    .join("");
  const body = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, colIndex) => cellXml(value, `${columnName(colIndex + 1)}${rowIndex + 1}`))
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${cols}</cols><sheetData>${body}</sheetData></worksheet>`;
}

function cellXml(value, ref) {
  if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}"><v>${value}</v></c>`;
  const text = xmlEscape(value ?? "");
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;
}

function columnName(number) {
  let result = "";
  while (number > 0) {
    const mod = (number - 1) % 26;
    result = String.fromCharCode(65 + mod) + result;
    number = Math.floor((number - mod) / 26);
  }
  return result;
}

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function dietLabel(value) {
  return { standard: "standard", gf: "bezglutenowa", vegan: "weganska", x: "puste" }[value] || value || "";
}

function registrationTypeLabel(participant) {
  const type = normalizeRegistrationType(participant?.registrationType, participant?.isCompanion);
  if (type === "companion") return "gosc absolwenta";
  return "absolwent";
}

function linkedName(participant, participants = data.participants || []) {
  return participants.find((item) => item.id === participant?.linkedParticipantId)?.name || participant?.linkedStudentName || "";
}

function transportModeLabel(participant) {
  return {
    organized: "zorganizowany",
    own: "wlasny",
    none: "brak",
  }[normalizeTransportMode(participant?.transportMode, participant?.transport)] || "brak";
}

function yesNo(value) {
  return value ? "TAK" : "NIE";
}

const CRC_TABLE = (() => {
  const table = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zipFiles(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBuffer = Buffer.from(name, "utf8");
    const contentBuffer = Buffer.from(content, "utf8");
    const crc = crc32(contentBuffer);
    const local = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(contentBuffer.length),
      u32(contentBuffer.length),
      u16(nameBuffer.length),
      u16(0),
      nameBuffer,
      contentBuffer,
    ]);
    const central = Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(contentBuffer.length),
      u32(contentBuffer.length),
      u16(nameBuffer.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBuffer,
    ]);
    localParts.push(local);
    centralParts.push(central);
    offset += local.length;
  }
  const central = Buffer.concat(centralParts);
  const end = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(centralParts.length),
    u16(centralParts.length),
    u32(central.length),
    u32(offset),
    u16(0),
  ]);
  return Buffer.concat([...localParts, central, end]);
}

function u16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function u32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
}
