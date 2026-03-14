<template>
  <div class="font-mono text-xs border-t border-gray-300 overflow-x-auto">
    <div
      v-for="(line, i) in diffLines"
      :key="i"
      :class="[
        'px-3 leading-5 whitespace-pre',
        line.type === 'remove' ? 'bg-red-50 text-red-900' : '',
        line.type === 'add' ? 'bg-green-50 text-green-900' : '',
        line.type === 'context' ? 'bg-gray-50 text-gray-600' : '',
      ]"
    >
      <span class="inline-block w-4 shrink-0 select-none" :class="{
        'text-red-400': line.type === 'remove',
        'text-green-500': line.type === 'add',
        'text-gray-400': line.type === 'context',
      }">{{ line.type === 'remove' ? '-' : line.type === 'add' ? '+' : ' ' }}</span>
      <span v-html="line.html"></span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import hljs from 'highlight.js/lib/core'

// Register common languages
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import python from 'highlight.js/lib/languages/python'
import json from 'highlight.js/lib/languages/json'
import css from 'highlight.js/lib/languages/css'
import xml from 'highlight.js/lib/languages/xml'
import bash from 'highlight.js/lib/languages/bash'
import yaml from 'highlight.js/lib/languages/yaml'
import sql from 'highlight.js/lib/languages/sql'
import markdown from 'highlight.js/lib/languages/markdown'
import go from 'highlight.js/lib/languages/go'
import rust from 'highlight.js/lib/languages/rust'
import java from 'highlight.js/lib/languages/java'
import ruby from 'highlight.js/lib/languages/ruby'
import dockerfile from 'highlight.js/lib/languages/dockerfile'

hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('python', python)
hljs.registerLanguage('json', json)
hljs.registerLanguage('css', css)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('vue', xml)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('shell', bash)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('yml', yaml)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('go', go)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('java', java)
hljs.registerLanguage('ruby', ruby)
hljs.registerLanguage('dockerfile', dockerfile)

const extToLang: Record<string, string> = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  py: 'python', json: 'json', css: 'css', html: 'html', htm: 'html',
  vue: 'vue', svelte: 'html', xml: 'xml', svg: 'xml',
  sh: 'bash', bash: 'bash', zsh: 'bash',
  yml: 'yaml', yaml: 'yaml', sql: 'sql', md: 'markdown',
  go: 'go', rs: 'rust', java: 'java', rb: 'ruby',
  Dockerfile: 'dockerfile',
}

const props = defineProps<{
  oldString: string
  newString: string
  filePath: string
}>()

interface DiffLine {
  type: 'remove' | 'add' | 'context'
  html: string
}

function getLang(path: string): string | undefined {
  const basename = path.split('/').pop() ?? ''
  if (basename === 'Dockerfile') return 'dockerfile'
  const ext = basename.split('.').pop() ?? ''
  return extToLang[ext]
}

function highlightLine(text: string, lang: string | undefined): string {
  if (!lang) return escapeHtml(text)
  try {
    return hljs.highlight(text, { language: lang, ignoreIllegals: true }).value
  } catch {
    return escapeHtml(text)
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const diffLines = computed<DiffLine[]>(() => {
  const lang = getLang(props.filePath)
  const oldLines = props.oldString.split('\n')
  const newLines = props.newString.split('\n')
  const lines: DiffLine[] = []

  for (const l of oldLines) {
    lines.push({ type: 'remove', html: highlightLine(l, lang) })
  }
  for (const l of newLines) {
    lines.push({ type: 'add', html: highlightLine(l, lang) })
  }

  return lines
})
</script>
