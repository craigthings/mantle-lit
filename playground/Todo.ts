import { View, createView, property, html } from '../src';
import { ref, createRef, type Ref } from 'lit-html/directives/ref.js';
import { withWindowSize } from './withWindowSize';
import { styles } from './Todo.styles';
import './Counter';

const HRM_VERSION = 'v1';

interface TodoItem {
  id: number;
  text: string;
  done: boolean;
}

class TodoView extends View {
  static styles = styles;

  // Props
  @property() title = '';
  @property() initialTodos: TodoItem[] = [];
  @property() onCountChange?: (count: number) => void;

  // Internal state
  todos: TodoItem[] = [];
  input = '';
  inputRef: Ref<HTMLInputElement> = createRef();
  windowSize = withWindowSize(768);

  get completedCount() {
    return this.todos.filter(t => t.done).length;
  }

  onCreate() {
    this.todos = this.initialTodos ?? [];
    this.watch(
      () => this.completedCount,
      (count) => this.onCountChange?.(count)
    );
  }

  onMount() {
    this.inputRef.value?.focus();
  }

  add() {
    if (!this.input.trim()) return;
    this.todos.push({ id: Date.now(), text: this.input, done: false });
    this.input = '';
  }

  setInput(e: Event) {
    this.input = (e.target as HTMLInputElement).value;
  }

  handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.add();
    }
  }

  toggle(id: number) {
    const todo = this.todos.find(t => t.id === id);
    if (todo) todo.done = !todo.done;
  }

  render() {
    return html`
      <div class="header">
        <h2>${this.title}</h2>
        <span class="hmr-version">${HRM_VERSION}</span>
      </div>
      <form @submit=${(e: Event) => { e.preventDefault(); this.add(); }}>
        <input
          ${ref(this.inputRef)}
          .value=${this.input}
          @input=${this.setInput}
          @keydown=${this.handleKeydown}
          placeholder="Add a todo..."
        />
        <button type="submit">Add</button>
      </form>
      <ul>
        ${this.todos.map(todo => html`
          <li 
            @click=${() => this.toggle(todo.id)}
            class=${todo.done ? 'done' : ''}
          >
            <span class="checkbox">${todo.done ? '✓' : '○'}</span>
            <span class="text">${todo.text}</span>
          </li>
        `)}
      </ul>
      <p class="count">${this.completedCount} of ${this.todos.length} done</p>
      <x-counter .initialCount=${5}></x-counter>
      <p class="window-size">
        ${this.windowSize.width}×${this.windowSize.height}
        ${this.windowSize.isMobile ? ' (mobile)' : ''}
      </p>
    `;
  }
}

export const Todo = createView(TodoView, { tag: 'x-todo' });

declare global {
  interface HTMLElementTagNameMap {
    'x-todo': TodoView;
  }
}
