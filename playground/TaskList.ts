/**
 * TaskList Component (separated pattern)
 * ViewModel + external template with child components
 */

import { ViewModel, createView, property, html, css } from '../src';
import './Badge';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Task {
  id: number;
  text: string;
  done: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// ViewModel (pure state/logic)
// ─────────────────────────────────────────────────────────────────────────────

class TaskListVM extends ViewModel {
  @property() title = 'Tasks';
  
  tasks: Task[] = [
    { id: 1, text: 'Test separated pattern', done: false },
    { id: 2, text: 'Pass props to child', done: false },
    { id: 3, text: 'Verify reactivity', done: true },
  ];
  
  get doneCount() {
    return this.tasks.filter(t => t.done).length;
  }
  
  get pendingCount() {
    return this.tasks.filter(t => !t.done).length;
  }
  
  toggle(id: number) {
    const task = this.tasks.find(t => t.id === id);
    if (task) task.done = !task.done;
  }
  
  addTask() {
    this.tasks.push({
      id: Date.now(),
      text: `Task ${this.tasks.length + 1}`,
      done: false,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Template (pure presentation)
// ─────────────────────────────────────────────────────────────────────────────

const template = (vm: TaskListVM) => html`
  <div class="task-list">
    <h3>${vm.title}</h3>
    
    <div class="badges">
      <!-- Child components with props -->
      <x-badge .label=${'Done'} .count=${vm.doneCount} .variant=${'success'}></x-badge>
      <x-badge .label=${'Pending'} .count=${vm.pendingCount} .variant=${'warning'}></x-badge>
      <x-badge .label=${'Total'} .count=${vm.tasks.length} .variant=${'default'}></x-badge>
    </div>
    
    <ul class="tasks">
      ${vm.tasks.map(task => html`
        <li 
          class=${task.done ? 'done' : ''} 
          @click=${() => vm.toggle(task.id)}
        >
          ${task.text}
        </li>
      `)}
    </ul>
    
    <button @click=${vm.addTask}>Add Task</button>
  </div>
`;

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = css`
  :host {
    display: block;
    padding: 1rem;
    background: #1e293b;
    border-radius: 8px;
    color: #f1f5f9;
    font-family: system-ui, sans-serif;
  }
  
  h3 {
    margin: 0 0 1rem;
    color: #f8fafc;
  }
  
  .badges {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }
  
  .tasks {
    list-style: none;
    padding: 0;
    margin: 0 0 1rem;
  }
  
  .tasks li {
    padding: 0.5rem;
    margin-bottom: 0.25rem;
    background: #334155;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .tasks li:hover {
    background: #475569;
  }
  
  .tasks li.done {
    text-decoration: line-through;
    opacity: 0.6;
  }
  
  button {
    padding: 0.5rem 1rem;
    background: #6366f1;
    border: none;
    border-radius: 6px;
    color: white;
    font-size: 0.875rem;
    cursor: pointer;
  }
  
  button:hover {
    background: #4f46e5;
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// Create View
// ─────────────────────────────────────────────────────────────────────────────

export const TaskList = createView(TaskListVM, {
  tag: 'x-task-list',
  template,
  styles,
});

declare global {
  interface HTMLElementTagNameMap {
    'x-task-list': TaskListVM;
  }
}
