import './styles.css';
import { mount } from '../src';
import './Todo';

// Create the app container
const app = document.createElement('div');
app.className = 'app';
app.innerHTML = '<h1>mobx-mantle playground</h1>';
document.body.appendChild(app);

// Mount the todo component
mount('x-todo', {
  title: 'My Tasks',
  initialTodos: [
    { id: 1, text: 'Learn mobx-mantle', done: false },
    { id: 2, text: 'Build something great', done: false },
  ],
  onCountChange: (count: number) => console.log(`Completed: ${count}`),
}, app);
