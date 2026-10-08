const $ = id => document.getElementById(id);
let files = [], records = [], columns = ['File name'], busy = false;
const message = (text, error = false) => { $('status').textContent = text; $('status').className = error ? 'error' : ''; };
const isAddressColumn = column => /\b(?:address(?:es)?|addr)(?:\b|(?=\d))/i.test(column);
const normalizeValue = (column, value) => isAddressColumn(column) ? String(value ?? '').replace(/\s+/g, ' ').trim() : String(value ?? '');
function queue(incoming) {
  if (busy) return;
  const next = [...files, ...incoming];
  if (next.length > 1000) {
    message('Choose at most 1,000 files per batch.', true); return;
  }
  if (next.some(file => file.size >= 50 * 1024 * 1024)) {
    message('Each file must be smaller than 50 MB.', true); return;
  }
  files = next; renderQueue();
}
function renderQueue() {
  $('queue').replaceChildren();
  files.forEach((file, i) => {
    const chip = document.createElement('span'); chip.className = 'file-chip';
    chip.append(document.createTextNode(file.name));
    const remove = document.createElement('button'); remove.textContent = '×'; remove.disabled = busy;
    remove.setAttribute('aria-label', `Remove ${file.name}`);
    remove.onclick = () => { files.splice(i, 1); renderQueue(); };
    chip.append(remove); $('queue').append(chip);
  });
  $('extract').disabled = busy || !files.length;
  $('files').disabled = busy;
  $('remove-all').disabled = busy || !files.length;
}
$('files').onchange = event => { queue(event.target.files); event.target.value = ''; };
['dragenter', 'dragover'].forEach(type => $('dropzone').addEventListener(type, event => { event.preventDefault(); $('dropzone').classList.add('drag'); }));
['dragleave', 'drop'].forEach(type => $('dropzone').addEventListener(type, event => { event.preventDefault(); $('dropzone').classList.remove('drag'); }));
$('dropzone').addEventListener('drop', event => queue(event.dataTransfer.files));
$('remove-all').onclick = () => { files = []; renderQueue(); };
$('extract').onclick = async () => {
  busy = true; renderQueue(); $('extract').textContent = 'Extracting…';
  message('Sending forms to OpenAI for extraction…');
  try {
    // One request per file keeps large batches within server/proxy timeouts.
    const data = {results: [], errors: []}, failedFiles = [];
    for (const [index, file] of files.entries()) {
      message(`Extracting ${index + 1} of ${files.length} with OpenAI: ${file.name}`);
      const body = new FormData(); body.append('files', file);
      try {
        const response = await fetch('/api/extract', { method: 'POST', body });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Extraction failed.');
        data.results.push(...result.results); data.errors.push(...result.errors);
        if (result.errors.length) failedFiles.push(file);
      } catch (error) {
        data.errors.push({filename: file.name, error: error.message}); failedFiles.push(file);
      }
    }
    data.results.forEach(record => {
      Object.keys(record.fields).forEach(column => {
        record.fields[column] = normalizeValue(column, record.fields[column]);
        const existing = columns.slice(1).find(c => c.toLowerCase() === column.toLowerCase());
        if (existing && existing !== column) { record.fields[existing] = record.fields[column]; delete record.fields[column]; }
        else if (!existing) columns.push(column);
      });
      records.push(record);
    });
    files = failedFiles; renderTable();
    message([`${data.results.length} form(s) extracted. Review the fields before exporting.`, ...data.errors.map(e => `${e.filename}: ${e.error}`)].join('\n'), !!data.errors.length);
  } catch (error) { message(error.message, true); }
  finally { busy = false; $('extract').textContent = 'Extract fields →'; renderQueue(); }
};
function renderTable() {
  const has = records.length > 0;
  $('empty').hidden = has; $('table-wrap').hidden = !has; $('review').hidden = !has;
  ['add', 'csv', 'xlsx'].forEach(id => $(id).disabled = !has);
  $('count').textContent = `${records.length} form${records.length === 1 ? '' : 's'}`;
  $('table').replaceChildren();
  const head = document.createElement('thead'), header = document.createElement('tr');
  columns.forEach(column => { const cell = document.createElement('th'); cell.scope = 'col'; cell.textContent = column; header.append(cell); });
  head.append(header); $('table').append(head);
  const body = document.createElement('tbody');
  records.forEach(record => {
    const row = document.createElement('tr');
    columns.forEach((column, i) => {
      const cell = document.createElement('td');
      if (i === 0) cell.textContent = record.filename;
      else {
        const input = document.createElement('input'); input.value = normalizeValue(column, record.fields[column]);
        if (isAddressColumn(column)) {
          cell.classList.add('address-cell');
          input.title = input.value;
          input.addEventListener('paste', event => {
            if (!event.clipboardData) return;
            event.preventDefault();
            // Text inputs otherwise remove line breaks, joining adjacent words.
            const pasted = event.clipboardData.getData('text').replace(/\s+/g, ' ');
            input.setRangeText(pasted, input.selectionStart, input.selectionEnd, 'end');
            input.dispatchEvent(new Event('input', {bubbles: true}));
          });
          input.addEventListener('change', () => {
            input.value = normalizeValue(column, input.value);
            record.fields[column] = input.value; input.title = input.value;
          });
        }
        input.setAttribute('aria-label', `${column} for ${record.filename}`);
        input.oninput = () => {
          record.fields[column] = normalizeValue(column, input.value);
          if (isAddressColumn(column)) input.title = record.fields[column];
        };
        cell.append(input);
      }
      row.append(cell);
    }); body.append(row);
  }); $('table').append(body);
  const selected = $('source').value; $('source').replaceChildren();
  records.forEach((record, i) => { const option = document.createElement('option'); option.value = i; option.textContent = record.filename; $('source').append(option); });
  if (selected && records[Number(selected)]) $('source').value = selected;
  renderSource();
}
function renderSource() {
  const record = records[Number($('source').value)];
  $('source-text').textContent = record ? `${record.method}\n${record.warning}\n\n${record.text || '(No additional notes)'}` : '';
}
$('source').onchange = renderSource;
$('add').onclick = () => { $('column-name').value = ''; $('column-error').textContent = ''; $('column-dialog').showModal(); $('column-name').focus(); };
$('save-column').onclick = event => {
  const name = $('column-name').value.trim();
  if (!name || columns.some(c => c.toLowerCase() === name.toLowerCase())) {
    event.preventDefault(); $('column-error').textContent = 'Enter a unique, non-empty field name.'; return;
  }
  columns.push(name); renderTable();
};
$('clear').onclick = () => { records = []; columns = ['File name']; renderTable(); message('Workspace cleared.'); };
async function download(kind) {
  try {
    const response = await fetch(`/api/export/${kind}`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({columns, rows: records.map(r => columns.map((c, i) => i === 0 ? r.filename : r.fields[c] || ''))})});
    if (!response.ok) { const error = await response.json(); throw new Error(error.error || 'Export failed.'); }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a'); link.href = url; link.download = `form-data.${kind}`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) { message(error.message, true); }
}
$('csv').onclick = () => download('csv'); $('xlsx').onclick = () => download('xlsx');
