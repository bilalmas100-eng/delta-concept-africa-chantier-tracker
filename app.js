const STORAGE_KEY = "chantier-tracker-v1";
const PHOTO_DB_NAME = "chantier-tracker-photos-v1";

const initialState = {
  projects: [{
    id: "bastos",
    name: "Project Bastos",
    client: "",
    location: "",
    startDate: "",
    status: "En cours",
    description: "Suivi quotidien du chantier Bastos.",
    createdAt: new Date().toISOString(),
    inventory: [],
    reports: []
  }]
};

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.projects)) return saved;
  } catch (error) {
    console.warn("Impossible de lire les données enregistrées.", error);
  }
  return structuredClone(initialState);
}

let state = loadState();
let activeProjectId = null;
let activeTab = "reports";
let photoDrafts = [];
const renderedPhotoUrls = new Set();
const $ = (selector, root = document) => root.querySelector(selector);
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));
const dateValue = value => value ? new Date(`${value}T12:00:00`) : null;
const formatDate = value => {
  const date = dateValue(value);
  return date ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(date) : "Date non définie";
};
const shortDate = value => {
  const date = dateValue(value);
  return date ? new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit" }).format(date) : "—";
};
const todayISO = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function openPhotoDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PHOTO_DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("photos");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Impossible d’ouvrir le stockage des photos."));
  });
}

async function storePhoto(id, file) {
  const db = await openPhotoDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("photos", "readwrite");
    transaction.objectStore("photos").put(file, id);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error || new Error("Impossible d’enregistrer une photo.")); };
    transaction.onabort = () => { db.close(); reject(transaction.error || new Error("L’enregistrement de la photo a été annulé.")); };
  });
}

async function loadPhoto(id) {
  const db = await openPhotoDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("photos", "readonly");
    const request = transaction.objectStore("photos").get(id);
    request.onsuccess = () => { db.close(); resolve(request.result || null); };
    request.onerror = () => { db.close(); reject(request.error || new Error("Impossible de lire la photo.")); };
  });
}

async function deletePhoto(id) {
  const db = await openPhotoDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("photos", "readwrite");
    transaction.objectStore("photos").delete(id);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error || new Error("Impossible de supprimer la photo.")); };
  });
}

function clearRenderedPhotoUrls() {
  renderedPhotoUrls.forEach(url => URL.revokeObjectURL(url));
  renderedPhotoUrls.clear();
}

function loadSavedPhotos(root) {
  root.querySelectorAll("img[data-photo-id]").forEach(async image => {
    try {
      const file = await loadPhoto(image.dataset.photoId);
      if (file && image.isConnected) {
        const url = URL.createObjectURL(file);
        renderedPhotoUrls.add(url);
        image.src = url;
      } else if (!file) {
        image.classList.add("photo-missing");
      }
    } catch (error) {
      console.error("Impossible de charger une photo de chantier.", error);
      image.classList.add("photo-missing");
    }
  });
}

function render() {
  clearRenderedPhotoUrls();
  renderNavigation();
  const project = state.projects.find(item => item.id === activeProjectId);
  $("#overview-view").classList.toggle("hidden", Boolean(project));
  $("#project-view").classList.toggle("hidden", !project);
  $("#breadcrumb-current").textContent = project ? project.name : "Vue d’ensemble";
  if (project) renderProject(project);
  else renderOverview();
}

function renderNavigation() {
  $("#project-nav").innerHTML = state.projects.map(project => `
    <a class="project-link ${project.id === activeProjectId ? "active" : ""}" href="#${encodeURIComponent(project.id)}" data-project-id="${escapeHtml(project.id)}">
      <span class="project-glyph">${escapeHtml(project.name.trim().charAt(0).toUpperCase() || "P")}</span>
      <span>${escapeHtml(project.name)}</span><span class="nav-count">${project.reports.length}</span>
    </a>`).join("");
}

function renderOverview() {
  const reports = state.projects.reduce((sum, project) => sum + project.reports.length, 0);
  const active = state.projects.filter(project => project.status === "En cours").length;
  $("#overview-view").innerHTML = `
    <div class="welcome-row">
      <div><p class="eyebrow">ESPACE DE TRAVAIL</p><h1>Vue d’ensemble</h1><p class="welcome-copy">Vos chantiers, leur avancement et les dernières nouvelles.</p></div>
      <button class="button button-primary" data-action="new-project">Nouveau projet <span>+</span></button>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">PROJETS AU TOTAL</div><div class="stat-value">${state.projects.length}<span class="stat-foot">chantiers suivis</span></div></div>
      <div class="stat-card"><div class="stat-label">EN COURS</div><div class="stat-value">${active}<span class="stat-foot">projets actifs</span></div></div>
      <div class="stat-card"><div class="stat-label">RAPPORTS JOURNALIERS</div><div class="stat-value">${reports}<span class="stat-foot">points enregistrés</span></div></div>
    </div>
    <div class="section-heading"><div><h2>Vos projets</h2><p class="section-subtitle">Sélectionnez un chantier pour consulter ses informations et son historique.</p></div></div>
    <div class="project-grid">${state.projects.length ? state.projects.map(projectCard).join("") : emptyProjects()}</div>`;
}

function projectProgress(project) {
  const reports = [...(project.reports || [])].sort((a, b) => b.date.localeCompare(a.date));
  const report = reports.find(item => (item.progress || []).some(progress => Number.isFinite(Number(progress.percent)) && progress.percent !== ""));
  if (!report) return null;
  const values = report.progress
    .map(item => Number(item.percent))
    .filter(value => Number.isFinite(value))
    .map(value => Math.max(0, Math.min(100, value)));
  if (!values.length) return null;
  return {
    percent: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
    date: report.date
  };
}

function projectCard(project) {
  const lastReport = [...project.reports].sort((a, b) => b.date.localeCompare(a.date))[0];
  const progress = projectProgress(project);
  const statusClass = project.status === "À venir" ? "upcoming" : project.status === "Terminé" ? "completed" : "";
  return `<article class="project-card" tabindex="0" data-open-project="${escapeHtml(project.id)}">
    <div class="card-top"><span class="project-initial">${escapeHtml(project.name.trim().charAt(0).toUpperCase() || "P")}</span><span class="status-pill ${statusClass}">${escapeHtml(project.status)}</span></div>
    <h3>${escapeHtml(project.name)}</h3><div class="project-location">${escapeHtml(project.location || project.client || "Localisation à renseigner")}</div>
    <div class="project-progress">
      <div class="project-progress-heading"><span>Avancement moyen des lots</span><strong>${progress ? `${progress.percent} %` : "—"}</strong></div>
      <div class="project-progress-track" role="progressbar" aria-label="Avancement moyen du projet" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress ? progress.percent : 0}"><span style="width:${progress ? progress.percent : 0}%"></span></div>
      <p>${progress ? `Dernière mise à jour · ${escapeHtml(shortDate(progress.date))}` : "Ajoutez les pourcentages dans le point du jour"}</p>
    </div>
    <div class="project-card-foot"><span>${project.reports.length} rapport${project.reports.length === 1 ? "" : "s"}${lastReport ? ` · Dernier le ${shortDate(lastReport.date)}` : ""}</span><span class="card-arrow">↗</span></div>
  </article>`;
}

function emptyProjects() {
  return `<div class="empty-state"><div class="empty-icon">＋</div><h3>Votre prochain chantier commence ici</h3><p>Créez un projet pour centraliser ses informations et rapports journaliers.</p><button class="button button-primary" data-action="new-project">Créer un projet <span>→</span></button></div>`;
}

function renderProject(project) {
  const sortedReports = [...project.reports].sort((a, b) => b.date.localeCompare(a.date));
  const progress = projectProgress(project);
  const statusClass = project.status === "À venir" ? "upcoming" : project.status === "Terminé" ? "completed" : "";
  $("#project-view").innerHTML = `
    <div class="project-hero">
      <div><p class="eyebrow">FICHE CHANTIER</p><div class="project-title-line"><h1>${escapeHtml(project.name)}</h1><span class="status-pill ${statusClass}">${escapeHtml(project.status)}</span></div>
      <p class="hero-subtitle">${escapeHtml([project.location, project.client].filter(Boolean).join(" · ") || "Informations du projet et journal de chantier")}</p></div>
      <div class="hero-actions"><button class="button button-quiet button-small" data-action="edit-project">Modifier</button><button class="button button-primary button-small" data-action="new-report">+ Point du jour</button></div>
    </div>
    <div class="project-tabs"><button class="tab ${activeTab === "reports" ? "active" : ""}" data-tab="reports">Journal quotidien <span>(${project.reports.length})</span></button><button class="tab ${activeTab === "inventory" ? "active" : ""}" data-tab="inventory">Magasin <span>(${(project.inventory || []).length})</span></button><button class="tab ${activeTab === "orders" ? "active" : ""}" data-tab="orders">Commandes <span>(${(project.orders || []).length})</span></button><button class="tab ${activeTab === "info" ? "active" : ""}" data-tab="info">Informations du projet</button></div>
    ${activeTab === "reports" ? `<div class="detail-layout"><div>${sortedReports.length ? `<div class="report-list">${sortedReports.map(reportCard).join("")}</div>` : `<div class="report-empty">Aucun rapport pour le moment. Ajoutez le premier point du jour de ce chantier.</div>`}</div>
      <aside class="info-column"><section class="info-card"><h3>Résumé du chantier</h3><div class="info-row"><span>CLIENT</span><strong>${escapeHtml(project.client || "Non renseigné")}</strong></div><div class="info-row"><span>LOCALISATION</span><strong>${escapeHtml(project.location || "Non renseignée")}</strong></div><div class="info-row"><span>DÉMARRAGE</span><strong>${escapeHtml(project.startDate ? formatDate(project.startDate) : "Non renseigné")}</strong></div><div class="info-row"><span>STATUT</span><strong>${escapeHtml(project.status)}</strong></div></section>
      <section class="info-card"><h3>Activité</h3><div class="side-stat"><span>Rapports</span><strong>${project.reports.length}</strong></div><div class="side-stat"><span>Articles en magasin</span><strong>${(project.inventory || []).length}</strong></div><div class="side-stat"><span>Commandes</span><strong>${(project.orders || []).length}</strong></div><div class="side-stat"><span>Dernière mise à jour</span><strong>${sortedReports[0] ? shortDate(sortedReports[0].date) : "—"}</strong></div><div class="side-stat"><span>Avancement moyen</span><strong>${progress ? `${progress.percent} %` : "—"}</strong></div></section></aside></div>` : activeTab === "inventory" ? inventoryView(project) : activeTab === "orders" ? ordersView(project) : projectInfo(project)}`;
  loadSavedPhotos($("#project-view"));
}

function inventoryView(project) {
  const inventory = Array.isArray(project.inventory) ? project.inventory : [];
  return `<div class="inventory-heading"><div><h2>Stock du chantier</h2><p class="section-subtitle">Suivez les quantités disponibles, les entrées et les sorties de chaque article.</p></div><button class="button button-primary button-small" data-action="new-stock">+ Ajouter un article</button></div>
    ${inventory.length ? `<div class="stock-grid">${inventory.map(stockCard).join("")}</div>` : `<div class="report-empty stock-empty">Aucun article enregistré. Ajoutez le matériel disponible sur ce chantier.</div>`}`;
}

function stockMovements(item) {
  if (Array.isArray(item.movements)) return item.movements;
  const quantity = Number(item.quantity) || 0;
  return quantity > 0 ? [{ id: "opening-balance", type: "in", quantity, date: "", note: "Solde initial — avant le suivi des mouvements" }] : [];
}

function stockCard(item) {
  const formatQuantity = value => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value);
  const quantity = Number(item.quantity) || 0;
  const movements = stockMovements(item);
  const incoming = movements.filter(movement => movement.type === "in").reduce((sum, movement) => sum + Number(movement.quantity || 0), 0);
  const outgoing = movements.filter(movement => movement.type === "out").reduce((sum, movement) => sum + Number(movement.quantity || 0), 0);
  const sortedMovements = [...movements].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return `<article class="stock-card">
    <div class="stock-card-header"><div class="stock-card-main"><span class="stock-glyph">▦</span><div><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.category || "Autre")}</p></div></div><div class="stock-quantity"><strong>${escapeHtml(formatQuantity(quantity))}</strong><span>reste · ${escapeHtml(item.unit)}</span></div></div>
    <div class="stock-balances"><div><span>Entrées</span><strong>+ ${escapeHtml(formatQuantity(incoming))} ${escapeHtml(item.unit)}</strong></div><div><span>Sorties</span><strong>− ${escapeHtml(formatQuantity(outgoing))} ${escapeHtml(item.unit)}</strong></div><div><span>Disponible</span><strong>${escapeHtml(formatQuantity(quantity))} ${escapeHtml(item.unit)}</strong></div></div>
    <div class="stock-actions"><button class="button button-quiet button-small" data-action="stock-in" data-stock-id="${escapeHtml(item.id)}">+ Entrée</button><button class="button button-quiet button-small" data-action="stock-out" data-stock-id="${escapeHtml(item.id)}">− Sortie</button><button class="text-button" data-action="edit-stock" data-stock-id="${escapeHtml(item.id)}">Modifier l’article</button><button class="text-button delete-stock" data-action="delete-stock" data-stock-id="${escapeHtml(item.id)}">Supprimer</button></div>
    <details class="stock-history"><summary>Historique des mouvements (${movements.length})</summary>${sortedMovements.length ? `<div class="movement-list">${sortedMovements.map(movement => `<div class="movement-row"><span class="movement-kind ${movement.type === "out" ? "out" : "in"}">${movement.type === "out" ? "Sortie" : "Entrée"}</span><span class="movement-date">${movement.date ? escapeHtml(formatDate(movement.date)) : "Solde initial"}</span><strong>${movement.type === "out" ? "−" : "+"} ${escapeHtml(formatQuantity(Number(movement.quantity) || 0))} ${escapeHtml(item.unit)}</strong>${movement.note ? `<span class="movement-note">${escapeHtml(movement.note)}</span>` : ""}</div>`).join("")}</div>` : `<p class="movement-empty">Aucun mouvement enregistré.</p>`}</details>
  </article>`;
}

function ordersView(project) {
  const orders = Array.isArray(project.orders) ? project.orders : [];
  const sortedOrders = [...orders].sort((a, b) => b.date.localeCompare(a.date));
  return `<div class="inventory-heading"><div><h2>Commandes du chantier</h2><p class="section-subtitle">Suivez les demandes, fournisseurs et livraisons de ce projet.</p></div><button class="button button-primary button-small" data-action="new-order">+ Ajouter une commande</button></div>
    ${sortedOrders.length ? `<div class="orders-list">${sortedOrders.map(orderCard).join("")}</div>` : `<div class="report-empty stock-empty">Aucune commande enregistrée. Ajoutez la première commande de ce chantier.</div>`}`;
}

function orderCard(order) {
  const statusLabels = { pending: "À commander", ordered: "Commandée", partial: "Partiellement reçue", received: "Reçue" };
  const quantity = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(Number(order.quantity) || 0);
  return `<article class="order-card">
    <div class="order-card-top"><div><p class="order-date">${escapeHtml(formatDate(order.date))}${order.reference ? ` <span>· ${escapeHtml(order.reference)}</span>` : ""}</p><h3>${escapeHtml(order.item)}</h3><p class="order-supplier">Fournisseur : <strong>${escapeHtml(order.supplier)}</strong></p></div><span class="order-status ${escapeHtml(order.status)}">${escapeHtml(statusLabels[order.status] || statusLabels.pending)}</span></div>
    <div class="order-card-bottom"><div class="order-facts"><span>Quantité <strong>${escapeHtml(quantity)} ${escapeHtml(order.unit)}</strong></span>${order.expectedDate ? `<span>Livraison prévue <strong>${escapeHtml(formatDate(order.expectedDate))}</strong></span>` : ""}</div><div class="order-actions"><button class="button button-quiet button-small" data-action="edit-order" data-order-id="${escapeHtml(order.id)}">Modifier</button><button class="text-button delete-stock" data-action="delete-order" data-order-id="${escapeHtml(order.id)}">Supprimer</button></div></div>
    ${order.note ? `<p class="order-note">${escapeHtml(order.note)}</p>` : ""}
  </article>`;
}

function reportCard(report) {
  const progress = Array.isArray(report.progress) ? report.progress : [];
  const photos = Array.isArray(report.photos) ? report.photos : [];
  const legacyPhotos = typeof report.photos === "string" ? report.photos : "";
  const fact = (label, value) => value !== "" && value !== null && value !== undefined ? `<span>${label} <strong>${escapeHtml(value)}</strong></span>` : "";
  const section = (title, value) => value ? `<div class="report-section"><h4>${title}</h4><p>${escapeHtml(value)}</p></div>` : "";
  return `<article class="report-card">
    <div class="report-date-row"><div class="report-date">${escapeHtml(formatDate(report.date))}<small>Point du jour</small></div><span class="report-tag">Rapport journalier</span></div>
    <div class="report-facts">${fact("Effectif", report.crew)}${fact("Sous-traitants", report.subcontractors)}${report.weather ? `<span>${escapeHtml(report.weather)}</span>` : ""}</div>
    ${section("Travaux réalisés", report.work)}
    ${progress.length ? `<div class="report-section"><h4>Avancement par lot / niveau</h4><div class="progress-list">${progress.map(item => `<div class="progress-item"><div class="progress-item-top"><span>${escapeHtml([item.lot, item.level].filter(Boolean).join(" · ") || "Avancement")}</span><strong>${escapeHtml(item.percent)} %</strong></div><div class="progress-track"><div class="progress-fill" style="width:${Math.max(0, Math.min(100, Number(item.percent) || 0))}%"></div></div></div>`).join("")}</div></div>` : ""}
    ${section("Blocages", report.blockers)}${section("Besoins", report.needs)}${section("Sécurité", report.safety)}${section("Programme de demain", report.tomorrow)}${section("Photos envoyées", legacyPhotos)}
    ${photos.length ? `<div class="report-section"><h4>Photos de l’avancement</h4><div class="photo-grid saved-photo-grid">${photos.map(photo => `<figure class="saved-photo"><img data-photo-id="${escapeHtml(photo.id)}" alt="${escapeHtml(photo.name || "Photo de chantier")}"><figcaption>${escapeHtml(photo.comment || photo.name || "")}</figcaption></figure>`).join("")}</div></div>` : ""}
  </article>`;
}

function projectInfo(project) {
  return `<div class="detail-layout"><section class="info-card"><h3>Informations générales</h3>
    <div class="info-row"><span>NOM DU PROJET</span><strong>${escapeHtml(project.name)}</strong></div>
    <div class="info-row"><span>CLIENT</span><strong>${escapeHtml(project.client || "Non renseigné")}</strong></div>
    <div class="info-row"><span>LOCALISATION</span><strong>${escapeHtml(project.location || "Non renseignée")}</strong></div>
    <div class="info-row"><span>DATE DE DÉBUT</span><strong>${escapeHtml(project.startDate ? formatDate(project.startDate) : "Non renseignée")}</strong></div>
    <div class="info-row"><span>STATUT</span><strong>${escapeHtml(project.status)}</strong></div>
    <div class="info-row"><span>DESCRIPTION</span><p class="info-description">${escapeHtml(project.description || "Aucune description.")}</p></div></section>
    <aside class="info-card"><h3>Historique</h3><div class="side-stat"><span>Rapports journaliers</span><strong>${project.reports.length}</strong></div><p class="info-description" style="margin-top:13px">Tous les points du jour de ce projet sont conservés dans l’onglet « Journal quotidien ».</p></aside></div>`;
}

function openModal(id) {
  const modal = document.getElementById(id);
  modal.classList.remove("hidden");
  const firstInput = modal.querySelector("input");
  if (firstInput) firstInput.focus();
}
function closeModals() {
  document.querySelectorAll(".modal-backdrop").forEach(modal => modal.classList.add("hidden"));
}
function showProjectForm(project = null) {
  const form = $("#project-form");
  form.reset();
  form.dataset.editId = project?.id || "";
  $("#project-modal-title").textContent = project ? "Modifier le projet" : "Créer un projet";
  if (project) {
    Object.entries({ name: project.name, client: project.client, location: project.location, startDate: project.startDate, status: project.status, description: project.description }).forEach(([key, value]) => { form.elements[key].value = value || ""; });
  }
  openModal("project-modal");
}
function showStockForm(item = null) {
  const form = $("#stock-form");
  form.reset();
  form.dataset.editId = item?.id || "";
  $("#stock-modal-title").textContent = item ? "Modifier le stock" : "Ajouter un article";
  const quantityField = $("#stock-quantity-field");
  quantityField.hidden = Boolean(item);
  form.elements.quantity.disabled = Boolean(item);
  form.elements.unit.disabled = Boolean(item);
  if (item) {
    form.elements.name.value = item.name;
    form.elements.category.value = item.category || "Autre";
    form.elements.unit.value = item.unit;
  }
  openModal("stock-modal");
}
function showMovementForm(item, type) {
  const form = $("#movement-form");
  form.reset();
  form.dataset.stockId = item.id;
  form.dataset.movementType = type;
  const isIncoming = type === "in";
  $("#movement-modal-title").textContent = isIncoming ? "Enregistrer une entrée" : "Enregistrer une sortie";
  $("#movement-item-name").textContent = `${item.name} · Stock disponible : ${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(Number(item.quantity) || 0)} ${item.unit}`;
  $("#movement-note-label").innerHTML = isIncoming
    ? 'Fournisseur / détail<input name="note" placeholder="Fournisseur, bon de livraison…">'
    : 'Destinataire / détail<input name="note" placeholder="Équipe, zone du chantier…">';
  $("#movement-error").classList.add("hidden");
  $("#movement-error").textContent = "";
  form.elements.date.value = todayISO();
  openModal("movement-modal");
}
function showOrderForm(order = null) {
  const form = $("#order-form");
  form.reset();
  form.dataset.editId = order?.id || "";
  $("#order-modal-title").textContent = order ? "Modifier la commande" : "Ajouter une commande";
  if (order) {
    Object.entries({
      date: order.date,
      reference: order.reference,
      supplier: order.supplier,
      item: order.item,
      quantity: order.quantity,
      unit: order.unit,
      expectedDate: order.expectedDate,
      status: order.status,
      note: order.note
    }).forEach(([key, value]) => { form.elements.namedItem(key).value = value || ""; });
  } else {
    form.elements.date.value = todayISO();
  }
  openModal("order-modal");
}
function addProgressRow(values = {}) {
  const row = document.createElement("div");
  row.className = "progress-row";
  row.innerHTML = `<input name="lot" aria-label="Lot" placeholder="Lot (ex. Gros œuvre)" value="${escapeHtml(values.lot || "")}"><input name="level" aria-label="Niveau" placeholder="Niveau (ex. R+1)" value="${escapeHtml(values.level || "")}"><input name="percent" aria-label="Pourcentage" type="number" min="0" max="100" placeholder="%" value="${escapeHtml(values.percent ?? "")}"><button type="button" class="remove-progress" aria-label="Supprimer la ligne">×</button>`;
  $("#progress-rows").append(row);
}

function renderPhotoDrafts() {
  $("#report-photo-drafts").innerHTML = photoDrafts.map(photo => `
    <figure class="photo-draft">
      <img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.file.name)}">
      <button type="button" class="photo-remove" data-remove-photo="${escapeHtml(photo.id)}" aria-label="Retirer cette photo">×</button>
      <figcaption>${escapeHtml(photo.file.name)}</figcaption>
      <label>Commentaire<textarea data-photo-comment="${escapeHtml(photo.id)}" rows="2" placeholder="Décrivez l’avancement visible…">${escapeHtml(photo.comment)}</textarea></label>
    </figure>`).join("");
}

function clearPhotoDrafts() {
  photoDrafts.forEach(photo => URL.revokeObjectURL(photo.url));
  photoDrafts = [];
  renderPhotoDrafts();
}

document.addEventListener("click", event => {
  const projectLink = event.target.closest("[data-project-id]");
  if (projectLink) {
    event.preventDefault();
    activeProjectId = projectLink.dataset.projectId;
    activeTab = "reports";
    render();
    return;
  }
  const card = event.target.closest("[data-open-project]");
  if (card) {
    activeProjectId = card.dataset.openProject;
    activeTab = "reports";
    render();
    return;
  }
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (action === "new-project") showProjectForm();
  if (action === "new-report") {
    const form = $("#report-form");
    form.reset();
    form.elements.date.value = todayISO();
    clearPhotoDrafts();
    $("#progress-rows").replaceChildren();
    addProgressRow();
    openModal("report-modal");
  }
  if (action === "new-stock") showStockForm();
  if (action === "stock-in" || action === "stock-out") {
    const project = state.projects.find(item => item.id === activeProjectId);
    const stockItem = project?.inventory?.find(item => item.id === event.target.closest("[data-stock-id]").dataset.stockId);
    if (stockItem) showMovementForm(stockItem, action === "stock-in" ? "in" : "out");
  }
  if (action === "new-order") showOrderForm();
  if (action === "edit-order") {
    const project = state.projects.find(item => item.id === activeProjectId);
    const order = project?.orders?.find(item => item.id === event.target.closest("[data-order-id]").dataset.orderId);
    if (order) showOrderForm(order);
  }
  if (action === "delete-order") {
    const project = state.projects.find(item => item.id === activeProjectId);
    const orderId = event.target.closest("[data-order-id]").dataset.orderId;
    if (project && window.confirm("Supprimer cette commande de ce projet ?")) {
      project.orders = (project.orders || []).filter(order => order.id !== orderId);
      persist();
      render();
    }
  }
  if (action === "edit-stock") {
    const project = state.projects.find(item => item.id === activeProjectId);
    const stockItem = project?.inventory?.find(item => item.id === event.target.closest("[data-stock-id]").dataset.stockId);
    if (stockItem) showStockForm(stockItem);
  }
  if (action === "delete-stock") {
    const project = state.projects.find(item => item.id === activeProjectId);
    const stockId = event.target.closest("[data-stock-id]").dataset.stockId;
    if (project && window.confirm("Supprimer cet article du magasin de ce projet ?")) {
      project.inventory = (project.inventory || []).filter(item => item.id !== stockId);
      persist();
      render();
    }
  }
  const removePhotoId = event.target.closest("[data-remove-photo]")?.dataset.removePhoto;
  if (removePhotoId) {
    const photo = photoDrafts.find(item => item.id === removePhotoId);
    if (photo) URL.revokeObjectURL(photo.url);
    photoDrafts = photoDrafts.filter(item => item.id !== removePhotoId);
    renderPhotoDrafts();
  }
  if (action === "edit-project") showProjectForm(state.projects.find(item => item.id === activeProjectId));
  if (event.target.closest(".close-modal")) closeModals();
  const tab = event.target.closest("[data-tab]");
  if (tab) { activeTab = tab.dataset.tab; render(); }
  if (event.target.closest("#add-progress")) addProgressRow();
  if (event.target.closest(".remove-progress")) event.target.closest(".progress-row").remove();
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeModals();
  if ((event.key === "Enter" || event.key === " ") && event.target.matches("[data-open-project]")) {
    event.preventDefault();
    activeProjectId = event.target.dataset.openProject;
    activeTab = "reports";
    render();
  }
});

document.querySelectorAll(".modal-backdrop").forEach(modal => modal.addEventListener("click", event => {
  if (event.target === modal) closeModals();
}));

$("#new-project-shortcut").addEventListener("click", () => showProjectForm());
$("#project-form").addEventListener("submit", event => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  const editId = form.dataset.editId;
  if (editId) {
    const project = state.projects.find(item => item.id === editId);
    Object.assign(project, data);
  } else {
    const project = { ...data, id: crypto.randomUUID(), createdAt: new Date().toISOString(), inventory: [], orders: [], reports: [] };
    state.projects.unshift(project);
    activeProjectId = project.id;
    activeTab = "reports";
  }
  persist();
  closeModals();
  render();
});

$("#stock-form").addEventListener("submit", event => {
  event.preventDefault();
  const project = state.projects.find(item => item.id === activeProjectId);
  if (!project) return;
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  const quantity = Number(data.quantity);
  project.inventory = Array.isArray(project.inventory) ? project.inventory : [];
  const editId = form.dataset.editId;
  if (editId) {
    const item = project.inventory.find(stock => stock.id === editId);
    if (!item) return;
    Object.assign(item, { name: data.name.trim(), category: data.category });
  } else {
    const existing = project.inventory.find(item => item.name.toLocaleLowerCase() === data.name.trim().toLocaleLowerCase() && item.unit.toLocaleLowerCase() === data.unit.trim().toLocaleLowerCase());
    const movement = { id: crypto.randomUUID(), type: "in", quantity, date: todayISO(), note: existing ? "Ajout au magasin" : "Stock initial" };
    if (existing) {
      existing.movements = stockMovements(existing);
      existing.quantity = Number(existing.quantity) + quantity;
      if (quantity > 0) existing.movements.push(movement);
    } else {
      project.inventory.push({ id: crypto.randomUUID(), name: data.name.trim(), category: data.category, quantity, unit: data.unit.trim(), movements: quantity > 0 ? [movement] : [] });
    }
  }
  persist();
  closeModals();
  render();
});

$("#movement-form").addEventListener("submit", event => {
  event.preventDefault();
  const project = state.projects.find(item => item.id === activeProjectId);
  const form = event.currentTarget;
  const item = project?.inventory?.find(stock => stock.id === form.dataset.stockId);
  if (!item) return;
  const quantity = Number(form.elements.quantity.value);
  const type = form.dataset.movementType;
  const error = $("#movement-error");
  if (type === "out" && quantity > Number(item.quantity)) {
    error.textContent = `Stock insuffisant : il reste ${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(Number(item.quantity) || 0)} ${item.unit}.`;
    error.classList.remove("hidden");
    return;
  }
  item.movements = stockMovements(item);
  item.movements.push({
    id: crypto.randomUUID(),
    type,
    quantity,
    date: form.elements.date.value,
    note: form.elements.note.value.trim()
  });
  item.quantity = Number(item.quantity) + (type === "in" ? quantity : -quantity);
  persist();
  closeModals();
  render();
});

$("#order-form").addEventListener("submit", event => {
  event.preventDefault();
  const project = state.projects.find(item => item.id === activeProjectId);
  if (!project) return;
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  project.orders = Array.isArray(project.orders) ? project.orders : [];
  const orderData = {
    date: data.date,
    reference: data.reference.trim(),
    supplier: data.supplier.trim(),
    item: data.item.trim(),
    quantity: Number(data.quantity),
    unit: data.unit.trim(),
    expectedDate: data.expectedDate,
    status: data.status,
    note: data.note.trim()
  };
  const editId = form.dataset.editId;
  if (editId) {
    const order = project.orders.find(item => item.id === editId);
    if (!order) return;
    Object.assign(order, orderData);
  } else {
    project.orders.push({ id: crypto.randomUUID(), ...orderData });
  }
  persist();
  closeModals();
  render();
});

$("#report-photo-input").addEventListener("change", event => {
  [...event.target.files].forEach(file => {
    photoDrafts.push({ id: crypto.randomUUID(), file, comment: "", url: URL.createObjectURL(file) });
  });
  event.target.value = "";
  renderPhotoDrafts();
});

$("#report-photo-drafts").addEventListener("input", event => {
  const photoId = event.target.dataset.photoComment;
  if (photoId) {
    const photo = photoDrafts.find(item => item.id === photoId);
    if (photo) photo.comment = event.target.value;
  }
});

$("#report-form").addEventListener("submit", async event => {
  event.preventDefault();
  const project = state.projects.find(item => item.id === activeProjectId);
  if (!project) return;
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  const progress = [...$("#progress-rows").querySelectorAll(".progress-row")].map(row => ({
    lot: row.querySelector('[name="lot"]').value.trim(),
    level: row.querySelector('[name="level"]').value.trim(),
    percent: row.querySelector('[name="percent"]').value
  })).filter(item => item.lot || item.level || item.percent !== "");
  const reportId = crypto.randomUUID();
  const photos = photoDrafts.map(photo => ({
    id: photo.id,
    name: photo.file.name,
    comment: $("#report-photo-drafts").querySelector(`[data-photo-comment="${photo.id}"]`).value.trim(),
    file: photo.file
  }));
  const submitButton = form.querySelector('[type="submit"]');
  submitButton.disabled = true;
  try {
    for (const photo of photos) await storePhoto(photo.id, photo.file);
    project.reports.push({
      id: reportId,
      date: data.date,
      crew: data.crew,
      subcontractors: data.subcontractors,
      weather: data.weather.trim(),
      work: data.work.trim(),
      progress,
      blockers: data.blockers.trim(),
      needs: data.needs.trim(),
      safety: data.safety.trim(),
      tomorrow: data.tomorrow.trim(),
      photos: photos.map(({ id, name, comment }) => ({ id, name, comment }))
    });
    persist();
    clearPhotoDrafts();
    closeModals();
    render();
  } catch (error) {
    project.reports = project.reports.filter(report => report.id !== reportId);
    await Promise.all(photos.map(async photo => {
      try {
        await deletePhoto(photo.id);
      } catch (cleanupError) {
        console.error("Impossible de nettoyer une photo non enregistrée.", cleanupError);
      }
    }));
    console.error("Impossible d’enregistrer le rapport et ses photos.", error);
    window.alert("Le rapport ou ses photos n’ont pas pu être enregistrés. Vérifiez l’espace de stockage disponible, puis réessayez.");
  } finally {
    submitButton.disabled = false;
  }
});

const today = new Date();
$("#today-label").textContent = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(today);
render();
