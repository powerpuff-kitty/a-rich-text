<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue';
import { enableStandardEditing, type ARichTextElement, type ARichTextFormat, type StandardEditingController } from '@arichtext/editor';

defineOptions({ inheritAttrs: false });
const props = withDefaults(defineProps<{
  id: string;
  label: string;
  modelValue: string;
  name?: string;
  required?: boolean;
  placeholder?: string;
  format?: ARichTextFormat;
  tools?: string;
  views?: string;
  disabled?: boolean;
  readOnly?: boolean;
}>(), { format: 'html', disabled: false, readOnly: false });
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const editor = shallowRef<ARichTextElement | null>(null);
const controller = shallowRef<StandardEditingController | null>(null);
const revision = shallowRef(0);
const refresh = () => { revision.value++; };
const state = computed(() => {
  void revision.value;
  return {
    marks: editor.value?.getActiveMarks().map(mark => mark.type) ?? [],
    canUndo: editor.value?.canUndo ?? false,
    hasSelection: !!editor.value?.getSelection(),
    tools: editor.value?.tools ?? [],
    locked: props.disabled || props.readOnly || editor.value?.disabled || editor.value?.readOnly || editor.value?.view !== 'visual',
  };
});
const input = () => {
  if (editor.value) emit('update:modelValue', editor.value.value);
  refresh();
};
const syncValue = () => {
  const element = editor.value;
  // An input -> v-model echo must not reimport content and clear undo history.
  if (element && element.value !== props.modelValue) element.value = props.modelValue;
};
watch(() => [props.modelValue, props.format], syncValue, { flush: 'post' });
watch(() => [props.tools, props.views], refresh, { flush: 'post' });
onMounted(() => {
  controller.value = enableStandardEditing(editor.value!);
  syncValue();
  refresh();
});
onBeforeUnmount(() => controller.value?.destroy());
function run(command: (element: ARichTextElement, controls: StandardEditingController) => boolean): void {
  if (!editor.value || !controller.value || state.value.locked) return;
  if (command(editor.value, controller.value)) editor.value.focus({ preventScroll: true });
  refresh();
}
defineExpose({ editor, controller });
</script>

<template>
  <div class="rich-text-field">
    <label :for="id" :id="`${id}-label`" class="mb-2 block font-medium">{{ label }}</label>
    <a-rich-text-shell><slot name="toolbar" :editor="editor" :controller="controller" :state="state" :run="run">
      <a-rich-text-toolbar :for="id" />
    </slot>
    <a-rich-text
      v-bind="$attrs"
      :id="id"
      ref="editor"
      :format="format"
      :name="name"
      :required="required"
      :placeholder="placeholder"
      :tools="tools"
      :views="views"
      :disabled="disabled"
      :readonly="readOnly ? '' : undefined"
      :aria-labelledby="`${id}-label`"
      @input="input"
      @selection-change="refresh"
      @format-state-change="refresh"
      @transaction="refresh"
      @view-change="refresh"
    />
    </a-rich-text-shell>
  </div>
</template>
