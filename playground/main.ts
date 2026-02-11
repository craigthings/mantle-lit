import './styles.css';
import { mount } from '../src';
import './Todo';
import './TaskList';

// Create the app container
const app = document.createElement('div');
app.className = 'app';
app.innerHTML = '<h1>Mantle Lit Playground</h1>';
document.body.appendChild(app);

// Mount the todo component (combined pattern - render in ViewModel)
mount('x-todo', {
  title: 'My Tasks',
  initialTodos: [
    { id: 1, text: 'Learn mantle-lit', done: false },
    { id: 2, text: 'Build something great', done: false },
  ],
  onCountChange: (count: number) => console.log(`Completed: ${count}`),
}, app);

// Add a separator
const separator = document.createElement('hr');
separator.style.cssText = 'margin: 2rem 0; border: none; border-top: 1px solid #334155;';
app.appendChild(separator);

// Section header
const header = document.createElement('h2');
header.textContent = 'Separated Pattern Test';
header.style.cssText = 'color: #94a3b8; font-size: 1rem; margin-bottom: 1rem;';
app.appendChild(header);

// Mount the task list (separated pattern - external template)
mount('x-task-list', { title: 'Separated ViewModel + Template' }, app);
