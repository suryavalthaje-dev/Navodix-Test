/* Navodix Accounts - private R2 supporting documents integration.
 * Uses the authenticated Supabase session; R2 credentials remain server-side.
 */
(function () {
  'use strict';

  const db = window.navodixSupabase;
  const ready = window.navodixAccountsAuthReady;
  const MAX_FILE_BYTES = 500 * 1024 * 1024;
  const ALLOWED_TYPES = new Set([
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv'
  ]);
  const PART_SIZE = 16 * 1024 * 1024;
  const esc = value => escapeHtml(value == null ? '' : String(value));
  const formatSize = bytes => bytes >= 1024 * 1024 ? (bytes / (1024 * 1024)).toFixed(1) + ' MB' : (bytes / 1024).toFixed(0) + ' KB';

  async function invoke(body) {
    await ready;
    const { data, error } = await db.functions.invoke('accounts-documents', { body });
    if (error) {
      let message = error.message || 'Document service request failed.';
      try {
        const context = error.context;
        if (context && typeof context.json === 'function') {
          const payload = await context.json();
          if (payload?.error) message = payload.error;
        }
      } catch (_) { /* retain the SDK error message */ }
      throw new Error(message);
    }
    if (!data?.success) throw new Error(data?.error || 'Document operation failed.');
    return data;
  }

  function validateFiles(fileList) {
    const files = [...(fileList || [])];
    for (const file of files) {
      if (!file.size || file.size > MAX_FILE_BYTES) throw new Error(`${file.name}: file must be between 1 byte and 500 MB.`);
      const type = (file.type || '').toLowerCase();
      if (!ALLOWED_TYPES.has(type)) throw new Error(`${file.name}: this file type is not supported. Use PDF, JPG, PNG, WebP, Word, Excel, CSV or TXT.`);
    }
    return files;
  }

  async function uploadOne(file, entityType, recordId, onProgress) {
    let upload;
    try {
      upload = await invoke({
        action: 'initiate', entity_type: entityType, record_id: recordId,
        file_name: file.name, content_type: file.type, file_size: file.size
      });
      const parts = Math.ceil(file.size / PART_SIZE);
      for (let partNumber = 1; partNumber <= parts; partNumber++) {
        const signed = await invoke({
          action: 'sign-part', entity_type: entityType, record_id: recordId,
          object_key: upload.object_key, upload_id: upload.upload_id, part_number: partNumber
        });
        const start = (partNumber - 1) * PART_SIZE;
        const end = Math.min(start + PART_SIZE, file.size);
        const response = await fetch(signed.url, {
          method: 'PUT',
          body: file.slice(start, end),
          headers: { 'Content-Type': 'application/octet-stream' }
        });
        if (!response.ok) throw new Error(`R2 rejected part ${partNumber} of ${file.name} (HTTP ${response.status}). Check the bucket CORS configuration.`);
        if (onProgress) onProgress(end, file.size);
      }
      const completed = await invoke({
        action: 'complete', entity_type: entityType, record_id: recordId,
        object_key: upload.object_key, upload_id: upload.upload_id,
        file_name: file.name, content_type: file.type, file_size: file.size
      });
      return completed.document;
    } catch (error) {
      if (upload?.upload_id && upload?.object_key) {
        try {
          await invoke({ action: 'abort', entity_type: entityType, record_id: recordId, object_key: upload.object_key, upload_id: upload.upload_id });
        } catch (abortError) { console.warn('Unable to abort incomplete R2 upload:', abortError); }
      }
      throw error;
    }
  }

  async function uploadSelected(inputId, entityType, recordId, statusId) {
    const input = document.getElementById(inputId);
    const files = validateFiles(input?.files);
    if (!files.length) return [];
    const status = document.getElementById(statusId);
    const uploaded = [];
    for (const file of files) {
      if (status) status.textContent = `Uploading ${file.name} (0%)…`;
      const doc = await uploadOne(file, entityType, recordId, (sent, total) => {
        if (status) status.textContent = `Uploading ${file.name} (${Math.round(sent / total * 100)}%)…`;
      });
      uploaded.push(doc);
    }
    if (status) status.textContent = `${uploaded.length} document${uploaded.length === 1 ? '' : 's'} uploaded successfully.`;
    return uploaded;
  }

  async function listDocuments(entityType, recordId) {
    const result = await invoke({ action: 'list', entity_type: entityType, record_id: recordId });
    return result.documents || [];
  }

  async function openDocument(documentId) {
    const tab = window.open('about:blank', '_blank');
    try {
      const result = await invoke({ action: 'download', document_id: documentId });
      if (tab) tab.location.href = result.url;
      else window.location.href = result.url;
    } catch (error) {
      if (tab) tab.close();
      toast('Unable to open supporting document: ' + error.message, 'error');
    }
  }

  function documentListHtml(documents, canAdd, entityType, recordId) {
    const rows = documents.length ? documents.map(doc => `<div class="document-row" style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid #edf1f4"><div style="min-width:0"><b style="display:block;overflow-wrap:anywhere">${esc(doc.file_name)}</b><small style="color:#718096">${formatSize(Number(doc.file_size_bytes))} · ${new Date(doc.uploaded_at).toLocaleString('en-IN')}</small></div><button class="btn btn-light btn-sm" onclick="window.navodixAccountsDocuments.open('${esc(doc.id)}')">View</button></div>`).join('') : '<div class="sub-text">No supporting documents attached.</div>';
    const add = canAdd ? `<div style="margin-top:12px"><label class="form-field"><span style="display:block;font-weight:600;margin-bottom:6px">Add supporting documents (maximum 500 MB each)</span><input class="form-control" type="file" id="${entityType}DocumentsInput" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt"></label><div id="${entityType}DocumentsStatus" class="sub-text" style="margin-top:6px"></div><button class="btn btn-primary btn-sm" style="margin-top:8px" onclick="window.navodixAccountsDocuments.uploadFromDetails('${entityType}','${esc(recordId)}')">Upload selected files</button></div>` : '';
    return `<section class="panel" style="margin-top:16px"><div class="panel-header"><h3>Supporting Documents</h3></div><div class="panel-body">${rows}${add}</div></section>`;
  }

  async function uploadFromDetails(entityType, recordId) {
    const inputId = entityType + 'DocumentsInput';
    const statusId = entityType + 'DocumentsStatus';
    try {
      const files = validateFiles(document.getElementById(inputId)?.files);
      if (!files.length) { toast('Select at least one document to upload.', 'error'); return; }
      await uploadSelected(inputId, entityType, recordId, statusId);
      toast('Supporting documents uploaded successfully.');
      if (entityType === 'expense') window.viewExpense?.(recordId);
      else window.viewClaim?.(recordId);
    } catch (error) {
      console.error('Supporting document upload failed:', error);
      toast('Unable to upload supporting documents: ' + error.message, 'error');
    }
  }

  window.navodixAccountsDocuments = {
    uploadSelected,
    list: listDocuments,
    open: openDocument,
    uploadFromDetails,
    validateFiles,
    formatSize
  };

  // Add the upload control to the live Add Expense form. Persistence is handled by expense-persistence.js.
  const originalOpenExpenseModal = window.openExpenseModal;
  window.openExpenseModal = function () {
    originalOpenExpenseModal?.();
    const input = document.getElementById('eFile');
    if (input) {
      input.multiple = true;
      input.accept = '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt';
      const note = input.closest('.form-field');
      if (note) {
        const old = note.querySelector('.sub-text');
        if (old) old.remove();
        const help = document.createElement('small');
        help.className = 'sub-text';
        help.textContent = 'Private storage · PDF, images, Word, Excel, CSV or TXT · maximum 500 MB per file';
        note.appendChild(help);
      }
    }
    const prototypeNote = document.querySelector('#modalBody p');
    if (prototypeNote && prototypeNote.textContent.includes('Prototype only')) prototypeNote.remove();
  };

  // Replace the expense detail view with the same persisted details plus the private document register.
  const originalViewExpense = window.viewExpense;
  window.viewExpense = async function (id) {
    const expense = expenses.find(x => x.dbId === id || x.id === id);
    if (!expense) return originalViewExpense?.(id);
    const canAdd = !!expense.isMine && ['Recorded', 'Unclaimed'].includes(expense.status);
    showModal('Expense Details', `<div class="view-grid"><div><small>Expense Number</small><b>${esc(expense.id)}</b></div><div><small>Expense Date</small><b>${esc(expense.date)}</b></div><div><small>Description</small><b>${esc(expense.description)}</b></div><div><small>Category</small><b>${esc(expense.category)}</b></div><div><small>Vendor</small><b>${esc(expense.vendor)}</b></div><div><small>Paid By</small><b>${esc(expense.paidBy)}</b></div><div><small>Invoice</small><b>${esc(expense.invoice)}</b></div><div><small>Status</small><b>${esc(expense.status)}</b></div><div><small>Taxable Amount</small><b>${money(expense.amount)}</b></div><div><small>GST</small><b>${money(expense.gst)}</b></div><div><small>Gross Total</small><b>${money(expense.amount + expense.gst)}</b></div><div><small>Supplier GSTIN</small><b>${esc(expense.gstin || '—')}</b></div><div class="full"><small>Remarks</small><b>${esc(expense.remarks || '—')}</b></div></div><div id="expenseDocumentsPanel" class="sub-text" style="margin-top:14px">Loading supporting documents…</div>`, `<button class="btn btn-light" onclick="closeModal()">Close</button>${canAdd ? `<button class="btn btn-primary" onclick="editExpense('${esc(expense.dbId)}')">Edit Expense</button>` : ''}`);
    try {
      const docs = await listDocuments('expense', expense.dbId);
      const panel = document.getElementById('expenseDocumentsPanel');
      if (panel) panel.outerHTML = documentListHtml(docs, canAdd, 'expense', expense.dbId);
    } catch (error) {
      const panel = document.getElementById('expenseDocumentsPanel');
      if (panel) panel.textContent = 'Unable to load supporting documents: ' + error.message;
    }
  };

  // Claim documents are added after the claim has been saved, from its View screen.
  const originalViewClaim = window.viewClaim;
  window.viewClaim = async function (id) {
    const claim = sheets.find(x => x.dbId === id || x.id === id);
    if (!claim) return originalViewClaim?.(id);
    const canAdd = !!claim.isMine && ['Draft', 'Approval Reversed'].includes(claim.status);
    showModal('Expense Claim – ' + esc(claim.id), `<div class="view-grid"><div><small>Submitted By</small><b>${esc(claim.director)}</b></div><div><small>Amount</small><b>${money(claim.total)}</b></div><div><small>Status</small><b>${esc(claim.status)}</b></div><div><small>Expenses</small><b>${claim.items}</b></div><div class="full"><small>Remarks</small><b>${esc(claim.remarks || '—')}</b></div></div><div id="claimDocumentsPanel" class="sub-text" style="margin-top:14px">Loading supporting documents…</div>`, `<button class="btn btn-light" onclick="closeModal()">Close</button>`);
    try {
      const docs = await listDocuments('claim', claim.dbId);
      const panel = document.getElementById('claimDocumentsPanel');
      if (panel) panel.outerHTML = documentListHtml(docs, canAdd, 'claim', claim.dbId);
    } catch (error) {
      const panel = document.getElementById('claimDocumentsPanel');
      if (panel) panel.textContent = 'Unable to load supporting documents: ' + error.message;
    }
  };

  ready.catch(error => console.error('Accounts document integration initialization failed:', error));
})();
