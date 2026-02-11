import { View, createView } from '../src';
import { html } from 'lit';

// Simple Counter example
class CounterView extends View<{ initial: number }> {
  count = 0;

  onCreate() {
    this.count = this.props.initial ?? 0;
  }

  increment() {
    this.count++;
  }

  decrement() {
    this.count--;
  }

  render() {
    return html`
      <div style="font-family: system-ui; padding: 20px;">
        <h2>Counter: ${this.count}</h2>
        <button @click=${this.decrement}>-</button>
        <button @click=${this.increment}>+</button>
      </div>
    `;
  }
}

export const Counter = createView(CounterView, { tag: 'x-counter' });

// Todo example
interface TodoItem {
  id: number;
  text: string;
  done: boolean;
}

class TodoView extends View {
  todos: TodoItem[] = [];
  input = '';

  add() {
    if (!this.input.trim()) return;
    this.todos.push({ id: Date.now(), text: this.input, done: false });
    this.input = '';
  }

  toggle(id: number) {
    const item = this.todos.find(t => t.id === id);
    if (item) item.done = !item.done;
  }

  remove(id: number) {
    const idx = this.todos.findIndex(t => t.id === id);
    if (idx !== -1) this.todos.splice(idx, 1);
  }

  setInput(e: Event) {
    this.input = (e.target as HTMLInputElement).value;
  }

  handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') this.add();
  }

  get remaining() {
    return this.todos.filter(t => !t.done).length;
  }

  render() {
    return html`
      <div style="font-family: system-ui; padding: 20px; max-width: 400px;">
        <h2>Todo List</h2>
        <div style="display: flex; gap: 8px; margin-bottom: 16px;">
          <input 
            .value=${this.input} 
            @input=${this.setInput}
            @keydown=${this.handleKeydown}
            placeholder="What needs to be done?"
            style="flex: 1; padding: 8px;"
          />
          <button @click=${this.add}>Add</button>
        </div>
        <ul style="list-style: none; padding: 0;">
          ${this.todos.map(todo => html`
            <li style="display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid #eee;">
              <input 
                type="checkbox" 
                .checked=${todo.done}
                @change=${() => this.toggle(todo.id)}
              />
              <span style="flex: 1; text-decoration: ${todo.done ? 'line-through' : 'none'}; color: ${todo.done ? '#999' : 'inherit'};">
                ${todo.text}
              </span>
              <button @click=${() => this.remove(todo.id)} style="color: red; border: none; background: none; cursor: pointer;">×</button>
            </li>
          `)}
        </ul>
        <p style="color: #666; font-size: 14px;">${this.remaining} items remaining</p>
      </div>
    `;
  }
}

export const Todo = createView(TodoView, { tag: 'x-todo' });

// Add todo to the page
const todoEl = document.createElement('x-todo');
document.body.appendChild(todoEl);
