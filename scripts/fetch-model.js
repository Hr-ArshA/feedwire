import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = process.env.MODEL_REPO ?? 'Xenova/bge-m3';
const FILES = [
  'config.json',
  'quant_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'special_tokens_map.json',
  'sentencepiece.bpe.model',
  'onnx/model_quantized.onnx',
];

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const targetDir = join(root, 'models', ...REPO.split('/'));

async function readToken() {
  if (process.env.HF_TOKEN) return process.env.HF_TOKEN.trim();
  try {
    return (await readFile(join(root, '.hf-token'), 'utf8')).trim();
  } catch {
    return '';
  }
}

async function existingSize(path) {
  try {
    return (await stat(path)).size;
  } catch {
    return -1;
  }
}

const token = await readToken();
const headers = token ? { authorization: `Bearer ${token}` } : {};

if (token) {
  try {
    const who = await fetch('https://huggingface.co/api/whoami-v2', { headers });
    const body = await who.json();
    console.log(
      who.ok ? `Hugging Face user: ${body.name}` : `Token rejected (${who.status}), continuing anonymously`
    );
  } catch (error) {
    console.warn(`Could not verify token: ${error.message}`);
  }
} else {
  console.log('No HF token found, downloading anonymously');
}

let total = 0;
for (const file of FILES) {
  const destination = join(targetDir, file);
  const url = `https://huggingface.co/${REPO}/resolve/main/${file}`;
  const response = await fetch(url, { headers, redirect: 'follow' });
  if (!response.ok) {
    if (response.status === 404) {
      console.log(`- ${file} (not published, skipped)`);
      continue;
    }
    throw new Error(`${file}: HTTP ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const previous = await existingSize(destination);
  if (previous === buffer.length) {
    console.log(`= ${file} (${(buffer.length / 1e6).toFixed(1)} MB, unchanged)`);
    total += buffer.length;
    continue;
  }
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, buffer);
  total += buffer.length;
  console.log(`+ ${file} (${(buffer.length / 1e6).toFixed(1)} MB)`);
}

console.log(`\nModel ready in ${targetDir} (${(total / 1e6).toFixed(1)} MB)`);
