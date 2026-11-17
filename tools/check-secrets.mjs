// Procura segredos acidentalmente versionados (chaves de API, tokens, senhas reais).
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const patterns = [
  [/sk-ant-[A-Za-z0-9_-]{20,}/, 'chave Anthropic'],
  [/sk-[A-Za-z0-9]{32,}/, 'chave OpenAI'],
  [/AKIA[0-9A-Z]{16}/, 'chave AWS'],
  [/ghp_[A-Za-z0-9]{36}/, 'token GitHub'],
  [/eyJhbGciOi[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, 'JWT (possível service_role key)'],
  [/-----BEGIN (RSA |EC )?PRIVATE KEY-----/, 'chave privada'],
  [/postgres(ql)?:\/\/[^:\s]+:(?!postgres@)[^@\s]{6,}@(?!localhost|127\.0\.0\.1)/, 'URL de banco com senha'],
];
const files = execSync('git ls-files --cached --others --exclude-standard', { encoding: 'utf8' })
  .split('\n')
  .filter((f) => f && !f.endsWith('pnpm-lock.yaml') && !/\.(png|jpg|svg|woff2?|ico)$/.test(f));
let found = 0;
for (const f of files) {
  let text;
  try {
    text = readFileSync(f, 'utf8');
  } catch {
    continue;
  }
  for (const [re, label] of patterns) {
    if (re.test(text)) {
      console.error(`✗ ${f}: ${label}`);
      found++;
    }
  }
}
if (found) process.exit(1);
console.log(`✓ Nenhum segredo encontrado em ${files.length} arquivos.`);
