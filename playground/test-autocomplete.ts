// Test file - delete after verifying autocomplete works
import { html } from 'lit';
import './Todo';
import './Counter';

// Try typing inside the html template:
// - Type <x-todo and see if it autocompletes the tag
// - Type .title or .initialTodos and see if properties autocomplete

const test = html`
  <x-todo 
    .title=${'Test'}
    .initialTodos=${[{ id: 1, text: 'Test', done: false }]}
    .onCountChangse=${(count: number) => console.log(count)}
  ></x-todo>
  
  <x-counter></x-counter>
`;
