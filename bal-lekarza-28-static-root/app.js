const cfg = window.BAL_CONFIG || {};
const appState = {
  db: null,
  session: null,
  user: null,
  profile: null,
  site: defaultSite(),
  participants: [],
  myParticipant: null,
  activeView: "dashboard",
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

document.addEventListener("DOMContentLoaded", init);

async function init() {
  if (!window.supabase?.createClient) {
    toast("Nie zaladowano biblioteki Supabase. Sprawdz polaczenie z internetem.");
    return;
  }
  if (!cfg.supabaseUrl || !cfg.supabasePublishableKey) {
    toast("Brak konfiguracji Supabase w config.js.");
    return;
  }

  appState.db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  bindUi();

  const { data } = await appState.db.auth.getSession();
  if (data.session) await enterApp(data.session);
  else showAuth();

  appState.db.auth.onAuthStateChange(async (_event, session) => {
    if (session && session.access_token !== appState.session?.access_token) {
      await enterApp(session);
    }
  });
}

function bindUi() {
  $$("[data-auth-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      $$("[data-auth-tab]").forEach((item) => item.classList.toggle("active", item === button));
      $("#login-form").classList.toggle("hidden", button.dataset.authTab !== "login");
      $("#register-form").classList.toggle("hidden", button.dataset.authTab !== "register");
    });
  });

  $("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    const { data, error } = await appState.db.auth.signInWithPassword({
      email: String(body.email || "").trim(),
      password: String(body.password || ""),
    });
    if (error) return toast(readableError(error));
    await enterApp(data.session);
  });

  $("#register-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const body = normalizeRegistration(Object.fromEntries(new FormData(form)));
    localStorage.setItem("balPendingRegistration", JSON.stringify(body));
    const { data, error } = await appState.db.auth.signUp({
      email: body.email,
      password: String(body.password || ""),
      options: { data: { display_name: body.name } },
    });
    if (error) return toast(readableError(error));
    if (data.session) {
      await completePendingRegistration();
      form.reset();
      toast("Konto utworzone i zapisane w Supabase.");
    } else {
      toast("Konto utworzone. Jesli Supabase wymaga potwierdzenia maila, potwierdz go i zaloguj sie ponownie.");
    }
  });

  $("#logout-button").addEventListener("click", async () => {
    await appState.db.auth.signOut();
    appState.session = null;
    appState.user = null;
    appState.profile = null;
    appState.participants = [];
    appState.myParticipant = null;
    showAuth();
  });

  $$("[data-view]").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

  $("#profile-form").addEventListener("submit", saveProfileDetails);
  $("#site-form").addEventListener("submit", saveSite);
  $("#reload-button").addEventListener("click", () => loadAppData().then(renderAll));
  $("#export-json-button").addEventListener("click", exportJson);
  $("#export-csv-button").addEventListener("click", exportCsv);
  $("#auto-seat-button").addEventListener("click", autoSeat);
  $("#seat-search").addEventListener("input", () => renderSeating());
  $("#admin-search").addEventListener("input", () => renderAdminParticipants());

  $("#participants-body").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-save-participant]");
    if (!button) return;
    await saveParticipant(button.dataset.saveParticipant);
  });
}

async function enterApp(session) {
  appState.session = session;
  appState.user = session.user;
  await loadAppData();
  if (!appState.profile && localStorage.getItem("balPendingRegistration")) {
    await completePendingRegistration();
    await loadAppData();
  }
  if (!appState.profile) {
    toast("Zalogowano, ale konto nie ma profilu. Uzupelnij zapis albo popros admina o przypisanie.");
  }
  showApp();
  renderAll();
}

async function completePendingRegistration() {
  const raw = localStorage.getItem("balPendingRegistration");
  if (!raw) return;
  const payload = JSON.parse(raw);
  delete payload.password;
  const { error } = await appState.db.rpc("register_participant", { payload });
  if (error) {
    toast(readableError(error));
    return;
  }
  localStorage.removeItem("balPendingRegistration");
}

async function loadAppData() {
  await loadSite();
  await loadProfile();
  await loadParticipants();
}

async function loadProfile() {
  const { data, error } = await appState.db
    .from("profiles")
    .select("*")
    .eq("id", appState.user.id)
    .maybeSingle();
  if (error) {
    appState.profile = null;
    return;
  }
  appState.profile = data || null;
}

async function loadSite() {
  const { data, error } = await appState.db
    .from("site_state")
    .select("*")
    .eq("id", "main")
    .maybeSingle();
  if (error || !data) {
    appState.site = defaultSite();
    return;
  }
  appState.site = mergeSite(data);
}

async function loadParticipants() {
  const { data, error } = await appState.db
    .from("participants")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) {
    appState.participants = [];
    appState.myParticipant = null;
    return;
  }
  appState.participants = data || [];
  appState.myParticipant = appState.participants.find((item) => item.owner_id === appState.user.id || item.id === appState.profile?.participant_id) || null;
}

function showAuth() {
  $("#auth-screen").classList.remove("hidden");
  $("#app-screen").classList.add("hidden");
}

function showApp() {
  $("#auth-screen").classList.add("hidden");
  $("#app-screen").classList.remove("hidden");
}

function switchView(view) {
  appState.activeView = view;
  $$(".nav").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  $$(".view").forEach((section) => section.classList.toggle("active", section.id === `view-${view}`));
  renderAll();
}

function renderAll() {
  applyTheme();
  renderDashboard();
  renderInfo();
  renderSeating();
  renderTravel();
  renderAdmin();
}

function applyTheme() {
  const settings = appState.site.settings;
  document.documentElement.style.setProperty("--primary", settings.theme?.primary || "#173d35");
  document.documentElement.style.setProperty("--background", settings.theme?.background || "#f8f2e7");
  $$("[data-site]").forEach((node) => {
    const key = node.dataset.site;
    if (settings[key]) node.textContent = settings[key];
  });
}

function renderDashboard() {
  const participant = appState.myParticipant;
  $("#welcome-title").textContent = participant ? `Dobry wieczor, ${participant.name}` : "Dobry wieczor";
  $("#welcome-text").textContent = appState.profile?.role === "admin"
    ? "Jestes zalogowany jako administrator."
    : "Tu sprawdzisz platnosci, miejsce, diete i transport.";

  $("#status-strip").innerHTML = [
    statusCard(paymentComplete(participant), "Bal", paymentComplete(participant) ? "oplacony" : "do sprawdzenia"),
    statusCard(Boolean(participant?.manual_verified), "Weryfikacja", participant?.manual_verified ? "potwierdzono" : "czeka"),
    statusCard(Boolean(participant?.table_id), "Miejsce", participant?.table_id ? `${participant.table_id}${participant.seat_no ? ` / ${participant.seat_no}` : ""}` : "brak"),
  ].join("");

  $("#payment-summary").innerHTML = participant ? [
    row("Zaliczka", yesNo(participant.paid_deposit)),
    row("Wplata 1", yesNo(participant.paid_installment1)),
    row("Wplata 2", yesNo(participant.paid_installment2)),
    row("Transport", yesNo(participant.paid_transport)),
    row("Status", escapeHtml(participant.registration_status || "nowy zapis")),
  ].join("") : `<p class="hint">Administrator nie ma przypisanego konta uczestnika.</p>`;

  $("#my-details").innerHTML = participant ? [
    row("Dieta", dietLabel(participant.diet)),
    row("Transport", transportLabel(participant.transport_mode)),
    row("Sala", escapeHtml(participant.room_name || participant.room_id || "nie ustalono")),
    row("Stol", escapeHtml(participant.table_id || "nie ustalono")),
    row("Miejsce", escapeHtml(participant.seat_no || "nie ustalono")),
  ].join("") : `<p class="hint">Brak przypisanego uczestnika.</p>`;

  const form = $("#profile-form");
  form.phone.value = participant?.phone || "";
  form.diet.value = participant?.diet || "standard";
  form.transport_mode.value = participant?.transport_mode || "none";
  form.seating_preference.value = participant?.seating_preference || "";
}

function renderInfo() {
  const info = appState.site.infopack;
  $("#infopack-intro").textContent = info.intro || "";
  $("#schedule-list").innerHTML = (info.schedule || []).map((item) => `
    <div class="time-item ${isCurrentSchedule(item.time) ? "active" : ""}">
      <strong>${escapeHtml(item.time || "")}</strong>
      <span>${escapeHtml(item.title || "")}</span>
    </div>
  `).join("") || `<p class="hint">Harmonogram pojawi sie wkrotce.</p>`;
  $("#section-list").innerHTML = (info.sections || []).map((item) => `
    <div class="section-card">
      <h4>${escapeHtml(item.title || "")}</h4>
      <p>${escapeHtml(item.body || "")}</p>
    </div>
  `).join("") || `<p class="hint">Sekcje infopaku pojawia sie wkrotce.</p>`;
}

function renderSeating() {
  const settings = appState.site.settings;
  const isAdminUser = isAdmin();
  const visible = settings.seatingVisible || isAdminUser;
  $("#seating-note").textContent = visible
    ? "Administrator widzi pelna liste. Uczestnik widzi glownie swoje przypisanie."
    : settings.seatingLockedMessage || "Plan stolikow jest jeszcze w przygotowaniu.";
  $("#table-search-wrap").classList.toggle("hidden", !visible);
  if (!visible) {
    $("#tables-view").innerHTML = "";
    return;
  }

  const search = ($("#seat-search").value || "").trim().toLowerCase();
  const tables = flattenTables(appState.site.tables);
  $("#tables-view").innerHTML = tables.map((table) => {
    const people = appState.participants.filter((p) => p.room_id === table.roomId && p.table_id === table.id);
    const filteredPeople = people.filter((p) => !search || searchable(p, table).includes(search));
    if (search && !filteredPeople.length && !`${table.label} ${table.roomName}`.toLowerCase().includes(search)) return "";
    return `
      <article class="table-card">
        <h4>${escapeHtml(table.label)} <span class="pill">${people.length}/${table.capacity}</span></h4>
        <div class="seat-list">
          ${filteredPeople.length ? filteredPeople.map((p) => seatLine(p, isAdminUser)).join("") : `<span>Brak przypisanych osob.</span>`}
        </div>
      </article>
    `;
  }).join("");
}

function renderTravel() {
  const settings = appState.site.settings;
  $("#map-link").href = settings.mapUrl || "https://maps.google.com";
  $("#organized-transport").textContent = settings.organizedTransportInfo || "";
  $("#own-transport").textContent = settings.ownTransportInfo || "";
}

function renderAdmin() {
  const admin = isAdmin();
  $$(".admin-only").forEach((node) => node.classList.toggle("hidden", !admin));
  if (!admin) return;

  const people = appState.participants;
  $("#admin-stats").innerHTML = [
    stat(people.length, "uczestnikow"),
    stat(people.filter(paymentComplete).length, "oplacony bal"),
    stat(people.filter((p) => p.manual_verified).length, "zweryfikowano recznie"),
    stat(people.filter((p) => p.transport_mode === "organized").length, "transport zorganizowany"),
  ].join("");

  const form = $("#site-form");
  const settings = appState.site.settings;
  form.eventName.value = settings.eventName || "";
  form.subtitle.value = settings.subtitle || "";
  form.heroCopy.value = settings.heroCopy || "";
  form.primary.value = settings.theme?.primary || "#173d35";
  form.background.value = settings.theme?.background || "#f8f2e7";
  form.seatingVisible.checked = Boolean(settings.seatingVisible);
  form.infopackIntro.value = appState.site.infopack.intro || "";
  form.scheduleText.value = (appState.site.infopack.schedule || []).map((item) => `${item.time} | ${item.title}`).join("\n");
  form.sectionsText.value = (appState.site.infopack.sections || []).map((item) => `${item.title} | ${item.body}`).join("\n");

  renderAdminParticipants();
}

function renderAdminParticipants() {
  if (!isAdmin()) return;
  const search = ($("#admin-search").value || "").trim().toLowerCase();
  const participants = appState.participants.filter((p) => !search || searchable(p).includes(search));
  $("#participants-body").innerHTML = participants.map((p) => `
    <tr data-row="${p.id}">
      <td>
        <strong>${escapeHtml(p.name || "")}</strong><br>
        <span class="hint">${escapeHtml(p.email || "")}</span><br>
        <input name="phone" value="${escapeAttr(p.phone || "")}" placeholder="telefon">
      </td>
      <td>
        <input name="album_number" value="${escapeAttr(p.album_number || "")}" placeholder="album">
        <input name="dean_group" value="${escapeAttr(p.dean_group || "")}" placeholder="grupa">
      </td>
      <td>
        <div class="checks">
          ${adminCheck("paid_deposit", "zaliczka", p.paid_deposit)}
          ${adminCheck("paid_installment1", "wplata 1", p.paid_installment1)}
          ${adminCheck("paid_installment2", "wplata 2", p.paid_installment2)}
          ${adminCheck("paid_transport", "transport", p.paid_transport)}
          ${adminCheck("manual_verified", "zweryfikowano", p.manual_verified)}
        </div>
      </td>
      <td>
        <div class="mini-grid">
          <input name="room_id" value="${escapeAttr(p.room_id || "")}" placeholder="sala">
          <input name="table_id" value="${escapeAttr(p.table_id || "")}" placeholder="stol">
          <input name="seat_no" value="${escapeAttr(p.seat_no || "")}" placeholder="miejsce">
        </div>
      </td>
      <td>
        <select name="diet">
          ${option("standard", "Standard", p.diet)}
          ${option("gf", "Bezglutenowa", p.diet)}
          ${option("vegan", "Weganska", p.diet)}
        </select>
        <select name="transport_mode">
          ${option("none", "Brak transportu", p.transport_mode)}
          ${option("organized", "Zorganizowany", p.transport_mode)}
          ${option("own", "Wlasny", p.transport_mode)}
        </select>
      </td>
      <td>
        <input name="registration_status" value="${escapeAttr(p.registration_status || "")}" placeholder="status">
      </td>
      <td>
        <button class="secondary" type="button" data-save-participant="${p.id}">Zapisz</button>
      </td>
    </tr>
  `).join("");
}

async function saveProfileDetails(event) {
  event.preventDefault();
  if (!appState.myParticipant) return toast("Brak przypisanego uczestnika.");
  const body = Object.fromEntries(new FormData(event.currentTarget));
  const { error } = await appState.db.rpc("update_my_participant", {
    payload: {
      phone: clean(body.phone, 60),
      diet: body.diet,
      transport_mode: body.transport_mode,
      seating_preference: clean(body.seating_preference, 500),
    },
  });
  if (error) return toast(readableError(error));
  await loadAppData();
  renderAll();
  toast("Dane zapisane.");
}

async function saveSite(event) {
  event.preventDefault();
  if (!isAdmin()) return;
  const form = event.currentTarget;
  const body = Object.fromEntries(new FormData(form));
  const site = {
    id: "main",
    settings: {
      ...appState.site.settings,
      eventName: clean(body.eventName, 120),
      subtitle: clean(body.subtitle, 180),
      heroCopy: clean(body.heroCopy, 800),
      seatingVisible: form.seatingVisible.checked,
      theme: {
        ...(appState.site.settings.theme || {}),
        primary: body.primary || "#173d35",
        background: body.background || "#f8f2e7",
      },
    },
    infopack: {
      intro: clean(body.infopackIntro, 1400),
      schedule: parsePipedLines(body.scheduleText, "time", "title"),
      sections: parsePipedLines(body.sectionsText, "title", "body"),
    },
    tables: appState.site.tables,
    updated_at: new Date().toISOString(),
  };
  const { error } = await appState.db.from("site_state").upsert(site);
  if (error) return toast(readableError(error));
  appState.site = mergeSite(site);
  renderAll();
  toast("Tresci i wyglad zapisane.");
}

async function saveParticipant(id) {
  if (!isAdmin()) return;
  const rowNode = $(`[data-row="${CSS.escape(id)}"]`);
  const get = (name) => $(`[name="${name}"]`, rowNode);
  const payload = {
    phone: clean(get("phone").value, 60),
    album_number: normalizeAlbum(get("album_number").value),
    dean_group: clean(get("dean_group").value, 80),
    paid_deposit: get("paid_deposit").checked,
    paid_installment1: get("paid_installment1").checked,
    paid_installment2: get("paid_installment2").checked,
    paid_transport: get("paid_transport").checked,
    manual_verified: get("manual_verified").checked,
    room_id: clean(get("room_id").value, 80),
    table_id: clean(get("table_id").value, 80),
    seat_no: clean(get("seat_no").value, 20),
    diet: get("diet").value,
    transport_mode: get("transport_mode").value,
    registration_status: clean(get("registration_status").value, 160),
    updated_at: new Date().toISOString(),
  };
  const { error } = await appState.db.from("participants").update(payload).eq("id", id);
  if (error) return toast(readableError(error));
  await loadAppData();
  renderAll();
  toast("Uczestnik zapisany.");
}

async function autoSeat() {
  if (!isAdmin()) return;
  const tables = flattenTables(appState.site.tables);
  const counts = new Map(tables.map((table) => [`${table.roomId}:${table.id}`, appState.participants.filter((p) => p.room_id === table.roomId && p.table_id === table.id).length]));
  const updates = [];
  for (const participant of appState.participants.filter((p) => !p.table_id)) {
    const table = tables.find((candidate) => (counts.get(`${candidate.roomId}:${candidate.id}`) || 0) < candidate.capacity);
    if (!table) break;
    const count = (counts.get(`${table.roomId}:${table.id}`) || 0) + 1;
    counts.set(`${table.roomId}:${table.id}`, count);
    updates.push({ id: participant.id, room_id: table.roomId, room_name: table.roomName, table_id: table.id, seat_no: String(count) });
  }
  for (const update of updates) {
    await appState.db.from("participants").update({ ...update, updated_at: new Date().toISOString() }).eq("id", update.id);
  }
  await loadAppData();
  renderAll();
  toast(`Auto usadzenie: ${updates.length} osob.`);
}

function exportJson() {
  download(`bal-lekarza-backup-${today()}.json`, JSON.stringify({
    version: cfg.appVersion,
    exportedAt: new Date().toISOString(),
    site: appState.site,
    participants: appState.participants,
  }, null, 2), "application/json");
}

function exportCsv() {
  const headers = ["name", "email", "phone", "album_number", "dean_group", "diet", "transport_mode", "paid_deposit", "paid_installment1", "paid_installment2", "paid_transport", "manual_verified", "room_id", "table_id", "seat_no", "registration_status"];
  const rows = appState.participants.map((p) => headers.map((key) => csvValue(p[key])).join(","));
  download(`uczestnicy-${today()}.csv`, [headers.join(","), ...rows].join("\n"), "text/csv;charset=utf-8");
}

function defaultSite() {
  return {
    settings: {
      eventName: "Bal Lekarza 2028",
      subtitle: "Konto uczestnika, platnosci i infopak",
      heroCopy: "Twoje miejsce, platnosci, dieta, transport i infopak w jednej eleganckiej stronie.",
      venueName: "Bialy Dom",
      venueAddress: "ul. Karola Darwina 50, 44-177 Paniowki",
      mapUrl: "https://maps.google.com/?q=Bia%C5%82y%20Dom%20Karola%20Darwina%2050%20Pani%C3%B3wki",
      organizedTransportInfo: "Informacje o transporcie zorganizowanym pojawia sie po zatwierdzeniu listy.",
      ownTransportInfo: "Transport wlasny: przy obiekcie dostepny jest parking. Liczba miejsc moze byc ograniczona.",
      seatingVisible: false,
      seatingLockedMessage: "Plan stolikow jest jeszcze w przygotowaniu.",
      theme: { primary: "#173d35", background: "#f8f2e7" },
    },
    infopack: {
      intro: "Infopak Bal Lekarza 2028. Wszystkie tresci administrator moze edytowac w panelu.",
      schedule: [
        { time: "19:00", title: "Rozpoczecie czesci oficjalnej" },
        { time: "19:45", title: "Danie glowne" },
        { time: "22:30", title: "Kolacja I" },
        { time: "00:00", title: "Kolacja II" },
        { time: "04:00", title: "Zakonczenie" },
      ],
      sections: [
        { title: "Dress code", body: "Elegancki wieczorowy charakter wydarzenia." },
        { title: "Diety", body: "Diete mozna oznaczyc w profilu uczestnika." },
        { title: "Transport", body: "Uczestnik wybiera transport zorganizowany, wlasny albo brak transportu." },
      ],
    },
    tables: [
      { roomId: "sala-glowna", roomName: "Sala glowna", tables: Array.from({ length: 20 }, (_, index) => ({ id: `S${index + 1}`, label: `Stol ${index + 1}`, capacity: 10 })) },
      { roomId: "sala-boczna", roomName: "Sala boczna", tables: Array.from({ length: 10 }, (_, index) => ({ id: `B${index + 1}`, label: `Stol B${index + 1}`, capacity: 10 })) },
    ],
  };
}

function mergeSite(row) {
  const defaults = defaultSite();
  return {
    settings: { ...defaults.settings, ...(row.settings || {}), theme: { ...defaults.settings.theme, ...(row.settings?.theme || {}) } },
    infopack: { ...defaults.infopack, ...(row.infopack || {}) },
    tables: Array.isArray(row.tables) && row.tables.length ? row.tables : defaults.tables,
    updated_at: row.updated_at,
  };
}

function normalizeRegistration(raw) {
  return {
    name: clean(raw.name, 160),
    email: String(raw.email || "").trim().toLowerCase(),
    password: String(raw.password || ""),
    phone: clean(raw.phone, 60),
    album_number: normalizeAlbum(raw.album_number),
    dean_group: clean(raw.dean_group, 80),
    diet: raw.diet || "standard",
    companion_name: clean(raw.companion_name, 160),
    companion_diet: raw.companion_diet || "standard",
    transport_mode: raw.transport_mode || "none",
    seating_preference: clean(raw.seating_preference, 500),
  };
}

function isAdmin() {
  return appState.profile?.role === "admin";
}

function paymentComplete(participant) {
  return Boolean(participant?.paid_deposit && participant?.paid_installment1 && participant?.paid_installment2);
}

function statusCard(ok, label, value) {
  return `<div class="status"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`;
}

function stat(value, label) {
  return `<div class="stat"><strong>${escapeHtml(String(value))}</strong><span>${escapeHtml(label)}</span></div>`;
}

function row(label, value) {
  return `<div class="summary-row"><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`;
}

function yesNo(value) {
  return `<span class="pill ${value ? "ok" : "no"}">${value ? "tak" : "nie"}</span>`;
}

function dietLabel(value) {
  return { standard: "Standard", gf: "Bezglutenowa", vegan: "Weganska" }[value] || value || "nie podano";
}

function transportLabel(value) {
  return { none: "Brak transportu", organized: "Transport zorganizowany", own: "Transport wlasny" }[value] || "nie podano";
}

function flattenTables(rooms = []) {
  return rooms.flatMap((room) => (room.tables || []).map((table) => ({ ...table, roomId: room.roomId, roomName: room.roomName })));
}

function searchable(participant, table = {}) {
  return [
    participant.name,
    participant.email,
    participant.album_number,
    participant.dean_group,
    participant.diet,
    participant.transport_mode,
    participant.registration_status,
    participant.table_id,
    participant.seat_no,
    table.label,
    table.roomName,
  ].filter(Boolean).join(" ").toLowerCase();
}

function seatLine(participant, admin) {
  const visibleName = admin || participant.id === appState.myParticipant?.id ? participant.name : "Zajete miejsce";
  return `<span>${escapeHtml(participant.seat_no || "-")}. ${escapeHtml(visibleName)} <em>${escapeHtml(dietLabel(participant.diet))}</em></span>`;
}

function adminCheck(name, label, checked) {
  return `<label class="check"><input name="${name}" type="checkbox" ${checked ? "checked" : ""}><span>${label}</span></label>`;
}

function option(value, label, current) {
  return `<option value="${escapeAttr(value)}" ${value === current ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function parsePipedLines(text, firstKey, secondKey) {
  return String(text || "").split(/\n+/).map((line) => {
    const [first, ...rest] = line.split("|");
    return { [firstKey]: clean(first, 120), [secondKey]: clean(rest.join("|"), 1200) };
  }).filter((item) => item[firstKey] || item[secondKey]);
}

function isCurrentSchedule(time) {
  const match = String(time || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return false;
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  const item = Number(match[1]) * 60 + Number(match[2]);
  return Math.abs(current - item) < 45;
}

function clean(value, max = 200) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeAlbum(value) {
  return String(value ?? "").trim().toUpperCase().replace(/[\s_-]+/g, "").slice(0, 40);
}

function readableError(error) {
  const message = error?.message || String(error || "Nieznany blad");
  if (/duplicate|unique/i.test(message)) return "Taki email albo numer albumu jest juz zapisany.";
  if (/invalid login/i.test(message)) return "Nieprawidlowy email albo haslo.";
  return message;
}

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.remove("hidden");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.add("hidden"), 4200);
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function csvValue(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
