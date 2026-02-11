import { View, createView, property } from '../src';
import { html } from 'lit';
import { withWindowSize } from './withWindowSize';
import { styles } from './Todo.styles';
import './Counter';

// ─── HMR Test ───
// To test child edit doesn't affect parent:
// 1. Add a todo here, click the counter below a few times
// 2. Edit Counter.ts (change its HRM_VERSION) and save
// 3. Verify: Counter resets, but todos SURVIVE (parent unaffected) ✓
const HRM_VERSION = 'v1';

interface TodoItem {
  id: number;
  text: string;
  done: boolean;
}

class TodoView extends View {
  static styles = styles;

  // Props - use @property for IDE autocomplete
  // attribute: false prevents reflection to HTML attributes
  @property({ type: String, attribute: false })
  title = '';

  @property({ type: Array, attribute: false })
  initialTodos: TodoItem[] = [];

  @property({ attribute: false })
  onCountChange: ((count: number) => void) | undefined = undefined;

  // Internal state (auto-observable)
  todos: TodoItem[] = [];
  input = '';
  inputEl: HTMLInputElement | null = null;
  
  // Factory function (no `new`) — View auto-detects behaviors
  windowSize = withWindowSize(768);

  get completedCount() {
    return this.todos.filter(t => t.done).length;
  }

  onCreate() {
    this.todos = this.initialTodos ?? [];

    // Watch completedCount and notify parent — auto-disposed on unmount
    this.watch(
      () => this.completedCount,
      (count) => this.onCountChange?.(count)
    );
  }

  onMount() {
    this.inputEl?.focus();
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

  captureInput(el: Element | undefined) {
    this.inputEl = el as HTMLInputElement | null;
  }

  render() {
    return html`
      <div class="header">
        <h2>${this.title}</h2>
        <span class="hmr-version">${HRM_VERSION}</span>
      </div>
      <form @submit=${(e: Event) => { e.preventDefault(); this.add(); }}>
        <input
          ${this.captureInput}
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
      <x-counter></x-counter>
      <p class="window-size">
        ${this.windowSize.width}×${this.windowSize.height}
        ${this.windowSize.isMobile ? ' (mobile)' : ''}
      </p>
    `;
  }
}

export const Todo = createView(TodoView, { tag: 'x-todo' });

// Declare on HTMLElementTagNameMap for lit-plugin type checking
declare global {
  interface HTMLElementTagNameMap {
    'x-todo': TodoView;
  }
}
