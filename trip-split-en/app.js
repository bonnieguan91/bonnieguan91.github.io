(function () {
  "use strict";

  const STORAGE_KEY = "trip-split-en-v1";
  let state = loadState();
  let pendingReceipt = "";
  let receiptZoom = 1;

  function setReceiptZoom(nextZoom) {
    receiptZoom = Math.min(3, Math.max(.5, nextZoom));
    document.querySelector("#receiptDialogImage").style.transform = `scale(${receiptZoom})`;
    document.querySelector("#resetReceiptZoom").textContent = `${Math.round(receiptZoom * 100)}%`;
  }

  function openReceiptDialog(source, title) {
    const dialog = document.querySelector("#receiptDialog");
    document.querySelector("#receiptDialogTitle").textContent = title || "View receipt";
    document.querySelector("#receiptDialogImage").src = source;
    setReceiptZoom(1);
    dialog.showModal();
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && Array.isArray(saved.people) && Array.isArray(saved.expenses)) return saved;
    } catch (_) {}
    return { people: [], expenses: [] };
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function money(cents) {
    return `¥${(cents / 100).toFixed(2)}`;
  }

  function today() {
    const current = new Date();
    const offset = current.getTimezoneOffset() * 60000;
    return new Date(current.getTime() - offset).toISOString().slice(0, 10);
  }

  function formatDate(value) {
    if (!value) return "No date";
    const parts = value.split("-");
    return parts.length === 3 ? `${parts[0]}.${parts[1]}.${parts[2]}` : value;
  }

  function personName(id) {
    return state.people.find((person) => person.id === id)?.name || "Removed traveler";
  }

  function calculateBalances(people, expenses) {
    const balances = Object.fromEntries(people.map((person) => [person.id, { paid: 0, share: 0, net: 0 }]));
    expenses.forEach((expense) => {
      if (!balances[expense.payerId] || !expense.participantIds.length) return;
      balances[expense.payerId].paid += expense.amountCents;
      const baseShare = Math.floor(expense.amountCents / expense.participantIds.length);
      let remainder = expense.amountCents % expense.participantIds.length;
      expense.participantIds.forEach((id) => {
        if (!balances[id]) return;
        balances[id].share += baseShare + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder -= 1;
      });
    });
    Object.values(balances).forEach((balance) => { balance.net = balance.paid - balance.share; });
    return balances;
  }

  function calculateTransfers(people, balances) {
    const debtors = people.map((p) => ({ id: p.id, amount: -balances[p.id].net })).filter((p) => p.amount > 0).sort((a, b) => b.amount - a.amount);
    const creditors = people.map((p) => ({ id: p.id, amount: balances[p.id].net })).filter((p) => p.amount > 0).sort((a, b) => b.amount - a.amount);
    const transfers = [];
    let debtorIndex = 0;
    let creditorIndex = 0;
    while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
      const amount = Math.min(debtors[debtorIndex].amount, creditors[creditorIndex].amount);
      transfers.push({ from: debtors[debtorIndex].id, to: creditors[creditorIndex].id, amount });
      debtors[debtorIndex].amount -= amount;
      creditors[creditorIndex].amount -= amount;
      if (debtors[debtorIndex].amount === 0) debtorIndex += 1;
      if (creditors[creditorIndex].amount === 0) creditorIndex += 1;
    }
    return transfers;
  }

  function empty(message) {
    return `<div class="empty">${message}</div>`;
  }

  function renderPeople() {
    const list = document.querySelector("#peopleList");
    list.innerHTML = state.people.length ? state.people.map((person) => `
      <span class="person-chip">${escapeHtml(person.name)}<button type="button" data-remove-person="${person.id}" aria-label="Remove ${escapeHtml(person.name)}">×</button></span>
    `).join("") : empty("No travelers yet. Add a name to get started.");

    const payer = document.querySelector("#expensePayer");
    payer.innerHTML = state.people.length ? `<option value="">Choose a traveler</option>${state.people.map((person) => `<option value="${person.id}">${escapeHtml(person.name)}</option>`).join("")}` : `<option value="">Add a traveler first</option>`;
    payer.disabled = !state.people.length;

    document.querySelector("#participantChecks").innerHTML = state.people.length ? state.people.map((person) => `
      <label><input type="checkbox" name="participants" value="${person.id}" checked>${escapeHtml(person.name)}</label>
    `).join("") : `<span class="form-hint">Add a traveler first</span>`;
  }

  function renderExpenses() {
    const list = document.querySelector("#expenseList");
    list.innerHTML = state.expenses.length ? state.expenses.slice().reverse().map((expense) => `
      <article class="expense-item">
        <span class="expense-icon" aria-hidden="true">⌁</span>
        <div><h3>${escapeHtml(expense.title)}</h3><p>${escapeHtml(formatDate(expense.date))} · paid by ${escapeHtml(personName(expense.payerId))}<br>Shared by ${expense.participantIds.map(personName).map(escapeHtml).join(", ")}</p>${expense.receipt ? `<button class="receipt-thumb" type="button" data-view-receipt="${expense.id}" aria-label="Enlarge receipt for ${escapeHtml(expense.title)}"><img src="${expense.receipt}" alt="Receipt for ${escapeHtml(expense.title)}"><span>Enlarge receipt</span></button>` : ""}</div>
        <strong class="amount">${money(expense.amountCents)}</strong>
        <button class="delete" type="button" data-remove-expense="${expense.id}" aria-label="Remove ${escapeHtml(expense.title)}">×</button>
      </article>
    `).join("") : empty("Your ledger is empty. Add the first expense.");
  }

  function renderSettlement() {
    const balances = calculateBalances(state.people, state.expenses);
    const balanceBox = document.querySelector("#balances");
    balanceBox.innerHTML = state.people.length ? state.people.map((person) => {
      const item = balances[person.id];
      const status = item.net > 0 ? `Gets back ${money(item.net)}` : item.net < 0 ? `Owes ${money(-item.net)}` : "Settled";
      return `<div class="balance-row"><span>${escapeHtml(person.name)}<small>Paid ${money(item.paid)} · Share ${money(item.share)}</small></span><strong class="${item.net > 0 ? "positive" : item.net < 0 ? "negative" : ""}">${status}</strong></div>`;
    }).join("") : empty("Add travelers to see each person's balance.");

    const transfers = calculateTransfers(state.people, balances);
    document.querySelector("#transfers").innerHTML = transfers.length ? transfers.map((transfer) => `
      <div class="transfer"><span>${escapeHtml(personName(transfer.from))}</span><b>pays ${money(transfer.amount)} →</b><span>${escapeHtml(personName(transfer.to))}</span></div>
    `).join("") : empty(state.expenses.length ? "Everything is settled. No transfers needed." : "Suggested transfers will appear after you add expenses.");

    const total = state.expenses.reduce((sum, expense) => sum + expense.amountCents, 0);
    document.querySelector("#heroPeople").textContent = state.people.length;
    document.querySelector("#heroExpenses").textContent = state.expenses.length;
    document.querySelector("#heroTotal").textContent = money(total);
    document.querySelector("#exportButton").setAttribute("aria-disabled", String(!state.expenses.length));
  }

  function render() {
    renderPeople();
    renderExpenses();
    renderSettlement();
    saveState();
  }

  function resetExpenseForm() {
    document.querySelector("#expenseForm").reset();
    document.querySelector("#expenseDate").value = today();
    pendingReceipt = "";
    document.querySelector("#receiptPreview").hidden = true;
    document.querySelector("#receiptPreviewImage").removeAttribute("src");
    document.querySelector("#uploadText").textContent = "Choose a receipt or payment screenshot";
  }

  function compressImage(file) {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith("image/")) { reject(new Error("Please choose an image file.")); return; }
      if (file.size > 8 * 1024 * 1024) { reject(new Error("The image must be under 8 MB.")); return; }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("This image could not be read."));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error("This image could not be processed. Try a JPEG, PNG, or WebP file."));
        image.onload = () => {
          const scale = Math.min(1, 900 / Math.max(image.width, image.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", .72);
          if (dataUrl.length > 700000) { reject(new Error("The compressed image is still too large. Choose a smaller image.")); return; }
          resolve(dataUrl);
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function xmlEscape(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]);
  }

  function columnName(index) {
    let name = "";
    for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) name = String.fromCharCode(65 + ((value - 1) % 26)) + name;
    return name;
  }

  function xlsxSheet(headers, rows, widths) {
    const allRows = [headers.map((value) => ({ value, style: "header" })), ...rows];
    const rowXml = allRows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((cell, columnIndex) => {
      const reference = `${columnName(columnIndex)}${rowIndex + 1}`;
      const style = cell.style === "money" ? ' s="1"' : cell.style === "header" ? ' s="2"' : "";
      if (cell.type === "number") return `<c r="${reference}"${style}><v>${Number(cell.value)}</v></c>`;
      return `<c r="${reference}" t="inlineStr"${style}><is><t xml:space="preserve">${xmlEscape(cell.value)}</t></is></c>`;
    }).join("")}</row>`).join("");
    const columns = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${columns}</cols><sheetData>${rowXml}</sheetData></worksheet>`;
  }

  function crc32(bytes) {
    let crc = -1;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return (crc ^ -1) >>> 0;
  }

  function zipXlsx(files) {
    const encoder = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;
    const pushNumber = (view, position, value, bytes) => {
      if (bytes === 2) view.setUint16(position, value, true);
      else view.setUint32(position, value, true);
    };
    files.forEach(([name, content]) => {
      const nameBytes = encoder.encode(name);
      const data = encoder.encode(content);
      const checksum = crc32(data);
      const local = new Uint8Array(30 + nameBytes.length);
      const localView = new DataView(local.buffer);
      pushNumber(localView, 0, 0x04034b50, 4);
      pushNumber(localView, 4, 20, 2);
      pushNumber(localView, 6, 0x0800, 2);
      pushNumber(localView, 8, 0, 2);
      pushNumber(localView, 10, 0, 2);
      pushNumber(localView, 12, 0, 2);
      pushNumber(localView, 14, checksum, 4);
      pushNumber(localView, 18, data.length, 4);
      pushNumber(localView, 22, data.length, 4);
      pushNumber(localView, 26, nameBytes.length, 2);
      pushNumber(localView, 28, 0, 2);
      local.set(nameBytes, 30);
      chunks.push(local, data);

      const directory = new Uint8Array(46 + nameBytes.length);
      const directoryView = new DataView(directory.buffer);
      pushNumber(directoryView, 0, 0x02014b50, 4);
      pushNumber(directoryView, 4, 20, 2);
      pushNumber(directoryView, 6, 20, 2);
      pushNumber(directoryView, 8, 0x0800, 2);
      pushNumber(directoryView, 10, 0, 2);
      pushNumber(directoryView, 12, 0, 2);
      pushNumber(directoryView, 14, 0, 2);
      pushNumber(directoryView, 16, checksum, 4);
      pushNumber(directoryView, 20, data.length, 4);
      pushNumber(directoryView, 24, data.length, 4);
      pushNumber(directoryView, 28, nameBytes.length, 2);
      pushNumber(directoryView, 30, 0, 2);
      pushNumber(directoryView, 32, 0, 2);
      pushNumber(directoryView, 34, 0, 2);
      pushNumber(directoryView, 36, 0, 2);
      pushNumber(directoryView, 38, 0, 4);
      pushNumber(directoryView, 42, offset, 4);
      directory.set(nameBytes, 46);
      central.push(directory);
      offset += local.length + data.length;
    });
    const centralSize = central.reduce((sum, item) => sum + item.length, 0);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    pushNumber(endView, 0, 0x06054b50, 4);
    pushNumber(endView, 4, 0, 2);
    pushNumber(endView, 6, 0, 2);
    pushNumber(endView, 8, files.length, 2);
    pushNumber(endView, 10, files.length, 2);
    pushNumber(endView, 12, centralSize, 4);
    pushNumber(endView, 16, offset, 4);
    pushNumber(endView, 20, 0, 2);
    return new Blob([...chunks, ...central, end], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  function exportExcel(event) {
    if (!state.expenses.length) { event.preventDefault(); return; }
    const balances = calculateBalances(state.people, state.expenses);
    const transfers = calculateTransfers(state.people, balances);
    const expenseRows = state.expenses.slice().sort((a, b) => (a.date || "").localeCompare(b.date || "")).map((expense) => [
      { value: expense.date || "" },
      { value: expense.title },
      { value: expense.amountCents / 100, type: "number", style: "money" },
      { value: personName(expense.payerId) },
      { value: expense.participantIds.map(personName).join("、") },
      { value: expense.receipt ? "Yes" : "No" }
    ]);
    const balanceRows = state.people.map((person) => {
      const balance = balances[person.id];
      return [
        { value: person.name },
        { value: balance.paid / 100, type: "number", style: "money" },
        { value: balance.share / 100, type: "number", style: "money" },
        { value: balance.net / 100, type: "number", style: "money" },
        { value: balance.net > 0 ? "Receives" : balance.net < 0 ? "Owes" : "Settled" }
      ];
    });
    const transferRows = transfers.length ? transfers.map((transfer) => [
      { value: personName(transfer.from) },
      { value: personName(transfer.to) },
      { value: transfer.amount / 100, type: "number", style: "money" }
    ]) : [[{ value: "No transfer needed" }, { value: "" }, { value: 0, type: "number", style: "money" }]];
    const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Expense Details" sheetId="1" r:id="rId1"/><sheet name="Traveler Summary" sheetId="2" r:id="rId2"/><sheet name="Suggested Transfers" sheetId="3" r:id="rId3"/></sheets></workbook>`;
    const files = [
      ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`],
      ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
      ["xl/workbook.xml", workbookXml],
      ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
      ["xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="¥#,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF17362F"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
      ["xl/worksheets/sheet1.xml", xlsxSheet(["Date", "Description", "Amount (CNY)", "Paid By", "Shared By", "Receipt"], expenseRows, [13, 22, 15, 15, 28, 12])],
      ["xl/worksheets/sheet2.xml", xlsxSheet(["Traveler", "Paid (CNY)", "Share (CNY)", "Net (CNY)", "Status"], balanceRows, [16, 15, 15, 15, 14])],
      ["xl/worksheets/sheet3.xml", xlsxSheet(["From", "To", "Amount (CNY)"], transferRows, [16, 16, 15])]
    ];
    const blob = zipXlsx(files);
    const link = event.currentTarget;
    const previousUrl = link.dataset.objectUrl;
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    const objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl;
    link.dataset.objectUrl = objectUrl;
    link.download = `Trip_Split_${today()}.xlsx`;
  }

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value;
    return div.innerHTML;
  }

  document.querySelector("#personForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = document.querySelector("#personName");
    const name = input.value.trim();
    if (!name) return;
    if (state.people.some((person) => person.name.toLowerCase() === name.toLowerCase())) {
      input.setCustomValidity("This name has already been added.");
      input.reportValidity();
      return;
    }
    input.setCustomValidity("");
    state.people.push({ id: uid(), name });
    input.value = "";
    render();
    input.focus();
  });

  document.querySelector("#personName").addEventListener("input", (event) => event.target.setCustomValidity(""));

  document.querySelector("#expenseReceipt").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    const hint = document.querySelector("#formHint");
    if (!file) return;
    hint.textContent = "Processing image…";
    try {
      pendingReceipt = await compressImage(file);
      document.querySelector("#receiptPreviewImage").src = pendingReceipt;
      document.querySelector("#receiptPreview").hidden = false;
      document.querySelector("#uploadText").textContent = file.name;
      hint.textContent = "Image ready.";
    } catch (error) {
      pendingReceipt = "";
      event.target.value = "";
      hint.textContent = error.message;
    }
  });

  document.querySelector("#removeReceipt").addEventListener("click", () => {
    pendingReceipt = "";
    document.querySelector("#expenseReceipt").value = "";
    document.querySelector("#receiptPreview").hidden = true;
    document.querySelector("#receiptPreviewImage").removeAttribute("src");
    document.querySelector("#uploadText").textContent = "Choose a receipt or payment screenshot";
  });

  document.querySelector("#expenseForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const hint = document.querySelector("#formHint");
    const participantIds = [...document.querySelectorAll('input[name="participants"]:checked')].map((input) => input.value);
    if (!state.people.length) { hint.textContent = "Add a traveler first."; return; }
    if (!participantIds.length) { hint.textContent = "Select at least one person to share this expense."; return; }
    const amount = Number(document.querySelector("#expenseAmount").value);
    const payerId = document.querySelector("#expensePayer").value;
    if (!Number.isFinite(amount) || amount <= 0 || !payerId) return;
    state.expenses.push({
      id: uid(),
      title: document.querySelector("#expenseTitleInput").value.trim(),
      amountCents: Math.round(amount * 100),
      payerId,
      participantIds,
      date: document.querySelector("#expenseDate").value,
      receipt: pendingReceipt
    });
    resetExpenseForm();
    hint.textContent = "Expense saved. The settlement has been updated.";
    render();
  });

  document.querySelector("#selectAll").addEventListener("click", () => document.querySelectorAll('input[name="participants"]').forEach((input) => { input.checked = true; }));
  document.querySelector("#selectNone").addEventListener("click", () => document.querySelectorAll('input[name="participants"]').forEach((input) => { input.checked = false; }));
  document.querySelector("#exportButton").addEventListener("click", exportExcel);
  document.querySelector("#closeReceiptDialog").addEventListener("click", () => document.querySelector("#receiptDialog").close());
  document.querySelector("#zoomInReceipt").addEventListener("click", () => setReceiptZoom(receiptZoom + .25));
  document.querySelector("#zoomOutReceipt").addEventListener("click", () => setReceiptZoom(receiptZoom - .25));
  document.querySelector("#resetReceiptZoom").addEventListener("click", () => setReceiptZoom(1));
  document.querySelector("#receiptDialog").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) event.currentTarget.close();
  });

  document.addEventListener("click", (event) => {
    const receiptButton = event.target.closest("[data-view-receipt]");
    if (receiptButton) {
      const expense = state.expenses.find((item) => item.id === receiptButton.dataset.viewReceipt);
      if (expense?.receipt) openReceiptDialog(expense.receipt, `${expense.title} · Receipt`);
      return;
    }
    const personId = event.target.dataset.removePerson;
    if (personId) {
      if (state.expenses.some((expense) => expense.payerId === personId || expense.participantIds.includes(personId))) {
        alert("This traveler appears in an expense. Remove the related expense first.");
        return;
      }
      state.people = state.people.filter((person) => person.id !== personId);
      render();
    }
    const expenseId = event.target.dataset.removeExpense;
    if (expenseId) {
      state.expenses = state.expenses.filter((expense) => expense.id !== expenseId);
      render();
    }
  });

  document.querySelector("#resetButton").addEventListener("click", () => {
    if (!state.people.length && !state.expenses.length) return;
    if (confirm("Clear all travelers and expenses? This cannot be undone.")) {
      state = { people: [], expenses: [] };
      render();
    }
  });

  window.TripSplit = { calculateBalances, calculateTransfers };
  document.querySelector("#expenseDate").value = today();
  render();
})();
