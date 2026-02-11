import { View, createView } from '../src';
import { html, css } from 'lit';

// ─── HMR Test ───
// 1. Add todos in the parent Todo component
// 2. Click this counter a few times
// 3. Change HMR_VERSION below and save
// 4. Verify:
//    - Counter HMR_VERSION updates, count resets (this component remounted) ✓
//    - Parent Todo's todos SURVIVE (parent not affected) ✓

const HMR_VERSION = 'v1';

class CounterView extends View {
  static styles = css`
    :host {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-top: 1rem;
      padding: 0.75rem;
      background: rgba(0, 0, 0, 0.15);
      border-radius: 6px;
    }

    button {
      padding: 0.5rem 1rem;
      background: #6366f1;
      border: none;
      border-radius: 6px;
      color: white;
      font-size: 0.875rem;
      cursor: pointer;
      transition: background 0.2s;
    }

    button:hover {
      background: #4f46e5;
    }

    .version {
      font-size: 0.75rem;
      color: #64748b;
    }
  `;

  count = 0;

  increment() {
    this.count++;
  }

  render() {
    return html`
      <button @click=${this.increment}>
        Count: ${this.count}
      </button>
      <span class="version">${HMR_VERSION}</span>
    `;
  }
}

export const Counter = createView(CounterView, { tag: 'x-counter' });
