// 检查 Codex 插件包：市场条目、清单、MCP 配置、技能、图标和构建产物。用法：node scripts/check-plugin.mjs
import { accessSync, constants, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const fail = (msg) => errors.push(msg);
const json = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    fail(`${relative(repo, file)}: ${e.message}`);
    return null;
  }
};

const CATEGORIES = ['Productivity', 'Creativity', 'Developer Tools', 'Business & Operations', 'Data & Analytics', 'Communication', 'Education & Research', 'Security', 'Finance', 'Healthcare', 'Travel', 'Entertainment', 'Other'];
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** 插件里的相对路径：要以 ./ 开头、不能跑出插件目录 */
function inside(root, p, what) {
  if (typeof p !== 'string' || !p.startsWith('./')) {
    fail(`${what}: path must start with ./ (got ${JSON.stringify(p)})`);
    return null;
  }
  const abs = resolve(root, p);
  if (relative(root, abs).startsWith('..')) {
    fail(`${what}: ${p} is outside the plugin`);
    return null;
  }
  if (!existsSync(abs)) {
    fail(`${what}: ${p} does not exist`);
    return null;
  }
  return abs;
}

/** PNG 的宽高在 IHDR 里；SVG 看 width/height 或 viewBox */
function imageSize(file) {
  const buf = readFileSync(file);
  if (extname(file).toLowerCase() === '.png') {
    if (buf.toString('ascii', 1, 4) !== 'PNG') return null;
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  if (extname(file).toLowerCase() === '.svg') {
    const s = buf.toString('utf8');
    const box = /viewBox="\s*[\d.-]+[\s,]+[\d.-]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/.exec(s);
    if (box) return { w: Number(box[1]), h: Number(box[2]) };
    const w = /\swidth="([\d.]+)"/.exec(s);
    const h = /\sheight="([\d.]+)"/.exec(s);
    return w && h ? { w: Number(w[1]), h: Number(h[1]) } : null;
  }
  return null;
}

function checkIcon(root, p, what) {
  const abs = inside(root, p, what);
  if (!abs) return;
  if (!['.png', '.svg', '.jpg', '.jpeg', '.webp'].includes(extname(abs).toLowerCase())) fail(`${what}: unsupported image type ${p}`);
  if (statSync(abs).size > 5 * 1024 * 1024) fail(`${what}: ${p} is larger than 5 MiB`);
  const size = imageSize(abs);
  if (!size) return;
  if (size.w !== size.h) fail(`${what}: ${p} must be square (${size.w}×${size.h})`);
  if (size.w < 48) fail(`${what}: ${p} must be at least 48×48 (${size.w}×${size.h})`);
}

function checkSkills(root, p) {
  const dir = inside(root, p, 'skills');
  if (!dir) return 0;
  let n = 0;
  for (const name of readdirSync(dir)) {
    const file = join(dir, name, 'SKILL.md');
    if (!existsSync(file)) continue;
    n++;
    const text = readFileSync(file, 'utf8');
    const front = /^---\n([\s\S]*?)\n---\n/.exec(text);
    if (!front) {
      fail(`skills/${name}/SKILL.md: missing frontmatter`);
      continue;
    }
    const field = (k) => new RegExp(`^${k}:\\s*(.+)$`, 'm').exec(front[1])?.[1].trim();
    if (field('name') !== name) fail(`skills/${name}/SKILL.md: name must be "${name}" (got ${JSON.stringify(field('name'))})`);
    const desc = field('description');
    if (!desc) fail(`skills/${name}/SKILL.md: missing description`);
    else if (desc.length > 1024) fail(`skills/${name}/SKILL.md: description is longer than 1024 characters`);
  }
  if (!n) fail(`skills: no SKILL.md under ${p}`);
  return n;
}

function checkMcp(root, p) {
  const file = inside(root, p, 'mcpServers');
  if (!file) return [];
  const cfg = json(file);
  const servers = cfg?.mcpServers;
  if (!servers || typeof servers !== 'object' || !Object.keys(servers).length) {
    fail(`${p}: no mcpServers`);
    return [];
  }
  for (const [name, s] of Object.entries(servers)) {
    const what = `${p} ${name}`;
    if (!KEBAB.test(name)) fail(`${what}: server name should be kebab-case`);
    if (typeof s.command !== 'string') {
      fail(`${what}: missing command`);
      continue;
    }
    const cwd = s.cwd ? inside(root, s.cwd === '.' ? './' : s.cwd, `${what} cwd`) : root;
    if (!cwd) continue;
    if (s.command.startsWith('./')) {
      const cmd = inside(cwd, s.command, `${what} command`);
      if (cmd) {
        try {
          accessSync(cmd, constants.X_OK);
        } catch {
          fail(`${what}: ${s.command} is not executable (chmod +x)`);
        }
        if (!existsSync(`${cmd}.cmd`)) fail(`${what}: ${s.command}.cmd is missing (Windows)`);
      }
    }
    for (const a of s.args ?? []) if (typeof a === 'string' && a.startsWith('./')) inside(cwd, a, `${what} args`);
    if (s.env_vars && !Array.isArray(s.env_vars)) fail(`${what}: env_vars must be an array`);
    for (const v of s.env_vars ?? []) if (typeof v !== 'string' && typeof v?.name !== 'string') fail(`${what}: bad env_vars entry ${JSON.stringify(v)}`);
  }
  return Object.keys(servers);
}

function checkUrl(u, what) {
  if (typeof u !== 'string' || !/^https:\/\/[^\s@]+$/.test(u) || u.length > 1024) fail(`plugin.json: ${what} must be an HTTPS URL of at most 1024 characters (got ${JSON.stringify(u)})`);
}

/** 插件目录提交门户的导入规则：审核用例、发布说明和翻译 */
function checkOpenAI(ext) {
  if (ext === undefined) return;
  const review = ext.review ?? {};
  for (const k of ['test_credentials', 'reviewer_instructions']) if (k in review) fail(`plugin.json: review.${k} is rejected by the submission portal; enter it in the dashboard`);
  const tools = new Set([...readFileSync(join(repo, 'packages/server/src/tools.ts'), 'utf8').matchAll(/^\s+name: '([a-z_]+)'/gm)].map((x) => x[1]));
  const cases = review.test_cases;
  if (cases) {
    const { positive = [], negative = [] } = cases;
    if (positive.length !== 5) fail(`plugin.json: review needs exactly 5 positive test cases (got ${positive.length})`);
    if (negative.length !== 3) fail(`plugin.json: review needs exactly 3 negative test cases (got ${negative.length})`);
    for (const [n, c] of [...positive.map((c) => ['positive', c]), ...negative.map((c) => ['negative', c])]) {
      const required = n === 'positive' ? ['description', 'prompt', 'tools_triggered', 'expected_behavior'] : ['description', 'prompt'];
      for (const k of required) if (typeof c[k] !== 'string' || !c[k].trim()) fail(`plugin.json: ${n} test case is missing ${k}: ${JSON.stringify(c.description ?? c)}`);
      if (typeof c.description === 'string' && c.description.length > 4000) fail(`plugin.json: ${n} test case description is longer than 4000 characters`);
      for (const t of (c.tools_triggered ?? '').split(',').map((s) => s.trim()).filter(Boolean)) if (!tools.has(t)) fail(`plugin.json: ${n} test case names unknown tool ${t}`);
      for (const u of c.file_attachment_urls ?? []) checkUrl(u, `${n} test case file_attachment_urls`);
    }
  }
  if (review.demo_recording_url !== undefined) checkUrl(review.demo_recording_url, 'review.demo_recording_url');
  const pub = ext.publication ?? {};
  for (const c of pub.countries ?? []) if (!/^[A-Z]{2}$/.test(c)) fail(`plugin.json: publication.countries has a bad country code ${JSON.stringify(c)}`);
  for (const [locale, tr] of Object.entries(pub.translations ?? {})) {
    if (!tr) continue;
    if (tr.subtitle && tr.subtitle.length > 30) fail(`plugin.json: ${locale} subtitle is longer than 30 characters`);
    if (tr.subtitle && /\n/.test(tr.subtitle)) fail(`plugin.json: ${locale} subtitle must be one line`);
    if (tr.description && tr.description.length > 4000) fail(`plugin.json: ${locale} description is longer than 4000 characters`);
    for (const s of [tr.subtitle, tr.description]) if (s && /[\u0000-\u0009\u000b-\u001f]/.test(s)) fail(`plugin.json: ${locale} translation has tabs or control characters`);
  }
}

function checkPlugin(root, expectName) {
  const file = join(root, '.codex-plugin', 'plugin.json');
  if (!existsSync(file)) {
    fail(`${relative(repo, root)}: missing .codex-plugin/plugin.json`);
    return;
  }
  const m = json(file);
  if (!m) return;
  if (m.name !== expectName) fail(`plugin.json: name ${JSON.stringify(m.name)} must match the marketplace entry and folder (${expectName})`);
  if (!KEBAB.test(m.name ?? '')) fail('plugin.json: name must be kebab-case');
  if (!/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(m.version ?? '')) fail(`plugin.json: version ${JSON.stringify(m.version)} is not semver`);
  if (!m.description) fail('plugin.json: missing description');
  const i = m.interface ?? {};
  for (const k of ['displayName', 'shortDescription', 'longDescription', 'developerName', 'category', 'composerIcon', 'logo']) if (!i[k]) fail(`plugin.json: interface.${k} is required`);
  if (i.category && !CATEGORIES.includes(i.category)) fail(`plugin.json: interface.category must be one of ${CATEGORIES.join(', ')}`);
  if (i.capabilities !== undefined) {
    if (!Array.isArray(i.capabilities) || i.capabilities.length > 20) fail('plugin.json: interface.capabilities must be a list of at most 20 strings');
    for (const c of i.capabilities ?? []) if (typeof c !== 'string' || !c.trim() || c.length > 120 || /\n/.test(c)) fail(`plugin.json: bad capability ${JSON.stringify(c)}`);
  }
  if (i.defaultPrompt !== undefined) {
    if (!Array.isArray(i.defaultPrompt) || i.defaultPrompt.length > 3) fail('plugin.json: interface.defaultPrompt must have at most 3 entries');
    for (const s of i.defaultPrompt ?? []) if (typeof s !== 'string' || s.length > 128) fail(`plugin.json: defaultPrompt entry longer than 128 characters: ${JSON.stringify(s)}`);
  }
  if (i.brandColor && !/^#[0-9a-fA-F]{6}$/.test(i.brandColor)) fail('plugin.json: interface.brandColor must be #RRGGBB');
  if ((m.description ?? '').length > 1024) fail('plugin.json: description is longer than 1024 characters');
  if (!m.author?.name) fail('plugin.json: author.name is required');
  if ((i.developerName ?? '').length > 80) fail('plugin.json: interface.developerName is longer than 80 characters');
  for (const k of ['websiteURL', 'supportURL', 'privacyPolicyURL', 'termsOfServiceURL']) if (i[k] !== undefined) checkUrl(i[k], `interface.${k}`);
  checkOpenAI(m.extensions?.['com.openai']);
  if (i.composerIcon) checkIcon(root, i.composerIcon, 'interface.composerIcon');
  if (i.logo) checkIcon(root, i.logo, 'interface.logo');
  for (const s of i.screenshots ?? []) inside(root, s, 'interface.screenshots');
  const skills = checkSkills(root, m.skills ?? './skills/');
  const servers = m.mcpServers ? checkMcp(root, m.mcpServers) : [];
  if (m.hooks) fail('plugin.json: hooks make the plugin ineligible for the plugin directory');

  // 构建产物（插件按目录原样复制安装，所以要提交进仓库）
  for (const f of ['server/mcp.mjs', 'server/daemon.mjs', 'server/cli.mjs', 'server/ts-worker.mjs', 'server/public/bridge.js', 'server/public/panel/index.js', 'server/public/panel/index.css'])
    if (!existsSync(join(root, f))) fail(`${f} is missing; run pnpm build`);
  const server = json(join(repo, 'packages/server/package.json'));
  if (server && server.version !== m.version) fail(`plugin.json version ${m.version} differs from packages/server/package.json ${server.version}`);
  console.log(`✓ ${m.name} ${m.version}: ${skills} skill(s), MCP server(s): ${servers.join(', ') || 'none'}`);
}

const marketFile = join(repo, '.agents/plugins/marketplace.json');
const market = existsSync(marketFile) ? json(marketFile) : (fail('missing .agents/plugins/marketplace.json'), null);
if (market) {
  if (!market.name) fail('marketplace.json: missing name');
  if (!market.interface?.displayName) fail('marketplace.json: missing interface.displayName');
  for (const e of market.plugins ?? []) {
    const what = `marketplace.json ${e.name}`;
    if (e.source?.source !== 'local') fail(`${what}: source.source must be "local"`);
    if (!['NOT_AVAILABLE', 'AVAILABLE', 'INSTALLED_BY_DEFAULT'].includes(e.policy?.installation)) fail(`${what}: bad policy.installation`);
    if (!['ON_INSTALL', 'ON_USE'].includes(e.policy?.authentication)) fail(`${what}: bad policy.authentication`);
    if (!CATEGORIES.includes(e.category)) fail(`${what}: category must be one of ${CATEGORIES.join(', ')}`);
    const root = inside(repo, e.source?.path, `${what} source.path`);
    if (root) checkPlugin(root, e.name);
  }
  if (!market.plugins?.length) fail('marketplace.json: no plugins');
}

if (errors.length) {
  for (const e of errors) console.error(`✗ ${e}`);
  process.exit(1);
}
