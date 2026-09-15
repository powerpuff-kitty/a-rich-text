import '@arichtext/web-component';
import '@arichtext/ui';
import { enableListEditing } from '@arichtext/lists-editor';
import type { ARichTextElement } from '@arichtext/web-component';

enableListEditing(document.querySelector<ARichTextElement>('#editor')!);

const form = document.querySelector<HTMLFormElement>('#fixture-form')!;
const output = document.querySelector<HTMLOutputElement>('#submitted')!;

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(form);
  output.value = String(data.get('body') ?? '');
});
