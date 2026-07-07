const state = {
  token: localStorage.getItem("balToken") || "",
  app: null,
  publicSettings: null,
  activeView: "dashboard",
  activeRoom: "sala-dolna",
  logoPreviewUrl: "",
  heroPreviewUrl: "",
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

init();

function init() {
  bindAuth();
  bindNavigation();
  bindForms();
  bindAdmin();
  registerServiceWorker();
  loadPublicSettings().catch(() => {}).finally(() => {
    if (state.token) {
      loadApp().catch(() => {
        localStorage.removeItem("balToken");
        state.token = "";
        showAuth();
      });
    } else {
      showAuth();
    }
  });
}

function bindAuth() {
  $$("[data-auth-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      $$("[data-auth-tab]").forEach((item) => item.classList.toggle("active", item === button));
      $("#login-form").classList.toggle("hidden", button.dataset.authTab !== "login");
      $("#register-form").classList.toggle("hidden", button.dataset.authTab !== "register");
    });
  });

  $("#registration-type").addEventListener("change", renderRegistrationTypeFields);
  renderRegistrationTypeFields();

  $("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    const payload = await api("/api/auth/login", { method: "POST", body });
    state.token = payload.token;
    localStorage.setItem("balToken", state.token);
    state.app = payload;
    showApp();
    toast(isAdmin() ? state.app.settings?.adminWelcomeMessage || "Dobry wieczór, panel administratora czeka." : "Zalogowano. Wszystko jest pod ręką.");
  });

  $("#register-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (participantReadOnly()) return toast(limitMessage());
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form));
    body.transportMode = form.transportMode.value;
    body.transport = body.transportMode === "organized";
    await api("/api/auth/register", { method: "POST", body, publicRequest: true });
    form.reset();
    renderRegistrationTypeFields();
    $("[data-auth-tab='login']").click();
    toast("Konto utworzone. Organizator widzi zapis w panelu.");
  });
}

function bindNavigation() {
  $$("[data-view]").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });
  $("#logout-button").addEventListener("click", () => {
    localStorage.removeItem("balToken");
    state.token = "";
    state.app = null;
    showAuth();
  });
}

function bindForms() {
  $("#profile-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (participantReadOnly()) return toast(limitMessage());
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form));
    body.transportMode = form.transportMode.value;
    body.transport = body.transportMode === "organized";
    const result = await api("/api/me", { method: "PATCH", body });
    state.app.participant = result.participant;
    mergeParticipant(result.participant);
    renderDashboard();
    renderTravel();
    toast("Profil zapisany.");
  });

  $("#seat-search").addEventListener("input", () => renderCurrentRoom());
}

function bindAdmin() {
  $("#admin-search").addEventListener("input", renderAdminParticipants);
  $("#admin-filter").addEventListener("change", renderAdminParticipants);

  $("#participant-table-body").addEventListener("change", async (event) => {
    const target = event.target;
    const row = target.closest("[data-participant-id]");
    if (!row || !target.name) return;
    if (target.matches("[data-seat-action]")) return;
    const participantId = row.dataset.participantId;
    const value = target.type === "checkbox" ? target.checked : target.value;
    let body = { [target.name]: value };
    const refreshAssignment = target.matches("[data-seat-room], [data-seat-table], [data-seat-number]");
    const refreshRelation = ["registrationType", "linkedParticipantId", "deanGroup"].includes(target.name);
    if (target.matches("[data-seat-room]")) {
      body = { roomId: value, roomName: roomLabel(value), tableId: "", seatNo: "", side: "" };
    } else if (target.matches("[data-seat-table]")) {
      body = { tableId: value, seatNo: "", side: "" };
    } else if (target.matches("[data-seat-number]")) {
      const roomId = row.querySelector("[data-seat-room]")?.value || "";
      const tableId = row.querySelector("[data-seat-table]")?.value || "";
      const seatAction = row.querySelector("[data-seat-action]")?.value || "move";
      body = { seatNo: value, side: seatSideFor(roomId, tableId, value), seatAction };
    }
    const result = await api(`/api/admin/participants/${participantId}`, { method: "PATCH", body }).catch(() => {
      renderAdminParticipants();
      return null;
    });
    if (!result) return;
    mergeParticipant(result.participant);
    if (result.swappedParticipant) mergeParticipant(result.swappedParticipant);
    if (target.name === "name" || target.name === "email" || target.name === "albumNumber") renderAccountOptions();
    if (refreshAssignment || refreshRelation || result.swappedParticipant) renderAdminParticipants();
    renderAdminStats();
    renderSeating();
    renderDashboard();
    toast("Zapisano zmianę.");
  });

  $("#participant-table-body").addEventListener("click", (event) => {
    const button = event.target.closest("[data-jump-seat]");
    if (!button) return;
    state.activeRoom = button.dataset.room;
    switchView("seating");
    $("#seat-search").value = button.dataset.name || "";
    renderSeating();
  });

  $("#account-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    const result = await api("/api/admin/create-account", { method: "POST", body });
    mergeParticipant(result.participant);
    await loadApp(false);
    renderAdmin();
    toast("Dostęp osoby gotowy.");
  });

  $("#admin-account-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form));
    const result = await api("/api/admin/create-admin", { method: "POST", body });
    state.app.admin.users = result.users;
    form.reset();
    form.password.value = "Admin2028!A1";
    renderAdminStats();
    toast("Administrator dodany. Dobry wieczór dla ekipy dowodzenia.");
  });

  $("#message-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    const result = await api("/api/admin/message", { method: "POST", body });
    event.currentTarget.reset();
    await loadApp(false);
    renderDashboard();
    renderAdmin();
    toast(result.scheduled ? "Komunikat zaplanowany na później." : `Komunikat dodany dla ${result.count} osób.`);
  });

  $("#auto-seat-button").addEventListener("click", async () => {
    const result = await api("/api/admin/auto-seat", { method: "POST", body: { mode: "empty" } });
    state.app.participants = result.participants;
    renderAdmin();
    renderSeating();
    toast(`Auto-usadzenie gotowe: ${result.assigned} osób. Ręczne poprawki nadal działają.`);
  });

  $("#print-groups-button").addEventListener("click", printGroupedList);

  $("#table-room").addEventListener("change", renderTableColumnOptions);
  $("#seating-export-button").addEventListener("click", () => downloadFile("/api/admin/seating.csv", `uklad-siedzen-${new Date().toISOString().slice(0, 10)}.csv`));

  $("#table-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form));
    body.roomName = roomLabel(body.roomId);
    const result = await api("/api/admin/tables", { method: "POST", body });
    state.app.layouts = result.layouts;
    form.tableId.value = "";
    renderTableManager();
    renderAdminParticipants();
    renderSeating();
    toast(`Dodano ${result.table.label} w ${roomLabel(result.roomId)}.`);
  });

  $("#table-editor-list").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target.closest("[data-table-edit-form]");
    if (!form) return;
    const body = Object.fromEntries(new FormData(form));
    const result = await api(`/api/admin/tables/${encodeURIComponent(form.dataset.roomId)}/${encodeURIComponent(form.dataset.tableId)}`, { method: "PATCH", body });
    state.app.layouts = result.layouts;
    renderTableManager();
    renderAdminParticipants();
    renderSeating();
    toast(`Zapisano ${result.table.label}. Zaktualizowano ${result.updatedParticipants} przypisanych osób.`);
  });

  $("#asset-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const file = form.file.files[0];
    if (!file) return toast("Wybierz plik do wgrania.");
    const dataUrl = await fileToDataUrl(file, 3_000_000, "Plik jest za duży. W tym prototypie wybierz materiał do 3 MB.");
    if (!dataUrl) return;
    const raw = Object.fromEntries(new FormData(form));
    const result = await api("/api/admin/assets", {
      method: "POST",
      body: {
        name: raw.name || file.name,
        category: raw.category,
        size: file.size,
        dataUrl,
      },
    });
    state.app.assets = result.assets;
    form.reset();
    renderAssets();
    toast("Materiał wgrany do biblioteki.");
  });

  $("#asset-list").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-asset]");
    if (!button) return;
    const result = await api(`/api/admin/assets/${button.dataset.deleteAsset}`, { method: "DELETE" });
    state.app.assets = result.assets;
    renderAssets();
    toast("Materiał usunięty.");
  });

  ["logoImage", "heroImage", "clearLogoImage", "clearHeroImage"].forEach((fieldName) => {
    const field = $("#settings-form").elements[fieldName];
    if (field) field.addEventListener("change", () => {
      if (fieldName === "logoImage") setMediaPreviewUrl("logoPreviewUrl", field.files?.[0]);
      if (fieldName === "heroImage") setMediaPreviewUrl("heroPreviewUrl", field.files?.[0]);
      renderMediaUploadStatus();
      renderCropControls();
    });
  });

  ["logoCropX", "logoCropY", "logoZoom", "heroCropX", "heroCropY", "heroZoom"].forEach((fieldName) => {
    const field = $("#settings-form").elements[fieldName];
    if (field) field.addEventListener("input", renderCropControls);
  });

  const settingsForm = $("#settings-form");
  settingsForm.addEventListener("input", markSettingsDirty);
  settingsForm.addEventListener("change", markSettingsDirty);

  settingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const raw = Object.fromEntries(new FormData(form));
    const settingsBody = {
      appName: raw.appName,
      eventName: raw.eventName,
      subtitle: raw.subtitle,
      eventDate: raw.eventDate,
      venueName: raw.venueName,
      venueAddress: raw.venueAddress,
      mapUrl: raw.mapUrl,
      organizedTransportInfo: raw.organizedTransportInfo,
      ownTransportInfo: raw.ownTransportInfo,
      siteMode: raw.siteMode,
      comingSoonTitle: raw.comingSoonTitle,
      comingSoonMessage: raw.comingSoonMessage,
      maintenanceTitle: raw.maintenanceTitle,
      maintenanceMessage: raw.maintenanceMessage,
      limitGuardEnabled: raw.limitGuardEnabled,
      limitForceReadOnly: raw.limitForceReadOnly,
      limitDailyRequestLimit: raw.limitDailyRequestLimit,
      limitDailyWriteLimit: raw.limitDailyWriteLimit,
      limitReadOnlyAtPercent: raw.limitReadOnlyAtPercent,
      limitGuardMessage: raw.limitGuardMessage,
      seatingVisible: raw.seatingVisible === "true",
      seatingLockedMessage: raw.seatingLockedMessage,
      logoText: raw.logoText,
      logoSubtext: raw.logoSubtext,
      authEyebrow: raw.authEyebrow,
      heroTagline: raw.heroTagline,
      heroCopy: raw.heroCopy,
      adminWelcomeMessage: raw.adminWelcomeMessage,
      companionSignupDeadline: raw.companionSignupDeadline,
      logoCropX: raw.logoCropX,
      logoCropY: raw.logoCropY,
      logoZoom: raw.logoZoom,
      heroCropX: raw.heroCropX,
      heroCropY: raw.heroCropY,
      heroZoom: raw.heroZoom,
      rodoText: raw.rodoText,
      termsText: raw.termsText,
      interfaceTexts: parseKeyValueLines(raw.interfaceTexts),
      statusTexts: parseKeyValueLines(raw.statusTexts),
      nightMode: raw.nightMode,
      nightStart: raw.nightStart,
      nightEnd: raw.nightEnd,
      theme: {
        primary: raw.primary,
        background: raw.background,
        gold: raw.gold,
        coral: raw.coral,
        sage: raw.sage,
        cream: raw.cream,
        paper: raw.paper,
        mist: raw.mist,
        ink: raw.ink,
        muted: raw.muted,
      },
    };
    if (form.clearLogoImage.checked) {
      settingsBody.logoImageData = "";
      settingsBody.logoImageName = "";
    } else if (form.logoImage.files[0]) {
      const logoData = await fileToDataUrl(form.logoImage.files[0], 1_200_000, "Logo jest za duże. Użyj pliku do 1.2 MB, najlepiej 1024 x 1024 px.");
      if (!logoData) return;
      settingsBody.logoImageData = logoData;
      settingsBody.logoImageName = form.logoImage.files[0].name;
    }
    if (form.clearHeroImage.checked) {
      settingsBody.heroImageData = "";
      settingsBody.heroImageName = "";
    } else if (form.heroImage.files[0]) {
      const heroData = await fileToDataUrl(form.heroImage.files[0], 2_400_000, "Zdjęcie tła jest za duże. Użyj pliku do 2.4 MB, najlepiej 2400 x 1400 px.");
      if (!heroData) return;
      settingsBody.heroImageData = heroData;
      settingsBody.heroImageName = form.heroImage.files[0].name;
    }
    const body = {
      settings: settingsBody,
      infopack: {
        intro: raw.infopackIntro,
        schedule: parsePipeLines(raw.scheduleText, ["time", "title"]),
        sections: parsePipeLines(raw.sectionsText, ["title", "body"]),
      },
    };
    setSettingsSaveState("saving");
    const result = await api("/api/admin/settings", { method: "PATCH", body }).catch(() => {
      setSettingsSaveState("dirty");
      return null;
    });
    if (!result) return;
    state.app.settings = result.settings;
    state.app.infopack = result.infopack;
    if (result.limits) state.app.limits = result.limits;
    clearMediaPreviewUrls();
    renderAll();
    form.logoImage.value = "";
    form.heroImage.value = "";
    form.clearLogoImage.checked = false;
    form.clearHeroImage.checked = false;
    renderMediaUploadStatus();
    renderCropControls();
    setSettingsSaveState("clean");
    toast("Wszystkie zmiany zapisane.");
  });

  $("#export-button").addEventListener("click", () => downloadFile("/api/admin/export.xlsx", `bal-backup-${new Date().toISOString().slice(0, 10)}.xlsx`));
  $("#backup-button").addEventListener("click", async () => {
    const result = await api("/api/admin/backup", { method: "POST", body: {} });
    await loadBackups();
    toast(`Kopia zapisana: ${result.filename}`);
  });
  $("#import-button").addEventListener("click", async () => {
    const text = $("#csv-import").value.trim();
    if (!text) return toast("Wklej najpierw CSV.");
    const result = await apiText("/api/admin/import-csv", { method: "POST", body: text });
    await loadApp(false);
    renderAdmin();
    toast(`Zaimportowano zmiany: ${result.updated}.`);
  });

  $("#bank-import-button").addEventListener("click", async () => {
    const csv = $("#bank-import").value.trim();
    if (!csv) return toast("Wklej najpierw CSV z banku.");
    const result = await api("/api/admin/import-bank-csv", {
      method: "POST",
      body: {
        csv,
        depositAmount: $("#bank-amount-deposit").value,
        installment1Amount: $("#bank-amount-installment1").value,
        installment2Amount: $("#bank-amount-installment2").value,
        transportAmount: $("#bank-amount-transport").value,
      },
    });
    state.app.participants = result.participants;
    state.app.paymentImports = result.paymentImports;
    renderBankImportResult(result);
    renderAdminStats();
    renderAdminParticipants();
    renderDashboard();
    toast(`Dopasowano ${result.matched} wpływów, zmieniono ${result.changedFields} pól.`);
  });
}

async function loadApp(render = true) {
  state.app = await api("/api/app");
  if (render) showApp();
}

async function loadPublicSettings() {
  const payload = await api("/api/public-settings", { publicRequest: true });
  state.publicSettings = payload;
  applyTheme(payload.settings || {});
  renderPublicSettings();
}

function showAuth() {
  $("#auth-screen").classList.remove("hidden");
  $("#main-app").classList.add("hidden");
  renderPublicSettings();
  renderRegistrationTypeFields();
}

function showApp() {
  $("#auth-screen").classList.add("hidden");
  $("#main-app").classList.remove("hidden");
  renderAll();
}

function renderAll() {
  applyTheme(state.app.settings || {});
  renderSettingsText();
  renderAdminVisibility();
  renderDashboard();
  renderSeating();
  renderInfopack();
  renderTravel();
  if (isAdmin()) renderAdmin();
  renderLimitMode();
}

function renderSettingsText() {
  const settings = state.app.settings || {};
  $$("[data-setting]").forEach((element) => {
    const key = element.dataset.setting;
    if (settings[key]) element.textContent = settings[key];
  });
  $$(".brand-mark").forEach((element) => {
    if (settings.logoImageData) {
      element.classList.add("has-image");
      element.innerHTML = `<img src="${settings.logoImageData}" alt="">`;
      applyMediaCrop(element.querySelector("img"), settings, "logo");
    } else {
      element.classList.remove("has-image");
      element.textContent = settings.logoText || "BL";
    }
    element.title = settings.logoSubtext || settings.appName || "Bal";
  });
  $$(".hero-image").forEach((image) => {
    image.src = settings.heroImageData || "/assets/hero-texture.png";
    applyMediaCrop(image, settings, "hero");
  });
  document.title = `${settings.eventName || "Bal"} - aplikacja absolwenta`;
  applyInterfaceTexts(settings.interfaceTexts || {});
  renderSiteMode(settings);
}

function renderPublicSettings() {
  const settings = state.publicSettings?.settings || {};
  if (!Object.keys(settings).length) return;
  $$("[data-setting]").forEach((element) => {
    const key = element.dataset.setting;
    if (settings[key]) element.textContent = settings[key];
  });
  $$(".brand-mark").forEach((element) => {
    if (settings.logoImageData) {
      element.classList.add("has-image");
      element.innerHTML = `<img src="${settings.logoImageData}" alt="">`;
      applyMediaCrop(element.querySelector("img"), settings, "logo");
    } else {
      element.classList.remove("has-image");
      element.textContent = settings.logoText || "BL";
    }
    element.title = settings.logoSubtext || settings.appName || "Bal";
  });
  $$(".hero-image").forEach((image) => {
    image.src = settings.heroImageData || "/assets/hero-texture.png";
    applyMediaCrop(image, settings, "hero");
  });
  $("#terms-copy").textContent = [settings.termsText, settings.rodoText].filter(Boolean).join(" ") || $("#terms-copy").textContent;
  applyInterfaceTexts(settings.interfaceTexts || {});
  renderSiteMode(settings);
  renderLimitMode();
}

function renderSiteMode(settings = {}) {
  const banner = $("#site-mode-banner");
  const registerForm = $("#register-form");
  if (!banner || !registerForm) return;
  const mode = settings.siteMode || "open";
  const blocked = mode === "comingSoon" || mode === "maintenance";
  banner.classList.toggle("hidden", !blocked);
  registerForm.classList.toggle("is-disabled", blocked);
  $$("input, select, textarea, button", registerForm).forEach((field) => {
    field.disabled = blocked;
  });
  if (!blocked) return;
  const title = mode === "maintenance" ? settings.maintenanceTitle : settings.comingSoonTitle;
  const message = mode === "maintenance" ? settings.maintenanceMessage : settings.comingSoonMessage;
  banner.dataset.mode = mode;
  banner.innerHTML = `
    <strong>${escapeHtml(title || (mode === "maintenance" ? "Przerwa techniczna" : "Zapisy wkrótce"))}</strong>
    <span>${escapeHtml(message || "Administrator nadal może zalogować się przez formularz logowania.")}</span>
  `;
}

function currentLimits() {
  return state.app?.limits || state.publicSettings?.limits || {};
}

function participantReadOnly() {
  return !isAdmin() && Boolean(currentLimits().readOnly);
}

function limitMessage() {
  return currentLimits().message || "Aplikacja działa teraz w trybie podglądu. Spróbuj ponownie później.";
}

function renderLimitMode() {
  const limits = currentLimits();
  const readOnly = Boolean(limits.readOnly);
  $$("[data-limit-banner]").forEach((banner) => {
    banner.classList.toggle("hidden", !readOnly);
    if (readOnly) {
      banner.innerHTML = `
        <strong>Tryb podglądu</strong>
        <span>${escapeHtml(limitMessage())}</span>
      `;
    }
  });
  const protectedSelectors = ["#profile-form"];
  if (!isAdmin()) protectedSelectors.push("#register-form");
  protectedSelectors.forEach((selector) => {
    const form = $(selector);
    if (!form) return;
    form.classList.toggle("is-disabled", readOnly);
    $$("input, select, textarea, button", form).forEach((field) => {
      const settings = state.publicSettings?.settings || state.app?.settings || {};
      const siteBlocked = selector === "#register-form" && ["comingSoon", "maintenance"].includes(settings.siteMode);
      field.disabled = readOnly || siteBlocked;
    });
  });
}

function applyInterfaceTexts(texts = {}) {
  const setText = (key, selector) => {
    if (texts[key]) $$(selector).forEach((element) => {
      element.textContent = texts[key];
    });
  };
  const setPlaceholder = (key, selector) => {
    if (texts[key] && $(selector)) $(selector).placeholder = texts[key];
  };
  setText("loginTab", "[data-auth-tab='login']");
  setText("registerTab", "[data-auth-tab='register']");
  setText("loginButton", "#login-form .primary-action");
  setText("registerButton", "#register-form .primary-action");
  setText("dashboardNav", "[data-view='dashboard']");
  setText("seatingNav", "[data-view='seating']");
  setText("infopackNav", "[data-view='infopack']");
  setText("travelNav", "[data-view='travel']");
  setText("adminNav", "[data-view='admin']");
  setText("logoutButton", "#logout-button");
  setPlaceholder("seatSearchPlaceholder", "#seat-search");
  setPlaceholder("adminSearchPlaceholder", "#admin-search");
}

function statusText(key, fallback = "") {
  return state.app?.settings?.statusTexts?.[key] || state.publicSettings?.settings?.statusTexts?.[key] || fallback;
}

function renderRegistrationTypeFields() {
  const type = $("#registration-type")?.value || "student";
  $$(".student-registration-fields").forEach((element) => element.classList.toggle("hidden", type === "companion"));
  const settings = state.app?.settings || state.publicSettings?.settings || {};
  const siteBlocked = ["comingSoon", "maintenance"].includes(settings.siteMode);
  const deadline = settings.companionSignupDeadline;
  const deadlineTime = deadline ? new Date(deadline).getTime() : NaN;
  const hasDeadline = Number.isFinite(deadlineTime);
  const closed = hasDeadline ? deadlineTime < Date.now() : false;
  const note = $("#companion-deadline-note");
  if (note) {
    note.textContent = hasDeadline
      ? closed
        ? "Zapisy gości absolwentów są już zamknięte."
        : `Gościa absolwenta dopisuje zapraszający absolwent. Termin: ${formatDate(deadline)}.`
      : "Gościa absolwenta dopisuje zapraszający absolwent.";
  }
  ["companionName", "companionEmail", "companionDiet"].forEach((name) => {
    const field = $(`#register-form [name='${name}']`);
    if (field) field.disabled = closed || siteBlocked;
  });
}

function renderAdminVisibility() {
  $$(".admin-only").forEach((element) => element.classList.toggle("hidden", !isAdmin()));
  if (!isAdmin() && state.activeView === "admin") switchView("dashboard");
}

function switchView(view) {
  state.activeView = view;
  $$(".view").forEach((element) => element.classList.toggle("active", element.id === `view-${view}`));
  $$("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  if (view === "seating") renderSeating();
  if (view === "admin" && isAdmin()) renderAdmin();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderDashboard() {
  const participant = state.app.participant;
  const user = state.app.user;
  const settings = state.app.settings || {};
  const firstName = (participant?.name || user.displayName || "Cześć").split(" ")[0];
  $("#welcome-title").textContent = `Cześć, ${firstName}`;
  $("#welcome-copy").textContent = participant
    ? settings.heroCopy || "Tu widzisz status balu, swoje miejsce, dietę, transport i komunikaty od organizatorów."
    : "Jesteś w panelu administratora. Możesz przejść do ukrytej części i zarządzać listą absolwentów.";

  $("#status-strip").innerHTML = participant
    ? [
        statusPill(paymentComplete(participant), statusText("paymentCompleteOk", "Wpłaty kompletne"), statusText("paymentCompleteBad", "Wpłaty do uzupełnienia")),
        statusPill(transportModeOf(participant) !== "none", transportLabel(participant), statusText("transportNone", "Bez transportu"), "warn"),
        statusPill(
          seatingVisible() && Boolean(participant.tableId && participant.seatNo),
          statusText("seatAssigned", "Miejsce przydzielone"),
          seatingVisible() ? statusText("seatPending", "Miejsce oczekuje") : statusText("seatingPreparing", "Plan stołów w przygotowaniu"),
          "warn"
        ),
      ].join("")
    : `<span class="status-pill ok">${escapeHtml(statusText("adminPanel", "Panel administratora"))}</span>`;

  $("#payment-summary").innerHTML = participant
    ? [
        summaryRow("Zaliczka", participant.paidDeposit ? statusText("paymentPaid", "Opłacona") : statusText("paymentPending", "Do potwierdzenia"), participant.paidDeposit ? "ok" : "stop"),
        summaryRow("Wpłata 1", participant.paidInstallment1 ? statusText("paymentPaid", "Opłacona") : statusText("paymentPending", "Do potwierdzenia"), participant.paidInstallment1 ? "ok" : "stop"),
        summaryRow("Wpłata 2", participant.paidInstallment2 ? statusText("paymentPaid", "Opłacona") : statusText("paymentPending", "Do potwierdzenia"), participant.paidInstallment2 ? "ok" : "stop"),
        summaryRow("Bal razem", paymentComplete(participant) ? statusText("paymentAllComplete", "Komplet") : statusText("paymentPartialMissing", "Brakuje części wpłat"), paymentComplete(participant) ? "ok" : "warn"),
        summaryRow("Transport", transportPaymentLabel(participant), transportModeOf(participant) === "organized" ? "warn" : ""),
        summaryRow("Status", statusLabel(participant.registrationStatus), participant.registrationStatus === "pending" ? "warn" : "ok"),
      ].join("")
    : `<p class="muted-copy">Przejdź do panelu admina, żeby zarządzać listą.</p>`;

  $("#seat-summary").innerHTML = participant ? seatSummary(participant) : `<p>Administrator nie ma przypisanego miejsca.</p>`;
  renderProfileForm(participant);
  renderNotifications();
}

function renderProfileForm(participant) {
  const form = $("#profile-form");
  if (!participant) {
    form.classList.add("hidden");
    return;
  }
  form.classList.remove("hidden");
  form.phone.value = participant.phone || "";
  if (form.albumNumber) form.albumNumber.value = participant.albumNumber || "";
  form.diet.value = participant.diet || "standard";
  form.deanGroup.value = participant.deanGroup || "";
  form.transportMode.value = transportModeOf(participant);
  form.seatingPreference.value = participant.seatingPreference || "";
}

function renderNotifications() {
  const items = state.app.notifications || [];
  $("#notifications-list").innerHTML = items.length
    ? items
        .slice(0, 5)
        .map((item) => `<div class="notification-item"><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.message)}</p></div><span>${formatDate(item.createdAt)}</span></div>`)
        .join("")
    : `<div class="notification-item"><div><strong>Brak nowych komunikatów</strong><p>Gdy admin wyśle wiadomość, pojawi się tutaj.</p></div></div>`;
}

function renderSeating() {
  const locked = !isAdmin() && !seatingVisible();
  $("#room-tabs").classList.toggle("hidden", locked);
  $(".seat-legend").classList.toggle("hidden", locked);
  if (locked) {
    $("#seat-details").innerHTML = `
      <p class="eyebrow">${escapeHtml(statusText("seatingPreparingShort", "Plan w przygotowaniu"))}</p>
      <h3>${escapeHtml(statusText("tablesNotPublished", "Stoły nie są jeszcze opublikowane"))}</h3>
      <p>${escapeHtml(state.app.settings?.seatingLockedMessage || statusText("seatingLockFallback", "Plan stołów pojawi się po zatwierdzeniu przez organizatorów."))}</p>
    `;
    $("#room-stage").innerHTML = `
      <div class="locked-seating">
        <span class="brand-mark compact">${escapeHtml(state.app.settings?.logoText || "BL")}</span>
        <h3>${escapeHtml(statusText("tablesPreviewHidden", "Podgląd stołów jest chwilowo ukryty"))}</h3>
        <p>${escapeHtml(state.app.settings?.seatingLockedMessage || statusText("seatingLockFallback", "Plan stołów pojawi się po zatwierdzeniu przez organizatorów."))}</p>
      </div>
    `;
    return;
  }
  const rooms = Object.keys(state.app.layouts || {});
  if (!rooms.includes(state.activeRoom)) state.activeRoom = rooms[0] || "";
  $("#room-tabs").innerHTML = rooms
    .map((roomId) => `<button class="tab-pill ${roomId === state.activeRoom ? "active" : ""}" type="button" data-room="${roomId}">${roomLabel(roomId)}</button>`)
    .join("");
  $$("#room-tabs [data-room]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeRoom = button.dataset.room;
      renderSeating();
    });
  });
  renderCurrentRoom();
}

function renderCurrentRoom() {
  const stage = $("#room-stage");
  const layout = state.app.layouts?.[state.activeRoom] || [];
  const query = ($("#seat-search").value || "").trim().toLowerCase();
  const rows = layout
    .map((column) => {
      const tables = column.map((table) => tableHtml(table, query)).join("");
      return `<div class="tables-column">${tables}</div>`;
    })
    .join("");
  stage.innerHTML = `<div class="room-columns">${rows}</div>`;
  $$(".seat", stage).forEach((button) => {
    button.addEventListener("click", () => {
      $$(".seat", stage).forEach((item) => item.classList.remove("selected"));
      button.classList.add("selected");
      showSeatDetails(button.dataset.participantId, button.dataset.table, button.dataset.seat, button.dataset.side);
    });
  });
}

function tableHtml(table, query) {
  const left = Array.from({ length: table.left }, (_, index) => seatHtml(table.id, index + 1, "L", query)).join("");
  const right = Array.from({ length: table.right }, (_, index) => seatHtml(table.id, table.left + index + 1, "P", query)).join("");
  return `
    <article class="table-card">
      <div class="table-label">${escapeHtml(table.label || table.id)}</div>
      <div class="table-structure">
        <div class="seats-column">${left}</div>
        <div class="table-spine"></div>
        <div class="seats-column">${right}</div>
      </div>
    </article>
  `;
}

function seatHtml(tableId, seatNo, side, query) {
  const participant = findSeat(state.activeRoom, tableId, seatNo);
  const empty = !participant || participant.emptySeat || participant.diet === "x";
  const searchable = `${participant?.name || ""} ${roomLabel(state.activeRoom)} ${tableId} ${seatNo}`.toLowerCase();
  const highlighted = query && searchable.includes(query);
  const dietClass = participant?.diet === "gf" ? "diet-gf" : participant?.diet === "vegan" ? "diet-vegan" : "";
  const classes = ["seat", empty ? "empty" : "occupied", dietClass, highlighted ? "highlighted" : ""].filter(Boolean).join(" ");
  const label = empty ? "X" : seatNo;
  return `<button class="${classes}" type="button" data-participant-id="${participant?.id || ""}" data-table="${escapeHtml(tableId)}" data-seat="${seatNo}" data-side="${side}" title="${escapeHtml(participant?.name || "Miejsce puste")}">${label}</button>`;
}

function showSeatDetails(participantId, tableId, seatNo, side) {
  const participant = state.app.participants.find((item) => item.id === participantId);
  if (!participant || participant.emptySeat) {
    $("#seat-details").innerHTML = `<p class="eyebrow">Miejsce puste</p><h3>${escapeHtml(tableId)} / ${seatNo}</h3><p>To miejsce jest oznaczone jako wolne albo wyłączone z planu.</p>`;
    return;
  }
  const canSeePrivate = isAdmin() || participant.id === state.app.participant?.id;
  $("#seat-details").innerHTML = `
    <p class="eyebrow">${escapeHtml(roomLabel(participant.roomId))}</p>
    <h3>${escapeHtml(participant.name)}</h3>
    <p>${escapeHtml(participant.tableId)} - miejsce ${escapeHtml(participant.seatNo)} (${escapeHtml(side || participant.side || "")})</p>
    <div class="summary-list">
      ${summaryRow("Typ", registrationTypeLabel(participant), "")}
      ${participant.deanGroup ? summaryRow("Grupa", participant.deanGroup, "ok") : ""}
      ${linkedParticipant(participant) ? summaryRow("Para", linkedParticipant(participant).name, "warn") : ""}
      ${summaryRow("Dieta", dietLabel(participant.diet), "ok")}
      ${canSeePrivate ? summaryRow("Zaliczka", participant.paidDeposit ? statusText("paymentPaid", "Opłacona") : statusText("paymentDue", "Do opłacenia"), participant.paidDeposit ? "ok" : "stop") : ""}
      ${canSeePrivate ? summaryRow("Wpłata 1", participant.paidInstallment1 ? statusText("paymentPaid", "Opłacona") : statusText("paymentDue", "Do opłacenia"), participant.paidInstallment1 ? "ok" : "stop") : ""}
      ${canSeePrivate ? summaryRow("Wpłata 2", participant.paidInstallment2 ? statusText("paymentPaid", "Opłacona") : statusText("paymentDue", "Do opłacenia"), participant.paidInstallment2 ? "ok" : "stop") : ""}
      ${canSeePrivate ? summaryRow("Transport", transportLabel(participant), transportModeOf(participant) === "organized" ? "warn" : "") : ""}
    </div>
  `;
}

function renderInfopack() {
  const infopack = state.app.infopack || {};
  const schedule = infopack.schedule || [];
  const scheduleState = scheduleTimelineState(schedule, state.app.settings?.eventDate);
  $("#infopack-intro").textContent = infopack.intro || "";
  $("#schedule-list").innerHTML = schedule
    .map((item, index) => {
      const status = scheduleState[index] || { className: "planned", label: "W planie" };
      return `
        <div class="timeline-item ${status.className}">
          <span class="timeline-time">${escapeHtml(item.time)}</span>
          <span class="timeline-title">${escapeHtml(item.title)}</span>
          <span class="timeline-status">${escapeHtml(status.label)}</span>
        </div>
      `;
    })
    .join("");
  $("#infopack-sections").innerHTML = (infopack.sections || [])
    .map((section) => `<article class="info-card"><h3>${escapeHtml(section.title)}</h3><p>${escapeHtml(section.body)}</p></article>`)
    .join("");
}

function renderTravel() {
  const settings = state.app.settings || {};
  $("#map-link").href = settings.mapUrl || "https://maps.google.com";
  $("#transport-info").textContent = settings.organizedTransportInfo || "";
  $("#own-transport-info").textContent = settings.ownTransportInfo || "";
  const participant = state.app.participant;
  $("#my-transport-status").innerHTML = participant
    ? [
        summaryRow("Tryb dojazdu", transportLabel(participant), transportModeOf(participant) !== "none" ? "ok" : ""),
        transportModeOf(participant) === "organized" ? summaryRow("Płatność", participant.paidTransport ? statusText("paymentPaid", "Opłacona") : statusText("paymentPending", "Do potwierdzenia"), participant.paidTransport ? "ok" : "warn") : "",
        participant.transportInfo ? summaryRow("Szczegóły", participant.transportInfo, "ok") : "",
      ].join("")
    : `<div class="summary-row"><strong>Admin</strong><span>Listę transportu edytujesz w panelu administratora.</span></div>`;
}

function renderAdmin() {
  if (!isAdmin()) return;
  $("#admin-welcome").textContent = state.app.settings?.adminWelcomeMessage || "Dobry wieczór. Panel administratora jest gotowy.";
  renderAdminStats();
  renderAdminParticipants();
  renderAccountOptions();
  renderScheduledNotifications();
  renderSettingsForm();
  renderMediaUploadStatus();
  renderCropControls();
  renderTableManager();
  renderAssets();
  loadBackups();
}

function renderAdminStats() {
  const participants = state.app.participants || [];
  const people = participants.filter((item) => !item.emptySeat);
  const seats = participants.filter((item) => item.roomId !== "oczekujace");
  const occupiedSeats = seats.filter((item) => !item.emptySeat);
  const pending = people.filter((item) => item.registrationStatus === "pending");
  const manualVerified = people.filter((item) => item.manualVerified);
  const paidDeposit = people.filter((item) => item.paidDeposit);
  const paidInstallment1 = people.filter((item) => item.paidInstallment1);
  const paidInstallment2 = people.filter((item) => item.paidInstallment2);
  const paidBall = people.filter((item) => paymentComplete(item));
  const transport = people.filter((item) => transportModeOf(item) === "organized");
  const ownTransport = people.filter((item) => transportModeOf(item) === "own");
  const transportPaid = people.filter((item) => transportModeOf(item) === "organized" && item.paidTransport);
  const vegan = people.filter((item) => item.diet === "vegan");
  const glutenFree = people.filter((item) => item.diet === "gf");
  const companions = people.filter((item) => registrationTypeOf(item) === "companion");
  const students = people.filter((item) => registrationTypeOf(item) !== "companion");
  const paired = people.filter((item) => item.linkedParticipantId);
  const unpairedCompanions = companions.filter((item) => !item.linkedParticipantId);
  const deanGroups = new Set(students.map((item) => item.deanGroup).filter(Boolean));
  const accounts = (state.app.admin?.users || []).filter((item) => item.role === "student");
  const roomSummary = roomStats(occupiedSeats);
  const limits = state.app.limits || {};

  $("#admin-stats").innerHTML = [
    statCard(people.length, "Wszystkich osób", `${students.length} absolwentów / ${companions.length} gości`),
    statCard(`${paired.length}/${people.length}`, "Spięte pary", `${unpairedCompanions.length} gości bez absolwenta`),
    statCard(deanGroups.size, "Grupy dziekańskie", "uzupełnione w zapisach"),
    statCard(`${paidDeposit.length}/${people.length}`, "Zaliczka", `${people.length - paidDeposit.length} do sprawdzenia`),
    statCard(`${paidInstallment1.length}/${people.length}`, "Wpłata 1", `${people.length - paidInstallment1.length} do sprawdzenia`),
    statCard(`${paidInstallment2.length}/${people.length}`, "Wpłata 2", `${people.length - paidInstallment2.length} do sprawdzenia`),
    statCard(`${paidBall.length}/${people.length}`, "Komplet wpłat", `${percent(paidBall.length, people.length)} potwierdzone`),
    statCard(`${manualVerified.length}/${people.length}`, "Weryfikacja ręczna", `${people.length - manualVerified.length} bez ręcznego potwierdzenia`),
    statCard(pending.length, "Nowe zapisy", "z rejestracji online"),
    statCard(transport.length, "Transport zorg.", `${transportPaid.length} opłacone`),
    statCard(ownTransport.length, "Transport własny", "zadeklarowane dojazdy"),
    statCard(vegan.length + glutenFree.length, "Diety specjalne", `${vegan.length} vegan / ${glutenFree.length} bez glutenu`),
    statCard(`${occupiedSeats.length}/${seats.length}`, "Miejsca zajęte", roomSummary),
    statCard(accounts.length, "Konta użytkowników", "aktywne logowania uczestników"),
    statCard(`${limits.requestsToday ?? 0}/${limits.dailyRequestLimit ?? "-"}`, "API dzisiaj", `${limits.requestPercent ?? 0}% / podgląd od ${limits.readOnlyAtPercent ?? "-"}%`),
    statCard(`${limits.writesToday ?? 0}/${limits.dailyWriteLimit ?? "-"}`, "Zapisy dzisiaj", `${limits.writePercent ?? 0}% wykorzystane`),
    statCard(limits.readOnly ? "Podgląd" : "OK", "Tryb limitów", limits.reason || "uczestnicy mogą zapisywać"),
  ].join("");
}

function roomStats(participants) {
  const counts = participants.reduce((acc, item) => {
    const label = roomLabel(item.roomId);
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts)
    .map(([room, count]) => `${room}: ${count}`)
    .join(" / ");
}

function statCard(value, label, note) {
  return `<div class="stat-card"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span><em>${escapeHtml(note)}</em></div>`;
}

function percent(value, total) {
  if (!total) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

function paymentComplete(participant) {
  return Boolean(participant?.paidDeposit && participant?.paidInstallment1 && participant?.paidInstallment2);
}

function renderAdminParticipants() {
  const query = ($("#admin-search").value || "").trim().toLowerCase();
  const filter = $("#admin-filter").value;
  const participants = state.app.participants
    .filter((item) => !item.emptySeat || filter === "all")
    .filter((item) => {
      if (filter === "unpaid") return !paymentComplete(item) && !item.emptySeat;
      if (filter === "students") return registrationTypeOf(item) !== "companion";
      if (filter === "companions") return registrationTypeOf(item) === "companion";
      if (filter === "unpaired") return registrationTypeOf(item) === "companion" && !item.linkedParticipantId;
      if (filter === "transport") return transportModeOf(item) === "organized";
      if (filter === "transport-own") return transportModeOf(item) === "own";
      if (filter === "registered") return item.registrationStatus === "pending";
      return true;
    })
    .filter((item) => `${item.name} ${item.email} ${item.albumNumber || ""} ${item.roomName} ${item.tableId} ${item.deanGroup || ""} ${linkedParticipant(item)?.name || ""}`.toLowerCase().includes(query))
    .slice(0, 1000);

  $("#participant-table-body").innerHTML = participants
    .map((participant) => {
      const jump = participant.roomId?.startsWith("sala") || participant.roomId === "namiot"
        ? `<button class="mini-button" type="button" data-jump-seat data-room="${participant.roomId}" data-name="${escapeAttr(participant.name)}">Mapa</button>`
        : "";
      return `
        <tr data-participant-id="${participant.id}">
          <td>
            <input name="name" value="${escapeAttr(participant.name)}">
            <input name="email" type="email" value="${escapeAttr(participant.email || "")}" placeholder="email">
            <input name="albumNumber" value="${escapeAttr(participant.albumNumber || "")}" placeholder="numer albumu">
          </td>
          <td>
            <div class="relation-grid">
              <select name="registrationType">
                ${option("student", "Absolwent", registrationTypeOf(participant))}
                ${option("companion", "Gość absolwenta", registrationTypeOf(participant))}
              </select>
              <input name="deanGroup" value="${escapeAttr(participant.deanGroup || "")}" placeholder="grupa dziekańska">
              <select name="linkedParticipantId">
                ${linkedParticipantOptions(participant)}
              </select>
              ${pairHint(participant)}
            </div>
          </td>
          <td>
            <div class="assignment-grid">
              <select name="roomId" data-seat-room>
                ${roomOptions(participant.roomId)}
              </select>
              <select name="tableId" data-seat-table>
                ${tableOptions(participant.roomId, participant.tableId)}
              </select>
              <select name="seatNo" data-seat-number>
                ${seatOptions(participant.roomId, participant.tableId, participant.seatNo, participant)}
              </select>
              <select name="seatAction" data-seat-action>
                <option value="move">Przenieś na wolne</option>
                <option value="swap">Zamień, gdy zajęte</option>
              </select>
            </div>
          </td>
          <td>
            <select name="diet">
              ${option("standard", "Standard", participant.diet)}
              ${option("gf", "Bezglutenowa", participant.diet)}
              ${option("vegan", "Wegańska", participant.diet)}
              ${option("x", "Puste", participant.diet)}
            </select>
          </td>
          <td>
            <div class="payment-checks">
              <label class="toggle-row"><input name="paidDeposit" type="checkbox" ${participant.paidDeposit ? "checked" : ""}><span>zal.</span></label>
              <label class="toggle-row"><input name="paidInstallment1" type="checkbox" ${participant.paidInstallment1 ? "checked" : ""}><span>wpł. 1</span></label>
              <label class="toggle-row"><input name="paidInstallment2" type="checkbox" ${participant.paidInstallment2 ? "checked" : ""}><span>wpł. 2</span></label>
            </div>
          </td>
          <td>
            <div class="transport-admin-cell">
              <select name="transportMode">
                ${option("none", "Brak", transportModeOf(participant))}
                ${option("organized", "Zorganizowany", transportModeOf(participant))}
                ${option("own", "Własny", transportModeOf(participant))}
              </select>
              <label class="toggle-row"><input name="paidTransport" type="checkbox" ${participant.paidTransport ? "checked" : ""}><span>opł.</span></label>
            </div>
          </td>
          <td>
            <input name="registrationStatus" value="${escapeAttr(participant.registrationStatus || "")}">
            <label class="toggle-row verification-toggle">
              <input name="manualVerified" type="checkbox" ${participant.manualVerified ? "checked" : ""}>
              <span>zweryfikowano ręcznie</span>
            </label>
          </td>
          <td>${jump}</td>
        </tr>
      `;
    })
    .join("");
}

function renderAccountOptions() {
  const options = state.app.participants
    .filter((item) => !item.emptySeat)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "pl"))
    .map((participant) => `<option value="${participant.id}">${escapeHtml(participant.name)}${participant.albumNumber ? ` / ${escapeHtml(participant.albumNumber)}` : ""}${participant.email ? ` - ${escapeHtml(participant.email)}` : ""}</option>`)
    .join("");
  $("#account-participant").innerHTML = options;
}

function renderBankImportResult(result) {
  const element = $("#bank-import-result");
  if (!element) return;
  const applied = result.applied || [];
  const unmatched = result.unmatched || [];
  const ambiguous = result.ambiguous || [];
  element.innerHTML = `
    <div class="bank-result-summary">
      <strong>${escapeHtml(result.matched || 0)} dopasowanych wpływów</strong>
      <span>${escapeHtml(result.changedFields || 0)} pól płatności zmienionych</span>
      <span>${escapeHtml(unmatched.length)} bez dopasowania</span>
      <span>${escapeHtml(ambiguous.length)} do ręcznego sprawdzenia</span>
    </div>
    ${applied.length ? `
      <div class="bank-result-list">
        <strong>Zaksięgowane</strong>
        ${applied.slice(0, 12).map((item) => `<p>${escapeHtml(item.name)}${item.albumNumber ? ` / ${escapeHtml(item.albumNumber)}` : ""}: ${escapeHtml(item.fields.join(", "))} (${escapeHtml(formatMoney(item.amount))})</p>`).join("")}
      </div>
    ` : ""}
    ${ambiguous.length ? `
      <div class="bank-result-list warn">
        <strong>Do ręcznego sprawdzenia</strong>
        ${ambiguous.slice(0, 8).map((item) => `<p>${escapeHtml(item.participant || "Dopasowana osoba")}: ${escapeHtml(formatMoney(item.amount))} / ${escapeHtml(item.title)}</p>`).join("")}
      </div>
    ` : ""}
    ${unmatched.length ? `
      <div class="bank-result-list stop">
        <strong>Nie znaleziono osoby</strong>
        ${unmatched.slice(0, 8).map((item) => `<p>${escapeHtml(formatMoney(item.amount))} / ${escapeHtml(item.title)}</p>`).join("")}
      </div>
    ` : ""}
  `;
}

function renderScheduledNotifications() {
  const list = $("#scheduled-list");
  if (!list) return;
  const items = state.app.admin?.scheduledNotifications || [];
  list.innerHTML = items.length
    ? items
        .slice(0, 6)
        .map((item) => `<div class="scheduled-item"><strong>${escapeHtml(item.title)}</strong><span>${formatDate(item.scheduledAt)} / ${escapeHtml(item.target)}</span></div>`)
        .join("")
    : `<div class="scheduled-item"><span>Brak zaplanowanych komunikatów.</span></div>`;
}

function renderSettingsForm() {
  const settings = state.app.settings || {};
  const theme = settings.theme || {};
  const infopack = state.app.infopack || {};
  const form = $("#settings-form");
  [
    "appName",
    "eventName",
    "subtitle",
    "eventDate",
    "venueName",
    "venueAddress",
    "mapUrl",
    "organizedTransportInfo",
    "ownTransportInfo",
    "comingSoonTitle",
    "comingSoonMessage",
    "maintenanceTitle",
    "maintenanceMessage",
    "limitDailyRequestLimit",
    "limitDailyWriteLimit",
    "limitReadOnlyAtPercent",
    "limitGuardMessage",
    "logoText",
    "logoSubtext",
    "authEyebrow",
    "heroTagline",
    "heroCopy",
    "adminWelcomeMessage",
    "companionSignupDeadline",
    "logoCropX",
    "logoCropY",
    "logoZoom",
    "heroCropX",
    "heroCropY",
    "heroZoom",
    "rodoText",
    "termsText",
    "seatingLockedMessage",
    "nightStart",
    "nightEnd",
  ].forEach((key) => {
    if (form[key]) form[key].value = settings[key] || "";
  });
  if (form.seatingVisible) form.seatingVisible.value = String(settings.seatingVisible === true || settings.seatingVisible === "true");
  if (form.siteMode) form.siteMode.value = settings.siteMode || "open";
  if (form.limitGuardEnabled) form.limitGuardEnabled.value = String(settings.limitGuardEnabled !== false && settings.limitGuardEnabled !== "false");
  if (form.limitForceReadOnly) form.limitForceReadOnly.value = String(settings.limitForceReadOnly === true || settings.limitForceReadOnly === "true");
  if (form.nightMode) form.nightMode.value = settings.nightMode || "auto";
  ["primary", "background", "gold", "coral", "sage", "cream", "paper", "mist", "ink", "muted"].forEach((key) => {
    form[key].value = theme[key] || getComputedStyle(document.documentElement).getPropertyValue(`--${key}`).trim() || "#000000";
  });
  setDefaultCropValue(form.logoCropX, settings.logoCropX, 50);
  setDefaultCropValue(form.logoCropY, settings.logoCropY, 50);
  setDefaultCropValue(form.logoZoom, settings.logoZoom, 100);
  setDefaultCropValue(form.heroCropX, settings.heroCropX, 50);
  setDefaultCropValue(form.heroCropY, settings.heroCropY, 50);
  setDefaultCropValue(form.heroZoom, settings.heroZoom, 100);
  form.infopackIntro.value = infopack.intro || "";
  form.scheduleText.value = (infopack.schedule || []).map((item) => `${item.time} | ${item.title}`).join("\n");
  form.sectionsText.value = (infopack.sections || []).map((item) => `${item.title} | ${item.body}`).join("\n");
  form.interfaceTexts.value = Object.entries(settings.interfaceTexts || {}).map(([key, value]) => `${key} | ${value}`).join("\n");
  form.statusTexts.value = Object.entries(settings.statusTexts || {}).map(([key, value]) => `${key} | ${value}`).join("\n");
  if (form.clearLogoImage) form.clearLogoImage.checked = false;
  if (form.clearHeroImage) form.clearHeroImage.checked = false;
  renderCropControls();
  setSettingsSaveState("clean");
}

function renderMediaUploadStatus() {
  const form = $("#settings-form");
  const status = $("#media-upload-status");
  if (!form || !status) return;
  const settings = state.app?.settings || {};
  const logoInput = form.elements.logoImage;
  const heroInput = form.elements.heroImage;
  const logoName = logoInput?.files?.[0]?.name || "";
  const heroName = heroInput?.files?.[0]?.name || "";
  const rows = [
    uploadStatusRow("Logo", logoName, settings.logoImageName, form.elements.clearLogoImage?.checked),
    uploadStatusRow("Tło", heroName, settings.heroImageName, form.elements.clearHeroImage?.checked),
  ];
  status.innerHTML = rows.join("");
}

function uploadStatusRow(label, selectedName, savedName, willClear) {
  if (willClear) {
    return `<div class="upload-status-item clear"><strong>${label}</strong><span>po kliknięciu zapisu zostanie usunięte</span></div>`;
  }
  if (selectedName) {
    return `<div class="upload-status-item selected"><strong>${label}</strong><span>wybrano: ${escapeHtml(selectedName)}</span></div>`;
  }
  if (savedName) {
    return `<div class="upload-status-item saved"><strong>${label}</strong><span>zapisane: ${escapeHtml(savedName)}</span></div>`;
  }
  return `<div class="upload-status-item"><strong>${label}</strong><span>brak wgranego pliku</span></div>`;
}

function markSettingsDirty(event) {
  if (event.target?.matches?.("input, select, textarea")) {
    setSettingsSaveState("dirty");
  }
}

function setSettingsSaveState(statusName = "clean") {
  const bar = $("#settings-save-bar");
  const label = $("#settings-save-state");
  if (!bar || !label) return;
  const labels = {
    clean: "Zapisano ostatni stan",
    dirty: "Niezapisane zmiany",
    saving: "Zapisywanie...",
  };
  label.textContent = labels[statusName] || labels.clean;
  bar.classList.toggle("dirty", statusName === "dirty");
  bar.classList.toggle("saving", statusName === "saving");
}

function renderCropControls() {
  const form = $("#settings-form");
  if (!form) return;
  const settings = state.app?.settings || {};
  ["logoCropX", "logoCropY", "heroCropX", "heroCropY"].forEach((key) => updateRangeValue(key, "%"));
  ["logoZoom", "heroZoom"].forEach((key) => updateRangeValue(key, "%"));

  const logoSource = form.elements.clearLogoImage?.checked ? "" : state.logoPreviewUrl || settings.logoImageData || "";
  const heroSource = form.elements.clearHeroImage?.checked ? "/assets/hero-texture.png" : state.heroPreviewUrl || settings.heroImageData || "/assets/hero-texture.png";
  renderCropPreview("#logo-crop-preview", logoSource, settings.logoText || "BL", {
    cropX: form.elements.logoCropX?.value || settings.logoCropX,
    cropY: form.elements.logoCropY?.value || settings.logoCropY,
    zoom: form.elements.logoZoom?.value || settings.logoZoom,
  });
  renderCropPreview("#hero-crop-preview", heroSource, "", {
    cropX: form.elements.heroCropX?.value || settings.heroCropX,
    cropY: form.elements.heroCropY?.value || settings.heroCropY,
    zoom: form.elements.heroZoom?.value || settings.heroZoom,
  });
}

function renderCropPreview(selector, source, fallbackText, crop) {
  const preview = $(selector);
  if (!preview) return;
  if (source) {
    preview.classList.add("has-image");
    preview.innerHTML = `<img src="${source}" alt="">`;
    applyCropToImage(preview.querySelector("img"), crop);
  } else {
    preview.classList.remove("has-image");
    preview.innerHTML = `<span>${escapeHtml(fallbackText)}</span>`;
  }
}

function updateRangeValue(key, suffix = "") {
  const field = $("#settings-form")?.elements[key];
  const label = $(`[data-range-value="${key}"]`);
  if (field && label) label.textContent = `${field.value}${suffix}`;
}

function setDefaultCropValue(field, value, fallback) {
  if (field) field.value = value ?? fallback;
}

function applyMediaCrop(image, settings, prefix) {
  if (!image) return;
  applyCropToImage(image, {
    cropX: settings[`${prefix}CropX`],
    cropY: settings[`${prefix}CropY`],
    zoom: settings[`${prefix}Zoom`],
  });
}

function applyCropToImage(image, crop) {
  if (!image) return;
  const x = cropValue(crop.cropX, 50, 0, 100);
  const y = cropValue(crop.cropY, 50, 0, 100);
  const zoom = cropValue(crop.zoom, 100, 100, 240);
  image.style.objectPosition = `${x}% ${y}%`;
  image.style.transformOrigin = `${x}% ${y}%`;
  image.style.transform = `scale(${zoom / 100})`;
}

function cropValue(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function setMediaPreviewUrl(key, file) {
  if (state[key]) URL.revokeObjectURL(state[key]);
  state[key] = file ? URL.createObjectURL(file) : "";
}

function clearMediaPreviewUrls() {
  setMediaPreviewUrl("logoPreviewUrl", null);
  setMediaPreviewUrl("heroPreviewUrl", null);
}

function renderTableManager() {
  const form = $("#table-form");
  if (!form) return;
  const rooms = layoutRoomIds();
  const current = rooms.includes(form.roomId.value) ? form.roomId.value : rooms[0] || "sala-dolna";
  form.roomId.innerHTML = rooms.map((roomId) => option(roomId, roomLabel(roomId), current)).join("");
  form.roomId.value = current;
  renderTableColumnOptions();
  $("#table-layout-summary").innerHTML = rooms
    .map((roomId) => {
      const tables = layoutTables(roomId);
      return `
        <div class="table-summary-item">
          <strong>${escapeHtml(roomLabel(roomId))}</strong>
          <span>${tables.length} stołów / ${tables.reduce((sum, table) => sum + Number(table.left || 0) + Number(table.right || 0), 0)} miejsc</span>
        </div>
      `;
    })
    .join("");
  $("#table-editor-list").innerHTML = rooms
    .map((roomId) => {
      const tables = layoutTables(roomId);
      return `
        <section class="table-room-editor">
          <div class="table-room-editor-head">
            <strong>${escapeHtml(roomLabel(roomId))}</strong>
            <span>${tables.length} stołów</span>
          </div>
          <div class="table-edit-grid">
            ${tables.length ? tables.map((table) => {
              const occupied = tableOccupants(roomId, table.id).length;
              const capacity = Number(table.left || 0) + Number(table.right || 0);
              return `
                <form class="table-edit-card" data-table-edit-form data-room-id="${escapeAttr(roomId)}" data-table-id="${escapeAttr(table.id)}">
                  <div>
                    <strong>${escapeHtml(table.id)}</strong>
                    <span>${occupied}/${capacity} zajętych</span>
                  </div>
                  <label>Nazwa<input name="label" value="${escapeAttr(table.label || table.id)}"></label>
                  <label>Lewa<input name="left" type="number" min="1" max="80" value="${Number(table.left || 0)}"></label>
                  <label>Prawa<input name="right" type="number" min="0" max="80" value="${Number(table.right || 0)}"></label>
                  <button class="mini-button" type="submit">Zapisz</button>
                </form>
              `;
            }).join("") : `<div class="asset-empty">Brak stołów w tej sali.</div>`}
          </div>
        </section>
      `;
    })
    .join("");
}

function renderTableColumnOptions() {
  const form = $("#table-form");
  if (!form) return;
  const roomId = form.roomId.value || "sala-dolna";
  const columns = state.app.layouts?.[roomId] || [[]];
  const current = form.columnIndex.value || "0";
  form.columnIndex.innerHTML = [
    ...columns.map((column, index) => option(String(index), `Kolumna ${index + 1} (${column.length} stołów)`, current)),
    option(String(columns.length), "Nowa kolumna", current),
  ].join("");
}

function renderAssets() {
  const list = $("#asset-list");
  if (!list) return;
  const assets = state.app.assets || [];
  list.innerHTML = assets.length
    ? assets
        .map((asset) => {
          const preview = asset.mimeType?.startsWith("image/")
            ? `<img src="${asset.dataUrl}" alt="">`
            : `<span class="asset-file-icon">PDF</span>`;
          return `
            <article class="asset-item">
              ${preview}
              <div>
                <strong>${escapeHtml(asset.name)}</strong>
                <span>${escapeHtml(asset.category)} / ${formatBytes(asset.size)} / ${formatDate(asset.createdAt)}</span>
              </div>
              <a class="mini-button" href="${asset.dataUrl}" download="${escapeAttr(asset.name)}">Pobierz</a>
              <button class="mini-button" type="button" data-delete-asset="${escapeAttr(asset.id)}">Usuń</button>
            </article>
          `;
        })
        .join("")
    : `<div class="asset-empty">Brak wgranych materiałów.</div>`;
}

async function loadBackups() {
  if (!isAdmin()) return;
  const result = await api("/api/admin/backups");
  $("#backup-list").innerHTML = result.backups.length
    ? result.backups.map((name) => `<div class="backup-item"><span>${escapeHtml(name)}</span><button class="mini-button" type="button" data-download-backup="${escapeAttr(name)}">Pobierz</button></div>`).join("")
    : `<div class="backup-item"><span>Brak zapisanych kopii.</span></div>`;
  $$("[data-download-backup]").forEach((button) => {
    button.addEventListener("click", () => downloadFile(`/api/admin/backups/${button.dataset.downloadBackup}`, button.dataset.downloadBackup));
  });
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(state.token && !options.publicRequest ? { Authorization: `Bearer ${state.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    toast(payload.error || "Nie udało się wykonać operacji.");
    throw new Error(payload.error || response.statusText);
  }
  return payload;
}

async function apiText(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "POST",
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
    },
    body: options.body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    toast(payload.error || "Nie udało się wykonać operacji.");
    throw new Error(payload.error || response.statusText);
  }
  return payload;
}

async function downloadFile(path, filename) {
  const response = await fetch(path, { headers: { Authorization: `Bearer ${state.token}` } });
  if (!response.ok) return toast("Nie udało się pobrać pliku.");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function printGroupedList() {
  const people = (state.app.participants || []).filter((item) => !item.emptySeat);
  const companions = new Set();
  const rows = people
    .filter((item) => registrationTypeOf(item) !== "companion")
    .slice()
    .sort((a, b) => (a.deanGroup || "zzz").localeCompare(b.deanGroup || "zzz", "pl", { numeric: true }) || a.name.localeCompare(b.name, "pl"))
    .map((participant) => {
      const linked = linkedParticipant(participant);
      if (linked) companions.add(linked.id);
      return { participant, linked };
    });
  const unpairedCompanions = people.filter((item) => registrationTypeOf(item) === "companion" && !companions.has(item.id));
  const grouped = rows.reduce((acc, item) => {
    const group = item.participant.deanGroup || "Bez grupy";
    acc[group] ||= [];
    acc[group].push(item);
    return acc;
  }, {});
  if (unpairedCompanions.length) {
    grouped["Goście absolwentów bez powiązania"] = unpairedCompanions.map((participant) => ({ participant, linked: null }));
  }
  const html = `
    <!doctype html>
    <html lang="pl">
      <head>
        <meta charset="utf-8">
        <title>Lista grup - ${escapeHtml(state.app.settings?.eventName || "Bal")}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #172036; margin: 28px; }
          h1 { margin: 0 0 16px; font-family: Georgia, serif; }
          h2 { margin: 22px 0 8px; padding-bottom: 5px; border-bottom: 2px solid #c8a85c; }
          table { width: 100%; border-collapse: collapse; page-break-inside: avoid; }
          th, td { border-bottom: 1px solid #ddd; padding: 7px; text-align: left; font-size: 12px; }
          th { background: #f8f2e7; }
          .companion { color: #6b7280; }
          @media print { button { display: none; } body { margin: 12mm; } }
        </style>
      </head>
      <body>
        <button onclick="window.print()">Drukuj</button>
        <h1>${escapeHtml(state.app.settings?.eventName || "Bal Lekarza 2028")}</h1>
        <p>Lista osób posortowana grupami, z gośćmi absolwentów przy osobach zapraszających.</p>
        ${Object.entries(grouped).map(([group, items]) => `
          <h2>${escapeHtml(group)} · ${items.reduce((sum, item) => sum + 1 + (item.linked ? 1 : 0), 0)} os.</h2>
          <table>
            <thead><tr><th>Absolwent</th><th>Typ</th><th>Gość absolwenta</th><th>Stół</th><th>Dieta</th><th>Wpłaty</th></tr></thead>
            <tbody>
              ${items.map(({ participant, linked }) => `
                <tr>
                  <td>${escapeHtml(participant.name)}</td>
                  <td>${escapeHtml(registrationTypeLabel(participant))}</td>
                  <td class="companion">${linked ? `${escapeHtml(linked.name)} / ${escapeHtml(dietLabel(linked.diet))}` : ""}</td>
                  <td>${escapeHtml([participant.roomName || roomLabel(participant.roomId), participant.tableId, participant.seatNo].filter(Boolean).join(" / "))}</td>
                  <td>${escapeHtml(dietLabel(participant.diet))}</td>
                  <td>${paymentComplete(participant) ? "komplet" : "braki"}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        `).join("")}
      </body>
    </html>
  `;
  const popup = window.open("", "_blank");
  if (!popup) return toast("Przeglądarka zablokowała okno wydruku.");
  popup.document.write(html);
  popup.document.close();
  popup.focus();
}

function applyTheme(settings) {
  const theme = settings.theme || {};
  for (const key of ["primary", "background", "gold", "coral", "sage", "cream", "paper", "mist", "ink", "muted"]) {
    if (theme[key]) document.documentElement.style.setProperty(`--${key}`, theme[key]);
  }
  const night = isNightModeActive(settings);
  if (night) {
    Object.entries({
      primary: "#f1d27a",
      background: "#101526",
      cream: "#101526",
      paper: "#171f36",
      mist: "#202a45",
      ink: "#f7efe0",
      muted: "#c3c8d6",
    }).forEach(([key, value]) => document.documentElement.style.setProperty(`--${key}`, value));
  }
  document.documentElement.dataset.theme = night ? "night" : "day";
  const metaTheme = document.querySelector("meta[name='theme-color']");
  if (metaTheme) metaTheme.setAttribute("content", night ? "#111832" : theme.background || theme.cream || "#fff8eb");
}

function isNightModeActive(settings = state.app?.settings || {}) {
  const mode = settings.nightMode || "auto";
  if (mode === "on") return true;
  if (mode === "off") return false;
  const hour = new Date().getHours();
  const start = Number(settings.nightStart ?? 20);
  const end = Number(settings.nightEnd ?? 6);
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

function parsePipeLines(text, keys) {
  return String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("|").map((part) => part.trim());
      return Object.fromEntries(keys.map((key, index) => [key, parts[index] || ""]));
    })
    .filter((item) => Object.values(item).some(Boolean));
}

function parseKeyValueLines(text) {
  return Object.fromEntries(
    String(text || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [key, ...rest] = line.split("|");
        return [key.trim(), rest.join("|").trim()];
      })
      .filter(([key, value]) => key && value)
  );
}

function scheduleTimelineState(schedule, eventDate) {
  const items = schedule.map((item, index) => ({
    index,
    minutes: timeToMinutes(item.time),
  })).filter((item) => Number.isFinite(item.minutes));
  const states = schedule.map(() => ({ className: "planned", label: "W planie" }));
  if (!items.length) return states;

  const today = new Date();
  const todayKey = dateKey(today);
  const eventKey = eventDate || "";

  if (eventKey && eventKey > todayKey) {
    states[items[0].index] = { className: "next", label: "Następne" };
    return states;
  }
  if (eventKey && eventKey < todayKey) {
    return states.map(() => ({ className: "past", label: "Zakończone" }));
  }

  const nowMinutes = today.getHours() * 60 + today.getMinutes();
  let activeIndex = -1;
  let nextIndex = -1;
  for (let i = 0; i < items.length; i += 1) {
    const current = items[i];
    const next = items[i + 1];
    if (nowMinutes >= current.minutes && (!next || nowMinutes < next.minutes)) activeIndex = current.index;
    if (nowMinutes < current.minutes && nextIndex === -1) nextIndex = current.index;
  }

  for (const item of items) {
    if (item.index === activeIndex) states[item.index] = { className: "current", label: "Teraz" };
    else if (item.index === nextIndex) states[item.index] = { className: "next", label: "Następne" };
    else if (item.minutes < nowMinutes) states[item.index] = { className: "past", label: "Zakończone" };
  }
  return states;
}

function timeToMinutes(value) {
  const match = String(value || "").match(/(\d{1,2})[:.](\d{2})/);
  if (!match) return NaN;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return NaN;
  return hours * 60 + minutes;
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function seatingVisible() {
  return state.app?.settings?.seatingVisible === true || state.app?.settings?.seatingVisible === "true";
}

function transportModeOf(participant) {
  if (!participant) return "none";
  if (["organized", "own", "none"].includes(participant.transportMode)) return participant.transportMode;
  return participant.transport ? "organized" : "none";
}

function registrationTypeOf(participant) {
  if (!participant) return "student";
  if (participant.registrationType === "companion" || participant.isCompanion) return "companion";
  return "student";
}

function registrationTypeLabel(participant) {
  const type = registrationTypeOf(participant);
  if (type === "companion") return "Gość absolwenta";
  return "Absolwent";
}

function linkedParticipant(participant) {
  return state.app.participants?.find((item) => item.id === participant?.linkedParticipantId) || null;
}

function linkedParticipantOptions(participant) {
  const current = participant.linkedParticipantId || "";
  const options = [option("", "Bez powiązania", current)];
  return options.concat(
    (state.app.participants || [])
      .filter((item) => !item.emptySeat && item.id !== participant.id)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "pl"))
      .map((item) => option(item.id, `${item.name}${item.deanGroup ? ` / ${item.deanGroup}` : ""}`, current))
  ).join("");
}

function pairHint(participant) {
  const linked = linkedParticipant(participant);
  if (!linked) {
    return registrationTypeOf(participant) === "companion"
      ? `<span class="pair-hint warn">Brak powiązanego absolwenta</span>`
      : `<span class="pair-hint">Można podpiąć gościa absolwenta</span>`;
  }
  const sameTable = linked.roomId === participant.roomId && linked.tableId === participant.tableId;
  const close = sameTable && Math.abs(Number(linked.seatNo) - Number(participant.seatNo)) <= 1;
  const tone = close ? "ok" : sameTable ? "warn" : "stop";
  const note = close ? "siedzą obok siebie" : sameTable ? "ten sam stół" : "inna lokalizacja";
  return `<span class="pair-hint ${tone}">Para: ${escapeHtml(linked.name)} - ${note}</span>`;
}

function transportLabel(participant) {
  return {
    organized: statusText("transportOrganized", "Transport zorganizowany"),
    own: statusText("transportOwn", "Transport własny"),
    none: statusText("transportNone", "Bez transportu"),
  }[transportModeOf(participant)] || statusText("transportNone", "Bez transportu");
}

function transportPaymentLabel(participant) {
  const mode = transportModeOf(participant);
  if (mode === "organized") return participant.paidTransport ? statusText("transportPaidConfirmed", "Zapis i płatność potwierdzone") : statusText("transportPaidPending", "Zapisany, płatność do potwierdzenia");
  if (mode === "own") return statusText("transportOwnStatus", "Dojazd własny");
  return statusText("transportNotSigned", "Nie jesteś zapisany/zapisana");
}

function layoutRoomIds() {
  const preferred = ["sala-dolna", "sala-gorna", "namiot"];
  const existing = Object.keys(state.app?.layouts || {});
  return [...new Set([...preferred.filter((roomId) => existing.includes(roomId)), ...existing])];
}

function layoutTables(roomId) {
  return (state.app?.layouts?.[roomId] || []).flat();
}

function tableOccupants(roomId, tableId) {
  return (state.app?.participants || []).filter((participant) => participant.roomId === roomId && participant.tableId === tableId && participant.seatNo);
}

function roomOptions(current) {
  const rooms = ["oczekujace", ...layoutRoomIds()];
  if (current && !rooms.includes(current)) rooms.push(current);
  return rooms.map((roomId) => option(roomId, roomLabel(roomId), current)).join("");
}

function tableOptions(roomId, current) {
  const tables = layoutTables(roomId);
  const values = tables.map((table) => table.id);
  const options = [option("", "Bez stołu", current)];
  if (current && !values.includes(current)) options.push(option(current, `${current} (spoza układu)`, current));
  return options.concat(tables.map((table) => option(table.id, table.label || table.id, current))).join("");
}

function seatOptions(roomId, tableId, current, participant) {
  const table = layoutTables(roomId).find((item) => item.id === tableId);
  const total = Number(table?.left || 0) + Number(table?.right || 0);
  const options = [option("", "Bez miejsca", current)];
  if (!total) {
    if (current) options.push(option(current, `${current} (spoza układu)`, current));
    return options.join("");
  }
  for (let seatNo = 1; seatNo <= total; seatNo += 1) {
    const occupant = findSeat(roomId, tableId, seatNo);
    const side = seatNo <= Number(table.left || 0) ? "L" : "P";
    const note = occupant && occupant.id !== participant.id ? ` - ${occupant.name}` : " - wolne";
    const recommendation = seatRecommendation(roomId, tableId, seatNo, participant);
    options.push(option(String(seatNo), `${seatNo} (${side})${note}${recommendation ? ` / ${recommendation}` : ""}`, String(current || "")));
  }
  return options.join("");
}

function seatSideFor(roomId, tableId, seatNo) {
  const table = layoutTables(roomId).find((item) => item.id === tableId);
  const number = Number(seatNo);
  if (!table || !Number.isFinite(number) || number < 1) return "";
  return number <= Number(table.left || 0) ? "L" : "P";
}

function seatRecommendation(roomId, tableId, seatNo, participant) {
  const linked = linkedParticipant(participant);
  if (linked?.roomId === roomId && linked.tableId === tableId) {
    if (Math.abs(Number(linked.seatNo) - Number(seatNo)) <= 1) return "obok pary";
    return "ten sam stół co para";
  }
  if (participant.deanGroup) {
    const groupAtTable = (state.app.participants || []).filter((item) =>
      item.id !== participant.id &&
      item.deanGroup === participant.deanGroup &&
      item.roomId === roomId &&
      item.tableId === tableId
    ).length;
    if (groupAtTable) return `grupa ${participant.deanGroup}: ${groupAtTable} os.`;
  }
  return "";
}

function findSeat(roomId, tableId, seatNo) {
  return state.app.participants.find((item) => item.roomId === roomId && item.tableId === tableId && Number(item.seatNo) === Number(seatNo));
}

function mergeParticipant(participant) {
  const index = state.app.participants.findIndex((item) => item.id === participant.id);
  if (index >= 0) state.app.participants[index] = { ...state.app.participants[index], ...participant };
}

function isAdmin() {
  return state.app?.user?.role === "admin";
}

function roomLabel(roomId) {
  return {
    "sala-dolna": "Sala dolna",
    "sala-gorna": "Sala górna",
    namiot: "Namiot",
    oczekujace: "Lista zapisów",
  }[roomId] || roomId;
}

function dietLabel(value) {
  return { standard: "Standard", gf: "Bezglutenowa", vegan: "Wegańska", x: "Puste" }[value] || value || "Nie podano";
}

function statusLabel(value) {
  return {
    imported: statusText("registrationImported", "Zaimportowany z listy"),
    pending: statusText("registrationPending", "Nowy zapis - do zatwierdzenia"),
    demo: statusText("registrationDemo", "Konto demo"),
    "empty-seat": statusText("registrationEmptySeat", "Miejsce puste"),
  }[value] || value || statusText("registrationMissing", "Do uzupełnienia");
}

function statusPill(condition, ok, bad, badClass = "stop") {
  return `<span class="status-pill ${condition ? "ok" : badClass}">${escapeHtml(condition ? ok : bad)}</span>`;
}

function summaryRow(label, value, tone = "") {
  return `<div class="summary-row ${tone}"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>`;
}

function seatSummary(participant) {
  if (!isAdmin() && !seatingVisible()) {
    return [
      summaryRow("Plan stołów", statusText("seatingPreparingShort", "W przygotowaniu"), "warn"),
      summaryRow("Komunikat", state.app.settings?.seatingLockedMessage || statusText("seatWillAppear", "Miejsce pojawi się po zatwierdzeniu układu."), "warn"),
      summaryRow("Dieta", dietLabel(participant.diet), "ok"),
    ].join("");
  }
  return [
    summaryRow("Typ", registrationTypeLabel(participant), ""),
    participant.deanGroup ? summaryRow("Grupa", participant.deanGroup, "ok") : "",
    linkedParticipant(participant) ? summaryRow("Para", linkedParticipant(participant).name, "warn") : "",
    summaryRow("Sala", participant.roomName || roomLabel(participant.roomId), "ok"),
    summaryRow("Stół", participant.tableId || statusText("seatToAssign", "Do przydzielenia"), participant.tableId ? "ok" : "warn"),
    summaryRow("Miejsce", participant.seatNo ? `${participant.seatNo}${participant.side ? ` (${participant.side})` : ""}` : statusText("seatToAssign", "Do przydzielenia"), participant.seatNo ? "ok" : "warn"),
    summaryRow("Dieta", dietLabel(participant.diet), "ok"),
  ].join("");
}

function option(value, label, current) {
  return `<option value="${escapeAttr(value)}" ${String(value) === String(current) ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function formatDate(date) {
  if (!date) return "";
  const parsed = new Date(date);
  if (!Number.isFinite(parsed.getTime())) return String(date);
  return new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short" }).format(parsed);
}

function formatMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "";
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(amount);
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
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function fileToDataUrl(file, maxBytes = 2_400_000, message = "Zdjęcie jest za duże dla prototypu. Wybierz plik do ok. 2 MB.") {
  return new Promise((resolve, reject) => {
    if (file.size > maxBytes) {
      toast(message);
      resolve("");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatBytes(value) {
  const size = Number(value) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.remove("hidden");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.add("hidden"), 3600);
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
}
