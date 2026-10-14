"use strict";

const DB_NAME = "LocalVaultDB";
const STORE_NAME = "records";
const DB_VERSION = 1;

let db;
let records = [];
let deleteId = null;

const $ = id => document.getElementById(id);

// IndexedDB setup
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, {
          keyPath: "id"
        });
      }
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onerror = () => reject(request.error);
  });
}

// Database operations
function getAll() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function save(record) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(record);

    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Save aborted"));
  });
}

function remove(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);

    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

function getOne(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(id);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Helpers
function makeId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function toast(message) {
  const node = $("toast");

  if (!node) {
    console.log(message);
    return;
  }

  node.textContent = message;
  node.classList.add("show");

  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    node.classList.remove("show");
  }, 2500);
}

function formatDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Unknown";

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function textElement(tag, text, className) {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

// READ: Display records
function render() {
  const body = $("recordsBody");
  if (!body) return;

  const query = ($("searchInput")?.value || "")
    .trim().toLowerCase();

  const category = $("categoryFilter")?.value || "";
  const sort = $("sortSelect")?.value || "updated";

  const categories = [...new Set(
    records.map(r => r.category).filter(Boolean)
  )].sort();

  const filter = $("categoryFilter");

  if (filter) {
    const previous = filter.value;
    filter.replaceChildren();

    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = "All categories";
    filter.appendChild(allOption);

    categories.forEach(name => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      filter.appendChild(option);
    });

    filter.value = categories.includes(category) ? category : "";
    if (previous && categories.includes(previous)) {
      filter.value = previous;
    }
  }

  const visible = records.filter(record => {
    const content = [
      record.title,
      record.category,
      record.description
    ].join(" ").toLowerCase();

    return (!query || content.includes(query)) &&
      (!category || record.category === category);
  });

  visible.sort((a, b) => {
    if (sort === "title") {
      return a.title.localeCompare(b.title);
    }

    const key = sort === "created" ? "createdAt" : "updatedAt";
    return new Date(b[key]) - new Date(a[key]);
  });

  body.replaceChildren();

  if (visible.length === 0) {
    const tr = document.createElement("tr");
    const td = textElement(
      "td",
      records.length
        ? "No matching records found."
        : "No records yet. Click New record to get started.",
      "empty-cell"
    );

    td.colSpan = 4;
    tr.appendChild(td);
    body.appendChild(tr);
  }

  visible.forEach(record => {
    const tr = document.createElement("tr");

    // Title and description
    const titleCell = document.createElement("td");
    const recordCell = document.createElement("div");
    recordCell.className = "record-cell";

    recordCell.appendChild(textElement(
      "div",
      Array.from(record.title)[0]?.toUpperCase() || "?",
      "record-avatar"
    ));

    const info = document.createElement("div");
    info.appendChild(textElement("div", record.title, "record-name"));

    if (record.description) {
      info.appendChild(textElement(
        "div", record.description, "record-description"
      ));
    }

    recordCell.appendChild(info);
    titleCell.appendChild(recordCell);
    tr.appendChild(titleCell);

    // Category
    const categoryCell = document.createElement("td");
    categoryCell.appendChild(textElement(
      "span",
      record.category || "Uncategorized",
      "category-pill"
    ));
    tr.appendChild(categoryCell);

    // Date
    const dateCell = textElement(
      "td", formatDate(record.updatedAt), "date-cell"
    );
    tr.appendChild(dateCell);

    // Actions
    const actionCell = document.createElement("td");
    const actions = document.createElement("div");
    actions.className = "row-actions";

    const edit = textElement("button", "✎", "icon-button");
    edit.type = "button";
    edit.title = "Edit record";
    edit.setAttribute("aria-label", "Edit " + record.title);
    edit.addEventListener("click", () => editRecord(record.id));

    const del = textElement("button", "⌫", "icon-button delete");
    del.type = "button";
    del.title = "Delete record";
    del.setAttribute("aria-label", "Delete " + record.title);
    del.addEventListener("click", () => askDelete(record.id));

    actions.append(edit, del);
    actionCell.appendChild(actions);
    tr.appendChild(actionCell);

    body.appendChild(tr);
  });

  const total = $("totalCount");
  if (total) total.textContent = records.length;

  const count = $("categoryCount");
  if (count) count.textContent = categories.length;

  const month = $("monthCount");
  if (month) {
    const now = new Date();
    month.textContent = records.filter(r => {
      const d = new Date(r.createdAt);
      return d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear();
    }).length;
  }

  const resultCount = $("resultCount");
  if (resultCount) {
    resultCount.textContent =
      `${visible.length} ${visible.length === 1 ? "record" : "records"}`;
  }
}

async function refresh() {
  records = await getAll();
  render();
}

// CREATE
function createRecord() {
  $("recordForm").reset();
  $("recordId").value = "";
  $("dialogTitle").textContent = "Create record";
  $("saveBtn").textContent = "Save record";
  $("recordDialog").showModal();
  $("recordTitle").focus();
}

// UPDATE: Open edit form
async function editRecord(id) {
  try {
    const record = await getOne(id);

    if (!record) {
      toast("Record not found.");
      return;
    }

    $("recordId").value = record.id;
    $("recordTitle").value = record.title;
    $("recordCategory").value = record.category || "";
    $("recordDescription").value = record.description || "";
    $("dialogTitle").textContent = "Edit record";
    $("saveBtn").textContent = "Update record";

    $("recordDialog").showModal();
    $("recordTitle").focus();
  } catch (error) {
    console.error(error);
    alert("Could not open the record.");
  }
}

// CREATE and UPDATE: Save form
$("recordForm").addEventListener("submit", async event => {
  event.preventDefault();

  const id = $("recordId").value;
  const title = $("recordTitle").value.trim();
  const category = $("recordCategory").value.trim();
  const description = $("recordDescription").value.trim();

  if (!title) {
    $("recordTitle").focus();
    return;
  }

  const now = new Date().toISOString();

  try {
    let record;

    if (id) {
      const old = await getOne(id);

      if (!old) {
        alert("Record no longer exists. Refresh and try again.");
        return;
      }

      record = {
        ...old,
        title,
        category,
        description,
        updatedAt: now
      };
    } else {
      record = {
        id: makeId(),
        title,
        category,
        description,
        createdAt: now,
        updatedAt: now
      };
    }

    await save(record);
    $("recordDialog").close();
    await refresh();

    toast(id ? "Record updated." : "Record created.");
  } catch (error) {
    console.error(error);
    alert("Could not save the record.");
  }
});

// DELETE
function askDelete(id) {
  deleteId = id;
  $("confirmDialog").showModal();
}

$("confirmDelete").addEventListener("click", async () => {
  if (!deleteId) return;

  try {
    await remove(deleteId);
    deleteId = null;
    $("confirmDialog").close();
    await refresh();
    toast("Record deleted.");
  } catch (error) {
    console.error(error);
    alert("Could not delete the record.");
  }
});

$("keepRecord").addEventListener("click", () => {
  deleteId = null;
  $("confirmDialog").close();
});

// Search and filters
$("addBtn").addEventListener("click", createRecord);
$("searchInput").addEventListener("input", render);
$("categoryFilter").addEventListener("change", render);
$("sortSelect").addEventListener("change", render);

$("closeDialog").addEventListener("click", () =>
  $("recordDialog").close()
);

$("cancelDialog").addEventListener("click", () =>
  $("recordDialog").close()
);

$("navAll").addEventListener("click", () => {
  $("searchInput").value = "";
  $("categoryFilter").value = "";
  render();
});

$("navCategories").addEventListener("click", () => {
  $("categoryFilter").focus();
  toast("Choose a category from the filter.");
});

// EXPORT: Download JSON backup
$("exportBtn").addEventListener("click", async () => {
  try {
    await refresh();

    const backup = {
      app: "LocalVault",
      version: 1,
      exportedAt: new Date().toISOString(),
      records
    };

    const blob = new Blob(
      [JSON.stringify(backup, null, 2)],
      { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `localvault-backup-${new Date()
      .toISOString().slice(0, 10)}.json`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Backup exported.");
  } catch (error) {
    console.error(error);
    alert("Export failed.");
  }
});

// IMPORT: Restore/merge JSON backup
$("importBtn").addEventListener("click", () => {
  $("importFile").value = "";
  $("importFile").click();
});

$("importFile").addEventListener("change", async event => {
  const file = event.target.files?.[0];
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    alert("Choose a JSON file smaller than 5 MB.");
    return;
  }

  try {
    const parsed = JSON.parse(await file.text());
    const input = Array.isArray(parsed) ? parsed : parsed.records;

    if (!Array.isArray(input) || input.length > 10000) {
      throw new Error("Invalid backup or too many records.");
    }

    const imported = input.map(item => {
      if (!item || typeof item.title !== "string" ||
          !item.title.trim() || item.title.length > 120) {
        throw new Error("A record has an invalid title.");
      }

      if (item.category != null &&
          (typeof item.category !== "string" || item.category.length > 60)) {
        throw new Error("A record has an invalid category.");
      }

      if (item.description != null &&
          (typeof item.description !== "string" || item.description.length > 10000)) {
        throw new Error("A record has an invalid description.");
      }

      const validDate = value =>
        typeof value === "string" && !Number.isNaN(Date.parse(value));

      return {
        id: typeof item.id === "string" && item.id.length <= 200
          ? item.id : makeId(),
        title: item.title.trim(),
        category: typeof item.category === "string"
          ? item.category.trim() : "",
        description: typeof item.description === "string"
          ? item.description : "",
        createdAt: validDate(item.createdAt)
          ? new Date(item.createdAt).toISOString()
          : new Date().toISOString(),
        updatedAt: validDate(item.updatedAt)
          ? new Date(item.updatedAt).toISOString()
          : new Date().toISOString()
      };
    });

    const unique = [
      ...new Map(imported.map(r => [r.id, r])).values()
    ];

    if (!unique.length) {
      alert("No records found in the backup.");
      return;
    }

    if (!confirm(
      `Import ${unique.length} records? Matching IDs will be replaced.`
    )) return;

    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      unique.forEach(record =>
        tx.objectStore(STORE_NAME).put(record)
      );
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Import aborted"));
    });

    await refresh();
    toast(`Imported ${unique.length} records.`);
  } catch (error) {
    console.error(error);
    alert("Import failed: " + error.message);
  } finally {
    event.target.value = "";
  }
});

// Dialog helpers
$("closeMessage").addEventListener("click", () =>
  $("messageDialog").close()
);

$("backupHintBtn").addEventListener("click", () =>
  $("backupDialog").showModal()
);

$("closeBackup").addEventListener("click", () =>
  $("backupDialog").close()
);

// Initialize app
async function init() {
  $("todayLabel").textContent = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date());

  try {
    await openDB();
    await refresh();
    $("storageStatus").textContent = "IndexedDB connected";
  } catch (error) {
    console.error(error);
    $("storageStatus").textContent = "Database unavailable";
    alert("Could not open local storage. Check browser support and permissions.");
    return;
  }

  if ("serviceWorker" in navigator && window.isSecureContext) {
    navigator.serviceWorker.register("./sw.js")
      .then(() => {
        $("connectionStatus").textContent = "● Offline-ready";
      })
      .catch(error => console.warn("Service worker error:", error));
  }
}

init();