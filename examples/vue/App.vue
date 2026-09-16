<script setup lang="ts">
import { ref } from 'vue';
import RichText from './RichText.vue';
const body = ref('<p>Hello from Vue</p>');
const locked = ref(false);
const mounted = ref(true);
</script>

<template>
  <main class="mx-auto max-w-3xl p-6 text-slate-900">
    <h1 class="mb-2 text-2xl font-semibold">Vue + Tailwind + A Rich Text</h1>
    <p class="mb-6">A custom toolbar slot, two-way value binding and styles applied through CSS parts.</p>
    <div class="mb-4 flex flex-wrap gap-2">
      <button class="demo-button" @click="body = '<p>Loaded externally</p>'">Load document</button>
      <button class="demo-button" @click="locked = !locked">{{ locked ? 'Unlock' : 'Lock' }}</button>
      <button class="demo-button" @click="mounted = !mounted">{{ mounted ? 'Unmount' : 'Mount' }}</button>
    </div>
    <RichText v-if="mounted" id="vue-editor" v-model="body" label="Article" name="article"
      :read-only="locked" tools="bold italic undo" views="visual html markdown json"
      class="w-full">
      <template #toolbar="{ state, run }">
        <div class="mb-2 flex gap-2" role="group" aria-label="Custom formatting">
          <button v-if="state.hasSelection && !state.locked && state.tools.includes('bold')" class="demo-button"
            :aria-pressed="state.marks.includes('bold')" @pointerdown.prevent
            @click="run(editor => editor.toggleMark('bold'))">Custom bold</button>
          <button v-if="state.hasSelection && !state.locked && state.tools.includes('italic')" class="demo-button"
            :aria-pressed="state.marks.includes('italic')" @pointerdown.prevent
            @click="run(editor => editor.toggleMark('italic'))">Custom italic</button>
          <button v-if="state.canUndo && !state.locked && state.tools.includes('undo')" class="demo-button" @pointerdown.prevent
            @click="run(editor => editor.undo())">Custom undo</button>
        </div>
      </template>
    </RichText>
    <h2 class="mt-6 font-semibold">Bound HTML</h2>
    <output id="bound-value" class="mt-2 block whitespace-pre-wrap break-all rounded-lg bg-slate-100 p-3 font-mono text-sm">{{ body }}</output>
  </main>
</template>
