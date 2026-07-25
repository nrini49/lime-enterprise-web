#!/usr/bin/env node
/**
 * Build step: render data/*.json into a static index.html.
 * Data files are the single source of truth. index.html is generated output.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Abstract role symbols. Licensed iconography (Lucide, ISC) — no likenesses. */
const SYMBOL_ICONS = {
  gate: 'key-round',
  frame: 'compass',
  doorway: 'radio-tower',
  stillwater: 'waves',
  crosshair: 'crosshair',
  bridge: 'scale',
  stair: 'anchor',
  lift: 'life-buoy',
  beam: 'radar',
};

const esc = (s) =>
  String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

/** Converts *word* emphasis markers from the source records into <em>. */
const emphasise = (s) => esc(s).replace(/\*([^*]+)\*/g, '<em>$1</em>');

const externalLink = (url, label, className = '') =>
  `<a${className ? ` class="${className}"` : ''} href="${esc(
    url,
  )}" target="_blank" rel="noopener noreferrer">${label}` +
  `<span class="ext" aria-hidden="true">&#8599;</span>` +
  `<span class="sr-only"> (opens in a new tab)</span></a>`;

async function loadIcon(name) {
  const file = path.join(root, 'node_modules', 'lucide-static', 'icons', `${name}.svg`);
  const svg = await readFile(file, 'utf8');
  return svg
    .replace(/\s(width|height)="[^"]*"/g, '')
    .replace('<svg', '<svg aria-hidden="true" focusable="false"')
    .trim();
}

function renderRole(role, icon) {
  const sources = role.sources
    .map((s) => externalLink(s.url, esc(s.label)))
    .join('');
  return `
          <article class="role" id="${esc(role.id)}" data-role-id="${esc(role.id)}">
            <p class="role__index">
              <span>${esc(role.index)}</span>
              <span class="role__symbol">${icon}</span>
            </p>
            <div>
              <h3 class="role__title">${esc(role.role)}<span class="role__figure">${esc(
                role.figure,
              )}</span></h3>
              <p class="role__function">${esc(role.function)}</p>
            </div>
            <div>
              <p class="role__fit">${esc(role.fit)}</p>
              <p class="role__detail">${esc(role.detail)}</p>
              <p class="role__sources">${sources}</p>
            </div>
          </article>`;
}

function renderPrinciple(record) {
  const note = record.note
    ? `\n              <p class="principle__note">${esc(record.note)}</p>`
    : '';
  return `
            <figure
              class="principle"
              id="principle-${esc(record.id)}"
              data-quote-id="${esc(record.id)}"
              data-theme-id="${esc(record.theme)}"
              data-search="${esc(
                `${record.quote} ${record.speaker} ${record.source} ${record.year}`.toLowerCase(),
              )}"
            >
              <p class="principle__id">${esc(record.id)}</p>
              <blockquote cite="${esc(record.url)}">${esc(record.quote)}</blockquote>
              <figcaption>
                <cite>${emphasise(record.attribution)}</cite>
              </figcaption>${note}
              ${externalLink(record.url, 'View source', 'principle__source')}
            </figure>`;
}

function renderThemeGroup(theme, records) {
  return `
          <section class="theme-group" data-theme-group="${esc(theme.id)}" aria-labelledby="theme-${esc(
            theme.id,
          )}">
            <div class="theme-group__head">
              <h3 id="theme-${esc(theme.id)}">${esc(theme.name)}</h3>
              <p class="label" data-theme-count>${records.length} records</p>
            </div>
            <div class="principles">${records.map(renderPrinciple).join('')}
            </div>
          </section>`;
}

function renderChips(themes, total) {
  const all = `<button class="chip" type="button" data-theme-chip="all" aria-pressed="true">All themes <span aria-hidden="true">·</span> ${total}</button>`;
  return [all]
    .concat(
      themes.map(
        (t) =>
          `<button class="chip" type="button" data-theme-chip="${esc(
            t.id,
          )}" aria-pressed="false">${esc(t.name)}</button>`,
      ),
    )
    .join('\n              ');
}

async function main() {
  const [rolesRaw, principlesRaw, template] = await Promise.all([
    readFile(path.join(root, 'data', 'operating-roles.json'), 'utf8'),
    readFile(path.join(root, 'data', 'principles.json'), 'utf8'),
    readFile(path.join(root, 'src', 'template.html'), 'utf8'),
  ]);

  const rolesData = JSON.parse(rolesRaw);
  const lib = JSON.parse(principlesRaw);

  const icons = {};
  for (const key of new Set(rolesData.roles.map((r) => r.symbol))) {
    const name = SYMBOL_ICONS[key];
    if (!name) throw new Error(`No licensed icon mapped for symbol "${key}"`);
    icons[key] = await loadIcon(name);
  }

  const rolesHtml = rolesData.roles.map((r) => renderRole(r, icons[r.symbol])).join('');

  const groupsHtml = lib.themes
    .map((theme) => {
      const records = lib.records.filter((r) => r.theme === theme.id);
      if (records.length === 0) throw new Error(`Theme "${theme.id}" has no records`);
      return renderThemeGroup(theme, records);
    })
    .join('');

  const unknown = lib.records.filter((r) => !lib.themes.some((t) => t.id === r.theme));
  if (unknown.length) throw new Error(`Records with unknown theme: ${unknown.map((r) => r.id)}`);

  const html = template
    .replaceAll('{{ROLES_TITLE}}', esc(rolesData.sectionTitle))
    .replaceAll('{{ROLES_STANDING}}', esc(rolesData.sectionStanding))
    .replaceAll('{{ROLES}}', rolesHtml)
    .replaceAll('{{PRINCIPLES}}', groupsHtml)
    .replaceAll('{{THEME_CHIPS}}', renderChips(lib.themes, lib.records.length))
    .replaceAll('{{STANDING_DISCLAIMER}}', esc(lib.standingDisclaimer))
    .replaceAll('{{LIBRARY_REVISION}}', esc(lib.libraryRevision))
    .replaceAll('{{QUOTE_COUNT}}', String(lib.records.length))
    .replaceAll('{{ROLE_COUNT}}', String(rolesData.roles.length));

  const leftover = html.match(/\{\{[A-Z_]+\}\}/g);
  if (leftover) throw new Error(`Unreplaced template tokens: ${leftover.join(', ')}`);

  await writeFile(path.join(root, 'index.html'), html, 'utf8');
  console.log(
    `built index.html — ${rolesData.roles.length} operating roles, ${lib.records.length} principle records, ${lib.themes.length} themes`,
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
