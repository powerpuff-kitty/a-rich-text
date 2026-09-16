import type { ARichTextFormat } from '@arichtext/editor';
import type { DefineComponent, HTMLAttributes } from 'vue';

declare module 'vue' {
  interface GlobalComponents {
    'a-rich-text': DefineComponent<HTMLAttributes & {
      format?: ARichTextFormat;
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
    'a-rich-text-shell': DefineComponent<HTMLAttributes>;
    'a-rich-text-toolbar': DefineComponent<HTMLAttributes & { for?: string }>;
  }
}
