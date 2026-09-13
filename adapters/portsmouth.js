import pdf from 'pdf-parse/lib/pdf-parse.js';

export const PORTSMOUTH_CRIME_URL = 'https://www.portsmouthva.gov/crime';
const ALLOWED_PDF_HOST = 'content.civicplus.com';

export function resolveWarrantPdfUrl(html, baseUrl = PORTSMOUTH_CRIME_URL) {
  const anchor = /<a\b[^>]*href=["']([^"']+)["'][^>]*>\s*Probation\s*(?:&amp;|&)\s*Parole\s*Warranted\s*Offenders(?:\s*\(PDF\))?\s*<\/a>/i.exec(html);
  if (!anchor) throw new Error('Official Portsmouth warranted-offenders PDF link was not found.');
  const url = new URL(anchor[1], baseUrl);
  if (url.protocol !== 'https:' || url.hostname !== ALLOWED_PDF_HOST) {
    throw new Error('Official Portsmouth PDF resolved to an unapproved host.');
  }
  return url.toString();
}

export function parseWarrantedOffenderNames(text) {
  const clean = String(text || '').replace(/\r/g, '\n').replace(/\u00a0/g, ' ');
  const marker = /Portsmouth\s+Probation\s+(?:and\s+)?Parole\s+Warranted\s+Offender/gi;
  const matches = [...clean.matchAll(marker)];
  if (!matches.length) throw new Error('The official PDF did not contain the expected Portsmouth warrant heading.');

  const names = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : clean.length;
    const candidate = clean.slice(start, end).replace(/\s+/g, ' ').trim();
    if (/^[A-Za-z][A-Za-z .,'’-]{1,98}$/.test(candidate)) names.push(candidate);
  }
  const unique = [...new Set(names)];
  if (!unique.length) throw new Error('No offender names could be safely parsed from the official PDF.');
  return unique;
}

export async function fetchPortsmouthWarrants(fetchImpl = fetch) {
  const retrievedAt = new Date().toISOString();
  const pageResponse = await fetchImpl(PORTSMOUTH_CRIME_URL, { headers: { 'user-agent': 'VA-Warrant-Watch/1.0' } });
  if (!pageResponse.ok) throw new Error(`Portsmouth source page returned HTTP ${pageResponse.status}.`);
  const html = await pageResponse.text();
  const pdfUrl = resolveWarrantPdfUrl(html);

  const pdfResponse = await fetchImpl(pdfUrl, { headers: { 'user-agent': 'VA-Warrant-Watch/1.0' } });
  if (!pdfResponse.ok) throw new Error(`Portsmouth warranted-offenders PDF returned HTTP ${pdfResponse.status}.`);
  const contentType = pdfResponse.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('pdf')) throw new Error('Portsmouth warranted-offenders source did not return a PDF.');

  const buffer = Buffer.from(await pdfResponse.arrayBuffer());
  const parsed = await pdf(buffer);
  const names = parseWarrantedOffenderNames(parsed.text);
  return {
    jurisdiction: 'Portsmouth, VA',
    agency: 'Portsmouth Police Department / Probation and Parole',
    source_url: pdfUrl,
    source_page_url: PORTSMOUTH_CRIME_URL,
    retrieved_at: retrievedAt,
    records: names.map((full_name, index) => ({
      id: `portsmouth-${index + 1}-${full_name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      full_name,
      jurisdiction: 'Portsmouth, VA',
      issuing_agency: 'Portsmouth Police Department / Probation and Parole',
      warrant_description: 'Probation and Parole Warranted Offender',
      status: 'ACTIVE_VERIFIED',
      source_url: pdfUrl,
      source_page_url: PORTSMOUTH_CRIME_URL,
      last_verified_at: retrievedAt
    }))
  };
}
