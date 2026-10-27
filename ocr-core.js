window.OCRCore=(()=>{
function describeApiError(status, json) {
  const detail = String(json?.error?.message || json?.message || json?.msg || '服务器未提供错误说明');
  const code = json?.error?.code ?? json?.code;
  const prefix = `HTTP ${status}${code != null ? ' / 错误码 ' + code : ''}：${detail}`;
  if (/欠费|余额|充值/.test(detail)) return prefix + '\n请检查智谱账户余额及该模型的可用额度。';
  if (status === 401) return prefix + '\n请检查 API Key 是否有效、是否已失效。';
  if (status === 403) return prefix + '\n请检查 API Key 所属项目是否有该模型的调用权限。';
  if (status === 429) return prefix + '\n已达到调用限制，请降低并发数并稍后重试。';
  if (status === 400 || status === 413 || status === 422) return prefix + '\n请检查图片格式及大小；可裁剪后重试。';
  if (status >= 500) return prefix + '\n智谱服务暂时异常，请稍后重试。';
  return prefix;
}

// Export values conservatively: identifiers and long numbers remain exact text.
function toCellValue(raw, convert = false) {
  const text = String(raw ?? '');
  if (!convert) return text;
  const s = text.trim();
  if (!/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(s)) return text;
  const clean = s.replace(/,/g, '');
  if (/^[+-]?0\d/.test(clean) || clean.replace(/\D/g, '').length > 15) return text;
  const value = Number(clean);
  return Number.isFinite(value) ? value : text;
}

function parseHtmlTable(element) {
  const rows = [], merges = [];
  const trs = Array.from(element.querySelectorAll('tr')).filter(tr => tr.closest('table') === element);
  trs.forEach((tr, ri) => {
    rows[ri] ||= [];
    let ci = 0;
    for (const cell of Array.from(tr.children).filter(c => /^(TD|TH)$/.test(c.tagName))) {
      while (rows[ri][ci] !== undefined) ci++;
      const rs = Math.min(Math.max(1, Number(cell.getAttribute('rowspan')) || 1), trs.length - ri);
      const cs = Math.min(Math.max(1, Number(cell.getAttribute('colspan')) || 1), 1000);
      rows[ri][ci] = cell.textContent.trim();
      for (let r = ri; r < ri + rs; r++) {
        rows[r] ||= [];
        for (let c = ci; c < ci + cs; c++) if (r !== ri || c !== ci) rows[r][c] = '';
      }
      if (rs > 1 || cs > 1) merges.push({ s: { r: ri, c: ci }, e: { r: ri + rs - 1, c: ci + cs - 1 } });
      ci += cs;
    }
  });
  const width = Math.max(0, ...rows.map(row => row.length));
  return { rows: rows.map(row => Array.from({length: width}, (_, c) => row[c] ?? '')), merges };
}

function parseLayoutResponse(resp, name) {
  const parser = new DOMParser();
  const md = String(resp.md_results || '');
  const doc = parser.parseFromString(md, 'text/html');
  const tables = [];
  const keys = new Set();
  function addTables(root, deduplicate) {
    for (const element of root.querySelectorAll('table')) {
      if (element.parentElement?.closest('table')) continue;
      const table = parseHtmlTable(element);
      const key = JSON.stringify(table.rows);
      if (table.rows.length && (!deduplicate || !keys.has(key))) { tables.push(table); keys.add(key); }
      element.remove();
    }
  }
  addTables(doc, false);
  const extraText = [];
  const details = Array.isArray(resp.layout_details) ? resp.layout_details.flat(Infinity) : [];
  for (const item of details) {
    if (!item || typeof item !== 'object' || !item.content) continue;
    const fragment = parser.parseFromString(String(item.content), 'text/html');
    if (item.label === 'table') addTables(fragment, true);
    else if (item.label === 'text') extraText.push(fragment.body.textContent.trim());
  }
  // Insert line breaks before removing tags so paragraphs remain distinguishable.
  doc.querySelectorAll('br').forEach(el => el.replaceWith('\n'));
  doc.querySelectorAll('p,div,h1,h2,h3,h4,li').forEach(el => el.append('\n'));
  doc.querySelectorAll('script,style').forEach(el => el.remove());
  const text = doc.body.textContent.replace(/!\[.*?\]\(.*?\)/g, '').trim();
  const lines = (text || extraText.join('\n')).split('\n').map(s => s.trim()).filter(Boolean);
  const base = name.replace(/\.(png|jpe?g|bmp|pdf)$/i, '');
  const results = tables.map((table, i) => ({ fileName: `${base}${tables.length > 1 ? '_表' + (i + 1) : ''}`, kind: 'table', ...table }));
  if (lines.length) results.push({ fileName: base + (tables.length ? '_说明' : '_文本'), kind: 'text', rows: [['识别文本'], ...lines.map(line => [line])], merges: [] });
  if (!results.length) throw new Error('未识别到可用表格或文本');
  return results;
}


return {describeApiError,toCellValue,parseHtmlTable,parseLayoutResponse};})();