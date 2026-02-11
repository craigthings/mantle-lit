/**
 * Badge Component (separated pattern)
 * ViewModel + external template
 */

import { ViewModel, createView, property, html, css } from '../src';

// ─────────────────────────────────────────────────────────────────────────────
// ViewModel (pure state/logic)
// ─────────────────────────────────────────────────────────────────────────────

class BadgeVM extends ViewModel {
  @property() label = '';
  @property() count = 0;
  @property() variant: 'default' | 'success' | 'warning' = 'default';
}

// ─────────────────────────────────────────────────────────────────────────────
// Template (pure presentation)
// ─────────────────────────────────────────────────────────────────────────────

const template = (vm: BadgeVM) => html`
  <span class="badge ${vm.variant}">
    ${vm.label}: ${vm.count}
  </span>
`;

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = css`
  :host {
    display: inline-block;
  }
  .badge {
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
  }
  .default {
    background: #e2e8f0;
    color: #475569;
  }
  .success {
    background: #dcfce7;
    color: #166534;
  }
  .warning {
    background: #fef3c7;
    color: #92400e;
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// Create View
// ─────────────────────────────────────────────────────────────────────────────

export const Badge = createView(BadgeVM, {
  tag: 'x-badge',
  template,
  styles,
});

declare global {
  interface HTMLElementTagNameMap {
    'x-badge': BadgeVM;
  }
}
