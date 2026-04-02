(function () {
  const weekHeader = document.getElementById("weekHeader");
  const calendarGrid = document.getElementById("calendarGrid");
  const calendarMonthLabel = document.getElementById("calendarMonthLabel");
  const prevMonthBtn = document.getElementById("prevMonthBtn");
  const nextMonthBtn = document.getElementById("nextMonthBtn");
  const selectedDateLabel = document.getElementById("selectedDateLabel");
  const moodList = document.getElementById("moodList");
  const noteTitle = document.getElementById("noteTitle");
  const editor = document.getElementById("editor");
  const newBtn = document.getElementById("newBtn");
  const saveBtn = document.getElementById("saveBtn");
  const shareBtn = document.getElementById("shareBtn");
  const deleteBtn = document.getElementById("deleteBtn");
  const notesList = document.getElementById("notesList");
  const statusText = document.getElementById("statusText");
  const streakCurrent = document.getElementById("streakCurrent");
  const streakLongest = document.getElementById("streakLongest");
  const irelandTime = document.getElementById("irelandTime");
  const irelandDate = document.getElementById("irelandDate");
  const toolbar = document.getElementById("toolbar");
  const linkBtn = document.getElementById("linkBtn");
  const clearBtn = document.getElementById("clearBtn");
  const shareBox = document.getElementById("shareBox");
  const shareUrlInput = document.getElementById("shareUrlInput");
  const copyShareBtn = document.getElementById("copyShareBtn");
  const wordCount = document.getElementById("wordCount");
  const readTime = document.getElementById("readTime");

  const state = {
    selectedDate: todayIso(),
    currentMonth: monthStart(new Date()),
    selectedMood: "calm",
    allNotes: [],
    activeNoteId: null,
    monthMap: new Map(),
  };

  function toLocalIsoDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function todayIso() {
    return toLocalIsoDate(new Date());
  }

  function monthStart(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function isoFromDate(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return toLocalIsoDate(d);
  }

  function setStatus(text, type) {
    statusText.textContent = text || "";
    statusText.style.color =
      type === "error" ? "#ff9ab3" : type === "ok" ? "#9fffd3" : "#9fc2f5";
  }

  async function api(path, options = {}) {
    const res = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "Request failed");
    }
    return data;
  }

  function renderWeekHeader() {
    const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    weekHeader.innerHTML = labels.map((d) => `<div>${d}</div>`).join("");
  }

  function formatMonthLabel(date) {
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
    });
  }

  function renderCalendar() {
    calendarMonthLabel.textContent = formatMonthLabel(state.currentMonth);
    selectedDateLabel.textContent = state.selectedDate;

    const first = monthStart(state.currentMonth);
    const startDay = first.getDay();
    const firstGridDate = new Date(first);
    firstGridDate.setDate(first.getDate() - startDay);

    const cells = [];
    for (let i = 0; i < 42; i++) {
      const cellDate = new Date(firstGridDate);
      cellDate.setDate(firstGridDate.getDate() + i);

      const iso = isoFromDate(cellDate);
      const isSelected = iso === state.selectedDate;
      const isOtherMonth = cellDate.getMonth() !== first.getMonth();
      const hasNote = state.monthMap.has(iso);
      const cls = [
        "day",
        isOtherMonth ? "other-month" : "",
        isSelected ? "selected" : "",
        hasNote ? "has-note" : "",
      ]
        .filter(Boolean)
        .join(" ");

      cells.push(
        `<button class="${cls}" data-date="${iso}" type="button">${cellDate.getDate()}</button>`
      );
    }

    calendarGrid.innerHTML = cells.join("");
  }

  function renderNotesList() {
    if (!state.allNotes.length) {
      notesList.innerHTML = `<p class="note-meta">No notes saved yet.</p>`;
      return;
    }

    notesList.innerHTML = state.allNotes
      .map((n) => {
        const active = n.id === state.activeNoteId ? "active" : "";
        const inSelectedDay = n.date === state.selectedDate;
        return `
          <article class="note-card ${active}" data-note-id="${n.id}">
            <div class="note-title">${escapeHtml(n.title || "Untitled Note")}</div>
            <div class="note-meta"><span class="note-date">${escapeHtml(n.date)}</span> | ${escapeHtml(
          n.mood || "neutral"
        )}${inSelectedDay ? " | selected day" : ""}</div>
          </article>
        `;
      })
      .join("");
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function selectMood(mood) {
    state.selectedMood = mood;
    moodList.querySelectorAll(".mood-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mood === mood);
    });
  }

  function resetEditor() {
    state.activeNoteId = null;
    noteTitle.value = "";
    editor.innerHTML = "";
    selectMood("calm");
    shareBtn.disabled = true;
    deleteBtn.disabled = true;
    shareBox.classList.add("hidden");
    shareUrlInput.value = "";
    updateWritingMetrics();
  }

  async function loadStreak() {
    const data = await api("/api/streak");
    streakCurrent.textContent = data.streak.current;
    streakLongest.textContent = data.streak.longest;
  }

  async function loadMonthMap() {
    const month = `${state.currentMonth.getFullYear()}-${String(
      state.currentMonth.getMonth() + 1
    ).padStart(2, "0")}`;
    const data = await api(`/api/notes?month=${month}`);
    state.monthMap = new Map();
    (data.notes || []).forEach((n) => state.monthMap.set(n.date, true));
  }

  async function loadAllNotes() {
    const data = await api("/api/notes");
    state.allNotes = data.notes || [];
    state.allNotes.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    renderNotesList();
  }

  async function openNote(id) {
    const data = await api(`/api/notes/${id}`);
    const note = data.note;
    state.activeNoteId = note.id;
    noteTitle.value = note.title || "";
    editor.innerHTML = note.contentHtml || "";
    selectMood(note.mood || "calm");
    shareBtn.disabled = false;
    deleteBtn.disabled = false;
    updateWritingMetrics();
    renderNotesList();
  }

  function notePayload() {
    return {
      title: noteTitle.value.trim() || "Untitled Note",
      date: state.selectedDate,
      mood: state.selectedMood,
      contentHtml: editor.innerHTML.trim(),
    };
  }

  async function saveNote() {
    const payload = notePayload();
    if (!payload.contentHtml && !payload.title) {
      setStatus("Write something before saving.", "error");
      return;
    }

    if (state.activeNoteId) {
      await api(`/api/notes/${state.activeNoteId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setStatus("Note updated.", "ok");
    } else {
      const data = await api("/api/notes", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      state.activeNoteId = data.note.id;
      shareBtn.disabled = false;
      deleteBtn.disabled = false;
      setStatus("New note saved.", "ok");
    }

    await refreshAll();
    if (state.activeNoteId) {
      await openNote(state.activeNoteId);
    }
  }

  async function deleteNote() {
    if (!state.activeNoteId) return;
    await api(`/api/notes/${state.activeNoteId}`, { method: "DELETE" });
    setStatus("Note deleted.", "ok");
    resetEditor();
    await refreshAll();
  }

  async function createShare() {
    if (!state.activeNoteId) {
      setStatus("Save a note first, then share.", "error");
      return;
    }
    const data = await api(`/api/share/${state.activeNoteId}`, { method: "POST" });
    shareBox.classList.remove("hidden");
    shareUrlInput.value = data.shareUrl;
    setStatus("Share link generated on your local app.", "ok");
  }

  async function copyShareUrl() {
    if (!shareUrlInput.value) return;
    await navigator.clipboard.writeText(shareUrlInput.value);
    setStatus("Share URL copied.", "ok");
  }

  function updateWritingMetrics() {
    const plain = (editor.textContent || "").trim();
    const words = plain ? plain.split(/\s+/).filter(Boolean).length : 0;
    const minutes = Math.max(1, Math.ceil(words / 200));
    wordCount.textContent = String(words);
    readTime.textContent = `${words === 0 ? 0 : minutes} min`;
  }

  function updateIrelandClock() {
    const now = new Date();
    irelandTime.textContent = new Intl.DateTimeFormat("en-IE", {
      timeZone: "Europe/Dublin",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(now);

    irelandDate.textContent = new Intl.DateTimeFormat("en-IE", {
      timeZone: "Europe/Dublin",
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(now);
  }

  function startIrelandClock() {
    updateIrelandClock();
    setInterval(updateIrelandClock, 1000);
  }

  function runToolbar(cmd, value) {
    editor.focus();
    document.execCommand(cmd, false, value);
  }

  async function refreshAll() {
    await Promise.all([loadMonthMap(), loadAllNotes(), loadStreak()]);
    renderCalendar();
    renderNotesList();
  }

  function bindEvents() {
    prevMonthBtn.addEventListener("click", async () => {
      state.currentMonth = new Date(
        state.currentMonth.getFullYear(),
        state.currentMonth.getMonth() - 1,
        1
      );
      await loadMonthMap();
      renderCalendar();
    });

    nextMonthBtn.addEventListener("click", async () => {
      state.currentMonth = new Date(
        state.currentMonth.getFullYear(),
        state.currentMonth.getMonth() + 1,
        1
      );
      await loadMonthMap();
      renderCalendar();
    });

    calendarGrid.addEventListener("click", async (event) => {
      const target = event.target.closest(".day");
      if (!target) return;
      state.selectedDate = target.dataset.date;
      resetEditor();
      await loadAllNotes();
      renderCalendar();
    });

    moodList.addEventListener("click", (event) => {
      const btn = event.target.closest(".mood-btn");
      if (!btn) return;
      selectMood(btn.dataset.mood);
    });

    notesList.addEventListener("click", async (event) => {
      const card = event.target.closest(".note-card");
      if (!card) return;
      await openNote(card.dataset.noteId);
    });

    newBtn.addEventListener("click", () => {
      resetEditor();
      setStatus("Ready for a fresh note.");
    });

    saveBtn.addEventListener("click", async () => {
      try {
        await saveNote();
      } catch (err) {
        setStatus(err.message, "error");
      }
    });

    deleteBtn.addEventListener("click", async () => {
      try {
        await deleteNote();
      } catch (err) {
        setStatus(err.message, "error");
      }
    });

    shareBtn.addEventListener("click", async () => {
      try {
        await createShare();
      } catch (err) {
        setStatus(err.message, "error");
      }
    });

    copyShareBtn.addEventListener("click", async () => {
      try {
        await copyShareUrl();
      } catch (err) {
        setStatus("Clipboard copy failed.", "error");
      }
    });

    toolbar.addEventListener("click", (event) => {
      const btn = event.target.closest("button");
      if (!btn || !btn.dataset.cmd) return;
      runToolbar(btn.dataset.cmd, btn.dataset.value || null);
    });

    linkBtn.addEventListener("click", () => {
      const url = prompt("Enter URL");
      if (url) runToolbar("createLink", url);
    });

    clearBtn.addEventListener("click", () => {
      editor.innerHTML = "";
      updateWritingMetrics();
    });

    editor.addEventListener("input", updateWritingMetrics);
  }

  async function init() {
    state.selectedDate = todayIso();
    state.currentMonth = monthStart(new Date());
    renderWeekHeader();
    selectMood(state.selectedMood);
    bindEvents();
    startIrelandClock();
    await refreshAll();
    const todayNote = state.allNotes.find((n) => n.date === state.selectedDate);
    if (todayNote) {
      await openNote(todayNote.id);
      setStatus("Loaded latest note for today.");
    }
    updateWritingMetrics();
    setStatus("Local journal ready.");
  }

  init().catch((err) => setStatus(err.message, "error"));
})();
