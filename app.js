const STORAGE_KEY = "tonibbq-state-v4";
const TOAST_DURATION_MS = 3200;

const defaultItems = [
    { name: "Carbon", quantity: "", ownerId: "" },
    { name: "Hamburguesas", quantity: "", ownerId: "" },
    { name: "Pan hamburguesas", quantity: "", ownerId: "" },
    { name: "Perritos", quantity: "", ownerId: "" },
    { name: "Pan perritos", quantity: "", ownerId: "" },
    { name: "Carne adultos", quantity: "", ownerId: "" },
    { name: "Pan barras", quantity: "", ownerId: "" },
    { name: "Hielos", quantity: "", ownerId: "" },
    { name: "Cerveza", quantity: "", ownerId: "" },
    { name: "Vino", quantity: "", ownerId: "" },
    { name: "Postre", quantity: "", ownerId: "" },
    { name: "Cafe", quantity: "", ownerId: "" },
    { name: "Aperitivo", quantity: "", ownerId: "" }
];

const initialState = {
    groupCode: "",
    currentFriendId: "",
    clientId: createId(),
    lastSyncedAt: "",
    plan: blankPlan(),
    archivedPlans: [],
    friends: [],
    items: [],
    messages: []
};

const uiState = {
    editingItemId: "",
    deferredInstallPrompt: null,
    archivingInFlight: false,
    currentView: "group",
    selectedArchivedPlanId: ""
};

const APP_CONFIG = window.TONIBBQ_CONFIG || {};
const LOCAL_API_BASE = String(APP_CONFIG.backendUrl || "").replace(/\/$/, "");
const dataProvider = LOCAL_API_BASE
    ? "local-api"
    : APP_CONFIG.supabaseUrl && APP_CONFIG.supabaseAnonKey && window.supabase && typeof window.supabase.createClient === "function"
        ? "supabase"
        : "demo";
const hasSupabaseConfig = Boolean(
    dataProvider === "supabase"
);

const supabaseClient = hasSupabaseConfig
    ? window.supabase.createClient(
        APP_CONFIG.supabaseUrl,
        APP_CONFIG.supabaseAnonKey
    )
    : null;

const state = loadState();
let activeChannel = null;
let localPollTimer = 0;
let localRevision = 0;
let lastSeenMessageId = getLastSeenMessageId(state.messages);

const elements = {
    friendName: document.getElementById("friendName"),
    groupCode: document.getElementById("groupCode"),
    joinGroupButton: document.getElementById("joinGroupButton"),
    shareGroupButton: document.getElementById("shareGroupButton"),
    activeGroupChip: document.getElementById("activeGroupChip"),
    appNav: document.getElementById("appNav"),
    friendStrip: document.getElementById("friendStrip"),
    bbqDate: document.getElementById("bbqDate"),
    responseDeadlineMode: document.getElementById("responseDeadlineMode"),
    responseDeadlineField: document.getElementById("responseDeadlineField"),
    responseDeadlineDate: document.getElementById("responseDeadlineDate"),
    adultsCount: document.getElementById("adultsCount"),
    childrenCount: document.getElementById("childrenCount"),
    bbqReserved: document.getElementById("bbqReserved"),
    tablesReserved: document.getElementById("tablesReserved"),
    planNotes: document.getElementById("planNotes"),
    goToGroupButton: document.getElementById("goToGroupButton"),
    savePlanButton: document.getElementById("savePlanButton"),
    planSummary: document.getElementById("planSummary"),
    newItemName: document.getElementById("newItemName"),
    newItemQty: document.getElementById("newItemQty"),
    newItemOwner: document.getElementById("newItemOwner"),
    addItemButton: document.getElementById("addItemButton"),
    toggleAddItemButton: document.getElementById("toggleAddItemButton"),
    addItemPanel: document.getElementById("addItemPanel"),
    shoppingList: document.getElementById("shoppingList"),
    assignmentsGrid: document.getElementById("assignmentsGrid"),
    itemsCounter: document.getElementById("itemsCounter"),
    syncStatus: document.getElementById("syncStatus"),
    chatThread: document.getElementById("chatThread"),
    chatMessage: document.getElementById("chatMessage"),
    chatPhotoInput: document.getElementById("chatPhotoInput"),
    sendPhotoButton: document.getElementById("sendPhotoButton"),
    sendMessageButton: document.getElementById("sendMessageButton"),
    messagesCounter: document.getElementById("messagesCounter"),
    setupGuide: document.getElementById("setupGuide"),
    summarySection: document.getElementById("summarySection"),
    archivedPlansList: document.getElementById("archivedPlansList"),
    archivedPlanDetail: document.getElementById("archivedPlanDetail"),
    overviewSection: document.getElementById("overviewSection"),
    overviewGrid: document.getElementById("overviewGrid"),
    overviewNote: document.getElementById("overviewNote"),
    installAppButton: document.getElementById("installAppButton"),
    toastStack: document.getElementById("toastStack"),
    liveRegion: document.getElementById("liveRegion")
};

hydrateInputs();
hydrateSharedGroupFromUrl();
bindEvents();
render();
initializeApp();

function bindEvents() {
    elements.appNav.querySelectorAll("[data-view]").forEach((button) => {
        button.addEventListener("click", () => {
            const nextView = button.getAttribute("data-view") || "group";
            setCurrentView(nextView);
        });
    });

    elements.joinGroupButton.addEventListener("click", () => {
        withButtonState(elements.joinGroupButton, "Entrando...", joinGroup);
    });

    elements.shareGroupButton.addEventListener("click", () => {
        withButtonState(elements.shareGroupButton, "Preparando...", inviteFriends);
    });

    elements.goToGroupButton.addEventListener("click", () => {
        setCurrentView("group");
    });

    elements.savePlanButton.addEventListener("click", () => {
        withButtonState(elements.savePlanButton, "Guardando plan...", savePlan);
    });

    elements.responseDeadlineMode.addEventListener("change", syncResponseDeadlineVisibility);

    elements.addItemButton.addEventListener("click", () => {
        withButtonState(elements.addItemButton, "Anadiendo...", addItem);
    });

    elements.sendMessageButton.addEventListener("click", () => {
        withButtonState(elements.sendMessageButton, "Enviando...", sendMessage);
    });

    elements.sendPhotoButton.addEventListener("click", () => {
        if (!ensurePlanEditable("enviar fotos")) {
            return;
        }
        elements.chatPhotoInput.click();
    });

    elements.toggleAddItemButton.addEventListener("click", () => {
        const expanded = elements.toggleAddItemButton.getAttribute("aria-expanded") === "true";
        elements.toggleAddItemButton.setAttribute("aria-expanded", String(!expanded));
        elements.addItemPanel.classList.toggle("hidden-view", expanded);
    });

    elements.chatMessage.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            elements.sendMessageButton.click();
        }
    });

    elements.chatPhotoInput.addEventListener("change", async (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        await withButtonState(elements.sendPhotoButton, "Procesando foto...", async () => {
            await sendPhotoMessage(file);
        });
        event.target.value = "";
    });

    elements.installAppButton.addEventListener("click", installPwa);
}

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return cloneInitialState();
        const parsed = JSON.parse(raw);
        return normalizeClientState({ ...cloneInitialState(), ...parsed });
    } catch (error) {
        return cloneInitialState();
    }
}

function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
        const nextState = normalizeClientState({ ...cloneInitialState(), ...JSON.parse(event.newValue) });
        Object.assign(state, nextState);
        hydrateInputs();
        render();
    } catch (error) {
        // Ignore malformed external state.
    }
});

function hydrateInputs() {
    elements.groupCode.value = state.groupCode;
    elements.bbqDate.value = state.plan.date;
    elements.responseDeadlineMode.value = state.plan.responseDeadlineEnabled ? "date" : "none";
    elements.responseDeadlineDate.value = state.plan.responseDeadline;
    elements.adultsCount.value = state.plan.adults;
    elements.childrenCount.value = state.plan.children;
    elements.bbqReserved.value = state.plan.bbqReserved;
    elements.tablesReserved.value = state.plan.tablesReserved;
    elements.planNotes.value = state.plan.notes;
    const currentFriend = state.friends.find((friend) => friend.id === state.currentFriendId);
    elements.friendName.value = currentFriend ? currentFriend.name : "";
    syncResponseDeadlineVisibility();
}

function hydrateSharedGroupFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const sharedGroup = normalizeGroupCode(params.get("group") || "");
    if (!sharedGroup) return;
    elements.groupCode.value = sharedGroup;
    if (!state.groupCode) {
        state.groupCode = sharedGroup;
    }
}

async function initializeApp() {
    setupInstallPrompt();
    registerServiceWorker();

    if (dataProvider === "demo") {
        updateSyncBadge("Modo demo local. Configura backend local o Supabase para compartir.", "is-offline");
        showToast("Modo local", "La interfaz funciona, pero falta conectar un backend para compartirla.", "error");
        return;
    }

    if (dataProvider === "local-api") {
        updateSyncBadge("Backend local conectado", "");
    } else {
        updateSyncBadge("Supabase conectado", "");
    }

    if (state.groupCode) {
        await loadRemoteGroup(state.groupCode);
        subscribeToGroup(state.groupCode);
        await maybeArchiveExpiredPlan();
    }
}

async function joinGroup() {
    const name = elements.friendName.value.trim();
    const groupCode = normalizeGroupCode(elements.groupCode.value);

    if (!name || !groupCode) {
        showToast("Faltan datos", "Escribe tu nombre y un codigo de grupo.", "error");
        announce("Faltan datos para unirse al grupo.");
        return;
    }

    state.groupCode = groupCode;
    await loadRemoteGroup(groupCode);

    let friend = state.friends.find((entry) => entry.deviceId === state.clientId);
    if (!friend) {
        friend = findFriendByName(name) || createFriend(name);
        if (!state.friends.find((entry) => entry.id === friend.id)) {
            state.friends.push(friend);
        }
    }

    friend.name = name;
    friend.deviceId = state.clientId;
    friend.updatedAt = nowIso();

    state.currentFriendId = friend.id;
    uiState.selectedArchivedPlanId = "";
    persistAndRender();
    await syncGroup("joined the group");
    subscribeToGroup(groupCode);
    maybeRequestNotificationPermission();
    setCurrentView("plan");
    showToast("Grupo listo", `Ya estas dentro de ${groupCode}.`, "success");
}

async function savePlan() {
    if (!hasGroup()) {
        showToast("Necesitas un grupo", "Unete primero a un grupo para guardar el plan.", "error");
        return;
    }

    if (!ensurePlanEditable("guardar el plan")) {
        return;
    }

    if (elements.responseDeadlineMode.value === "date" && !elements.responseDeadlineDate.value) {
        showToast("Falta el limite", "Elige una fecha limite o deja la opcion en sin limite.", "error");
        return;
    }

    state.plan = normalizePlan({
        date: elements.bbqDate.value,
        responseDeadlineEnabled: elements.responseDeadlineMode.value === "date",
        responseDeadline: elements.responseDeadlineMode.value === "date" ? elements.responseDeadlineDate.value : "",
        adults: elements.adultsCount.value,
        children: elements.childrenCount.value,
        bbqReserved: elements.bbqReserved.value.trim(),
        tablesReserved: elements.tablesReserved.value.trim(),
        notes: elements.planNotes.value.trim(),
        archivedAt: "",
        updatedAt: nowIso()
    });

    if (!getActiveItems().length) {
        state.items = createDefaultPackItems();
    }

    persistAndRender();
    const autoArchived = await maybeArchiveExpiredPlan();
    if (!autoArchived) {
        await syncGroup("updated the plan");
    }
    setCurrentView(autoArchived ? "summary" : "shopping");
    showToast(
        autoArchived ? "Plan archivado" : "Plan guardado",
        autoArchived
            ? "La fecha ya habia pasado, asi que la BBQ queda archivada en modo lectura."
            : "La fecha y la reserva de la BBQ han quedado actualizadas.",
        "success"
    );
}

async function addItem() {
    if (!hasGroup()) {
        showToast("Sin grupo activo", "Unete a un grupo antes de anadir compras.", "error");
        return;
    }

    if (!ensurePlanEditable("anadir compras")) {
        return;
    }

    const name = elements.newItemName.value.trim();
    const quantity = elements.newItemQty.value.trim();
    const ownerId = elements.newItemOwner.value;

    if (!name) {
        showToast("Falta el item", "Anade al menos el nombre de la compra.", "error");
        return;
    }

    state.items.unshift(normalizeItem({
        id: createId(),
        name,
        quantity,
        ownerId,
        updatedAt: nowIso(),
        completedAt: "",
        deletedAt: ""
    }));

    elements.newItemName.value = "";
    elements.newItemQty.value = "";
    elements.toggleAddItemButton.setAttribute("aria-expanded", "false");
    elements.addItemPanel.classList.add("hidden-view");
    persistAndRender();
    await syncGroup("added an item");
    showToast("Compra anadida", `${name} ya esta en la lista compartida.`, "success");
}

function render() {
    renderViewState();
    renderSetupGuide();
    renderOverview();
    renderGroup();
    renderPlan();
    renderArchivedPlans();
    renderOwnerOptions();
    renderItems();
    renderAssignments();
    renderMessages();
    renderLocks();
    renderInstallButton();
}

function createDefaultPackItems() {
    return defaultItems.map((item) => normalizeItem({
        id: createId(),
        name: item.name,
        quantity: item.quantity,
        ownerId: "",
        updatedAt: nowIso(),
        completedAt: "",
        deletedAt: ""
    }));
}

function renderViewState() {
    const allowedViews = getAllowedViews();
    if (!allowedViews.includes(uiState.currentView)) {
        uiState.currentView = allowedViews[0];
    }

    const isSummary = uiState.currentView === "summary";
    const isGroup = uiState.currentView === "group";
    const isPlan = uiState.currentView === "plan";
    const isShopping = uiState.currentView === "shopping";
    const isChat = uiState.currentView === "chat";

    toggleSection(elements.summarySection, isSummary);
    toggleSection(elements.overviewSection, isSummary);
    toggleSection(document.getElementById("groupSection"), isGroup);
    toggleSection(document.getElementById("planSection"), isPlan);
    toggleSection(document.getElementById("shoppingSection"), isShopping);
    toggleSection(document.querySelector('[aria-labelledby="assignHeading"]'), isShopping);
    toggleSection(document.getElementById("chatSection"), isChat);

    elements.appNav.querySelectorAll("[data-view]").forEach((button) => {
        const view = button.getAttribute("data-view") || "group";
        button.classList.toggle("is-active", view === uiState.currentView);
        button.disabled = !allowedViews.includes(view);
    });
}

function toggleSection(section, visible) {
    if (!section) return;
    section.classList.toggle("hidden-view", !visible);
}

function setCurrentView(nextView) {
    const allowed = getAllowedViews();
    uiState.currentView = allowed.includes(nextView) ? nextView : allowed[0];
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function getAllowedViews() {
    if (!hasGroup()) {
        return ["group"];
    }

    return ["group", "plan", "shopping", "chat", "summary"];
}

function getCurrentPlanContext() {
    const archived = getSelectedArchivedPlan();
    if (archived && uiState.currentView !== "summary") {
        return {
            plan: archived.plan,
            friends: archived.friends,
            items: archived.items.filter((item) => !item.deletedAt),
            messages: archived.messages.filter((message) => !message.deletedAt),
            archived: true,
            archivedAt: archived.archivedAt
        };
    }

    return {
        plan: state.plan,
        friends: state.friends,
        items: getActiveItems(),
        messages: getActiveMessages(),
        archived: false,
        archivedAt: ""
    };
}

function renderSetupGuide() {
    const steps = [
        {
            index: 1,
            title: "Unete al grupo",
            body: hasGroup() ? `Estas dentro de ${state.groupCode}.` : "Escribe tu nombre, el codigo del grupo y entra."
        },
        {
            index: 2,
            title: "Completa el plan",
            body: isPlanReady() ? "Fecha, asistentes y reservas listos." : "Guarda fecha, adultos, ninos, BBQs y mesas."
        },
        {
            index: 3,
            title: "Reparte la compra",
            body: getActiveItems().length ? "La lista ya tiene compras para asignar." : "Carga el pack BBQ o anade compras a mano."
        }
    ];

    elements.setupGuide.innerHTML = steps
        .map((step) => {
            const done =
                (step.index === 1 && hasGroup()) ||
                (step.index === 2 && isPlanReady()) ||
                (step.index === 3 && getActiveItems().length > 0);
            return `
                <article class="setup-step ${done ? "is-done" : ""}">
                    <div class="setup-index">${step.index}</div>
                    <strong>${escapeHtml(step.title)}</strong>
                    <p>${escapeHtml(step.body)}</p>
                </article>
            `;
        })
        .join("");
}

function renderOverview() {
    const activeItems = getActiveItems();
    const pendingItems = activeItems.filter((item) => !item.completedAt).length;
    const unassignedItems = activeItems.filter((item) => !item.ownerId).length;
    const cards = [
        {
            label: "Amigos en el grupo",
            value: String(state.friends.length || 0),
            detail: hasGroup() ? "Personas dentro de la BBQ" : "Crea o entra en un grupo"
        },
        {
            label: "Items pendientes",
            value: String(pendingItems),
            detail: unassignedItems ? `${unassignedItems} sin asignar` : "Todo asignado o comprado"
        },
        {
            label: "Mensajes",
            value: String(getActiveMessages().length),
            detail: hasGroup() ? "Conversacion compartida" : "El chat se activa al unirse"
        },
        {
            label: "Planes anteriores",
            value: String(state.archivedPlans.length || 0),
            detail: state.archivedPlans.length ? "Puedes abrir el historial del grupo" : "El historial aparecera aqui"
        }
    ];

    elements.overviewGrid.innerHTML = cards
        .map((card) => `
            <article class="overview-card">
                <strong>${escapeHtml(card.label)}</strong>
                <div class="metric">${escapeHtml(card.value)}</div>
                <p>${escapeHtml(card.detail)}</p>
            </article>
        `)
        .join("");

    elements.overviewNote.textContent = getOverviewNote(pendingItems, unassignedItems);
}

function getOverviewNote(pendingItems, unassignedItems) {
    if (!hasGroup()) {
        return "Empieza por unirte al grupo o cargar la demo para activar el resto de la app.";
    }
    if (!isPlanReady()) {
        return state.archivedPlans.length
            ? "Puedes montar una nueva BBQ o abrir uno de los planes anteriores del grupo."
            : "Siguiente paso recomendado: completa el plan con fecha, asistentes, BBQs y mesas.";
    }
    if (!getActiveItems().length) {
        return "Siguiente paso recomendado: carga el pack BBQ y empieza a asignar compras.";
    }
    if (unassignedItems) {
        return `Quedan ${unassignedItems} compras sin asignar. Repartidlas para evitar olvidos.`;
    }
    if (pendingItems) {
        return `Todo esta asignado. Aun quedan ${pendingItems} compras pendientes de marcar como hechas.`;
    }
    return "La BBQ esta muy bien encaminada: plan completo, compras repartidas y chat activo.";
}

function renderGroup() {
    elements.activeGroupChip.textContent = hasArchivedPlan()
        ? `${state.groupCode || "Sin grupo"} - Archivado`
        : (state.groupCode || "Sin grupo");
    elements.activeGroupChip.classList.toggle("is-archived", hasArchivedPlan());
    elements.shareGroupButton.disabled = !hasGroup();

    if (!state.friends.length) {
        elements.friendStrip.innerHTML = "";
        return;
    }

    const visibleFriends = state.friends
        .slice()
        .sort((left, right) => left.name.localeCompare(right.name, "es"));

    elements.friendStrip.innerHTML = visibleFriends
        .map((friend) => {
            const isCurrent = friend.id === state.currentFriendId;
            return `
                <div class="friend-pill ${isCurrent ? "is-current" : ""}">
                    <strong>${escapeHtml(friend.name)}</strong>
                    <span>${isCurrent ? "Tu movil" : "Invitado"}</span>
                </div>
            `;
        })
        .join("");
}

function renderPlan() {
    const context = getCurrentPlanContext();
    elements.bbqDate.value = context.plan.date || "";
    elements.responseDeadlineMode.value = context.plan.responseDeadlineEnabled ? "date" : "none";
    elements.responseDeadlineDate.value = context.plan.responseDeadline || "";
    elements.adultsCount.value = context.plan.adults || "";
    elements.childrenCount.value = context.plan.children || "";
    elements.bbqReserved.value = context.plan.bbqReserved || "";
    elements.tablesReserved.value = context.plan.tablesReserved || "";
    elements.planNotes.value = context.plan.notes || "";
    const dateText = context.plan.date ? formatDate(context.plan.date) : "Sin fecha";
    const responseDeadlineText = context.plan.responseDeadlineEnabled && context.plan.responseDeadline
        ? formatDate(context.plan.responseDeadline)
        : "Sin limite";
    const syncText = state.lastSyncedAt ? `Ultima sync: ${formatTime(state.lastSyncedAt)}` : "Sin sincronizar";
    elements.planSummary.innerHTML = `
        <strong>${dateText}</strong><br>
        Estado: ${escapeHtml(context.archived ? `Archivado desde ${formatDateTime(context.archivedAt)}` : context.plan.date ? "Activo" : "Pendiente de crear")}<br>
        Respuestas: ${escapeHtml(responseDeadlineText)}<br>
        Adultos: ${escapeHtml(context.plan.adults || "0")}<br>
        Ninos: ${escapeHtml(context.plan.children || "0")}<br>
        ${renderPlanBadge("bbq", "BBQ reservada(s)", context.plan.bbqReserved || "Pendiente")}<br>
        Mesa(s): ${escapeHtml(context.plan.tablesReserved || "Pendiente")}<br>
        Notas: ${escapeHtml(context.plan.notes || "Sin notas todavia")}<br>
        ${escapeHtml(syncText)}
    `;

    [
        elements.bbqDate,
        elements.responseDeadlineMode,
        elements.responseDeadlineDate,
        elements.adultsCount,
        elements.childrenCount,
        elements.bbqReserved,
        elements.tablesReserved,
        elements.planNotes,
        elements.savePlanButton
    ].forEach((element) => {
        if (!element) return;
        element.disabled = context.archived;
    });

    syncResponseDeadlineVisibility();
}

function renderArchivedPlans() {
    if (!elements.archivedPlansList || !elements.archivedPlanDetail) {
        return;
    }

    if (!state.archivedPlans.length) {
        elements.archivedPlansList.innerHTML = '<div class="empty-state">Cuando una BBQ pase de fecha, su plan, compras y chat quedaran guardados aqui.</div>';
        elements.archivedPlanDetail.classList.add("hidden-view");
        elements.archivedPlanDetail.innerHTML = "";
        return;
    }

    const selected = getSelectedArchivedPlan();

    elements.archivedPlansList.innerHTML = state.archivedPlans
        .map((entry) => `
            <article class="history-card ${selected && selected.id === entry.id ? "is-selected" : ""}">
                <div class="history-top">
                    <div>
                <strong>${escapeHtml(entry.plan.date ? formatDate(entry.plan.date) : "BBQ sin fecha")}</strong>
                        <p>Archivado el ${escapeHtml(formatDateTime(entry.archivedAt))}</p>
                    </div>
                    <button class="inline-action" type="button" data-open-archived-plan="${entry.id}">
                        ${selected && selected.id === entry.id ? "Abierto" : "Abrir"}
                    </button>
                </div>
                <div class="history-metrics">
                    <span>${escapeHtml(String(entry.friendCount || entry.friends.length || 0))} amigos</span>
                    <span>${escapeHtml(String(entry.pendingItems || 0))} pendientes</span>
                    <span>${escapeHtml(String(entry.completedItems || 0))} comprados</span>
                    <span>${escapeHtml(String(entry.messageCount || entry.messages.length || 0))} mensajes</span>
                </div>
            </article>
        `)
        .join("");

    document.querySelectorAll("[data-open-archived-plan]").forEach((button) => {
        button.addEventListener("click", () => {
            uiState.selectedArchivedPlanId = button.getAttribute("data-open-archived-plan") || "";
            setCurrentView("plan");
        });
    });

    if (!selected) {
        elements.archivedPlanDetail.classList.add("hidden-view");
        elements.archivedPlanDetail.innerHTML = "";
        return;
    }

    elements.archivedPlanDetail.classList.remove("hidden-view");
    elements.archivedPlanDetail.innerHTML = `
        <div class="history-detail-head">
            <div>
                <p class="eyebrow">Plan archivado</p>
                <h3>${escapeHtml(selected.plan.date ? formatDate(selected.plan.date) : "BBQ sin fecha")}</h3>
            </div>
            <button class="inline-action" type="button" id="closeArchivedPlanButton">Cerrar</button>
        </div>
        <div class="history-detail-grid">
            <article class="summary-card">
                <strong>Plan</strong><br>
                Adultos: ${escapeHtml(selected.plan.adults || "0")}<br>
                Ninos: ${escapeHtml(selected.plan.children || "0")}<br>
                Respuestas: ${escapeHtml(selected.plan.responseDeadlineEnabled && selected.plan.responseDeadline ? formatDate(selected.plan.responseDeadline) : "Sin limite")}<br>
                BBQ: ${escapeHtml(selected.plan.bbqReserved || "Pendiente")}<br>
                Mesas: ${escapeHtml(selected.plan.tablesReserved || "Pendiente")}<br>
                Notas: ${escapeHtml(selected.plan.notes || "Sin notas")}<br>
            </article>
            <article class="summary-card">
                <strong>Compra</strong><br>
                Pendientes: ${escapeHtml(String(selected.pendingItems || 0))}<br>
                Comprados: ${escapeHtml(String(selected.completedItems || 0))}<br>
                Total items: ${escapeHtml(String(selected.items.length || 0))}<br>
                Mensajes: ${escapeHtml(String(selected.messages.length || 0))}<br>
            </article>
        </div>
        <div class="history-chat">
            <strong>Chat del plan</strong>
            <div class="chat-thread history-chat-thread">
                ${
                    selected.messages.length
                        ? selected.messages.map((message) => renderArchivedMessage(message, selected.friends)).join("")
                        : '<div class="empty-state">Este plan no tuvo mensajes guardados.</div>'
                }
            </div>
        </div>
    `;

    const closeButton = document.getElementById("closeArchivedPlanButton");
    if (closeButton) {
        closeButton.addEventListener("click", () => {
            uiState.selectedArchivedPlanId = "";
            renderArchivedPlans();
        });
    }
}

function renderOwnerOptions() {
    const context = getCurrentPlanContext();
    const options = ['<option value="">Sin asignar</option>']
        .concat(
            context.friends.map(
                (friend) => `<option value="${friend.id}">${escapeHtml(friend.name)}</option>`
            )
        )
        .join("");

    elements.newItemOwner.innerHTML = options;
}

function renderItems() {
    const context = getCurrentPlanContext();
    const activeItems = context.items;
    const pendingUnassigned = activeItems.filter((item) => !item.completedAt && !item.ownerId);
    const pendingAssigned = activeItems.filter((item) => !item.completedAt && item.ownerId);
    const doneItems = activeItems.filter((item) => item.completedAt);

    elements.itemsCounter.textContent = `${activeItems.length} items`;

    if (!activeItems.length) {
        elements.shoppingList.innerHTML = '<div class="empty-state">Todavia no hay compras. Usa + o carga el pack BBQ.</div>';
        return;
    }

    const sections = [
        {
            title: "Por asignar",
            hint: "Empieza por repartir estas compras entre la gente.",
            items: pendingUnassigned
        },
        {
            title: "Asignado y pendiente",
            hint: "Estas compras ya tienen responsable.",
            items: pendingAssigned
        },
        {
            title: "Comprado",
            hint: "Todo esto ya esta resuelto.",
            items: doneItems
        }
    ];

    elements.shoppingList.innerHTML = sections
        .map((section) => `
            <section class="shopping-group ${section.items.length ? "" : "is-empty"}">
                <div class="shopping-group-head">
                    <div>
                        <strong>${escapeHtml(section.title)}</strong>
                        <p>${escapeHtml(section.hint)}</p>
                    </div>
                    <span class="status-badge ${section.title === "Comprado" ? "done" : "pending"}">${section.items.length}</span>
                </div>
                ${
                    section.items.length
                        ? `<div class="shopping-group-list">${section.items.map(renderShoppingItemCard).join("")}</div>`
                        : '<div class="empty-state compact-empty">Nada por aqui.</div>'
                }
            </section>
        `)
        .join("");

    wireShoppingActions();
}

function getSelectedArchivedPlan() {
    return state.archivedPlans.find((entry) => entry.id === uiState.selectedArchivedPlanId) || null;
}

function renderArchivedMessage(message, friends) {
    const author = (friends || []).find((friend) => friend.id === message.authorId);
    return `
        <article class="chat-bubble theirs">
            <div class="chat-meta">
                <span>${escapeHtml(author ? author.name : "Amigo")}</span>
                <span>${escapeHtml(formatChatDate(message.createdAt))}</span>
            </div>
            ${message.photoDataUrl ? `<img class="chat-photo" src="${message.photoDataUrl}" alt="Foto guardada en este plan">` : ""}
            <div class="chat-text">${escapeHtml(message.text)}</div>
        </article>
    `;
}

function renderShoppingItemCard(item) {
    const context = getCurrentPlanContext();
    const owner = context.friends.find((friend) => friend.id === item.ownerId);
    const isArchived = context.archived;
    const ownerOptions = ['<option value="">Sin asignar</option>']
        .concat(
            context.friends.map(
                (friend) => `
                    <option value="${friend.id}" ${friend.id === item.ownerId ? "selected" : ""}>
                        ${escapeHtml(friend.name)}
                    </option>
                `
            )
        )
        .join("");

    if (uiState.editingItemId === item.id) {
        return `
            <article class="shopping-item simplified-card">
                <div class="shopping-top">
                    <div class="shopping-badges">
                        <span class="status-badge ${item.completedAt ? "done" : "pending"}">${item.completedAt ? "Comprado" : "Pendiente"}</span>
                    </div>
                </div>
                <div class="form-grid compact-grid">
                    <label>
                        <span>Item</span>
                        <input data-edit-name="${item.id}" type="text" value="${escapeHtml(item.name)}">
                    </label>
                    <label>
                        <span>Detalle</span>
                        <input data-edit-qty="${item.id}" type="text" value="${escapeHtml(item.quantity)}" placeholder="Sin detalle">
                    </label>
                </div>
                <div class="shopping-actions">
                    <select data-owner-select="${item.id}">${ownerOptions}</select>
                    <button class="inline-action" type="button" data-save-item="${item.id}">Guardar</button>
                    <button class="inline-action" type="button" data-cancel-edit="${item.id}">Cancelar</button>
                </div>
            </article>
        `;
    }

    return `
        <article class="shopping-item simplified-card ${item.completedAt ? "is-done" : ""}">
            <div class="shopping-row compact-row">
                <div class="shopping-title-wrap compact-title-wrap">
                    ${renderItemIcon(item.name)}
                    <div>
                        <div class="shopping-title-line">
                            <strong>${escapeHtml(item.name)}</strong>
                            <span class="shopping-owner-inline">${owner ? escapeHtml(owner.name) : "Sin asignar"}</span>
                        </div>
                        <div class="item-meta">${escapeHtml(item.quantity || "Sin detalle")}</div>
                    </div>
                </div>
            </div>
            <div class="shopping-actions compact-actions">
                ${item.completedAt ? "" : `<select data-owner-select="${item.id}">${ownerOptions}</select>`}
                ${item.completedAt || isArchived ? "" : `<button class="inline-action compact-action" type="button" data-toggle-done="${item.id}">Comprado</button>`}
                ${isArchived ? "" : `<button class="inline-action compact-action" type="button" data-edit-item="${item.id}">Editar</button>`}
                ${isArchived ? "" : `<button class="inline-button compact-action danger-action" type="button" data-delete-item="${item.id}">X</button>`}
            </div>
        </article>
    `;
}

function renderItemIcon(itemName) {
    const icon = getItemIcon(itemName);
    return `<span class="item-icon item-icon-${icon.tone}" aria-hidden="true">${icon.symbol}</span>`;
}

function renderPlanBadge(kind, label, value) {
    const icon = kind === "bbq"
        ? { symbol: "🔥", tone: "bbq" }
        : { symbol: "📍", tone: "default" };
    return `<span class="plan-badge"><span class="item-icon item-icon-${icon.tone}" aria-hidden="true">${icon.symbol}</span>${escapeHtml(label)}: ${escapeHtml(value)}</span>`;
}

function getItemIcon(itemName) {
    const name = String(itemName || "").toLowerCase();

    if (name.includes("hamburgues") || name.includes("chuleton") || name.includes("secreto") || name.includes("panceta") || name.includes("chorizo") || name.includes("perrito") || name.includes("pincho") || name.includes("pollo")) {
        return { symbol: "🥩", tone: "meat" };
    }

    if (name.includes("pan")) {
        return { symbol: "🥖", tone: "bread" };
    }

    if (name.includes("postre")) {
        return { symbol: "🍰", tone: "dessert" };
    }

    if (name.includes("cafe")) {
        return { symbol: "☕", tone: "coffee" };
    }

    if (name.includes("vino")) {
        return { symbol: "🍷", tone: "drink" };
    }

    if (name.includes("cerveza")) {
        return { symbol: "🍺", tone: "drink" };
    }

    if (name.includes("hielo")) {
        return { symbol: "🧊", tone: "ice" };
    }

    if (name.includes("carbon") || name.includes("bbq")) {
        return { symbol: "🔥", tone: "bbq" };
    }

    if (name.includes("ketchup")) {
        return { symbol: "🍅", tone: "sauce" };
    }

    return { symbol: "🍴", tone: "default" };
}

function wireShoppingActions() {
    if (getCurrentPlanContext().archived) {
        return;
    }
    document.querySelectorAll("[data-owner-select]").forEach((select) => {
        select.addEventListener("change", async (event) => {
            const itemId = event.target.getAttribute("data-owner-select");
            await updateItemOwner(itemId, event.target.value);
        });
    });

    document.querySelectorAll("[data-delete-item]").forEach((button) => {
        button.addEventListener("click", async (event) => {
            const itemId = event.target.getAttribute("data-delete-item");
            await withButtonState(event.target, "Eliminando...", () => deleteItem(itemId));
        });
    });

    document.querySelectorAll("[data-toggle-done]").forEach((button) => {
        button.addEventListener("click", async (event) => {
            const itemId = event.target.getAttribute("data-toggle-done");
            await withButtonState(event.target, "Guardando...", () => toggleItemDone(itemId));
        });
    });

    document.querySelectorAll("[data-edit-item]").forEach((button) => {
        button.addEventListener("click", (event) => {
            uiState.editingItemId = event.target.getAttribute("data-edit-item") || "";
            renderItems();
        });
    });

    document.querySelectorAll("[data-cancel-edit]").forEach((button) => {
        button.addEventListener("click", () => {
            uiState.editingItemId = "";
            renderItems();
        });
    });

    document.querySelectorAll("[data-save-item]").forEach((button) => {
        button.addEventListener("click", async (event) => {
            const itemId = event.target.getAttribute("data-save-item");
            await withButtonState(event.target, "Guardando...", () => saveEditedItem(itemId));
        });
    });
}

function renderAssignments() {
    const context = getCurrentPlanContext();
    if (!context.friends.length) {
        elements.assignmentsGrid.innerHTML = '<div class="empty-state">Anade amigos al grupo para repartir la compra.</div>';
        return;
    }

    const activeItems = context.items;

    elements.assignmentsGrid.innerHTML = context.friends
        .slice()
        .sort((left, right) => left.name.localeCompare(right.name, "es"))
        .map((friend) => {
            const ownedItems = activeItems.filter((item) => item.ownerId === friend.id && !item.completedAt);
            const doneItems = activeItems.filter((item) => item.ownerId === friend.id && item.completedAt);
            const listContent = ownedItems.length || doneItems.length
                ? `
                    <ul>
                        ${ownedItems
                            .map(
                                (item) => `
                                    <li>
                                        <span class="assignment-item-line">${renderItemIcon(item.name)}<strong>${escapeHtml(item.name)}</strong></span><br>
                                        ${escapeHtml(item.quantity || "Sin detalle")}
                                    </li>
                                `
                            )
                            .join("")}
                        ${doneItems
                            .map(
                                (item) => `
                                    <li>
                                        <span class="assignment-item-line">${renderItemIcon(item.name)}<strong>${escapeHtml(item.name)}</strong></span><br>
                                        Comprado
                                    </li>
                                `
                            )
                            .join("")}
                    </ul>
                `
                : '<div class="empty-state">Sin compras asignadas.</div>';

            return `
                <article class="assignment-card">
                    <h3>${escapeHtml(friend.name)}</h3>
                    ${listContent}
                </article>
            `;
        })
        .join("");
}

function renderMessages() {
    const context = getCurrentPlanContext();
    const activeMessages = context.messages;
    elements.messagesCounter.textContent = `${activeMessages.length} mensajes`;
    elements.chatMessage.disabled = context.archived;
    elements.chatPhotoInput.disabled = context.archived;
    elements.sendPhotoButton.disabled = context.archived;
    elements.sendMessageButton.disabled = context.archived;

    if (!activeMessages.length) {
        elements.chatThread.innerHTML = '<div class="empty-state">Aun no hay mensajes. Usa ToniChat para coordinar compras y llegada.</div>';
        return;
    }

    elements.chatThread.innerHTML = activeMessages
        .map((message) => {
            const author = context.friends.find((friend) => friend.id === message.authorId);
            const isMine = message.authorId === state.currentFriendId;
            return `
                <article class="chat-bubble ${isMine ? "mine" : "theirs"}">
                    <div class="chat-meta">
                        <span>${escapeHtml(author ? author.name : "Amigo")}</span>
                        <span>${escapeHtml(formatChatDate(message.createdAt))}</span>
                    </div>
                    ${message.photoDataUrl ? `<img class="chat-photo" src="${message.photoDataUrl}" alt="Foto enviada en ToniChat">` : ""}
                    <div class="chat-text">${escapeHtml(message.text)}</div>
                </article>
            `;
        })
        .join("");

    elements.chatThread.scrollTop = elements.chatThread.scrollHeight;
    if (!context.archived) {
        lastSeenMessageId = getLastSeenMessageId(activeMessages);
    }
}

function renderLocks() {
    document.querySelectorAll("[data-requires-group]").forEach((panel) => {
        panel.classList.toggle("is-locked", !hasGroup());
        const title = panel.querySelector(".panel-lock strong");
        const body = panel.querySelector(".panel-lock span");
        if (!title || !body) {
            return;
        }

        if (!hasGroup()) {
            title.textContent = "Unete primero a un grupo";
            body.textContent = "Despues podras editar compras, plan y chat.";
        }
    });
}

function renderInstallButton() {
    elements.installAppButton.classList.toggle("hidden", !uiState.deferredInstallPrompt);
}

async function updateItemOwner(itemId, ownerId) {
    if (!ensurePlanEditable("reasignar compras")) {
        return;
    }
    const item = state.items.find((entry) => entry.id === itemId);
    if (!item) return;
    item.ownerId = ownerId;
    item.updatedAt = nowIso();
    persistAndRender();
    await syncGroup("updated an assignment");
    showToast("Asignacion actualizada", "La compra ya tiene responsable.", "success");
}

async function deleteItem(itemId) {
    if (!ensurePlanEditable("eliminar compras")) {
        return;
    }
    const item = state.items.find((entry) => entry.id === itemId);
    if (!item) return;
    item.deletedAt = nowIso();
    item.updatedAt = item.deletedAt;
    uiState.editingItemId = "";
    persistAndRender();
    await syncGroup("deleted an item");
    showToast("Item eliminado", "La compra ha salido de la lista compartida.", "success");
}

async function toggleItemDone(itemId) {
    if (!ensurePlanEditable("actualizar compras")) {
        return;
    }
    const item = state.items.find((entry) => entry.id === itemId);
    if (!item) return;
    item.completedAt = item.completedAt ? "" : nowIso();
    item.updatedAt = nowIso();
    persistAndRender();
    await syncGroup("toggled item completion");
    showToast(
        item.completedAt ? "Compra marcada" : "Compra reabierta",
        item.completedAt ? "La compra ya aparece como hecha." : "La compra vuelve a pendiente.",
        "success"
    );
}

async function saveEditedItem(itemId) {
    if (!ensurePlanEditable("editar compras")) {
        return;
    }
    const item = state.items.find((entry) => entry.id === itemId);
    if (!item) return;

    const nameInput = document.querySelector(`[data-edit-name="${itemId}"]`);
    const qtyInput = document.querySelector(`[data-edit-qty="${itemId}"]`);
    const ownerSelect = document.querySelector(`[data-owner-select="${itemId}"]`);

    const nextName = nameInput ? nameInput.value.trim() : item.name;
    const nextQty = qtyInput ? qtyInput.value.trim() : item.quantity;

    if (!nextName) {
        showToast("Falta el nombre", "El item no puede quedarse sin nombre.", "error");
        return;
    }

    item.name = nextName;
    item.quantity = nextQty;
    item.ownerId = ownerSelect ? ownerSelect.value : item.ownerId;
    item.updatedAt = nowIso();
    uiState.editingItemId = "";
    persistAndRender();
    await syncGroup("edited an item");
    showToast("Item actualizado", "La compra se ha editado correctamente.", "success");
}

async function sendMessage() {
    const text = elements.chatMessage.value.trim();
    if (!text) {
        showToast("Mensaje vacio", "Escribe algo antes de enviarlo.", "error");
        return;
    }

    if (!hasGroup() || !state.currentFriendId) {
        showToast("Sin grupo activo", "Unete primero a un grupo para usar ToniChat.", "error");
        return;
    }

    if (!ensurePlanEditable("enviar mensajes")) {
        return;
    }

    maybeRequestNotificationPermission();

    state.messages.push(normalizeMessage({
        id: createId(),
        authorId: state.currentFriendId,
        text,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        deletedAt: ""
    }));

    elements.chatMessage.value = "";
    persistAndRender();
    await syncGroup("sent a chat message");
    showToast("Mensaje enviado", "ToniChat se ha actualizado para todos.", "success");
}

async function sendPhotoMessage(file) {
    if (!hasGroup() || !state.currentFriendId) {
        showToast("Sin grupo activo", "Unete primero a un grupo para usar ToniChat.", "error");
        return;
    }

    if (!ensurePlanEditable("enviar fotos")) {
        return;
    }

    if (!file.type.startsWith("image/")) {
        showToast("Formato no valido", "Solo puedes enviar imagenes al chat.", "error");
        return;
    }

    maybeRequestNotificationPermission();

    const compressedDataUrl = await compressImageFile(file);
    const caption = elements.chatMessage.value.trim();
    const timestamp = nowIso();

    state.messages.push(normalizeMessage({
        id: createId(),
        authorId: state.currentFriendId,
        text: caption || "Foto compartida",
        photoDataUrl: compressedDataUrl,
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: ""
    }));

    elements.chatMessage.value = "";
    persistAndRender();
    await syncGroup("sent a photo message");
    showToast("Foto enviada", "La imagen ya aparece en ToniChat.", "success");
}

function getActiveItems() {
    return state.items.filter((item) => !item.deletedAt);
}

function getActiveMessages() {
    return state.messages
        .filter((message) => !message.deletedAt)
        .slice()
        .sort((left, right) => (left.createdAt || "").localeCompare(right.createdAt || ""));
}

function hasGroup() {
    return Boolean(state.groupCode);
}

function hasArchivedPlan() {
    return Boolean(state.plan.archivedAt);
}

function isPlanReady() {
    return Boolean(
        state.plan.date &&
        state.plan.adults !== "" &&
        state.plan.children !== "" &&
        state.plan.bbqReserved &&
        state.plan.tablesReserved
    );
}

function ensurePlanEditable(actionLabel) {
    return true;
}

function findFriendByName(name) {
    return state.friends.find(
        (entry) => entry.name.trim().toLowerCase() === name.trim().toLowerCase()
    );
}

function createFriend(name) {
    return normalizeFriend({
        id: createId(),
        deviceId: "",
        name,
        updatedAt: nowIso()
    });
}

async function syncGroup(reason) {
    if (!state.groupCode) {
        updateSyncBadge("Sin grupo", "is-offline");
        return;
    }

    if (dataProvider === "demo") {
        persistAndRender();
        updateSyncBadge("Modo demo local. Falta backend compartido.", "is-offline");
        return;
    }

    try {
        updateSyncBadge(
            dataProvider === "local-api" ? "Sincronizando con servidor local..." : "Sincronizando con Supabase...",
            ""
        );

        const localGroup = buildGroupPayload();
        const remoteRow = await fetchRemoteGroupRow(state.groupCode);
        const remoteGroup = remoteRow ? rowToGroup(remoteRow) : blankGroupPayload(state.groupCode);
        const mergedGroup = mergeGroupData(localGroup, remoteGroup);

        let savedRow;
        if (dataProvider === "local-api") {
            savedRow = await upsertLocalGroup(state.groupCode, mergedGroup, reason);
        } else {
            const row = {
                code: state.groupCode,
                plan: mergedGroup.plan,
                archived_plans: mergedGroup.archivedPlans,
                friends: mergedGroup.friends,
                items: mergedGroup.items,
                messages: mergedGroup.messages,
                updated_by: state.clientId,
                updated_reason: reason,
                updated_at: nowIso()
            };

            const { data, error } = await supabaseClient
                .from("bbq_groups")
                .upsert(row, { onConflict: "code" })
                .select()
                .single();

            if (error) {
                throw error;
            }

            savedRow = data;
        }

        applyGroupRow(savedRow);
        state.lastSyncedAt = nowIso();
        persistAndRender();
        updateSyncBadge(
            dataProvider === "local-api" ? `En linea con servidor local: ${state.groupCode}` : `En linea con ${state.groupCode}`,
            ""
        );
    } catch (error) {
        console.error(error);
        persistAndRender();
        updateSyncBadge(
            dataProvider === "local-api" ? "Error conectando con el servidor local" : "Error conectando con Supabase",
            "is-error"
        );
        showToast(
            "No se pudo sincronizar",
            "Tus cambios siguen en este dispositivo. Vuelve a intentarlo en un momento.",
            "error"
        );
    }
}

async function loadRemoteGroup(groupCode) {
    if (dataProvider === "demo" || !groupCode) {
        return;
    }

    try {
        const data = await fetchRemoteGroupRow(groupCode);
        if (data) {
            applyGroupRow(data);
            state.lastSyncedAt = nowIso();
            persistAndRender();
            updateSyncBadge(`Grupo ${groupCode} cargado`, "");
        } else {
            updateSyncBadge(`Grupo ${groupCode} listo para crear`, "");
        }
    } catch (error) {
        console.error(error);
        updateSyncBadge(
            dataProvider === "local-api" ? "No se pudo leer el servidor local" : "No se pudo leer Supabase",
            "is-error"
        );
        showToast(
            "Error de lectura",
            dataProvider === "local-api"
                ? "No hemos podido cargar el grupo desde el servidor local."
                : "No hemos podido cargar el grupo desde Supabase.",
            "error"
        );
    }
}

async function fetchRemoteGroupRow(groupCode) {
    if (dataProvider === "local-api") {
        const response = await fetch(`${LOCAL_API_BASE}/api/groups/${encodeURIComponent(groupCode)}`, {
            headers: {
                Accept: "application/json"
            }
        });

        if (!response.ok) {
            throw new Error(`Local API error: ${response.status}`);
        }

        const record = await response.json();
        return record && record.group ? record : null;
    }

    const { data, error } = await supabaseClient
        .from("bbq_groups")
        .select("*")
        .eq("code", groupCode)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return data;
}

async function upsertLocalGroup(groupCode, group, reason) {
    const response = await fetch(`${LOCAL_API_BASE}/api/groups/${encodeURIComponent(groupCode)}`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
        },
        body: JSON.stringify({
            group,
            updatedBy: state.clientId,
            updatedReason: reason
        })
    });

    if (!response.ok) {
        throw new Error(`Local API error: ${response.status}`);
    }

    return response.json();
}

function subscribeToGroup(groupCode) {
    if (dataProvider === "demo" || !groupCode) {
        return;
    }

    if (localPollTimer) {
        window.clearInterval(localPollTimer);
        localPollTimer = 0;
    }
    localRevision = 0;

    if (dataProvider === "local-api") {
        localPollTimer = window.setInterval(async () => {
            try {
                const nextRow = await fetchRemoteGroupRow(groupCode);
                const nextRevision = Number(nextRow && nextRow.revision ? nextRow.revision : 0);
                if (!nextRow || nextRevision <= localRevision) {
                    return;
                }
                applyGroupRow(nextRow);
                state.lastSyncedAt = nowIso();
                persistAndRender();
                updateSyncBadge(`Actualizado desde servidor local: ${groupCode}`, "");
            } catch (error) {
                console.error(error);
                updateSyncBadge("Error leyendo el servidor local", "is-error");
            }
        }, 3000);
        updateSyncBadge(`Sync local activa: ${groupCode}`, "");
        return;
    }

    if (activeChannel) {
        supabaseClient.removeChannel(activeChannel);
        activeChannel = null;
    }

    activeChannel = supabaseClient
        .channel(`bbq-group-${groupCode}`)
        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "bbq_groups",
                filter: `code=eq.${groupCode}`
            },
            (payload) => {
                const nextRow = payload.new || payload.record;
                if (!nextRow) return;
                applyGroupRow(nextRow);
                state.lastSyncedAt = nowIso();
                persistAndRender();
                updateSyncBadge(`Actualizado en tiempo real: ${groupCode}`, "");
            }
        )
        .subscribe((status) => {
            if (status === "SUBSCRIBED") {
                updateSyncBadge(`Realtime activo: ${groupCode}`, "");
            }
        });
}

function applyGroupRow(row) {
    if (!row) return;

    const previousLastMessageId = getLastSeenMessageId(getActiveMessages());
    const normalizedRow = normalizeGroupRow(row);
    localRevision = Math.max(localRevision, Number(row.revision || 0));

    state.groupCode = normalizedRow.code || state.groupCode;
    state.plan = normalizedRow.plan;
    state.archivedPlans = normalizedRow.archivedPlans;
    state.friends = normalizedRow.friends;
    state.items = normalizedRow.items;
    state.messages = normalizedRow.messages;

    const currentFriend = state.friends.find((friend) => friend.id === state.currentFriendId);
    if (!currentFriend) {
        const deviceMatch = state.friends.find((friend) => friend.deviceId === state.clientId);
        const typedName = elements.friendName.value.trim();
        const fallback = state.friends.find((friend) => typedName && friend.name.toLowerCase() === typedName.toLowerCase());
        state.currentFriendId = deviceMatch ? deviceMatch.id : fallback ? fallback.id : "";
    }

    notifyForIncomingMessage(previousLastMessageId);
    void maybeArchiveExpiredPlan();
}

function buildGroupPayload() {
    return {
        groupCode: state.groupCode,
        plan: normalizePlan(state.plan),
        archivedPlans: state.archivedPlans.map(normalizeArchivedPlan),
        friends: state.friends.map(normalizeFriend),
        items: state.items.map(normalizeItem),
        messages: state.messages.map(normalizeMessage)
    };
}

function rowToGroup(row) {
    const normalized = normalizeGroupRow(row);
    return {
        groupCode: normalized.code,
        plan: normalized.plan,
        archivedPlans: normalized.archivedPlans,
        friends: normalized.friends,
        items: normalized.items,
        messages: normalized.messages
    };
}

function persistAndRender() {
    persist();
    hydrateInputs();
    render();
}

function updateSyncBadge(text, tone) {
    elements.syncStatus.textContent = text;
    elements.syncStatus.classList.remove("is-offline", "is-error");
    if (tone) {
        elements.syncStatus.classList.add(tone);
    }
    announce(text);
}

async function withButtonState(button, loadingLabel, callback) {
    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = loadingLabel;
    try {
        await callback();
    } finally {
        button.disabled = false;
        button.textContent = originalLabel;
    }
}

function showToast(title, body, tone) {
    const toast = document.createElement("article");
    toast.className = `toast ${tone || "success"}`;
    toast.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(body)}</span>`;
    elements.toastStack.appendChild(toast);
    window.setTimeout(() => {
        toast.remove();
    }, TOAST_DURATION_MS);
}

function announce(message) {
    elements.liveRegion.textContent = "";
    window.setTimeout(() => {
        elements.liveRegion.textContent = message;
    }, 10);
}

function setupInstallPrompt() {
    window.addEventListener("beforeinstallprompt", (event) => {
        event.preventDefault();
        uiState.deferredInstallPrompt = event;
        renderInstallButton();
        showToast("Instalacion disponible", "Puedes instalar ToniBBQ y abrirla como una app de verdad.", "success");
    });
}

async function installPwa() {
    if (!uiState.deferredInstallPrompt) {
        return;
    }

    uiState.deferredInstallPrompt.prompt();
    await uiState.deferredInstallPrompt.userChoice;
    uiState.deferredInstallPrompt = null;
    renderInstallButton();
}

function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) {
        return;
    }

    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
        console.error(error);
    });
}

function maybeRequestNotificationPermission() {
    if (!("Notification" in window)) {
        return;
    }
    if (Notification.permission === "default") {
        Notification.requestPermission().catch((error) => {
            console.error(error);
        });
    }
}

function normalizeClientState(candidate) {
    return {
        groupCode: normalizeGroupCode(candidate.groupCode || ""),
        currentFriendId: String(candidate.currentFriendId || ""),
        clientId: String(candidate.clientId || createId()),
        lastSyncedAt: String(candidate.lastSyncedAt || ""),
        plan: normalizePlan(candidate.plan || {}),
        archivedPlans: Array.isArray(candidate.archivedPlans) ? candidate.archivedPlans.map(normalizeArchivedPlan) : [],
        friends: Array.isArray(candidate.friends) ? candidate.friends.map(normalizeFriend) : [],
        items: Array.isArray(candidate.items) ? candidate.items.map(normalizeItem) : [],
        messages: Array.isArray(candidate.messages) ? candidate.messages.map(normalizeMessage) : []
    };
}

function normalizeGroupRow(row) {
    const source = row && row.group ? row.group : row;
    return {
        code: normalizeGroupCode(source.code || source.groupCode || ""),
        plan: normalizePlan(source.plan || {}),
        archivedPlans: Array.isArray(source.archivedPlans || source.archived_plans)
            ? dedupeArchivedPlans((source.archivedPlans || source.archived_plans).map(normalizeArchivedPlan))
            : [],
        friends: Array.isArray(source.friends) ? dedupeFriends(source.friends.map(normalizeFriend)) : [],
        items: Array.isArray(source.items) ? dedupeById(source.items.map(normalizeItem)) : [],
        messages: Array.isArray(source.messages) ? dedupeById(source.messages.map(normalizeMessage)) : []
    };
}

function blankPlan() {
    return {
        date: "",
        responseDeadlineEnabled: false,
        responseDeadline: "",
        adults: "",
        children: "",
        bbqReserved: "",
        tablesReserved: "",
        notes: "",
        archivedAt: "",
        updatedAt: ""
    };
}

function blankGroupPayload(groupCode) {
    return {
        groupCode,
        plan: blankPlan(),
        archivedPlans: [],
        friends: [],
        items: [],
        messages: []
    };
}

function normalizePlan(plan) {
    return {
        date: String(plan.date || ""),
        responseDeadlineEnabled: Boolean(plan.responseDeadlineEnabled),
        responseDeadline: String(plan.responseDeadline || ""),
        adults: String(plan.adults || ""),
        children: String(plan.children || ""),
        bbqReserved: String(plan.bbqReserved || ""),
        tablesReserved: String(plan.tablesReserved || ""),
        notes: String(plan.notes || ""),
        archivedAt: String(plan.archivedAt || ""),
        updatedAt: String(plan.updatedAt || "")
    };
}

function syncResponseDeadlineVisibility() {
    if (!elements.responseDeadlineMode || !elements.responseDeadlineField || !elements.responseDeadlineDate) {
        return;
    }
    const enabled = elements.responseDeadlineMode.value === "date";
    elements.responseDeadlineField.classList.toggle("hidden-view", !enabled);
    elements.responseDeadlineDate.disabled = !enabled;
    if (!enabled) {
        elements.responseDeadlineDate.value = "";
    }
}

function buildInviteMessage() {
    const context = getCurrentPlanContext();
    const lines = [`ToniBBQ - ${state.groupCode}`, ""];

    if (!context.plan.date) {
        lines.push("Te invito a nuestro grupo para organizar la BBQ.");
    } else {
        lines.push(`BBQ: ${formatDate(context.plan.date)}`);
        lines.push(`Adultos: ${context.plan.adults || "0"}`);
        lines.push(`Ninos: ${context.plan.children || "0"}`);
        lines.push(`Barbacoa: ${context.plan.bbqReserved || "Pendiente"}`);
        lines.push(`Mesas: ${context.plan.tablesReserved || "Pendiente"}`);
        lines.push(
            context.plan.responseDeadlineEnabled && context.plan.responseDeadline
                ? `Responder antes de: ${formatDate(context.plan.responseDeadline)}`
                : "Respuesta: sin limite"
        );

        if (context.plan.notes) {
            lines.push(`Nota: ${context.plan.notes}`);
        }
    }

    lines.push("");
    lines.push("Unete aqui:");
    lines.push(buildGroupShareUrl());
    return lines.join("\n");
}

async function inviteFriends() {
    if (!hasGroup()) {
        showToast("Sin grupo", "Primero entra o crea un grupo para invitar amigos.", "error");
        return;
    }

    const message = buildInviteMessage();
    const opened = openWhatsAppShare(message);
    if (opened) {
        showToast("WhatsApp abierto", "Ya puedes enviar la invitacion.", "success");
        return;
    }

    const copied = await copyTextToClipboard(message);
    showToast(
        copied ? "Copiado" : "No se pudo compartir",
        copied ? "Invitacion copiada" : "Prueba a copiar el enlace manualmente.",
        copied ? "success" : "error"
    );
}

function buildGroupShareUrl() {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("group", state.groupCode);
    return url.toString();
}

function openWhatsAppShare(message) {
    try {
        const shareUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
        window.open(shareUrl, "_blank", "noopener");
        return true;
    } catch (error) {
        return false;
    }
}

async function copyTextToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (error) {
        return false;
    }
}

function normalizeArchivedPlan(entry) {
    return {
        id: String(entry.id || createId()),
        archivedAt: String(entry.archivedAt || nowIso()),
        updatedAt: String(entry.updatedAt || entry.archivedAt || nowIso()),
        sourceDate: String(entry.sourceDate || entry.plan?.date || ""),
        friendCount: Number(entry.friendCount || 0),
        pendingItems: Number(entry.pendingItems || 0),
        completedItems: Number(entry.completedItems || 0),
        messageCount: Number(entry.messageCount || 0),
        plan: normalizePlan(entry.plan || {}),
        friends: Array.isArray(entry.friends) ? entry.friends.map(normalizeFriend) : [],
        items: Array.isArray(entry.items) ? entry.items.map(normalizeItem) : [],
        messages: Array.isArray(entry.messages) ? entry.messages.map(normalizeMessage) : []
    };
}

function normalizeFriend(friend) {
    return {
        id: String(friend.id || createId()),
        deviceId: String(friend.deviceId || ""),
        name: String(friend.name || "Amigo"),
        updatedAt: String(friend.updatedAt || "")
    };
}

function normalizeItem(item) {
    return {
        id: String(item.id || createId()),
        name: String(item.name || ""),
        quantity: String(item.quantity || ""),
        ownerId: String(item.ownerId || ""),
        updatedAt: String(item.updatedAt || ""),
        completedAt: String(item.completedAt || ""),
        deletedAt: String(item.deletedAt || "")
    };
}

function normalizeMessage(message) {
    return {
        id: String(message.id || createId()),
        authorId: String(message.authorId || ""),
        text: String(message.text || ""),
        photoDataUrl: String(message.photoDataUrl || ""),
        createdAt: String(message.createdAt || nowIso()),
        updatedAt: String(message.updatedAt || message.createdAt || nowIso()),
        deletedAt: String(message.deletedAt || "")
    };
}

function dedupeById(records) {
    const map = new Map();
    records.forEach((record) => {
        const current = map.get(record.id);
        if (!current || String(record.updatedAt) >= String(current.updatedAt)) {
            map.set(record.id, record);
        }
    });
    return Array.from(map.values());
}

function dedupeFriends(friends) {
    const byId = dedupeById(friends);
    const byName = new Map();
    byId.forEach((friend) => {
        const key = friend.deviceId || friend.name.trim().toLowerCase();
        const current = byName.get(key);
        if (!current || friend.updatedAt >= current.updatedAt) {
            byName.set(key, friend);
        }
    });
    return Array.from(byName.values()).sort((left, right) => left.name.localeCompare(right.name, "es"));
}

function dedupeArchivedPlans(records) {
    const map = new Map();
    records.forEach((record) => {
        const current = map.get(record.id);
        if (!current || String(record.updatedAt) >= String(current.updatedAt)) {
            map.set(record.id, record);
        }
    });
    return Array.from(map.values()).sort((left, right) => String(right.archivedAt).localeCompare(String(left.archivedAt)));
}

function mergeGroupData(localGroup, remoteGroup) {
    return {
        groupCode: localGroup.groupCode || remoteGroup.groupCode || "",
        plan: mergeByUpdatedAt(normalizePlan(localGroup.plan), normalizePlan(remoteGroup.plan)),
        archivedPlans: dedupeArchivedPlans([].concat(remoteGroup.archivedPlans || [], localGroup.archivedPlans || []).map(normalizeArchivedPlan)),
        friends: dedupeFriends([].concat(remoteGroup.friends || [], localGroup.friends || [])),
        items: mergeRecordCollections(remoteGroup.items || [], localGroup.items || [], normalizeItem),
        messages: mergeRecordCollections(remoteGroup.messages || [], localGroup.messages || [], normalizeMessage)
    };
}

function mergeRecordCollections(remoteRecords, localRecords, normalizeFn) {
    const merged = new Map();
    remoteRecords.concat(localRecords).map(normalizeFn).forEach((record) => {
        const current = merged.get(record.id);
        if (!current || String(record.updatedAt) >= String(current.updatedAt)) {
            merged.set(record.id, record);
        }
    });
    return Array.from(merged.values()).sort((left, right) => String(left.updatedAt).localeCompare(String(right.updatedAt)));
}

function mergeByUpdatedAt(left, right) {
    return String(left.updatedAt || "") >= String(right.updatedAt || "") ? left : right;
}

async function maybeArchiveExpiredPlan() {
    if (uiState.archivingInFlight || !hasGroup() || !state.plan.date || hasArchivedPlan() || !hasDatePassed(state.plan.date)) {
        return false;
    }

    uiState.archivingInFlight = true;
    try {
        const archivedAt = nowIso();
        const archivedItems = state.items.map(normalizeItem);
        const archivedMessages = state.messages.map(normalizeMessage);

        state.archivedPlans.unshift(buildArchivedPlanSnapshot(archivedAt));
        state.plan = normalizePlan({ ...blankPlan(), updatedAt: archivedAt });
        state.items = archivedItems.map((item) => normalizeItem({
            ...item,
            deletedAt: item.deletedAt || archivedAt,
            updatedAt: archivedAt
        }));
        state.messages = archivedMessages.map((message) => normalizeMessage({
            ...message,
            deletedAt: message.deletedAt || archivedAt,
            updatedAt: archivedAt
        }));
        uiState.selectedArchivedPlanId = state.archivedPlans[0] ? state.archivedPlans[0].id : "";
        persistAndRender();
        if (dataProvider !== "demo") {
            await syncGroup("auto-archived expired plan");
        }
        showToast("Plan archivado", "La fecha de la BBQ ya ha pasado. Hemos guardado su compra y su chat en planes anteriores.", "success");
        return true;
    } finally {
        uiState.archivingInFlight = false;
    }
}

function buildArchivedPlanSnapshot(archivedAt) {
    const items = state.items.map(normalizeItem);
    const messages = state.messages.map(normalizeMessage);

    return normalizeArchivedPlan({
        id: createId(),
        archivedAt,
        updatedAt: archivedAt,
        sourceDate: state.plan.date,
        friendCount: state.friends.length,
        pendingItems: items.filter((item) => !item.completedAt && !item.deletedAt).length,
        completedItems: items.filter((item) => item.completedAt && !item.deletedAt).length,
        messageCount: messages.filter((message) => !message.deletedAt).length,
        plan: normalizePlan({ ...state.plan, archivedAt, updatedAt: archivedAt }),
        friends: state.friends.map(normalizeFriend),
        items,
        messages
    });
}

function normalizeGroupCode(value) {
    return String(value)
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "-")
        .replace(/[^A-Z0-9_-]/g, "");
}

function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
        return window.crypto.randomUUID();
    }
    return Math.random().toString(36).slice(2, 10);
}

function cloneInitialState() {
    return normalizeClientState(JSON.parse(JSON.stringify(initialState)));
}

function nowIso() {
    return new Date().toISOString();
}

function hasDatePassed(dateString) {
    const today = new Date();
    const current = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
    const target = new Date(`${dateString}T00:00:00Z`);
    return target < current;
}

function formatDate(dateString) {
    const date = new Date(`${dateString}T12:00:00`);
    return new Intl.DateTimeFormat("es-ES", {
        day: "numeric",
        month: "long",
        year: "numeric"
    }).format(date);
}

function formatTime(dateString) {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("es-ES", {
        hour: "2-digit",
        minute: "2-digit"
    }).format(date);
}

function formatChatDate(dateString) {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("es-ES", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
    }).format(date);
}

function formatDateTime(dateString) {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("es-ES", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    }).format(date);
}

async function compressImageFile(file) {
    const dataUrl = await readFileAsDataUrl(file);
    const image = await loadImage(dataUrl);
    const maxWidth = 1440;
    const scale = Math.min(1, maxWidth / image.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");

    if (!context) {
        return dataUrl;
    }

    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("No se pudo leer la imagen."));
        reader.readAsDataURL(file);
    });
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("No se pudo procesar la imagen."));
        image.src = src;
    });
}

function getLastSeenMessageId(messages) {
    const list = Array.isArray(messages) ? messages : [];
    const activeMessages = list
        .filter((message) => !message.deletedAt)
        .slice()
        .sort((left, right) => (left.createdAt || "").localeCompare(right.createdAt || ""));
    return activeMessages.length ? activeMessages[activeMessages.length - 1].id : "";
}

function notifyForIncomingMessage(previousLastMessageId) {
    const activeMessages = getActiveMessages();
    if (!activeMessages.length) {
        return;
    }

    if (!previousLastMessageId) {
        lastSeenMessageId = getLastSeenMessageId(activeMessages);
        return;
    }

    const latestMessage = activeMessages[activeMessages.length - 1];
    if (!latestMessage || latestMessage.id === previousLastMessageId || latestMessage.id === lastSeenMessageId) {
        return;
    }

    if (latestMessage.authorId === state.currentFriendId) {
        lastSeenMessageId = latestMessage.id;
        return;
    }

    if (!("Notification" in window) || Notification.permission !== "granted") {
        lastSeenMessageId = latestMessage.id;
        return;
    }

    const author = state.friends.find((friend) => friend.id === latestMessage.authorId);
    const title = author ? `${author.name} en ToniChat` : "Nuevo mensaje en ToniChat";

    try {
        new Notification(title, {
            body: latestMessage.text,
            icon: "icon.svg",
            badge: "icon.svg"
        });
    } catch (error) {
        // Ignore browser notification errors.
    }

    lastSeenMessageId = latestMessage.id;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

