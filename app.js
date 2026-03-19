const STORAGE_KEY = "tonibbq-state-v4";
const TOAST_DURATION_MS = 3200;

const defaultItems = [
    { name: "Carbon", quantity: "", ownerId: "" },
    { name: "Hamburguesas", quantity: "", ownerId: "" },
    { name: "Pan de hamburguesa", quantity: "", ownerId: "" },
    { name: "Ketchup", quantity: "", ownerId: "" },
    { name: "Perritos", quantity: "", ownerId: "" },
    { name: "Pan de perrito", quantity: "", ownerId: "" },
    { name: "Panceta", quantity: "", ownerId: "" },
    { name: "Chorizo", quantity: "", ownerId: "" },
    { name: "Pinchos de pollo", quantity: "", ownerId: "" },
    { name: "Secreto", quantity: "", ownerId: "" },
    { name: "Chuletones", quantity: "", ownerId: "" },
    { name: "Pan de barra", quantity: "", ownerId: "" },
    { name: "Hielos", quantity: "", ownerId: "" },
    { name: "Cervezas", quantity: "", ownerId: "" },
    { name: "Vino", quantity: "", ownerId: "" },
    { name: "Postre", quantity: "", ownerId: "" },
    { name: "Cafe", quantity: "", ownerId: "" }
];

const initialState = {
    groupCode: "",
    currentFriendId: "",
    clientId: createId(),
    lastSyncedAt: "",
    plan: blankPlan(),
    friends: [],
    items: [],
    messages: []
};

const uiState = {
    itemFilter: "all",
    editingItemId: "",
    deferredInstallPrompt: null
};

const SUPABASE_CONFIG = window.TONIBBQ_CONFIG || {};
const hasSupabaseConfig = Boolean(
    SUPABASE_CONFIG.supabaseUrl &&
    SUPABASE_CONFIG.supabaseAnonKey &&
    window.supabase &&
    typeof window.supabase.createClient === "function"
);

const supabaseClient = hasSupabaseConfig
    ? window.supabase.createClient(
        SUPABASE_CONFIG.supabaseUrl,
        SUPABASE_CONFIG.supabaseAnonKey
    )
    : null;

const state = loadState();
let activeChannel = null;
let lastSeenMessageId = getLastSeenMessageId(state.messages);

const elements = {
    friendName: document.getElementById("friendName"),
    groupCode: document.getElementById("groupCode"),
    joinGroupButton: document.getElementById("joinGroupButton"),
    createDemoButton: document.getElementById("createDemoButton"),
    activeGroupChip: document.getElementById("activeGroupChip"),
    friendStrip: document.getElementById("friendStrip"),
    bbqDate: document.getElementById("bbqDate"),
    adultsCount: document.getElementById("adultsCount"),
    childrenCount: document.getElementById("childrenCount"),
    bbqReserved: document.getElementById("bbqReserved"),
    tablesReserved: document.getElementById("tablesReserved"),
    planNotes: document.getElementById("planNotes"),
    savePlanButton: document.getElementById("savePlanButton"),
    planSummary: document.getElementById("planSummary"),
    newItemName: document.getElementById("newItemName"),
    newItemQty: document.getElementById("newItemQty"),
    newItemOwner: document.getElementById("newItemOwner"),
    addItemButton: document.getElementById("addItemButton"),
    seedItemsButton: document.getElementById("seedItemsButton"),
    shoppingList: document.getElementById("shoppingList"),
    assignmentsGrid: document.getElementById("assignmentsGrid"),
    itemsCounter: document.getElementById("itemsCounter"),
    syncStatus: document.getElementById("syncStatus"),
    chatThread: document.getElementById("chatThread"),
    chatMessage: document.getElementById("chatMessage"),
    sendMessageButton: document.getElementById("sendMessageButton"),
    messagesCounter: document.getElementById("messagesCounter"),
    setupGuide: document.getElementById("setupGuide"),
    overviewGrid: document.getElementById("overviewGrid"),
    overviewNote: document.getElementById("overviewNote"),
    shoppingFilters: document.getElementById("shoppingFilters"),
    installAppButton: document.getElementById("installAppButton"),
    toastStack: document.getElementById("toastStack"),
    liveRegion: document.getElementById("liveRegion")
};

hydrateInputs();
bindEvents();
render();
initializeApp();

function bindEvents() {
    elements.joinGroupButton.addEventListener("click", () => {
        withButtonState(elements.joinGroupButton, "Entrando...", joinGroup);
    });

    elements.createDemoButton.addEventListener("click", () => {
        withButtonState(elements.createDemoButton, "Preparando demo...", createDemoGroup);
    });

    elements.savePlanButton.addEventListener("click", () => {
        withButtonState(elements.savePlanButton, "Guardando plan...", savePlan);
    });

    elements.addItemButton.addEventListener("click", () => {
        withButtonState(elements.addItemButton, "Anadiendo...", addItem);
    });

    elements.seedItemsButton.addEventListener("click", () => {
        withButtonState(elements.seedItemsButton, "Cargando pack...", seedItems);
    });

    elements.sendMessageButton.addEventListener("click", () => {
        withButtonState(elements.sendMessageButton, "Enviando...", sendMessage);
    });

    elements.shoppingFilters.querySelectorAll("[data-filter]").forEach((button) => {
        button.addEventListener("click", () => {
            uiState.itemFilter = button.getAttribute("data-filter") || "all";
            renderItems();
        });
    });

    elements.chatMessage.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            elements.sendMessageButton.click();
        }
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
    elements.adultsCount.value = state.plan.adults;
    elements.childrenCount.value = state.plan.children;
    elements.bbqReserved.value = state.plan.bbqReserved;
    elements.tablesReserved.value = state.plan.tablesReserved;
    elements.planNotes.value = state.plan.notes;
    const currentFriend = state.friends.find((friend) => friend.id === state.currentFriendId);
    elements.friendName.value = currentFriend ? currentFriend.name : "";
}

async function initializeApp() {
    setupInstallPrompt();
    registerServiceWorker();

    if (!hasSupabaseConfig) {
        updateSyncBadge("Modo demo local. Configura Supabase para compartir.", "is-offline");
        showToast("Modo local", "La interfaz funciona, pero falta conectar Supabase para compartirla.", "error");
        return;
    }

    updateSyncBadge("Supabase conectado", "");

    if (state.groupCode) {
        await loadRemoteGroup(state.groupCode);
        subscribeToGroup(state.groupCode);
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
    persistAndRender();
    await syncGroup("joined the group");
    subscribeToGroup(groupCode);
    maybeRequestNotificationPermission();
    showToast("Grupo listo", `Ya estas dentro de ${groupCode}.`, "success");
}

async function createDemoGroup() {
    state.groupCode = "SOMONTES-2026";
    state.friends = [
        createFriend("Toni"),
        createFriend("Laura"),
        createFriend("Javi"),
        createFriend("Marta")
    ];
    state.friends[0].deviceId = state.clientId;
    state.currentFriendId = state.friends[0].id;
    state.plan = normalizePlan({
        date: getUpcomingSaturday(),
        adults: "10",
        children: "4",
        bbqReserved: "BBQ 2 y 3",
        tablesReserved: "Mesa 6 y 7",
        notes: "Quedar a las 13:00. Llevar hielos extra y pinzas.",
        updatedAt: nowIso()
    });
    state.items = defaultItems.map((item, index) => normalizeItem({
        id: createId(),
        name: item.name,
        quantity: item.quantity,
        ownerId: state.friends[index % state.friends.length].id,
        updatedAt: nowIso(),
        completedAt: "",
        deletedAt: ""
    }));
    state.messages = [];
    persistAndRender();
    await syncGroup("created the demo group");
    subscribeToGroup(state.groupCode);
    maybeRequestNotificationPermission();
    showToast("Demo lista", "Hemos cargado una BBQ de ejemplo para que pruebes la app.", "success");
}

async function savePlan() {
    if (!hasGroup()) {
        showToast("Necesitas un grupo", "Unete primero a un grupo para guardar el plan.", "error");
        return;
    }

    state.plan = normalizePlan({
        date: elements.bbqDate.value,
        adults: elements.adultsCount.value,
        children: elements.childrenCount.value,
        bbqReserved: elements.bbqReserved.value.trim(),
        tablesReserved: elements.tablesReserved.value.trim(),
        notes: elements.planNotes.value.trim(),
        updatedAt: nowIso()
    });
    persistAndRender();
    await syncGroup("updated the plan");
    showToast("Plan guardado", "La fecha y la reserva de la BBQ han quedado actualizadas.", "success");
}

async function addItem() {
    if (!hasGroup()) {
        showToast("Sin grupo activo", "Unete a un grupo antes de anadir compras.", "error");
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
    persistAndRender();
    await syncGroup("added an item");
    showToast("Compra anadida", `${name} ya esta en la lista compartida.`, "success");
}

async function seedItems() {
    if (!hasGroup()) {
        showToast("Sin grupo activo", "Crea o entra en un grupo antes de cargar el pack.", "error");
        return;
    }

    const availableOwners = state.friends.map((friend) => friend.id);
    state.items = defaultItems.map((item, index) => normalizeItem({
        id: createId(),
        name: item.name,
        quantity: item.quantity,
        ownerId: availableOwners.length ? availableOwners[index % availableOwners.length] : "",
        updatedAt: nowIso(),
        completedAt: "",
        deletedAt: ""
    }));
    uiState.editingItemId = "";
    persistAndRender();
    await syncGroup("loaded the bbq pack");
    showToast("Pack BBQ cargado", "Ya tienes el pack base listo para repartir.", "success");
}

function render() {
    renderSetupGuide();
    renderOverview();
    renderGroup();
    renderPlan();
    renderOwnerOptions();
    renderItems();
    renderAssignments();
    renderMessages();
    renderLocks();
    renderInstallButton();
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
        return "Siguiente paso recomendado: completa el plan con fecha, asistentes, BBQs y mesas.";
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
    elements.activeGroupChip.textContent = state.groupCode || "Sin grupo";

    if (!state.friends.length) {
        elements.friendStrip.innerHTML = '<div class="empty-state">Todavia no hay amigos en este grupo. Puedes arrancar con Crear grupo demo.</div>';
        return;
    }

    const visibleFriends = state.friends
        .slice()
        .sort((left, right) => left.name.localeCompare(right.name, "es"));

    elements.friendStrip.innerHTML = visibleFriends
        .map((friend) => {
            const isCurrent = friend.id === state.currentFriendId;
            return `
                <article class="friend-card">
                    <span>${isCurrent ? "Tu movil" : "Amigo"}</span>
                    <strong>${escapeHtml(friend.name)}</strong>
                    <div>${state.groupCode || "Sin codigo"}</div>
                </article>
            `;
        })
        .join("");
}

function renderPlan() {
    const dateText = state.plan.date ? formatDate(state.plan.date) : "Sin fecha";
    const syncText = state.lastSyncedAt ? `Ultima sync: ${formatTime(state.lastSyncedAt)}` : "Sin sincronizar";
    elements.planSummary.innerHTML = `
        <strong>${dateText}</strong><br>
        Adultos: ${escapeHtml(state.plan.adults || "0")}<br>
        Ninos: ${escapeHtml(state.plan.children || "0")}<br>
        BBQ reservada(s): ${escapeHtml(state.plan.bbqReserved || "Pendiente")}<br>
        Mesa(s): ${escapeHtml(state.plan.tablesReserved || "Pendiente")}<br>
        Notas: ${escapeHtml(state.plan.notes || "Sin notas todavia")}<br>
        ${escapeHtml(syncText)}
    `;
}

function renderOwnerOptions() {
    const options = ['<option value="">Sin asignar</option>']
        .concat(
            state.friends.map(
                (friend) => `<option value="${friend.id}">${escapeHtml(friend.name)}</option>`
            )
        )
        .join("");

    elements.newItemOwner.innerHTML = options;
}

function renderItems() {
    const activeItems = filterItemsByView(getActiveItems());
    elements.itemsCounter.textContent = `${activeItems.length} items`;

    elements.shoppingFilters.querySelectorAll("[data-filter]").forEach((button) => {
        button.classList.toggle("is-active", button.getAttribute("data-filter") === uiState.itemFilter);
    });

    if (!activeItems.length) {
        elements.shoppingList.innerHTML = '<div class="empty-state">No hay items para este filtro. Prueba con otro estado o carga el pack BBQ.</div>';
        return;
    }

    elements.shoppingList.innerHTML = activeItems
        .map((item) => {
            const owner = state.friends.find((friend) => friend.id === item.ownerId);
            const ownerOptions = ['<option value="">Sin asignar</option>']
                .concat(
                    state.friends.map(
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
                    <article class="shopping-item">
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
                <article class="shopping-item ${item.completedAt ? "is-done" : ""}">
                    <div class="shopping-top">
                        <div>
                            <strong>${escapeHtml(item.name)}</strong>
                            <div class="item-meta">${escapeHtml(item.quantity || "Sin detalle")}</div>
                        </div>
                        <div>${owner ? `Compra: ${escapeHtml(owner.name)}` : "Sin asignar"}</div>
                    </div>
                    <div class="shopping-badges">
                        <span class="status-badge ${item.completedAt ? "done" : "pending"}">${item.completedAt ? "Comprado" : "Pendiente"}</span>
                        ${item.ownerId ? "" : '<span class="status-badge pending">Sin asignar</span>'}
                    </div>
                    <div class="shopping-actions">
                        <select data-owner-select="${item.id}">${ownerOptions}</select>
                        <button class="inline-action" type="button" data-toggle-done="${item.id}">
                            ${item.completedAt ? "Marcar pendiente" : "Marcar comprado"}
                        </button>
                        <button class="inline-action" type="button" data-edit-item="${item.id}">Editar</button>
                        <button class="inline-button" type="button" data-delete-item="${item.id}">Eliminar</button>
                    </div>
                </article>
            `;
        })
        .join("");

    wireShoppingActions();
}

function wireShoppingActions() {
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
    if (!state.friends.length) {
        elements.assignmentsGrid.innerHTML = '<div class="empty-state">Anade amigos al grupo para repartir la compra.</div>';
        return;
    }

    const activeItems = getActiveItems();

    elements.assignmentsGrid.innerHTML = state.friends
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
                                        <strong>${escapeHtml(item.name)}</strong><br>
                                        ${escapeHtml(item.quantity || "Sin detalle")}
                                    </li>
                                `
                            )
                            .join("")}
                        ${doneItems
                            .map(
                                (item) => `
                                    <li>
                                        <strong>${escapeHtml(item.name)}</strong><br>
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
    const activeMessages = getActiveMessages();
    elements.messagesCounter.textContent = `${activeMessages.length} mensajes`;

    if (!activeMessages.length) {
        elements.chatThread.innerHTML = '<div class="empty-state">Aun no hay mensajes. Usa ToniChat para coordinar compras y llegada.</div>';
        return;
    }

    elements.chatThread.innerHTML = activeMessages
        .map((message) => {
            const author = state.friends.find((friend) => friend.id === message.authorId);
            const isMine = message.authorId === state.currentFriendId;
            return `
                <article class="chat-bubble ${isMine ? "mine" : "theirs"}">
                    <div class="chat-meta">
                        <span>${escapeHtml(author ? author.name : "Amigo")}</span>
                        <span>${escapeHtml(formatChatDate(message.createdAt))}</span>
                    </div>
                    <div class="chat-text">${escapeHtml(message.text)}</div>
                </article>
            `;
        })
        .join("");

    elements.chatThread.scrollTop = elements.chatThread.scrollHeight;
    lastSeenMessageId = getLastSeenMessageId(activeMessages);
}

function renderLocks() {
    document.querySelectorAll("[data-requires-group]").forEach((panel) => {
        panel.classList.toggle("is-locked", !hasGroup());
    });
}

function renderInstallButton() {
    elements.installAppButton.classList.toggle("hidden", !uiState.deferredInstallPrompt);
}

async function updateItemOwner(itemId, ownerId) {
    const item = state.items.find((entry) => entry.id === itemId);
    if (!item) return;
    item.ownerId = ownerId;
    item.updatedAt = nowIso();
    persistAndRender();
    await syncGroup("updated an assignment");
    showToast("Asignacion actualizada", "La compra ya tiene responsable.", "success");
}

async function deleteItem(itemId) {
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

function getActiveItems() {
    return state.items.filter((item) => !item.deletedAt);
}

function filterItemsByView(items) {
    if (uiState.itemFilter === "pending") {
        return items.filter((item) => !item.completedAt);
    }
    if (uiState.itemFilter === "done") {
        return items.filter((item) => item.completedAt);
    }
    if (uiState.itemFilter === "unassigned") {
        return items.filter((item) => !item.ownerId);
    }
    return items;
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

function isPlanReady() {
    return Boolean(
        state.plan.date &&
        state.plan.adults !== "" &&
        state.plan.children !== "" &&
        state.plan.bbqReserved &&
        state.plan.tablesReserved
    );
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

    if (!hasSupabaseConfig) {
        persistAndRender();
        updateSyncBadge("Modo demo local. Falta Supabase.", "is-offline");
        return;
    }

    try {
        updateSyncBadge("Sincronizando con Supabase...", "");

        const localGroup = buildGroupPayload();
        const remoteRow = await fetchRemoteGroupRow(state.groupCode);
        const remoteGroup = remoteRow ? rowToGroup(remoteRow) : blankGroupPayload(state.groupCode);
        const mergedGroup = mergeGroupData(localGroup, remoteGroup);

        const row = {
            code: state.groupCode,
            plan: mergedGroup.plan,
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

        applyGroupRow(data);
        state.lastSyncedAt = nowIso();
        persistAndRender();
        updateSyncBadge(`En linea con ${state.groupCode}`, "");
    } catch (error) {
        console.error(error);
        persistAndRender();
        updateSyncBadge("Error conectando con Supabase", "is-error");
        showToast("No se pudo sincronizar", "Tus cambios siguen en este dispositivo. Vuelve a intentarlo en un momento.", "error");
    }
}

async function loadRemoteGroup(groupCode) {
    if (!hasSupabaseConfig || !groupCode) {
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
        updateSyncBadge("No se pudo leer Supabase", "is-error");
        showToast("Error de lectura", "No hemos podido cargar el grupo desde Supabase.", "error");
    }
}

async function fetchRemoteGroupRow(groupCode) {
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

function subscribeToGroup(groupCode) {
    if (!hasSupabaseConfig || !groupCode) {
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

    state.groupCode = normalizedRow.code || state.groupCode;
    state.plan = normalizedRow.plan;
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
}

function buildGroupPayload() {
    return {
        groupCode: state.groupCode,
        plan: normalizePlan(state.plan),
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
        friends: Array.isArray(candidate.friends) ? candidate.friends.map(normalizeFriend) : [],
        items: Array.isArray(candidate.items) ? candidate.items.map(normalizeItem) : [],
        messages: Array.isArray(candidate.messages) ? candidate.messages.map(normalizeMessage) : []
    };
}

function normalizeGroupRow(row) {
    return {
        code: normalizeGroupCode(row.code || row.groupCode || ""),
        plan: normalizePlan(row.plan || {}),
        friends: Array.isArray(row.friends) ? dedupeFriends(row.friends.map(normalizeFriend)) : [],
        items: Array.isArray(row.items) ? dedupeById(row.items.map(normalizeItem)) : [],
        messages: Array.isArray(row.messages) ? dedupeById(row.messages.map(normalizeMessage)) : []
    };
}

function blankPlan() {
    return {
        date: "",
        adults: "",
        children: "",
        bbqReserved: "",
        tablesReserved: "",
        notes: "",
        updatedAt: ""
    };
}

function blankGroupPayload(groupCode) {
    return {
        groupCode,
        plan: blankPlan(),
        friends: [],
        items: [],
        messages: []
    };
}

function normalizePlan(plan) {
    return {
        date: String(plan.date || ""),
        adults: String(plan.adults || ""),
        children: String(plan.children || ""),
        bbqReserved: String(plan.bbqReserved || ""),
        tablesReserved: String(plan.tablesReserved || ""),
        notes: String(plan.notes || ""),
        updatedAt: String(plan.updatedAt || "")
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

function mergeGroupData(localGroup, remoteGroup) {
    return {
        groupCode: localGroup.groupCode || remoteGroup.groupCode || "",
        plan: mergeByUpdatedAt(normalizePlan(localGroup.plan), normalizePlan(remoteGroup.plan)),
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

function getUpcomingSaturday() {
    const date = new Date();
    const day = date.getDay();
    const distance = (6 - day + 7) % 7 || 7;
    date.setDate(date.getDate() + distance);
    return date.toISOString().slice(0, 10);
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
