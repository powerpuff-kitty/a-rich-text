import '@arichtext/web-component';
import '@arichtext/ui';

const form = document.querySelector<HTMLFormElement>('#fixture-form')!;
const output = document.querySelector<HTMLOutputElement>('#submitted')!;

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(form);
  output.value = String(data.get('body') ?? '');
});
