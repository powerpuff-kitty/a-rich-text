import type { ARichTextFormat } from '@arichtext/editor';
import type { DefineComponent, HTMLAttributes } from 'vue';

declare module 'vue' {
  interface GlobalComponents {
    'a-rich-text': DefineComponent<HTMLAttributes & {
      format?: ARichTextFormat;
      'source-update'?: 'manual' | 'auto';
      name?: string;
      required?: boolean;
      placeholder?: string;
      tools?: string;
      views?: string;
      disabled?: boolean;
      readonly?: string;
      onInput?: () => void;
      onSelectionChange?: () => void;
      onFormatStateChange?: () => void;
      onTransaction?: () => void;
      onViewChange?: () => void;
    }>;
    'art-editor': GlobalComponents['a-rich-text'];
    'art-shell': GlobalComponents['a-rich-text-shell'];
    'art-toolbar': GlobalComponents['a-rich-text-toolbar'];
    'art-select': DefineComponent<HTMLAttributes & { value?: string; label?: string; disabled?: boolean }>;
    'a-rich-text-shell': DefineComponent<HTMLAttributes>;
    'a-rich-text-toolbar': DefineComponent<HTMLAttributes & { for?: string }>;
  }
}
