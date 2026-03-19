const STORAGE_KEY = "tonibbq-state-v3";

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
    plan: {
        date: "",
        adults: "",
        children: "",
        bbqReserved: "",
        tablesReserved: "",
        notes: "",
        updatedAt: ""
    },
    friends: [],
    items: [],
    messages: []
};

const SUPABASE_CONFIG = window.TONIBBQ_CONFIG || {};
const hasSupabaseConfig = Boolean(
    SUPABASE_CONFIG.supabaseUrl &&
    SUPABASE_CONFIG.supabaseAnonKey &&
    window.supabase &&
    typeof window.supabase.createClient === "function"
);

const supabase = hasSupabaseConfig
    ? window.supabase.createClient(
        SUPABASE_CONFIG.supabaseUrl,
        SUPABASE_CONFIG.supabaseAnonKey
    )
    : null;

const state = loadState();
let activeChannel = null;

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
    messagesCounter: document.getElementById("messagesCounter")
};

hydrateInputs();
bindEvents();
render();
initializeSync();

function bindEvents() {
    elements.joinGroupButton.addEventListener("click", joinGroup);
    elements.createDemoButton.addEventListener("click", createDemoGroup);
    elements.savePlanButton.addEventListener("click", savePlan);
    elements.addItemButton.addEventListener("click", addItem);
    elements.seedItemsButton.addEventListener("click", seedItems);
    elements.sendMessageButton.addEventListener("click", sendMessage);
}

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return cloneInitialState();
        const parsed = JSON.parse(raw);
        const nextState = { ...cloneInitialState(), ...parsed };
        if (!nextState.clientId) {
            nextState.clientId = createId();
        }
        return nextState;
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
        const nextState = { ...cloneInitialState(), ...JSON.parse(event.newValue) };
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

async function initializeSync() {
    if (!hasSupabaseConfig) {
        updateSyncBadge("Configura Supabase para compartir la app", "is-offline");
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
        window.alert("Escribe tu nombre y un codigo de grupo.");
        return;
    }

    state.groupCode = groupCode;
    await loadRemoteGroup(groupCode);

    const existingFriend = findFriendByName(name);
    const friend = existingFriend || createFriend(name);

    if (!existingFriend) {
        state.friends.push(friend);
    }

    state.currentFriendId = friend.id;
    touchFriend(friend.id);
    persistAndRender();
    await syncGroup("joined the group");
    subscribeToGroup(groupCode);
}

async function createDemoGroup() {
    state.groupCode = "SOMONTES-2026";
    state.friends = [
        createFriend("Toni"),
        createFriend("Laura"),
        createFriend("Javi"),
        createFriend("Marta")
    ];
    state.currentFriendId = state.friends[0].id;
    state.plan = {
        date: getUpcomingSaturday(),
        adults: "10",
        children: "4",
        bbqReserved: "BBQ 2 y 3",
        tablesReserved: "Mesa 6 y 7",
        notes: "Quedar a las 13:00. Llevar hielos extra y pinzas.",
        updatedAt: nowIso()
    };
    state.items = defaultItems.map((item, index) => ({
        id: createId(),
        name: item.name,
        quantity: item.quantity,
        ownerId: state.friends[index % state.friends.length].id,
        updatedAt: nowIso(),
        deletedAt: ""
    }));
    state.messages = [];

    persistAndRender();
    await syncGroup("created the demo group");
    subscribeToGroup(state.groupCode);
}

async function savePlan() {
    state.plan = {
        date: elements.bbqDate.value,
        adults: elements.adultsCount.value,
        children: elements.childrenCount.value,
        bbqReserved: elements.bbqReserved.value.trim(),
        tablesReserved: elements.tablesReserved.value.trim(),
        notes: elements.planNotes.value.trim(),
        updatedAt: nowIso()
    };
    persistAndRender();
    await syncGroup("updated the plan");
}

async function addItem() {
    const name = elements.newItemName.value.trim();
    const quantity = elements.newItemQty.value.trim();
    const ownerId = elements.newItemOwner.value;

    if (!name) {
        window.alert("Anade al menos el nombre del item.");
        return;
    }

    state.items.unshift({
        id: createId(),
        name,
        quantity,
        ownerId,
        updatedAt: nowIso(),
        deletedAt: ""
    });

    elements.newItemName.value = "";
    elements.newItemQty.value = "";
    persistAndRender();
    await syncGroup("added an item");
}

async function seedItems() {
    const availableOwners = state.friends.map((friend) => friend.id);
    state.items = defaultItems.map((item, index) => ({
        id: createId(),
        name: item.name,
        quantity: item.quantity,
        ownerId: availableOwners.length ? availableOwners[index % availableOwners.length] : "",
        updatedAt: nowIso(),
        deletedAt: ""
    }));
    persistAndRender();
    await syncGroup("loaded the bbq pack");
}

function render() {
    renderGroup();
    renderPlan();
    renderOwnerOptions();
    renderItems();
    renderAssignments();
    renderMessages();
}

function renderGroup() {
    elements.activeGroupChip.textContent = state.groupCode || "Sin grupo";

    if (!state.friends.length) {
        elements.friendStrip.innerHTML = '<div class="empty-state">Todavia no hay amigos en este grupo.</div>';
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
    const activeItems = getActiveItems();
    elements.itemsCounter.textContent = `${activeItems.length} items`;

    if (!activeItems.length) {
        elements.shoppingList.innerHTML = '<div class="empty-state">No hay items aun. Carga el pack BBQ o anade compras a mano.</div>';
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

            return `
                <article class="shopping-item">
                    <div class="shopping-top">
                        <div>
                            <strong>${escapeHtml(item.name)}</strong>
                            <div class="item-meta">${escapeHtml(item.quantity || "Sin detalle")}</div>
                        </div>
                        <div>${owner ? `Compra: ${escapeHtml(owner.name)}` : "Sin asignar"}</div>
                    </div>
                    <div class="shopping-actions">
                        <select data-owner-select="${item.id}">${ownerOptions}</select>
                        <button class="inline-button" data-delete-item="${item.id}">Eliminar</button>
                    </div>
                </article>
            `;
        })
        .join("");

    document.querySelectorAll("[data-owner-select]").forEach((select) => {
        select.addEventListener("change", async (event) => {
            const itemId = event.target.getAttribute("data-owner-select");
            await updateItemOwner(itemId, event.target.value);
        });
    });

    document.querySelectorAll("[data-delete-item]").forEach((button) => {
        button.addEventListener("click", async (event) => {
            const itemId = event.target.getAttribute("data-delete-item");
            await deleteItem(itemId);
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
            const ownedItems = activeItems.filter((item) => item.ownerId === friend.id);
            const listContent = ownedItems.length
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
        elements.chatThread.innerHTML = '<div class="empty-state">Aun no hay mensajes. Usa este chat para coordinar compras y llegada.</div>';
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
}

async function updateItemOwner(itemId, ownerId) {
    const item = state.items.find((entry) => entry.id === itemId);
    if (!item) return;
    item.ownerId = ownerId;
    item.updatedAt = nowIso();
    persistAndRender();
    await syncGroup("updated an assignment");
}

async function deleteItem(itemId) {
    const item = state.items.find((entry) => entry.id === itemId);
    if (!item) return;
    item.deletedAt = nowIso();
    item.updatedAt = item.deletedAt;
    persistAndRender();
    await syncGroup("deleted an item");
}

async function sendMessage() {
    const text = elements.chatMessage.value.trim();
    if (!text) {
        window.alert("Escribe un mensaje antes de enviarlo.");
        return;
    }

    if (!state.groupCode || !state.currentFriendId) {
        window.alert("Unete primero a un grupo para poder usar el chat.");
        return;
    }

    state.messages.push({
        id: createId(),
        authorId: state.currentFriendId,
        text,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        deletedAt: ""
    });

    elements.chatMessage.value = "";
    persistAndRender();
    await syncGroup("sent a chat message");
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

function findFriendByName(name) {
    return state.friends.find(
        (entry) => entry.name.trim().toLowerCase() === name.trim().toLowerCase()
    );
}

function createFriend(name) {
    return {
        id: createId(),
        name,
        updatedAt: nowIso()
    };
}

function touchFriend(friendId) {
    const friend = state.friends.find((entry) => entry.id === friendId);
    if (friend) {
        friend.updatedAt = nowIso();
    }
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
        const row = buildGroupRow(reason);
        const { data, error } = await supabase
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
    }
}

async function loadRemoteGroup(groupCode) {
    if (!hasSupabaseConfig || !groupCode) {
        return;
    }

    try {
        const { data, error } = await supabase
            .from("bbq_groups")
            .select("*")
            .eq("code", groupCode)
            .maybeSingle();

        if (error) {
            throw error;
        }

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
    }
}

function subscribeToGroup(groupCode) {
    if (!hasSupabaseConfig || !groupCode) {
        return;
    }

    if (activeChannel) {
        supabase.removeChannel(activeChannel);
        activeChannel = null;
    }

    activeChannel = supabase
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
    state.groupCode = row.code || state.groupCode;
    state.plan = row.plan || cloneInitialState().plan;
    state.friends = Array.isArray(row.friends) ? row.friends : [];
    state.items = Array.isArray(row.items) ? row.items : [];
    state.messages = Array.isArray(row.messages) ? row.messages : [];

    const currentFriend = state.friends.find((friend) => friend.id === state.currentFriendId);
    if (!currentFriend) {
        const typedName = elements.friendName.value.trim();
        const fallback = state.friends.find((friend) => {
            return typedName && friend.name.toLowerCase() === typedName.toLowerCase();
        });
        state.currentFriendId = fallback ? fallback.id : "";
    }
}

function buildGroupRow(reason) {
    return {
        code: state.groupCode,
        plan: state.plan,
        friends: state.friends,
        items: state.items,
        messages: state.messages,
        updated_by: state.clientId,
        updated_reason: reason,
        updated_at: nowIso()
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
}

function normalizeGroupCode(value) {
    return String(value)
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "-")
        .replace(/[^A-Z0-9_-]/g, "");
}

function createId() {
    return Math.random().toString(36).slice(2, 10);
}

function cloneInitialState() {
    return JSON.parse(JSON.stringify(initialState));
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

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
